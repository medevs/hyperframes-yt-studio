import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node transcribe.mjs <work-dir>'); process.exit(2); }

const wav = join(workDir, 'narration.wav');
if (!existsSync(wav)) { console.error('narration.wav missing — run tts.mjs first'); process.exit(1); }

// hyperframes transcribe writes JSON next to the audio by default; be explicit.
// Defensively prepend the whisper-cli install location so it's found on Windows
// even in fresh shell sessions that haven't yet picked up the updated user PATH.
const whisperBinDir = 'C:\\tools\\whisper';
const childEnv = { ...process.env };
const pathSep = process.platform === 'win32' ? ';' : ':';
if (!childEnv.PATH?.includes(whisperBinDir)) {
  childEnv.PATH = `${whisperBinDir}${pathSep}${childEnv.PATH ?? ''}`;
}

const r = spawnSync('npx', [
  'hyperframes', 'transcribe', wav,
  '--output', join(workDir, 'transcript.json'),
], { encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'], env: childEnv });

if (r.status !== 0) { console.error('hyperframes transcribe failed'); process.exit(1); }
if (!existsSync(join(workDir, 'transcript.json'))) { console.error('transcript.json missing'); process.exit(1); }
console.log('OK transcript.json');
