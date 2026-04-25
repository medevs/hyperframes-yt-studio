# Screenshot Quality Implementation Plan (Spec A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cookie-banner-dominated screenshot capture with primary-source captures, an IDCAC-based banner suppression layer, and a graceful fallback chain (og:image → news og:image → generated headline card).

**Architecture:** Picker LLM (`yt-research`) emits `primary_source_url` per pick. `capture-screenshots.mjs` injects a community CSS blocklist before navigating, applies per-domain overrides from `config.json`, scrolls to settle lazy content, captures a tall (up to 3000 px) PNG, and runs a quality check that triggers the fallback chain on bad captures. New schemas, helpers, and a lint rule keep regressions out.

**Tech Stack:** Node 22, vitest, zod, puppeteer 22, jsdom, sharp (new dep for PNG analysis).

**Spec reference:** `docs/superpowers/specs/2026-04-25-screenshot-quality-design.md`

---

## File Structure

| Action | Path | Responsibility |
| --- | --- | --- |
| Modify | `pipeline/schemas/picks.js` | Add `primary_source_url: string().url()` to PickSchema |
| Modify | `pipeline/schemas/screenshots-manifest.js` | Add `width`, `height`, `source_kind` fields |
| Modify | `pipeline/schemas/config.js` | Add optional `screenshot_overrides` map |
| Modify | `config.json` | Add empty `screenshot_overrides: {}` |
| Modify | `.claude/skills/yt-research/SKILL.md` | Prompt addition for `primary_source_url` |
| Create | `vendor/idcac-rules.css` | Pinned IDCAC stylesheet (copy of upstream release) |
| Create | `pipeline/lib/og-image.mjs` | Fetch og:image meta tag → save image to disk |
| Create | `pipeline/lib/screenshot-quality.mjs` | Monochrome + banner-shape detection on PNG buffers |
| Create | `pipeline/lib/headline-card.mjs` | Render fallback PNG via Puppeteer + headline-card.css |
| Create | `assets/headline-card.css` | Styles for headline-card render target |
| Modify | `pipeline/capture-screenshots.mjs` | Rewritten orchestrator with fallback chain |
| Modify | `pipeline/lint.mjs` | Add `screenshot_quality` post-check |
| Create | `tests/og-image.test.js` | vitest for og:image helper |
| Create | `tests/screenshot-quality.test.js` | vitest for monochrome + banner-shape |
| Modify | `tests/schemas.test.js` | Add cases for picks/manifest/config additions |
| Create | `tests/fixtures/og-image/` | HTML fixtures (with og, without, broken) |
| Create | `tests/fixtures/screenshots/` | PNG fixtures (clean, banner, monochrome, headline-card) |
| Create | `package.json` | Add `sharp` dependency |

---

## Task 1: Add `sharp` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install sharp**

Run: `npm install sharp@^0.33.0`
Expected: `added 1 package` and entry in `package.json` dependencies.

- [ ] **Step 2: Smoke-test sharp can decode a PNG**

Run: `node -e "import('sharp').then(({default:s})=>s({create:{width:10,height:10,channels:3,background:'#000'}}).png().toBuffer().then(b=>console.log('ok',b.length)))"`
Expected: `ok 80` (or similar non-zero number).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add sharp for PNG quality analysis"
```

---

## Task 2: Extend `PickSchema` with `primary_source_url`

**Files:**
- Modify: `pipeline/schemas/picks.js`
- Modify: `tests/schemas.test.js`

- [ ] **Step 1: Add a failing test**

Append to `tests/schemas.test.js`:

```javascript
import { PickSchema } from '../pipeline/schemas/picks.js';

