// ZENITH: the top of the tower, clad in gold -- the scale-work of a gilded spire.
//
// The ledges are bright gold blocks, the backdrop a deep blue sky crossed by falling shafts
// of pale light. The side walls are the ledges' gold in shade -- the same ochre hues three
// and four steps down (luma about 55 against the sky's 65, the ledges' tops near 190) -- so
// the gold ledges and the Duke stay the brightest things here and the walls frame the blue
// instead of competing with it.
//
//   WALL  gold scales laid like a spire's cladding, each row overlapping the one below and
//         offset by half a scale. Every scale is a small dome lit from the upper left,
//         with a dark rim along its round foot where it stands proud of the row beneath,
//         and the row above casting a thin shadow across its top. The tile is eight rows
//         of four; which scale is on top at a pixel is worked out, not painted in order,
//         because on a wrapping tile the bottom row overlaps the top one and no drawing
//         order can do that.
//   FACE  a bead-and-reel moulding down the edge: round beads, dark reels between them,
//         the lit rim and the outline.
//
// Nothing here is a line: the lit parts are the upper-left shoulders of round scales, and a
// row of them is a row of separate bumps, never a lit rule across the wall.
//
// A first version was fluted pilasters -- vertical channels with rounded ends every 64 px,
// staggered. In the frame it read as bamboo, and as bright as the ledges' own bodies.

import { Plan, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#120b04',   // 0 outline
  '#2c1d0b',   // 1 rim under a scale
  '#39260e',   // 2 cast shadow
  '#453011',   // 3 gold, shadow
  '#513914',   // 4 gold
  '#5d4217',   // 5 gold, light
  '#6c4e1b',   // 6 gold, lit shoulder
  '#a2772e',   // 7 rim of the face, the brightest thing on the wall
];

const SW = 16, RH = 16, OY = 6;
const R = 8;
// Light from the upper left and a little in front -- more from the left than from above,
// so each scale is lit down its left flank rather than across its top: lit tops all sat on
// the same rows, a band of light across the wall every 16 px (13 luma over the mean).
const LX = -0.72, LY = -0.42, LZ = 0.55;

export default {
  PAL,
  wall() {
    const p = new Plan(WALL_W, WALL_H, 4);
    const rows = WALL_H / RH;
    // Where a scale in row j stands: the centre of its round foot's circle.
    const centre = (j, x) => {
      const jj = ((j % rows) + rows) % rows;
      const off = (jj % 2) * (SW / 2);
      const col = Math.floor((((x - off) % WALL_W) + WALL_W) % WALL_W / SW);
      return { cx: off + col * SW + SW / 2, cy: OY + jj * RH + RH - R };
    };
    const dxOf = (x, cx) => {
      let d = x + 0.5 - cx;
      while (d > WALL_W / 2) d -= WALL_W;
      while (d < -WALL_W / 2) d += WALL_W;
      return d;
    };
    // Is (x, y) inside the scale of row j (its round foot, or the body above it)?
    const inside = (j, x, y) => {
      const { cx, cy } = centre(j, x);
      const dx = dxOf(x, cx);
      let dy = y + 0.5 - cy;
      while (dy > WALL_H / 2) dy -= WALL_H;
      while (dy < -WALL_H / 2) dy += WALL_H;
      if (Math.abs(dx) > R) return null;
      if (dy > 0 && dx * dx + dy * dy > R * R) return null;
      if (dy < -RH - R) return null;
      return { dx, dy };
    };
    for (let y = 0; y < WALL_H; y++) {
      // The nearest row whose foot is at or below this pixel owns it if it reaches it;
      // otherwise the row under that one does.
      const jA = Math.floor((y - OY) / RH);
      for (let x = 0; x < WALL_W; x++) {
        let own = inside(jA, x, y), j = jA;
        if (!own) { own = inside(jA + 1, x, y); j = jA + 1; }
        if (!own) { own = inside(jA - 1, x, y); j = jA - 1; }
        if (!own) continue;
        const { dx, dy } = own;
        // The rim along the round foot.
        const rr = Math.sqrt(dx * dx + Math.max(0, dy) * Math.max(0, dy));
        if (dy > 0 && rr > R - 1.1) { p.set(x, y, 1); continue; }
        // Shadow cast by the row above, just under its foot.
        const above = inside(j - 1, x, y - 1) || inside(j - 1, x, y - 2);
        if (above) { p.set(x, y, inside(j - 1, x, y - 1) ? 2 : 3); continue; }
        // A shallow dome lit from the upper left.
        const nx = dx / (R + 1.5), ny = Math.max(-0.8, dy / (R + 1.5));
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        const d = (nx * LX + ny * LY + nz * LZ) / Math.hypot(LX, LY, LZ);
        p.set(x, y, d > 0.93 ? 6 : d > 0.76 ? 5 : d > 0.45 ? 4 : 3);
      }
    }
    p.despeckle(new Set([1]));
    return p.pix(PAL);
  },

  face() {
    const p = new Plan(FACE_W, WALL_H, 4);
    // A groove against the wall, then the moulding: beads 14 px long, reels of 2 between.
    for (let y = 0; y < WALL_H; y++) {
      p.set(0, y, 1);
      const k = ((y - 5) % 16 + 16) % 16;           // position within a bead and its reel
      if (k >= 14) {                                  // the reel: a dark waist
        p.hline(1, 5, y, k === 14 ? 1 : 2);
      } else {
        const e = Math.min(k, 13 - k);                // rounded ends of the bead
        const row = e === 0 ? [2, 3, 4, 4, 3] : e === 1 ? [3, 4, 5, 5, 4] : [3, 5, 6, 5, 4];
        for (let x = 0; x < 5; x++) p.set(1 + x, y, row[x]);
      }
      // The rim runs the whole height, a step dimmer across each reel, then the outline.
      p.set(6, y, k >= 14 ? 5 : 7);
      p.set(7, y, 0);
    }
    return p.pix(PAL);
  },
};
