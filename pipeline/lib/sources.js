import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { ConfigSchema } from '../schemas/config.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadConfig(path = 'config.json') {
  const resolved = isAbsolute(path) ? path : resolve(REPO_ROOT, path);
  const raw = JSON.parse(readFileSync(resolved, 'utf8'));
  return ConfigSchema.parse(raw);
}

export function isJsRenderedDomain(url, jsDomains) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return jsDomains.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
