// The rising floor: the hazard that climbs the shaft after the Duke.
//
// WHAT THIS REPLACED. Renderer.drawRisingFloor drew it as a row of 4 x 4 WORLD-unit
// squares -- red and pink, sixteen screen pixels each -- along the top of a flat #12000a
// box 80 units deep, with a one-unit line of the zone's accent on top. The most dangerous
// thing on screen looked like a loading bar, it was the same flat box in every zone, it
// was four times chunkier than every ledge and sprite around it, and it ENDED: 80 units
// under the line the box stopped and the shaft showed through beneath it, so when the
// floor came up the screen -- the only time anyone looks at it -- it was a band with the
// tower carrying on under it, not the thing that swallows the tower.
//
// WHAT IT IS NOW. A tide of fire: a wall of flame licking up off a yellow-hot crest, and
// under it a sea of crust -- red-hot plates floating in molten cracks just under the rim,
// cooling to a dark crust some fifty pixels down. It is drawn at the art's own scale --
// one art pixel per backing-store pixel at zoom 1, like the Duke, the ledges and the
// decor -- with the same conventions: hue-shifted ramps (shadows toward plum, heat toward
// orange and yellow), plates lit from the upper left, no blur, clean clusters. It is the
// same thing in every zone on purpose: the player has to know it at a glance wherever
// they are. Red is its identity -- the danger band, the vignette and the CLIMB! warning
// are red because it is -- so its fire runs from crimson tips down to a yellow core, a
// step redder than the torch's.
//
// ITS FLAMES ARE THE GAME'S FLAMES. The DUNGEON wall torch (decorpaint/dungeon.js) set
// how fire is drawn here: rows of a tongue toned by how far in from the row's edge they
// are, the pale core only low down, a faint halo round it, and NO dark outline -- the
// art brief's rule is that lights take none, because a point of light drawn with a dark
// edge reads as a cut-out of one. The first version of this floor rimmed its tongues in
// dark maroon, and at 1x, and even at 4x, the rim was a row of crimson THORNS, a strip of
// spikes rather than fire. It also kept every tongue in the same five places in every
// tile, with a bare gap at each join, so the rim beat out a 64-px rhythm the whole width
// of the screen.
//
// THE SHAPE THE ARTIST WAS ASKED FOR (tools/brief-sheets.mjs, THE RISING FLOOR):
//   RISE-EDGE  64 x 16 per frame, 4 frames -- the top of the hazard, repeats left to right
//   RISE-BODY  64 x 64 per frame, 2 frames -- below the edge, repeats both ways
// Those are exactly the tiles painted here (edgeTile, bodyTile; riseSheets() lays them
// out as the two PNGs would be, though no tool calls it today -- brief-sheets.mjs shows the
// artist the floor from a real frame), so delivered art has one place to go.
//
// HOW IT IS DRAWN. Tiles are never blitted one by one: thirty tiles across and ten down
// would be three hundred drawImage calls a frame. Each frame of each part is composed
// ONCE into a strip as wide as the widest view (1920 art px) plus its pattern's period
// and the shake margin, and a frame of the game draws the edge strip, the crest's pulse,
// the hot top of the crust and the deep crust: three or four drawImage calls, five in the
// death when the underside shows. Everything is built once for the whole game -- it does
// not vary by zone -- warmed one piece a frame by warmRise() while the Duke is still on
// the ground floor (or the menu's demo is), before the rise arms at floor 1.

import { PX } from '../game/constants.js';
import { Pix, pixToCanvas } from './decorpaint/util.js';
import { newCanvas } from './canvases.js';

// --- the brief's shape -------------------------------------------------------------

export const EDGE_W = 64;
export const EDGE_H = 16;
export const EDGE_FRAMES = 4;
export const BODY_W = 64;
export const BODY_H = 64;
export const BODY_FRAMES = 2;

/**
 * The edge row the kill line sits on top of. [art rows from the top of RISE-EDGE; 11]
 * Above it, up to ten rows of flame lick toward the Duke; from it down, the crest and
 * the molten skin. The old box put its accent line ON the kill line and a pulsing row one
 * unit above it, so drawing a little over the line is what the player already reads as
 * the edge -- and flames that reach 2.5 world units above the lethal height err on the
 * safe side: his feet can be among the flame tips and he lives; he dies at the crest.
 */
export const SURFACE_ROW = 11;

// --- motion ------------------------------------------------------------------------

/** How fast the flames flicker through their four frames. [frames per second; 9] */
export const EDGE_FPS = 9;
/**
 * How fast the burning rim crawls sideways. [art pixels per second; 13]
 * The old checker ran at 136 px/s, a conveyor. Slow enough here to read as fire
 * spreading along the surface rather than as a belt moving.
 */
