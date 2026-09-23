import { Input, BlobSource, MP4, Output, Mp4OutputFormat, StreamTarget, EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource } from 'mediabunny';
import type { InputTrack, EncodedPacket } from 'mediabunny';
import type { BilibiliMedia } from '@locus/bilibili/source';
import { bilibiliResource } from '@locus/bilibili/urls';
import { boundedBody, validateMedia } from './network';
import { diagnosticError } from '@locus/capture-core/diagnostics';
import { validateMp4, videoPixelAspectRatio, exactVideoDisplayConfig } from './bilibili-presentation';
import type { FractionProgress, TransferObserver } from './capture-progress';

export const LIMITS = { inputBytes: 64 * 1024 * 1024, outputBytes: 160 * 1024 * 1024, seconds: 600, packets: 100_000, timeoutMs: 120_000 };
type PacketProof = { hash: string; time: number; duration: number };
const packetProof = async (packet: EncodedPacket): Promise<PacketProof> => ({ hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(packet.data)))).map(v => v.toString(16).padStart(2, '0')).join(''), time: packet.timestamp, duration: packet.duration });
const configProof = (config: VideoDecoderConfig | AudioDecoderConfig) => {
  const { description, ...fields } = config; const bytes = description ? ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description) : null;
  return JSON.stringify({ ...fields, description: bytes ? [...bytes] : null });
};
async function verifyPackets(track: InputTrack, expected: PacketProof[], signal: AbortSignal, kind: 'video' | 'audio') {
  if (kind === 'video') {
    // The demuxer derives presentation intervals within each fragment, but
    // leaves its final presented sample's decode duration unchanged. Flat MP4
    // derives intervals across the whole track. Compare in that same domain,
    // retaining decode order for hashes and the final frame's source duration.
    // Otherwise a short VFR interval at a fragment boundary is a false failure.
    const presentation = expected.map((packet, index) => ({ ...packet, index })).sort((a, b) => a.time - b.time);
    const normalized = [...expected];
    for (let i = 0; i + 1 < presentation.length; i++) {
      const packet = presentation[i]!;
      normalized[packet.index] = { ...expected[packet.index]!, duration: presentation[i + 1]!.time - packet.time };
    }
    expected = normalized;
  }
  let index = 0;
  for await (const packet of new EncodedPacketSink(track).packets()) { signal.throwIfAborted(); const before = expected[index++], after = await packetProof(packet); if (!before || before.hash !== after.hash || Math.abs(before.time - after.time) > .002 || Math.abs(before.duration - after.duration) > .002) throw diagnosticError('BILI_PACKET_MISMATCH', 'bilibili.video.output-verification', 'Assembled packet content or timing did not preserve the source', { track: kind, packetIndex: index - 1, expectedPackets: expected.length, before: before ?? null, after, timestampDeltaSeconds: before ? after.time - before.time : null, durationDeltaSeconds: before ? after.duration - before.duration : null }); }
  if (index !== expected.length) throw new Error('Assembled track is incomplete');
}
export async function remuxBilibili(video: Blob, audio: Blob | undefined, expectedDuration: number, signal: AbortSignal, expected: NonNullable<BilibiliMedia['tracks']>) {
  const facts: Record<string, unknown> = { videoBytes: video.size, audioBytes: audio?.size ?? null, expectedDurationSeconds: expectedDuration, selected: expected, limits: LIMITS };
  let stage = 'bilibili.video.mp4-validation';
  const inputs: Input[] = [];
  const chunks: { data: Uint8Array<ArrayBuffer>; position: number }[] = []; let length = 0, writtenBytes = 0; let output: Output | undefined;
  const progress = { videoPackets: 0, audioPackets: 0, videoEnd: 0, audioEnd: 0 };
  try {
    if (!audio && expected.audio !== null) throw new Error('Required audio is missing');
    if (audio && expected.audio === null) throw new Error('Unexpected audio for a source declared silent');
    if (!Number.isFinite(expectedDuration) || expectedDuration <= 0 || expectedDuration > LIMITS.seconds) throw new Error('Duration exceeds the 600-second Bilibili capability');
    const blobs = audio ? [video, audio] : [video];
    const [videoData] = await Promise.all(blobs.map(blob => validateMp4(blob, LIMITS.inputBytes))); signal.throwIfAborted();
    inputs.push(...blobs.map(blob => new Input({ source: new BlobSource(blob), formats: [MP4] })));
    stage = 'bilibili.video.track-inspection';
    const v = await inputs[0]!.getPrimaryVideoTrack(), a = await inputs[1]?.getPrimaryAudioTrack() ?? null;
    if (!v || (await inputs[0]!.getTracks()).length !== 1 || audio && (!a || (await inputs[1]!.getTracks()).length !== 1)) throw new Error('Input track membership does not match the selected source');
    const vc = await v.getCodec(), ac = await a?.getCodec() ?? null, vd = await v.getDecoderConfig(), ad = await a?.getDecoderConfig() ?? null;
    facts.actualTracks = { videoCodec: vc, audioCodec: ac, videoConfig: vd && { codec: vd.codec, width: vd.codedWidth, height: vd.codedHeight, descriptionBytes: vd.description?.byteLength ?? 0 }, audioConfig: ad && { codec: ad.codec, sampleRate: ad.sampleRate, channels: ad.numberOfChannels, descriptionBytes: ad.description?.byteLength ?? 0 } };
    stage = 'bilibili.video.codec-validation';
    if (vc !== 'avc' || !vd?.description || audio && (ac !== 'aac' || !ad?.description)) throw new Error('Only qualified AVC/AAC configuration is supported');
    if (vd.codec.toLowerCase() !== expected.video.codec.toLowerCase() || expected.audio && ad?.codec.toLowerCase() !== expected.audio.codec.toLowerCase() || vd.codedWidth !== expected.video.width || vd.codedHeight !== expected.video.height) throw new Error('Downloaded tracks do not match the selected codec or dimensions');
    stage = 'bilibili.video.presentation-validation';
    const aspect = videoPixelAspectRatio(videoData!), color = structuredClone(await v.getColorSpace());
    const rotation = await v.getRotation(), flip = await v.getFlip();
    facts.presentation = { aspect, roundedLibraryAspect: await v.getPixelAspectRatio(), color, rotation, flip };
    if (rotation !== 0 || flip) throw new Error('Rotated or flipped sources are not yet qualified');
    const muxVideoConfig = exactVideoDisplayConfig(vd, aspect);
    stage = 'bilibili.video.color-validation';
    facts.expectedColor = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };
    if (color.primaries !== 'bt709' || color.transfer !== 'bt709' || color.matrix !== 'bt709' || color.fullRange !== false) throw new Error('Source color is unknown, HDR, or outside qualified BT.709 limited-range support');
    // Snapshot before muxing: libraries may default/mutate the supplied objects.
    const videoConfig = configProof(structuredClone(vd)), audioConfig = ad ? configProof(structuredClone(ad)) : null;
    const videoPackets: PacketProof[] = [], audioPackets: PacketProof[] = [];
    const vs = new EncodedVideoPacketSource(vc), as = ac ? new EncodedAudioPacketSource(ac) : null;
    stage = 'bilibili.video.mux';
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(new WritableStream({ write(chunk) {
      signal.throwIfAborted(); const end = chunk.position + chunk.data.length;
      writtenBytes += chunk.data.length;
      if (end > LIMITS.outputBytes || writtenBytes > LIMITS.outputBytes * 2) throw diagnosticError('BILI_OUTPUT_SIZE_LIMIT', stage, 'Output byte limit exceeded', { endBytes: end, writtenBytes, outputLimitBytes: LIMITS.outputBytes, writeLimitBytes: LIMITS.outputBytes * 2 });
      chunks.push({ position: chunk.position, data: new Uint8Array(chunk.data) }); length = Math.max(length, end);
    } })) });
    output.addVideoTrack(vs); if (as) output.addAudioTrack(as); await output.start();
    const copyVideo = async () => { try { for await (const packet of new EncodedPacketSink(v).packets()) {
      signal.throwIfAborted(); if (++progress.videoPackets > LIMITS.packets) throw new Error('Packet limit exceeded');
      progress.videoEnd = Math.max(progress.videoEnd, packet.timestamp + packet.duration);
      videoPackets.push(await packetProof(packet)); await vs.add(packet, { decoderConfig: structuredClone(muxVideoConfig) });
    } } finally { vs.close(); } };
    const copyAudio = async () => { if (!a || !as || !ad) return; try { for await (const packet of new EncodedPacketSink(a).packets()) {
      signal.throwIfAborted(); if (++progress.audioPackets > LIMITS.packets) throw new Error('Packet limit exceeded');
      progress.audioEnd = Math.max(progress.audioEnd, packet.timestamp + packet.duration);
      audioPackets.push(await packetProof(packet)); await as.add(packet, { decoderConfig: structuredClone(ad) });
    } } finally { as.close(); } };
    const copies = await Promise.allSettled([copyVideo(), copyAudio()]);
    for (const result of copies) if (result.status === 'rejected') throw result.reason;
    signal.throwIfAborted();
    stage = 'bilibili.video.duration-validation'; facts.durationToleranceSeconds = .3;
    if (!progress.videoPackets || audio && !progress.audioPackets || (audio ? [progress.videoEnd, progress.audioEnd] : [progress.videoEnd]).some(end => Math.abs(end - expectedDuration) > .3)) throw new Error('Required track duration is incomplete or mismatched');
    stage = 'bilibili.video.finalize'; await output.finalize(); signal.throwIfAborted();
    const bytes = new Uint8Array(length); for (const chunk of chunks) bytes.set(chunk.data, chunk.position);
    const blob = new Blob([bytes], { type: 'video/mp4' }), reopened = new Input({ source: new BlobSource(blob), formats: [MP4] });
    try {
      stage = 'bilibili.video.output-verification';
      const outputAspect = videoPixelAspectRatio(new DataView(bytes.buffer));
      facts.outputAspect = outputAspect;
      if (outputAspect.num !== aspect.num || outputAspect.den !== aspect.den) throw new Error('Assembled pixel aspect ratio changed');
      const rv = await reopened.getPrimaryVideoTrack(), ra = await reopened.getPrimaryAudioTrack();
      if (!rv || (await reopened.getTracks()).length !== (audio ? 2 : 1) || await rv.getCodec() !== vc || (audio ? !ra || await ra.getCodec() !== ac : ra !== null)) throw new Error('Assembled tracks are incompatible');
      const rvd = await rv.getDecoderConfig(), rad = await ra?.getDecoderConfig() ?? null;
      if (!rvd || configProof(rvd) !== videoConfig || (rad ? configProof(rad) : null) !== audioConfig || JSON.stringify(await rv.getColorSpace()) !== JSON.stringify(color)) throw new Error('Assembled configuration or color changed');
      if (await rv.getRotation() !== rotation || await rv.getFlip() !== flip) throw new Error('Assembled orientation changed');
      await verifyPackets(rv, videoPackets, signal, 'video'); if (ra) await verifyPackets(ra, audioPackets, signal, 'audio');
      return blob;
    } finally { reopened.dispose(); }
  } catch (error) { throw diagnosticError('BILI_VIDEO_ASSEMBLY_FAILED', stage, error instanceof Error ? error.message.split('\n')[0]! : String(error), { ...facts, ...progress, outputBytes: length, writtenBytes, aborted: signal.aborted }, error); }
  finally { if (output && output.state !== 'finalized') await output.cancel().catch(() => {}); for (const input of inputs) input.dispose(); }
}

