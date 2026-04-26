---
name: yt-render
description: Render the lint-clean composition to MP4 and write YouTube metadata. Run AFTER /yt-build and after the user has visually approved via /yt-preview.
---

Precondition: `.last-run` exists; `$RUN/index.html` exists (from `/yt-build`); lint is clean; the user has previewed the composition in the browser (`/yt-preview`) and explicitly approved the visuals.

If `$RUN/index.html` does not exist, refuse and tell the user to run `/yt-build` first. If the user has not previewed yet, suggest `/yt-preview` before rendering — MP4 render is the heavy step and is hard to iterate on.

```bash
RUN=$(cat .last-run)
mkdir -p "$RUN/logs"
node pipeline/render.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/render.log" || exit 1
```

Then invoke the `yt-metadata` skill — it writes `$RUN/metadata.txt`.

Tell the user: **"Final MP4 ready at `$RUN/renders/video.mp4`. Watch it end-to-end and reply approve to publish (`/yt-approve`) or reject to iterate."**

Do not invoke `/yt-approve` until the user says approved.