export const EDGE_CRAWL = 13;
/** How often the crust's seams breathe between their two frames. [per second; 1.7] */
export const BODY_FPS = 1.7;
/** The crust drifts the other way, slowly, so the tide churns. [art px per second; -5] */
export const BODY_DRIFT = -5;
/** The crest's pulse at its brightest, times the THREAT_HZ wave. [alpha 0..1; 0.6] */
export const FLARE_MAX = 0.6;

/**
 * How deep the tide is, as a share of the view's height. [0..1; 0.6 = 162 units at zoom 1]
 *
 * In play the body reaches the bottom of the view whatever this says: a floor that ends
 * a fixed 80 units down is the loading bar this replaced. It still has to END somewhere,
 * because the death runs through it: caughtByFloor yanks him under, the camera follows
 * him down, and he has to drop out of its underside into the shaft and fall to the pit.
 * At the moment it catches him the line is at his feet, which the camera holds at most
 * 0.42 + 0.12 (look-ahead) of the view above its bottom, so 0.6 is always below the
 * bottom of the screen then -- the underside never pops into view -- and he falls out of
 * it a third of a second later.
 */
export const RISE_DEPTH = 0.6;

/**
 * How far past the view's edges every strip reaches. [world units; 8]
 * The screen shake moves the whole world by up to 7 view units (Game.addShake caps it at
 * 7; at zoom 1 that is 7 world units, less when zoomed in). The first version kept 4, so
 * a hard shake -- the one the capture itself sets off is 5 -- could open a sliver of
 * backdrop at the left edge, or of tower under the floor at the bottom of the screen.
 * The strips' widths below are what 8 needs at zoom 1, and no more.
 */
const MARGIN = 8;

// --- composition -------------------------------------------------------------------

// Each strip is as wide as the widest view (1920 art px at zoom 1) plus its own pattern's
// period, less a pixel, plus the shake margin either side -- rounded up to that period.
const EDGE_STRIP_W = 2560;     // art px; the rim's pattern repeats every 512
const NEAR_W = 256;            // art px; the heat in the top of the crust repeats every 256
const NEAR_STRIP_W = 2304;
const DEEP_STRIP_W = 2048;     // the deep crust repeats every 64
const NEAR_H = 128;            // art rows of crust under the edge; the heat is out by ~90
const DEEP_H = 256;            // art rows of cooled crust, repeated as deep as needed
const FRINGE_H = 12;           // the underside, seen only while he falls through it

// --- the palette --------------------------------------------------------------------
//
// The fire, core to tips: the torch's pale core, yellow and orange, then a step redder
// than the torch at the edges and crimson at the tips, so the rim is the danger band's red.
const FT = ['#fff4c8', '#ffd24a', '#ff9a2c', '#ff5424', '#e0203a'];
// The rank of tongues behind them, a flame behind the flame: dimmer and redder, never dark.
const BK = ['#ff4a2a', '#d01e34', '#a8122e'];
// The halo round every tongue, as the torch has. Deep and saturated, not pale: alpha is
// not light, and a pale glow thinned over ZENITH's blue came out a dead grey.
const HALO = '#ff2a1a';
const HALO_A = 0.35;
// The crest and the molten skin under it, from the kill line down.
const SKIN = ['#ffd24a', '#ffab3a', '#ff7e2e', '#ff5a26', '#e0322c'];

// The crust, from the darkest crevice up through red heat to the seams' molten yellow,
// one ramp so a pixel's tone is one number however hot it is. Shadows toward plum. The
// first six are the deep crust's, and the deep crust uses nothing else.
const RAMP = [
  '#08020a',                   // 0 crevice
  '#12040e',                   // 1 plate in shadow
  '#1c0713',                   // 2 plate
  '#2a0b1a',                   // 3 plate's lit edge
  '#3e0a1c',                   // 4 seam's edge; a warm plate
  '#6a0e24',                   // 5 an ember; a warmer plate
  '#8a1228',                   // 6
  '#a8162c',                   // 7 a red-hot plate
  '#c81c30',                   // 8 its lit edge
  '#e0282e',                   // 9 the molten skin's last row
  '#ff5a26',                   // 10
  '#ff8e2c',                   // 11
  '#ffc04a',                   // 12 a seam at its hottest
];

// Material ids in the crust's plan.
const SHADOW = 1, PLATE = 2, LIT = 3, SEAM_EDGE = 4, SEAM = 5, HOT = 6;

// --- helpers ------------------------------------------------------------------------

const TAU = Math.PI * 2;
/** Signed distance from a to b round a ring of period n, in (-n/2, n/2]. */
const wrapD = (a, n) => ((((a % n) + n + n / 2) % n) - n / 2);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a, n) => ((a % n) + n) % n;

/** A fixed 0..1 value for a tuple of integers: per-plate variety that is the same every build. */
function hash01(a, b, c, d = 0) {
  let h = 2166136261;
  for (const n of [a, b, c, d]) {
    h ^= (n | 0) + 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100003) / 100003;
}

