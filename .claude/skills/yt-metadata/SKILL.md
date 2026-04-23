---
name: yt-metadata
description: Generate YouTube title, description with chapter timestamps, and tags for today's AI Daily video. Use after script.md + timings.json exist.
---

# yt-metadata

Write `<run-dir>/metadata.txt` for manual YouTube upload.

## Inputs

- `<run-dir>/script.md`
- `<run-dir>/picks.json`
- `<run-dir>/timings.json`

## Output

Write `<run-dir>/metadata.txt` in exactly this format:

```
TITLE: <title>

DESCRIPTION:
<1-sentence hook>

Chapters:
00:00 Intro
<MM:SS> Story 1 title
<MM:SS> Story 2 title
<MM:SS> Story 3 title
<MM:SS> Outro

Sources:
- <url 1>
- <url 2>
- <url 3>

TAGS: tag1, tag2, tag3, ...
```

### Title rules

- Max 60 characters.
- Lead with the specific subject of the lead story. Optional date suffix `| AI Daily YYYY-MM-DD` if it fits.
- No clickbait, no excessive caps, no `!!!`.

### Chapters

Take each scene's `start_sec` from `timings.json` and format as `MM:SS` (floor to seconds).

### Tags

8–12 tags, comma-separated, lowercase, no hashtags. Mix broad (`ai news`, `llm`) + specific (product names from the script).

## Hard rules

- Chapter timestamps must match `timings.json` exactly.
- Every URL in Sources must appear in the script's SOURCES section.
- No emoji.
