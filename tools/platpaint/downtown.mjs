// DOWNTOWN: a timber gallery, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip drew grass and
// water over soil -- a meadow -- in front of a night street of house fronts and lit
// windows. No re-cut fixes a drawing of the wrong object, so the cell is painted here, at
// one art pixel per screen pixel, and --provisional writes it over the cut.
//
// What it is: a timber gallery, like the ones hung off the house fronts behind it -- a
// plank walk on top whose lamplit edge is the landing line, a beam under it, and short
// hanging posts below, so the lantern posts and fences that stand on these ledges stand on
// wood. In honey-coloured new wood, so it stands out from the violet street (GALLERIES).
//
// It lived in tools/platform-painters.mjs with STORM's cloud until each zone got a module
// of its own; it was moved onto the kit (./kit.mjs) without a pixel changing, which
// `node tools/diff-platforms.mjs --ref=0ce590a` shows.

import { CELL_W, CELL_H, hash, assemble, repeatAt, slot, stamp } from './kit.mjs';

// --- the timber ---------------------------------------------------------------------------
//
// WHY HONEY. The gallery was first painted from the decor board's lantern post and fence
// (assets/decor-reference.webp): dark, weathered, slightly grey brown, with only the
// deck's lit edge warm and bright. Against the street it sank. The facade behind it,
// sampled from a real frame at floor 760, is a deep blue-violet, median #27213d (relative
// luminance 0.019), and the weathered beam, the biggest thing in the ledge, was #553a2a:
// 1.5:1 against it, the same dark as the wall. The user asked for the ledge to be more
// visible against the background, in a different palette.
//
// Five were painted in real frames, same drawing, and measured against that facade --
// beam contrast, how far its hue sits from the wall's (253 degrees), whether it still
// reads as timber -- and rendered side by side for the user to choose between.
//
//   silver   pale grey weathered oak, a warm lamplit top edge. Beam 3.6:1, but grey on
//            violet read as a stone slab, not wood.
//   oxblood  painted ox-blood red, a pale rail. Strong hue, but a beam of 1.8:1 in value,
//            and as bright red as a warning stripe.
//   ochre    painted yellow ochre, a pale rail. Beam 3.9:1, the wall's complement in hue,
//            but it read as a painted yellow plank, flat and new.
//   honey    honey-coloured new wood. Beam 3.7:1 (the whole beam above the facade's 95th
//            percentile), 138 degrees of hue from the wall, and it reads as timber: grain,
//            board ends, pegs. The landing line stays the brightest row by far (0.88
//            against the boards' 0.47).                                       CHOSEN
//   lamplit  a darker golden-brown oak. Beam 2.4:1: better than before, still dim.
//
// The honey beam is about as bright as a lit window pane (#8578a3, 1.02:1) and is told from
// the windows by hue alone: warm, horizontal wood on a cool, gridded wall. The posts and
// the beam's lighter grain are the beam's own ramp (beamHi..beamDeep), not the deck's face
// colours, so a painted palette's pale rail cannot streak the beam or turn the posts into
// ivory pegs, which the first round of candidates did.
//
// DOWNTOWN_TIMBER picks one; the others are kept so the choice can be changed with one word
// and a re-cut. Any of them now costs nothing anywhere else: the zone has a palette of its
// own (see the importer), so its colours are not rationed.
const IRON = { iron: '#585654', ironHi: '#675f5b', ironLo: '#3f3a39' };
export const GALLERIES = {
  silver: {
    lit: '#f3d6a0', edge: '#c9c1b3', face: '#a69e92', faceLo: '#8f877d', gap: '#2e2630',
    beamTop: '#4a4148', beamHi: '#9c948a', beam: '#857d75', beamLo: '#6e6763', beamDeep: '#5a5454',
    line: '#1c1520', ...IRON,
  },
  oxblood: {
    lit: '#f6dfae', edge: '#e0cfa6', face: '#c7b48c', faceLo: '#ad9a74', gap: '#2a1216',
    beamTop: '#3c1418', beamHi: '#a8402e', beam: '#8e3024', beamLo: '#76281f', beamDeep: '#60201b',
    line: '#1c0a0e', ...IRON,
  },
  ochre: {
    lit: '#fbe8b4', edge: '#ead7a6', face: '#d0bb8c', faceLo: '#b8a276', gap: '#2b1d14',
    beamTop: '#43291a', beamHi: '#c89238', beam: '#b07c2c', beamLo: '#946424', beamDeep: '#7a501e',
    line: '#1f140e', ...IRON,
  },
  honey: {
    // edge, gap and line are colours of the old shared platform palette within 13 of the
    // honey ramp. They were taken from there when the whole sheet shared eighty keys and a
    // zone's own colours had only eleven more between all of them; they stay, so the
    // gallery is the one it was, pixel for pixel. The iron is the old palette's too.
    lit: '#fff0c4', edge: '#e9bc7e', face: '#d09a58', faceLo: '#b8844a', gap: '#331c12',
    beamTop: '#5a3218', beamHi: '#c88a44', beam: '#b07436', beamLo: '#94602e', beamDeep: '#7a4c26',
    line: '#231612', ...IRON,
  },
  lamplit: {
    lit: '#f8dca0', edge: '#c8925a', face: '#a8764a', faceLo: '#946640', gap: '#2c1a14',
    beamTop: '#40241a', beamHi: '#9a6a40', beam: '#855834', beamLo: '#6e482c', beamDeep: '#5a3a26',
    line: '#1e120e', ...IRON,
  },
};
export const DOWNTOWN_TIMBER = 'honey';
const WOOD = GALLERIES[DOWNTOWN_TIMBER];

