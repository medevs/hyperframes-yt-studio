import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { withWhisperOnPath } from './lib/whisper-path.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node transcribe.mjs <work-dir>'); process.exit(2); }

const wav = join(workDir, 'narration.wav');
if (!existsSync(wav)) { console.error('narration.wav missing — run tts.mjs first'); process.exit(1); }

const r = spawnSync('npx', [
  'hyperframes', 'transcribe', wav,
  '--dir', workDir,
], { encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'], env: withWhisperOnPath() });

if (r.status !== 0) { console.error('hyperframes transcribe failed'); process.exit(1); }
if (!existsSync(join(workDir, 'transcript.json'))) { console.error('transcript.json missing'); process.exit(1); }
console.log('OK transcript.json');
