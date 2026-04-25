import { describe, it, expect } from 'vitest';
import { scriptToNarration, extractSections } from '../pipeline/lib/script-to-narration.mjs';

const SAMPLE = `---
date: 2026-04-23
---

## INTRO

OpenAI launched **GPT-5.5** today[^1].

## STORY 1 — Gemini

Google shipped *Gemini 2.5*.

## STORY 2 — Claude

Anthropic released Claude Opus 4.7.

## STORY 3 — Meta

Meta open-sourced a new model.

## OUTRO

That's it for today.

## SOURCES

[^1]: https://openai.com/blog/gpt-5-5
`;

describe('scriptToNarration', () => {
  it('strips frontmatter, footnotes, emphasis, and the SOURCES section', () => {
    const out = scriptToNarration(SAMPLE);
    expect(out).not.toContain('---');
    expect(out).not.toContain('[^1]');
    expect(out).not.toContain('**');
    expect(out).not.toContain('SOURCES');
    expect(out).not.toContain('https://openai.com');
    expect(out).toContain('GPT-5.5');
    expect(out).toContain('Gemini 2.5');
  });

  it('replaces section headers with paragraph breaks', () => {
    const out = scriptToNarration(SAMPLE);
    expect(out).not.toContain('##');
    expect(out).toMatch(/today\.\n\n/);
  });

  it('always ends with a single trailing newline', () => {
    const out = scriptToNarration(SAMPLE);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});

describe('extractSections', () => {
  it('returns one entry per known section header, with cleaned content', () => {
    const sections = extractSections(SAMPLE);
    expect(Object.keys(sections).sort()).toEqual(['intro', 'outro', 'story-1', 'story-2', 'story-3']);
    expect(sections.intro).toBe('OpenAI launched GPT-5.5 today.');
    expect(sections['story-2']).toBe('Anthropic released Claude Opus 4.7.');
    expect(sections.outro).toBe("That's it for today.");
  });

  it('omits the SOURCES section', () => {
    const sections = extractSections(SAMPLE);
    expect(sections).not.toHaveProperty('sources');
  });

  it('returns an empty object when no recognized headers are present', () => {
    expect(extractSections('just some text\nwith no headers')).toEqual({});
  });
});
