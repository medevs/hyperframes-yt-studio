import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireRun, releaseRun } from '../pipeline/lib/run-id.js';

let base;
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'runid-')); });
afterEach(() => { rmSync(base, { recursive: true, force: true }); });

describe('acquireRun', () => {
  it('creates <date>-1 on first call', () => {
    const r = acquireRun({ base, date: '2026-04-23' });
    expect(r.dir.endsWith('2026-04-23-1')).toBe(true);
    expect(existsSync(r.dir)).toBe(true);
    expect(existsSync(join(r.dir, '.lock'))).toBe(true);
  });

  it('increments on subsequent calls same day', () => {
    acquireRun({ base, date: '2026-04-23' });
    const r2 = acquireRun({ base, date: '2026-04-23' });
    expect(r2.dir.endsWith('2026-04-23-2')).toBe(true);
  });

  it('handles different dates independently', () => {
    acquireRun({ base, date: '2026-04-23' });
    const r = acquireRun({ base, date: '2026-04-24' });
    expect(r.dir.endsWith('2026-04-24-1')).toBe(true);
  });
});

describe('releaseRun', () => {
  it('removes the lock file', () => {
    const r = acquireRun({ base, date: '2026-04-23' });
    releaseRun(r.dir);
    expect(existsSync(join(r.dir, '.lock'))).toBe(false);
  });
});
