---
name: yt-compose
description: Write the Hyperframes root `index.html` composition for today's AI Daily video — 5 scenes (intro, 3 stories, outro) driven by storyboard.json and timings.json, lint-clean, ready for `hyperframes render`. Use whenever storyboard.json + timings.json + screenshots-manifest.json all exist in the run-dir and the pipeline needs a composition — also when the user says "build the composition", "write the index.html", or "compose today's video".
---

# yt-compose

Write `<run-dir>/index.html` — a complete, standalone Hyperframes composition.

## Required reading before writing

Load these via the Skill tool before composing. Don't read vendored-skill paths directly — the Skill tool is the stable interface and the skills may be reshuffled.

1. `/hyperframes` — composition model, `data-*` attribute contract, GSAP timeline registration, scene transitions, house style. This is the most important one; everything you write has to pass its lint rules.
2. `/gsap` — position parameter, stagger, eases. The entrance animations live or die on these.
3. `/hyperframes-cli` — covers `lint`, `snapshot`, `render`. You'll run `lint` as the final gate.

Then read **`DESIGN.md`** at the repo root — it's the *hard gate* for this project. Every color, font size, and motion choice in the composition must trace to DESIGN.md or the Hyperframes house style. No generic `#3B82F6`, no Roboto, no `fadeInUp` with `ease: "power1.out"`.

## Inputs (all in `<run-dir>`)