function makeCanvas(w, h) {
  // Smoothing off (canvases.js). Nothing here is resampled while it is built, but the strips
  // are drawn through the world transform at every zoom, and the next thing added might
  // scale into one of these; the headless canvas never smooths, so no shot would show the
  // blur.
  return newCanvas(w, h);
}

// --- RISE-EDGE: the burning rim ------------------------------------------------------
//
// A wall of flame the size of the torch's flame, drawn the torch's way. Each tongue is a
// list of rows, tip first, [offset of the row's centre, width], so its shape is drawn,
// not computed: a tall one, one bent over, one leaning the other way that lets go of a
// lick two rows above it, and a low one -- the torch's four flickers. A tongue steps
// through them at its own phase, so neighbours never flicker in step, and a mirrored
// tongue bends the other way. Three sizes stand in front, the biggest as big as the
// torch's flame; a rank of taller, thinner, redder tongues stands behind them, so the
// silhouette's top is ragged crimson and the heat sits low, as a fire's does.
//
// Tones by how far in from the row's edge a pixel is and how high up the tongue: crimson
// tips, red-orange edges, orange, yellow and the pale core only in the lower third. No
// outline; a halo instead, one pixel of deep red glow round everything.
//
// Every tongue, halo and all, stays inside columns 0-63, and the rows under the crest do
// not change between frames: a strip can put a DIFFERENT frame in each tile (edgeStrip)
// and still join, so the flames repeat every 512 px instead of every 64. A tongue in
// front and one behind stand at each end of the tile, two columns in from its edge, so
// the joins keep the rhythm of the rest: with small ones there, or none, every join was
// a dip in the silhouette and the rim beat out the 64 px tile across the screen.

// [offset, width] rows, tip first; width 0 is an empty row: the gap under a lick let go.
const SHAPES = {
  L: [
    [[1, 1], [1, 1], [0, 3], [0, 3], [-1, 5], [0, 5], [0, 7], [0, 7], [0, 7]],
    [[3, 1], [2, 1], [2, 3], [1, 3], [1, 5], [0, 5], [0, 7], [0, 7]],
    [[-2, 1], [-2, 1], [0, 0], [-1, 1], [-1, 3], [-1, 3], [0, 5], [0, 5], [0, 7], [0, 7]],
    [[0, 1], [1, 3], [0, 3], [0, 5], [0, 7], [0, 7], [0, 7]],
  ],
  M: [
    [[0, 1], [0, 1], [0, 3], [0, 3], [0, 5], [0, 5], [0, 5]],
    [[2, 1], [1, 1], [1, 3], [0, 3], [0, 5], [0, 5]],
    [[-1, 1], [-1, 1], [0, 0], [-1, 1], [-1, 3], [0, 3], [0, 5], [0, 5]],
    [[0, 1], [0, 3], [0, 3], [0, 5], [0, 5]],
  ],
  S: [
    [[0, 1], [0, 1], [0, 3], [0, 3], [0, 3]],
    [[1, 1], [1, 1], [0, 3], [0, 3]],
    [[-1, 1], [0, 1], [0, 3], [0, 3], [0, 3]],
    [[0, 1], [0, 3], [0, 3]],
  ],
  B: [
    [[0, 1], [0, 1], [0, 1], [0, 3], [0, 3], [0, 3], [0, 5], [0, 5], [0, 5], [0, 5]],
    [[2, 1], [2, 1], [1, 1], [1, 3], [1, 3], [0, 3], [0, 5], [0, 5], [0, 5]],
    [[-1, 1], [-2, 1], [0, 0], [-1, 1], [-1, 3], [0, 3], [0, 3], [0, 5], [0, 5], [0, 5]],
    [[0, 1], [0, 1], [0, 3], [0, 3], [0, 5], [0, 5], [0, 5]],
  ],
};

//   x (the tongue's column in the tile), size, phase (frames), mirror
const FRONT = [
  [3, 'M', 0, 1], [9, 'L', 1, -1], [16, 'S', 2, 1], [22, 'M', 3, 1], [29, 'L', 0, 1],
  [36, 'S', 1, -1], [43, 'M', 2, -1], [50, 'L', 3, -1], [56, 'S', 0, 1], [60, 'M', 2, -1],
];
//   x, phase, mirror: one between each pair in front, and one at each end of the tile
const BACK = [
  [3, 2, 1], [13, 0, -1], [19, 3, 1], [26, 1, -1], [33, 2, 1], [40, 0, 1], [46, 3, -1],
  [53, 1, 1], [60, 0, -1],
];

/**
 * The molten skin's steps under the crest: for each of rows 12-15, whether that row is a
 * step further down the ramp than its depth says. Runs of 3 to 9 columns, a different
 * run of them for each row, so the heat falls off in ragged steps rather than straight
 * stripes -- and fixed, not per frame, so tiles of different frames still meet.
 */
