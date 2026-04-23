# AI Daily — YouTube News Automation v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before Phase 5, Claude MUST read the `hyperframes`, `hyperframes-cli`, and `gsap` skills under `.agents/skills/`.

**Goal:** Claude Code–driven pipeline that produces one publishable 3–5 minute AI news video end-to-end (research → script → storyboard → voiceover → composition → MP4), manually triggered, with two human approval gates and an automated fact-check gate. Built on Hyperframes as the video engine.

**Why v2:** v1 reinvented TTS, render, scaffolding, and thumbnails that Hyperframes already provides. v2 delegates those to Hyperframes and keeps custom code only where it adds editorial value: fetching, story ranking, scripting with verbatim-quote claims verification, and metadata generation.

**Architecture:**
- **Hyperframes** handles scaffolding, TTS (Kokoro-82M, voice `af_nova`), transcription (word-level timestamps), composition authoring model (HTML + GSAP timelines + `data-*` attributes), lint/validate gates, MP4 render, and still-image snapshots.
- **Claude Code skills** under `.claude/skills/` handle LLM-heavy stages: `yt-research` (pick 3 stories), `yt-script` (write script + claims + storyboard), `yt-compose` (author the Hyperframes composition per-episode), `yt-metadata` (YouTube metadata).
- **Plain Node scripts** under `pipeline/` handle deterministic stages: `fetch-sources`, `verify-claims`, `compute-timings`, `capture-screenshots`, `build-run-dir`.
- **Slash commands** under `.claude/commands/` are thin orchestrators.
- **Visual identity:** one checked-in `DESIGN.md` ("Swiss Pulse") governs palette and motion for every episode — no per-episode brand drift.
- Per-run artifacts live in `work/<YYYY-MM-DD>-<run>/`, with each run a self-contained Hyperframes project ready for `npx hyperframes render`.

**Related docs:** Spec at `docs/superpowers/specs/2026-04-23-yt-news-automation-design.md` — read sections you're implementing. The v1 plan at `docs/superpowers/plans/2026-04-23-yt-news-automation.md` is superseded by this file; keep it for historical reference only.

**Hyperframes skills available** (read on demand during Phase 5): `.agents/skills/hyperframes/`, `.agents/skills/hyperframes-cli/`, `.agents/skills/gsap/`, `.agents/skills/website-to-hyperframes/`, `.agents/skills/hyperframes-registry/`.

---

## Phase structure (at a glance)

- **Phase 0** — Bootstrap: `hyperframes init`, root deps, DESIGN.md, config, doctor preflight
- **Phase 1** — Shared lib with unit tests (normalize-text, run-id, zod schemas)
- **Phase 2** — Fetch stage (RSS, HN, company blogs, article extraction, dedup)
- **Phase 3** — Research + script + storyboard skills + claims verification
- **Phase 4** — Voiceover via Hyperframes TTS + transcribe + section timings
- **Phase 5** — Screenshots, composition authoring, lint, validate, render, thumbnail
- **Phase 6** — Metadata skill, slash commands, end-to-end smoke test

Each phase ends with a testable milestone. Don't start Phase N+1 until Phase N's milestone passes.

---

## File structure (target end-state)

```
studio/
├── .claude/
│   ├── skills/
│   │   ├── yt-research/SKILL.md
│   │   ├── yt-script/SKILL.md
│   │   ├── yt-compose/SKILL.md
│   │   └── yt-metadata/SKILL.md
│   └── commands/
│       ├── yt-daily.md
│       ├── yt-fetch.md
│       ├── yt-research.md
│       ├── yt-script.md
│       ├── yt-render.md
│       ├── yt-preview.md
│       └── yt-approve.md
├── .agents/skills/           # already installed — hyperframes, hyperframes-cli, gsap, etc.
├── pipeline/
│   ├── setup.mjs
│   ├── fetch-sources.mjs
│   ├── fetch-article-text.mjs
│   ├── capture-screenshots.mjs
│   ├── verify-claims.mjs
│   ├── verify-claims.js              # pure logic
│   ├── compute-timings.mjs
│   ├── compute-timings.js            # pure logic
│   ├── build-run-dir.mjs
│   ├── schemas/
│   │   ├── items.js
│   │   ├── picks.js
│   │   ├── claims.js
│   │   ├── storyboard.js
│   │   ├── timings.js
│   │   ├── screenshots-manifest.js
│   │   └── config.js
│   └── lib/
│       ├── sources.js
│       ├── dedup.js
│       ├── run-id.js
│       └── normalize-text.js
├── tests/
│   ├── normalize-text.test.js
│   ├── run-id.test.js
│   ├── dedup.test.js
│   ├── verify-claims.test.js
│   ├── compute-timings.test.js
│   ├── schemas.test.js
│   └── fixtures/
├── DESIGN.md                 # Swiss Pulse brand reference — committed
├── hyperframes.json          # from hyperframes init — committed
├── assets/                   # shared brand assets (logo, fonts if any) — committed
├── compositions/             # reusable blocks — committed (may stay empty in v1)
├── work/                     # gitignored: per-run Hyperframes projects
├── ready-to-upload/          # gitignored: approved runs
├── archive/                  # gitignored
├── config.json
├── package.json
└── .gitignore
```

Each `work/<date>-<run>/` is a self-contained Hyperframes project at render time:

```
work/2026-04-23-1/
├── index.html               # root composition (written per-episode by yt-compose)
├── hyperframes.json         # copied from root
├── DESIGN.md                # copied from root (for lint/validate reference)
├── narration.wav            # hyperframes tts output
├── transcript.json          # hyperframes transcribe output
├── screenshots/             # article screenshots
├── assets/                  # symlink or copy of root assets/
├── renders/                 # hyperframes render output — video.mp4 lives here
├── snapshots/               # hyperframes snapshot output — thumbnail.png
├── items.json
├── picks.json
├── script.md
├── storyboard.md
├── claims.json
├── claims-verified.json
├── timings.json
├── screenshots-manifest.json
├── metadata.txt
└── logs/
```

---

## Phase 0 — Bootstrap

### Task 0.1: Initialize git + gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Run git init and commit spec + v1/v2 plans**

```bash
git init
git add docs/
git commit -m "chore: initial specs and plans"
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
work/
ready-to-upload/
archive/
renders/
snapshots/
*.log
.env
.env.local
.last-run
.hyperframes/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore"
```

---

### Task 0.2: `hyperframes init` at repo root

**Files:**
- Created by `hyperframes init`: `hyperframes.json`, `index.html`, `compositions/`, `assets/`, possibly `package.json` (merge with ours below)

- [ ] **Step 1: Run init**

```bash
npx hyperframes init . --example swiss-grid --non-interactive
```

If `hyperframes init` refuses to run on a non-empty directory, initialize into a temp dir and move files into place:

```bash
npx hyperframes init /tmp/studio-hf --example swiss-grid --non-interactive
cp -r /tmp/studio-hf/* /tmp/studio-hf/.* . 2>/dev/null || true
rm -rf /tmp/studio-hf
```

Expected: `hyperframes.json`, `index.html`, `compositions/`, `assets/` exist at repo root. A starter `package.json` may exist — we'll overwrite it in Task 0.3.

The starter `index.html` is a reference, not our production composition — it will be replaced per-episode by `yt-compose`. Keep it as a known-good "hello world" until Phase 5.

- [ ] **Step 2: Smoke-test the starter render**

```bash
npx hyperframes doctor
npx hyperframes lint
npx hyperframes render --quality draft --output /tmp/starter-hello.mp4
```

Expected: `doctor` reports all green (Chrome, FFmpeg, Node, memory), `lint` passes, a short starter video renders. This validates the Hyperframes install before we build anything on top.

If `doctor` flags missing FFmpeg, install it and re-run before proceeding. Hyperframes manages its own Chromium — do not install Puppeteer Chromium separately.

- [ ] **Step 3: Commit**

```bash
git add hyperframes.json index.html compositions/ assets/ package.json package-lock.json 2>/dev/null || true
git commit -m "chore: hyperframes init with swiss-grid example"
```

---

### Task 0.3: Finalize root `package.json`

**Files:**
- Modify or create: `package.json`

- [ ] **Step 1: Merge deps into `package.json`**

If `hyperframes init` wrote a `package.json`, edit it in place to add our pipeline deps. Otherwise create:

```json
{
  "name": "ai-daily-yt",
  "version": "0.2.0",
  "type": "module",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "setup": "node pipeline/setup.mjs",
    "lint": "hyperframes lint",
    "validate": "hyperframes validate"
  },
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "hyperframes": "latest",
    "jsdom": "^24.0.0",
    "puppeteer": "^22.0.0",
    "rss-parser": "^3.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

Pin `hyperframes` to the resolved version after `npm install` — do not leave `latest` in the committed lockfile logic.

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: `node_modules/hyperframes`, `node_modules/puppeteer`, `node_modules/rss-parser`, `node_modules/zod`, `node_modules/vitest` all present. Puppeteer downloads its own Chromium (~150MB); that's fine — Hyperframes has its own and they coexist in separate paths.

After install, edit `package.json` to replace `"latest"` with the exact resolved version from `package-lock.json`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: root package.json with pipeline deps"
```

---

### Task 0.4: Create `DESIGN.md` for Swiss Pulse

**Files:**
- Create: `DESIGN.md`

- [ ] **Step 1: Write `DESIGN.md`**

