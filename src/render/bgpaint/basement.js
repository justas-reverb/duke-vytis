// BASEMENT: purple cellar masonry, from the board -- "coursed running-bond brick wall with
// visible mortar. Dark, solid, and enclosing." Small bricks far, big rounded ones near.
//
// The board draws all three layers as whole walls. Three whole walls sliding over each
// other at three speeds read as one wall that swims, so the nearer two are cut open:
//
//   FAR   the back wall of the cellar, small bricks, the whole tile. Lowest contrast.
//   MID   a nearer wall of medium bricks with whole bricks fallen out of it. The back wall
//         shows through the holes, each hole shadowed along its top and left edge by the
//         bricks in front, which is what puts the two walls at different depths.
//   NEAR  one pier per tile of big rounded stones, full height, its courses alternately
//         wider and narrower (quoined) so its edges are toothed rather than one ruled line,
//         casting a shadow on whatever is to its right.
//
// Light comes from the upper left throughout: lit top edges, shadowed bottom and right.
// Nothing is lit along its whole width -- a long bright horizontal line is a ledge to
// the eye, and the ledges here are brown brick in front of all this.
//
// The palette is the theme's two background colours pulled toward the board's
// blue-violet brick (its purple is bluer than the theme's), with the board's near-black
// violet for mortar. Measured on the board, the composite's mean brightness is the same
// as the old painted bricks' (luma 37 against 38), so this keeps that level: 39.

import { shade, mix, rectW, dotW, wrapNoise } from './util.js';

const BRICK = '#2e2552';   // the board's brick face
const MORTAR = '#120d2b';  // the board's mortar
const LIT = '#4a3d7c';     // the board's lit brick edge

// Every course and joint is set off from the tile's edges by a few pixels (OX, OY below).
// Drawing through rectW already makes the pattern continuous across the seam; the offset
// keeps a mortar line from lying exactly ON it, where tools/test-backgrounds.mjs, which
// compares the tile's first and last row and column, would read a joint as a seam.

/** Wrapped Uint8 mask of a T x T tile. */
const maskAt = (m, T, x, y) => m[(((y % T) + T) % T) * T + (((x % T) + T) % T)];

