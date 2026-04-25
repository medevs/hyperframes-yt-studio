# Parallel Capped-Fetch Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the AI Daily fetch pipeline from ~25 min to ~30–60 sec **without degrading research or script quality** by capping candidates to the 50 most-recent items and parallelizing article-text extraction with per-request timeouts.

**Architecture:** Preserve the existing "fetch-once, research reads article texts" contract that `yt-research` and `yt-script` both depend on. The only structural change is *how* fetch-sources does its work: dedup → cap to 50 by recency × signal → `Promise.all` style parallel fetch with `AbortController` timeouts → Readability extraction. Items that fail extraction are marked `text_extraction_failed: true` so research can skip them exactly as today. Screenshot capture is separately parallelized from its current sequential `for...await` loop.

**Tech Stack:** Node 22 ESM, vitest, jsdom + @mozilla/readability for article extraction, native `fetch` + `AbortController` for HTTP, puppeteer for screenshots, zod for schemas.

---

## File Structure

**Create:**
- `pipeline/lib/cap-items.js` — pure helper: sort items by recency, tie-break by HN signal strength, slice to N. Used by `fetch-sources.mjs`.
- `pipeline/lib/parallel-fetch.js` — pure helper: fetch many URLs with concurrency cap + per-request `AbortController` timeout. Used by `fetch-sources.mjs`.
- `tests/cap-items.test.js` — vitest unit tests for `capItems`.
- `tests/parallel-fetch.test.js` — vitest unit tests for `parallelFetch` with a mocked `fetchImpl`.

**Modify:**
- `pipeline/fetch-sources.mjs` — cap to 50, use `parallelFetch` + Readability to extract article text in parallel with timeouts. Keep the existing `items.json` output contract (items have `article_text_path` on success, `text_extraction_failed: true` on failure) so `yt-research` and `yt-script` work without changes.
- `pipeline/capture-screenshots.mjs` — replace the sequential `for (const pick of picks)` loop with `await Promise.all(picks.map(...))`.
- `config.json` — empty the `company_blogs` array (every URL is JS-rendered and we disabled puppeteer; their RSS metadata is useless without a way to fetch their article bodies).

**Leave alone:**
- `pipeline/schemas/items.js` — `article_text_path` and `text_extraction_failed` are already `.optional()`.
- `pipeline/lib/dedup.js` — already correct.
- `.claude/commands/yt-*.md` — the `/yt-script` command does not need a new fetch step, because `fetch-sources.mjs` still populates `article_text_path` as today.
- `pipeline/fetch-article-text.mjs` — orphaned after `js_rendered_domains: []` was set; leave in place (tiny, no harm).

---

## Task 1: `capItems` pure helper (TDD)

**Files:**
- Create: `pipeline/lib/cap-items.js`
- Test: `tests/cap-items.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/cap-items.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { capItems } from '../pipeline/lib/cap-items.js';

describe('capItems', () => {
  it('returns all items if length <= cap', () => {
    const items = [
      { id: 'a', published_at: '2026-04-24T10:00:00Z' },
      { id: 'b', published_at: '2026-04-24T11:00:00Z' },
    ];
    expect(capItems(items, 5)).toHaveLength(2);
  });

  it('keeps the most recent items when over cap', () => {
    const items = [
      { id: 'old', published_at: '2026-04-23T00:00:00Z' },
      { id: 'new', published_at: '2026-04-24T00:00:00Z' },
      { id: 'mid', published_at: '2026-04-23T12:00:00Z' },
    ];
    const r = capItems(items, 2);
    expect(r.map(i => i.id)).toEqual(['new', 'mid']);
  });

  it('tie-breaks same-timestamp items by signal strength (HN points + comments)', () => {
    const ts = '2026-04-24T10:00:00Z';
    const items = [
      { id: 'low', published_at: ts, signals: { hn_points: 10, hn_comments: 5 } },
      { id: 'high', published_at: ts, signals: { hn_points: 100, hn_comments: 50 } },
    ];
    expect(capItems(items, 1)[0].id).toBe('high');
  });

  it('treats missing published_at as oldest (epoch 0)', () => {
    const items = [
      { id: 'no-date' },
      { id: 'dated', published_at: '2026-04-24T00:00:00Z' },
    ];
    expect(capItems(items, 1)[0].id).toBe('dated');
  });

  it('does not mutate the input array', () => {
    const items = [
      { id: 'a', published_at: '2026-04-24T10:00:00Z' },
      { id: 'b', published_at: '2026-04-24T11:00:00Z' },
    ];
    const before = items.map(i => i.id).join(',');
    capItems(items, 1);
    expect(items.map(i => i.id).join(',')).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cap-items.test.js`
