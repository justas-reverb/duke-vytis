// The HUD's per-zone skin: its gauges and its lettering, drawn in each zone's material.
//
// WHAT THIS REPLACED. The HUD was flat rectangles and plain text: a speed bar and a combo
// meter filled with the zone's accent colour inside a one-unit black edge, text in the
// zone's text colour with a black drop shadow or a black outline -- the same furniture in
// every zone, and four times chunkier than anything drawn beside it, because a "one pixel"
// edge in the HUD's 480 x 270 view units is four backing-store pixels. Everything else on
// screen (the Duke, the ledges, the decor, the walls) is drawn at one art pixel per backing
// pixel in its zone's own hue-shifted ramps; the HUD was the one thing that was not.
//
// WHAT IT IS NOW. Each zone has a skin, painted from its spec in hudpaint.js:
//
//   * the SPEED bar and the COMBO meter, each a frame in the zone's material (bark and
//     leaves in FOREST, cloud in STORM, bone in ABYSS, crystal in NEBULA, gilt in ZENITH
//     ...) around a dark well, and a fill in the zone's own light, plus a brighter HOT fill
//     for the moments the bars used to flash white;
//   * the lettering: the game's own 5 x 7 font, glyph for glyph and at the same places --
//     numbers are read at speed and legibility beats flourish -- but each glyph banded in
//     one of the zone's ramps, lit on its top and left edges and shaded on its bottom and
//     right ones, inside a two-tone keyline (a dark ring in the zone's shadow hue with a
//     near-black outer pixel where it meets the backdrop). Measured against that keyline
//     every letter's body is 6.7:1 or better in every zone, its darkest pixel 4.8:1.
//
// All of it is painted once per zone at ART resolution and drawn in VIEW units at a quarter
// of its pixel size (1 / PX), so every pixel of it lands on one backing-store pixel. A frame
// costs a few drawImage calls: one per gauge frame, one per fill, one fillRect for the fill's
// leading edge, one drawImage per character -- fewer than the old text, whose outline alone
// was eight extra copies of every glyph.
//
// A ZONE CHANGE switches the skin cleanly on the zone's ARRIVAL -- the frame game.themeIndex
// changes, which is also the frame of the arrival flash, the banner and the burst -- not
// half-way through the backdrop's twelve-floor crossfade. Text crossfaded between two skins
// would be two keylines at once, a smear, for twelve floors. The next zone's skin is painted
// ahead, in slices under SKIN_WARM_MS a frame, once the current zone has been on screen for
// WARM_AFTER frames, so nothing is painted mid-frame when it arrives -- into canvases the
// zones behind let go of (canvases.js), so nothing is made in a run either.

import { GLYPHS, GW, GH, CELL, tracking, textWidth } from './font.js';
import { Pix, pixToCanvas } from './decorpaint/util.js';
import { PX, BOARD_SLICE_MS } from '../game/constants.js';
import { HUD_ZONES, GLOWS, DANGER_KEY } from './hudpaint.js';
import { overdue, drain, steps, runUntil } from './slices.js';
import { takeCanvas, releaseCanvas, touchCanvas, newCanvas } from './canvases.js';

/** The gauges' insides, in VIEW units -- the same boxes the flat bars had. */
export const BAR = { w: 74, h: 5 };
export const METER = { w: 7, h: 104 };

/**
 * The same boxes in ART pixels, with the room round each for its frame and ornaments.
 *
 * The room is not the same on every side, and neither is the rim. The bar has the SPEED
 * label's keyline 4 px over it and AIR JUMP READY's 12 px under it, so it is a groove cut
 * in a thing seen a little from above: a 3-px lit top face and a 6-px front face below,
 * heavier caps at the ends where there is room (MAX is 24 px past the right one). The
 * meter has the CHAIN line 40 px above it (room for a finial), FLOORS 16 px below, the
 * wall a dozen px to its left and the combo count riding 12 px to its right, so its right
 * rim is the thin one. `rim` is each side's thickness inside the outline, in art pixels.
 */
export const GAUGE_ART = {
  bar: { iw: BAR.w * PX, ih: BAR.h * PX, ml: 16, mr: 16, mt: 5, mb: 11,
    rim: { t: 3, b: 6, l: 8, r: 8 } },
  meter: { iw: METER.w * PX, ih: METER.h * PX, ml: 10, mr: 6, mt: 40, mb: 11,
    rim: { t: 5, b: 6, l: 6, r: 4 } },
};

/**
 * Frames a zone's skin is on screen before the next zone's is painted ahead, SKIN_WARM_MS of
 * a frame at a time: long enough to leave the arrival's own frames alone (the flash, the
 * title, the burst). It was 200, after the backdrop's warm-up (backdrop.js, 120) and the
 * walls' (walls.js, 150), so the three never painted in the same frame; those are painted at
 * load now (prepaint.js). And 200 had become too long: a skin is some 140 frames of slices,
 * so a zone had to last 340 frames (5.7 s at 60 Hz) for the next skin to be ready, and from
 * lap 2 -- where every skin is painted again, only two being kept -- the ASCENSION's bounce
 * and clock climb the hundred-floor opening band in under four seconds: the attract bot's
 * climb to floor 2640 in tools/test-hudskin.mjs reached DUNGEON's with 8 pieces unpainted.
 * [frames; 30 is 0.125 s at 240 Hz, 0.5 s at 60 Hz]
 */
const WARM_AFTER = 30;

