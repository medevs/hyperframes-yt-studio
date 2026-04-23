# AI Daily — YouTube News Automation (v1 Design)

**Date:** 2026-04-23
**Status:** Revision 2 — incorporates reviewer feedback (Chromium strategy, JS-rendered article fetching, screenshot legal posture, preflight setup, loudness normalization, schema validation, run-ID, broadened claims normalization)
**Scope:** v1 — produce one publishable 3–5 minute daily AI/tech news video end-to-end, manually triggered. Daily cadence is v2.

## Summary

A Claude Code-driven pipeline that turns fresh AI/tech news into a 3–5 minute faceless video (slides + animation + voiceover) with two human approval gates and an automated fact-checking gate. Claude Code is the orchestration layer, invoking skills for LLM-heavy stages and plain Node scripts for deterministic stages.

## Decisions (locked)

| Area | Decision |
| --- | --- |
| Niche | AI/tech news |
| Format | Daily 3–5 min recap, 3 stories per video |
| Differentiation angle | **Builder-focused** — every story answers "what does this mean for people shipping AI products?" |
| Approval gates | Two: script-text review (before render) + final MP4 review (before approve) |
| Fact-check | Automated `claims.json` verification — render blocked if any claim's quote is not found verbatim in its source |
| Agent | Claude Code via skills + slash commands |
| Sources | RSS (TechCrunch AI, The Verge, Ars Technica, MIT Tech Review) + Hacker News (AI-keyword-filtered, min_points threshold) + company blogs (OpenAI, Anthropic, Google DeepMind, Meta AI) |
| Visuals layer | Hyperframes (HTML/CSS → MP4, native audio sync) |
| Slide style | News-ticker style (story numbers, colorful headers, lower-third captions, screenshots with callouts) |
| Image sourcing | Hybrid: Puppeteer screenshot of source article → fallback to text-only card on failure |
| TTS | Edge TTS primary (free, Aria Neural voice), Piper fallback (local, free, auto-fallback on Edge failure) |
| Upload | Manual — system outputs MP4 + metadata.txt + thumbnail.png; user uploads via YouTube Studio |
| Approval UX | Local folder + Claude Code terminal prompts |
| v1 scope | **Single video end-to-end, manually triggered.** No cross-day dedup, no scheduling, no "nothing worth covering today" logic. |

## Risks accepted knowingly

- **Edge TTS is unofficial.** Microsoft may break it. Mitigated by auto-fallback to local Piper.
- **Hyperframes is v0.x, ~6 weeks old, single-vendor.** Active development and star count suggest traction; acceptable bet for a v1 side project.
- **AI news is a crowded niche.** Differentiation strategy (builder-focused angle) is unproven. Re-evaluate after 5–10 videos.

## Architecture

### Directory layout

```
studio/
├── .claude/
│   ├── skills/                    # LLM-heavy work
│   │   ├── yt-research/           # Rank & pick 3 stories
│   │   ├── yt-script/             # Write script + claims.json
│   │   └── yt-metadata/           # Generate title / description / tags
│   └── commands/                  # Thin slash-command orchestrators
│       ├── yt-daily.md            # End-to-end pipeline
│       ├── yt-fetch.md
│       ├── yt-research.md
│       ├── yt-script.md           # Stops for script approval
│       ├── yt-render.md           # Stops for MP4 approval
│       └── yt-approve.md
├── pipeline/                      # Plain Node scripts (deterministic)
│   ├── setup.mjs                  # Preflight: verify all external deps callable
│   ├── fetch-sources.mjs
│   ├── verify-claims.mjs
│   ├── tts.mjs                    # Pluggable: edge | piper | google
│   ├── normalize-audio.mjs        # ffmpeg loudnorm → -14 LUFS
│   ├── build-composition.mjs
│   ├── render.mjs
│   ├── scrapers/                  # Isolated subdir — own package.json + Puppeteer
│   │   ├── package.json
│   │   ├── capture-screenshots.mjs
│   │   └── fetch-article-text.mjs # JS-rendered fetch for configured domains
│   ├── schemas/                   # Zod schemas per artifact
│   │   ├── items.js
│   │   ├── picks.js
│   │   ├── claims.js
│   │   └── timings.js
│   └── lib/
│       ├── sources.js
│       ├── dedup.js
│       ├── run-id.js              # Assigns work/<date>-<run>/ and manages lock file
│       └── normalize-text.js      # Shared normalization (NFKC, dashes, NBSP, entities)
├── templates/                     # Hyperframes HTML/CSS
│   ├── intro.html
│   ├── story-card.html
│   ├── story-card-text-fallback.html
│   ├── outro.html
│   └── thumbnail.html
├── work/<YYYY-MM-DD>-<run>/       # Per-run working dir (run = monotonic, 1, 2, ...)
├── ready-to-upload/<YYYY-MM-DD>-<run>/
├── archive/<YYYY-MM-DD>-<run>/
├── config.json
├── package.json
└── docs/superpowers/specs/
```

