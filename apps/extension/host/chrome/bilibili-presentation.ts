type Box = { type: string; body: number; end: number };
export type PixelAspect = { num: number; den: number };

function boxReader(data: DataView) {
  let count = 0;
  return (start = 0, end = data.byteLength): Box[] => {
    const boxes: Box[] = [];
    for (let offset = start; offset < end;) {
      if (++count > 100_000 || offset + 8 > end) throw new Error('Truncated or excessive MP4 boxes');
      let size = data.getUint32(offset), header = 8;
      if (size === 1) {
        if (offset + 16 > end) throw new Error('Truncated MP4 header');
        size = Number(data.getBigUint64(offset + 8)); header = 16;
      }
      if (size === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error('Truncated MP4 payload');
      const type = String.fromCharCode(...new Uint8Array(data.buffer, data.byteOffset + offset + 4, 4));
      boxes.push({ type, body: offset + header, end: offset + size }); offset += size;
    }
    return boxes;
  };
}

export async function validateMp4(blob: Blob, limit: number): Promise<DataView> {
  if (!blob.size || blob.size > limit) throw new Error('Input byte limit exceeded');
  const data = new DataView(await blob.arrayBuffer()), boxes = boxReader(data)();
  if (!['ftyp', 'moov', 'mdat'].every(type => boxes.some(box => box.type === type))) throw new Error('Complete MP4 initialization and media are required');
  return data;
}

const gcd = (a: bigint, b: bigint): bigint => { while (b) { const next = a % b; a = b; b = next; } return a; };
const ratio = (num: number, den: number): PixelAspect => {
  if (![num, den].every(value => Number.isInteger(value) && value > 0 && value <= 0xffff_ffff)) throw new Error('Invalid MP4 pixel aspect ratio');
  const divisor = Number(gcd(BigInt(num), BigInt(den)));
  return { num: num / divisor, den: den / divisor };
};

/** Read the AVC sample entry, never matching box-like bytes inside media payloads.
 * Mediabunny 1.58.1 rounds pasp into integer display dimensions while reading;
 * its reconstructed pixel ratio therefore cannot prove exact preservation.
 */
export function videoPixelAspectRatio(data: DataView): PixelAspect {
  const read = boxReader(data);
  const one = (boxes: Box[], type: string) => {
    const matches = boxes.filter(box => box.type === type);
    if (matches.length !== 1) throw new Error(`Expected one MP4 ${type} box`);
    return matches[0]!;
  };
  const child = (parent: Box, type: string) => one(read(parent.body, parent.end), type);
  const movie = one(read(), 'moov');
  const videos = read(movie.body, movie.end).filter(box => box.type === 'trak').map(track => child(track, 'mdia')).filter(media => {
    const handler = child(media, 'hdlr');
    if (handler.body + 12 > handler.end) throw new Error('Truncated MP4 handler');
    return data.getUint32(handler.body + 8) === 0x76696465; // vide
  });
  if (videos.length !== 1) throw new Error('Expected one MP4 video track');
  const description = child(child(child(videos[0]!, 'minf'), 'stbl'), 'stsd');
  if (description.body + 8 > description.end || data.getUint32(description.body) !== 0 || data.getUint32(description.body + 4) !== 1) throw new Error('Expected one version-zero MP4 sample description');
  const entries = read(description.body + 8, description.end);
  if (entries.length !== 1 || entries[0]!.type !== 'avc1') throw new Error('Expected one AVC sample entry');
  const sample = entries[0]!;
  if (sample.body + 78 > sample.end) throw new Error('Truncated AVC sample entry');
  const properties = read(sample.body + 78, sample.end);
  if (properties.some(box => box.type === 'clap')) throw new Error('Cropped presentation is not yet qualified');
  const aspects = properties.filter(box => box.type === 'pasp');
  if (!aspects.length) return { num: 1, den: 1 };
  if (aspects.length !== 1 || aspects[0]!.end - aspects[0]!.body !== 8) throw new Error('Invalid or ambiguous MP4 pixel aspect box');
  return ratio(data.getUint32(aspects[0]!.body), data.getUint32(aspects[0]!.body + 4));
}

export function exactVideoDisplayConfig(config: VideoDecoderConfig, aspect: PixelAspect): VideoDecoderConfig {
  const { num, den } = ratio(aspect.num, aspect.den);
  const width = config.codedWidth, height = config.codedHeight;
  if (![width, height].every(value => Number.isInteger(value) && value! > 0 && value! <= 0xffff)) throw new Error('Invalid AVC coded dimensions');
  const result = structuredClone(config);
  if (num === den) return result;
  const darWidth = BigInt(width!) * BigInt(num), darHeight = BigInt(height!) * BigInt(den), divisor = gcd(darWidth, darHeight);
  const displayAspectWidth = Number(darWidth / divisor), displayAspectHeight = Number(darHeight / divisor);
  if (displayAspectWidth > 0xffff_ffff || displayAspectHeight > 0xffff_ffff) throw new Error('Exact display aspect exceeds the supported integer range');
  // Both muxer products stay exact JS integers for uint16 AVC dimensions and
  // uint32 display-aspect values. Keep the encoded AVC description untouched.
  return { ...result, displayAspectWidth, displayAspectHeight };
}
