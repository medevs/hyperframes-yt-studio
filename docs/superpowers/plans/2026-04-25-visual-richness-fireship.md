# Visual Richness (Fireship-leaning Swiss Pulse) Implementation Plan (Spec B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer Fireship-grade motion (kinetic typography, count-ups, scrolling screenshots, captions, scene transitions) on top of the existing Swiss Pulse skeleton, enforced by a new lint rule so future videos can't regress to static-text scenes.

**Architecture:** Six motion primitives (`KineticWord`, `CountUp`, `ScrollFrame`, `StatBar`, `CaptionLine`, `SceneTransition`) plus a `GridDecorative` background, implemented as a shared CSS+JS asset bundle that the `yt-compose` skill is rewritten to use. Word-level timing comes from `whisper-cpp` (one-time install) and feeds a new `extract-keywords` step that emits `emphases[]` into `timings.json`. A `motion_budget` lint rule blocks any story scene that doesn't use ≥3 of the 5 budget-counted primitives.

**Tech Stack:** Node 22, vitest, GSAP 3.14, hyperframes 0.4.x, whisper-cpp (binary), `@hyperframes/shader-transitions` registry block.

**Spec reference:** `docs/superpowers/specs/2026-04-25-visual-richness-fireship-design.md`

**Prerequisite:** Plan A merged. Spec B's `ScrollFrame` reads `width`/`height` from `screenshots-manifest.json` which Plan A introduces.

---

## File Structure

| Action | Path | Responsibility |
| --- | --- | --- |
| Create | `docs/setup-whisper.md` | Windows install instructions for whisper-cpp |
| Modify | `pipeline/setup.mjs` | Detect whisper-cli binary; print install command if missing |
| Create | `pipeline/lib/extract-keywords.mjs` | Pick ≤6 emphasis words per scene from script + transcript |
| Modify | `pipeline/schemas/timings.js` | Add `emphases: Emphasis[]` |
| Create | `pipeline/extract-keywords.mjs` | CLI wrapper (run after compute-timings) |
| Create | `assets/motion-primitives.css` | Base styles for all 7 primitives |
| Create | `assets/motion-primitives.js` | `formatBigNumber`, `chunkPhrases`, `registerKineticTweens`, `registerCountUps`, `registerScrollFrames`, `registerStatBars`, `registerCaptions` |
| Create | `compositions/transitions/cinematic-zoom.html` | Installed via `hyperframes add` |
| Create | `compositions/transitions/sdf-iris.html` | Installed via `hyperframes add` |
| Modify | `.claude/skills/yt-compose/SKILL.md` | Rewrite per Spec B "yt-compose skill update" |
| Modify | `pipeline/lint.mjs` | Add `motion_budget` rule |
| Modify | `DESIGN.md` | New section "Motion primitives" |
| Create | `tests/extract-keywords.test.js` | vitest |
| Create | `tests/motion-primitives.test.js` | vitest for `formatBigNumber`, `chunkPhrases` |
| Modify | `tests/schemas.test.js` | Cases for `emphases` |
| Create | `tests/fixtures/lint-motion-budget/` | Fixture compositions for the new lint rule |

---

## Task 1: Install whisper-cpp on Windows

**Files:**
- Create: `docs/setup-whisper.md`

- [ ] **Step 1: Document the install procedure**

Create `docs/setup-whisper.md`:

```markdown
# whisper-cpp on Windows

The pipeline transcribes narration audio to word-level timestamps via `whisper-cpp` invoked by `npx hyperframes transcribe`. This requires a built `whisper-cli.exe` on PATH.

## Easiest path: prebuilt binary

1. Download a recent prebuilt Windows release from https://github.com/ggml-org/whisper.cpp/releases (look for `whisper-bin-x64.zip` or similar).
2. Extract to `C:\tools\whisper\`.
3. Add `C:\tools\whisper\` to your user PATH (System Properties → Environment Variables).
4. Open a new terminal and run `whisper-cli --help` — should print usage.

## Alternative: build from source (~10 min)

```powershell
git clone https://github.com/ggml-org/whisper.cpp $env:USERPROFILE\src\whisper.cpp
cd $env:USERPROFILE\src\whisper.cpp
cmake -B build
cmake --build build --config Release
```

The binary lands at `build\bin\Release\whisper-cli.exe`. Add that directory to PATH.

## Model download

`hyperframes transcribe` defaults to `small.en`. The first run downloads `ggml-small.en.bin` (~466 MB) into a cache directory. Subsequent runs are instant.

## Verify the install

```powershell
npx hyperframes transcribe --help
node pipeline/setup.mjs
```

`pipeline/setup.mjs` prints `OK whisper-cli detected` if the binary is found.
```

- [ ] **Step 2: Perform the install**

Either download the prebuilt binary or build from source per the doc. Whichever path you take, end with `whisper-cli --help` working in a fresh terminal.

- [ ] **Step 3: Smoke-test the existing pipeline**

Run from project root (assuming `narration.wav` exists in `work/2026-04-24-1/`):
```bash
node pipeline/transcribe.mjs work/2026-04-24-1
```

Expected: `OK transcript.json` after 30-60 seconds. Inspect `work/2026-04-24-1/transcript.json` — should contain a `words` or `segments` array with `start`/`end` timestamps.

- [ ] **Step 4: Commit the doc**

```bash
git add docs/setup-whisper.md
git commit -m "docs: setup-whisper.md for Windows whisper-cpp install"
```

---

## Task 2: Add `pipeline/setup.mjs` whisper detection

**Files:**
- Modify: `pipeline/setup.mjs`

- [ ] **Step 1: Read existing setup.mjs**

Run: `cat pipeline/setup.mjs`
Expected: existing setup script content (may be minimal).

- [ ] **Step 2: Append whisper detection**

Add this block to the end of `pipeline/setup.mjs`:

