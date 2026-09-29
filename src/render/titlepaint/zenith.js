// ZENITH: radiant gold -- letters of polished gold, with the light of the top of the tower
// pouring out from behind them.
//
// Each letter is a gold bar bent into the letter, with a bevel. Its FACE is shaded like
// polished metal rather than lit from one side: pale where it catches the sky at the top,
// deepening down to a dark horizon line across its middle, then a lighter reflection below
// it -- the band every gold title has, which is what says metal and not yellow paint. Its
// BEVEL, the outer three pixels of the stroke, is shaded by the direction it faces: the
// edges turned to the upper left burn white, those turned away go down to burnt orange. A
// four-point glint sits on the lit corner of a few letters.
//
// The palette is the zone's light shaft (decorpaint/zenith.js: HOT, CORE, INNER, GLOW, OUTER,
// DEEP) carried down into the wall's dark golds, hue-shifted: the lights toward cream, the
// shadows toward red-brown, so the gold never greys.
//
// THE RAYS. Behind the word, a sunburst: wedges of light fanning up and out from behind it
// in stepped, dithered bands, like the lantern halo downtown (decorpaint/downtown
// .js) -- deep saturated golds at low alpha, because pale gold thinned over the zone's blue
// sky lands on grey. They sit only on empty pixels, outside the outline and the shadow, so
// they cannot soften a letter's edge.
//
// AGAINST ZENITH. The sky is a pale blue-grey (#54648a to #8b9fc0, luminance ~0.13-0.33);
// gold is its complement in hue and the face is brighter than it, and a near-black brown
// outline and shadow separate the two wherever the value is close.
//
// THE ENTRANCE: each letter strikes white-hot and cools to gold, one after another, and a
// glint then runs across the whole word.

import { layoutWord, Plan, dropShadowSteps, haloSteps, hash2, rgba, overdue, drain } from './util.js';

const GOLD = [
  '#3a1a08',   // 0 deep shadow, red-brown
  '#7a3a0c',   // 1 shadow
  '#b85e10',   // 2 dark gold
  '#e87a0c',   // 3 DEEP (the shaft's)
  '#f8961e',   // 4 OUTER
  '#ffb640',   // 5 GLOW
  '#ffd67a',   // 6 INNER
  '#ffe8b0',   // 7 CORE
  '#fffbe8',   // 8 HOT
];
const M_GOLD = 1;
const INK = '#2a1405';
const SHADOW = '#1a0c04';
const RAY = ['#ffb030', '#f8961e'];

export const METRICS = { K: 11, R: 7, gap: 12, pad: [30, 30, 30, 10], reach: 12 };

/** The face's band by height in the letter: pale top, dark horizon, lighter reflection. */
function faceTone(ty, x, y) {
  const bands = [[0.14, 7], [0.40, 6], [0.49, 5], [0.55, 3], [0.80, 5], [2, 4]];
  for (let k = 0; k < bands.length; k++) {
    const [lim, t] = bands[k];
    // A one-row checker where two bands meet, so the steps are shaded rather than ruled.
    if (ty < lim) {
      const next = bands[k + 1];
      if (next && Math.abs(ty - lim) < 0.012 && ((x + y) & 1)) return next[1];
      return t;
    }
  }
  return 4;
}

function* body(plan) {
  const P = new Plan(plan.w, plan.h);
  const { w, h, d, qx, qy, R } = plan;
  const BEVEL = 3;
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] > R) continue;
      let t;
      if (d[i] > R - BEVEL) {
        const nx = (x + 0.5 - qx[i]) / d[i], ny = (y + 0.5 - qy[i]) / d[i];
        const l = nx * -0.6 + ny * -0.8;
        t = l > 0.55 ? 8 : l > 0.15 ? 7 : l > -0.3 ? 4 : l > -0.7 ? 2 : 1;
      } else {
        t = faceTone((y + 0.5 - plan.top) / plan.inkH, x, y);
      }
      P.mat[i] = M_GOLD;
      P.tone[i] = t;
    }
  }
  yield* P.despeckleSteps(1);
  return P;
}

// A four-point glint, by hand: 2 the white core, 1 the rays.
const GLINT = [
  '...1...',
  '...1...',
  '..121..',
  '1122211',
  '..121..',
  '...1...',
  '...1...',
];

function glints(p, plan) {
  plan.letters.forEach((L, li) => {
    if (hash2(li, plan.letters.length, 41) > 0.45) return;
    // The letter's upper-left-most node: its lit corner.
    let best = null;
    for (const nd of L.nodes) if (!best || nd.x + nd.y < best.x + best.y) best = nd;
    const x0 = Math.round(best.x - 0.5 - plan.R + 2) - 3, y0 = Math.round(best.y - 0.5 - plan.R + 2) - 3;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      const c = GLINT[j][i];
      if (c === '2') p.set(x0 + i, y0 + j, '#ffffff');
      else if (c === '1') p.set(x0 + i, y0 + j, '#fffbe8');
    }
  });
}

