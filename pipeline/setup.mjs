import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from './lib/sources.js';

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

check('Node >=22', () => {
  const [maj] = process.versions.node.split('.').map(Number);
  return maj >= 22 ? { ok: true } : { ok: false, msg: `got ${process.versions.node}` };
});

check('hyperframes doctor', () => {
  const r = spawnSync('npx', ['hyperframes', 'doctor'], { encoding: 'utf8', shell: true });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'run: npx hyperframes doctor manually to see details' };
});

check('ffmpeg on PATH', () => {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: false });
  return r.status === 0 ? { ok: true } : { ok: false, msg: 'ffmpeg not on PATH' };
});

check('Puppeteer installed', () => {
  return existsSync('node_modules/puppeteer') ? { ok: true } : { ok: false, msg: 'run: npm install' };
});

check('hyperframes installed', () => {
  return existsSync('node_modules/hyperframes') ? { ok: true } : { ok: false, msg: 'run: npm install' };
});

check('DESIGN.md exists', () => {
  return existsSync('DESIGN.md') ? { ok: true } : { ok: false, msg: 'create DESIGN.md per Task 0.4' };
});

check('config.json valid', () => {
  try { loadConfig(); return { ok: true }; } catch (e) { return { ok: false, msg: e.message }; }
});

let allOk = true;
for (const c of checks) {
  const r = c.fn();
  console.log(`[${r.ok ? 'OK' : 'FAIL'}] ${c.name}${r.msg ? ` — ${r.msg}` : ''}`);
  if (!r.ok) allOk = false;
}
process.exit(allOk ? 0 : 1);