const SKIN_RUNS = [5, 3, 6, 4, 7, 3, 5, 4, 6, 3, 5, 4, 9];
const SKIN_WOB = (() => {
  const w = [];
  SKIN_RUNS.forEach((n, i) => { for (let k = 0; k < n; k++) w.push(i % 2); });
  return w;
})();
const skinWob = (X, row) => SKIN_WOB[mod(X + row * 17, EDGE_W)];

/** Rasterise one tongue into `tone` (a 64 x SURFACE_ROW array of colours). */
function tongue(tone, x, rows, mirror, toneOf) {
  const S = SURFACE_ROW;
  const top = S - rows.length;
  rows.forEach(([o, w], i) => {
    if (!w) return;
    const y = top + i, hw = (w - 1) / 2, u = (i + 0.5) / rows.length;
    for (let dx = -hw; dx <= hw; dx++) {
      const X = x + o * mirror + dx;
      if (X < 0 || X >= EDGE_W || y < 0) continue;
      tone[y * EDGE_W + X] = toneOf(hw - Math.abs(dx), u);
    }
  });
}

const frontTone = (inset, u) => {
  if (u < 0.34) return inset >= 1 ? FT[3] : FT[4];
  if (u < 0.67) return FT[[4, 3, 2, 1][Math.min(inset, 3)]];
  return FT[[3, 2, 1, 0][Math.min(inset, 3)]];
};
const backTone = (inset, u) => (inset === 0 ? BK[2] : inset >= 2 && u > 0.6 ? BK[0] : BK[1]);

/** One frame of RISE-EDGE, 64 x 16, into a Pix. */
export function paintEdge(p, f) {
  const S = SURFACE_ROW;
  const tone = new Array(EDGE_W * S).fill(null);
  for (const [x, ph, mirror] of BACK) tongue(tone, x, SHAPES.B[(f + ph) % EDGE_FRAMES], mirror, backTone);
  for (const [x, size, ph, mirror] of FRONT) {
    tongue(tone, x, SHAPES[size][(f + ph) % EDGE_FRAMES], mirror, frontTone);
  }
  // The burning surface the tongues stand on: their feet meet along the row over the crest.
  for (let X = 0; X < EDGE_W; X++) if (!tone[(S - 1) * EDGE_W + X]) tone[(S - 1) * EDGE_W + X] = FT[3];

  const on = (X, y) => X >= 0 && X < EDGE_W && y >= 0 && y < S && tone[y * EDGE_W + X] !== null;
  for (let y = 0; y < S; y++) {
    for (let X = 0; X < EDGE_W; X++) {
      const c = tone[y * EDGE_W + X];
      if (c) p.set(X, y, c);
      else if (on(X - 1, y) || on(X + 1, y) || on(X, y - 1) || on(X, y + 1)) p.set(X, y, HALO, HALO_A);
    }
  }

  // The crest: the kill line's own row, one unbroken yellow -- the brightest row in the
  // whole floor, so it is where the eye puts the line, and a CLEAN line, because it is
  // the one the player reads the distance from. An earlier version spotted it white-hot
  // under the big tongues and orange between them; with the tongues' own cores just over
  // it, the line broke up at 4x into a string of bulbs. It still flares toward white, all
  // along, with the THREAT_HZ pulse.
  for (let X = 0; X < EDGE_W; X++) p.set(X, S, SKIN[0]);
  // The molten skin under it: a step down the ramp every row, in ragged runs, ending on
  // the red the crust's top row starts on (paintNear), which is what lets the two join
  // although they scroll apart.
  for (let y = S + 1; y < EDGE_H; y++) {
    for (let X = 0; X < EDGE_W; X++) p.set(X, y, SKIN[Math.min(SKIN.length - 1, y - S + skinWob(X, y))]);
  }
}

// --- RISE-BODY: the crust ------------------------------------------------------------
//
// Plates of cooled crust, like the skin on a lava flow: a Voronoi pattern on the 64 x 64
// torus, so it tiles both ways by construction, flattened a little (the crust spreads
// sideways) and warped so no seam is a straight segment. Each plate is lit on its
// upper-left edge and shadowed on its lower-right, as every drawn thing in the game is.
//
// DEEP DOWN IT IS DARK, AND THAT IS THE POINT. A version that glowed red along every
// seam all the way down covered half the screen in a bright red mesh -- a net thrown
// over the bottom of the view, louder than the rim it was meant to sit quietly under.
// Down here the seams are the DARKEST thing (a crevice between plates, not a crack of
// light) and all that glows is the odd ember at a junction of three plates, trading
// places between the two frames. The fire lives in the top of the crust only (paintNear).

// x, y, and a weight in pixels: a heavier seed claims a bigger plate. Equal weights on
// evenly spread seeds made a honeycomb, and a honeycomb repeated every 64 px across the
// screen is a grid; plates of mixed sizes read as crust.
const SEEDS = [
  [9, 6, 4], [30, 2, 0], [45, 10, 2], [58, 22, 0], [24, 24, 5], [44, 36, 1],
  [6, 40, 1], [16, 50, 0], [34, 52, 4], [58, 50, 2],
];

