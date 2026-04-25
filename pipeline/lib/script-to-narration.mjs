// Strip a script.md down to plain narration text (for TTS), and split it into
// per-section text (for derived timing). Pure functions — no file I/O.

const SECTION_KEYS = {
  INTRO: 'intro',
  'STORY 1': 'story-1',
  'STORY 2': 'story-2',
  'STORY 3': 'story-3',
  OUTRO: 'outro',
};

export function scriptToNarration(src) {
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
      out.push('');
      continue;
    }
    const cleaned = line
      .replace(/\[\^\d+\]/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .trim();
    out.push(cleaned);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function extractSections(src) {
  const sections = {};
  let current = null;
  let buf = [];
  const flush = () => {
    if (current) {
      sections[current] = buf.join('\n').replace(/\[\^\d+\]/g, '').replace(/\*\*|\*/g, '').trim();
    }
    buf = [];
  };
  for (const line of src.split('\n')) {
    if (line.startsWith('## ')) {
      flush();
      const header = line.slice(3).trim();
      if (header === 'SOURCES') { current = null; continue; }
      const matchedKey = Object.keys(SECTION_KEYS).find(k => header.startsWith(k));
      current = matchedKey ? SECTION_KEYS[matchedKey] : null;
    } else if (current && line.trim() && !line.startsWith('---')) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}