### Stage flow

```
setup.mjs                →  preflight check (run once per machine, not per video)
         ↓
fetch-sources.mjs        →  items.json + articles/<id>.txt
  (per-domain strategy: JS-rendered via Puppeteer for openai.com, anthropic.com,
   deepmind.google, ai.meta.com; plain HTTP + Readability for everything else)
         ↓
/yt-research             →  picks.json                          (LLM)
         ↓
/yt-script               →  script.md + claims.json             (LLM)
         ↓
verify-claims.mjs        →  claims-verified.json   [BLOCKS IF ANY FAIL]
         ↓
[GATE 1 — USER APPROVES SCRIPT TEXT]
         ↓
tts.mjs                  →  voiceover-raw.mp3 + timings.json
         ↓
normalize-audio.mjs      →  voiceover.mp3 (-14 LUFS integrated)
         ↓
capture-screenshots.mjs  →  screenshots/ (cropped + annotated + text fallbacks)
         ↓
build-composition.mjs    →  composition.html
         ↓
render.mjs               →  video.mp4 + thumbnail.png
         ↓
/yt-metadata             →  metadata.txt                        (LLM)
         ↓
[GATE 2 — USER APPROVES FINAL MP4]
         ↓
/yt-approve              →  moves work/<date>-<run>/ to ready-to-upload/<date>-<run>/
         ↓
[USER MANUALLY UPLOADS TO YOUTUBE STUDIO]
```

### Critical ordering constraint

`tts.mjs` runs **before** `build-composition.mjs`. Slide `data-start` / `data-duration` values are computed from measured audio paragraph durations in `timings.json`, not from the script's `target_duration_sec` frontmatter. This prevents slide / audio drift.

### Chromium / Puppeteer strategy (Windows-safe)

Hyperframes bundles its own Chromium for rendering. The pipeline also needs Puppeteer for (a) screenshot capture and (b) JS-rendered article-text fetching on company blogs. To avoid Chromium version conflicts and `PUPPETEER_EXECUTABLE_PATH` headaches on Windows:

- **Isolate Puppeteer in `pipeline/scrapers/`** as its own npm package with its own `package.json` and `node_modules`. Puppeteer's bundled Chromium lives there, pinned.
- **Root `package.json`** owns Hyperframes (which manages its own Chromium via its own logic). No Puppeteer dep at the root.
- **Parent-of-root `package.json`** is never added. Two separate `node_modules` trees — one per tool — is the whole point.
- Both `capture-screenshots.mjs` and `fetch-article-text.mjs` live in `pipeline/scrapers/` and share the single Puppeteer install.
- Invoked from the root pipeline via `child_process.spawn('node', ['pipeline/scrapers/capture-screenshots.mjs', ...], { cwd: 'pipeline/scrapers', shell: false })` — directly, not through `npx`, to avoid Windows `.cmd` shim issues.

### Company-blog article-text strategy

Plain HTTP + `@mozilla/readability` fails on React-rendered blogs (OpenAI, Anthropic, etc.) — returns nav chrome or empty text. Without article text, `yt-script` paraphrases from summaries → claims-check fails → render blocked. This is the single most likely silent failure mode at v1.

Fix: `fetch-sources.mjs` uses per-domain fetch strategy:
- **JS-rendered domains** (configured list in `config.json`: `openai.com`, `anthropic.com`, `deepmind.google`, `ai.meta.com`, `blog.google`): spawn `pipeline/scrapers/fetch-article-text.mjs` which uses Puppeteer's networkIdle2 wait, then extracts via Readability on the rendered DOM.
- **Everything else**: plain `fetch()` + Readability on raw HTML.

