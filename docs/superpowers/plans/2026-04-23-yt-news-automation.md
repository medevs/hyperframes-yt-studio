# AI Daily — YouTube News Automation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code-driven pipeline that produces one publishable 3–5 minute AI news video end-to-end (research → script → voiceover → slides → MP4), manually triggered, with two human approval gates and an automated fact-check gate.

**Architecture:** Claude Code skills handle LLM-heavy stages (research, script, metadata). Plain Node scripts under `pipeline/` handle deterministic stages (fetch, verify, TTS, render). Puppeteer-based scrapers are isolated under `pipeline/scrapers/` with their own `node_modules` to avoid Chromium conflicts with Hyperframes' bundled browser. Slash commands under `.claude/commands/` are thin orchestrators that spawn the scripts and invoke the skills. All intermediate artifacts land in `work/<YYYY-MM-DD>-<run>/` as inspectable files.

**Tech Stack:** Node 22+, Hyperframes (HTML/CSS → MP4), Puppeteer (screenshots + JS-rendered article fetching), `@mozilla/readability`, `rss-parser`, `edge-tts` (Python CLI), Piper (local TTS fallback), ffmpeg (loudnorm), Zod (schema validation), Vitest (tests).

**Related docs:** Spec at `docs/superpowers/specs/2026-04-23-yt-news-automation-design.md` — read sections you're implementing.

---

## Phase structure (at a glance)

- **Phase 0** — Project scaffold + git + preflight deps
- **Phase 1** — Shared lib (normalize-text, run-id, Zod schemas) with unit tests
- **Phase 2** — Fetch stage (RSS, HN, JS-rendered company blogs, dedup) → produces real `items.json`
- **Phase 3** — Research + script skills + claims verification → produces `script.md` + `claims.json` + `claims-verified.json`
- **Phase 4** — TTS (Edge + Piper fallback) + audio normalization → produces `voiceover.mp3` + `timings.json`
- **Phase 5** — Screenshots + templates + composition + render → produces `video.mp4` + `thumbnail.png`
- **Phase 6** — Metadata skill + slash commands + end-to-end smoke test

Each phase ends with a testable milestone. Don't start Phase N+1 until Phase N's milestone passes.

---

## File structure (target end-state)

```
studio/
├── .claude/
│   ├── skills/
│   │   ├── yt-research/SKILL.md
│   │   ├── yt-script/SKILL.md
│   │   └── yt-metadata/SKILL.md
│   └── commands/
│       ├── yt-daily.md
│       ├── yt-fetch.md
│       ├── yt-research.md
│       ├── yt-script.md
│       ├── yt-render.md
│       └── yt-approve.md
├── pipeline/
│   ├── setup.mjs
│   ├── fetch-sources.mjs
│   ├── verify-claims.mjs
│   ├── tts.mjs
│   ├── normalize-audio.mjs
│   ├── build-composition.mjs
│   ├── render.mjs
│   ├── scrapers/
│   │   ├── package.json
│   │   ├── capture-screenshots.mjs
│   │   └── fetch-article-text.mjs
│   ├── schemas/
│   │   ├── items.js
│   │   ├── picks.js
│   │   ├── claims.js
│   │   ├── timings.js
│   │   ├── screenshots-manifest.js
│   │   └── config.js
│   └── lib/
│       ├── sources.js
│       ├── dedup.js
│       ├── run-id.js
│       └── normalize-text.js
├── templates/
│   ├── intro.html
│   ├── story-card.html
│   ├── story-card-text-fallback.html
│   ├── outro.html
│   └── thumbnail.html
├── tests/
│   ├── normalize-text.test.js
│   ├── run-id.test.js
│   ├── dedup.test.js
│   ├── build-composition.test.js
│   ├── verify-claims.test.js
│   ├── schemas.test.js
│   └── fixtures/
├── work/                          # gitignored
├── ready-to-upload/               # gitignored
├── archive/                       # gitignored
├── config.json
├── package.json
└── .gitignore
```

---

## Phase 0 — Scaffold

### Task 0.1: Initialize git repo

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Run git init and make initial commit of existing spec**

Run in `C:\Users\ahmed.oublihi\Projects\studio`:

```bash
git init
git add docs/
git commit -m "chore: initial spec and plan"
```

Expected: first commit contains both spec and plan under `docs/superpowers/`.

- [ ] **Step 2: Write `.gitignore`**

Create `.gitignore`:

```gitignore
node_modules/
pipeline/scrapers/node_modules/
work/
ready-to-upload/
archive/
*.log
.env
.env.local
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore"
```

---

### Task 0.2: Create root `package.json`

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ai-daily-yt",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "setup": "node pipeline/setup.mjs"
  },
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "hyperframes": "0.1.0",
    "jsdom": "^24.0.0",
    "rss-parser": "^3.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

Pin `hyperframes` to an exact version — its v0.x API may shift. Pick the latest available at install time and commit it; do not let `^` drift.

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: `node_modules/` populated, `package-lock.json` created. If Hyperframes install fails, check Node version is ≥22.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: root package.json with pinned hyperframes"
```

---

### Task 0.3: Create `pipeline/scrapers/` isolated subpackage

**Files:**
- Create: `pipeline/scrapers/package.json`

- [ ] **Step 1: Make the directory and write `pipeline/scrapers/package.json`**

```bash
mkdir -p pipeline/scrapers
```

`pipeline/scrapers/package.json`:

```json
{
  "name": "ai-daily-scrapers",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": { "node": ">=22" },
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "jsdom": "^24.0.0",
    "puppeteer": "^22.0.0"
  }
}
```

This is deliberately a separate `node_modules` tree. Puppeteer's bundled Chromium lives here, isolated from Hyperframes' Chromium in the root `node_modules`.

- [ ] **Step 2: Install scraper deps**

```bash
cd pipeline/scrapers
npm install
cd ../..
```

Expected: Puppeteer downloads Chromium (~150 MB). If this fails on Windows, check firewall/proxy.

- [ ] **Step 3: Commit**

```bash
git add pipeline/scrapers/package.json pipeline/scrapers/package-lock.json
git commit -m "chore: isolated scrapers subpackage with puppeteer"
```

---

### Task 0.4: Create directory skeleton

**Files:**
- Create: `pipeline/schemas/`, `pipeline/lib/`, `templates/`, `tests/fixtures/`, `.claude/skills/`, `.claude/commands/`

- [ ] **Step 1: Create empty directories with `.gitkeep`**

```bash
mkdir -p pipeline/schemas pipeline/lib templates tests/fixtures .claude/skills .claude/commands
touch pipeline/schemas/.gitkeep pipeline/lib/.gitkeep templates/.gitkeep tests/fixtures/.gitkeep .claude/skills/.gitkeep .claude/commands/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/ templates/ tests/ .claude/
git commit -m "chore: scaffold empty directories"
```

---

### Task 0.5: Write `config.json` starter

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
    "provider": "edge",
    "fallback": "piper",
    "voice_id": "en-US-AriaNeural",
    "rate": "+5%",
    "piper_voice_model": "en_US-lessac-medium"
  },
  "audio": { "target_lufs": -14, "true_peak_db": -1.5, "lra": 11 },
  "video": { "width": 1920, "height": 1080, "fps": 30, "target_duration_sec": 240 },
  "channel": { "name": "AI Daily", "accent_color": "#3B82F6" }
}
```

Note: exact RSS URLs are a starting guess. You will validate and tune them when `fetch-sources.mjs` runs for the first time in Phase 2.

- [ ] **Step 2: Commit**

```bash
git add config.json
git commit -m "chore: starter config.json"
```

---

### Phase 0 milestone

