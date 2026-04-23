import { describe, it, expect } from 'vitest';
import { checkClaim, verifyAll } from '../pipeline/verify-claims.js';

describe('checkClaim', () => {
  it('passes when quote appears verbatim in source', () => {
    const r = checkClaim({
      supporting_quote: 'the sky is blue',
      sourceText: 'Everyone knows the sky is blue on a clear day.',
    });
    expect(r.pass).toBe(true);
  });

  it('passes despite smart-quote/dash/NBSP typographic differences', () => {
    const r = checkClaim({
      supporting_quote: 'it’s 3—times faster',
      sourceText: "it's 3-times faster",
    });
    expect(r.pass).toBe(true);
  });

  it('fails on numeric paraphrase (semantic)', () => {
    const r = checkClaim({
      supporting_quote: '3x faster',
      sourceText: 'three times faster',
    });
    expect(r.pass).toBe(false);
  });

  it('fails when quote is not in source at all', () => {
    const r = checkClaim({
      supporting_quote: 'purely invented',
      sourceText: 'totally different content',
    });
    expect(r.pass).toBe(false);
  });
});

describe('verifyAll', () => {
  it('returns per-claim results', () => {
    const claims = [
      { id: 1, supporting_quote: 'a b c', source_item_id: 'x' },
      { id: 2, supporting_quote: 'not here', source_item_id: 'x' },
    ];
    const sources = { x: 'a b c d e' };
    const r = verifyAll(claims, sources);
    expect(r.pass).toBe(false);
    expect(r.results[0].pass).toBe(true);
    expect(r.results[1].pass).toBe(false);
  });
});
