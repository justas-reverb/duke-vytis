// SWAMP: a ledge of peat under a cushion of moss, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip was mossy khaki
// slabs with silver water between them, at the wrong resolution: 1,650 colours of blur, a
// tile that did not wrap (29 of 40 rows off, a seam every eight world units), and a
// landing line that was not its brightest row -- row 12 at luma 83, and a silver streak of
// water sixteen rows down at 109, a lit level line that read as more floor. It is redrawn
// here as the same khaki moss, cleanly, on the peat the bog is made of.
//
// What it is, top to bottom:
//   - row 11, the dark rim where the moss meets the bog behind it;
//   - row 12, the landing line: the palest, strawiest khaki in the cell, unbroken;
//   - a cushion of moss under it, built of puffs lit from the upper left, its lower row
//     hanging over the peat in scallops, and short tongues of it drooping a few rows
//     further down the peat;
//   - dark peat, fibrous, darkening to a ragged underside with thin rootlets out of it.
//
// The water is gone. Kept as small pools in the moss, each a dark pocket with a silver
// glint, it read at 4x as a row of RIVETS along a band -- a metal slab -- and the only
// water that read as water was the old strip's long lit streaks, which are exactly the
// second floor the landing line must not have. The khaki moss is what the player knows
// this ledge by, and it stays.
//
// Against what: the bog behind (src/render/bgpaint/swamp.js, measured alone: luma median
// 28, 95th percentile 65, brightest 82, hue 151) is a teal all but black, hung with green
// moss. The ledge's moss is khaki -- yellower than the backdrop's by some forty degrees,
// the split the reeds on it use (src/render/decorpaint/swamp.js) -- and brighter than
// anything in the bog from row 12 to the scallops. The peat cannot be that bright without
// reading as more floor; it is told from the bog by hue, warm brown on cool teal (the
// swamp's own split, which the side walls use too), and by its outline.
//
// The palette is the zone's own: the moss runs from the reeds' dark olive crease (#252d0e)
// up to straw; the peat is built up from the reeds' MUD, the knot each clump grows from, so
// a clump standing on the lip stands in the ledge's own peat; the outline is the reeds' OUT.

import { CELL_H, SURFACE, PERIOD, mod, hash, assemble, outline, slot, copies } from './kit.mjs';

// --- the palette ------------------------------------------------------------------------
export const MOSS = {
  k: '#0a0e05',   // outline: the reeds' OUT, darker than the darkest bog
  0: '#252d0e',   // the crease round a puff: the reeds' INNER
  1: '#3d4a1c',
  2: '#58682a',
  3: '#7a8a38',
  4: '#a2ac4e',
  5: '#cfcc7c',   // row 12, the landing line, and nothing else
};
// The peat starts from the reeds' MUD and sits a step lighter. At the MUD's own values
// (body luma 37, the upper peat 49) it was within a few steps of the bog behind (median
// 28), and in a real frame at 1x the peat sank into it: every ledge read as a thin khaki
// strip with nothing under it.
export const PEAT = {
  k: '#0c0906',   // outline
  0: '#1a150a',   // the reeds' MUD, dark: the shadow rows and the pits
  1: '#352c16',   // the deep peat
  2: '#473b1f',   // the upper peat
  3: '#5b4b28',
  4: '#6e5d36',   // a fibre's catch-light, high in the peat only
};
const MOSS_SET = new Set(Object.values(MOSS));

// --- the shape of one 31-column repeat -----------------------------------------------------

/**
 * The peat's last row, per repeat column: a ragged underside around row 32. (Around row
 * 30, under a moss cushion down to row 20, the peat was ten rows and in a real frame at 1x
 * the ledge was a khaki strip on a sliver of brown -- thinner than the slab the player
 * knew and than FOREST's earth beside it in the climb.)
 */
const PEAT_BOTTOM = [32, 32, 33, 33, 32, 32, 31, 31, 32, 33, 33, 33, 33, 32, 32, 32, 32, 32, 31, 32, 33, 33, 33, 32, 32, 31, 31, 32, 32, 33, 32];
if (PEAT_BOTTOM.length !== PERIOD) throw new Error(`SWAMP PEAT_BOTTOM: ${PEAT_BOTTOM.length} columns; one repeat is ${PERIOD}`);

