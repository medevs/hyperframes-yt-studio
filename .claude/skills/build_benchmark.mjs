import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function readJSON(p) { return JSON.parse(readFileSync(p, 'utf8')); }
function exists(p) { return existsSync(p); }

function gatherRun(runDir) {
  const grading = exists(join(runDir, 'grading.json')) ? readJSON(join(runDir, 'grading.json')) : { expectations: [] };
  const timing = exists(join(runDir, 'timing.json')) ? readJSON(join(runDir, 'timing.json')) : {};
  const passed = grading.expectations.filter(e => e.passed).length;
  const total = grading.expectations.length;
  return {
    pass_rate: total ? passed / total : 0,
    passed, total,
    duration_seconds: timing.total_duration_seconds || 0,
    total_tokens: timing.total_tokens || 0,
    expectations: grading.expectations,
  };
}

function buildBench(skillName, iterationDir, evals) {
  const configs = { with_skill: { evals: [] }, without_skill: { evals: [] } };
  for (const ev of evals) {
    for (const cond of ['with_skill', 'without_skill']) {
      const runDir = join(iterationDir, ev.dir, cond);
      const g = gatherRun(runDir);
      configs[cond].evals.push({
        eval_id: ev.id, eval_name: ev.name,
        ...g,
      });
    }
  }
  for (const cond of Object.keys(configs)) {
    const evs = configs[cond].evals;
    const pr = evs.map(e => e.pass_rate);
    const dur = evs.map(e => e.duration_seconds);
    const tok = evs.map(e => e.total_tokens);
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    configs[cond].aggregate = {
      pass_rate: mean(pr),
      duration_seconds: mean(dur),
      total_tokens: mean(tok),
    };
  }
  return { skill_name: skillName, configurations: configs };
}

const researchEvals = [
  { id: 0, name: 'normal-run-of-8-items', dir: 'eval-0-normal-run-of-8-items' },
  { id: 1, name: 'insufficient-usable-items', dir: 'eval-1-insufficient-usable-items' },
];
const metadataEvals = [
  { id: 0, name: 'normal-run-writes-metadata', dir: 'eval-0-normal-run-writes-metadata' },
  { id: 1, name: 'casual-prompt-no-file-hints', dir: 'eval-1-casual-prompt-no-file-hints' },
];

const WS_R = join(ROOT, '.claude/skills/yt-research-workspace/iteration-1');
const WS_M = join(ROOT, '.claude/skills/yt-metadata-workspace/iteration-1');

const benchR = buildBench('yt-research', WS_R, researchEvals);
const benchM = buildBench('yt-metadata', WS_M, metadataEvals);

writeFileSync(join(WS_R, 'benchmark.json'), JSON.stringify(benchR, null, 2));
writeFileSync(join(WS_M, 'benchmark.json'), JSON.stringify(benchM, null, 2));

// Also capture the actual output files so the viewer can read them
function captureOutputs(iterationDir, evals) {
  const out = {};
  for (const ev of evals) {
    for (const cond of ['with_skill', 'without_skill']) {
      const outDir = join(iterationDir, ev.dir, cond, 'outputs');
      // Look for known filenames
      const candidates = ['picks.json', 'metadata.txt'];
      for (const name of candidates) {
        const fp = join(outDir, name);
        if (existsSync(fp)) {
          out[`${ev.dir}/${cond}/${name}`] = readFileSync(fp, 'utf8');
        }
      }
    }
  }
  return out;
}

const outputsR = captureOutputs(WS_R, researchEvals);
const outputsM = captureOutputs(WS_M, metadataEvals);

const combined = {
  generated_at: new Date().toISOString(),
  skills: [benchR, benchM],
  outputs: { 'yt-research': outputsR, 'yt-metadata': outputsM },
};
writeFileSync(join(__dirname, 'combined_benchmark.json'), JSON.stringify(combined, null, 2));

// ---------- HTML viewer ----------

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function pct(x) { return (x * 100).toFixed(0) + '%'; }
function dot(passed) { return passed ? '<span class="pass">✓</span>' : '<span class="fail">✗</span>'; }

function benchTable(b) {
  const ws = b.configurations.with_skill.aggregate;
  const bs = b.configurations.without_skill.aggregate;
  return `
  <table class="agg">
    <thead><tr><th></th><th>with skill</th><th>baseline</th><th>Δ</th></tr></thead>
    <tbody>
      <tr><td>pass rate</td><td>${pct(ws.pass_rate)}</td><td>${pct(bs.pass_rate)}</td><td class="${ws.pass_rate >= bs.pass_rate ? 'pass' : 'fail'}">${((ws.pass_rate - bs.pass_rate) * 100).toFixed(0)}pp</td></tr>
      <tr><td>duration (s)</td><td>${ws.duration_seconds.toFixed(1)}</td><td>${bs.duration_seconds.toFixed(1)}</td><td>${(ws.duration_seconds - bs.duration_seconds).toFixed(1)}</td></tr>
      <tr><td>tokens</td><td>${ws.total_tokens.toFixed(0)}</td><td>${bs.total_tokens.toFixed(0)}</td><td>${(ws.total_tokens - bs.total_tokens).toFixed(0)}</td></tr>
    </tbody>
  </table>`;
}

function renderExpectations(exps) {
  return `<ul class="exps">${exps.map(e =>
    `<li>${dot(e.passed)} <code>${esc(e.text)}</code>${e.evidence ? `<div class="ev">${esc(e.evidence)}</div>` : ''}</li>`
  ).join('')}</ul>`;
}

