// COSMOS: a slab of moonstone, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY IT WAS REDRAWN. The first painted COSMOS ledge was a slab of night: a pale hairline
// on top of a body of blue-black (luma 8 to 13) with fine star dots in it. The sky it
// sits on is navy, median luma 20 (#001737 in a real frame at floor 1850), so the body
// was DARKER than the space around it, and at zoom 1 every ledge read as a black slit cut
// into the sky -- a shadow, a hole -- with one bright line along its top. The player said
// the platforms were broken. A thing you stand on in a lit scene is lighter than the air
// round it, lit on top and darkening downward; that slab was lit on top and nothing else.
//
// WHAT IT IS NOW. A slab cut from one of the zone's moons: blue-white moonstone with a
// pale lit top face, a body in ragged strata that darkens from a lit blue-grey under the
// top face to a violet-navy at the foot, soft craters in it, and a rough underside, like
// a rock afloat. Its body stands well over the sky and its top face is the palest thing
// on it, so it reads at a glance as solid ground, even where it is 27 px tall and 160
// wide at zoom 1. The body runs rows 13 to 36-38 like the other zones' ledges (STARFIELD's
// ends at 38), not the 23 rows the slab of night had.
//
// AGAINST THE SKY, measured in a real frame at floor 1850, zoom 1, with the Duke standing
// on a ledge under the orb: the frame against the same frame with the ledges stubbed,
// ledge pixels being those that differ and are this palette's colours, each against the
// sky behind it. The sky there is median luma 20, p95 26.
//              luma   WCAG     CIELAB dE   over sky p95   lighter than the sky
//   top face    213   11.9:1       77          100%              100%
//   body         89    2.65:1      33          100%              100%
//   (the night)  12    1.12:1      17            8%                9%
// The body's 2.65:1 is STARFIELD's jade exactly. Row 12 is luma 248, the brightest row
// below it row 13 at 213, and every row from there down is darker than the one above it
// on average, but for rows 21 and 24, 1-3 luma over the row above where a crater's lit
// rim falls. No dark row lies over a lit one anywhere under the landing line.
//
// WHY MOONSTONE. Everything COSMOS draws is a moon: the decor is a white-hot orb in a blue
// halo (decorpaint/cosmos.js), the title's letters are made of orbs, "each pixel of the
// font a small moon" (titlepaint/cosmos.js). So the landing line is the orb's own body
// colour (#f4f8ff), the top face its pale shade, and the rock steps down a blue-lilac
// ramp to the violet the zone's shadows lean toward -- hue-shifted the house way, lights
// cold and pale because the light here is starlight, shadows toward violet.
//
// WHAT WAS TRIED FIRST, each staged in a real frame at floor 1850 with the Duke standing
// on the ledge and the orb over it, and compared side by side at 1x and 3x:
//   - The same slab of night, lifted: blue glass a step lighter than the sky, a three-row
//     bevel, stars in it. Solid enough, but a flat dithered bar: denim at 3x, and the
//     stars in it made it a window onto more sky again.
//   - A bridge of the orb's light with orb nodes let into it, and orbs set in a dark band.
//     An orb that fits the 4-px slot rule is a bead, and two to a repeat are a ROW OF
//     RIVETS -- a perforated strip, a film strip -- at 1x and at 3x. The dark band read as
//     the old slit with dots in it.
//   - Grey moon rock: the most solid of all, but neutral grey on blue, a slab of granite
//     from some other zone. The same drawing in the orb's blues is this one.
// And on the way to this one:
//   - Crater pits in the rock's darkest tone: a row of black arrowheads at 3x. The craters
//     are DIMPLES now, one or two tones under the rock round them with a lit lower rim.
//   - Blobs of noise a third of the repeat across: waves, fish scales -- and at every
//     part-tile cut a seam, because the right cap resumes at u 1 and a big blob does not
//     meet it (shot-platwidths showed a vertical line on seven widths in eight). The face
//     is strata now, tone by ROW, their edges wandering by a row or two on noise a few
//     pixels across, so whatever column a cut falls on, the column after it matches.
//   - Those edges broken per column by a hash: short vertical strokes, fur. Three octaves
//     of unequal weight make them wander without waving evenly.
//
// THE SLOTS (./index.mjs rule 4). The strata and the underside are texture. Measured at
// the seven cuts (tile column 4k-1 followed by the right cap's u 1): 3 to 7 of the face's
// 21 rows change colour there, against 3 between true neighbours, and the underside steps
// by at most two rows -- and shot-platwidths at x3 shows no seam on any of the eight
// widths. The craters are objects, each inside one slot, and none in u 14-17, where the
// ends would leave a sliver of one (the ends draw over x 0-1 and 62-63 only).

