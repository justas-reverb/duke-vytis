// ZENITH: radiant gold, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip was a bar of gold
// blocks, which is what the top of the tower should be, and the player knows it -- so the
// identity is kept: gold, in blocks, a dark rim over a bright top, a dark foot. But the cut
// was not clean. Its left cap carried a dark green patch and flecks, a piece of the old
// strip's neighbouring art caught in the cut. Its tile did not wrap (edge difference 59.0:
// a seam every eight world units). Bright vertical flares stood at every tile join. And
// its brightest line was not the one he lands on: row 12 at luma 131 and a pale streak
// across the lower body, row 30, at 236 -- a second, brighter ledge drawn inside the first.
//
// What it is now: a row of polished gold ingots. Each has a flat top face lit almost
// white, whose front edge is the landing line; a front face in clean bands of gold that
// darken to a warm brown foot, never lighter lower down; a chamfer at each end, lit on
// the left and shaded on the right, with a dark seam between ingots; a catchlight on each
// top face's lit corner; and one slanting shine across the face, the mark every drawing of
// polished gold carries. No texture, no dither: the zone asked for clean, and a checker
// between the face's bands (tried) turned into rows of comb teeth at 10x.
//
// THE PALETTE. The three lights are the light shaft's that stands on these ledges
// (decorpaint/zenith.js: HOT #fffbe8, CORE #ffe8b0, INNER #ffd67a -- INNER already named
// as "the ledge's lit gold"), so the shaft's pool lands on the same gold it is made of.
// Below them the ramp runs yellow gold to red-brown, hue-shifted, lights toward cream and
// shadows toward rust, and stays above the walls' ochre (wallpaint/zenith.js, luma about
// 55), which is this gold in shade. A first ramp in the title's orange golds made a row of
// orange drawers with plus-sign handles.
//
// AGAINST THE SKY. The backdrop, sampled from a real frame at floor 2250, is a deep navy,
// median #242f49 (luma 47), crossed by pale shafts (95th percentile luma 96). The body's
// median is #d4a034, 5.6:1 against it (the cut's #b7841a, 4.0:1), and 87% of the body is
// brighter than the shafts' 95th percentile; gold on navy is also near-complementary in
// hue, which carries the parts that are not. The landing line is the palest colour there
// is (luma 250) with the near-black brown rim over it; the top face under it (227, 210)
// reads as its thickness, and no row from 17 down averages brighter than 187 (the shine
// and the lit edges are points and short strokes, not a line).
//
// THE LAYOUT. The same arithmetic as STARFIELD's blocks (./starfield.mjs): the renderer's
// cut falls on any multiple of four and the right cap is always u 1..16 (./index.mjs).
//
//   - An ingot's ends are four columns, u 12-15: its shaded chamfer (12), its shaded edge
//     (13), the seam (14) and the next ingot's lit edge (15) -- one slot. The left cap is
//     u 15..30, so the ledge begins on a lit edge; the right cap holds the seam at x 60-62,
//     which the right end paints out (END_CLEAR_X). Middle ingots are 31-32 px, the first
//     30, the last 17 to 45 over the eight part-tile sizes.
//   - The shine is four columns, u 20-23: the upper left of the ingot's face, where the
//     light falls. The right cap never reaches it, so on two widths in eight (part tiles of
//     16 and 20) the last ingot, 17 or 21 px, has none -- one ingot in a run not catching
//     the light, which is how gold looks.

import { SURFACE, PERIOD, mod, assemble, slot, outline } from './kit.mjs';

export const GOLD = {
  ink: '#241003',       // the outline: rim over the landing line, foot, ends
  deep: '#5a300c',      // the seams, the foot's last row
  shadow: '#86501a',    // an ingot's shaded right edge, the foot
  amber: '#b07a26',
  mid: '#d4a034',
  gold: '#ecc04a',
  bright: '#ffd67a',    // the shaft's INNER
  cream: '#ffe8b0',     // the shaft's CORE
  hot: '#fffbe8',       // the shaft's HOT: row 12, the landing line
};

