import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node build-run-dir.mjs <work-dir>'); process.exit(2); }

for (const f of ['hyperframes.json', 'DESIGN.md']) {
  if (existsSync(f)) copyFileSync(f, join(workDir, f));
}
if (existsSync('assets')) cpSync('assets', join(workDir, 'assets'), { recursive: true });
if (existsSync('compositions')) cpSync('compositions', join(workDir, 'compositions'), { recursive: true });
mkdirSync(join(workDir, 'renders'), { recursive: true });
mkdirSync(join(workDir, 'snapshots'), { recursive: true });
console.log(`OK run dir prepared at ${workDir}`);
