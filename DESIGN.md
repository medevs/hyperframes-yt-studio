# AI Daily — Design Reference

Style: **Swiss Pulse** (Josef Müller-Brockmann)
Mood: Clinical, precise. Built for builders watching tech news at speed.
Format: 1920×1080 landscape, 30fps, MP4 H.264.

## Colors

| Role                  | Hex       | Use                                                   |
| --------------------- | --------- | ----------------------------------------------------- |
| Background primary    | `#0A0A0A` | Scene backgrounds. Never pure black `#000`.           |
| Background secondary  | `#1A1A1A` | Card surfaces, panel fills.                           |
| Foreground primary    | `#F5F5F5` | Headlines, primary text.                              |
| Foreground secondary  | `#A0A0A0` | Labels, captions, meta text.                          |
| Accent (single)       | `#0066FF` | Story numbers, accent lines, emphasis. ONE accent.    |
| Accent alternate      | `#FFB300` | Reserved for warnings / rare emphasis. Not default.   |
| Divider               | `#2A2A2A` | Thin 1px rules between grid cells.                    |

**Never invent new colors.** If contrast fails, shift within the row above, don't add a new color.

## Typography

Family: **Inter** (Bold for headlines, Regular for body, Medium for labels).
Fallback stack: `'Inter', system-ui, sans-serif`.

| Role              | Size   | Weight | Tracking |
| ----------------- | ------ | ------ | -------- |
| Hero headline     | 120px  | 800    | -2px     |
| Story headline    | 72px   | 800    | -1px     |
| Body narration    | 36px   | 400    | 0        |
| Label / meta      | 24px   | 500    | 1.5px    |
| Number callout    | 160px  | 800    | -3px     |
| Source chip       | 22px   | 600    | 1px      |

Numbers use `font-variant-numeric: tabular-nums`.

## Motion

**GSAP signature:** `expo.out` and `power4.out` for entrances. Nothing floats. Elements snap into place fast (0.4–0.7s), then hold.

- Entrance offset first tween at 0.1–0.3s, never t=0.
- Use at least 3 different eases per scene.
- No element may appear fully-formed — every element gets `gsap.from()`.
- No exit animations except on the final scene. Transitions handle exits.
- Scene transitions: **Cinematic Zoom** or **SDF Iris** (precise, geometric). Crossfade is acceptable as a fallback.

## Grid

12-column implicit grid. Content padding: 120px horizontal, 80px vertical. Use CSS flex + gap, never hard-coded absolute positions on content containers (see hyperframes skill "Layout Before Animation").

## What NOT to do

- No generic `#3B82F6`, `#333`, or default bootstrap palettes.
- No Roboto, no Arial, no Times New Roman.
- No rounded-corner cards over 8px. No drop shadows. This is Swiss, not material.
- No emoji anywhere in the composition.
- No clickbait colors (screaming red/yellow). Accent is electric blue. Full stop.
- No pure-black backgrounds (`#000`) — banding on H.264. Use `#0A0A0A`.
- No full-screen linear gradients on dark (banding). Use radial or solid + localized glow.
- No `repeat: -1` on any timeline.
- No exit animations except on final scene.

## Motion

The composition uses 7 motion primitives, defined in `assets/motion-primitives.css` and `assets/motion-primitives.js`. Compose with these — do not invent ad-hoc tweens.

| Primitive | Use case | HTML signature |
| --- | --- | --- |
| `KineticWord` | Pop emphasis on 1-2 key words per scene's narration | `<span class="kw" data-emphasize-at="<sec>">word</span>` |
| `CountUp` | Tick numbers from 0 → target (ALL number_callout beats) | `<span class="count-up" data-target data-at data-duration>0</span>` |
| `ScrollFrame` | Slow top→bottom scroll of the screenshot inside its bordered frame | `<div class="scroll-frame" data-at data-duration data-distance><img></div>` |
| `StatBar` | Animated horizontal bar for comparisons / percentages | `<div class="stat-bar" data-target-pct data-at>...` |
| `CaptionLine` | Burn-in caption for emphasized phrases (≤4 per scene) | `<div class="caption-line" data-at data-end>text</div>` |
| `SceneTransition` | Shader transition between scenes (`cinematic-zoom`, `sdf-iris`) | `<div data-composition-src="compositions/<id>.html" data-start data-duration="0.6" data-track-index="2">` |
| `GridDecorative` | 1px grid background per scene; animated scaleX entrance | `<div class="grid-decorative">...</div>` |

### Per-scene motion budget (lint-enforced)

Every story scene (id `story-*`) must include ≥3 of: `KineticWord`, `CountUp`, `ScrollFrame`, `StatBar`, `CaptionLine`. The lint rule `motion_budget` enforces this. Override per-scene with `data-motion-exempt="<reason>"` (warns, doesn't error). Intro and outro scenes are exempt.

### Animation discipline (carryover from existing rules)

- All entrances use `gsap.from()`. No element appears fully formed.
- 3+ different eases per scene (Swiss Pulse defaults: `expo.out`, `power4.out`, `power3.out`, `back.out(1.7)` for KineticWord).
- No exit animations except on the outro scene.
- Deterministic only: no `Math.random()`, no `Date.now()`, no `repeat: -1`, no `setTimeout`.