- `git log` shows ~5 commits.
- `npm test` runs (zero tests, but Vitest exits 0).
- `node --version` prints ≥ v22.
- `pipeline/scrapers/node_modules/puppeteer` exists.
- `node_modules/hyperframes` exists.

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

  it('unifies dashes', () => {
    expect(normalizeForMatching('a–b')).toBe('a-b');
    expect(normalizeForMatching('a—b')).toBe('a-b');
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
    // Deliberate: semantic, not typographic
    expect(normalizeForMatching('3x')).not.toBe(normalizeForMatching('three times'));
  });

  it('composed example: matches two equivalent-but-different strings', () => {
    const a = 'It’s 3× faster—really.';
    const b = "It's 3x faster - really.";
    // Note: 3× vs 3x uses U+00D7 vs 'x'. That's typographic (NFKC handles it).
    expect(normalizeForMatching(a)).toBe(normalizeForMatching(b));
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- normalize-text
```

Expected: FAIL — module not found.

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
    .replace(/[–—−‐‑]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  -​  　]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.toLowerCase();
  return s;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- normalize-text
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/normalize-text.js tests/normalize-text.test.js
git commit -m "feat(lib): normalize-text with NFKC, dashes, quotes, entities, NBSP"
```

---

### Task 1.2: `lib/run-id.js` + tests

**Files:**
- Create: `pipeline/lib/run-id.js`
- Test: `tests/run-id.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/run-id.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireRun, releaseRun, isLockStale } from '../pipeline/lib/run-id.js';

let base;
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'runid-')); });
afterEach(() => { rmSync(base, { recursive: true, force: true }); });

describe('acquireRun', () => {
  it('creates work/<date>-1 on first call', () => {
    const r = acquireRun({ base, date: '2026-04-23' });
    expect(r.dir.endsWith('2026-04-23-1')).toBe(true);
    expect(existsSync(r.dir)).toBe(true);
    expect(existsSync(join(r.dir, '.lock'))).toBe(true);
  });

  it('increments suffix when a previous run exists', () => {
    acquireRun({ base, date: '2026-04-23' });
    const r2 = acquireRun({ base, date: '2026-04-23' });
    expect(r2.dir.endsWith('2026-04-23-2')).toBe(true);
  });

  it('refuses to reuse a dir whose lock is held by a live PID', () => {
    const r1 = acquireRun({ base, date: '2026-04-23' });
    // Write our own PID (live) to the lock
    writeFileSync(join(r1.dir, '.lock'), String(process.pid));
    const r2 = acquireRun({ base, date: '2026-04-23' });
    expect(r2.dir).not.toBe(r1.dir);
  });

  it('does not reuse an existing dir even if its lock is stale', () => {
    const r1 = acquireRun({ base, date: '2026-04-23' });
    writeFileSync(join(r1.dir, '.lock'), '999999'); // stale PID
    const r2 = acquireRun({ base, date: '2026-04-23' });
    // v1 policy: always monotonic increment. Never reuse a dir.
    expect(r2.dir).not.toBe(r1.dir);
    expect(r2.dir.endsWith('2026-04-23-2')).toBe(true);
  });
});

describe('releaseRun', () => {
  it('removes the lock file', () => {
    const r = acquireRun({ base, date: '2026-04-23' });
    releaseRun(r.dir);
    expect(existsSync(join(r.dir, '.lock'))).toBe(false);
  });
});

describe('isLockStale', () => {
  it('true for a non-existent PID', () => {
    expect(isLockStale('999999')).toBe(true);
  });

  it('false for the current process PID', () => {
    expect(isLockStale(String(process.pid))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- run-id
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/lib/run-id.js`**

```js
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function isLockStale(pidString) {
  const pid = parseInt(pidString, 10);
  if (!Number.isFinite(pid) || pid <= 0) return true;
  try {
    // signal 0 = probe; throws if no such process, or EPERM if exists but not ours
    process.kill(pid, 0);
    return false;
  } catch (err) {
    if (err.code === 'EPERM') return false; // exists, just not owned by us
    return true;
  }
}

function isLockedLive(dir) {
  const lockFile = join(dir, '.lock');
  if (!existsSync(lockFile)) return false;
  const pid = readFileSync(lockFile, 'utf8').trim();
  return !isLockStale(pid);
}

export function acquireRun({ base, date }) {
  if (!existsSync(base)) mkdirSync(base, { recursive: true });
  const existing = readdirSync(base).filter(n => n.startsWith(`${date}-`));
  const suffixes = existing
    .map(n => parseInt(n.slice(date.length + 1), 10))
    .filter(n => Number.isFinite(n));
  let next = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 1;
  // If the highest existing is NOT live-locked and doesn't hold content we care about,
  // we still increment — never reuse. Reuse is explicitly out of scope.
  while (true) {
    const dir = join(base, `${date}-${next}`);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '.lock'), String(process.pid));
      return { dir, runNumber: next };
    }
    if (isLockedLive(dir)) {
      next += 1;
      continue;
    }
    // Dir exists but not live-locked; still don't reuse — bump suffix.
    next += 1;
  }
}

export function releaseRun(dir) {
  const lockFile = join(dir, '.lock');
  if (existsSync(lockFile)) rmSync(lockFile, { force: true });
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- run-id
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/run-id.js tests/run-id.test.js
git commit -m "feat(lib): run-id allocator with PID-based lock staleness"
```

---

### Task 1.3: Zod schemas

**Files:**
- Create: `pipeline/schemas/items.js`, `picks.js`, `claims.js`, `timings.js`, `screenshots-manifest.js`, `config.js`
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

`pipeline/schemas/timings.js`:

```js
import { z } from 'zod';

export const TimingsFileSchema = z.object({
  audio_file: z.string(),
  total_duration_sec: z.number().positive(),
  paragraphs: z.array(z.object({
    section: z.string(),
    paragraph_index: z.number().int().nonnegative(),
    start_sec: z.number().nonnegative(),
    duration_sec: z.number().positive(),
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
    provider: z.enum(['edge', 'piper', 'google']),
    fallback: z.enum(['edge', 'piper', 'google']),
    voice_id: z.string(),
    rate: z.string(),
    piper_voice_model: z.string(),
  }),
  audio: z.object({
    target_lufs: z.number().negative(),
    true_peak_db: z.number().negative(),
    lra: z.number().positive(),
  }),
  video: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    target_duration_sec: z.number().positive(),
  }),
  channel: z.object({
    name: z.string(),
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
import { TimingsFileSchema } from '../pipeline/schemas/timings.js';
import { ConfigSchema } from '../pipeline/schemas/config.js';

describe('ItemsFileSchema', () => {
  it('accepts a valid items file', () => {
    const valid = {
      fetched_at: '2026-04-23T08:00:00Z',
      items: [{
        id: 'hn-1', source: 'hackernews',
        source_url: 'https://news.ycombinator.com/item?id=1',
        external_url: 'https://example.com/a',
        title: 'x', summary: 'y',
        published_at: '2026-04-23T06:00:00Z',
        signals: { hn_points: 100 },
      }],
    };
    expect(() => ItemsFileSchema.parse(valid)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => ItemsFileSchema.parse({ fetched_at: 'x', items: [{ id: '1' }] })).toThrow();
  });
});

describe('PicksFileSchema', () => {
  it('requires exactly 3 picks', () => {
    const tooFew = {
      date: '2026-04-23',
      picks: [{ rank: 1, item_id: 'x', angle: 'a', rationale: 'r', suggested_visuals: [], risk_flags: [] }],
      rejected: [],
    };
    expect(() => PicksFileSchema.parse(tooFew)).toThrow();
  });
});

describe('ClaimsFileSchema', () => {
  it('accepts an empty claims array', () => {
    expect(() => ClaimsFileSchema.parse({ claims: [] })).not.toThrow();
  });
});

describe('TimingsFileSchema', () => {
  it('requires at least one paragraph', () => {
    expect(() => TimingsFileSchema.parse({
      audio_file: 'a.mp3', total_duration_sec: 10, paragraphs: [],
    })).toThrow();
  });
});

describe('ConfigSchema', () => {
  it('accepts the checked-in config.json', () => {
    const raw = JSON.parse(readFileSync('config.json', 'utf8'));
    expect(() => ConfigSchema.parse(raw)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect all pass**

```bash
npm test -- schemas
```

Expected: all tests PASS. If `ConfigSchema` fails, the config.json from Phase 0 is wrong — fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add pipeline/schemas/ tests/schemas.test.js
git commit -m "feat(schemas): zod schemas for items/picks/claims/timings/config"
```

---

### Phase 1 milestone

`npm test` runs all unit tests (normalize-text, run-id, schemas) and they all pass.

---

## Phase 2 — Fetch stage → produces real `items.json`

### Task 2.1: `lib/dedup.js` + tests

**Files:**
- Create: `pipeline/lib/dedup.js`
- Test: `tests/dedup.test.js`

- [ ] **Step 1: Write failing tests**

`tests/dedup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { dedupItems } from '../pipeline/lib/dedup.js';

describe('dedupItems', () => {
  it('collapses duplicates by external_url', () => {
    const items = [
      { id: 'rss-1', source: 'rss', external_url: 'https://example.com/a', signals: {} },
      { id: 'hn-2', source: 'hackernews', external_url: 'https://example.com/a', signals: { hn_points: 500 } },
    ];
    const out = dedupItems(items);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('hn-2'); // HN entry had the stronger signal
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

- [ ] **Step 3: Implement `pipeline/lib/dedup.js`**

```js
function signalStrength(item) {
  const pts = item.signals?.hn_points ?? 0;
  const cmts = item.signals?.hn_comments ?? 0;
  return pts + cmts;
}

function sourcePriority(source) {
  // Ties broken by source priority (higher = preferred)
  return { hackernews: 3, company_blog: 2, rss: 1 }[source] ?? 0;
}

export function dedupItems(items) {
  const byUrl = new Map();
  for (const it of items) {
    const key = it.external_url;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, it);
      continue;
    }
    const a = signalStrength(it), b = signalStrength(existing);
    if (a > b) byUrl.set(key, it);
    else if (a === b && sourcePriority(it.source) > sourcePriority(existing.source)) {
      byUrl.set(key, it);
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

- [ ] **Step 2: Smoke test manually**

```bash
node -e "import('./pipeline/lib/sources.js').then(m => console.log(m.loadConfig().channel.name))"
```

Expected: prints `AI Daily`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/lib/sources.js
git commit -m "feat(lib): config loader with zod validation + domain helper"
```

---

### Task 2.3: `scrapers/fetch-article-text.mjs` (Puppeteer for JS-rendered)

**Files:**
- Create: `pipeline/scrapers/fetch-article-text.mjs`

- [ ] **Step 1: Implement**

`pipeline/scrapers/fetch-article-text.mjs`:

```js
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const [, , url, outPath] = process.argv;
if (!url || !outPath) {
  console.error('usage: node fetch-article-text.mjs <url> <out-path>');
  process.exit(2);
}

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (compatible; ai-daily-bot/0.1)');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  const html = await page.content();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();
  const text = parsed?.textContent?.trim() ?? '';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, text, 'utf8');
  console.log(`OK ${text.length} chars → ${outPath}`);
  process.exit(text.length >= 500 ? 0 : 3);
} catch (err) {
  console.error('FAIL', err.message);
  process.exit(1);
} finally {
  await browser.close();
}
```

Exit codes: 0 = success (≥500 chars), 3 = success but text too short, 1 = error, 2 = usage.

- [ ] **Step 2: Smoke test against a known JS-rendered URL**

```bash
node pipeline/scrapers/fetch-article-text.mjs https://www.anthropic.com/news /tmp/test-article.txt
echo "exit=$?"
```

Expected: exit 0 or 3, prints character count, file exists with content. First run downloads Chromium if not cached.

If exit is nonzero consistently, inspect stderr. Common causes on Windows: missing VC++ redistributables, path issues. Log any fix in `docs/superpowers/specs/2026-04-23-yt-news-automation-design.md` → "Open issues".

- [ ] **Step 3: Commit**

```bash
git add pipeline/scrapers/fetch-article-text.mjs
git commit -m "feat(scrapers): puppeteer article-text fetcher for JS-rendered pages"
```

---

### Task 2.4: `fetch-sources.mjs` (RSS + HN + per-domain dispatch)

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
    return json.hits
      .filter(h => h.url)
      .map(h => ({
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

function plainFetchAndExtract(url) {
  return fetch(url, { headers: { 'user-agent': 'ai-daily-bot/0.1' } })
    .then(r => r.text())
    .then(html => {
      const dom = new JSDOM(html, { url });
      return new Readability(dom.window.document).parse()?.textContent?.trim() ?? '';
    });
}

function jsRenderedFetch(url, outPath) {
  const res = spawnSync('node', ['pipeline/scrapers/fetch-article-text.mjs', url, outPath], {
    cwd: 'pipeline/scrapers',
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 60000,
  });
  return res.status === 0;
}

async function extractArticleText(item) {
  const outPath = join(articlesDir, `${item.id}.txt`);
  try {
    if (isJsRenderedDomain(item.external_url, config.sources.js_rendered_domains)) {
      const ok = jsRenderedFetch(item.external_url, outPath);
      if (!ok) return { failed: true };
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

// Main
const rssResults = await Promise.all([
  ...config.sources.rss.map(u => fetchRss(u, 'rss')),
  ...config.sources.company_blogs.map(u => fetchRss(u, 'company_blog')),
]);
const hn = await fetchHackerNews(config.sources.hackernews);
const raw = [...rssResults.flat(), ...hn];
const deduped = dedupItems(raw);

// Extract article text in parallel (cap concurrency rough-and-ready)
const enriched = [];
for (const item of deduped) {
  const r = await extractArticleText(item);
  if (r.failed) enriched.push({ ...item, text_extraction_failed: true });
  else enriched.push({ ...item, article_text_path: r.path });
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
console.log(`OK ${enriched.length} items (${usable.length} with usable text) → ${workDir}/items.json`);
```

- [ ] **Step 2: Run against a temporary work dir**

```bash
mkdir -p /tmp/studio-test
node pipeline/fetch-sources.mjs /tmp/studio-test
```

Expected: runs for 30–120s, outputs `items.json` with ≥10 usable items. If it fails with "only N items with usable text", inspect `fetch-errors.json` and consider: which RSS feeds are broken? Is the HN min_points filtering too aggressively? Which JS-rendered domain failed? Update `config.json` as needed and re-run.

- [ ] **Step 3: Validate output against schema**

```bash
node -e "import('./pipeline/schemas/items.js').then(({ItemsFileSchema}) => ItemsFileSchema.parse(JSON.parse(require('fs').readFileSync('/tmp/studio-test/items.json', 'utf8'))) && console.log('OK'))"
```

Expected: prints `OK`. If throws, inspect the bad item.

- [ ] **Step 4: Commit**

```bash
git add pipeline/fetch-sources.mjs
git commit -m "feat(pipeline): fetch-sources with RSS, HN, per-domain article extraction"
```

---

### Phase 2 milestone

`node pipeline/fetch-sources.mjs /tmp/studio-test` produces a schema-valid `items.json` with ≥10 items whose article text was successfully extracted. Inspect 3-5 article files manually to confirm content looks like actual article body, not nav chrome.

---

## Phase 3 — Research + script skills + claims verification

### Task 3.1: `.claude/skills/yt-research/SKILL.md`

**Files:**
- Create: `.claude/skills/yt-research/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: yt-research
description: Rank and pick the 3 most newsworthy AI/tech stories for a builder-focused daily recap video from a batch of fetched items. Use when you have an items.json file and need to produce picks.json.
---

# yt-research

Pick the 3 stories for today's AI Daily video.

## Inputs

The calling command will point you at:

- `work/<date>-<run>/items.json` — all fetched items, schema defined at `pipeline/schemas/items.js`.

You may read the article text at `items[i].article_text_path` (relative to work dir) to inform your picks. Skip items flagged `text_extraction_failed: true` — you cannot fact-check them later, so they cannot be picked.

## Audience and angle

**Audience: builders shipping AI products.** For each candidate, ask: *what does this mean for someone actually building with AI?* Favor:

- Model releases / API changes that affect integration choices.
- Tooling, agent frameworks, infra changes that builders adopt.
- Open-weights / local model advances (differentiation for this channel).
- Concrete product launches from labs (OpenAI / Anthropic / Google DeepMind / Meta).
- Notable failures, retractions, or security issues in shipped AI systems.

Deprioritize:

- Funding round announcements without product substance.
- Celebrity executive drama.
- Aggregator repeats of stories already covered yesterday (for v1 without cross-day dedup, use your judgment on whether a story feels "fresh").
- Vague "AI will change everything" opinion pieces.

## Output

Write to `work/<date>-<run>/picks.json`. Schema at `pipeline/schemas/picks.js`. Must parse cleanly.

- **Exactly 3 picks**, ranked 1 (lead) to 3.
- For each pick:
  - `item_id` — must exist in items.json.
  - `angle` — one sentence: the builder-focused hook. What will be said in the video's opening line for this story.
  - `rationale` — one-two sentences: why this over alternatives.
  - `suggested_visuals` — 2-3 short strings, e.g. `["OpenAI blog screenshot", "benchmark comparison chart"]`.
  - `risk_flags` — array; populate with any of: `"rumor_only"`, `"single_source"`, `"unverifiable_claim"`, `"potential_copyright"`. Empty if none apply.
- `rejected` — list any strong-but-not-picked candidates with a short reason. This is the audit trail for later tuning.

## Hard rules

- Never pick an item with `text_extraction_failed: true`.
- Never reference an item_id that doesn't appear in items.json.
- If fewer than 3 usable items exist, stop and report the problem to the caller — do not invent a third pick.

## After writing

Validate your output by running:

```bash
node -e "import('./pipeline/schemas/picks.js').then(({PicksFileSchema}) => PicksFileSchema.parse(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))) && console.log('OK'))" work/<date>-<run>/picks.json
```

If validation fails, fix and re-write.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/yt-research/SKILL.md
git commit -m "feat(skill): yt-research — builder-focused story ranking"
```

---

### Task 3.2: `.claude/skills/yt-script/SKILL.md`

**Files:**
- Create: `.claude/skills/yt-script/SKILL.md`

- [ ] **Step 1: Write the skill**

````markdown
---
name: yt-script
description: Write the voiceover script and claims.json for today's 3-story AI daily video, given picks.json and the article texts. Every factual claim must be backed by a verbatim quote from a fetched source. Use when picks.json exists and you need script.md.
---

# yt-script

Write `script.md` and `claims.json` for today's video.

## Inputs

- `work/<date>-<run>/picks.json` — the 3 picks (schema: `pipeline/schemas/picks.js`).
- `work/<date>-<run>/items.json` — full item list. Use `article_text_path` to read the source article for each pick.

Read the full article text for each of the 3 picks before writing anything.

## Tone

- Builder-focused: every story paragraph must end with a sentence that answers "what this means for people building with AI" — explicit, concrete, not hand-wavy.
- Skeptical when warranted. If a claim is clearly a press release number (e.g. "state-of-the-art on all benchmarks"), say so. Do not hype.
- No clickbait in the narration. No "you won't believe", no rhetorical questions to the audience, no phrases like "this changes everything".
- Conversational, not stiff. Short sentences. One idea per sentence.

## Target length

~240 seconds total voiceover (~600 words at normal pace). Budget:

- INTRO: 15s / ~40 words.
- STORY 1 (lead): 70-80s / ~190 words.
- STORY 2: 70s / ~170 words.
- STORY 3: 65s / ~160 words.
- OUTRO: 10-15s / ~40 words.

Pacing is a hint, not a hard constraint. The renderer uses actual measured TTS durations.

## Output 1: `work/<date>-<run>/script.md`

```markdown
---
date: <YYYY-MM-DD>
target_duration_sec: 240
voice_id: en-US-AriaNeural
word_count: <your count>
---

## INTRO (15s)
<opening line that name-checks the 3 stories>

## STORY 1 — <short title> (75s)
<narration with [^N] footnotes on every factual claim>

## STORY 2 — <short title> (70s)
...

## STORY 3 — <short title> (65s)
...

## OUTRO (12s)
<closer>

## SOURCES
[^1]: <url> (item_id: <id>)
[^2]: ...
```

- **Every factual claim gets a footnote `[^N]`.** A "factual claim" = any assertion about the world that could be right or wrong: numbers, release dates, benchmark results, quotations, names of features, comparisons between products. Anything the audience might check.
- Soft language ("this seems significant", "it's plausible that") does not need a footnote because it's framed as opinion — but keep it honest.
- Footnotes are numbered sequentially across the whole script (not restarted per section).
- Every footnote must appear in the SOURCES section with a URL and `item_id`.

## Output 2: `work/<date>-<run>/claims.json`

Schema: `pipeline/schemas/claims.js`.

For every footnoted claim in the script, emit one entry in `claims.json`:

```json
{
  "claims": [
    {
      "id": 1,
      "section": "STORY 1",
      "claim_text": "It beats GPT-5 on every benchmark at one-third the cost.",
      "supporting_quote": "...the EXACT verbatim substring from the source article...",
      "source_item_id": "hn-39284710",
      "source_url": "https://openai.com/blog/gpt-5-turbo"
    }
  ]
}
```

### The absolute rule for `supporting_quote`

**Copy-paste, do not paraphrase.** The `supporting_quote` must be a substring of the source article's text, character for character, that directly supports the claim. A downstream script (`verify-claims.mjs`) checks this automatically — any mismatch blocks the pipeline. If you cannot find a verbatim substring that supports a claim, rewrite the claim so it can be supported, or cut the claim entirely. Do not rewrite the quote.

The claim_text itself may be a paraphrase (that's natural narration). Only the supporting_quote must be verbatim from the article.

### What counts as verbatim

The verifier normalizes whitespace, smart quotes, dashes, NBSP, HTML entities, and case. It does NOT normalize numeric paraphrase ("3x" vs "three times") or rewording. If you're tempted to adjust the quote to "fix" a minor typo in the source, don't — either the source has that typo in its real text (so the verbatim match will work once normalized) or you're paraphrasing (forbidden).

## Hard rules

- No claim may appear in the script that cannot be grounded in a fetched source. If the article doesn't support it, omit it.
- Do not invent numbers. If the source rounds, you round the same way.
- If a story genuinely has no concrete factual substance beyond "X happened, here's what was announced", write it that way — do not pad with invented context.
- Never mix sources: if STORY 1 is about OpenAI and STORY 2 is about Anthropic, do not drop an Anthropic quote into STORY 1's claims.

## After writing

Validate:

```bash
node -e "import('./pipeline/schemas/claims.js').then(({ClaimsFileSchema}) => ClaimsFileSchema.parse(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))) && console.log('OK'))" work/<date>-<run>/claims.json
```

And self-check footnote consistency: every `[^N]` in the script appears in SOURCES and in `claims.json`.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/yt-script/SKILL.md
git commit -m "feat(skill): yt-script with claims.json discipline and verbatim-quote rule"
```

---

### Task 3.3: `verify-claims.mjs` + tests

**Files:**
- Create: `pipeline/verify-claims.mjs`
- Test: `tests/verify-claims.test.js`

- [ ] **Step 1: Write failing tests**

`tests/verify-claims.test.js`:

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
    expect(r.results).toHaveLength(2);
    expect(r.results[0].pass).toBe(true);
    expect(r.results[1].pass).toBe(false);
  });
});
```

Note: we're testing the pure functions. The CLI binary `verify-claims.mjs` will be a thin wrapper.

- [ ] **Step 2: Run — fail**

```bash
npm test -- verify-claims
```

- [ ] **Step 3: Implement pure logic in `pipeline/verify-claims.js`**

```js
import { normalizeForMatching } from './lib/normalize-text.js';

export function checkClaim({ supporting_quote, sourceText }) {
  const q = normalizeForMatching(supporting_quote);
  const src = normalizeForMatching(sourceText);
  if (!q) return { pass: false, reason: 'empty_quote' };
  if (!src) return { pass: false, reason: 'empty_source' };
  const idx = src.indexOf(q);
  if (idx === -1) return { pass: false, reason: 'not_found', excerpt: null };
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

- [ ] **Step 5: Write the CLI wrapper `pipeline/verify-claims.mjs`**

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
  console.error(`FAIL: ${failed.length} of ${result.results.length} claims unverified. See claims-verification-report.md`);
  process.exit(1);
}

console.log(`OK: ${result.results.length} claims verified.`);
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/verify-claims.js pipeline/verify-claims.mjs tests/verify-claims.test.js
git commit -m "feat(pipeline): verify-claims with verbatim quote match and report"
```

---

### Phase 3 milestone

Run the research + script skills manually against a Phase-2-generated `items.json`:

1. In Claude Code, invoke `yt-research` skill on `/tmp/studio-test/items.json` → produces `picks.json`.
2. Invoke `yt-script` skill → produces `script.md` + `claims.json`.
3. Run `node pipeline/verify-claims.mjs /tmp/studio-test`.

Expected: all claims pass. If they don't, read the report, decide whether it's a normalization bug (broaden `normalize-text.js`) or a script-skill bug (tune the prompt) and iterate.

---

## Phase 4 — TTS + audio normalization

### Task 4.1: `tts.mjs` Edge TTS primary

**Files:**
- Create: `pipeline/tts.mjs`

- [ ] **Step 1: Install edge-tts Python package**

```bash
pip install edge-tts
edge-tts --list-voices | head
```

Expected: list of voices including `en-US-AriaNeural`. If `pip` or `edge-tts` is missing, install Python 3.10+ first. Document the install path in the spec's Open Issues if Windows-specific gotchas surface.

- [ ] **Step 2: Implement edge provider**

`pipeline/tts.mjs`:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { loadConfig } from './lib/sources.js';
import { TimingsFileSchema } from './schemas/timings.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node tts.mjs <work-dir>'); process.exit(2); }
const config = loadConfig();