Expected: FAIL with `Cannot find module .../pipeline/lib/cap-items.js`

- [ ] **Step 3: Write the implementation**

Create `pipeline/lib/cap-items.js`:

```js
function recencyTimestamp(item) {
  const t = Date.parse(item.published_at ?? '');
  return Number.isFinite(t) ? t : 0;
}

function signalStrength(item) {
  return (item.signals?.hn_points ?? 0) + (item.signals?.hn_comments ?? 0);
}

export function capItems(items, cap) {
  return [...items]
    .sort((a, b) => {
      const dt = recencyTimestamp(b) - recencyTimestamp(a);
      if (dt !== 0) return dt;
      return signalStrength(b) - signalStrength(a);
    })
    .slice(0, cap);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cap-items.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/cap-items.js tests/cap-items.test.js
git commit -m "feat(pipeline): add capItems helper to bound fetch candidates"
```

---

## Task 2: `parallelFetch` pure helper (TDD)

**Files:**
- Create: `pipeline/lib/parallel-fetch.js`
- Test: `tests/parallel-fetch.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/parallel-fetch.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { parallelFetch } from '../pipeline/lib/parallel-fetch.js';

describe('parallelFetch', () => {
  it('fetches every URL and returns body text', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: true, status: 200, text: async () => `body:${url}`,
    }));
    const r = await parallelFetch(['a', 'b', 'c'], { fetchImpl, concurrency: 2, timeoutMs: 1000 });
    expect(r).toHaveLength(3);
    expect(r.map(x => x.body)).toEqual(['body:a', 'body:b', 'body:c']);
    expect(r.every(x => x.ok)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('respects the concurrency cap', async () => {
    let inFlight = 0, maxInFlight = 0;
    const fetchImpl = vi.fn(async (url) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 20));
      inFlight--;
      return { ok: true, status: 200, text: async () => url };
    });
    await parallelFetch(['a','b','c','d','e'], { fetchImpl, concurrency: 2, timeoutMs: 1000 });
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('returns a timeout error when AbortController fires', async () => {
    const fetchImpl = vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
      });
    }));
    const r = await parallelFetch(['slow'], { fetchImpl, concurrency: 1, timeoutMs: 30 });
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toBe('timeout');
  });

  it('returns ok=false when fetch throws a non-abort error', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const r = await parallelFetch(['boom'], { fetchImpl, concurrency: 1, timeoutMs: 1000 });
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toBe('ECONNRESET');
  });

  it('returns an empty array for empty input', async () => {
    const fetchImpl = vi.fn();
    const r = await parallelFetch([], { fetchImpl, concurrency: 5, timeoutMs: 1000 });
    expect(r).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parallel-fetch.test.js`
Expected: FAIL with `Cannot find module .../pipeline/lib/parallel-fetch.js`

- [ ] **Step 3: Write the implementation**

Create `pipeline/lib/parallel-fetch.js`:

```js
async function fetchOne(url, timeoutMs, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'ai-daily-bot/0.2' },
    });
    const body = await r.text();
    return { url, ok: r.ok, status: r.status, body };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function parallelFetch(urls, { concurrency = 5, timeoutMs = 10000, fetchImpl = fetch } = {}) {
  if (urls.length === 0) return [];
  const results = new Array(urls.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      results[i] = await fetchOne(urls[i], timeoutMs, fetchImpl);
    }
  }
  const workerCount = Math.min(concurrency, urls.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parallel-fetch.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/parallel-fetch.js tests/parallel-fetch.test.js
git commit -m "feat(pipeline): add parallelFetch helper with concurrency cap and timeout"
```

---

## Task 3: Refactor `fetch-sources.mjs` to cap + parallel extract

**Files:**
- Modify: `pipeline/fetch-sources.mjs` (whole file rewrite, ~110 lines)

- [ ] **Step 1: Replace the file**

Open `pipeline/fetch-sources.mjs` and replace its entire contents with:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { loadConfig } from './lib/sources.js';
import { dedupItems } from './lib/dedup.js';
import { capItems } from './lib/cap-items.js';
import { parallelFetch } from './lib/parallel-fetch.js';
import { ItemsFileSchema } from './schemas/items.js';

const ITEM_CAP = 50;
const FETCH_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 10000;
const MIN_ARTICLE_CHARS = 500;
const MIN_USABLE_ITEMS = 10;

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node fetch-sources.mjs <work-dir>'); process.exit(2); }

const config = loadConfig();
const parser = new Parser();
const fetchErrors = [];

