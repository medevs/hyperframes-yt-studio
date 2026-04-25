// =========================================================================
// Pure helpers (also exported for vitest)
// =========================================================================

export function formatBigNumber(n) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '')  + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '')  + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '')  + 'K';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function chunkPhrases(words, { gapMs = 350 } = {}) {
  const phrases = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const next = words[i + 1];
    const endsSentence = /[.!?]$/.test(w.text);
    const gap = next ? (next.start - w.end) : 0;
    if (endsSentence || gap * 1000 > gapMs || !next) {
      phrases.push({
        text: cur.map(x => x.text).join(' '),
        start_sec: cur[0].start,
        end_sec: cur[cur.length - 1].end,
        words: cur,
      });
      cur = [];
    }
  }
  return phrases;
}

// =========================================================================
// Browser-side runtime — registers tweens on a master GSAP timeline
// =========================================================================

if (typeof window !== 'undefined') {

  window.registerKineticTweens = function(tl, root = document) {
    const kws = root.querySelectorAll('.kw[data-emphasize-at]');
    kws.forEach(el => {
      const at = parseFloat(el.dataset.emphasizeAt);
      tl.from(el, { y: '0.4em', opacity: 0, scale: 0.92, duration: 0.18, ease: 'back.out(1.7)' }, at);
      tl.to(el, { backgroundSize: '100% 4px', duration: 0.4, ease: 'power3.out' }, at + 0.05);
    });
  };

  window.registerCountUps = function(tl, root = document) {
    const els = root.querySelectorAll('.count-up[data-target]');
    els.forEach(el => {
      const target = parseFloat(el.dataset.target);
      const at = parseFloat(el.dataset.at);
      const dur = parseFloat(el.dataset.duration || '1.0');
      const proxy = { v: 0 };
      tl.to(proxy, {
        v: target,
        duration: dur,
        ease: 'expo.out',
        onUpdate: () => { el.textContent = window.formatBigNumber(proxy.v); },
      }, at);
    });
  };

  window.registerScrollFrames = function(tl, root = document) {
    const frames = root.querySelectorAll('.scroll-frame[data-distance]');
    frames.forEach(frame => {
      const img = frame.querySelector('img');
      if (!img) return;
      const at = parseFloat(frame.dataset.at);
      const dur = parseFloat(frame.dataset.duration);
      const dist = parseFloat(frame.dataset.distance);
      tl.fromTo(img, { y: 0 }, { y: -Math.abs(dist), duration: dur, ease: 'none' }, at);
    });
  };

  window.registerStatBars = function(tl, root = document) {
    const bars = root.querySelectorAll('.stat-bar[data-target-pct]');
    bars.forEach(bar => {
      const fill = bar.querySelector('.bar-fill');
      const at = parseFloat(bar.dataset.at);
      const pct = parseFloat(bar.dataset.targetPct);
      tl.fromTo(fill, { width: '0%' }, { width: pct + '%', duration: 0.6, ease: 'power3.out' }, at);
    });
  };

  window.registerCaptions = function(tl, root = document) {
    const caps = root.querySelectorAll('.caption-line[data-at]');
    caps.forEach(cap => {
      const at = parseFloat(cap.dataset.at);
      const end = parseFloat(cap.dataset.end);
      tl.fromTo(cap, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: 'power3.out' }, at);
      tl.to(cap, { opacity: 0, duration: 0.15, ease: 'power2.in' }, end - 0.15);
      // Deterministic hard-kill at end so seeking past the caption window doesn't leave it visible.
      tl.set(cap, { opacity: 0 }, end);
    });
  };

  window.formatBigNumber = formatBigNumber;
  window.chunkPhrases = chunkPhrases;
}
