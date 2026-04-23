import { describe, it, expect } from 'vitest';
import { normalizeForMatching } from '../pipeline/lib/normalize-text.js';

describe('normalizeForMatching', () => {
  it('lowercases ASCII', () => {
    expect(normalizeForMatching('Hello WORLD')).toBe('hello world');
  });

  it('collapses whitespace including tabs and newlines', () => {
    expect(normalizeForMatching('a\t\n  b')).toBe('a b');
  });

  it('replaces non-breaking space with regular space', () => {
    expect(normalizeForMatching('a b')).toBe('a b');
  });

  it('unifies smart quotes', () => {
    expect(normalizeForMatching('“hello”')).toBe('"hello"');
    expect(normalizeForMatching('it’s')).toBe("it's");
  });

  it('unifies dashes and collapses surrounding whitespace', () => {
    expect(normalizeForMatching('a–b')).toBe('a-b');
    expect(normalizeForMatching('a—b')).toBe('a-b');
    expect(normalizeForMatching('a - b')).toBe('a-b');
    expect(normalizeForMatching('a — b')).toBe('a-b');
  });

  it('decodes HTML entities', () => {
    expect(normalizeForMatching('a &amp; b')).toBe('a & b');
    expect(normalizeForMatching('it&#39;s')).toBe("it's");
  });

  it('replaces ellipsis character with three dots', () => {
    expect(normalizeForMatching('wait…')).toBe('wait...');
  });

  it('applies NFKC normalization', () => {
    expect(normalizeForMatching('ﬁne')).toBe('fine');
  });

  it('does NOT normalize numeric paraphrase', () => {
    expect(normalizeForMatching('3x')).not.toBe(normalizeForMatching('three times'));
  });

  it('composed example: two equivalent-but-different strings match', () => {
    const a = 'It’s 3× faster—really.';
    const b = "It's 3× faster - really.";
    expect(normalizeForMatching(a)).toBe(normalizeForMatching(b));
  });
});
