import { normalizeForMatching } from './lib/normalize-text.js';

function tokenize(s) {
  return normalizeForMatching(s).split(/\s+/).filter(Boolean);
}

const SCENE_ORDER = ['intro', 'story-1', 'story-2', 'story-3', 'outro'];
const SCENE_KIND = { 'intro': 'intro', 'story-1': 'story', 'story-2': 'story', 'story-3': 'story', 'outro': 'outro' };
const SCENE_NUM = { 'story-1': 1, 'story-2': 2, 'story-3': 3 };

export function alignSectionsToWords(sections, words) {
  const normWords = words.map(w => ({ ...w, norm: normalizeForMatching(w.text) }));
  let wi = 0;
  const scenes = [];
  for (const id of SCENE_ORDER) {
    const text = sections[id];
    if (!text) continue;
    const tokens = tokenize(text);
    if (tokens.length === 0) continue;

    // Find the first occurrence of tokens[0] in normWords at or after wi.
    const firstWord = tokens[0];
    let start = -1;
    for (let j = wi; j < normWords.length; j++) {
      if (normWords[j].norm === firstWord) { start = j; break; }
    }
    if (start === -1) throw new Error(`cannot locate section ${id} starting with "${firstWord}" at word index >= ${wi}`);

    const end = Math.min(start + tokens.length, normWords.length) - 1;
    const scene = {
      id,
      kind: SCENE_KIND[id],
      start_sec: normWords[start].start,
      duration_sec: normWords[end].end - normWords[start].start,
      word_count: end - start + 1,
    };
    if (SCENE_NUM[id]) scene.story_num = SCENE_NUM[id];
    scenes.push(scene);
    wi = end + 1;
  }

  const total = scenes.reduce((t, s) => Math.max(t, s.start_sec + s.duration_sec), 0);
  return {
    scenes,
    total_duration_sec: total,
    words: words.map(w => ({ text: w.text, start_sec: w.start, end_sec: w.end })),
  };
}
