# Session Handoff — 2026-04-25

## TL;DR

Today's pipeline ran end-to-end and produced a 3:06 MP4 at `work/2026-04-25-1/renders/video.mp4`. **Three open issues remain** before we can ship the daily YouTube video:

1. **Studio play button stays disabled in the user's browser** even though puppeteer proves the composition works (race condition we partially fixed; needs final verification on the user's actual browser).
2. **Scene visual layout is broken** — images overlap text, takeaways get pushed below the fold. The composition does NOT follow YouTube best practices and needs a visual overhaul.
3. **No voiceover audible to the user when playing the MP4** — `ffprobe` confirms the audio stream is embedded (AAC, 48kHz stereo, mean -30.5dB peak -10.2dB). May be a player-side mute, OR a regression introduced by recent commits (see below).

The picks/script are good. The TTS audio is correct (8.9 MB WAV, 187s). The layout and the playback story are the blockers.

> **CRITICAL CONTEXT for the next session — this is a regression, not a new bug.** Before the `feat/visual-richness` branch was created, the pipeline was rendering MP4 with voiceover, and the visuals were acceptable. The branch was supposed to **only improve visuals**. After it merged (and after follow-on commits on master), today's run produces a video the user reports as having no voiceover and broken layout. **Treat this as a git-history investigation first**, not a redesign. The next session's first action should be a git bisect to find the commit that introduced each regression — DO NOT rewrite anything before understanding what changed. See "Open issue 0 — Git history investigation" below.

---

## What we built today

### 1. Pipeline architecture: split build/preview/render with hard gates

Was: `/yt-render` ran TTS → transcribe → timings → screenshots → compose → lint → MP4 → metadata in one shot. No way to preview the HTML composition before paying for the MP4 render.

Now:
- `/yt-build` (new) — runs everything through `index.html` + lint clean, **stops**.
- `/yt-preview` — kills all prior preview servers, opens the studio on deterministic port 3002.
- `/yt-render` (slimmed) — renders MP4 + writes metadata. Refuses to run if `index.html` is missing.
- `/yt-daily` — orchestrates with **3 mandatory gates**: script, visual (browser preview), MP4. Cannot chain past a gate without explicit user approval.

Files: `.claude/commands/yt-{build,preview,render,daily}.md`.

### 2. Schema-doc / skill bug fixes

| Bug | Where | Fix |
|---|---|---|
| `picks.json` schema requires top-level `date` field but skill never documented it | `.claude/skills/yt-research/SKILL.md` | Added explicit JSON skeleton with `date` field; instruction to derive from run-dir name |
| `/yt-script` told agent to invoke `/hyperframes` skill that isn't installed locally | `.claude/skills/yt-script/SKILL.md` | Made invocation conditional on skill being in available-skills list; added fallback to `DESIGN.md` + `npx hyperframes docs` |
| `meta.json` not copied to run-dir; studio cannot identify project without it | `pipeline/build-run-dir.mjs` | Added `meta.json` to always-copy list with comment |
| Audio element with `class="clip"` silently breaks studio runtime visibility manager | `.claude/skills/yt-compose/SKILL.md` | Added explicit rule with quote from HF docs and consequence (disabled play button) |
| `../../assets/...` paths escape the studio's run-dir sandbox → 404 → black screen | `.claude/skills/yt-compose/SKILL.md` | Rewrote path rule: must be relative to run-dir, never `../` escapes |
| Hyperframes 0.4.15 shipped buggy studio runtime (esbuild error on `runtime/entry.ts`) | `package.json` | Upgraded to 0.4.26 via `npm install hyperframes@latest` |
| GSAP CDN load could exceed studio's 5-second polling budget → silent timeline-detection timeout → permanently disabled play button | `assets/gsap.min.js` (new) + `.claude/skills/yt-compose/SKILL.md` | Bundled GSAP locally; skill rule now requires `<script src="assets/gsap.min.js">` (NOT a CDN URL) |
| Whisper homophones (e.g., "Holley" → "Holly") crashed `compute-timings.js` with no recovery | `pipeline/compute-timings.js` | Added 2-of-3-token fuzzy fallback for the first word of each section; logs a warning when it fires |
| `/yt-preview` left old preview servers running on different ports | `.claude/commands/yt-preview.md` | Always `--kill-all` first, sweep Windows `netstat` for orphan PIDs on 3002–3010, start fresh on port 3002 with `--force-new` |