```javascript
import { spawnSync } from 'node:child_process';

function checkWhisper() {
  const r = spawnSync('whisper-cli', ['--help'], { encoding: 'utf8', shell: true });
  if (r.status === 0 || (r.stdout || '').toLowerCase().includes('whisper')) {
    console.log('OK whisper-cli detected');
    return true;
  }
  console.error('MISSING whisper-cli — see docs/setup-whisper.md for install instructions.');
  console.error('Required for: pipeline/transcribe.mjs (which feeds compute-timings.mjs and extract-keywords.mjs).');
  return false;
}

const whisperOk = checkWhisper();
if (!whisperOk) process.exit(1);
```

(If `setup.mjs` has its own `process.exit` flow, integrate the check before the final exit. Make sure the existing checks still run.)

- [ ] **Step 3: Run setup**

Run: `node pipeline/setup.mjs`
Expected: includes `OK whisper-cli detected` line.

- [ ] **Step 4: Commit**

```bash
git add pipeline/setup.mjs
git commit -m "feat(setup): detect whisper-cli, fail with install pointer if missing"
```

---

## Task 3: Extend `TimingsFileSchema` with `emphases`

**Files:**
- Modify: `pipeline/schemas/timings.js`
- Modify: `tests/schemas.test.js`

- [ ] **Step 1: Read existing schema**

Run: `cat pipeline/schemas/timings.js`
Expected: prints existing TimingsFileSchema definition.

- [ ] **Step 2: Add a failing test**

Append to `tests/schemas.test.js`:

```javascript
import { TimingsFileSchema } from '../pipeline/schemas/timings.js';

describe('TimingsFileSchema emphases', () => {
  const baseScene = { id: 'intro', kind: 'intro', start_sec: 0, duration_sec: 5, word_count: 10 };
  const baseFile = {
    audio_file: 'narration.wav',
    total_duration_sec: 5,
    scenes: [baseScene],
    words: [{ text: 'a', start_sec: 0, end_sec: 0.1 }],
  };

  it('accepts a file with no emphases (back-compat)', () => {
    expect(() => TimingsFileSchema.parse(baseFile)).not.toThrow();
  });

  it('accepts a file with emphases populated', () => {
    const f = {
      ...baseFile,
      emphases: [
        { scene_id: 'intro', word: 'GPT-5.5', start_sec: 1.2, end_sec: 1.6, kind: 'kinetic' },
        { scene_id: 'intro', word: 'today', start_sec: 2.0, end_sec: 2.3, kind: 'caption' },
      ],
    };
    expect(() => TimingsFileSchema.parse(f)).not.toThrow();
  });

  it('rejects unknown emphasis kind', () => {
    const f = {
      ...baseFile,
      emphases: [{ scene_id: 'intro', word: 'x', start_sec: 0, end_sec: 0.1, kind: 'sparkle' }],
    };
    expect(() => TimingsFileSchema.parse(f)).toThrow();
  });
});
```

- [ ] **Step 3: Run tests to confirm failure**

Run: `npx vitest run tests/schemas.test.js -t 'TimingsFileSchema emphases'`
Expected: 2 failures (fields not yet defined or strict-mode rejection).

- [ ] **Step 4: Implement schema change**

Edit `pipeline/schemas/timings.js`. Add (preserving existing exports):

```javascript
export const EmphasisSchema = z.object({
  scene_id: z.string(),
  word: z.string(),
  start_sec: z.number().nonnegative(),
  end_sec: z.number().nonnegative(),
  kind: z.enum(['kinetic', 'caption']),
});
```

And in `TimingsFileSchema`, add the field:

```javascript
  emphases: z.array(EmphasisSchema).optional().default([]),
```

(Place inside the `z.object({...})` block alongside the existing fields.)

- [ ] **Step 5: Run tests to confirm pass**

Run: `npx vitest run tests/schemas.test.js`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add pipeline/schemas/timings.js tests/schemas.test.js
git commit -m "feat(schemas): add Emphasis + emphases[] to TimingsFile

extract-keywords.mjs writes these; yt-compose reads them to drive
kinetic typography and caption lines."
```

---

## Task 4: Implement `extract-keywords.mjs` library

**Files:**
- Create: `pipeline/lib/extract-keywords.mjs`
- Create: `tests/extract-keywords.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/extract-keywords.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { selectEmphases } from '../pipeline/lib/extract-keywords.mjs';

const fakeWords = [
  { text: 'OpenAI', start: 0.0, end: 0.6 },
  { text: 'shipped', start: 0.7, end: 1.1 },
  { text: 'GPT', start: 1.2, end: 1.5 },
  { text: '5.5', start: 1.55, end: 2.0 },
  { text: 'today', start: 2.1, end: 2.5 },
  { text: 'with', start: 2.6, end: 2.8 },
  { text: 'cheaper', start: 2.9, end: 3.4 },
  { text: 'tokens', start: 3.5, end: 4.0 },
];

const sceneIntro = { id: 'intro', kind: 'intro', start_sec: 0, duration_sec: 5 };

