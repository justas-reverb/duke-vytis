// DUNGEON: a slab of crypt stone, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip was violet crypt
// stone with pale drips under it -- the right object -- but resampled from another scale:
// a mottle of hundreds of colours with no clusters in it, a top that did not wrap (a seam
// every eight world units up the zone), an underside that frayed into loose dark blocks
// and 1-px pale lines, and at zoom 1 the whole ledge was a thin grey-violet strip that the
// slate backdrop behind it all but swallowed. So it is redrawn here, the same ledge,
// cleanly: the same violet stone and the same drips, made heavier and made to read.
//
// What it is: a tomb's lid on its chest -- the decor here (src/render/decorpaint/
// dungeon.js) says these ledges are tombs -- a slab whose lit, chamfered edge is the
// landing line, its face in shadow under the lid, laid in long blocks, and under it the
// thing the crypt's old ledge was known by: lime drips, water that has come down through a
// joint and hangs under it as a pale thread with a drop falling from it. The stone ends 20 px
// under the surface, four deeper than the old one's frayed edge -- the weight asked for --
// and the manacled wrist hangs from there, as it hung from the old edge: decor.js
// undersideFor measures the drawn underside. test-decor needs that underside to end above
// the physics thickness (28), so it does.
//
// The backdrop (src/render/bgpaint/dungeon.js) is slate-blue ashlar, luma about 35. The
// side walls (src/render/wallpaint/dungeon.js) sit between it and this stone, darker than
// both. So the ledge is the violet one step further toward the light: its body two to
// three times the backdrop's value, its lit edge pale lilac, its shadows leaning to the
// backdrop's blue so the two still share a crypt. The bone and stone decor standing on
// it was measured against a lip of luma 120; this one is brighter, which only widens the
// gap those notes asked for.

import { CELL_W, CELL_H, SURFACE, PERIOD, hash, assemble, outline, slot, stamp, repeatAt } from './kit.mjs';

// --- the palette ------------------------------------------------------------------------
//
// Luma in the comments, Rec. 601, as the tools measure it.
export const CRYPT = {
  ink: '#110c19',      //  15  the outline where the stone meets the backdrop
  s0: '#231c30',       //  32  joints, cracks, the groove under the lid
  s1: '#342a45',       //  48  deep shadow, the underside
  s2: '#463a5c',       //  65  shadow
  s3: '#584c70',       //  84  body
  s4: '#6b5f84',       // 103  light
  s5: '#83789b',       // 127  lit
  s6: '#a296b6',       // 157  the chamfer
  top: '#cdc3d8',      // 200  row 12: the landing line
  // Lime: the drips, the stone's own lilac gone pale, with a drop of water falling from
  // each. A first cut in cool blue-grey read as ICICLES under a stone ledge. None is as
  // bright as the landing line, by a clear margin: the drop is the palest, and at 196 it
  // was the "brightest row below" the importer prints, four under row 12.
  l1: '#9d98ac',       // 156  a drip's thread
  l2: '#aeaabd',       // 173  its lit part
  l3: '#b8bac8',       // 187  the drop, a touch of water blue
};
const RAMP = [CRYPT.s0, CRYPT.s1, CRYPT.s2, CRYPT.s3, CRYPT.s4, CRYPT.s5, CRYPT.s6];
const tone = (i) => RAMP[Math.max(0, Math.min(RAMP.length - 1, i))];

// --- the rows ---------------------------------------------------------------------------
//
// The lid: the landing line, the chamfer under it, two rows of the lid's front face lit
// from above. The groove: the lid's shadow on the chest, dark all along -- the one level
// line below the surface, and it is the darkest thing in the ledge, so it can only ever
// read as a gap, never as more floor. The chest: fourteen rows of block face darkening
// downward -- blocks 31 long by 14, the backdrop's ashlar proportion -- and its last row the
// underside, outlined, from which the drips and the manacle hang.
const R = {
  top: 12,
  chamfer: 13,
  lid: [14, 15],
  groove: 16,
  face: [17, 30],
  under: 31,           // the stone's last row: the underside is 20 rows from the surface
};