### 3. Today's run artifacts (`work/2026-04-25-1/`)

```
items.json              # 48 items fetched
picks.json              # 3 picks: DeepSeek V4, GPT-5.5, Mythos × Firefox
script.md               # 590 words, 25 footnotes
claims.json             # 25 claims, all verified verbatim
storyboard.json/md      # 5 scenes
narration.wav           # 8.9 MB, 187s
transcript.json         # 565 words, Whisper word-level timings
timings.json            # 5 scenes butt-joined
screenshots-manifest.json  # 3 OG-image fallbacks (source pages timed out)
index.html              # composition: 5 scenes + audio + master GSAP timeline
renders/video.mp4       # 18.1 MB, 3:06, AAC audio embedded
```

Lint: `0 errors, 0 warnings, 99 contrast warnings` (contrast warnings are advisory). Validate: no console errors in headless Chrome. Claims: 25/25 verified.

---

## Open issue 0 — Git history investigation (DO THIS FIRST)

The user's testimony is the single most important fact in this handoff: **the pipeline was working end-to-end before the recent visual-improvements work**. MP4 rendered, voiceover played, layout was good enough to ship. The intent of the branch was visual improvement only — anything else that broke is a regression.

### Last known-good baseline

| Marker | Commit | Notes |
|---|---|---|
| Last known-good merge | `4e8e99c` Merge feat/screenshot-quality (Plan A) | Before the visual-richness branch was created. Pipeline shipped MP4 with voiceover at this point per user. |
| Visual-richness merge | `f668fde` Merge feat/visual-richness (Plan B): Fireship-leaning motion design system | This is where the regressions were almost certainly introduced. |
| HEAD as of this session | `941fd94` test+refactor(pipeline): extract narration lib, add 19 tests | + 10 modified files + 7 untracked, all from today's session — see "Files modified this session" at bottom. |

**Commit counts in scope:**
- `git log --oneline 4e8e99c..HEAD` → **27 commits** since the last known-good baseline.
- 11 of those commits are inside the merged `feat/visual-richness` branch.
- 14 follow-on fix commits on `master` after the merge — most are reactive fixes to problems the merge introduced.
- 10 modified + 7 untracked files in the working tree from today's session (NOT yet committed).

The user mentioned "~80 commits" — the actual count is closer to 27, but the principle holds: a lot of change in a short window, all under a "visuals only" framing.

### The 11 commits inside `feat/visual-richness` (the merge that likely broke things)

In merge order:

```
500d194 feat(setup): install + wire whisper-cpp for transcription
e58f7b2 feat(setup): detect whisper-cli, fail with install pointer if missing
b7e16e1 feat(schemas): add Emphasis + emphases[] to TimingsFile
f7b9f5c feat(pipeline): extract-keywords selects emphasis words per scene
dd62e11 feat(pipeline): extract-keywords CLI wrapper, writes timings.emphases
a601719 deps(hyperframes): install cinematic-zoom and sdf-iris shader transitions   ← suspect for black-render + audio routing
dbbf4a2 feat(assets): motion-primitives.css — base styles for 7 primitives
948a17f feat(assets): motion-primitives.js — kinetic, count-up, scroll, statbar, caption registrars
f53b553 feat(yt-compose): rewrite skill to v2 with motion-primitives contract       ← rewrote the COMPOSITION authoring rules
5b76bd1 feat(lint): motion_budget rule — story scenes need >=3 of 5 primitives      ← may be FORCING visual overload
6e2dff5 docs(design): add Motion section documenting the 7 primitives + budget
```

### The 14 follow-on fix commits on master (most are reactive)

