// STARFIELD: constellations on teal -- the walls are a star chart cut in stone.
//
// The ledges are dark green stone blocks marked with chevrons, the backdrop a deep teal sky
// thick with small stars. The side walls are the ledges' stone in the sky's teal, dressed in
// tall slabs, with constellations cut into them: stars as small crosses, their threads
// running between them and stopping short of every star, so each figure reads as stars
// joined up rather than a wire with knots. Darker than the sky (luma about 24 against 28);
// the threads a step above the stone, the stars two.
//
// COSMOS's walls are black glass with loose stars; these are dressed stone with DRAWN stars.
// Two starry zones in a row must not look like the same place twice.
//
//   WALL  slabs 32 wide and 64 tall in running bond, each lit down its left edge and along
//         part of its top; two constellations a tile, five or six stars each, no thread
//         lying flatter than one in two.
//   FACE  a quoin column on the slabs' courses, the rim in the stars' green.

import { Plan, stone, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#020b0b',   // 0 outline
  '#041212',   // 1 joint
  '#061615',   // 2 slab, shadow
  '#081b1a',   // 3 slab, dark
  '#0a201f',   // 4 slab
  '#0e2625',   // 5 slab, light
  '#132f2d',   // 6 slab, lit edge
  '#1f4a43',   // 7 thread
  '#2f6a5c',   // 8 star arm
  '#5fb49a',   // 9 star
  '#3c8a74',   // 10 rim
];

const SH = 64, SW = 32, OY = 11, OX = 3;

function constellation(p, r, cx, cy) {
  const stars = [], n = r.int(5, 6);
  for (let t = 0; stars.length < n && t < 200; t++) {
    const x = Math.round(cx + r.float(-14, 14)), y = Math.round(cy + r.float(-24, 24));
    if (stars.every((s) => Math.hypot(s.x - x, s.y - y) > 8)) stars.push({ x, y });
  }
  // Threads between consecutive stars, none flatter than one in two.
  stars.sort((a, b) => a.y - b.y);
  for (let k = 1; k < stars.length; k++) {
    const a = stars[k - 1], b = stars[k];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (Math.abs(dy) < Math.abs(dx) * 0.5) continue;
    for (let s = 3; s < L - 3; s += 0.5) p.set(Math.round(a.x + (dx * s) / L), Math.round(a.y + (dy * s) / L), 7);
  }
  for (const s of stars) {
    p.set(s.x, s.y, 9);
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(s.x + i, s.y + j, 8);
  }
}

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 1);
    for (let j = 0; j < WALL_H / SH; j++) {
      for (let i = 0; i < WALL_W / SW; i++) {
        stone(p, r, OX + i * SW + (j % 2) * (SW / 2), OY + j * SH, SW, SH, r.pick([3, 4, 4, 5]),
          { lit: 0.35, top: 6, pits: [1, 2], chip: 0.2 });
      }
    }
    constellation(p, r, 18, 34);
    constellation(p, r, 48, 96);
    return p.pix(PAL);
  },

  face() {
    const p = new Plan(FACE_W, WALL_H, 4);
    for (let j = 0; j < WALL_H / 32; j++) {
      const y0 = OY + j * 32;
      p.hline(0, 5, y0, 1);
      p.vline(1, y0 + 2, y0 + 20, 6);
      p.hline(2, 3, y0 + 1, 6);
      p.hline(1, 5, y0 + 31, 2);
    }
    p.vline(0, 0, WALL_H - 1, 1);
    for (let y = 0; y < WALL_H; y++) {
      p.set(6, y, p.get(3, y) === 1 ? 6 : 10);
      p.set(7, y, 0);
    }
    return p.pix(PAL);
  },
};