function parseScript(md) {
  // Returns [{ section, paragraph_index, text }]
  const lines = md.split('\n');
  const out = [];
  let section = null, paraIdx = 0, buf = [];
  const flush = () => {
    if (!section) return;
    const text = buf.join(' ').trim();
    if (text) { out.push({ section, paragraph_index: paraIdx, text }); paraIdx += 1; }
    buf = [];
  };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      const header = line.slice(3).trim();
      if (header === 'SOURCES') { section = null; continue; }
      section = header.replace(/\s*\(\d+s\)$/, ''); // strip "(15s)" hints
      paraIdx = 0;
    } else if (line.trim() === '') {
      flush();
    } else if (section) {
      // strip footnotes like [^1] for TTS
      buf.push(line.replace(/\[\^\d+\]/g, '').trim());
    }
  }
  flush();
  return out.filter(p => !p.section.startsWith('---')); // defensive: skip frontmatter leakage
}

function ttsEdge({ paragraphs, voice, rate, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const pieces = [];
  for (const p of paragraphs) {
    const pieceOut = join(outDir, `p-${p.section.replace(/\s+/g, '_')}-${p.paragraph_index}.mp3`);
    const args = ['-m', 'edge_tts', '--voice', voice, '--rate', rate, '--text', p.text, '--write-media', pieceOut];
    const r = spawnSync('python', args, { encoding: 'utf8', shell: false });
    if (r.status !== 0) throw new Error(`edge-tts failed: ${r.stderr}`);
    pieces.push({ ...p, path: pieceOut });
  }
  return pieces;
}

// Concatenation + duration measurement via ffmpeg
function concatAndMeasure(pieces, outPath) {
  const listPath = outPath + '.list';
  writeFileSync(listPath, pieces.map(p => `file '${p.path.replace(/'/g, "'\\''")}'`).join('\n'));
  let concat = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath], { encoding: 'utf8' });
  if (concat.status !== 0) throw new Error(`ffmpeg concat failed: ${concat.stderr}`);
  // Measure each piece's duration
  const timings = [];
  let cursor = 0;
  for (const p of pieces) {
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', p.path], { encoding: 'utf8' });
    const dur = parseFloat(probe.stdout.trim());
    if (!Number.isFinite(dur) || dur <= 0) throw new Error(`bad duration for ${p.path}`);
    timings.push({ section: p.section, paragraph_index: p.paragraph_index, start_sec: cursor, duration_sec: dur });
    cursor += dur;
  }
  return { totalDuration: cursor, timings };
}

