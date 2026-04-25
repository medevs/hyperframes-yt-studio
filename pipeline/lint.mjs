import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScreenshot, isAcceptable } from './lib/screenshot-quality.mjs';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node lint.mjs <work-dir>'); process.exit(2); }

const lint = spawnSync('npx', ['hyperframes', 'lint'], {
  cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'],
});
if (lint.status !== 0) { console.error('hyperframes lint failed'); process.exit(1); }

const validate = spawnSync('npx', ['hyperframes', 'validate'], {
  cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'],
});
if (validate.status !== 0) { console.error('hyperframes validate failed'); process.exit(1); }

// Screenshot quality post-check
const manifestPath = join(workDir, 'screenshots-manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let bad = 0;
  for (const e of manifest.entries) {
    if (!e.path) continue;
    const buf = readFileSync(join(workDir, e.path));
    const a = await analyzeScreenshot(buf);
    if (!isAcceptable(a) && e.source_kind !== 'headline_card') {
      console.error(`screenshot_quality: ${e.item_id} (${e.source_kind}) flags=${a.flags.join(',')}`);
      bad++;
    }
  }
  if (bad > 0) {
    console.error(`${bad} screenshot(s) failed quality check — fix capture-screenshots or add per-domain override`);
    process.exit(1);
  }
}

console.log('OK lint + validate + screenshot_quality clean');