function crustPlan() {
  const n = BODY_W * BODY_H;
  const mat = new Uint8Array(n);
  const gap = new Float32Array(n);      // d2 - d1: how far from a seam, roughly in pixels x2
  const tri = new Float32Array(n);      // d3 - d1: small at a junction of three plates
  const cell = new Uint8Array(n);       // which seed's plate the pixel belongs to
  const cell2 = new Uint8Array(n);      // and the plate on the far side of the nearest seam
  // Which copy of each of those two seeds, -1, 0 or +1 tiles across and down: the top of
  // the crust (paintNear) heats every PLATE on its own, and a plate straddling the tile's
  // edge is one plate, not two halves.
  const off = new Int8Array(n * 4);
  for (let y = 0; y < BODY_H; y++) {
    for (let x = 0; x < BODY_W; x++) {
      // A periodic warp: both periods divide 64, so the tile still wraps.
      const wx = x + 1.8 * Math.sin(TAU * y / 32);
      const wy = y + 1.6 * Math.sin(TAU * x / 32 + 1.3);
      const ds = SEEDS.map(([sx, sy, w], k) => {
        const ex = wrapD(wx - sx, BODY_W), ey = wrapD(wy - sy, BODY_H);
        const dy = ey * 1.25;
        return [Math.sqrt(ex * ex + dy * dy) - w, k, Math.round((wx - ex - sx) / BODY_W), Math.round((wy - ey - sy) / BODY_H)];
      }).sort((a, b) => a[0] - b[0]);
      const i = y * BODY_W + x;
      gap[i] = ds[1][0] - ds[0][0];
      tri[i] = ds[2][0] - ds[0][0];
      cell[i] = ds[0][1];
      cell2[i] = ds[1][1];
      off[i * 4] = ds[0][2]; off[i * 4 + 1] = ds[0][3];
      off[i * 4 + 2] = ds[1][2]; off[i * 4 + 3] = ds[1][3];
      mat[i] = gap[i] < 1.0 ? (tri[i] < 2.4 ? HOT : SEAM) : gap[i] < 2.3 ? SEAM_EDGE : PLATE;
    }
  }
  const at = (x, y) => mat[(((y % BODY_H) + BODY_H) % BODY_H) * BODY_W + (((x % BODY_W) + BODY_W) % BODY_W)];
  const isSeam = (m) => m >= SEAM_EDGE;
  const out = mat.slice();
  for (let y = 0; y < BODY_H; y++) {
    for (let x = 0; x < BODY_W; x++) {
      const i = y * BODY_W + x;
      if (mat[i] !== PLATE) continue;
      if (isSeam(at(x, y - 1)) || isSeam(at(x - 1, y))) out[i] = LIT;
      else if (isSeam(at(x, y + 1)) || isSeam(at(x + 1, y))) out[i] = SHADOW;
    }
  }
  return { mat: out, gap, tri, cell, cell2, off };
}

let plan = null;
const crust = () => plan || (plan = crustPlan());

/** The deep crust's ramp step for one pixel of the tile, in frame f. */
function deepStep(i, x, y, f) {
  const m = crust().mat[i];
  if (m === HOT) {
    // Only some junctions hold an ember, and half of those swap brightness between the
    // frames. Both waves have periods that divide 64, so the tile still wraps.
    const g = Math.sin(TAU * x / 32 + 0.5) * Math.sin(TAU * y / 32 + 1.1);
    if (g < 0.15) return 0;
    const swap = Math.sin(TAU * (x + y) / 64 + 0.4) > 0 ? 1 : 0;
    return (f + swap) % 2 ? 5 : 4;
  }
  return m === SEAM ? 0 : m === SEAM_EDGE ? 1 : m;
}

/** One frame of RISE-BODY, 64 x 64: the deep crust. */
export function paintBody(p, f) {
  for (let y = 0; y < BODY_H; y++) {
    for (let x = 0; x < BODY_W; x++) p.set(x, y, RAMP[deepStep(y * BODY_W + x, x, y, f)]);
  }
}

