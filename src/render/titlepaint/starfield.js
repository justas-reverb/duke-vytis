// STARFIELD: each letter a constellation -- stars where its strokes turn and end, joined by
// the thread a star chart draws between them.
//
// The stars are the zone's own (decorpaint/starfield.js): a white heart, pale blue arms, a
// blue glow, as four-point twinkles drawn by hand -- the larger at a corner, where two
// strokes meet, the smaller at a stroke's free end -- and in one letter a red giant, the
// decor's Betelgeuse. The thread follows every straight run of the stroke from star to star
// and stops short of each star, so the star stands in its own gap and the figure reads as
// stars joined up, not a wire with knots on it (the pixel-art-in-code rule). The thread is
// four pixels -- a pale core two wide between two of the decor's thread blue -- where the
// decor's is one: at the title's size a thin line vanished among the backdrop's own stars,
// and at three the word was the faintest of the twelve at a glance.
//
// Lights take no dark outline; the glow is what separates them.
//
// AGAINST THE STARFIELD. Deep teal space (#002222 to #004444, luminance ~0.01-0.03) full of
// small stars. These stars are larger and brighter than any of the backdrop's, and the
// threads -- long, straight and continuous, which no backdrop star is -- carry the letter.
//
// THE ENTRANCE: each letter's stars light up, dim then bright, and then the thread joins
// them, one letter after another.

import { layoutWord, straightRuns, Pix, hash2, overdue, drain } from './util.js';

// 0 dim glow, 1 glow, 2 arm, 3 heart: the decor's GLOW, ARM, CORE with a dimmer glow under.
const STAR = ['#5f7fc0', '#9fbfff', '#cfe0ff', '#ffffff'];
const RED = ['#b0502a', '#ff9050', '#ffb070', '#ffe0c0'];
const THREAD = ['#a4c0ee', '#e4eeff'];
const GLOW = '#4f78d8';

// By hand. The big star at a corner, the small at an end.
const BIG = [
  '....1....',
  '....1....',
  '....2....',
  '...232...',
  '112333211',
  '...232...',
  '....2....',
  '....1....',
  '....1....',
];
const SMALL = [
  '...1...',
  '...2...',
  '..232..',
  '1233321',
  '..232..',
  '...2...',
  '...1...',
];

export const METRICS = { K: 11, R: 5.5, gap: 12, pad: [18, 18, 18, 18], reach: 4 };

function chart(plan) {
  const stars = [];
  const lines = [];
  plan.letters.forEach((L, li) => {
    const runs = straightRuns(L);
    const seen = new Map();
    for (const r of runs) {
      lines.push(r);
      for (const k of [r.a, r.b]) {
        const nd = L.nodes[k];
        const key = nd.c + ',' + nd.r;
        seen.set(key, { x: nd.x, y: nd.y, n: (seen.get(key)?.n || 0) + 1, li });
      }
    }
    for (const s of seen.values()) stars.push(s);
  });
  // One red giant: the first star of the letter the hash picks.
  const redLi = Math.floor(hash2(plan.letters.length, 3, 91) * plan.letters.length);
  const red = stars.find((s) => s.li === redLi && s.n >= 2) || stars.find((s) => s.li === redLi);
  return { stars, lines, red };
}

function draw(plan, { withLines = true, dim = 0 } = {}) {
  const p = new Pix(plan.w, plan.h);
  const { stars, lines, red } = chart(plan);
  if (withLines) {
    for (const r of lines) {
      const len = Math.hypot(r.bx - r.ax, r.by - r.ay), ux = (r.bx - r.ax) / len, uy = (r.by - r.ay) / len;
      const gap = 6;                            // stop this far short of each star [px]
      if (len <= 2 * gap) continue;
      const n = Math.ceil((len - 2 * gap) * 2);
      for (let k = 0; k <= n; k++) {
        const a = gap + (len - 2 * gap) * k / n;
        const x = r.ax - 0.5 + ux * a, y = r.ay - 0.5 + uy * a;
        // Four pixels across: a pale core two wide and a thread-blue pixel either side.
        const X = Math.round(x), Y = Math.round(y);
        const sx = Math.abs(uy) > Math.abs(ux) ? 1 : 0, sy = 1 - sx;
        for (const o of [-1, 2]) {
          if (p.alpha(X + sx * o, Y + sy * o) < 255) p.set(X + sx * o, Y + sy * o, THREAD[0]);
        }
        p.set(X, Y, THREAD[1]);
        p.set(X + sx, Y + sy, THREAD[1]);
      }
    }
  }
  for (const s of stars) {
    const art = s.n >= 2 ? BIG : SMALL;
    const ramp = s === red ? RED : STAR;
    const o = (art.length - 1) / 2;
    const x0 = Math.round(s.x - 0.5) - o, y0 = Math.round(s.y - 0.5) - o;
    for (let j = 0; j < art.length; j++) {
      for (let i = 0; i < art[j].length; i++) {
        const c = art[j][i];
        if (c === '.') continue;
        p.set(x0 + i, y0 + j, ramp[Math.max(0, Number(c) - dim)]);
      }
    }
  }
  return p;
}

/** A glow round everything: two dithered rings of saturated blue on empty pixels. */
function* glow(p) {
  const { w, h, data } = p;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = data[i * 4 + 3] ? 1 : 0;
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      if ((x & 63) === 63 && overdue()) yield;
      if (src[y * w + x]) continue;
      let best = 99;
      for (let dy = -2; dy <= 2; dy++) {
        const Y = y + dy;
        if (Y < 0 || Y >= h) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const X = x + dx;
          if (X >= 0 && X < w && src[Y * w + X]) best = Math.min(best, dx * dx + dy * dy);
        }
      }
      if (best > 4) continue;
      const d = Math.sqrt(best) + (((x + y) & 1) ? 0.4 : -0.4);
      p.set(x, y, GLOW, d < 1.5 ? 0.5 : 0.22);
    }
  }
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    frames: [
      // A generator, so the scoreboard can cut the glow's search into slices; the zone
      // titles run it to its end in one step, with nothing to yield (cosmos.js).
      function* chartered() { const p = draw(plan); if (overdue()) yield; return yield* glow(p); },
      // The entrance frames are generators too, and every step inside them sliced: they were
      // drained in one piece, and zonetitles.js paints them under a budget now.
      () => draw(plan, { withLines: false, dim: 2 }),
      function* () { const p = draw(plan, { withLines: false }); if (overdue()) yield; return yield* glow(p); },
    ],
    seq: [[1, 0.05], [2, 0.07]],
    stagger: 0.05,
  };
}