```
e7b9312 fix(transcribe): use --dir not --output (hyperframes CLI doesn't accept --output)
53b10f3 fix(compute-timings): apostrophe-tolerant section alignment
fc424e9 fix(skill/yt-compose): correct timeline registration order and inline IIFE rule (I-1, I-2)
a8aface fix(motion-primitives): add hard tl.set kill at caption end (M-2)
df3b175 feat(lint): add scene_gaps lint rule for track-1 butt-join validation (I-5)
39ad8fd fix(skill/yt-script): enforce primary source domain for source_chip beats (I-4, M-3)
e6380c6 fix(skill/yt-compose): forbid shader-transition sub-comps (cause black render)   ← AUDIO-ONLY RENDER bug — directly relevant to voiceover-but-no-video reports, may also point at audio mixing path
e9ed4b5 chore(compositions): captions.html updated by hyperframes studio bundler
577f66c docs: track 2026-04-24 handoff + lazy-fetch-pipeline plan                   ← see docs/HANDOFF-2026-04-24.md for what was already known yesterday
879afeb chore(oss): add MIT LICENSE, sweep personal paths, drop broken validate script
0344fcd chore(repo): untrack dev artifacts; gitignore docs/
774d0da refactor(pipeline): rename setup→doctor; centralize whisper path; root-relative loadConfig
7f440ba chore(oss): add CI workflow, .nvmrc, .editorconfig, SECURITY.md; expand .gitignore
5c57cec docs(readme): rewrite for OSS launch
941fd94 test+refactor(pipeline): extract narration lib, add 19 tests, cwd-safe schemas test
```

The pattern of "fix(skill/yt-compose)", "fix(motion-primitives)", "fix(transcribe)" right after the merge suggests the merge introduced multiple cascading bugs, each of which was patched individually rather than reverting and rethinking. The bisection strategy below is to find which patches are still incomplete.

### Bisection strategy for next session

Two regressions to bisect independently. **Do NOT bisect both at once.**

#### Regression A: voiceover missing in MP4

The audio stream IS in the MP4 (ffprobe confirms 187s of AAC stereo at -30.5dB mean). User reports no voiceover when playing. Two hypotheses, both bisectable:

1. **Player-side**: the user's player is muted or can't decode this AAC. **Verify first by playing `work/2026-04-25-1/narration.wav` and `work/2026-04-25-1/renders/video.mp4` in VLC.** If both play voiceover → not a regression, just a player issue. Stop here.

2. **Pipeline-side regression**: an earlier-commit MP4 had clearly-audible voiceover, today's doesn't. To bisect:

```bash
# 1. Save today's MP4 outside the worktree as "current.mp4"
cp work/2026-04-25-1/renders/video.mp4 ../current.mp4

# 2. Check out the last known-good commit
git stash push -m "session-2026-04-25 wip"   # save uncommitted work
git checkout 4e8e99c                          # last known-good

# 3. Re-run the full pipeline (this requires earlier-version skills, so reset run-dir)
node pipeline/build-narration-text.mjs work/2026-04-25-1
node pipeline/tts.mjs work/2026-04-25-1
node pipeline/transcribe.mjs work/2026-04-25-1
node pipeline/compute-timings.mjs work/2026-04-25-1
node pipeline/capture-screenshots.mjs work/2026-04-25-1
node pipeline/build-run-dir.mjs work/2026-04-25-1
# (need to re-author index.html using the OLD yt-compose skill that existed at 4e8e99c)
node pipeline/render.mjs work/2026-04-25-1
cp work/2026-04-25-1/renders/video.mp4 ../baseline.mp4

# 4. Compare audio streams
ffmpeg -i ../baseline.mp4 -vn -c:a copy ../baseline-audio.aac
ffmpeg -i ../current.mp4  -vn -c:a copy ../current-audio.aac
ffmpeg -i ../baseline-audio.aac -af volumedetect -f null - 2>&1 | grep -E "mean|max"
ffmpeg -i ../current-audio.aac  -af volumedetect -f null - 2>&1 | grep -E "mean|max"

# If baseline plays voiceover and current doesn't → bisect
git bisect start
git bisect bad HEAD                # current is bad
git bisect good 4e8e99c            # last known-good is good
# git will pick midpoints; for each one, re-run pipeline + listen to MP4 → mark good/bad
```

