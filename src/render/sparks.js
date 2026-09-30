// The combo trail: little stars and sparks falling out of the Duke, more and brighter the
// longer the chain runs.
//
// WHAT THIS REPLACED. The trail used to be KIND.TRAIL: three or four art-pixel SQUARES in
// the zone's particle colour, drifting UP from his back whenever he was fast, and driven
// by his momentum alone -- so a 300-floor combo looked exactly like one quick jump, and
// the only thing a chain ever added was one confetti burst per milestone. A square is
// not a spark, and one colour per zone is not the small, brightly coloured stars the brief
// asked for.
//
// Now every piece is a SPRITE drawn once, at art resolution -- one sprite pixel is one art
// pixel, 1/PX of a world unit, the Duke's own scale -- from the ASCII below, in a ramp of
// four hue-shifted tones lit from the upper left like the ledges and the decor, and blitted
// with one drawImage per piece. What falls out of him, and how much, is keyed to the
// COMBO: a few embers while a chain gets going, then a palette of its own for every
// multiplier step (SWIFT at 50 floors up to GLORY at 350), gold and white at the top, and
// past GLORY a stream that cycles through every colour in the set.
//
// Three rules keep it out of the way of the play, and each is structural rather than a
// matter of tuning:
//   - it is drawn BEHIND the walls, the ledges and the Duke (renderer.js calls drawSparks
//     before drawWalls), so the lit top rows a player tracks at speed and the Duke himself
//     are never painted over, however dense the stream gets;
//   - each piece leaves his back going backward RELATIVE TO HIM -- a kick the other way on
//     top of under one of his own velocity (INHERIT) -- and then falls, so it is left
//     behind him along his path and never runs ahead onto the ledge he is about to land on;
//   - how many can be alive at once is a share of the particle setting (see
//     Particles.setBudget), and nothing at all when that is zero.
// tools/test-sparks.mjs checks all three that can be checked without a frame, and
// tools/shot-trail.mjs --measure counts the pixels it changes on the ledges' top rows (0).
//
// Nothing here builds a canvas at load: the simulation imports this file for its tables,
// and runs in tools with no DOM. The atlas is built on the first draw -- the first frame
// of the title screen -- and never again.

import { PX } from '../game/constants.js';
import { THEMES } from '../game/themes.js';
import { MULT_STEP } from '../game/combo.js';
import { Pix, pixToCanvas } from './decorpaint/util.js';
import { newCanvas } from './canvases.js';

/** The particle kind these are, in the shared pool (particles.js re-exports it as KIND.TWINKLE). */
export const TWINKLE = 8;

// --- the ramps ------------------------------------------------------------------------
//
// Four tones each: DEEP (the rim and the far tips), BODY, LIGHT, HIGHLIGHT. Hue-shifted the
// way the ledges and the decor are -- shadows lean toward blue or plum, lights toward
// yellow -- and far more saturated than anything in the backdrops, because these are
// lights. The deep tone doubles as the rim: over a dark backdrop it all but vanishes and
// the bright core reads alone (a light needs no outline); over the pale ZENITH sky it is
// the dark edge that keeps a white star from dissolving into it.
export const FIXED = {
  GOLD: ['#8c3c14', '#f09a1c', '#ffd23c', '#fff6c0'],
  WHITE: ['#4a5aa0', '#aab8ec', '#dfe8ff', '#ffffff'],
  AMBER: ['#7c1c1c', '#ff5a1e', '#ffa232', '#ffe68c'],
  RED: ['#5c0c3a', '#f0203c', '#ff6a50', '#ffc896'],
  MAGENTA: ['#4c1060', '#f0369c', '#ff84c4', '#ffe0ee'],
  VIOLET: ['#2c1470', '#8c46f0', '#c08cff', '#f2e4ff'],
  CYAN: ['#103c7c', '#18b4f0', '#6ae8ff', '#e4fffc'],
  EMERALD: ['#0c4038', '#1cc860', '#8cf05a', '#eeffc0'],
  AZURE: ['#1a2080', '#3c64f0', '#7ea4ff', '#dceaff'],
};
const FIXED_NAMES = Object.keys(FIXED);

