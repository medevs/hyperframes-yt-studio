---
name: yt-fetch
description: Acquire a new run folder and fetch AI/tech news sources. Produces items.json.
---

```bash
RUN=$(node -e "import('./pipeline/lib/run-id.js').then(m => { const r = m.acquireRun({ base: 'work', date: new Date().toISOString().slice(0,10) }); console.log(r.dir); })")
echo "$RUN" > .last-run
mkdir -p "$RUN/logs"
node pipeline/fetch-sources.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/fetch.log"
```

Report to the user: the run folder path and the number of items fetched (usable vs total).
