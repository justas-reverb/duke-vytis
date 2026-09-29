// ABYSS: a spine lying along the ledge -- squat vertebrae side by side, a violet disc
// between each pair -- painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in was cut from the old one-off strip: a violet rod
// crossed every 32 px by a big glossy vertebra, 18 px wide, that stood nine rows proud of
// the walking surface and hung eleven below it. It did not wrap (edge difference 119.9),
// its landing line was the rod's dark top (luma 67) with the vertebrae's tops sticking up
// through the Duke's boots and the skull on the ledge, and an 18 px vertebra is sliced by
// the part tile that ends a run on almost every ledge width.
//
// WHAT WAS WRONG WITH THE FIRST PAINT. It took the strip's second design, a row of spools
// standing side by side: seven columns wide, fifteen rows tall, eight px apart, near-white,
// hanging from the white landing line with a one-pixel waist and rounded feet. In a real
// frame that is a COMB at 1x (a white line with a fringe under it) and a row of TEETH at
// 3x -- incisors under a gum, with the zone's skull standing on them like a jaw. Tall narrow
// units with rounded feet hanging from a band read as teeth whatever their waist does.
//
// WHAT IT IS NOW, and what was tried on the way (each in a real frame at 1x and 3x):
//   - the old rod with its vertebrae cut to one 4-px slot each, standing proud only below
//     the rod: a RULER, or at 8 px apart a comb; the same rings standing above and below a
//     rod at mid-height, the landing line joining their tops: a RAILING with balusters. The
//     old look needs vertebrae and rod segments both about 8 px, and the slot rule lets one
//     of the two be 4 at most: it cannot come back at this size;
//   - a lateral spine, a lamina bar over a row of foramina over the bodies: a rail with bolt
//     holes; bodies with a spinous process leaning back under each: a bar of thorns;
//   - bodies as bobbins lying down, concave underneath: a scalloped valance; as cylinders
//     with flared rims at the joints: a segmented pipe; as plain blocks with a disc between:
//     lavender keycaps;
//   - SQUAT vertebrae side by side, each pinched in two steps at mid-height on both sides,
//     with the disc between them swelling into the pinch as a violet lens: a chain of
//     vertebrae -- a spine seen from the side, bodies and discs. Wider than tall (15 x 14),
//     joined by the discs rather than hanging apart, lavender rather than white. Rounding
//     each one's feet turned it straight back into a molar; square feet, with the endplates'
//     lips a row lower than the body either side of each disc, read as bone.
//   The ends are smaller vertebrae, shorter and rounded off outside: the spine tapering.
//
// THE CUT. A vertebra is wider than a slot, so it is texture a cut may shorten, and the
// joint is the discrete object: four columns -- the two of one vertebra's right side, the
// disc, the next one's lit edge -- in one slot (8-11, 24-27), declared through slot().
// Between joints every column of a vertebra is the same drawing but its two on the left
// (its lit edge and the ivory highlight inside it) and its two on the right, so a cut
// through one only makes it narrower or wider: the right cap opens with the last seven
// columns of a vertebra, and the last one on a ledge is 8, 12, 16 or 20 px on the eight
// widths (15 for a whole one). The cut can fall at most two columns short of a vertebra's
// end, which is why its right side may use two columns and its left side two: a third on
// either side (a terminator curving across the middle, a deeper pinch, a concave foot)
// would show twice on a quarter of the widths.
//
// THE PALETTE is the zone's bone as the decor, the title and the HUD already use it
// (decorpaint/abyss.js BONE, titlepaint/abyss.js BONE): ivory in the light, turning through
// lavender to violet in the shade, outlined in the old tile's darkest violet. Lavender is the
// body, as the old ledge's was; ivory only the highlight down each vertebra's lit side and
// the landing line. The discs are the old rod's violet. The backdrop behind is near-black
// violet (bgpaint/abyss.js, median luma 20 behind the ledges in a real frame), so the
// column reads by value: body 8.0:1, landing line 17.9:1 against it.

import { CELL_W, CELL_H, CAP_W, PERIOD, SURFACE, mod, blank, slot } from './kit.mjs';