/**
 * What painting the next zone's skin ahead may take of a frame in play [ms; 0.75]. It was 0.5,
 * the scoreboard's BOARD_WARM_MS, until 2026-09-29: the attract bot rebuilt that day, at the new
 * defaults (NORMAL gravity is lighter), climbs a zone in 157 HUD frames at 60 Hz, and the
 * headless climb in tools/test-hudskin.mjs, painting at 0.5 ms a frame, met 5 to 7 pieces of a
 * skin unpainted at an arrival. 0.75 ms is 12% of a 160 Hz frame, spent only in the frames that
 * paint a skin ahead, a dozen or two after each change of zone. It was a whole PIECE a frame --
 * an atlas or a gauge frame,
 * 1.7-3.2 ms in Chromium, measured in an offscreen window at 160 Hz -- on top of the frame's
 * own work; now the pieces are sliced (their painters yield between glyphs and rows once
 * overdue(), as the scoreboard's do) and resumed under a deadline BOARD_SLICE_MS short of
 * this, since a painter hands the frame back only at its next check. A skin is 12-16 ms of
 * painting in Chromium: at 160 Hz done in well under a second, at 60 in about two, and the
 * shortest zone, the first, is seven seconds of the fastest climb.
 */
export const SKIN_WARM_MS = 0.75;

/**
 * The dark plate round each gauge frame, beyond its own outline, in art pixels: with the
 * outline, four -- the lettering's keyline at scale 1 (KEY below), so the gauges and the
 * words sit on the same plate. [art px; 3]
 */
const PLATE = 3;

/** Every character the HUD prints. Anything else is skipped, as drawText skips it. */
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!';
const CHAR_INDEX = new Map([...CHARSET].map((c, i) => [c, i]));

/**
 * The lettering, per scale: the keyline's width in art pixels. At scale 1 the gap between
 * glyphs is one font pixel, 4 art pixels, so a 4-pixel keyline closes it exactly and a word
 * sits on one dark plate; at scale 2 the gap is 16 and an 8-pixel keyline does the same.
 * Thinner left slivers of backdrop between the digits, which read as noise at speed.
 */
const KEY = { 1: 4, 2: 8, 3: 8 };

/** Which inks each scale needs. The shout is the only thing ever drawn at scale 3. */
const ROLES = {
  1: ['ink', 'num', 'hot', 'flash', 'chain', 'gold'],
  2: ['num', 'danger', 'shout'],
  3: ['shout'],
};

/**
 * Whose painting is running: a skin's entry here, or a scoreboard's (gameoverskin.js paints
 * with these same atlases and frames). Every canvas a piece takes is written down in its
 * `owned`, so that when the skin or the board is let go every canvas it had goes back to the
 * pool (canvases.js) for the next zone's -- even one a half-painted piece was holding.
 */
let owner = null;
/** Run `fn` with `o` as the owner of what it paints; for gameoverskin.js. */
export function paintingFor(o, fn) {
  const was = owner;
  owner = o;
  try { return fn(); } finally { owner = was; }
}

/**
 * A canvas for a piece, from the pool: a released one of exactly this size, cleared, or a new
 * one. In play the skins and the boards are painted again and again for the zone ahead, all
 * at the same sizes, so a run reuses what the zones behind it let go of rather than making
 * twenty canvases a zone mid-climb (a canvas's backing is allocated in the frame that first
 * draws into it). Smoothing is off on every one (canvases.js): the glyph masks below are
 * drawn INTO these atlases scaled up four to twelve times, and smoothed, every letter would
 * blur.
 */
function freshCanvas(w, h) {
  const made = takeCanvas(w, h);
  if (owner) owner.owned.push(made.c);
  return made;
}

/** Give back every canvas `o` took; for the skins let go of here and the boards. */
export function releaseOwned(o) {
  for (const c of o.owned) releaseCanvas(c);
  o.owned = [];
}

/** Give back one canvas the running painting took, as scratch it is done with. */
function giveBack(c) {
  if (owner) owner.owned = owner.owned.filter((x) => x !== c);
  releaseCanvas(c);
}

// --- lettering ---------------------------------------------------------------------

/**
 * Glyphs at FONT resolution (6 px a cell, 7 rows), every pixel one flat colour. Kept per
 * colour and character set: each scale's keyline is blitted from the same two.
 *
 * Every lettering function here takes the set of characters its atlas holds, defaulting to
 * the HUD's own. The scoreboard (gameoverskin.js) letters in the same inks and keylines but
 * prints what the HUD never does -- ':' in NEW RECORD:, '/' in 20/28, ',' '+' '-' -- and an
 * atlas missing a character skips it, as drawText skips one it has no glyph for.
 */
//
// SLICED. The scoreboard paints its lettering under a budget of a fraction of a millisecond
// a frame (gameoverskin.js, slices.js), so each atlas below is a generator that yields
// between glyphs once its slice is spent; the plain functions are those generators run to
// the end, and with no deadline set they never yield -- the HUD's own skin is painted
// exactly as it was.
const masks = new Map();
function* maskCanvasSteps(colour, chars = CHARSET) {
  const k = chars === CHARSET ? colour : colour + '|' + chars;
  let m = masks.get(k);
  if (!m) masks.set(k, (m = yield* paintMask(colour, chars)));
  return m;
}
function* paintMask(colour, chars) {
  // Kept for the game (by colour, above): its own canvas, never the pool's -- a mask is the
  // size of a band (below), and masks taking the pool's spare bands left the next skin's ink
  // atlas to make one in play -- and never owned by the skin that first asked.
  const { c, g } = newCanvas(chars.length * CELL, GH);
  g.fillStyle = colour;
  for (let i = 0; i < chars.length; i++) {
    if (overdue()) yield;
    const rows = GLYPHS[chars[i]];
    for (let y = 0; y < GH; y++) {
      let run = -1;
      for (let x = 0; x <= GW; x++) {
        const on = x < GW && rows[y][x] === '#';
        if (on && run < 0) run = x;
        else if (!on && run >= 0) { g.fillRect(i * CELL + run, y, x - run, 1); run = -1; }
      }
    }
  }
  touchCanvas(c);
  return c;
}

