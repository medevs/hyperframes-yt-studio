function recencyTimestamp(item) {
  const t = Date.parse(item.published_at ?? '');
  return Number.isFinite(t) ? t : 0;
}

function signalStrength(item) {
  return (item.signals?.hn_points ?? 0) + (item.signals?.hn_comments ?? 0);
}

export function capItems(items, cap) {
  return [...items]
    .sort((a, b) => {
      const dt = recencyTimestamp(b) - recencyTimestamp(a);
      if (dt !== 0) return dt;
      return signalStrength(b) - signalStrength(a);
    })
    .slice(0, cap);
}
