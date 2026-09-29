// CITADEL: a gilded beam of dressed stone, two courses in running bond, with the Vytis
// double cross on its end stones -- painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in was cut from the old one-off strip: pale dressed
// blocks, 32 px apart, each with a carved mark. It did not wrap (edge difference 70.8, a
// seam every 8 world units), its landing line was a DARK row with the lit row under it,
// and the mark was 7 px wide, so the part tile that ends a run (cut from the tile's left
// in steps of 4 px) sliced it on most ledge widths.
//
// WHAT WAS WRONG WITH THE FIRST PAINT, and why this one is laid as it is. The first painter
// kept the strip's idea -- one course of square blocks, a rune on each -- at half the size:
// fifteen-pixel blocks as tall as they were wide, each with a 3 x 5 rune, Gebo and Algiz in
// turn. The slot rule caps a mark at four columns, and at that size a rune is a letter: in
// a real frame at 2-3x the ledge spelt X Y X Y down a row of KEYCAPS (or Scrabble tiles),
// and at 1x the marks were ruler ticks between dark joints every 16 px -- a measuring tape
// with a gold hairline, not a citadel. Square units in a row read as keys whatever is cut
// on them; what reads as masonry at the Duke's scale is the BOND. So:
//
//   - two courses of long blocks (a block to the repeat, 31 x 8), the joints of one
//     course breaking half a block along from the other's, as the zone's title letters are
//     laid (titlepaint/citadel.js: "laid in blocks two squares long with the joints breaking
//     a square along from the course below") and as the wall's ashlar is. Blocks half that
//     long, two to the repeat, were drawn first: at 1x a pale BRICK strip, busier than the
//     wall behind it; the long ones read as dressed stone;
//   - fine joints a mid tone, not near-black, as dressed stone has (the title again: "fine,
//     pale joints ... where the crypt's are dark and rough"), each with the chamfer the
//     title's blocks have: the block before it shaded, the block after it lit;
//   - the gold as a band, two rows under the white arris -- a gilded coping, which is how
//     the title letters and the HUD's "white marble in gold" are dressed -- rather than a
//     one-row hairline, which at 1x did not show;
//   - the heraldry where the slot rule does not reach: the two end stones are never cut, so
//     each carries a gilt double cross, the cross of the Vytis shield the Duke rides under
//     (a mark too big for a slot, and the one device a zone called CITADEL should wear on
//     its stone; the banner standing on the ledge carries the castle).
//
// Carried over from the first paint, because it was measured and right: the white arris
// that is the landing line, the gilt straight under it with no dark row between (a gold
// fillet under a dark soffit was a second landing line), and no lit row anywhere with a
// dark row over it -- so the lower course's top row is plain face, never lit along the bed
// joint, and the joint over it is a mid tone: the face under it (luma 177) stands 55 over
// the joint's 122, where a near-black joint (#6e6a80, 110) made it 67 and a lit top would
// have made it more.
//
// THE PALETTE. Warm pale stone lit from the upper left, shadows turning toward the blue
// violet of the hall behind it (bgpaint/citadel.js: blue stone arches, luma ~49 in a real
// frame), so the ledge is the opposite of the backdrop in both hue and value; the golds are
// the banner's (decorpaint/citadel.js GOLD). The lower course is a half step darker than
// the upper, so the beam darkens downward. Against the hall behind it in a real frame (median
// luma 49): body 6.1:1, landing line 12.4:1.

import { CELL_W, CELL_H, CAP_W, PERIOD, SURFACE, mod, hash, blank, slot } from './kit.mjs';

export const STONE = {
  ink: '#0f1224',       // the outline: the hall's near-black navy
  l0: '#fffbf0',        // row 12, the landing line: the brightest colour in the cell
  ul: '#dfd6cc',        // upper course: a block's lit left end
  u1: '#cfc6bd',        // upper course: the face
  u1p: '#c4bbb4',       // pecking on it
  u2: '#bdb5b1',        // upper course: a block's foot row, over the bed joint
  us: '#aca4a5',        // upper course: a block's shaded right end
  ll: '#cbc2ba',        // lower course: a block's lit left end
  l1: '#b9b2ae',        // lower course: the face
  l1p: '#afa8a6',       // pecking on it
  l2: '#aba4a4',        // lower course: its lowest three rows
  ls: '#99929a',        // lower course: a block's shaded right end
  sh: '#8b8698',        // the beam's foot
  joint: '#7a768c',     // the joints: fine and a mid tone, as dressed stone has
};
export const GILT = { hi: '#fff0a8', lit: '#f4c64e', mid: '#dc9a33', deep: '#a9632b' };

