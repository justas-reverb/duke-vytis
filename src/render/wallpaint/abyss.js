// ABYSS: bone -- the walls of the pit are a charnel heap of the climbers it has claimed.
//
// The ledges here are long bones joined at great knuckles, warm white shading through grey
// into violet, over a near-black void; the decor is a skull on a heap of dark rubble. The
// side walls are a wall of the same bone packed into the dark: long bones at steep slants,
// crossing one another, two layers deep, with a skull caught among them here and there --
// the decor's own skull, drawn pixel for pixel, in the bone's ramp sunk almost to the dark
// (mean luma 20 against the void's median 21), so it reads as a wall of bone out of the
// dark, not as a pattern laid on it.
//
//   WALL  sixteen long bones behind and seven in front, each a shaft and two knobs at either
//         end (capsules and discs), shaded by the normal of the primitive each pixel lies
//         deepest in, lit from the upper left; every bone cut from what is behind it by a
//         one-pixel crease that only ever darkens. Slants 11-34 degrees off upright, either
//         way at random: never near level, because a bone lying flat is a lit line a player
//         reads as a ledge (the crypt's lesson). Two skulls a tile, among the back bones,
//         the front ones crossing past them.
//   FACE  one long bone down the edge, knuckled where two meet, its rim lit toward the shaft.
//
// WHAT THIS REPLACED. The first painting stood the bones on end in four straight files,
// knuckle on knuckle, every file the same: in a real frame each file was a CHAIN of
// dumbbells, the wall a bead curtain, and the face -- vertebrae eight pixels apart -- a
// zipper. What says bone at this size is the skull, and bones that cross like a heap.

import { Plan, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#040206',   // 0 outline, void
  '#0a0710',   // 1 void between bones, and the crease
  '#130e18',   // 2 bone, deepest (violet)
  '#1c1523',   // 3 bone, shadow (violet)
  '#262029',   // 4 bone
  '#322b31',   // 5 bone, light
  '#433a3c',   // 6 bone, lit (warm)
  '#524661',   // 7 rim
];

// Lit from the upper left and toward the viewer, a little more from above than the side,
// so a bone at any slant has one lit flank.
const LX = -0.55, LY = -0.62, LZ = 0.56;
const LN = Math.hypot(LX, LY, LZ);

/** A bone from (x0, y0) to (x1, y1): a shaft and a pair of knobs at each end. */
function bonePrims(x0, y0, x1, y1, rs, rk) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;   // across the bone
  const prims = [{ ax: x0, ay: y0, bx: x1, by: y1, r: rs }];
  for (const [ex, ey] of [[x0, y0], [x1, y1]]) {
    for (const s of [-1, 1]) {
      const cx = ex + s * nx * (rk * 0.8), cy = ey + s * ny * (rk * 0.8);
      prims.push({ ax: cx, ay: cy, bx: cx, by: cy, r: rk });
    }
  }
  return prims;
}

/** Shade a set of primitives into the plan, cut from what is behind by a crease. */
function shadeBone(p, owner, prims, id) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of prims) {
    x0 = Math.min(x0, q.ax - q.r, q.bx - q.r); x1 = Math.max(x1, q.ax + q.r, q.bx + q.r);
    y0 = Math.min(y0, q.ay - q.r, q.by - q.r); y1 = Math.max(y1, q.ay + q.r, q.by + q.r);
  }
  // Over the bounding box in a typed array: a Set of string keys made this zone's build
  // 14 ms cold, most of it hashing.
  const bx0 = Math.floor(x0), by0 = Math.floor(y0);
  const bw = Math.ceil(x1) - bx0 + 1, bh = Math.ceil(y1) - by0 + 1;
  const T = new Uint8Array(bw * bh);   // 0 = not this bone, else its tone
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const px = bx0 + i + 0.5, py = by0 + j + 0.5;
      let bnx = 0, bny = 0, depth = 0;
      for (const q of prims) {
        const dx = q.bx - q.ax, dy = q.by - q.ay, L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((px - q.ax) * dx + (py - q.ay) * dy) / L2)) : 0;
        const nx = px - (q.ax + t * dx), ny = py - (q.ay + t * dy);
        const d = q.r - Math.sqrt(nx * nx + ny * ny);
        if (d > depth) { depth = d; bnx = nx / q.r; bny = ny / q.r; }
      }
      if (depth <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - bnx * bnx - bny * bny));
      const l = (bnx * LX + bny * LY + nz * LZ) / LN;
      T[j * bw + i] = l > 0.86 ? 6 : l > 0.66 ? 5 : l > 0.4 ? 4 : l > 0.15 ? 3 : 2;
    }
  }
  const has = (i, j) => i >= 0 && j >= 0 && i < bw && j < bh && T[j * bw + i] > 0;
  // The crease round it first: dark on void, and on a bone behind it only where that
  // darkens (a rim lighter than what it cuts would draw a pale halo round every bone).
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      if (!T[j * bw + i]) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (has(i + ox, j + oy)) continue;
        const x = bx0 + i + ox, y = by0 + j + oy;
        p.set(x, y, p.get(x, y) <= 1 ? 0 : 1);
      }
    }
  }
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const v = T[j * bw + i];
      if (!v) continue;
      p.set(bx0 + i, by0 + j, v);
      owner[p.i(bx0 + i, by0 + j)] = id;
    }
  }
}

