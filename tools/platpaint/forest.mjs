// FOREST: a ledge of earth and roots under a mossy grass top, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip was the right
// object -- grass and roots over soil with a strip of dirt -- drawn at the wrong
// resolution and cut to the wrong shape: a photograph-soft band of yellow-green blades over
// brown lumps, 1,700 colours, a grey bracket standing on the lip of every tile, and a tile
// that did not wrap (a seam every eight world units, 32 rows of 40 off). Its landing line
// was not its brightest row either: row 12 averaged luma 52 and the blades three rows
// under it 96, so the brightest thing on the ledge was a band a player does not stand on.
// It is redrawn here as the same ledge, cleanly.
//
// What it is, top to bottom:
//   - short grass tufts standing on the lip, in the twelve rows of headroom (rows 7-11),
//     each inside one 4-px slot so no ledge width slices one;
//   - row 11, the dark rim where the grass meets the wood behind it;
//   - row 12, the landing line: the palest, yellowest green in the cell, unbroken;
//   - a turf mat under it, rows 13-18, that darkens row by row and hangs over the earth in
//     blades;
//   - dark earth with a few lumps and a pebble, two roots running down through it;
//   - a ragged underside with thin root ends hanging out of it, outlined.
//
// The palette is the zone's own. The grass is the decor's FERN ramp (the tufts that stand
// on this ledge, src/render/decorpaint/forest.js) with one paler, yellower tone on top for
// the landing line; the earth is built on the decor's SOIL (its edge and its darkest are
// the same colours), which its tufts already stand in, and lit with its BARK, as are the
// roots. So the ledge, the tufts and the trees are one set of greens and browns. The wood behind (src/render/bgpaint/forest.js, measured alone: luma median 38,
// 95th percentile 61, hue 112) is a cool dark green; the turf is lighter and yellower than
// any of it, and the earth, which cannot be lighter without reading as more floor, is told
// from it by hue -- warm brown on cool green -- and by its outline.

import { CELL_H, SURFACE, PERIOD, mod, hash, assemble, outline, slot } from './kit.mjs';

// --- the palette ------------------------------------------------------------------------
//
// Ramps dark to light, hue-shifted: grass shadow toward blue-green, grass light toward
// yellow; earth shadow toward plum, earth light toward orange. Every material has its own
// darkest colour for its outline, as the decor's trees and tufts do.
export const GRASS = {
  k: '#0b1a10',   // outline, green-black (the decor fern's edge)
  0: '#133019',
  1: '#234f22',
  2: '#3a7428',
  3: '#619b33',
  4: '#94c14b',   // the lit blade tips: the decor fern's lightest
  5: '#c0db66',   // row 12, the landing line, and nothing else
};
export const SOIL = {
  k: '#140c0a',   // outline (the decor soil's edge)
  0: '#1d120f',
  1: '#2a1a15',
  2: '#3a261c',
  3: '#4f3424',
  4: '#69442f',
};
// The decor's BARK ramp less its lightest (#8f613e): that was each root's top pixel, and it
// was the brightest thing in the earth (see ROOTS).
const ROOT = { d: '#2f1a1a', b: '#4a2c21', l: '#69442f', s: SOIL[0] };

const GRASS_SET = new Set(Object.values(GRASS));

// --- the shape of one 31-column repeat -----------------------------------------------------
//
// Every profile below is one value per repeat column u (0..30), drawn by hand rather than
// from noise, so the rhythm along a ledge is chosen, not whatever a hash gave.

/**
 * How many rows the turf hangs below row 18, per repeat column: its fringe, grass blades
 * hanging over the earth in points one or two columns wide. (The first turf ended at row
 * 15 and hung in rounded mounds three to five wide: in a real frame at 1x the ledge was a
 * brown plank with a green line on it, where the old strip read green -- the grass is what
 * a player knows this ledge by, so it is thicker now and hangs in blades.)
 */
const FRINGE = [0, 0, 2, 1, 0, 0, 0, 1, 3, 1, 0, 0, 0, 2, 0, 0, 1, 0, 1, 2, 0, 0, 0, 0, 3, 1, 0, 0, 1, 0, 0];
/** The earth's last row, per repeat column: a ragged underside around row 31. */
const SOIL_BOTTOM = [31, 31, 32, 32, 32, 31, 31, 30, 31, 32, 32, 32, 33, 33, 32, 32, 31, 31, 31, 30, 30, 31, 31, 31, 32, 32, 32, 31, 31, 30, 31];
/** Where the upper earth (lighter) gives way to the lower (darker), per column. */
const SOIL_SPLIT = [26, 26, 27, 27, 27, 26, 26, 25, 25, 26, 27, 27, 28, 28, 27, 27, 26, 26, 25, 25, 26, 27, 27, 27, 26, 26, 26, 27, 27, 26, 26];
for (const [n, a] of Object.entries({ FRINGE, SOIL_BOTTOM, SOIL_SPLIT })) {
  if (a.length !== PERIOD) throw new Error(`FOREST ${n}: ${a.length} columns; one repeat is ${PERIOD}`);
}
const turfEnd = (u) => 18 + FRINGE[u];