// Rows, from the standing surface down. Together they fill the body to row 36. A first
// version stopped at row 31 with a seven-row beam: against the street's dark walls the
// whole ledge read as a thin shelf. The dark smear the renderer used to lay under every
// ledge at the physics thickness (row 40) hung below even this one as a separate bar
// between the posts; the renderer casts no shadow under this ledge now (LEDGE_SHADOW in
// renderer.js), and the beam's outlined underside is its contact edge.
const V = {
  deck: 12,             // lit edge
  boards: [13, 15],     // the board ends
  shadow: 16,
  beam: [17, 26],       // ten rows of beam
  under: 27,            // the beam's underside, outlined
  post: 28,             // a hanging post's first row: SHORT, see post()
};
// Where the board joints fall in one 31-pixel repeat: boards of 8, 7, 8 and 8.
const JOINTS = new Set([7, 14, 22, 30]);

// One hanging post per repeat, in tile columns 12-15: FOUR wide, starting on a multiple
// of four, and that placement is the rule, not a taste.
//
// The renderer ends a run with a part tile cut from the tile's LEFT, then the right cap
// (drawPlatforms). Ledge widths are whole world units and PX is 4, so that part tile is
// 4, 8, ... or 28 art pixels when there is one -- a cut can fall on any fourth column.
// Anything in the tile wider than four columns, or four columns not starting on a
// multiple of four, has a width at which the cut goes through it. The first post was
// eight wide with its collar, at 12-19, and on every ledge whose width is four world
// units over a multiple of eight -- measured, 12.5% of DOWNTOWN ledges -- the cut at 16
// left its left half standing a few pixels from the end post, a sliver of a post. At
// 12-15 every cut takes the whole post or none of it. The iron bolt (25-26) and the
// board joints are narrow enough already. slot() holds both to it.
const POST_U = slot(12, 4, 'DOWNTOWN hanging post');
const BOLT_U = slot(25, 2, 'DOWNTOWN beam bolt');

// The post, top row first, four columns: its lit side, face, shaded face, shaded side.
// A short shaft, a dark groove and a lit ring for the turning, and a pendant narrowing
// to a point. It keeps inside its four columns: a collar one pixel proud each side,
// which the first version had, makes it six wide, and six wide is cut exactly as above.
// Four art pixels is one world unit, the width of the lantern posts and fences that
// stand on the deck, so the gallery and its furniture are built of the same timber.
const POST = [
  'efgb',
  'efgb',
  'efgb',
  'efgb',
  'LLLL',               // the groove
  'eefb',               // the ring, lit from the upper left like everything else
  'fbbL',
  'LfbL',               // the pendant
  '.LL.',               // ...and its point, on row 36
];
const postInk = (w) => ({ e: w.beamHi, f: w.beam, g: w.beamLo, b: w.beamDeep, L: w.line });

