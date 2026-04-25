import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../assets/headline-card.css', import.meta.url), 'utf8');

export async function renderHeadlineCard(browser, { sceneNum, headline, sourceDomain }, outputPath) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div class="card">
  <div class="scene-num">${String(sceneNum).padStart(2, '0')}</div>
  <div class="headline">${escapeHtml(headline)}</div>
  <div class="source">${escapeHtml(sourceDomain)}</div>
</div></body></html>`;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 1200 } });
    return { path: outputPath, width: 1200, height: 1200 };
  } finally {
    await page.close();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