/** Ramp index by name; the twelve zone ramps follow the fixed ones, in THEMES order. */
export const RAMP = Object.fromEntries(FIXED_NAMES.map((n, i) => [n, i]));
const ZONE0 = FIXED_NAMES.length;

const hex2 = (v) => v.toString(16).padStart(2, '0');
const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => {
  const x = parse(a), y = parse(b);
  return '#' + x.map((v, i) => hex2(Math.round(v + (y[i] - v) * k))).join('');
};

/**
 * A zone's own ramp, for the plain speed trail (no combo running): the zone's particle
 * colour as the body, lightened toward white above it and pulled toward a deep blue-violet
 * below, so it stays that zone's colour -- as the old specks were -- and only the shape
 * changes.
 */
function zoneRamp(theme) {
  const c = theme.particle;
  return [mix(c, '#1a1040', 0.62), c, mix(c, '#ffffff', 0.45), mix(c, '#ffffff', 0.85)];
}
const RAMPS = FIXED_NAMES.map((n) => FIXED[n]).concat(THEMES.map(zoneRamp));

// --- the shapes -----------------------------------------------------------------------
//
// Drawn by hand, as ASCII: at three to nine pixels a rasterised star is a smudge, and every
// pixel here is a decision. Tones: 0 deep, 1 body, 2 light, 3 highlight, '.' empty. Lit
// from the upper left: the up and left rays one step brighter than the down and right ones.
// Four frames each, which is the twinkle -- a full cross, a smaller one, the cross turned
// to an X, the smaller one again -- so that a stream of them, each at its own phase,
// glitters instead of blinking in step.
export const SHAPE = { SPARK: 0, TW5: 1, TW7: 2, STAR7: 3, STAR9: 4, GLINT9: 5 };
export const SHAPE_SIZE = [3, 5, 7, 7, 9, 9];

const SPARK_A = ['.2.', '231', '.1.'];
const SPARK_B = ['2.1', '.3.', '1.0'];
const SPARK_C = ['.1.', '121', '.0.'];
const SPARK_D = ['...', '.3.', '...'];

const TW5_A = ['..1..', '..2..', '12310', '..1..', '..0..'];
const TW5_B = ['.....', '..2..', '.231.', '..1..', '.....'];
const TW5_X = ['.....', '.2.1.', '..3..', '.1.0.', '.....'];

// The seven-pixel twinkle has a 3 x 3 core, its corners toned from the upper left, so it
// reads as a sparkle with a glowing heart rather than as a thin plus. The first drawing had
// one extra pixel at the core's upper-left corner in the BODY tone: the one corner the
// light falls on was the darkest pixel of the core, a notch that also pulled the core half
// a pixel off the crossing of the rays.
const TW7_A = [
  '...1...',
  '...2...',
  '..231..',
  '1233210',
  '..121..',
  '...1...',
  '...0...',
];
const TW7_X = [
  '.......',
  '.1...1.',
  '..2.1..',
  '...3...',
  '..1.1..',
  '.0...0.',
  '.......',
];

// The five-pointed star. Its twinkle is a flash rather than a change of shape: a star
// turned into an X is no longer a star.
const STAR7 = [
  '...2...',
  '...3...',
  '2233211',
  '.23321.',
  '..221..',
  '.21.10.',
  '.1...0.',
];
const STAR9 = [
  '....2....',
  '....3....',
  '...232...',
  '222333211',
  '.2233321.',
  '..23321..',
  '..21.10..',
  '.21...10.',
  '.1.....0.',
];

// Past GLORY: an eight-rayed glint, the one shape nothing below that step sheds.
const GLINT9_A = [
  '....1....',
  '....2....',
  '.1..2..0.',
  '..2.3.1..',
  '122333210',
  '..1.3.0..',
  '.0..1..0.',
  '....1....',
  '....0....',
];
const GLINT9_X = [
  '.........',
  '.1.....0.',
  '..2...1..',
  '...2.1...',
  '....3....',
  '...1.1...',
  '..1...0..',
  '.0.....0.',
  '.........',
];

