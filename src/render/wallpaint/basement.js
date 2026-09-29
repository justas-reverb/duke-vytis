// BASEMENT: the cellar's own brick, the ledges' brown brick seen in the gloom of the shaft.
//
// The ledges here are warm brown brick and the backdrop is a violet brick wall, so the side
// walls are the ledges' brick -- the same running bond and the same browns -- pulled toward
// the backdrop's plum mortar in the shadows and kept two to three steps darker than any
// ledge: the ledges are what the eye tracks, the walls only frame the shaft.
//
//   WALL  running bond, 32 x 16 courses (30 x 14 of brick, 2 of mortar), each brick one of
//         three tones set by a damp patch field, lit along its top and left and shadowed
//         along its bottom and right, its corners worn round, a few pits and chips in it.
//         The mortar under each brick is its darkest: the brick overhangs its joint.
//   FACE  the ends of the same courses turning the corner: the bed joints carry on across
//         it, and its last two columns are the lit arris and the dark outline against the
//         shaft, so the edge the Duke bounces off is one clear light line at any speed.
//
// Nothing is lit along a whole course. A brick's lit top stops two thirds of the way along
// it and the courses are staggered, so no lit row runs across the wall -- a long lit
// horizontal is a ledge to the eye.

import { Plan, noise, WALL_W, WALL_H, FACE_W } from './util.js';

// Mortar deep to light, then the brick ramp, shadows toward plum, lights toward ochre.
export const PAL = [
  '#0e0710',   // 0 outline, mortar in shadow
  '#1a0e16',   // 1 mortar
  '#26151a',   // 2 brick deep
  '#301c1c',   // 3 brick shadow
  '#3a231e',   // 4 brick
  '#442a22',   // 5 brick light
  '#523327',   // 6 brick lit
  '#664330',   // 7 arris, the brightest thing on the wall
];

const CH = 16, BW = 32, OY = 5, OX = 7;

/** Tone of each brick, set by course and column: damp patches darker. */
function brickTone(damp, r, bx, by) {
  const v = damp(bx + BW / 2, by + CH / 2) + (r.next() - 0.5) * 0.3;
  return v < 0.36 ? 3 : v < 0.64 ? 4 : 5;
}

function brick(p, r, x0, y0, w, h, b) {
  p.rect(x0, y0, w, h, b);
  // Worn corners.
  for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.set(x0 + cx, y0 + cy, 1);
  // Lit top and left from the upper left, the top stopping short so no course lights end to end.
  const lit = Math.min(7, b + 1);
  p.hline(x0 + 1, x0 + Math.floor(w * 0.42), y0, lit);
  p.vline(x0, y0 + 1, y0 + h - 4, lit);
  p.set(x0 + 1, y0 + 1, lit);
  // Shadowed bottom and right.
  p.hline(x0 + 1, x0 + w - 2, y0 + h - 1, b - 1);
  p.vline(x0 + w - 1, y0 + 2, y0 + h - 2, b - 1);
  // Pits: two-pixel marks, never lone specks.
  const n = r.int(2, 4);
  for (let k = 0; k < n; k++) {
    const px = x0 + r.int(3, w - 6), py = y0 + r.int(3, h - 5);
    if (r.chance(0.5)) p.rect(px, py, 2, 1, b - 1); else p.rect(px, py, 1, 2, b - 1);
  }
  // Now and then a chipped corner, the chip's floor in mortar and its lower edge lit.
  if (r.chance(0.35)) {
    const right = r.chance(0.5);
    const cx = right ? x0 + w - 4 : x0;
    p.rect(cx, y0 + h - 3, 4, 3, 1);
    p.hline(cx, cx + 3, y0 + h - 4, b - 1);
  }
}

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 1);
    const damp = noise(r, 3, 5, WALL_W, WALL_H);
    for (let j = 0; j < WALL_H / CH; j++) {
      const y0 = OY + j * CH;
      // Mortar: the row under the course above in deep shadow, the rest mortar.
      p.hline(0, WALL_W - 1, y0 - 2, 0);
      // Two bricks a course per tile, and the tile repeats sideways, so a course whose two
      // bricks both came out light is a light stripe right across the wall. One of them is
      // taken down a step when that happens.
      const tones = [0, 1].map((i) => brickTone(damp, r, OX + i * BW + (j % 2) * (BW / 2), y0));
      if (tones[0] === 5 && tones[1] === 5) tones[r.int(0, 1)] = 4;
      for (let i = 0; i < WALL_W / BW; i++) {
        const x0 = OX + i * BW + (j % 2) * (BW / 2);
        brick(p, r, x0, y0, BW - 2, CH - 2, tones[i]);
      }
    }
    return p.pix(PAL);
  },

  face(r) {
    const p = new Plan(FACE_W, WALL_H, 1);
    for (let j = 0; j < WALL_H / CH; j++) {
      const y0 = OY + j * CH, h = CH - 2;
      p.hline(0, FACE_W - 1, y0 - 2, 0);
      const b = j % 3 === 1 ? 4 : 5;
      // The brick end: a joint against the wall, the brick, the arris, the outline.
      p.rect(1, y0, 5, h, b);
      p.set(1, y0, 1);
      p.vline(1, y0 + 1, y0 + h - 3, b + 1);
      p.hline(2, 5, y0, b + 1);
      p.hline(2, 5, y0 + h - 1, b - 1);
      if (r.chance(0.5)) p.rect(2 + r.int(0, 2), y0 + r.int(3, h - 5), 1, 2, b - 1);
    }
    // The arris runs the whole height -- one step dimmer across the joints, not broken by
    // them -- and the outline outside it meets the shaft.
    for (let y = 0; y < WALL_H; y++) {
      const joint = p.get(3, y) <= 1;
      p.set(6, y, joint ? 5 : 7);
      p.set(7, y, 0);
    }
    return p.pix(PAL);
  },
};