// --- the grass on the lip -------------------------------------------------------------------
//
// Tufts of one or two blades, rows 7-11, each inside ONE 4-px slot with its outline: the
// blades take the slot's middle two columns and the outline pass puts the dark edge in the
// outer two. A cut at any fourth column then takes a whole tuft or none of it (rule 4 in
// ./index.mjs). Digits are GRASS tones; the bottom row is row 11, the rim's row, so a tuft's
// base is one of the two darkest tones and the rim over the landing line stays dark under
// it. Only a tip is lit, and never in the landing line's colour: sparse points of light
// three to five rows over the line, not a second line.
const TUFTS = {
  // two blades, the left one taller
  pairL: ['4.', '3.', '34', '23', '11'],
  // two blades, the right one taller
  pairR: ['.4', '.3', '43', '32', '11'],
  // one blade leaning left
  leanL: ['..', '4.', '.3', '.2', '.1'],
  // stubble
  low: ['..', '..', '..', '3.', '21'],
};
// Which tuft stands in which slot (the slot's first repeat column); slots 8-11 and 16-19
// stand bare, so the lip is not a comb. The first and last slots are only three wide (1-3,
// 28-30): a single blade in each, in its middle column.
const LIP = [
  { u: 4, t: 'pairL' },
  { u: 12, t: 'low' },
  { u: 20, t: 'pairR' },
  { u: 24, t: 'leanL' },
];
const LIP_ONE = [{ u: 1, rows: ['4', '3', '2', '1'] }, { u: 28, rows: ['3', '2', '1'] }];
const lipAt = new Map();
for (const { u, t } of LIP) {
  slot(u, 4, `FOREST grass tuft ${t}`);
  TUFTS[t].forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') lipAt.set(`${u + 1 + i},${7 + j}`, GRASS[ch]);
  }));
}
for (const { u, rows } of LIP_ONE) {
  slot(u, 3, 'FOREST grass blade');
  rows.forEach((ch, j) => lipAt.set(`${u + 1},${SURFACE - rows.length + j}`, GRASS[ch]));
}

// --- the earth ---------------------------------------------------------------------------
//
// Lumps: the soil is not a wall of stones, so a few rounded clods sit in a plain ground,
// each lit on its upper left and creased dark under its foot. Texture: a cut through one
// reads as more earth. Placed in repeat columns; drawn through their copies either side of
// the repeat so one that crosses u 0 is whole on both sides.
const CLODS = [
  { u: 13, y: 23.5, rx: 3.0, ry: 1.5 },
  { u: 25, y: 23.5, rx: 2.8, ry: 1.4 },
  { u: 4.5, y: 27, rx: 2.6, ry: 1.4 },
  { u: 17.5, y: 28, rx: 3.2, ry: 1.5 },
];
/** The clod pixel (u, y) falls in, and where in it: or null. */
function clodAt(u, y) {
  for (const c of CLODS) {
    for (const k of [-1, 0, 1]) {
      const dx = (u + 0.5 - (c.u + k * PERIOD)) / c.rx, dy = (y + 0.5 - c.y) / c.ry;
      if (dx * dx + dy * dy <= 1) return { c, dx, dy };
    }
  }
  return null;
}

// One pebble per repeat, discrete, inside one slot, and dark: two pale grey ones were the
// lightest things in the earth and at 4x they stood in a row like rivets.
//
// "Dark" was not dark enough. The one pebble that replaced them kept a pale grey highlight
// (#7c7062, luma 114) and lit side (87) on earth of luma 43: still the brightest pixels in
// the earth and the only grey ones, on the same row every 31 px, and a 6x crop of a real
// frame showed the rivets again. Its tones now sit inside the earth's own range -- the
// highlight (72) under the clods' lit tops (77) -- so it is a stone in the soil, found
// when looked for, not a stud the eye counts along the ledge.
const STONE = { d: '#1f1917', b: '#2e2723', l: '#40362f', h: '#524539' };
const PEBBLES = [{ u: slot(9, 3, 'FOREST pebble'), y: 24, rows: ['hl.', 'lbd'] }];
function pebbleAt(u, y) {
  for (const p of PEBBLES) {
    const i = u - p.u, j = y - p.y;
    if (j >= 0 && j < p.rows.length && i >= 0 && i < p.rows[j].length && p.rows[j][i] !== '.') return STONE[p.rows[j][i]];
  }
  return null;
}

