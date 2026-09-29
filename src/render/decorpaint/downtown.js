// DOWNTOWN: a lantern on a post, and on wider ledges a short rail at the other end -- the
// street lit at night, matching the lit windows of the backdrop behind.
//
// BUILT FROM THE GALLERY'S OWN TIMBER. The ledge here is a timber gallery (painted in
// tools/platpaint/downtown.mjs), and the post and the fence take its wood. The gallery was
// repainted in honey-coloured new wood (GALLERIES.honey there) because the weathered brown
// it had sank into the violet street, its beam about 1.5:1 against the facade; the post
// and the fence moved with it, so post, fence and ledge are still one timber. The fence is
// the gallery's own mid tones; the lantern post is the same wood weathered darker, as the
// board draws it, and lit on its right side by its own lantern.
//
// AGAINST THE STREET. The backdrop is a deep blue-violet wall (median #27213d in a real
// frame) with lavender windows. Honey on violet separates by hue as well as value -- they
// are nearly complementary -- and a one-pixel dark outline round everything carries the
// shape where the dark weathered faces of the post come close to the wall's value.
//
// NO SHADOW INTO THE LIP. decor.js can cut a shadow into the lit row under a standing
// thing, for bone on pale stone, where the two otherwise merge. Here the post, its plinth
// and the fence are darker than the deck's lit edge they stand on, and a shadow would only
// put gaps in the landing line.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { fit } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.32;

// The gallery's timber (tools/platpaint/downtown.mjs, GALLERIES.honey), same hexes, from the
// board ends' cut grain down to the beam's shadowed top; its outline; and iron, stone and
// ink. Named for what they are in the gallery, so a change there can be followed here.
const C = {
  cut: '#e9bc7e',       // the board ends: cut end grain, a sawn top
  face: '#d09a58',      // the deck boards' face: a lit face
  faceLo: '#b8844a',    // grain in it
  beamHi: '#c88a44',    // the beam's light grain: a post's lit edge
  beam: '#b07436',      // the beam
  beamLo: '#94602e',
  beamDeep: '#7a4c26',
  beamTop: '#5a3218',   // the beam's top in the deck's shadow: the darkest wood face
  gap: '#331c12',       // between boards: seams and cracks
  line: '#231612',      // the gallery's outline
  ink: '#170e14',       // the outline round the whole thing, against the street
  ironHi: '#8a8079', iron: '#585654', ironLo: '#3f3a39', rivet: '#b3aaa2',
  stoneHi: '#78737e', stone: '#5a5662', stoneLo: '#423e4a',
};

// --- the lantern post ---------------------------------------------------------------
//
// Redrawn from the fixes board (assets/decor-fixes-reference.webp, VILLAGE - LANTERN
// POST: the board has the zone's old name), which says what the first drawing lacked: the
// light. That one glowed in rings of 0.06 to 0.14 alpha, pale yellow, which over the
// violet wall came out a grey smudge no wider than the lantern, and its round-capped
// four-pixel post with a single arm was a signpost more than a street lamp. From the
// board, and nothing imported from it:
//
//   - a SQUARE post, dark weathered wood with vertical grain, four iron bands each with
//     a rivet, standing in a small plinth: two wooden chocks either side of its foot, two
//     slabs and a dark stone under them, and a course of three grey stones on the deck;
//   - from the top band an iron ARM out to the right, a square bracket with a rivet at
//     its end, a two-pixel brace under it, and from the bracket a RING, a short stem and
//     the lantern: a knob, a peaked roof, a dark brim, glass behind a frame of bars, a
//     base plate and a drop;
//   - a REAL HALO round the flame: three rings stepping down in strength, their edges
//     dithered into each other on a checker, deep saturated orange so that thinned over
//     violet it is still warm (a pale yellow at low alpha is grey there); and the light
//     landing on what faces it -- the post's right side, the ring, the arm's underside,
//     the bands' ends and, in the bright frame, the chock at the foot -- as a warm tint,
//     reaching further than the halo in the air does, because a lit surface shows light
//     the air cannot. Nothing of it reaches the box's bottom 16 rows, so it never lies
//     on the ledge's top row, the line the player tracks;
//   - two frames: the flame burning low (a short flame, orange glass, a tighter and dimmer
//     halo) and bright (a tall pale flame, yellow glass, the rings wider and stronger).
//
// THE BOX GREW, 28 x 44 -> 40 x 56. The board's halo is nearly as wide as the post is far
// from the lantern, and in 28 the first drawing's glow had to stop eight pixels right of
// its lantern or be cut flat by the box edge; at 40 the bright frame's rings reach 13
// pixels round the flame and stop a column short of the box's edge. The height is the
// plinth and the four bands the board gives the post, at a post six pixels wide.

