// Deep probe: captures iframe errors, console messages, postMessage traffic, and timeline state.
// Usage: node deep-probe.mjs <run-id>  (default: 2026-04-25-1)
import puppeteer from 'puppeteer';

const RUN_ID = process.argv[2] || '2026-04-25-1';
const STUDIO = 'http://localhost:3000/';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1600, height: 900 });

const events = [];
page.on('console', m => events.push(`[parent.${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', e => events.push(`[parent.pageerror] ${e.message.slice(0, 250)}`));
page.on('requestfailed', r => events.push(`[reqfail] ${r.url().slice(50)} :: ${r.failure()?.errorText}`));

// Hook all iframes too
page.on('frameattached', f => {
  console.log('iframe attached:', f.url().slice(0, 80));
});

await page.goto(STUDIO, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => [...document.querySelectorAll('*')].some(e => (e.textContent || '').trim() === 'index' && e.children.length === 0), { timeout: 15_000 });

// click index
await page.evaluate(() => {
  const leaf = [...document.querySelectorAll('*')].find(e => (e.textContent || '').trim() === 'index' && e.children.length === 0);
  let cur = leaf;
  while (cur) {
    if (getComputedStyle(cur).cursor === 'pointer') { cur.click(); return; }
    cur = cur.parentElement;
  }
});
console.log('clicked index');

// Wait for iframe to attach (poll up to 15s)
let previewFrame = null;
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const frames = page.frames();
  previewFrame = frames.find(f => f.url().includes('/preview'));
  if (previewFrame) {
    console.log(`iframe found at +${i+1}s: ${previewFrame.url().slice(0, 100)}`);
    break;
  }
  console.log(`+${i+1}s no iframe yet, frames=${frames.length}`);
}
if (previewFrame) {
  // Re-attach console listener to the iframe via CDP
  const client = await page.target().createCDPSession();
  await client.send('Runtime.enable');
  client.on('Runtime.consoleAPICalled', m => {
    const text = m.args.map(a => a.value || a.description || '').join(' ');
    events.push(`[iframe.${m.type}] ${text.slice(0, 250)}`);
  });
  client.on('Runtime.exceptionThrown', m => {
    events.push(`[iframe.exception] ${m.exceptionDetails?.text || ''} ${m.exceptionDetails?.exception?.description?.slice(0, 200) || ''}`);
  });

  // Wait & poll player state, plus inspect iframe globals
  for (let i = 1; i <= 8; i++) {
    await new Promise(r => setTimeout(r, 1000));

    const playerState = await page.evaluate(() => {
      const hf = document.querySelector('hyperframes-player');
      return hf ? { ready: hf._ready, duration: hf._duration, runtimeInjected: hf._runtimeInjected } : null;
    });

    const iframeState = await previewFrame.evaluate(() => {
      const tlKeys = Object.keys(window.__timelines || {});
      const tlInfo = tlKeys.map(k => ({ id: k, duration: window.__timelines[k]?.duration?.() }));
      const compEls = [...document.querySelectorAll('[data-composition-id]')].map(e => ({
        id: e.dataset.compositionId,
        tag: e.tagName.toLowerCase(),
        children: e.children.length
      }));
      const audio = document.querySelector('audio');
      return {
        tls: tlInfo,
        comps: compEls.slice(0, 6),
        audioReady: audio ? { readyState: audio.readyState, duration: audio.duration, src: audio.currentSrc.slice(-40) } : null,
        gsap: typeof window.gsap,
        bodyHTMLLen: document.body.innerHTML.length,
      };
    }).catch(e => ({ error: e.message }));

    console.log(`+${i}s player=${JSON.stringify(playerState)} iframe=${JSON.stringify(iframeState)}`);
    if (playerState?.ready) break;
  }
} else {
  console.log('NO preview iframe found');
}

console.log('\n=== events ===');
for (const e of events.slice(-40)) console.log('  ', e);

await browser.close();
