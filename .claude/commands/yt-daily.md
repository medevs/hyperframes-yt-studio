---
name: yt-daily
description: Run the full pipeline end-to-end with both approval gates.
---

Run in order, stopping at each gate:

1. `/yt-fetch`
2. `/yt-research`
3. `/yt-script` — **Gate 1: script approval.** Wait for user "approve" before continuing.
4. `/yt-render` — **Gate 2: video approval.** Wait for user "approve" before continuing.
5. `/yt-approve`

If the user wants to iterate on visuals between `yt-compose` and `yt-render`, suggest `/yt-preview` — it opens the Hyperframes studio with hot-reload so they can see changes without a full render.

Do not chain past either gate without the user's explicit approval.