// Where things are, in box pixels, y down. The flame is the centre of every light.
const BOX_W = 40, BOX_H = 56;
const POST_X = 5, POST_W = 6;          // the post: columns 5-10
const POST_TOP = 2;
const BANDS = [6, 18, 31, 41];         // each band's first row; three rows each
const LX = 21;                         // the lantern's left column: it is 10 wide, 21-30
const FX = 25.5, FY = 26.5;            // the flame's centre

// One column of post, lit from the upper left: lit edge, face, face, grain, shade, side.
// The gallery's SHADOW tones: the board's post is dark, weathered wood, and in the deck's
// own face and beam colours (a first try) it read as a honey-coloured stick, the same
// brightness as the deck and nothing like the board.
const POST_COLS = ['beamLo', 'beamDeep', 'beamDeep', 'beamDeep', 'beamTop', 'beamTop'];

/**
 * The post, x0..x0+5 from row y0 to y1: dark weathered wood with vertical grain -- cracks
 * a tone darker and the odd lit fleck, keyed to fixed rows so the drawing is the same
 * every time it is built.
 */
function post(p, x0, y0, y1) {
  for (let y = y0; y <= y1; y++) POST_COLS.forEach((k, i) => p.set(x0 + i, y, C[k]));
  // Cracks: [column, first row, length]. Staggered so no two line up into a stripe.
  const cracks = [[1, 5, 6], [3, 9, 5], [2, 15, 7], [4, 23, 6], [1, 28, 5], [3, 33, 7], [2, 38, 4], [4, 12, 4]];
  for (const [c, s, n] of cracks) {
    for (let y = y0 + s; y < Math.min(y1, y0 + s + n); y++) p.set(x0 + c, y, c < 3 ? C.beamTop : C.gap);
  }
  // Flecks of lit grain on the face, beside a crack's top: where the wood has split, its
  // edge catches the light.
  for (const [c, s] of [[2, 5], [1, 16], [2, 29], [1, 36]]) p.set(x0 + c, y0 + s, C.beamLo);
  // The sawn top, seen a little from above: end grain, lit.
  p.set(x0, y0, C.cut);
  for (let i = 1; i < POST_W - 1; i++) p.set(x0 + i, y0, C.face);
  p.set(x0 + POST_W - 1, y0, C.beam);
}

/** An iron band round the post at row y: a pixel proud each side, lit on top, one rivet. */
function band(p, y) {
  const x0 = POST_X - 1, x1 = POST_X + POST_W;
  for (let x = x0; x <= x1; x++) {
    p.set(x, y, x === x1 ? C.iron : C.ironHi);
    p.set(x, y + 1, x === x0 ? C.ironHi : x === x1 ? C.ironLo : C.iron);
    p.set(x, y + 2, C.ironLo);
  }
  // The rivet's head: lit on its upper left, dark on its lower right.
  p.set(POST_X + 2, y + 1, C.rivet);
  p.set(POST_X + 3, y + 1, C.ironLo);
}

// The plinth, from row 45 down to the deck, centred on the post (columns 5-10): chocks
// either side of its foot with the post running down between them in their shadow, two
// slabs with a dark stone between them, and a course of three grey stones, the widest
// part, standing on the ledge. Column 0 and 15 stay empty for the outline.
//   t    a lit top                    c C S  lit edge, face, shaded side
//   K k  the dark stone between       1 2 3  a stone's lit top, face, foot
//   -    the post's foot in shadow    |      a seam between stones
const PLINTH = [
  '...tttt--tttt...',   // 45  the chocks
  '...cCCS--cCCS...',
  '...cCCS--cCCS...',
  '...cCCS--cCCS...',
  '..tttttKKttttt..',   // 49  the slabs
  '..cCCCSkkcCCCS..',
  '..cCCCSkkcCCCS..',
  '.1111.1111.1111.',   // 52  the stones
  '.1222|1222|1222.',
  '.2222|2222|2223.',
  '.3333|3333|3333.',   // 55  on the deck
];
const PLINTH_INK = {
  t: C.beam, c: C.beamLo, C: C.beamDeep, S: C.beamTop, K: C.stone, k: C.stoneLo, '-': C.gap,
  '|': C.ink, 1: C.stoneHi, 2: C.stone, 3: C.stoneLo,
};
const PLINTH_Y = BOX_H - PLINTH.length;   // 45

