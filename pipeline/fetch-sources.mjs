import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { loadConfig } from './lib/sources.js';
import { dedupItems } from './lib/dedup.js';
import { capItems } from './lib/cap-items.js';
import { parallelFetch } from './lib/parallel-fetch.js';
import { ItemsFileSchema } from './schemas/items.js';

const ITEM_CAP = 50;
const FETCH_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 10000;
const MIN_ARTICLE_CHARS = 500;
const MIN_USABLE_ITEMS = 10;

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node fetch-sources.mjs <work-dir>'); process.exit(2); }

const config = loadConfig();
const parser = new Parser();
const fetchErrors = [];

const shortHash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

async function fetchRss(url, source) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map(e => ({
      id: `${source}-${shortHash(e.link || e.guid || e.title)}`,
      source,
      source_url: e.link ?? url,
      external_url: e.link ?? url,
      title: e.title ?? '',
      summary: (e.contentSnippet ?? e.content ?? '').slice(0, 500),
      published_at: e.isoDate ?? new Date().toISOString(),
    }));
  } catch (err) {
    fetchErrors.push({ source, url, error: err.message });
    return [];
  }
}

async function fetchHackerNews({ min_points, keywords }) {
  try {
    const q = encodeURIComponent(keywords.join(' OR '));
    const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${q}&numericFilters=points>=${min_points}`;
    const r = await fetch(url);
    const json = await r.json();
    return json.hits.filter(h => h.url).map(h => ({
      id: `hn-${h.objectID}`,
      source: 'hackernews',
      source_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      external_url: h.url,
      title: h.title ?? '',
      summary: (h.story_text ?? '').replace(/<[^>]+>/g, '').slice(0, 500),
      published_at: h.created_at,
      signals: { hn_points: h.points ?? 0, hn_comments: h.num_comments ?? 0 },
    }));
  } catch (err) {
    fetchErrors.push({ source: 'hackernews', error: err.message });
    return [];
  }
}

function extractText(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    return new Readability(dom.window.document).parse()?.textContent?.trim() ?? '';
  } catch {
    return '';
  }
}

mkdirSync(join(workDir, 'articles'), { recursive: true });

const rssResults = await Promise.all([
  ...config.sources.rss.map(u => fetchRss(u, 'rss')),
  ...config.sources.company_blogs.map(u => fetchRss(u, 'company_blog')),
]);
const hn = await fetchHackerNews(config.sources.hackernews);
const raw = [...rssResults.flat(), ...hn];

if (raw.length === 0) {
  mkdirSync(workDir, { recursive: true });
  writeFileSync(join(workDir, 'fetch-errors.json'), JSON.stringify(fetchErrors, null, 2));
  console.error(`ERROR: every source returned zero items (${fetchErrors.length} fetch errors). See ${workDir}/fetch-errors.json`);
  process.exit(1);
}

const deduped = dedupItems(raw);
const capped = capItems(deduped, ITEM_CAP);

const urls = capped.map(i => i.external_url);
const fetched = await parallelFetch(urls, {
  concurrency: FETCH_CONCURRENCY,
  timeoutMs: FETCH_TIMEOUT_MS,
});

const enriched = capped.map((item, i) => {
  const r = fetched[i];
  if (!r.ok) {
    fetchErrors.push({ source: 'article_extraction', url: item.external_url, error: r.error ?? `status ${r.status}` });
    return { ...item, text_extraction_failed: true };
  }
  const text = extractText(r.body, item.external_url);
  if (text.length < MIN_ARTICLE_CHARS) {
    fetchErrors.push({ source: 'article_extraction', url: item.external_url, error: `text too short (${text.length} chars)` });
    return { ...item, text_extraction_failed: true };
  }
  const relPath = `articles/${item.id}.txt`;
  writeFileSync(join(workDir, relPath), text, 'utf8');
  return { ...item, article_text_path: relPath };
});

const usable = enriched.filter(i => !i.text_extraction_failed);
const out = { fetched_at: new Date().toISOString(), items: enriched };
ItemsFileSchema.parse(out);
writeFileSync(join(workDir, 'items.json'), JSON.stringify(out, null, 2));
writeFileSync(join(workDir, 'fetch-errors.json'), JSON.stringify(fetchErrors, null, 2));

if (usable.length < MIN_USABLE_ITEMS) {
  console.error(`ERROR: only ${usable.length} items with usable article text (need >=${MIN_USABLE_ITEMS})`);
  process.exit(1);
}
console.log(`OK ${enriched.length} items (${usable.length} with usable text, capped from ${deduped.length}) -> ${workDir}/items.json`);
