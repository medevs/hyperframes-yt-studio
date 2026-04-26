---
name: yt-preview
description: Open the Hyperframes studio on the current run for live iteration before MP4 render.
---

Precondition: `.last-run` exists; `$RUN/index.html` exists (from `/yt-build`); lint is clean.

If `$RUN/index.html` does NOT exist, refuse and tell the user to run `/yt-build` first — there is nothing to preview before the composition step.

**Strict port discipline:** the studio ALWAYS runs on **port 3000**. If anything else is on 3000, kill it first — never fall back to a higher port. (HF preview's default fallback behaviour silently lands on 3002, 3004, … which leaves multiple node processes running and slows the laptop. We refuse that.)

```bash
RUN=$(cat .last-run)
test -f "$RUN/index.html" || { echo "ERROR: $RUN/index.html missing — run /yt-build first."; exit 1; }

# 1. Kill HF-tracked servers
npx hyperframes preview --kill-all 2>/dev/null || true

# 2. Kill ANYTHING listening on 3000 (Windows + Unix-safe via PowerShell on Windows, lsof on Unix).
#    HF's --kill-all only kills servers it tracked itself; this catches strays.
if [ "$OS" = "Windows_NT" ] || command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }"
else
  lsof -ti :3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi
sleep 1

# 3. Verify 3000 is free; refuse to start otherwise (do NOT fall back to a different port)
if command -v powershell >/dev/null 2>&1; then
  STILL=$(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count")
  if [ "$STILL" != "0" ]; then echo "ERROR: port 3000 still in use; investigate before retrying"; exit 1; fi
fi

# 4. Bind on port 3000 only
npx hyperframes preview "$RUN" --port 3000 --force-new
```

Run that command via `Bash(run_in_background: true)`. The studio prints `Studio    http://localhost:3000` on stdout — surface that URL verbatim to the user. **If HF logs `Port 3000 is in use, using N instead`, that is a hard failure** — kill the studio you just started, investigate what's holding 3000 (`Get-NetTCPConnection -LocalPort 3000`), and tell the user. Do not let the user end up with a studio on a non-3000 port.

After surfacing the URL, give this guidance:

> **In the studio sidebar, click `index` to play the full video.** The other entries (`intro`, `story-1`, `story-2`, `story-3`, `outro`) are sub-compositions — they will appear empty in isolation because they share CSS and audio from the root. This is expected with the v4 nested-sub-composition pattern (see HANDOFF-2026-04-26.md).

When the user is satisfied with the preview, invoke `/yt-render` to produce the final MP4.

**If the play button is disabled or the timeline is empty in the studio**, do NOT work around it. Diagnose the root cause:
1. Check `npx hyperframes doctor` for version mismatches — old hyperframes versions ship buggy studio runtimes that fail silently
2. Check that `$RUN/meta.json` exists (the studio needs it to identify the project)
3. Check that audio elements do NOT have `class="clip"` (per HF docs, audio is invisible — adding `clip` breaks the runtime visibility manager)
4. Check that the master GSAP timeline key in `window.__timelines` exactly matches the root element's `data-composition-id`
5. Check `npx hyperframes lint` is fully clean (no errors)
