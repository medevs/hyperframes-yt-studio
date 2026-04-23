function signalStrength(item) {
  const pts = item.signals?.hn_points ?? 0;
  const cmts = item.signals?.hn_comments ?? 0;
  return pts + cmts;
}

function sourcePriority(source) {
  return { hackernews: 3, company_blog: 2, rss: 1 }[source] ?? 0;
}

export function dedupItems(items) {
  const byUrl = new Map();
  for (const it of items) {
    const existing = byUrl.get(it.external_url);
    if (!existing) { byUrl.set(it.external_url, it); continue; }
    const a = signalStrength(it), b = signalStrength(existing);
    if (a > b) byUrl.set(it.external_url, it);
    else if (a === b && sourcePriority(it.source) > sourcePriority(existing.source)) {
      byUrl.set(it.external_url, it);
    }
  }
  return [...byUrl.values()];
}
