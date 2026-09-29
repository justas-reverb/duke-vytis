// DUNGEON: crypt stone -- the ledges' violet-grey rock, laid up as an old uncoursed wall.
//
// The ledges are rough violet-grey stone and the backdrop is slate-blue ashlar with carved
// crosses on its piers, drawn as flat faces with a lit top-left edge. The side walls sit
// between the two, in the backdrop's idiom: flat stone faces, lit top and left, shadowed
// bottom and right, corners knocked round -- in a hue between the ledges' violet and the
// backdrop's slate, and a step DARKER than the backdrop (luma about 31 against its 35), so
// the shaft reads as the lit space and the walls as its frame.
//
// A crypt's rubble wall rather than the backdrop's ashlar: courses of uneven height, stones
// of uneven length, no joint lining up with the one below it, some cracked, now and then a
// small stone wedged in a gap. Older and rougher than the dressed piers behind, not more of
// them.
//
//   FACE  a column of quoins on the same courses, the lit arris down the inner edge and the
//         outline against the shaft.
//
// A first version mottled every stone with a noise field. In the frame it read as
// camouflage, and brighter than the backdrop (44 against 35): nothing else in this zone is
// mottled, so it did not look like the same hand.

import { Plan, parts, stone, wallRng, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#08070d',   // 0 outline, deep joint
  '#111019',   // 1 joint
  '#141220',   // 2 stone, shadow
  '#1a1727',   // 3 stone, dark
  '#1f1c2d',   // 4 stone
  '#252134',   // 5 stone, light
  '#2e2940',   // 6 stone, lit edge
  '#474060',   // 7 arris
];

/** The courses, shared by the wall and the face so the quoins sit on the same joints. */
const courses = () => parts(wallRng('DUNGEON', 'courses'), WALL_H, 20, 34);

/** Stone lengths along one course, with no joint within 5 px of one in the course below. */
function lengths(r, below) {
  for (let t = 0; t < 80; t++) {
    const off = r.int(0, WALL_W - 1);
    const ws = parts(r, WALL_W, 16, 40);
    const joints = [];
    let x = off;
    for (const w of ws) { joints.push(x % WALL_W); x += w; }
    const clash = below && joints.some((j) => below.some((b) => {
      const d = Math.abs(j - b);
      return Math.min(d, WALL_W - d) < 6;
    }));
    if (!clash) return { off, ws, joints };
  }
  return { off: 0, ws: [32, 32], joints: [0, 32] };
}

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 1);
    let y = 3, below = null, prev = -1;
    for (const h of courses()) {
      const { off, ws, joints } = lengths(r, below);
      let x = off;
      ws.forEach((w) => {
        // Neighbouring stones never the same tone, so no two read as one long block.
        let b = [3, 4, 4, 5][r.int(0, 3)];
        if (b === prev) b = b === 4 ? r.pick([3, 5]) : 4;
        prev = b;
        stone(p, r, x, y, w, h, b, { lit: 0.5, pits: [1, 3], chip: 0.3, crack: 0.35, top: 6 });
        // Now and then a small stone wedged into the lower corner of a long one.
        if (w > 26 && h > 22 && r.chance(0.35)) {
          const sw = r.int(9, 12), sh = r.int(8, 10);
          stone(p, r, x + w - sw, y + h - sh, sw, sh, b === 5 ? 3 : b + 1, { lit: 0.6, pits: [0, 0], chip: 0 });
        }
        x += w;
      });
      below = joints;
      y += h;
    }
    return p.pix(PAL);
  },

  face(r) {
    const p = new Plan(FACE_W, WALL_H, 1);
    let y = 3, k = 0;
    for (const h of courses()) {
      const b = k++ % 2 ? 4 : 5;
      p.hline(0, 5, y, 1);
      p.rect(1, y + 1, 5, h - 1, b);
      p.vline(1, y + 2, y + h - 4, b + 1);
      p.hline(2, 3, y + 1, b + 1);
      p.hline(2, 5, y + h - 1, b - 1);
      p.set(1, y + 1, 1);
      p.set(1, y + h - 1, 1);
      if (r.chance(0.6)) p.rect(2 + r.int(0, 2), y + r.int(4, h - 6), 1, 2, b - 1);
      y += h;
    }
    p.vline(0, 0, WALL_H - 1, 1);
    // The arris, one step dimmer where it crosses a joint, and the outline.
    for (let yy = 0; yy < WALL_H; yy++) {
      p.set(6, yy, p.get(3, yy) === 1 ? 6 : 7);
      p.set(7, yy, 0);
    }
    return p.pix(PAL);
  },
};
