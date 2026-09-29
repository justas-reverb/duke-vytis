// BASEMENT: a ledge of the cellar's own brick, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip was the right
// object -- a brown brick ledge over the cellar's violet wall -- drawn at another scale and
// resampled: 1,236 colours in one cell, no tile edge that met its own other edge (a seam
// every eight world units up the whole zone), a row of little lit blocks standing proud of
// the surface like battlements, and a lit course top five rows UNDER the landing line that
// was brighter than the landing line itself (row 17 at luma 113 against row 12 at 99): a
// second ledge inside the first. So it is redrawn here, the same ledge, cleanly.
//
// What it is: the cellar's brick laid up as a shelf. A coping of bricks on edge whose worn
// top is the landing line, then two courses of stretchers in running bond, each a step
// darker than the one above, down to the physics thickness, so the webs and the drip that
// hang under these ledges (src/render/decorpaint/basement.js) hang where they always did.
// The side walls (src/render/wallpaint/basement.js) are this same brick in the gloom --
// the same browns, pulled toward plum, two to three steps darker -- so the ledge ramp
// starts where the wall's stops (its brightest, the arris, is #664330) and climbs to a
// pale worn ochre on top. The backdrop is violet brick (src/render/bgpaint/basement.js),
// so the ledge is told from it by hue as much as by value: warm brown on cool violet,
// every shadow tone leaning to plum so the two still look like one cellar.

import { CELL_W, CELL_H, SURFACE, PERIOD, hash, assemble, outline, slot } from './kit.mjs';

// --- the palette ------------------------------------------------------------------------
//
// One brick ramp, hue-shifted: the shadows lean plum (toward the backdrop's mortar), the
// lights ochre. Luma in the comments, Rec. 601, as the tools measure it.
export const BRICK = {
  ink: '#140a12',      //  14  the outline where the ledge meets the backdrop
  mortar: '#28171f',   //  29  bed and head joints
  worn: '#56383a',     //  65  the top of a head joint in the coping, worn round by boots
  b0: '#3a2130',       //  42  the underside of a brick, plum
  b1: '#4e2c34',       //  55  shadow
  b2: '#623a3a',       //  70  dark body
  b3: '#764a40',       //  86  body
  b4: '#8c5d49',       // 105  light
  b5: '#a5774f',       // 128  lit, toward ochre
  top: '#d8ae7a',      // 181  row 12: the worn top, the landing line
};
const RAMP = [BRICK.b0, BRICK.b1, BRICK.b2, BRICK.b3, BRICK.b4, BRICK.b5];
const tone = (i) => RAMP[Math.max(0, Math.min(RAMP.length - 1, i))];

// --- the courses --------------------------------------------------------------------------
//
// Rows, top down. The coping is bricks on edge, a finer rhythm than the stretchers under
// it, which is what the old ledge's top row of short blocks was trying to be; its joints
// start under the landing line, so row 12 runs unbroken the whole length of the ledge.
// Each stretcher course is a step darker than the one above: the body darkens downward
// and no course top can be read as more floor. Row 39 is the underside, outlined.
//
// WHY TWO STRETCHER COURSES, NINE ROWS EACH. The first version laid three of six rows:
// bricks the true size of a brick beside a man, and in a crop beside the Duke they read
// as small tiles, a miniature wall. Everything else in this cellar is laid in big brick --
// the walls' are 30 x 14, the backdrop's larger still, and the old ledge's courses were 12
// and 8 rows -- so these are too: 15 x 9 under a coping of 7 x 6.
//
// base: the course's body tone; its lit top and left edge are one step up, its bottom and
// right edge one or two down. recess: how far the course stops short of the ledge's two
// ends, in columns (see the ends, below).
const COURSES = [
  { name: 'coping', rows: [12, 18], base: 4, joints: [6, 13, 21, 29], recess: 0 },
  { name: 'first', rows: [20, 28], base: 3, joints: [10, 25], recess: 0 },
  { name: 'second', rows: [30, 39], base: 2, joints: [5, 18], recess: 2 },
];
const BED_JOINTS = new Set([19, 29]);