// Roots, drawn by hand: each starts under the turf at repeat column u0 and steps down one
// row at a time, `steps` giving how far it moves sideways on each row, so it wanders and
// leans rather than dropping plumb. Two pixels wide for its first `thick` rows (the walked
// pixel is the lit edge, the one to its right the body), then one. Texture: a cut through
// a root in the earth reads as the root going deeper.
//
// The first version ran two roots in eased curves from the turf straight to the underside
// and out of it. In the earth they were plumb two-pixel columns at a steady spacing, and
// with their ends hanging out below, the ledge read as a table standing on legs -- the
// trap DOWNTOWN's corner posts fell into. The second had three, leaning, which at 4x in a
// real frame made a zigzag hatch along the whole ledge. The third had two, one long and one
// short, leaning different ways, and each lit its whole length (a highlight of luma 107 at
// the top, a lit edge of 77) with a dark pixel of shadow beside it all the way down: the
// loudest strokes in an earth of luma 30-43. One '\' and one '/' per repeat, in a real
// frame at zoom 1 and 2 they made a row of V's along every ledge -- the zigzag again.
// Re-drawn: a fork off the long one made an 'A' every repeat (lettering), and a root that
// curved back cut the earth into pillows. What reads as roots in soil: both lean the SAME
// way, at different slopes and lengths, starting on different rows; lit only for the two
// rows where they leave the turf, then the bark's middle tone, and the shadow pixel only
// there too. They are texture now, found when looked for; the root ends hanging out of the
// underside are what say "roots" at a glance (see HANGING). Ending in the earth, not plumb.
const ROOTS = [
  { u0: 3, y0: 20, thick: 8, steps: [0, 1, 0, 1, 1, 0, 1, 0, 1] },
  { u0: 18, y0: 22, thick: 3, steps: [1, 0, 0, 1] },
];
const rootPix = new Map();
for (const r of ROOTS) {
  let u = r.u0;
  for (let j = 0; j <= r.steps.length; j++) {
    const y = r.y0 + j;
    if (j > 0) u += r.steps[j - 1];
    rootPix.set(`${mod(u, PERIOD)},${y}`, j < 2 ? 'l' : 'b');
    const w = j < r.thick ? 2 : 1;
    if (w === 2) {
      const k = `${mod(u + 1, PERIOD)},${y}`;
      if (!rootPix.has(k) || rootPix.get(k) === 's') rootPix.set(k, 'd');
    }
    // The earth in the root's shadow, on its lower right, where it is lit: without it a
    // root was a lit scratch across the soil, one pixel of light with nothing to say it was
    // round. Down its whole length it drew the root as a dark scratch instead.
    const s = `${mod(u + w, PERIOD)},${y}`;
    if (!rootPix.has(s) && j < 2) rootPix.set(s, 's');
  }
}
/** Root pixel at (u, y) inside the earth: 'l' lit edge (its first two rows), 'b' body,
 *  'd' shaded, 's' the earth in its shadow. */
const rootAt = (u, y) => rootPix.get(`${u},${y}`) || null;

// What hangs out of the underside: thin root ends, one pixel wide with a kink, of three
// lengths. A root end is discrete -- sliced, it is a stump -- so each keeps to one slot:
// its pixels in the slot's middle two columns, its outline in the outer two. Rows are
// counted from the first row under the earth; the digit is the column in the slot.
const HANGING = [
  { u: slot(8, 4, 'FOREST hanging root'), cols: [1, 1, 2, 2, 1] },
  { u: slot(20, 4, 'FOREST hanging root'), cols: [2, 1, 1] },
  { u: slot(28, 3, 'FOREST hanging root'), cols: [1, 1] },
];
function hangingAt(u, y) {
  for (const h of HANGING) {
    const i = u - h.u;
    if (i < 0 || i > 3) continue;
    // Hang from the lower of the two columns' undersides, so the root leaves the earth
    // rather than starting in mid-air beside it.
    const base = Math.max(SOIL_BOTTOM[h.u + 1], SOIL_BOTTOM[h.u + 2]) + 1;
    const j = y - base;
    if (j >= 0 && j < h.cols.length && h.cols[j] === i) return j === h.cols.length - 1 ? 'd' : 'b';
    if (j < 0 && y > SOIL_BOTTOM[u] && (i === 1 || i === 2) && h.cols[0] === i) return 'b';
  }
  return null;
}

