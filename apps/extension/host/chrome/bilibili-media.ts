import { Input, BlobSource, MP4, Output, Mp4OutputFormat, StreamTarget, EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource } from 'mediabunny';
import type { InputTrack, EncodedPacket } from 'mediabunny';
import type { BilibiliMedia } from '@locus/bilibili/source';
import { bilibiliResource } from '@locus/bilibili/urls';
import { boundedBody, validateMedia } from './network';

export const LIMITS = { inputBytes: 64 * 1024 * 1024, outputBytes: 160 * 1024 * 1024, seconds: 600, packets: 100_000, timeoutMs: 120_000 };
type PacketProof = { hash: string; time: number; duration: number };
const packetProof = async (packet: EncodedPacket): Promise<PacketProof> => ({ hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(packet.data)))).map(v => v.toString(16).padStart(2, '0')).join(''), time: packet.timestamp, duration: packet.duration });
const configProof = (config: VideoDecoderConfig | AudioDecoderConfig) => {
  const { description, ...fields } = config; const bytes = description ? ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description) : null;
  return JSON.stringify({ ...fields, description: bytes ? [...bytes] : null });
};
async function verifyPackets(track: InputTrack, expected: PacketProof[], signal: AbortSignal) {
  let index = 0;
  for await (const packet of new EncodedPacketSink(track).packets()) { signal.throwIfAborted(); const before = expected[index++], after = await packetProof(packet); if (!before || before.hash !== after.hash || Math.abs(before.time - after.time) > .002 || Math.abs(before.duration - after.duration) > .002) throw new Error('Assembled packet content or timing did not preserve the source'); }
  if (index !== expected.length) throw new Error('Assembled track is incomplete');
}
async function validateBoxes(blob: Blob) {
  if (!blob.size || blob.size > LIMITS.inputBytes) throw new Error('Input byte limit exceeded');
  const data = new DataView(await blob.arrayBuffer()); let offset = 0; let count = 0; const boxes=new Set<string>();
  while (offset < data.byteLength) {
    if (++count > 100_000 || offset + 8 > data.byteLength) throw new Error('Truncated MP4 box');
    let size = data.getUint32(offset); let header = 8;
    if (size === 1) { if (offset + 16 > data.byteLength) throw new Error('Truncated MP4 header'); size = Number(data.getBigUint64(offset + 8)); header = 16; }
    if (size === 0) size = data.byteLength - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > data.byteLength) throw new Error('Truncated MP4 payload');
    boxes.add(String.fromCharCode(...new Uint8Array(data.buffer,offset+4,4)));
    offset += size;
  }
  if(!['ftyp','moov','mdat'].every(type=>boxes.has(type)))throw new Error('Complete MP4 initialization and media are required');
}
export async function remuxBilibili(video: Blob, audio: Blob | undefined, expectedDuration: number, signal: AbortSignal, expected: NonNullable<BilibiliMedia['tracks']>) {
  if (!audio) throw new Error('Required audio is missing');
  if (!Number.isFinite(expectedDuration) || expectedDuration <= 0 || expectedDuration > LIMITS.seconds) throw new Error('Duration exceeds the 600-second Bilibili capability');
  await Promise.all([validateBoxes(video), validateBoxes(audio)]); signal.throwIfAborted();
  const inputs = [video, audio].map(blob => new Input({ source: new BlobSource(blob), formats: [MP4] }));
  const chunks: { data: Uint8Array<ArrayBuffer>; position: number }[] = []; let length = 0, writtenBytes = 0; let output: Output | undefined;
  const progress = { videoPackets: 0, audioPackets: 0, videoEnd: 0, audioEnd: 0 };
  try {
    const v = await inputs[0]!.getPrimaryVideoTrack(), a = await inputs[1]!.getPrimaryAudioTrack();
    if (!v || !a || (await inputs[0]!.getTracks()).length !== 1 || (await inputs[1]!.getTracks()).length !== 1) throw new Error('Exactly one picture and one required audio track must exist');
    const vc = await v.getCodec(), ac = await a.getCodec(), vd = await v.getDecoderConfig(), ad = await a.getDecoderConfig();
    if (!vc || !ac || !vd || !ad || vc !== 'avc' || ac !== 'aac' || !vd.description || !ad.description) throw new Error('Only qualified AVC/AAC configuration is supported');
    if (vd.codec.toLowerCase() !== expected.video.codec.toLowerCase() || ad.codec.toLowerCase() !== expected.audio.codec.toLowerCase() || vd.codedWidth !== expected.video.width || vd.codedHeight !== expected.video.height) throw new Error('Downloaded tracks do not match the selected codec or dimensions');
    const aspect = await v.getPixelAspectRatio(), color = structuredClone(await v.getColorSpace());
    if (await v.getRotation() !== 0 || aspect.num !== aspect.den || aspect.num <= 0) throw new Error('Rotated or non-square-pixel sources are not yet qualified');
    if (color.primaries !== 'bt709' || color.transfer !== 'bt709' || color.matrix !== 'bt709' || color.fullRange !== false) throw new Error('Source color is unknown, HDR, or outside qualified BT.709 limited-range support');
    // Snapshot before muxing: libraries may default/mutate the supplied objects.
    const videoConfig = configProof(structuredClone(vd)), audioConfig = configProof(structuredClone(ad));
    const videoPackets: PacketProof[] = [], audioPackets: PacketProof[] = [];
    const vs = new EncodedVideoPacketSource(vc), as = new EncodedAudioPacketSource(ac);
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(new WritableStream({ write(chunk) {
      signal.throwIfAborted(); const end = chunk.position + chunk.data.length;
      writtenBytes += chunk.data.length;
      if (end > LIMITS.outputBytes || writtenBytes > LIMITS.outputBytes * 2) throw new Error('Output byte limit exceeded');
      chunks.push({ position: chunk.position, data: new Uint8Array(chunk.data) }); length = Math.max(length, end);
    } })) });
    output.addVideoTrack(vs); output.addAudioTrack(as); await output.start();
    const copyVideo = async () => { try { for await (const packet of new EncodedPacketSink(v).packets()) {
      signal.throwIfAborted(); if (++progress.videoPackets > LIMITS.packets) throw new Error('Packet limit exceeded');
      progress.videoEnd = Math.max(progress.videoEnd, packet.timestamp + packet.duration);
      videoPackets.push(await packetProof(packet)); await vs.add(packet, { decoderConfig: structuredClone(vd) });
    } } finally { vs.close(); } };
    const copyAudio = async () => { try { for await (const packet of new EncodedPacketSink(a).packets()) {
      signal.throwIfAborted(); if (++progress.audioPackets > LIMITS.packets) throw new Error('Packet limit exceeded');
      progress.audioEnd = Math.max(progress.audioEnd, packet.timestamp + packet.duration);
      audioPackets.push(await packetProof(packet)); await as.add(packet, { decoderConfig: structuredClone(ad) });
    } } finally { as.close(); } };
    const copies = await Promise.allSettled([copyVideo(), copyAudio()]);
    for (const result of copies) if (result.status === 'rejected') throw result.reason;
    signal.throwIfAborted();
    if (!progress.videoPackets || !progress.audioPackets || [progress.videoEnd, progress.audioEnd].some(end => Math.abs(end - expectedDuration) > .3)) throw new Error('Required track duration is incomplete or mismatched');
    await output.finalize(); signal.throwIfAborted();
    const bytes = new Uint8Array(length); for (const chunk of chunks) bytes.set(chunk.data, chunk.position);
    const blob = new Blob([bytes], { type: 'video/mp4' }), reopened = new Input({ source: new BlobSource(blob), formats: [MP4] });
    try {
      const rv = await reopened.getPrimaryVideoTrack(), ra = await reopened.getPrimaryAudioTrack();
      if (!rv || !ra || (await reopened.getTracks()).length !== 2 || await rv.getCodec() !== vc || await ra.getCodec() !== ac) throw new Error('Assembled tracks are incompatible');
      const rvd = await rv.getDecoderConfig(), rad = await ra.getDecoderConfig();
      if (!rvd || !rad || configProof(rvd) !== videoConfig || configProof(rad) !== audioConfig || JSON.stringify(await rv.getColorSpace()) !== JSON.stringify(color)) throw new Error('Assembled configuration or color changed');
      await verifyPackets(rv, videoPackets, signal); await verifyPackets(ra, audioPackets, signal);
      return blob;
    } finally { reopened.dispose(); }
  } finally { if (output && output.state !== 'finalized') await output.cancel().catch(() => {}); for (const input of inputs) input.dispose(); }
}

