// NEBULA: crystal -- the shaft is cut through a druse of the crystal the ledges are made of.
//
// The ledges are cut amethyst, the decor violet prisms with cyan catching the light, the
// backdrop violet gas. The side walls are a bed of that crystal: prisms packed upright,
// each with two faces -- a narrow lit face on its upper left and a broad shadowed one --
// meeting at a ridge, and a short faceted point, set in a violet-black matrix. The hue is
// the ledges' amethyst sunk nearly to the dark: lilac only where a point or a lit face turns
// up to the light, violet down the body, plum at the foot, so the wall's mean sits just over
// the gas's dark median (23 against 20 in a real frame) and far under its lit clouds (p95 77).
//
// The lights were TEAL until the ledges were redrawn in amethyst (tools/platpaint/nebula.mjs):
// the ridges, the lit tops and the rim were "the ledges' cyan dimmed", and beside the new
// ledges they were the last of the teal-on-magenta clash that redraw removed. They are the
// same drawing in lilac now, each tone within 2.5 luma of the teal it replaces (ridge 75,
// rim 100, lit top 45, point 58), so the wall stays as dark as it was.
//
//   WALL  prisms from the top of the tile down, each drawn IN FRONT of the ones above it,
//         so every point stands over the foot of a prism behind -- a bed of crystal, not a
//         tiling of the plane. Leaning a little either way and staggered in height, so the
//         points never line up in a row across the wall (a row of lit points would be a
//         ledge). The ridge is left of the axis and runs up into the point, as the decor's
//         prisms have it; the two faces step down their ramps a few rows apart, so the bands
//         do not run straight across. Each prism is outlined in the matrix's darkest.
//   FACE  the edge of the bed: one long prism down the shaft, its rim the ledges' lilac dimmed.
//
// WHAT THIS REPLACED. The first painting of this wall was a Voronoi split of the tile into
// flat facets with one-pixel seams, about one cell in six violet. In a real frame it read
// as a leaded STAINED-GLASS window, and it had the same structure as COSMOS's black glass,
// the zone that follows: two walls in a row of the same crazy paving. Crystal reads by its
// RIDGES and its POINTS -- two faces of one solid meeting at a lit edge -- not by cells of
// flat colour, and as a bed of crystal when the pieces overlap instead of tiling the plane.
// A second try with long shards pointed at both ends, leaning alternately file by file, read
// as a braid of leaves with lit midribs: the tips must be short and the feet hidden.

import { Plan, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#05030a',   // 0 outline
  '#0a0614',   // 1 matrix
  '#0e091b',   // 2 matrix, lit grain
  '#0f0a22',   // 3 shadow face, foot
  '#120d29',   // 4 shadow face
  '#161130',   // 5 shadow face, top
  '#1b1438',   // 6 lit face, foot (violet)
  '#1d1d44',   // 7 lit face (blue-violet)
  '#2c2656',   // 8 lit face, top (lilac sunk to the dark)
  '#4e3e88',   // 9 ridge, and the point's lit facet edge
  '#241235',   // 10 magenta, shadow
  '#34184a',   // 11 magenta, lit
  '#6a54a8',   // 12 rim
  '#4a2a5e',   // 13 magenta ridge
  '#3a3070',   // 14 point, lit facet
  '#1e1840',   // 15 point, shadow facet
];

/**
 * One prism: its foot centred at (fx, fy), height h up its axis, half width hw, lean a
 * (radians; positive tips the top to the right), point length tl.
 */