export const BONE = {
  ink: '#100e1c',       // outline: the old tile's darkest, the decor's outline
  b0: '#fffaf2',        // row 12, the landing line: the brightest colour in the cell
  b1: '#f1e7dd',        // ivory: the highlight down a vertebra's lit side
  b2: '#cfc2cf',        // lavender bone
  b3: '#a898b0',
  b4: '#806a96',        // violet shade
  b5: '#5f4673',        // a vertebra's shaded edge
  b6: '#3b2c4c',        // the deepest shade, at the feet
};
export const DISC = { lit: '#8a6c9e', mid: '#644a80', deep: '#43305a' };
const RAMP = [BONE.b0, BONE.b1, BONE.b2, BONE.b3, BONE.b4, BONE.b5, BONE.b6];

// THE JOINTS: [right side, right edge, disc, lit edge], each in one slot.
const JOINTS = [8, 24].map((u) => slot(u, 4, 'ABYSS joint'));
const W = 15;                 // a vertebra's columns in a run, c 0-14
const TOP = 13, FOOT = 27;    // its rows under the landing line
const PINCH = [[17, 23], [19, 21]];   // rows cut from the outer and the inner edge column
const STEP = [21, 25];        // down a vertebra the tone steps darker twice: lit from above

/** Column u's place: 0-14 in its vertebra, or 'd' (the disc). */
function colOf(u) {
  for (const j of JOINTS) {
    if (u === j) return W - 2;
    if (u === j + 1) return W - 1;
    if (u === j + 2) return 'd';
    if (u === j + 3) return 0;
  }
  let d = 1;
  while (!JOINTS.includes(mod(u - d - 3, PERIOD))) d++;
  // The vertebra across u0 shows u0 twice in a run (tile columns 31 and 0); both are
  // plain body columns, which is what lets u0 stand for two of them.
  const start = mod(u - d, PERIOD);
  return d + (start > u && u > 0 ? 1 : 0);
}

/**
 * A bone pixel, or null (outside it, or pinched away). `tone` is the column's tone across
 * the vertebra (1 the ivory highlight, 2 the body, 4-5 its shaded side), `pinch` 0 for none,
 * 1 for an outer edge column, 2 for the one inside it; `top` and `foot` its first and last
 * rows (the corners are rounded by starting and ending an edge column a row short).
 */
function bone(tone, pinch, y, top = TOP, foot = FOOT) {
  if (y === SURFACE) return BONE.b0;
  if (y < top || y > foot) return null;
  if (pinch && y >= PINCH[pinch - 1][0] && y <= PINCH[pinch - 1][1]) return null;
  let t = tone + (y >= STEP[0] ? 1 : 0) + (y >= STEP[1] ? 1 : 0);
  if (y === TOP) t = Math.min(t, 1);          // its top catches the light
  return RAMP[Math.max(1, Math.min(6, t))];
}

/**
 * Column c of a vertebra: its lit edge, the highlight, the body, then its shaded side. The
 * body ends a row above the edge columns, so each endplate's lip hangs a row lower either
 * side of the disc; the edge columns start a row lower, so the vertebrae part right under
 * the landing line (hung from one continuous band they were a gum with teeth).
 */
function vert(c, y) {
  if (c === 0) return bone(2, 1, y, TOP + 1, FOOT);
  if (c === 1) return bone(1, 2, y);
  if (c === W - 2) return bone(3, 2, y);
  if (c === W - 1) return bone(4, 1, y, TOP + 1, FOOT);
  return bone(2, 0, y, TOP, FOOT - 1);
}

/**
 * The disc, set back between two vertebrae and showing where their sides pinch in: one
 * column down the joint, swelling into the pinches either side as a lens. `k` is how far
 * from the joint's middle: 0 the disc's own column, 1 an outer edge's pinch, 2 an inner's.
 */
function disc(k, y) {
  const [a, b] = k === 0 ? [PINCH[0][0] - 1, PINCH[0][1] + 1] : PINCH[k - 1];
  if (y < a || y > b) return null;
  if (y <= a + 1) return DISC.lit;
  if (y >= b - 1) return DISC.deep;
  return k === 2 ? DISC.deep : DISC.mid;
}

/** A column of the strip or a cap: a vertebra column with the disc behind its pinch. */
function px(c, y, discSide = 0) {
  if (y < SURFACE) return null;
  if (c === 'd') return y === SURFACE ? BONE.b0 : disc(0, y);
  const v = vert(c, y);
  if (v) return v;
  if (y > SURFACE && discSide) return disc(discSide, y);
  return null;
}

