---
name: yt-compose
description: Write the Hyperframes root `index.html` composition for today's AI Daily video — 5 scenes (intro, 3 stories, outro) driven by storyboard.json and timings.json, lint-clean, ready for `hyperframes render`. Use whenever storyboard.json + timings.json + screenshots-manifest.json all exist in the run-dir and the pipeline needs a composition — also when the user says "build the composition", "write the index.html", or "compose today's video".
---

# yt-compose (v3)

Write `<run-dir>/index.html` — a complete, standalone Hyperframes composition. v3 supersedes v2: same primitives, but they are sequenced in **time** as full-bleed beats, not stacked spatially.

## Required reading before writing

1. `/hyperframes` — composition model, `data-*` contract, GSAP timeline registration.
2. `/gsap` — position parameter, stagger, eases.
3. `/hyperframes-cli` — `lint`, `snapshot`, `render`.
4. `DESIGN.md` at the repo root — palette, typography, motion vocabulary.
5. `assets/motion-primitives.css` and `assets/motion-primitives.js` — the 5 primitives you compose with. Read both files before writing.

## Inputs (all in `<run-dir>`)

`script.md`, `storyboard.json`, `timings.json` (incl. `emphases[]`), `screenshots-manifest.json` (incl. `width`, `height`, `source_kind`), `picks.json`, `items.json`, `narration.wav`.

## Core principle: TIME-SLICE, DON'T CRAM

Each scene is a **sequence of 3+ dominant beats**. ONE focal element fills the screen at a time, then transitions out as the next enters. Spatial cramming (multiple primitives jostling on one frame, screenshots as postage stamps in a corner, three giant numbers + screenshot + headline visible at once) is **forbidden**.

A story scene's storyboard beats (e.g. `[label, headline, screenshot, number_callout×3, kinetic_label, takeaway]`) map to a timeline:

| Sub-beat | Time slice | What's on screen | Layout |
|---|---|---|---|
| Cold open | ~0–2s | Giant story number filling left half + headline sliding in from right | 2-col CSS grid, both cells full-bleed |
| Headline hold | ~2–7s | Headline center-screen at hero size; screenshot ghosting in behind at 0.15 opacity full-bleed | stacked z-layers |
| Stat 1 | ~7–14s | One number at MASSIVE size (240–360px), label above 28–36px caps, count-up tweening | single full-cell, centered |
| Stat 2 | ~14–21s | Same template, next stat | same |
| Stat 3 | ~21–28s | Same template, next stat | same |
| Visual + kinetic | ~28–48s | Full-bleed screenshot with ken-burns + kinetic-word caption strip | full-bleed image + bottom 30% caption band |
| Takeaway | ~48–end | Giant takeaway text filling center 70% of canvas | single centered cell |

Beat boundaries MUST align with storyboard `at_sec` values so visuals match audio. Do NOT invent beat times.

## Studio playback prelude (MANDATORY)

Immediately after `<script src="assets/gsap.min.js"></script>` and BEFORE the timeline `<script>`, include this exact block verbatim:

```html
<script>
// HF 0.4.26 studio fix: signal "runtime present" so <hyperframes-player>
// doesn't try to inject the CDN runtime (which can fail/stall on the user's
// network and leaves the play button disabled). We register __timelines
// ourselves below; the player only needs to know not to fetch the CDN.
window.__hf = window.__hf || { selfHosted: true };
</script>
```

Why: HF 0.4.26's `<hyperframes-player>` custom element polls the iframe for `window.__hf` or `window.__player` for ~1s. If neither is present it injects an HF runtime from `cdn.jsdelivr.net`, then waits up to 8s for it to load. On slow/blocked networks the play button stays disabled forever with no diagnostic. Setting `window.__hf` early signals "runtime is present, skip injection"; the player then uses the locally-registered `window.__timelines["ai-daily"]` immediately.

## Composition skeleton

- Single root wrapper, all four attributes required:
  ```html
  <div id="ai-daily" data-composition-id="ai-daily" data-width="1920" data-height="1080" data-start="0" data-duration="<TOTAL_DURATION>">
  ```
  `data-composition-id` MUST exactly match the `window.__timelines[<id>]` key. Mismatches don't error — the studio just shows a disabled play button with no diagnostic.
