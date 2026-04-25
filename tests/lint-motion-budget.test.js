import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMotionBudget } from '../pipeline/lib/motion-budget.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/lint-motion-budget', name), 'utf8');

describe('checkMotionBudget', () => {
  it('passes a story scene with 4 primitives', () => {
    const r = checkMotionBudget(fx('passing.html'));
    expect(r.errors).toEqual([]);
  });

  it('fails a story scene with only 2 primitives', () => {
    const r = checkMotionBudget(fx('failing.html'));
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/story-1.*<3 primitives/);
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
});
