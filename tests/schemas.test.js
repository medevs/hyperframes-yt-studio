import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ItemsFileSchema } from '../pipeline/schemas/items.js';
import { PickSchema, PicksFileSchema } from '../pipeline/schemas/picks.js';
import { ClaimsFileSchema } from '../pipeline/schemas/claims.js';
import { StoryboardFileSchema } from '../pipeline/schemas/storyboard.js';
import { TimingsFileSchema } from '../pipeline/schemas/timings.js';
import { ScreenshotsManifestSchema } from '../pipeline/schemas/screenshots-manifest.js';
import { ConfigSchema } from '../pipeline/schemas/config.js';

const CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config.json');

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
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    expect(() => ConfigSchema.parse(raw)).not.toThrow();
  });
});

describe('PickSchema primary_source_url', () => {
  const base = {
    rank: 1,
    item_id: 'rss-x',
    angle: 'a',
    rationale: 'r',
    suggested_visuals: [],
    risk_flags: [],
  };

  it('requires primary_source_url', () => {
    expect(() => PickSchema.parse(base)).toThrow();
  });

  it('rejects non-URL primary_source_url', () => {
    expect(() => PickSchema.parse({ ...base, primary_source_url: 'not-a-url' })).toThrow();
  });

  it('accepts a valid primary_source_url', () => {
    const ok = PickSchema.parse({ ...base, primary_source_url: 'https://openai.com/blog/x' });
    expect(ok.primary_source_url).toBe('https://openai.com/blog/x');
  });
});

describe('ConfigSchema screenshot_overrides', () => {
  const baseRaw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  it('accepts an empty overrides map', () => {
    expect(() => ConfigSchema.parse({ ...baseRaw, screenshot_overrides: {} })).not.toThrow();
  });

  it('accepts a populated overrides entry', () => {
    const cfg = {
      ...baseRaw,
      screenshot_overrides: {
        'openai.com': { hide: ['.cookie-banner'], wait_for: '.article', timeout_ms: 30000 },
      },
    };
    expect(() => ConfigSchema.parse(cfg)).not.toThrow();
  });

  it('rejects a non-array hide field', () => {
    const cfg = { ...baseRaw, screenshot_overrides: { 'openai.com': { hide: '.x' } } };
    expect(() => ConfigSchema.parse(cfg)).toThrow();
  });
});

describe('ScreenshotsManifestSchema width/height/source_kind', () => {
  it('requires width, height, source_kind on each entry', () => {
    const bad = { entries: [{ item_id: 'x', path: 'p.png', fallback: false, source_domain: 'd' }] };
    expect(() => ScreenshotsManifestSchema.parse(bad)).toThrow();
  });

  it('accepts a valid entry', () => {
    const good = {
      entries: [{
        item_id: 'x', path: 'p.png', fallback: false, source_domain: 'd',
        width: 1200, height: 2400, source_kind: 'primary',
      }],
    };
    expect(() => ScreenshotsManifestSchema.parse(good)).not.toThrow();
  });

  it('restricts source_kind to known values', () => {
    const bad = {
      entries: [{
        item_id: 'x', path: 'p.png', fallback: false, source_domain: 'd',
        width: 1200, height: 2400, source_kind: 'unknown_kind',
      }],
    };
    expect(() => ScreenshotsManifestSchema.parse(bad)).toThrow();
  });
});

describe('TimingsFileSchema emphases', () => {
  const baseFile = {
    audio_file: 'narration.wav',
    total_duration_sec: 25,
    scenes: [
      { id: 'intro', kind: 'intro', start_sec: 0, duration_sec: 5, word_count: 10 },
      { id: 'story1', kind: 'story', story_num: 1, start_sec: 5, duration_sec: 7, word_count: 15 },
      { id: 'story2', kind: 'story', story_num: 2, start_sec: 12, duration_sec: 6, word_count: 12 },
      { id: 'story3', kind: 'story', story_num: 3, start_sec: 18, duration_sec: 4, word_count: 8 },
      { id: 'outro', kind: 'outro', start_sec: 22, duration_sec: 3, word_count: 5 },
    ],
    words: [{ text: 'a', start_sec: 0, end_sec: 0.1 }],
  };

  it('accepts a file with no emphases (back-compat)', () => {
    expect(() => TimingsFileSchema.parse(baseFile)).not.toThrow();
  });

  it('accepts a file with emphases populated', () => {
    const f = {
      ...baseFile,
      emphases: [
        { scene_id: 'intro', word: 'GPT-5.5', start_sec: 1.2, end_sec: 1.6, kind: 'kinetic' },
        { scene_id: 'intro', word: 'today', start_sec: 2.0, end_sec: 2.3, kind: 'caption' },
      ],
    };
    expect(() => TimingsFileSchema.parse(f)).not.toThrow();
  });

  it('rejects unknown emphasis kind', () => {
    const f = {
      ...baseFile,
      emphases: [{ scene_id: 'intro', word: 'x', start_sec: 0, end_sec: 0.1, kind: 'sparkle' }],
    };
    expect(() => TimingsFileSchema.parse(f)).toThrow();
  });
});