// --- the moss -------------------------------------------------------------------------------
//
// Puffs, the way the decor's trees build a leaf mass: small discs in three staggered rows,
// the top row's crowns cut off flat by the landing line, the bottom row hanging over the
// peat in scallops. Each puff has ONE base tone, a lit cap on its upper left, and a crease
// along its own underside: a tone darker, and two on the hem, where it lies over the peat.
// (Two everywhere drew the creases as a dark net at 2x, a cracked paving; one lets the
// clumps overlap softly and keeps the hard line for the cushion's edge.) The bottom row is
// drawn first, so each row above lies in front of the one below and its creases show over
// it: the mat reads as clumps laid over one another. Moss is texture: a cut through a puff
// reads as more moss.
//
// Two cushions came before this one. The first, one row of big puffs creased only where
// they hung over the peat, was a flat khaki strip at 4x and at 1x. The second creased
// every puff all round wherever another lay in front of it, and the creases between
// neighbours in a row ran straight down through the mat: a row of paving slabs, which is
// what STORM's cloud turned into for the same reason (./storm.mjs). Creases on the
// undersides only, over a staggered row below, are what the decor's canopy does too.
// [repeat column, radius, centre row]. Irregular on purpose: evenly sized puffs on an even
// stagger made the creases a regular net, and the mat read as fish scales.
const ROWS = [
  // the hem, over the peat: drawn first, behind everything
  { base: 2, puffs: [[0.5, 2.2, 19.6], [5.5, 2.9, 19.2], [11, 2.1, 19.8], [15.5, 2.6, 19.3], [21, 2.9, 19.6], [26.5, 2.3, 19.1]] },
  // the middle
  { base: 3, puffs: [[3, 2.4, 16.6], [8, 2.9, 17.1], [13.5, 2.2, 16.5], [18, 2.7, 16.9], [24, 2.5, 16.4], [28.5, 2.0, 17.2]] },
  // the top, crowns cut off by the landing line
  { base: 3, puffs: [[1, 2.9, 14.3], [5.5, 2.2, 14.0], [10.5, 3.0, 14.5], [16, 2.4, 13.9], [20.5, 2.8, 14.4], [26, 2.5, 14.1]] },
];
// Rows solid moss right across, whatever the puffs do, in the middle tone. Down to row 18:
// ending at 16, it left a pixel here and there between the middle row and the hem that no
// puff covered, and the peat's shadow tone showed through it -- a dark pit in the moss.
const DECK = [SURFACE, 18];
const PUFFS = ROWS.flatMap(({ base, puffs }) =>
  copies(puffs.map(([u, r, cy]) => ({ u, r, cy })), 4).map((p) => ({ ...p, base })));

/** The moss tone (0..4) at strip column X, row y -- or -1 where there is no moss. */
function mossAt(X, y) {
  const px = X + 0.5, py = y + 0.5;
  let front = -1;
  PUFFS.forEach((p, i) => { if (Math.hypot(px - p.x, py - p.cy) <= p.r) front = i; });
  if (front < 0) return y >= DECK[0] && y <= DECK[1] ? 2 : -1;
  const p = PUFFS[front];
  const dx = (px - p.x) / p.r, dy = (py - p.cy) / p.r;
  // The crease: the puff's own lowest pixel in each column, on its lower half.
  if (dy > 0.25 && Math.hypot(px - p.x, py + 1 - p.cy) > p.r) return p.base === 2 ? 0 : p.base - 1;
  if (dx + dy < -0.55) return p.base + 1;
  return p.base;
}

/** Where the moss ends in each repeat column: its last row. */
const MOSS_END = [];
for (let u = 0; u < PERIOD; u++) {
  let y = SURFACE;
  while (mossAt(u, y + 1) >= 0) y++;
  MOSS_END.push(y);
}

// Tongues of moss drooping down the peat below the scallops: widest where they leave the
// cushion, lit only there, darkening and tapering to a point a few rows down. Discrete
// shapes -- a sliced tongue is a stub -- so each is drawn in one slot (the digits are MOSS
// tones, the first row sits just under the cushion).
//
// They were longer. The long one ran thirteen rows, lit (luma 124 over peat of 44-59) down
// a plumb column from the cushion to out past the underside, and the short one four: in a
// real frame at zoom 1 and 2 they were a row of pale POSTS every 31 px that cut the peat
// into panels, a ruler's ticks along every ledge -- the table-on-legs trap FOREST's roots
// fell into first. Six rows and three, kinked, lit only where they leave the cushion and in
// the moss's darker tones below, they droop from the moss and the peat stays one band.
const TONGUES = [
  { u: slot(8, 4, 'SWAMP moss tongue'), rows: ['3322', '322.', '.21.', '.21.', '..1.', '..1.'] },
  { u: slot(20, 4, 'SWAMP moss tongue'), rows: ['.322', '.21.', '.1..'] },
];
function tongueAt(u, y) {
  for (const t of TONGUES) {
    const i = u - t.u;
    if (i < 0 || i > 3) continue;
    const j = y - (Math.max(MOSS_END[t.u + 1], MOSS_END[t.u + 2]) + 1);
    if (j < 0 || j >= t.rows.length) continue;
    const ch = t.rows[j][i];
    if (ch !== '.') return Number(ch);
  }
  return -1;
}