/** A turf blade stroke in column u: about one column in four, never two side by side. */
const bladeAt = (u, seed) => hash(u, seed) < 0.3 && !(hash(mod(u - 1, PERIOD), seed) < 0.3);

/** One pixel of the repeat, by repeat column u and row y. */
function forestAt(u, y) {
  if (y < SURFACE) return lipAt.get(`${u},${y}`) || null;
  if (y === SURFACE) return GRASS[5];
  const te = turfEnd(u);
  if (y <= te) {
    // The turf: darkening down, with a darker blade stroke now and then so it reads as
    // grass and not as a green band. Its last row is a dark hem, and where it hangs lower
    // its blade tips are the darkest green of all.
    const r = y - SURFACE;
    if (y === te) return r > 6 ? GRASS[0] : GRASS[1];
    // Blades are vertical strokes two rows long, never side by side: a lit one carrying the
    // upper turf's green down into the darker, a dark one cutting into the lit. Strokes on
    // every row keyed on two hashes met in L's and T's, and at 10x the turf was lettered.
    const lit = bladeAt(u, 21), dark = !lit && bladeAt(u, 5), low = bladeAt(u, 9);
    if (r === 1) return GRASS[3];
    if (r === 2) return dark ? GRASS[2] : GRASS[3];
    if (r === 3) return lit ? GRASS[3] : dark ? GRASS[1] : GRASS[2];
    if (r === 4) return GRASS[2];
    if (r === 5) return low ? GRASS[1] : GRASS[2];
    return GRASS[1];
  }
  const sb = SOIL_BOTTOM[u];
  if (y > sb) {
    const h = hangingAt(u, y);
    return h ? ROOT[h] : null;
  }
  const root = rootAt(u, y);
  // The earth. The first row under the turf is its shadow; then the upper earth, then the
  // lower, darker; the last row the darkest before the outline.
  if (root) return ROOT[root];
  const peb = pebbleAt(u, y);
  if (peb) return peb;
  if (y === te + 1) return SOIL[0];
  const upper = y < SOIL_SPLIT[u];
  const cl = clodAt(u, y);
  if (cl) {
    // Lit from the upper left: the top-left of a clod a tone up (two, high in the earth),
    // its foot a tone down.
    const { dx, dy } = cl;
    const base = upper ? 3 : 2;
    if (dy < -0.35 && dx < -0.1) return SOIL[upper ? 4 : 3];
    if (dy > 0.45) return SOIL[base - 1];
    return SOIL[base];
  }
  // A clod's crease: the pixel just under one is darker.
  if (clodAt(u, y - 1)) return SOIL[upper ? 1 : 0];
  if (y === sb) return SOIL[1];
  return SOIL[upper ? 2 : 1];
}

// --- the ends -------------------------------------------------------------------------------
//
// The earth rounds off under the lip at each end: the landing line runs to the ledge's last
// column, and under it the body steps in, so an end reads as a clod of turf and earth, not a
// sawn plank. `BOTTOM_AT[d]` is the last body row d columns in from the end (the strip's own
// underside from d = 6). The grass on the lip keeps two columns clear of each end, where a
// tuft's outline from the next slot would otherwise stand alone.
const BOTTOM_AT = [SURFACE, 17, 23, 27, 29, 30];

function ends(put, get, side) {
  for (let d = 0; d < BOTTOM_AT.length; d++) {
    if (d < 2) for (let y = 0; y < SURFACE - 1; y++) put(d, y, null);
    for (let y = BOTTOM_AT[d] + 1; y < CELL_H; y++) put(d, y, null);
  }
  // The outer face of the body: lit at the left end (the light is from the upper left),
  // in shadow at the right.
  for (let d = 1; d < 4; d++) {
    for (let y = SURFACE + 1; y <= BOTTOM_AT[d]; y++) {
      const c = get(d, y);
      if (!c) continue;
      const edge = !get(d - 1, y);
      if (!edge) continue;
      if (GRASS_SET.has(c)) put(d, y, side === 'left' ? GRASS[3] : GRASS[1]);
      else put(d, y, side === 'left' ? SOIL[3] : SOIL[0]);
    }
  }
}

/** The FOREST cell. */
export function forest() {
  const c = assemble(forestAt, ends);
  // The outline: every empty pixel touching the drawing takes the darkest colour of what it
  // touches -- green-black against grass (the rim over the landing line, the tufts' edges),
  // brown-black against earth and roots (the underside, the ends).
  outline(c, (touching) => (touching.some((t) => GRASS_SET.has(t)) ? GRASS.k : SOIL.k));
  return c;
}

/** The painter the importer calls. */
export function paint() { return forest(); }
