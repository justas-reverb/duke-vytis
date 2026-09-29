// DUNGEON: letters of crypt stone, strapped with iron, and a skull in the dark of the O.
//
// Built from the font's own square pixels, as the crypt is built from blocks: along each
// row of a letter the squares are paired into blocks two long, the pairing shifted by one
// square on every other row so the joints break like a wall's and not like a grid. Each
// block is the zone's violet-grey crypt stone (decorpaint/dungeon.js STONE) with a bevel --
// a lit top and left edge, a shaded foot and right edge -- a mottled face, now and then a
// crack, and its outer corners chipped where it stands on the letter's edge. Across one or
// two stems runs an iron strap with two rivets, in the decor's irons, which show by their
// lit faces as that note says iron must on this backdrop. In the hollow of the O (or the
// first letter with a closed hollow) sits the decor's skull, facing out.
//
// AGAINST THE DUNGEON. The crypt behind is slate-dark (#151525 to #252535, luminance ~0.01-
// 0.02), the same hue as the stone, so value carries it: the block faces are the decor
// stone's lit tones, a near-black outline and shadow round every letter.
//
// THE ENTRANCE: each letter drops into place with a thud, as the blocks of a wall would.

import { layoutWord, cellMap, Plan, dropShadowSteps, haloSteps, hash2, overdue } from './util.js';
import { GLYPHS } from '../font.js';

// The decor's stone ramp, its face tones lifted a step: at the decor's own #6f6c86 a letter
// was 3.6:1 on the crypt wall and read a beat slower than the old yellow text had.
const STONE = ['#141220', '#2c2a3c', '#48445c', '#615e78', '#7e7b96', '#9895ae', '#b3b0c6', '#d3d1e2'];
// The decor's irons: turned away, body, a face turned up, the glint.
const IRON = ['#1d1c2b', '#43465a', '#65697f', '#959bb1', '#d2d6e2'];
// The decor's bone, darkest first: the socket, the crease, turned away, body, lit, glint.
const BONE = ['#1e1320', '#5f4650', '#977e62', '#c8b389', '#e6d8b3', '#f7f0da'];
const M_STONE = 1, M_IRON = 2, M_BONE = 3;
const OUT = '#08070d';
const SHADOW = '#04030a';

export const METRICS = { K: 11, R: 5.5, gap: 12, pad: [16, 16, 18, 16], reach: 4 };

function* stones(plan) {
  const { w, h, K } = plan;
  const { cell, list } = cellMap(plan);
  const at = new Map(list.map((q, i) => [q.li + ',' + q.r + ',' + q.c, i]));
  // Blocks: pairs of squares along a row, the pairing shifted on alternate rows.
  const block = new Int32Array(list.length).fill(-1);
  const boxes = [];
  list.forEach((q, i) => {
    if (block[i] >= 0) return;
    const nx = at.get(q.li + ',' + q.r + ',' + (q.c + 1));
    const pair = nx !== undefined && block[nx] < 0 && ((q.c + q.r) & 1) === 0;
    const b = boxes.length;
    block[i] = b;
    if (pair) block[nx] = b;
    boxes.push({ x0: q.x0, y0: q.y0, x1: q.x0 + (pair ? 2 : 1) * K, y1: q.y0 + K, id: b });
  });
  const P = new Plan(w, h);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cell[i] < 0) continue;
      const B = boxes[block[cell[i]]];
      const u = x - B.x0, v = y - B.y0, bw = B.x1 - B.x0, bh = B.y1 - B.y0;
      let t;
      if (u === bw - 1 || v === bh - 1) t = 1;                  // the joint
      else {
        const j = hash2(B.id, 7, 3);
        t = j < 0.3 ? 4 : j > 0.8 ? 5 : 4;
        const m = hash2(x >> 1, y >> 1, 11);
        if (m < 0.18) t--; else if (m > 0.88) t++;
        if (v === 0 || u === 0) t = 6;                           // the lit bevel
        if (v === 0 && u === 0) t = 7;
        if (v === bh - 2 || u === bw - 2) t = 3;                 // the shaded one
      }
      P.put(x, y, M_STONE, t);
    }
  }
  // A joint on the letter's own edge would notch it: there the stone carries on instead.
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (P.mat[i] !== M_STONE || P.tone[i] !== 1) continue;
      if (!P.m(x, y - 1) || !P.m(x, y + 1) || !P.m(x - 1, y) || !P.m(x + 1, y)) P.tone[i] = 3;
    }
  }
  // Cracks: a short dark line down a block's face, now and then.
  for (const B of boxes) {
    if (hash2(B.id, 13, 5) > 0.22) continue;
    let x = B.x0 + 3 + Math.floor(hash2(B.id, 1, 6) * (B.x1 - B.x0 - 6)), y = B.y0 + 2;
    for (let k = 0; k < 6; k++) {
      if (P.m(x, y) === M_STONE && P.tone[y * w + x] > 1) P.tone[y * w + x] = 2;
      y++;
      if (hash2(B.id, k, 7) < 0.5) x += hash2(B.id, k, 8) < 0.5 ? -1 : 1;
    }
  }
  // Chips: a convex outer corner of the letter loses its corner pixel, sometimes two.
  const chip = [];
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      if (P.m(x, y) !== M_STONE) continue;
      const hor = !P.m(x - 1, y) || !P.m(x + 1, y), ver = !P.m(x, y - 1) || !P.m(x, y + 1);
      if (hor && ver && hash2(x, y, 15) < 0.7) chip.push([x, y]);
    }
  }
  for (const [x, y] of chip) P.put(x, y, 0, 0);
  return { P, cell, list };
}

