import { Input, BlobSource, MP4, Output, Mp4OutputFormat, StreamTarget, EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource } from 'mediabunny';

export const LIMITS = { inputBytes: 64 * 1024 * 1024, outputBytes: 160 * 1024 * 1024, seconds: 600, packets: 100_000, timeoutMs: 120_000 };
export async function boundedFetch(url: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal });
  if (response.status !== 200 || !response.body) throw new Error(`Track HTTP failure (${response.status})`);
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let bytes = 0;
  try { while (true) { signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > LIMITS.inputBytes) throw new Error('Input byte limit exceeded'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return new Blob(chunks);
}
async function validateBoxes(blob: Blob) {
  if (!blob.size || blob.size > LIMITS.inputBytes) throw new Error('Input byte limit exceeded');
  const data = new DataView(await blob.arrayBuffer()); let offset = 0; let count = 0;
  while (offset < data.byteLength) {
    if (++count > 100_000 || offset + 8 > data.byteLength) throw new Error('Truncated MP4 box');
    let size = data.getUint32(offset); let header = 8;
    if (size === 1) { if (offset + 16 > data.byteLength) throw new Error('Truncated MP4 header'); size = Number(data.getBigUint64(offset + 8)); header = 16; }
    if (size === 0) size = data.byteLength - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > data.byteLength) throw new Error('Truncated MP4 payload');
    offset += size;
  }
}
export async function remux(video: Blob, audio: Blob | undefined, expectedDuration: number, signal: AbortSignal, slow = false) {
  if (!audio) throw new Error('Required audio is missing');
  if (!Number.isFinite(expectedDuration) || expectedDuration <= 0 || expectedDuration > LIMITS.seconds) throw new Error('Duration outside probe limit');
  await Promise.all([validateBoxes(video), validateBoxes(audio)]); signal.throwIfAborted();
  const inputs = [video, audio].map(blob => new Input({ source: new BlobSource(blob), formats: [MP4] }));
  const chunks: { data: Uint8Array<ArrayBuffer>; position: number }[] = []; let length = 0, writtenBytes = 0; let output: Output | undefined;
  const progress = { videoPackets: 0, audioPackets: 0, videoEnd: 0, audioEnd: 0 };
  try {
    const v = await inputs[0]!.getPrimaryVideoTrack(), a = await inputs[1]!.getPrimaryAudioTrack();
    if (!v || !a) throw new Error('Both required tracks must exist');
    const vc = await v.getCodec(), ac = await a.getCodec(), vd = await v.getDecoderConfig(), ad = await a.getDecoderConfig();
    if (!vc || !ac || !vd || !ad || !['avc', 'av1'].includes(vc) || ac !== 'aac') throw new Error('Probe supports only AVC or AV1 with AAC');
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
      await vs.add(packet, { decoderConfig: vd }); if (slow) await new Promise(resolve => setTimeout(resolve, 2));
    } } finally { vs.close(); } };
    const copyAudio = async () => { try { for await (const packet of new EncodedPacketSink(a).packets()) {
      signal.throwIfAborted(); if (++progress.audioPackets > LIMITS.packets) throw new Error('Packet limit exceeded');
      progress.audioEnd = Math.max(progress.audioEnd, packet.timestamp + packet.duration);
      await as.add(packet, { decoderConfig: ad }); if (slow) await new Promise(resolve => setTimeout(resolve, 2));
    } } finally { as.close(); } };
    const copies = await Promise.allSettled([copyVideo(), copyAudio()]);
    for (const result of copies) if (result.status === 'rejected') throw result.reason;
    signal.throwIfAborted();
    if (!progress.videoPackets || !progress.audioPackets || [progress.videoEnd, progress.audioEnd].some(end => Math.abs(end - expectedDuration) > .3)) throw new Error('Required track duration is incomplete or mismatched');
    await output.finalize(); signal.throwIfAborted();
    const bytes = new Uint8Array(length); for (const chunk of chunks) bytes.set(chunk.data, chunk.position);
    return { blob: new Blob([bytes], { type: 'video/mp4' }), progress, codecs: { video: vc, audio: ac } };
  } finally { if (output && output.state !== 'finalized') await output.cancel().catch(() => {}); for (const input of inputs) input.dispose(); }
}
