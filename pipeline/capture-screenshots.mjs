import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
      if (!meta.width || !meta.height) {
        console.warn(`[${item.id}] og:image has no usable dimensions, falling through`);
        throw new Error('og:image missing dimensions');
      }
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
      if (!meta.width || !meta.height) {
        console.warn(`[${item.id}] og:image has no usable dimensions, falling through`);
        throw new Error('og:image missing dimensions');
      }
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