/**
 * Every zone's glyph masks, painted now: the colours of each zone's keyline in `specs` (and
 * CLIMB!'s), in each character set of `sets`. A mask is painted the first time a colour is
 * asked for and kept, so without this each new zone's skin made two more canvases in play.
 * For the load-time prepaint (prepaint.js).
 */
export function warmMasks(specs, sets = [CHARSET]) {
  for (const chars of sets) {
    for (const spec of specs) {
      drain(maskCanvasSteps(spec.text.edge, chars));
      drain(maskCanvasSteps(spec.text.line, chars));
    }
    drain(maskCanvasSteps(DANGER_KEY.edge, chars));
    drain(maskCanvasSteps(DANGER_KEY.line, chars));
  }
}

/**
 * Glyphs at font resolution, BANDED: the top two rows in the ramp's light tone, the middle
 * three in its mid tone, the bottom two in its low one -- lit from above, the way every
 * ledge and prop here is. The band lines fall on font rows, so each stroke gets whole
 * blocks of one tone and never a stripe across a block.
 */
function* bandCanvas(ramp, set, chars = CHARSET) {
  // Scratch: inkAtlasSteps gives it back when its atlas is done (and letting the skin go
  // gives it back if the atlas never was).
  const { c, g } = freshCanvas(chars.length * CELL, GH);
  const band = (y) => (y < 2 ? ramp[3] : y < 5 ? ramp[2] : ramp[1]);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!set.includes(ch)) continue;
    if (overdue()) yield;
    const rows = GLYPHS[ch];
    for (let y = 0; y < GH; y++) {
      g.fillStyle = band(y);
      let run = -1;
      for (let x = 0; x <= GW; x++) {
        const on = x < GW && rows[y][x] === '#';
        if (on && run < 0) run = x;
        else if (!on && run >= 0) { g.fillRect(i * CELL + run, y, x - run, 1); run = -1; }
      }
    }
  }
  return c;
}

/** One scale's cell geometry, in art pixels. */
export function cellOf(scale) {
  const b = scale * PX;             // one font pixel, in art pixels
  const o = KEY[scale];
  return { b, o, w: GW * b + 2 * o, h: GH * b + 2 * o };
}

/**
 * The keyline of every glyph at one scale: the glyph dilated by `o` in the edge colour and
 * by `o - 1` in the line colour, so a one-pixel near-black rim meets the backdrop and the
 * zone's dark hue fills the rest. A dilation of a shape made of b x b blocks by r <= b is
 * the union of its copies shifted to the nine points of {-r, 0, r}^2, so each ring is nine
 * blits of the font-resolution mask rather than a pixel loop.
 */
export function keylineAtlas(key, scale, chars = CHARSET) { return drain(keylineAtlasSteps(key, scale, chars)); }

/** keylineAtlas as a generator, yielding between glyphs once its slice is spent. */
export function* keylineAtlasSteps(key, scale, chars = CHARSET) {
  const cell = cellOf(scale);
  const { c, g } = freshCanvas(chars.length * cell.w, cell.h);
  const rings = [[yield* maskCanvasSteps(key.edge, chars), cell.o], [yield* maskCanvasSteps(key.line, chars), cell.o - 1]];
  for (const [mask, r] of rings) {
    for (let i = 0; i < chars.length; i++) {
      for (const dy of [-r, 0, r]) {
        for (const dx of [-r, 0, r]) {
          // A check a blit: at scale 3 each is a 60 x 84 scaled copy.
          if (overdue()) yield;
          g.drawImage(mask, i * CELL, 0, GW, GH,
            i * cell.w + cell.o + dx, cell.o + dy, GW * cell.b, GH * cell.b);
        }
      }
    }
  }
  touchCanvas(c);
  return c;
}

/**
 * One ink at one scale: the keyline, the banded glyph over it, then the art-pixel edges --
 * a one-pixel lit line along every top edge and down every left edge, a one-pixel shade
 * along every bottom edge and up every right one. Those edges are what make the blocks
 * read as lettering cut from the zone's material rather than flat stencils.
 */
export function inkAtlas(spec, role, scale, keyline, chars = CHARSET, set = INKSET[role]) {
  return drain(inkAtlasSteps(spec, role, scale, keyline, chars, set));
}

/** inkAtlas as a generator, yielding between glyphs once its slice is spent. */
export function* inkAtlasSteps(spec, role, scale, keyline, chars = CHARSET, set = INKSET[role]) {
  const ramp = spec.text[role];
  const cell = cellOf(scale);
  const { b, o } = cell;
  const { c, g } = freshCanvas(chars.length * cell.w, cell.h);
  const bands = yield* bandCanvas(ramp, set, chars);
  const bandTone = (y) => (y < 2 ? 3 : y < 5 ? 2 : 1);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!set.includes(ch)) continue;
    if (overdue()) yield;
    const X = i * cell.w + o, Y = o;
    g.drawImage(keyline, i * cell.w, 0, cell.w, cell.h, i * cell.w, 0, cell.w, cell.h);
    g.drawImage(bands, i * CELL, 0, GW, GH, X, Y, GW * b, GH * b);
    if (overdue()) yield;
    const on =(x, y) => x >= 0 && y >= 0 && x < GW && y < GH && GLYPHS[ch][y][x] === '#';
    // Each edge as RUNS -- a row of exposed tops is one rect, a column of exposed left
    // sides in one band is one rect -- because every rect is a canvas call when the skin is
    // painted, and one per font pixel was most of a zone's 30,000.
    const vert = (x, dx, colour, col) => {
      for (let y = 0; y < GH;) {
        if (!on(x, y) || on(x + dx, y)) { y++; continue; }
        const t = bandTone(y);
        let n = 1;
        while (y + n < GH && on(x, y + n) && !on(x + dx, y + n) && bandTone(y + n) === t) n++;
        g.fillStyle = colour(t);
        g.fillRect(X + col, Y + y * b, 1, n * b);
        y += n;
      }
    };
    const horz = (y, dy, colour, row) => {
      for (let x = 0; x < GW;) {
        if (!on(x, y) || on(x, y + dy)) { x++; continue; }
        let n = 1;
        while (x + n < GW && on(x + n, y) && !on(x + n, y + dy)) n++;
        g.fillStyle = colour;
        g.fillRect(X + x * b, Y + row, n * b, 1);
        x += n;
      }
    };
    for (let x = 0; x < GW; x++) {
      vert(x, 1, (t) => ramp[t - 1], (x + 1) * b - 1);
      vert(x, -1, (t) => ramp[t + 1], x * b);
    }
    for (let y = 0; y < GH; y++) {
      horz(y, 1, ramp[0], (y + 1) * b - 1);
      horz(y, -1, ramp[4], y * b);
    }
  }
  // Put on the GPU now, then the bands back: after the flush nothing holds a picture of them.
  touchCanvas(c);
  giveBack(bands);
  return c;
}

