import { JSDOM } from 'jsdom';
import { writeFileSync } from 'node:fs';

export function extractOgImageUrl(html, baseUrl) {
  const dom = new JSDOM(html);
  const meta = dom.window.document.querySelector('meta[property="og:image"], meta[name="og:image"]');
  const raw = meta?.getAttribute('content');
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Fetches an article page, extracts its og:image URL, downloads the image,
 * and writes it to `outputPath`.
 *
 * Returns `{ path, contentType, bytes }` on success, `null` on any failure
 * (timeout, network error, missing meta tag, non-image content-type, etc.).
 *
 * `outputPath`'s parent directory must already exist.
 */
export async function fetchOgImage(pageUrl, outputPath, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const html = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ai-daily-bot/0.3)' },
    }).then(r => r.ok ? r.text() : null);
    if (!html) return null;
    const imgUrl = extractOgImageUrl(html, pageUrl);
    if (!imgUrl) return null;
    const img = await fetch(imgUrl, { signal: ctrl.signal }).then(r => r.ok ? r : null);
    if (!img) return null;
    const ct = img.headers.get('content-type') || '';
    if (!ct.toLowerCase().startsWith('image/')) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    writeFileSync(outputPath, buf);
    return { path: outputPath, contentType: ct, bytes: buf.length };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
