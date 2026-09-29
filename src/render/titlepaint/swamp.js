// SWAMP: letters of moss on the bog -- a velvet of moss over each stroke, reeds growing out
// of the tops, and bog water dripping off the undersides.
//
// The moss is the zone's reed-and-mound greens (decorpaint/swamp.js FRONT and BACK) with one
// paler tip, and it is shaded the way moss is, not the way leaves are: across the stroke
// from its lit upper-left flank to its shaded far one, then mottled in two-pixel clumps a
// tone either way, so it reads as a soft mat rather than the forest's separate leaves. Along
// the far flank the wet shows: a darker band where the moss is soaked, and a pale glint or
// two of water on it. Out of the top of about half the letters stands a clump of reeds, one
// with a cattail's brown head; from the undersides hang drops of bog water, pear-shaped and
// round at the bottom -- the pixel-art-in-code rule for a hanging drop (widest low down; a
// drop widest in the middle and pointed below was a light bulb in its socket).
//
// AGAINST THE SWAMP. The backdrop is dark olive and hanging vines (luminance ~0.03-0.1), so
// the moss is kept to the upper half of its ramp -- body #75833a, lit #97a650 and paler --
// with a near-black green outline and shadow, and the dark wet greens only on the far flank.
//
// THE ENTRANCE: each letter rises out of the bog, a few pixels at a time, and settles.

import { layoutWord, Plan, dropShadowSteps, haloSteps, hash2, overdue } from './util.js';

// Dark to light: the mound's wet dark, the reed shadow, BACK and FRONT, and a pale tip.
const MOSS = ['#141c08', '#252d0e', '#3d471d', '#4b5722', '#62702f', '#75833a', '#97a650', '#b2b66a', '#d2d69a'];
// The cattail's head and the reed stalk (decorpaint/swamp.js HEAD, FRONT).
const HEAD = ['#3a2010', '#5a341c', '#85522c', '#a87040', '#d09a62'];
const REED = ['#2f3a12', '#4b5722', '#75833a', '#97a650', '#b2b66a'];
// Bog water: murky green-brown, a paler body where the light comes through, and a glint.
const WATER = ['#1a1f0c', '#3a4424', '#5d6a3c', '#8c9868', '#d6dcc0'];
const M_MOSS = 1, M_HEAD = 2, M_REED = 3, M_WATER = 4;
const OUT = '#0a0e05';
const RAMPS = { [M_MOSS]: MOSS, [M_HEAD]: HEAD, [M_REED]: REED, [M_WATER]: WATER };
const EDGE = { [M_MOSS]: OUT, [M_HEAD]: '#1a0e06', [M_REED]: OUT, [M_WATER]: '#0c0f06' };
const SHADOW = '#050802';

export const METRICS = { K: 11, R: 7, gap: 12, pad: [16, 18, 18, 24], reach: 12 };

function* moss(P, plan) {
  const { w, h, d, qx, qy, R } = plan;
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] > R) continue;
      const dd = Math.max(0.5, d[i]);
      // Across the stroke: +1 on the lit upper-left flank, -1 on the far one.
      const flank = ((x + 0.5 - qx[i]) * -0.6 + (y + 0.5 - qy[i]) * -0.8) / dd * Math.min(1, dd / (R - 1.5));
      const down = (y + 0.5 - plan.top) / plan.inkH;
      // The clump the pixel is in: two-pixel cells, each a tone up or down or neither.
      const clump = hash2(x >> 1, y >> 1, 5);
      let v = 5.5 + 2 * flank - 0.9 * down + (clump < 0.22 ? -0.8 : clump > 0.8 ? 0.8 : 0);
      // Soaked along the far flank.
      if (flank < -0.55) v -= 1;
      let t = Math.round(v);
      t = Math.max(2, Math.min(8, t));
      P.put(x, y, M_MOSS, t);
    }
  }
  yield* P.despeckleSteps(1);
  // Water glints on the wet flank: a pale pixel or two where it is darkest, sparse.
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (P.mat[i] !== M_MOSS || P.tone[i] > 3) continue;
      if (hash2(x, y, 17) < 0.035 && P.m(x + 1, y) === M_MOSS) { P.tone[i] = 7; }
    }
  }
}

// A reed clump by hand: s stalk, S its shaded side, l a lit blade edge, h/H/D the cattail
// head's lit, body and dark, t its tip.
const REEDS = [
  [
    '.....t......',
    '....hH......',
    '....HH......',
    '....HD...l..',
    '....HD...s..',
    '....HD..ls..',
    '....HD..s...',
    '.l...s..s...',
    '.s...s.ls...',
    '..s..s.s....',
    '..s..s.s...l',
    '..s..s.s..s.',
    '...s.sSs.s..',
    '...s.sSsss..',
    '....ssSss...',
    '....sSsS....',
    '....sSsS....',
    '....sSsS....',
  ],
  [
    '........t...',
    '.......hH...',
    '..l....HH...',
    '..s....HD...',
    '..s....HD...',
    '...s...HD...',
    '...s...HD.l.',
    '...s....s.s.',
    '...s....s.s.',
    'l...s...ss..',
    '.s..s...s...',
    '.s..s..sS...',
    '..s.s.sSs...',
    '..sss.sS....',
    '...sSssS....',
    '....sSsS....',
    '....sSsS....',
    '....sSsS....',
  ],
];
const REED_PAL = { s: [M_REED, 2], S: [M_REED, 1], l: [M_REED, 4], h: [M_HEAD, 4], H: [M_HEAD, 3], D: [M_HEAD, 1], t: [M_REED, 3] };