export default {
  far(g, T, th, r) {
    const mortar = mix(th.bgFar, MORTAR, 0.55);
    const base = mix(th.bgFar, BRICK, 0.6);
    const tones = [shade(base, 0.88), base, shade(base, 1.07)];
    const top = [shade(base, 1.0), shade(base, 1.1), shade(base, 1.17)];
    g.fillStyle = mortar;
    g.fillRect(0, 0, T, T);
    // Damp: broad patches of the wall a shade darker, so 512 identical bricks per tile
    // read as a wall and not as a grid.
    const damp = wrapNoise(r, 4, T);
    const BW = 16, BH = 8, OX = 5, OY = 4;
    for (let row = 0; row < T / BH; row++) {
      const off = OX + (row % 2) * (BW / 2), by = OY + row * BH;
      for (let x = 0; x < T; x += BW) {
        const bx = x + off;
        const v = damp(bx + BW / 2, by + BH / 2) + (r() - 0.5) * 0.3;
        const k = v < 0.38 ? 0 : v < 0.62 ? 1 : 2;
        g.fillStyle = tones[k];
        rectW(g, bx + 1, by + 1, BW - 1, BH - 1, T);
        g.fillStyle = top[k];
        rectW(g, bx + 1, by + 1, BW - 3, 1, T);
      }
    }
  },

  mid(g, T, th, r) {
    const BW = 32, BH = 16, M = 2, OX = 7, OY = 6;
    const cols = T / BW, rows = T / BH;
    const mortar = mix(th.bgFar, MORTAR, 0.35);
    const base = mix(th.bgNear, BRICK, 0.6);
    const tones = [shade(base, 0.9), base, shade(base, 1.06)];
    const hi = mix(base, LIT, 0.45);
    const lo = shade(base, 0.72);
    const pit = shade(base, 0.8);

    // Which bricks are still in the wall: a wrapping noise field sampled at each brick's
    // centre, so the holes come in clumps, as a wall falls, and not one brick here and there.
    const n = wrapNoise(r, 4, T);
    const bricks = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const bx = OX + i * BW + (j % 2) * (BW / 2), by = OY + j * BH;
        const v = n(bx + BW / 2, by + BH / 2) + (r() - 0.5) * 0.28;
        if (v < 0.56) bricks.push([bx, by, r()]);
      }
    }
    const mask = new Uint8Array(T * T);
    for (const [bx, by] of bricks) {
      for (let y = by; y < by + BH; y++) for (let x = bx; x < bx + BW; x++) mask[(y % T) * T + (x % T)] = 1;
    }

    // The shadow the remaining wall throws into its holes: the mask pushed down 5 and
    // right 3, less the mask itself. Drawn as runs, in one translucent dark.
    g.fillStyle = 'rgba(6,3,18,0.5)';
    for (let y = 0; y < T; y++) {
      let run = -1;
      for (let x = 0; x <= T; x++) {
        let s = false;
        if (x < T && !mask[y * T + x]) {
          for (let dy = 0; dy <= 5 && !s; dy++) for (let dx = 0; dx <= 3 && !s; dx++) {
            if ((dx || dy) && maskAt(mask, T, x - dx, y - dy)) s = true;
          }
        }
        if (s && run < 0) run = x;
        if (!s && run >= 0) { g.fillRect(run, y, x - run, 1); run = -1; }
      }
    }

    for (const [bx, by, t] of bricks) {
      g.fillStyle = mortar;
      rectW(g, bx, by, BW, M, T);
      rectW(g, bx, by, M, BH, T);
      const fx = bx + M, fy = by + M, fw = BW - M, fh = BH - M;
      g.fillStyle = tones[t < 0.3 ? 0 : t < 0.75 ? 1 : 2];
      rectW(g, fx, fy, fw, fh, T);
      g.fillStyle = hi;
      rectW(g, fx, fy, fw - 2, 1, T);
      rectW(g, fx, fy + 1, 1, fh - 3, T);
      g.fillStyle = lo;
      rectW(g, fx + 1, fy + fh - 1, fw - 1, 1, T);
      rectW(g, fx + fw - 1, fy + 1, 1, fh - 1, T);
      // A few pits in the face, so a brick is fired clay and not a flat swatch.
      g.fillStyle = pit;
      for (let k = 0; k < 3; k++) dotW(g, fx + 2 + Math.floor(r() * (fw - 4)), fy + 2 + Math.floor(r() * (fh - 4)), T);
    }
  },

  near(g, T, th, r) {
    const BH = 32, GAP = 2, OY = 12;
    const X = 138;                      // the pier's left edge in the tile
    const face = mix(th.bgNear, BRICK, 0.55);
    const faces = [shade(face, 0.93), face, shade(face, 1.05)];
    const hi = mix(face, LIT, 0.55);
    const mid = mix(face, LIT, 0.25);
    const lo = shade(face, 0.7);
    const pit = shade(face, 0.82);
    const mortar = mix(th.bgFar, MORTAR, 0.6);

    // Courses alternate two whole stones with a half, a whole and a half, the latter
    // standing 6 proud on each side.
    const course = (j) => (j % 2
      ? [[X - 6, 28], [X + 22, 44], [X + 66, 28]]
      : [[X, 44], [X + 44, 44]]);

    for (let j = 0; j < T / BH; j++) {
      const sy = OY + j * BH, c = course(j);
      const left = c[0][0], right = c[c.length - 1][0] + c[c.length - 1][1];
      // Its shadow on the layers behind, to the right.
      g.fillStyle = 'rgba(6,3,18,0.45)';
      rectW(g, right - GAP, sy + 3, 8, BH, T);
      // Mortar behind the joints, inset so the outer corners stay round.
      g.fillStyle = mortar;
      rectW(g, left + 2, sy, right - left - 6, BH, T);
      for (const [sx, sw] of c) {
        const w = sw - GAP, h = BH - GAP;
        // The stone, with its corners knocked off.
        g.fillStyle = faces[Math.floor(r() * 3)];
        rectW(g, sx + 2, sy, w - 4, h, T);
        rectW(g, sx, sy + 2, w, h - 4, T);
        rectW(g, sx + 1, sy + 1, w - 2, h - 2, T);
        // Lit top and left, dithered into the face; shadowed bottom and right.
        g.fillStyle = hi;
        rectW(g, sx + 2, sy + 1, w - 5, 1, T);
        rectW(g, sx + 1, sy + 2, 1, h - 5, T);
        g.fillStyle = mid;
        rectW(g, sx + 2, sy + 2, w - 6, 1, T);
        for (let x = sx + 3; x < sx + w - 4; x += 2) dotW(g, x, sy + 3, T);
        rectW(g, sx + 2, sy + 3, 1, h - 7, T);
        g.fillStyle = lo;
        rectW(g, sx + 3, sy + h - 2, w - 5, 1, T);
        rectW(g, sx + 2, sy + h - 3, 1, 1, T);
        rectW(g, sx + w - 2, sy + 3, 1, h - 5, T);
        for (let y = sy + 4; y < sy + h - 3; y += 2) dotW(g, sx + w - 3, y, T);
        for (let x = sx + 4; x < sx + w - 3; x += 2) dotW(g, x, sy + h - 3, T);
        // Pits and one or two chips.
        g.fillStyle = pit;
        for (let k = 0; k < 7; k++) {
          const px = sx + 4 + Math.floor(r() * (w - 9)), py = sy + 5 + Math.floor(r() * (h - 10));
          rectW(g, px, py, r() < 0.3 ? 2 : 1, 1, T);
        }
        g.fillStyle = mid;
        for (let k = 0; k < 2; k++) dotW(g, sx + 5 + Math.floor(r() * (w - 11)), sy + 5 + Math.floor(r() * (h - 11)), T);
      }
    }
  },
};
