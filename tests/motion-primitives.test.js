import { describe, it, expect } from 'vitest';
import { formatBigNumber, chunkPhrases } from '../assets/motion-primitives.js';

describe('formatBigNumber', () => {
  it('formats integers with no suffix below 1k', () => {
    expect(formatBigNumber(150)).toBe('150');
  });
  it('uses K suffix for thousands', () => {
    expect(formatBigNumber(1500)).toBe('1.5K');
  });
  it('uses M for millions', () => {
    expect(formatBigNumber(1_600_000)).toBe('1.6M');
  });
  it('uses B for billions', () => {
    expect(formatBigNumber(1_600_000_000)).toBe('1.6B');
  });
  it('uses T for trillions', () => {
    expect(formatBigNumber(1_600_000_000_000)).toBe('1.6T');
  });
  it('preserves decimal values < 1', () => {
    expect(formatBigNumber(0.14)).toBe('0.14');
  });
  it('preserves decimal model versions like 5.5', () => {
    expect(formatBigNumber(5.5)).toBe('5.5');
  });
});

describe('chunkPhrases', () => {
  it('splits at long pauses (>350ms gap)', () => {
    const words = [
      { text: 'Hello', start: 0, end: 0.5 },
      { text: 'world.', start: 0.55, end: 1.0 },
      { text: 'Next', start: 1.5, end: 2.0 },
    ];
    const phrases = chunkPhrases(words);
    expect(phrases.length).toBe(2);
    expect(phrases[0].text).toBe('Hello world.');
    expect(phrases[1].text).toBe('Next');
  });

  it('splits at sentence-ending punctuation', () => {
    const words = [
      { text: 'One.', start: 0, end: 0.4 },
      { text: 'Two.', start: 0.45, end: 0.85 },
      { text: 'Three.', start: 0.9, end: 1.3 },
    ];
    const phrases = chunkPhrases(words);
    expect(phrases.length).toBe(3);
  });

  it('preserves start/end timestamps from constituent words', () => {
    const words = [
      { text: 'One', start: 0, end: 0.3 },
      { text: 'two', start: 0.35, end: 0.7 },
    ];
    const phrases = chunkPhrases(words);
    expect(phrases[0].start_sec).toBe(0);
    expect(phrases[0].end_sec).toBe(0.7);
  });
});