// WHERE THE JOINTS ARE, AND WHY THERE. A head joint is drawn as three columns -- the
// brick to its left ending in a shadowed edge, the mortar, the next brick's lit edge --
// and those three are one object: the renderer ends a run with a part tile cut from the
// tile's left in multiples of 4 art px, then the right cap, which starts at repeat column
// 1. Three columns that straddled a cut would leave a lit or a shadowed stripe in the
// middle of a brick, so every joint's three sit in ONE slot (the mortar on a column 1 or
// 2 past a multiple of four), and slot() refuses any that do not.
//
// A cut still changes how long the last brick before the right cap is -- that is
// texture, and brickwork has closers -- so the joints are also kept out of the first four
// columns of the right cap's strip (u 1..4). Measured over the eight part tiles: coping
// headers 6-11 columns (7 or 8 elsewhere), stretchers 5-23 (12-16 elsewhere); the 5 is
// one closer in the bottom course on a ledge of 29 units. Adjacent courses never put a
// joint within three columns of each other, so no vertical line runs down through two
// courses.
for (const c of COURSES) for (const j of c.joints) slot(j - 1, 3, `BASEMENT ${c.name} course joint at ${j}`);

// Joints within END_CLEAR columns of a ledge's far end are left out: there they would cut
// a brick three columns long against the end (the bottom course's joint at 18 is repeat
// column 15's neighbour at the left end, the coping's 13 the right end's). The end brick
// runs on to the next joint instead.
const END_CLEAR = 5;
const LEFT_END = -16, RIGHT_END = CELL_W - 16 - 1;   // strip coordinates of the two end columns
const jointAt = (course, X) => course.joints.includes(((X % PERIOD) + PERIOD) % PERIOD) &&
  X - LEFT_END >= END_CLEAR && RIGHT_END - X >= END_CLEAR;

// Marks in a brick's face: two-pixel pits, and the odd lighter fleck, each inside one
// 4-px slot so no cut can halve one into a lone speck, never one straight under another --
// two stacked made a dark square in the brick -- and never on a joint's three columns,
// where the joint drew over half of it and left a one-pixel speck. Chosen per slot and row
// by hash, so they wrap with the strip.
function markSlot(course, s, y) {
  const [y0, y1] = course.rows;
  if (y <= y0 + 1 || y >= y1 - 1) return null;       // not on a lit top or a shadowed foot
  const h = hash(s * 7 + COURSES.indexOf(course), y * 13 + 5);
  if (h > 0.2) return null;
  const x0 = s * 4 + 1 + Math.floor(hash(s, y + 50) * 2);   // columns x0, x0 + 1: inside the slot
  if (x0 + 1 > PERIOD - 1) return null;
  if (course.joints.some((j) => j >= x0 - 1 && j <= x0 + 2)) return null;
  return { x0, d: h < 0.035 ? +1 : -1 };
}
function markAt(course, u, y) {
  const s = Math.floor(u / 4), m = markSlot(course, s, y);
  if (!m || markSlot(course, s, y - 1) || (u !== m.x0 && u !== m.x0 + 1)) return 0;
  return m.d;
}

