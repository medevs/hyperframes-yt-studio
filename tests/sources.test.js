import { describe, it, expect } from 'vitest';
import { isJsRenderedDomain } from '../pipeline/lib/sources.js';

describe('isJsRenderedDomain', () => {
  const domains = ['openai.com', 'anthropic.com'];

  it('matches an exact host', () => {
    expect(isJsRenderedDomain('https://openai.com/blog/x', domains)).toBe(true);
  });

  it('matches a subdomain', () => {
    expect(isJsRenderedDomain('https://www.openai.com/blog/x', domains)).toBe(true);
    expect(isJsRenderedDomain('https://research.anthropic.com/p', domains)).toBe(true);
  });

  it('does not match an unrelated host', () => {
    expect(isJsRenderedDomain('https://example.com/', domains)).toBe(false);
  });

  it('does not match a host that merely contains the domain string', () => {
    expect(isJsRenderedDomain('https://notopenai.com/', domains)).toBe(false);
    expect(isJsRenderedDomain('https://openai.com.evil.example/', domains)).toBe(false);
  });

  it('is case-insensitive on the host', () => {
    expect(isJsRenderedDomain('https://OpenAI.com/blog', domains)).toBe(true);
  });

  it('returns false for a malformed URL', () => {
    expect(isJsRenderedDomain('not a url', domains)).toBe(false);
  });

  it('returns false for an empty domain list', () => {
    expect(isJsRenderedDomain('https://openai.com/', [])).toBe(false);
  });
});