// One block joint per repeat -- ashlar blocks 31 long, the backdrop's proportion -- and a
// crack in the middle of each block. Each is an object that must not be cut, so each sits
// in one 4-px slot (./index.mjs, rule 4): the joint's three columns (shadowed edge, joint,
// lit edge) at 24-26, the crack's two at 9-10. Water comes down the joint and hangs under
// it as a drip, in the same slot.
//
// ONE drip per repeat, as the old ledge had one per tile. A second under the crack, every
// fifteen pixels, turned each ledge at zoom 1 into a ruler with its ticks along the bottom.
const JOINT = slot(24, 3, 'DUNGEON block joint') + 1;      // the joint itself: u 25
const CRACK = slot(9, 2, 'DUNGEON crack');                  // u 9-10
slot(JOINT - 1, 3, 'DUNGEON joint drip');

// The crack: which of its two columns it is in on each row of the face, top down. A hair
// crack from the groove under the lid, in the face's shadow tone rather than the joints'
// near-black: the same crack in every block, drawn as dark as a joint and nine rows long,
// was a glyph -- an S stamped every 31 pixels along the ledge.
const CRACK_PATH = { 18: 1, 19: 1, 20: 0, 21: 0, 22: 1 };

// Near either end the joint is left out: a block three to seven columns long against the
// end of the ledge read as a loose stone. The end block runs on to the next joint. (The
// joint at repeat column 25 falls ten columns in from every ledge's left end; at a
// clearance of six it stayed, and every ledge began with a seven-column stone.)
const END_CLEAR = 12;
const LEFT_END = -16, RIGHT_END = CELL_W - 16 - 1;
const nearEnd = (X) => X - LEFT_END < END_CLEAR || RIGHT_END - X < END_CLEAR;
const jointAt = (X) => (((X % PERIOD) + PERIOD) % PERIOD) === JOINT && !nearEnd(X);

// Wear on the face: shallow two-pixel pits, each inside one slot so no cut halves one,
// never one straight under another -- two stacked made a dark square, a window in the stone
// -- and never on the joint or beside the crack, where either drew over half a pit and left
// a one-pixel speck.
function pitSlot(s, y) {
  if (y < R.face[0] + 1 || y > R.face[1] - 1) return -1;
  if (hash(s * 5 + 3, y * 17) > 0.16) return -1;
  const x0 = s * 4 + 1 + Math.floor(hash(s + 9, y) * 2);
  if (x0 + 1 > PERIOD - 1) return -1;
  if (x0 + 2 >= JOINT - 1 && x0 - 1 <= JOINT + 1) return -1;
  if (x0 + 2 >= CRACK && x0 - 1 <= CRACK + 1) return -1;
  return x0;
}
function pitAt(u, y) {
  const s = Math.floor(u / 4), x0 = pitSlot(s, y);
  return x0 >= 0 && pitSlot(s, y - 1) < 0 && (u === x0 || u === x0 + 1);
}

/** One pixel of the slab's strip, by repeat column u (0..30), row y and strip column X. */
function slabAt(u, y, X) {
  if (y < R.top || y > R.under) return null;
  if (y === R.top) return CRYPT.top;
  if (y === R.chamfer) return CRYPT.s6;
  if (y >= R.lid[0] && y <= R.lid[1]) {
    // The lid's face: lit, with a sparse wash of the next tone down so it reads as stone
    // and not as a painted rail -- in pairs of pixels, since one at a time the wash was a
    // scatter of lone specks. Texture, keyed on u, crossing cuts harmlessly -- except the
    // pair at u 0-1: after a part tile the right cap starts at u 1 without its u 0, and on
    // five ledge widths in eight that pair was a lone speck on the lid, so it is left plain.
    const pair = Math.floor(u / 2);
    const wash = pair !== 0 && (y === R.lid[0] ? hash(pair, 71) < 0.22 : hash(pair, 73) < 0.35);
    return wash ? CRYPT.s4 : CRYPT.s5;
  }
  if (y === R.groove) return CRYPT.s0;
  if (y === R.under) return CRYPT.ink;
  // The chest's face, rows 17-30: in the lid's shadow at the top, lightest a little below
  // it, darkening to the underside.
  //
  // Where the face steps from its light tone to its shadow is not one row: ruled straight
  // across the ledge, the step was a level line through the chest, a second course. It
  // falls on row 22, 23 or 24 by pairs of columns, and the foot's on 28 or 29, keyed on u
  // -- texture, so a cut through it cannot show.
  const k = y - R.face[0];
  const pair = Math.floor(u / 2);
  const step = R.face[0] + 5 + Math.floor(hash(pair, 91) * 3);        // rows 22..24
  const foot = R.face[1] - 2 + (hash(pair, 97) < 0.4 ? 1 : 0);       // row 28 or 29
  let t = k === 0 ? 2 : y < step ? 3 : y < foot ? 2 : 1;
  if (jointAt(X)) return CRYPT.s0;
  if (jointAt(X + 1)) t -= 1;                      // the block to the left's shaded end
  else if (jointAt(X - 1) && k > 0) t += 1;        // the next block's lit end
  // (A row the crack is not on has no entry; `?? -9` here once put it on u 0, a stray
  // joint at every tile's first column.)
  if (y in CRACK_PATH && u === CRACK + CRACK_PATH[y]) return CRYPT.s1;
  if (pitAt(u, y)) t -= 1;
  return tone(t);
}