// The lantern, 10 wide (columns 21-30), from the ring to the drop.
//   h i d  iron lit, mid, dark    L  the bars and brims, near black    G  the glass (per frame)
const LANTERN = [
  '..........',   // 10  the ring (RING, drawn after the outline)
  '..........',
  '..........',
  '..........',
  '..........',   // 14
  '....id....',   // 15  the stem
  '....hd....',   // 16  the knob
  '...hhid...',   // 17  the roof
  '..hhiiid..',
  '.hhiiiiid.',
  'hhiiiiiiid',   // 20
  'LLLLLLLLLL',   // 21  the brim
  'hsLGGGGLsd',   // 22  the glass: side panes, bars, the front pane
  'hsLGGGGLsd',
  'hsLGGGGLsd',
  'hsLGGGGLsd',
  'hsLGGGGLsd',
  'hsLGGGGLsd',
  'hsLGGGGLsd',
  'hsLGGGGLsd',
  'hsLGGGGLsd',   // 30
  'LLLLLLLLLL',   // 31  the base's brim
  '.hiiiiiid.',   // 32  the base plate
  '..hiiiid..',
  '....id....',   // 34  the drop
];
const LANTERN_Y = 10;

// The ring the lantern hangs by, 6 x 5 at column 23, row 10. Drawn AFTER the outline, lit
// on its upper left, so its hole stays open and the halo shows through it: outlined, a
// ring this small had its hole filled with ink and read as a dark block on the arm.
const RING = [
  '.hhid.',
  'h....d',
  'h....d',
  'i....d',
  '.iddd.',
];
// The front pane per frame, 4 x 9, rows 22-30: the flame a teardrop with its pale core low
// in it, the glass round it lit from inside.
//   W the core    Y bright    y the glass    o the glass away from the flame, and the burner
const PANE = [
  ['oyyo', 'yyyy', 'yyyy', 'yYYy', 'yYWy', 'yWWy', 'yYYy', 'oyyo', 'oooo'],   // burning low
  ['yyyy', 'yYYy', 'yYWy', 'YWWY', 'YWWY', 'yWWy', 'yYYy', 'oyyo', 'oooo'],   // bright
];

// Per frame: the glass, the side panes (seen at a slant, dimmer), and the light: the
// halo's three rings [radius px, alpha] in deep orange, and how far light lands on what
// faces the lantern, with its strength.
const LIGHT = [
  {
    W: '#ffd27a', Y: '#ffa83a', y: '#d97a2a', o: '#8e4a22', s: '#9a5426',
    rings: [[7, 0.46], [9.5, 0.28], [11.5, 0.13]], halo: ['#ffa436', '#ff8a24', '#f07018'],
    reach: 19, land: 0.6,
  },
  {
    W: '#fff6d0', Y: '#ffd060', y: '#ffa13a', o: '#c86a2a', s: '#d9822e',
    rings: [[8, 0.62], [10.5, 0.4], [13, 0.2]], halo: ['#ffb040', '#ff9028', '#f47a1c'],
    reach: 24, land: 0.78,
  },
];

// The warm tint light leaves on a lit surface.
const LAMPLIGHT = '#ffae48';

