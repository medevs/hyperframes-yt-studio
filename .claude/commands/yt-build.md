---
name: yt-build
description: TTS → transcribe → compute timings → screenshots → build run dir → compose → lint. Stops BEFORE MP4 render so the user can preview in the browser via /yt-preview.
---

Precondition: `.last-run` exists; `$RUN/script.md`, `$RUN/claims.json`, `$RUN/storyboard.json` exist; user approved the script. Refuse if `$RUN/claims-verified.json` is missing or has any failed claim.

This command produces a **previewable, lint-clean** `$RUN/index.html` — but does NOT render the MP4. The MP4 render is the heavy step and is intentionally separated so the user can iterate visually in the browser first.

```bash
RUN=$(cat .last-run)
mkdir -p "$RUN/logs"
node pipeline/build-narration-text.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/narration.log" || exit 1
node pipeline/tts.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/tts.log" || exit 1
node pipeline/transcribe.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/transcribe.log" || exit 1
node pipeline/compute-timings.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/timings.log" || exit 1
node pipeline/capture-screenshots.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/screenshots.log" || exit 1
node pipeline/build-run-dir.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/run-dir.log" || exit 1
```

Then invoke the `yt-compose` skill against `$RUN/` — it writes `$RUN/index.html`. After the skill completes:

```bash
RUN=$(cat .last-run)
node pipeline/lint.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/lint.log" || exit 1
```

Tell the user: **"Composition ready at `$RUN/index.html` (lint clean). Run `/yt-preview` to open the Hyperframes studio in your browser. When the visuals look right, reply approve and I'll render the MP4 with `/yt-render`."**

Do NOT run `pipeline/render.mjs` from this command — that belongs to `/yt-render`. Do NOT invoke `/yt-render` automatically; wait for explicit user approval after they've previewed.
