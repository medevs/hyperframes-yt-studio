// Test the studio against the project directory in argv[2] (default: most-recent work).
// Reports whether <hyperframes-player>._ready flips to true within 10s.
import puppeteer from 'puppeteer';

const STUDIO = 'http://localhost:3000/';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const errs = [];
page.on('requestfailed', r => errs.push(`reqfail: ${r.url().slice(0, 100)} :: ${r.failure()?.errorText}`));
page.on('pageerror', e => errs.push(`pageerror: ${e.message.slice(0, 200)}`));

await page.goto(STUDIO, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => [...document.querySelectorAll('*')].some(e => (e.textContent || '').trim() === 'index' && e.children.length === 0), { timeout: 15_000 });

await page.evaluate(() => {
  const leaf = [...document.querySelectorAll('*')].find(e => (e.textContent || '').trim() === 'index' && e.children.length === 0);
  let cur = leaf;
  while (cur) {
    if (getComputedStyle(cur).cursor === 'pointer') { cur.click(); return; }
    cur = cur.parentElement;
  }
});
console.log('clicked index');

for (let i = 1; i <= 10; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const s = await page.evaluate(() => {
    const hf = document.querySelector('hyperframes-player');
    return hf ? { ready: hf._ready, duration: hf._duration } : null;
  });
  console.log(`+${i}s`, JSON.stringify(s));
  if (s?.ready) { console.log('READY'); break; }
}

console.log('\nerrors:', errs.length);
for (const e of errs) console.log('  ' + e);

await browser.close();
