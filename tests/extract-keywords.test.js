import { describe, it, expect } from 'vitest';
import { selectEmphases } from '../pipeline/lib/extract-keywords.mjs';

const fakeWords = [
  { text: 'OpenAI', start: 0.0, end: 0.6 },
  { text: 'shipped', start: 0.7, end: 1.1 },
  { text: 'GPT', start: 1.2, end: 1.5 },
  { text: '5.5', start: 1.55, end: 2.0 },
  { text: 'today', start: 2.1, end: 2.5 },
  { text: 'with', start: 2.6, end: 2.8 },
  { text: 'cheaper', start: 2.9, end: 3.4 },
  { text: 'tokens', start: 3.5, end: 4.0 },
];

const sceneIntro = { id: 'intro', kind: 'intro', start_sec: 0, duration_sec: 5 };

describe('selectEmphases', () => {
  it('caps emphases per scene at 6', () => {
    const longWords = Array.from({ length: 100 }, (_, i) => ({
      text: 'WORD' + i, start: i * 0.1, end: i * 0.1 + 0.05,
    }));
    const r = selectEmphases([sceneIntro], longWords);
    const intro = r.filter(e => e.scene_id === 'intro' && e.kind === 'kinetic');
    expect(intro.length).toBeLessThanOrEqual(6);
  });

  it('emphasizes numbers (e.g., 5.5)', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    expect(r.find(e => e.word === '5.5')).toBeTruthy();
    expect(r.find(e => e.word === '5.5').kind).toBe('kinetic');
  });

  it('emphasizes proper nouns (e.g., OpenAI, GPT)', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    expect(r.find(e => e.word === 'OpenAI')).toBeTruthy();
  });

  it('does not emphasize stopwords', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    expect(r.find(e => e.word === 'with')).toBeFalsy();
  });

  it('writes correct timing fields from word arrays', () => {
    const r = selectEmphases([sceneIntro], fakeWords);
    const five = r.find(e => e.word === '5.5');
    expect(five.start_sec).toBe(1.55);
    expect(five.end_sec).toBe(2.0);
  });

  it('assigns emphases to the correct scene by timestamp', () => {
    const scenes = [
      { id: 'intro', kind: 'intro', start_sec: 0, duration_sec: 2 },
      { id: 'story-1', kind: 'story', start_sec: 2, duration_sec: 3 },
    ];
    const r = selectEmphases(scenes, fakeWords);
    expect(r.find(e => e.word === 'OpenAI').scene_id).toBe('intro');
    expect(r.find(e => e.word === 'cheaper')?.scene_id).toBe('story-1');
  });
});
