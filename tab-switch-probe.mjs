// Reproduce: click index → wait ready → click intro → click index. Capture network at each step.
import puppeteer from 'puppeteer';

const STUDIO = 'http://localhost:3000/';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1600, height: 900 });

const reqs = [];
page.on('request', r => { if (r.url().includes('/preview')) reqs.push({ t: Date.now(), m: r.method(), u: r.url(), s: 'pending' }); });
page.on('response', r => { if (r.url().includes('/preview')) { const e = reqs.find(x => x.u === r.url() && x.s === 'pending'); if (e) e.s = r.status(); } });
page.on('requestfailed', r => { if (r.url().includes('/preview')) { const e = reqs.find(x => x.u === r.url() && x.s === 'pending'); if (e) e.s = `FAIL:${r.failure()?.errorText.slice(0, 30)}`; } });

const T0 = Date.now();
function dt() { return ((Date.now() - T0) / 1000).toFixed(1); }

await page.goto(STUDIO, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => [...document.querySelectorAll('*')].some(e => (e.textContent || '').trim() === 'index' && e.children.length === 0), { timeout: 15_000 });

async function clickSidebar(label) {
  return page.evaluate((lbl) => {
    const leaf = [...document.querySelectorAll('*')].find(e => (e.textContent || '').trim() === lbl && e.children.length === 0);
    if (!leaf) return false;
    let cur = leaf;
    while (cur) { if (getComputedStyle(cur).cursor === 'pointer') { cur.click(); return true; } cur = cur.parentElement; }
    return false;
  }, label);
}

async function waitReady(label, maxSec = 10) {
  for (let i = 1; i <= maxSec; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const s = await page.evaluate(() => {
      const hf = document.querySelector('hyperframes-player');
      return hf ? { r: hf._ready, d: hf._duration, i: hf._runtimeInjected } : null;
    });
    if (s?.r) { console.log(`  [${label}] ready @ +${i}s ${JSON.stringify(s)}`); return true; }
  }
  const s = await page.evaluate(() => {
    const hf = document.querySelector('hyperframes-player');
    return hf ? { r: hf._ready, d: hf._duration, i: hf._runtimeInjected } : null;
  });
  console.log(`  [${label}] NOT READY after ${maxSec}s ${JSON.stringify(s)}`);
  return false;
}

const stepBoundaries = [];

console.log(`+${dt()}s --- Step 1: click index ---`);
stepBoundaries.push({ name: 'click-index', t: Date.now() });
await clickSidebar('index');
await waitReady('index');

console.log(`+${dt()}s --- Step 2: click intro ---`);
stepBoundaries.push({ name: 'click-intro', t: Date.now() });
await clickSidebar('intro');
await waitReady('intro');

console.log(`+${dt()}s --- Step 3: click index again ---`);
stepBoundaries.push({ name: 'click-index-2', t: Date.now() });
await clickSidebar('index');
await waitReady('index-2');

console.log('\n=== preview requests by step ===');
let stepIdx = 0;
for (const r of reqs) {
  while (stepIdx < stepBoundaries.length - 1 && r.t >= stepBoundaries[stepIdx + 1].t) stepIdx++;
  const stepName = stepBoundaries[stepIdx].name;
  const t = ((r.t - T0) / 1000).toFixed(1);
  const path = r.u.replace('http://localhost:3000', '');
  console.log(`[${stepName}] +${t}s ${r.s} ${path}`);
}

await browser.close();