/** An iron strap across one or two stems: three rows and a rivet each side. */
function straps(P, plan) {
  let n = 0;
  plan.letters.forEach((L, li) => {
    if (n >= 2 || hash2(li, plan.letters.length, 23) > 0.5) return;
    const rows = GLYPHS[L.ch];
    // A stem: column 0 lit on rows 2, 3 and 4.
    if (!(rows[2][0] === '#' && rows[3][0] === '#' && rows[4][0] === '#')) return;
    const x0 = Math.round(L.ox - (plan.K - 1) / 2) - 1, x1 = x0 + plan.K + 1;
    const y = Math.round(L.oy + 3 * plan.K - 1);
    // Lit along its top, as iron has to be here to show at all: the first strap was body
    // and shadow only, and on the stone it was a faint seam.
    for (let x = x0; x <= x1; x++) {
      P.put(x, y, M_IRON, 4);
      P.put(x, y + 1, M_IRON, 3);
      P.put(x, y + 2, M_IRON, 1);
    }
    for (const rx of [x0 + 2, x1 - 2]) { P.put(rx, y + 1, M_IRON, 4); P.put(rx + 1, y + 1, M_IRON, 1); }
    n++;
  });
}

// The decor's skull, facing us (decorpaint/dungeon.js SKULL_FRONT), copied: 16 x 18.
const SKULL = [
  '....HHHHHHHM....',
  '..HHWWWHHHHHMM..',
  '.HWWWWHHHHHHHMM.',
  'HWWWHHHHHHHHHHML',
  'HWWHHHHHHHHHHHML',
  'HHHHHHHHHHHHHMML',
  'HHDKKKDHMDKKKDML',
  'HDKKKKKHMKKKKKDL',
  'MDKKKKKHMKKKKKDL',
  'MDKKKKKMMKKKKKDL',
  'MMDKKKDMMDKKKDLL',
  '.MHHHHMKKMMMMLL.',
  '..MMMMDKKDMMLL..',
  '...LWDHDHDHDL...',
  '...LHDHDHDMDL...',
  '....DKKKKKKD....',
  '....LHDMDMDL....',
  '.....LLLLLL.....',
];
const SKULL_PAL = { K: 0, D: 1, L: 2, M: 3, H: 4, W: 5 };

/** The skull in the hollow of the first O, D or B: a closed counter three squares wide. */
function skull(P, plan) {
  const L = plan.letters.find((q) => q.ch === 'O') || plan.letters.find((q) => q.ch === 'D' || q.ch === 'B');
  if (!L) return;
  const cx = Math.round(L.ox + 2 * plan.K), cy = Math.round(L.oy + (L.ch === 'B' ? 1.5 : 3) * plan.K);
  const x0 = cx - 8, y0 = cy - 9;
  SKULL.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const t = SKULL_PAL[row[i]];
      if (t !== undefined) P.put(x0 + i, y0 + j, M_BONE, t);
    }
  });
}

function* finish(P) {
  const p = yield* P.toPixSteps({ [M_STONE]: STONE, [M_IRON]: IRON, [M_BONE]: BONE },
    { [M_STONE]: OUT, [M_IRON]: OUT, [M_BONE]: OUT });
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.55]]);
  yield* haloSteps(p, SHADOW, 2, 0.5);
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    // A generator: the stone in one step, the outline and shadow in the next.
    frames: [function* crypt() {
      const { P } = yield* stones(plan);
      if (overdue()) yield;
      straps(P, plan);
      if (overdue()) yield;
      skull(P, plan);
      yield;
      return yield* finish(P);
    }],
    seq: [[0, 0.035, -16], [0, 0.035, -6], [0, 0.03, 2]],
    stagger: 0.045,
  };
}