- Audio inside the root with `id`, `data-start`, `data-duration`, `data-track-index="0"`, **no `class="clip"`**. Per HF docs: *"Audio clips are invisible — do not add class='clip'."* Adding it breaks the studio runtime's visibility manager and disables the play button.
- Master timeline `<script>` lives **inside** the root wrapper, after all scene markup.
- Stylesheet path is **relative to the run-dir**, not `../../`: `<link rel="stylesheet" href="assets/motion-primitives.css">`. `pipeline/build-run-dir.mjs` copies `assets/` INTO the run-dir; paths escaping the run-dir 404 silently and the play button stays disabled. All in-run-dir refs (audio `src`, screenshot `src`) follow the same rule.
- GSAP loads from the LOCAL bundled file: `<script src="assets/gsap.min.js"></script>` — never a CDN. The studio polls for `window.__timelines` for only ~5s; CDN GSAP on a slow network races and loses, disabling the play button forever.

## Project files in the run-dir

Verify before writing `index.html`:
- `meta.json` — REQUIRED. Without it the studio cannot detect the project.
- `hyperframes.json` — required for `npx hyperframes lint` and `preview` to recognise the dir.
- `assets/motion-primitives.css`, `assets/motion-primitives.js`, `assets/gsap.min.js`.
- `compositions/` — pre-existing block library (copied as-is).

If `meta.json` is missing, **stop and tell the user** — fix belongs in `pipeline/build-run-dir.mjs`, not in the composition.

## Motion-primitives runtime — inline as IIFE

Inline the motion-primitives browser runtime as a `<script>` IIFE in `<head>`. Copy the body of the `if (typeof window !== 'undefined') { ... }` block from `assets/motion-primitives.js` and wrap it in `(function() { ... })();`. The IIFE must define `window.formatBigNumber`, `window.registerKineticTweens`, `window.registerCountUps`, `window.registerScrollFrames`, `window.registerStatBars`, `window.registerCaptions`.

DO NOT use `<script type="module">` (async — would race the timeline script) or external `<script src>` for primitives (path fragility across preview vs render servers). Inlining gives deterministic load order, no path fragility, self-contained renders.

## Timeline registration order (critical)

After defining `tl = gsap.timeline({ paused: true })` and adding all tweens, do these two things in this exact order — synchronously, no `DOMContentLoaded` / `setTimeout` / `requestAnimationFrame`:

```js
// 1. Register the timeline FIRST so the studio finds it on synchronous DOM introspection.
window.__timelines = window.__timelines || {};
window.__timelines['ai-daily'] = tl;

// 2. Call all 5 motion-primitive registrars synchronously.
registerKineticTweens(tl);
registerCountUps(tl);
registerScrollFrames(tl);
registerStatBars(tl);
registerCaptions(tl);
```

The studio reads `window.__timelines[<id>]` synchronously when the iframe loads. Deferring registration leaves the play button disabled and the timeline ruler empty.

## Per-scene motion CHOREOGRAPHY (replaces v2's spatial budget)

Every story scene (id `story-*`) must contain **3+ time-sliced beats**. A "beat" is a moment when one focal element enters and the previous focal element transitions out. The lint counts distinct values across the scene's `data-at`, `data-emphasize-at`, and nested-clip `data-start` attributes.

Spatial cramming is forbidden. The 5 primitives (signatures in DESIGN.md / `assets/motion-primitives.css`) — KineticWord, CountUp, ScrollFrame, StatBar, CaptionLine — are still the vocabulary, but they are played **sequentially in time**, not stacked spatially. Intro and outro scenes use the SAME beat-sequenced approach (hero text fills frame, slides out, teasers slide in one at a time) but are exempt from the lint count.

## Layout discipline (hard rules)

- Every `.scene` is `width: 1920px; height: 1080px; position: absolute; inset: 0`.
- Inside a scene, primary content uses **CSS Grid** with `grid-template-columns` and `grid-template-rows` defining 2–4 explicit cells. Elements get `grid-area` assignments.
- `position: absolute` is allowed ONLY for: source-chip pill (bottom-right corner), grid-decorative lines, full-bleed background images. **NEVER** for headlines, numbers, takeaways, or screenshots-as-content.
- When a beat is active, its element is `width: 100%; height: 100%; display: flex; align-items: center; justify-content: center` inside its grid cell.
- "Empty space" within a beat is intentional negative space, not accidental. If the right half of the canvas is empty during a beat, the scene is wrong — extend the active element across both columns or restructure the grid.

