import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaimsFileSchema } from './schemas/claims.js';
import { ItemsFileSchema } from './schemas/items.js';
import { verifyAll } from './verify-claims.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node verify-claims.mjs <work-dir>'); process.exit(2); }

const claims = ClaimsFileSchema.parse(JSON.parse(readFileSync(join(workDir, 'claims.json'), 'utf8'))).claims;
const items = ItemsFileSchema.parse(JSON.parse(readFileSync(join(workDir, 'items.json'), 'utf8'))).items;

const sources = {};
for (const it of items) {
  if (it.article_text_path) {
    sources[it.id] = readFileSync(join(workDir, it.article_text_path), 'utf8');
  }
}

const result = verifyAll(claims, sources);
writeFileSync(join(workDir, 'claims-verified.json'), JSON.stringify(result, null, 2));

const failed = result.results.filter(r => !r.pass);
if (failed.length > 0) {
  const lines = ['# Claims verification FAILED', ''];
  for (const f of failed) {
    lines.push(`## Claim ${f.id} (${f.section})`);
    lines.push(`**Claim:** ${f.claim_text}`);
    lines.push(`**Reason:** ${f.reason}`);
    lines.push(`**Source:** ${f.source_item_id}`);
    lines.push('');
  }
  writeFileSync(join(workDir, 'claims-verification-report.md'), lines.join('\n'));
  console.error(`FAIL: ${failed.length}/${result.results.length} claims unverified. See claims-verification-report.md`);
  process.exit(1);
}

console.log(`OK: ${result.results.length} claims verified.`);
