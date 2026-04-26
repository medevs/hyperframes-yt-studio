import puppeteer from 'puppeteer';
const URL = 'http://localhost:3002/api/projects/2026-04-25-1/preview';
const browser = await puppeteer.launch({ headless: 'new', args:['--no-sandbox','--disable-dev-shm-usage'], protocolTimeout: 60000 });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => { const tl = window.__timelines[Object.keys(window.__timelines)[0]]; tl.timeScale(20); tl.play(0); });
await new Promise(r => setTimeout(r, 11000));
await page.evaluate(() => { const tl = window.__timelines[Object.keys(window.__timelines)[0]]; tl.pause(); tl.timeScale(1); tl.seek(22); });
await new Promise(r => setTimeout(r, 500));
const probe = await page.evaluate(() => {
  const root = document.querySelector('#ai-daily');
  const rootRect = root?.getBoundingClientRect();
  const bodyCS = getComputedStyle(document.body);
  const htmlCS = getComputedStyle(document.documentElement);
  return {
    bodyRect: document.body.getBoundingClientRect(),
    rootRect: rootRect ? { x:rootRect.x, y:rootRect.y, w:rootRect.width, h:rootRect.height } : null,
    bodyTransform: bodyCS.transform,
    bodyOverflow: bodyCS.overflow,
    htmlBg: htmlCS.background,
    bodyBg: bodyCS.background,
    rootParent: root?.parentElement?.tagName,
    rootParentBg: root ? getComputedStyle(root.parentElement).background : null,
    elAt960_540: document.elementFromPoint(960, 540)?.outerHTML?.slice(0,200),
    elAt960_900: document.elementFromPoint(960, 900)?.outerHTML?.slice(0,200),
    elAt400_400: document.elementFromPoint(400, 400)?.outerHTML?.slice(0,200),
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio,
    iframeVisible: window.frameElement ? 'in iframe' : 'top frame',
  };
});
console.log(JSON.stringify(probe, null, 2));
console.log('---');
await page.screenshot({ path: 'C:/Users/ahmed/AppData/Local/Temp/scene-snapshots/DEBUG-clip.png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
await page.screenshot({ path: 'C:/Users/ahmed/AppData/Local/Temp/scene-snapshots/DEBUG-fullpage.png', fullPage: true });
await browser.close();
