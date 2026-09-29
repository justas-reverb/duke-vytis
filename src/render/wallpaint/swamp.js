// SWAMP: a bank of black mud held together by roots.
//
// The ledges are moss and silver water over dark mud; the backdrop is a near-black bog hung
// with lit moss. The side walls are the bank the shaft is cut through: mud in the bog's
// cool near-blacks, and roots through it in the ledges' warm browns -- the swamp's own
// separation, cool darks under warm lit detail -- darker than the bog behind (luma about
// 25 against 28), so the moss and the ledges stay in front.
//
//   WALL  roots wander down the tile, two of them leaning a whole tile-width across it over
//         its height (so they wrap both ways), one each way, each thickening and thinning as
//         it goes. A root is shaded across its width like a cylinder, lit on its left, and
//         outlined where it crosses the mud or another root, so the ones drawn later lie over
//         the ones before.
//         The mud is dark in broad patches, with now and then a wet glint.
//   FACE  one thick root down the edge of the bank, knotted, with the rim along it.
//
// Every root runs steeper than one in two, so none lies level enough to read as something
// to stand on.

import { Plan, noise, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#060805',   // 0 outline
  '#0d1109',   // 1 mud, deep
  '#12170c',   // 2 mud
  '#181e10',   // 3 mud, light
  '#22170e',   // 4 root, shadow
  '#2d1f13',   // 5 root
  '#392818',   // 6 root, light
  '#48331e',   // 7 root, lit
  '#243a33',   // 8 wet glint
  '#5a4128',   // 9 rim
];

const TAU = Math.PI * 2;

function root(p, r, owner, id, { x0, k, amp, m, ph, r0 }) {
  const ramp = [7, 6, 6, 5, 5, 4];
  for (let y = 0; y < WALL_H; y++) {
    const cx = x0 + (k * WALL_W * y) / WALL_H + amp * Math.sin(TAU * m * y / WALL_H + ph);
    const rad = r0 + 0.55 * Math.sin(TAU * 2 * y / WALL_H + ph * 1.7);
    const L = Math.round(cx - rad), R = Math.round(cx + rad);
    for (let x = L; x <= R; x++) {
      const u = (x - L + 0.5) / (R - L + 1);
      p.set(x, y, ramp[Math.min(ramp.length - 1, Math.floor(u * ramp.length))]);
      owner[p.i(x, y)] = id;
    }
    // Outline either side, over whatever was there.
    for (const x of [L - 1, R + 1]) {
      if (owner[p.i(x, y)] !== id) { p.set(x, y, 0); owner[p.i(x, y)] = 0; }
    }
  }
}

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 2);
    const owner = new Uint8Array(WALL_W * WALL_H);
    const mud = noise(r, 4, 6, WALL_W, WALL_H);
    p.map((x, y) => {
      const v = mud(x, y);
      return v < 0.35 ? 1 : v > 0.68 ? 3 : 2;
    });
    // Thin roots first, thick ones over them.
    // Most hang straight down and wander; two cross the tile, one each way. Left to chance,
    // five of seven leaned the same way and the bank was hatched in parallel diagonals.
    const roots = [0, 0, 1, 0, -1, 0, 0].map((k, i) => ({
      x0: (i + r.float(0.1, 0.9)) * (WALL_W / 7), k, amp: r.float(2.5, 6.5),
      m: r.int(1, 2), ph: r.float(0, TAU), r0: r.float(0.9, 2.6),
    }));
    roots.sort((a, b) => a.r0 - b.r0).forEach((rt, i) => root(p, r, owner, i + 1, rt));
    // Wet glints in the open mud: two pixels each, never one.
    for (let k = 0; k < 9; k++) {
      const x = r.int(0, WALL_W - 1), y = r.int(0, WALL_H - 1);
      if (owner[p.i(x, y)] || owner[p.i(x + 1, y)] || p.get(x, y) === 0) continue;
      p.set(x, y, 8); p.set(x + 1, y, 8);
    }
    return p.pix(PAL);
  },

  face(r) {
    const p = new Plan(FACE_W, WALL_H, 5);
    const ramp = [0, 4, 5, 6, 6, 7, 9, 0];
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < FACE_W; x++) p.set(x, y, ramp[x]);
    // Knots: a darker ring round the root every so often, the rim dimming across it.
    for (let k = 0; k < 3; k++) {
      const y = 14 + k * 42 + r.int(-6, 6);
      p.hline(1, 4, y, 4); p.hline(2, 5, y + 1, 4);
      p.set(2, y + 2, 7); p.set(3, y + 2, 7);
      p.set(6, y + 1, 7);
    }
    return p.pix(PAL);
  },
};
