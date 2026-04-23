---
name: yt-research
description: Rank and pick the 3 most newsworthy AI/tech stories for a builder-focused daily recap video from a batch of fetched items. Use when items.json exists and you need picks.json.
---

# yt-research

Pick the 3 stories for today's AI Daily video.

## Inputs

- `<run-dir>/items.json` — all fetched items. Schema: `pipeline/schemas/items.js`.
- Read `items[i].article_text_path` (relative to run-dir) for article bodies as needed.

Skip items flagged `text_extraction_failed: true` — they cannot be fact-checked and therefore cannot be picked.

## Audience and angle

**Audience: builders shipping AI products.** For every candidate, ask: *what does this mean for someone actually building with AI?*

Favor:
- Model releases / API changes affecting integration choices
- Tooling, agent frameworks, infra changes builders adopt
- Open-weights / local model advances
- Concrete product launches from major labs (OpenAI / Anthropic / DeepMind / Meta)
- Notable failures, retractions, or security issues in shipped AI systems

Deprioritize:
- Funding rounds without product substance
- Celebrity executive drama
- Aggregator repeats of already-covered stories
- Vague "AI will change everything" opinion pieces

## Output

Write to `<run-dir>/picks.json`. Schema: `pipeline/schemas/picks.js`. Must parse cleanly.

- **Exactly 3 picks**, ranked 1 (lead) to 3.
- Each pick:
  - `item_id` — must exist in items.json
  - `angle` — one sentence: the builder-focused hook
  - `rationale` — 1–2 sentences: why this over alternatives
  - `suggested_visuals` — 2–3 short strings (e.g. `["benchmark chart", "API changelog"]`)
  - `risk_flags` — any of: `"rumor_only"`, `"single_source"`, `"unverifiable_claim"`, `"potential_copyright"`. Empty if none apply.
- `rejected` — any strong-but-not-picked candidates with a short reason.

## Hard rules

- Never pick an item with `text_extraction_failed: true`.
- Never reference an item_id that doesn't appear in items.json.
- If fewer than 3 usable items exist, stop and report — do not invent a third pick.

## After writing, validate

```bash
node -e "import('./pipeline/schemas/picks.js').then(({PicksFileSchema}) => { const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); PicksFileSchema.parse(d); console.log('OK'); })" <run-dir>/picks.json
```