// Rows. The top face is 12 (the landing line) to 16; the front face 17 to 36, its foot 37
// and 38; the outline pass puts the ink at 39 -- the ledge's full physics thickness. The
// cut's bar was that deep, and at 24 rows the ingots looked slight beside it in a real
// frame, so they keep its weight.
const ROW = { top: [13, 16], face: 17, foot: 37, last: 38 };
const SEAM = 14;
slot(12, 4, 'ZENITH ingot ends (chamfer, edge, seam, lit edge)');
const SHINE_U = slot(20, 4, 'ZENITH shine');
const END_CLEAR_X = 43;         // strip X >= this: no seam (x 59-63), the right end covers it

// The shine, from row SHINE_TOP: a slanting streak lower left to upper right, a cream
// stroke along a bright one. Four columns, the most a slot holds.
const SHINE = [
  '...c',
  '..cb',
  '..b.',
  '.cb.',
  '.b..',
  'cb..',
  'b...',
  'b...',
];
const SHINE_TOP = 20;

/** The front face's bands of polished gold, darkening to the foot. */
function faceTone(y, g) {
  if (y <= 26) return g.gold;
  if (y <= 33) return g.mid;
  return g.amber;
}

/** One pixel of the repeating run, by repeat column u, row y and strip coordinate X. */
function goldAt(u, y, X, g) {
  if (y < SURFACE || y > ROW.last) return null;
  if (y === SURFACE) return g.hot;
  const clear = X >= END_CLEAR_X;
  // bx: 0 is an ingot's lit left edge, 29 its shaded right; in the right end, the middle.
  const bx = clear ? 15 : mod(u - 15, PERIOD);
  if (!clear && u === SEAM) return g.deep;
  if (y <= ROW.top[1]) {
    // The top face; its lit corner catches the light.
    const k = y - ROW.top[0];
    if (bx === 0 && k < 2) return g.hot;
    if (bx === 29) return [g.bright, g.gold, g.gold, g.mid][k];
    return [g.cream, g.bright, g.bright, g.gold][k];
  }
  if (y === ROW.last) return g.deep;
  if (y === ROW.foot) return g.shadow;
  if (bx === 0) return y < 28 ? g.bright : g.gold;
  if (bx === 29) return g.shadow;
  if (bx === 28) return y < 28 ? g.mid : g.amber;
  if (u >= SHINE_U && u < SHINE_U + 4 && y >= SHINE_TOP && y < SHINE_TOP + SHINE.length) {
    const ch = SHINE[y - SHINE_TOP][u - SHINE_U];
    if (ch === 'c') return g.cream;
    if (ch === 'b') return g.bright;
  }
  // The arris under the top face, then the bands.
  if (y === ROW.face) return g.mid;
  return faceTone(y, g);
}

/** The ZENITH cell in a gold palette g. */
export function zenith(g = GOLD) {
  // THE ENDS: square, outlined, the landing line running to the last column. The left end
  // is an ingot's lit edge with its catchlight, the right end a shaded edge and chamfer.
  const c = assemble((u, y, X) => goldAt(u, y, X, g), (put, get, side) => {
    const L = side === 'left';
    for (let y = SURFACE + 1; y <= ROW.last; y++) put(0, y, g.ink);
    put(1, 13, L ? g.hot : g.bright);
    put(1, 14, L ? g.hot : g.gold);
    put(1, 15, L ? g.bright : g.gold);
    put(1, 16, L ? g.gold : g.mid);
    for (let y = ROW.face; y < ROW.foot; y++) put(1, y, L ? (y < 28 ? g.bright : g.gold) : g.shadow);
    if (!L) for (let y = ROW.face; y < ROW.foot; y++) put(2, y, y < 28 ? g.mid : g.amber);
  });
  // The rim over the landing line and the foot under the ingots, in the outline's ink.
  outline(c, g.ink);
  return c;
}

/** The painter the importer calls. */
export function paint() { return zenith(); }
