# AI Daily — Visual Richness (Spec B)

**Date:** 2026-04-25
**Status:** Draft for user review
**Scope:** Replace the static-text-and-image scene composition with a Fireship-leaning Swiss Pulse motion-design system. Future videos automatically inherit kinetic typography, count-ups, screenshot scrolling, captions, and shader transitions.

## Why

The 2026-04-24-1 preview showed scenes that read as functional but flat: a headline, a screenshot, a few entrance fades, and a takeaway. No motion graphics, no per-word emphasis, no animated stats, no transitions. For a builder-focused AI daily news video, that pacing loses retention to channels with stronger visual energy (Fireship being the dominant comp). DESIGN.md already establishes the Swiss Pulse skeleton — this spec layers Fireship-grade motion *on top of* that skeleton without abandoning it.

## Decisions (locked)

| Area | Decision |
| --- | --- |
| Visual north star | Fireship-leaning Swiss Pulse (motion energy + clinical typography) |
| Word-level timing | Real word timestamps via `whisper-cpp` — install + wire as pipeline prerequisite |
| Kinetic typography | Selective key-word highlight at narrated moment (not every word) |
| Captions | Burn-in karaoke-style on key phrases only, not full transcript |
| Number callouts | Count-up animation (e.g., 0 → 1.6T) using GSAP tween + `Number().toLocaleString()` ticker |
| Screenshot motion | Continuous slow scroll top-to-bottom over the screenshot's on-screen duration |
| Scene transitions | `cinematic_zoom` between intro→story-1; `sdf_iris` between stories; `crossfade` to outro |
| Decoratives | Animated 1px grid lines (sub-pixel, low opacity), accent rule sweeps, scan-line flicker on stat reveals |
| Per-scene minimum motion budget | New lint rule — every **story** scene (story-1, story-2, story-3) must include ≥3 of these 5 primitives: `CountUp`, `KineticWord`, `ScrollFrame`, `StatBar`, `CaptionLine`. `SceneTransition` is required at every scene boundary. `GridDecorative` is recommended but not counted. Intro and outro scenes are exempt from the budget (different role, shorter duration). |
| Music bed | Out of scope (narration only) |
| Vertical / Shorts | Out of scope |
| Talking head | Out of scope |
| Color tweaks | None — DESIGN.md palette unchanged |
| Typography tweaks | None — DESIGN.md type scale unchanged |

## Risks accepted

- **Whisper-cpp build complexity on Windows.** First install requires CMake + a C++ compiler (~10 min). Mitigated: I install once, document in `docs/setup-whisper.md`, future runs are zero-friction.
- **Kinetic typography without editorial wit.** Fireship's word-pop timing carries comedic punch from a human creator. Our automated narration won't have that. Accepted — visual energy still beats current static layout.
- **Scrolling screenshot of a tall capture may scroll past dead space.** Some pages are 800 px tall and we capture up to 3000 px; the bottom 2000 px could be footer. Mitigated: scroll distance computed from `screenshots-manifest.json` `height` so scroll only covers actual content.
- **Shader transitions add render time.** `hyperframes-registry` shader blocks may extend MP4 render by 30–60 s. Accepted.
- **Lint rule may over-constrain.** "≥4 motion elements per story" might force motion when none is appropriate. Mitigated: rule downgradable to warning per scene via `data-motion-exempt="reason"` attribute.

## Architecture

### New motion primitives (each becomes a documented pattern in `yt-compose` skill)

1. **`KineticWord`** — A span styled as `position: relative; display: inline-block` with a baseline transform of `translateY(0.4em); opacity: 0`. GSAP tween at the word's narration timestamp tweens to `translateY(0); opacity: 1` over 0.18 s with `back.out(1.7)` ease + a scale pop from 0.92 to 1.0. Used inside a sentence to highlight 1–2 key words per phrase.