- `script.md` — narration (reference only; text on screen comes from storyboard beats, not narration)
- `storyboard.json` — 5 scenes with beats (schema: `pipeline/schemas/storyboard.js`)
- `timings.json` — authoritative per-scene `start_sec` and `duration_sec` from transcript (schema: `pipeline/schemas/timings.js`)
- `screenshots-manifest.json` — per-pick screenshot paths and fallback flags
- `picks.json` — item metadata cross-reference
- `items.json` — source domain, title, url
- `narration.wav` — audio track (reference as `src="narration.wav"`; don't embed)

## Composition skeleton

One file, `<run-dir>/index.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* DESIGN.md palette as CSS custom properties. Confirm values against DESIGN.md — don't trust this example. */
    :root {
      --bg-primary: #0A0A0A;
      --bg-secondary: #1A1A1A;
      --fg-primary: #F5F5F5;
      --fg-secondary: #A0A0A0;
      --accent: #0066FF;
      --divider: #2A2A2A;
    }
    html, body { margin: 0; padding: 0; background: var(--bg-primary); overflow: hidden; }
    body { font-family: 'Inter', system-ui, sans-serif; color: var(--fg-primary); }
    /* Per-scene and per-element styles below... */
  </style>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
</head>
<body>
  <div id="stage"
       data-composition-id="ai-daily"
       data-width="1920"
       data-height="1080"
       data-start="0">

    <!-- Scene 1: INTRO -->
    <div class="scene scene-intro clip"
         id="scene-intro"
         data-start="0"
         data-duration="15.2"
         data-track-index="1">
      <!-- scene content -->
    </div>

    <!-- Scene 2..5: story-1, story-2, story-3, outro (each needs class="clip" + data-start/duration/track-index) -->

    <!-- Audio -->
    <audio id="narration"
           class="clip"
           data-start="0"
           data-duration="<total_duration_sec>"
           data-track-index="0"
           src="narration.wav"
           data-volume="1.0"></audio>
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });

    // Per-scene entrance animations. All entrances use gsap.from().
    // Scenes 1..4: NO exit animations. The next scene entering handles the visual transition.
    // Scene 5 (outro): MAY use gsap.to(..., { opacity: 0 }) for elements only.

    // Scene INTRO entrances (offset from scene start, never exactly at t=0)
    // tl.from('#intro-title', { y: 60, opacity: 0, duration: 0.6, ease: 'expo.out' }, 0.2);
    // tl.from('#intro-date', { y: 40, opacity: 0, duration: 0.5, ease: 'power4.out' }, 0.4);
    // tl.from('.intro-headline', { x: -40, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.12 }, 0.7);

    // ... story 1, 2, 3, outro entrances at their scene start_sec values ...

    window.__timelines['ai-daily'] = tl;
  </script>
</body>
</html>
```

Every timed element (every `.scene`, the `<audio>`, anything with `data-start`) **must** have `class="clip"` — the framework uses it to control visibility. Missing `clip` is the #1 cause of "it renders but everything's visible at once" bugs.

## Scene timing rules

- **Use `timings.json` exact values** for each scene's `data-start` and `data-duration`. Do not use storyboard's `target_duration_sec` — that's a pre-TTS hint, not reality.
- Scene ordering: intro → story-1 → story-2 → story-3 → outro. All on `data-track-index="1"`. Audio is on track `0`.
- Total composition duration = `timings.total_duration_sec`.
- Same-track same-start is forbidden. The scenes are sequential, so this only bites if you accidentally set two starts equal — double-check with `timings.json`.

## Animation rules (non-negotiable; from the hyperframes skill)

1. Every visible element enters via `gsap.from()`. No element appears fully-formed.
2. Offset the first entrance of each scene by 0.1–0.3s from the scene start. Never exactly at `start_sec`.
3. Use at least 3 different eases per scene. Swiss Pulse defaults: `expo.out`, `power4.out`, `power3.out`.
4. **No exit animations** except on the final scene. Scene transitions are carried by the next scene entering; the outgoing scene stays at full opacity at the boundary.
5. All timelines start `paused: true` and register on `window.__timelines['ai-daily']`.
6. No `Math.random()`, `Date.now()`, `repeat: -1`, `setTimeout`, or `async` around timeline construction. The framework requires deterministic output.
7. Don't animate `visibility`, `display`, or call `.play()` on media. Let the framework drive playback via `data-start`/`data-duration`.

## Transitions between scenes

For v1, use opacity-based crossfades between adjacent scenes. Over a ~0.4s window at each boundary, the previous scene remains visible (no exit animation) while the next scene's entrances fire. Because scenes are on the same track and track overlap is forbidden, give each scene a ~0.4s "pre-roll" where the new scene's content enters while the previous scene's background is still at full opacity. If that feels wrong visually, v2 can introduce `@hyperframes/shader-transitions` blocks for Cinematic Zoom and SDF Iris — load `/hyperframes-registry` if you go that route.

## Layout rules

- `.scene` uses `width: 100%; height: 100%; padding: 120px 160px; box-sizing: border-box; position: absolute; inset: 0;`.
- Content containers inside scenes use flex + gap. **Never** `position: absolute; top: Npx` for content — absolute is reserved for decoratives (rules, chips, number callouts).
- Typography follows DESIGN.md sizes. Hero 120px, story-headline 72px, body 36px, label 24px, number-callout 160px. Confirm against DESIGN.md — these are the defaults you should see.
- Screenshots: crop 1200×400, displayed with `object-fit: cover; object-position: top; border-radius: 4px;` and a 6px solid `var(--accent)` outline per Swiss Pulse. No drop shadow.
- If `screenshots-manifest.json` flags a pick as `fallback: true`, render that scene **without the image** — text-only layout with the headline at hero-size and the source URL as a footer chip.

## Per-scene content from storyboard

For each scene in `storyboard.json.scenes`:

- Use `scene.beats` as the list of visible elements. Each beat becomes one HTML element whose entrance tween fires at `scene.start_sec + beat.at_sec` in the master timeline.
- Beat-kind → class mapping:
  - `headline` → `.story-headline` / `.hero`
  - `screenshot` → `<img class="screenshot" src="<path from screenshots-manifest>">`
  - `number_callout` → `.number-callout` (160px accent, `font-variant-numeric: tabular-nums`)
  - `label` → `.label` (24px, uppercase, letter-spacing 1.5px, `--fg-secondary`)
  - `takeaway` → `.takeaway` (36px, left accent bar, prefixed with a "FOR BUILDERS" label)
  - `source_chip` → `.source-chip` (22px, accent background, bottom-right)

## After writing, validate

```bash
npx hyperframes lint
```

Lint catches structural problems: missing `data-composition-id`, missing `class="clip"`, overlapping tracks, unregistered timelines, `repeat: -1`, non-deterministic constructs, etc. **Fix every error before handing off.** Warnings are informational.

For a visual sanity check after `lint` is clean:

```bash
npx hyperframes snapshot
```

This captures key frames as PNGs so you can eyeball the composition without running a full render.

## Hard stops

- If you can't satisfy a DESIGN.md constraint (a beat demands an off-palette color, a font size not in the scale, etc.), **stop and report** to the caller. Don't invent colors or sizes.
- If `timings.json` and `storyboard.json` disagree on scene count or order, **stop and report**. The mismatch will surface as lint failures or as a render that's visibly out of sync — cheaper to fix at the source.
- Don't include any element not derived from storyboard beats or DESIGN.md chrome. No easter eggs, no "looked cool" additions.
