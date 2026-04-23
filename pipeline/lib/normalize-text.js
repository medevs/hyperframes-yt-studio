const HTML_ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

const NBSP_CLASS = /[  -​  　]/g;

function decodeHtmlEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, m => HTML_ENTITY_MAP[m]);
}

export function normalizeForMatching(input) {
  if (input == null) return '';
  let s = String(input);
  s = decodeHtmlEntities(s);
  s = s.normalize('NFKC');
  s = s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/…/g, '...')
    .replace(NBSP_CLASS, ' ');
  // Dashes: collapse any whitespace around en/em/minus/figure/hyphen dashes into a single hyphen
  s = s.replace(/\s*[–—−‐‑\-]\s*/g, '-');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.toLowerCase();
  return s;
}