function paintLanternPost(p, v, f) {
  const L = LIGHT[f];

  // The post and the arm, back to front: the post, its bands, the plinth over its foot.
  post(p, POST_X, POST_TOP, PLINTH_Y + 2);
  // The arm: two rows of iron out of the top band, lit on top, to a square bracket.
  for (let x = POST_X + POST_W + 1; x <= 24; x++) { p.set(x, 7, C.ironHi); p.set(x, 8, C.ironLo); }
  for (const y of BANDS) band(p, y);
  p.ascii(['hiid', 'hRid', 'iidd', '.dd.'], { h: C.ironHi, i: C.iron, d: C.ironLo, R: C.rivet }, 24, 6);
  p.ascii(PLINTH, PLINTH_INK, 0, PLINTH_Y);

  // The lantern, its glass lit by frame.
  const pane = PANE[f];
  const ink = { h: C.ironHi, i: C.iron, d: C.ironLo, L: '#211a1f', s: L.s };
  const lantern = LANTERN.map((row, j) => {
    const r = j - (22 - LANTERN_Y);
    if (r < 0 || r >= pane.length) return row;
    return row.slice(0, 3) + pane[r] + row.slice(7);
  });
  p.ascii(lantern, { ...ink, W: L.W, Y: L.Y, y: L.y, o: L.o }, LX, LANTERN_Y);

  // The brace, from the post up into the arm's underside: three pixels a row -- lit, mid,
  // dark -- stepping up and right, so it is a bar about two pixels thick lit along its top
  // edge, outlined like everything else. It meets the post just above the second band, as
  // the board's does, and the arm a third of the way out. The first drawing's brace was a
  // one-pixel line (a dotted chain at zoom 1), then a lit and a dark pixel drawn over the
  // outline, which next to the lantern's warm light read as a thin tan stick.
  for (let i = 0; i <= 8; i++) {
    p.set(11 + i, 17 - i, C.ironHi); p.set(12 + i, 17 - i, C.iron); p.set(13 + i, 17 - i, C.ironLo);
  }

  p.outline(C.ink);
  p.ascii(RING, { h: C.ironHi, i: C.iron, d: C.ironLo }, 23, 10);

  // What the lantern lights. A pixel of wood, iron or stone facing the flame -- the one
  // beside it toward the flame is empty or outline -- takes a warm tint, in three steps by
  // distance. Not the lantern itself (its glass is the light) and not the outline, which
  // stays the dark line round the shape.
  const iron = new Set([C.ironHi, C.iron, C.ironLo, C.rivet].map((h) => h.slice(1)));
  const isIron = (x, y) => {
    const c = p.get(x, y);
    return iron.has(c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join(''));
  };
  const lanternPx = (x, y) => x >= LX && x < LX + 10 && y >= LANTERN_Y && y < LANTERN_Y + LANTERN.length
    && LANTERN[y - LANTERN_Y][x - LX] !== '.';
  const solid = (x, y) => p.alpha(x, y) >= 128 && !isInk(p, x, y);
  const lit = [];
  for (let y = 0; y < BOX_H; y++) {
    for (let x = 0; x < BOX_W; x++) {
      if (!solid(x, y) || lanternPx(x, y)) continue;
      const d = Math.hypot(x + 0.5 - FX, y + 0.5 - FY);
      if (d >= L.reach) continue;
      const sx = Math.sign(FX - (x + 0.5)), sy = Math.sign(FY - (y + 0.5));
      const faces = (sx && !solid(x + sx, y)) || (sy && Math.abs(FY - y) > Math.abs(FX - x) * 0.5 && !solid(x, y + sy));
      if (!faces) continue;
      const k = d / L.reach;
      lit.push([x, y, L.land * (k < 0.55 ? 1 : k < 0.78 ? 0.6 : 0.3) * (isIron(x, y) ? 0.6 : 1)]);
    }
  }
  for (const [x, y, a] of lit) p.blend(x, y, LAMPLIGHT, a);

  // The halo, in the air only: three rings round the flame, each a flat alpha, their
  // edges dithered on a checker -- the distance is nudged half a pixel either way by
  // (x + y) parity, so where two rings meet they interleave for a pixel or two instead of
  // stepping on a clean circle. Nothing is drawn over the lantern, the post or the
  // outline; the light lies behind them.
  for (let y = 0; y < BOX_H; y++) {
    for (let x = 0; x < BOX_W; x++) {
      if (p.alpha(x, y) > 0) continue;
      const d = Math.hypot(x + 0.5 - FX, y + 0.5 - FY) + (((x + y) & 1) ? 0.55 : -0.55);
      const i = L.rings.findIndex(([r]) => d <= r);
      if (i < 0) continue;
      p.set(x, y, L.halo[i], L.rings[i][1]);
    }
  }
}

/** Whether the pixel is the outline's ink (drawn by p.outline). */
function isInk(p, x, y) {
  const c = p.get(x, y);
  return !!c && c[3] === 255 && c[0] === 0x17 && c[1] === 0x0e && c[2] === 0x14;
}

// --- the fence -----------------------------------------------------------------------
//
// From the board: two split-log posts with cut tops, two rails between them whose ends
// stand a little proud of the posts. The rails are behind the posts, and each post has a
// dark seam down both sides where it crosses them. In the gallery's mid tones -- the
// beam's colour for the posts and rails, the deck's lit face along their tops -- so the
// fence is the gallery's own timber, a step darker than the deck it stands on.
//
// THE BOX IS WIDER THAN THE SHEET'S: 32 x 24, not 24 x 24. In 24 the posts, four wide like
// the gallery's, stood eight pixels apart and twenty-two tall with two bars between them
// -- the proportions of a LADDER, which is what it read as on the deck at zoom 2. The
// board's section is wider than it is tall, its posts near its ends; at 32 the gap is
// fourteen and the rails still stand two pixels proud at each end.