This file is the **hard gate** the `hyperframes` skill enforces — every composition must trace its palette and typography here. Committed once, reused forever. Based on the Swiss Pulse preset from `.agents/skills/hyperframes/visual-styles.md`.

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "feat(design): DESIGN.md for Swiss Pulse brand identity"
```

---

### Task 0.5: Create `config.json` starter

**Files:**
- Create: `config.json`

- [ ] **Step 1: Write `config.json`**

```json
{
  "sources": {
    "rss": [
      "https://techcrunch.com/category/artificial-intelligence/feed/",
      "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml",
      "https://arstechnica.com/ai/feed/",
      "https://www.technologyreview.com/feed/"
    ],
    "hackernews": {
      "min_points": 50,
      "keywords": ["AI", "LLM", "GPT", "Claude", "Anthropic", "OpenAI", "Gemini", "transformer", "agent"]
    },
    "company_blogs": [
      "https://openai.com/blog/rss.xml",
      "https://www.anthropic.com/news/rss.xml",
      "https://deepmind.google/blog/rss.xml",
      "https://ai.meta.com/blog/rss/"
    ],
    "js_rendered_domains": [
      "openai.com",
      "anthropic.com",
      "deepmind.google",
      "ai.meta.com",
      "blog.google"
    ]
  },
  "tts": {
    "voice": "af_nova",
    "speed": 1.0
  },
  "video": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "target_duration_sec": 240,
    "render_quality": "standard"
  },
  "channel": {
    "name": "AI Daily",
    "style_name": "Swiss Pulse",
    "accent_color": "#0066FF"
  }
}
```

Note: RSS URLs are a starting guess — validate when `fetch-sources.mjs` runs in Phase 2. If Kokoro's `af_nova` doesn't match the channel voice once you hear it, swap to `bf_emma` (British female) or run `npx hyperframes tts --list` for the full catalog.

- [ ] **Step 2: Commit**

```bash
git add config.json
git commit -m "chore: starter config.json with Kokoro voice and Swiss Pulse style"
```

---

### Task 0.6: Create directory skeleton

- [ ] **Step 1: Create empty directories**

```bash
mkdir -p pipeline/schemas pipeline/lib tests/fixtures .claude/skills .claude/commands
touch pipeline/schemas/.gitkeep pipeline/lib/.gitkeep tests/fixtures/.gitkeep .claude/skills/.gitkeep .claude/commands/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/ tests/ .claude/
git commit -m "chore: scaffold empty directories"
```

---

### Phase 0 milestone

- `git log` shows ~6 commits.
- `node --version` ≥ v22.
- `npx hyperframes doctor` all green.
- `npx hyperframes lint` passes on starter `index.html`.
- `npx hyperframes render --quality draft` produces an MP4.
- `DESIGN.md` exists and describes Swiss Pulse.
- `node_modules/` has hyperframes, puppeteer, rss-parser, zod, vitest.

---

## Phase 1 — Shared lib with unit tests

### Task 1.1: `lib/normalize-text.js` + tests

**Files:**
- Create: `pipeline/lib/normalize-text.js`
- Test: `tests/normalize-text.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/normalize-text.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeForMatching } from '../pipeline/lib/normalize-text.js';

describe('normalizeForMatching', () => {
  it('lowercases ASCII', () => {
    expect(normalizeForMatching('Hello WORLD')).toBe('hello world');
  });

  it('collapses whitespace including tabs and newlines', () => {
    expect(normalizeForMatching('a\t\n  b')).toBe('a b');
  });

  it('replaces non-breaking space with regular space', () => {
    expect(normalizeForMatching('a b')).toBe('a b');
  });

  it('unifies smart quotes', () => {
    expect(normalizeForMatching('“hello”')).toBe('"hello"');
    expect(normalizeForMatching('it’s')).toBe("it's");
  });

  it('unifies dashes and collapses surrounding whitespace', () => {
    expect(normalizeForMatching('a–b')).toBe('a-b');
    expect(normalizeForMatching('a—b')).toBe('a-b');
    // Spaces around dashes collapse to no-space for matching stability
    expect(normalizeForMatching('a - b')).toBe('a-b');
    expect(normalizeForMatching('a — b')).toBe('a-b');
  });

  it('decodes HTML entities', () => {
    expect(normalizeForMatching('a &amp; b')).toBe('a & b');
    expect(normalizeForMatching('it&#39;s')).toBe("it's");
  });

  it('replaces ellipsis character with three dots', () => {
    expect(normalizeForMatching('wait…')).toBe('wait...');
  });

  it('applies NFKC normalization', () => {
    // Compatibility form: ligature fi → "fi"
    expect(normalizeForMatching('ﬁne')).toBe('fine');
  });

  it('does NOT normalize numeric paraphrase', () => {
    expect(normalizeForMatching('3x')).not.toBe(normalizeForMatching('three times'));
  });

  it('composed example: two equivalent-but-different strings match', () => {
    const a = 'It’s 3× faster—really.';
    const b = "It's 3x faster - really.";
    expect(normalizeForMatching(a)).toBe(normalizeForMatching(b));
  });
});
```

Note: this fixes the v1 plan bug where space-around-dashes wasn't handled. The test now expects `a - b` → `a-b`.

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- normalize-text
```

- [ ] **Step 3: Implement `pipeline/lib/normalize-text.js`**

```js
const HTML_ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

const NBSP_CLASS = /[  -​  　]/g;

function decodeHtmlEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, m => HTML_ENTITY_MAP[m]);
}

export function normalizeForMatching(input) {
  if (input == null) return '';
  let s = String(input);
  s = decodeHtmlEntities(s);
  s = s.normalize('NFKC');
  s = s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/…/g, '...')
    .replace(NBSP_CLASS, ' ');
  // Dashes: collapse any whitespace around en/em/figure dashes into a single hyphen
  s = s.replace(/\s*[–—−‐‑-]\s*/g, '-');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.toLowerCase();
  return s;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- normalize-text
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/normalize-text.js tests/normalize-text.test.js
git commit -m "feat(lib): normalize-text with explicit codepoint classes and dash-whitespace collapse"
```

---

### Task 1.2: `lib/run-id.js` + tests

**Files:**
- Create: `pipeline/lib/run-id.js`
- Test: `tests/run-id.test.js`

Simplified from v1: since the policy is "always monotonic increment, never reuse," the lock file is advisory only (it marks "currently being written to"), and liveness checks are optional.

- [ ] **Step 1: Write tests**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireRun, releaseRun } from '../pipeline/lib/run-id.js';

let base;
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'runid-')); });
afterEach(() => { rmSync(base, { recursive: true, force: true }); });

describe('acquireRun', () => {
  it('creates <date>-1 on first call', () => {
    const r = acquireRun({ base, date: '2026-04-23' });
    expect(r.dir.endsWith('2026-04-23-1')).toBe(true);
    expect(existsSync(r.dir)).toBe(true);
    expect(existsSync(join(r.dir, '.lock'))).toBe(true);
  });

  it('increments on subsequent calls same day', () => {
    acquireRun({ base, date: '2026-04-23' });
    const r2 = acquireRun({ base, date: '2026-04-23' });
    expect(r2.dir.endsWith('2026-04-23-2')).toBe(true);
  });

  it('handles different dates independently', () => {
    acquireRun({ base, date: '2026-04-23' });
    const r = acquireRun({ base, date: '2026-04-24' });
    expect(r.dir.endsWith('2026-04-24-1')).toBe(true);
  });
});

