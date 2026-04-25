# AI Daily — Screenshot Quality (Spec A)

**Date:** 2026-04-25
**Status:** Draft for user review
**Scope:** Replace current screenshot capture (which produces cookie-banner-dominated, news-aggregator screenshots) with a system that produces topical, primary-source captures — and degrades gracefully when capture fails.

## Why

The 2026-04-24-1 run shipped three story scenes whose screenshots all showed the same problem: TechCrunch / Ars Technica cookie-consent modals covering the article body. Even when the page rendered, the news-aggregator article isn't the "right" image for the story — viewers would learn more from the original announcement page (OpenAI's blog, DeepSeek's GitHub, Mozilla's post). The pipeline today doesn't know about primary sources and doesn't suppress overlays.

## Decisions (locked)

| Area | Decision |
| --- | --- |
| URL source | Picker LLM (`yt-research`) emits `primary_source_url` per pick alongside the existing `item_id` |
| Banner suppression | Inject I-Don't-Care-About-Cookies CSS blocklist at page load; per-domain override slot in `config.json` |
| Click logic | None — never click a cookie/consent button. Only hide via CSS. |
| Bot evasion | Realistic Chrome UA + 1920×1080 viewport + page.waitForLoadState equivalents + 5 s post-load settle |
| Lazy-load handling | Scroll the page programmatically before capture so lazy hero images paint |
| Capture geometry | 1200 px wide × min(document height, 3000 px) tall — feeds Spec B's scrolling animation |
| Failure detection | Lint check rejects PNG that is >85% one color OR has an element matching banner-shape heuristics covering >40% of pixels |
| Fallback chain | (1) Primary URL og:image → (2) news article og:image → (3) generated headline card matching DESIGN.md |
| Output schema | `screenshots-manifest.json` gains `width`, `height`, `source_kind` ∈ {`primary`, `news`, `og_image`, `headline_card`} |

## Risks accepted

- **Blocklist false positives.** The IDCAC ruleset occasionally hides legitimate page elements that share class names with banners. Mitigated by per-domain override slot + manual review of captured PNG before render gate.
- **Primary-source LLM error.** `yt-research` may emit a `primary_source_url` that doesn't exist or is irrelevant. Mitigated by fallback chain; if all fall through to headline card, we still ship a clean visual.
- **Bot-blocking sites.** Some vendor sites (notably anti-scraping CDNs) will reject Chromium even with realistic UA. Accepted — fallback chain handles it.

## Architecture

### Pipeline changes (sequential)

1. **`yt-research` skill prompt update.** Existing skill picks 3 stories from `items.json` → `picks.json`. Add a single field per pick: `primary_source_url`. Prompt instruction: "If the article describes an announcement or release, find the URL where the original announcement / docs / repo lives (e.g., openai.com/blog/..., github.com/..., the vendor's release notes). If no clear primary source, set this to the same URL as the news article."

2. **`pipeline/capture-screenshots.mjs` rewrite.** Per pick:
   1. Read `primary_source_url`. If absent, use article URL.
   2. Launch Puppeteer page with realistic UA + 1920×1080 viewport.
   3. Inject IDCAC CSS via `page.addStyleTag()` *before* `page.goto()`.
   4. `goto(url, { waitUntil: 'networkidle2', timeout: 25000 })`.
   5. Apply per-domain overrides from `config.json` if present.
   6. Scroll-then-settle: scroll page top→bottom in 4 steps, wait 500 ms each, scroll back to top.
   7. Capture screenshot at full document height, capped at 3000 px, 1200 px wide.
   8. Run quality check (see below). If fails → step 9. If passes → done.
   9. Fallback to OG image of primary URL. If fails → OG image of news article. If fails → render headline card via the existing CSS pipeline.
   10. Write entry to `screenshots-manifest.json` with `source_kind`.

3. **New helper: `pipeline/lib/screenshot-quality.mjs`.** Two checks:
   - **Monochrome check:** decode PNG, compute % of pixels within ±8 of the dominant color. Reject if >85%.
   - **Banner-shape check:** look for a vertically-centered or top-anchored rectangle of ≥40% page area whose color contrast with surrounding pixels exceeds threshold (modal-overlay signature).

