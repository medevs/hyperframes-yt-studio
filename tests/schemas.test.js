import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ItemsFileSchema } from '../pipeline/schemas/items.js';
import { PicksFileSchema } from '../pipeline/schemas/picks.js';
import { ClaimsFileSchema } from '../pipeline/schemas/claims.js';
import { StoryboardFileSchema } from '../pipeline/schemas/storyboard.js';
import { TimingsFileSchema } from '../pipeline/schemas/timings.js';
import { ScreenshotsManifestSchema } from '../pipeline/schemas/screenshots-manifest.js';
import { ConfigSchema } from '../pipeline/schemas/config.js';

describe('ItemsFileSchema', () => {
  it('accepts a valid items file', () => {
    expect(() => ItemsFileSchema.parse({
      fetched_at: '2026-04-23T08:00:00Z',
      items: [{
        id: 'hn-1', source: 'hackernews',
        source_url: 'https://news.ycombinator.com/item?id=1',
        external_url: 'https://example.com/a',
        title: 'x', summary: 'y',
        published_at: '2026-04-23T06:00:00Z',
        signals: { hn_points: 100 },
      }],
    })).not.toThrow();
  });
});

describe('PicksFileSchema', () => {
  it('requires exactly 3 picks', () => {
    expect(() => PicksFileSchema.parse({
      date: '2026-04-23',
      picks: [{ rank: 1, item_id: 'x', angle: 'a', rationale: 'r', suggested_visuals: [], risk_flags: [] }],
      rejected: [],
    })).toThrow();
  });
});

describe('ClaimsFileSchema', () => {
  it('accepts an empty claims array', () => {
    expect(() => ClaimsFileSchema.parse({ claims: [] })).not.toThrow();
  });
});

describe('StoryboardFileSchema', () => {
  it('requires exactly 5 scenes', () => {
    expect(() => StoryboardFileSchema.parse({ scenes: [] })).toThrow();
  });
});

describe('TimingsFileSchema', () => {
  it('requires exactly 5 scenes and at least one word', () => {
    expect(() => TimingsFileSchema.parse({
      audio_file: 'n.wav', total_duration_sec: 10, scenes: [], words: [],
    })).toThrow();
  });
});

describe('ScreenshotsManifestSchema', () => {
  it('accepts an empty manifest', () => {
    expect(() => ScreenshotsManifestSchema.parse({ entries: [] })).not.toThrow();
  });
});

describe('ConfigSchema', () => {
  it('accepts the checked-in config.json', () => {
    const raw = JSON.parse(readFileSync('config.json', 'utf8'));
    expect(() => ConfigSchema.parse(raw)).not.toThrow();
  });
});
