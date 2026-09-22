import { describe, expect, it } from 'vitest';
import { syntheticSnapshot } from '@/testing/result-fixture';
import { captureProgress } from './capture-progress';

describe('capture progress', () => {
  it('weights files equally and includes bytes received within the current file', () => {
    const result = syntheticSnapshot().result;
    result.assets = [0, 1].map(index => ({ ...result.assets[0]!, id: String(index), acquisition: { state: 'pending' } }));
    expect(captureProgress(result, { receivedBytes: 50, totalBytes: 100 }).percent).toBe(25);
    result.assets[0]!.acquisition = { state: 'acquired' };
    expect(captureProgress(result, { receivedBytes: 25, totalBytes: 100 })).toEqual({ percent: 62, completedFiles: 1, totalFiles: 2 });
    expect(captureProgress(result, { receivedBytes: 25, totalBytes: null }).percent).toBeNull();
  });
  it('reserves 100 for a fully acquired, committed revision', () => {
    const result = syntheticSnapshot().result;
    result.retention = { state: 'pending', revision: 0 };
    expect(captureProgress(result).percent).toBe(99);
    result.retention = { state: 'retained', revision: result.revision };
    expect(captureProgress(result).percent).toBe(100);
    result.assets[0]!.acquisition = { state: 'unavailable', reason: 'Network failure' };
    expect(captureProgress(result).percent).not.toBe(100);
    result.assets[0]!.acquisition = { state: 'acquired' };result.retention.state = 'failed';
    expect(captureProgress(result).percent).not.toBe(100);
  });
});