/**
 * The top of the crust, right under the edge: NEAR_W x NEAR_H, the body tile four times
 * across and twice down, with the fire's heat cooling off it.
 *
 * ONE HEAT PER PLATE, NOT PER ROW. The first version heated each pixel by its depth, and
 * every plate came out in horizontal bands -- orange, red, dark red -- stepping down at
 * nearly the same rows right across the screen: ruled stripes under the rim at 4x, the
 * banding the rest of the game's art never has. The foliage taught the same thing (one
 * base tone per puff, from where its centre sits): here each plate takes ONE heat from
 * how deep its centre lies, red-hot plates just under the rim and dark ones fifty pixels
 * down, lit on its upper-left edge, shadowed on its lower-right, and warmed along any
 * seam that is still glowing.
 *
 * THE SEAMS COOL ALONG THEIR LENGTH -- a crack is a line, and a line changing tone along
 * itself is how a crack cools -- each at its own rate. Near the surface they widen into
 * the molten skin, so the plates rise out of it rather than starting under a ruled row.
 *
 * AND THE HEAT REPEATS EVERY 256 PX, NOT EVERY 64. The crust's pattern is the brief's
 * 64 px tile, and the first version's glowing cracks traced it thirty times across the
 * screen, a chain-link lattice right under the thing the player watches. Here every
 * copy of every plate draws its own heat and its own cooling (hash01 of the plate and
 * which copy it is): the lattice is still there in the deep crust, too dark to show it,
 * and gone from the glow, which is the part anyone looks at.
 */
function paintNear(p, f) {
  const { mat, gap, cell, cell2, off } = crust();
  const copies = NEAR_W / BODY_W;
  for (let y = 0; y < NEAR_H; y++) {
    const ty = y % BODY_H, tY = Math.floor(y / BODY_H);
    for (let X = 0; X < NEAR_W; X++) {
      const x = X % BODY_W, tX = Math.floor(X / BODY_W);
      const i = ty * BODY_W + x;
      const m = mat[i];
      const deep = deepStep(i, x, ty, f);
      // The two plates either side of the nearest seam: which copy of each, and how deep
      // the centre of that copy lies under the edge.
      const k1 = cell[i], k2 = cell2[i];
      const cx1 = mod(tX + off[i * 4], copies), cy1 = tY + off[i * 4 + 1];
      const cx2 = mod(tX + off[i * 4 + 2], copies), cy2 = tY + off[i * 4 + 3];
      const a1 = hash01(k1, cx1, cy1), a2 = hash01(k2, cx2, cy2);
      // How far down a seam still glows, from the two plates it runs between. [rows; 24-56]
      const reachS = 24 + 32 * (a1 + a2) / 2;
      // And how hot it runs at all: without this every copy's cracks were the same yellow
      // right under the skin, and the top rows still repeated every 64 px. [0.55-1]
      const peak = 0.55 + 0.45 * hash01(Math.min(k1, k2) * 16 + Math.max(k1, k2), cx1 + cx2, cy1 + cy2, 3);
      const breathe = 0.08 * Math.sin(TAU * (X / 64 + y / 48) + f * Math.PI);
      const hs = clamp(peak * (1 - y / reachS) + breathe, 0, 1);
      // The seams widen into the molten skin over the top few rows.
      const seam = m >= SEAM || (m >= SEAM_EDGE && y < 5) || gap[i] < 1 + Math.max(0, 5 - y) * 0.7;
      let s;
      if (seam) {
        s = hs > 0.04 ? 4 + Math.round(hs * 8) + (m === HOT ? 1 : 0) : 0;
        // Right under the edge a seam is no brighter than the skin row over it (SKIN[3-4]),
        // or it would draw a second bright line five rows under the crest.
        if (y < 4) s = Math.min(s, 10);
      } else if (m === SEAM_EDGE) {
        s = hs > 0.1 ? 3 + Math.round(hs * 6) : 1;
      } else {
        // The plate's one heat, from its own centre's depth. [0..1]
        const cy = SEEDS[k1][1] + BODY_H * cy1;
        const lag = -4 + 12 * hash01(k1, cx1, cy1, 1);
        const reachP = 26 + 20 * hash01(k1, cx1, cy1, 2);
        const hp = clamp(1 - (cy + lag) / reachP, 0, 1);
        s = 2 + Math.round(hp * 4) + (m === LIT ? 1 : m === SHADOW ? -1 : 0);
        // Warmed where it meets a seam that is still glowing.
        if (gap[i] < 3 && hs > 0.3) s++;
      }
      // The top two rows of plates melt into the skin: its last row's red, no darker.
      if (y < 2) s = Math.max(s, 9);
      p.set(X, y, RAMP[clamp(Math.max(deep, s), 0, RAMP.length - 1)]);
    }
  }
}

// --- the underside --------------------------------------------------------------------
//
// Seen only in the death, for the moment the Duke drops out of the tide into the shaft:
// the crust ends in drips instead of a ruled edge, lit on the left like everything else.
const DRIPS = [[5, 2.5, 7], [16, 1.5, 4], [27, 3, 10], [38, 1.5, 3], [47, 2.5, 8], [58, 2, 5]];