import { CELL_H, SURFACE, PERIOD, mod, hash, assemble, slot, outline } from './kit.mjs';

export const MOONSTONE = {
  ink: '#04051a',       // the outline: the rim over the landing line, the underside, the ends
  line: '#f4f8ff',      // row 12, the landing line: the orb's body (decorpaint/cosmos.js)
  top: '#c8d6f4',       // the top face, lit
  top2: '#9fb0dc',      // the top face turning away; hangs a row lower in places, a lip
  // The rock, lit to dark: blue-grey under the top face to violet-navy at the foot.
  k: ['#8698c8', '#6f80b2', '#5b6aa0', '#4a578c', '#3c4679', '#2f3666', '#232852'],
};

const TAU = 2 * Math.PI;
const FOOT = 38;          // the deepest the rock reaches; the outline's ink goes under it

/**
 * Value noise that wraps with the strip: a lattice of `cells` across one repeat (so u 31
 * is u 0), `cy` rows down, smoothstepped. A seeded hash gives each lattice point its value.
 */
function vnoise(u, y, cells, cy, seed) {
  const x = (u * cells) / PERIOD, yy = y / cy;
  const i0 = Math.floor(x), j0 = Math.floor(yy);
  const fx = x - i0, fy = yy - j0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash(mod(i, cells) + seed * 97, j + seed * 131);
  const top = h(i0, j0) + (h(i0 + 1, j0) - h(i0, j0)) * sx;
  const bot = h(i0, j0 + 1) + (h(i0 + 1, j0 + 1) - h(i0, j0 + 1)) * sx;
  return top + (bot - top) * sy;
}

/**
 * The underside, per repeat column: a rock's rough foot, rows 36-38. Whole sines of the
 * repeat, so it wraps; at most a row between neighbours, two at a part-tile cut (u 19
 * then u 1), a step any rock's edge has. Lumps of one period read as a scalloped hem, so
 * three unequal ones.
 */
function footAt(u) {
  const w = 0.7 * Math.sin(TAU * u / PERIOD + 0.4) + 0.5 * Math.sin(TAU * (4 * u) / PERIOD + 2.0)
    + 0.35 * Math.sin(TAU * (7 * u) / PERIOD + 1.1);
  return Math.max(36, Math.min(FOOT, 37 + Math.round(w)));
}

/**
 * The rock's tone, 0 (lit) .. 6 (the foot), before cleaning. Strata: the row sets it, one
 * step every 3.6 rows from row 15, and the edges between steps wander on three octaves of
 * noise -- a coarse one a quarter of the repeat across, a finer one, and a pixel's worth
 * of grain -- so they neither rule straight lines nor wave evenly. The row over the foot
 * is always in shadow.
 */
function rawTone(u, y) {
  const fb = footAt(u);
  if (y >= fb) return 6;
  const j = (vnoise(u, y, 4, 6, 41) - 0.5) * 3.0 + (vnoise(u, y, 9, 3, 42) - 0.5) * 1.8
    + (hash(u + 3, y * 11 + 5) - 0.5) * 1.1;
  let t = Math.floor(((y - 15) + j) / 3.6);
  if (y === fb - 1) t = Math.max(t, 5);
  return Math.max(0, Math.min(6, t));
}

