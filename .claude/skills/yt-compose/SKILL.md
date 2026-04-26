---
name: yt-compose
description: Write today's AI Daily Hyperframes composition using HF's nested sub-composition pattern — a thin root `index.html` plus per-scene `compositions/<id>.html` files (intro, story-1, story-2, story-3, outro), driven by storyboard.json and timings.json, lint-clean, fast cold-load, ready for `hyperframes preview` and `hyperframes render`. Use whenever storyboard.json + timings.json + screenshots-manifest.json all exist in the run-dir and the pipeline needs a composition — also when the user says "build the composition", "write the index.html", or "compose today's video".
---

# yt-compose (v4)

> **v4 supersedes v3.** v3 mandated 5 inline `<div class="scene clip">` blocks in one `index.html`. That pattern broke the HF studio preview server (all-black scenes; 5 hours burned debugging on 2026-04-25). v4 aligns with HF's documented sub-composition pattern: a thin root + one HTML file per scene under `compositions/`. See `HANDOFF-2026-04-26.md` for root-cause.

## Required reading before writing

1. `npx hyperframes docs compositions` — nested-composition pattern (`data-composition-src`).
2. `/hyperframes` skill — `data-*` contract, GSAP timeline registration semantics.
3. `/gsap` skill — position parameter, stagger, eases.
4. `DESIGN.md` at the repo root — palette, typography, motion vocabulary.
5. `assets/motion-primitives.css` — visual primitives (kinetic word, count-up, scroll-frame, stat-bar, caption).

## Inputs (all in `<run-dir>`)

`script.md`, `storyboard.json`, `timings.json` (incl. `emphases[]`), `screenshots-manifest.json` (incl. `width`, `height`, `source_kind`), `picks.json`, `items.json`, `narration.wav`, `meta.json`, `hyperframes.json`, `assets/`.

## Core principle — TIME-SLICE, NOT SPATIAL CRAM

Each scene is a **sequence of 3+ dominant beats**. ONE focal element fills the screen at a time, then transitions out as the next enters. Spatial cramming (multiple primitives jostling, screenshots as postage stamps, three giant numbers + screenshot + headline visible at once) is **forbidden**.

## The pattern (structural rules)

### Files to produce

```
<run-dir>/
  index.html                  ← thin root (this skill writes)
  compositions/
    intro.html                ← <template>-wrapped sub-comp (this skill writes)
    story-1.html              ← (this skill writes)
    story-2.html              ← (this skill writes)
    story-3.html              ← (this skill writes)
    outro.html                ← (this skill writes)
  assets/                     ← already populated by build-run-dir.mjs (do not regenerate)
  narration.wav               ← already produced by tts.mjs
```

Do not produce a single fat `index.html` with all scenes inline. Do not omit any of the 5 sub-comp files. Do not introduce additional sub-comps (no `captions.html`, `cinematic-zoom.html`, `graphics.html`, etc.) — those are HF init scaffolding and were removed on 2026-04-26.

### Where `class="clip"` lives

| Element | `class="clip"` | Why |
|---|---|---|
| Root `<div id="ai-daily">` | **NO** | Root is the composition itself, not a clip. |
| Root `<audio id="narration">` | **NO** | Audio is invisible — adding `clip` breaks the studio's visibility manager and disables the play button. |
| Root `<div class="scene-wrap" data-composition-src="...">` (×5) | **NO** | Scene wrappers are containers driven by GSAP cross-cuts on opacity. Adding `clip` breaks the studio player probe (`proof-fix.mjs` goes red). |
| Sub-comp root `<div data-composition-id="<id>">` | **NO** | Same reason — it's a composition root, not a beat. |
| Sub-comp beat divs (`.beat`, `.beat-hero`, `.beat-stat`, …) | **YES** | Beats are time-sliced focal elements; the runtime uses `clip` for visibility within their `data-start`/`data-duration`. |
| Inline timed elements inside beats (`.count-up`, `.stat-bar`, `.caption-line`, `.kw[data-emphasize-at]`) | **YES** if they have timing attrs | Lint warns if a timed element lacks `clip`. |

### Where `window.__timelines` keys live

