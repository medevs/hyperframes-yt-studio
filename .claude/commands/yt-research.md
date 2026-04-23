---
name: yt-research
description: Invoke yt-research skill against the current run's items.json.
---

Read `.last-run` for the run folder path. Invoke the `yt-research` skill targeting `$RUN/items.json`. The skill writes `$RUN/picks.json`.

Validate:

```bash
RUN=$(cat .last-run)
node -e "import('./pipeline/schemas/picks.js').then(({PicksFileSchema}) => { const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); PicksFileSchema.parse(d); console.log('OK'); })" "$RUN/picks.json"
```

Report the 3 picks by rank + headline to the user.
