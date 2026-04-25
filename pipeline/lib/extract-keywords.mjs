const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','of','to','in','on','at','by','for','with','as','is','are','was','were','be','been','being','this','that','these','those','it','its','his','her','their','our','your','my','i','you','he','she','they','we','from','up','down','out','over','under','than','so','too','very','can','will','just','about','into','onto','off','also','no','not','do','does','did','have','has','had','said','says','say','one','two','three','today','tomorrow','yesterday'
]);

function isNumberLike(text) {
  return /^[$€£]?\d[\d.,kmbtKMBT%]*$/i.test(text);
}

function isProperNoun(text) {
  return (/^[A-Z][A-Za-z0-9.\-]{1,}$/.test(text) && !/^[A-Z]+$/.test(text))
      || /^[A-Z]{2,}[0-9]*$/.test(text);
}

function score(word) {
  const t = word.text.replace(/[.,;:!?"'()]+$/g, '');
  if (t.length < 2) return 0;
  if (STOPWORDS.has(t.toLowerCase())) return 0;
  if (isNumberLike(t)) return 100;
  if (isProperNoun(t)) return 80;
  if (t.length >= 7) return 30;
  return 0;
}

export function selectEmphases(scenes, words, { perScene = 6 } = {}) {
  const out = [];
  for (const scene of scenes) {
    const sceneWords = words.filter(w => {
      const start = w.start ?? w.start_sec ?? 0;
      return start >= scene.start_sec && start < scene.start_sec + scene.duration_sec;
    });
    const scored = sceneWords
      .map(w => ({ w, s: score(w) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, perScene);
    for (const { w } of scored) {
      const start = w.start ?? w.start_sec ?? 0;
      const end = w.end ?? w.end_sec ?? start + 0.2;
      out.push({
        scene_id: scene.id,
        word: w.text,
        start_sec: start,
        end_sec: end,
        kind: 'kinetic',
      });
    }
    const captionPicks = sceneWords
      .map(w => ({ w, s: score(w) }))
      .filter(x => x.s > 0)
      .sort((a, b) => (a.w.start ?? a.w.start_sec ?? 0) - (b.w.start ?? b.w.start_sec ?? 0))
      .slice(0, 4);
    for (const { w } of captionPicks) {
      const start = w.start ?? w.start_sec ?? 0;
      const end = w.end ?? w.end_sec ?? start + 0.2;
      const isDup = out.some(e => e.scene_id === scene.id && e.word === w.text && e.kind === 'kinetic');
      if (isDup) continue;
      out.push({
        scene_id: scene.id,
        word: w.text,
        start_sec: start,
        end_sec: end,
        kind: 'caption',
      });
    }
  }
  return out;
}
