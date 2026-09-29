// CITADEL: cut stone -- dressed ashlar with drafted margins, cut with the ledges' runes.
//
// The ledges are pale dressed stone with a carved rune on each block; the backdrop is the
// citadel's blue arcades. The side walls are the citadel's own masonry: big regular blocks
// in the arcades' blue-grey, each with a smooth-dressed margin round a pecked face -- the
// way fine ashlar was cut -- and now and then the ledges' rune cut into one. A step darker
// than the arcades (luma about 42 against 49), far below the white ledges (225).
//
// Regular where DUNGEON's crypt wall is rubble, and blue where it is violet: two zones of
// stone must not read as the same place twice.
//
//   WALL  courses of 32, blocks 32 long, running bond. Each block: its joint, a margin
//         lit on its top-left and shadowed on its lower right, and inside it the face, sunk
//         a little (a shadowed line along its top and left) and pecked all over. Two blocks
//         a tile carry a rune.
//   FACE  a column of quoins on the same courses, the lit arris and the outline.

import { Plan, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#090c15',   // 0 outline, deep joint
  '#121827',   // 1 joint
  '#161b2a',   // 2 shadow
  '#1b2132',   // 3 pecked face, dark
  '#20273a',   // 4 pecked face
  '#252d43',   // 5 margin
  '#2d3650',   // 6 margin, lit
  '#4d5b7e',   // 7 arris
];

const CH = 32, BW = 32, OY = 9, OX = 5;

// The ledges' rune, carved: X between two uprights. '#' is the cut, '+' its lit lower lip.
const RUNE = [
  '#.....#',
  '##...##',
  '#+#.#+#',
  '#.+#+.#',
  '#..#..#',
  '#.#+#.#',
  '##+.+##',
  '#+...+#',
  '#.....#',
  '++...++',
];

function block(p, r, x0, y0, rune) {
  // Joint along the top and left.
  p.hline(x0, x0 + BW - 1, y0, 1);
  p.vline(x0, y0, y0 + CH - 1, 1);
  const sx = x0 + 1, sy = y0 + 1, sw = BW - 1, sh = CH - 1;
  p.rect(sx, sy, sw, sh, 5);
  // The margin: lit top and left, shadowed bottom and right. The lit top stops short of
  // the block's end, so a course of blocks never lights a whole row.
  p.hline(sx + 1, sx + Math.floor(sw * 0.55), sy, 6);
  p.vline(sx, sy + 1, sy + sh - 6, 6);
  p.hline(sx + 1, sx + sw - 1, sy + sh - 1, 2);
  p.vline(sx + sw - 1, sy + 1, sy + sh - 1, 2);
  p.set(sx, sy, 1); p.set(sx + sw - 1, sy + sh - 1, 0);
  // The pecked face inside the margin, a step down, its own edge shadowed at top and left
  // where it is sunk below the margin.
  const fx = sx + 3, fy = sy + 3, fw = sw - 6, fh = sh - 6;
  p.rect(fx, fy, fw, fh, 5);
  p.hline(fx, fx + fw - 1, fy, 3);
  p.vline(fx, fy, fy + fh - 1, 3);
  for (let y = fy + 2; y < fy + fh - 1; y += 3) {
    for (let x = fx + 2 + ((y / 3) % 2 ? 1 : 0); x < fx + fw - 1; x += 4) {
      if (r.chance(0.7)) p.rect(x, y, r.chance(0.5) ? 2 : 1, 1, 4);
    }
  }
  if (rune) {
    const rx = fx + Math.floor((fw - 7) / 2), ry = fy + Math.floor((fh - 10) / 2);
    RUNE.forEach((row, j) => [...row].forEach((c, i) => {
      if (c === '#') p.set(rx + i, ry + j, 1);
      else if (c === '+') p.set(rx + i, ry + j, 6);
    }));
  }
}

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 1);
    // Two runes a tile, far apart and in different columns: one a course in three read as
    // a stamped grid.
    const runes = new Set(['1,0', '0,2']);
    for (let j = 0; j < WALL_H / CH; j++) {
      for (let i = 0; i < WALL_W / BW; i++) {
        block(p, r, OX + i * BW + (j % 2) * (BW / 2), OY + j * CH, runes.has(i + ',' + j));
      }
    }
    return p.pix(PAL);
  },

  face() {
    const p = new Plan(FACE_W, WALL_H, 5);
    for (let j = 0; j < WALL_H / CH; j++) {
      const y0 = OY + j * CH;
      p.hline(0, 5, y0, 1);
      p.vline(1, y0 + 2, y0 + CH - 6, 6);
      p.hline(2, 4, y0 + 1, 6);
      p.hline(1, 5, y0 + CH - 1, 2);
      p.rect(3, y0 + 4, 2, CH - 8, 4);
    }
    p.vline(0, 0, WALL_H - 1, 1);
    for (let y = 0; y < WALL_H; y++) {
      p.set(6, y, p.get(2, y) === 1 ? 6 : 7);
      p.set(7, y, 0);
    }
    return p.pix(PAL);
  },
};