/** One pixel of the brick strip, by repeat column u (0..30), row y and strip column X. */
function brickAt(u, y, X) {
  if (y < SURFACE) return null;
  if (y === SURFACE) return BRICK.top;
  if (BED_JOINTS.has(y)) return BRICK.mortar;
  const course = COURSES.find((c) => y >= c.rows[0] && y <= c.rows[1]);
  if (!course) return null;
  const [y0, y1] = course.rows;
  const b = course.base;
  const coping = course === COURSES[0];
  const last = course === COURSES[COURSES.length - 1];
  if (last && y === y1) return BRICK.ink;

  // The head joint and the two brick edges beside it.
  if (jointAt(course, X)) return coping && y === y0 + 1 ? BRICK.worn : BRICK.mortar;
  const litEdge = jointAt(course, X - 1), shadeEdge = jointAt(course, X + 1);
  if (coping && y === y0 + 1) {
    // The coping's top face under the landing line: lit, its arrises at each joint worn
    // round a tone darker, so the top reads as trodden brick and not as a painted stripe.
    return litEdge || shadeEdge ? tone(b) : tone(b + 1);
  }
  // A course's foot: the underside of every brick, a step or two under its body.
  const foot = last ? y1 - 1 : y1;
  if (y === foot) return tone(b - (coping ? 2 : 1) - (shadeEdge ? 1 : 0));
  if (shadeEdge) return tone(b - 1);
  if (litEdge) return tone(b + 1);
  // A brick's lit top: only along its left part, as the wall's bricks and the backdrop's
  // are lit, so no course carries a lit line along its whole length. (In the coping the
  // top face row above does that job.)
  //
  // Six columns, not seven. At seven the first course's lit top reached repeat column 1,
  // the right cap's first column, and after a part tile of 4, 8, 20 or 24 px -- half of all
  // ledge widths -- that column followed the unlit middle of a brick: one lone lit pixel
  // on the brick's top at every such ledge's right end. At six it ends on u 0, so the
  // cap's first column is never lit: whatever a cut puts in front of it, a lit top can
  // only stop there, never start.
  if (!coping && y === y0) {
    let d = 0;
    while (d < 16 && !jointAt(course, X - d - 1)) d++;   // columns since this brick began
    return d <= 5 ? tone(b + 1) : tone(b);
  }
  return tone(b + markAt(course, u, y));
}

/** How far row y stops short of an end: its course's recess; a bed joint, the lesser of
 *  the two courses it lies between (it is the underside of the one that projects). */
function recessAt(y) {
  const c = COURSES.find((k) => y >= k.rows[0] && y <= k.rows[1]);
  if (c) return c.recess;
  return Math.min(recessAt(y - 1), recessAt(y + 1));
}

/** The BASEMENT cell. */
export function basement() {
  const c = assemble(brickAt, (put, get, side) => {
    // THE ENDS. The bottom course stops two columns short, so each end steps in under
    // the ledge the way a corbelled brick shelf does: cut square through every course it
    // was a slice of brick wall, not a shelf of it. Why that course: the stretcher course
    // with its joints at repeat column 10 has one six columns from the right end, and
    // recessed two it left a brick three columns long there on every ledge; the bottom
    // course's nearest joints are eleven in from the right and cleared at the left. The
    // coping runs the whole length -- the landing line is as long to stand on as the ledge
    // looks. Each course's end is outlined on its outer column; the face just inside is
    // the brick's end, lit on the left end and shaded on the right, as light from the upper
    // left finds it. Where a course projects past the one under it, the exposed bed is
    // outlined too.
    for (let y = SURFACE + 1; y < CELL_H; y++) {
      const r = recessAt(y);
      for (let d = 0; d < r; d++) put(d, y, null);
      put(r, y, BRICK.ink);
      if (BED_JOINTS.has(y)) {
        const out = Math.max(recessAt(y - 1), recessAt(y + 1));
        for (let d = r + 1; d <= out; d++) put(d, y, BRICK.ink);
        continue;
      }
      // The end face's tone from the course, not from the strip pixel it covers: copied
      // from the strip, it picked up the pits' tones as one-pixel specks down the end.
      const v = get(r + 1, y);
      if (!v || v === BRICK.mortar || v === BRICK.ink) continue;
      const k = COURSES.find((q) => y >= q.rows[0] && y <= q.rows[1]);
      const last = k === COURSES[COURSES.length - 1];
      const i = y === (last ? k.rows[1] - 1 : k.rows[1]) ? k.base - (k === COURSES[0] ? 2 : 1)
        : k === COURSES[0] && y === k.rows[0] + 1 ? k.base + 1 : k.base;
      put(r + 1, y, tone(side === 'left' ? i + 1 : i - 1));
    }
    // The bottom corner knocked off.
    put(recessAt(CELL_H - 1), CELL_H - 1, null);
  });
  // The rim over the landing line, where the ledge meets the backdrop above it.
  outline(c, BRICK.ink, { where: (x, y) => y === SURFACE - 1 });
  return c;
}

/** The painter the importer calls. */
export function paint() { return basement(); }