## Beat sequencing (canonical pattern)

For each scene, partition its duration into N beats. Each beat owns a time range. Elements are full-bleed inside the active beat and transition with opacity + transform:

```js
// `scene.start` is absolute time. `startAtScene` and `duration` are relative to the scene.
const beat = (selector, startAtScene, duration) => {
  tl.fromTo(selector,
    { opacity: 0, scale: 0.96, y: 24 },
    { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'expo.out' },
    scene.start + startAtScene);
  tl.to(selector,
    { opacity: 0, scale: 1.04, duration: 0.35, ease: 'power2.in' },
    scene.start + startAtScene + duration - 0.35);
};
```

**Beat boundaries MUST align with storyboard `at_sec` values** — the audio narration cues each beat, so visuals must match. Do not invent intermediate times.

## Dynamic content rules

- **Numbers**: shown ONE AT A TIME at 240–360px font size filling the canvas. Use `count-up` animating from 0 → target over 0.6–1.0s after the beat enters. Label sits above in 28–36px caps. Three stats become three sequential beats, never one row of three.
- **Screenshots**: used as **full-bleed** elements at 1920×1080 with `object-fit: cover`. Two acceptable modes:
  1. **Background**: 0.15–0.35 opacity behind a foreground caption.
  2. **Foreground with ken-burns**: GSAP `tl.fromTo()` from `scale(1.05) translate(-2%, -1%)` to `scale(1.10) translate(2%, 1%)` over the beat's duration.
  
  NO 720×360 thumbnails in a corner. NO `position: absolute` frames inset against text.
- **Kinetic typography**: ALWAYS used in story scenes (≥1 word per scene). Read `timings.emphases[]` filtered `kind: 'kinetic'`; wrap the matching word in `<span class="kw" data-emphasize-at="<emphasis.start_sec>">word</span>`. Limit to 1–2 per scene's narration paragraph.
- **Captions**: read `timings.emphases[]` filtered `kind: 'caption'`; emit `<div class="caption-line" data-at data-end>...</div>` inside the relevant scene. ≤4 per scene.
- **Intro and outro** use the SAME beat-sequenced approach: hero "AI DAILY" fills frame, transitions out, story teasers slide in one at a time at distinct `at_sec` values.

## Determinism (non-negotiable)

No `Math.random()`, no `Date.now()`, no `repeat: -1`, no `setTimeout`, no `requestAnimationFrame`, no network fetches in the composition. Every visible state must be a pure function of timeline time.

## Transitions between scenes

Opacity crossfades only. **Do NOT** use shader-transition sub-comps via `data-composition-src`. (Inlined sub-comps inject conflicting `id`s like `#s2`/`#driver` and inline `opacity: 0` that wreck clip visibility — the 2026-04-25 black-render outage. Never reintroduce.)

For continuity between scenes, rely on each scene's beat-in entrance, butt-joined scene durations (no black gap), and the outro's permitted exit (`tl.to('#outro', { opacity: 0 })`). Richer transitions, if ever needed, go as inline tweens on scene elements within the master timeline — never embedded sub-comps.

## GridDecorative

Optional per scene: `<div class="grid-decorative">` with 1px h/v lines. Animate entrance with `gsap.from('.grid-h, .grid-v', { scaleX: 0, transformOrigin: 'left', duration: 0.6, ease: 'expo.out', stagger: 0.02 })` at scene start. Behind all content (`z-index: 0`).

## Lint contract

After writing, from project root:

```bash
node pipeline/lint.mjs <run-dir>
```

Must report 0 errors. The `motion_budget` rule now counts **distinct beat moments** (unique `data-at` / `data-emphasize-at` / clip `data-start` values) within each story scene; threshold is 3. The error message reflects the new "beat moments" semantics.

## Hard stops

- DESIGN.md violations (palette/typography/motion eases outside the documented set).
- Schema mismatches (storyboard, timings, manifest fields missing).
- If a story scene has fewer than 3 beat-eligible elements, **stop and report** — do NOT duplicate or fabricate beats. (`data-motion-exempt="<reason>"` is allowed only when the storyboard genuinely lacks content; warn rather than error.)
- No easter eggs, no emoji, no non-deterministic constructs.