// The drip, top row first, three columns about the joint: a crust of lime in the stone's
// underside row, a thread of water one pixel wide -- shaded on its right where it leaves
// the stone, so its root reads as a small stalactite -- and a drop falling from it a row
// below its end, the palest pixel, which is what says DRIP rather than icicle. It is as
// long as the old ledge's drips were, and it had to be: a three-pixel thread and a drop
// read at the Duke's scale as a dotted line along the underside, the drips less of a
// feature than before. Every shape with more width read as something else at zoom 1: two
// wide stepping to one, with the drop off its side, was a J (a row of coat hooks); three
// wide under the underside and one below was an upturned T, a nail. No outline round it:
// a one-pixel thread outlined is a dark bar, and its value alone carries it (156-187
// against a backdrop of 35).
//
// Dripstone CONES were tried too, to give the drip more mass: a lime taper three wide at
// its root in the underside row, then two, then one, a drop under it, with and without a
// shorter one beside it. One alone reads as dripstone; at zoom 1-2, one every 31 px under
// every ledge, they were a row of pale SPIKES -- in a platformer a hazard, the one thing
// an ornament under a ledge the player jumps up through must never say -- and the pairs
// were claws. A thread cannot be read as a point: keep the drips thin.
const DRIP = [
  'l1l',
  '.1k',
  '.1k',
  '.1.',
  '.1.',
  '.2.',
  '...',
  '.3.',
  '.2.',
];
const dripInk = { 1: CRYPT.l1, 2: CRYPT.l2, 3: CRYPT.l3, l: CRYPT.s2, k: CRYPT.s1 };

/** The DUNGEON cell. */
export function dungeon() {
  const c = assemble(slabAt, (put, get, side) => {
    // THE ENDS. The lid runs to the very end, so the landing line is as long as the ledge;
    // the chest under it stops two columns short, the lid overhanging it -- a tomb's lid,
    // and an end that is not just the tile cut off. Each end outlined; the chest's end
    // face lit on the left, shaded on the right, as light from the upper left finds it.
    for (let y = R.chamfer; y <= R.groove; y++) put(0, y, CRYPT.ink);
    for (let y = R.groove + 1; y <= R.under; y++) {
      put(0, y, null);
      put(1, y, null);
      put(2, y, CRYPT.ink);
      if (y < R.under) put(3, y, side === 'left' ? CRYPT.s4 : CRYPT.s1);
    }
    put(1, R.groove, CRYPT.ink);                   // the lid's underside, where it overhangs
    put(0, R.groove, null);                        // its bottom corner worn off
  });
  // The drips hang from the underside row under the joint, one per repeat, stamped at
  // every whole repeat of the cell -- and only where the joint is drawn: the margin keeps
  // off the ends, where END_CLEAR leaves the joint out.
  for (const x of repeatAt(JOINT - 1, 3, { margin: END_CLEAR - 1 })) stamp(c, x, R.under, DRIP, dripInk);
  // The rim over the landing line, where the slab meets the backdrop above it.
  outline(c, CRYPT.ink, { where: (x, y) => y === SURFACE - 1 });
  return c;
}

/** The painter the importer calls. */
export function paint() { return dungeon(); }