/** The tone, with every lone pixel -- one no neighbour shares -- taken into its neighbours'. */
function tone(u, y) {
  const t0 = rawTone(u, y);
  const n = [rawTone(mod(u - 1, PERIOD), y), rawTone(mod(u + 1, PERIOD), y)];
  if (y > 15) n.push(rawTone(u, y - 1));
  if (y < FOOT) n.push(rawTone(u, y + 1));
  if (n.includes(t0)) return t0;
  const count = (k) => n.filter((m) => m === k).length;
  return n.reduce((a, b) => (count(b) > count(a) ? b : a));
}

// Craters: dimples in the rock, lit from the upper left -- the inner wall under the upper
// left rim in shadow (D two tones under the rock round it, d one), the lower right rim
// catching the light (L one over). Relative tones, so a crater is never brighter than the
// lit rock around it and never a black hole: pits in the darkest tone were a row of black
// arrowheads at 3x. Seven sizes and heights to a repeat, one to a slot, so the field has
// no row in it.
const CRATERS = [
  { u: slot(1, 2, 'COSMOS crater'), y: 25, rows: ['Dd', 'dL'] },
  { u: slot(4, 4, 'COSMOS crater'), y: 19, rows: ['.Dd.', 'DddL', '.LL.'] },
  { u: slot(9, 2, 'COSMOS crater'), y: 29, rows: ['Dd', 'dL'] },
  { u: slot(12, 2, 'COSMOS crater'), y: 23, rows: ['Dd', 'dL'] },
  { u: slot(20, 3, 'COSMOS crater'), y: 26, rows: ['Ddd', '.LL'] },
  { u: slot(25, 2, 'COSMOS crater'), y: 17, rows: ['Dd'] },
  { u: slot(28, 3, 'COSMOS crater'), y: 32, rows: ['Ddd', '.LL'] },
];
const SHIFT = { L: -1, d: 1, D: 2 };
function craterAt(u, y, base, s) {
  for (const c of CRATERS) {
    const r = y - c.y, i = u - c.u;
    if (r < 0 || r >= c.rows.length || i < 0 || i >= c.rows[r].length) continue;
    const sh = SHIFT[c.rows[r][i]];
    if (sh) return s.k[Math.max(0, Math.min(6, base + sh))];
  }
  return null;
}

/** One pixel of the repeating run. */
function moonAt(u, y, s) {
  if (y < SURFACE || y > footAt(u)) return null;
  if (y === SURFACE) return s.line;
  if (y === 13) return s.top;
  if (y === 14) return s.top2;
  // The top face's lower edge hangs a row lower in short runs: a lip of dust over the rock.
  if (y === 15 && vnoise(u, 0, 10, 1, 21) > 0.62) return s.top2;
  const b = tone(u, y);
  return craterAt(u, y, b, s) || s.k[b];
}

/** The COSMOS cell in a moonstone palette s. */
export function cosmos(s = MOONSTONE) {
  // THE ENDS: broken rock, the landing line running to the last column. The left end is
  // lit near the top and the right end in shadow; both corners underneath are knocked
  // off in two steps, which the outline follows, so the slab ends as a rock does rather
  // than as a sawn plank.
  const c = assemble((u, y) => moonAt(u, y, s), (put, get, side) => {
    const L = side === 'left';
    for (let y = SURFACE + 1; y < CELL_H; y++) put(0, y, y <= 33 ? s.ink : null);
    for (let y = 35; y < CELL_H; y++) put(1, y, null);
    for (let y = 37; y < CELL_H; y++) put(2, y, null);
    for (let y = 15; y <= 34; y++) put(1, y, L ? (y <= 22 ? s.k[0] : s.k[2]) : (y <= 20 ? s.k[3] : s.k[5]));
    put(1, 13, L ? s.top : s.top2);
    put(1, 14, L ? s.top : s.k[1]);
  });
  // The rim over the landing line, and the outline round the underside and the ends.
  outline(c, s.ink);
  return c;
}

/** The painter the importer calls. */
export function paint() { return cosmos(); }
