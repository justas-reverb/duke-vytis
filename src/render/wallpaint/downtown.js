// DOWNTOWN: timber and plaster -- the house fronts of the street, seen from inside the shaft.
//
// The ledges are a timber gallery, the backdrop a street of violet house fronts at night
// with warm lit windows. The side walls are the same houses close to: a half-timbered wall,
// the gallery's oak sunk into the dark and framing panels of lime plaster in the night's
// lavender -- the plaster clearly LIGHTER than the timber, as it is on a real house front,
// and the whole just under the facades behind (mean luma 37 against their median 38, far
// under their lit windows). No windows, so nothing on it glows like the street's.
//
//   WALL  one storey a tile: two posts nine pixels thick, the storey beam and a breast rail
//         half a storey above it, and between the two, one brace in each panel leaning in
//         toward the same post -- with the post, the chevron a framer calls the MAN. Above
//         the rail the panels are plain plaster. The timber proud of the plaster, so lit
//         down its left edges and casting a pixel of shadow onto the plaster at its right
//         and below; a rail's top is NOT lit -- a lit row across the wall is a ledge to the
//         eye -- it takes the outline, and the plaster under it sits in its shadow two rows
//         deep. Grain along every member, pegs at the joints; the plaster in soft patches of
//         three close tones, a few hairline cracks, the lath showing where some has fallen.
//   FACE  a corner post, grained, the lit rim down its inner edge.
//
// WHAT THIS REPLACED. The first painting framed panels of plaster almost as dark as the
// timber (luma 37 against 26) with six-pixel posts, a rail every 128 px and one short brace
// every other panel. In a real frame the plaster sank to the timber's value, the thin posts
// stood out alone, and the wall read as SCAFFOLDING -- poles and a rail. A half-timbered
// house reads by LIGHT panels between thick DARK members (here 49 against 24), and by the
// braces a house has; a St Andrew's cross in a panel this tall and narrow read as a pylon.

import { Plan, noise, WALL_W, WALL_H, FACE_W } from './util.js';

export const PAL = [
  '#0a0710',   // 0 outline
  '#110c0d',   // 1 timber, grain
  '#17100f',   // 2 timber, shadow
  '#1f1613',   // 3 timber
  '#2f2219',   // 4 timber, lit
  '#28223a',   // 5 plaster, shadow
  '#312b45',   // 6 plaster
  '#362f4b',   // 7 plaster, light
  '#3b3451',   // 8 plaster, lit patch
  '#56402e',   // 9 rim
  '#1a1215',   // 10 lath where the plaster has fallen
  '#261c1c',   // 11 lath, lit strip
];

// Off the tile's edges, so no member lies on a seam, where it would double when the tile
// repeats (and where tools/test-walls.mjs reads it as one).
const POSTS = [2, 34], PW = 9;
// The storey beam, and the breast rail half a storey above it.
const RAILS = [[100, 8], [44, 6]];