/**
 * A hanging post under the beam, at left column x0.
 *
 * Short on purpose. The first version ran a corner post from the deck down at each end,
 * and the gallery read at once as a TABLE -- legs at the ends, one in the middle. A
 * gallery hung off a house front stops in mid-air; what shows under its beam is the
 * carved ends of its posts, and that is all this draws.
 */
function post(c, x0, w) {
  stamp(c, x0, V.post, POST, postInk(w));
}

/** Which run of grain column u falls in on row y: runs of 3-9 pixels, per row. */
function grainRun(u, y) {
  let x = -Math.floor(hash(y, 7) * 6), run = 0;
  while (x <= u) { x += 3 + Math.floor(hash(y, run + 11) * 7); run++; }
  return run;
}

/** One pixel of the gallery's repeating run, by repeat column u (0..30, kit.stripU) and row. */
function galleryAt(u, y, w) {
  if (y === V.deck) return w.lit;
  if (y >= V.boards[0] && y <= V.boards[1]) {
    if (JOINTS.has(u)) return w.gap;
    if (y === V.boards[0]) return w.edge;
    return hash(u, y * 31) < 0.22 ? w.faceLo : w.face;
  }
  if (y === V.shadow) return w.gap;
  if (y === V.beam[0]) return w.beamTop;
  if (y > V.beam[0] && y <= V.beam[1]) {
    // An iron bolt through the beam, one per repeat, square-headed, a little above the
    // middle where the grain is lightest.
    const bu = BOLT_U, by = 20;
    if ((y === by || y === by + 1) && (u === bu || u === bu + 1)) {
      if (y === by) return u === bu ? w.ironHi : w.iron;
      return u === bu ? w.iron : w.ironLo;
    }
    // Grain: streaks along the beam, lighter in its upper rows and darker in its lower
    // ones, so the face reads as one timber lit from above and not as a flat band. Each
    // row is cut into runs of 3 to 9 pixels with their own breaks; a first version keyed
    // every row off one shared offset, and the streaks lined up into a diagonal hatch
    // that repeated, plainly, every tile.
    const h = hash(grainRun(u, y), y);
    const k = (y - V.beam[0]) / (V.beam[1] - V.beam[0]);   // 0 at its top, 1 at its foot
    if (k < 0.45 && h < 0.3) return w.beamHi;
    if (k > 0.55 && h < 0.38) return k > 0.8 && h < 0.18 ? w.beamDeep : w.beamLo;
    return w.beam;
  }
  if (y === V.under) return w.line;
  return null;
}

/** The DOWNTOWN cell in a gallery palette w (one of GALLERIES; the chosen one by default). */
export function downtown(w = WOOD) {
  // THE ENDS: the deck and beam stop square, outlined. The deck's lit edge runs to the
  // very end column, so the landing line is as long as the ledge is.
  const c = assemble((u, y) => galleryAt(u, y, w), (put) => {
    for (let y = 0; y < CELL_H; y++) put(0, y, null);
    put(0, V.deck, w.lit);
    for (let y = V.deck + 1; y < V.under; y++) put(0, y, w.line);
  });
  // The hanging posts of the run, wherever the repeat puts them -- except where one would
  // crowd an end post, which hangs in each cap instead. In this cell that leaves the
  // tile's own post; the right cap's repeat post (at 59) gives way to the end post.
  const END_POST = 2;                         // columns in from each end
  const clear = 8;                            // no run post this close to an end post
  for (const x of repeatAt(POST_U, 4, { margin: END_POST + 4 + clear })) post(c, x, w);
  // The end posts sit whole inside their caps, which are never cut on a ledge in play
  // (a cap is only trimmed on a ledge under 8 world units; the narrowest is 24).
  post(c, END_POST, w);
  post(c, CELL_W - END_POST - 4, w);
  return c;
}

/** The painter the importer calls: the gallery in the chosen timber. */
export function paint() { return downtown(); }
