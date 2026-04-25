# Skill evals

Harness for benchmarking the project-specific Claude Code skills (`yt-research`,
`yt-metadata`) by running each one against curated fixtures, with and without
the SKILL.md guidance, and grading mechanically.

## Layout

- `grade_runs.mjs` — runs the graders against `.claude/skills/<skill>-workspace/iteration-N/`
  output directories and writes `grading.json` per run.
- `build_benchmark.mjs` — aggregates per-eval scores into `benchmark.json` and
  emits `review.html` (a static report) plus `combined_benchmark.json`.

## Workflow

1. The eval framework (run separately) executes each fixture twice — `with_skill`
   and `without_skill` — and writes outputs under
   `.claude/skills/<skill>-workspace/iteration-N/<eval>/<condition>/outputs/`.
2. `node tools/skill-evals/grade_runs.mjs` grades every output and writes
   `grading.json` next to each run.
3. `node tools/skill-evals/build_benchmark.mjs` aggregates and renders
   `tools/skill-evals/review.html` for visual review.

Workspaces and generated reports are gitignored — re-run the harness to rebuild.

## Fixtures

Located at `.claude/skills/yt-research/evals/fixtures/`. Tracked, hand-curated;
small (~40 KB total). Two scenarios per skill validate happy path and a known
edge case (e.g. insufficient usable items).