/**
 * Which characters each ink ever prints. The numbers are only digits; the rest take the
 * whole set, since labels and callouts are words. An ink asked for a character it lacks
 * falls back to the label ink at that scale (see skinText), never to a blank.
 */
const INKSET = {
  ink: CHARSET, num: '0123456789', hot: CHARSET, flash: CHARSET, chain: CHARSET,
  gold: CHARSET, danger: CHARSET, shout: CHARSET,
};

// --- gauges ------------------------------------------------------------------------

/**
 * A painter's working surface: a material and a tone per pixel, turned into colours only
 * at the end, so shading can ask what a pixel IS and what is next to it (pixel-art-in-code:
 * plan first, colour last). Material 0 is empty; tones run 1 (deepest) to 5 (highlight),
 * and a material's ramp[0] is kept for its outline.
 */
export class Plan {
  constructor(w, h, mats) {
    this.w = w;
    this.h = h;
    this.m = new Uint8Array(w * h);
    this.t = new Int8Array(w * h);
    this.names = Object.keys(mats);
    this.ramps = this.names.map((k) => mats[k]);
  }
  id(name) { return this.names.indexOf(name) + 1; }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  mat(x, y) { return this.in(x, y) ? this.m[y * this.w + x] : 0; }
  tone(x, y) { return this.in(x, y) ? this.t[y * this.w + x] : 0; }
  /** Set a pixel by material NAME (or id) and tone 1..5; out-of-box writes are dropped. */
  set(x, y, mat, tone) {
    x = Math.round(x); y = Math.round(y);
    if (!this.in(x, y)) return;
    const i = y * this.w + x;
    this.m[i] = typeof mat === 'string' ? this.id(mat) : mat;
    this.t[i] = Math.max(1, Math.min(5, tone));
  }
  clear(x, y) { if (this.in(x, y)) { const i = y * this.w + x; this.m[i] = 0; this.t[i] = 0; } }
  /** Nudge the tone of a pixel that is already painted. */
  add(x, y, d) {
    if (!this.mat(x, y)) return;
    const i = y * this.w + x;
    this.t[i] = Math.max(1, Math.min(5, this.t[i] + d));
  }
  rect(x, y, w, h, mat, tone) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, mat, tone); }
  /** A disc, round at small radii (the + 0.8r of decorpaint's Pix.disc). */
  disc(cx, cy, r, mat, tone) {
    const lim = r * r + 0.8 * r;
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) if (x * x + y * y <= lim) this.set(cx + x, cy + y, mat, tone);
    }
  }
  line(x0, y0, x1, y1, mat, tone) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, mat, tone);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /**
   * Shade a blob of one material from its silhouette, lit from the upper left: open above
   * and to the left is the highlight, open above the lit tone, open below and to the right
   * the deepest, open below the shadow (pixel-art-in-code, small solid props).
   */
  shadeBlob(x0, y0, x1, y1, mat, base = 3, skip = null) { drain(this.shadeBlobSteps(x0, y0, x1, y1, mat, base, skip)); }

  /**
   * shadeBlob as a generator, yielding between rows once its slice is spent: the HUD's
   * dressings shade a whole frame's rim with it, and round a scoreboard panel that is a pass
   * over 400,000 pixels (gameoverskin.js).
   */
  *shadeBlobSteps(x0, y0, x1, y1, mat, base = 3, skip = null) {
    const id = typeof mat === 'string' ? this.id(mat) : mat;
    const open = (x, y) => this.mat(x, y) !== id;
    // Pixel and tone in turn, bare numbers: a [x, y, t] per pixel was 40,000 arrays round a
    // scoreboard panel, alive to the end of the pass, for the collector to copy. With this,
    // the outline's hits below and hudpaint.js grain and chips kept the same way, eleven
    // boards painted in Chromium in 1,500 frames of the warm-up instead of 2,700, and the
    // frames over a millisecond -- the collector's pauses -- fell from 71 to 10-13.
    const tones = [];
    for (let y = y0; y <= y1; y++) {
      if (overdue()) yield;
      for (let x = x0; x <= x1; x++) {
        if (this.mat(x, y) !== id || (skip && skip(x, y))) continue;
        const u = open(x, y - 1), l = open(x - 1, y), d = open(x, y + 1), r = open(x + 1, y);
        const t = u && l ? 5 : u ? 4 : d && r ? 1 : d ? 2 : l ? base + 1 : r ? base - 1 : base;
        tones.push(y * this.w + x, t);
      }
    }
    for (let k = 0; k < tones.length; k += 2) {
      if ((k & 8191) === 0 && overdue()) yield;
      this.t[tones[k]] = tones[k + 1];
    }
  }
}