Particular suspect commits for audio:
- `e6380c6 fix(skill/yt-compose): forbid shader-transition sub-comps (cause black render)` — the commit message LITERALLY says shader transitions caused render to be silent (visuals black, audio only) or mixed wrong. The fix forbade their use, but did the fix include actually removing them from any prior compositions? Did it confirm audio routing is unaffected?
- `a601719 deps(hyperframes): install cinematic-zoom and sdf-iris shader transitions` — installed the shaders that `e6380c6` then forbade. If they're still in `compositions/` and get loaded by accident, render could break.
- `e7b9312 fix(transcribe): use --dir not --output` — if transcription is broken, timings are wrong, audio mixing might end up offset. Check.

#### Regression B: visual layout broken (overlap, bottom drift, "too much")

The user says BEFORE the visual-richness work, the visuals were good enough to ship. The visual-richness merge introduced motion-primitives + motion_budget lint (story scenes MUST have ≥3 of 5 primitives — this lint is now FORCING the agent to put more elements on screen, contributing to "too much").

To investigate without bisect:
1. Check out `4e8e99c` and look at the `yt-compose` skill that existed then (`git show 4e8e99c:.claude/skills/yt-compose/SKILL.md`). Compare layout philosophy to today's v2.
2. Look at the merge commit `f668fde` — the diff shows EXACTLY what was added to the composition rules. The motion-primitives + budget rule are the most likely "force more elements on screen" cause.
3. Find a pre-merge run-dir if one exists in the user's local file history (or git stash, or .worktrees/). If there's a still-rendered MP4 from a pre-merge run, watch it and compare to today's MP4 directly. The visual delta is the regression.

Particular suspects:
- `5b76bd1 feat(lint): motion_budget rule — story scenes need >=3 of 5 primitives` — mandates ≥3 motion primitives per story scene. Removing or relaxing this lint may fix "too much" immediately.
- `f53b553 feat(yt-compose): rewrite skill to v2 with motion-primitives contract` — this is the rewrite that set the new visual rules. The pre-rewrite skill was simpler.
- `dbbf4a2 feat(assets): motion-primitives.css` — ScrollFrame/StatBar/CaptionLine baseline styles. Look at `.scroll-frame` (1200×540, 6px outline), which forces a large image element that competes with text. Today's `index.html` uses 720×360 to fit, but the principle stands.

### Files most worth diffing against `4e8e99c`

```bash
git diff 4e8e99c..HEAD -- .claude/skills/yt-compose/SKILL.md
git diff 4e8e99c..HEAD -- pipeline/render.mjs
git diff 4e8e99c..HEAD -- pipeline/tts.mjs
git diff 4e8e99c..HEAD -- pipeline/transcribe.mjs
git diff 4e8e99c..HEAD -- pipeline/build-run-dir.mjs
git diff 4e8e99c..HEAD -- assets/
git diff 4e8e99c..HEAD -- pipeline/lint.mjs
git diff 4e8e99c..HEAD -- pipeline/lib/motion-budget.mjs
```

### Uncommitted changes from this session that need git-aware handling

These are NOT yet on master and should be reviewed/committed/reverted as part of the investigation:

```
modified:
  .claude/commands/yt-daily.md      (3 hard gates)
  .claude/commands/yt-preview.md    (single-server discipline + diagnostic)
  .claude/commands/yt-render.md     (slimmed to MP4 + metadata)
  .claude/skills/yt-compose/SKILL.md (audio-no-clip + path + GSAP-local rules)
  .claude/skills/yt-research/SKILL.md (date field requirement)
  .claude/skills/yt-script/SKILL.md (conditional hyperframes-skill invoke)
  package-lock.json                 (hyperframes 0.4.15 → 0.4.26)
  package.json                      (hyperframes 0.4.15 → 0.4.26)
  pipeline/build-run-dir.mjs        (copy meta.json)
  pipeline/compute-timings.js       (Whisper-homophone fuzzy fallback)

untracked:
  .claude/commands/yt-build.md      (NEW command for build-only)
  HANDOFF.md                        (this file)
  assets/gsap.min.js                (NEW — local GSAP bundle, 72KB)
  image.png                         (user-provided screenshot of broken state)
  play-button-zoom.png              (puppeteer crop)
  proof-playing.png                 (puppeteer proof of working studio)
  studio-proof.png                  (puppeteer proof of intro render)
```