// Rows. Row 12 is the walking surface, 11 the outline over it.
const R = { gilt: [13, 14], up: [15, 22], bed: 23, low: [24, 31], foot: 32, bottom: 33 };

// THE JOINTS. Each is three columns -- the shaded end of one block, the joint, the lit end
// of the next -- inside one 4-px slot, so no ledge width slices one. The upper course's
// joint sits at repeat column 5, the lower course's at 21: half a block apart, which is the
// bond. Every block is then 31 columns between its joints, the joints 32 apart in a run
// (each course's repeat runs across u0, which shows twice at every tile join).
//
// Where the lit ends fall decides the RIGHT END of a ledge. The part tile ends after tile
// column 4k - 1, and the right cap follows with four plain face columns (sampled from the
// strip at u 7-10, face in both courses), the last block's shaded end and a joint before
// the end stone. With both lit ends at a column 4k + 2, the block the cut runs through keeps
// 2, 6, ... or 30 of its columns, so the last block before the end stone is 7, 11, 15, ...
// 35 px -- a different one on each of the eight widths, in both courses: never a sliver.
// (Lit ends at 4k + 3, the first layout drawn, made the shortest one 6.)
const UPPER = [5], LOWER = [21];
for (const u of [...UPPER, ...LOWER]) slot(u - 1, 3, 'CITADEL block joint');

/** Column u's part in a course with joints J: 'joint', 'shade', 'lit' or 'face'. */
function part(u, J) {
  for (const j of J) {
    if (u === j) return 'joint';
    if (u === j - 1) return 'shade';
    if (u === j + 1) return 'lit';
  }
  return 'face';
}

/** The face of a course at row y and repeat column u, pecked a shade darker here and there. */
function face(course, y, key) {
  const peck = hash(key, y * 13 + 5) < 0.07;
  if (course === 'up') {
    if (y === R.up[1]) return STONE.u2;
    return peck ? STONE.u1p : STONE.u1;
  }
  // The lower course's top row under the bed joint is plain face: a lit top the length of
  // the block, straight under the joint's darker row, is the signature of a landing line,
  // eleven rows under the real one. Its lit end column is all the light it gets.
  if (y >= R.low[1] - 2) return peck ? STONE.l1p : STONE.l2;
  return peck ? STONE.l1p : STONE.l1;
}

/** One pixel of the repeating strip, by repeat column u and row y. */
function stripPx(u, y) {
  if (y === SURFACE - 1 || y === R.bottom) return STONE.ink;
  if (y === SURFACE) return STONE.l0;
  if (y === R.gilt[0]) return GILT.lit;
  if (y === R.gilt[1]) return GILT.mid;
  if (y === R.bed) return STONE.joint;
  const course = y <= R.up[1] ? 'up' : 'low';
  const p = part(u, course === 'up' ? UPPER : LOWER);
  if (y === R.foot) return p === 'joint' ? STONE.joint : STONE.sh;
  if (y < R.up[0] || y > R.low[1]) return null;
  if (p === 'joint') return STONE.joint;
  if (p === 'shade') return course === 'up' ? STONE.us : STONE.ls;
  if (p === 'lit') return course === 'up' ? STONE.ul : STONE.ll;
  return face(course, y, u);
}

// THE DEVICE on each end stone: the double cross of the Vytis shield, gilt, with a shadow in
// the banner's deep amber so gold (luma 198) stands off pale stone (200) by its edge. One-
// pixel strokes, five wide and seven tall -- a patriarchal cross, the upper bar the shorter.
const CROSS = [
  '..#..',
  '.###.',
  '..#..',
  '#####',
  '..#..',
  '..#..',
  '..#..',
];
const CROSS_Y = 20;   // its top row: centred on the end stone's rows 15-32
const END_W = 9;      // the end stone's width, d 1-9; its joint at d 10

