import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node transcribe.mjs <work-dir>'); process.exit(2); }

const wav = join(workDir, 'narration.wav');
if (!existsSync(wav)) { console.error('narration.wav missing — run tts.mjs first'); process.exit(1); }

// hyperframes transcribe writes JSON next to the audio by default; be explicit.
const r = spawnSync('npx', [
  'hyperframes', 'transcribe', wav,
  '--output', join(workDir, 'transcript.json'),
], { encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });

if (r.status !== 0) { console.error('hyperframes transcribe failed'); process.exit(1); }
if (!existsSync(join(workDir, 'transcript.json'))) { console.error('transcript.json missing'); process.exit(1); }
console.log('OK transcript.json');