// Main
const script = readFileSync(join(workDir, 'script.md'), 'utf8');
const paragraphs = parseScript(script);
if (paragraphs.length === 0) { console.error('no paragraphs parsed from script'); process.exit(1); }

const piecesDir = join(workDir, 'tts-pieces');
const rawOut = join(workDir, 'voiceover-raw.mp3');

let provider = config.tts.provider, pieces, error;
try {
  pieces = ttsEdge({ paragraphs, voice: config.tts.voice_id, rate: config.tts.rate, outDir: piecesDir });
} catch (err) {
  error = err;
  console.error(`primary TTS (${provider}) failed: ${err.message}; falling back to ${config.tts.fallback}`);
  provider = config.tts.fallback;
  // Piper fallback implemented in next task; for now re-throw if fallback is piper and not yet implemented.
  throw err;
}

const { totalDuration, timings } = concatAndMeasure(pieces, rawOut);
const meta = { provider_used: provider, error: error?.message ?? null };
writeFileSync(join(workDir, 'voiceover-meta.json'), JSON.stringify(meta, null, 2));

const timingsFile = { audio_file: 'voiceover-raw.mp3', total_duration_sec: totalDuration, paragraphs: timings };
TimingsFileSchema.parse(timingsFile);
writeFileSync(join(workDir, 'timings.json'), JSON.stringify(timingsFile, null, 2));
console.log(`OK ${provider} — ${totalDuration.toFixed(1)}s, ${pieces.length} paragraphs → ${rawOut}`);
```

- [ ] **Step 3: Smoke-test on a hand-written mini script**

```bash
cat > /tmp/studio-test/script.md <<'EOF'
---
date: 2026-04-23
target_duration_sec: 240
voice_id: en-US-AriaNeural
word_count: 30
---

