import { describe, it, expect, vi } from 'vitest';
import { parallelFetch } from '../pipeline/lib/parallel-fetch.js';

describe('parallelFetch', () => {
  it('fetches every URL and returns body text', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: true, status: 200, text: async () => `body:${url}`,
    }));
    const r = await parallelFetch(['a', 'b', 'c'], { fetchImpl, concurrency: 2, timeoutMs: 1000 });
    expect(r).toHaveLength(3);
    expect(r.map(x => x.body)).toEqual(['body:a', 'body:b', 'body:c']);
    expect(r.every(x => x.ok)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('respects the concurrency cap', async () => {
    let inFlight = 0, maxInFlight = 0;
    const fetchImpl = vi.fn(async (url) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 20));
      inFlight--;
      return { ok: true, status: 200, text: async () => url };
    });
    await parallelFetch(['a','b','c','d','e'], { fetchImpl, concurrency: 2, timeoutMs: 1000 });
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('returns a timeout error when AbortController fires', async () => {
    const fetchImpl = vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
      });
    }));
    const r = await parallelFetch(['slow'], { fetchImpl, concurrency: 1, timeoutMs: 30 });
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toBe('timeout');
  });

  it('returns ok=false when fetch throws a non-abort error', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const r = await parallelFetch(['boom'], { fetchImpl, concurrency: 1, timeoutMs: 1000 });
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toBe('ECONNRESET');
  });

  it('returns an empty array for empty input', async () => {
    const fetchImpl = vi.fn();
    const r = await parallelFetch([], { fetchImpl, concurrency: 5, timeoutMs: 1000 });
    expect(r).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
