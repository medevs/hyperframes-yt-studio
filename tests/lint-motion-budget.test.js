import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMotionBudget } from '../pipeline/lib/motion-budget.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/lint-motion-budget', name), 'utf8');

describe('checkMotionBudget (v3 — beat-moment semantics)', () => {
  it('passes a story scene with 4 primitives at distinct times', () => {
    const r = checkMotionBudget(fx('passing.html'));
    expect(r.errors).toEqual([]);
  });

  it('fails a story scene with only 2 distinct beat moments', () => {
    const r = checkMotionBudget(fx('failing.html'));
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/story-1.*<3 beat moments/);
  });

  it('warns (does not error) when data-motion-exempt is set', () => {
    const r = checkMotionBudget(fx('exempt.html'));
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('skips intro and outro scenes', () => {
    const html = `<!doctype html><html><body>
      <div data-composition-id="x" data-width="1920" data-height="1080">
        <div class="scene clip" id="intro" data-start="0" data-duration="5" data-track-index="1"></div>
        <div class="scene clip" id="outro" data-start="60" data-duration="5" data-track-index="1"></div>
      </div>
    </body></html>`;
    const r = checkMotionBudget(html);
    expect(r.errors).toEqual([]);
  });

  it('FAILS when 4 primitives all co-occur at the same time (cramming)', () => {
    // v3-specific: spatial cramming with no time-slicing should error even
    // though v2 would have passed it (4 distinct primitives, 1 moment).
    const r = checkMotionBudget(fx('crammed.html'));
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/story-1.*<3 beat moments/);
  });

  it('PASSES when one primitive type is used in 3 sequential beats', () => {
    // v3-specific: time-slicing with a single primitive class still
    // satisfies the budget.
    const r = checkMotionBudget(fx('sliced.html'));
    expect(r.errors).toEqual([]);
  });

  it('PASSES when nested .clip[data-start] elements partition the scene', () => {
    // Beat moments can come from nested clip elements partitioning the
    // scene's timeline, not just primitive selectors.
    const r = checkMotionBudget(fx('nested-clips.html'));
    expect(r.errors).toEqual([]);
  });

  it('quantizes near-identical times to the same beat moment', () => {
    // 14.671 and 14.672 should dedupe to a single moment after rounding.
    const html = `<!doctype html><html><body>
      <div data-composition-id="x" data-width="1920" data-height="1080" data-start="0" data-duration="60">
        <div class="scene clip" id="story-1" data-start="0" data-duration="60" data-track-index="1">
          <span class="count-up" data-target="100" data-at="14.671" data-duration="1">0</span>
          <span class="count-up" data-target="200" data-at="14.672" data-duration="1">0</span>
        </div>
      </div>
    </body></html>`;
    const r = checkMotionBudget(html);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/<3 beat moments \(found 1/);
  });
});
