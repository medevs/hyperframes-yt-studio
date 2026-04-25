import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scriptToNarration, extractSections } from './lib/script-to-narration.mjs';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node build-narration-text.mjs <work-dir>'); process.exit(2); }

const md = readFileSync(join(workDir, 'script.md'), 'utf8');
const narration = scriptToNarration(md);
const sections = extractSections(md);

writeFileSync(join(workDir, 'narration.txt'), narration);
writeFileSync(join(workDir, 'sections.json'), JSON.stringify(sections, null, 2));
console.log(`OK narration.txt (${narration.length} chars), ${Object.keys(sections).length} sections`);
