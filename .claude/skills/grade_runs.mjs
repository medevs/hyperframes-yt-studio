import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..'); // C:/Users/ahmed.oublihi/Projects/studio
const FIXTURE_01 = join(ROOT, '.claude/skills/yt-research/evals/fixtures/run-fixture-01');
const FIXTURE_02 = join(ROOT, '.claude/skills/yt-research/evals/fixtures/run-fixture-02');
const VALIDATOR = join(ROOT, 'pipeline/validate-json.mjs');

const EMOJI_RE = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function readJSON(p) { return JSON.parse(readFileSync(p, 'utf8')); }

function runValidator(schema, file) {
  try {
    const out = execFileSync('node', [VALIDATOR, schema, file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (err) {
    const combined = ((err.stdout || '') + (err.stderr || '')).trim();
    return { ok: false, out: combined };
  }
}

function loadScriptURLs() {
  const text = readFileSync(join(FIXTURE_01, 'script.md'), 'utf8');
  const urls = new Set();
  let inSources = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '## SOURCES') { inSources = true; continue; }
    if (inSources) {
      const m = line.match(/(https?:\/\/\S+)/);
      if (m) urls.add(m[1].replace(/[)\s.]+$/, ''));
    }
  }
  return urls;
}

// ---------- yt-research graders ----------

const STRONG_LEAD_IDS = new Set(['hn-40010002', 'hn-40010003', 'company-google-deepmind-blog-41']);

function gradeResearchEval0(outputDir) {
  const exps = [];
  const picksPath = join(outputDir, 'picks.json');
  const items = readJSON(join(FIXTURE_01, 'items.json'));
  const itemIds = new Set(items.items.map(x => x.id));
  const failedIds = new Set(items.items.filter(x => x.text_extraction_failed).map(x => x.id));

  const exists = existsSync(picksPath);
  exps.push({ text: 'picks.json exists at the output path', passed: exists, evidence: exists ? 'present' : 'missing' });
  if (!exists) {
    for (let i = 0; i < 5; i++) exps.push({ text: '(skipped — picks.json missing)', passed: false, evidence: '' });
    return exps;
  }

  const v = runValidator('picks', picksPath);
  exps.push({ text: 'picks.json passes PicksFileSchema validation', passed: v.ok, evidence: v.out });

  const data = readJSON(picksPath);
  const picks = data.picks || [];
  const ranks = picks.map(p => p.rank).sort((a, b) => a - b);
  const cond3 = picks.length === 3 && JSON.stringify(ranks) === '[1,2,3]';
  exps.push({ text: 'picks.json contains exactly 3 picks with ranks 1, 2, 3', passed: cond3, evidence: `picks=${picks.length}, ranks=${JSON.stringify(ranks)}` });

  const bad = picks.filter(p => failedIds.has(p.item_id)).map(p => p.item_id);
  exps.push({ text: 'No pick references an item flagged text_extraction_failed=true in items.json', passed: bad.length === 0, evidence: `violating=${JSON.stringify(bad)}` });

  const unknown = picks.filter(p => !itemIds.has(p.item_id)).map(p => p.item_id);
  exps.push({ text: 'Every pick.item_id exists in items.json', passed: unknown.length === 0, evidence: `unknown=${JSON.stringify(unknown)}` });

  const lead = picks.find(p => p.rank === 1);
  const leadId = lead ? lead.item_id : null;
  exps.push({ text: 'Lead pick (rank 1) is one of the three strongest builder stories', passed: STRONG_LEAD_IDS.has(leadId), evidence: `rank1=${leadId}` });
  return exps;
}

function gradeResearchEval1(outputDir) {
  const exps = [];
  const picksPath = join(outputDir, 'picks.json');
  const items = readJSON(join(FIXTURE_02, 'items.json'));
  const itemIds = new Set(items.items.map(x => x.id));
  const failedIds = new Set(items.items.filter(x => x.text_extraction_failed).map(x => x.id));
  const written = existsSync(picksPath);

  exps.push({ text: 'Correct stop-and-report behavior: no picks.json written', passed: !written, evidence: written ? `file written at ${picksPath}` : 'no file (correct)' });

  if (!written) {
    exps.push({ text: '(n/a — no file)', passed: true, evidence: '' });
    exps.push({ text: '(n/a — no file)', passed: true, evidence: '' });
    return exps;
  }

  const data = readJSON(picksPath);
  const picks = data.picks || [];
  const bad = picks.filter(p => failedIds.has(p.item_id)).map(p => p.item_id);
  exps.push({ text: 'If picks.json was written, it does NOT contain an item flagged text_extraction_failed=true', passed: bad.length === 0, evidence: `violating=${JSON.stringify(bad)}` });

  const unknown = picks.filter(p => !itemIds.has(p.item_id)).map(p => p.item_id);
  exps.push({ text: 'If picks.json was written, all item_ids exist in items.json', passed: unknown.length === 0, evidence: `unknown=${JSON.stringify(unknown)}` });
  return exps;
}

// ---------- yt-metadata grader ----------