// A fence post's columns, lit from the upper left: lit edge, face, grain, shaded side.
const FENCE_COLS = ['beamHi', 'beam', 'beamLo', 'beamDeep'];

/** A fence post, four wide, x0..x0+3 from y0 to y1, with a few streaks of grain. */
function fencePost(p, x0, y0, y1, seed) {
  for (let y = y0; y <= y1; y++) FENCE_COLS.forEach((k, i) => p.set(x0 + i, y, C[k]));
  const len = y1 - y0 + 1;
  for (const [col, at, n] of [[1, 0.18, 4], [2, 0.45, 5], [1, 0.7, 3]]) {
    const s = y0 + Math.floor(((at + seed * 0.13) % 0.9) * len);
    for (let y = s; y < Math.min(y1, s + n); y++) p.set(x0 + col, y, col === 1 ? C.beamLo : C.beamDeep);
  }
  // A knot: a dark eye with a lit lip above it.
  const k = y0 + Math.floor(((0.33 + seed * 0.29) % 0.8 + 0.1) * len);
  if (k + 1 < y1) { p.set(x0 + 1, k, C.beamHi); p.set(x0 + 1, k + 1, C.beamDeep); p.set(x0 + 2, k + 1, C.beamTop); }
}

const TOP_L = ['.cc.', 'cccf'];
const TOP_R = ['.ccf', 'ccff'];

function rail(p, y, x0, x1) {
  for (let x = x0; x <= x1; x++) {
    p.set(x, y, C.face);
    p.set(x, y + 1, (x * 7) % 11 < 4 ? C.beamLo : C.beam);
    p.set(x, y + 2, C.beamDeep);
  }
  // The ends: cut grain, lit.
  p.set(x0, y, C.cut); p.set(x0, y + 1, C.faceLo);
  p.set(x1, y + 1, C.beamLo);
}

function paintFence(p) {
  rail(p, 8, 1, 30);
  rail(p, 16, 1, 30);
  // The posts over the rails, each with a seam either side where it crosses them. Set in
  // from the ends so the rails stand two pixels proud of them, as the board's do: at one
  // pixel the stubs vanished into the outline.
  const posts = [[4, 2, TOP_L, 0], [24, 3, TOP_R, 3]];
  for (const [x0, y0, top, seed] of posts) {
    fencePost(p, x0, y0 + 2, 23, seed);
    p.ascii(top, { c: C.cut, f: C.face }, x0, y0);
    for (const ry of [8, 16]) {
      for (let y = ry; y <= ry + 2; y++) { p.set(x0 - 1, y, C.line); p.set(x0 + 4, y, C.line); }
    }
  }
  p.outline(C.ink);
}

export const ELEMENTS = {
  LANTERN_POST: {
    name: 'LANTERN POST', box: [BOX_W, BOX_H], anchor: 'stand', frames: 2, variants: 1,
    // The glow breathes as sin(3t) did, bright for half of it: two frames a cycle.
    fps: (2 * 3) / (2 * Math.PI),
    notes: ['SQUARE WEATHERED POST, FOUR IRON BANDS, A', 'STONE PLINTH; IRON ARM, RING AND LANTERN.',
      '2 FRAMES: BURNING LOW AND BRIGHT, A HALO IN', 'STEPPED DITHERED RINGS, WARM ON THE POST.'],
    paint(p, v, f) { paintLanternPost(p, v, f); },
  },
  FENCE: {
    name: 'FENCE', box: [32, 24], anchor: 'stand', frames: 1, variants: 1,
    notes: ['TWO SPLIT-LOG POSTS, TWO RAILS STANDING', 'PROUD OF THEM. ON WIDER LEDGES, AT THE END',
      'AWAY FROM THE LANTERN.'],
    paint(p) { paintFence(p); },
  },
};

/**
 * A lantern somewhere along the ledge, clear of its ends; on a ledge over 40 units, a
 * fence at whichever end is further from the lantern, so the two never stand in each
 * other and the fence is not always on the right.
 */
export function scene(r, wArt) {
  const W = Math.floor(wArt);
  const [pw] = ELEMENTS.LANTERN_POST.box, [fw] = ELEMENTS.FENCE.box;
  const px = fit(Math.round(8 + r() * Math.max(0, W - pw - 16)), pw, W);
  const out = [{ key: 'LANTERN_POST', variant: 0, x: px }];
  if (W > 160) {
    const fx = px + pw / 2 < W / 2 ? W - fw - 12 : 12;
    if (fx + fw + 8 <= px || fx >= px + pw + 8) out.push({ key: 'FENCE', variant: 0, x: fx });
  }
  return out;
}
