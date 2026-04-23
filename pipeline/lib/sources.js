import { readFileSync } from 'node:fs';
import { ConfigSchema } from '../schemas/config.js';

export function loadConfig(path = 'config.json') {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
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
