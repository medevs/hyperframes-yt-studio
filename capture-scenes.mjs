// Capture per-scene snapshots by PLAYING the timeline at high speed and
// pausing at each requested timestamp. Workaround for GSAP paused-seek
// not initializing fromTo() state on a never-played timeline.
import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run-id resolution: argv[2] > $RUN_ID > most-recent work/<dir>/ by mtime.
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
if (!RUN_ID) { console.error('capture-scenes: no RUN_ID resolved — pass argv[2] or set $RUN_ID'); process.exit(2); }
const PREVIEW = `${process.env.STUDIO_URL?.replace(/\/$/, '') || 'http://localhost:3002'}/api/projects/${RUN_ID}/preview`;
const OUT = join(tmpdir(), 'scene-snapshots');
mkdirSync(OUT, { recursive: true });

console.log(`[capture-scenes] run-id=${RUN_ID}  preview=${PREVIEW}  out=${OUT}`);
console.log(`[capture-scenes] writes 17 per-scene PNGs by playing tl at 20x then scrubbing`);


const SHOTS = [
  { label: 'intro-hero',         t: 1.0  },
  { label: 'intro-teaser2',      t: 8.0  },
  { label: 'story1-cold-open',   t: 15.5 },
  { label: 'story1-stat-1.6T',   t: 22.0 },
  { label: 'story1-stat-0.145',  t: 37.0 },
  { label: 'story1-ken-burns',   t: 51.0 },
  { label: 'story1-takeaway',    t: 60.0 },
  { label: 'story2-cold-open',   t: 72.5 },
  { label: 'story2-quote',       t: 87.0 },
  { label: 'story2-caption',     t: 99.0 },
  { label: 'story2-takeaway',    t: 117.0 },
  { label: 'story3-cold-open',   t: 126.5 },
  { label: 'story3-quote',       t: 141.0 },
  { label: 'story3-stat-bar',    t: 153.0 },
  { label: 'story3-takeaway',    t: 171.0 },
  { label: 'outro-hero',         t: 178.0 },
  { label: 'outro-cta',          t: 183.5 },
];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

console.log(`[1] goto ${PREVIEW}`);
await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 });

await new Promise((r) => setTimeout(r, 3000));

// Mute the audio element so it doesn't try to play
await page.evaluate(() => {
  const a = document.querySelector('audio'); if (a) a.muted = true;
});

const tlInfo = await page.evaluate(() => {
  const tls = window.__timelines || {};
  const k = Object.keys(tls)[0];
  if (!k) return { error: 'no __timelines' };
  return { key: k, duration: tls[k].duration?.() };
});
console.log('[2] timeline:', JSON.stringify(tlInfo));

// Play the timeline normally (this records all from/fromTo initial states),
// then for each SHOT, seek + force render. With timeline already played at
// least once, paused-seek picks up correct state.
await page.evaluate(() => {
  const tl = window.__timelines[Object.keys(window.__timelines)[0]];
  tl.timeScale(20);  // 20x speed
  tl.play(0);
});

// Wait for full play-through at 20x: 186/20 ≈ 9.3s, plus settle
await new Promise((r) => setTimeout(r, 11000));

await page.evaluate(() => {
  const tl = window.__timelines[Object.keys(window.__timelines)[0]];
  tl.pause();
  tl.timeScale(1);
});

console.log('[3] timeline played through; now scrubbing');

for (const { label, t } of SHOTS) {
  await page.evaluate((seekT) => {
    const tl = window.__timelines[Object.keys(window.__timelines)[0]];
    tl.pause();
    tl.seek(seekT, false);
  }, t);
  await new Promise((r) => setTimeout(r, 250));
  const file = join(OUT, `${String(t).padStart(6, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  shot t=${t}s → ${file}`);
}

await browser.close();
console.log(`\n${SHOTS.length} snapshots written to ${OUT}`);