- Root registers `window.__timelines['ai-daily']` **synchronously in `<head>`**, with a duration filler (`tl.to({}, { duration: TOTAL }, 0)`) and **cross-cut `tl.set` calls deferred to `DOMContentLoaded`** (the cross-cut targets are scene wrappers that exist after DOM parse).
- Each sub-comp registers its own `window.__timelines['<scene-id>']` inside its inline `<script>`, with **scene-relative** GSAP times (subtract scene start from each absolute timestamp from storyboard).

### Why synchronous master + deferred cross-cuts

The HF 0.4.26 studio polls `window.__timelines['ai-daily']` synchronously when the iframe loads — defer the registration and the play button stays disabled forever. But the cross-cut `tl.set` calls reference selectors like `#story-1-comp` which don't exist until the body parses. Solution: register the empty timeline first, then add tweens once the DOM is ready.

---

## Root `index.html` — canonical template

Emit this exactly, replacing the `<<TOKEN>>` placeholders with run-specific values:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AI Daily — <<DATE>></title>
<!-- Local Inter font (latin subset, ~90 KB total). No network round-trip. -->
<link rel="preload" as="font" type="font/woff2" crossorigin href="assets/fonts/inter-400.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin href="assets/fonts/inter-500.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin href="assets/fonts/inter-600.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin href="assets/fonts/inter-800.woff2">
<!-- Note: do NOT add <link rel="preload" as="fetch"> for compositions/*.html.
     The HF studio fetches sub-comps through its own pipeline, not the
     declarative preload, so the browser flags them "preloaded but not used"
     and they don't actually warm the cache. -->
<link rel="stylesheet" href="assets/motion-primitives.css">
<style>
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap; src: url('assets/fonts/inter-400.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap; src: url('assets/fonts/inter-500.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap; src: url('assets/fonts/inter-600.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 800; font-display: swap; src: url('assets/fonts/inter-800.woff2') format('woff2'); }

  :root {
    --bg-primary: #0A0A0A; --bg-secondary: #1A1A1A;
    --fg-primary: #F5F5F5; --fg-secondary: #A0A0A0;
    --accent: #0066FF; --divider: #2A2A2A;
  }
  html, body {
    margin: 0; padding: 0;
    width: 1920px; height: 1080px;
    background: var(--bg-primary); color: var(--fg-primary);
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
  }

  /* Each scene wrapper fills the canvas; opacity is driven by master GSAP. */
  .scene-wrap { position: absolute; inset: 0; width: 1920px; height: 1080px; opacity: 0; }
  #intro-comp { opacity: 1; } /* first scene visible at t=0 */

  /* Beat shared layout (per-beat layouts live in motion-primitives.css). */
  .beat {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    display: grid; box-sizing: border-box;
    opacity: 0;
  }

  /* (project-wide beat styles continue here — copy from canonical 2026-04-25-1
     index.html lines 42–356 verbatim. They are scene-agnostic, run-invariant.) */

  .count-up { display: inline-block; }
</style>
<script src="assets/gsap.min.js"></script>
<script>
window.__hf = window.__hf || { selfHosted: true };
// Master timeline registry: register SYNCHRONOUSLY so the studio's player
// probe finds it on iframe load. Defer DOM-querying tweens to DOMContentLoaded.
window.__timelines = window.__timelines || {};
(function() {
  const tl = gsap.timeline({ paused: true });
  tl.to({}, { duration: <<TOTAL_DURATION>> }, 0);
  window.__timelines['ai-daily'] = tl;
  document.addEventListener('DOMContentLoaded', () => {
    // Cross-cuts on scene-wrap opacity: only one wrapper opaque at a time.
    tl.set('#intro-comp',   { opacity: 0 }, <<S1_START>>);
    tl.set('#story-1-comp', { opacity: 1 }, <<S1_START>>);
    tl.set('#story-1-comp', { opacity: 0 }, <<S2_START>>);
    tl.set('#story-2-comp', { opacity: 1 }, <<S2_START>>);
    tl.set('#story-2-comp', { opacity: 0 }, <<S3_START>>);
    tl.set('#story-3-comp', { opacity: 1 }, <<S3_START>>);
    tl.set('#story-3-comp', { opacity: 0 }, <<OUTRO_START>>);
    tl.set('#outro-comp',   { opacity: 1 }, <<OUTRO_START>>);
  });
})();
</script>
</head>
<body>
<div id="ai-daily" data-composition-id="ai-daily" data-width="1920" data-height="1080" data-start="0" data-duration="<<TOTAL_DURATION>>">

  <!-- Audio: track 0 — must NOT have class="clip". Audio is invisible. -->
  <audio id="narration" data-start="0" data-duration="<<TOTAL_DURATION>>" data-track-index="0" src="narration.wav" preload="auto"></audio>

  <!-- 5 sub-compositions, each with its own GSAP timeline registered to window.__timelines[id] -->
  <div id="intro-comp"   class="scene-wrap" data-composition-id="intro"   data-composition-src="compositions/intro.html"   data-start="0"               data-duration="<<INTRO_DUR>>"   data-track-index="1"></div>
  <div id="story-1-comp" class="scene-wrap" data-composition-id="story-1" data-composition-src="compositions/story-1.html" data-start="<<S1_START>>"   data-duration="<<S1_DUR>>"      data-track-index="1"></div>
  <div id="story-2-comp" class="scene-wrap" data-composition-id="story-2" data-composition-src="compositions/story-2.html" data-start="<<S2_START>>"   data-duration="<<S2_DUR>>"      data-track-index="1"></div>
  <div id="story-3-comp" class="scene-wrap" data-composition-id="story-3" data-composition-src="compositions/story-3.html" data-start="<<S3_START>>"   data-duration="<<S3_DUR>>"      data-track-index="1"></div>
  <div id="outro-comp"   class="scene-wrap" data-composition-id="outro"   data-composition-src="compositions/outro.html"   data-start="<<OUTRO_START>>" data-duration="<<OUTRO_DUR>>"  data-track-index="1"></div>

