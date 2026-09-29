// FOREST: the shaft climbs inside a giant tree, so its walls are bark.
//
// The ledges are turf over dark soil, the backdrop a green wood of tall trunks. The side
// walls are the nearest trunk of all: ridged bark in the soil's browns, its furrows falling
// toward the forest's green-black, a little moss lodged in them -- a step darker than the
// wood behind (luma about 32 against 39), so the lit trees and the turf ledges stay in
// front of it.
//
//   WALL  bark as an oak's is: ridges that split and merge. Two furrows run the whole
//         height and wander (sums of sines on whole periods of the tile, so they wrap);
//         between them shorter furrows open and close like lenses, so a ridge forks round
//         each one. Every bark pixel is shaded by where it sits across ITS ridge -- the
//         distance to the furrow on its left against the one on its right -- lit on the
//         left slope, dark falling into the right, the way platart's trunks and decor's
//         trees are lit. Now and then a ridge breaks, a short slanting crack. Moss sits in
//         the furrows in small clumps, lit on top.
//   FACE  the trunk's edge: a last ridge rolling round toward the shaft, the lit rim on it.
//
// All the structure runs up and down: a trunk has no level lines, which is also the rule for
// a wall the Duke must never mistake for a ledge.
//
// A first version had five parallel wavy furrows, flat plates between them, and moss as big
// lit ovals: in the frame, wavy planks with leaves stuck on, and brighter than the wood.

import { Plan, noise, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#090805',   // 0 outline, furrow floor
  '#130e08',   // 1 furrow
  '#1c140b',   // 2 bark, deep shadow
  '#251a0f',   // 3 bark, shadow
  '#2e2113',   // 4 bark
  '#382817',   // 5 bark, light
  '#44311c',   // 6 bark, lit slope
  '#5a4226',   // 7 rim
  '#151d0b',   // 8 moss, shadow
  '#212c0f',   // 9 moss
  '#2f3c14',   // 10 moss, lit
];

const TAU = Math.PI * 2;

export default {
  PAL,
  wall(r) {
    const W = WALL_W, H = WALL_H;
    const furrow = new Uint8Array(W * H);          // 0 bark, 1 furrow edge, 2 furrow floor
    const mark = (x, y, v) => {
      const i = (((y % H) + H) % H) * W + (((Math.round(x) % W) + W) % W);
      if (furrow[i] < v) furrow[i] = v;
    };
    // Three furrows the whole height, a third of the tile apart.
    for (const base of [r.float(2, 8), r.float(23, 29), r.float(44, 50)]) {
      const a1 = r.float(2, 4), p1 = r.float(0, TAU), a2 = r.float(0.8, 1.6), p2 = r.float(0, TAU);
      const m2 = r.int(2, 3);
      for (let y = 0; y < H; y++) {
        const x = base + a1 * Math.sin(TAU * y / H + p1) + a2 * Math.sin(TAU * m2 * y / H + p2);
        mark(x, y, 2); mark(x + 1, y, 1);
      }
    }
    // Shorter furrows, lens-shaped: open, widen, close. They fork the ridges.
    for (let k = 0; k < 12; k++) {
      const y0 = r.int(0, H - 1), len = r.int(24, 64);
      const x0 = r.float(0, W), slope = r.float(-0.08, 0.08), bow = r.float(-3, 3);
      for (let j = 0; j < len; j++) {
        const t = j / (len - 1);
        const x = x0 + slope * j + bow * Math.sin(Math.PI * t);
        const wide = Math.sin(Math.PI * t);
        // Tapered: a hairline at each tip, so a ridge splits gradually round it.
        mark(x, y0 + j, wide > 0.45 ? 2 : 1);
        if (wide > 0.7) mark(x + 1, y0 + j, 1);
      }
    }
    // Shade each bark pixel by where it sits across its ridge.
    const p = new Plan(W, H, 4);
    const fur = (x, y) => furrow[(((y % H) + H) % H) * W + (((x % W) + W) % W)];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const f = fur(x, y);
        if (f) { p.set(x, y, f === 2 ? 0 : 1); continue; }
        let dl = 1, dr = 1;
        while (dl < 24 && !fur(x - dl, y)) dl++;
        while (dr < 24 && !fur(x + dr, y)) dr++;
        const u = (dl - 0.5) / (dl + dr - 1);
        const t = u < 0.22 ? 6 : u < 0.45 ? 5 : u < 0.72 ? 4 : u < 0.9 ? 3 : 2;
        p.set(x, y, t);
      }
    }
    // Breaks in the ridges: short slanting cracks, the bark under each lit for a pixel or two.
    for (let k = 0; k < 9; k++) {
      let x = r.int(0, W - 1);
      const y = r.int(0, H - 1);
      if (fur(x, y)) continue;
      while (!fur(x - 1, y) && x > -W) x--;       // start at the ridge's left furrow
      const len = r.int(3, 6);
      for (let j = 0; j < len; j++) {
        const yy = y + Math.floor(j / 2);
        if (fur(x + j, yy)) break;
        p.set(x + j, yy, 2);
        if (j < 2) p.set(x + j, yy + 1, 6);
      }
    }
    // Moss lodged in the furrows, in clumps, lit on top.
    const moss = noise(r, 3, 6, W, H);
    p.map((x, y, v) => {
      if (moss(x, y) < 0.7) return undefined;
      const nearF = fur(x, y) || fur(x - 1, y) || fur(x + 1, y) || fur(x - 2, y);
      if (!nearF) return undefined;
      return moss(x, y - 3) < 0.7 ? 10 : v === 0 ? 8 : 9;
    });
    p.despeckle(new Set([0]));
    return p.pix(PAL);
  },

  face(r) {
    const p = new Plan(FACE_W, WALL_H, 4);
    // The edge ridge, rolling toward the shaft: furrow, bark, lit slope, rim, outline.
    const ramp = [1, 3, 4, 5, 5, 6, 7, 0];
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < FACE_W; x++) p.set(x, y, ramp[x]);
    // Breaks in it now and then, the rim dimming a step across each.
    for (let k = 0; k < 4; k++) {
      const y = 9 + k * 32 + r.int(-5, 5);
      p.set(1, y, 1); p.set(2, y, 2); p.set(3, y + 1, 2); p.set(4, y + 1, 3);
      p.set(2, y + 1, 6); p.set(3, y + 2, 6);
      p.set(6, y + 1, 6);
    }
    return p.pix(PAL);
  },
};