Per-item article-text length check: if extracted text is <500 chars, mark item as `text_extraction_failed: true` in `items.json`. Research skill must skip such items (filter, don't pick them).

### Screenshot legal posture

Full-frame screenshots of third-party articles in a monetized video invite Content ID / manual claims. Mitigation baked into `capture-screenshots.mjs`:
- **Crop** to hero area: top 1200×400 strip (headline + opening paragraph). No full article body captured.
- **Annotate overlay**: bottom 60px band added at render time with source attribution ("Source: techcrunch.com") and a channel-accent-color stripe.
- This converts raw screenshots into editorial commentary fair-use posture: small portion, transformative framing, clear attribution.
- Annotation is applied in the Hyperframes composition via CSS overlay on the `story-card.html` template — not baked into the PNG file — so it stays editable.

## Components

### Skills

**`yt-research`**
- Input: `items.json` (all fetched items).
- Output: `picks.json` — top 3 picks with `rank`, `item_id`, `angle`, `rationale`, `suggested_visuals`, `risk_flags`, plus a `rejected[]` array with per-item reasons.
- Ranking criterion: newsworthiness for a builder-focused AI/tech audience (what ships, what breaks, what changes how people build).
- Must set `risk_flags` for rumor-only, single-source, or unverifiable claims.

**`yt-script`**
- Input: `picks.json` + full article text per pick (from the fetch stage's article cache).
- Output: `script.md` (frontmatter + sectioned narration with `[^N]` footnotes) and `claims.json` (each claim paired with an exact verbatim supporting quote from the source).
- Hard rule in the skill prompt: **no claim may appear that is not directly supported by a quote from a fetched source.** If unsupportable, omit rather than paraphrase.
- Tone: builder-focused, skeptical when warranted, no hype, no clickbait.

**`yt-metadata`**
- Input: `script.md`, `picks.json`, `timings.json`.
- Output: `metadata.txt` — title (~60 chars, specific not clickbaity), description with chapter timestamps computed from `timings.json` + source links, tags.

### Deterministic Node scripts

**`setup.mjs`** — Preflight check run once per machine (not per video). Verifies Node version ≥22, Python available (for `edge-tts`), `edge-tts` package importable, Piper binary on PATH with a voice model cached, `npx hyperframes --version` succeeds, `pipeline/scrapers/node_modules` populated, ffmpeg on PATH, output directories writable. Prints a clear per-dep pass/fail table. Exit nonzero if anything fails. First-run discovery of missing deps happens here, not at stage 5.

**`fetch-sources.mjs`** — Reads `config.json`, pulls RSS (`rss-parser`), HN Algolia API, company blog RSS. Per-item: fetches article text using per-domain strategy (JS-rendered domains → spawn `pipeline/scrapers/fetch-article-text.mjs`; rest → plain `fetch()` + `@mozilla/readability`). Caches to `work/<date>-<run>/articles/<item_id>.txt`. Items with <500 chars extracted are flagged `text_extraction_failed: true`. Outputs `items.json` (validated against `schemas/items.js`). Per-source try/catch; failures logged to `fetch-errors.json`. Hard stop if fewer than 10 items with good text extraction.

**`verify-claims.mjs`** — Reads `claims.json` + `articles/` cache. Uses shared `lib/normalize-text.js` to normalize both sides before matching:
- Unicode NFKC normalization.
- Whitespace collapsing (tabs, newlines, non-breaking space → single space).
- Quote unification (smart quotes, guillemets → straight quotes).
- Dash unification (en-dash, em-dash, hyphen-minus → single form).
- HTML entity decoding.
- Ellipsis character → three dots.
- Case lowering.

Then checks each claim's supporting quote appears verbatim in the normalized source. Writes `claims-verified.json`. Failures land in `claims-verification-report.md` with claim, quote, and source excerpt around the expected match site. **Exits nonzero if any fail — blocks render.** No auto-fix. (Deliberate: numeric paraphrase like "3x" vs "three times" is NOT normalized away — those are semantic differences the skill prompt must avoid.)

**`capture-screenshots.mjs`** (lives in `pipeline/scrapers/`) — Per pick: Puppeteer to `external_url`, 15s timeout, capture top 1200×400 strip (headline + opening paragraph only — not full article body, per screenshot legal posture). Saves PNG to `work/<date>-<run>/screenshots/<item_id>.png`. On timeout / HTTP error / navigation error: writes `screenshots-manifest.json` entry with `fallback: true` and no PNG. Never hard-fails. Source-attribution banner is applied at composition time (CSS overlay), not baked into the PNG.

**`tts.mjs`** — see below. Output is `voiceover-raw.mp3`.

**`normalize-audio.mjs`** — `ffmpeg -i voiceover-raw.mp3 -af loudnorm=I=-14:TP=-1.5:LRA=11 voiceover.mp3`. Single-pass loudnorm is sufficient for TTS-only content (no dynamic range surprises). Target -14 LUFS integrated matches YouTube's normalization target; avoids the "too quiet" complaint on first publish. Hard-stops on nonzero ffmpeg exit.

**`tts.mjs` (detail)** — Provider-pluggable wrapper selected by `config.json`. Providers: `edge` (primary, spawns `edge-tts` Python CLI — Python is a setup dependency), `piper` (local fallback, spawns Piper binary), `google` (optional paid, via `@google-cloud/text-to-speech`). On primary failure, auto-falls back to `piper` and logs the actually-used provider in `voiceover-meta.json`. Input: script paragraphs (parsed from `script.md` sections). Output: `voiceover-raw.mp3` + `timings.json` (per-paragraph start + duration, validated against `schemas/timings.js`).

**`build-composition.mjs`** — Input: `script.md`, `picks.json`, `screenshots-manifest.json`, `timings.json`, `templates/`. For each paragraph, selects the template (`story-card.html` if screenshot available, `story-card-text-fallback.html` otherwise), fills slot values, and sets `data-start` / `data-duration` from measured audio timings. Concatenates intro + story cards + outro into `composition.html` with a single `<audio>` track pointing at `voiceover.mp3`.

**`render.mjs`** — Invokes `hyperframes render composition.html → video.mp4` and `hyperframes render templates/thumbnail.html → thumbnail.png`. Uses `child_process.spawn('node', ['node_modules/hyperframes/dist/cli.js', ...], { shell: false })` directly rather than `npx hyperframes` to avoid Windows `.cmd` shim issues where `spawn('npx', ...)` without `shell: true` silently fails. Thumbnail template receives `{ top_headline, date, channel_name, channel_color }` via query-string / `data-*` attribute substitution before render. Hard-stops on nonzero exit, output <50KB, or duration <30s.

### Slash commands

All are thin — they spawn Node scripts, invoke skills, move files. No business logic.

- **`/yt-daily`** — end-to-end, pausing at both approval gates.
- **`/yt-fetch`** — just fetch.
- **`/yt-research`** — invokes `yt-research` skill on current `items.json`.
- **`/yt-script`** — invokes `yt-script` skill, then runs `verify-claims.mjs`, then stops for user script approval.
- **`/yt-render`** — runs TTS → screenshots → composition → render → metadata, then stops for user MP4 approval.
- **`/yt-approve`** — moves `work/<date>/` to `ready-to-upload/<date>/`.

Each stage writes a log to `work/<date>-<run>/logs/<stage>.log` (stdout, stderr, duration) so post-mortems don't require re-running.

### Run IDs and concurrency

`lib/run-id.js` handles working-directory assignment:
- On start, pick `work/<YYYY-MM-DD>-<N>/` where N is the next unused monotonic integer for today.
- Create `work/<YYYY-MM-DD>-<N>/.lock` with the current PID. Stages check for staleness (PID not alive → lock is orphaned, can reclaim).
- `/yt-approve` moves the run folder to `ready-to-upload/` and releases the lock.
- Prevents accidental concurrent runs from stomping each other, allows intentional retries on the same day (`-1`, `-2`, ...).

### Schema validation

Every Node script that consumes a skill's JSON output validates against a Zod schema in `pipeline/schemas/` before reading further. Catches malformed LLM output at the boundary with a clear error, rather than downstream stages failing obscurely. Schemas exist for: `items.json`, `picks.json`, `claims.json`, `timings.json`, `screenshots-manifest.json`, `config.json`.

## File formats

### `items.json`

```json
{
  "fetched_at": "2026-04-23T08:00:00Z",
  "items": [
    {
      "id": "hn-39284710",
      "source": "hackernews",
      "source_url": "https://news.ycombinator.com/item?id=39284710",
      "external_url": "https://openai.com/blog/gpt-5-turbo",
      "title": "GPT-5 Turbo released",
      "summary": "first 500 chars of article or HN text",
      "published_at": "2026-04-23T06:12:00Z",
      "signals": { "hn_points": 847, "hn_comments": 312 },
      "article_text_path": "articles/hn-39284710.txt"
    }
  ]
}
```

`id` is stable per source. `external_url` is the canonical article URL; `source_url` is where we found it (differs for HN). Dedup pass collapses duplicate `external_url` across sources, keeping the highest-signal entry.

### `picks.json`

```json
{
  "date": "2026-04-23",
  "picks": [
    {
      "rank": 1,
      "item_id": "hn-39284710",
      "angle": "Why this matters to builders: ...",
      "rationale": "Why picked over alternatives: ...",
      "suggested_visuals": ["OpenAI blog screenshot", "benchmark chart"],
      "risk_flags": []
    }
  ],
  "rejected": [
    { "item_id": "rss-verge-xyz", "reason": "Duplicate angle to pick #1" }
  ]
}
```

### `script.md`

```markdown
---
date: 2026-04-23
target_duration_sec: 240
voice_id: en-US-AriaNeural
word_count: 612
---

## INTRO (15s)
Good morning. Three AI stories today — ...

## STORY 1 — GPT-5 Turbo (70s)
OpenAI released GPT-5 Turbo. [^1] It beats GPT-5 on every benchmark at one-third the cost. [^1]
...

## OUTRO (10s)
...

## SOURCES
[^1]: https://openai.com/blog/gpt-5-turbo (item_id: hn-39284710)
```

`target_duration_sec` is a pacing hint for the script skill, not a hard constraint on the renderer. Real timings come from measured TTS output.

### `claims.json`

```json
{
  "claims": [
    {
      "id": 1,
      "section": "STORY 1",
      "claim_text": "It beats GPT-5 on every benchmark at one-third the cost.",
      "supporting_quote": "...exact verbatim substring from the source article...",
      "source_item_id": "hn-39284710",
      "source_url": "https://openai.com/blog/gpt-5-turbo"
    }
  ]
}
```

### `timings.json`

```json
{
  "audio_file": "voiceover.mp3",
  "total_duration_sec": 247.3,
  "paragraphs": [
    { "section": "INTRO", "paragraph_index": 0, "start_sec": 0.0, "duration_sec": 14.8 },
    { "section": "STORY 1", "paragraph_index": 0, "start_sec": 14.8, "duration_sec": 6.2 }
  ]
}
```

### `metadata.txt`

```
TITLE: GPT-5 Turbo is Here + Anthropic's Memory Play | AI Daily 2026-04-23

DESCRIPTION:
Three AI stories you need today:
00:00 Intro
00:15 GPT-5 Turbo released
...

Sources:
- https://openai.com/blog/gpt-5-turbo
- ...

TAGS: ai, openai, gpt-5, anthropic, ai news, llm, ...
```

### `config.json`

```json
{
  "sources": {
    "rss": ["https://techcrunch.com/category/artificial-intelligence/feed/", "..."],
    "hackernews": { "min_points": 50, "keywords": ["AI", "LLM", "GPT", "Claude"] },
    "company_blogs": ["https://openai.com/blog/rss.xml", "..."],
    "js_rendered_domains": ["openai.com", "anthropic.com", "deepmind.google", "ai.meta.com", "blog.google"]
  },
  "tts": {
    "provider": "edge",
    "fallback": "piper",
    "voice_id": "en-US-AriaNeural",
    "rate": "+5%",
    "piper_voice_model": "en_US-lessac-medium"
  },
  "audio": { "target_lufs": -14, "true_peak_db": -1.5, "lra": 11 },
  "video": { "width": 1920, "height": 1080, "fps": 30, "target_duration_sec": 240 },
  "channel": { "name": "AI Daily", "accent_color": "#3B82F6" }
}
```

Note: HN `min_points` dropped from 100 to 50 because ≤24h old stories rarely cross 100 — 100 would starve the research stage. Tune after first few runs.

## Error handling (principle: fail loud, fail early, fail where a human sees it)

| Stage | Failure behavior |
| --- | --- |
| `setup.mjs` | Prints per-dep pass/fail table, exits nonzero if any missing. First-run failures happen here, not mid-pipeline. |
| `fetch-sources.mjs` | Per-source try/catch. Hard stop if <10 items with usable article text (>=500 chars). |
| `fetch-article-text.mjs` | Per-domain strategy; on failure, item is flagged `text_extraction_failed: true` and excluded from research. |
| `yt-research` | Hard stop if <3 picks, if any pick references unknown `item_id`, or if any pick references an item flagged `text_extraction_failed`. |
| `yt-script` | Hard stop if `claims.json` malformed (schema validation), footnotes unresolved, or any claim references a missing source. |
| `verify-claims.mjs` | Writes report, exits nonzero, blocks render. Never auto-fixes. |
| `capture-screenshots.mjs` | Logs error, marks `fallback: true`, never hard-fails. |
| `tts.mjs` | Auto-fallback to Piper. Hard stop only if both providers fail. |
| `normalize-audio.mjs` | Hard stop on nonzero ffmpeg exit. |
| `render.mjs` | Hard stop on nonzero exit, MP4 <50KB, or duration <30s. |
| Schema validation | Every skill→script boundary — malformed JSON fails with a clear error at the boundary. |
| Run-ID collision | `lib/run-id.js` picks next unused monotonic suffix; stale locks (dead PID) are reclaimed automatically. |
| Network offline | `fetch-sources.mjs` pre-check produces a clear message rather than cryptic fetch errors. |

## Testing

**Unit (Vitest):**
- `dedup.js` cross-source dedup.
- `build-composition.mjs` timing math (paragraph durations → `data-start` sums).
- `lib/normalize-text.js` normalization (NFKC, whitespace, dashes, quotes, NBSP, HTML entities, ellipsis).
- `verify-claims.mjs` end-to-end: given a claim and a source excerpt that differ only in normalization-target characters, match passes; semantic differences (numeric paraphrase) fail.
- `lib/run-id.js` collision, lock-stale reclaim, lock-live refusal.
- Zod schemas round-trip valid fixtures; reject known-malformed fixtures.

**Integration (fixtures, no network):**
- Fixed `items.json` fixture → run deterministic stages end-to-end (skip LLM) → assert MP4 produced.
- Fixed `claims.json` with a known-bad claim → assert `verify-claims.mjs` exits nonzero and `/yt-render` refuses.

**Skill prompt evals (manual, lightweight):**
- A `test-cases/` folder of sample inputs with human-written expected behavior. Eyeballed when tuning prompts. Not automated.

**Manual smoke:** first run after structural changes — eyeball every stage's output in `work/<date>/`.

**Explicitly out of scope:** Hyperframes internals, Edge TTS output quality, exact LLM string assertions.

## Out of scope for v1

- Daily scheduling / cron.
- Cross-day story dedup.
- "Nothing worth covering today" detection.
- Automated YouTube upload (manual via YouTube Studio).
- Telegram / Discord / email approval UX (local folder only).
- AI-generated imagery (screenshots + text fallback only).
- Thumbnail variants / A-B testing.
- Analytics / feedback loop from YouTube metrics back into research ranking. (Noted: without this loop you won't learn what's working algorithmically; manual prompt tuning only in v1.)
- **Background music bed** — loudness normalization is in; music + ducking is deferred. Royalty-free music from YouTube Audio Library can be added in v2 as a second `<audio>` track with volume ducking under the voiceover.

## Open issues to resolve during implementation

- Exact Edge TTS voice selection — `en-US-AriaNeural` is a starter; finalize after listening to 3-4 renders.
- Piper voice model choice — starter `en_US-lessac-medium`; Piper install path on Windows validated by `setup.mjs`.
- Hyperframes version pin — its v0.x API may shift; pin to an exact version in `package.json`.
- Exact RSS feed URLs and HN keyword list — tune after the first few fetches.
- `pipeline/scrapers/` Puppeteer version pin — pin to latest stable at project start; upgrade deliberately.
