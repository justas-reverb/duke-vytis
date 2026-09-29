// BASEMENT: letters built of cellar brick, dusty, with cobwebs in their corners.
//
// The letters are the font's own square pixels -- a cellar is built of blocks, and the font
// is blocks -- laid in brick: courses seven pixels deep, bricks twelve long in running bond,
// one-pixel mortar, as the zone's ledges and walls are coursed (wallpaint/basement.js). Each
// brick is one tone with a jitter of its own, a lit top row and a shaded foot and right end,
// so a course reads as separate bricks rather than a striped band; dust lies in pale specks
// along the brick tops, and cobwebs -- the decor's (decorpaint/basement.js), thread on clean
// pixel slopes, translucent -- are strung across an inside corner or two, where two strokes
// of a letter meet round an empty square.
//
// AGAINST THE BASEMENT. The cellar is near-black violet-brown (luminance ~0.01-0.02) and the
// ledges are its darkest brick, so these bricks are the warm lit end of that brown -- body
// #985634, lit #d08c5a -- torchlit terracotta where the ledge's are in shadow, with a black-
// brown outline and shadow. Four times the backdrop's luminance and more.
//
// THE ENTRANCE: each letter drops into place and settles with a thud.

import { GLYPHS as GL } from '../font.js';
import { layoutWord, cellMap, Plan, dropShadowSteps, haloSteps, hash2, overdue } from './util.js';

const BRICK = ['#1a0c0a', '#3a1d15', '#5c2f1f', '#7a4128', '#985634', '#b56f43', '#d08c5a', '#e8ad7c'];
const DUST = ['#6e5a4c', '#a8927c', '#d4c4ac'];
const M_BRICK = 1, M_DUST = 2;
const OUT = '#120806';
const SHADOW = '#080306';
// The decor's cobweb (decorpaint/basement.js): the thread, its knots, and their alphas.
const WEB = '#cdc8e0', KNOT = '#f2f0fa';

export const METRICS = { K: 11, R: 5.5, gap: 12, pad: [16, 16, 18, 16], reach: 4 };

const CH = 7, BL = 12;         // a course's depth and a brick's length, mortar included [px]

function* bricks(plan) {
  const { w, h } = plan;
  const { cell } = cellMap(plan);
  const P = new Plan(w, h);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cell[i] < 0) continue;
      const v = y - plan.top, course = Math.floor(v / CH), row = v - course * CH;
      const off = (course & 1) * (BL >> 1);
      const u = x + off, brick = Math.floor(u / BL), col = u - brick * BL;
      let t;
      if (row === CH - 1 || col === BL - 1) t = 1;            // mortar
      else {
        const j = hash2(brick, course, 3);
        t = j < 0.2 ? 3 : j > 0.82 ? 5 : 4;
        if (row === 0) t++;                                   // the lit top
        else if (row === CH - 2) t--;                         // the foot
        if (col === BL - 2) t--;                              // the shaded end
        if (row === 0 && col === 0) t++;                      // the lit corner
      }
      P.put(x, y, M_BRICK, t);
    }
  }
  // Mortar on the letter's own edge would notch it: there the brick carries on instead.
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (P.mat[i] !== M_BRICK || P.tone[i] !== 1) continue;
      const edge = !P.m(x, y - 1) || !P.m(x, y + 1) || !P.m(x - 1, y) || !P.m(x + 1, y);
      if (edge) P.tone[i] = 3;
    }
  }
  // Dust on the brick tops, a speck here and there.
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (P.mat[i] !== M_BRICK || P.tone[i] < 5) continue;
      const hsh = hash2(x, y, 9);
      if (hsh < 0.12) P.put(x, y, M_DUST, hsh < 0.04 ? 2 : 1);
    }
  }
  return { P, cell };
}

/**
 * Cobwebs across an inside corner: an empty glyph square with lit squares above it and to one
 * side. The web hangs from that corner, fanning into the square: spokes on clean slopes and
 * three sagging rings. One to a letter, three at most.
 */
function cobwebs(p, plan) {
  const K = plan.K;
  const spots = [];
  plan.letters.forEach((L) => {
    const rows = L.ch in GL ? GL[L.ch] : null;
    if (!rows) return;
    for (let r = 1; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] === '#') continue;
        const up = rows[r - 1][c] === '#';
        const left = c > 0 && rows[r][c - 1] === '#', right = c < 4 && rows[r][c + 1] === '#';
        if (!up || (!left && !right)) continue;
        spots.push({ L, r, c, side: left ? 1 : -1 });
      }
    }
  });
  // One web to a letter, up to three, spread along the word.
  const pick = [];
  for (const s of spots) {
    if (pick.length >= 3 || pick.some((q) => q.L === s.L)) continue;
    if (hash2(s.r, s.c, s.L.x0) < 0.6) pick.push(s);
  }
  for (const s of pick) {
    // The corner pixel: just inside the empty square, under the stroke above, beside the one
    // at its side.
    const cx = Math.round(s.L.ox + s.c * K - s.side * (K - 1) / 2);
    const cy = Math.round(s.L.oy + s.r * K - (K - 1) / 2);
    const spokes = [[13, 0], [12, 5], [9, 9], [5, 12], [0, 13]];
    const line = (x0, y0, x1, y1, a) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
        if (p.alpha(x, y) < 250) p.set(x, y, WEB, a);
      }
    };
    for (const [dx, dy] of spokes) line(cx, cy, cx + s.side * dx, cy + dy, 0.8);
    for (const f of [0.35, 0.65, 0.92]) {
      for (let k = 0; k < spokes.length - 1; k++) {
        const [ax, ay] = spokes[k], [bx, by] = spokes[k + 1];
        line(cx + s.side * Math.round(ax * f), cy + Math.round(ay * f) + 1,
          cx + s.side * Math.round(bx * f), cy + Math.round(by * f) + 1, 0.55);
      }
    }
    if (p.alpha(cx, cy) < 250) p.set(cx, cy, KNOT, 0.92);
  }
}


function* finish(P, plan) {
  const p = yield* P.toPixSteps({ [M_BRICK]: BRICK, [M_DUST]: DUST }, { [M_BRICK]: OUT, [M_DUST]: OUT });
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.55]]);
  yield* haloSteps(p, SHADOW, 2, 0.5);
  cobwebs(p, plan);
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps): the scoreboard lays GAME
// and OVER out a slice at a time before asking for the word (gameoverskin.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    // A generator: the bricks in one step, the outline, shadow and webs in the next.
    frames: [function* brickwork() { const { P } = yield* bricks(plan); yield; return yield* finish(P, plan); }],
    // Dropped into place from above, a pixel past it, and back: a thud.
    seq: [[0, 0.035, -16], [0, 0.035, -6], [0, 0.03, 2]],
    stagger: 0.045,
  };
}
