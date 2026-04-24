---
date: 2026-04-23
target_duration_sec: 240
voice: af_nova
word_count: 598
---

## INTRO
Today on AI Daily: Mixtral goes open-weights and fits on one H100, Anthropic ships an Agents API that replaces your orchestration code, and Gemini 2.5 Pro Coder sets a new SWE-bench record.

## STORY 1 — Mixtral 8x30B open-weights
Mistral released Mixtral 8x30B today under the Apache 2.0 license[^1]. It's a mixture-of-experts model with 240 billion total parameters and 60 billion active per token[^2]. On MMLU it scores 87.4, beating Llama 3.1 405B by 1.2 points at roughly one-seventh the active parameter count[^3]. The practical change for builders: in 4-bit quantization, it fits on a single H100 with 80 gigabytes of VRAM at 12 tokens per second[^4]. That's a new floor for what you can self-host on one box. For anyone shipping AI products who needs local inference — for latency, privacy, or cost — your options just got meaningfully better.

## STORY 2 — Anthropic Agents API
Anthropic today launched its Agents API, which handles tool-call loops, memory, and step budgeting server-side[^5]. The pitch is simple: most teams building on Claude end up writing the same orchestration code, so Anthropic baked it in. A code comparison shown at launch reduced 180 lines of custom orchestration to 22 lines of declaration[^6]. Pricing is the same per-token rate as the underlying models, plus a flat 0.002 dollars per tool-call orchestration fee[^7]. For builders: if you're running agents on Claude today, this collapses a real maintenance burden. The new step-budget primitive is also worth attention — capping agents by tool calls or wall-clock time has been a pain point.

## STORY 3 — Gemini 2.5 Pro Coder
DeepMind released Gemini 2.5 Pro Coder, scoring 91.2 percent on SWE-bench Verified[^8]. That's a 14-point improvement over the Gemini 2.5 Pro baseline of 77.1 percent[^9]. The context window is expanded to 2 million tokens specifically for codebase navigation[^10]. They're also releasing the evaluation harness and the 8,400 held-out SWE-bench Verified problems used in the evaluation[^11], which means the number is independently checkable. For builders working on long-horizon coding agents, a 2M context plus a prebuilt symbol index is a concrete upgrade — less plumbing, more reasoning.

## OUTRO
That's AI Daily for April 23rd. Three links in the description. Subscribe if this saved you an hour of scrolling.

## SOURCES
[^1]: https://mistral.ai/news/mixtral-8x30b-open-weights (item_id: hn-40010003)
[^2]: https://mistral.ai/news/mixtral-8x30b-open-weights (item_id: hn-40010003)
[^3]: https://mistral.ai/news/mixtral-8x30b-open-weights (item_id: hn-40010003)
[^4]: https://mistral.ai/news/mixtral-8x30b-open-weights (item_id: hn-40010003)
[^5]: https://www.anthropic.com/news/claude-4-7-agents-api (item_id: hn-40010002)
[^6]: https://www.anthropic.com/news/claude-4-7-agents-api (item_id: hn-40010002)
[^7]: https://www.anthropic.com/news/claude-4-7-agents-api (item_id: hn-40010002)
[^8]: https://deepmind.google/blog/gemini-2-5-pro-coder (item_id: company-google-deepmind-blog-41)
[^9]: https://deepmind.google/blog/gemini-2-5-pro-coder (item_id: company-google-deepmind-blog-41)
[^10]: https://deepmind.google/blog/gemini-2-5-pro-coder (item_id: company-google-deepmind-blog-41)
[^11]: https://deepmind.google/blog/gemini-2-5-pro-coder (item_id: company-google-deepmind-blog-41)