4. **New helper: `pipeline/lib/og-image.mjs`.** Fetch URL, parse `<meta property="og:image">`, follow it, validate content-type is image/*, save to `screenshots/<item_id>-og.<ext>`. No browser involved.

5. **New helper: `pipeline/lib/headline-card.mjs`.** Render a 1200×1200 PNG using the existing Puppeteer instance: black background, accent left rule, story headline at hero size, source domain as chip, scene number marker. Style imports from a new `assets/headline-card.css` matching DESIGN.md tokens.

6. **`config.json` schema extension.** Add optional `screenshot_overrides` map:
   ```json
   "screenshot_overrides": {
     "openai.com": {
       "hide": [".cookie-banner", "#newsletter-modal"],
       "wait_for": ".article-body",
       "timeout_ms": 30000
     }
   }
   ```
   Schema validation in `pipeline/schemas/config.js`.

7. **`pipeline/lint.mjs` extension.** Add `screenshot_quality` check that re-validates each PNG in `screenshots-manifest.json` using `screenshot-quality.mjs`. Run as part of `npx hyperframes lint` invocation in the pipeline.

### Files touched

- `pipeline/capture-screenshots.mjs` — rewritten
- `pipeline/lib/screenshot-quality.mjs` — new
- `pipeline/lib/og-image.mjs` — new
- `pipeline/lib/headline-card.mjs` — new
- `assets/headline-card.css` — new
- `pipeline/schemas/config.js` — extended
- `pipeline/schemas/screenshots-manifest.js` — extended (`width`, `height`, `source_kind`)
- `config.json` — extended with empty `screenshot_overrides: {}`
- `pipeline/lint.mjs` — adds `screenshot_quality` rule
- `.claude/skills/yt-research/SKILL.md` — prompt addition for `primary_source_url`
- `pipeline/schemas/picks.js` — adds `primary_source_url: string`
- `vendor/idcac-rules.css` — checked-in copy of the I-Don't-Care-About-Cookies stylesheet (one-time fetch, version-pinned)

### Data flow

```
items.json
   │
   ▼
yt-research skill (extended prompt)
   │
   ▼
picks.json  ── now includes primary_source_url per pick
   │
   ▼
capture-screenshots.mjs
   ├─ try: primary URL via Puppeteer + IDCAC + overrides
   ├─ quality check
   ├─ fallback: primary URL og:image
   ├─ fallback: news article og:image
   └─ fallback: generated headline card
   │
   ▼
screenshots/*.png + screenshots-manifest.json (with source_kind)
   │
   ▼
lint screenshot_quality rule (re-verifies)
```

## Testing

- **Unit:** `screenshot-quality.mjs` against fixture PNGs (clean article, full-cookie-banner, mostly-white, headline card). Each must classify correctly.
- **Unit:** `og-image.mjs` against fixture HTML (with og:image, without, with broken og:image URL).
- **Unit:** Schema validators reject invalid `screenshot_overrides` shapes.
- **Integration:** Run `capture-screenshots.mjs` against a fixture `picks.json` with 3 known-good primary URLs (OpenAI blog, a GitHub repo, a Mozilla blog post). Assert all 3 produce `source_kind: "primary"` and pass quality check.
- **Integration (intentional failure):** picks.json with one URL that 404s, one that's bot-blocked, one with a giant cookie banner. Assert fallback chain produces `og_image` or `headline_card` for all three.
- **Re-run today's run** (2026-04-24-1) to verify the GPT-5.5, DeepSeek V4, Mythos screenshots now show topical content.

## Out of scope

- Cookie-banner *clicking* (rejected — wrong-click bugs)
- Captcha solving
- Authenticated content (paywalls, login walls)
- Screenshot annotations / call-out arrows (could be added later in Spec B's territory)
- Multiple screenshots per story (one screenshot per scene for v1)

## Open questions

None. All engineering decisions made.
