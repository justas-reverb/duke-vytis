// COSMOS: star-flecked dark -- the walls are night made solid.
//
// The ledges here are slabs of black sky with stars in them, over a deep navy starfield. The
// side walls are the same stuff: black glass split into broad conchoidal plates, a few stars
// caught in it, darker than the sky it frames (luma about 16 against 20). The plates' seams
// are lit only down their upright runs, and faintly, so the wall reads as a surface with
// an edge to it rather than as more open sky.
//
//   WALL  seven plates from a Voronoi split of the tile, each a flat tone a step apart; a
//         lit seam where a plate's left edge meets its neighbour, a dark one on its lower
//         right. Stars: small crosses, one bright pixel and four dim, and a few dim pairs.
//   FACE  the edge of the glass, its rim a cold pale blue.
//
// A star is the one place a single bright pixel belongs; it has its four dim arms, so it is
// a star, not a speck.

import { Plan, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#020409',   // 0 outline
  '#040912',   // 1 seam
  '#070e1b',   // 2 plate, dark
  '#0a1322',   // 3 plate
  '#0d182a',   // 4 plate, light
  '#162440',   // 5 lit seam
  '#26324e',   // 6 star, dim
  '#6a7fa6',   // 7 star
  '#4a5c80',   // 8 rim
];

export default {
  PAL,
  wall(r) {
    const seeds = [];
    for (let k = 0; k < 7; k++) seeds.push({ x: r.float(0, WALL_W), y: r.float(0, WALL_H), tone: 2 + (k % 3) });
    const p = new Plan(WALL_W, WALL_H, 3);
    const cell = new Uint8Array(WALL_W * WALL_H);
    for (let y = 0; y < WALL_H; y++) {
      for (let x = 0; x < WALL_W; x++) {
        let best = 0, bd = Infinity;
        seeds.forEach((s, k) => {
          let dx = Math.abs(x + 0.5 - s.x), dy = Math.abs(y + 0.5 - s.y);
          dx = Math.min(dx, WALL_W - dx); dy = Math.min(dy, WALL_H - dy);
          const d = dx * dx + dy * dy * 0.36;
          if (d < bd) { bd = d; best = k; }
        });
        cell[y * WALL_W + x] = best;
      }
    }
    const at = (x, y) => cell[p.i(x, y)];
    for (let y = 0; y < WALL_H; y++) {
      for (let x = 0; x < WALL_W; x++) {
        const c = at(x, y);
        let v = seeds[c].tone;
        if (at(x + 1, y) !== c || at(x, y + 1) !== c) v = 1;
        else if (at(x - 1, y) !== c) v = 5;
        p.set(x, y, v);
      }
    }
    // Stars: crosses away from the seams, and a few dim pairs.
    let placed = 0;
    for (let k = 0; k < 60 && placed < 5; k++) {
      const x = r.int(2, WALL_W - 3), y = r.int(2, WALL_H - 3);
      let clear = true;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (p.get(x + i, y + j) <= 1 || p.get(x + i, y + j) >= 5) clear = false;
      if (!clear) continue;
      p.set(x, y, 7);
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + i, y + j, 6);
      placed++;
    }
    for (let k = 0; k < 7; k++) {
      const x = r.int(0, WALL_W - 2), y = r.int(0, WALL_H - 1);
      if (p.get(x, y) >= 2 && p.get(x, y) <= 4 && p.get(x + 1, y) >= 2 && p.get(x + 1, y) <= 4) {
        p.set(x, y, 6); p.set(x + 1, y, 6);
      }
    }
    return p.pix(PAL);
  },

  face() {
    const p = new Plan(FACE_W, WALL_H, 3);
    const ramp = [1, 2, 3, 3, 4, 5, 8, 0];
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < FACE_W; x++) p.set(x, y, ramp[x]);
    for (const y0 of [23, 71, 110]) { p.set(1, y0, 1); p.set(2, y0 + 1, 1); p.set(3, y0 + 1, 1); p.set(6, y0 + 1, 5); }
    return p.pix(PAL);
  },
};
