// Diagnostic: open the HyperFrames studio in headless Chrome and capture
// everything needed to explain why the preview canvas is black for the user.
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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
const STUDIO = process.env.STUDIO_URL || 'http://localhost:3002/';
const RUN_ID = process.argv[2] || process.env.RUN_ID || pickMostRecentRun();
if (!RUN_ID) { console.error('diagnose-preview: no RUN_ID resolved — pass argv[2] or set $RUN_ID'); process.exit(2); }
const OUT = join(tmpdir(), 'preview-diag');
mkdirSync(OUT, { recursive: true });

console.log(`[diagnose-preview] run-id=${RUN_ID}  studio=${STUDIO}  out=${OUT}`);
console.log(`[diagnose-preview] heavy probe: console + network + iframe state, screenshots at +3/+8/+15s`);


const log = [];
const net = [];
const consoleLog = (src, msg) => {
  const line = `[${src}] ${msg}`;
  console.log(line);
  log.push(line);
};

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

page.on('console', (m) => consoleLog('page-console', `${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => consoleLog('page-error', `${e.message}\n${e.stack}`));
page.on('requestfailed', (r) => consoleLog('req-failed', `${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => {
  const u = r.url();
  if (r.status() >= 400) consoleLog('http-error', `${r.status()} ${u}`);
  net.push({ status: r.status(), method: r.request().method(), url: u });
});

const T0 = Date.now();
const t = () => `${((Date.now() - T0) / 1000).toFixed(2)}s`;

consoleLog('flow', `goto ${STUDIO}`);
await page.goto(STUDIO, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000)); // let SPA settle
await page.screenshot({ path: `${OUT}/01-loaded.png`, fullPage: false });
consoleLog('flow', `${t()} page loaded; URL=${page.url()}`);

// Inspect what URLs the studio uses for the project
const projectsApi = await page.evaluate(async () => {
  const r = await fetch('/api/projects');
  return { status: r.status, body: await r.text() };
});
consoleLog('api', `GET /api/projects -> ${projectsApi.status}`);
log.push('  body: ' + projectsApi.body.slice(0, 500));

// The studio auto-loaded the last project. Just wait.
consoleLog('flow', `current URL after settle: ${page.url()}`);
await page.screenshot({ path: `${OUT}/02-project.png`, fullPage: false });

// Try fetching the preview endpoint directly to see what the server returns
const previewProbe = await page.evaluate(async (runId) => {
  try {
    const r = await fetch(`/api/projects/${runId}/preview`, { method: 'GET' });
    const body = await r.text();
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), bodyHead: body.slice(0, 800), bodyLen: body.length };
  } catch (e) {
    return { error: e.message };
  }
}, RUN_ID);
consoleLog('preview-probe', JSON.stringify(previewProbe, null, 2));

// Look for composition cards in the left sidebar and click "index"
consoleLog('flow', 'looking for composition cards');
await new Promise((r) => setTimeout(r, 1500));
const sidebar = await page.evaluate(() => {
  const els = [...document.querySelectorAll('*')]
    .filter((e) => /index\.html|compositions\//i.test(e.textContent || '') && e.children.length < 5)
    .slice(0, 15)
    .map((e) => ({ tag: e.tagName, text: (e.textContent || '').slice(0, 80), cls: e.className?.toString?.().slice(0, 80) }));
  return els;
});
consoleLog('sidebar', JSON.stringify(sidebar, null, 2));

// Click the element whose textContent contains "index" but not subdir
const clicked = await page.evaluate(() => {
  const candidates = [...document.querySelectorAll('*')].filter((e) => {
    const t = (e.textContent || '').trim();
    return /^\s*index\s*index\.html\s*$/i.test(t) || /^\s*index\.html\s*$/i.test(t);
  });
  if (candidates.length === 0) {
    // fallback: any text node "index" alone
    const all = [...document.querySelectorAll('button, div, li, a')];
    const c2 = all.find((e) => (e.textContent || '').trim() === 'index');
    if (c2) { c2.click(); return { matched: 'fallback-exact-index', tag: c2.tagName }; }
    return { matched: 'none' };
  }
  candidates[0].click();
  return { matched: 'composition-card', tag: candidates[0].tagName };
});
consoleLog('click', JSON.stringify(clicked));

await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${OUT}/03-after-click-3s.png`, fullPage: false });
consoleLog('flow', `${t()} after click +3s`);

await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: `${OUT}/04-after-click-8s.png`, fullPage: false });
consoleLog('flow', `${t()} after click +8s`);

await new Promise((r) => setTimeout(r, 7000));
await page.screenshot({ path: `${OUT}/05-after-click-15s.png`, fullPage: false });
consoleLog('flow', `${t()} after click +15s`);

// Inspect the iframe (preview)
const frames = page.frames();
consoleLog('frames', `frame count: ${frames.length}`);
for (const f of frames) {
  consoleLog('frames', `  url=${f.url()}`);
}
const previewFrame = frames.find((f) => f !== page.mainFrame() && f.url().length > 0);
if (previewFrame) {
  try {
    const iframeState = await previewFrame.evaluate(() => {
      const tls = window.__timelines || {};
      const keys = Object.keys(tls);
      const root = document.querySelector('[data-composition-id]');
      const audio = document.querySelector('audio');
      return {
        url: location.href,
        timelineKeys: keys,
        timelineDurations: Object.fromEntries(keys.map((k) => [k, tls[k]?.duration?.()])),
        rootCompositionId: root?.dataset?.compositionId,
        rootDuration: root?.dataset?.duration,
        audioReadyState: audio?.readyState,
        audioDuration: audio?.duration,
        audioSrc: audio?.getAttribute('src'),
        gsapPresent: typeof window.gsap !== 'undefined',
        bodyChildCount: document.body.childElementCount,
        firstChildOuterHTML: document.body.firstElementChild?.outerHTML?.slice(0, 200),
      };
    });
    consoleLog('iframe', JSON.stringify(iframeState, null, 2));
  } catch (e) {
    consoleLog('iframe-err', e.message);
  }
} else {
  consoleLog('iframe', 'NO PREVIEW IFRAME FOUND');
}

// Inspect the parent page's React/Zustand state for timelineReady
const studioState = await page.evaluate(() => {
  const playBtn = [...document.querySelectorAll('button')].find((b) => /play|pause/i.test(b.getAttribute('aria-label') || b.title || b.textContent || ''));
  const durEls = [...document.querySelectorAll('*')].filter((e) => /\d:\d\d\s*\/\s*\d:\d\d/.test(e.textContent || ''));
  return {
    playButton: playBtn ? { disabled: playBtn.disabled, label: playBtn.getAttribute('aria-label'), text: playBtn.textContent } : null,
    durationDisplays: durEls.slice(0, 5).map((e) => e.textContent?.trim()),
  };
});
consoleLog('studio', JSON.stringify(studioState, null, 2));

// Final summary of network 4xx/5xx
const failed = net.filter((n) => n.status >= 400);
consoleLog('net-failed-summary', `${failed.length} failed requests`);
for (const f of failed.slice(0, 30)) consoleLog('net-failed', `${f.status} ${f.method} ${f.url}`);

writeFileSync(`${OUT}/log.txt`, log.join('\n'));
writeFileSync(`${OUT}/network.json`, JSON.stringify(net, null, 2));
console.log(`\n=== artifacts in ${OUT}/ ===`);

await browser.close();