2. **`CountUp`** — A number element whose `textContent` is GSAP-driven from 0 to target value over 0.8–1.2 s with `expo.out` ease, formatted with locale + suffix (e.g., 1.6T → ticks 0, 0.4T, 0.9T, 1.3T, 1.6T). Implementation: tween a proxy object's `.value`, write `el.textContent = format(value)` in `onUpdate`. Lives in a shared script tag at composition root.

3. **`ScrollFrame`** — A `<div>` clipping a tall screenshot. The screenshot has a CSS `transform: translateY(0)` initially; GSAP tweens to `translateY(-(content_height - frame_height))` over the screenshot's on-screen duration with `none` ease (linear). Distance read from `screenshots-manifest.json` per pick.

4. **`StatBar`** — A horizontal bar (e.g., comparing GPT-5.5 vs Gemini 3.1 Pro on a benchmark). Width tweens from 0% to target with `power3.out` over 0.5 s. Label and value count-up in parallel.

5. **`CaptionLine`** — Bottom-third absolute-positioned line that swaps text on phrase boundaries. Each phrase enters with `y: 20, opacity: 0` → `y: 0, opacity: 1` over 0.2 s, holds for the phrase's narration window, exits with `opacity: 0` over 0.15 s. Phrase boundaries derived from word timestamps using a 350 ms gap-or-comma heuristic.

6. **`SceneTransition`** — Wraps a `data-composition-src` reference to a `hyperframes-registry` shader block. `cinematic_zoom` (intro→story1) and `sdf_iris` (between stories) loaded via `npx hyperframes add @hyperframes/shader-transitions`. Crossfade fallback.

7. **`GridDecorative`** — Full-bleed 1 px grid at 80 px spacing, `var(--divider)` color, `opacity: 0.08`. Animated entrance per scene: `gsap.from('.grid-line', { scaleX: 0, transformOrigin: 'left', duration: 0.6, ease: 'expo.out', stagger: 0.02 })`. Lives behind all content, never animated mid-scene.

### Pipeline changes

1. **Whisper install** — One-time setup. Build whisper-cpp from source on Windows (vcpkg/CMake). Add `pipeline/setup.mjs` step that detects `whisper-cli.exe` on PATH and prints a clear install command if missing. Document in `docs/setup-whisper.md`.

2. **`pipeline/transcribe.mjs`** — Already calls `npx hyperframes transcribe` which uses whisper-cpp. No code change; just unblocked.

3. **`pipeline/compute-timings.mjs`** — Already aligns sections to words. No code change.

4. **`pipeline/lib/extract-keywords.mjs`** — New. Per scene, takes the script + the storyboard beats and returns a list of `{ word, narration_timestamp_sec, emphasis_kind }` where `emphasis_kind` is `kinetic` or `caption`. Heuristic: emphasize numbers, proper nouns, FOR-BUILDERS phrases; cap at 6 emphases per scene. Output added to `timings.json` as `emphases: [...]`.

5. **`yt-compose` skill update** — Major rewrite of the skill prompt. New required sections:
   - "Per-scene motion budget" — list ≥4 of the 6 primitives that must appear in every story scene
   - "Kinetic typography rules" — wrap emphasized words in `<span class="kw" data-emphasize-at="<sec>">`, register a GSAP tween per `.kw` element using its `data-emphasize-at` value
   - "Count-up rule" — every `number-callout` beat with a numeric value must use `CountUp` not static text
   - "Scroll frame rule" — every `screenshot` beat must wrap the `<img>` in a `ScrollFrame` div with overflow-hidden
   - "Captions" — render `CaptionLine` for the phrase boundaries computed from `timings.emphases` of `kind: caption`
   - "Transitions" — emit `SceneTransition` blocks at the boundaries listed in storyboard's `transition_in` field

6. **`pipeline/lint.mjs` extension** — New rule `motion_budget`: parse `index.html`, count occurrences of each of the 5 budget-counted motion primitives (by class name) per scene. Error if a *story* scene (id matches `story-*`) has <3 distinct primitives and no `data-motion-exempt="<reason>"` attribute. Error if any scene boundary lacks a `SceneTransition` block. Intro and outro skipped.