/**
 * The sunburst: a fan of thin rays from a point under the middle of the word, each running
 * out past the letters' box -- up over the middle, out sideways at the two ends -- and
 * fading in stepped, dithered bands with its distance from the box, and a narrow glow of
 * the same light hugging the word. Only on empty pixels, never inside the box.
 *
 * Two earlier fans read as something else. Wedges all the way round the word's centre
 * converged into a pinwheel between the letters and, squeezed to the word's shape, lay as
 * level stripes at its ends. Wedges fanned up from far below it and clipped to a band over
 * its top were short slanted dashes all the same length -- hazard tape. A ray has to be
 * LONG and thin to read as one; these are 2-3 px wide and run 26 px clear of the box.
 */
function* rays(p, plan) {
  const L0 = plan.letters[0], L1 = plan.letters[plan.letters.length - 1];
  const bx0 = L0.x0, bx1 = L1.x1, by0 = plan.top, by1 = plan.bottom;
  const cx = (bx0 + bx1) / 2, cy = by1 - 4;
  const col = RAY.map(rgba);
  const N = 15;
  const dirs = [];
  for (let k = 0; k < N; k++) {
    const a = -Math.PI * (0.06 + 0.88 * k / (N - 1));
    dirs.push([Math.cos(a), Math.sin(a)]);
  }
  const REACH = 26;
  for (let y = 0; y < p.h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < p.w; x++) {
      if ((x & 63) === 63 && overdue()) yield;
      if (p.alpha(x, y)) continue;
      const ox = Math.max(0, bx0 - x, x + 1 - bx1), oy = Math.max(0, by0 - y, y + 1 - by1);
      const out = Math.hypot(ox, oy);
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      let al = 0;
      // The glow round the letters (not their box, which drew a frame round the word): two
      // thin dithered rings just outside the shadow.
      const ring = plan.d[y * p.w + x] - plan.R + (((x + y) & 1) ? 0.5 : -0.5);
      if (ring < 5) al = 0.3; else if (ring < 7) al = 0.14;
      // The rays.
      if (py < 0 && out > 0 && out < REACH) {
        for (const [dx, dy] of dirs) {
          const along = px * dx + py * dy;
          if (along <= 0) continue;
          const across = Math.abs(px * dy - py * dx);
          const wdt = 1.6 - out / REACH;
          if (across > wdt) continue;
          const f = out + (((x + y) & 1) ? 0.6 : -0.6);
          const ra = f < 9 ? 0.55 : f < 17 ? 0.34 : 0.17;
          if (ra > al) al = ra;
          break;
        }
      }
      if (!al) continue;
      const c = al > 0.4 ? col[0] : col[1];
      p.set(x, y, [c[0], c[1], c[2], 255], al);
    }
  }
}

/** The finished word from a plan whose tones are raised by `lift` (the entrance's heat). */
function* finish(P, plan, lift = 0, withRays = true) {
  const Q = new Plan(P.w, P.h);
  Q.mat.set(P.mat);
  for (let i = 0; i < P.tone.length; i++) Q.tone[i] = Math.min(8, P.tone[i] + lift);
  const p = yield* Q.toPixSteps({ [M_GOLD]: GOLD }, { [M_GOLD]: INK });
  if (!lift) glints(p, plan);
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.5]]);
  yield* haloSteps(p, SHADOW, 1, 0.5);
  if (withRays) yield* rays(p, plan);
  return p;
}

/**
 * The glint that runs across the word: only the gold, two tones up, with nothing else --
 * the runtime draws a narrow band of it over the finished word, moving left to right.
 */
function* sheen(P) {
  const Q = new Plan(P.w, P.h);
  Q.mat.set(P.mat);
  for (let i = 0; i < P.tone.length; i++) {
    if ((i & 16383) === 0 && overdue()) yield;
    Q.tone[i] = Math.min(8, P.tone[i] + 3);
  }
  return yield* Q.toPixSteps({ [M_GOLD]: GOLD });
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  let P = null;
  const gold = () => P || (P = drain(body(plan)));
  return {
    plan,
    // One function per frame, so the runtime can paint them a frame apart.
    frames: [
      function* polished() { if (!P) P = yield* body(plan); yield; return yield* finish(P, plan); },
      // The entrance frames are generators too, and every step inside them sliced: they were
      // drained in one piece, and zonetitles.js paints them under a budget now.
      function* () { return yield* finish(gold(), plan, 4, false); },
      function* () { return yield* finish(gold(), plan, 2, false); },
      () => sheen(gold()),
    ],
    seq: [[1, 0.06], [2, 0.07]],
    stagger: 0.05,
    // { frame, from, dur, band }: a band `band` px wide of `frame` crossing the word.
    sweep: { frame: 3, from: 0.6, dur: 0.45, band: 10 },
  };
}
