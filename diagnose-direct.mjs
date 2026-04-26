// Load the preview URL DIRECTLY in a fresh tab — bypasses the studio chrome.
// If this works, the composition is fine and the bug is in the studio's iframe wiring.
// If this also fails, the composition has an error.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL_PREVIEW = 'http://localhost:3002/api/projects/2026-04-25-1/preview';
const OUT = process.platform === 'win32' ? 'C:/Users/ahmed/AppData/Local/Temp/preview-direct' : '/tmp/preview-direct';
mkdirSync(OUT, { recursive: true });

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
