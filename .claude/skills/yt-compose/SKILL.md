---
name: yt-compose
description: Write the Hyperframes root composition (index.html) for today's AI Daily video. Use when storyboard.json + timings.json + screenshots-manifest.json all exist in the run dir and you need a lint-clean composition ready to render.
---

# yt-compose

Write `<run-dir>/index.html` — a complete, standalone Hyperframes composition.

## Required reading before writing

You MUST have read these three skills this session. Re-load them if uncertain:

1. `.agents/skills/hyperframes/SKILL.md` — composition model, data-attributes, GSAP timeline contract, layout rules, scene transition rules
2. `.agents/skills/hyperframes/house-style.md` + `.agents/skills/hyperframes/visual-styles.md` Swiss Pulse section — motion and palette defaults
3. `.agents/skills/gsap/SKILL.md` — timeline position parameter, stagger, eases

Then read the project's `DESIGN.md` at the repo root — it's the **hard gate**. Every color, font size, and motion choice in your composition must trace back to DESIGN.md or the Hyperframes skill house style. No generic `#3B82F6`, no Roboto, no `fadeInUp` with `ease: "power1.out"`.

## Inputs (all in `<run-dir>`)

- `script.md` — narration (for reference; text that appears on screen comes from storyboard beats)
- `storyboard.json` — 5 scenes with beats (schema: `pipeline/schemas/storyboard.js`)
- `timings.json` — actual per-scene start_sec and duration_sec from transcript (schema: `pipeline/schemas/timings.js`)
- `screenshots-manifest.json` — per-pick screenshot paths and fallback flags
- `picks.json` — to cross-reference item metadata
- `items.json` — source metadata (domain, title, url)
- `narration.wav` — the audio track (don't embed; reference as `src="narration.wav"`)

## Composition structure (non-negotiable)

One file, `<run-dir>/index.html`. Structure:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* DESIGN.md palette as CSS custom properties */
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
    <div class="scene scene-intro"
         id="scene-intro"
         data-start="0"
         data-duration="15.2"
         data-track-index="1">
      <!-- scene content -->
    </div>

    <!-- Scene 2..5: story-1, story-2, story-3, outro -->

    <!-- Audio -->
    <audio id="narration"
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
    // Scenes 1..4: NO exit animations. The transition between scenes handles the exit.
    // Scene 5 (outro): MAY use gsap.to(..., { opacity: 0 }) for elements only.

    // Scene INTRO entrances (@ start = 0)
    // tl.from('#intro-title', { y: 60, opacity: 0, duration: 0.6, ease: 'expo.out' }, 0.2);
    // tl.from('#intro-date', { y: 40, opacity: 0, duration: 0.5, ease: 'power4.out' }, 0.4);
    // tl.from('.intro-headline', { x: -40, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.12 }, 0.7);

    // ... story 1, 2, 3, outro entrances at their scene start times ...

    window.__timelines['ai-daily'] = tl;
  </script>
</body>
</html>
```

## Scene timing rules

- **Use `timings.json` exact values** for each scene's `data-start` and `data-duration`. Do not use storyboard's `target_duration_sec` — that's a pre-TTS hint, not reality.
- Scene ordering: intro → story-1 → story-2 → story-3 → outro. `data-track-index="1"` for all; same-track same-start is forbidden but our scenes are sequential so fine.
- Total composition duration = `timings.total_duration_sec`.

## Animation rules (from hyperframes skill, restated because they are non-negotiable)

1. Every element must enter via `gsap.from()`. No element appears fully-formed.
2. Offset first entrance of each scene by 0.1–0.3s, never t=0 of the scene.
3. Use at least 3 different eases per scene. Default signature: `expo.out`, `power4.out` (Swiss Pulse).
4. **No exit animations** except on the final scene. Transitions are handled by the next scene entering — the outgoing scene must be fully visible at the boundary.
5. All timelines start `paused: true`. Register: `window.__timelines['ai-daily'] = tl`.
6. No `Math.random()`, `Date.now()`, `repeat: -1`, `setTimeout`/`async` around timeline construction.
7. Don't animate `visibility`, `display`, or call `.play()` on media.

## Transitions between scenes

For v1, use opacity-based crossfades between adjacent scenes. Over a 0.4s window at each scene boundary, the previous scene remains visible (no exit animation) while the next scene's entrances fire. Because scenes are on the same track and track overlap is forbidden, give each scene a 0.4s "pre-roll" inside its `data-duration` where the new scene's content enters while the previous scene's background is still at full opacity. If that feels wrong visually, v2 can introduce the `@hyperframes/shader-transitions` blocks for Cinematic Zoom and SDF Iris.

## Layout rules

- `.scene` uses `width: 100%; height: 100%; padding: 120px 160px; box-sizing: border-box; position: absolute; inset: 0;`
- Content containers inside scenes use flex + gap, **never** `position: absolute; top: Npx`. Absolute is reserved for decoratives.
- Typography follows DESIGN.md sizes. Hero 120px, story-headline 72px, body 36px, label 24px, number-callout 160px.
- Screenshots: crop 1200×400, display with `object-fit: cover; object-position: top;` border-radius 4px, 6px solid var(--accent) outline as per Swiss Pulse skill guidance.
- If `screenshots-manifest.json` flags a pick as `fallback: true`, render that scene without the image — use a text-only layout with the headline at hero-size and the source URL as a footer chip.

## Per-scene content from storyboard

For each scene in `storyboard.json.scenes`:

- Use `scene.beats` as the list of visible elements. Each beat becomes one HTML element with its own entrance tween at `scene.start_sec + beat.at_sec` in the master timeline.
- Beat kinds map to typography roles:
  - `headline` → `.story-headline` / `.hero`
  - `screenshot` → `<img class="screenshot" src="<path from screenshots-manifest>">`
  - `number_callout` → `.number-callout` (160px accent, tabular-nums)
  - `label` → `.label` (24px, uppercase, tracking 1.5px, foreground-secondary)
  - `takeaway` → `.takeaway` (36px, left accent bar, prefixed with "FOR BUILDERS" label)
  - `source_chip` → `.source-chip` (22px, accent background, bottom-right)

## After writing, validate

```bash
cd <run-dir>
npx hyperframes lint
npx hyperframes validate --no-contrast
```

(Lint catches structural problems: missing `data-composition-id`, overlapping tracks, unregistered timelines, `repeat: -1`, etc. Validate with contrast re-run after the composition is known structurally sound.)

If lint fails, read the errors, fix the composition, re-run. Do not submit until `lint` is clean.

## Hard stops

- If you can't satisfy a DESIGN.md constraint (e.g., a beat demands an off-palette color), stop and report to the caller. Don't invent colors.
- If `timings.json` and `storyboard.json` disagree on scene order or count, stop and report.
- Don't include any element not derived from storyboard beats or DESIGN.md chrome. No easter eggs.