function reeds(P, plan) {
  plan.letters.forEach((L, li) => {
    if (hash2(li, plan.letters.length, 13) > 0.5) return;
    const tops = L.nodes.filter((n) => n.r === 0);
    if (!tops.length) return;
    const nd = tops[Math.floor(hash2(li, 2, 14) * tops.length)];
    const art = REEDS[li % REEDS.length];
    const x0 = Math.round(nd.x - 0.5) - 6, y0 = Math.round(nd.y - 0.5 - plan.R) - art.length + 5;
    for (let j = 0; j < art.length; j++) {
      for (let i = 0; i < art[j].length; i++) {
        const e = REED_PAL[art[j][i]];
        if (!e || P.m(x0 + i, y0 + j) === M_MOSS) continue;
        P.put(x0 + i, y0 + j, e[0], e[1]);
      }
    }
  });
}

// A hanging drop, 12 rows: a thread of goo and a pear, widest low down, round at the bottom.
// o body, O the paler light come through low on its far side, w the glint, g the goo thread.
const DROP = [
  '...gg...',
  '...gg...',
  '...oo...',
  '..oooo..',
  '..oooo..',
  '.woooOo.',
  '.woooOo.',
  'ooooooOo',
  'ooooooOo',
  'ooooooOo',
  '.oooooo.',
  '..oooo..',
];
const DROP_PAL = { g: [M_WATER, 2], o: [M_WATER, 2], O: [M_WATER, 3], w: [M_WATER, 4] };

/**
 * The fringe: off the underside of every stroke, here and there a strand of wet moss hangs
 * one to four pixels, darkening as it goes -- the bog still dripping off the letters. Short
 * and sparse: a fringe on every column read as a beard.
 */
function* fringe(P) {
  const { w, h } = P;
  const strands = [];
  for (let y = 1; y < h - 1; y++) {
    if (overdue()) yield;
    for (let x = 1; x < w - 1; x++) {
      if (P.m(x, y) !== M_MOSS || P.m(x, y + 1) || hash2(x, y, 29) > 0.16) continue;
      strands.push([x, y, 1 + Math.floor(hash2(x, y, 30) * 4)]);
    }
  }
  let lastX = -9, lastY = -9;
  for (const [x, y, len] of strands) {
    if (y === lastY && x - lastX < 3) continue;     // never two side by side
    for (let k = 1; k <= len; k++) P.put(x, y + k, M_MOSS, k < len ? 3 : 2);
    lastX = x; lastY = y;
  }
}

/** Drops under a few letters: from the bottom of a stroke, one or two a word. */
function drops(P, plan) {
  let n = 0;
  plan.letters.forEach((L, li) => {
    if (n >= 3 || hash2(li, plan.letters.length, 19) > 0.6) return;
    const lows = L.nodes.filter((nd) => nd.r === 6 || (nd.r === 3 && nd.deg >= 2 && L.nodes.every((o) => !(o.c === nd.c && o.r === 4))));
    if (!lows.length) return;
    const nd = lows[Math.floor(hash2(li, 3, 20) * lows.length)];
    const x0 = Math.round(nd.x - 0.5) - 4 + (hash2(li, 4, 21) < 0.5 ? -2 : 2);
    let y = Math.round(nd.y - 0.5);
    while (y < P.h - 1 && P.m(x0 + 3, y) === M_MOSS) y++;
    const long = hash2(li, 5, 22) < 0.5 ? 2 : 0;
    for (let j = 0; j < DROP.length + long; j++) {
      const row = j < 2 + long ? DROP[Math.min(j, 1)] : DROP[j - long];
      for (let i = 0; i < row.length; i++) {
        const e = DROP_PAL[row[i]];
        if (e) P.put(x0 + i, y + j, e[0], e[1]);
      }
    }
    n++;
  });
}

function* finish(P) {
  const p = yield* P.toPixSteps(RAMPS, EDGE);
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.55]]);
  yield* haloSteps(p, SHADOW, 2, 0.55);
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    frames: [
      // A generator: the moss in one step, the outline and shadow in the next.
      function* bog() {
        const P = new Plan(plan.w, plan.h);
        yield* moss(P, plan);
        yield* fringe(P);
        if (overdue()) yield;
        reeds(P, plan);
        if (overdue()) yield;
        drops(P, plan);
        yield;
        return yield* finish(P);
      },
    ],
    // Up out of the bog: whole pixels below its place, rising, a pixel's overshoot, down.
    seq: [[0, 0.04, 16], [0, 0.04, 8], [0, 0.04, 3], [0, 0.04, -1]],
    stagger: 0.045,
  };
}