/**
 * A gauge frame: the zone's material round the inside box, bevelled like everything here
 * (lit on its top and left faces, shadowed on the bottom and right, the lip round the well
 * the other way about, because the well is sunk), then the zone's own texture and
 * ornaments, then a selective outline -- each empty pixel touching a material takes THAT
 * material's darkest colour, not one black for all -- and last the well itself, dark and
 * translucent so the backdrop is dimmed behind the fill rather than blanked.
 *
 * `A` is the box and its room, in GAUGE_ART's terms; the gauges pass nothing and get their
 * own. The scoreboard's panels (gameoverskin.js) are the same frames round bigger boxes.
 *
 * `spec.frame(P, geo)` may be a generator (the HUD's dressings are, so a panel's can be
 * sliced); it is run to its end here.
 */
export function paintFrame(spec, kind, A = GAUGE_ART[kind]) { return drain(paintFrameSteps(spec, kind, A)); }

/**
 * paintFrame as a generator, yielding between rows of every pass once its slice is spent.
 * Round a scoreboard panel each pass is 100,000 to 400,000 pixels and the whole frame was
 * up to 22-46 ms in Chromium in one piece -- painted while the Duke fell (gameoverskin.js).
 */
export function* paintFrameSteps(spec, kind, A = GAUGE_ART[kind]) {
  const W = A.iw + A.ml + A.mr + 2 * PLATE, H = A.ih + A.mt + A.mb + 2 * PLATE;
  const P = new Plan(W, H, spec.mats);
  const ix = A.ml + PLATE, iy = A.mt + PLATE, iw = A.iw, ih = A.ih, T = A.rim;
  const rim = P.id('rim');
  const WID = { top: T.t, bottom: T.b, left: T.l, right: T.r };
  // Which face a pixel is on -- whichever edge of the box it is further outside of, as a
  // share of that side's thickness, so each corner is split on its diagonal like a mitred
  // frame -- how far out (1 is the lip against the well, `width` the rim's outer pixel),
  // and how far ALONG that face from the box's top-left corner, which is what joints,
  // grain and beads are spaced by.
  const face = (x, y) => {
    const ox = x < ix ? ix - x : x >= ix + iw ? x - (ix + iw - 1) : 0;
    const oy = y < iy ? iy - y : y >= iy + ih ? y - (iy + ih - 1) : 0;
    const fx = ox / (x < ix ? T.l : T.r), fy = oy / (y < iy ? T.t : T.b);
    const side = fy >= fx ? (y < iy ? 'top' : 'bottom') : (x < ix ? 'left' : 'right');
    const vert = side === 'top' || side === 'bottom';
    return { side, out: vert ? oy : ox, along: vert ? x - ix : y - iy, width: WID[side] };
  };
  const ring = (x, y) => x >= ix - T.l && x < ix + iw + T.r && y >= iy - T.t && y < iy + ih + T.b &&
    !(x >= ix && x < ix + iw && y >= iy && y < iy + ih);
  for (let y = iy - T.t; y < iy + ih + T.b; y++) {
    if (overdue()) yield;
    for (let x = ix - T.l; x < ix + iw + T.r; x++) {
      if (!ring(x, y)) continue;
      const { side, out, width } = face(x, y);
      const lit = side === 'top' || side === 'left';
      // The bevel: lit faces bright with a highlight on the outer edge; the faces turned
      // away from the light step down across their width to the deepest tone outside; the
      // lip round the sunk well the other way about.
      let t = lit ? 4 : out <= width / 2 ? 3 : 2;
      if (out === width) t = lit ? 5 : 1;
      else if (out === 1) t = lit ? 2 : 4;
      P.set(x, y, rim, t);
    }
  }
  const geo = {
    kind, W, H, ix, iy, iw, ih, T, rim, face, ring,
    top: iy - T.t, bottom: iy + ih + T.b - 1, left: ix - T.l, right: ix + iw + T.r - 1,
  };
  if (spec.frame) yield* steps(spec.frame(P, geo));

  const pix = new Pix(W, H);
  for (let y = 0; y < H; y++) {
    if (overdue()) yield;
    for (let x = 0; x < W; x++) {
      const m = P.m[y * W + x];
      if (m) pix.set(x, y, P.ramps[m - 1][P.t[y * W + x]]);
    }
  }
  // The outline, in the darkest tone of whichever material it wraps (four-neighbour, so
  // corners round off the way the Duke's and the ledges' do). The well is not a neighbour:
  // the lip already shades it.
  const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const well = (x, y) => x >= ix && x < ix + iw && y >= iy && y < iy + ih;
  const hits = [];   // x, y and material in turn, bare numbers (see Plan.shadeBlobSteps)
  for (let y = 0; y < H; y++) {
    if (overdue()) yield;
    for (let x = 0; x < W; x++) {
      if (P.m[y * W + x] || well(x, y)) continue;
      for (const [dx, dy] of n4) {
        const m = P.mat(x + dx, y + dy);
        if (m && !GLOWS.has(P.names[m - 1])) { hits.push(x, y, m); break; }
      }
    }
  }
  for (let k = 0; k < hits.length; k += 3) {
    if ((k & 4095) === 0 && overdue()) yield;
    pix.set(hits[k], hits[k + 1], P.ramps[hits[k + 2] - 1][0]);
  }

  // The plate: the lettering's keyline carried round the frame -- two pixels of the zone's
  // keyline colour and a near-black pixel outside them, the same two colours every word of
  // the HUD sits on. Without it the frames were drawn in the very materials of their zone's
  // ledges with a one-pixel outline, as the ledges are, and wherever the bar was near empty
  // or a ledge of that material passed behind it, it read as one: STORM's empty speed bar
  // was a strip of cream cloud among the cloud ledges, ZENITH's a gold bar under a gold
  // ledge, DOWNTOWN's and NEBULA's ran on into the gallery and the crystal ledge beside them.
  // No ledge has a plate; every HUD element now does. Lights (stars, glints) are not wrapped
  // -- they keep no outline -- so their arms still reach out over the backdrop.
  //
  // Built by stamping a disc of squared distances round each EDGE pixel of the silhouette
  // (the nearest solid pixel to anything outside is always one with an open side), not by
  // searching round every empty pixel: this piece is painted inside a frame while the next
  // zone warms, and the search was two million calls for the meter.
  const N = W * H, a = pix.data;
  const solid = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    if (overdue()) yield;
    for (let i = y * W, e = i + W; i < e; i++) {
      const m = P.m[i];
      solid[i] = a[i * 4 + 3] && !(m && GLOWS.has(P.names[m - 1])) ? 1 : 0;
    }
  }
  const R2 = PLATE * PLATE + 1, R1 = (PLATE - 1) * (PLATE - 1) + 1;   // 10 and 5: 3 px, 2 px
  const d2 = new Uint8Array(N).fill(255);
  for (let y = 0; y < H; y++) {
    if (overdue()) yield;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i]) continue;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && solid[i - 1] && solid[i + 1] && solid[i - W] && solid[i + W]) continue;
      for (let dy = -PLATE; dy <= PLATE; dy++) {
        const Y = y + dy;
        if (Y < 0 || Y >= H) continue;
        for (let dx = -PLATE; dx <= PLATE; dx++) {
          const X = x + dx, d = dx * dx + dy * dy;
          if (X < 0 || X >= W || d > R2) continue;
          if (d < d2[Y * W + X]) d2[Y * W + X] = d;
        }
      }
    }
  }
  for (let y = 0; y < H; y++) {
    if (overdue()) yield;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a[i * 4 + 3] || d2[i] > R2 || well(x, y)) continue;
      pix.set(x, y, d2[i] <= R1 ? spec.text.line : spec.text.edge);
    }
  }

  // The well goes on the canvas FIRST, as three rects -- the zone's deepest colour,
  // translucent, with a deeper row and column along its top and left where the frame's lit
  // faces overhang it -- and the painted frame over it, so an ornament that reaches into
  // the well stays in front. Painted into the Pix it was two runs a row, 900 calls for the
  // meter's well alone.
  if (overdue()) yield;
  const { c, g } = freshCanvas(W, H);
  const hex2 = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  g.fillStyle = spec.well + hex2(Math.min(1, spec.wellA + 0.2));
  g.fillRect(ix, iy, iw, 1);
  g.fillRect(ix, iy + 1, 1, ih - 1);
  g.fillStyle = spec.well + hex2(spec.wellA);
  // In bands of rows, each pixel filled once, so a big panel's well can be cut into slices.
  for (let y = iy + 1; y < iy + ih; y += 64) {
    if (overdue()) yield;
    g.fillRect(ix + 1, y, iw - 1, Math.min(64, iy + ih - y));
  }
  yield* pixRuns(pix, g);
  touchCanvas(c);
  return { c, ox: ix, oy: iy };
}