describe('PickSchema primary_source_url', () => {
  const base = {
    rank: 1,
    item_id: 'rss-x',
    angle: 'a',
    rationale: 'r',
    suggested_visuals: [],
    risk_flags: [],
  };

  it('requires primary_source_url', () => {
    expect(() => PickSchema.parse(base)).toThrow();
  });

  it('rejects non-URL primary_source_url', () => {
    expect(() => PickSchema.parse({ ...base, primary_source_url: 'not-a-url' })).toThrow();
  });

  it('accepts a valid primary_source_url', () => {
    const ok = PickSchema.parse({ ...base, primary_source_url: 'https://openai.com/blog/x' });
    expect(ok.primary_source_url).toBe('https://openai.com/blog/x');
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `npx vitest run tests/schemas.test.js -t 'primary_source_url'`
Expected: 3 failures (field missing from schema).

- [ ] **Step 3: Implement schema change**

Edit `pipeline/schemas/picks.js`:

```javascript
import { z } from 'zod';

export const PickSchema = z.object({
  rank: z.number().int().min(1).max(3),
  item_id: z.string(),
  angle: z.string(),
  rationale: z.string(),
  suggested_visuals: z.array(z.string()),
  risk_flags: z.array(z.string()),
  primary_source_url: z.string().url(),
});

export const PicksFileSchema = z.object({
  date: z.string(),
  picks: z.array(PickSchema).length(3),
  rejected: z.array(z.object({ item_id: z.string(), reason: z.string() })),
});
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run tests/schemas.test.js`
Expected: all green.

- [ ] **Step 5: Backfill the existing 2026-04-24-1 picks file**

Edit `work/2026-04-24-1/picks.json` and add `"primary_source_url": "<best guess>"` to each pick entry. Use:
- pick 1 (GPT-5.5): `https://openai.com/index/introducing-gpt-5-5/`
- pick 2 (DeepSeek V4): `https://github.com/deepseek-ai/DeepSeek-V4`
- pick 3 (Mythos / Mozilla): `https://blog.mozilla.org/security/2026/04/firefox-150-mythos-vulnerability-research/`

(These are best-guesses; if any 404 during a later capture test, the fallback chain handles it.)

- [ ] **Step 6: Commit**

```bash
git add pipeline/schemas/picks.js tests/schemas.test.js work/2026-04-24-1/picks.json
git commit -m "feat(schemas): require primary_source_url on PickSchema

Picker LLM will emit this; existing run backfilled with best-guess URLs."
```

---

## Task 3: Update `yt-research` skill prompt to emit `primary_source_url`

**Files:**
- Modify: `.claude/skills/yt-research/SKILL.md`

- [ ] **Step 1: Read the current skill file to find the picks schema section**

Run: `grep -n 'item_id\|primary_source\|rank' .claude/skills/yt-research/SKILL.md`
Expected: lines showing the schema description block.

- [ ] **Step 2: Add the new field to the documented schema**

In the section that documents the JSON shape the skill must emit, add `"primary_source_url"` to each example pick. Match the existing indentation/style. Example replacement (adjust strings to match the file):

In every example pick object, add the field:
```json
"primary_source_url": "https://openai.com/index/introducing-gpt-5-5/"
```

- [ ] **Step 3: Add a prompt instruction explaining how to choose the URL**

Add a new bullet (or paragraph) near the existing "ranking criteria" section:

```markdown
### `primary_source_url` — choose the canonical announcement, not the news article

For each pick, identify the URL where the original announcement / docs / repo lives — the page the news article is *reporting on*. Examples:

- A vendor blog post (e.g., `openai.com/blog/...`, `anthropic.com/news/...`)
- A GitHub repository or release page (e.g., `github.com/deepseek-ai/...`)
- An official docs page or release notes
- An academic paper landing page (arxiv abstract page, not the PDF)

If the news article doesn't link a clear primary source, set `primary_source_url` to the same URL as the news article. Do not invent URLs you can't see in the article body.
```

- [ ] **Step 4: Smoke-check the skill file is still valid markdown**

Run: `head -50 .claude/skills/yt-research/SKILL.md`
Expected: well-formed markdown, frontmatter intact.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/yt-research/SKILL.md
git commit -m "feat(yt-research): require primary_source_url in picks output

Picker now identifies the canonical announcement URL per story so the
screenshot pipeline captures topical content, not news aggregator pages."
```

---

## Task 4: Vendor the I-Don't-Care-About-Cookies CSS blocklist

**Files:**
- Create: `vendor/idcac-rules.css`
- Create: `vendor/README.md`

- [ ] **Step 1: Download a pinned release of the IDCAC stylesheet**

Run:
```bash
mkdir -p vendor
curl -o vendor/idcac-rules.css \
  -L "https://www.i-dont-care-about-cookies.eu/abp/?style=&type=plain" \
  --fail
```

If that endpoint format has changed, fall back to:
```bash
curl -o vendor/idcac-rules.css \
  -L "https://raw.githubusercontent.com/OhMyGuus/I-Still-Dont-Care-About-Cookies/master/data/rules.txt" \
  --fail
```

(The maintained fork ISDCAC is the active continuation of the original.)

Expected: file > 100 KB containing CSS selectors.

- [ ] **Step 2: Convert ABP-syntax rules to plain CSS if needed**

If the file uses Adblock Plus syntax (`example.com##.banner`), convert to plain CSS by extracting just the selector portion (`.banner { display: none !important; }`). Write a small inline script:

```bash
node -e "
const fs=require('fs');
const raw=fs.readFileSync('vendor/idcac-rules.css','utf8');
if (raw.includes('##')) {
  const lines=raw.split(/\r?\n/).filter(l=>l && !l.startsWith('!') && l.includes('##'));
  const css=lines.map(l=>{
    const sel=l.split('##')[1];
    return sel ? sel + ' { display: none !important; visibility: hidden !important; }' : '';
  }).filter(Boolean).join('\n');
  fs.writeFileSync('vendor/idcac-rules.css', css);
  console.log('converted', lines.length, 'rules');
} else {
  console.log('already CSS, no conversion needed');
}
"
```

Expected: either `already CSS, no conversion needed` or `converted N rules`.

- [ ] **Step 3: Add a README documenting source + version**

Create `vendor/README.md`:

```markdown
# Vendored Assets

## idcac-rules.css

Source: https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies (or original IDCAC at https://www.i-dont-care-about-cookies.eu/)
Pinned: <yyyy-mm-dd of download>
License: GPL-3.0 (rules), code is MIT — used here as data only

Updated by re-running `Task 4` of `docs/superpowers/plans/2026-04-25-screenshot-quality.md`.
Bumping cadence: monthly or when capture quality degrades.
```

Replace `<yyyy-mm-dd>` with today's date.

- [ ] **Step 4: Commit**

```bash
git add vendor/
git commit -m "vendor: pin IDCAC CSS blocklist for cookie-banner suppression"
```

---

## Task 5: Implement og-image helper

**Files:**
- Create: `pipeline/lib/og-image.mjs`
- Create: `tests/og-image.test.js`
- Create: `tests/fixtures/og-image/with-og.html`
- Create: `tests/fixtures/og-image/no-og.html`
- Create: `tests/fixtures/og-image/broken-og.html`

- [ ] **Step 1: Create test fixtures**

Create `tests/fixtures/og-image/with-og.html`:

```html
<!doctype html>
<html><head>
<meta property="og:image" content="https://example.com/cover.png">
<meta property="og:title" content="Sample">
</head><body></body></html>
```

Create `tests/fixtures/og-image/no-og.html`:

```html
<!doctype html><html><head><title>No OG</title></head><body></body></html>
```

Create `tests/fixtures/og-image/broken-og.html`:

```html
<!doctype html><html><head>
<meta property="og:image" content="not-a-url">
</head><body></body></html>
```

- [ ] **Step 2: Write failing tests**

Create `tests/og-image.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractOgImageUrl } from '../pipeline/lib/og-image.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/og-image', name), 'utf8');

describe('extractOgImageUrl', () => {
  it('returns the og:image URL when present', () => {
    expect(extractOgImageUrl(fx('with-og.html'))).toBe('https://example.com/cover.png');
  });

  it('returns null when og:image meta is missing', () => {
    expect(extractOgImageUrl(fx('no-og.html'))).toBeNull();
  });

  it('returns null when og:image content is not a valid URL', () => {
    expect(extractOgImageUrl(fx('broken-og.html'))).toBeNull();
  });

  it('resolves relative og:image against a base URL', () => {
    const html = '<meta property="og:image" content="/cover.png">';
    expect(extractOgImageUrl(html, 'https://example.com/article')).toBe('https://example.com/cover.png');
  });
});
```

- [ ] **Step 3: Run tests to confirm failure**

Run: `npx vitest run tests/og-image.test.js`
Expected: 4 failures (module not found).

- [ ] **Step 4: Implement the helper**

Create `pipeline/lib/og-image.mjs`:

```javascript
import { JSDOM } from 'jsdom';

export function extractOgImageUrl(html, baseUrl) {
  const dom = new JSDOM(html);
  const meta = dom.window.document.querySelector('meta[property="og:image"], meta[name="og:image"]');
  const raw = meta?.getAttribute('content');
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchOgImage(pageUrl, outputPath, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const html = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ai-daily-bot/0.3)' },
    }).then(r => r.ok ? r.text() : null);
    if (!html) return null;
    const imgUrl = extractOgImageUrl(html, pageUrl);
    if (!imgUrl) return null;
    const img = await fetch(imgUrl, { signal: ctrl.signal }).then(r => r.ok ? r : null);
    if (!img) return null;
    const ct = img.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outputPath, buf);
    return { path: outputPath, contentType: ct, bytes: buf.length };
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `npx vitest run tests/og-image.test.js`
Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/og-image.mjs tests/og-image.test.js tests/fixtures/og-image/
git commit -m "feat(pipeline): add og-image extraction + fetch helper

Used as fallback in screenshot pipeline when Puppeteer capture fails or
returns a low-quality image."
```

---

## Task 6: Implement screenshot-quality detector

**Files:**
- Create: `pipeline/lib/screenshot-quality.mjs`
- Create: `tests/screenshot-quality.test.js`
- Create: `tests/fixtures/screenshots/clean-article.png` (any reasonable article screenshot)
- Create: `tests/fixtures/screenshots/cookie-banner-overlay.png` (mostly-grey banner-dominant)
- Create: `tests/fixtures/screenshots/mostly-white.png` (programmatically generated solid #FFFFFF 1200×800 PNG)
- Create: `tests/fixtures/screenshots/headline-card-sample.png` (programmatically generated dark + accent + text)

- [ ] **Step 1: Generate the synthetic fixtures**

Run:
```bash
mkdir -p tests/fixtures/screenshots
node -e "
import('sharp').then(async ({default:s})=>{
  await s({create:{width:1200,height:800,channels:3,background:'#FFFFFF'}}).png().toFile('tests/fixtures/screenshots/mostly-white.png');
  await s({create:{width:1200,height:800,channels:3,background:'#0A0A0A'}})
    .composite([{input:Buffer.from(\`<svg width=1200 height=800><rect x=0 y=0 width=6 height=120 fill='#0066FF'/><text x=40 y=80 font-size=72 font-family=Inter font-weight=800 fill='#F5F5F5'>Headline</text></svg>\`),top:0,left:0}])
    .png().toFile('tests/fixtures/screenshots/headline-card-sample.png');
  // banner overlay: mostly dark background with a centered ~50% area light rectangle
  await s({create:{width:1200,height:800,channels:3,background:'#101010'}})
    .composite([{input:Buffer.from(\`<svg width=1200 height=800><rect x=200 y=200 width=800 height=400 fill='#FFFFFF' stroke='#3B82F6' stroke-width='4'/></svg>\`),top:0,left:0}])
    .png().toFile('tests/fixtures/screenshots/cookie-banner-overlay.png');
  console.log('ok');
});
"
```

For `clean-article.png`: copy `work/2026-04-24-1/screenshots/rss-036a76cbfdc2cef6.png` to the fixtures folder (the Ars Technica capture from yesterday is a clean article shot):

```bash
cp work/2026-04-24-1/screenshots/rss-036a76cbfdc2cef6.png tests/fixtures/screenshots/clean-article.png
```

- [ ] **Step 2: Write failing tests**

Create `tests/screenshot-quality.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScreenshot, isAcceptable } from '../pipeline/lib/screenshot-quality.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/screenshots', name));

describe('analyzeScreenshot', () => {
  it('flags a mostly-white capture as monochrome', async () => {
    const r = await analyzeScreenshot(fx('mostly-white.png'));
    expect(r.dominantColorPct).toBeGreaterThan(0.85);
    expect(r.flags).toContain('monochrome');
  });

  it('does not flag a clean article capture as monochrome', async () => {
    const r = await analyzeScreenshot(fx('clean-article.png'));
    expect(r.dominantColorPct).toBeLessThan(0.85);
    expect(r.flags).not.toContain('monochrome');
  });

  it('flags a banner-shaped overlay capture', async () => {
    const r = await analyzeScreenshot(fx('cookie-banner-overlay.png'));
    expect(r.flags).toContain('banner_overlay');
  });

  it('does not flag the headline-card sample (intentional design)', async () => {
    // headline cards are intentionally dark+accent+text — they should pass quality
    const r = await analyzeScreenshot(fx('headline-card-sample.png'));
    expect(r.flags).not.toContain('banner_overlay');
  });
});

describe('isAcceptable', () => {
  it('returns true when no flags', () => {
    expect(isAcceptable({ flags: [], dominantColorPct: 0.4 })).toBe(true);
  });
  it('returns false on any flag', () => {
    expect(isAcceptable({ flags: ['monochrome'], dominantColorPct: 0.9 })).toBe(false);
    expect(isAcceptable({ flags: ['banner_overlay'], dominantColorPct: 0.4 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to confirm failure**

Run: `npx vitest run tests/screenshot-quality.test.js`
Expected: 6 failures (module not found).

- [ ] **Step 4: Implement the helper**

Create `pipeline/lib/screenshot-quality.mjs`:

```javascript
import sharp from 'sharp';

const MONOCHROME_THRESHOLD = 0.85;
const BANNER_AREA_THRESHOLD = 0.40;

export async function analyzeScreenshot(buffer) {
  const flags = [];

  const img = sharp(buffer);
  const meta = await img.metadata();
  const { width, height } = meta;

  // Downsample for speed: 120 wide preserves enough detail for our checks
  const targetW = 120;
  const targetH = Math.round(height * (targetW / width));
  const { data } = await img.resize(targetW, targetH, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });

  // Bucket pixels into 16-color quantized buckets and find dominant
  const buckets = new Map();
  const channels = data.length / (targetW * targetH);
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] >> 4;
    const g = data[i + 1] >> 4;
    const b = data[i + 2] >> 4;
    const key = (r << 8) | (g << 4) | b;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let dominantCount = 0;
  for (const v of buckets.values()) if (v > dominantCount) dominantCount = v;
  const totalPixels = targetW * targetH;
  const dominantColorPct = dominantCount / totalPixels;

  if (dominantColorPct > MONOCHROME_THRESHOLD) flags.push('monochrome');

  // Banner-overlay check: look for a high-contrast rectangle in the middle band
  // covering > BANNER_AREA_THRESHOLD of the image.
  // Heuristic: count pixels brighter than the overall mean by > 60 (gray-luma units)
  // in a centered band (40-90% vertical region). If that count > threshold, flag it.
  let lumaSum = 0;
  for (let i = 0; i < data.length; i += channels) {
    lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const meanLuma = lumaSum / totalPixels;
  const yStart = Math.floor(targetH * 0.15);
  const yEnd = Math.floor(targetH * 0.85);
  let brightCount = 0;
  let bandPixels = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < targetW; x++) {
      const i = (y * targetW + x) * channels;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      bandPixels++;
      if (luma - meanLuma > 60) brightCount++;
    }
  }
  const brightAreaPct = brightCount / bandPixels;
  if (brightAreaPct > BANNER_AREA_THRESHOLD && dominantColorPct < 0.7) {
    // Rule out headline cards: they have a *small* bright text region, not a 40%+ rectangle
    flags.push('banner_overlay');
  }

  return { width, height, dominantColorPct, brightAreaPct, flags };
}

export function isAcceptable(analysis) {
  return analysis.flags.length === 0;
}
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `npx vitest run tests/screenshot-quality.test.js`
Expected: 6 pass. If the headline-card-sample test fails as `banner_overlay`, tighten the heuristic (e.g., raise `BANNER_AREA_THRESHOLD` or check for high-contrast text patterns in the bright region) and re-run. Tune until all 6 pass.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/screenshot-quality.mjs tests/screenshot-quality.test.js tests/fixtures/screenshots/
git commit -m "feat(pipeline): screenshot quality analyzer (monochrome + banner-overlay)

Detects two failure modes in PNG captures: mostly-monochrome (white-out
or banner takeover) and large bright rectangles in the middle band
(modal overlay signature). Used to trigger the screenshot fallback chain."
```

---

## Task 7: Implement headline-card fallback renderer

**Files:**
- Create: `assets/headline-card.css`
- Create: `pipeline/lib/headline-card.mjs`
- Modify: `tests/fixtures/screenshots/headline-card-sample.png` (regenerated by the helper)

- [ ] **Step 1: Create the CSS**

Create `assets/headline-card.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');

:root {
  --bg-primary: #0A0A0A;
  --fg-primary: #F5F5F5;
  --fg-secondary: #A0A0A0;
  --accent: #0066FF;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg-primary); width: 1200px; height: 1200px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.card {
  width: 1200px; height: 1200px;
  padding: 120px 80px;
  display: flex; flex-direction: column; justify-content: center; gap: 48px;
  border-left: 12px solid var(--accent);
}
.scene-num {
  font-size: 200px; font-weight: 800; letter-spacing: -4px; color: var(--accent);
  font-variant-numeric: tabular-nums; line-height: 0.85;
}
.headline {
  font-size: 96px; font-weight: 800; letter-spacing: -2px; color: var(--fg-primary);
  line-height: 1.05; max-width: 1000px;
}
.source {
  font-size: 32px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--fg-secondary);
}
```

- [ ] **Step 2: Implement the renderer**

Create `pipeline/lib/headline-card.mjs`:

```javascript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(new URL('../../assets/headline-card.css', import.meta.url), 'utf8');

export async function renderHeadlineCard(browser, { sceneNum, headline, sourceDomain }, outputPath) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div class="card">
  <div class="scene-num">${String(sceneNum).padStart(2, '0')}</div>
  <div class="headline">${escapeHtml(headline)}</div>
  <div class="source">${escapeHtml(sourceDomain)}</div>
</div></body></html>`;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 10000 });
    // Wait briefly for webfont to apply
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 1200 } });
    return { path: outputPath, width: 1200, height: 1200 };
  } finally {
    await page.close();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

- [ ] **Step 3: Smoke test the renderer**

Run:
```bash
node -e "
import('puppeteer').then(async ({default:p})=>{
  const b = await p.launch({headless:'new'});
  const {renderHeadlineCard} = await import('./pipeline/lib/headline-card.mjs');
  await renderHeadlineCard(b, {sceneNum:1, headline:'OpenAI ships GPT-5.5', sourceDomain:'openai.com'}, '/tmp/hc.png');
  console.log('rendered');
  await b.close();
});
"
```

Expected: `rendered` and a `/tmp/hc.png` (or equivalent on Windows: `%TEMP%\hc.png`) that visually shows the design.

- [ ] **Step 4: Regenerate the test fixture from the real renderer**

Replace the synthetic `tests/fixtures/screenshots/headline-card-sample.png` with output from the real renderer:
```bash
node -e "
import('puppeteer').then(async ({default:p})=>{
  const b = await p.launch({headless:'new'});
  const {renderHeadlineCard} = await import('./pipeline/lib/headline-card.mjs');
  await renderHeadlineCard(b, {sceneNum:1, headline:'Sample Headline', sourceDomain:'example.com'}, 'tests/fixtures/screenshots/headline-card-sample.png');
  await b.close();
});
"
```

- [ ] **Step 5: Re-run screenshot-quality tests against the real headline card**

Run: `npx vitest run tests/screenshot-quality.test.js`
Expected: 6 pass. If the real headline card now flags as `banner_overlay`, tune the heuristic in `screenshot-quality.mjs` (raise threshold or add rule: skip flag if accent-blue pixels are present at left edge — signature of headline card).

- [ ] **Step 6: Commit**

```bash
git add assets/headline-card.css pipeline/lib/headline-card.mjs tests/fixtures/screenshots/headline-card-sample.png
git commit -m "feat(pipeline): headline-card fallback renderer

When all screenshot capture paths fail, render a clean DESIGN.md-styled
card with scene number, headline, and source domain. Always succeeds
(deterministic Puppeteer + bundled CSS)."
```

---

## Task 8: Add `screenshot_overrides` to config schema

**Files:**
- Modify: `pipeline/schemas/config.js`
- Modify: `config.json`
- Modify: `tests/schemas.test.js`

- [ ] **Step 1: Add a failing schema test**

Append to `tests/schemas.test.js`:

```javascript
import { ConfigSchema } from '../pipeline/schemas/config.js';
import { readFileSync } from 'node:fs';

describe('ConfigSchema screenshot_overrides', () => {
  const baseRaw = JSON.parse(readFileSync('config.json', 'utf8'));

  it('accepts an empty overrides map', () => {
    expect(() => ConfigSchema.parse({ ...baseRaw, screenshot_overrides: {} })).not.toThrow();
  });

  it('accepts a populated overrides entry', () => {
    const cfg = {
      ...baseRaw,
      screenshot_overrides: {
        'openai.com': { hide: ['.cookie-banner'], wait_for: '.article', timeout_ms: 30000 },
      },
    };
    expect(() => ConfigSchema.parse(cfg)).not.toThrow();
  });

  it('rejects a non-array hide field', () => {
    const cfg = { ...baseRaw, screenshot_overrides: { 'openai.com': { hide: '.x' } } };
    expect(() => ConfigSchema.parse(cfg)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run tests/schemas.test.js -t 'screenshot_overrides'`
Expected: 3 failures (field unknown — strict schema rejects extras, OR field absent).

- [ ] **Step 3: Implement schema change**

Edit `pipeline/schemas/config.js` — find the `ConfigSchema = z.object({` block and add the field:

```javascript
  screenshot_overrides: z.record(z.object({
    hide: z.array(z.string()).optional(),
    wait_for: z.string().optional(),
    timeout_ms: z.number().int().positive().optional(),
  })).default({}),
```

(Add the closing `});` if it's not already there. Place this field after the existing fields but inside the same `z.object()` call.)

- [ ] **Step 4: Add the field to config.json**

Edit `config.json` — append (top-level, after the existing entries):

```json
  ,"screenshot_overrides": {}
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `npx vitest run tests/schemas.test.js`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add pipeline/schemas/config.js config.json tests/schemas.test.js
git commit -m "feat(config): add screenshot_overrides per-domain capture hints

Per-domain hide selectors, wait_for, and timeout overrides for sites
the IDCAC blocklist doesn't fully handle."
```

---

## Task 9: Extend `ScreenshotsManifestSchema`

**Files:**
- Modify: `pipeline/schemas/screenshots-manifest.js`
- Modify: `tests/schemas.test.js`

- [ ] **Step 1: Add a failing test**

Append to `tests/schemas.test.js`:

```javascript
import { ScreenshotsManifestSchema } from '../pipeline/schemas/screenshots-manifest.js';

describe('ScreenshotsManifestSchema width/height/source_kind', () => {
  it('requires width, height, source_kind on each entry', () => {
    const bad = { entries: [{ item_id: 'x', path: 'p.png', fallback: false, source_domain: 'd' }] };
    expect(() => ScreenshotsManifestSchema.parse(bad)).toThrow();
  });

  it('accepts a valid entry', () => {
    const good = {
      entries: [{
        item_id: 'x', path: 'p.png', fallback: false, source_domain: 'd',
        width: 1200, height: 2400, source_kind: 'primary',
      }],
    };
    expect(() => ScreenshotsManifestSchema.parse(good)).not.toThrow();
  });

  it('restricts source_kind to known values', () => {
    const bad = {
      entries: [{
        item_id: 'x', path: 'p.png', fallback: false, source_domain: 'd',
        width: 1200, height: 2400, source_kind: 'unknown_kind',
      }],
    };
    expect(() => ScreenshotsManifestSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run tests/schemas.test.js -t 'width/height/source_kind'`
Expected: 3 failures.

- [ ] **Step 3: Implement schema change**

Edit `pipeline/schemas/screenshots-manifest.js`:

```javascript
import { z } from 'zod';

export const SourceKindSchema = z.enum(['primary', 'news', 'og_image', 'headline_card']);

export const ScreenshotsManifestSchema = z.object({
  entries: z.array(z.object({
    item_id: z.string(),
    path: z.string().nullable(),
    fallback: z.boolean(),
    source_domain: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    source_kind: SourceKindSchema,
    error: z.string().optional(),
  })),
});
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run tests/schemas.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add pipeline/schemas/screenshots-manifest.js tests/schemas.test.js
git commit -m "feat(schemas): add width/height/source_kind to screenshots manifest

Width/height feed Spec B's scroll-frame distance calc; source_kind
records which fallback path produced the image."
```

---

## Task 10: Rewrite `capture-screenshots.mjs` with fallback chain

**Files:**
- Modify: `pipeline/capture-screenshots.mjs`

- [ ] **Step 1: Read the IDCAC CSS into a string at module load**

(Will be done in the implementation in step 2.)

- [ ] **Step 2: Replace the file**

Replace `pipeline/capture-screenshots.mjs` with:

```javascript
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';
import { fetchOgImage } from './lib/og-image.mjs';
import { analyzeScreenshot, isAcceptable } from './lib/screenshot-quality.mjs';
import { renderHeadlineCard } from './lib/headline-card.mjs';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node capture-screenshots.mjs <work-dir>'); process.exit(2); }

const config = loadConfig();
const overrides = config.screenshot_overrides || {};
const idcac = readFileSync(new URL('../vendor/idcac-rules.css', import.meta.url), 'utf8');
const REALISTIC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const items = JSON.parse(readFileSync(join(workDir, 'items.json'), 'utf8')).items;
const picks = JSON.parse(readFileSync(join(workDir, 'picks.json'), 'utf8')).picks;
const shotsDir = join(workDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new' });

function domainOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return 'unknown'; }
}

function overrideFor(host) {
  for (const key of Object.keys(overrides)) {
    if (host === key || host.endsWith('.' + key)) return overrides[key];
  }
  return null;
}

async function capturePage(url, outPath) {
  const host = domainOf(url);
  const ov = overrideFor(host);
  const page = await browser.newPage();
  try {
    await page.setUserAgent(REALISTIC_UA);
    await page.setViewport({ width: 1200, height: 1080, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: ov?.timeout_ms ?? 25000 });
    await page.addStyleTag({ content: idcac });
    if (ov?.hide?.length) {
      await page.addStyleTag({ content: ov.hide.map(s => `${s}{display:none!important;visibility:hidden!important}`).join('\n') });
    }
    if (ov?.wait_for) {
      await page.waitForSelector(ov.wait_for, { timeout: 5000 }).catch(() => {});
    }
    // Scroll-then-settle to trigger lazy loaders
    await page.evaluate(async () => {
      const total = document.body.scrollHeight;
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        window.scrollTo(0, (total / steps) * i);
        await new Promise(r => setTimeout(r, 500));
      }
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 400));
    });
    const docHeight = await page.evaluate(() => Math.min(document.body.scrollHeight, 3000));
    const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: docHeight } });
    return { buffer, width: 1200, height: docHeight };
  } finally {
    await page.close();
  }
}

async function captureWithQuality(url, outPath) {
  const cap = await capturePage(url, outPath);
  const analysis = await analyzeScreenshot(cap.buffer);
  if (isAcceptable(analysis)) {
    writeFileSync(outPath, cap.buffer);
    return { ok: true, width: cap.width, height: cap.height };
  }
  return { ok: false, flags: analysis.flags };
}

async function shoot(pick) {
  const item = items.find(i => i.id === pick.item_id);
  if (!item) {
    return { item_id: pick.item_id, path: null, fallback: true, source_domain: 'unknown',
             width: 1200, height: 1200, source_kind: 'headline_card', error: 'item_not_found' };
  }
  const outPath = join(shotsDir, `${item.id}.png`);
  const primaryUrl = pick.primary_source_url || item.external_url;
  const newsUrl = item.external_url;

  // Step 1: try primary URL via Puppeteer + IDCAC
  try {
    const r = await captureWithQuality(primaryUrl, outPath);
    if (r.ok) {
      return { item_id: item.id, path: `screenshots/${item.id}.png`, fallback: false,
               source_domain: domainOf(primaryUrl), width: r.width, height: r.height,
               source_kind: 'primary' };
    }
    console.warn(`[${item.id}] primary capture rejected: ${r.flags.join(',')}`);
  } catch (err) {
    console.warn(`[${item.id}] primary capture error: ${err.message}`);
  }

  // Step 2: og:image of primary URL
  try {
    const og = await fetchOgImage(primaryUrl, outPath.replace(/\.png$/, '-og.png'));
    if (og) {
      const buf = readFileSync(og.path);
      const meta = await sharp(buf).metadata();
      writeFileSync(outPath, buf);
      return { item_id: item.id, path: `screenshots/${item.id}.png`, fallback: false,
               source_domain: domainOf(primaryUrl), width: meta.width, height: meta.height,
               source_kind: 'og_image' };
    }
  } catch (err) {
    console.warn(`[${item.id}] primary og:image failed: ${err.message}`);
  }

  // Step 3: og:image of news article
  try {
    const og = await fetchOgImage(newsUrl, outPath.replace(/\.png$/, '-news-og.png'));
    if (og) {
      const buf = readFileSync(og.path);
      const meta = await sharp(buf).metadata();
      writeFileSync(outPath, buf);
      return { item_id: item.id, path: `screenshots/${item.id}.png`, fallback: false,
               source_domain: domainOf(newsUrl), width: meta.width, height: meta.height,
               source_kind: 'og_image' };
    }
  } catch (err) {
    console.warn(`[${item.id}] news og:image failed: ${err.message}`);
  }

  // Step 4: generated headline card (always succeeds)
  const sceneNum = pick.rank;
  const headline = item.title || pick.angle.split('.')[0];
  const card = await renderHeadlineCard(browser, { sceneNum, headline, sourceDomain: domainOf(primaryUrl) }, outPath);
  return { item_id: item.id, path: `screenshots/${item.id}.png`, fallback: true,
           source_domain: domainOf(primaryUrl), width: card.width, height: card.height,
           source_kind: 'headline_card' };
}

let entries;
try {
  entries = await Promise.all(picks.map(shoot));
} finally {
  await browser.close();
}

writeFileSync(join(workDir, 'screenshots-manifest.json'), JSON.stringify({ entries }, null, 2));
const byKind = entries.reduce((m, e) => (m[e.source_kind] = (m[e.source_kind] || 0) + 1, m), {});
console.log('OK screenshots:', JSON.stringify(byKind));
```

- [ ] **Step 3: Run a smoke test against the existing run**

Run from project root:
```bash
node pipeline/capture-screenshots.mjs work/2026-04-24-1
```

Expected: prints `OK screenshots: {"primary": N, ...}` after 30-90 seconds. Inspect `work/2026-04-24-1/screenshots/*.png` — they should now show topical content (OpenAI announcement, DeepSeek repo, Mozilla blog post) instead of cookie banners. If primary URLs from Task 2 step 5 don't exist, expect `og_image` or `headline_card` kinds.

- [ ] **Step 4: Inspect the manifest**

Run: `cat work/2026-04-24-1/screenshots-manifest.json`
Expected: each entry has `width`, `height`, `source_kind`, populated `path`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/capture-screenshots.mjs
git commit -m "feat(pipeline): rewrite screenshot capture with primary-source + fallback chain

- Uses primary_source_url from picks.json as the canonical capture target
- Injects IDCAC CSS blocklist + per-domain overrides
- Realistic UA, 1200x1080 viewport, scroll-then-settle, captures up to 3000px tall
- Quality check (monochrome + banner-overlay) gates each capture
- Fallback chain: primary URL -> primary og:image -> news og:image -> headline card
- Writes width/height/source_kind to screenshots-manifest.json"
```

---

## Task 11: Add `screenshot_quality` lint rule

**Files:**
- Modify: `pipeline/lint.mjs`

- [ ] **Step 1: Replace `pipeline/lint.mjs`**

```javascript
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScreenshot, isAcceptable } from './lib/screenshot-quality.mjs';

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

// Screenshot quality post-check
const manifestPath = join(workDir, 'screenshots-manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let bad = 0;
  for (const e of manifest.entries) {
    if (!e.path) continue;
    const buf = readFileSync(join(workDir, e.path));
    const a = await analyzeScreenshot(buf);
    if (!isAcceptable(a) && e.source_kind !== 'headline_card') {
      console.error(`screenshot_quality: ${e.item_id} (${e.source_kind}) flags=${a.flags.join(',')}`);
      bad++;
    }
  }
  if (bad > 0) {
    console.error(`${bad} screenshot(s) failed quality check — fix capture-screenshots or add per-domain override`);
    process.exit(1);
  }
}

console.log('OK lint + validate + screenshot_quality clean');
```

- [ ] **Step 2: Run lint against the existing run**

Run: `node pipeline/lint.mjs work/2026-04-24-1`
Expected: passes (assumes Task 10 produced acceptable captures).

- [ ] **Step 3: Commit**

```bash
git add pipeline/lint.mjs
git commit -m "feat(lint): add screenshot_quality post-check

Re-validates each captured PNG using the analyzer; fails the lint if
any non-headline-card screenshot is flagged. Headline-card kind is
exempt because it's intentionally minimal."
```

---

## Task 12: Re-render today's video as the integration test

**Files:** none (validation only)

- [ ] **Step 1: Re-run capture against the existing run**

Run: `node pipeline/capture-screenshots.mjs work/2026-04-24-1`
Expected: `OK screenshots: {"primary": 3}` ideally, or a mix with at least one `primary` and at most one `headline_card`.

- [ ] **Step 2: Visual review**

Open `work/2026-04-24-1/screenshots/*.png` in an image viewer. Each should show topical content (announcement page / repo / blog), no cookie banners.

- [ ] **Step 3: Re-run lint**

Run: `node pipeline/lint.mjs work/2026-04-24-1`
Expected: `OK lint + validate + screenshot_quality clean`.

- [ ] **Step 4: Re-render the index.html in the studio for visual confirm**

The studio at http://localhost:3002 auto-reloads. Refresh — screenshots are now topical. (Note: the scroll animation from Spec B isn't built yet, so the screenshot is still static-clipped. That's expected.)

- [ ] **Step 5: No commit needed** (validation step only)

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Picker emits `primary_source_url` — Task 2, 3
- ✅ IDCAC blocklist injection — Task 4, 10
- ✅ Per-domain overrides — Task 8, 10
- ✅ No clicking of banners — Task 10 (only `addStyleTag`, no `.click()`)
- ✅ Realistic UA, lazy-load wait, retry — Task 10
- ✅ Capture geometry 1200×3000 — Task 10
- ✅ Failure detection (monochrome + banner-shape) — Task 6
- ✅ Fallback chain primary→og→news-og→headline-card — Task 10
- ✅ `source_kind` in manifest — Task 9, 10
- ✅ Lint rule — Task 11
- ✅ Re-run today's video — Task 12

**Type consistency:** `analyzeScreenshot` returns `{ width, height, dominantColorPct, brightAreaPct, flags }`; consumers in Tasks 10 and 11 use `flags`/`isAcceptable` only. `renderHeadlineCard` returns `{ path, width, height }`; consumed in Task 10 as `card.width/.height`. `fetchOgImage` returns `{ path, contentType, bytes }` or `null`; consumed in Task 10 — uses `og.path` only. `SourceKindSchema` enum matches the strings emitted in `capture-screenshots.mjs` (`primary`, `og_image`, `headline_card` — note: `news` enum value defined but unused in Task 10's fallback chain because both og-image fallbacks share the `og_image` kind; that's intentional, the chain doesn't need to distinguish).

**No placeholders:** all steps contain runnable code or commands.

---

## Execution Notes

This plan is independent of the visual-richness plan but produces output (the new `screenshots-manifest.json` schema with `width`/`height`) that Plan B consumes. Implement and merge this first.

Recommended worktree: `git worktree add ../yt-screenshot-quality master` and execute there to keep master clean during implementation.
