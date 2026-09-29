// ABYSS: letters of bone -- every straight stroke one long bone, knuckled at both ends.
//
// A letter is laid out of bones the way the zone's heaps are (decorpaint/abyss.js): each
// straight run of a stroke is a shaft with a DOUBLE knuckle at each end -- two round knobs
// side by side -- because a bone without them reads as a stick (the pixel-art-in-code rule).
// Where two runs meet, their knuckles overlap into a joint. Every pixel is shaded by the
// primitive it lies deepest in -- the shaft as a cylinder, each knob as a ball -- lit from
// the upper left, so a shaft running at any angle still has its lit side. Bones are laid in
// turn and each later one cut from the one under it by a one-pixel crease that only ever
// DARKENS (a crease that could lighten turned the hollows of the dungeon's rib cage pale).
//
// The palette is the zone's own bone, which turns violet in the shade as the abyss's spine
// does: ivory lit, grey-violet turned away.
//
// AGAINST THE ABYSS. The sky is near-black violet (#100a1c to #1e1430, luminance ~0.005), so
// pale bone is the brightest thing in the zone: the shafts' lit sides sit at luminance ~0.6-
// 0.8, and the tile's own darkest violet outlines them.
//
// THE ENTRANCE: each letter drops into place, bone on bone, and settles with a jolt.

import { layoutWord, straightRuns, Plan, dropShadowSteps, haloSteps, overdue } from './util.js';

// The zone's bone (decorpaint/abyss.js): D, S, M, L, H, and a white for the brightest glint.
const BONE = ['#3b2c4c', '#5f4673', '#827088', '#aaa49d', '#d5c9c0', '#f1e7dd', '#fffaf2'];
const OUT = '#100e1c';
const SHADOW = '#05030a';
const M_BONE = 1;
// The light, from the upper left and in front: x, y down, z toward us.
const LX = -0.52, LY = -0.62, LZ = 0.59;

export const METRICS = { K: 11, R: 7, gap: 12, pad: [16, 16, 18, 16], reach: 12 };

function* bones(plan) {
  const P = new Plan(plan.w, plan.h);
  const { w } = plan;
  const RS = plan.R * 0.6;           // the shaft's half-width [px, ~4]
  const RK = plan.R * 0.62;          // each knob's radius
  const SK = plan.R * 0.5;           // the knobs' offset either side of the axis
  const laid = new Uint8Array(plan.w * plan.h);   // which bone (1-based) laid each pixel
  let id = 0;
  for (const L of plan.letters) {
    for (const r of straightRuns(L)) {
      id++;
      const len = Math.hypot(r.bx - r.ax, r.by - r.ay), ux = (r.bx - r.ax) / len, uy = (r.by - r.ay) / len;
      const knobs = [];
      // Knuckles on a long bone's ends and on any free end; a short run in a curve (the S's
      // turns, the B's bowls) is a plain shaft between its neighbours' knuckles, or the curve
      // was a string of knots.
      const short = len < plan.K * 1.5;
      for (const [cx, cy, out, nd] of [[r.ax, r.ay, -1, L.nodes[r.a]], [r.bx, r.by, 1, L.nodes[r.b]]]) {
        if (short && nd.deg > 1) continue;
        for (const side of [-1, 1]) {
          knobs.push([cx + ux * out * 1.5 - uy * side * SK, cy + uy * out * 1.5 + ux * side * SK]);
        }
      }
      const x0 = Math.floor(Math.min(r.ax, r.bx) - plan.R - 3), x1 = Math.ceil(Math.max(r.ax, r.bx) + plan.R + 3);
      const y0 = Math.floor(Math.min(r.ay, r.by) - plan.R - 3), y1 = Math.ceil(Math.max(r.ay, r.by) + plan.R + 3);
      for (let y = y0; y <= y1; y++) {
        if (overdue()) yield;
        for (let x = x0; x <= x1; x++) {
          if (!P.in(x, y)) continue;
          const px = x + 0.5, py = y + 0.5;
          // The shaft: a cylinder along the run.
          const ax = px - r.ax, ay = py - r.ay;
          const along = ax * ux + ay * uy, s = -ax * uy + ay * ux;
          let depth = -1, nx = 0, ny = 0;
          if (along >= 0 && along <= len && Math.abs(s) <= RS) {
            depth = 1 - Math.abs(s) / RS;
            const k = s / RS;
            nx = -uy * k; ny = ux * k;
          }
          for (const [kx, ky] of knobs) {
            const dd = Math.hypot(px - kx, py - ky);
            if (dd > RK) continue;
            const dk = 1 - dd / RK;
            if (dk > depth) { depth = dk; nx = (px - kx) / RK; ny = (py - ky) / RK; }
          }
          if (depth < 0) continue;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const l = nx * LX + ny * LY + nz * LZ;
          let t = l > 0.88 ? 6 : l > 0.7 ? 5 : l > 0.45 ? 4 : l > 0.15 ? 3 : l > -0.2 ? 2 : 1;
          const i = y * w + x;
          // The crease: this bone's rim where it lies over one laid before, only darker.
          if (laid[i] && laid[i] !== id && depth < 0.2) t = Math.min(t, 1);
          if (laid[i] && laid[i] !== id && depth < 0.2 && P.tone[i] <= t) continue;
          P.put(x, y, M_BONE, t);
          laid[i] = id;
        }
      }
    }
  }
  yield* P.despeckleSteps(1);
  return P;
}

function* finish(P) {
  const p = yield* P.toPixSteps({ [M_BONE]: BONE }, { [M_BONE]: OUT });
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.55]]);
  yield* haloSteps(p, SHADOW, 2, 0.5);
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    // A generator: the bones in one step, the outline and shadow in the next.
    frames: [function* ossuary() { const P = yield* bones(plan); yield; return yield* finish(P); }],
    // Dropped in from above, a jolt past its place, and back.
    seq: [[0, 0.035, -18], [0, 0.035, -8], [0, 0.035, 2]],
    stagger: 0.05,
  };
}
