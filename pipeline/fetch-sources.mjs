import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { loadConfig, isJsRenderedDomain } from './lib/sources.js';
import { dedupItems } from './lib/dedup.js';
import { ItemsFileSchema } from './schemas/items.js';

const [, , workDir] = process.argv;
if (!workDir) { console.error('usage: node fetch-sources.mjs <work-dir>'); process.exit(2); }

const config = loadConfig();
const parser = new Parser();
const articlesDir = join(workDir, 'articles');
mkdirSync(articlesDir, { recursive: true });
const fetchErrors = [];

async function fetchRss(url, source) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map(e => ({
      id: `${source}-${Buffer.from(e.link || e.guid || e.title).toString('base64').slice(0, 20)}`,
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

async function plainFetchAndExtract(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'ai-daily-bot/0.2' } });
  const html = await r.text();
  const dom = new JSDOM(html, { url });
  return new Readability(dom.window.document).parse()?.textContent?.trim() ?? '';
}

function jsRenderedFetch(url, outPath) {
  const res = spawnSync('node', ['pipeline/fetch-article-text.mjs', url, outPath], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 60000,
  });
  return res.status === 0;
}

async function extractArticleText(item) {
  const outPath = join(articlesDir, `${item.id}.txt`);
  try {
    if (isJsRenderedDomain(item.external_url, config.sources.js_rendered_domains)) {
      if (!jsRenderedFetch(item.external_url, outPath)) return { failed: true };
    } else {
      const text = await plainFetchAndExtract(item.external_url);
      if (text.length < 500) return { failed: true };
      writeFileSync(outPath, text, 'utf8');
    }
    return { failed: false, path: `articles/${item.id}.txt` };
  } catch (err) {
    fetchErrors.push({ source: 'article_extraction', url: item.external_url, error: err.message });
    return { failed: true };
  }
}

const rssResults = await Promise.all([
  ...config.sources.rss.map(u => fetchRss(u, 'rss')),
  ...config.sources.company_blogs.map(u => fetchRss(u, 'company_blog')),
]);
const hn = await fetchHackerNews(config.sources.hackernews);
const raw = [...rssResults.flat(), ...hn];
const deduped = dedupItems(raw);

const enriched = [];
for (const item of deduped) {
  const r = await extractArticleText(item);
  enriched.push(r.failed
    ? { ...item, text_extraction_failed: true }
    : { ...item, article_text_path: r.path });
}

const usable = enriched.filter(i => !i.text_extraction_failed);
if (usable.length < 10) {
  console.error(`ERROR: only ${usable.length} items with usable article text (need >=10)`);
  writeFileSync(join(workDir, 'fetch-errors.json'), JSON.stringify(fetchErrors, null, 2));
  process.exit(1);
}

const out = { fetched_at: new Date().toISOString(), items: enriched };
ItemsFileSchema.parse(out);
writeFileSync(join(workDir, 'items.json'), JSON.stringify(out, null, 2));
writeFileSync(join(workDir, 'fetch-errors.json'), JSON.stringify(fetchErrors, null, 2));
console.log(`OK ${enriched.length} items (${usable.length} with usable text) -> ${workDir}/items.json`);