</div>
</body>
</html>
```

**Token map:**
- `<<DATE>>` — picks date (e.g. `2026-04-25`) from picks.json or run-dir name.
- `<<TOTAL_DURATION>>` — sum of all scene durations from timings.json (e.g. `186.12`).
- `<<INTRO_DUR>>`, `<<S1_DUR>>`, `<<S2_DUR>>`, `<<S3_DUR>>`, `<<OUTRO_DUR>>` — per-scene durations from timings.json.
- `<<S1_START>>` = `<<INTRO_DUR>>`. `<<S2_START>>` = `<<S1_START>> + <<S1_DUR>>`. Etc. Compute from timings.json — do not hand-author.

**Audio src** is always `narration.wav` (relative to run-dir). All `assets/` and `compositions/` references are relative — do NOT prefix with `../`.

**No** `https://fonts.googleapis.com` / `https://fonts.gstatic.com` references. No CDN GSAP. No external CSS.

The shared beat CSS (lines `42–356` in the canonical `work/2026-04-25-1/index.html`) is run-invariant and should be copied into the root `<style>` block verbatim.

---

## Per-scene `compositions/<id>.html` — canonical template

Every sub-comp follows this exact shape, with **scene-relative** GSAP times. The `<id>` is one of `intro`, `story-1`, `story-2`, `story-3`, `outro`.

```html
<template id="<<ID>>-template">
<div data-composition-id="<<ID>>" data-width="1920" data-height="1080" data-start="0" data-duration="<<SCENE_DUR>>">

  <div class="grid-decorative">
    <!-- 1px decorative lines; entrance tweened from scaleX:0 (see script). -->
    <div class="grid-h" style="top:80px"></div>
    <div class="grid-h" style="top:1000px"></div>
    <div class="grid-v" style="left:120px"></div>
    <div class="grid-v" style="left:1800px"></div>
  </div>

  <!-- Beats: each is a focal element occupying its own time slice within the scene. -->
  <!-- ALL beats have class="clip", scene-relative data-start, data-track-index="2". -->
  <div id="<<ID>>-b1" class="beat beat-<<TYPE>> clip" data-start="0" data-duration="<<B1_DUR>>" data-track-index="2">
    <!-- focal content for beat 1 -->
  </div>

  <!-- ... beats b2..bN, each scene-relative ... -->

  <!-- Source chip (story scenes only) -->
  <div class="source-chip" id="<<ID>>-source"><<DOMAIN>></div>

  <script>
  (function() {
    const tl = gsap.timeline({ paused: true });

    function beatIn(sel, at, opts) {
      opts = opts || {};
      tl.fromTo(sel,
        { opacity: 0, scale: opts.fromScale || 0.96, y: opts.fromY != null ? opts.fromY : 24 },
        { opacity: 1, scale: 1, y: 0, duration: opts.duration || 0.45, ease: opts.ease || 'expo.out' },
        at);
    }
    function beatOut(sel, at, opts) {
      opts = opts || {};
      tl.to(sel, { opacity: 0, scale: opts.toScale || 1.04, duration: opts.duration || 0.35, ease: 'power2.in' },
        at - (opts.duration || 0.35));
    }

    // Scene-relative grid entrance.
    tl.from('#<<ID>> .grid-h, #<<ID>> .grid-v',
      { scaleX: 0, transformOrigin: 'left', duration: 0.5, ease: 'expo.out', stagger: 0.03 }, 0.03);

    // Scene-relative beats. ALL `at` values are subtract-scene-start.
    beatIn('#<<ID>>-b1', 0.05, { duration: 0.5 });
    /* ... per-beat tweens ... */
    beatOut('#<<ID>>-b1', <<B1_END>>, { duration: 0.35 });

    /* ... b2..bN ... */

    window.__timelines = window.__timelines || {};
    window.__timelines['<<ID>>'] = tl;
  })();
  </script>
</div>
</template>
```

