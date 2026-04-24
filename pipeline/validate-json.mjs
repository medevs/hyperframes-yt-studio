import { readFileSync } from 'node:fs';
import { PicksFileSchema } from './schemas/picks.js';
import { ClaimsFileSchema } from './schemas/claims.js';
import { StoryboardFileSchema } from './schemas/storyboard.js';
import { TimingsFileSchema } from './schemas/timings.js';
import { ItemsFileSchema } from './schemas/items.js';
import { ScreenshotsManifestSchema } from './schemas/screenshots-manifest.js';

const SCHEMAS = {
  picks: PicksFileSchema,
  claims: ClaimsFileSchema,
  storyboard: StoryboardFileSchema,
  timings: TimingsFileSchema,
  items: ItemsFileSchema,
  'screenshots-manifest': ScreenshotsManifestSchema,
};

const [, , schemaName, filePath] = process.argv;
if (!schemaName || !filePath) {
  console.error('usage: node pipeline/validate-json.mjs <schema> <file>');
  console.error('schemas: ' + Object.keys(SCHEMAS).join(', '));
  process.exit(2);
}

const schema = SCHEMAS[schemaName];
if (!schema) {
  console.error(`unknown schema: ${schemaName}`);
  console.error('schemas: ' + Object.keys(SCHEMAS).join(', '));
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`failed to read/parse ${filePath}: ${err.message}`);
  process.exit(1);
}

const result = schema.safeParse(data);
if (!result.success) {
  console.error(`${schemaName} validation failed for ${filePath}:`);
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.') || '<root>'}: ${issue.message}`);
  }
  process.exit(1);
}

console.log(`OK ${schemaName} ${filePath}`);
