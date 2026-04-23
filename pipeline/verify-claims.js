import { normalizeForMatching } from './lib/normalize-text.js';

export function checkClaim({ supporting_quote, sourceText }) {
  const q = normalizeForMatching(supporting_quote);
  const src = normalizeForMatching(sourceText);
  if (!q) return { pass: false, reason: 'empty_quote' };
  if (!src) return { pass: false, reason: 'empty_source' };
  const idx = src.indexOf(q);
  if (idx === -1) return { pass: false, reason: 'not_found' };
  const pad = 80;
  const excerpt = src.slice(Math.max(0, idx - pad), Math.min(src.length, idx + q.length + pad));
  return { pass: true, excerpt };
}

export function verifyAll(claims, sources) {
  const results = claims.map(c => {
    const sourceText = sources[c.source_item_id] ?? '';
    const r = checkClaim({ supporting_quote: c.supporting_quote, sourceText });
    return { id: c.id, claim_text: c.claim_text, section: c.section, source_item_id: c.source_item_id, ...r };
  });
  return { pass: results.every(r => r.pass), results };
}