/** The CITADEL cell. */
export function citadel() {
  const T = [];
  for (let y = 0; y < CELL_H; y++) {
    T.push([]);
    for (let u = 0; u < PERIOD; u++) T[y].push(stripPx(u, y));
  }
  // The cell from the strip: the tile is repeat columns 0..30 and 0 again, so it wraps
  // exactly; the left cap is the strip just before it (u 15-30); the right cap is sampled
  // from u 7 on (see UPPER), so its first four columns are plain face in both courses
  // whatever the part tile before it ended on.
  const c = blank();
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      let u;
      if (x < CAP_W) u = mod(x + 15, PERIOD);
      else if (x < CAP_W + 32) u = mod(x - CAP_W, PERIOD);
      else u = mod(x - 41, PERIOD);
      c[y][x] = T[y][u];
    }
  }

  // THE ENDS, drawn over the caps: the landing line to the last column (the ledge is as
  // long as its line), the outline down the end (d 0), then one tall end stone through both
  // courses (d 1-9) with the device on it, its joint (d 10), and the neighbouring block's
  // end (d 11): lit on the left end, where the block after the joint faces the light, shaded
  // on the right.
  for (const side of ['left', 'right']) {
    const X = (d) => (side === 'left' ? d : CELL_W - 1 - d);
    for (let y = SURFACE + 1; y <= R.bottom; y++) c[y][X(0)] = STONE.ink;
    for (let d = 1; d <= END_W; d++) {
      // The end stone's own ends: its left one lit, its right one shaded, on both sides of
      // the ledge (the light does not mirror with the columns).
      const x = X(d);
      const leftEdge = side === 'left' ? d === 1 : d === END_W;
      const rightEdge = side === 'left' ? d === END_W : d === 1;
      for (let y = R.up[0]; y <= R.low[1]; y++) {
        const course = y < R.bed ? 'up' : 'low';
        let col;
        if (leftEdge) col = course === 'up' ? STONE.ul : STONE.ll;
        else if (rightEdge) col = course === 'up' ? STONE.us : STONE.ls;
        else if (y >= R.low[1] - 2) col = STONE.l2;
        else col = course === 'up' ? STONE.u1 : STONE.l1;
        c[y][x] = col;
      }
      c[R.foot][x] = STONE.sh;
    }
    for (let y = R.up[0]; y <= R.foot; y++) c[y][X(END_W + 1)] = STONE.joint;
    for (let y = R.up[0]; y <= R.low[1]; y++) {
      if (y === R.bed) continue;
      const up = y < R.bed;
      c[y][X(END_W + 2)] = side === 'left'
        ? (up ? STONE.ul : STONE.ll)
        : (up ? STONE.us : STONE.ls);
    }
    // The device, centred on the end stone (d 3-7), toned by which neighbours are empty:
    // lit where nothing is above or to the left, deeper where nothing is below or to the
    // right; then its shadow in the banner's deep amber, cast down and to the right as a
    // relief's is. (An amber outline all round turned the one-pixel cross into a four-point
    // star -- a sparkle -- at 8x; the shadow keeps the arms square-ended.)
    const at = (i, j) => j >= 0 && j < CROSS.length && i >= 0 && i < 5 && CROSS[j][i] === '#';
    for (let j = 0; j <= CROSS.length; j++) {
      for (let i = 0; i <= 5; i++) {
        // Columns d 3-7 at either end; the glyph itself is not mirrored.
        const x = side === 'left' ? 3 + i : CELL_W - 8 + i;
        const y = CROSS_Y + j;
        if (at(i, j)) {
          const lit = !at(i, j - 1) && !at(i - 1, j);
          const deep = !at(i, j + 1) && !at(i + 1, j);
          c[y][x] = lit ? GILT.hi : deep ? GILT.mid : GILT.lit;
        } else if (at(i - 1, j) || at(i, j - 1) || at(i - 1, j - 1)) {
          c[y][x] = GILT.deep;
        }
      }
    }
  }
  return c;
}

/** The painter the importer calls. */
export function paint() { return citadel(); }
