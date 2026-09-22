import { describe, expect, it } from 'vitest';
import { boundedBody } from './network';
import type { TransferProgress } from './capture-progress';

function response(headers: Record<string, string>) {
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2]));controller.enqueue(new Uint8Array([3, 4]));controller.close(); } }), { headers });
}
describe('stream byte progress', () => {
  it('reports actual chunk bytes against a known Content-Length', async () => {
    const progress: TransferProgress[] = [];
    const blob = await boundedBody(response({ 'content-length': '4' }), 10, value => progress.push(value));
    expect(blob.size).toBe(4);
    expect(progress).toEqual([0, 2, 4].map(receivedBytes => ({ receivedBytes, totalBytes: 4 })));
  });
  it.each<Record<string, string>>([{}, { 'content-length': '2', 'content-encoding': 'gzip' }])('does not invent percentages for missing or encoded sizes: %j', async headers => {
    const progress: TransferProgress[] = [];
    await boundedBody(response(headers), 10, value => progress.push(value));
    expect(progress.every(value => value.totalBytes === null)).toBe(true);
    expect(progress.at(-1)?.receivedBytes).toBe(4);
  });
  it('still rejects truncated bodies and cancels oversized streams', async () => {
    await expect(boundedBody(response({ 'content-length': '5' }), 10)).rejects.toThrow('Truncated');
    await expect(boundedBody(response({}), 3)).rejects.toThrow('capability limit');
  });
});
