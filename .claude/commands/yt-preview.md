---
name: yt-preview
description: Open the Hyperframes studio on the current run for live iteration before MP4 render.
---

Precondition: `.last-run` exists; `$RUN/index.html` exists (from `yt-compose`); lint is clean.

```bash
RUN=$(cat .last-run)
cd "$RUN"
npx hyperframes preview
```

The studio opens in the browser with hot-reload. The user can scrub the timeline, see animations, and request changes. When they're satisfied, invoke `/yt-render` to produce MP4.
