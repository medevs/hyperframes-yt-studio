// Capture every request/response to /api/projects/2026-04-25-1/preview*
import puppeteer from 'puppeteer';

const STUDIO = 'http://localhost:3000/';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1600, height: 900 });

const reqs = [];
page.on('request', r => {
  const u = r.url();
  if (u.includes('/preview')) reqs.push({ t: Date.now(), method: r.method(), url: u, status: 'pending' });
});
page.on('response', r => {
  const u = r.url();
  if (u.includes('/preview')) {
    const e = reqs.find(x => x.url === u && x.status === 'pending');
    if (e) e.status = r.status();
  }
});
page.on('requestfailed', r => {
  const u = r.url();
  if (u.includes('/preview')) {
    const e = reqs.find(x => x.url === u && x.status === 'pending');
    if (e) e.status = `FAIL:${r.failure()?.errorText}`;
  }
});

const T0 = Date.now();
await page.goto(STUDIO, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => [...document.querySelectorAll('*')].some(e => (e.textContent || '').trim() === 'index' && e.children.length === 0), { timeout: 15_000 });

console.log('--- click index ---');
await page.evaluate(() => {
  const leaf = [...document.querySelectorAll('*')].find(e => (e.textContent || '').trim() === 'index' && e.children.length === 0);
  let cur = leaf;
  while (cur) { if (getComputedStyle(cur).cursor === 'pointer') { cur.click(); return; } cur = cur.parentElement; }
});

for (let i = 1; i <= 8; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const ready = await page.evaluate(() => {
    const hf = document.querySelector('hyperframes-player');
    return hf ? { ready: hf._ready, dur: hf._duration, inj: hf._runtimeInjected } : null;
  });
  console.log(`+${i}s ${JSON.stringify(ready)}`);
  if (ready?.ready) break;
}

console.log('\n=== preview-related requests (' + reqs.length + ') ===');
for (const r of reqs) {
  const dt = ((r.t - T0) / 1000).toFixed(1);
  const path = r.url.replace('http://localhost:3000', '');
  console.log(`+${dt}s ${r.method} ${r.status} ${path}`);
}

await browser.close();
