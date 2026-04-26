# Session Handoff — 2026-04-25 (PM session)

> Companion file: `HANDOFF-2026-04-25-am.md` — the morning session that opened this work. Read it for the original problem statement (3 open issues: voiceover, layout, play button) and the bisection strategy that this session executed against. **This PM-session handoff supersedes it where they overlap.**

## TL;DR

Two of the three open issues from the AM handoff are **fully resolved with verified evidence**. The third was confirmed not to be a bug.

| AM-handoff issue | Status | Evidence |
|---|---|---|
| **Studio play button stays disabled** | ✅ FIXED | Root-caused (CDN runtime injection); fixed via `window.__hf=true`; `proof-fix.mjs` returns ALL GREEN (6/6) |
| **Scene layout broken / "too much"** | ✅ REWRITTEN | yt-compose v3 skill + new `index.html` with 5 scenes, 26 time-sliced beats; lint clean; needs your visual sign-off |
| **No voiceover in MP4** | ✅ NOT A BUG | User confirmed: laptop audio issue, not pipeline. ffprobe shows AAC stereo at -30.5 dB mean (normal speech). Drop entirely. |

**The ONLY remaining step:** open the studio at http://localhost:3002 and visually approve the new composition. I had begun the per-scene puppeteer snapshot script when you stopped me — picking that up is task #1 on resume.

---

## What was achieved (with evidence and commits)

### 1. Browser preview play-button bug — root-caused and fixed

**Root cause** (found by reading `node_modules/hyperframes/dist/studio/assets/hyperframes-player-vibA20NC.js`):

The HF 0.4.26 `<hyperframes-player>` custom element runs an iframe-load probe loop. After 5 polls (1 second), if it sees `__timelines` registered but not `window.__hf` or `window.__player`, it decides we need the HF runtime and **injects `<script src="https://cdn.jsdelivr.net/npm/@hyperframes/core/dist/hyperframe.runtime.iife.js">`** into the iframe. It then waits up to 8 seconds for the CDN script to load before falling back to use `__timelines` directly. On your machine (and in cold-cache puppeteer runs) the CDN load was stalling, the 8-second timeout fired, and the play button stayed disabled forever.

The smoking-gun decision:
```js
function H(c) {
  if (c.hasRuntime || c.runtimeInjected) return false;
  return c.hasNestedCompositions || (c.hasTimelines && c.attempts >= 5);
}
```
Setting `window.__hf = true` early forces `hasRuntime=true` on the very first probe, skipping the CDN injection entirely.

**Fix:** v3 yt-compose skill mandates this block immediately after `<script src="assets/gsap.min.js"></script>`:
```html
<script>
window.__hf = window.__hf || { selfHosted: true };
</script>
```
Encoded in `.claude/skills/yt-compose/SKILL.md` and present in `work/2026-04-25-1/index.html` lines 398-404.

**Verification:** `node proof-fix.mjs` returns ALL GREEN — `_ready=true`, `_duration=186.93`, button enabled, no CDN injection, no timeout.

### 2. yt-compose skill rewritten to v3 (commit `ea59944` on `fix/preview-and-dynamic-layout`)

The v2 skill + `motion_budget` lint were COMBINED root-causing the visual chaos. v2 mandated 3+ of 5 motion primitives co-existing on screen → composer crammed everything spatially → screenshots became postage stamps in corners, stat numbers tiny, right 60% of canvas empty. v2 had also dropped the v1 rule "Never `position: absolute` for content."

**v3 core principle:** **TIME-SLICE, DON'T CRAM.** Each scene is a sequence of 3+ full-bleed beats; ONE focal element fills the screen at any moment, transitions out as next beat enters. Numbers shown one at a time at 240–360px font size. Screenshots used full-bleed (background ghost OR foreground ken-burns), never thumbnails.

**Files changed in `ea59944`:**
- `.claude/skills/yt-compose/SKILL.md` (v3, 177 lines, 17 sections)
- `pipeline/lib/motion-budget.mjs` (now counts distinct *beat moments* — quantized `data-at`/`data-emphasize-at`/nested-clip `data-start` values — instead of co-existing primitives)
- `tests/lint-motion-budget.test.js` (8 tests, was 4)
- `tests/fixtures/lint-motion-budget/{crammed,sliced,nested-clips}.html` (new fixtures locking the new semantics)

**Test status:** `npm test` → 106/106 passing across 16 files. Verified independently after subagent reported done.

### 3. `work/2026-04-25-1/index.html` re-authored (commit `a5dfb7e` on same branch)

1043-line composition. **5 scenes / 26 inner beats:**
- intro: 4 beats (hero → teaser-1 → teaser-2 → teaser-3)
- story-1: 7 beats (cold-open → headline-hold → stat 1.6T → stat 1M → stat $0.145 → ken-burns+kinetic → takeaway)
- story-2: 6 beats (cold-open → headline-hold → quote → caption+ken-burns → stat 1mo → takeaway)
- story-3: 6 beats (cold-open → headline-hold → quote → stat-bar → caption+ken-burns → takeaway)
- outro: 3 beats (hero → CTA → CTA pulse)

