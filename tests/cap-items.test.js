import { describe, it, expect } from 'vitest';
import { capItems } from '../pipeline/lib/cap-items.js';

describe('capItems', () => {
  it('returns all items if length <= cap', () => {
    const items = [
      { id: 'a', published_at: '2026-04-24T10:00:00Z' },
      { id: 'b', published_at: '2026-04-24T11:00:00Z' },
    ];
    expect(capItems(items, 5)).toHaveLength(2);
  });

  it('keeps the most recent items when over cap', () => {
    const items = [
      { id: 'old', published_at: '2026-04-23T00:00:00Z' },
      { id: 'new', published_at: '2026-04-24T00:00:00Z' },
      { id: 'mid', published_at: '2026-04-23T12:00:00Z' },
    ];
    const r = capItems(items, 2);
    expect(r.map(i => i.id)).toEqual(['new', 'mid']);
  });

  it('tie-breaks same-timestamp items by signal strength (HN points + comments)', () => {
    const ts = '2026-04-24T10:00:00Z';
    const items = [
      { id: 'low', published_at: ts, signals: { hn_points: 10, hn_comments: 5 } },
      { id: 'high', published_at: ts, signals: { hn_points: 100, hn_comments: 50 } },
    ];
    expect(capItems(items, 1)[0].id).toBe('high');
  });

  it('treats missing published_at as oldest (epoch 0)', () => {
    const items = [
      { id: 'no-date' },
      { id: 'dated', published_at: '2026-04-24T00:00:00Z' },
    ];
    expect(capItems(items, 1)[0].id).toBe('dated');
  });

  it('does not mutate the input array', () => {
    const items = [
      { id: 'a', published_at: '2026-04-24T10:00:00Z' },
      { id: 'b', published_at: '2026-04-24T11:00:00Z' },
    ];
    const before = items.map(i => i.id).join(',');
    capItems(items, 1);
    expect(items.map(i => i.id).join(',')).toBe(before);
  });
});
