// DUNGEON: the crypt, from the board -- "dark blue-grey ashlar stone with recessed
// cross-shaped burial niches. Cold, solemn, and ancient." Each of the board's three layers
// is ashlar with a cross cut into it, smaller the further back.
//
//   FAR   the catacomb's back wall, the whole tile: small ashlar courses and small cross
//         niches. Lowest contrast.
//   MID   one ashlar pillar per tile with a cross every half tile, standing clear of the
//         back wall and shadowing it.
//   NEAR  one broad pier per tile carrying one big cross.
//
// The pillar and the pier run the full height, so they tile upward by construction; the
// board's crosses sit in panels, and here each is a raised slab with the cross sunk into it.
// A niche is drawn by its RIMS -- shadowed along its upper-left inside edge, lit along its
// lower-right -- and its hollow is only a little darker than the stone. The old crypt
// painter learned that the hard way: a near-black opening reads as a hole punched in the
// world, and ledge ends dissolve into it. Nothing is lit along a long horizontal run.
//
// The layers never move sideways -- the camera only climbs -- so the pier and the pillar
// are placed to alternate across the tile, and the back wall's crosses sit in the two gaps
// between them. A first version had two pillars per tile as well as the pier: the back
// wall all but vanished, every one of its crosses was behind something, and the zone
// read as vertical stripes rather than as a wall of niches.
//
// The palette is the theme's two background colours pulled toward the board's slate, which
// is greener and greyer than the theme's blue-violet. The board's crypt is darker than the
// old painted one (mean luma 29 against 39); this sits between the two, at 36.

import { shade, mix, rectW } from './util.js';

const STONE = '#1c2432';   // the board's ashlar
const LIT = '#2c3748';     // the board's lit stone
const MORTAR = '#0d1522';  // the board's joints
const VOID = '#05090f';    // what a niche is darkened toward

const PILLAR_X = 84;       // centre of the MID pillar in the tile
const PIER_X = 200;        // centre of the NEAR pier

/**
 * Rects drawn as one bevelled shape: the union of `rects`, its top and left edge in `tl`,
 * its bottom and right edge in `br`, the rest in `fill`, `t` pixels thick. Done as three
 * passes of the same rects -- whole in br, less the bottom-right edge in tl, inset in fill
 * -- which leaves a clean edge round the UNION, with no seams where the rects overlap. A
 * raised stone is light top-left and dark bottom-right; a sunken niche the reverse.
 */
function bevel(g, T, rects, tl, br, fill, t = 1) {
  g.fillStyle = br;
  for (const [x, y, w, h] of rects) rectW(g, x, y, w, h, T);
  g.fillStyle = tl;
  for (const [x, y, w, h] of rects) rectW(g, x, y, w - t, h - t, T);
  g.fillStyle = fill;
  for (const [x, y, w, h] of rects) rectW(g, x + t, y + t, w - 2 * t, h - 2 * t, T);
}

/**
 * A cross niche centred on (cx, cy): a raised slab with the cross sunk into it. `a` is the
 * bar thickness, `h` the cross's height, `w` its span, `p` the slab's margin round it.
 * The bars are thick and the arms high, as on the board: a thin cross at this scale reads
 * as a pair of scratches.
 */
function crossNiche(g, T, cx, cy, a, h, w, p, c, t = 1) {
  const x0 = cx - (w >> 1), y0 = cy - (h >> 1);
  const armY = y0 + Math.round(h * 0.28);
  bevel(g, T, [[x0 - p, y0 - p, w + 2 * p, h + 2 * p]], c.slabHi, c.slabLo, c.slab, t);
  bevel(g, T, [
    [cx - (a >> 1), y0, a, h],
    [x0, armY, w, a],
  ], c.shadow, c.rim, c.deep, t);
}

/** Widths of blocks between lo and hi (the last may run over) that sum to exactly T. */
function blocks(r, T, lo, hi) {
  const out = [];
  let left = T;
  while (left > 0) {
    let b = lo + Math.floor(r() * (hi - lo + 1));
    if (left - b < lo) b = left;
    out.push(b);
    left -= b;
  }
  return out;
}