export async function acquireBilibili(media: BilibiliMedia, signal: AbortSignal, lease: (url: string, role: 'cover' | 'track', cid: string) => Promise<() => Promise<void>>, onProgress?: (progress: FractionProgress) => void) {
  // Video and audio receive equal weight within the output video. Actual byte
  // fractions advance each track; remux/validation/retention still gate 100%.
  const observe = (index: number, count: number): TransferObserver => value => onProgress?.({ fraction: value.totalBytes === null ? null : (index + Math.min(1, value.receivedBytes / value.totalBytes)) / count });
  const get = async (input: string, role: 'cover' | 'track', progress: TransferObserver) => {
    const url = bilibiliResource(input, role, role === 'track' ? media.sourceId : undefined); signal.throwIfAborted(); const release = await lease(url, role, media.sourceId);
    try { signal.throwIfAborted(); return await boundedBody(await fetch(url, { credentials: 'omit', redirect: 'error', signal }), role === 'cover' ? 16 * 1048576 : LIMITS.inputBytes, progress); }
    catch (error) { throw diagnosticError('BILI_RESOURCE_FAILED', 'bilibili.resource.fetch', 'Bilibili resource acquisition failed', { assetId: media.id, kind: media.kind, sourceId: media.sourceId, resource: url, track: media.tracks?.video.url === url ? 'video' : media.tracks?.audio?.url === url ? 'audio' : 'cover', limitBytes: role === 'cover' ? 16 * 1048576 : LIMITS.inputBytes, aborted: signal.aborted }, error); }
    finally { await release(); }
  };
  if (media.kind === 'cover') { if (!media.url) throw new Error('Cover source unavailable'); const response = await get(media.url, 'cover', observe(0, 1)),head=new Uint8Array(await response.slice(0,16).arrayBuffer());const ascii=(from:number,n:number)=>String.fromCharCode(...head.slice(from,from+n));const mime=head[0]===255&&head[1]===216?'image/jpeg':head[0]===137&&ascii(1,3)==='PNG'?'image/png':ascii(0,3)==='GIF'?'image/gif':ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'?'image/webp':null;if(!mime)throw new Error('Cover bytes have an unsupported encoding');const blob=response.slice(0,response.size,mime);await validateMedia(blob, false); return blob; }
  if (!media.tracks) throw new Error(media.reason ?? 'Complete video source unavailable');
  const video = await get(media.tracks.video.url, 'track', observe(0, media.tracks.audio ? 2 : 1));
  const audio = media.tracks.audio ? await get(media.tracks.audio.url, 'track', observe(1, 2)) : undefined;
  onProgress?.({ fraction: 1 });
  return remuxBilibili(video, audio, media.tracks.duration, signal, media.tracks);
}