const shortHash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

async function fetchRss(url, source) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map(e => ({
      id: `${source}-${shortHash(e.link || e.guid || e.title)}`,
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

function extractText(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    return new Readability(dom.window.document).parse()?.textContent?.trim() ?? '';
  } catch {
    return '';
  }
}

mkdirSync(join(workDir, 'articles'), { recursive: true });

const rssResults = await Promise.all([
  ...config.sources.rss.map(u => fetchRss(u, 'rss')),
  ...config.sources.company_blogs.map(u => fetchRss(u, 'company_blog')),
]);
const hn = await fetchHackerNews(config.sources.hackernews);
const raw = [...rssResults.flat(), ...hn];
const deduped = dedupItems(raw);
const capped = capItems(deduped, ITEM_CAP);

const urls = capped.map(i => i.external_url);
const fetched = await parallelFetch(urls, {
  concurrency: FETCH_CONCURRENCY,
  timeoutMs: FETCH_TIMEOUT_MS,
});

const enriched = capped.map((item, i) => {
  const r = fetched[i];
  if (!r.ok) {
    fetchErrors.push({ source: 'article_extraction', url: item.external_url, error: r.error ?? `status ${r.status}` });
    return { ...item, text_extraction_failed: true };
  }
  const text = extractText(r.body, item.external_url);
  if (text.length < MIN_ARTICLE_CHARS) {
    fetchErrors.push({ source: 'article_extraction', url: item.external_url, error: `text too short (${text.length} chars)` });
    return { ...item, text_extraction_failed: true };
  }
  const relPath = `articles/${item.id}.txt`;
  writeFileSync(join(workDir, relPath), text, 'utf8');
  return { ...item, article_text_path: relPath };
});

const usable = enriched.filter(i => !i.text_extraction_failed);
const out = { fetched_at: new Date().toISOString(), items: enriched };
ItemsFileSchema.parse(out);
writeFileSync(join(workDir, 'items.json'), JSON.stringify(out, null, 2));
writeFileSync(join(workDir, 'fetch-errors.json'), JSON.stringify(fetchErrors, null, 2));

if (usable.length < MIN_USABLE_ITEMS) {
  console.error(`ERROR: only ${usable.length} items with usable article text (need >=${MIN_USABLE_ITEMS})`);
  process.exit(1);
}
console.log(`OK ${enriched.length} items (${usable.length} with usable text, capped from ${deduped.length}) -> ${workDir}/items.json`);
```

- [ ] **Step 2: Run all unit tests to confirm nothing else broke**

Run: `npm test`
Expected: All previous schema/dedup/normalize/run-id/verify-claims/compute-timings tests still pass, plus the 2 new test files from Tasks 1–2. 40+ tests total.

- [ ] **Step 3: Smoke-run the refactored fetch**

```bash
RUN=$(node -e "import('./pipeline/lib/run-id.js').then(m => { const r = m.acquireRun({ base: 'work', date: new Date().toISOString().slice(0,10) }); console.log(r.dir); })")
echo "$RUN" > .last-run
mkdir -p "$RUN/logs"
time node pipeline/fetch-sources.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/fetch.log"
```

Expected:
- Completes in **under 90 seconds** (typical 20–60 s).
- Final log line: `OK 50 items (NN with usable text, capped from N) -> work/.../items.json` where NN is at least 10 and N is the pre-cap dedup total.
- `articles/` contains ~30–45 `.txt` files (one per successfully extracted item, fewer than 50 because some URLs fail or are JS-rendered).
- `items.json` validates against `ItemsFileSchema`.

- [ ] **Step 4: Verify items.json structure and text-extraction outcomes**

Run:
```bash
RUN=$(cat .last-run)
node -e "const d=JSON.parse(require('fs').readFileSync('$RUN/items.json'));const ok=d.items.filter(i=>i.article_text_path).length;const fail=d.items.filter(i=>i.text_extraction_failed).length;console.log('total:',d.items.length,'| with text:',ok,'| failed:',fail);const sample=d.items.find(i=>i.article_text_path);console.log('sample with text:',sample.id,sample.article_text_path);"
```

Expected:
- `total: 50 | with text: NN | failed: MM` where NN + MM = 50, NN >= 10.
- Sample item has `article_text_path` set to a path like `articles/<id>.txt`.
- File at that path exists and is > 500 chars.

- [ ] **Step 5: Commit**

```bash
git add pipeline/fetch-sources.mjs
git commit -m "refactor(pipeline): cap candidates to 50 and parallelize article extraction with timeouts"
```

---

## Task 4: Parallelize `capture-screenshots.mjs`

**Files:**
- Modify: `pipeline/capture-screenshots.mjs`

- [ ] **Step 1: Replace the file**

Open `pipeline/capture-screenshots.mjs` and replace its entire contents with:

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

async function shoot(pick) {
  const item = items.find(i => i.id === pick.item_id);
  if (!item) {
    return { item_id: pick.item_id, path: null, fallback: true, source_domain: 'unknown', error: 'item_not_found' };
  }
  const outPath = join(shotsDir, `${item.id}.png`);
  const domain = new URL(item.external_url).hostname;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 400 });
    await page.setUserAgent('Mozilla/5.0 (compatible; ai-daily-bot/0.2)');
    await page.goto(item.external_url, { waitUntil: 'networkidle2', timeout: 15000 });
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 400 } });
    return { item_id: item.id, path: `screenshots/${item.id}.png`, fallback: false, source_domain: domain };
  } catch (err) {
    return { item_id: item.id, path: null, fallback: true, source_domain: domain, error: err.message };
  } finally {
    await page.close();
  }
}

let entries;
try {
  entries = await Promise.all(picks.map(shoot));
} finally {
  await browser.close();
}

writeFileSync(join(workDir, 'screenshots-manifest.json'), JSON.stringify({ entries }, null, 2));
const ok = entries.filter(e => !e.fallback).length;
console.log(`OK ${ok}/${entries.length} screenshots captured`);
```

- [ ] **Step 2: Build a synthetic `picks.json` for the existing smoke-test run and capture screenshots**

The smoke run from Task 3 Step 3 already has `items.json`. Build a synthetic picks file and run the capture:

```bash
RUN=$(cat .last-run)
node -e "
const fs=require('fs');
const items=JSON.parse(fs.readFileSync('$RUN/items.json')).items.filter(i=>i.article_text_path);
const picks=items.slice(0,3).map((i,n)=>({rank:n+1,item_id:i.id,angle:'test',rationale:'smoke',suggested_visuals:[],risk_flags:[]}));
fs.writeFileSync('$RUN/picks.json', JSON.stringify({date:new Date().toISOString().slice(0,10),picks,rejected:[]},null,2));
console.log('wrote picks for:',picks.map(p=>p.item_id).join(','));
"
time node pipeline/capture-screenshots.mjs "$RUN"
```

Expected:
- Completes in **under 30 seconds** (typically 10–20 s for 3 parallel page loads).
- Final line: `OK 3/3 screenshots captured` (or `2/3` / `1/3` if a URL is unreachable — that's a warning, not a failure).
- `screenshots/<id>.png` files exist for the successful captures.
- `screenshots-manifest.json` lists 3 entries.

- [ ] **Step 3: Commit**

```bash
git add pipeline/capture-screenshots.mjs
git commit -m "perf(pipeline): parallelize screenshot capture across the 3 picks"
```

---

## Task 5: Drop `company_blogs` from `config.json`

**Files:**
- Modify: `config.json`

- [ ] **Step 1: Empty the `company_blogs` array**

Open `config.json` and replace the `company_blogs` array with an empty array. The full `sources` block should read:

```json
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
  "company_blogs": [],
  "js_rendered_domains": []
},
```

Rationale: every removed URL (openai.com, anthropic.com, deepmind.google, ai.meta.com) is JS-rendered. With `js_rendered_domains: []` we can't fetch their bodies, so their RSS metadata alone adds items the script can't ground claims in. Dropping them avoids polluting the candidate pool with unfetchable items.

- [ ] **Step 2: Re-run the config schema test**

Run: `npx vitest run tests/schemas.test.js`
Expected: PASS, 7 schema tests including `ConfigSchema accepts the checked-in config.json`.

- [ ] **Step 3: Commit**

```bash
git add config.json
git commit -m "chore(config): drop company_blogs — all JS-rendered, unfetchable without puppeteer"
```

---

## Task 6: Clean up smoke-test run folder

**Files:** None (state-only).

- [ ] **Step 1: Delete the smoke-test run folder and reset `.last-run`**

```bash
RUN=$(cat .last-run)
rm -rf "$RUN"
rm -f .last-run
echo "cleaned $RUN"
```

Expected: `cleaned work/2026-04-24-N`.

- [ ] **Step 2: Confirm `work/` is empty or absent**

```bash
ls work/ 2>&1
```

Expected: empty output, or `ls: cannot access 'work/': No such file or directory`. Both are fine.

---

## Task 7: Full-pipeline smoke test to Gate 1

**Files:** None (integration test).

- [ ] **Step 1: Run `/yt-fetch` and time it**

```bash
RUN=$(node -e "import('./pipeline/lib/run-id.js').then(m => { const r = m.acquireRun({ base: 'work', date: new Date().toISOString().slice(0,10) }); console.log(r.dir); })")
echo "$RUN" > .last-run
mkdir -p "$RUN/logs"
time node pipeline/fetch-sources.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/fetch.log"
```

Expected: completes in under 90 seconds. Final log line: `OK 50 items (NN with usable text, capped from N) -> ...` with NN >= 10.

- [ ] **Step 2: Run `/yt-research` (invoke `yt-research` skill on `$RUN/items.json`)**

In Claude Code, type: `/yt-research`

Expected:
- Skill reads items.json, skips items with `text_extraction_failed: true`, picks 3 from items with `article_text_path`.
- Writes `$RUN/picks.json` with exactly 3 ranked picks.
- Validation step prints `OK picks <path>`.
- Claude reports the 3 ranked headlines.

- [ ] **Step 3: Run `/yt-script`**

In Claude Code, type: `/yt-script`

Expected:
- `yt-script` skill reads `picks.json` + `items.json` + the 3 article text files + `DESIGN.md`.
- Writes `$RUN/script.md`, `$RUN/claims.json`, `$RUN/storyboard.md`, `$RUN/storyboard.json`.
- `pipeline/verify-claims.mjs` reports all claims pass (verbatim substring match against article text).
- Claude prints the script and asks for approval.

- [ ] **Step 4: Capture timing summary**

```bash
RUN=$(cat .last-run)
echo "--- Pipeline timing summary ---"
echo "Fetch sources: see 'time' output from Step 1"
echo "Research (LLM): see Step 2 duration in chat"
echo "Script (LLM) + verify: see Step 3 duration in chat"
echo ""
echo "--- Run artifacts ---"
ls -la "$RUN" | head -30
echo ""
echo "--- Article files ---"
ls "$RUN/articles/" | wc -l
echo "article .txt files present"
```

Expected: a list of files including `items.json`, `picks.json`, `articles/` (with multiple .txt files), `script.md`, `claims.json`, `storyboard.json`, `claims-verified.json`. Total wall time to Gate 1 under ~5 minutes.

- [ ] **Step 5: Cleanup (skip if continuing past Gate 1)**

```bash
RUN=$(cat .last-run)
rm -rf "$RUN"
rm -f .last-run
```

Skip this step if you intend to continue past Gate 1 with `/yt-render` to exercise the rest of the pipeline (TTS → transcribe → screenshots → compose → render MP4).

- [ ] **Step 6: No commit needed**

Task 7 has no code changes. The plan is complete when Steps 1–4 have succeeded without errors.

---

## Self-Review

**Spec coverage** (mapped against the design discussion):
- "Cap candidates to top N by recency" → Task 1 (helper) + Task 3 (use) ✓
- "Parallel fetch with AbortController timeout" → Task 2 (helper) + Task 3 (use) ✓
- "Preserve research/script quality — article text must be available before research" → Task 3 keeps the one-shot fetch contract intact ✓
- "`text_extraction_failed` flag honored" → Task 3 sets it on timeout / short text; `yt-research` already filters ✓
- "Parallelize screenshots" → Task 4 ✓
- "Drop unfetchable `company_blogs`" → Task 5 ✓
- "Verify full pipeline to Gate 1 under budget" → Task 7 ✓

**Placeholder scan:** Searched for "TBD", "TODO", "implement later", "appropriate error handling", "similar to" — none present. All code blocks are complete and runnable.

**Type/name consistency:**
- `capItems(items, cap)` — defined Task 1, used Task 3. ✓
- `parallelFetch(urls, opts)` — defined Task 2, used Task 3. ✓
- `fetchOne(url, timeoutMs, fetchImpl)` — file-local in parallel-fetch.js only. ✓
- `extractText(html, url)` — file-local in fetch-sources.mjs only. ✓
- `ITEM_CAP`, `FETCH_CONCURRENCY`, `FETCH_TIMEOUT_MS`, `MIN_ARTICLE_CHARS`, `MIN_USABLE_ITEMS` — module-local constants in fetch-sources.mjs. ✓
- `shortHash(s)` — file-local in fetch-sources.mjs (replaces the prior 20-char base64 slice). ✓
- `article_text_path` / `text_extraction_failed` — already optional on `ItemSchema`; same field names used in Task 3. ✓
- `pipeline/fetch-article-text.mjs` intentionally orphaned after the refactor (noted in File Structure). ✓
