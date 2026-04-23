import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node tts.mjs <work-dir>'); process.exit(2); }
const config = loadConfig();

const narrationTxt = join(workDir, 'narration.txt');
const narrationWav = join(workDir, 'narration.wav');
if (!existsSync(narrationTxt)) { console.error('narration.txt missing — run build-narration-text.mjs first'); process.exit(1); }

const r = spawnSync('npx', [
  'hyperframes', 'tts', narrationTxt,
  '--voice', config.tts.voice,
  '--output', narrationWav,
], { encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });

if (r.status !== 0) { console.error('hyperframes tts failed'); process.exit(1); }
if (!existsSync(narrationWav) || statSync(narrationWav).size < 10_000) {
  console.error('narration.wav missing or suspiciously small'); process.exit(1);
}
console.log(`OK ${narrationWav} (${statSync(narrationWav).size} bytes)`);
