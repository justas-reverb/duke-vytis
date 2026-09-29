// STORM: storm-lit basalt -- the tower's rock, standing in columns, running with rain.
//
// The ledges here are banks of sunlit cloud and the backdrop is a violet storm sky piled
// with more of it. Cloud on the walls as well would put the walls in the same material as
// the one thing the Duke stands on, and puffs have lit tops; so the walls are the dark rock
// the storm is breaking on, in the sky's violet, lit by its lightning: a cliff of basalt
// columns, darker than the sky behind it (luma about 42 against 65) -- the one zone where
// the frame is clearly darker than what it frames, as a tower is against a storm.
//
// Not DUNGEON's rubble nor CITADEL's ashlar: columns stand up the whole wall, so all of the
// structure is vertical, and the cross-fractures that break them are slanted and dark.
//
//   WALL  four or five columns across the tile, each with three faces -- lit to the left,
//         the middle, falling into shadow on the right -- a lit arris down its left edge,
//         broken every 20-50 px by a slanting fracture with a pixel of lit lip under it.
//         Rain runs down the lit faces in short wet streaks.
//   FACE  the last column's edge, its rim in the lightning's violet.

import { Plan, parts, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#0a0811',   // 0 outline
  '#120e1b',   // 1 joint
  '#191424',   // 2 face, dark
  '#201a2e',   // 3 face, shadow
  '#272037',   // 4 face
  '#2f2742',   // 5 face, lit
  '#3a3150',   // 6 arris
  '#453b5e',   // 7 wet streak
  '#6c5a92',   // 8 rim, lightning-lit
];

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 4);
    let x = r.int(0, 15);
    for (const w of parts(r, WALL_W, 11, 17)) {
      const a = Math.round(w * 0.3), b = Math.round(w * 0.72);
      for (let y = 0; y < WALL_H; y++) {
        p.set(x, y, 1);
        p.set(x + 1, y, 6);
        for (let i = 2; i < w; i++) p.set(x + i, y, i < a ? 5 : i < b ? 4 : i < w - 1 ? 3 : 2);
      }
      // Cross-fractures, slanting across the column.
      let y = r.int(0, WALL_H - 1);
      for (const h of parts(r, WALL_H, 20, 50)) {
        const tilt = r.chance(0.5) ? 1 : -1;
        for (let i = 1; i < w; i++) {
          const yy = y + Math.round((tilt * (i - w / 2)) / 3);
          p.set(x + i, yy, 1);
          if (i > 1 && i < a + 2) p.set(x + i, yy + 1, 6);
        }
        y += h;
      }
      // Rain on the lit faces.
      for (let k = 0; k < 3; k++) {
        const sx = x + 2 + r.int(0, Math.max(0, a - 2)), sy = r.int(0, WALL_H - 1), len = r.int(4, 11);
        for (let j = 0; j < len; j++) if (p.get(sx, sy + j) >= 4) p.set(sx, sy + j, j === len - 1 ? 5 : 7);
      }
      x += w;
    }
    return p.pix(PAL);
  },

  face(r) {
    const p = new Plan(FACE_W, WALL_H, 4);
    const ramp = [1, 6, 5, 5, 4, 4, 8, 0];
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < FACE_W; x++) p.set(x, y, ramp[x]);
    let y = 11;
    for (const h of parts(r, WALL_H, 24, 44)) {
      p.set(1, y, 1); p.set(2, y, 1); p.set(3, y + 1, 1); p.set(4, y + 1, 1); p.set(5, y + 1, 1);
      p.set(2, y + 1, 6);
      p.set(6, y + 1, 6);
      y += h;
    }
    for (let k = 0; k < 2; k++) {
      const sy = r.int(0, WALL_H - 1);
      for (let j = 0; j < 8; j++) if (p.get(3, sy + j) >= 4) p.set(3, sy + j, 7);
    }
    return p.pix(PAL);
  },
};
