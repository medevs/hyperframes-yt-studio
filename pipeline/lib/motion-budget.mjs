import { JSDOM } from 'jsdom';

// v4 motion budget (post 2026-04-26): scenes live in compositions/<id>.html,
// each <template>-wrapped with one <div data-composition-id="<id>"> root and
// N beat children. The lint walks per sub-comp file and counts distinct *beat
// moments* (unique focal-element entry times, rounded to 2 decimals) within
// the file. Threshold is 3 per story scene.
//
// A "beat moment" is sourced from any of:
//   - .kw[data-emphasize-at]
//   - .count-up[data-at]
//   - .scroll-frame[data-at]
//   - .stat-bar[data-at]
//   - .caption-line[data-at]
//   - .clip[data-start] descendants (sub-beats / sequential beat partitions)
//
// Scenes spawning three count-ups all at t=2 still count as ONE beat moment;
// scenes spawning one element each at t=2, t=14, t=30 count as three.
//
// In addition, checkRootStructure() runs on the root index.html and catches
// v3 regression patterns directly (inline scene+clip blocks, missing
// data-composition-src refs, clip on scene wrappers).

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
  return Math.round(n * 100) / 100;
}

/**
 * Count distinct beat moments in a single sub-comp HTML file.
 *
 * @param {string} html — full content of one compositions/<id>.html file
 * @param {string} sceneId — id used in error messages (e.g. "story-1")
 * @param {{ exempt?: string }} opts
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkMotionBudget(html, sceneId, opts = {}) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const errors = [];
  const warnings = [];

  // Sub-comps are wrapped in <template id="<id>-template">; the actual scene
  // content lives in template.content (a DocumentFragment). Fall back to
  // document if there's no template wrapper.
  const tpl = doc.querySelector('template');
  const root = tpl ? tpl.content : doc;

  const beatMoments = new Set();

  for (const src of BEAT_SOURCES) {
    root.querySelectorAll(src.selector).forEach(el => {
      const t = quantizeBeatTime(el.dataset[src.attr]);
      if (t !== null) beatMoments.add(t);
    });
  }

  // Internal partition clips. Skip the sub-comp root itself (it carries
  // data-start="0" by convention but is the scene container, not a beat).
  root.querySelectorAll('.clip[data-start]').forEach(el => {
    if (el.hasAttribute('data-composition-id')) return;
    const t = quantizeBeatTime(el.dataset.start);
    if (t !== null) beatMoments.add(t);
  });

  if (beatMoments.size < 3) {
    const sorted = [...beatMoments].sort((a, b) => a - b);
    const list = sorted.length ? sorted.join(',') : 'none';
    const msg = `${sceneId}: <3 beat moments (found ${beatMoments.size}: ${list}) — story scenes must time-slice 3+ focal beats`;
    if (opts.exempt) {
      warnings.push(`${msg} [exempt: ${opts.exempt}]`);
    } else {
      errors.push(msg);
    }
  }

  return { errors, warnings };
}

/**
 * Structural check on the root index.html. Catches v3 regression patterns
 * directly so a skill drift back to inline-stacked-scenes is a hard lint
 * failure, not a silent black-screen bug.
 *
 * @param {string} html — content of root index.html
 * @returns {{ errors: string[] }}
 */
export function checkRootStructure(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const errors = [];

  // 1. Inline scene+clip blocks — v3 fingerprint that broke 2026-04-25.
  const inlineSceneClips = doc.querySelectorAll('.scene.clip');
  if (inlineSceneClips.length > 0) {
    const ids = [...inlineSceneClips].map(el => el.id || '(no-id)').join(', ');
    errors.push(
      `inline_scene_clip_block: root index.html contains ${inlineSceneClips.length} <div class="scene clip"> ` +
      `block(s) [${ids}] — v3 inline-stacked-scenes pattern. Refactor to nested sub-compositions: ` +
      `move each scene to compositions/<id>.html and reference via data-composition-src. ` +
      `See yt-compose v4 skill / HANDOFF-2026-04-26.md.`
    );
  }

  // 2. Root must reference at least 5 sub-compositions (intro + 3 stories + outro).
  const subCompRefs = doc.querySelectorAll('[data-composition-src]');
  if (subCompRefs.length < 5) {
    errors.push(
      `missing_data_composition_src: root has ${subCompRefs.length} data-composition-src reference(s); ` +
      `expected 5 (intro, story-1, story-2, story-3, outro). The v4 pattern requires per-scene sub-comp files.`
    );
  }

  // 3. Scene wrappers must NOT carry class="clip" — adding it breaks the studio's
  //    player probe (proof-fix.mjs goes red, play button stays disabled).
  for (const el of subCompRefs) {
    if (el.classList.contains('clip')) {
      errors.push(
        `clip_on_scene_wrapper: ${el.id || '(no-id)'} has data-composition-src AND class="clip"; ` +
        `remove the clip class — wrappers are container divs driven by master GSAP cross-cuts, not timed beats.`
      );
    }
  }

  return { errors };
}
