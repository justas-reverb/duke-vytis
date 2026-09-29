// STARFIELD: carved star-stone, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip was green-teal
// stone blocks, one to a tile, each with a pale chevron scratched across it and a pale
// lump on its top. The player knows those ledges, so the identity is kept -- jade stone
// in blocks, one mark to a block -- but the cut could not be used as it was: its tile did
// not wrap (the importer measured its edge difference at 128.8, one of the three worst in
// the game, so a seam every eight world units all the way up the zone); its landing row
// was NOT its brightest (row 12 at luma 119, a lit course at row 18 at 136, a second
// ledge inside the first); and the dark rim over the landing line ran along only half of
// it.
//
// What it is now: a COPING of pale jade laid along the top -- the landing line, a lit top
// face and a shadowed foot -- over a single course of star-stone blocks, each with one
// star carved into it and inlaid with light. The mark is a star now, not the old chevron,
// because the zone is a field of stars and a chevron is wider than any slot a ledge can
// keep whole (below). The star is the walls' own: wallpaint/starfield.js cuts its
// constellations into the same stone in the same mint (#5fb49a), so ledge and wall are
// one star chart; the constellation that floats over these ledges
// (decorpaint/starfield.js) is the board's blue-white, so the carved stars and the figure
// in the sky never read as the same thing.
//
// AGAINST THE SKY. The backdrop, sampled from a real frame at floor 2050, is a near-black
// teal: median #002726 (luma 27). The cut's body was #234c3c at its median, 1.65:1 against
// it. This body is a step lighter and a step greener -- jade toward the theme's emerald
// (platTop #00aa55, the HUD's #44ffa0) rather than the sky's teal, so it parts from the sky
// by hue as well as value: median #22704f, 2.65:1, every body pixel above the sky's 95th
// percentile. The landing line is the palest row by far (luma 231; the lit top face under
// it 165; no row from 15 down averaging over 102 -- the stars are points), with the
// near-black rim over it, and the course darkens down to a deep blue-teal foot. Shadows
// lean blue, lights lean yellow-green: a hue-shifted ramp lit from the upper left, like
// every drawn ledge.
//
// THE LAYOUT, and why every place is where it is. The renderer ends a run with a part tile
// cut from the tile's left, at any multiple of four, then the right cap -- which is repeat
// columns u 1..16, whatever came before it (./index.mjs, rules 3 and 4). So:
//
//   - A block joint is a shaded column, the joint, and a lit column: u 13-15, one slot.
//     The left cap is u 15..30, so the ledge's first block is 30 px and starts on its own
//     lit edge; the right cap holds the joint at x 60-62, which the right end paints out
//     (END_CLEAR_X), so the last block runs to the end. Laid through the eight part-tile
//     sizes, the last block comes out 17 to 45 px against 31-32 in the middle -- never a
//     sliver. A joint anywhere in u 1..8 put a joint just after every cut, and the block
//     before it came out 2-6 px wide on some widths.
//   - The star is three columns, u 28-30: the widest a mark can be in the last slot, and
//     the middle of the block. Nothing in the right cap reaches u 28, so on four widths in
//     eight (part tiles of 16-28 px) the last block, 17-29 px, is a plain closing stone.
//     That is on purpose. The first cut also painted a star of its own into the right end
//     (x 56-58) so that those blocks had one -- but the right cap is the same on every
//     ledge, so that star also landed in the LONG last block of the other four widths,
//     beside the tile's own: two stars in one stone, 12 to 24 px apart. On every ledge
//     whose width is a multiple of 8 units (the 64-wide ledge on shot-platforms' sheet
//     among them) it was a pair jammed against the ledge's end, at 1x a glitch in the one
//     rhythm the eye follows along a ledge. No place for one star does better: laid
//     through the eight cuts, every centred star either doubles or leaves out the last
//     block on four widths, because the cap cannot know how much of the tile came before
//     it. A plain end stone reads as masonry; a doubled mark reads as a mistake. ZENITH's
//     short last ingot goes without its shine for the same reason.
//   - The coping's joints are u 20-22 (its shaded end, the joint, its lit end) -- a quarter
//     block over from the block joints. Half a block over put each one straight above a
//     star, and the ledge read as a row of ticks over stars. The left cap would show one at
//     x 5-7, a 6 px slab at the ledge's end, so the left end paints it out (END_CLEAR_L).
//
// WHAT READ AS SOMETHING ELSE on the way here. A small cross in a dark carved lozenge in
// each block, on a flat face, was green bathroom tiles with plus signs. Adding a small cross and a one-pixel
// star to each block (a constellation, without the threads a slot cannot hold) made more
// plus signs and a speck. A glitter of single pale flecks for star-stone read as dirt. A
// checker between the face's tones covered the upper face in a net. What reads: the tall
// four-point sparkle below, with a faint glow in the stone at its tips and corners, on a
// face of clean mottled clusters -- no dither, and every lone pixel folded into its
// neighbours (faceTone).
//
// Nothing hangs from this ledge (the constellation floats), so the underside is a plain
// outlined foot at row 39, the ledge's full physics thickness -- the cut's blocks were that
// deep, and at 26 rows these read in a real frame as a slighter ledge than the one the
// player knew. The renderer's shadow follows the foot.

