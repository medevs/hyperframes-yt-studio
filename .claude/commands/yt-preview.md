---
name: yt-preview
description: Open the Hyperframes studio on the current run for live iteration before MP4 render.
---

Precondition: `.last-run` exists; `$RUN/index.html` exists (from `/yt-build`); lint is clean.

If `$RUN/index.html` does NOT exist, refuse and tell the user to run `/yt-build` first — there is nothing to preview before the composition step.

**Single-server discipline:** Always kill all existing preview servers before starting a new one. The user does not want to think about which port belongs to which run. We always launch a fresh studio on a deterministic port (3002).

```bash
RUN=$(cat .last-run)
test -f "$RUN/index.html" || { echo "ERROR: $RUN/index.html missing — run /yt-build first."; exit 1; }
# Kill any lingering studios from prior runs (other projects, prior attempts)
npx hyperframes preview --kill-all 2>/dev/null || true
# Defense-in-depth: --kill-all only kills servers it tracked itself; sweep ports 3002-3010 for stragglers (Windows-safe)
node -e "
const { spawnSync } = require('node:child_process');
const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
const pids = new Set();
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^\s*TCP\s+\S*:(300[2-9]|3010)\s+\S+\s+LISTENING\s+(\d+)/);
  if (m) pids.add(m[2]);
}
for (const pid of pids) {
  try { process.kill(parseInt(pid, 10)); } catch {}
}
" 2>/dev/null || true
sleep 1
npx hyperframes preview "$RUN" --port 3002 --force-new
```

Run that command via `Bash(run_in_background: true)`. The studio prints `Studio    http://localhost:3002` on stdout — surface that URL verbatim to the user.

When the user is satisfied with the preview, invoke `/yt-render` to produce the final MP4.

**If the play button is disabled or the timeline is empty in the studio**, do NOT work around it. Diagnose the root cause:
1. Check `npx hyperframes doctor` for version mismatches — old hyperframes versions ship buggy studio runtimes that fail silently
2. Check that `$RUN/meta.json` exists (the studio needs it to identify the project)
3. Check that audio elements do NOT have `class="clip"` (per HF docs, audio is invisible — adding `clip` breaks the runtime visibility manager)
4. Check that the master GSAP timeline key in `window.__timelines` exactly matches the root element's `data-composition-id`
5. Check `npx hyperframes lint` is fully clean (no errors)
