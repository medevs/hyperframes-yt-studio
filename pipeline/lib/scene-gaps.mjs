import { JSDOM } from 'jsdom';

const MAX_GAP_SEC = 0.1;

/**
 * Check that scenes on track 1 are butt-joined with no significant gaps.
 * A gap > MAX_GAP_SEC (100ms) means the rendered video shows black/silent
 * frames between scenes. Returns { errors: string[] }.
 */
export function checkSceneGaps(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const errors = [];

  const clips = [...doc.querySelectorAll('[data-track-index="1"][data-start][data-duration]')]
    .map(el => ({
      id: el.id || '(no-id)',
      start: parseFloat(el.dataset.start),
      duration: parseFloat(el.dataset.duration),
    }))
    .filter(c => Number.isFinite(c.start) && Number.isFinite(c.duration))
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < clips.length - 1; i++) {
    const cur = clips[i];
    const next = clips[i + 1];
    const curEnd = cur.start + cur.duration;
    const gap = next.start - curEnd;
    if (gap > MAX_GAP_SEC) {
      errors.push(
        `track-1 gap of ${gap.toFixed(2)}s between ${cur.id} (ends ${curEnd.toFixed(2)}s) ` +
        `and ${next.id} (starts ${next.start.toFixed(2)}s). ` +
        `Extend ${cur.id}'s data-duration so it butts against ${next.id}.`
      );
    }
  }

  return { errors };
}
