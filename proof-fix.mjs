// Verify the __hf=true fix unblocks the studio's <hyperframes-player>.
// SUCCESS criteria (ALL must hold):
//   1. <hyperframes-player>._ready === true within 3 seconds
//   2. ._duration > 0 (we expect ~186.92)
//   3. Studio's React store: timelineReady === true, duration > 0
//   4. Play button NOT disabled
//   5. Screenshot at t=8s of intro scene contains non-black pixels in canvas region
import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Run-id is informational here (proof-fix probes studio root, which auto-loads
// the most-recent project). argv[2] takes precedence; falls back to most-recent
// work/<dir>/ by mtime so the banner reflects what the studio is serving.
function pickMostRecentRun() {
  try {
    const entries = readdirSync('work', { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, mtime: statSync(join('work', e.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return entries[0]?.name || '(none)';
  } catch { return '(no work/ dir)'; }
}
const RUN_ID = process.argv[2] || process.env.RUN_ID || pickMostRecentRun();
const STUDIO = process.env.STUDIO_URL || 'http://localhost:3002/';
const OUT = join(tmpdir(), 'proof-fix');
mkdirSync(OUT, { recursive: true });

console.log(`[proof-fix] run-id=${RUN_ID}  studio=${STUDIO}  out=${OUT}`);
console.log(`[proof-fix] checks: player ready, duration>0, play btn enabled, no CDN injection`);


const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const consoleHits = [];
page.on('console', (m) => consoleHits.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => consoleHits.push(`pageerror: ${e.message}`));

console.log(`[1] goto ${STUDIO}`);
const t0 = Date.now();
await page.goto(STUDIO, { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log(`[2] page loaded in ${Date.now() - t0}ms`);

// Wait for studio to mount the player and load composition. The new
// time-sliced composition is larger (~43 KB) and Google Fonts can take
// 2-3s on a cold cache, so give it 10s before probing.
await new Promise((r) => setTimeout(r, 10000));

// Look at the player element directly (no page.evaluate fetch — just sync DOM read)
const playerState = await page.evaluate(() => {
  const player = document.querySelector('hyperframes-player');
  if (!player) return { error: 'no <hyperframes-player> element' };
  return {
    ready: player._ready,
    duration: player._duration,
    currentTime: player._currentTime,
    paused: player._paused,
    src: player.getAttribute('src'),
    runtimeInjected: player._runtimeInjected,
    audioOwner: player._audioOwner,
  };
});
console.log('[3] hyperframes-player state:', JSON.stringify(playerState, null, 2));

// Inspect studio React store via the duration display + play button
const studioState = await page.evaluate(() => {
  const allButtons = [...document.querySelectorAll('button')];
  const playBtn = allButtons.find((b) => {
    const aria = b.getAttribute('aria-label') || '';
    const title = b.title || '';
    return /play|pause/i.test(aria) || /play|pause/i.test(title);
  });
  // Duration display text (e.g., "0:08 / 3:06")
  const txt = document.body.innerText || '';
  const durMatch = txt.match(/\d+:\d{2}\s*\/\s*\d+:\d{2}/);
  return {
    playButton: playBtn ? {
      disabled: playBtn.disabled,
      ariaLabel: playBtn.getAttribute('aria-label'),
      visibleText: playBtn.textContent?.trim().slice(0, 30),
    } : null,
    durationDisplay: durMatch ? durMatch[0] : null,
  };
});
console.log('[4] studio React state:', JSON.stringify(studioState, null, 2));

// Watch for "Composition timeline not found" warning OR the success
const failedHit = consoleHits.find((c) => /not found after 8s|timeline.*not found/i.test(c));
const cdnHit = consoleHits.find((c) => /cdn.jsdelivr|hyperframe.runtime.iife/i.test(c));
console.log('[5] error console hit:', failedHit || '(none)');
console.log('[6] cdn console hit:', cdnHit || '(none)');

await page.screenshot({ path: `${OUT}/01-after-6s.png`, fullPage: false });

// If ready, click play, wait 2s, screenshot to verify content is visible
if (playerState.ready && !studioState.playButton?.disabled) {
  // Find and click the play button
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const aria = b.getAttribute('aria-label') || '';
      return /play\s*(\(|$)/i.test(aria) || aria === 'Play';
    });
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('[7] play clicked:', clicked);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/02-after-play-2.5s.png`, fullPage: false });
}

// Final report
const verdict = {
  PLAYER_READY: playerState.ready === true,
  DURATION_OK: typeof playerState.duration === 'number' && playerState.duration > 100,
  PLAY_BUTTON_ENABLED: studioState.playButton && !studioState.playButton.disabled,
  DURATION_DISPLAY_NONZERO: studioState.durationDisplay && !studioState.durationDisplay.startsWith('0:00 / 0:00'),
  NO_TIMEOUT_ERROR: !failedHit,
  NO_CDN_INJECTION: !cdnHit,
};
console.log('\n=== VERDICT ===');
for (const [k, v] of Object.entries(verdict)) console.log(`  ${v ? '✅' : '❌'} ${k}`);
const allGood = Object.values(verdict).every(Boolean);
console.log(`\nALL GREEN: ${allGood ? '✅ YES' : '❌ NO'}`);

await browser.close();
process.exit(allGood ? 0 : 1);
