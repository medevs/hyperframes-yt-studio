---
name: yt-compose
description: Write the Hyperframes root `index.html` composition for today's AI Daily video — 5 scenes (intro, 3 stories, outro) driven by storyboard.json and timings.json, lint-clean, ready for `hyperframes render`. Use whenever storyboard.json + timings.json + screenshots-manifest.json all exist in the run-dir and the pipeline needs a composition — also when the user says "build the composition", "write the index.html", or "compose today's video".
---

# yt-compose

Write `<run-dir>/index.html` — a complete, standalone Hyperframes composition using the v2 motion-primitives contract.

## Required reading before writing

1. `/hyperframes` — composition model, `data-*` contract, GSAP timeline registration.
2. `/gsap` — position parameter, stagger, eases.
3. `/hyperframes-cli` — `lint`, `snapshot`, `render`.
4. `DESIGN.md` at the repo root — palette, typography, motion vocabulary.
5. `assets/motion-primitives.css` and `assets/motion-primitives.js` — the 7 primitives you must compose with. Read these files before writing the composition.

## Inputs (all in `<run-dir>`)

- `script.md`, `storyboard.json`, `timings.json` (now includes `emphases[]`),
  `screenshots-manifest.json` (now includes `width`, `height`, `source_kind`),
  `picks.json`, `items.json`, `narration.wav`.

## Composition skeleton (v2)

Every `index.html` you produce MUST:

- Link the motion-primitives stylesheet in `<head>` using a relative path that resolves from the run-dir to project-root `assets/`. The run-dir is typically `work/<run-id>/` so the relative path is `../../assets/motion-primitives.css`. Verify by checking: from the run-dir, can the browser fetch the CSS via that relative href?
  ```html
  <link rel="stylesheet" href="../../assets/motion-primitives.css">
  ```
- Load GSAP, then inline the motion-primitives IIFE, then your per-composition timeline script — see "Motion-primitives runtime" and "Timeline registration order" sections below.

### Motion-primitives runtime — inline as IIFE, do NOT use external module script

Inline the motion-primitives browser runtime as a `<script>` IIFE in `<head>`. Copy the body of the `if (typeof window !== 'undefined') { ... }` block from `assets/motion-primitives.js` and wrap it in `(function() { ... })();`. The IIFE must define and assign `window.formatBigNumber`, `window.registerKineticTweens`, `window.registerCountUps`, `window.registerScrollFrames`, `window.registerStatBars`, `window.registerCaptions`.

DO NOT use:
- `<script type="module" src="../../assets/motion-primitives.js">` — ESM modules load asynchronously; the timeline script below would run before the registrars are on `window`.
- `<script src="../../assets/motion-primitives.js">` (non-module) — the relative path breaks across preview-server vs render-server contexts.

Inlining ensures (a) deterministic load order, (b) no path fragility, (c) renders the composition self-contained.

### Timeline registration order (critical for studio playback)

After defining the master `tl = gsap.timeline({ paused: true })` and adding all `tl.from(...)` / `tl.to(...)` entrance tweens, do these two things in this exact order:

```js
// 1. Register the timeline FIRST so the studio finds it on synchronous DOM introspection.
window.__timelines = window.__timelines || {};
window.__timelines['ai-daily'] = tl;

// 2. Call all 5 motion-primitive registrars synchronously.
// (This script is at end of body; readyState is never 'loading' here.)
registerKineticTweens(tl);
registerCountUps(tl);
registerScrollFrames(tl);
registerStatBars(tl);
registerCaptions(tl);
```

DO NOT wrap either the `window.__timelines` assignment or the registrar calls in:
- `document.addEventListener('DOMContentLoaded', ...)`
- `setTimeout(...)`
- `requestAnimationFrame(...)`
- Any other deferred callback

Reason: the hyperframes studio reads `window.__timelines[<composition-id>]` synchronously when the iframe loads. If the timeline is registered later, the studio shows the play button disabled and the timeline ruler stays empty.

## Per-scene motion budget (enforced by lint)

Every **story** scene (id `story-*`) must include at least 3 of these 5 budget-counted primitives:

| Primitive | Class signature in HTML |
| --- | --- |
| KineticWord | `<span class="kw" data-emphasize-at="<sec>">` |
| CountUp | `<span class="count-up" data-target data-at data-duration>` |
| ScrollFrame | `<div class="scroll-frame" data-at data-duration data-distance>` |
| StatBar | `<div class="stat-bar" data-target-pct data-at>` |
| CaptionLine | `<div class="caption-line" data-at data-end>` |

Intro and outro scenes are exempt from the 3-primitive budget. Scene transitions are handled by simple opacity crossfades (see "Transitions" below) — do NOT use shader-transition sub-compositions.

## Kinetic typography rules

Read `timings.emphases[]`. For each emphasis with `kind: 'kinetic'`, find the corresponding word in the on-screen text and wrap it in `<span class="kw" data-emphasize-at="<emphasis.start_sec>">word</span>`. The registrar tweens it in at that exact moment. Limit to 1-2 kinetic words per scene's narration paragraph (don't make every word jumpy).

## Count-up rule

Every storyboard `number_callout` beat with a numeric value MUST be rendered as `<span class="count-up" data-target="VALUE" data-at="SCENE_START + BEAT_AT_SEC" data-duration="1.0">0</span>` — initial textContent `0` is overwritten by the registrar. For values like `1.6T`, set `data-target="1600000000000"` and let `formatBigNumber` produce the display string. For decimal versions like `5.5`, set `data-target="5.5"`.

## Scroll-frame rule

Every storyboard `screenshot` beat MUST wrap the `<img>` in a `.scroll-frame` div with `data-at`, `data-duration`, and `data-distance`. Compute `data-distance` as `screenshots-manifest entry.height - 540` (the scroll-frame's visible height; clamp to 0 minimum). `data-duration` is the screenshot's on-screen duration in seconds — typically the entire scene minus the intro beats. The img gets `height: <manifest.height>px`.

## Captions

Read `timings.emphases[]` filter `kind: 'caption'`. For each, emit `<div class="caption-line" data-at="<start>" data-end="<end>">word</div>` near the bottom of the relevant scene container. Limit to ≤4 caption emphases per scene (the extractor caps this).

## Transitions

Use simple opacity crossfades — do NOT use shader-transition sub-compositions via `data-composition-src`. **Why:** the shader-transition sub-comps' inlined HTML adds elements with conflicting `id` attributes (`#s2`, `#driver`) and inline `opacity: 0` that break the runtime's clip visibility tracking. The result is an all-black rendered video with audio only — silent failure during render. This was the root cause of the 2026-04-25 render outage; never reintroduce.

For visual continuity between scenes, rely on:
- Each scene's `gsap.from()` entrance animations (the new scene fades/slides in)
- Butt-joined scene durations (so there's no black gap between them)
- The outro scene's permitted exit animation (`tl.to('#outro', { opacity: 0 })`)

If you need richer transitions in the future, build them as inline gsap tweens on the scene elements themselves (`tl.to('#scene-a', { opacity: 0 }, boundary); tl.from('#scene-b', { opacity: 0 }, boundary)`). Stay within the master timeline; do not embed sub-compositions.

## GridDecorative

Each scene MAY include a `<div class="grid-decorative">` containing 1px horizontal/vertical lines positioned at 80px intervals. Animate entrance with `gsap.from('.grid-h, .grid-v', { scaleX: 0, transformOrigin: 'left', duration: 0.6, ease: 'expo.out', stagger: 0.02 })` at scene start. Behind all content (`z-index: 0`).

## Lint contract

After writing, run from the project root:

```bash
node pipeline/lint.mjs <run-dir>
```

Must report 0 errors. The existing hyperframes lint AND the new `motion_budget` rule (Task 10) must pass.

## Hard stops

Same as v1 (DESIGN.md violations, schema mismatches, no easter eggs). Plus: if a story scene cannot reach 3 primitives because the storyboard beats are too sparse, emit `data-motion-exempt="<reason>"` on the scene element and stop and report — do not fabricate primitives.