### Critical scene-relative time conversion

Storyboard `at_sec` values are **absolute** (relative to the full video). Sub-comp tweens are **relative** to scene start. Always convert:

```
relTime = absTime - sceneStart
```

Example: story-2 starts at 71.24s. A beat at absolute 80.00s gets `at = 80.00 - 71.24 = 8.76` in the sub-comp script. Getting this wrong means beats fire when nothing is on screen.

### Reference

For a complete, working sub-comp example, see `work/2026-04-25-1/compositions/intro.html` (4 beats, 14.67s) and `work/2026-04-25-1/compositions/story-1.html` (7 beats, 56.57s, including count-up, ken-burns, kinetic-word). These are the gold standard — follow their structure when uncertain.

---

## Beat library (project-wide, scene-invariant)

These are the only allowed beat layouts. CSS lives in root `index.html` `<style>`; sub-comps reference them by classname.

| Beat | Classes | Use | Source data |
|---|---|---|---|
| Hero | `.beat.beat-hero` | Intro hero card "AI DAILY" | static |
| Teaser | `.beat.teaser` | Intro story teasers (one per pick) | picks.json titles |
| Cold-open | `.beat.beat-cold-open` | Story scene opening: big number + headline | picks |
| Headline-hold | `.beat.beat-headline-hold` | Story scene: headline center, ghost screenshot bg | picks + screenshot |
| Stat | `.beat.beat-stat` | Story scene: ONE stat at massive size + count-up | story facts |
| Stat-bar | `.beat.beat-statbar` | Story scene: bar comparison (1 row, 1 metric) | story facts |
| Quote | `.beat.beat-quote` | Story scene: hero pull-quote with attribution | story quotes |
| Visual | `.beat.beat-visual` | Story scene: full-bleed screenshot + ken-burns + kinetic caption | screenshots |
| Takeaway | `.beat.beat-takeaway` | Story scene: builder takeaway, last beat | story takeaway |
| Outro hero | `.beat.beat-outro-hero` | Outro: AI DAILY exit card | static |
| Outro CTA | `.beat.beat-outro-cta` | Outro: "FOLLOW · LIKE · SUBSCRIBE" | static |

**No new beat types.** If the storyboard requires a layout not in this list, fall back to the closest match — do not invent.

## Per-scene beat budget

Each story scene must contain **3+ time-sliced beats** with distinct `data-start` values. Lint enforces this per-sub-comp (`pipeline/lib/motion-budget.mjs` walks `compositions/*.html`). Intro and outro are exempt from the count but should still use the beat-sequenced approach (hero card → teasers / hero card → CTA).

A "beat moment" is a unique value across `data-at` / `data-emphasize-at` / `.clip[data-start]` within the scene. Three beats in the same scene at the same time count as one moment.

## Layout discipline (hard rules)

- Every `.beat` is `width: 100%; height: 100%; display: grid` inside its scene.
- Inside a beat, primary content uses **CSS Grid** with 2–4 explicit cells. Elements get `grid-area`/row/column.
- `position: absolute` is allowed ONLY for: source-chip pill (bottom-right), grid-decorative lines, full-bleed background images. **NEVER** for headlines, numbers, takeaways, or screenshots-as-content.
- Empty space in a beat is intentional. If the right half is empty during a beat, the beat is wrong — extend the active element across both columns or restructure the grid.