## INTRO (5s)
Good morning. Today we look at one tiny test.

## STORY 1 — Test (5s)
This is a test sentence. It should produce audio.

## OUTRO (3s)
Thanks for watching.

## SOURCES
EOF
node pipeline/tts.mjs /tmp/studio-test
```

Expected: `voiceover-raw.mp3` created, `timings.json` validates, total duration ~10-15s, `voiceover-meta.json` shows `provider_used: "edge"`. Listen to the file to confirm voice quality.

- [ ] **Step 4: Commit**

```bash
git add pipeline/tts.mjs
git commit -m "feat(pipeline): tts.mjs with edge-tts provider, script parsing, timings.json"
```

---

### Task 4.2: `tts.mjs` Piper fallback

**Files:**
- Modify: `pipeline/tts.mjs`

- [ ] **Step 1: Install Piper on Windows**

Download the Piper Windows release (`piper_windows_amd64.zip` or similar) from the Piper GitHub releases. Extract to `C:\tools\piper\` (or wherever), and ensure `piper.exe` is on your PATH:

```powershell
# From PowerShell
[Environment]::SetEnvironmentVariable("PATH", "$env:PATH;C:\tools\piper", "User")
```

Restart the terminal. Verify:

```bash
piper --help
```

Download the voice model `en_US-lessac-medium.onnx` and its `.onnx.json` from the Piper voice catalog (e.g., into `C:\tools\piper\voices\`).

- [ ] **Step 2: Add piper provider**

In `pipeline/tts.mjs`, after the `ttsEdge` function, add:

```js
function ttsPiper({ paragraphs, voiceModelName, outDir }) {
  mkdirSync(outDir, { recursive: true });
  // Piper expects voice onnx path; resolve via env or config — we assume on PATH lookup.
  // Piper consumes text on stdin and writes WAV to the given path, so we call once per paragraph.
  const pieces = [];
  for (const p of paragraphs) {
    const wavOut = join(outDir, `p-${p.section.replace(/\s+/g, '_')}-${p.paragraph_index}.wav`);
    const mp3Out = wavOut.replace(/\.wav$/, '.mp3');
    const modelPath = process.env.PIPER_VOICES_DIR
      ? join(process.env.PIPER_VOICES_DIR, `${voiceModelName}.onnx`)
      : `${voiceModelName}.onnx`;
    const piper = spawnSync('piper', ['--model', modelPath, '--output_file', wavOut], {
      input: p.text, encoding: 'utf8', shell: false,
    });
    if (piper.status !== 0) throw new Error(`piper failed: ${piper.stderr}`);
    // Convert WAV → MP3 for consistency
    const conv = spawnSync('ffmpeg', ['-y', '-i', wavOut, '-codec:a', 'libmp3lame', '-qscale:a', '2', mp3Out], { encoding: 'utf8' });
    if (conv.status !== 0) throw new Error(`ffmpeg wav→mp3 failed: ${conv.stderr}`);
    pieces.push({ ...p, path: mp3Out });
  }
  return pieces;
}
```

Then update the main block's try/catch:

```js
try {
  pieces = ttsEdge({ paragraphs, voice: config.tts.voice_id, rate: config.tts.rate, outDir: piecesDir });
} catch (err) {
  error = err;
  console.error(`primary TTS (${provider}) failed: ${err.message}; falling back to ${config.tts.fallback}`);
  provider = config.tts.fallback;
  if (provider === 'piper') {
    pieces = ttsPiper({ paragraphs, voiceModelName: config.tts.piper_voice_model, outDir: piecesDir });
  } else {
    throw err;
  }
}
```

- [ ] **Step 3: Smoke-test fallback**

Force the fallback path by temporarily breaking edge. Simplest: edit `config.json` to set `"voice_id": "INVALID"`, re-run:

```bash
node pipeline/tts.mjs /tmp/studio-test
```

Expected: logs primary failure, then `provider_used: "piper"` in meta, MP3 output still produced. Revert config.

- [ ] **Step 4: Commit**

```bash
git add pipeline/tts.mjs
git commit -m "feat(pipeline): piper fallback in tts.mjs"
```

---

### Task 4.3: `normalize-audio.mjs`

**Files:**
- Create: `pipeline/normalize-audio.mjs`

- [ ] **Step 1: Implement**

```js
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node normalize-audio.mjs <work-dir>'); process.exit(2); }
const config = loadConfig();

const input = join(workDir, 'voiceover-raw.mp3');
const output = join(workDir, 'voiceover.mp3');
const { target_lufs, true_peak_db, lra } = config.audio;

const filter = `loudnorm=I=${target_lufs}:TP=${true_peak_db}:LRA=${lra}`;
const r = spawnSync('ffmpeg', ['-y', '-i', input, '-af', filter, '-codec:a', 'libmp3lame', '-qscale:a', '2', output], {
  encoding: 'utf8', shell: false, stdio: ['ignore', 'inherit', 'inherit'],
});
if (r.status !== 0) { console.error('loudnorm failed'); process.exit(1); }
console.log(`OK → ${output}`);
```

- [ ] **Step 2: Smoke-test**

```bash
node pipeline/normalize-audio.mjs /tmp/studio-test
ffprobe -v error -show_entries format_tags=lavfi.loudnorm_input_i -show_entries stream=codec_name /tmp/studio-test/voiceover.mp3
```

Expected: `voiceover.mp3` exists, same length as raw but at -14 LUFS. Listen to confirm volume is reasonable.

- [ ] **Step 3: Commit**

```bash
git add pipeline/normalize-audio.mjs
git commit -m "feat(pipeline): ffmpeg loudnorm step targeting -14 LUFS"
```

---

### Phase 4 milestone

Given a valid `script.md`, running `tts.mjs` then `normalize-audio.mjs` produces `voiceover.mp3` + schema-valid `timings.json`. Listen to the MP3 — if it sounds off (very loud, very quiet, clipping), adjust LUFS targets in `config.json`.

---

## Phase 5 — Screenshots + templates + composition + render

### Task 5.1: `scrapers/capture-screenshots.mjs`

**Files:**
- Create: `pipeline/scrapers/capture-screenshots.mjs`

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
      await page.setUserAgent('Mozilla/5.0 (compatible; ai-daily-bot/0.1)');
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

```bash
node pipeline/scrapers/capture-screenshots.mjs /tmp/studio-test
```

Expected: `screenshots/` populated with PNGs at 1200×400, `screenshots-manifest.json` lists entries. Inspect the PNGs manually — they should show headline + opening paragraph of each article.

- [ ] **Step 3: Commit**

```bash
git add pipeline/scrapers/capture-screenshots.mjs
git commit -m "feat(scrapers): capture-screenshots with 1200x400 crop for legal posture"
```

---

### Task 5.2: Templates

**Files:**
- Create: `templates/intro.html`, `story-card.html`, `story-card-text-fallback.html`, `outro.html`, `thumbnail.html`

- [ ] **Step 1: Write `templates/intro.html`**

```html
<!-- Intro bumper. build-composition.mjs substitutes {{date}} and {{headlines}}. -->
<div class="intro" data-start="{{start_sec}}" data-duration="{{duration_sec}}"
     data-track-index="1"
     style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#0a0a0a; color:#fff; font-family:Inter,system-ui,sans-serif;">
  <div style="font-size:96px; font-weight:800; color:{{accent_color}}; letter-spacing:-2px;">AI DAILY</div>
  <div style="font-size:36px; margin-top:16px; opacity:0.8;">{{date_pretty}}</div>
  <div style="font-size:28px; margin-top:48px; max-width:1400px; text-align:center; line-height:1.4;">
    Today: {{headlines}}
  </div>
