import { JSDOM } from 'jsdom';

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
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outputPath, buf);
    return { path: outputPath, contentType: ct, bytes: buf.length };
  } finally {
    clearTimeout(t);
  }
}
