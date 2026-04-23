import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function acquireRun({ base, date }) {
  mkdirSync(base, { recursive: true });
  const existing = readdirSync(base).filter(n => n.startsWith(`${date}-`));
  const suffixes = existing
    .map(n => parseInt(n.slice(date.length + 1), 10))
    .filter(Number.isFinite);
  const next = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 1;
  const dir = join(base, `${date}-${next}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.lock'), String(process.pid));
  return { dir, runNumber: next };
}

export function releaseRun(dir) {
  const lockFile = join(dir, '.lock');
  if (existsSync(lockFile)) rmSync(lockFile, { force: true });
}