describe('selectEmphases', () => {
  it('caps emphases per scene at 6', () => {
    const longWords = Array.from({ length: 100 }, (_, i) => ({
      text: 'WORD' + i, start: i * 0.1, end: i * 0.1 + 0.05,
    }));
    const r = selectEmphases([sceneIntro], longWords);
    const intro = r.filter(e => e.scene_id === 'intro');
    expect(intro.length).toBeLessThanOrEqual(6);
  });

  it('emphasizes numbers (e.g., 5.5)', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    expect(r.find(e => e.word === '5.5')).toBeTruthy();
    expect(r.find(e => e.word === '5.5').kind).toBe('kinetic');
  });

  it('emphasizes proper nouns (e.g., OpenAI, GPT)', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    expect(r.find(e => e.word === 'OpenAI')).toBeTruthy();
  });

  it('does not emphasize stopwords', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    expect(r.find(e => e.word === 'with')).toBeFalsy();
  });

  it('writes correct timing fields from word arrays', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    const five = r.find(e => e.word === '5.5');
    expect(five.start_sec).toBe(1.55);
    expect(five.end_sec).toBe(2.0);
  });

  it('assigns emphases to the correct scene by timestamp', () => {
    const scenes = [
      { id: 'intro', kind: 'intro', start_sec: 0, duration_sec: 2 },
      { id: 'story-1', kind: 'story', start_sec: 2, duration_sec: 3 },
    ];
    const r = selectEmphases(scenes, fakeWords);
    // 'OpenAI' at 0.0–0.6 belongs to intro; 'cheaper' at 2.9–3.4 belongs to story-1
    expect(r.find(e => e.word === 'OpenAI').scene_id).toBe('intro');
    expect(r.find(e => e.word === 'cheaper')?.scene_id).toBe('story-1');
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run tests/extract-keywords.test.js`
Expected: failures (module not found).

- [ ] **Step 3: Implement the helper**

Create `pipeline/lib/extract-keywords.mjs`:

```javascript
const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','of','to','in','on','at','by','for','with','as','is','are','was','were','be','been','being','this','that','these','those','it','its','his','her','their','our','your','my','i','you','he','she','they','we','from','up','down','out','over','under','than','so','too','very','can','will','just','about','into','onto','off','also','no','not','do','does','did','have','has','had','said','says','say','one','two','three','today','tomorrow','yesterday'
]);

function isNumberLike(text) {
  return /^[$€£]?\d[\d.,kmbtKMBT%]*$/i.test(text);
}

function isProperNoun(text) {
  // First letter uppercase + remaining letters mixed case, length >= 3
  // Catches 'OpenAI', 'GPT', 'DeepSeek', 'Mythos'
  return /^[A-Z][A-Za-z0-9.\-]{1,}$/.test(text) && !/^[A-Z]+$/.test(text) || /^[A-Z]{2,}$/.test(text);
}

