// Load the preview URL DIRECTLY in a fresh tab — bypasses the studio chrome.
// If this works, the composition is fine and the bug is in the studio's iframe wiring.
// If this also fails, the composition has an error.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function pickMostRecentRun() {
  try {
    const entries = readdirSync('work', { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, mtime: statSync(join('work', e.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return entries[0]?.name;
  } catch { return null; }
}
const RUN_ID = process.argv[2] || process.env.RUN_ID || pickMostRecentRun();
if (!RUN_ID) { console.error('diagnose-direct: no RUN_ID resolved — pass argv[2] or set $RUN_ID'); process.exit(2); }
const URL_PREVIEW = `${process.env.STUDIO_URL?.replace(/\/$/, '') || 'http://localhost:3002'}/api/projects/${RUN_ID}/preview`;
const OUT = join(tmpdir(), 'preview-direct');
mkdirSync(OUT, { recursive: true });

console.log(`[diagnose-direct] run-id=${RUN_ID}  preview=${URL_PREVIEW}  out=${OUT}`);
console.log(`[diagnose-direct] loads preview iframe directly (bypasses studio chrome)`);


const log = [];
const say = (...a) => { const s = a.join(' '); console.log(s); log.push(s); };

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

page.on('console', (m) => say(`[console:${m.type()}]`, m.text()));
page.on('pageerror', (e) => say(`[pageerror]`, e.message));
page.on('requestfailed', (r) => say(`[req-failed]`, r.method(), r.url(), '::', r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) say(`[http-error]`, r.status(), r.url()); });

say(`Loading ${URL_PREVIEW} directly`);
const t0 = Date.now();
await page.goto(URL_PREVIEW, { waitUntil: 'load', timeout: 30000 });
say(`Loaded in ${Date.now() - t0}ms; final URL=${page.url()}`);

// Wait for fonts + GSAP + IIFE
await new Promise((r) => setTimeout(r, 3000));

const state = await page.evaluate(() => {
  const tls = window.__timelines || {};
  const root = document.querySelector('[data-composition-id]');
  const audio = document.querySelector('audio');
  const intro = document.querySelector('#intro');
  return {
    timelineKeys: Object.keys(tls),
    timelineDuration: tls['ai-daily']?.duration?.(),
    rootCompId: root?.dataset?.compositionId,
    rootDuration: root?.dataset?.duration,
    audio: audio ? { src: audio.getAttribute('src'), duration: audio.duration, readyState: audio.readyState } : null,
    introVisible: intro ? { display: getComputedStyle(intro).display, opacity: getComputedStyle(intro).opacity } : null,
    gsapPresent: typeof window.gsap !== 'undefined',
    formatBigNumberPresent: typeof window.formatBigNumber === 'function',
    registerKineticTweensPresent: typeof window.registerKineticTweens === 'function',
    bodyChildCount: document.body.childElementCount,
  };
});
say('STATE:', JSON.stringify(state, null, 2));

await page.screenshot({ path: `${OUT}/01-direct-load.png`, fullPage: false });

// If timeline registered, try seeking to a story scene to see content
if (state.timelineKeys.includes('ai-daily')) {
  await page.evaluate(() => {
    const tl = window.__timelines['ai-daily'];
    tl.pause();
    tl.seek(40);  // story-1 mid
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${OUT}/02-direct-seek-40s.png`, fullPage: false });
  say('Seeked to t=40');
} else {
  say('Timeline NOT registered — cannot seek');
}

writeFileSync(`${OUT}/log.txt`, log.join('\n'));
say(`\nArtifacts in ${OUT}/`);

await browser.close();