</div>
```

- [ ] **Step 2: Write `templates/story-card.html`**

```html
<div class="story-card" data-start="{{start_sec}}" data-duration="{{duration_sec}}"
     data-track-index="1"
     style="position:absolute; inset:0; background:#111; color:#fff; font-family:Inter,system-ui,sans-serif; padding:64px;">
  <div style="display:flex; gap:24px; align-items:baseline;">
    <div style="background:{{accent_color}}; color:#000; font-weight:800; font-size:28px; padding:8px 16px;">STORY {{story_num}} / 3</div>
    <div style="font-size:24px; opacity:0.7;">{{source_domain}}</div>
  </div>
  <h1 style="font-size:64px; font-weight:800; line-height:1.15; margin:32px 0 24px;">{{headline}}</h1>
  <img src="{{screenshot_path}}" style="width:100%; max-height:560px; object-fit:cover; object-position:top; border-radius:8px;"/>
  <div style="position:absolute; bottom:48px; left:64px; right:64px; background:rgba(0,0,0,0.7); padding:16px 24px; font-size:22px;">
    Source: {{source_domain}} &nbsp;·&nbsp; <span style="color:{{accent_color}};">{{story_category}}</span>
  </div>
</div>
```

- [ ] **Step 3: Write `templates/story-card-text-fallback.html`**

```html
<div class="story-card-text" data-start="{{start_sec}}" data-duration="{{duration_sec}}"
     data-track-index="1"
     style="position:absolute; inset:0; background:#0a0a0a; color:#fff; font-family:Inter,system-ui,sans-serif; padding:96px;">
  <div style="display:flex; gap:24px; align-items:baseline;">
    <div style="background:{{accent_color}}; color:#000; font-weight:800; font-size:36px; padding:12px 24px;">STORY {{story_num}} / 3</div>
    <div style="font-size:28px; opacity:0.7;">{{source_domain}}</div>
  </div>
  <h1 style="font-size:96px; font-weight:800; line-height:1.15; margin:48px 0 0;">{{headline}}</h1>
  <div style="position:absolute; bottom:96px; left:96px; right:96px; font-size:32px; opacity:0.6;">
    {{external_url}}
  </div>
</div>
```

- [ ] **Step 4: Write `templates/outro.html`**

```html
<div class="outro" data-start="{{start_sec}}" data-duration="{{duration_sec}}"
     data-track-index="1"
     style="position:absolute; inset:0; background:#0a0a0a; color:#fff; font-family:Inter,system-ui,sans-serif; display:flex; flex-direction:column; justify-content:center; align-items:center;">
  <div style="font-size:72px; font-weight:800;">{{channel_name}}</div>
  <div style="font-size:36px; margin-top:24px; color:{{accent_color}};">Subscribe for daily AI news.</div>
</div>
```

- [ ] **Step 5: Write `templates/thumbnail.html`**

```html
<html><head><style>body{margin:0}</style></head>
<body style="width:1280px; height:720px; background:#0a0a0a; color:#fff; font-family:Inter,system-ui,sans-serif; display:flex; flex-direction:column; justify-content:center; padding:64px; box-sizing:border-box;">
  <div style="font-size:64px; font-weight:800; color:{{accent_color}}; letter-spacing:-2px; margin-bottom:16px;">AI DAILY</div>
  <div style="font-size:32px; opacity:0.8; margin-bottom:32px;">{{date_pretty}}</div>
  <div style="font-size:72px; font-weight:800; line-height:1.1;">{{top_headline}}</div>
</body></html>
```

- [ ] **Step 6: Commit**

```bash
git add templates/
git commit -m "feat(templates): intro/outro/story-card/text-fallback/thumbnail"
```

---

### Task 5.3: `build-composition.mjs` + tests

**Files:**
- Create: `pipeline/build-composition.mjs`
- Create: `pipeline/lib/composition-timing.js`
- Test: `tests/build-composition.test.js`

Split the pure timing-math into `lib/composition-timing.js` so it's unit-testable.

- [ ] **Step 1: Write failing timing-math tests**

`tests/build-composition.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { assignSegments } from '../pipeline/lib/composition-timing.js';