/** How far column c's pinch is from the disc: 1 for an edge column, 2 inside it, else 0. */
const sideOf = (c) => (c === 0 || c === W - 1 ? 1 : c === 1 || c === W - 2 ? 2 : 0);

/** Every empty pixel touching the drawing becomes ink; `wrap` for the period-31 strip. */
function outline(T, w, wrap) {
  const O = T.map((r) => r.slice());
  const at = (x, y) => {
    if (y < 0 || y >= CELL_H) return null;
    if (wrap) return T[y][mod(x, w)];
    return x >= 0 && x < w ? T[y][x] : null;
  };
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < w; x++) {
      if (T[y][x]) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) O[y][x] = BONE.ink;
    }
  }
  return O;
}

// THE END KNOBS, seven columns each: a last, smaller vertebra three rows shorter than the
// rest and rounded off on its outer side, the spine tapering to its end. Listed from the
// joint outward, as [tone, pinch, top, foot]: the left one lit on its outer end, the right
// one on its inner side (the light does not mirror with the columns).
const KNOB_L = [[4, 1, TOP + 1, FOOT - 4], [3, 2, TOP, FOOT - 3], [2, 0, TOP, FOOT - 3],
  [2, 0, TOP, FOOT - 3], [2, 0, TOP, FOOT - 4], [1, 0, TOP, FOOT - 6], [2, 0, TOP + 1, FOOT - 9]];
const KNOB_R = [[2, 1, TOP + 1, FOOT - 4], [1, 2, TOP, FOOT - 3], [2, 0, TOP, FOOT - 3],
  [2, 0, TOP, FOOT - 3], [3, 0, TOP, FOOT - 4], [4, 0, TOP, FOOT - 6], [4, 0, TOP + 1, FOOT - 9]];

/** The ABYSS cell. */
export function abyss() {
  const T = [];
  for (let y = 0; y < CELL_H; y++) {
    T.push([]);
    for (let u = 0; u < PERIOD; u++) {
      const c = colOf(u);
      T[y].push(px(c, y, c === 'd' ? 0 : sideOf(c)));
    }
  }
  // The caps are drawn whole and outlined on their own, since nothing lies past a ledge's
  // end; each meets the tile as the neighbouring columns of the same vertebra.
  const left = Array.from({ length: CELL_H }, () => new Array(CAP_W).fill(null));
  const right = Array.from({ length: CELL_H }, () => new Array(CAP_W).fill(null));
  for (let y = 0; y < CELL_H; y++) {
    // LEFT: the landing line to the ledge's first column; the knob (x 1-7); the disc (x 8);
    // then the vertebra that runs on into the tile, from its lit edge (x 9).
    left[y][0] = y === SURFACE ? BONE.b0 : null;
    KNOB_L.forEach(([tone, pinch, top, foot], i) => {
      left[y][7 - i] = bone(tone, pinch, y, top, foot) || (y > SURFACE && pinch ? disc(pinch, y) : null);
    });
    left[y][8] = px('d', y);
    left[y][9] = px(0, y, 1);
    left[y][10] = px(1, y, 2);
    for (let x = 11; x < CAP_W; x++) left[y][x] = px(2, y);
    // RIGHT: the last seven columns of a vertebra, whatever the part tile before it cut
    // (plain body, then its two shaded columns); the disc (x 55); the knob (x 56-62); the
    // landing line to the last column.
    for (let x = 0; x < 5; x++) right[y][x] = px(2, y);
    right[y][5] = px(W - 2, y, 2);
    right[y][6] = px(W - 1, y, 1);
    right[y][7] = px('d', y);
    KNOB_R.forEach(([tone, pinch, top, foot], i) => {
      right[y][8 + i] = bone(tone, pinch, y, top, foot) || (y > SURFACE && pinch ? disc(pinch, y) : null);
    });
    right[y][CAP_W - 1] = y === SURFACE ? BONE.b0 : null;
  }
  const S = outline(T, PERIOD, true);
  const L = outline(left, CAP_W, false);
  const R = outline(right, CAP_W, false);
  const c = blank();
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CAP_W; x++) {
      c[y][x] = L[y][x];
      c[y][CELL_W - CAP_W + x] = R[y][x];
    }
    for (let x = CAP_W; x < CAP_W + 32; x++) c[y][x] = S[y][mod(x - CAP_W, PERIOD)];
  }
  return c;
}

/** The painter the importer calls. */
export function paint() { return abyss(); }