describe('releaseRun', () => {
  it('removes the lock file', () => {
    const r = acquireRun({ base, date: '2026-04-23' });
    releaseRun(r.dir);
    expect(existsSync(join(r.dir, '.lock'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- run-id
```

- [ ] **Step 3: Implement**

```js
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function acquireRun({ base, date }) {
  mkdirSync(base, { recursive: true });
  const existing = readdirSync(base).filter(n => n.startsWith(`${date}-`));
  const suffixes = existing
    .map(n => parseInt(n.slice(date.length + 1), 10))
    .filter(Number.isFinite);
  const next = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 1;
  const dir = join(base, `${date}-${next}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.lock'), String(process.pid));
  return { dir, runNumber: next };
}

export function releaseRun(dir) {
  const lockFile = join(dir, '.lock');
  if (existsSync(lockFile)) rmSync(lockFile, { force: true });
}
```

- [ ] **Step 4: Run — pass**

```bash
npm test -- run-id
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/run-id.js tests/run-id.test.js
git commit -m "feat(lib): run-id monotonic increment allocator"
```

---

### Task 1.3: Zod schemas

**Files:**
- Create: `pipeline/schemas/items.js`, `picks.js`, `claims.js`, `storyboard.js`, `timings.js`, `screenshots-manifest.js`, `config.js`
- Test: `tests/schemas.test.js`

- [ ] **Step 1: Write schemas**

`pipeline/schemas/items.js`:

```js
import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.string(),
  source: z.enum(['hackernews', 'rss', 'company_blog']),
  source_url: z.string().url(),
  external_url: z.string().url(),
  title: z.string(),
  summary: z.string(),
  published_at: z.string(),
  signals: z.record(z.number()).optional(),
  article_text_path: z.string().optional(),
  text_extraction_failed: z.boolean().optional(),
});

export const ItemsFileSchema = z.object({
  fetched_at: z.string(),
  items: z.array(ItemSchema),
});
```

`pipeline/schemas/picks.js`:

```js
import { z } from 'zod';

export const PickSchema = z.object({
  rank: z.number().int().min(1).max(3),
  item_id: z.string(),
  angle: z.string(),
  rationale: z.string(),
  suggested_visuals: z.array(z.string()),
  risk_flags: z.array(z.string()),
});

export const PicksFileSchema = z.object({
  date: z.string(),
  picks: z.array(PickSchema).length(3),
  rejected: z.array(z.object({ item_id: z.string(), reason: z.string() })),
});
```

`pipeline/schemas/claims.js`:

```js
import { z } from 'zod';

export const ClaimSchema = z.object({
  id: z.number().int().min(1),
  section: z.string(),
  claim_text: z.string(),
  supporting_quote: z.string(),
  source_item_id: z.string(),
  source_url: z.string().url(),
});

export const ClaimsFileSchema = z.object({
  claims: z.array(ClaimSchema),
});
```

`pipeline/schemas/storyboard.js`:

```js
import { z } from 'zod';

export const SceneSchema = z.object({
  id: z.string(),                     // e.g. "intro", "story-1", "story-2", "story-3", "outro"
  kind: z.enum(['intro', 'story', 'outro']),
  story_num: z.number().int().min(1).max(3).optional(),
  item_id: z.string().optional(),     // populated for story scenes
  target_duration_sec: z.number().positive(),  // from script pacing; actual timing comes from transcript
  beats: z.array(z.object({
    at_sec: z.number().nonnegative(),  // relative to scene start
    kind: z.enum(['headline', 'screenshot', 'number_callout', 'label', 'takeaway', 'source_chip']),
    content: z.string(),
    note: z.string().optional(),        // free-form direction for yt-compose
  })).min(1),
  transition_in: z.enum(['cinematic_zoom', 'sdf_iris', 'crossfade', 'hard_cut']),
});

export const StoryboardFileSchema = z.object({
  scenes: z.array(SceneSchema).length(5), // intro + 3 stories + outro
});
```

`pipeline/schemas/timings.js`:

```js
import { z } from 'zod';

export const TimingsFileSchema = z.object({
  audio_file: z.string(),
  total_duration_sec: z.number().positive(),
  scenes: z.array(z.object({
    id: z.string(),
    kind: z.enum(['intro', 'story', 'outro']),
    story_num: z.number().int().min(1).max(3).optional(),
    start_sec: z.number().nonnegative(),
    duration_sec: z.number().positive(),
    word_count: z.number().int().nonnegative(),
  })).length(5),
  words: z.array(z.object({
    text: z.string(),
    start_sec: z.number().nonnegative(),
    end_sec: z.number().positive(),
  })).nonempty(),
});
```

`pipeline/schemas/screenshots-manifest.js`:

```js
import { z } from 'zod';

export const ScreenshotsManifestSchema = z.object({
  entries: z.array(z.object({
    item_id: z.string(),
    path: z.string().nullable(),
    fallback: z.boolean(),
    source_domain: z.string(),
    error: z.string().optional(),
  })),
});
```

`pipeline/schemas/config.js`:

```js
import { z } from 'zod';

export const ConfigSchema = z.object({
  sources: z.object({
    rss: z.array(z.string().url()),
    hackernews: z.object({
      min_points: z.number().int().positive(),
      keywords: z.array(z.string()).nonempty(),
    }),
    company_blogs: z.array(z.string().url()),
    js_rendered_domains: z.array(z.string()),
  }),
  tts: z.object({
    voice: z.string(),
    speed: z.number().positive(),
  }),
  video: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    target_duration_sec: z.number().positive(),
    render_quality: z.enum(['draft', 'standard', 'high']),
  }),
  channel: z.object({
    name: z.string(),
    style_name: z.string(),
    accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }),
});
```

- [ ] **Step 2: Write round-trip tests**

`tests/schemas.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ItemsFileSchema } from '../pipeline/schemas/items.js';
import { PicksFileSchema } from '../pipeline/schemas/picks.js';
import { ClaimsFileSchema } from '../pipeline/schemas/claims.js';
import { StoryboardFileSchema } from '../pipeline/schemas/storyboard.js';
import { TimingsFileSchema } from '../pipeline/schemas/timings.js';
import { ScreenshotsManifestSchema } from '../pipeline/schemas/screenshots-manifest.js';
import { ConfigSchema } from '../pipeline/schemas/config.js';

describe('ItemsFileSchema', () => {
  it('accepts a valid items file', () => {
    expect(() => ItemsFileSchema.parse({
      fetched_at: '2026-04-23T08:00:00Z',
      items: [{
        id: 'hn-1', source: 'hackernews',
        source_url: 'https://news.ycombinator.com/item?id=1',
        external_url: 'https://example.com/a',
        title: 'x', summary: 'y',
        published_at: '2026-04-23T06:00:00Z',
        signals: { hn_points: 100 },
      }],
    })).not.toThrow();
  });
});

describe('PicksFileSchema', () => {
  it('requires exactly 3 picks', () => {
    expect(() => PicksFileSchema.parse({
      date: '2026-04-23',
      picks: [{ rank: 1, item_id: 'x', angle: 'a', rationale: 'r', suggested_visuals: [], risk_flags: [] }],
      rejected: [],
    })).toThrow();
  });
});

describe('ClaimsFileSchema', () => {
  it('accepts an empty claims array', () => {
    expect(() => ClaimsFileSchema.parse({ claims: [] })).not.toThrow();
  });
});

describe('StoryboardFileSchema', () => {
  it('requires exactly 5 scenes', () => {
    expect(() => StoryboardFileSchema.parse({ scenes: [] })).toThrow();
  });
});

describe('TimingsFileSchema', () => {
  it('requires exactly 5 scenes and at least one word', () => {
    expect(() => TimingsFileSchema.parse({
      audio_file: 'n.wav', total_duration_sec: 10, scenes: [], words: [],
    })).toThrow();
  });
});

describe('ScreenshotsManifestSchema', () => {
  it('accepts an empty manifest', () => {
    expect(() => ScreenshotsManifestSchema.parse({ entries: [] })).not.toThrow();
  });
});

describe('ConfigSchema', () => {
  it('accepts the checked-in config.json', () => {
    const raw = JSON.parse(readFileSync('config.json', 'utf8'));
    expect(() => ConfigSchema.parse(raw)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run — all pass**

```bash
npm test -- schemas
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/schemas/ tests/schemas.test.js
git commit -m "feat(schemas): zod schemas for items/picks/claims/storyboard/timings/config"
```

---

### Phase 1 milestone

`npm test` runs all unit tests (normalize-text, run-id, schemas) and they all pass.

---

## Phase 2 — Fetch stage

### Task 2.1: `lib/dedup.js` + tests

**Files:**
- Create: `pipeline/lib/dedup.js`
- Test: `tests/dedup.test.js`

- [ ] **Step 1: Write tests**

```js
import { describe, it, expect } from 'vitest';
import { dedupItems } from '../pipeline/lib/dedup.js';

describe('dedupItems', () => {
  it('collapses duplicates by external_url, preferring stronger signals', () => {
    const items = [
      { id: 'rss-1', source: 'rss', external_url: 'https://example.com/a', signals: {} },
      { id: 'hn-2', source: 'hackernews', external_url: 'https://example.com/a', signals: { hn_points: 500 } },
    ];
    const out = dedupItems(items);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('hn-2');
  });

  it('keeps different external_urls distinct', () => {
    const items = [
      { id: 'a', source: 'rss', external_url: 'https://x.com/1', signals: {} },
      { id: 'b', source: 'rss', external_url: 'https://x.com/2', signals: {} },
    ];
    expect(dedupItems(items)).toHaveLength(2);
  });

  it('prefers hackernews when signals tie', () => {
    const items = [
      { id: 'rss-1', source: 'rss', external_url: 'https://x.com/a', signals: {} },
      { id: 'hn-1', source: 'hackernews', external_url: 'https://x.com/a', signals: {} },
    ];
    expect(dedupItems(items)[0].source).toBe('hackernews');
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
npm test -- dedup
```

- [ ] **Step 3: Implement**

```js
function signalStrength(item) {
  const pts = item.signals?.hn_points ?? 0;
  const cmts = item.signals?.hn_comments ?? 0;
  return pts + cmts;
}

function sourcePriority(source) {
  return { hackernews: 3, company_blog: 2, rss: 1 }[source] ?? 0;
}

export function dedupItems(items) {
  const byUrl = new Map();
  for (const it of items) {
    const existing = byUrl.get(it.external_url);
    if (!existing) { byUrl.set(it.external_url, it); continue; }
    const a = signalStrength(it), b = signalStrength(existing);
    if (a > b) byUrl.set(it.external_url, it);
    else if (a === b && sourcePriority(it.source) > sourcePriority(existing.source)) {
      byUrl.set(it.external_url, it);
    }
  }
  return [...byUrl.values()];
}
```

- [ ] **Step 4: Run — pass**

```bash
npm test -- dedup
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/dedup.js tests/dedup.test.js
git commit -m "feat(lib): cross-source dedup by external_url"
```

---

### Task 2.2: `lib/sources.js` config loader

**Files:**
- Create: `pipeline/lib/sources.js`

- [ ] **Step 1: Implement**

```js
import { readFileSync } from 'node:fs';
import { ConfigSchema } from '../schemas/config.js';

export function loadConfig(path = 'config.json') {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return ConfigSchema.parse(raw);
}

export function isJsRenderedDomain(url, jsDomains) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return jsDomains.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Smoke test**

```bash
node -e "import('./pipeline/lib/sources.js').then(m => console.log(m.loadConfig().channel.name))"
```

Expected: `AI Daily`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/lib/sources.js
git commit -m "feat(lib): config loader with zod validation + domain helper"
```

---

### Task 2.3: `fetch-article-text.mjs` (Puppeteer for JS-rendered)

**Files:**
- Create: `pipeline/fetch-article-text.mjs`

Unlike v1, puppeteer lives at the repo root (single `node_modules`). No isolated subpackage, no scraper CWD switches.

- [ ] **Step 1: Implement**

```js
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { writeFileSync } from 'node:fs';

const [, , url, outPath] = process.argv;
if (!url || !outPath) {
  console.error('usage: node fetch-article-text.mjs <url> <out-path>');
  process.exit(2);
}

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (compatible; ai-daily-bot/0.2)');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  const html = await page.content();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();
  const text = parsed?.textContent?.trim() ?? '';
  writeFileSync(outPath, text, 'utf8');
  console.log(`OK ${text.length} chars -> ${outPath}`);
  process.exit(text.length >= 500 ? 0 : 3);
} catch (err) {
  console.error('FAIL', err.message);
  process.exit(1);
} finally {
  await browser.close();
}
```

Exit codes: 0 = success (≥500 chars), 3 = too short, 1 = error, 2 = usage.

- [ ] **Step 2: Smoke test**

```bash
node pipeline/fetch-article-text.mjs https://www.anthropic.com/news /tmp/test-article.txt
echo "exit=$?"
```

Expected: exit 0 or 3, file exists with article body text.

- [ ] **Step 3: Commit**

```bash
git add pipeline/fetch-article-text.mjs
git commit -m "feat(pipeline): puppeteer article-text fetcher at repo root"
```

---

### Task 2.4: `fetch-sources.mjs`

**Files:**
- Create: `pipeline/fetch-sources.mjs`

- [ ] **Step 1: Implement**

```js
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { loadConfig, isJsRenderedDomain } from './lib/sources.js';
import { dedupItems } from './lib/dedup.js';
import { ItemsFileSchema } from './schemas/items.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node fetch-sources.mjs <work-dir>'); process.exit(2); }

const config = loadConfig();
const parser = new Parser();
const articlesDir = join(workDir, 'articles');
mkdirSync(articlesDir, { recursive: true });
const fetchErrors = [];

async function fetchRss(url, source) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map(e => ({
      id: `${source}-${Buffer.from(e.link || e.guid || e.title).toString('base64').slice(0, 20)}`,
      source,
      source_url: e.link ?? url,
      external_url: e.link ?? url,
      title: e.title ?? '',
      summary: (e.contentSnippet ?? e.content ?? '').slice(0, 500),
      published_at: e.isoDate ?? new Date().toISOString(),
    }));
  } catch (err) {
    fetchErrors.push({ source, url, error: err.message });
    return [];
  }
}

async function fetchHackerNews({ min_points, keywords }) {
  try {
    const q = encodeURIComponent(keywords.join(' OR '));
    const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${q}&numericFilters=points>=${min_points}`;
    const r = await fetch(url);
    const json = await r.json();
    return json.hits.filter(h => h.url).map(h => ({
      id: `hn-${h.objectID}`,
      source: 'hackernews',
      source_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      external_url: h.url,
      title: h.title ?? '',
      summary: (h.story_text ?? '').replace(/<[^>]+>/g, '').slice(0, 500),
      published_at: h.created_at,
      signals: { hn_points: h.points ?? 0, hn_comments: h.num_comments ?? 0 },
    }));
  } catch (err) {
    fetchErrors.push({ source: 'hackernews', error: err.message });
    return [];
  }
}

async function plainFetchAndExtract(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'ai-daily-bot/0.2' } });
  const html = await r.text();
  const dom = new JSDOM(html, { url });
  return new Readability(dom.window.document).parse()?.textContent?.trim() ?? '';
}

function jsRenderedFetch(url, outPath) {
  const res = spawnSync('node', ['pipeline/fetch-article-text.mjs', url, outPath], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 60000,
  });
  return res.status === 0;
}

async function extractArticleText(item) {
  const outPath = join(articlesDir, `${item.id}.txt`);
  try {
    if (isJsRenderedDomain(item.external_url, config.sources.js_rendered_domains)) {
      if (!jsRenderedFetch(item.external_url, outPath)) return { failed: true };
    } else {
      const text = await plainFetchAndExtract(item.external_url);
      if (text.length < 500) return { failed: true };
      writeFileSync(outPath, text, 'utf8');
    }
    return { failed: false, path: `articles/${item.id}.txt` };
  } catch (err) {
    fetchErrors.push({ source: 'article_extraction', url: item.external_url, error: err.message });
    return { failed: true };
  }
}

const rssResults = await Promise.all([
  ...config.sources.rss.map(u => fetchRss(u, 'rss')),
  ...config.sources.company_blogs.map(u => fetchRss(u, 'company_blog')),
]);
const hn = await fetchHackerNews(config.sources.hackernews);
const raw = [...rssResults.flat(), ...hn];
const deduped = dedupItems(raw);

const enriched = [];
for (const item of deduped) {
  const r = await extractArticleText(item);
  enriched.push(r.failed
    ? { ...item, text_extraction_failed: true }
    : { ...item, article_text_path: r.path });
}

const usable = enriched.filter(i => !i.text_extraction_failed);
if (usable.length < 10) {
  console.error(`ERROR: only ${usable.length} items with usable article text (need >=10)`);
  writeFileSync(join(workDir, 'fetch-errors.json'), JSON.stringify(fetchErrors, null, 2));
  process.exit(1);
}

const out = { fetched_at: new Date().toISOString(), items: enriched };
ItemsFileSchema.parse(out);
writeFileSync(join(workDir, 'items.json'), JSON.stringify(out, null, 2));
writeFileSync(join(workDir, 'fetch-errors.json'), JSON.stringify(fetchErrors, null, 2));
console.log(`OK ${enriched.length} items (${usable.length} with usable text) -> ${workDir}/items.json`);
```

- [ ] **Step 2: Smoke-test**

```bash
mkdir -p /tmp/studio-test/logs
node pipeline/fetch-sources.mjs /tmp/studio-test
```

Expected: runs 30–120s, `items.json` has ≥10 usable items. If fewer, inspect `/tmp/studio-test/fetch-errors.json` and tune `config.json` feeds.

- [ ] **Step 3: Validate output**

```bash
node -e "import('./pipeline/schemas/items.js').then(({ItemsFileSchema}) => { const d = JSON.parse(require('fs').readFileSync('/tmp/studio-test/items.json', 'utf8')); ItemsFileSchema.parse(d); console.log('OK', d.items.length); })"
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/fetch-sources.mjs
git commit -m "feat(pipeline): fetch-sources RSS+HN+article extraction with dedup"
```

---

### Phase 2 milestone

`node pipeline/fetch-sources.mjs /tmp/studio-test` produces schema-valid `items.json` with ≥10 usable items. Spot-check 3–5 article files to confirm content is real article body, not navigation chrome.

---

## Phase 3 — Editorial: research + script + storyboard + claims verify

### Task 3.1: `.claude/skills/yt-research/SKILL.md`

**Files:**
- Create: `.claude/skills/yt-research/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: yt-research
description: Rank and pick the 3 most newsworthy AI/tech stories for a builder-focused daily recap video from a batch of fetched items. Use when items.json exists and you need picks.json.
---

# yt-research

Pick the 3 stories for today's AI Daily video.

## Inputs

- `<run-dir>/items.json` — all fetched items. Schema: `pipeline/schemas/items.js`.
- Read `items[i].article_text_path` (relative to run-dir) for article bodies as needed.

Skip items flagged `text_extraction_failed: true` — they cannot be fact-checked and therefore cannot be picked.

## Audience and angle

**Audience: builders shipping AI products.** For every candidate, ask: *what does this mean for someone actually building with AI?*

Favor:
- Model releases / API changes affecting integration choices
- Tooling, agent frameworks, infra changes builders adopt
- Open-weights / local model advances
- Concrete product launches from major labs (OpenAI / Anthropic / DeepMind / Meta)
- Notable failures, retractions, or security issues in shipped AI systems

Deprioritize:
- Funding rounds without product substance
- Celebrity executive drama
- Aggregator repeats of already-covered stories
- Vague "AI will change everything" opinion pieces

## Output

Write to `<run-dir>/picks.json`. Schema: `pipeline/schemas/picks.js`. Must parse cleanly.

- **Exactly 3 picks**, ranked 1 (lead) to 3.
- Each pick:
  - `item_id` — must exist in items.json
  - `angle` — one sentence: the builder-focused hook
  - `rationale` — 1–2 sentences: why this over alternatives
  - `suggested_visuals` — 2–3 short strings (e.g. `["benchmark chart", "API changelog"]`)
  - `risk_flags` — any of: `"rumor_only"`, `"single_source"`, `"unverifiable_claim"`, `"potential_copyright"`. Empty if none apply.
- `rejected` — any strong-but-not-picked candidates with a short reason.

## Hard rules

- Never pick an item with `text_extraction_failed: true`.
- Never reference an item_id that doesn't appear in items.json.
- If fewer than 3 usable items exist, stop and report — do not invent a third pick.

## After writing, validate

```bash
node -e "import('./pipeline/schemas/picks.js').then(({PicksFileSchema}) => { const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); PicksFileSchema.parse(d); console.log('OK'); })" <run-dir>/picks.json
```
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/yt-research/SKILL.md
git commit -m "feat(skill): yt-research"
```

---

### Task 3.2: `.claude/skills/yt-script/SKILL.md`

**Files:**
- Create: `.claude/skills/yt-script/SKILL.md`

This skill produces three artifacts: `script.md`, `claims.json`, and `storyboard.md`. It reads the `website-to-hyperframes` skill's step-4-storyboard reference for storyboard structure.

- [ ] **Step 1: Write the skill**

````markdown
---
name: yt-script
description: Write the voiceover script, claims.json, and storyboard.md for today's 3-story AI daily video given picks.json and article texts. Every factual claim must be backed by a verbatim source quote. Use when picks.json exists and you need script.md + storyboard.md + claims.json.
---

# yt-script

Write `script.md`, `storyboard.md`, and `claims.json` for today's video.

## Before writing

Read `DESIGN.md` at the repo root — it defines the Swiss Pulse brand. Your storyboard visual direction must align with it. Also read (if not already loaded this session): the `website-to-hyperframes` skill at `.agents/skills/website-to-hyperframes/references/step-4-storyboard.md` for storyboard shape.

## Inputs

- `<run-dir>/picks.json` — the 3 picks. Schema: `pipeline/schemas/picks.js`.
- `<run-dir>/items.json` — full item list; use `article_text_path` to read source articles.
- `DESIGN.md` — brand palette, typography, motion rules.

Read the full article text for each of the 3 picks before writing anything.

## Tone

- Builder-focused: every story paragraph ends with a sentence answering "what this means for people building with AI" — concrete, not hand-wavy.
- Skeptical when warranted. Don't repeat press-release hype uncritically.
- No clickbait. No "you won't believe", no rhetorical audience questions, no "this changes everything".
- Conversational, short sentences. One idea per sentence.

## Target length

~240 seconds total voiceover (~600 words at normal pace). Budget:

- INTRO: 15s / ~40 words
- STORY 1 (lead): 70–80s / ~190 words
- STORY 2: 70s / ~170 words
- STORY 3: 65s / ~160 words
- OUTRO: 10–15s / ~40 words

Pacing is a hint — actual timing comes from measuring TTS output in Phase 4.

## Output 1: `<run-dir>/script.md`

```markdown
---
date: <YYYY-MM-DD>
target_duration_sec: 240
voice: af_nova
word_count: <your count>
---

## INTRO
<opening line that name-checks the 3 stories>

## STORY 1 — <short title>
<narration with [^N] footnotes on every factual claim>

## STORY 2 — <short title>
...

## STORY 3 — <short title>
...

## OUTRO
<closer>

## SOURCES
[^1]: <url> (item_id: <id>)
[^2]: ...
```

- **Every factual claim gets a footnote `[^N]`** — numbers, release dates, benchmark results, quotations, names of features, product comparisons. Anything checkable.
- Footnotes are numbered sequentially across the whole script.
- Every footnote appears in SOURCES with a URL and `item_id`.
- Do NOT include parenthetical duration hints like `(15s)` in headers — the script timing comes from transcribe, not from your pacing guess.

## Output 2: `<run-dir>/claims.json`

Schema: `pipeline/schemas/claims.js`. For every footnoted claim, one entry:

```json
{
  "claims": [
    {
      "id": 1,
      "section": "STORY 1",
      "claim_text": "It beats GPT-5 on every benchmark at one-third the cost.",
      "supporting_quote": "...EXACT verbatim substring from source article...",
      "source_item_id": "hn-39284710",
      "source_url": "https://openai.com/blog/gpt-5-turbo"
    }
  ]
}
```

### The absolute rule for `supporting_quote`

**Copy-paste, do not paraphrase.** `supporting_quote` must be a substring of the source article's text, character for character. The verifier (`verify-claims.mjs`) checks this automatically — any mismatch blocks the pipeline.

The verifier normalizes whitespace, smart quotes, dashes, NBSP, HTML entities, and case. It does NOT normalize numeric paraphrase ("3x" vs "three times") or reword. If you can't find a verbatim substring, **rewrite the claim, don't edit the quote**.

`claim_text` may paraphrase — only `supporting_quote` must be verbatim.

## Output 3: `<run-dir>/storyboard.md`

Per-scene visual direction following Swiss Pulse. 5 scenes: INTRO, STORY 1, STORY 2, STORY 3, OUTRO.

```markdown
# Storyboard

## Scene: INTRO (~15s, transition_in: hard_cut)
- Beat 0.0s: headline "AI DAILY" at hero-size, accent color left rule
- Beat 0.4s: date_pretty below headline, foreground_secondary
- Beat 0.8s: three headlines stacked, each entering with power4.out stagger 0.12
- Note: grid-locked, numbers prominent if any

## Scene: STORY 1 — <title> (~75s, transition_in: cinematic_zoom)
- Beat 0.0s: story_num "01" at 160px accent color, bottom-left
- Beat 0.3s: headline at story-headline size, top-right
- Beat 1.0s: screenshot crop 1200x400 at mid-frame
- Beat 3.5s: source_chip "<domain>" bottom-right
- Beat 8.0s: number_callout — if story has a headline stat, animate from 0
- Note: screenshot gets 6px outline accent color, no drop shadow
- Takeaway line enters at ~end-6s with label "FOR BUILDERS"

## Scene: STORY 2 — <title> (~70s, transition_in: sdf_iris)
...

## Scene: STORY 3 — <title> (~65s, transition_in: sdf_iris)
...

## Scene: OUTRO (~12s, transition_in: crossfade)
- Beat 0.0s: channel name at hero-size
- Beat 0.5s: accent rule
- Beat 0.8s: "SUBSCRIBE FOR DAILY AI NEWS" at label size
- Note: this is the ONLY scene where elements may exit via gsap.to(opacity: 0)
```

Write a matching JSON representation at `<run-dir>/storyboard.json` per the schema at `pipeline/schemas/storyboard.js` so downstream tools can read it. The `.md` is for humans; the `.json` is for `yt-compose`.

## Hard rules

- No claim in the script may be ungrounded. If the article doesn't support it, omit it.
- Don't invent numbers. If the source rounds, you round the same way.
- Never mix sources: STORY 1's claims cite STORY 1's source(s) only.
- Storyboard must follow `DESIGN.md`. No off-palette colors, no non-Inter fonts, no generic motion ("fade in").

## After writing, validate

```bash
node -e "import('./pipeline/schemas/claims.js').then(({ClaimsFileSchema}) => { const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); ClaimsFileSchema.parse(d); console.log('OK claims'); })" <run-dir>/claims.json

node -e "import('./pipeline/schemas/storyboard.js').then(({StoryboardFileSchema}) => { const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); StoryboardFileSchema.parse(d); console.log('OK storyboard'); })" <run-dir>/storyboard.json
```

Self-check: every `[^N]` in the script appears in SOURCES and in `claims.json`. Every scene in `storyboard.json` has at least one beat.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/yt-script/SKILL.md
git commit -m "feat(skill): yt-script with claims, storyboard, and DESIGN.md alignment"
```

---

### Task 3.3: `verify-claims.mjs` + tests

**Files:**
- Create: `pipeline/verify-claims.js` (pure logic)
- Create: `pipeline/verify-claims.mjs` (CLI wrapper)
- Test: `tests/verify-claims.test.js`

- [ ] **Step 1: Write tests**

```js
import { describe, it, expect } from 'vitest';
import { checkClaim, verifyAll } from '../pipeline/verify-claims.js';

describe('checkClaim', () => {
  it('passes when quote appears verbatim in source', () => {
    const r = checkClaim({
      supporting_quote: 'the sky is blue',
      sourceText: 'Everyone knows the sky is blue on a clear day.',
    });
    expect(r.pass).toBe(true);
  });

  it('passes despite smart-quote/dash/NBSP typographic differences', () => {
    const r = checkClaim({
      supporting_quote: 'it’s 3—times faster',
      sourceText: "it's 3-times faster",
    });
    expect(r.pass).toBe(true);
  });

  it('fails on numeric paraphrase (semantic)', () => {
    const r = checkClaim({
      supporting_quote: '3x faster',
      sourceText: 'three times faster',
    });
    expect(r.pass).toBe(false);
  });

  it('fails when quote is not in source at all', () => {
    const r = checkClaim({
      supporting_quote: 'purely invented',
      sourceText: 'totally different content',
    });
    expect(r.pass).toBe(false);
  });
});

describe('verifyAll', () => {
  it('returns per-claim results', () => {
    const claims = [
      { id: 1, supporting_quote: 'a b c', source_item_id: 'x' },
      { id: 2, supporting_quote: 'not here', source_item_id: 'x' },
    ];
    const sources = { x: 'a b c d e' };
    const r = verifyAll(claims, sources);
    expect(r.pass).toBe(false);
    expect(r.results[0].pass).toBe(true);
    expect(r.results[1].pass).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
npm test -- verify-claims
```

- [ ] **Step 3: Implement `pipeline/verify-claims.js`**

```js
import { normalizeForMatching } from './lib/normalize-text.js';

export function checkClaim({ supporting_quote, sourceText }) {
  const q = normalizeForMatching(supporting_quote);
  const src = normalizeForMatching(sourceText);
  if (!q) return { pass: false, reason: 'empty_quote' };
  if (!src) return { pass: false, reason: 'empty_source' };
  const idx = src.indexOf(q);
  if (idx === -1) return { pass: false, reason: 'not_found' };
  const pad = 80;
  const excerpt = src.slice(Math.max(0, idx - pad), Math.min(src.length, idx + q.length + pad));
  return { pass: true, excerpt };
}

export function verifyAll(claims, sources) {
  const results = claims.map(c => {
    const sourceText = sources[c.source_item_id] ?? '';
    const r = checkClaim({ supporting_quote: c.supporting_quote, sourceText });
    return { id: c.id, claim_text: c.claim_text, section: c.section, source_item_id: c.source_item_id, ...r };
  });
  return { pass: results.every(r => r.pass), results };
}
```

- [ ] **Step 4: Run — pass**

```bash
npm test -- verify-claims
```

- [ ] **Step 5: Implement CLI wrapper `pipeline/verify-claims.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaimsFileSchema } from './schemas/claims.js';
import { ItemsFileSchema } from './schemas/items.js';
import { verifyAll } from './verify-claims.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node verify-claims.mjs <work-dir>'); process.exit(2); }

const claims = ClaimsFileSchema.parse(JSON.parse(readFileSync(join(workDir, 'claims.json'), 'utf8'))).claims;
const items = ItemsFileSchema.parse(JSON.parse(readFileSync(join(workDir, 'items.json'), 'utf8'))).items;

const sources = {};
for (const it of items) {
  if (it.article_text_path) {
    sources[it.id] = readFileSync(join(workDir, it.article_text_path), 'utf8');
  }
}

const result = verifyAll(claims, sources);
writeFileSync(join(workDir, 'claims-verified.json'), JSON.stringify(result, null, 2));

const failed = result.results.filter(r => !r.pass);
if (failed.length > 0) {
  const lines = ['# Claims verification FAILED', ''];
  for (const f of failed) {
    lines.push(`## Claim ${f.id} (${f.section})`);
    lines.push(`**Claim:** ${f.claim_text}`);
    lines.push(`**Reason:** ${f.reason}`);
    lines.push(`**Source:** ${f.source_item_id}`);
    lines.push('');
  }
  writeFileSync(join(workDir, 'claims-verification-report.md'), lines.join('\n'));
  console.error(`FAIL: ${failed.length}/${result.results.length} claims unverified. See claims-verification-report.md`);
  process.exit(1);
}

console.log(`OK: ${result.results.length} claims verified.`);
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/verify-claims.js pipeline/verify-claims.mjs tests/verify-claims.test.js
git commit -m "feat(pipeline): verify-claims pure logic + CLI with report"
```

---

### Phase 3 milestone

Against the Phase-2 `/tmp/studio-test/items.json`:

1. Invoke `yt-research` skill → `picks.json`.
2. Invoke `yt-script` skill → `script.md` + `claims.json` + `storyboard.md` + `storyboard.json`.
3. Run `node pipeline/verify-claims.mjs /tmp/studio-test` — expect OK.

If claims fail, read the report and iterate on the script prompt before proceeding. If they're all failing on typographic differences, extend `normalize-text.js`; if they're failing because the model invented quotes, tighten the `yt-script` skill prompt.

---

## Phase 4 — Voiceover: Hyperframes TTS + transcribe + section timings

### Task 4.1: Script-to-plaintext + TTS

**Files:**
- Create: `pipeline/build-narration-text.mjs`
- Create: `pipeline/tts.mjs`

We produce a single plain-text narration file, pipe it to `hyperframes tts`, and keep the single `narration.wav` as the audio track.

- [ ] **Step 1: Implement `pipeline/build-narration-text.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node build-narration-text.mjs <work-dir>'); process.exit(2); }

const md = readFileSync(join(workDir, 'script.md'), 'utf8');

// Strip frontmatter, footnotes, SOURCES section, markdown headers.
function scriptToNarration(src) {
  const lines = src.split('\n');
  let inFrontmatter = false, frontmatterClosed = false;
  let inSources = false;
  const out = [];
  for (const line of lines) {
    if (!frontmatterClosed) {
      if (line.trim() === '---') {
        if (!inFrontmatter) inFrontmatter = true;
        else { inFrontmatter = false; frontmatterClosed = true; }
        continue;
      }
      if (inFrontmatter) continue;
    }
    if (line.startsWith('## SOURCES')) { inSources = true; continue; }
    if (inSources) continue;
    if (line.startsWith('## ')) {
      // Section header: insert a small pause marker (two newlines keep Kokoro's prosody natural)
      out.push(''); continue;
    }
    // Strip footnotes and markdown emphasis
    const cleaned = line
      .replace(/\[\^\d+\]/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .trim();
    out.push(cleaned);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const narration = scriptToNarration(md);
writeFileSync(join(workDir, 'narration.txt'), narration);

// Also emit per-section text for section-timing derivation later.
const sections = {};
let current = null, buf = [];
const flush = () => { if (current) sections[current] = buf.join('\n').replace(/\[\^\d+\]/g, '').replace(/\*\*|\*/g, '').trim(); buf = []; };
for (const line of md.split('\n')) {
  if (line.startsWith('## ')) {
    flush();
    const header = line.slice(3).trim();
    if (header === 'SOURCES') { current = null; continue; }
    if (header.startsWith('INTRO')) current = 'intro';
    else if (header.startsWith('STORY 1')) current = 'story-1';
    else if (header.startsWith('STORY 2')) current = 'story-2';
    else if (header.startsWith('STORY 3')) current = 'story-3';
    else if (header.startsWith('OUTRO')) current = 'outro';
    else current = null;
  } else if (current && line.trim() && !line.startsWith('---')) {
    buf.push(line);
  }
}
flush();

writeFileSync(join(workDir, 'sections.json'), JSON.stringify(sections, null, 2));
console.log(`OK narration.txt (${narration.length} chars), ${Object.keys(sections).length} sections`);
```

- [ ] **Step 2: Implement `pipeline/tts.mjs`**

```js
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node tts.mjs <work-dir>'); process.exit(2); }
const config = loadConfig();

const narrationTxt = join(workDir, 'narration.txt');
const narrationWav = join(workDir, 'narration.wav');
if (!existsSync(narrationTxt)) { console.error('narration.txt missing — run build-narration-text.mjs first'); process.exit(1); }

const r = spawnSync('npx', [
  'hyperframes', 'tts', narrationTxt,
  '--voice', config.tts.voice,
  '--output', narrationWav,
], { encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });

if (r.status !== 0) { console.error('hyperframes tts failed'); process.exit(1); }
if (!existsSync(narrationWav) || statSync(narrationWav).size < 10_000) {
  console.error('narration.wav missing or suspiciously small'); process.exit(1);
}
console.log(`OK ${narrationWav} (${statSync(narrationWav).size} bytes)`);
```

- [ ] **Step 3: Smoke-test**

```bash
mkdir -p /tmp/studio-test
cat > /tmp/studio-test/script.md <<'EOF'
---
date: 2026-04-23
target_duration_sec: 240
voice: af_nova
word_count: 30
---

## INTRO
Good morning. Today we look at one tiny test.

## STORY 1 — Test
This is a test sentence. It should produce audio.

## OUTRO
Thanks for watching.

## SOURCES
EOF
node pipeline/build-narration-text.mjs /tmp/studio-test
node pipeline/tts.mjs /tmp/studio-test
```

Expected: `narration.txt`, `sections.json`, `narration.wav` all exist. Play the WAV to confirm voice quality.

- [ ] **Step 4: Commit**

```bash
git add pipeline/build-narration-text.mjs pipeline/tts.mjs
git commit -m "feat(pipeline): narration text builder + hyperframes tts wrapper"
```

---

### Task 4.2: Transcribe for word-level timestamps

**Files:**
- Create: `pipeline/transcribe.mjs`

- [ ] **Step 1: Implement**

```js
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node transcribe.mjs <work-dir>'); process.exit(2); }

const wav = join(workDir, 'narration.wav');
if (!existsSync(wav)) { console.error('narration.wav missing — run tts.mjs first'); process.exit(1); }

// hyperframes transcribe writes JSON next to the audio by default; be explicit.
const r = spawnSync('npx', [
  'hyperframes', 'transcribe', wav,
  '--output', join(workDir, 'transcript.json'),
], { encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });

if (r.status !== 0) { console.error('hyperframes transcribe failed'); process.exit(1); }
if (!existsSync(join(workDir, 'transcript.json'))) { console.error('transcript.json missing'); process.exit(1); }
console.log('OK transcript.json');
```

Hyperframes transcribe CLI flags may differ slightly between versions — if `--output` isn't supported, check `npx hyperframes transcribe --help` and adjust. Don't guess silently; update this script to match the installed version.

- [ ] **Step 2: Smoke-test**

```bash
node pipeline/transcribe.mjs /tmp/studio-test
```

Expected: `transcript.json` with word-level `{ text, start, end }` entries. Inspect the first 5 words match the opening narration.

- [ ] **Step 3: Commit**

```bash
git add pipeline/transcribe.mjs
git commit -m "feat(pipeline): hyperframes transcribe wrapper for word timestamps"
```

---

### Task 4.3: `compute-timings.js` + tests + CLI

**Files:**
- Create: `pipeline/compute-timings.js` (pure logic)
- Create: `pipeline/compute-timings.mjs` (CLI wrapper)
- Test: `tests/compute-timings.test.js`

Maps word-level transcript to per-section timings (intro, story-1, story-2, story-3, outro) by aligning section text (from `sections.json`) against the transcript word sequence.

- [ ] **Step 1: Write tests**

`tests/compute-timings.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { alignSectionsToWords } from '../pipeline/compute-timings.js';

const words = [
  { text: 'Good', start: 0.0, end: 0.3 },
  { text: 'morning', start: 0.3, end: 0.9 },
  { text: 'today', start: 1.0, end: 1.4 },
  { text: 'a', start: 1.5, end: 1.6 },
  { text: 'test', start: 1.7, end: 2.1 },
  { text: 'story', start: 2.3, end: 2.7 },
  { text: 'one', start: 2.8, end: 3.2 },
  { text: 'body', start: 3.3, end: 3.7 },
  { text: 'thanks', start: 4.0, end: 4.4 },
];

describe('alignSectionsToWords', () => {
  it('assigns contiguous word ranges to sections', () => {
    const sections = {
      'intro':   'Good morning today',
      'story-1': 'a test story one body',
      'outro':   'Thanks',
    };
    const out = alignSectionsToWords(sections, words);
    expect(out.scenes[0]).toMatchObject({ id: 'intro', start_sec: 0, duration_sec: 1.4 });
    expect(out.scenes[1]).toMatchObject({ id: 'story-1' });
    expect(out.scenes[2]).toMatchObject({ id: 'outro' });
    expect(out.total_duration_sec).toBeGreaterThan(0);
  });

  it('throws when a section\'s first word is not found in sequence', () => {
    const sections = { 'intro': 'completely unrelated text' };
    expect(() => alignSectionsToWords(sections, words)).toThrow();
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
npm test -- compute-timings
```

- [ ] **Step 3: Implement `pipeline/compute-timings.js`**

```js
import { normalizeForMatching } from './lib/normalize-text.js';

function tokenize(s) {
  return normalizeForMatching(s).split(/\s+/).filter(Boolean);
}

const SCENE_ORDER = ['intro', 'story-1', 'story-2', 'story-3', 'outro'];
const SCENE_KIND = { 'intro': 'intro', 'story-1': 'story', 'story-2': 'story', 'story-3': 'story', 'outro': 'outro' };
const SCENE_NUM = { 'story-1': 1, 'story-2': 2, 'story-3': 3 };

export function alignSectionsToWords(sections, words) {
  const normWords = words.map(w => ({ ...w, norm: normalizeForMatching(w.text) }));
  let wi = 0;
  const scenes = [];
  for (const id of SCENE_ORDER) {
    const text = sections[id];
    if (!text) continue;
    const tokens = tokenize(text);
    if (tokens.length === 0) continue;

    // Find the first occurrence of tokens[0] in normWords at or after wi.
    const firstWord = tokens[0];
    let start = -1;
    for (let j = wi; j < normWords.length; j++) {
      if (normWords[j].norm === firstWord) { start = j; break; }
    }
    if (start === -1) throw new Error(`cannot locate section ${id} starting with "${firstWord}" at word index >= ${wi}`);

    const end = Math.min(start + tokens.length, normWords.length) - 1;
    const scene = {
      id,
      kind: SCENE_KIND[id],
      start_sec: normWords[start].start,
      duration_sec: normWords[end].end - normWords[start].start,
      word_count: end - start + 1,
    };
    if (SCENE_NUM[id]) scene.story_num = SCENE_NUM[id];
    scenes.push(scene);
    wi = end + 1;
  }

  const total = scenes.reduce((t, s) => Math.max(t, s.start_sec + s.duration_sec), 0);
  return {
    scenes,
    total_duration_sec: total,
    words: words.map(w => ({ text: w.text, start_sec: w.start, end_sec: w.end })),
  };
}
```

- [ ] **Step 4: Run — pass**

```bash
npm test -- compute-timings
```

- [ ] **Step 5: Implement CLI `pipeline/compute-timings.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { alignSectionsToWords } from './compute-timings.js';
import { TimingsFileSchema } from './schemas/timings.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node compute-timings.mjs <work-dir>'); process.exit(2); }

const sections = JSON.parse(readFileSync(join(workDir, 'sections.json'), 'utf8'));
const transcript = JSON.parse(readFileSync(join(workDir, 'transcript.json'), 'utf8'));

// Hyperframes transcript may use {text, start, end} or {word, start_time, end_time} — normalize:
const words = (transcript.words ?? transcript.segments?.flatMap(s => s.words) ?? transcript)
  .map(w => ({
    text: w.text ?? w.word ?? '',
    start: w.start ?? w.start_time ?? 0,
    end: w.end ?? w.end_time ?? 0,
  }))
  .filter(w => w.text);

const aligned = alignSectionsToWords(sections, words);

const out = {
  audio_file: 'narration.wav',
  total_duration_sec: aligned.total_duration_sec,
  scenes: aligned.scenes,
  words: aligned.words,
};
TimingsFileSchema.parse(out);
writeFileSync(join(workDir, 'timings.json'), JSON.stringify(out, null, 2));
console.log(`OK timings.json — ${out.scenes.length} scenes, ${out.total_duration_sec.toFixed(1)}s`);
```

- [ ] **Step 6: Smoke-test**

```bash
node pipeline/compute-timings.mjs /tmp/studio-test
```

Expected: `timings.json` with 3 or 5 scenes (depending on the mini-script), all with positive durations, total ~10–15s.

- [ ] **Step 7: Commit**

```bash
git add pipeline/compute-timings.js pipeline/compute-timings.mjs tests/compute-timings.test.js
git commit -m "feat(pipeline): align transcript words to script sections for per-scene timings"
```

---

### Phase 4 milestone

Given `script.md` in a run dir, the sequence:

```bash
node pipeline/build-narration-text.mjs $RUN
node pipeline/tts.mjs $RUN
node pipeline/transcribe.mjs $RUN
node pipeline/compute-timings.mjs $RUN
```

produces `narration.wav` + schema-valid `timings.json` with 5 scenes. Listen to the WAV; spot-check 2 scene boundaries against the word at `scenes[i].start_sec`.

---

## Phase 5 — Screenshots, compose, lint, validate, render

### Task 5.1: `capture-screenshots.mjs`

**Files:**
- Create: `pipeline/capture-screenshots.mjs`

- [ ] **Step 1: Implement**

```js
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node capture-screenshots.mjs <work-dir>'); process.exit(2); }

const items = JSON.parse(readFileSync(join(workDir, 'items.json'), 'utf8')).items;
const picks = JSON.parse(readFileSync(join(workDir, 'picks.json'), 'utf8')).picks;
const shotsDir = join(workDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new' });
const entries = [];
try {
  for (const pick of picks) {
    const item = items.find(i => i.id === pick.item_id);
    if (!item) { entries.push({ item_id: pick.item_id, path: null, fallback: true, source_domain: 'unknown', error: 'item_not_found' }); continue; }
    const outPath = join(shotsDir, `${item.id}.png`);
    const domain = new URL(item.external_url).hostname;
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1200, height: 400 });
      await page.setUserAgent('Mozilla/5.0 (compatible; ai-daily-bot/0.2)');
      await page.goto(item.external_url, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 400 } });
      entries.push({ item_id: item.id, path: `screenshots/${item.id}.png`, fallback: false, source_domain: domain });
    } catch (err) {
      entries.push({ item_id: item.id, path: null, fallback: true, source_domain: domain, error: err.message });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(workDir, 'screenshots-manifest.json'), JSON.stringify({ entries }, null, 2));
const ok = entries.filter(e => !e.fallback).length;
console.log(`OK ${ok}/${entries.length} screenshots captured`);
```

- [ ] **Step 2: Smoke-test**

Needs a real `/tmp/studio-test/picks.json` + `items.json` from the Phase 3 milestone. If not present, skip until Phase 3 is done. Otherwise:

```bash
node pipeline/capture-screenshots.mjs /tmp/studio-test
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/capture-screenshots.mjs
git commit -m "feat(pipeline): capture-screenshots 1200x400 crop for legal posture"
```

---

### Task 5.2: `build-run-dir.mjs`

**Files:**
- Create: `pipeline/build-run-dir.mjs`

This copies the minimum Hyperframes project files into the run dir so `hyperframes lint` / `validate` / `render` can run from that dir.

- [ ] **Step 1: Implement**

```js
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node build-run-dir.mjs <work-dir>'); process.exit(2); }

for (const f of ['hyperframes.json', 'DESIGN.md']) {
  if (existsSync(f)) copyFileSync(f, join(workDir, f));
}
if (existsSync('assets')) cpSync('assets', join(workDir, 'assets'), { recursive: true });
if (existsSync('compositions')) cpSync('compositions', join(workDir, 'compositions'), { recursive: true });
mkdirSync(join(workDir, 'renders'), { recursive: true });
mkdirSync(join(workDir, 'snapshots'), { recursive: true });
console.log(`OK run dir prepared at ${workDir}`);
```

- [ ] **Step 2: Smoke-test**

```bash
node pipeline/build-run-dir.mjs /tmp/studio-test
ls /tmp/studio-test/
```

Expected: `hyperframes.json`, `DESIGN.md`, `assets/`, `compositions/` present.

- [ ] **Step 3: Commit**

```bash
git add pipeline/build-run-dir.mjs
git commit -m "feat(pipeline): build-run-dir stages hyperframes project files per run"
```

---

### Task 5.3: `.claude/skills/yt-compose/SKILL.md`

**Files:**
- Create: `.claude/skills/yt-compose/SKILL.md`

This is the core bridge: Claude generates the Hyperframes `index.html` per episode using the storyboard, timings, screenshots, and DESIGN.md. The skill requires Claude to read the Hyperframes skills first.

- [ ] **Step 1: Write the skill**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/yt-compose/SKILL.md
git commit -m "feat(skill): yt-compose for writing hyperframes index.html per episode"
```

---

### Task 5.4: Lint + validate + render wrappers

**Files:**
- Create: `pipeline/lint.mjs`, `pipeline/render.mjs`

- [ ] **Step 1: Implement `pipeline/lint.mjs`**

```js
import { spawnSync } from 'node:child_process';

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

console.log('OK lint + validate clean');
```

- [ ] **Step 2: Implement `pipeline/render.mjs`**

```js
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node render.mjs <work-dir>'); process.exit(2); }
const config = loadConfig();

// Render video
const render = spawnSync('npx', [
  'hyperframes', 'render',
  '--quality', config.video.render_quality,
  '--fps', String(config.video.fps),
  '--output', 'renders/video.mp4',
], { cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
if (render.status !== 0) { console.error('hyperframes render failed'); process.exit(1); }

const videoPath = join(workDir, 'renders', 'video.mp4');
if (!existsSync(videoPath) || statSync(videoPath).size < 100_000) {
  console.error('video.mp4 missing or too small'); process.exit(1);
}

// Snapshot thumbnail: render the first frame of the intro scene at a known timestamp.
// hyperframes snapshot CLI usage may vary; default assumption: snapshot at t=0.8s into the intro.
const snap = spawnSync('npx', [
  'hyperframes', 'snapshot',
  '--time', '0.8',
  '--output', 'snapshots/thumbnail.png',
], { cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
if (snap.status !== 0) { console.error('hyperframes snapshot failed — falling back to ffmpeg frame extraction'); }

// If snapshot didn't produce a file, extract a frame from the MP4 via ffmpeg as fallback.
const thumbPath = join(workDir, 'snapshots', 'thumbnail.png');
if (!existsSync(thumbPath)) {
  const ff = spawnSync('ffmpeg', ['-y', '-ss', '0.8', '-i', videoPath, '-vframes', '1', thumbPath], {
    encoding: 'utf8', shell: false, stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (ff.status !== 0 || !existsSync(thumbPath)) { console.error('thumbnail fallback failed'); process.exit(1); }
}

console.log(`OK video=${statSync(videoPath).size} bytes, thumbnail=${statSync(thumbPath).size} bytes`);
```

The `hyperframes snapshot` command may require different flags — confirm with `npx hyperframes snapshot --help` and adjust. ffmpeg fallback is defensive; remove it once snapshot is known good.

- [ ] **Step 3: Commit**

```bash
git add pipeline/lint.mjs pipeline/render.mjs
git commit -m "feat(pipeline): lint+validate wrappers, render with snapshot+ffmpeg-fallback thumbnail"
```

---

### Phase 5 milestone

Given Phase-4-output run dir, execute:

```bash
RUN=/tmp/studio-test
node pipeline/capture-screenshots.mjs $RUN
node pipeline/build-run-dir.mjs $RUN
# (Claude invokes yt-compose skill against $RUN → writes $RUN/index.html)
node pipeline/lint.mjs $RUN
node pipeline/render.mjs $RUN
```

Results in:
- `$RUN/index.html` (lint + validate clean)
- `$RUN/renders/video.mp4` (>100KB, duration ≈ `timings.total_duration_sec`)
- `$RUN/snapshots/thumbnail.png` (1920×1080)

Open `video.mp4`. Verify: scenes swap in sync with narration, every element enters from offscreen (none pop in), Swiss Pulse palette throughout, no `#3B82F6` anywhere. If visuals are wrong, iterate on the `yt-compose` skill prompt or run `/yt-preview` in Phase 6 for faster iteration.

---

## Phase 6 — Metadata, slash commands, end-to-end smoke

### Task 6.1: `.claude/skills/yt-metadata/SKILL.md`

**Files:**
- Create: `.claude/skills/yt-metadata/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: yt-metadata
description: Generate YouTube title, description with chapter timestamps, and tags for today's AI Daily video. Use after script.md + timings.json exist.
---

# yt-metadata

Write `<run-dir>/metadata.txt` for manual YouTube upload.

## Inputs

- `<run-dir>/script.md`
- `<run-dir>/picks.json`
- `<run-dir>/timings.json`

## Output

Write `<run-dir>/metadata.txt` in exactly this format:

```
TITLE: <title>

DESCRIPTION:
<1-sentence hook>

Chapters:
00:00 Intro
<MM:SS> Story 1 title
<MM:SS> Story 2 title
<MM:SS> Story 3 title
<MM:SS> Outro

Sources:
- <url 1>
- <url 2>
- <url 3>

TAGS: tag1, tag2, tag3, ...
```

### Title rules

- Max 60 characters.
- Lead with the specific subject of the lead story. Optional date suffix `| AI Daily YYYY-MM-DD` if it fits.
- No clickbait, no excessive caps, no `!!!`.

### Chapters

Take each scene's `start_sec` from `timings.json` and format as `MM:SS` (floor to seconds).

### Tags

8–12 tags, comma-separated, lowercase, no hashtags. Mix broad (`ai news`, `llm`) + specific (product names from the script).

## Hard rules

- Chapter timestamps must match `timings.json` exactly.
- Every URL in Sources must appear in the script's SOURCES section.
- No emoji.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/yt-metadata/SKILL.md
git commit -m "feat(skill): yt-metadata"
```

---

### Task 6.2: `setup.mjs` preflight

**Files:**
- Create: `pipeline/setup.mjs`

- [ ] **Step 1: Implement**

```js
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from './lib/sources.js';

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

check('Node >=22', () => {
  const [maj] = process.versions.node.split('.').map(Number);
  return maj >= 22 ? { ok: true } : { ok: false, msg: `got ${process.versions.node}` };
});

check('hyperframes doctor', () => {
  const r = spawnSync('npx', ['hyperframes', 'doctor'], { encoding: 'utf8', shell: true });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'run: npx hyperframes doctor manually to see details' };
});

check('ffmpeg on PATH', () => {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: false });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'ffmpeg not on PATH' };
});

check('Puppeteer installed', () => {
  return existsSync('node_modules/puppeteer') ? { ok: true } : { ok: false, msg: 'run: npm install' };
});

check('hyperframes installed', () => {
  return existsSync('node_modules/hyperframes') ? { ok: true } : { ok: false, msg: 'run: npm install' };
});

check('DESIGN.md exists', () => {
  return existsSync('DESIGN.md') ? { ok: true } : { ok: false, msg: 'create DESIGN.md per Task 0.4' };
});

check('config.json valid', () => {
  try { loadConfig(); return { ok: true }; } catch (e) { return { ok: false, msg: e.message }; }
});

let allOk = true;
for (const c of checks) {
  const r = c.fn();
  console.log(`[${r.ok ? 'OK' : 'FAIL'}] ${c.name}${r.msg ? ` — ${r.msg}` : ''}`);
  if (!r.ok) allOk = false;
}
process.exit(allOk ? 0 : 1);
```

- [ ] **Step 2: Run**

```bash
node pipeline/setup.mjs
```

Expected: all OK.

- [ ] **Step 3: Commit**

```bash
git add pipeline/setup.mjs
git commit -m "feat(pipeline): setup preflight checks"
```

---

### Task 6.3: Slash commands

**Files:**
- Create: `.claude/commands/yt-fetch.md`, `yt-research.md`, `yt-script.md`, `yt-render.md`, `yt-preview.md`, `yt-approve.md`, `yt-daily.md`

- [ ] **Step 1: `.claude/commands/yt-fetch.md`**

````markdown
---
name: yt-fetch
description: Acquire a new run folder and fetch AI/tech news sources. Produces items.json.
---

```bash
RUN=$(node -e "import('./pipeline/lib/run-id.js').then(m => { const r = m.acquireRun({ base: 'work', date: new Date().toISOString().slice(0,10) }); console.log(r.dir); })")
echo "$RUN" > .last-run
mkdir -p "$RUN/logs"
node pipeline/fetch-sources.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/fetch.log"
```

Report to the user: the run folder path and the number of items fetched (usable vs total).
````

- [ ] **Step 2: `.claude/commands/yt-research.md`**

````markdown
---
name: yt-research
description: Invoke yt-research skill against the current run's items.json.
---

Read `.last-run` for the run folder path. Invoke the `yt-research` skill targeting `$RUN/items.json`. The skill writes `$RUN/picks.json`.

Validate:

```bash
RUN=$(cat .last-run)
node -e "import('./pipeline/schemas/picks.js').then(({PicksFileSchema}) => { const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); PicksFileSchema.parse(d); console.log('OK'); })" "$RUN/picks.json"
```

Report the 3 picks by rank + headline to the user.
````

- [ ] **Step 3: `.claude/commands/yt-script.md`**

````markdown
---
name: yt-script
description: Invoke yt-script skill, verify claims, stop for script approval gate.
---

1. Read `.last-run`.
2. Invoke the `yt-script` skill against `$RUN/picks.json`, `$RUN/items.json`, and `DESIGN.md`. Skill writes `$RUN/script.md`, `$RUN/claims.json`, `$RUN/storyboard.md`, `$RUN/storyboard.json`.
3. Verify claims:

```bash
RUN=$(cat .last-run)
node pipeline/verify-claims.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/verify.log"
```

4. If verification fails, show the user `$RUN/claims-verification-report.md` and stop.
5. If pass, print `script.md` and the scene list from `storyboard.md` to the user and ask: **"Approve script, or request changes?"**

Do not proceed to `/yt-render` until the user says approved.
````

- [ ] **Step 4: `.claude/commands/yt-render.md`**

````markdown
---
name: yt-render
description: TTS → transcribe → compute timings → screenshots → build run dir → compose → lint → render → metadata. Stops at the MP4 approval gate.
---

Precondition: `.last-run` exists; `$RUN/script.md`, `$RUN/claims.json`, `$RUN/storyboard.json` exist; user approved the script. Refuse if `$RUN/claims-verified.json` is missing or has any failed claim.

```bash
RUN=$(cat .last-run)
mkdir -p "$RUN/logs"
node pipeline/build-narration-text.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/narration.log" || exit 1
node pipeline/tts.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/tts.log" || exit 1
node pipeline/transcribe.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/transcribe.log" || exit 1
node pipeline/compute-timings.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/timings.log" || exit 1
node pipeline/capture-screenshots.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/screenshots.log" || exit 1
node pipeline/build-run-dir.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/run-dir.log" || exit 1
```

Then invoke the `yt-compose` skill against `$RUN/` — it writes `$RUN/index.html`. After the skill completes:

```bash
RUN=$(cat .last-run)
node pipeline/lint.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/lint.log" || exit 1
node pipeline/render.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/render.log" || exit 1
```

Then invoke the `yt-metadata` skill — it writes `$RUN/metadata.txt`.

Tell the user: **"Draft video ready at `$RUN/renders/video.mp4`. Watch it and reply approve or reject."**

Do not invoke `/yt-approve` until the user says approved.
````

- [ ] **Step 5: `.claude/commands/yt-preview.md`**

````markdown
---
name: yt-preview
description: Open the Hyperframes studio on the current run for live iteration before MP4 render.
---

Precondition: `.last-run` exists; `$RUN/index.html` exists (from `yt-compose`); lint is clean.

```bash
RUN=$(cat .last-run)
cd "$RUN"
npx hyperframes preview
```

The studio opens in the browser with hot-reload. The user can scrub the timeline, see animations, and request changes. When they're satisfied, invoke `/yt-render` to produce MP4.
````

- [ ] **Step 6: `.claude/commands/yt-approve.md`**

````markdown
---
name: yt-approve
description: Move approved run from work/ to ready-to-upload/ and release lock.
---

```bash
RUN=$(cat .last-run)
TARGET="ready-to-upload/$(basename "$RUN")"
mkdir -p ready-to-upload
mv "$RUN" "$TARGET"
node -e "import('./pipeline/lib/run-id.js').then(m => m.releaseRun(process.argv[1]))" "$TARGET"
echo "$TARGET" > .last-run
echo "$TARGET"
```

Tell the user: "Ready to upload: `$TARGET`. Drag `renders/video.mp4` and `snapshots/thumbnail.png` into YouTube Studio, copy fields from `metadata.txt`."
````

- [ ] **Step 7: `.claude/commands/yt-daily.md`**

````markdown
---
name: yt-daily
description: Run the full pipeline end-to-end with both approval gates.
---

Run in order, stopping at each gate:

1. `/yt-fetch`
2. `/yt-research`
3. `/yt-script` — **Gate 1: script approval.** Wait for user "approve" before continuing.
4. `/yt-render` — **Gate 2: video approval.** Wait for user "approve" before continuing.
5. `/yt-approve`

If the user wants to iterate on visuals between `yt-compose` and `yt-render`, suggest `/yt-preview` — it opens the Hyperframes studio with hot-reload so they can see changes without a full render.

Do not chain past either gate without the user's explicit approval.
````

- [ ] **Step 8: Commit**

```bash
git add .claude/commands/
git commit -m "feat(commands): slash command orchestrators with two approval gates"
```

---

### Task 6.4: End-to-end smoke test

- [ ] **Step 1: Run full pipeline in Claude Code**

```
/yt-daily
```

Expected sequence:

1. `/yt-fetch` → `items.json` with ≥10 usable items.
2. `/yt-research` → `picks.json` with 3 picks, schema-validated.
3. `/yt-script` → `script.md` + `claims.json` + `storyboard.md` + `storyboard.json` + `claims-verified.json`. All claims pass.
4. **Gate 1:** User reviews script + storyboard. Approves.
5. `/yt-render` → narration.wav, transcript.json, timings.json, screenshots, index.html (via yt-compose skill), lint OK, validate OK, video.mp4, thumbnail.png, metadata.txt.
6. **Gate 2:** User watches `video.mp4`. Approves.
7. `/yt-approve` → `ready-to-upload/<date>-<run>/`.

- [ ] **Step 2: Manual upload, Unlisted first**

Drag `ready-to-upload/<date>-<run>/renders/video.mp4` and `snapshots/thumbnail.png` into YouTube Studio. Copy TITLE/DESCRIPTION/TAGS from `metadata.txt`. Publish as **Unlisted**. Share with 1–2 people for feedback before going Public.

- [ ] **Step 3: Retrospective**

Write a 1-page retro to `docs/superpowers/notes/2026-04-23-first-run-retro.md`: what broke, which feeds needed tuning, whether voice `af_nova` works or should be swapped, whether Swiss Pulse fits the channel, whether compose-skill prompt needs sharpening.

```bash
mkdir -p docs/superpowers/notes
# write notes...
git add docs/superpowers/notes/
git commit -m "docs: retro of first v2 end-to-end run"
```

---

### Phase 6 milestone

One Unlisted YouTube video exists, produced end-to-end through both approval gates. Retro committed with at least 3 concrete v2.1 improvement candidates.

---

## What's intentionally missing (roadmap for later)

- Daily scheduling / cron trigger (v2.1 — add a CronCreate-based `/yt-schedule`).
- Cross-day story dedup.
- "Nothing worth covering today" detection.
- Automated YouTube upload via Data API.
- Remote approval UX (Telegram / Discord / email).
- Portrait 1080×1920 Shorts variant.
- Shader transitions (`@hyperframes/shader-transitions`) replacing opacity crossfades — pick one block to install and wire once the base pipeline is stable.
- AI-generated imagery for stories without good screenshots.
- Thumbnail A/B testing.
- Analytics feedback loop from YouTube → research ranking.
- Background music bed with voiceover ducking.

Each is a meaningful v2.1+ sub-project deserving its own brainstorm + spec + plan.

---

## Known risks and mitigations

| Risk                                                                       | Likelihood | Mitigation                                                                              |
| -------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Hyperframes CLI flag surface differs between installed version and plan    | Medium     | Phase 0.2 smoke-tests render; each wrapper (tts/transcribe/render) documents checking `--help` |
| Kokoro `af_nova` voice quality doesn't fit channel                         | Low-med    | Swap voice via `config.json`; `npx hyperframes tts --list` for full catalog             |
| Claude-generated composition fails lint repeatedly                         | Medium     | yt-compose skill explicitly requires reading hyperframes SKILL.md first; lint gate before render |
| Article extraction fails for paywalled / Cloudflare-protected sites        | Medium     | Puppeteer handles most; if a specific site keeps failing, add it to `js_rendered_domains` or remove its feed |
| Swiss Pulse feels wrong after first watch                                  | Low-med    | DESIGN.md is one file to edit; swap to another named preset, re-run one episode         |
| Hyperframes `snapshot` CLI differs from assumption                         | Medium     | render.mjs falls back to ffmpeg frame extraction at t=0.8s                              |
| `hyperframes transcribe` output schema differs from `{ text, start, end }` | Medium     | `compute-timings.mjs` normalizes across several common shapes; if a new shape appears, extend |

---

## Execution note

This plan assumes linear execution. Phases 1–6 build on each other; don't skip milestones. If a phase milestone fails, stop and diagnose before continuing — a plan that compounds on broken foundations produces a broken video, which is worse than no video.
