# AI Daily — YouTube Automation Studio

A Claude Code–driven pipeline that produces one 3–5 minute AI news video per
day. Stories are fetched, ranked, scripted, fact-checked, narrated, and
rendered as a 1920×1080 H.264 MP4 ready for YouTube Studio — with two human
approval gates (script + video) in the middle.

Rendering is delegated to [HyperFrames](https://hyperframes.heygen.com)
(HTML + GSAP → MP4). Everything that adds editorial value — story selection,
scripting, claim verification, metadata — lives in `pipeline/`.

## How it works

```
/yt-fetch  →  /yt-research  →  /yt-script  →  [Gate 1: approve script]
           →  /yt-render    →  [Gate 2: approve MP4]  →  /yt-approve
```

| Stage         | Produces                                                                   | Owner                     |
| ------------- | -------------------------------------------------------------------------- | ------------------------- |
| `yt-fetch`    | `items.json` — RSS + Hacker News articles                                  | `pipeline/`               |
| `yt-research` | `picks.json` — top 3 stories, ranked                                       | `yt-research` skill       |
| `yt-script`   | `script.md`, `claims.json`, `storyboard.json`                              | `yt-script` skill         |
| (verify)      | `claims-verified.json` — verbatim quote check                              | `pipeline/`               |
| `yt-render`   | TTS → transcribe → timings → screenshots → compose → lint → MP4 → metadata | HyperFrames + `pipeline/` |
| `yt-approve`  | Moves run from `work/` to `ready-to-upload/`                               | `pipeline/`               |

Run the whole thing end-to-end with `/yt-daily`; it stops at each gate and
waits for explicit approval. Between `yt-render`'s compose step and the final
MP4, use `/yt-preview` to open the HyperFrames studio with hot-reload for
live iteration on visuals.

## Requirements

- Node **>= 22**
- `ffmpeg` on `PATH`
- `whisper-cli` from [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
  for word-level transcription (set `HYPERFRAMES_WHISPER_DIR` if not on PATH;
  Windows defaults to `C:\tools\whisper`)
- Puppeteer (pulled in by `npm install`; downloads Chromium)
- TTS uses Kokoro shipped via `npx hyperframes tts` — no Python install needed

[Claude Code](https://claude.com/claude-code) is required to run the slash
commands; the `pipeline/` scripts can be invoked directly with Node if you
want to drive the flow yourself.

## Quick start

```bash
git clone https://github.com/medevs/hyperframes-yt-studio.git
cd hyperframes-yt-studio
npm install
npm run doctor               # preflight checks
```

Then in a Claude Code session at the repo root:

```
/yt-daily                    # full pipeline, stops at each approval gate
```

Or step through manually:

```
/yt-fetch                    # acquire run folder, fetch sources → items.json
/yt-research                 # rank → picks.json
/yt-script                   # write narration + storyboard, verify claims  ← Gate 1
/yt-render                   # TTS, transcribe, compose, lint, render MP4   ← Gate 2
/yt-approve                  # promote to ready-to-upload/
```

Outputs land in `work/<date>-<n>/` until approved, then move to
`ready-to-upload/<date>-<n>/` (both gitignored).

## Fork for your own channel

Three files cover the channel-level customization:

- **`config.json`** — RSS feeds, Hacker News filter, TTS voice (Kokoro voices
  like `af_nova`, `am_adam`), video dimensions, target duration, channel name,
  accent color.
- **`DESIGN.md`** — visual identity (palette, typography, motion principles).
  Enforced by the `hyperframes` skill as a "Visual Identity Gate" — change it
  to change the look of every video.
- **`meta.json`** — HyperFrames project id and name.

The skills under `.claude/skills/yt-*/` and the slash commands under
`.claude/commands/yt-*.md` describe what each pipeline stage does in plain
English; tweak them to change editorial style (story selection criteria,
script tone, metadata format).

## Commands

### Slash commands (run inside Claude Code)

- `/yt-daily` — full pipeline with both approval gates
- `/yt-fetch` — acquire a run folder + fetch sources → `items.json`
- `/yt-research` — rank stories → `picks.json`
- `/yt-script` — write script + storyboard, verify claims (**stops at Gate 1**)
- `/yt-render` — TTS, transcribe, compose, lint, render MP4, write metadata (**stops at Gate 2**)
- `/yt-preview` — open HyperFrames studio on the current run
- `/yt-approve` — move approved run to `ready-to-upload/`

### NPM scripts

```bash
npm test                     # vitest (unit tests for pipeline/lib + schemas)
npm run doctor               # preflight checks
npm run lint                 # hyperframes lint (composition validation)
```

### HyperFrames

```bash
npx hyperframes preview      # studio editor with hot-reload
npx hyperframes render       # render to MP4
npx hyperframes lint         # validate compositions (run after every edit)
npx hyperframes docs <topic>
```

## Project layout

```
.
├── index.html              # root HyperFrames composition (regenerated per run)
├── compositions/           # sub-compositions (intro, captions, graphics, …)
├── assets/                 # CSS/JS/SVG used by compositions
├── vendor/                 # third-party assets (see vendor/LICENSE-idcac)
├── pipeline/               # editorial automation (fetch → research → script → verify → render)
│   ├── lib/                # shared utilities (sources, dedup, normalize-text, run-id, og-image, …)
│   └── schemas/            # Zod schemas for items/picks/claims/timings/storyboard
├── tests/                  # vitest unit tests (+ fixtures)
├── tools/skill-evals/      # benchmark + grader for the yt-* skills
├── .claude/
│   ├── commands/           # slash-command orchestrators (/yt-*)
│   └── skills/             # project skills (yt-research, yt-script, yt-compose, yt-metadata)
├── .agents/skills/         # canonical HyperFrames skill sources (pinned via skills-lock.json)
├── config.json             # sources, TTS voice, video settings
├── DESIGN.md               # visual identity spec
├── meta.json               # HyperFrames project metadata
├── hyperframes.json        # HyperFrames paths + registry
└── CLAUDE.md               # instructions for Claude Code agents
```

Runtime directories (gitignored): `work/`, `ready-to-upload/`, `archive/`,
`renders/`, `snapshots/`, `.last-run`, `.worktrees/`, `.hyperframes/`.

## Configuration

`config.json` controls sources and output settings:

- **`sources.rss`** — RSS feed URLs
- **`sources.hackernews`** — `min_points` threshold + `keywords` filter
- **`sources.company_blogs`** — extra feeds from labs (OpenAI, Anthropic, …)
- **`sources.js_rendered_domains`** — domains needing Puppeteer over plain fetch
- **`tts`** — Kokoro voice + speed
- **`video`** — width × height × fps + target duration in seconds
- **`channel`** — name, style label, accent color (hex)

## Design system

Visual style ships as **Swiss Pulse** (Josef Müller-Brockmann influence):
`#0A0A0A` backgrounds, a single `#0066FF` accent, Inter typography,
`expo.out` / `power4.out` motion. The full spec is in `DESIGN.md` and is
enforced by the `hyperframes` skill as a "Visual Identity Gate." No pure
black, no rounded cards over 8px, no emoji, no clickbait colors.

Replace `DESIGN.md` (and update the accent color in `config.json`) to ship a
different look.

## Lints

`npx hyperframes lint` runs the framework's composition validator plus
project-specific rules:

- **`motion_budget`** — caps simultaneous animations per scene to keep the
  output legible at 30fps.
- **`scene_gaps`** — verifies track-1 clips butt-join with no dead frames
  between scenes.

Lint failures block `yt-render`.

## Fact-checking

Every factual claim in `script.md` is emitted with a verbatim source quote
in `claims.json`. Before rendering, `pipeline/verify-claims.mjs` normalizes
typography (smart quotes, en-dashes, whitespace) and confirms each quote
exists in the fetched article text. Any failed claim blocks `yt-render`.

## Skills

The slash commands rely on AI-agent skills that encode framework-specific
patterns (`window.__timelines` registration, `data-*` timing attributes,
shader-compatible CSS, timeline pausing) — generic web docs don't cover these.

Canonical skill sources live at `.agents/skills/` and are pinned via
`skills-lock.json`. For convenience they're typically symlinked into
`.claude/skills/` (the symlink targets are gitignored — Windows clones without
`core.symlinks` will need to recreate them or run `npx hyperframes skills`).

If a slash command reports a missing skill:

```bash
npx hyperframes skills        # installs HyperFrames skills locally
# or manually:
npx skills add heygen-com/hyperframes
```

Core skills used: `hyperframes`, `hyperframes-cli`, `hyperframes-registry`,
`website-to-hyperframes`, `gsap`. Project-local: `yt-research`, `yt-script`,
`yt-compose`, `yt-metadata`.

## Troubleshooting

**`whisper-cli` not found.** Install [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
and either add the binary directory to `PATH` or set `HYPERFRAMES_WHISPER_DIR`
to it. On Windows the default is `C:\tools\whisper`. Test with `whisper-cli --help`.

**Puppeteer fails to download Chromium.** Behind a proxy, set
`HTTPS_PROXY` before `npm install`, or pre-install Chromium and point
Puppeteer at it via `PUPPETEER_EXECUTABLE_PATH`. The `pipeline/capture-screenshots.mjs`
step needs a working headless Chromium.

**`verify-claims` rejects a claim that looks identical to the source.**
The verifier normalizes smart quotes / en-dashes / non-breaking spaces but
not silently — re-paste the quote from the article text rather than retyping
it, and it should match.

**`hyperframes lint` fails with `motion_budget` or `scene_gaps`.** The
former means a scene has too many simultaneous animations (split it across
scenes or stagger them). The latter means track-1 clips don't butt-join —
check `data-start` + `data-duration` math against the next clip's
`data-start`.

**`npm run doctor` reports `[FAIL]` on a fresh clone.** Some checks (Puppeteer,
hyperframes installed) only pass after `npm install`. Run `npm install`
first, then `npm run doctor`.

## Tests

```bash
npm test                     # vitest run (~3s)
```

Unit tests cover `pipeline/lib/` (dedup, normalize-text, run-id, og-image,
parallel-fetch, screenshot-quality, motion-budget, extract-keywords),
`pipeline/schemas/`, claim verification, and section-to-word alignment.
CI runs the same suite on every push and PR (see `.github/workflows/test.yml`).

## License

MIT — see [`LICENSE`](LICENSE).

`vendor/idcac-rules.css` is third-party content under GPL-3.0-or-later; see
[`vendor/LICENSE-idcac`](vendor/LICENSE-idcac).
