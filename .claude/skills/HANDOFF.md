# yt-* skills — session handoff

State on 2026-04-23. Picks up from a session that audited the four `yt-*` skills (`yt-research`, `yt-script`, `yt-compose`, `yt-metadata`), refactored them against skill-creator best practices, and ran an eval harness on the two that don't need live pipeline data.

## What changed in this session

### 1. Shared JSON validator (new)
- `pipeline/validate-json.mjs` — one script replacing the per-skill inline `node -e ...PicksFileSchema.parse...` blobs.
- Usage: `node pipeline/validate-json.mjs <schema> <file>`.
- Schemas supported: `picks`, `claims`, `storyboard`, `timings`, `items`, `screenshots-manifest` (all read from `pipeline/schemas/*.js`).

### 2. SKILL.md rewrites (Phase 1 + 2)
All four `yt-*` SKILL.md files rewritten against skill-creator best practices:
- **yt-research**: pushier description; swapped inline validator for the shared script.
- **yt-script**: made `storyboard.json` the canonical contract (yt-compose's input), with `storyboard.md` as the human-readable companion; replaced the vendored-skill path read (`.agents/skills/website-to-hyperframes/...`) with a `/hyperframes` Skill-tool invocation; shared validator.
- **yt-compose**: **removed the nonexistent `npx hyperframes validate --no-contrast` command** (hyperframes v0.4.15 only has `lint`); replaced direct-path reads of vendored hyperframes/gsap skills with Skill-tool invocations (`/hyperframes`, `/gsap`, `/hyperframes-cli`); called out `class="clip"` as the silent-failure source.
- **yt-metadata**: added `picks.json` to inputs; added the `00:00 Intro` hard rule (YouTube requirement); pushier description.

### 3. Orchestrator fix
- `.claude/commands/yt-research.md` — slash-command validator now uses `pipeline/validate-json.mjs` instead of inline `node -e`.

### 4. Eval harness (Phase 3, partial)
Evals set up for **yt-research** and **yt-metadata**. Skipped for yt-script / yt-compose — they need a real pipeline run to bench against (see "Next work" below).

Layout per skill:
```
.claude/skills/yt-research/evals/
├── evals.json              # test-case definitions (in repo)
└── fixtures/               # synthetic run-dirs the evals point at (in repo)
    ├── run-fixture-01/     # 8 items, 3 with article_text, 1 text_extraction_failed
    └── run-fixture-02/     # only 2 usable items — tests the stop-and-report rule

.claude/skills/yt-metadata/evals/
└── evals.json              # reuses run-fixture-01 as input
```

Shared tooling at `.claude/skills/` (in repo):
- `grade_runs.mjs` — reads each run's outputs, checks assertions, writes `grading.json` per run.
- `build_benchmark.mjs` — aggregates into `benchmark.json` and writes a standalone `review.html`.

Workspace directories (**gitignored**, regeneratable):
```
.claude/skills/yt-research-workspace/iteration-1/
  eval-0-.../with_skill/{outputs/, timing.json, grading.json, eval_metadata.json}
  eval-0-.../without_skill/...
  eval-1-.../...
  benchmark.json
```

### Iteration-1 results (for historical reference)
- yt-research: **9/9** with-skill vs **7/9** baseline (+22pp). Baseline fabricated a 3rd pick from a `text_extraction_failed` item on eval-1 — exactly what the skill's hard rule prevents.
- yt-metadata: **22/22** with-skill vs **13/22** baseline (+41pp). Baseline drifted on format (wrong title length, `Links:` instead of `Sources:`, hashtags, 30 tags).
- Combined **31/31 vs 20/31**, and with-skill was also *faster and cheaper* on average (stop-and-report is 3.5× faster than inventing a pick).

## How to re-run the eval harness

From the repo root:

```bash
# 1. Re-create workspace dirs (safe if they already exist)
mkdir -p .claude/skills/yt-research-workspace/iteration-1/{eval-0-normal-run-of-8-items,eval-1-insufficient-usable-items}/{with_skill,without_skill}/outputs
mkdir -p .claude/skills/yt-metadata-workspace/iteration-1/{eval-0-normal-run-writes-metadata,eval-1-casual-prompt-no-file-hints}/{with_skill,without_skill}/outputs

# 2. Re-spawn the 8 subagents (do this in a Claude Code session — see prompts in this session's history, or copy the Agent tool calls from .claude/skills/yt-*-workspace/*/eval_metadata.json prompts).
#    Save each subagent's total_tokens + duration_ms to <run_dir>/timing.json.

# 3. Grade + aggregate
node .claude/skills/grade_runs.mjs
node .claude/skills/build_benchmark.mjs

# 4. Open review.html in the browser
start .claude/skills/review.html
```

If you want to iterate on a skill and compare iteration-2 vs iteration-1, bump the directory name (`iteration-2/`) in both scripts — they currently hard-code `iteration-1`. Keep it simple: edit the `WS_R` / `WS_M` constants in each script.

## Next work ("the rest" to do later)

### A. Bench `yt-script` and `yt-compose` against a real run

Both need realistic pipeline data that's expensive to synthesize:
- **yt-script**: the claim verifier (`pipeline/verify-claims.mjs`) checks that every `supporting_quote` is a verbatim substring of the article text. Meaningful testing needs actual article bodies, not stubs.
- **yt-compose**: needs `DESIGN.md`, `storyboard.json`, `timings.json`, `screenshots-manifest.json`, and must pass `npx hyperframes lint`. Linting a synthetic composition is fine in theory but the fixture work to make a real Swiss Pulse composition validate is substantial.

**Recommended path**: Run `npx hyperframes init` and do one real `/yt-daily` (or manually step through `/yt-fetch` → `/yt-research` → `/yt-script` → `/yt-render`) to produce a complete run-dir under `work/`. Then copy that run-dir into `.claude/skills/yt-script/evals/fixtures/run-real-01/` and `.claude/skills/yt-compose/evals/fixtures/run-real-01/`, write an `evals.json` per skill mirroring the yt-research pattern, and re-use `grade_runs.mjs` + `build_benchmark.mjs` (add new grader functions).

Grader ideas:
- **yt-script**: (a) `pipeline/verify-claims.mjs <run-dir>` returns 0; (b) `validate-json.mjs claims <file>` passes; (c) `validate-json.mjs storyboard <file>` passes; (d) every `[^N]` footnote in script.md appears in SOURCES; (e) storyboard.json has exactly 5 scenes in order.
- **yt-compose**: (a) `npx hyperframes lint` returns 0; (b) every scene has `class="clip"`; (c) every scene's `data-start` / `data-duration` matches `timings.json` exactly; (d) `window.__timelines['ai-daily']` is registered; (e) no `repeat: -1`, `Math.random`, `Date.now`, `setTimeout` in scripts.

### B. Description optimization (`skill-creator`'s `run_loop.py`)

This session did execution benchmarking (does the skill produce correct output when used?) but **not** triggering benchmarking (does Claude invoke the skill when they should?). The `skill-creator/scripts/run_loop.py` script handles that, but **it requires Python 3** and this machine doesn't have Python. Options:
1. Install Python 3 (`winget install Python.Python.3.12` or similar), then run `python -m scripts.run_loop --eval-set <queries.json> --skill-path <path> --model claude-opus-4-7 --max-iterations 5 --verbose` per skill.
2. Port `run_loop.py` to Node — non-trivial but doable; it uses `claude -p` as a subprocess, not a browser.

I already rewrote the eval viewer and grader in Node because Python was absent. The description optimizer is the one script I didn't port.

### C. If iteration-2 is needed

If the iteration-1 results surface something worth fixing in the SKILL.md files, the loop is:
1. Edit the SKILL.md.
2. Bump workspace to `iteration-2/` (edit `grade_runs.mjs` and `build_benchmark.mjs` hard-coded paths).
3. Re-spawn subagents + grade + benchmark.
4. `build_benchmark.mjs` currently doesn't show iteration deltas — if you want them, add a `--previous-workspace iteration-1` flag that loads the prior `benchmark.json` for side-by-side comparison.

As of iteration-1, the skills score 31/31 so there's nothing obvious to fix yet. The real test is iteration-2 on fresh eval prompts or on the heavier skills (yt-script, yt-compose).

## Files at a glance

**In repo (committed):**
```
pipeline/validate-json.mjs                                     # shared validator
.claude/commands/yt-research.md                                # updated orchestrator
.claude/skills/yt-{research,script,compose,metadata}/SKILL.md  # rewritten skills
.claude/skills/yt-{research,metadata}/evals/                   # evals.json + fixtures
.claude/skills/{grade_runs,build_benchmark}.mjs                # re-runnable harness
.claude/skills/HANDOFF.md                                      # this doc
```

**Gitignored (regeneratable):**
```
.claude/skills/yt-{research,metadata}-workspace/               # iteration outputs
.claude/skills/review.html                                     # derived from benchmark.json
.claude/skills/combined_benchmark.json                         # same
```
