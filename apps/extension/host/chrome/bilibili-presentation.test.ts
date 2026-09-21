import { describe, expect, it } from 'vitest';
import { exactVideoDisplayConfig, validateMp4, videoPixelAspectRatio } from './bilibili-presentation';

const join = (...parts: Uint8Array[]) => { const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0)); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; } return bytes; };
const u32 = (...values: number[]) => { const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer); values.forEach((value, index) => view.setUint32(index * 4, value)); return bytes; };
const box = (type: string, ...parts: Uint8Array[]) => { const body = join(...parts); return join(u32(body.length + 8), new TextEncoder().encode(type), body); };
const track = (kind: string, properties: Uint8Array[], entryCount = 1) => box('trak', box('mdia', box('hdlr', u32(0, 0), new TextEncoder().encode(kind)), box('minf', box('stbl', box('stsd', u32(0, entryCount), box('avc1', new Uint8Array(78), ...properties))))));
const fixture = (properties: Uint8Array[], extraTracks: Uint8Array[] = [], entryCount = 1) => join(box('ftyp'), box('moov', track('vide', properties, entryCount), ...extraTracks), box('mdat', box('pasp', u32(99, 1))));
const aspect = (bytes: Uint8Array) => videoPixelAspectRatio(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));

describe('Exact Bilibili MP4 presentation', () => {
  it('reads only the selected video sample entry, ignoring audio and media-payload lookalikes', () => {
    expect(aspect(fixture([box('pasp', u32(2140, 2142))], [track('soun', [box('pasp', u32(4, 3))])]))).toEqual({ num: 1070, den: 1071 });
    expect(aspect(fixture([]))).toEqual({ num: 1, den: 1 });
  });
  it('keeps small ratios that disappear when rounded to integer display dimensions', () => {
    const ratio = aspect(fixture([box('pasp', u32(1001, 1000))]));
    expect(ratio).toEqual({ num: 1001, den: 1000 });
    const description = new Uint8Array([1, 100, 0, 13]);
    const original = { codec: 'avc1.64000D', codedWidth: 320, codedHeight: 180, description };
    const result = exactVideoDisplayConfig(original, ratio);
    expect(result.displayAspectWidth).toBe(2002); expect(result.displayAspectHeight).toBe(1125);
    expect(result.description).toEqual(description); expect(original).not.toHaveProperty('displayAspectWidth');
    expect(exactVideoDisplayConfig({ codec: 'avc1.640032', codedWidth: 1920, codedHeight: 1070 }, { num: 1070, den: 1071 })).toMatchObject({ displayAspectWidth: 640, displayAspectHeight: 357 });
  });
  it.each([
    [box('pasp', u32(0, 1))],
    [box('pasp', u32(1, 0))],
    [box('pasp', u32(1))],
    [box('pasp', u32(1, 1, 1))],
    [box('pasp', u32(1, 1)), box('pasp', u32(2, 1))],
    [box('clap', new Uint8Array(32))],
  ])('rejects invalid, duplicate or unsupported presentation %j', (...properties) => {
    expect(() => aspect(fixture(properties))).toThrow();
  });
  it('rejects ambiguous video tracks and sample descriptions', () => {
    expect(() => aspect(fixture([], [track('vide', [])]))).toThrow('one MP4 video');
    expect(() => aspect(fixture([], [], 2))).toThrow('one version-zero');
  });
  it('bounds nested box sizes to their own parent and handles extended-size boxes', () => {
    const extended = join(u32(1), new TextEncoder().encode('pasp'), u32(0, 24), u32(1070, 1071));
    expect(aspect(fixture([extended]))).toEqual({ num: 1070, den: 1071 });
    const escaping = box('pasp', u32(1, 1)); new DataView(escaping.buffer).setUint32(0, 32);
    expect(() => aspect(fixture([escaping]))).toThrow('Truncated MP4 payload');
  });
  it('validates complete top-level media and rejects truncation before demuxing', async () => {
    const bytes = fixture([]);
    await expect(validateMp4(new Blob([bytes]), bytes.length)).resolves.toBeInstanceOf(DataView);
    await expect(validateMp4(new Blob([bytes]), bytes.length - 1)).rejects.toThrow('byte limit');
    await expect(validateMp4(new Blob([bytes.slice(0, -1)]), bytes.length)).rejects.toThrow('Truncated');
    await expect(validateMp4(new Blob([box('ftyp')]), 1024)).rejects.toThrow('initialization and media');
  });
  it('rejects ratios that cannot be represented exactly in the muxer integer fields', () => {
    expect(() => exactVideoDisplayConfig({ codec: 'avc1.64000D', codedWidth: 65534, codedHeight: 65535 }, { num: 4294967291, den: 4294967279 })).toThrow('integer range');
  });
});
