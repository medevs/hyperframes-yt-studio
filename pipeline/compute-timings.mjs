import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { alignSectionsToWords } from './compute-timings.js';
import { TimingsFileSchema } from './schemas/timings.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node compute-timings.mjs <work-dir>'); process.exit(2); }

const sections = JSON.parse(readFileSync(join(workDir, 'sections.json'), 'utf8'));
const transcript = JSON.parse(readFileSync(join(workDir, 'transcript.json'), 'utf8'));

// Hyperframes transcript may use {text, start, end} or {word, start_time, end_time} — normalize:
const words = (transcript.words ?? transcript.segments?.flatMap(s => s.words) ?? transcript)
  .map(w => ({
    text: w.text ?? w.word ?? '',
    start: w.start ?? w.start_time ?? 0,
    end: w.end ?? w.end_time ?? 0,
  }))
  .filter(w => w.text);

const aligned = alignSectionsToWords(sections, words);

const out = {
  audio_file: 'narration.wav',
  total_duration_sec: aligned.total_duration_sec,
  scenes: aligned.scenes,
  words: aligned.words,
};
TimingsFileSchema.parse(out);
writeFileSync(join(workDir, 'timings.json'), JSON.stringify(out, null, 2));
console.log(`OK timings.json — ${out.scenes.length} scenes, ${out.total_duration_sec.toFixed(1)}s`);