/** Every tone one step up (a flash) or down (a dim), the deep rim left as it is. */
const shift = (rows, d) => rows.map((r) => r.replace(/[0-3]/g,
  (c) => (c === '0' ? '0' : String(Math.max(0, Math.min(3, Number(c) + d))))));

const FRAMES = [
  [SPARK_A, SPARK_B, SPARK_C, SPARK_D],
  [TW5_A, TW5_B, TW5_X, TW5_B],
  [TW7_A, TW5_A, TW7_X, TW5_A],
  [STAR7, shift(STAR7, 1), STAR7, shift(STAR7, -1)],
  [STAR9, shift(STAR9, 1), STAR9, shift(STAR9, -1)],
  [GLINT9_A, TW7_A, GLINT9_X, TW7_A],
];
export const SHAPES = FRAMES;

/**
 * What a piece burns down to as it dies: a nine-pixel star becomes a seven, a seven a
 * five, a five a spark. Shrinking reads as burning out at this scale; fading alpha alone
 * turns a pale star into a grey one over a coloured sky (the pixel-art-in-code skill,
 * "alpha is not light").
 */
const SMALLER = [SHAPE.SPARK, SHAPE.SPARK, SHAPE.TW5, SHAPE.TW5, SHAPE.STAR7, SHAPE.TW7];

// --- the steps ------------------------------------------------------------------------
//
// One row per multiplier step, so the trail changes palette at the same moment the meter
// ticks over and Game.comboStep throws its burst in the new row's colours. The rows keep
// the callout words' names from when each step shouted one (SWIFT at 50 floors of chain up
// to GLORY at 350), and the words keep their rows' colours (calloutpaint/kit.js), but a
// callout fires at the tower's heights now (game/milestones.js), not with the trail's
// change of palette. `ramps` is what a piece is coloured from (picked
// uniformly; repeat a name to weight it); `mix` is the share of each shape, in SHAPE order
// [spark, tw5, tw7, star7, star9, glint9]. 'ZONE' is the zone's own particle colour.
//
// Stars arrive in order of size, as the mix columns say: sparks and five-pixel twinkles
// from the first floors of a chain, seven-pixel twinkles from SWIFT, seven-pixel stars from
// CHARGE, nine-pixel ones from RAMPAGE, and the eight-rayed glint only at GLORY. CRUSADE is
// the tricolour of Lithuania -- yellow, green, red -- for the Duke of it.
export const STEPS = [
  { name: 'SPEED', ramps: ['ZONE'], mix: [1, 0, 0, 0, 0, 0] },
  { name: 'CHAIN', ramps: ['AMBER', 'GOLD'], mix: [0.82, 0.18, 0, 0, 0, 0] },
  { name: 'SWIFT', ramps: ['AMBER', 'GOLD', 'CYAN'], mix: [0.62, 0.3, 0.08, 0, 0, 0] },
  { name: 'CHARGE', ramps: ['CYAN', 'AZURE', 'GOLD'], mix: [0.52, 0.3, 0.14, 0.04, 0, 0] },
  { name: 'SOARING', ramps: ['CYAN', 'VIOLET', 'MAGENTA'], mix: [0.46, 0.26, 0.14, 0.14, 0, 0] },
  { name: 'RAMPAGE', ramps: ['RED', 'AMBER', 'GOLD'], mix: [0.44, 0.22, 0.14, 0.16, 0.04, 0] },
  { name: 'CRUSADE', ramps: ['GOLD', 'EMERALD', 'RED'], mix: [0.42, 0.2, 0.14, 0.14, 0.1, 0] },
  { name: 'THUNDER', ramps: ['VIOLET', 'CYAN', 'WHITE'], mix: [0.42, 0.2, 0.18, 0.1, 0.1, 0] },
  { name: 'GLORY', ramps: ['GOLD', 'WHITE', 'GOLD', 'AMBER'], mix: [0.36, 0.2, 0.14, 0.1, 0.14, 0.06] },
  // Past GLORY the stars stay gold and white and the sparks run through the whole set in
  // turn (see pickTwinkle), so the tail streams out in bands of colour.
  { name: 'BEYOND', ramps: ['GOLD', 'WHITE'], mix: [0.38, 0.16, 0.12, 0.08, 0.16, 0.1] },
];
const BEYOND = STEPS.length - 1;
const RAINBOW = ['RED', 'AMBER', 'GOLD', 'EMERALD', 'CYAN', 'AZURE', 'VIOLET', 'MAGENTA']
  .map((n) => RAMP[n]);

