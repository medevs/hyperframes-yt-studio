async function fetchOne(url, timeoutMs, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'ai-daily-bot/0.2' },
    });
    const body = await r.text();
    return { url, ok: r.ok, status: r.status, body };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function parallelFetch(urls, { concurrency = 5, timeoutMs = 10000, fetchImpl = fetch } = {}) {
  if (urls.length === 0) return [];
  const results = new Array(urls.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      results[i] = await fetchOne(urls[i], timeoutMs, fetchImpl);
    }
  }
  const workerCount = Math.min(concurrency, urls.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
