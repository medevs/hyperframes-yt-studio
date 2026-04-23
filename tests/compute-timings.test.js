import { describe, it, expect } from 'vitest';
import { alignSectionsToWords } from '../pipeline/compute-timings.js';

const words = [
  { text: 'Good', start: 0.0, end: 0.3 },
  { text: 'morning', start: 0.3, end: 0.9 },
  { text: 'today', start: 1.0, end: 1.4 },
  { text: 'a', start: 1.5, end: 1.6 },
  { text: 'test', start: 1.7, end: 2.1 },
  { text: 'story', start: 2.3, end: 2.7 },
  { text: 'one', start: 2.8, end: 3.2 },
  { text: 'body', start: 3.3, end: 3.7 },
  { text: 'thanks', start: 4.0, end: 4.4 },
];

describe('alignSectionsToWords', () => {
  it('assigns contiguous word ranges to sections', () => {
    const sections = {
      'intro':   'Good morning today',
      'story-1': 'a test story one body',
      'outro':   'Thanks',
    };
    const out = alignSectionsToWords(sections, words);
    expect(out.scenes[0]).toMatchObject({ id: 'intro', start_sec: 0, duration_sec: 1.4 });
    expect(out.scenes[1]).toMatchObject({ id: 'story-1' });
    expect(out.scenes[2]).toMatchObject({ id: 'outro' });
    expect(out.total_duration_sec).toBeGreaterThan(0);
  });

  it("throws when a section's first word is not found in sequence", () => {
    const sections = { 'intro': 'completely unrelated text' };
    expect(() => alignSectionsToWords(sections, words)).toThrow();
  });
});
