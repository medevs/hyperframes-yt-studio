import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractOgImageUrl } from '../pipeline/lib/og-image.mjs';

const fx = (name) => readFileSync(join('tests/fixtures/og-image', name), 'utf8');

describe('extractOgImageUrl', () => {
  it('returns the og:image URL when present', () => {
    expect(extractOgImageUrl(fx('with-og.html'))).toBe('https://example.com/cover.png');
  });

  it('returns null when og:image meta is missing', () => {
    expect(extractOgImageUrl(fx('no-og.html'))).toBeNull();
  });

  it('returns null when og:image is a relative path and no base URL is provided', () => {
    expect(extractOgImageUrl(fx('broken-og.html'))).toBeNull();
  });

  it('resolves relative og:image against a base URL', () => {
    const html = '<meta property="og:image" content="/cover.png">';
    expect(extractOgImageUrl(html, 'https://example.com/article')).toBe('https://example.com/cover.png');
  });
});
