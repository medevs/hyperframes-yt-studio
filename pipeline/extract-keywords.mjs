import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TimingsFileSchema } from './schemas/timings.js';
import { selectEmphases } from './lib/extract-keywords.mjs';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node extract-keywords.mjs <work-dir>'); process.exit(2); }

const timingsPath = join(workDir, 'timings.json');
const transcriptPath = join(workDir, 'transcript.json');

const timings = JSON.parse(readFileSync(timingsPath, 'utf8'));
const transcript = JSON.parse(readFileSync(transcriptPath, 'utf8'));

const words = (transcript.words ?? transcript.segments?.flatMap(s => s.words) ?? transcript)
  .map(w => ({
    text: w.text ?? w.word ?? '',
    start: w.start ?? w.start_time ?? 0,
    end: w.end ?? w.end_time ?? 0,
  }))
  .filter(w => w.text);

const emphases = selectEmphases(timings.scenes, words);

const out = { ...timings, emphases };
TimingsFileSchema.parse(out);
writeFileSync(timingsPath, JSON.stringify(out, null, 2));

const byScene = emphases.reduce((m, e) => (m[e.scene_id] = (m[e.scene_id] || 0) + 1, m), {});
console.log('OK emphases:', JSON.stringify(byScene));