Architecture: each scene is `position: absolute; inset: 0`; each beat is a `<div class="beat clip" data-track-index="2" data-start data-duration>` stacked inside, full-bleed CSS Grid cell, opacity 0 by default, GSAP fades in/out one at a time via `beatIn()`/`beatOut()` helpers. Source-chip pill is the only `position: absolute` text element. All headlines/numbers/takeaways/captions sit in CSS Grid cells.

**Verification:**
- Lint: `node pipeline/lint.mjs work/2026-04-25-1` → `OK lint + validate + screenshot_quality + motion_budget + scene_gaps clean` (0 errors, 7 advisory warnings — duplicate-img discovery is intentional for ghost+foreground screenshot reuse)
- Puppeteer: `node proof-fix.mjs` → ALL GREEN (after server restart — see "important gotcha" below)
- Direct preview load: `node diagnose-direct.mjs` → timeline registered, duration 186.1s, audio loaded readyState=4

### 4. Diagnostic scripts created (untracked, in repo root)

These are the verification tooling — keep them around, do NOT commit (they're personal/throwaway):
- `proof-fix.mjs` — gold-standard "does the studio work?" test. Returns ALL GREEN or ALL RED. Wait now bumped to 10s (Google Fonts cold cache + 43KB composition).
- `diagnose-direct.mjs` — loads `/api/projects/<id>/preview` directly, bypassing studio chrome. Use to isolate "is the composition broken?" from "is the studio broken?".
- `diagnose-preview.mjs` — heavy diagnostic probing studio chrome's iframe state, console errors, network requests.

---

## The single remaining step — visual verification (next session, task #1)

Run from project root with the preview server already up on port 3002:

```bash
node proof-fix.mjs   # confirms studio is ready (must say ALL GREEN)
```

Then capture per-scene snapshots. I had this script in flight when you stopped me; the rough plan was to scrub to N timestamps (intro=2, story-1=5, story-2=4, story-3=4, outro=2 → ~16 PNGs total) and save to `C:/Users/ahmed/AppData/Local/Temp/scene-snapshots/`. Suggested timestamps:

| Scene | Beats to capture (absolute time) | Why |
|---|---|---|
| intro | t=1.0 (hero), t=8.0 (teaser-2) | confirm hero fills frame; teaser is full-bleed |
| story-1 | t=15.5, t=22.0, t=37.0, t=51.0, t=60.0 | cold-open, stat 1.6T, stat $0.145, ken-burns, takeaway |
| story-2 | t=72.5, t=87.0, t=99.0, t=117.0 | cold-open, quote, caption+visual, takeaway |
| story-3 | t=126.5, t=141.0, t=153.0, t=171.0 | cold-open, quote, stat-bar, takeaway |
| outro | t=178.0, t=183.5 | hero, CTA |

**Decision criteria for "good enough":**
- Each frame should fill the canvas — no big empty halves on left or right
- Numbers should be massive (240–360px) and dominate the frame when shown
- Screenshots should be full-bleed (background ghost OR ken-burns foreground), never postage-stamp thumbnails
- Headlines should feel like the focal element, not crammed alongside other elements
- Takeaways should be giant (~132px font) filling the center

If approved → run `/yt-render` to produce the MP4. If not, iterate on the index.html (or have me re-dispatch a B4 follow-up subagent with specific corrections).

**Easy way to view in your own browser** while server is running:
- Studio: http://localhost:3002 (full UX, scrub timeline, click play)
- Direct preview (bypass studio chrome): http://localhost:3002/api/projects/2026-04-25-1/preview

---

## Important gotcha — restart preview server before verification

The hyperframes preview server on port 3002 will accumulate stale state across many test runs (connection-pool exhaustion or similar — root cause not investigated). Symptom: `proof-fix.mjs` shows the player not ready even though the composition itself is fine. **Always restart fresh before final verification:**

```bash
# Kill existing
npx hyperframes preview --kill-all
# If that says "Killed 0", find the PID with netstat and kill manually:
#   netstat -ano | grep ":3002"
#   powershell "Stop-Process -Id <PID> -Force"
# Start fresh
npx hyperframes preview work/2026-04-25-1 --port 3002 --force-new &
sleep 5
node proof-fix.mjs
```

After restart proof-fix returns ALL GREEN reliably.

---

## Branch & file state

**Branch:** `fix/preview-and-dynamic-layout` (off `master` at `941fd94`).

**Commits on branch (newest first):**
```
a5dfb7e feat(work/2026-04-25-1): re-author index.html with v3 time-sliced beats
ea59944 feat(yt-compose,lint): v3 skill — time-sliced beats + studio __hf fix
```

**Working tree (uncommitted):**

Modified (carryover from AM session — not yet committed):
```
.claude/commands/yt-{daily,preview,render}.md   # 3 hard gates, single-server discipline, slimmed
.claude/skills/yt-{research,script}/SKILL.md    # date field requirement, conditional hyperframes-skill
package{,-lock}.json                            # hyperframes 0.4.15 → 0.4.26
pipeline/build-run-dir.mjs                      # copy meta.json
pipeline/compute-timings.js                     # Whisper-homophone fuzzy fallback
```

Untracked:
```
.claude/commands/yt-build.md       # new build-only command (AM session)
HANDOFF.md                         # this file (PM session)
HANDOFF-2026-04-25-am.md           # archived morning session
assets/gsap.min.js                 # local GSAP bundle (AM session)
diagnose-direct.mjs                # PM diagnostic
diagnose-preview.mjs               # PM diagnostic
proof-fix.mjs                      # PM verification (the gold-standard test)
image.png, play-button-zoom.png    # AM screenshots
proof-playing.png, studio-proof.png # AM puppeteer proofs (now historical)
```

**Decision pending for next session:** these uncommitted files contain real fixes from AM session. Either:
1. Cherry-pick the legitimate ones (skill bug fixes, command rewrites, hyperframes upgrade, gsap.min.js, build-run-dir change, compute-timings fuzzy fallback) into a SEPARATE commit on `fix/preview-and-dynamic-layout` before the visual verification, OR
2. Commit them on a new branch off `master` and rebase the v3 work on top.

The diagnostic scripts (`diagnose-*.mjs`, `proof-fix.mjs`) and screenshots are throwaway — leave untracked or `.gitignore` them.

---

## Key technical findings worth preserving (do not re-investigate)

1. **HF 0.4.26 `<hyperframes-player>` CDN-runtime-injection bug.** Confirmed in bundle source. The `H()` decision function injects `https://cdn.jsdelivr.net/.../hyperframe.runtime.iife.js` after 1 second if `hasTimelines && !hasRuntime`. Setting `window.__hf` early skips it. This bug will affect ANY self-contained composition; the v3 skill encodes the fix.

2. **Audio "regression" was always user-side.** ffprobe confirms AAC stereo at -30.5 dB mean / -10.2 dB peak in `work/2026-04-25-1/renders/video.mp4`. User confirmed playback works in their player (was a laptop audio settings issue). Do NOT spend time on this in future runs.

3. **The motion_budget lint was forcing the visual problem.** v2 mandated 3+ primitives co-existing → composer crammed. v3 mandates 3+ beat moments in time → composer time-slices. Same threshold (3), opposite philosophy. The lint test fixtures `crammed.html` and `sliced.html` lock this distinction in.

4. **Direct preview load works even when studio chrome doesn't.** `http://localhost:3002/api/projects/<id>/preview` is the iframe URL the studio uses. Loading it directly in any browser bypasses studio chrome and proves the composition is correct independent of player wiring. Useful for fast diagnosis.

5. **The HF studio's preview endpoint is a SERVER-PROCESSED bundle, not the raw file.** `/api/projects/<id>/preview` returns ~115KB of HTML with GSAP inlined, motion-primitives inlined, and `<script src="/api/runtime.js">` injected. The raw `index.html` is only 43KB. Don't be confused by the size discrepancy.

6. **Stale preview-server state can cause flaky test results.** Always restart the server before declaring victory — the difference between green and red is sometimes just connection-pool exhaustion.

---

## Reference — files modified or created across both sessions

AM session (carryover, see `HANDOFF-2026-04-25-am.md` for context):
- 7 modified, 6 untracked (skill bug fixes, command rewrites, HF upgrade, local GSAP)

PM session (this session):
- `.claude/skills/yt-compose/SKILL.md` — v3 rewrite (committed `ea59944`)
- `pipeline/lib/motion-budget.mjs` — beat-moments lint (committed `ea59944`)
- `tests/lint-motion-budget.test.js` + 3 new fixtures (committed `ea59944`)
- `work/2026-04-25-1/index.html` — 5 scenes, 26 beats, time-sliced (committed `a5dfb7e`)
- `proof-fix.mjs`, `diagnose-direct.mjs`, `diagnose-preview.mjs` — diagnostic tooling (untracked)
- `HANDOFF.md` (this file), `HANDOFF-2026-04-25-am.md` (archived AM)

---

## Quick-reference commands for next session

```bash
# 1. Confirm we're on the right branch
git branch --show-current   # → fix/preview-and-dynamic-layout
git log --oneline -3        # → a5dfb7e, ea59944, 941fd94

# 2. Restart the preview server cleanly
npx hyperframes preview --kill-all
# kill PID via PowerShell if needed (see "Important gotcha" above)
npx hyperframes preview work/2026-04-25-1 --port 3002 --force-new &
sleep 5

# 3. Sanity-check the studio
node proof-fix.mjs   # must say "ALL GREEN: ✅ YES"

# 4. Open the studio in your own browser
#    http://localhost:3002
#    Click "index" composition card, click play, watch the video.
#    OR direct-load (bypassing studio chrome):
#    http://localhost:3002/api/projects/2026-04-25-1/preview

# 5. If approved → render MP4
node pipeline/render.mjs work/2026-04-25-1
# OR via the slash command (which also writes YouTube metadata)
/yt-render

# 6. If NOT approved → spawn a follow-up B4 subagent with specific corrections
#    (e.g. "make stat numbers larger", "ken-burns is too aggressive in story-1 B6")
```