/**
 * A Pix onto a canvas as runs of identical pixels, along rows or down columns, whichever
 * makes fewer: every run is a canvas call when a skin is painted. The meter's frame is 467
 * rows of rails a few pixels wide, 3,900 runs across and about a third of that down. Opaque
 * pixels only ever (frames have no translucent pixels, and the well is under them). A
 * generator, yielding between rows (or columns) once its slice is spent: round a scoreboard
 * panel it is ten thousand calls.
 */
function* pixRuns(pix, g) {
  const d = pix.data, w = pix.w, h = pix.h;
  const same = (i, j) => d[i] === d[j] && d[i + 1] === d[j + 1] && d[i + 2] === d[j + 2] && d[i + 3] === d[j + 3];
  const count = function* (major, minor, at) {
    let n = 0;
    for (let a = 0; a < major; a++) {
      if (overdue()) yield;
      for (let b = 0; b < minor;) {
        const i = at(a, b);
        if (!d[i + 3]) { b++; continue; }
        let k = 1;
        while (b + k < minor && same(i, at(a, b + k))) k++;
        n++;
        b += k;
      }
    }
    return n;
  };
  const row = (y, x) => (y * w + x) * 4, col = (x, y) => (y * w + x) * 4;
  if ((yield* count(h, w, row)) <= (yield* count(w, h, col))) {
    for (let y = 0; y < h; y++) {
      if (overdue()) yield;
      pixToCanvas(pix, g, 0, 0, y, y + 1);
    }
    return;
  }
  const hex2 = (v) => v.toString(16).padStart(2, '0');
  for (let x = 0; x < w; x++) {
    if (overdue()) yield;
    for (let y = 0; y < h;) {
      const i = col(x, y);
      if (!d[i + 3]) { y++; continue; }
      let k = 1;
      while (y + k < h && same(i, col(x, y + k))) k++;
      g.fillStyle = '#' + hex2(d[i]) + hex2(d[i + 1]) + hex2(d[i + 2]) + (d[i + 3] === 255 ? '' : hex2(d[i + 3]));
      g.fillRect(x, y, 1, k);
      y += k;
    }
  }
}

/**
 * A gauge's fill: the zone's light in a glossy tube, lit from the upper left. Across the
 * bar's twenty rows: a lit top row, a three-row highlight band, then mid, shadow, and a
 * deepest bottom row; across the meter's twenty-eight columns the same, left to right
 * (the cylinder rule: the lit quarter, the deep fifth). The zone's pattern -- specks,
 * bolts -- nudges tones on top of that.
 *
 * Painted as the bands' rects and then only the pixels the pattern changes, merged into
 * runs, straight onto the canvas: a Pix turned into runs cost seven calls a row, 3,000 for
 * the meter, for a picture that is six stripes and a few dozen specks.
 */