/** Which row of STEPS a chain of `floors` is on. 0 is no combo at all. */
export function stepFor(floors) {
  if (floors <= 0) return 0;
  if (floors < MULT_STEP) return 1;
  return Math.min(BEYOND, 1 + Math.floor(floors / MULT_STEP));
}

// --- how many, how fast ---------------------------------------------------------------

/**
 * Pieces a second with no combo, at full momentum. [1/s; 45, the old trail's count] At 30
 * the plain speed trail all but vanished: the pieces are drawn behind him now, and those
 * born inside his outline stay hidden until he has moved off them.
 */
const SPEED_RATE = 45;
/** ...at the first floor of a chain, and at SWIFT. [1/s] */
const CHAIN_RATE = [45, 100];
/** Added per floor of chain from SWIFT on, to the ceiling. [1/s per floor; 1.1 = +55 a step] */
const RATE_PER_FLOOR = 1.1;
/** The most, reached at about 500 floors. [1/s at the 'high' setting] */
const RATE_MAX = 600;

/**
 * Pieces per second the trail sheds, before the particle setting scales it.
 *
 * Grows with the CHAIN, not with speed: speed only decides whether he is moving enough to
 * shed at all (the caller's `moving`) and thins it a little while he is still building
 * momentum. A slow step along a ledge in the middle of a chain sheds a few; a 300-floor
 * chain at full tilt sheds a stream.
 */
export function trailRate(floors, momentum, moving) {
  if (!moving) return 0;
  if (floors <= 0) return momentum > 0.35 ? SPEED_RATE * momentum : 0;
  const base = floors < MULT_STEP
    ? CHAIN_RATE[0] + (CHAIN_RATE[1] - CHAIN_RATE[0]) * (floors / MULT_STEP)
    : Math.min(RATE_MAX, CHAIN_RATE[1] + (floors - MULT_STEP) * RATE_PER_FLOOR);
  return base * (0.4 + 0.6 * Math.max(0, Math.min(1, momentum)));
}

/**
 * How each shape moves. life [s], grav [world units/s^2, pulling down], kick [world
 * units/s, the speed it leaves his back at]. Sparks are short and heavy and drop out of
 * the stream; the big stars are light and linger, so they hang in the tail behind him.
 * Drag is shared (TWINKLE_DRAG in particles.js) and sets how soon each settles into its
 * fall: terminal speed is grav / drag, 150 units/s for a spark, 55 for a nine-pixel star.
 *
 * Lives are SHORT, well under a second. He climbs at up to 900 units a second -- three
 * screens' height -- so whatever lives longer is simply left below the view: the first
 * version lived up to 1.1 s and two thirds of the pieces alive were off screen, while the
 * frame showed a thin sprinkle.
 */
export const MOTION = [
  { life: [0.25, 0.45], grav: 240, kick: [40, 90] },
  { life: [0.35, 0.6], grav: 130, kick: [25, 60] },
  { life: [0.45, 0.7], grav: 110, kick: [20, 50] },
  { life: [0.5, 0.8], grav: 100, kick: [20, 45] },
  { life: [0.6, 0.9], grav: 88, kick: [15, 40] },
  { life: [0.5, 0.75], grav: 95, kick: [15, 40] },
];

/**
 * The share of his own velocity a piece leaves with. [0..1; drawn from 0.45 to 0.75]
 *
 * Under one, always: it carries on the way he was going, but slower, so it falls behind
 * him along his own path -- a comet's tail -- and never overtakes him while he moves. At
 * zero (the first version) each piece stood still in the air the instant it was shed and
 * the trail was a dotted line three screens long.
 */
