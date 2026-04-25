import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScreenshot, isAcceptable } from '../pipeline/lib/screenshot-quality.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/screenshots', name));

describe('analyzeScreenshot', () => {
  it('flags a mostly-white capture as monochrome', async () => {
    const r = await analyzeScreenshot(fx('mostly-white.png'));
    expect(r.dominantColorPct).toBeGreaterThan(0.85);
    expect(r.flags).toContain('monochrome');
  });

  it('does not flag a clean article capture as monochrome', async () => {
    const r = await analyzeScreenshot(fx('clean-article.png'));
    expect(r.dominantColorPct).toBeLessThan(0.85);
    expect(r.flags).not.toContain('monochrome');
  });

  it('flags a banner-shaped overlay capture', async () => {
    const r = await analyzeScreenshot(fx('cookie-banner-overlay.png'));
    expect(r.flags).toContain('banner_overlay');
  });

  it('does not flag the headline-card sample (intentional design)', async () => {
    const r = await analyzeScreenshot(fx('headline-card-sample.png'));
    expect(r.flags).not.toContain('banner_overlay');
  });
});

describe('isAcceptable', () => {
  it('returns true when no flags', () => {
    expect(isAcceptable({ flags: [], dominantColorPct: 0.4 })).toBe(true);
  });
  it('returns false on any flag', () => {
    expect(isAcceptable({ flags: ['monochrome'], dominantColorPct: 0.9 })).toBe(false);
    expect(isAcceptable({ flags: ['banner_overlay'], dominantColorPct: 0.4 })).toBe(false);
  });
});