function* paintFill(spec, kind, ramp) {
  const A = GAUGE_ART[kind];
  const w = A.iw, h = A.ih;
  const { c, g } = freshCanvas(w, h);
  const across = (u) => (u < 0.05 ? 3 : u < 0.2 ? 5 : u < 0.45 ? 4 : u < 0.75 ? 3 : u < 0.95 ? 2 : 1);
  const n = kind === 'bar' ? h : w;
  const band = [];
  for (let i = 0; i < n; i++) band.push(across((i + 0.5) / n));
  for (let i = 0; i < n;) {
    let k = 1;
    while (i + k < n && band[i + k] === band[i]) k++;
    g.fillStyle = ramp[band[i]];
    if (kind === 'bar') g.fillRect(0, i, w, k); else g.fillRect(i, 0, k, h);
    i += k;
  }
  if (spec.pattern) {
    for (let y = 0; y < h; y++) {
      if (overdue()) yield;
      for (let x = 0; x < w;) {
        const base = band[kind === 'bar' ? y : x];
        const d = spec.pattern(x, y, kind, w, h) || 0;
        if (!d) { x++; continue; }
        const t = Math.max(1, Math.min(5, base + d));
        let k = 1;
        while (x + k < w) {
          const b2 = band[kind === 'bar' ? y : x + k];
          const d2 = spec.pattern(x + k, y, kind, w, h) || 0;
          if (!d2 || Math.max(1, Math.min(5, b2 + d2)) !== t) break;
          k++;
        }
        g.fillStyle = ramp[t];
        g.fillRect(x, y, k, 1);
        x += k;
      }
    }
  }
  touchCanvas(c);
  return c;
}

// --- the skins ---------------------------------------------------------------------

const skins = new Map();     // zone name -> { name, parts: {}, pending: [] }
let lateBuilds = 0;

/** CLIMB!'s keyline is the same in every zone, so it is painted once and shared. */
const dangerKeys = new Map();
function dangerKeyline(scale) {
  // Shared by every zone's skin, so owned by none: letting a skin go must not give it back.
  if (!dangerKeys.has(scale)) dangerKeys.set(scale, paintingFor(null, () => keylineAtlas(DANGER_KEY, scale)));
  return dangerKeys.get(scale);
}

/** The pieces of a zone's skin, each a function that paints one of them. */
function piecesFor(name) {
  const spec = HUD_ZONES[name] || HUD_ZONES.BASEMENT;
  const out = [];
  // Each a generator (or a finished value, for the shared keyline), so a piece can be cut
  // into slices under a deadline (paintSkin) and still painted whole by warmHudSkin.
  for (const scale of [1, 2, 3]) {
    out.push([`key${scale}`, () => keylineAtlasSteps(spec.text, scale)]);
    // CLIMB! has a keyline of its own, the same near-black in every zone (hudpaint.js).
    if (ROLES[scale].includes('danger')) out.push([`keyDanger${scale}`, () => dangerKeyline(scale)]);
    for (const role of ROLES[scale]) {
      const key = role === 'danger' ? `keyDanger${scale}` : `key${scale}`;
      out.push([`${role}${scale}`, (s) => inkAtlasSteps(spec, role, scale, s.parts[key])]);
    }
  }
  for (const kind of ['bar', 'meter']) {
    out.push([`${kind}Frame`, () => paintFrameSteps(spec, kind)]);
    out.push([`${kind}Fill`, () => paintFill(spec, kind, spec.fill)]);
    out.push([`${kind}Hot`, () => paintFill(spec, kind, spec.fillHot)]);
  }
  return out;
}

function skinEntry(name) {
  let s = skins.get(name);
  if (!s) {
    s = { name, spec: HUD_ZONES[name] || HUD_ZONES.BASEMENT, parts: {}, pending: piecesFor(name), gen: null, owned: [] };
    skins.set(name, s);
  }
  return s;
}

/**
 * Paint ONE outstanding piece of a zone's skin, whole. Returns false once there is none left.
 * A piece a slice (paintSkin) has started is finished first.
 */
function stepSkin(s) {
  if (!s.gen && !s.pending.length) return false;
  paintingFor(s, () => drain(pieceSteps(s)));
  return true;
}

/**
 * The next piece of a skin as a generator that yields between its rows and glyphs once its
 * slice is spent; resumed across calls through s.gen until the piece is in s.parts. Returns
 * whether a piece was finished.
 */
function* pieceSteps(s) {
  if (!s.gen) {
    const next = s.pending[0];
    if (!next) return false;
    const [key, paint] = next;
    s.gen = (function* () { s.parts[key] = yield* steps(paint(s)); s.pending.shift(); })();
  }
  const gen = s.gen;
  yield* gen;
  s.gen = null;
  return true;
}

/** Every outstanding piece of a skin in turn, sliced: what hudSkinFor resumes. */
function* paintSkin(s) {
  while (s.pending.length) {
    if (overdue()) yield;
    yield* pieceSteps(s);
  }
}

/**
 * Paint what a zone's skin still lacks, now -- all of it, or at most `n` pieces, each whole.
 * For load time, a zone that arrived before its skin was done, and the tools; the game paints
 * ahead in slices under SKIN_WARM_MS in hudSkinFor.
 */
export function warmHudSkin(name, n = Infinity) {
  const s = skinEntry(name);
  for (let i = 0; i < n && stepSkin(s); i++);
  return s;
}

/**
 * When each call painting a skin ahead in a run began and ended, as performance.now() times in
 * turn [t0, t1, t0, t1, ...], the last few thousand calls: for the tools, which hold them to
 * SKIN_WARM_MS less any collector's pause inside (tools/test-smooth.mjs).
 */
const warmTimes = [];
export function skinWarmTimes() { return warmTimes.slice(); }

/**
 * Pieces painted inside a frame because nobody warmed them (must stay 0 in play), how many
 * zones have a skin, and which one is being drawn.
 */
export function hudSkinStats() {
  return { lateBuilds, zones: skins.size, current: current ? current.name : null, warmCalls,
    ahead: ahead && ahead !== current ? ahead.name : null, aheadDone: !!(ahead && !ahead.pending.length) };
}
export function resetHudSkinStats() { lateBuilds = 0; }