export const INHERIT = [0.45, 0.75];

// --- the zone decides which colours are safe --------------------------------------------
//
// A ramp whose body shares the backdrop's hue AND sits close to its value is the one colour
// in the set that cannot be seen there: AZURE over the CITADEL's blue stone, CYAN over the
// pale ZENITH. Such a ramp is swapped, in that zone only, for the step's next ramp that can
// be seen (or for GOLD). Both tests, because either one alone is enough to separate: the
// first version asked only about hue, and the faint blue in WHITE's body had white stars
// swapped out of the dark COSMOS sky, where they stand at 8:1.
//
// Judged against the sky's lighter stop, which is what the painted backdrops are built
// around. Hue within 32 degrees and a contrast under 3:1 (the WCAG ratio of relative
// luminances) is a clash.
const hueOf = ([r, g, b]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return { h: 0, s: 0 };
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / mx };
};
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function clashes(rampIdx, theme) {
  const sky = theme.sky.map(parse).reduce((a, c) => (lum(c) > lum(a) ? c : a));
  const body = parse(RAMPS[rampIdx][1]);
  const a = lum(sky), b = lum(body);
  const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (contrast >= 3) return false;
  const bg = hueOf(sky), fg = hueOf(body);
  if (bg.s < 0.2 || fg.s < 0.2) return contrast < 1.6;   // a grey on either side: value only
  const dh = Math.min(Math.abs(bg.h - fg.h), 360 - Math.abs(bg.h - fg.h));
  return dh < 32;
}
const rampCache = new Map();
/** The ramp indices a step colours its pieces from in zone `zone` (a THEMES index). */
export function rampsFor(step, zone) {
  const key = step * 64 + zone;
  let r = rampCache.get(key);
  if (r) return r;
  const theme = THEMES[zone] || THEMES[0];
  const want = STEPS[step].ramps.map((n) => (n === 'ZONE' ? ZONE0 + zone : RAMP[n]));
  const ok = want.filter((i) => i >= ZONE0 || !clashes(i, theme));
  r = want.map((i) => (i >= ZONE0 || !clashes(i, theme) ? i : (ok[0] !== undefined ? ok[0] : RAMP.GOLD)));
  rampCache.set(key, r);
  return r;
}
const rainbowCache = new Map();
function rainbowFor(zone) {
  let r = rainbowCache.get(zone);
  if (!r) {
    const theme = THEMES[zone] || THEMES[0];
    r = RAINBOW.filter((i) => !clashes(i, theme));
    rainbowCache.set(zone, r);
  }
  return r;
}

/**
 * Choose one piece: returns shape * 32 + ramp. `u`, `v` are uniform in [0, 1) from the
 * caller's random stream; `clock` is seconds of shedding so far, which past GLORY walks the
 * sparks through the rainbow a colour every RAINBOW_BAND seconds.
 */
const RAINBOW_BAND = 0.07;
export function pickTwinkle(step, zone, u, v, clock) {
  // Walked against the row's own total, and never past its last non-zero entry, so a
  // row whose shares sum to 0.9999999 cannot hand a GLORY glint to a two-floor chain.
  const mix = STEPS[step].mix;
  let total = 0, last = 0;
  for (let i = 0; i < mix.length; i++) if (mix[i] > 0) { total += mix[i]; last = i; }
  let shape = last, acc = 0;
  for (let i = 0; i < last; i++) { acc += mix[i]; if (u * total < acc) { shape = i; break; } }
  let ramp;
  if (step === BEYOND && shape <= SHAPE.TW7) {
    const rb = rainbowFor(zone);
    ramp = rb[Math.floor(clock / RAINBOW_BAND) % rb.length];
  } else {
    const rs = rampsFor(step, zone);
    ramp = rs[Math.floor(v * rs.length) % rs.length];
  }
  return shape * 32 + ramp;
}