describe('assignSegments', () => {
  it('maps INTRO/STORY_N/OUTRO paragraphs to full slide segments', () => {
    const timings = {
      paragraphs: [
        { section: 'INTRO', paragraph_index: 0, start_sec: 0, duration_sec: 10 },
        { section: 'STORY 1', paragraph_index: 0, start_sec: 10, duration_sec: 30 },
        { section: 'STORY 1', paragraph_index: 1, start_sec: 40, duration_sec: 30 },
        { section: 'STORY 2', paragraph_index: 0, start_sec: 70, duration_sec: 50 },
        { section: 'STORY 3', paragraph_index: 0, start_sec: 120, duration_sec: 50 },
        { section: 'OUTRO', paragraph_index: 0, start_sec: 170, duration_sec: 10 },
      ],
    };
    const segments = assignSegments(timings);
    expect(segments).toHaveLength(5); // intro, story 1, story 2, story 3, outro
    expect(segments[0]).toMatchObject({ kind: 'intro', start_sec: 0, duration_sec: 10 });
    expect(segments[1]).toMatchObject({ kind: 'story', story_num: 1, start_sec: 10, duration_sec: 60 });
    expect(segments[2]).toMatchObject({ kind: 'story', story_num: 2, start_sec: 70, duration_sec: 50 });
    expect(segments[4]).toMatchObject({ kind: 'outro', start_sec: 170, duration_sec: 10 });
  });

  it('sums multi-paragraph story durations', () => {
    const timings = {
      paragraphs: [
        { section: 'STORY 1', paragraph_index: 0, start_sec: 0, duration_sec: 15 },
        { section: 'STORY 1', paragraph_index: 1, start_sec: 15, duration_sec: 20 },
      ],
    };
    const segments = assignSegments(timings);
    expect(segments).toEqual([{ kind: 'story', story_num: 1, start_sec: 0, duration_sec: 35 }]);
  });

  it('throws on unknown section', () => {
    expect(() => assignSegments({ paragraphs: [
      { section: 'WEIRD', paragraph_index: 0, start_sec: 0, duration_sec: 5 }
    ] })).toThrow();
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
npm test -- build-composition
```

- [ ] **Step 3: Implement `pipeline/lib/composition-timing.js`**

```js
export function assignSegments(timings) {
  // Group consecutive paragraphs by section
  const groups = [];
  for (const p of timings.paragraphs) {
    const last = groups[groups.length - 1];
    if (last && last.section === p.section) {
      last.duration_sec += p.duration_sec;
    } else {
      groups.push({ section: p.section, start_sec: p.start_sec, duration_sec: p.duration_sec });
    }
  }
  return groups.map(g => {
    if (g.section === 'INTRO') return { kind: 'intro', start_sec: g.start_sec, duration_sec: g.duration_sec };
    if (g.section === 'OUTRO') return { kind: 'outro', start_sec: g.start_sec, duration_sec: g.duration_sec };
    const m = g.section.match(/^STORY\s+(\d+)/i);
    if (!m) throw new Error(`unknown section: ${g.section}`);
    return { kind: 'story', story_num: parseInt(m[1], 10), start_sec: g.start_sec, duration_sec: g.duration_sec };
  });
}
```

- [ ] **Step 4: Run — pass**

```bash
npm test -- build-composition
```

- [ ] **Step 5: Implement `pipeline/build-composition.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';
import { assignSegments } from './lib/composition-timing.js';
import { TimingsFileSchema } from './schemas/timings.js';
import { ScreenshotsManifestSchema } from './schemas/screenshots-manifest.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node build-composition.mjs <work-dir>'); process.exit(2); }

const config = loadConfig();
const script = readFileSync(join(workDir, 'script.md'), 'utf8');
const timings = TimingsFileSchema.parse(JSON.parse(readFileSync(join(workDir, 'timings.json'), 'utf8')));
const manifest = ScreenshotsManifestSchema.parse(JSON.parse(readFileSync(join(workDir, 'screenshots-manifest.json'), 'utf8')));
const picks = JSON.parse(readFileSync(join(workDir, 'picks.json'), 'utf8')).picks;
const items = JSON.parse(readFileSync(join(workDir, 'items.json'), 'utf8')).items;

const segments = assignSegments(timings);

// Extract story titles from script headers like "## STORY 1 — GPT-5 Turbo (75s)"
const storyTitles = {};
for (const line of script.split('\n')) {
  const m = line.match(/^##\s+STORY\s+(\d+)\s+[—-]\s+(.+?)\s*(?:\(\d+s?\))?\s*$/i);
  if (m) storyTitles[parseInt(m[1], 10)] = m[2].trim();
}

const date = new Date().toISOString().slice(0, 10);
const datePretty = new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const headlines = picks.map((_, i) => storyTitles[i + 1] ?? `Story ${i + 1}`).join(' · ');

function tpl(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

const tplIntro = readFileSync('templates/intro.html', 'utf8');
const tplStory = readFileSync('templates/story-card.html', 'utf8');
const tplStoryText = readFileSync('templates/story-card-text-fallback.html', 'utf8');
const tplOutro = readFileSync('templates/outro.html', 'utf8');

const slides = segments.map(seg => {
  const common = {
    start_sec: seg.start_sec.toFixed(2),
    duration_sec: seg.duration_sec.toFixed(2),
    accent_color: config.channel.accent_color,
    channel_name: config.channel.name,
  };
  if (seg.kind === 'intro') return tpl(tplIntro, { ...common, date_pretty: datePretty, headlines });
  if (seg.kind === 'outro') return tpl(tplOutro, common);
  // story
  const pick = picks[seg.story_num - 1];
  const item = items.find(i => i.id === pick.item_id);
  const shot = manifest.entries.find(e => e.item_id === item.id);
  const headline = storyTitles[seg.story_num] ?? item.title;
  const source_domain = shot?.source_domain ?? new URL(item.external_url).hostname;
  if (shot && !shot.fallback) {
    return tpl(tplStory, { ...common, story_num: seg.story_num, headline, screenshot_path: shot.path, source_domain, story_category: 'AI NEWS' });
  }
  return tpl(tplStoryText, { ...common, story_num: seg.story_num, headline, source_domain, external_url: item.external_url });
});

const composition = `<!doctype html>
<html><head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; background: #000; width: ${config.video.width}px; height: ${config.video.height}px; overflow: hidden; }
    body { position: relative; }
  </style>
</head><body>
  ${slides.join('\n')}
  <audio data-track-index="0" data-start="0" data-volume="1.0" src="voiceover.mp3" preload="auto"></audio>
</body></html>`;

writeFileSync(join(workDir, 'composition.html'), composition);
console.log(`OK composition.html written with ${slides.length} slides, audio track`);
```

- [ ] **Step 6: Smoke-test**

```bash
node pipeline/build-composition.mjs /tmp/studio-test
open /tmp/studio-test/composition.html    # or: start for Windows
```

Open the HTML in a browser — all slides should render stacked (they're all absolute-positioned, so only the last one is visible; that's expected — Hyperframes time-switches them at render).

- [ ] **Step 7: Commit**

```bash
git add pipeline/build-composition.mjs pipeline/lib/composition-timing.js tests/build-composition.test.js
git commit -m "feat(pipeline): build-composition with timing math and template selection"
```

---

### Task 5.4: `render.mjs`

**Files:**
- Create: `pipeline/render.mjs`

- [ ] **Step 1: Implement**

```js
import { spawnSync } from 'node:child_process';
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node render.mjs <work-dir>'); process.exit(2); }
const config = loadConfig();

function runHyperframes(inputHtml, outPath, width, height, fps) {
  // Direct node invocation of hyperframes CLI, not npx, for Windows safety
  const cliPath = 'node_modules/hyperframes/dist/cli.js';
  if (!existsSync(cliPath)) { console.error(`hyperframes CLI not at ${cliPath} — check install`); process.exit(1); }
  const r = spawnSync('node', [cliPath, 'render', inputHtml, '--output', outPath, '--width', String(width), '--height', String(height), '--fps', String(fps)], {
    encoding: 'utf8', shell: false, stdio: ['ignore', 'inherit', 'inherit'],
  });
  return r.status;
}

const composition = join(workDir, 'composition.html');
const video = join(workDir, 'video.mp4');
const thumbnail = join(workDir, 'thumbnail.png');

// Video
const { width, height, fps } = config.video;
if (runHyperframes(composition, video, width, height, fps) !== 0) { console.error('video render failed'); process.exit(1); }
const videoStat = statSync(video);
if (videoStat.size < 50_000) { console.error('video output too small — likely malformed composition'); process.exit(1); }

// Thumbnail — render thumbnail.html standalone
if (runHyperframes('templates/thumbnail.html', thumbnail, 1280, 720, 30) !== 0) { console.error('thumbnail render failed'); process.exit(1); }

console.log(`OK video ${videoStat.size} bytes, thumbnail written`);
```

Note: if Hyperframes' CLI API doesn't match these exact flags, adjust per its docs (check `npx hyperframes render --help` once). Bake the real flag names into this file.

- [ ] **Step 2: Verify Hyperframes CLI surface**

```bash
node node_modules/hyperframes/dist/cli.js --help
node node_modules/hyperframes/dist/cli.js render --help
```

Copy the real flag names into `render.mjs` if different from the draft above.

- [ ] **Step 3: Smoke-test**

```bash
node pipeline/render.mjs /tmp/studio-test
```

Expected: `video.mp4` (> 50KB, duration matches `timings.total_duration_sec`) and `thumbnail.png` (1280×720).

- [ ] **Step 4: Watch the video**

```bash
start /tmp/studio-test/video.mp4
```

Visually confirm: slides swap at the right times, voiceover plays, outro appears at the end. If timing is drifting, trace back: check `timings.json` durations match `composition.html` `data-start`/`data-duration` values.

- [ ] **Step 5: Commit**

```bash
git add pipeline/render.mjs
git commit -m "feat(pipeline): render.mjs via hyperframes for video and thumbnail"
```

---

### Phase 5 milestone

A watchable `video.mp4` exists in `/tmp/studio-test/`. Slides swap in sync with the voiceover. Thumbnail PNG renders with correct headline.

---

## Phase 6 — Metadata + orchestration

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

Write `metadata.txt` for manual YouTube upload.

## Inputs

- `work/<date>-<run>/script.md`
- `work/<date>-<run>/picks.json`
- `work/<date>-<run>/timings.json`

## Output

Write `work/<date>-<run>/metadata.txt` in exactly this format:

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

- Maximum 60 characters (YouTube truncates beyond ~70 on most surfaces; 60 is the safe target).
- Lead with the single most important story's specific subject. Follow with the date suffix `| AI Daily YYYY-MM-DD` only if space permits.
- No clickbait. No "shocking", "you won't believe", rhetorical questions, excessive caps or !!!.
- Prefer concrete: "GPT-5 Turbo launches at 1/3 the cost" over vague: "Huge week for AI".

### Chapters

Compute `MM:SS` timestamps by summing `duration_sec` from `timings.json`:

- Intro chapter: 00:00.
- Story 1 chapter: `sum(intro paragraph durations)`.
- Story 2 chapter: intro + story 1 paragraphs summed.
- Story 3: +story 2.
- Outro: +story 3.

Round to whole seconds.

### Description body

- One-sentence hook before chapters.
- Sources section must list every URL from the script's SOURCES footnotes.
- Do not fabricate additional context. Keep it clean.

### Tags

8–12 tags, comma-separated, lowercase, no hashtags. Include: `ai`, `ai news`, the specific product names mentioned (e.g., `gpt-5`, `claude`), `artificial intelligence`, `llm`. Mix broad + specific.

## Hard rules

- Chapter timestamps must match timings.json exactly.
- Every URL in Sources must appear in the script's SOURCES section.
- No emoji unless explicitly part of a product name.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/yt-metadata/SKILL.md
git commit -m "feat(skill): yt-metadata for title/description/chapters/tags"
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

check('Python available', () => {
  const r = spawnSync('python', ['--version'], { encoding: 'utf8', shell: false });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'python not on PATH' };
});

check('edge-tts importable', () => {
  const r = spawnSync('python', ['-c', 'import edge_tts'], { encoding: 'utf8', shell: false });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'run: pip install edge-tts' };
});

check('Piper binary on PATH', () => {
  const r = spawnSync('piper', ['--help'], { encoding: 'utf8', shell: false });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'piper not on PATH — fallback TTS unavailable' };
});

check('ffmpeg on PATH', () => {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: false });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'ffmpeg not on PATH' };
});

check('ffprobe on PATH', () => {
  const r = spawnSync('ffprobe', ['-version'], { encoding: 'utf8', shell: false });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'ffprobe not on PATH (usually bundled with ffmpeg)' };
});

check('Hyperframes CLI present', () => {
  return existsSync('node_modules/hyperframes/dist/cli.js')
    ? { ok: true }
    : { ok: false, msg: 'run: npm install at repo root' };
});

check('Puppeteer Chromium installed (scrapers)', () => {
  return existsSync('pipeline/scrapers/node_modules/puppeteer')
    ? { ok: true }
    : { ok: false, msg: 'run: (cd pipeline/scrapers && npm install)' };
});

check('config.json valid', () => {
  try { loadConfig(); return { ok: true }; }
  catch (e) { return { ok: false, msg: e.message }; }
});

let allOk = true;
for (const c of checks) {
  const r = c.fn();
  const tag = r.ok ? 'OK' : 'FAIL';
  console.log(`[${tag}] ${c.name}${r.msg ? ` — ${r.msg}` : ''}`);
  if (!r.ok) allOk = false;
}
process.exit(allOk ? 0 : 1);
```

- [ ] **Step 2: Run**

```bash
node pipeline/setup.mjs
```

Expected: all OK. If any FAIL, follow the `msg` to fix. Common first-run fails on Windows: Python path, `edge-tts` not installed, Piper not on PATH. Fix each before proceeding.

- [ ] **Step 3: Commit**

```bash
git add pipeline/setup.mjs
git commit -m "feat(pipeline): setup preflight for all external deps"
```

---

### Task 6.3: Slash commands

**Files:**
- Create: `.claude/commands/yt-fetch.md`, `yt-research.md`, `yt-script.md`, `yt-render.md`, `yt-approve.md`, `yt-daily.md`

- [ ] **Step 1: `.claude/commands/yt-fetch.md`**

````markdown
---
name: yt-fetch
description: Fetch AI/tech news sources and produce items.json in a new run folder.
---

Acquire a new run folder and fetch sources:

```bash
node -e "import('./pipeline/lib/run-id.js').then(async m => { const r = m.acquireRun({ base: 'work', date: new Date().toISOString().slice(0,10) }); console.log(r.dir); require('fs').writeFileSync('.last-run', r.dir); })"
RUN=$(cat .last-run)
node pipeline/fetch-sources.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/fetch.log"
```

Report the run folder path to the user and the number of items fetched.
````

- [ ] **Step 2: `.claude/commands/yt-research.md`**

````markdown
---
name: yt-research
description: Run the yt-research skill against the most recent run's items.json.
---

Read the most recent run folder from `.last-run`. Invoke the `yt-research` skill pointing at `$RUN/items.json`. The skill will write `$RUN/picks.json`.

After the skill completes, validate:

```bash
RUN=$(cat .last-run)
node -e "import('./pipeline/schemas/picks.js').then(({PicksFileSchema}) => PicksFileSchema.parse(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))) && console.log('OK'))" "$RUN/picks.json"
```

Report the 3 picks by rank + headline to the user.
````

- [ ] **Step 3: `.claude/commands/yt-script.md`**

````markdown
---
name: yt-script
description: Invoke the yt-script skill, run claims verification, and stop for script approval.
---

1. Read `.last-run` for the run folder.
2. Invoke the `yt-script` skill against `$RUN/picks.json` and article texts. Skill writes `$RUN/script.md` and `$RUN/claims.json`.
3. Run verification:

```bash
RUN=$(cat .last-run)
node pipeline/verify-claims.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/verify.log"
```

4. If verify-claims exits nonzero, show the user `$RUN/claims-verification-report.md` and stop. Do NOT proceed to render.
5. If it passes, print the `script.md` content to the user and ask: **"Approve script, or request changes?"**

Do not invoke `/yt-render` until the user says approved.
````

- [ ] **Step 4: `.claude/commands/yt-render.md`**

````markdown
---
name: yt-render
description: TTS → audio normalize → screenshots → composition → render → metadata. Stops for MP4 approval.
---

Precondition: `.last-run` exists, `$RUN/script.md` and `$RUN/claims.json` exist, user approved the script. Refuse if `$RUN/claims-verified.json` is missing or has any failed claim.

```bash
RUN=$(cat .last-run)
mkdir -p "$RUN/logs"
node pipeline/tts.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/tts.log" || exit 1
node pipeline/normalize-audio.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/normalize.log" || exit 1
node pipeline/scrapers/capture-screenshots.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/screenshots.log" || exit 1
node pipeline/build-composition.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/composition.log" || exit 1
node pipeline/render.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/render.log" || exit 1
```

Then invoke `yt-metadata` skill; it writes `$RUN/metadata.txt`.

Tell the user: **"Draft video ready at `$RUN/video.mp4`. Watch it and reply approve or reject."**

Do not invoke `/yt-approve` until the user says approved.
````

- [ ] **Step 5: `.claude/commands/yt-approve.md`**

````markdown
---
name: yt-approve
description: Move the approved run from work/ to ready-to-upload/ and release the lock.
---

```bash
RUN=$(cat .last-run)
TARGET="ready-to-upload/$(basename "$RUN")"
mkdir -p ready-to-upload
mv "$RUN" "$TARGET"
node -e "import('./pipeline/lib/run-id.js').then(m => m.releaseRun(process.argv[1]))" "$TARGET"
echo "$TARGET"
```

Tell the user: "Ready to upload: `$TARGET`. Drag `video.mp4`, `thumbnail.png`, and copy fields from `metadata.txt` into YouTube Studio."
````

- [ ] **Step 6: `.claude/commands/yt-daily.md`**

````markdown
---
name: yt-daily
description: Run the full pipeline end-to-end with both approval gates.
---

Run in order:

1. `/yt-fetch`
2. `/yt-research`
3. `/yt-script` — stop for the script-approval gate. Wait for user "approve".
4. `/yt-render` — stop for the MP4-approval gate. Wait for user "approve".
5. `/yt-approve`

Do not chain past either gate without the user's explicit approval.
````

- [ ] **Step 7: Commit**

```bash
git add .claude/commands/
git commit -m "feat(commands): slash command orchestrators for the full pipeline"
```

---

### Task 6.4: End-to-end smoke test

**Files:**
- No new files — this is an integration verification.

- [ ] **Step 1: Run full pipeline**

In Claude Code:

```
/yt-daily
```

The flow should execute:
1. `/yt-fetch` → items.json (expect 10+ usable items).
2. `/yt-research` → picks.json (expect 3 picks + schema validation OK).
3. `/yt-script` → script.md + claims.json + claims-verified.json (all claims must pass).
4. **Gate 1** — you review the script. If not satisfied, fix (either manually edit script.md and re-run verify, or re-run `/yt-script` with feedback).
5. Approve → `/yt-render` → voiceover-raw.mp3 → voiceover.mp3 → screenshots → composition.html → video.mp4 → metadata.txt.
6. **Gate 2** — watch `video.mp4`. Confirm: slides swap in sync with audio, volume reasonable, no malformed slides, metadata.txt sensible.
7. Approve → `/yt-approve` → moves run folder to `ready-to-upload/`.

- [ ] **Step 2: Manually upload**

Drag the files from `ready-to-upload/<date>-<run>/` into YouTube Studio:

- `video.mp4` as the video file.
- `thumbnail.png` as the custom thumbnail.
- Copy TITLE/DESCRIPTION/TAGS from `metadata.txt` into the appropriate fields.

Publish as **Unlisted** first — this is v1, do not burn the channel's first public impression on an untested pipeline. Share the Unlisted link with 1–2 trusted people for feedback before making it Public.

- [ ] **Step 3: Write a one-page retrospective to `docs/superpowers/notes/`**

After the first real video is produced, write what broke, what needed tuning (RSS feeds that failed, HN min_points adjustments, script-prompt tweaks, verify-claims false-negatives, screenshot fallbacks triggered). This becomes the source of v2 improvements.

```bash
mkdir -p docs/superpowers/notes
# write notes...
git add docs/superpowers/notes/
git commit -m "docs: retro of first end-to-end run"
```

---

### Phase 6 milestone

One uploaded (Unlisted) YouTube video exists, produced by the pipeline with both approval gates exercised. You have a retro doc listing real breakages to fix in v2.

---

## What's intentionally missing (roadmap for v2+)

From the spec's "Out of scope for v1" — these were deliberately deferred and are not implementation failures:

- Daily scheduling / cron trigger.
- Cross-day story dedup.
- "Nothing worth covering today" detection.
- Automated YouTube upload via Data API.
- Remote approval UX (Telegram/Discord/email).
- AI-generated imagery.
- Thumbnail A/B testing.
- Analytics feedback loop from YouTube → research ranking.
- Background music bed with voiceover ducking (loudness normalization is done).

Each is a meaningful v2 sub-project deserving its own brainstorm + spec + plan.
