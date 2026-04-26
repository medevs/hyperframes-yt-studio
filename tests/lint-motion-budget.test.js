import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMotionBudget } from '../pipeline/lib/motion-budget.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/lint-motion-budget', name), 'utf8');

describe('checkMotionBudget (v4 — caller passes sceneId + opts)', () => {
  it('passes a story scene with 4 primitives at distinct times', () => {
    const r = checkMotionBudget(fx('passing.html'), 'story-1');
    expect(r.errors).toEqual([]);
  });

  it('fails a story scene with only 2 distinct beat moments', () => {
    const r = checkMotionBudget(fx('failing.html'), 'story-1');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/story-1.*<3 beat moments/);
  });

  it('warns (does not error) when caller passes opts.exempt', () => {
    const r = checkMotionBudget(fx('exempt.html'), 'story-1', { exempt: 'b-roll-pacing' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('does NOT auto-skip intro/outro — orchestrator decides skip', () => {
    // v4: pipeline/lint.mjs filters intro/outro by filename before calling
    // checkMotionBudget. The function itself is scene-agnostic — if you
    // pass it a thin scene, you get an error regardless of the id.
    const html = `<!doctype html><html><body>
      <div data-composition-id="intro" data-width="1920" data-height="1080" data-start="0" data-duration="5">
        <span class="kw" data-emphasize-at="1">word</span>
      </div>
    </body></html>`;
    const r = checkMotionBudget(html, 'intro');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('FAILS when 4 primitives all co-occur at the same time (cramming)', () => {
    // v3-specific: spatial cramming with no time-slicing should error even
    // though v2 would have passed it (4 distinct primitives, 1 moment).
    const r = checkMotionBudget(fx('crammed.html'), 'story-1');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/story-1.*<3 beat moments/);
  });

  it('PASSES when one primitive type is used in 3 sequential beats', () => {
    // v3-specific: time-slicing with a single primitive class still
    // satisfies the budget.
    const r = checkMotionBudget(fx('sliced.html'), 'story-1');
    expect(r.errors).toEqual([]);
  });

  it('PASSES when nested .clip[data-start] elements partition the scene', () => {
    // Beat moments can come from nested clip elements partitioning the
    // scene's timeline, not just primitive selectors.
    const r = checkMotionBudget(fx('nested-clips.html'), 'story-1');
    expect(r.errors).toEqual([]);
  });

  it('quantizes near-identical times to the same beat moment', () => {
    // 14.671 and 14.672 should dedupe to a single moment after rounding.
    const html = `<!doctype html><html><body>
      <div data-composition-id="story-1" data-width="1920" data-height="1080" data-start="0" data-duration="60">
        <span class="count-up" data-target="100" data-at="14.671" data-duration="1">0</span>
        <span class="count-up" data-target="200" data-at="14.672" data-duration="1">0</span>
      </div>
    </body></html>`;
    const r = checkMotionBudget(html, 'story-1');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/<3 beat moments \(found 1/);
  });
});