import { SURFACE, PERIOD, mod, assemble, slot, outline } from './kit.mjs';

export const STONE = {
  ink: '#041210',       // the outline: rim over the landing line, foot, ends
  joint: '#07201c',     // the joints between blocks and slabs
  deep: '#0c3434',      // the coping's shadowed foot, the course's lowest row
  dark: '#134c42',
  body2: '#1a5e4c',
  body: '#22704f',
  mid: '#2e8a5c',
  lit: '#48a86a',       // a block's lit left edge, the coping's face
  hi: '#80c882',        // the coping's lit top
  top: '#d6f7c4',       // row 12: the landing line, paler than anything but a star's heart
  halo: '#3f9a74',      // stone lit by the star
  sDim: '#5fb49a',      // the star's tips -- the walls' star mint, exactly (it was #5cc49a,
                        // a step off the colour the header says ties ledge and wall)
  sArm: '#9cf0c8',
  sCore: '#eafff4',
};

// Rows. The coping is 12 (the landing line) to 16 (its foot); the blocks' face 17 to 36,
// their bevel 37 and 38; the outline pass puts the foot's ink at 39.
const ROW = { slabFoot: 16, face: 17, bevel: 37, last: 38 };
const JOINT = 14;
slot(13, 3, 'STARFIELD block joint (shade, joint, lit)');
const SLAB_JOINT = 21;
slot(20, 3, 'STARFIELD coping joint (shade, joint, lit)');
const STAR_U = slot(28, 3, 'STARFIELD star');
// The ends, in strip coordinates X (-16 at the ledge's first column, 47 at its last).
const END_CLEAR_L = -9;         // X <= this: no coping joint (x 0-7)
const END_CLEAR_X = 43;         // X >= this: no block joint (x 59-63)
// No star of the right end's own: see THE LAYOUT above for the pair it made.

// The star: a tall four-point sparkle three columns wide, lit at the heart, with the stone
// at its tips and corners warmed by its glow (h). A light, so no outline of its own.
const GLYPH = [
  '.h.',
  '.a.',
  'hbh',
  'bcb',
  'hbh',
  '.a.',
  '.h.',
];
const GLYPH_TOP = 23;           // its heart on row 26, the middle of the face

function glyphAt(col, y, s) {
  const r = y - GLYPH_TOP;
  if (r < 0 || r >= GLYPH.length) return null;
  return { h: s.halo, a: s.sDim, b: s.sArm, c: s.sCore }[GLYPH[r][col]] || null;
}

// The weathering on the blocks' face: a few sines of whole frequencies in the repeat, so it
// wraps with the strip, and smooth, so its contours cut the face into clusters.
const TAU = 2 * Math.PI;
function mottle(u, y) {
  return 0.5 * Math.sin(TAU * (2 * u) / PERIOD + y * 0.55 + 1.3)
    + 0.35 * Math.sin(TAU * (5 * u) / PERIOD - y * 0.9 + 0.4)
    + 0.25 * Math.sin(TAU * (3 * u) / PERIOD + y * 1.7 + 2.1);
}

