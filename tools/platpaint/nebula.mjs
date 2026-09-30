// NEBULA: a ledge of cut amethyst, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY IT WAS REDRAWN. The first painted ledge here was a row of glossy TEAL crystal blocks
// on a backdrop of magenta and violet gas (src/render/bgpaint/nebula.js): teal against
// magenta is a complementary pair, and at zoom 1 every ledge on the screen was a cyan bar
// laid over pink clouds -- the user found the zone ugly, the ledge and the backdrop badly
// mismatched. And the blocks, each a flat front face with a lit edge, a
// ridge and a glint, read as glass blocks or keycaps, not as crystal.
//
// WHAT IT IS NOW. The zone's own crystal: amethyst, the colour of its decor's shards
// (decorpaint/nebula.js), its lettering (titlepaint/nebula.js) and its walls -- a slab of
// it with a flat polished top and a front of big flat facets, each one plane of the stone
// turned toward the light or away from it, ending below in a jagged run of points.
//
//   - The TOP is the palest thing on the ledge: a pink-white landing line on row 12 over two
//     rows of pale lilac, one unbroken top face, with the outline's ink over it (row 11).
//   - The FACETS under it are a tiling of triangles and quads (FACETS): the upper band
//     turned to the light in lilac, lavender, violet and amethyst, the lower band turned
//     away in purple and indigo, so the body darkens downward facet by facet and no row
//     below the top is lit and level. Neighbouring facets are two or three tones apart,
//     which is what reads as a cut stone rather than a gradient.
//   - The UNDERSIDE is the facets' own lower edge: two points to a repeat, one a row deeper
//     than the other, with the stone rising between them to different heights -- a crystal
//     broken off, not a sawn plank.
//   - ONE PLUM FACET in the lower band holds the gas's magenta, at the purple facets' value:
//     the colour zoning amethyst has, as the decor's shards go magenta at the foot.
//   - NO GLINT. The first cut of this ledge ran a four-pixel magenta stroke (#d257d2) down
//     one facet edge into the plum facet, at the lavender's value so it would not bead. At
//     zoom 1 it was invisible; at zoom 2, and in a 3x crop of a zoom-1 frame, it was a row of
//     pink SLASHES, one every 31 px along every ledge -- the only saturated pixel in the
//     stone, and a lone hue lines up at any value (the COSMOS warm star did the same). The
//     facet edges are what say "cut", so the stone keeps its magenta in the plum facet only.
//   - The ENDS: the left one a lit end facet, the right one a shaded one, each two columns,
//     and both feet cut away at 45 degrees.
//
// AGAINST THE GAS. Measured in a real frame at floor 1550 with the same frame drawn with
// the ledges stubbed out as the backdrop behind them (median luma 20, p95 64): the top
// stands 14.8:1 (WCAG, medians) against the gas behind it; the body -- every facet --
// 2.25:1, CIELAB dE 43, 64% of its pixels brighter than the gas's p95. The separation is
// VALUE -- a pale top over a mid-to-dark body in the outline's near-black -- not hue: the
// body's mean hue is 260 degrees against the gas's 270 behind it, where the teal was 188.
//
// THREE WAYS IT WAS TRIED, in real frames at floor 1550 (review sheets in the scratchpad):
//   - The old blocks recoloured amethyst: they belong now, and they are still keycaps.
//   - A dark slab with a bed of crystals standing in it, points up under the top face:
//     crystal at 3x, but a DISPLAY CASE of crystals under a lid, and at zoom 1 a pale line
//     over a dark strip with specks -- the body stood 1.5:1 and sank.
//   - These facets, in three palettes: amethyst (chosen), a darker indigo (the body 1.7:1,
//     it sank into the dark gas) and a rose one pinker toward the gas (it merged with the
//     magenta clouds, the thing this redraw was for).
//
// WHAT READ AS SOMETHING ELSE on the way, so it is not tried again:
//   - Facets as full-height vertical strips, lit and dark in turn: a pleated CURTAIN.
//   - Narrow crystals standing side by side, each ending below in a small point: a fringe
//     of ICICLES, a comb -- and spikes a player jumps up through.
//   - Big crystals cut off flat by the top face: a row of BARS; crystals read by their
//     points.
//   - A prism lying along the ledge in horizontal bands with short pointed ends at the
//     joints: a row of glossy PILLS, cushions.
//   - Facets of one even size in a regular zigzag: a row of MOUNTAIN peaks, argyle.
//
// THE SLOTS (./index.mjs rule 4). The facets are texture: a part tile can end in any of
// them, and the right cap then resumes the strip at u 1, which is only one more facet edge
// in a surface made of facet edges (look at node tools/shot-platwidths.mjs --zones=NEBULA
// --scale=4: the cuts are under the red ticks). Nothing on it is discrete, so nothing
// needs a slot.

