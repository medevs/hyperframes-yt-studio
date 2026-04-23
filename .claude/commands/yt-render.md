---
name: yt-render
description: TTS → transcribe → compute timings → screenshots → build run dir → compose → lint → render → metadata. Stops at the MP4 approval gate.
---

Precondition: `.last-run` exists; `$RUN/script.md`, `$RUN/claims.json`, `$RUN/storyboard.json` exist; user approved the script. Refuse if `$RUN/claims-verified.json` is missing or has any failed claim.

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
node pipeline/render.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/render.log" || exit 1
```

Then invoke the `yt-metadata` skill — it writes `$RUN/metadata.txt`.

Tell the user: **"Draft video ready at `$RUN/renders/video.mp4`. Watch it and reply approve or reject."**

Do not invoke `/yt-approve` until the user says approved.