Decisions for next session:
- Keep all of these (they fix real bugs we found and documented).
- Or revert some if they conflict with the cleaner pre-visual-richness baseline.
- Either way, **commit them on a feature branch** so the bisection above isn't polluted by uncommitted state.

### Reference: yesterday's handoff

`docs/HANDOFF-2026-04-24.md` (committed at `577f66c`) is the prior handoff. Skim it first — it documents what was already known/working/broken yesterday. Some issues raised today may already have been observed and partially addressed there.

### What good would look like at end of next session

A two-line `git log` annotation:

```
<sha-A> fix(audio): voiceover regression introduced in <sha-X>, root cause was <Y>
<sha-B> fix(layout): visual overload introduced in <sha-X>, motion_budget too aggressive — relaxed to <Z>
```

Until you can write those two lines, the work isn't done. **Don't add more layout polish or studio fixes on top of an unidentified regression** — that's how the previous 14 reactive fix commits piled up after `f668fde`.

---

## Open issue 1 — Studio play button still disabled in user's browser

### Status

- **Puppeteer confirms it works** for me: after clicking "index" and waiting 12 seconds, the play button enables, click → "Pause" + duration advances 0:00 → 0:03. Screenshot saved at `proof-playing.png`.
- **User's browser (Chrome + incognito + alternate browser) all show disabled** even after refresh.
- The MP4 renders fine, so this is purely a studio-preview-UX problem, not a render problem.

### What we know about the gate

From bundle disassembly of `node_modules/hyperframes/dist/studio/assets/index-CAscydDF.js`:

```js
const c = Me(R => R.timelineReady);  // Zustand
// ...
disabled: !c
```

`timelineReady` flips to `true` when the studio's polling loop:
1. Reads `iframe.contentWindow.__timelines`
2. Finds a key matching the iframe's root `[data-composition-id]` attr
3. That timeline's `.duration()` returns > 0

Polling: **25 attempts × 200ms = 5-second budget**. After timeout, the only output is `console.warn("Could not find __player, __timeline, or...")` and the button stays disabled forever.

### What we changed

Bundled GSAP locally at `assets/gsap.min.js`, swapped `<script src="cdn.jsdelivr.net/.../gsap.min.js">` → `<script src="assets/gsap.min.js">` in today's `index.html`. This eliminates one CDN race-condition source. **Not yet verified on the user's actual browser** — they need to hard-refresh and check.

### Diagnostic step for next session

If still disabled, open DevTools Console (F12) on http://localhost:3002 with the index composition selected and look for:
- `[useTimelinePlayer] Could not find __player, __timeline, or __timelines after 25 attempts` — polling timed out (still has a slow-load issue)
- `[useTimelinePlayer] Could not get playback adapter (cross-origin)` — iframe CORS / sandbox issue
- Any `runtime_script_error` from `hf-preview` postMessages

Also verify the iframe state directly via the Console:
```js
document.querySelector('hyperframes-player')._ready
document.querySelector('hyperframes-player')._duration
```

If `_ready` is true and `_duration` is 186.93 but the play button is still disabled → the React Zustand store didn't get updated. That points to a separate bug in the studio's polling vs the player element's polling. Two pieces of code, two state machines, both run in parallel and don't agree.

---

## Open issue 2 — Scenes look terrible; need a YouTube-best-practices visual overhaul

### Symptoms reported by user

- "Sometimes the image gets on top of the text"
- "Sometimes the text goes to the bottom"
- "The video is too much" (visually overloaded)

### Likely root causes (need to verify by watching MP4 + opening studio with index)

