import { describe, it, expect } from 'vitest';
import { dedupItems } from '../pipeline/lib/dedup.js';

describe('dedupItems', () => {
  it('collapses duplicates by external_url, preferring stronger signals', () => {
    const items = [
      { id: 'rss-1', source: 'rss', external_url: 'https://example.com/a', signals: {} },
      { id: 'hn-2', source: 'hackernews', external_url: 'https://example.com/a', signals: { hn_points: 500 } },
    ];
    const out = dedupItems(items);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('hn-2');
  });

  it('keeps different external_urls distinct', () => {
    const items = [
      { id: 'a', source: 'rss', external_url: 'https://x.com/1', signals: {} },
      { id: 'b', source: 'rss', external_url: 'https://x.com/2', signals: {} },
    ];
    expect(dedupItems(items)).toHaveLength(2);
  });

  it('prefers hackernews when signals tie', () => {
    const items = [
      { id: 'rss-1', source: 'rss', external_url: 'https://x.com/a', signals: {} },
      { id: 'hn-1', source: 'hackernews', external_url: 'https://x.com/a', signals: {} },
    ];
    expect(dedupItems(items)[0].source).toBe('hackernews');
  });
});
