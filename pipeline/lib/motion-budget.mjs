import { JSDOM } from 'jsdom';

const PRIMITIVES = [
  { selector: '.kw[data-emphasize-at]', name: 'KineticWord' },
  { selector: '.count-up[data-target]', name: 'CountUp' },
  { selector: '.scroll-frame[data-distance]', name: 'ScrollFrame' },
  { selector: '.stat-bar[data-target-pct]', name: 'StatBar' },
  { selector: '.caption-line[data-at]', name: 'CaptionLine' },
];

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
    const used = new Set();
    for (const p of PRIMITIVES) {
      if (scene.querySelector(p.selector)) used.add(p.name);
    }
    if (used.size < 3) {
      const msg = `${id}: <3 primitives (found ${used.size}: ${[...used].join(',') || 'none'})`;
      if (exempt) {
        warnings.push(`${msg} [exempt: ${exempt}]`);
      } else {
        errors.push(msg);
      }
    }
  }
  return { errors, warnings };
}
