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
    // Whisper sometimes drops apostrophes ("Anthropic's" -> "Anthropics"), so also
    // accept matches after both sides strip apostrophes.
    const firstWord = tokens[0];
    const firstWordNoAp = firstWord.replace(/'/g, '');
    const wordEq = (a, b) => a === b || a.replace(/'/g, '') === b.replace(/'/g, '');
    let start = -1;
    for (let j = wi; j < normWords.length; j++) {
      const w = normWords[j].norm;
      if (w === firstWord || w.replace(/'/g, '') === firstWordNoAp) { start = j; break; }
    }

    // Fallback: Whisper homophone or spelling drift on the first word
    // (e.g. "Holley" → "Holly"). Walk the transcript looking for a position where
    // at least 2 of the next 3 section tokens match the next 3 transcript tokens —
    // that's strong enough evidence of a section boundary, even if tokens[0] mis-transcribed.
    if (start === -1 && tokens.length >= 2) {
      const probe = tokens.slice(0, Math.min(3, tokens.length));
      const minHits = probe.length >= 3 ? 2 : 2; // require ≥2 of first 3 (or both of first 2)
      for (let j = wi; j + probe.length - 1 < normWords.length; j++) {
        let hits = 0;
        for (let k = 0; k < probe.length; k++) {
          if (wordEq(normWords[j + k].norm, probe[k])) hits++;
        }
        if (hits >= minHits) {
          start = j;
          console.warn(`compute-timings: fuzzy-anchored section ${id} at word ${j} ("${normWords[j].text}") — first token "${firstWord}" did not match exactly, ${hits}/${probe.length} of next ${probe.length} tokens match.`);
          break;
        }
      }
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
