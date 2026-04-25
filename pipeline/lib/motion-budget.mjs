import { JSDOM } from 'jsdom';

// v3 motion budget: count distinct *beat moments* in a story scene rather than
// distinct primitives co-existing on screen. A beat moment is a unique time
// (rounded to 2 decimals) at which a focal element enters — sourced from any
// of:
//   - .kw[data-emphasize-at]
//   - .count-up[data-target][data-at]
//   - .scroll-frame[data-distance][data-at]
//   - .stat-bar[data-target-pct][data-at]
//   - .caption-line[data-at]
//   - any descendant clip with data-start (e.g. nested .clip elements
//     representing sub-scenes / sequential beats)
//
// The threshold remains 3. The new semantics encode the v3 SKILL.md principle:
// scenes are *time-sliced* sequences of focal beats, not spatially crammed
// frames. A scene that spawns three count-ups all at t=2 still counts as ONE
// beat moment (because all three appear simultaneously); a scene that spawns
// one element at t=2, one at t=14, and one at t=30 counts as three.

const BEAT_SOURCES = [
  { selector: '.kw[data-emphasize-at]', attr: 'emphasizeAt' },
  { selector: '.count-up[data-at]',     attr: 'at' },
  { selector: '.scroll-frame[data-at]', attr: 'at' },
  { selector: '.stat-bar[data-at]',     attr: 'at' },
  { selector: '.caption-line[data-at]', attr: 'at' },
];

function quantizeBeatTime(rawSec) {
  const n = parseFloat(rawSec);
  if (!Number.isFinite(n)) return null;
  // Round to 2 decimals so e.g. 14.67 and 14.671 dedupe to the same moment.
  return Math.round(n * 100) / 100;
}

export function checkMotionBudget(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const errors = [];
  const warnings = [];
  const scenes = doc.querySelectorAll('.scene[id]');

  for (const scene of scenes) {
    const id = scene.id;
    if (id === 'intro' || id.startsWith('intro-') || id === 'outro' || id.startsWith('outro-')) continue;
    if (!id.startsWith('story-') && !id.startsWith('scene-story')) continue;

    const exempt = scene.getAttribute('data-motion-exempt');
    const beatMoments = new Set();

    // Primitive-driven beats (entrance time).
    for (const src of BEAT_SOURCES) {
      const els = scene.querySelectorAll(src.selector);
      els.forEach(el => {
        const t = quantizeBeatTime(el.dataset[src.attr]);
        if (t !== null) beatMoments.add(t);
      });
    }

    // Nested clip-driven beats (sub-beats partitioned via data-start on
    // descendant elements with class="clip"). The scene root itself has
    // data-start but we only count *internal* partitions.
    const innerClips = scene.querySelectorAll('.clip[data-start]');
    innerClips.forEach(el => {
      if (el === scene) return;
      const t = quantizeBeatTime(el.dataset.start);
      if (t !== null) beatMoments.add(t);
    });

    if (beatMoments.size < 3) {
      const sorted = [...beatMoments].sort((a, b) => a - b);
      const list = sorted.length ? sorted.join(',') : 'none';
      const msg = `${id}: <3 beat moments (found ${beatMoments.size}: ${list}) — story scenes must time-slice 3+ focal beats`;
      if (exempt) {
        warnings.push(`${msg} [exempt: ${exempt}]`);
      } else {
        errors.push(msg);
      }
    }
  }

  return { errors, warnings };
}