/** The coping, rows 13-16: a lit top, a face, a shadowed foot, cut into slabs. */
function coping(u, y, X, s) {
  const clear = X >= END_CLEAR_X || X <= END_CLEAR_L;
  if (!clear && u === SLAB_JOINT) return s.joint;
  const sx = clear ? 15 : mod(u - SLAB_JOINT - 1, PERIOD);   // 0 = a slab's lit left end
  const endR = sx === PERIOD - 2;                            // its shaded right end
  if (y === 13) return endR ? s.lit : s.hi;
  if (y === 14) return sx === 0 ? s.hi : endR ? s.mid : s.lit;
  if (y === 15) return endR ? s.body : s.mid;
  return s.deep;
}

/** One pixel of the repeating run, by repeat column u, row y and strip coordinate X. */
function stoneAt(u, y, X, s) {
  if (y < SURFACE || y > ROW.last) return null;
  if (y === SURFACE) return s.top;
  if (y <= ROW.slabFoot) return coping(u, y, X, s);
  const clear = X >= END_CLEAR_X;
  if (!clear && u === JOINT) return s.joint;
  // bx: 0 is a block's lit left edge, 29 its shaded right; in the right end, the middle.
  const bx = clear ? 15 : mod(u - 15, PERIOD);
  const edgeL = bx === 0, edgeR = bx === 29;
  if ((edgeL || edgeR) && y === ROW.last) return s.joint;   // the foot's corners, chipped
  if (y === ROW.last) return s.deep;
  if (y === ROW.bevel) return edgeL ? s.body : s.dark;
  if (edgeL) return y < 27 ? s.lit : s.mid;
  if (edgeR) return s.dark;
  const g = !clear && u >= STAR_U && u < STAR_U + 3 ? glyphAt(u - STAR_U, y, s) : null;
  if (g) return g;
  return s[FACE[faceTone(u, y, bx)]];
}

const FACE = ['mid', 'body', 'body2', 'dark'];
const CUTS = [0.55, 0.15, -0.3];

/** The face's tone index before cleaning, 0 lightest .. 3 darkest. */
function rawFace(u, y, bx) {
  // In the coping's shadow along its top row, lit from the upper left below that, darker
  // to the foot and toward the block's right, weathered.
  const t = (y - ROW.face) / (ROW.bevel - ROW.face);
  let v = 0.6 - 0.6 * t - 0.2 * (bx / 29) + 0.22 * mottle(u, y);
  if (bx === 1) v += 0.25;
  if (y === ROW.face) v -= 0.35;
  return CUTS.filter((k) => v <= k).length;
}

/**
 * The face's tone, with every lone pixel -- one that no neighbour shares -- taken into the
 * commonest tone around it. Computed from the strip, so it wraps like everything else.
 */
function faceTone(u, y, bx) {
  const t0 = rawFace(u, y, bx);
  const n = [];
  if (y > ROW.face) n.push(rawFace(u, y - 1, bx));
  if (y < ROW.bevel - 1) n.push(rawFace(u, y + 1, bx));
  if (bx > 1) n.push(rawFace(mod(u - 1, PERIOD), y, bx - 1));
  if (bx < 28) n.push(rawFace(mod(u + 1, PERIOD), y, bx + 1));
  if (!n.length || n.includes(t0)) return t0;
  const count = (k) => n.filter((m) => m === k).length;
  return n.reduce((a, b) => (count(b) > count(a) ? b : a));
}

/** The STARFIELD cell in a stone palette s. */
export function starfield(s = STONE) {
  // THE ENDS: square, outlined, the landing line running to the last column. The left end
  // is a block's lit edge and the coping's lit end; the right end their shaded ones.
  const c = assemble((u, y, X) => stoneAt(u, y, X, s), (put, get, side) => {
    const L = side === 'left';
    for (let y = SURFACE + 1; y <= ROW.last; y++) put(0, y, s.ink);
    put(1, 13, L ? s.hi : s.lit);
    put(1, 14, L ? s.hi : s.mid);
    put(1, 15, L ? s.lit : s.body);
    for (let y = ROW.face; y < ROW.bevel; y++) put(1, y, L ? (y < 27 ? s.lit : s.mid) : s.dark);
    put(1, ROW.last, s.joint);
  });
  // The rim over the landing line and the foot under the course, in the outline's ink.
  outline(c, s.ink);
  return c;
}

/** The painter the importer calls. */
export function paint() { return starfield(); }