export default {
  PAL,
  wall(r) {
    const p = new Plan(WALL_W, WALL_H, 6);
    const patch = noise(r, 4, 7, WALL_W, WALL_H);
    // Plaster in two tones in soft patches, and a third, lighter, only where a patch peaks.
    p.map((x, y) => { const n = patch(x, y); return n > 0.72 ? 8 : n > 0.5 ? 7 : 6; });
    // Lath showing where the plaster has fallen: one ragged patch in a panel, not two.
    {
      const cx = r.int(15, 26), cy = r.int(84, 110);
      for (let y = -4; y <= 4; y++) {
        const hw = Math.round(4.5 - Math.abs(y) * 0.6 + r.float(-0.8, 0.8));
        for (let x = -hw; x <= hw; x++) p.set(cx + x, cy + y, (y + 40) % 3 === 0 ? 11 : 10);
        p.set(cx - hw - 1, cy + y, 5);
      }
    }
    // Hairline cracks, falling.
    for (let k = 0; k < 4; k++) {
      let x = r.int(0, WALL_W - 1), y = r.int(0, WALL_H - 1);
      for (let s = r.int(4, 8); s > 0; s--) {
        if (p.get(x, y) >= 6 && p.get(x, y) <= 8) p.set(x, y, 5);
        y++; if (r.chance(0.4)) x += r.chance(0.5) ? 1 : -1;
      }
    }

    // The timber, as a mask first: which member each pixel belongs to, and how that member
    // runs, so the shading and the shadows can ask.
    const kind = new Uint8Array(WALL_W * WALL_H);   // 0 plaster, 1 post, 2 rail, 3 brace
    const put = (x, y, k) => { kind[p.i(x, y)] = k; };
    const brace = (x0, y0, x1, y1, w) => {
      // A straight member w px thick from (x0, y0) to (x1, y1), stepping one row at a time.
      const n = Math.abs(y1 - y0);
      for (let s = 0; s <= n; s++) {
        const y = y0 + Math.sign(y1 - y0) * s;
        const x = Math.round(x0 + (x1 - x0) * (s / n));
        for (let k = 0; k < w; k++) put(x + k, y, 3);
      }
    };
    const [pa, pb] = POSTS;
    // Between the breast rail and the storey beam, one brace in each panel, leaning in
    // toward the second post from both sides: with the post between them, the chevron a
    // framer calls the MAN. Above the rail the panels are plain plaster.
    const yT = RAILS[1][0] + RAILS[1][1], yB = RAILS[0][0] - 1;
    brace(pa + PW, yB, pb - 7, yT, 6);
    brace(pb + PW + 1 + WALL_W - 64, yT, pa + WALL_W - 7, yB, 6);
    for (const [ry, rh] of RAILS) for (let y = ry; y < ry + rh; y++) for (let x = 0; x < WALL_W; x++) put(x, y, 2);
    for (const px of POSTS) for (let y = 0; y < WALL_H; y++) for (let x = 0; x < PW; x++) put(px + x, y, 1);

    // Shading. Proud of the plaster, lit from the upper left: each member's left edge lit,
    // its right edge in shadow; the girt's top row the outline, its body plain.
    const K = (x, y) => kind[p.i(x, y)];
    for (let y = 0; y < WALL_H; y++) {
      for (let x = 0; x < WALL_W; x++) {
        const k = K(x, y);
        if (!k) continue;
        let v = 3;
        if (k === 2) {
          const top = !K(x, y - 1), bot = !K(x, y + 1);
          v = top ? 0 : bot ? 2 : 3;
        } else {
          const lf = !K(x - 1, y), rt = !K(x + 1, y);
          v = lf ? 4 : rt ? 2 : 3;
          if (k === 3 && !K(x, y - 1) && !lf) v = 3;   // a brace's upper edge: body, not lit
        }
        p.set(x, y, v);
      }
    }
    // Grain: a dark line down each post, broken, and along each brace.
    for (const px of POSTS) {
      let gx = px + 3;
      for (let y = 0; y < WALL_H; y++) {
        if (K(gx, y) === 1 && y % 23 !== 7) p.set(gx, y, 1);
        if (y % 31 === 11) gx = gx === px + 3 ? px + 5 : px + 3;
      }
    }
    for (let y = 0; y < WALL_H; y++) {
      for (let x = 0; x < WALL_W; x++) {
        if (K(x, y) === 3 && K(x - 2, y) === 3 && K(x + 2, y) === 3 && (x + y) % 5 === 0) p.set(x, y, 2);
      }
    }
    // The outline where timber meets plaster on its upper and left sides, and a pixel of
    // cast shadow on the plaster at its right and below.
    p.map((x, y, v) => {
      if (K(x, y)) return undefined;
      if (K(x + 1, y) || K(x, y + 1)) return 0;
      if (K(x - 1, y) || K(x, y - 1)) return 5;
      if (K(x, y - 2) === 2) return 5;   // a rail's shadow, two rows deep
      return undefined;
    });
    // Pegs where the members meet the posts: a dark pixel pair in the post.
    for (const px of POSTS) {
      for (const [ry, rh] of RAILS) { p.set(px + 3, ry + (rh >> 1), 1); p.set(px + 4, ry + (rh >> 1), 1); }
    }
    return p.pix(PAL);
  },

  face(r) {
    const p = new Plan(FACE_W, WALL_H, 3);
    const ramp = [0, 4, 3, 3, 3, 2, 9, 0];
    for (let y = 0; y < WALL_H; y++) for (let x = 0; x < FACE_W; x++) p.set(x, y, ramp[x]);
    // Grain down the post, and pegs where the girt meets it.
    p.vline(3, 0, WALL_H - 1, 1);
    for (let k = 0; k < 3; k++) { const y = r.int(0, WALL_H - 1); p.vline(2, y, y + r.int(6, 14), 2); }
    for (const [ry, rh] of RAILS) p.set(2, ry + (rh >> 1), 1);
    return p.pix(PAL);
  },
};
