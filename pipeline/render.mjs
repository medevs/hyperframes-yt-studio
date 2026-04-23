import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/sources.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node render.mjs <work-dir>'); process.exit(2); }
const config = loadConfig();

// Render video
const render = spawnSync('npx', [
  'hyperframes', 'render',
  '--quality', config.video.render_quality,
  '--fps', String(config.video.fps),
  '--output', 'renders/video.mp4',
], { cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
if (render.status !== 0) { console.error('hyperframes render failed'); process.exit(1); }

const videoPath = join(workDir, 'renders', 'video.mp4');
if (!existsSync(videoPath) || statSync(videoPath).size < 100_000) {
  console.error('video.mp4 missing or too small'); process.exit(1);
}

// Snapshot thumbnail: render the first frame of the intro scene at a known timestamp.
// hyperframes snapshot CLI usage may vary; default assumption: snapshot at t=0.8s into the intro.
const snap = spawnSync('npx', [
  'hyperframes', 'snapshot',
  '--time', '0.8',
  '--output', 'snapshots/thumbnail.png',
], { cwd: workDir, encoding: 'utf8', shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
if (snap.status !== 0) { console.error('hyperframes snapshot failed — falling back to ffmpeg frame extraction'); }

// If snapshot didn't produce a file, extract a frame from the MP4 via ffmpeg as fallback.
const thumbPath = join(workDir, 'snapshots', 'thumbnail.png');
if (!existsSync(thumbPath)) {
  const ff = spawnSync('ffmpeg', ['-y', '-ss', '0.8', '-i', videoPath, '-vframes', '1', thumbPath], {
    encoding: 'utf8', shell: false, stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (ff.status !== 0 || !existsSync(thumbPath)) { console.error('thumbnail fallback failed'); process.exit(1); }
}

console.log(`OK video=${statSync(videoPath).size} bytes, thumbnail=${statSync(thumbPath).size} bytes`);