## Dynamic content rules

- **Numbers**: shown ONE AT A TIME at 240–360px filling the canvas. Use `count-up` animating from 0 → target over 0.6–1.0s after the beat enters. Three stats become three sequential beats, never one row of three.
- **Screenshots**: full-bleed at 1920×1080 with `object-fit: cover`. Two acceptable modes:
  1. **Background ghost**: 0.15–0.35 opacity behind a foreground caption.
  2. **Foreground with ken-burns**: GSAP `tl.fromTo()` from `scale(1.05) translate(-2%, -1%)` to `scale(1.10) translate(2%, 1%)` over the beat's full duration.
  No 720×360 thumbnails in a corner. No `position: absolute` frames inset against text.
- **Kinetic typography**: ALWAYS used in story scenes (≥1 word per scene). Read `timings.emphases[]` filtered `kind: 'kinetic'`; wrap the matching word in `<span class="kw" data-emphasize-at="<emphasis.start_sec - sceneStart>">word</span>`. Limit to 1–2 per scene.
- **Captions**: read `timings.emphases[]` filtered `kind: 'caption'`; emit `<div class="caption-line clip" data-at data-end>...</div>` inside the relevant scene. ≤4 per scene. **Subtract scene start from all timestamps.**

## Determinism (non-negotiable)

No `Math.random()`, no `Date.now()`, no `repeat: -1`, no `setTimeout`, no `requestAnimationFrame`, no network fetches in the composition. Every visible state must be a pure function of timeline time.

## What v4 explicitly forbids (anti-patterns from prior outages)

- ❌ One fat `index.html` with 5 inline `<div class="scene clip">` blocks. (v3 pattern; black-render outage 2026-04-25.)
- ❌ `class="clip"` on scene wrappers, on the audio element, or on `#ai-daily` root. (Disables play button.)
- ❌ Asynchronous `__timelines['ai-daily']` registration (`DOMContentLoaded`, `setTimeout`). The placeholder MUST be sync; only the cross-cut tweens defer.
- ❌ `https://fonts.googleapis.com` / `https://fonts.gstatic.com` links. Use local `assets/fonts/*.woff2` only.
- ❌ Shader-transition sub-comps via `data-composition-src="..."` for special effects. The 5 scene refs are the only allowed sub-comp sources.
- ❌ Absolute timestamps in sub-comp scripts. Always scene-relative.
- ❌ Hand-authored `<<S2_START>>`-style values. Compute from timings.json scene durations.

## Lint contract

After writing, from project root:

```bash
npx hyperframes lint <run-dir>
```

Must report **0 errors**. Advisory warnings (duplicate-media, missing-clip-on-spans) are tolerable but should be minimized. If `pipeline/lint.mjs` is updated with the v4 structural checks, three new errors will fire if you regress to v3:
- `inline_scene_clip_block` — root `index.html` contains `<div class="scene clip">` or similar inline scenes.
- `missing_data_composition_src` — root has fewer than 5 `data-composition-src` references.
- `clip_on_scene_wrapper` — a wrapper with `data-composition-src` carries `class="clip"`.

The motion-budget rule counts beat moments **per sub-comp file**; threshold remains 3 per story scene.

## Output checklist

When done, report to the user:

1. ✅ Wrote `<run-dir>/index.html` (thin root + 5 sub-comp wrappers).
2. ✅ Wrote `<run-dir>/compositions/{intro,story-1,story-2,story-3,outro}.html`.
3. ✅ `npx hyperframes lint <run-dir>` reports 0 errors.
4. ✅ Total composition duration matches `narration.wav` length (within 0.5s).
5. ℹ️  **In the studio sidebar, click `index` to play the full video.** The other entries (`intro`, `story-1`, `story-2`, `story-3`, `outro`) are sub-compositions — they will appear empty in isolation because they share CSS and audio from the root.

## Hard stops

- DESIGN.md violations (palette/typography/motion eases outside the documented set).
- Schema mismatches (storyboard, timings, manifest fields missing).
- If a story scene has fewer than 3 beat-eligible elements, **stop and report** — do NOT duplicate or fabricate beats.
- No easter eggs, no emoji, no non-deterministic constructs.
- If `meta.json` or `assets/` is missing in the run-dir, **stop and tell the user** — fix belongs in `pipeline/build-run-dir.mjs`, not in the composition.