The current `work/2026-04-25-1/index.html` uses absolute positioning for scene elements (story-num bottom-left via `.story .takeaway-block { position: absolute; left: 120px; bottom: 80px }`, screenshots top-right via `.story .frame-wrap { position: absolute; right: 120px; top: 360px }`, source-chip bottom-right) AND a flow layout for the headline + number-row. With the screenshot at 720×360 outlined in 6px accent, the frame collides with:
- The number-row (3 large stat callouts) which is a flex row pushing right
- The compare-row text underneath
- The takeaway-block which is `position: absolute; bottom: 80px` and may overlap the compare-row depending on natural flow height

This is exactly the kind of layout bug that `position: absolute` mixed with flow content causes. The composition needs to be redesigned with a **CSS grid** layout per scene that explicitly places each element in a grid cell, so nothing can collide.

### YouTube best practices NOT followed (analyze and fix)

1. **No safe area** — YouTube cropping on mobile/embed players cuts ~5% off each edge; current 120px horizontal padding is fine, but text right against the 80px top/bottom is risky.
2. **Too many simultaneous elements** — story scenes show story_num + headline + screenshot + 3 number_callouts + compare_row + takeaway + source_chip all at once. YouTube best practice is **one focal point per beat**, with elements entering/exiting in time with the narration.
3. **Screenshot is too small for the audience to read** — 720×360 in a 1920×1080 frame; most viewers won't be able to read article text at that crop size. Either go full-bleed for 1.5–2 seconds and pan across, or replace with a synthesized "headline card" graphic that's actually readable.
4. **No motion punctuation aligned to spoken stress words** — the kinetic-typography primitive is wired up but the storyboard only emphasizes 1-2 words per scene; great YouTube videos hit the audio rhythm with visual emphasis on EVERY pivotal word (numbers, brand names, verbs).
5. **The dollar callouts (`$0.145`) format weirdly** — the count-up renders raw decimal; YouTube viewers parse "$0.15" or "$1.45" much faster than "$0.145".
6. **No section "rest beats"** — the video is wall-to-wall narration with no pauses for the viewer to absorb; YouTube retention drops sharply when there's no breathing room.

### Recommendation for next session

1. Watch the MP4 end-to-end and screenshot every scene where overlap occurs.
2. Open `proof-playing.png` (the puppeteer capture of the intro) — it actually looks OK because the intro is simpler. The story scenes are where the failure happens.
3. Spawn the `frontend-design:frontend-design` skill to redesign the storyboard with a CSS grid per scene, explicit cells for [number, headline, supporting visual, takeaway], and one element animating in at a time aligned to TTS stress words.
4. Update the `yt-compose` SKILL.md to enforce CSS grid layouts (no `position: absolute` for scene content) and a "one focal element per beat" rule.
5. Consider redesigning at the **storyboard** level, not just CSS — the storyboard should explicitly say what's on screen at each second, so the composer can't render six things at once.

### Reference materials to fetch

- https://hyperframes.heygen.com/llms.txt (canonical docs index)
- The HF registry has examples like `swiss-grid`, `vignelli`, `nyt-graph` that may demonstrate cleaner layouts: scaffold them with `npx hyperframes init --example <name>` to see working code (we tried `video-edit` — not in registry — but `swiss-grid` and `nyt-graph` should exist).
- YouTube creator handbook on motion graphics: "one idea per shot", "3-second hold rule", "viewer reading speed = 4 words/second max for on-screen text".

---

## Open issue 3 — User reports no voiceover in MP4; ffprobe says audio is there

### Confirmed facts

```
ffprobe -show_entries stream=index,codec_type,codec_name,duration,channels,sample_rate
  -of compact work/2026-04-25-1/renders/video.mp4

stream|index=0|codec_name=h264|codec_type=video|duration=186.933
stream|index=1|codec_name=aac |codec_type=audio|duration=186.922|channels=2|sample_rate=48000

ffmpeg ... -af volumedetect:
  n_samples: 17,944,576
  mean_volume: -30.5 dB   ← normal speech loudness
  max_volume:  -10.2 dB   ← speech peaks
```

Audio stream is embedded, full duration, real speech levels. Not silent.