function renderEval(b, evalEntry, outputs, dirName) {
  const w = b.configurations.with_skill.evals.find(e => e.eval_id === evalEntry.id);
  const o = b.configurations.without_skill.evals.find(e => e.eval_id === evalEntry.id);
  const wOut = outputs[`${dirName}/with_skill/picks.json`] || outputs[`${dirName}/with_skill/metadata.txt`] || '(no output file)';
  const oOut = outputs[`${dirName}/without_skill/picks.json`] || outputs[`${dirName}/without_skill/metadata.txt`] || '(no output file)';
  return `
  <section class="eval">
    <h3>eval-${evalEntry.id}: ${esc(evalEntry.name)}</h3>
    <div class="cols">
      <div class="col">
        <h4>with skill — ${w.passed}/${w.total} <span class="meta">${w.duration_seconds.toFixed(1)}s · ${w.total_tokens} tok</span></h4>
        ${renderExpectations(w.expectations)}
        <details><summary>output</summary><pre>${esc(wOut)}</pre></details>
      </div>
      <div class="col">
        <h4>baseline — ${o.passed}/${o.total} <span class="meta">${o.duration_seconds.toFixed(1)}s · ${o.total_tokens} tok</span></h4>
        ${renderExpectations(o.expectations)}
        <details><summary>output</summary><pre>${esc(oOut)}</pre></details>
      </div>
    </div>
  </section>`;
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>yt-* skills — eval review</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; max-width: 1400px; margin: 2rem auto; padding: 0 1rem; color: #222; line-height: 1.45; }
  h1 { margin-bottom: 0.2rem; }
  h2 { border-bottom: 2px solid #ddd; padding-bottom: 0.3rem; margin-top: 2.5rem; }
  h3 { background: #f5f5f5; padding: 0.5rem 0.75rem; border-radius: 4px; }
  h4 { margin: 0.5rem 0; }
  .agg { border-collapse: collapse; margin: 0.5rem 0 1rem; }
  .agg th, .agg td { border: 1px solid #ccc; padding: 0.4rem 0.8rem; text-align: left; }
  .agg th { background: #fafafa; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .col { background: #fafafa; padding: 0.8rem; border-radius: 4px; border: 1px solid #e5e5e5; }
  .meta { font-weight: normal; font-size: 0.85em; color: #666; margin-left: 0.5rem; }
  .exps { list-style: none; padding-left: 0; font-size: 0.9em; }
  .exps li { margin-bottom: 0.3rem; padding-left: 1.4rem; text-indent: -1.4rem; }
  .exps code { background: #fff; padding: 1px 4px; border-radius: 2px; font-size: 0.85em; }
  .ev { margin-left: 1.4rem; margin-top: 0.1rem; font-size: 0.8em; color: #666; }
  .pass { color: #0a7f00; font-weight: bold; }
  .fail { color: #c00; font-weight: bold; }
  pre { background: #fff; border: 1px solid #ccc; padding: 0.5rem; overflow: auto; max-height: 400px; font-size: 0.75em; }
  details { margin-top: 0.5rem; }
  summary { cursor: pointer; color: #06c; }
  .summary-box { background: #eef6ff; border-left: 4px solid #06c; padding: 0.8rem 1rem; border-radius: 4px; margin: 1rem 0; }
</style>
</head><body>
<h1>yt-* skills — iteration-1 eval review</h1>
<p class="meta">Generated ${esc(new Date().toISOString())}</p>

<div class="summary-box">
  <strong>Overall:</strong>
  yt-research with-skill ${benchR.configurations.with_skill.evals.reduce((a, e) => a + e.passed, 0)}/${benchR.configurations.with_skill.evals.reduce((a, e) => a + e.total, 0)},
  baseline ${benchR.configurations.without_skill.evals.reduce((a, e) => a + e.passed, 0)}/${benchR.configurations.without_skill.evals.reduce((a, e) => a + e.total, 0)}
  &nbsp;|&nbsp;
  yt-metadata with-skill ${benchM.configurations.with_skill.evals.reduce((a, e) => a + e.passed, 0)}/${benchM.configurations.with_skill.evals.reduce((a, e) => a + e.total, 0)},
  baseline ${benchM.configurations.without_skill.evals.reduce((a, e) => a + e.passed, 0)}/${benchM.configurations.without_skill.evals.reduce((a, e) => a + e.total, 0)}
</div>

<h2>yt-research</h2>
${benchTable(benchR)}
${researchEvals.map(ev => renderEval(benchR, ev, outputsR, ev.dir)).join('')}

<h2>yt-metadata</h2>
${benchTable(benchM)}
${metadataEvals.map(ev => renderEval(benchM, ev, outputsM, ev.dir)).join('')}

<h2>How to read this</h2>
<ul>
  <li><strong>with skill</strong> — subagent was told to read the SKILL.md and follow it.</li>
  <li><strong>baseline</strong> — subagent got only the user task, no skill.</li>
  <li>Assertions marked with ✓/✗ are graded mechanically against the output files.</li>
  <li>Click <em>output</em> to see the raw picks.json or metadata.txt each run produced.</li>
</ul>
</body></html>`;

writeFileSync(join(__dirname, 'review.html'), html, 'utf8');
console.log(`wrote ${join(__dirname, 'review.html')}`);
console.log(`wrote ${join(WS_R, 'benchmark.json')}`);
console.log(`wrote ${join(WS_M, 'benchmark.json')}`);
