---
name: yt-daily
description: Run the full pipeline end-to-end with three approval gates (script, visual, MP4).
---

Run in order, stopping at each gate. NEVER chain past a gate without explicit user approval.

1. `/yt-fetch`
2. `/yt-research`
3. `/yt-script` — **Gate 1: script approval.** Wait for user "approve".
4. `/yt-build` — produces `index.html` (lint clean), no MP4 yet.
5. `/yt-preview` — opens the Hyperframes studio in the browser. **Gate 2: visual approval.** Wait for user "approve". This step is mandatory; previewing in the browser is dramatically faster to iterate on than re-rendering MP4s. If the user wants to revise the storyboard or composition, they edit and the studio hot-reloads — no rebuild needed for HTML changes; for narration/timing changes, re-run `/yt-build`.
6. `/yt-render` — renders the MP4 and writes metadata. **Gate 3: MP4 approval.** Wait for user "approve".
7. `/yt-approve`

If the user wants to skip the visual preview (e.g. running unattended overnight), they must say so explicitly — otherwise the preview gate is non-negotiable. The MP4 render is the most expensive step in the pipeline; previewing the HTML composition first prevents wasted renders.
