---
name: yt-research
description: Rank and pick the 3 most newsworthy AI/tech stories for a builder-focused daily recap video. Use whenever you need to select stories, choose picks, or rank candidates for the AI Daily pipeline — triggered by items.json and producing picks.json. Also use when the user says "pick today's stories", "rank these", or "choose the top 3" in an AI Daily run-dir, even without naming this skill.
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

## Primary Source URL — choose the canonical announcement, not the news article

For each pick, identify the URL where the original announcement / docs / repo lives — the page the news article is *reporting on*. Examples:

- A vendor blog post (e.g., `openai.com/blog/...`, `anthropic.com/news/...`)
- A GitHub repository or release page (e.g., `github.com/deepseek-ai/...`)
- An official docs page or release notes
- An academic paper landing page (arxiv abstract page, not the PDF)

If the news article doesn't link a clear primary source, set `primary_source_url` to the same URL as the news article. Do not invent URLs you can't see in the article body.

## Output

Write to `<run-dir>/picks.json`. Schema: `pipeline/schemas/picks.js`. Must parse cleanly.

- **Exactly 3 picks**, ranked 1 (lead) to 3.
- Each pick:
  - `item_id` — must exist in items.json
  - `rank` — 1, 2, or 3 (lead to supporting story)
  - `angle` — one sentence: the builder-focused hook
  - `rationale` — 1–2 sentences: why this over alternatives
  - `suggested_visuals` — 2–3 short strings (e.g. `["benchmark chart", "API changelog"]`)
  - `primary_source_url` — canonical announcement URL per story (see guidance below)
  - `risk_flags` — any of: `"rumor_only"`, `"single_source"`, `"unverifiable_claim"`, `"potential_copyright"`. Empty if none apply.
- `rejected` — any strong-but-not-picked candidates with a short reason.

## Hard rules

- Never pick an item with `text_extraction_failed: true`.
- Never reference an item_id that doesn't appear in items.json.
- If fewer than 3 usable items exist, stop and report — do not invent a third pick.

## After writing, validate

```bash
node pipeline/validate-json.mjs picks <run-dir>/picks.json
```

The validator prints `OK picks <path>` on success and exits non-zero with field-level errors on failure. Fix errors before handing off to `yt-script`.
