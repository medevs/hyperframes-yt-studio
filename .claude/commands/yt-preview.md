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

Run that command via `Bash(run_in_background: true)`. The studio prints `Studio    http://localhost:3000` on stdout. **If HF logs `Port 3000 is in use, using N instead`, that is a hard failure** — kill the studio you just started, investigate what's holding 3000 (`Get-NetTCPConnection -LocalPort 3000`), and tell the user. Do not let the user end up with a studio on a non-3000 port.

**The URL to surface to the user is the synced-preview shell, NOT the studio root:**

```
http://localhost:3000/api/projects/<RUN-ID>/preview/audio-preview.html
```

Where `<RUN-ID>` is the basename of `$RUN` (e.g. `2026-04-26-1`). The audio-preview.html template is copied into every run-dir by `pipeline/build-run-dir.mjs`. It wraps `<hyperframes-player>` and proactively flips audio ownership to "parent" via `_promoteToParentProxy()`, bypassing the HF studio iframe cold-load race that otherwise leaves the voiceover silent.

Verify before surfacing — both URLs must respond:

```bash
RUN_ID=$(basename "$RUN")
curl -sf -o /dev/null "http://localhost:3000/api/projects/$RUN_ID/preview/audio-preview.html" || { echo "ERROR: audio-preview.html not found in $RUN — re-run /yt-build"; exit 1; }
echo "Open: http://localhost:3000/api/projects/$RUN_ID/preview/audio-preview.html"
```

After surfacing the URL, give this guidance:

> **Open the URL above** to play the full video with synced voiceover. The page resolves the HF player asset at runtime and promotes audio ownership to the parent, so the voiceover plays reliably from the first second.
>
> If you'd rather inspect individual scenes or scrub frame-by-frame, the studio root is at `http://localhost:3000`. Click `index` in the sidebar — but be aware that the studio shell has a known cold-load race where the voiceover may never start; that's the reason the synced-preview shell exists.

When the user is satisfied with the preview, invoke `/yt-render` to produce the final MP4.

**If the play button is disabled or the timeline is empty in the studio**, do NOT work around it. Diagnose the root cause:
1. Check `npx hyperframes doctor` for version mismatches — old hyperframes versions ship buggy studio runtimes that fail silently
2. Check that `$RUN/meta.json` exists (the studio needs it to identify the project)
3. Check that audio elements do NOT have `class="clip"` (per HF docs, audio is invisible — adding `clip` breaks the runtime visibility manager)
4. Check that the master GSAP timeline key in `window.__timelines` exactly matches the root element's `data-composition-id`
5. Check `npx hyperframes lint` is fully clean (no errors)
