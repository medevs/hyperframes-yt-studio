# AI Daily — YouTube Automation Studio

A Claude Code–driven pipeline that produces one 3–5 minute AI news video per day. Stories are fetched, ranked, scripted, fact-checked, narrated, and rendered as a 1920×1080 H.264 MP4 ready for YouTube Studio — with two human approval gates (script + video) in the middle.

Rendering is delegated to [HyperFrames](https://hyperframes.heygen.com) (HTML + GSAP → MP4). Everything that adds editorial value — story selection, scripting, claim verification, metadata — lives in `pipeline/`.

## How it works

```
/yt-fetch  →  /yt-research  →  /yt-script  →  [Gate 1: approve script]
           →  /yt-render    →  [Gate 2: approve MP4]  →  /yt-approve
```

| Stage        | Produces                                           | Owner                |
| ------------ | -------------------------------------------------- | -------------------- |
| `yt-fetch`   | `items.json` — RSS + Hacker News articles          | `pipeline/`          |
| `yt-research`| `picks.json` — top 3 stories, ranked               | `yt-research` skill  |
| `yt-script`  | `script.md`, `claims.json`, `storyboard.json`      | `yt-script` skill    |
| (verify)     | `claims-verified.json` — verbatim quote check      | `pipeline/`          |
| `yt-render`  | TTS → transcribe → timings → screenshots → compose → lint → MP4 → metadata | HyperFrames + `pipeline/` |
| `yt-approve` | Moves run from `work/` to `ready-to-upload/`       | `pipeline/`          |

Run the whole thing end-to-end with `/yt-daily`; it stops at each gate and waits for explicit approval.

Between `yt-render`'s compose step and the final MP4, use `/yt-preview` to open the HyperFrames studio with hot-reload for live iteration on visuals.

## Requirements

- Node **>= 22**
- `ffmpeg` on `PATH`
- Puppeteer (pulled in by `npm install`; downloads Chromium)

Verify your environment:

```bash
npm install
npm run doctor       # preflight checks: Node, ffmpeg, hyperframes doctor, config, whisper-cli
```

## Commands

### Pipeline (slash commands, invoked inside Claude Code)

- `/yt-daily` — full pipeline with both approval gates
- `/yt-fetch` — acquire a run folder + fetch sources → `items.json`
- `/yt-research` — rank stories → `picks.json`
- `/yt-script` — write script + storyboard, verify claims (**stops at Gate 1**)
- `/yt-render` — TTS, transcribe, compose, lint, render MP4, write metadata (**stops at Gate 2**)
- `/yt-preview` — open HyperFrames studio on the current run
- `/yt-approve` — move approved run to `ready-to-upload/`

### HyperFrames

```bash
npx hyperframes preview    # studio editor with hot-reload
npx hyperframes render     # render to MP4
npx hyperframes lint       # validate compositions (run after every edit)
npx hyperframes docs <topic>
```

### NPM scripts

```bash
npm test                   # vitest
npm run doctor             # preflight checks
npm run lint               # hyperframes lint
```

## Project layout

```
.
├── index.html              # root HyperFrames composition
├── compositions/           # sub-compositions (intro, captions, graphics, …)
├── assets/                 # media (swiss-grid.svg, fonts, etc.)
├── pipeline/               # editorial automation (fetch → research → script → verify → render)
│   ├── lib/                # shared utilities (dedup, normalize-text, run-id, sources)
│   └── schemas/            # Zod schemas for items/picks/claims/timings/storyboard
├── tests/                  # vitest unit tests
├── .claude/
│   ├── commands/           # slash-command orchestrators (/yt-*)
│   └── skills/             # framework + project skills (hyperframes, yt-*)
├── .agents/skills/         # canonical skill sources (pinned via skills-lock.json)
├── docs/superpowers/       # implementation plans and design specs
├── config.json             # sources, TTS voice, video settings
├── DESIGN.md               # "Swiss Pulse" visual identity
├── meta.json               # HyperFrames project metadata
└── hyperframes.json        # HyperFrames paths + registry
```

Runtime directories (gitignored): `work/` (in-progress runs), `ready-to-upload/` (approved), `archive/`, `renders/`, `snapshots/`, `.last-run`.

## Configuration

`config.json` controls sources and output settings:

- **`sources.rss`** — RSS feeds (TechCrunch, The Verge, Ars Technica, MIT Tech Review)
- **`sources.hackernews`** — min points + keyword filter
- **`sources.company_blogs`** — OpenAI, Anthropic, DeepMind, Meta AI
- **`sources.js_rendered_domains`** — domains that need Puppeteer instead of plain fetch
- **`tts`** — Kokoro voice (`af_nova`) + speed
- **`video`** — 1920×1080 @ 30fps, ~240s target
- **`channel`** — name, style, accent color

## Design system

Visual style is **Swiss Pulse** (Josef Müller-Brockmann): `#0A0A0A` backgrounds, a single `#0066FF` accent, Inter typography, `expo.out`/`power4.out` motion. The full spec is in `DESIGN.md` and is enforced by the `hyperframes` skill as a "Visual Identity Gate."

No pure black, no rounded cards over 8px, no emoji, no clickbait colors.

## Fact-checking

Every factual claim in `script.md` is emitted with a verbatim source quote in `claims.json`. Before rendering, `pipeline/verify-claims.mjs` normalizes typography (smart quotes, en-dashes, whitespace) and confirms each quote exists in the fetched article text. Any failed claim blocks `yt-render`.

## Skills

This project relies on AI-agent skills that encode framework-specific patterns (`window.__timelines` registration, `data-*` timing attributes, shader-compatible CSS, timeline pausing). They live at `.agents/skills/` and are pinned via `skills-lock.json`.

If a slash command reports a missing skill:

```bash
npx hyperframes skills        # installs HyperFrames skills
# or manually:
npx skills add heygen-com/hyperframes
```

Core skills used: `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `website-to-hyperframes`, `gsap`, plus project skills `yt-research`, `yt-script`, `yt-compose`, `yt-metadata`.

## License

MIT — see [`LICENSE`](LICENSE).

`vendor/idcac-rules.css` is third-party content under GPL-3.0-or-later; see
[`vendor/LICENSE-idcac`](vendor/LICENSE-idcac).
