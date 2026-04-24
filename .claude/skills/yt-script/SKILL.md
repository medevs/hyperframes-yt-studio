---
name: yt-script
description: Write the voiceover script, claims.json, storyboard.json, and storyboard.md for today's 3-story AI Daily video, given picks.json and article texts. Every factual claim must be backed by a verbatim source quote that the verifier can match char-for-char. Use whenever picks.json exists and the run needs narration + a storyboard — also when the user says "write the script", "draft the narration", or "storyboard today's stories", even without naming this skill.
---

# yt-script

Write `script.md`, `claims.json`, `storyboard.json`, and `storyboard.md` for today's video.

`storyboard.json` is the canonical contract — `yt-compose` reads it directly. `storyboard.md` is a human-readable companion for the approval gate; it must describe the same scenes and beats as the JSON.

## Before writing

1. Read `DESIGN.md` at the repo root. It defines the **Swiss Pulse** brand — colors, type scale, motion tokens. Every visual choice in the storyboard must trace back to it.
2. If you haven't loaded the Hyperframes skill this session, invoke it via the Skill tool (`/hyperframes`). Its house-style and motion references are what makes the storyboard usable downstream.
3. Read every article in full before writing narration. Claims are grounded in article text, not summaries.

## Inputs

- `<run-dir>/picks.json` — the 3 picks. Schema: `pipeline/schemas/picks.js`.
- `<run-dir>/items.json` — full item list; use `article_text_path` to read source articles.
- `DESIGN.md` — brand palette, typography, motion rules.

## Tone

- Builder-focused: every story paragraph ends with one sentence answering *"what this means for people building with AI"* — concrete, not hand-wavy.
- Skeptical when warranted. Don't repeat press-release hype uncritically.
- No clickbait. No "you won't believe", no rhetorical audience questions, no "this changes everything".
- Conversational, short sentences. One idea per sentence.

## Target length

~240 seconds total voiceover (~600 words at normal pace). Budget:

- INTRO: 15s / ~40 words
- STORY 1 (lead): 70–80s / ~190 words
- STORY 2: 70s / ~170 words
- STORY 3: 65s / ~160 words
- OUTRO: 10–15s / ~40 words

Pacing is a hint — actual timing comes from measuring TTS output in the render phase.

## Output 1: `<run-dir>/script.md`

```markdown
---
date: <YYYY-MM-DD>
target_duration_sec: 240
voice: af_nova
word_count: <your count>
---

## INTRO
<opening line that name-checks the 3 stories>

## STORY 1 — <short title>
<narration with [^N] footnotes on every factual claim>

## STORY 2 — <short title>
...

## STORY 3 — <short title>
...

## OUTRO
<closer>

## SOURCES
[^1]: <url> (item_id: <id>)
[^2]: ...
```

- **Every factual claim gets a footnote `[^N]`** — numbers, release dates, benchmark results, quotations, feature names, product comparisons. Anything checkable.
- Footnotes are numbered sequentially across the whole script.
- Every footnote appears in SOURCES with a URL and `item_id`.
- Do NOT include parenthetical duration hints like `(15s)` in headers — timing comes from transcribe, not from pacing guesses.

## Output 2: `<run-dir>/claims.json`

Schema: `pipeline/schemas/claims.js`. For every footnoted claim, one entry:

```json
{
  "claims": [
    {
      "id": 1,
      "section": "STORY 1",
      "claim_text": "It beats GPT-5 on every benchmark at one-third the cost.",
      "supporting_quote": "...EXACT verbatim substring from source article...",
      "source_item_id": "hn-39284710",
      "source_url": "https://openai.com/blog/gpt-5-turbo"
    }
  ]
}
```

### The absolute rule for `supporting_quote`

**Copy-paste, do not paraphrase.** `supporting_quote` must be a substring of the source article's text, character for character. The verifier (`pipeline/verify-claims.mjs`) checks this automatically — any mismatch blocks the pipeline and wastes a full render iteration.

The verifier normalizes whitespace, smart quotes, dashes, NBSP, HTML entities, and case. It does **not** normalize numeric paraphrase ("3x" vs "three times") or rewording. If you can't find a verbatim substring, **rewrite the claim, don't edit the quote** — the claim text can paraphrase freely, only the quote must be exact.

## Output 3: `<run-dir>/storyboard.json`

Schema: `pipeline/schemas/storyboard.js`. This is the machine-readable contract consumed by `yt-compose`.

Five scenes, in order: INTRO, STORY 1, STORY 2, STORY 3, OUTRO. Each scene has beats (timestamped visual events). Required beat kinds: `headline`, `screenshot`, `number_callout`, `label`, `takeaway`, `source_chip`. Required transitions: `cinematic_zoom`, `sdf_iris`, `crossfade`, `hard_cut`.

See `pipeline/schemas/storyboard.js` for the exact Zod schema — it's the source of truth for field names and enums.

## Output 4: `<run-dir>/storyboard.md`

Human-readable sibling of the JSON, for the script-approval gate. Same scenes, same beats, prose-friendly:

```markdown
# Storyboard

## Scene: INTRO (~15s, transition_in: hard_cut)
- Beat 0.0s: headline "AI DAILY" at hero-size, accent color left rule
- Beat 0.4s: date_pretty below headline, foreground_secondary
- Beat 0.8s: three headlines stacked, each entering with power4.out stagger 0.12
- Note: grid-locked, numbers prominent if any

## Scene: STORY 1 — <title> (~75s, transition_in: cinematic_zoom)
- Beat 0.0s: story_num "01" at 160px accent color, bottom-left
- Beat 0.3s: headline at story-headline size, top-right
- Beat 1.0s: screenshot crop 1200x400 at mid-frame
- Beat 3.5s: source_chip "<domain>" bottom-right
- Beat 8.0s: number_callout — if story has a headline stat, animate from 0
- Note: screenshot gets 6px outline accent color, no drop shadow
- Takeaway line enters at ~end-6s with label "FOR BUILDERS"

## Scene: STORY 2 — <title> (~70s, transition_in: sdf_iris)
...

## Scene: STORY 3 — <title> (~65s, transition_in: sdf_iris)
...

## Scene: OUTRO (~12s, transition_in: crossfade)
- Beat 0.0s: channel name at hero-size
- Beat 0.5s: accent rule
- Beat 0.8s: "SUBSCRIBE FOR DAILY AI NEWS" at label size
- Note: this is the ONLY scene where elements may exit via gsap.to(opacity: 0)
```

## Hard rules

- No claim in the script may be ungrounded. If the article doesn't support it, omit it.
- Don't invent numbers. If the source rounds, you round the same way.
- Never mix sources: STORY 1's claims cite STORY 1's source(s) only.
- Storyboard visual direction must follow `DESIGN.md`. No off-palette colors, no non-Inter fonts, no generic motion ("fade in" without an ease tied to DESIGN.md).
- `storyboard.md` and `storyboard.json` must describe the same 5 scenes in the same order with the same beat content. If they drift, the approval gate and the render will disagree.

## After writing, validate

```bash
node pipeline/validate-json.mjs claims <run-dir>/claims.json
node pipeline/validate-json.mjs storyboard <run-dir>/storyboard.json
```

Both must print `OK ...`. Then self-check: every `[^N]` in `script.md` appears in SOURCES and in `claims.json`; every scene in `storyboard.json` has at least one beat; `storyboard.md` matches `storyboard.json` scene-for-scene.