function score(word) {
  const t = word.text.replace(/[.,;:!?"'()]+$/g, '');
  if (t.length < 2) return 0;
  if (STOPWORDS.has(t.toLowerCase())) return 0;
  if (isNumberLike(t)) return 100;
  if (isProperNoun(t)) return 80;
  if (t.length >= 7) return 30;
  return 0;
}

export function selectEmphases(scenes, words, { perScene = 6 } = {}) {
  const out = [];
  for (const scene of scenes) {
    const sceneWords = words.filter(w => {
      const start = w.start ?? w.start_sec ?? 0;
      return start >= scene.start_sec && start < scene.start_sec + scene.duration_sec;
    });
    const scored = sceneWords
      .map(w => ({ w, s: score(w) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, perScene);
    for (const { w } of scored) {
      const start = w.start ?? w.start_sec ?? 0;
      const end = w.end ?? w.end_sec ?? start + 0.2;
      out.push({
        scene_id: scene.id,
        word: w.text,
        start_sec: start,
        end_sec: end,
        kind: 'kinetic',
      });
    }
    // Add up to 4 caption-kind emphases per scene from the next-best scoring words
    const captionPicks = sceneWords
      .map(w => ({ w, s: score(w) }))
      .filter(x => x.s > 0)
      .sort((a, b) => (a.w.start ?? a.w.start_sec ?? 0) - (b.w.start ?? b.w.start_sec ?? 0))
      .slice(0, 4);
    for (const { w } of captionPicks) {
      const start = w.start ?? w.start_sec ?? 0;
      const end = w.end ?? w.end_sec ?? start + 0.2;
      const isDup = out.some(e => e.scene_id === scene.id && e.word === w.text && e.kind === 'kinetic');
      if (isDup) continue;
      out.push({
        scene_id: scene.id,
        word: w.text,
        start_sec: start,
        end_sec: end,
        kind: 'caption',
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run tests/extract-keywords.test.js`
Expected: all 6 pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/extract-keywords.mjs tests/extract-keywords.test.js
git commit -m "feat(pipeline): extract-keywords selects emphasis words per scene

Heuristic scorer prioritizes numbers > proper nouns > long words; caps
6 kinetic + 4 caption emphases per scene. Drives kinetic typography
and on-screen captions in compositions."
```

---

## Task 5: CLI wrapper for extract-keywords

**Files:**
- Create: `pipeline/extract-keywords.mjs`

- [ ] **Step 1: Write the wrapper**

Create `pipeline/extract-keywords.mjs`:

```javascript
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TimingsFileSchema } from './schemas/timings.js';
import { selectEmphases } from './lib/extract-keywords.mjs';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node extract-keywords.mjs <work-dir>'); process.exit(2); }

const timingsPath = join(workDir, 'timings.json');
const transcriptPath = join(workDir, 'transcript.json');

const timings = JSON.parse(readFileSync(timingsPath, 'utf8'));
const transcript = JSON.parse(readFileSync(transcriptPath, 'utf8'));

const words = (transcript.words ?? transcript.segments?.flatMap(s => s.words) ?? transcript)
  .map(w => ({
    text: w.text ?? w.word ?? '',
    start: w.start ?? w.start_time ?? 0,
    end: w.end ?? w.end_time ?? 0,
  }))
  .filter(w => w.text);

const emphases = selectEmphases(timings.scenes, words);

const out = { ...timings, emphases };
TimingsFileSchema.parse(out);
writeFileSync(timingsPath, JSON.stringify(out, null, 2));

const byScene = emphases.reduce((m, e) => (m[e.scene_id] = (m[e.scene_id] || 0) + 1, m), {});
console.log('OK emphases:', JSON.stringify(byScene));
```

- [ ] **Step 2: Smoke-test the wrapper**

(Requires Plan A's whisper install + a transcript.json.) Run:
```bash
node pipeline/transcribe.mjs work/2026-04-24-1
node pipeline/extract-keywords.mjs work/2026-04-24-1
```

Expected: `OK emphases: {"intro": N, "story-1": N, ...}` and `timings.json` now contains an `emphases` array.

- [ ] **Step 3: Commit**

```bash
git add pipeline/extract-keywords.mjs
git commit -m "feat(pipeline): extract-keywords CLI wrapper, writes timings.emphases"
```

---

## Task 6: Install `@hyperframes/shader-transitions` registry block

**Files:**
- Create: `compositions/transitions/cinematic-zoom.html` (via `hyperframes add`)
- Create: `compositions/transitions/sdf-iris.html` (via `hyperframes add`)

- [ ] **Step 1: Discover the right block IDs**

Run: `npx hyperframes registry search transition` (or `npx hyperframes registry list`)
Expected: list of available transition blocks. Find the cinematic-zoom and sdf-iris entries.

- [ ] **Step 2: Install the blocks**

Run (block IDs may differ — use what step 1 surfaced):
```bash
npx hyperframes add @hyperframes/shader-transitions/cinematic-zoom
npx hyperframes add @hyperframes/shader-transitions/sdf-iris
```

Expected: files created under `compositions/transitions/`. If the install lands them at a different path, that's fine — note the actual paths for Task 9.

- [ ] **Step 3: Verify via lint**

Run: `cd work/2026-04-24-1 && npx hyperframes lint`
Expected: still 0 errors. (The new transition files might emit warnings about missing `data-start` — those are scaffolded files, not errors.)

- [ ] **Step 4: Commit**

```bash
git add compositions/transitions/
git commit -m "deps(hyperframes): install cinematic-zoom and sdf-iris shader transitions"
```

---

## Task 7: Write `assets/motion-primitives.css`

**Files:**
- Create: `assets/motion-primitives.css`

- [ ] **Step 1: Create the stylesheet**

Create `assets/motion-primitives.css`:

```css
:root {
  --bg-primary: #0A0A0A;
  --bg-secondary: #1A1A1A;
  --fg-primary: #F5F5F5;
  --fg-secondary: #A0A0A0;
  --accent: #0066FF;
  --accent-warm: #FFB300;
  --divider: #2A2A2A;
}

/* KineticWord — entry baseline (GSAP tweens FROM this) */
.kw {
  display: inline-block;
  position: relative;
  color: var(--accent);
  font-weight: 800;
  /* Underline accent that draws in with the word */
  background-image: linear-gradient(var(--accent), var(--accent));
  background-position: 0 100%;
  background-repeat: no-repeat;
  background-size: 0% 4px;
  transition: none; /* GSAP handles all motion */
}

/* CountUp — visually identical to number-callout, JS drives textContent */
.count-up {
  font-variant-numeric: tabular-nums;
  display: inline-block;
}

/* ScrollFrame */
.scroll-frame {
  position: relative;
  width: 1200px;
  height: 540px;
  overflow: hidden;
  border-radius: 4px;
  outline: 6px solid var(--accent);
  outline-offset: 0;
  background: var(--bg-secondary);
}
.scroll-frame > img {
  display: block;
  width: 1200px;
  /* height set per-frame from manifest height */
  will-change: transform;
}

/* StatBar */
.stat-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  font-variant-numeric: tabular-nums;
}
.stat-bar .bar-track {
  flex: 1;
  height: 18px;
  background: var(--divider);
  position: relative;
  overflow: hidden;
}
.stat-bar .bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0%;
  background: var(--accent);
  will-change: width;
}
.stat-bar .bar-label {
  font-size: 24px;
  font-weight: 500;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--fg-secondary);
  min-width: 240px;
}
.stat-bar .bar-value {
  font-size: 36px;
  font-weight: 800;
  color: var(--fg-primary);
  min-width: 120px;
  text-align: right;
}

/* CaptionLine */
.caption-line {
  position: absolute;
  left: 120px;
  right: 120px;
  bottom: 80px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 32px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--fg-primary);
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);
  text-align: center;
  pointer-events: none;
}

/* GridDecorative */
.grid-decorative {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.08;
}
.grid-decorative .grid-h, .grid-decorative .grid-v {
  position: absolute;
  background: var(--divider);
}
.grid-decorative .grid-h { left: 0; right: 0; height: 1px; }
.grid-decorative .grid-v { top: 0; bottom: 0; width: 1px; }
```

- [ ] **Step 2: Commit**

```bash
git add assets/motion-primitives.css
git commit -m "feat(assets): motion-primitives.css — base styles for 7 primitives"
```

---

## Task 8: Write `assets/motion-primitives.js`

**Files:**
- Create: `assets/motion-primitives.js`
- Create: `tests/motion-primitives.test.js`

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `tests/motion-primitives.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { formatBigNumber, chunkPhrases } from '../assets/motion-primitives.js';

describe('formatBigNumber', () => {
  it('formats integers with no suffix below 1k', () => {
    expect(formatBigNumber(150)).toBe('150');
  });
  it('uses K suffix for thousands', () => {
    expect(formatBigNumber(1500)).toBe('1.5K');
  });
  it('uses M for millions', () => {
    expect(formatBigNumber(1_600_000)).toBe('1.6M');
  });
  it('uses B for billions', () => {
    expect(formatBigNumber(1_600_000_000)).toBe('1.6B');
  });
  it('uses T for trillions', () => {
    expect(formatBigNumber(1_600_000_000_000)).toBe('1.6T');
  });
  it('preserves decimal values < 1', () => {
    expect(formatBigNumber(0.14)).toBe('0.14');
  });
  it('preserves decimal model versions like 5.5', () => {
    expect(formatBigNumber(5.5)).toBe('5.5');
  });
});

describe('chunkPhrases', () => {
  it('splits at long pauses (>350ms gap)', () => {
    const words = [
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'world.', start: 0.55, end: 1.0 },
      { text: 'Next', start: 1.5, end: 2.0 }, // 0.5s gap → split
    ];
    const phrases = chunkPhrases(words);
    expect(phrases.length).toBe(2);
    expect(phrases[0].text).toBe('Hello world.');
    expect(phrases[1].text).toBe('Next');
  });

  it('splits at sentence-ending punctuation', () => {
    const words = [
      { text: 'One.', start: 0, end: 0.4 },
      { text: 'Two.', start: 0.45, end: 0.85 },
      { text: 'Three.', start: 0.9, end: 1.3 },
    ];
    const phrases = chunkPhrases(words);
    expect(phrases.length).toBe(3);
  });

  it('preserves start/end timestamps from constituent words', () => {
    const words = [
      { text: 'One', start: 0, end: 0.3 },
      { text: 'two', start: 0.35, end: 0.7 },
    ];
    const phrases = chunkPhrases(words);
    expect(phrases[0].start_sec).toBe(0);
    expect(phrases[0].end_sec).toBe(0.7);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run tests/motion-primitives.test.js`
Expected: failures (module not found).

- [ ] **Step 3: Implement the JS**

Create `assets/motion-primitives.js`:

```javascript
// =========================================================================
// Pure helpers (also exported for vitest)
// =========================================================================

export function formatBigNumber(n) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '')  + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '')  + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '')  + 'K';
  if (Number.isInteger(n)) return String(n);
  // Preserve up to 2 fractional digits, strip trailing zeros
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function chunkPhrases(words, { gapMs = 350 } = {}) {
  const phrases = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const next = words[i + 1];
    const endsSentence = /[.!?]$/.test(w.text);
    const gap = next ? (next.start - w.end) : 0;
    if (endsSentence || gap * 1000 > gapMs || !next) {
      phrases.push({
        text: cur.map(x => x.text).join(' '),
        start_sec: cur[0].start,
        end_sec: cur[cur.length - 1].end,
        words: cur,
      });
      cur = [];
    }
  }
  return phrases;
}

// =========================================================================
// Browser-side runtime — registers tweens on a master GSAP timeline
// =========================================================================

if (typeof window !== 'undefined') {

  // KineticWord: each `.kw[data-emphasize-at]` gets a pop tween
  window.registerKineticTweens = function(tl, root = document) {
    const kws = root.querySelectorAll('.kw[data-emphasize-at]');
    kws.forEach(el => {
      const at = parseFloat(el.dataset.emphasizeAt);
      tl.from(el, { y: '0.4em', opacity: 0, scale: 0.92, duration: 0.18, ease: 'back.out(1.7)' }, at);
      tl.to(el, { backgroundSize: '100% 4px', duration: 0.4, ease: 'power3.out' }, at + 0.05);
    });
  };

  // CountUp: each `.count-up[data-target][data-at][data-duration]` ticks 0 → target
  window.registerCountUps = function(tl, root = document) {
    const els = root.querySelectorAll('.count-up[data-target]');
    els.forEach(el => {
      const target = parseFloat(el.dataset.target);
      const at = parseFloat(el.dataset.at);
      const dur = parseFloat(el.dataset.duration || '1.0');
      const proxy = { v: 0 };
      tl.to(proxy, {
        v: target,
        duration: dur,
        ease: 'expo.out',
        onUpdate: () => { el.textContent = window.formatBigNumber(proxy.v); },
      }, at);
    });
  };

  // ScrollFrame: each `.scroll-frame` scrolls its child img top→bottom over a duration
  // attrs: data-at (when to start), data-duration (how long to scroll), data-distance (px to translate)
  window.registerScrollFrames = function(tl, root = document) {
    const frames = root.querySelectorAll('.scroll-frame[data-distance]');
    frames.forEach(frame => {
      const img = frame.querySelector('img');
      if (!img) return;
      const at = parseFloat(frame.dataset.at);
      const dur = parseFloat(frame.dataset.duration);
      const dist = parseFloat(frame.dataset.distance); // negative or positive
      tl.fromTo(img, { y: 0 }, { y: -Math.abs(dist), duration: dur, ease: 'none' }, at);
    });
  };

  // StatBar: each `.stat-bar[data-target-pct][data-at]` fills width 0 → target
  window.registerStatBars = function(tl, root = document) {
    const bars = root.querySelectorAll('.stat-bar[data-target-pct]');
    bars.forEach(bar => {
      const fill = bar.querySelector('.bar-fill');
      const at = parseFloat(bar.dataset.at);
      const pct = parseFloat(bar.dataset.targetPct);
      tl.fromTo(fill, { width: '0%' }, { width: pct + '%', duration: 0.6, ease: 'power3.out' }, at);
    });
  };

  // CaptionLine: each `.caption-line[data-at][data-end]` shows then hides
  window.registerCaptions = function(tl, root = document) {
    const caps = root.querySelectorAll('.caption-line[data-at]');
    caps.forEach(cap => {
      const at = parseFloat(cap.dataset.at);
      const end = parseFloat(cap.dataset.end);
      tl.fromTo(cap, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: 'power3.out' }, at);
      tl.to(cap, { opacity: 0, duration: 0.15, ease: 'power2.in' }, end - 0.15);
    });
  };

  window.formatBigNumber = formatBigNumber;
  window.chunkPhrases = chunkPhrases;
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run tests/motion-primitives.test.js`
Expected: all 10 pass.

- [ ] **Step 5: Commit**

```bash
git add assets/motion-primitives.js tests/motion-primitives.test.js
git commit -m "feat(assets): motion-primitives.js — kinetic, count-up, scroll, statbar, caption registrars"
```

---

## Task 9: Rewrite `yt-compose` skill prompt

**Files:**
- Modify: `.claude/skills/yt-compose/SKILL.md`

- [ ] **Step 1: Read the current skill file**

Run: `cat .claude/skills/yt-compose/SKILL.md`
Expected: existing skill content (already loaded earlier in this conversation, but re-read for accuracy).

- [ ] **Step 2: Replace the skill body with the v2 contract**

Edit `.claude/skills/yt-compose/SKILL.md`. Keep the YAML frontmatter intact at the top. Replace the body with content covering these required sections (write them out as full prose, not as TODO placeholders):

```markdown
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

- Link both motion-primitives assets in `<head>`:
  ```html
  <link rel="stylesheet" href="../../assets/motion-primitives.css">
  ```
  (Adjust the relative path so it resolves from the run-dir to project-root `assets/`.)
- Load GSAP, then `motion-primitives.js`, then your per-composition timeline script.
- After defining the master timeline, call all 5 registrars:
  ```js
  registerKineticTweens(tl);
  registerCountUps(tl);
  registerScrollFrames(tl);
  registerStatBars(tl);
  registerCaptions(tl);
  ```
- Register the timeline on `window.__timelines['ai-daily']`.

## Per-scene motion budget (enforced by lint)

Every **story** scene (id `story-*`) must include at least 3 of these 5 budget-counted primitives:

| Primitive | Class signature in HTML |
| --- | --- |
| KineticWord | `<span class="kw" data-emphasize-at="<sec>">` |
| CountUp | `<span class="count-up" data-target data-at data-duration>` |
| ScrollFrame | `<div class="scroll-frame" data-at data-duration data-distance>` |
| StatBar | `<div class="stat-bar" data-target-pct data-at>` |
| CaptionLine | `<div class="caption-line" data-at data-end>` |

In addition, every scene boundary requires a `SceneTransition` block (see "Transitions" below). Intro and outro scenes are exempt from the 3-primitive budget but still need transitions to/from neighboring scenes.

## Kinetic typography rules

Read `timings.emphases[]`. For each emphasis with `kind: 'kinetic'`, find the corresponding word in the on-screen text and wrap it in `<span class="kw" data-emphasize-at="<emphasis.start_sec>">word</span>`. The registrar tweens it in at that exact moment. Limit to 1-2 kinetic words per scene's narration paragraph (don't make every word jumpy).

## Count-up rule

Every storyboard `number_callout` beat with a numeric value MUST be rendered as `<span class="count-up" data-target="VALUE" data-at="SCENE_START + BEAT_AT_SEC" data-duration="1.0">0</span>` — initial textContent `0` is overwritten by the registrar. For values like `1.6T`, set `data-target="1600000000000"` and let `formatBigNumber` produce the display string. For decimal versions like `5.5`, set `data-target="5.5"`.

## Scroll-frame rule

Every storyboard `screenshot` beat MUST wrap the `<img>` in a `.scroll-frame` div with `data-at`, `data-duration`, and `data-distance`. Compute `data-distance` as `screenshots-manifest entry.height - 540` (the scroll-frame's visible height; clamp to 0 minimum). `data-duration` is the screenshot's on-screen duration in seconds — typically the entire scene minus the intro beats. The img gets `height: <manifest.height>px`.

## Captions

Read `timings.emphases[]` filter `kind: 'caption'`. For each, emit `<div class="caption-line" data-at="<start>" data-end="<end>">word</div>` near the bottom of the relevant scene container. Limit to ≤4 caption emphases per scene (the extractor caps this).

## Transitions

For every scene boundary (storyboard's `transition_in` field), embed the corresponding shader transition block via `<div data-composition-src="compositions/transitions/cinematic-zoom.html" data-start="<boundary>" data-duration="0.6" data-track-index="2"></div>`. Track-index 2 sits above scene track 1 and audio track 0. Use `cinematic-zoom` for intro→story-1 and `sdf-iris` for between stories. Outro uses crossfade (no shader block) — just rely on the outro scene's entrance + the previous scene's exit-fade-allowed (outro is the only scene allowed to have exit animations per DESIGN.md).

## GridDecorative

Each scene MAY include a `<div class="grid-decorative">` containing 1px horizontal/vertical lines positioned at 80px intervals. Animate entrance with `gsap.from('.grid-h, .grid-v', { scaleX: 0, transformOrigin: 'left', duration: 0.6, ease: 'expo.out', stagger: 0.02 })` at scene start. Behind all content (`z-index: 0`).

## Lint contract

After writing, run from the run-dir:

```bash
node ../../pipeline/lint.mjs .
```

Must report 0 errors. Both the existing hyperframes lint AND the new `motion_budget` rule (Task 10) must pass.

## Hard stops

Same as v1 (DESIGN.md violations, schema mismatches, no easter eggs). Plus: if a story scene cannot reach 3 primitives because the storyboard beats are too sparse, emit `data-motion-exempt="<reason>"` on the scene element and stop and report — do not fabricate primitives.
```

- [ ] **Step 3: Smoke-check the file is well-formed**

Run: `head -5 .claude/skills/yt-compose/SKILL.md && wc -l .claude/skills/yt-compose/SKILL.md`
Expected: frontmatter intact, line count plausible (~150-200).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/yt-compose/SKILL.md
git commit -m "feat(yt-compose): rewrite skill to v2 with motion-primitives contract

- Requires 5 motion-primitive registrars at composition root
- Story scenes must use >=3 of 5 budget primitives
- Kinetic words from timings.emphases (kind=kinetic)
- Captions from timings.emphases (kind=caption)
- Count-ups for every numeric number_callout beat
- Scroll-frames for every screenshot beat
- Scene transitions via shader-transitions registry blocks"
```

---

## Task 10: Add `motion_budget` lint rule

**Files:**
- Modify: `pipeline/lint.mjs`
- Create: `tests/lint-motion-budget.test.js`
- Create: `tests/fixtures/lint-motion-budget/passing.html`
- Create: `tests/fixtures/lint-motion-budget/failing.html`
- Create: `tests/fixtures/lint-motion-budget/exempt.html`

- [ ] **Step 1: Create test fixtures**

Create `tests/fixtures/lint-motion-budget/passing.html` (4 primitives in a story scene):

```html
<!doctype html><html><body>
<div data-composition-id="x" data-width="1920" data-height="1080" data-start="0" data-duration="60">
  <div class="scene clip" id="story-1" data-start="0" data-duration="60" data-track-index="1">
    <span class="kw" data-emphasize-at="1">word</span>
    <span class="count-up" data-target="100" data-at="2" data-duration="1">0</span>
    <div class="scroll-frame" data-at="3" data-duration="40" data-distance="1000"><img></div>
    <div class="stat-bar" data-target-pct="80" data-at="20"><div class="bar-fill"></div></div>
  </div>
</div>
</body></html>
```

Create `tests/fixtures/lint-motion-budget/failing.html` (only 2 primitives in a story scene):

```html
<!doctype html><html><body>
<div data-composition-id="x" data-width="1920" data-height="1080" data-start="0" data-duration="60">
  <div class="scene clip" id="story-1" data-start="0" data-duration="60" data-track-index="1">
    <span class="kw" data-emphasize-at="1">word</span>
    <span class="count-up" data-target="100" data-at="2" data-duration="1">0</span>
  </div>
</div>
</body></html>
```

Create `tests/fixtures/lint-motion-budget/exempt.html` (only 1 primitive but with `data-motion-exempt`):

```html
<!doctype html><html><body>
<div data-composition-id="x" data-width="1920" data-height="1080" data-start="0" data-duration="60">
  <div class="scene clip" id="story-1" data-start="0" data-duration="60" data-track-index="1" data-motion-exempt="b-roll-pacing">
    <span class="kw" data-emphasize-at="1">word</span>
  </div>
</div>
</body></html>
```

- [ ] **Step 2: Write failing tests**

Create `tests/lint-motion-budget.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMotionBudget } from '../pipeline/lib/motion-budget.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/lint-motion-budget', name), 'utf8');

describe('checkMotionBudget', () => {
  it('passes a story scene with 4 primitives', () => {
    const r = checkMotionBudget(fx('passing.html'));
    expect(r.errors).toEqual([]);
  });

  it('fails a story scene with only 2 primitives', () => {
    const r = checkMotionBudget(fx('failing.html'));
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/story-1.*<3 primitives/);
  });

  it('warns (does not error) when data-motion-exempt is set', () => {
    const r = checkMotionBudget(fx('exempt.html'));
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('skips intro and outro scenes', () => {
    const html = `<!doctype html><html><body>
      <div data-composition-id="x" data-width="1920" data-height="1080">
        <div class="scene clip" id="intro" data-start="0" data-duration="5" data-track-index="1"></div>
        <div class="scene clip" id="outro" data-start="60" data-duration="5" data-track-index="1"></div>
      </div>
    </body></html>`;
    const r = checkMotionBudget(html);
    expect(r.errors).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm failure**

Run: `npx vitest run tests/lint-motion-budget.test.js`
Expected: 4 failures (module not found).

- [ ] **Step 4: Implement the helper**

Create `pipeline/lib/motion-budget.mjs`:

```javascript
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
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `npx vitest run tests/lint-motion-budget.test.js`
Expected: 4 pass.

- [ ] **Step 6: Wire the rule into `pipeline/lint.mjs`**

Edit `pipeline/lint.mjs` — replace the file with (incorporating Plan A's screenshot_quality already added):

```javascript
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScreenshot, isAcceptable } from './lib/screenshot-quality.mjs';
import { checkMotionBudget } from './lib/motion-budget.mjs';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node lint.mjs <work-dir>'); process.exit(2); }

const lint = spawnSync('npx', ['hyperframes', 'lint'], {
  cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'],
});
if (lint.status !== 0) { console.error('hyperframes lint failed'); process.exit(1); }

const validate = spawnSync('npx', ['hyperframes', 'validate'], {
  cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'],
});
if (validate.status !== 0) { console.error('hyperframes validate failed'); process.exit(1); }

let bad = 0;

const manifestPath = join(workDir, 'screenshots-manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const e of manifest.entries) {
    if (!e.path) continue;
    const buf = readFileSync(join(workDir, e.path));
    const a = await analyzeScreenshot(buf);
    if (!isAcceptable(a) && e.source_kind !== 'headline_card') {
      console.error(`screenshot_quality: ${e.item_id} (${e.source_kind}) flags=${a.flags.join(',')}`);
      bad++;
    }
  }
}

const indexPath = join(workDir, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  const mb = checkMotionBudget(html);
  for (const e of mb.errors) {
    console.error(`motion_budget: ${e}`);
    bad++;
  }
  for (const w of mb.warnings) {
    console.warn(`motion_budget [warn]: ${w}`);
  }
}

if (bad > 0) {
  console.error(`${bad} lint error(s) — fix before render`);
  process.exit(1);
}

console.log('OK lint + validate + screenshot_quality + motion_budget clean');
```

- [ ] **Step 7: Smoke-test against today's run**

Run: `node pipeline/lint.mjs work/2026-04-24-1`
Expected: motion_budget errors (today's index.html doesn't use the new primitives yet — that's by design and gets fixed in Task 11).

- [ ] **Step 8: Commit**

```bash
git add pipeline/lib/motion-budget.mjs pipeline/lint.mjs tests/lint-motion-budget.test.js tests/fixtures/lint-motion-budget/
git commit -m "feat(lint): motion_budget rule — story scenes need >=3 of 5 primitives

Errors when a story-* scene uses fewer than 3 of: KineticWord, CountUp,
ScrollFrame, StatBar, CaptionLine. Warns instead when scene has
data-motion-exempt set. Intro and outro exempt by default."
```

---

## Task 11: Add Motion section to `DESIGN.md`

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Append a Motion section**

Append to `DESIGN.md`:

```markdown
## Motion

The composition uses 7 motion primitives, defined in `assets/motion-primitives.css` and `assets/motion-primitives.js`. Compose with these — do not invent ad-hoc tweens.

| Primitive | Use case | HTML signature |
| --- | --- | --- |
| `KineticWord` | Pop emphasis on 1-2 key words per scene's narration | `<span class="kw" data-emphasize-at="<sec>">word</span>` |
| `CountUp` | Tick numbers from 0 → target (ALL number_callout beats) | `<span class="count-up" data-target data-at data-duration>0</span>` |
| `ScrollFrame` | Slow top→bottom scroll of the screenshot inside its bordered frame | `<div class="scroll-frame" data-at data-duration data-distance><img></div>` |
| `StatBar` | Animated horizontal bar for comparisons / percentages | `<div class="stat-bar" data-target-pct data-at>...` |
| `CaptionLine` | Burn-in caption for emphasized phrases (≤4 per scene) | `<div class="caption-line" data-at data-end>text</div>` |
| `SceneTransition` | Shader transition between scenes (`cinematic_zoom`, `sdf_iris`) | `<div data-composition-src="compositions/transitions/<id>.html" data-start data-duration="0.6" data-track-index="2">` |
| `GridDecorative` | 1px grid background per scene; animated scaleX entrance | `<div class="grid-decorative">...</div>` |

### Per-scene motion budget (lint-enforced)

Every story scene (id `story-*`) must include ≥3 of: `KineticWord`, `CountUp`, `ScrollFrame`, `StatBar`, `CaptionLine`. The lint rule `motion_budget` enforces this. Override per-scene with `data-motion-exempt="<reason>"` (warns, doesn't error). Intro and outro scenes are exempt.

### Animation discipline (carryover from existing rules)

- All entrances use `gsap.from()`. No element appears fully formed.
- 3+ different eases per scene (Swiss Pulse defaults: `expo.out`, `power4.out`, `power3.out`, `back.out(1.7)` for KineticWord).
- No exit animations except on the outro scene.
- Deterministic only: no `Math.random()`, no `Date.now()`, no `repeat: -1`, no `setTimeout`.
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): add Motion section documenting the 7 primitives + budget"
```

---

## Task 12: Re-render today's video as integration test

**Files:** none (validation)

- [ ] **Step 1: Re-run the pipeline from compose forward**

Run from project root:
```bash
node pipeline/transcribe.mjs work/2026-04-24-1
node pipeline/compute-timings.mjs work/2026-04-24-1
node pipeline/extract-keywords.mjs work/2026-04-24-1
```

Expected: each prints `OK ...`. `work/2026-04-24-1/timings.json` now has real word-level timings + `emphases[]`.

- [ ] **Step 2: Re-compose via the v2 yt-compose skill**

In Claude Code: invoke `/yt-compose work/2026-04-24-1` (or use the skill manually). The new index.html should include `.scroll-frame`, `.kw`, `.count-up`, `.caption-line`, transition `data-composition-src` blocks.

- [ ] **Step 3: Lint**

Run: `node pipeline/lint.mjs work/2026-04-24-1`
Expected: `OK lint + validate + screenshot_quality + motion_budget clean`. If `motion_budget` errors, the compose step missed a primitive; iterate on the skill output.

- [ ] **Step 4: Visual check via studio**

Run: `cd work/2026-04-24-1 && npx hyperframes preview`
Open http://localhost:3002. Scrub the timeline:
- Numbers should tick up (0 → 5.5, 0 → 1.6T, 0 → 1M)
- Screenshots should slowly scroll top→bottom
- Key words should pop with the kinetic underline
- Captions should appear on key phrases
- Scene boundaries should have visible shader transitions

- [ ] **Step 5: Render the MP4**

Run: `node pipeline/render.mjs work/2026-04-24-1`
Expected: `renders/video.mp4` is produced after a few minutes. Open it — should match what you saw in the studio.

- [ ] **Step 6: No commit needed** (validation only)

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Whisper-cpp install + setup detection — Task 1, 2
- ✅ Word-level timing via whisper — Task 1 (uses existing transcribe.mjs)
- ✅ Selective kinetic typography — Task 4 (`selectEmphases`), Task 8 (`registerKineticTweens`)
- ✅ Burn-in karaoke captions on key phrases — Task 4 (`kind: caption`), Task 8 (`registerCaptions`)
- ✅ Count-up animations — Task 8, Task 9 (rule)
- ✅ Screenshot scroll top-to-bottom — Task 7 (CSS), Task 8 (registrar), Task 9 (rule), depends on Plan A's manifest height
- ✅ Scene transitions cinematic_zoom + sdf_iris — Task 6 (install), Task 9 (rule)
- ✅ GridDecorative — Task 7 (CSS), Task 9 (mention)
- ✅ Motion budget ≥3 of 5 — Task 10
- ✅ DESIGN.md update — Task 11
- ✅ Re-run today's video — Task 12

**Type consistency:** `EmphasisSchema` = `{ scene_id, word, start_sec, end_sec, kind: 'kinetic'|'caption' }`. Consumed in Task 9's skill prompt as `timings.emphases[].kind === 'kinetic'` / `'caption'`. `selectEmphases(scenes, words)` returns `Emphasis[]` matching the schema. `formatBigNumber(n: number) → string`, used by `registerCountUps` `onUpdate`. `chunkPhrases(words[], { gapMs })` returns `Phrase[]` (`text, start_sec, end_sec, words[]`). `checkMotionBudget(html: string)` returns `{ errors: string[], warnings: string[] }` consumed in Task 10's `lint.mjs` rewrite.

**No placeholders:** All steps contain code or runnable commands. Skill prompt rewrite (Task 9) describes the contract in full prose, not "TBD per primitive."

---

## Execution Notes

This plan depends on Plan A having merged (consumes `screenshots-manifest.json` `width`/`height` fields). Implement after Plan A.

Recommended worktree: `git worktree add ../yt-visual-richness master` and execute there.

Estimated wall-clock: 4-6 hours of focused work (whisper install can be done in parallel with early tasks).