// --- the peat --------------------------------------------------------------------------------
//
// Fibrous: short strokes that lean, one tone up, never a level lit streak (a level lit
// streak under the landing line is a second ledge); a few dark pits; darker the deeper it
// goes. No lit clumps: lumps lit on the upper left made it FOREST's earth again.
function fibre(u, y) {
  // A stroke two pixels long running down and to one side: its head here, or its tail
  // here with its head one up and one across.
  const head = (uu, yy, s) => hash(mod(uu, PERIOD), yy * 7 + 3) < 0.09 && (hash(mod(uu, PERIOD), yy + 90) < 0.5) === s;
  return head(u, y, true) || head(u, y, false) || head(u - 1, y - 1, true) || head(u + 1, y - 1, false);
}

// Rootlets hanging out of the underside: thin, of different lengths, each in one slot.
const ROOTLETS = [
  { u: slot(12, 4, 'SWAMP rootlet'), cols: [1, 1, 2] },
  { u: slot(24, 4, 'SWAMP rootlet'), cols: [2, 2, 1, 1] },
  { u: slot(1, 3, 'SWAMP rootlet'), cols: [1, 1] },
];
function rootletAt(u, y) {
  for (const h of ROOTLETS) {
    const i = u - h.u;
    if (i < 0 || i > 3) continue;
    const base = Math.max(PEAT_BOTTOM[mod(h.u + 1, PERIOD)], PEAT_BOTTOM[mod(h.u + 2, PERIOD)]) + 1;
    const j = y - base;
    if (j >= 0 && j < h.cols.length && h.cols[j] === i) return j === h.cols.length - 1 ? PEAT[1] : PEAT[2];
    if (j < 0 && y > PEAT_BOTTOM[u] && h.cols[0] === i) return PEAT[2];
  }
  return null;
}

/** One pixel of the repeat, by repeat column u, row y and strip column X. */
function swampAt(u, y, X) {
  if (y < SURFACE) return null;
  if (y === SURFACE) return MOSS[5];
  // The moss, through the puffs' copies either side of the repeat: by X, not u.
  const m = mossAt(X, y);
  if (m >= 0) return MOSS[m];
  const tg = tongueAt(u, y);
  if (tg >= 0) return MOSS[tg];
  const pb = PEAT_BOTTOM[u];
  if (y > pb) return rootletAt(u, y);
  // The first peat row under the moss is its shadow, and so is the last before the outline.
  if (y === MOSS_END[u] + 1 || tongueAt(u, y - 1) >= 0 || y === pb) return PEAT[0];
  const deep = y >= 26;
  if (fibre(u, y)) return PEAT[deep ? 2 : (hash(u, y + 7) < 0.3 ? 4 : 3)];
  if (hash(u, y + 40) < 0.06) return PEAT[0];
  return PEAT[deep ? 1 : 2];
}

// --- the ends -------------------------------------------------------------------------------
//
// The moss rounds over each end and the peat steps in under it, as FOREST's earth does.
const BOTTOM_AT = [SURFACE, 17, 23, 27, 29, 30];

function ends(put, get, side) {
  for (let d = 0; d < BOTTOM_AT.length; d++) {
    for (let y = BOTTOM_AT[d] + 1; y < CELL_H; y++) put(d, y, null);
  }
  for (let d = 1; d < 4; d++) {
    for (let y = SURFACE + 1; y <= BOTTOM_AT[d]; y++) {
      const c = get(d, y);
      if (!c || get(d - 1, y)) continue;
      if (MOSS_SET.has(c)) put(d, y, side === 'left' ? MOSS[4] : MOSS[1]);
      else put(d, y, side === 'left' ? PEAT[3] : PEAT[0]);
    }
  }
}

/** The SWAMP cell. */
export function swamp() {
  const c = assemble(swampAt, ends);
  outline(c, (touching) => (touching.some((t) => MOSS_SET.has(t)) ? MOSS.k : PEAT.k));
  return c;
}

/** The painter the importer calls. */
export function paint() { return swamp(); }
