import { describe, it, expect } from 'vitest';
import { checkSceneGaps } from '../pipeline/lib/scene-gaps.mjs';

const wrap = (clips) => `<!doctype html><html><body>${clips}</body></html>`;
const clip = (id, start, dur, track = 1) =>
  `<div id="${id}" data-track-index="${track}" data-start="${start}" data-duration="${dur}"></div>`;

describe('checkSceneGaps', () => {
  it('passes when track-1 clips butt-join exactly', () => {
    const html = wrap(clip('a', 0, 5) + clip('b', 5, 5) + clip('c', 10, 3));
    expect(checkSceneGaps(html).errors).toHaveLength(0);
  });

  it('passes when gaps are within the 100ms tolerance', () => {
    const html = wrap(clip('a', 0, 5) + clip('b', 5.05, 5));
    expect(checkSceneGaps(html).errors).toHaveLength(0);
  });

  it('reports a gap larger than 100ms', () => {
    const html = wrap(clip('a', 0, 5) + clip('b', 6, 5));
    const { errors } = checkSceneGaps(html);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('a');
    expect(errors[0]).toContain('b');
    expect(errors[0]).toMatch(/1\.00s/);
  });

  it('only inspects track 1 clips', () => {
    const html = wrap(clip('a', 0, 5) + clip('b', 6, 5, /* track */ 2));
    expect(checkSceneGaps(html).errors).toHaveLength(0);
  });

  it('handles unsorted DOM order', () => {
    const html = wrap(clip('b', 5, 5) + clip('a', 0, 5));
    expect(checkSceneGaps(html).errors).toHaveLength(0);
  });

  it('ignores clips with non-numeric timing attributes', () => {
    const html = wrap(`<div id="x" data-track-index="1" data-start="oops" data-duration="5"></div>` + clip('a', 0, 5));
    expect(checkSceneGaps(html).errors).toHaveLength(0);
  });
});