// --- the atlas ------------------------------------------------------------------------
//
// One canvas: a CELL x CELL cell per (ramp, shape, frame), the frames across, a row per
// shape, a band of rows per ramp. The zone ramps are painted with the spark only, the one
// shape the speed trail uses; their other rows stay empty, which keeps the addressing one
// multiply and costs nothing to build.
export const CELL = 11;
const HALF = (CELL - 1) / 2;
const NSHAPE = FRAMES.length;
let atlas = null;
export const sparkStats = { buildMs: 0, draws: 0 };

/** The atlas as pixels, before it becomes a canvas. Exported for tools/shot-trail.mjs. */
export function paintAtlas() {
  const w = CELL * 4, h = CELL * NSHAPE * RAMPS.length;
  const p = new Pix(w, h);
  RAMPS.forEach((ramp, ri) => {
    FRAMES.forEach((frames, si) => {
      if (ri >= ZONE0 && si !== SHAPE.SPARK) return;
      frames.forEach((rows, fi) => {
        const ox = fi * CELL + HALF - (rows[0].length - 1) / 2;
        const oy = (ri * NSHAPE + si) * CELL + HALF - (rows.length - 1) / 2;
        rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            const c = row[x];
            if (c !== '.') p.set(ox + x, oy + y, ramp[Number(c)]);
          }
        });
      });
    });
  });
  return p;
}

export function buildAtlas() {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const p = paintAtlas();
  // Smoothing off (canvases.js). Nothing is scaled INTO this one, but the headless canvas
  // never smooths, so no shot would show it if something ever were.
  const { c, g } = newCanvas(p.w, p.h);
  pixToCanvas(p, g);
  sparkStats.buildMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  return c;
}

/** Build the atlas now, if it is not built. Cheap to call every frame. */
export function warmSparks() {
  if (!atlas) atlas = buildAtlas();
  return atlas;
}

export function resetSparks() { atlas = null; }

// --- drawing --------------------------------------------------------------------------

/** Twinkle frames a second. Each piece starts at its own phase. */
const TWINKLE_FPS = 12;

/**
 * Every live trail piece, in world space, with the world transform already set (y up).
 * `view` is { l, r, b, t } in world units, for culling. Two passes, one per alpha, so the
 * canvas state changes twice a frame rather than once a piece.
 *
 * Positions snap to the ART grid (1/PX), as every other particle does: a piece drifting
 * over whole world units would step four pixels at a time.
 */
export function drawSparks(ctx, parts, view) {
  const img = warmSparks();
  const cl = view.l - 4, cr = view.r + 4, cb = view.b - 4, ct = view.t + 4;
  const U = 1 / PX, S = CELL * U, H = HALF * U;
  let draws = 0;
  ctx.save();
  // The world transform points y UP; the atlas is drawn y down. The same flip drawSprite
  // uses, so a five-pointed star stands on its two feet.
  ctx.scale(1, -1);
  // Only the trail's own slots (Particles.shedOne): the ring the bursts share holds none.
  const i0 = parts.trailBase, i1 = parts.trailBase + parts.shedRoom;
  for (let pass = 0; pass < 2; pass++) {
    let opened = false;
    for (let i = i0; i < i1; i++) {
      if (!parts.alive[i] || parts.kind[i] !== TWINKLE) continue;
      const x = parts.x[i], y = parts.y[i];
      if (x < cl || x > cr || y < cb || y > ct) continue;
      const t = parts.life[i] / parts.maxLife[i];
      if ((t <= 0.15 ? 1 : 0) !== pass) continue;
      if (!opened) { ctx.globalAlpha = pass ? 0.6 : 1; opened = true; }
      let shape = parts.shape[i];
      if (t <= 0.4) shape = SMALLER[shape];
      if (t <= 0.15) shape = SMALLER[shape];
      const age = parts.maxLife[i] - parts.life[i];
      const frame = (Math.floor(age * TWINKLE_FPS + parts.rot[i]) & 3);
      const sy = (parts.ramp[i] * NSHAPE + shape) * CELL;
      ctx.drawImage(img, frame * CELL, sy, CELL, CELL,
        Math.round(x * PX) * U - H, -Math.round(y * PX) * U - H, S, S);
      draws++;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  sparkStats.draws = draws;
  return draws;
}