export async function acquireBilibili(media: BilibiliMedia, signal: AbortSignal, lease: (url: string, role: 'cover' | 'track', cid: string) => Promise<() => Promise<void>>) {
  const get = async (input: string, role: 'cover' | 'track') => {
    const url = bilibiliResource(input, role, role === 'track' ? media.sourceId : undefined); signal.throwIfAborted(); const release = await lease(url, role, media.sourceId);
    try { signal.throwIfAborted(); return await boundedBody(await fetch(url, { credentials: 'omit', redirect: 'error', signal }), role === 'cover' ? 16 * 1048576 : LIMITS.inputBytes); }
    catch (error) { throw new Error((error instanceof Error ? error.message : 'Bilibili resource unavailable').replace(/https?:\/\/\S+/g, '[resource URL]')); }
    finally { await release(); }
  };
  if (media.kind === 'cover') { if (!media.url) throw new Error('Cover source unavailable'); const response = await get(media.url, 'cover'),head=new Uint8Array(await response.slice(0,16).arrayBuffer());const ascii=(from:number,n:number)=>String.fromCharCode(...head.slice(from,from+n));const mime=head[0]===255&&head[1]===216?'image/jpeg':head[0]===137&&ascii(1,3)==='PNG'?'image/png':ascii(0,3)==='GIF'?'image/gif':ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'?'image/webp':null;if(!mime)throw new Error('Cover bytes have an unsupported encoding');const blob=response.slice(0,response.size,mime);await validateMedia(blob, false); return blob; }
  if (!media.tracks) throw new Error(media.reason ?? 'Complete video source unavailable');
  const video = await get(media.tracks.video.url, 'track'), audio = await get(media.tracks.audio.url, 'track');
  return remuxBilibili(video, audio, media.tracks.duration, signal, media.tracks);
}