/**
 * For the tools: let go of every skin but BASEMENT's, as after loading, and start counting
 * frames in a zone again from zero.
 */
export function resetHudSkins() {
  for (const [k, s] of [...skins]) if (k !== 'BASEMENT') { releaseOwned(s); skins.delete(k); }
  current = null;
  ahead = null;
  framesIn = 0;
}

let current = null;
let framesIn = 0;
let ahead = null;
let warmCalls = 0;

/**
 * The skin to draw this frame. Switches the moment game.theme changes (the zone's arrival,
 * under its flash), and from WARM_AFTER frames into a zone paints the next zone's skin ahead,
 * SKIN_WARM_MS of each frame of a run at most.
 */
export function hudSkinFor(game) {
  const th = game.theme;
  if (!current || current.name !== th.name) {
    // Let go of every skin but the opening zone's (a new run always starts there) and the
    // one arriving. A skin is about 6 MB of canvas -- the scale-3 shout atlas alone is
    // 2,888 x 100 -- so keeping all twelve would hold some 70 MB for zones a run will not
    // see again for 2,300 floors; the next one is painted ahead when it is needed, into the
    // canvases the one let go of here gives back to the pool.
    for (const [k, s] of [...skins]) {
      if (k !== 'BASEMENT' && k !== th.name) { releaseOwned(s); skins.delete(k); }
    }
    current = skinEntry(th.name);
    if (current.pending.length) {
      lateBuilds += current.pending.length;
      warmHudSkin(th.name);
    }
    framesIn = 0;
    ahead = null;
  }
  framesIn++;
  // Ahead only in a run: the HUD is drawn once more in the fall, into the layer it fades out
  // as (screens.js drawHudExit), and nothing may be painted in the fall.
  const st = game.state;
  if (framesIn >= WARM_AFTER && (st === 'playing' || st === 'paused')) {
    if (!ahead) {
      const nx = game.nextTheme;
      ahead = nx && nx.name !== th.name ? skinEntry(nx.name) : current;
    }
    if (ahead.pending.length) {
      const t0 = performance.now();
      if (!ahead.run) ahead.run = paintSkin(ahead);
      const r = paintingFor(ahead, () => runUntil(ahead.run, t0 + SKIN_WARM_MS - BOARD_SLICE_MS));
      if (r.done) ahead.run = null;
      warmTimes.push(t0, performance.now());
      if (warmTimes.length > 8192) warmTimes.splice(0, 4096);
      warmCalls++;
    }
  }
  return current;
}

// The opening zone is painted at load, before any frame: a new run always starts there.
if (typeof document !== 'undefined' && document.createElement) warmHudSkin('BASEMENT');

// --- drawing -----------------------------------------------------------------------

/**
 * Text in one of the skin's inks, laid out exactly as font.js drawText lays it out -- the
 * same advance, tracking and alignment rounding -- so every element stays where players
 * have learned to look. One drawImage per character.
 */
export function skinText(ctx, skin, role, str, x, y, scale = 1, align = 'left') {
  const atlas = skin.parts[`${role}${scale}`];
  if (!atlas) return 0;
  const has = INKSET[role];
  // The whole-set ink at this scale, for a character this ink was not painted with.
  const spare = skin.parts[`ink${scale}`] || skin.parts[`shout${scale}`] || atlas;
  str = String(str).toUpperCase();
  const w = textWidth(str, scale);
  let px = align === 'center' ? Math.round(x - w / 2)
         : align === 'right' ? Math.round(x - w)
         : Math.round(x);
  const top = Math.round(y);
  const cell = cellOf(scale);
  const U = 1 / PX;
  const step = CELL * scale + tracking(scale);
  for (let i = 0; i < str.length; i++) {
    const k = CHAR_INDEX.get(str[i]);
    if (k !== undefined) {
      ctx.drawImage(has.includes(str[i]) ? atlas : spare, k * cell.w, 0, cell.w, cell.h,
        px - cell.o * U, top - cell.o * U, cell.w * U, cell.h * U);
    }
    px += step;
  }
  return w;
}

/**
 * A gauge: its frame, then the fill up to `frac` (left to right for the bar, bottom to top
 * for the meter), then a two-pixel leading edge in the hot fill's brightest tone where the
 * fill stops. `hot` swaps in the hot fill -- the moments the old bars flashed white.
 * (x, y) is the inside box's top-left in view units, as the flat bars took it.
 */
export function skinGauge(ctx, skin, kind, x, y, frac, hot) {
  const A = GAUGE_ART[kind];
  const U = 1 / PX;
  const f = skin.parts[`${kind}Frame`];
  if (!f) return;
  ctx.drawImage(f.c, 0, 0, f.c.width, f.c.height, x - f.ox * U, y - f.oy * U, f.c.width * U, f.c.height * U);
  const fill = skin.parts[hot ? `${kind}Hot` : `${kind}Fill`];
  const k = Math.min(1, Math.max(0, frac || 0));
  const edge = skin.spec.fillHot[5];
  if (kind === 'bar') {
    const n = Math.round(A.iw * k);
    if (n <= 0) return;
    ctx.drawImage(fill, 0, 0, n, A.ih, x, y, n * U, A.ih * U);
    if (n < A.iw) {
      ctx.fillStyle = edge;
      ctx.fillRect(x + Math.max(0, n - 2) * U, y, Math.min(2, n) * U, A.ih * U);
    }
  } else {
    const n = Math.round(A.ih * k);
    if (n <= 0) return;
    ctx.drawImage(fill, 0, A.ih - n, A.iw, n, x, y + (A.ih - n) * U, A.iw * U, n * U);
    if (n < A.ih) {
      ctx.fillStyle = edge;
      ctx.fillRect(x, y + (A.ih - n) * U, A.iw * U, Math.min(2, n) * U);
    }
  }
}