7. **`assets/motion-primitives.css`** — Single shared stylesheet with the base styles for `.kw`, `.count-up`, `.scroll-frame`, `.stat-bar`, `.caption-line`, `.grid-decorative`. `index.html` `<link rel="stylesheet">`s it. Keeps composition HTML smaller.

8. **`assets/motion-primitives.js`** — Helper functions: `formatBigNumber(n)`, `chunkPhrases(words)`, `registerKineticTweens(timeline, root)`. Loaded after GSAP, before the per-composition timeline definition.

9. **`hyperframes-registry` blocks** — Install `@hyperframes/shader-transitions` once via `npx hyperframes add @hyperframes/shader-transitions`. Land under `compositions/transitions/`. Reference per scene boundary.

### Files touched

- `pipeline/setup.mjs` — adds whisper-cpp detection
- `docs/setup-whisper.md` — new
- `pipeline/lib/extract-keywords.mjs` — new
- `pipeline/schemas/timings.js` — adds `emphases: Emphasis[]`
- `pipeline/lint.mjs` — adds `motion_budget` rule
- `assets/motion-primitives.css` — new
- `assets/motion-primitives.js` — new
- `compositions/transitions/cinematic-zoom.html` — installed via `hyperframes add`
- `compositions/transitions/sdf-iris.html` — installed via `hyperframes add`
- `.claude/skills/yt-compose/SKILL.md` — major rewrite per "yt-compose skill update" above
- `DESIGN.md` — new section "Motion primitives" documenting the 6 primitives + when to use each

### Data flow

```
narration.wav
   │
   ▼
transcribe.mjs (whisper-cpp) → transcript.json (word-level)
   │
   ▼
compute-timings.mjs → timings.json (scene boundaries)
   │
   ▼
extract-keywords.mjs → timings.json gains emphases[]
   │
   ▼
yt-compose skill (rewritten):
   ├─ scenes use motion primitives
   ├─ enforce ≥4 per story
   ├─ emphases drive kinetic typography + captions
   ├─ numbers wrapped in CountUp
   ├─ screenshots wrapped in ScrollFrame
   └─ scene boundaries get SceneTransition blocks
   │
   ▼
index.html (richer composition)
   │
   ▼
lint.mjs (new motion_budget rule + existing rules)
   │
   ▼
preview / render → MP4 with Fireship-grade motion
```

## Testing

- **Unit:** `extract-keywords.mjs` against fixture sections — emphasizes numbers / proper nouns / takeaway phrases; respects 6-per-scene cap.
- **Unit:** `formatBigNumber()` against {1500, 1_600_000_000, 1_600_000_000_000, 0.14} → expected strings.
- **Unit:** `chunkPhrases()` against fixture word arrays with comma + 350 ms gap heuristics.
- **Lint:** `motion_budget` rule against fixture compositions — fixture story scene with 4 primitives passes, fixture with 2 fails, fixture with 2 + `data-motion-exempt="b-roll"` warns; intro/outro fixtures with 0 primitives pass (exempt); scene boundary missing `SceneTransition` fails.
- **Visual regression:** Snapshot key frames at t=intro_end, t=stat_reveal, t=takeaway in each story scene; compare against approved baselines after first successful render.
- **Re-run today's run** (2026-04-24-1) — verify the GPT-5.5 number ticks 0→5.5, the 1.6T ticks up, the screenshots scroll, key words pop.

## Out of scope

- Music bed / SFX
- Vertical (9:16) version
- Talking-head presenter
- Live data charts (e.g., real benchmarks pulled at render time)
- Per-story branding variations (every story uses the same template)
- Per-channel A/B variants

## Open questions

None.

## Sequencing relative to Spec A

Spec A (screenshot quality) and Spec B (visual richness) are independent in code. **Spec A should ship first** because:
- Spec B's `ScrollFrame` is meaningless if the captured screenshot is a cookie banner.
- Spec A's `screenshots-manifest.json` schema additions (`width`, `height`) are *consumed by* Spec B's scroll-distance calculation.

Both can be planned concurrently, but implementation order is A → B.