function prism(p, s) {
  const ca = Math.cos(s.a), sa = Math.sin(s.a);
  const R = Math.ceil(s.h + s.hw + 2);
  const pink = s.pink;
  const inside = (x, y) => {
    // v runs UP the prism from its foot, u across it (right of the axis positive).
    const dx = x + 0.5 - s.fx, dy = y + 0.5 - s.fy;
    const v = -dy * ca + dx * sa;
    const u = dx * ca + dy * sa;
    if (v < 0 || v > s.h) return null;
    const half = v > s.h - s.tl ? s.hw * (s.h - v) / s.tl : s.hw;
    if (Math.abs(u) > half) return null;
    return { u, v, half };
  };
  // The prism's pixels over its bounding box, in typed arrays: a Map keyed by strings made
  // this zone's build 13 ms cold, most of it hashing.
  const bx0 = Math.floor(s.fx - R), by0 = Math.floor(s.fy - R);
  const bw = Math.ceil(s.fx + R) - bx0 + 1, bh = Math.ceil(s.fy + 2) - by0 + 1;
  const IN = new Uint8Array(bw * bh), QU = new Float32Array(bw * bh), QV = new Float32Array(bw * bh);
  const QH = new Float32Array(bw * bh);
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const q = inside(bx0 + i, by0 + j);
      if (!q) continue;
      const k = j * bw + i;
      IN[k] = 1; QU[k] = q.u; QV[k] = q.v; QH[k] = q.half;
    }
  }
  const has = (i, j) => i >= 0 && j >= 0 && i < bw && j < bh && IN[j * bw + i] === 1;
  // The outline first, one pixel round the prism in the matrix's darkest, so it stands off
  // what is behind it -- except along its foot, which runs on down behind the prisms below.
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      if (!IN[j * bw + i]) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, -1]]) {
        if (!has(i + ox, j + oy)) p.set(bx0 + i + ox, by0 + j + oy, 0);
      }
    }
  }
  const ridge = -0.3;   // the ridge, as a share of the half width: left of the axis
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const k = j * bw + i;
      if (!IN[k]) continue;
      const qu = QU[k], qv = QV[k], half = QH[k];
      const lit = qu < ridge * half;
      const onRidge = Math.abs(qu - ridge * half) < 0.55;
      let v;
      if (qv > s.h - s.tl) {
        // The point: its lit facet lilac, its far facet a violet step above the body's shadow.
        v = pink ? (lit ? 13 : 11) : onRidge ? 9 : lit ? 14 : 15;
      } else {
        // The body, 0 at the shoulder under the point, 1 at the foot; the lit face's steps
        // a few rows higher than the shadowed face's.
        const t = (s.h - s.tl - qv) / Math.max(1, s.h - s.tl);
        const kk = Math.max(0, Math.min(3, Math.floor((t + (lit ? -0.1 : 0.08)) * 4)));
        v = pink ? (lit ? [11, 11, 10, 10][kk] : [10, 10, 4, 3][kk])
          : (lit ? [8, 7, 7, 6][kk] : [5, 4, 4, 3][kk]);
        if (onRidge && t < 0.35) v = pink ? 13 : 9;
      }
      p.set(bx0 + i, by0 + j, v);
    }
  }
}

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 1);
    // Grain in the matrix: short flecks a step lighter, so the gaps are rock, not flat black.
    for (let k = 0; k < 40; k++) {
      const x = r.int(0, WALL_W - 1), y = r.int(0, WALL_H - 1);
      p.set(x, y, 2); p.set(x + 1, y, 2);
    }
    // Feet on a jittered grid: five across (one every 12.8 px), seven down, each row offset
    // half a column from the last, so neither the points nor the feet make rows or files.
    const prisms = [];
    const NX = 5, NY = 7;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        if (r.chance(0.12)) continue;
        const hw = r.float(4.2, 6.8);
        prisms.push({
          fx: (i + (j % 2) * 0.5) * (WALL_W / NX) + r.float(-3, 3),
          fy: (j + 1) * (WALL_H / NY) + r.float(-6, 6),
          h: r.float(26, 44), hw, tl: hw * r.float(1.1, 1.6),
          a: (r.chance(0.5) ? 1 : -1) * r.float(0.04, 0.3),
          pink: r.chance(0.22),
        });
      }
    }
    // Top first, so each prism's point stands in front of the feet of those above it.
    prisms.sort((a, b) => a.fy - b.fy);
    for (const s of prisms) prism(p, s);
    p.despeckle(new Set([0, 9, 13]), 1);
    return p.pix(PAL);
  },

  face() {
    const p = new Plan(FACE_W, WALL_H, 4);
    const ramp = [0, 4, 5, 7, 8, 8, 12, 0];
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < FACE_W; x++) p.set(x, y, ramp[x]);
    // The prism's face breaks where a crystal of the bed meets it, slanting up to the rim.
    for (const y0 of [21, 63, 101]) {
      for (let x = 1; x < 6; x++) p.set(x, y0 - Math.floor(x / 2), 0);
      for (let x = 1; x < 6; x++) p.set(x, y0 - Math.floor(x / 2) + 1, x < 3 ? 5 : 9);
    }
    return p.pix(PAL);
  },
};