function paintFringe(p) {
  const inside = (X, y) => {
    if (y < 0) return true;
    if (y < 2) return true;
    for (const [x, hw, len] of DRIPS) {
      const d = Math.abs(wrapD(X + 0.5 - x, EDGE_W));
      const r = y - 2;
      if (r < len && d < hw * (1 - 0.45 * (r / len)) + (r === len - 1 ? -0.4 : 0)) return true;
    }
    return false;
  };
  for (let y = 0; y < FRINGE_H; y++) {
    for (let X = 0; X < EDGE_W; X++) {
      if (inside(X, y)) {
        const l = !inside(X - 1, y), r = !inside(X + 1, y);
        p.set(X, y, l ? RAMP[3] : r ? RAMP[1] : RAMP[2]);
      } else if (inside(X, y - 1) || inside(X - 1, y) || inside(X + 1, y)) {
        p.set(X, y, RAMP[0]);
      }
    }
  }
}

// --- tiles, sheets and strips ------------------------------------------------------

function pixCanvas(w, h, paint) {
  const p = new Pix(w, h);
  paint(p);
  const { c, g } = makeCanvas(w, h);
  pixToCanvas(p, g);
  return c;
}

/** One frame of RISE-EDGE as a 64 x 16 canvas. */
export const edgeTile = (f) => pixCanvas(EDGE_W, EDGE_H, (p) => paintEdge(p, f));
/** One frame of RISE-BODY as a 64 x 64 canvas. */
export const bodyTile = (f) => pixCanvas(BODY_W, BODY_H, (p) => paintBody(p, f));

/**
 * The two sheets laid out as the brief asks the artist to deliver them: RISE-EDGE
 * 256 x 16 (four frames side by side) and RISE-BODY 128 x 64 (two). Written for a review
 * tool; nothing calls it today.
 */
export function riseSheets() {
  const e = makeCanvas(EDGE_W * EDGE_FRAMES, EDGE_H);
  for (let f = 0; f < EDGE_FRAMES; f++) e.g.drawImage(edgeTile(f), 0, 0, EDGE_W, EDGE_H, f * EDGE_W, 0, EDGE_W, EDGE_H);
  const b = makeCanvas(BODY_W * BODY_FRAMES, BODY_H);
  for (let f = 0; f < BODY_FRAMES; f++) b.g.drawImage(bodyTile(f), 0, 0, BODY_W, BODY_H, f * BODY_W, 0, BODY_W, BODY_H);
  return { edge: e.c, body: b.c };
}

/** `tile` (w x h) repeated across a strip `sw` wide, with whole-pixel blits. */
function strip(tile, w, h, sw) {
  const { c, g } = makeCanvas(sw, h);
  for (let x = 0; x < sw; x += w) g.drawImage(tile, 0, 0, w, h, x, 0, w, h);
  return c;
}

// Tile j of edge strip k shows frame (k + EDGE_ORDER[j % 8]) % 4. No two neighbours
// share a frame, every tile still steps through all four in turn as the strips cycle,
// and the rim repeats every 512 px rather than every 64.
const EDGE_ORDER = [0, 2, 1, 3, 2, 0, 3, 1];
const EDGE_PERIOD = EDGE_W * EDGE_ORDER.length;
let edgeTiles = null;

function edgeStrip(k) {
  if (!edgeTiles) edgeTiles = Array.from({ length: EDGE_FRAMES }, (_, f) => edgeTile(f));
  const { c, g } = makeCanvas(EDGE_STRIP_W, EDGE_H);
  for (let j = 0; j < EDGE_STRIP_W / EDGE_W; j++) {
    const tile = edgeTiles[(k + EDGE_ORDER[j % EDGE_ORDER.length]) % EDGE_FRAMES];
    g.drawImage(tile, 0, 0, EDGE_W, EDGE_H, j * EDGE_W, 0, EDGE_W, EDGE_H);
  }
  return c;
}

// The crest's pulse: the kill line's row lit toward white, and the row under it half as
// much. Drawn over the edge at the THREAT_HZ wave, so the floor beats with the danger band
// and the CLIMB! warning -- the one pulse rate for everything red.
function paintFlare(p) {
  for (let X = 0; X < EDGE_W; X++) {
    p.set(X, 0, FT[0]);
    p.set(X, 1, SKIN[0], 0.5);
  }
}

// What there is to build, in the order warmRise builds it: one piece per call.
const PIECES = [];
for (let k = 0; k < EDGE_FRAMES; k++) PIECES.push(['edge', k, () => edgeStrip(k)]);
PIECES.push(['flare', 0, () => strip(pixCanvas(EDGE_W, 2, paintFlare), EDGE_W, 2, DEEP_STRIP_W)]);
for (let f = 0; f < BODY_FRAMES; f++) {
  PIECES.push(['near', f, () =>
    strip(pixCanvas(NEAR_W, NEAR_H, (p) => paintNear(p, f)), NEAR_W, NEAR_H, NEAR_STRIP_W)]);
  PIECES.push(['deep', f, () => {
    const tile = bodyTile(f);
    const { c, g } = makeCanvas(DEEP_STRIP_W, DEEP_H);
    for (let y = 0; y < DEEP_H; y += BODY_H) {
      for (let x = 0; x < DEEP_STRIP_W; x += BODY_W) g.drawImage(tile, 0, 0, BODY_W, BODY_H, x, y, BODY_W, BODY_H);
    }
    return c;
  }]);
}
PIECES.push(['fringe', 0, () => strip(pixCanvas(EDGE_W, FRINGE_H, paintFringe), EDGE_W, FRINGE_H, DEEP_STRIP_W)]);