import { CELL_H, SURFACE, PERIOD, assemble, outline } from './kit.mjs';

export const AMETHYST = {
  line: '#fff4fd',      // row 12, the landing line: pink-white, the palest colour here
  hi: '#f4dcfa',        // the top face
  pale: '#dcbef4',      // the top face's front edge
  f1: '#c4a0ec',        // facets turned to the light: lilac ..
  f2: '#a47ee0',        //   lavender
  f3: '#8862cc',        //   violet
  f4: '#6c4ab4',        //   amethyst
  l1: '#54399a',        // facets turned away: purple ..
  l2: '#402d80',        //   indigo
  l3: '#302366',        //   deep indigo
  rose: '#6a3296',      // one facet turned away that holds the gas's magenta
  ink: '#0b0618',       // the outline, darker than the darkest gas (#10061c)
};
const C = AMETHYST;

// The facets of one repeat, as polygons in strip columns and rows (pixel edges): T along
// the top face's lower edge, M the broken line between the band turned to the light and
// the band turned away, B the underside. One repeat is 31 wide and each facet is drawn
// again 31 to either side, so the ones across the repeat's edge wrap.
const T = [[1, 15], [9, 15], [16, 15], [23, 15], [28, 15], [32, 15]];
const M = [[1, 22], [5, 23], [12, 21], [19, 24], [25, 21], [32, 22]];
const B = [[1, 29], [4, 30], [8, 34], [14, 30], [20, 35], [26, 31], [32, 29]];
const FACETS = [
  [[T[0], T[1], M[1], M[0]], 'f2'],
  [[T[1], T[2], M[2]], 'f1'],
  [[T[1], M[2], M[1]], 'f3'],
  [[T[2], T[3], M[3], M[2]], 'f4'],
  [[T[3], T[4], M[4]], 'f2'],
  [[T[3], M[4], M[3]], 'f3'],
  [[T[4], T[5], M[5], M[4]], 'f4'],
  [[M[0], M[1], B[2], B[1], B[0]], 'l1'],
  [[M[1], M[2], B[3], B[2]], 'l2'],
  [[M[2], M[3], B[4], B[3]], 'l3'],
  [[M[3], M[4], B[5], B[4]], 'rose'],
  [[M[4], M[5], B[6], B[5]], 'l3'],
];

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function facetAt(u, y) {
  for (const k of [0, 1, -1]) {
    const x = u + 0.5 + k * PERIOD;
    for (const [poly, tone] of FACETS) if (inside(poly, x, y + 0.5)) return tone;
  }
  return null;
}

function amethystAt(u, y) {
  if (y < SURFACE) return null;
  if (y === SURFACE) return C.line;
  if (y === 13) return C.hi;
  if (y === 14) return C.pale;
  const f = facetAt(u, y);
  return f ? C[f] : null;
}

/** The NEBULA cell. */
export function nebula() {
  const c = assemble(amethystAt, (put, get, side) => {
    // The end column is the outline's; the landing line runs to the very end over it.
    for (let y = 0; y < CELL_H; y++) put(0, y, y === SURFACE ? C.line : null);
    // The end facet: two columns turned to the light at the left end, away from it at the
    // right -- over whatever facet the strip puts there -- then the foot cut at 45 degrees.
    const up = side === 'left' ? ['f1', 'f2'] : ['f4', 'f3'];
    const low = side === 'left' ? ['l1', 'l1'] : ['l3', 'l2'];
    for (let d = 1; d <= 2; d++) {
      for (let y = 15; y < CELL_H; y++) if (get(d, y)) put(d, y, C[y <= 22 ? up[d - 1] : low[d - 1]]);
    }
    for (let d = 1; d <= 6; d++) for (let y = 26 + d; y < CELL_H; y++) put(d, y, null);
  });
  // The outline: every empty pixel touching the stone takes the ink, which puts the rim
  // over row 12 all the way across and closes the points underneath.
  outline(c, C.ink);
  return c;
}

/** The painter the importer calls. */
export function paint() { return nebula(); }
