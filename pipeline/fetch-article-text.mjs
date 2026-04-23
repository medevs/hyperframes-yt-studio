import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { writeFileSync } from 'node:fs';

const [, , url, outPath] = process.argv;
if (!url || !outPath) {
  console.error('usage: node fetch-article-text.mjs <url> <out-path>');
  process.exit(2);
}

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (compatible; ai-daily-bot/0.2)');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  const html = await page.content();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();
  const text = parsed?.textContent?.trim() ?? '';
  writeFileSync(outPath, text, 'utf8');
  console.log(`OK ${text.length} chars -> ${outPath}`);
  process.exit(text.length >= 500 ? 0 : 3);
} catch (err) {
  console.error('FAIL', err.message);
  process.exit(1);
} finally {
  await browser.close();
}