/** The niche colours for stone of colour `face`; k = 0, 1, 2 from far to near. */
function nicheColours(face, k) {
  const slab = shade(face, 1 + 0.06 * k);
  return {
    slab,
    slabHi: mix(slab, LIT, 0.35 + 0.1 * k),
    slabLo: shade(slab, 0.72),
    deep: mix(face, VOID, 0.42),
    shadow: mix(face, VOID, 0.7),
    rim: mix(face, LIT, 0.3 + 0.15 * k),
  };
}

/**
 * A column of ashlar, full height: `courses` is a list of [height, [[x, w], ...]] whose
 * heights sum to T, starting `oy` down. Casts a shadow `sh` wide on the layers behind, to
 * its right.
 */
function pillar(g, T, r, oy, courses, tones, hi, lo, mortar, sh, t) {
  let y = oy;
  for (const [h, row] of courses) {
    const left = row[0][0], right = row[row.length - 1][0] + row[row.length - 1][1];
    g.fillStyle = 'rgba(3,6,12,0.45)';
    rectW(g, right, y + 2, sh, h, T);
    g.fillStyle = mortar;
    rectW(g, left, y, right - left, h, T);
    for (const [x, w] of row) {
      bevel(g, T, [[x, y, w - 1, h - 1]], hi, lo, tones[Math.floor(r() * tones.length)], t);
    }
    y += h;
  }
}

export default {
  far(g, T, th, r) {
    const mortar = mix(th.bgFar, MORTAR, 0.5);
    const face = mix(th.bgFar, STONE, 0.6);
    const tones = [shade(face, 0.92), face, shade(face, 1.06)];
    const hi = shade(face, 1.14), lo = shade(face, 0.84);
    g.fillStyle = mortar;
    g.fillRect(0, 0, T, T);
    // Courses 16 high, set 5 down so no joint lies on the tile's top or bottom row.
    const CH = 16, OY = 5;
    for (let j = 0; j < T / CH; j++) {
      let x = Math.floor(r() * T);
      for (const w of blocks(r, T, 18, 34)) {
        bevel(g, T, [[x, OY + j * CH, w - 1, CH - 1]], hi, lo, tones[Math.floor(r() * 3)]);
        x += w;
      }
    }
    // The loculi, in the two gaps the pillar and the pier leave: two columns of two,
    // the second column half a tile down from the first.
    const c = nicheColours(face, 0);
    for (const [x, dy] of [[28, 0], [136, 64]]) {
      for (let k = 0; k < 2; k++) crossNiche(g, T, x, 44 + dy + 128 * k, 6, 20, 16, 3, c);
    }
  },

  mid(g, T, th, r) {
    const face = mix(th.bgNear, STONE, 0.55);
    const tones = [shade(face, 0.94), face, shade(face, 1.05)];
    const hi = mix(face, LIT, 0.5), lo = shade(face, 0.72);
    const mortar = mix(th.bgFar, MORTAR, 0.6);
    const c = nicheColours(face, 1);
    // 40 wide; alternate courses one block or two, the two-block courses standing 2
    // proud each side so the pillar's edge is not one ruled line. Course heights 21, 21,
    // 22 repeating make 256.
    const cx = PILLAR_X, courses = [];
    for (let j = 0; j < 12; j++) {
      courses.push([j % 3 === 2 ? 22 : 21, j % 2
        ? [[cx - 22, 22], [cx, 22]]
        : [[cx - 20, 40]]]);
    }
    pillar(g, T, r, 7, courses, tones, hi, lo, mortar, 6, 1);
    for (let k = 0; k < 2; k++) crossNiche(g, T, cx, 40 + 128 * k, 9, 30, 24, 4, c);
  },

  near(g, T, th, r) {
    const face = mix(th.bgNear, LIT, 0.45);
    const tones = [shade(face, 0.95), face, shade(face, 1.04)];
    const hi = mix(face, '#3c4a60', 0.5), lo = shade(face, 0.7);
    const mortar = mix(th.bgFar, MORTAR, 0.7);
    const c = nicheColours(face, 2);
    const cx = PIER_X, courses = [];
    for (let j = 0; j < 8; j++) {
      courses.push([32, j % 2
        ? [[cx - 40, 36], [cx - 4, 44]]
        : [[cx - 36, 40], [cx + 4, 32]]]);
    }
    pillar(g, T, r, 9, courses, tones, hi, lo, mortar, 10, 2);
    crossNiche(g, T, cx, 150, 14, 52, 40, 6, c, 2);
  },
};
