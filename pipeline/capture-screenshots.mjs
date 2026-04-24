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