const art = { edge: [], flare: [], near: [], deep: [], fringe: [] };
let built = 0;

/** Build the next missing piece, if any. Returns true while there is more to build. */
export function warmRise() {
  if (built >= PIECES.length) return false;
  const [k, f, make] = PIECES[built++];
  art[k][f] = make();
  return built < PIECES.length;
}

/** Everything, built now if it has not been warmed yet. */
export function riseArt() {
  while (warmRise());
  return art;
}

/** Drop the strips, so a tool can time a cold build. */
export function resetRise() {
  built = 0;
  plan = null;
  edgeTiles = null;
  for (const k of Object.keys(art)) art[k] = [];
}

// --- drawing ------------------------------------------------------------------------

/**
 * Where a strip whose pattern repeats every `period` art pixels starts, in world units:
 * at or left of `left`, anchored to the WORLD (the pattern does not slide when the view
 * does) and moved on by `shift` whole art pixels.
 */
function startX(left, shift, period) {
  const s = ((Math.floor(shift) % period) + period) % period;
  return (s + period * Math.floor((left * PX - s) / period)) / PX;
}

/**
 * Rows [0, rows) of a strip, row 0 at world height `top`, none lower than world
 * `floorY`, in the flipped space the caller has set up. Returns how many rows it drew.
 */
function blit(ctx, img, x, top, rows, floorY) {
  const n = Math.min(rows, Math.ceil((top - floorY) * PX));
  if (n <= 0) return 0;
  ctx.drawImage(img, 0, 0, img.width, n, x, -top, img.width / PX, n / PX);
  return n;
}

/**
 * Draw the rising floor. World transform (y up), as the renderer's world pass has it.
 *
 * @param o.y       the kill line, world units
 * @param o.left, o.right, o.bottom  the view's edges, world units
 * @param o.depth   how far the tide reaches below the line, world units
 * @param o.t       the renderer's clock, seconds
 * @param o.alpha   the opacity to draw at (the caller's cull fade)
 * @param o.pulse   0..1, the THREAT_HZ wave
 * @returns the number of drawImage calls it made
 */
export function drawRise(ctx, o) {
  const a = riseArt();
  const u = 1 / PX;
  // On the art grid: the camera translate is whole, so this puts every art pixel of the
  // floor on a backing-store pixel at zoom 1 instead of straddling two.
  const y = Math.round(o.y * PX) / PX;
  const top = y + SURFACE_ROW * u;
  const end = Math.round((y - o.depth) * PX) / PX;
  // Nothing is drawn below the view's bottom, less the shake margin.
  const floorY = Math.max(end, o.bottom - MARGIN);
  const left = o.left - MARGIN;
  let calls = 0;

  ctx.save();
  // In this flipped space an image's own downward rows run down the screen, and a strip
  // whose top row is at world height h goes at destination y = -h.
  ctx.scale(1, -1);
  ctx.globalAlpha = o.alpha;

  const k = Math.floor(o.t * EDGE_FPS) % EDGE_FRAMES;
  if (blit(ctx, a.edge[k], startX(left, o.t * EDGE_CRAWL, EDGE_PERIOD), top, EDGE_H, floorY)) calls++;
  if (o.pulse > 0.02) {
    ctx.globalAlpha = o.alpha * FLARE_MAX * o.pulse;
    if (blit(ctx, a.flare[0], startX(left, 0, EDGE_W), y, 2, floorY)) calls++;
    ctx.globalAlpha = o.alpha;
  }

  const bf = Math.floor(o.t * BODY_FPS) % BODY_FRAMES;
  const drift = o.t * BODY_DRIFT;
  let h = top - EDGE_H * u;
  const n = blit(ctx, a.near[bf], startX(left, drift, NEAR_W), h, NEAR_H, floorY);
  if (n) calls++;
  h -= n * u;
  const bx = startX(left, drift, BODY_W);
  while (n === NEAR_H && h > floorY) {
    const m = blit(ctx, a.deep[bf], bx, h, DEEP_H, floorY);
    if (!m) break;
    calls++;
    h -= m * u;
  }
  // The underside, only when it is above the bottom of the view -- in the death.
  if (end > o.bottom - MARGIN && h <= end + u) {
    ctx.drawImage(a.fringe[0], 0, 0, DEEP_STRIP_W, FRINGE_H, bx, -end, DEEP_STRIP_W / PX, FRINGE_H / PX);
    calls++;
  }
  ctx.restore();
  return calls;
}