function extractTitle(text) {
  const m = text.match(/^\s*TITLE\s*:\s*(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}
function extractTags(text) {
  const m = text.match(/^\s*TAGS\s*:\s*(.+?)$/im);
  if (!m) return null;
  return m[1].split(',').map(t => t.trim()).filter(Boolean);
}
function extractChapters(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*chapters\s*:/i.test(lines[i])) {
      const out = [];
      for (let j = i + 1; j < lines.length; j++) {
        const s = lines[j].trim();
        if (!s) break;
        if (/^(sources|tags|title|description|links)\s*:/i.test(s)) break;
        out.push(s);
      }
      return out;
    }
  }
  return [];
}
function extractSourceURLs(text) {
  const lines = text.split(/\r?\n/);
  const urls = [];
  let inSources = false;
  for (const line of lines) {
    const ls = line.trim().toLowerCase();
    if (ls.startsWith('sources:') || ls === 'sources') { inSources = true; continue; }
    if (!inSources) continue;
    if (!line.trim()) { if (urls.length) break; continue; }
    if (/^(tags|title|description)\s*:/i.test(ls)) break;
    const m = line.match(/(https?:\/\/\S+)/);
    if (m) urls.push(m[1].replace(/[)\s.]+$/, ''));
  }
  return urls;
}

function gradeMetadata(outputDir) {
  const exps = [];
  const p = join(outputDir, 'metadata.txt');
  const timings = readJSON(join(FIXTURE_01, 'timings.json'));
  const scriptURLs = loadScriptURLs();

  const exists = existsSync(p);
  exps.push({ text: 'metadata.txt exists at the output path', passed: exists, evidence: exists ? 'present' : 'missing' });
  if (!exists) {
    for (let i = 0; i < 10; i++) exps.push({ text: '(skipped — metadata.txt missing)', passed: false, evidence: '' });
    return exps;
  }

  const text = readFileSync(p, 'utf8');
  const title = extractTitle(text);
  const tags = extractTags(text);
  const chapters = extractChapters(text);
  const sources = extractSourceURLs(text);

  exps.push({ text: 'Contains a TITLE: line', passed: title !== null, evidence: title !== null ? `title=${JSON.stringify(title)}` : 'not matched' });
  exps.push({ text: 'TITLE value is ≤60 characters', passed: title !== null && title.length <= 60, evidence: `len=${title ? title.length : 0}` });

  const hasDesc = /^\s*DESCRIPTION\s*:/im.test(text);
  exps.push({ text: 'Contains a DESCRIPTION: header', passed: hasDesc, evidence: hasDesc ? 'present' : 'missing' });

  exps.push({ text: 'Contains a Chapters: block', passed: chapters.length > 0, evidence: `${chapters.length} chapter lines` });
  exps.push({ text: "First chapter line is exactly '00:00 Intro'", passed: chapters[0] === '00:00 Intro', evidence: `first=${JSON.stringify(chapters[0] || null)}` });
  exps.push({ text: 'Has 5 chapter lines total (intro + 3 stories + outro)', passed: chapters.length === 5, evidence: `count=${chapters.length}` });

  const expectedMMSS = timings.scenes.map(s => {
    const secs = Math.floor(s.start_sec);
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  });
  const actualMMSS = chapters.map(ln => ln.split(/\s+/)[0]);
  const tsMatch = JSON.stringify(expectedMMSS) === JSON.stringify(actualMMSS);
  exps.push({ text: 'Chapter MM:SS timestamps match timings.json scene start_sec (floored)', passed: tsMatch, evidence: `expected=${JSON.stringify(expectedMMSS)} got=${JSON.stringify(actualMMSS)}` });

  const sourceSet = new Set(sources);
  const sourcesOK = sources.length === 3 && sourceSet.size === scriptURLs.size && [...scriptURLs].every(u => sourceSet.has(u));
  exps.push({ text: 'Contains a Sources: block with 3 URLs matching script.md SOURCES', passed: sourcesOK, evidence: `got=${JSON.stringify([...sourceSet].sort())} expected=${JSON.stringify([...scriptURLs].sort())}` });

  const tagOK = tags !== null && tags.length >= 8 && tags.length <= 12;
  exps.push({ text: 'Contains a TAGS: line with 8-12 comma-separated tags', passed: tagOK, evidence: `count=${tags ? tags.length : 0}` });

  exps.push({ text: 'No emoji in output', passed: !EMOJI_RE.test(text), evidence: EMOJI_RE.test(text) ? 'emoji detected' : 'clean' });
  return exps;
}

// ---------- Driver ----------

const WS_R = join(ROOT, '.claude/skills/yt-research-workspace/iteration-1');
const WS_M = join(ROOT, '.claude/skills/yt-metadata-workspace/iteration-1');

const runs = [
  [join(WS_R, 'eval-0-normal-run-of-8-items/with_skill'), gradeResearchEval0],
  [join(WS_R, 'eval-0-normal-run-of-8-items/without_skill'), gradeResearchEval0],
  [join(WS_R, 'eval-1-insufficient-usable-items/with_skill'), gradeResearchEval1],
  [join(WS_R, 'eval-1-insufficient-usable-items/without_skill'), gradeResearchEval1],
  [join(WS_M, 'eval-0-normal-run-writes-metadata/with_skill'), gradeMetadata],
  [join(WS_M, 'eval-0-normal-run-writes-metadata/without_skill'), gradeMetadata],
  [join(WS_M, 'eval-1-casual-prompt-no-file-hints/with_skill'), gradeMetadata],
  [join(WS_M, 'eval-1-casual-prompt-no-file-hints/without_skill'), gradeMetadata],
];

for (const [runDir, grader] of runs) {
  const outputs = join(runDir, 'outputs');
  if (!existsSync(outputs)) mkdirSync(outputs, { recursive: true });
  const expectations = grader(outputs);
  writeFileSync(join(runDir, 'grading.json'), JSON.stringify({ expectations }, null, 2), 'utf8');
  const passed = expectations.filter(e => e.passed).length;
  console.log(`${relative(ROOT, runDir)}: ${passed}/${expectations.length} passed`);
}