### Likely user-side causes (verify next session)

1. **Player is muted** — Windows default video player or browser tab may be muted. Right-click MP4 → Open with VLC → check volume slider.
2. **Audio device output wrong** — system playing audio to disconnected/headphones.
3. **Codec issue on user's machine** — if their player can't decode AAC for some reason. Workaround: re-encode to a more universal codec.

### Possible pipeline bug to rule out

The narration.wav file is 8.9 MB at 187s. Sanity check next session: play `work/2026-04-25-1/narration.wav` directly. If THAT plays voiceover, the TTS step is fine and the issue is downstream (in render). If THAT is silent, the TTS step is producing silent audio.

If TTS is fine but MP4 is silent on user's player but real on ffprobe, we may need to re-encode with `-c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart` for maximum compatibility, OR use `-c:a libmp3lame -b:a 192k` and rename to .mp4 (still works in most players).

The `pipeline/render.mjs` calls `npx hyperframes render --quality <q> --fps <f> --output renders/video.mp4`. Audio mixing is handled by hyperframes' renderer. We did NOT pass an explicit audio codec flag; whatever HF's default does, it produced AAC stereo at 48kHz which IS standard.

---

## Decisions still pending from user

- [ ] Does the MP4 actually have voiceover when played in VLC? (Confirms whether issue is player-side or pipeline-side.)
- [ ] After the layout overhaul, approve the script for `2026-04-25-1` or trash and refetch?
- [ ] Approve a visual style direction for the redesign — pick one of: HF registry block (swiss-grid / nyt-graph / vignelli) as a base, OR custom design from scratch.

---

## Quick-reference commands

```bash
# Check what's in the current run dir
RUN=$(cat .last-run); ls "$RUN/"

# Play MP4 in VLC (verifies audio is real)
vlc "$RUN/renders/video.mp4"

# Restart studio cleanly (single port, single server)
npx hyperframes preview --kill-all && npx hyperframes preview "$RUN" --port 3002 --force-new

# Verify the live studio play button state via puppeteer
node -e "/* see proof scripts in this conversation */"

# Re-render MP4 only (after composition edits)
node pipeline/render.mjs "$RUN"

# Re-build everything from script onward (after script edits)
# (This regenerates audio, timings, screenshots, recomposes index.html)
node pipeline/build-narration-text.mjs "$RUN"
node pipeline/tts.mjs "$RUN"
node pipeline/transcribe.mjs "$RUN"
node pipeline/compute-timings.mjs "$RUN"
node pipeline/capture-screenshots.mjs "$RUN"
node pipeline/build-run-dir.mjs "$RUN"
# then: invoke yt-compose skill to rewrite index.html
node pipeline/lint.mjs "$RUN"
```

---

## Files modified or created this session

- `.claude/commands/yt-build.md` (new)
- `.claude/commands/yt-preview.md` (rewritten — single-server discipline + diagnostic checklist)
- `.claude/commands/yt-render.md` (slimmed — MP4 + metadata only)
- `.claude/commands/yt-daily.md` (rewritten — 3 hard gates with mandatory visual preview)
- `.claude/skills/yt-research/SKILL.md` (added `date` field requirement to picks.json schema doc)
- `.claude/skills/yt-script/SKILL.md` (made hyperframes-skill invocation conditional)
- `.claude/skills/yt-compose/SKILL.md` (added: audio-no-clip rule, root-relative path rule, local-GSAP rule, meta.json check)
- `pipeline/compute-timings.js` (added Whisper-homophone fuzzy fallback)
- `pipeline/build-run-dir.mjs` (added `meta.json` to copy list)
- `assets/gsap.min.js` (new — 72 KB local bundle)
- `package.json` (`hyperframes`: 0.4.15 → 0.4.26)
- `package-lock.json` (npm dependency update)
- `work/2026-04-25-1/` (full pipeline output)
- `proof-playing.png` (screenshot of working studio at t=0:03)
- `studio-proof.png` (screenshot of working studio intro)
- `play-button-zoom.png` (cropped play-button area screenshot)
- `HANDOFF.md` (this file)
