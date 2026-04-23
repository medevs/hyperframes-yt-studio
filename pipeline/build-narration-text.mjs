import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node build-narration-text.mjs <work-dir>'); process.exit(2); }

const md = readFileSync(join(workDir, 'script.md'), 'utf8');

// Strip frontmatter, footnotes, SOURCES section, markdown headers.
function scriptToNarration(src) {
  const lines = src.split('\n');
  let inFrontmatter = false, frontmatterClosed = false;
  let inSources = false;
  const out = [];
  for (const line of lines) {
    if (!frontmatterClosed) {
      if (line.trim() === '---') {
        if (!inFrontmatter) inFrontmatter = true;
        else { inFrontmatter = false; frontmatterClosed = true; }
        continue;
      }
      if (inFrontmatter) continue;
    }
    if (line.startsWith('## SOURCES')) { inSources = true; continue; }
    if (inSources) continue;
    if (line.startsWith('## ')) {
      // Section header: insert a small pause marker (two newlines keep Kokoro's prosody natural)
      out.push(''); continue;
    }
    // Strip footnotes and markdown emphasis
    const cleaned = line
      .replace(/\[\^\d+\]/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .trim();
    out.push(cleaned);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const narration = scriptToNarration(md);
writeFileSync(join(workDir, 'narration.txt'), narration);

// Also emit per-section text for section-timing derivation later.
const sections = {};
let current = null, buf = [];
const flush = () => { if (current) sections[current] = buf.join('\n').replace(/\[\^\d+\]/g, '').replace(/\*\*|\*/g, '').trim(); buf = []; };
for (const line of md.split('\n')) {
  if (line.startsWith('## ')) {
    flush();
    const header = line.slice(3).trim();
    if (header === 'SOURCES') { current = null; continue; }
    if (header.startsWith('INTRO')) current = 'intro';
    else if (header.startsWith('STORY 1')) current = 'story-1';
    else if (header.startsWith('STORY 2')) current = 'story-2';
    else if (header.startsWith('STORY 3')) current = 'story-3';
    else if (header.startsWith('OUTRO')) current = 'outro';
    else current = null;
  } else if (current && line.trim() && !line.startsWith('---')) {
    buf.push(line);
  }
}
flush();

writeFileSync(join(workDir, 'sections.json'), JSON.stringify(sections, null, 2));
console.log(`OK narration.txt (${narration.length} chars), ${Object.keys(sections).length} sections`);