// The decor's skull (decorpaint/abyss.js), letter for letter; its ramp mapped onto this
// wall's: o outline, H/L/M/S/D down the bone ramp, K the hollows.
const SKULL = [
  '.....oooooo.....',
  '....oHHHLLLoo...',
  '...oHHHLLLLMMo..',
  '...oHHLLLLLMMSo.',
  '...oHLLLLLLMMSo.',
  '...oLKKKLLKKMSo.',
  '...oLKKKLLKKSSo.',
  '...oMLKLLLKMSDo.',
  '....oMLLKKLMSDo.',
  '....oSMMKLMSDo..',
  '.....oLKLKLKo...',
  '.....oLKLKLo....',
  '......ooooo.....',
];
const SKULL_TONE = { o: 0, H: 6, L: 5, M: 4, S: 3, D: 2, K: 1 };

function skull(p, owner, x0, y0, id) {
  SKULL.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '.') continue;
      p.set(x0 + i, y0 + j, SKULL_TONE[c]);
      owner[p.i(x0 + i, y0 + j)] = id;
    }
  });
}

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 1);
    const owner = new Uint16Array(WALL_W * WALL_H);
    let id = 1;
    const bone = (cx, cy, len, ang, rs, rk) => {
      // ang: off upright, radians; positive leans the top to the right.
      const hx = Math.sin(ang) * len / 2, hy = Math.cos(ang) * len / 2;
      shadeBone(p, owner, bonePrims(cx - hx, cy + hy, cx + hx, cy - hy, rs, rk), id++);
    };
    // Behind: sixteen long bones on a jittered 4 x 4 grid, each row offset half a column,
    // leaning either way at random: leaning alternately they crossed in a regular diamond,
    // a TRELLIS of bone rather than a heap.
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const lean = (r.chance(0.5) ? 1 : -1) * r.float(0.2, 0.6);
        bone(i * 16 + (j % 2) * 8 + 4 + r.float(-3, 3), j * (WALL_H / 4) + 16 + r.float(-6, 6),
          r.float(34, 46), lean, r.float(2.0, 2.5), r.float(2.6, 3.0));
      }
    }
    // Two skulls caught in the heap, well apart and off each other's rows.
    const skullA = id++, skullB = id++;
    skull(p, owner, r.int(4, 12), r.int(14, 22), skullA);
    skull(p, owner, r.int(34, 42), r.int(78, 86), skullB);
    // In front: seven shorter bones crossing past, steeper, clear of the skulls' faces.
    for (let k = 0; k < 7; k++) {
      const lean = (r.chance(0.5) ? 1 : -1) * r.float(0.25, 0.6);
      bone((k * 37 + 26) % WALL_W + r.float(-3, 3), k * (WALL_H / 7) + 6 + r.float(-4, 4),
        r.float(24, 34), lean, r.float(1.8, 2.2), r.float(2.3, 2.7));
    }
    // Shading thin capsules by their normals leaves single pixels of a tone where the
    // bands cross a shaft two or three pixels wide: 3.9% of the tile, a wall of specks.
    // Each bone pixel no neighbour shares takes its neighbours' majority -- but not the
    // skulls', whose single dark teeth and sockets are the drawing.
    // Counted in a small typed array, not per-pixel arrays and Maps, which were most of
    // this zone's build time.
    const tally = new Uint8Array(PAL.length);
    for (let pass = 0; pass < 2; pass++) {
      const out = new Uint8Array(p.t);
      for (let y = 0; y < WALL_H; y++) {
        for (let x = 0; x < WALL_W; x++) {
          const v = p.get(x, y);
          const who = owner[p.i(x, y)];
          if (v < 2 || who === skullA || who === skullB) continue;
          let shared = false;
          for (let dy = -1; dy <= 1 && !shared; dy++) {
            for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && p.get(x + dx, y + dy) === v) { shared = true; break; }
          }
          if (shared) continue;
          tally.fill(0);
          let best = -1;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const q = p.get(x + dx, y + dy);
            if (q < 2) continue;
            tally[q]++;
            // Most neighbours wins; on a tie, the tone nearest the pixel's own.
            if (best < 0 || tally[q] > tally[best]
              || (tally[q] === tally[best] && Math.abs(q - v) < Math.abs(best - v))) best = q;
          }
          if (best >= 0) out[p.i(x, y)] = best;
        }
      }
      p.t = out;
    }
    return p.pix(PAL);
  },

  face() {
    const p = new Plan(FACE_W, WALL_H, 1);
    // One long bone down the edge, a cylinder lit from the left; the rim, then the outline
    // against the shaft. Where two bones meet, every 64 px, a knuckle: the bone swells a
    // pixel into the crease column and a dark joint slants across it.
    const ramp = [1, 5, 6, 5, 4, 3, 7, 0];
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < FACE_W; x++) p.set(x, y, ramp[x]);
    for (const y0 of [30, 94]) {
      for (let dy = -4; dy <= 4; dy++) p.set(0, y0 + dy, Math.abs(dy) < 3 ? 5 : 4);
      for (let x = 0; x < 6; x++) p.set(x, y0 + 1 - Math.floor(x / 3), 1);
      p.set(1, y0 - 2, 6); p.set(1, y0 + 3, 6);
    }
    return p.pix(PAL);
  },
};
