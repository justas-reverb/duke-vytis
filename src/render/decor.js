// Things that GROW FROM the platforms, drawn as sprites.
//
// The drawn platform tiles (platart.js) make a ledge look like the right substance; these
// make it look like it belongs to a place. A forest band needs trees sprouting out of the
// planks, not just brown planks.
//
// WHAT THIS REPLACED. This file used to BE the furniture: twelve painter functions, one per
// zone, drawing rectangles in WORLD units straight onto the frame every frame. One world
// unit is PX = 4 screen pixels, so every trunk, bone and cobweb thread was four times
// chunkier than the Duke and the tiles it stood on. Those painters are in
// decorpaint/legacy.js now -- they were the placeholders while the zones were redrawn, and
// today only tools/shot-decor.mjs --legacy draws them -- and this is only the runtime:
//
//   - what each zone's furniture is, and where a ledge puts it, is in decorpaint/ -- one
//     module per zone, and decorpaint/index.js says what every field means;
//   - each element is a SPRITE at art resolution, one art pixel per backing-store pixel at
//     zoom 1, built once from the artist's PNG, else from the zone's paint(), else from its
//     placeholder, and cached by (zone, element, variant, frame);
//   - a ledge's furniture is one drawImage per element, through the same world transform
//     as the platform tiles, on the art-pixel grid.
//
// A ledge always carries the same furniture: its scene is drawn from a random stream
// seeded by its own floor number, so nothing flickers or reshuffles as it scrolls.

import { PX, PLAT_THICK } from '../game/constants.js';
import { mulberry32 } from '../core/rng.js';
import { THEMES } from '../game/themes.js';
import { ZONES, ZONE_BY_NAME, CHANCE_BY_THEME } from './decorpaint/index.js';
import { Pix, pixToCanvas, shade } from './decorpaint/util.js';
import { DECOR_FILES } from './decorart.js';
import { ZONES as TILES, HEAD } from './platart.js';
import { newCanvas } from './canvases.js';

/** Ledges narrower than this carry nothing. [world units; the narrowest ledge is 24] */
export const DECOR_MIN_W = 22;

/** The share of ledges carrying furniture in a zone that does not say. */
export const DECOR_CHANCE = 0.55;

export function chanceFor(themeIndex) {
  const c = CHANCE_BY_THEME[themeIndex];
  return c === undefined ? DECOR_CHANCE : c;
}

// --- the artist's PNGs -------------------------------------------------------------
//
// Loaded once, at startup, and only the ones decorart.js lists -- requesting a file that is
// not there is a 404, and the desktop build's smoke test fails on any 404. An element whose
// PNG has not finished loading is painted instead until it has, then rebuilt.
const images = new Map();
function image(path) {
  if (typeof Image === 'undefined') return null;
  let im = images.get(path);
  if (!im) {
    im = new Image();
    im.src = path;
    images.set(path, im);
  }
  return im;
}
const ready = (im) => !!im && im.complete && (im.naturalWidth || im.width) > 0;

export function preloadDecor() {
  for (const zone of Object.values(DECOR_FILES)) for (const path of Object.values(zone)) image(path);
}

// --- the sprite cache -------------------------------------------------------------

const cells = new Map();

/**
 * One cell -- one variant, one frame of one element -- freshly built, not cached:
 * { img, sx, sy, source, pending }. `img` is the PNG itself for delivered art (frames side
 * by side, variants stacked, so the cell is a source rect in it) and a box-sized canvas
 * otherwise. `pending` names a listed PNG that had not loaded yet. `files` is the manifest,
 * swappable so the tests can point it at a PNG of their own.
 */
export function buildCell(zone, key, e, variant, frame, th, files = DECOR_FILES) {
  const [w, h] = e.box;
  const path = files[zone] && files[zone][key];
  if (path) {
    const im = image(path);
    if (ready(im)) return { img: im, sx: frame * w, sy: variant * h, source: 'png', pending: null };
  }
  // Smoothing off (canvases.js): a fresh canvas smooths by default, and the placeholders draw
  // a scaled painter into it. Nothing here is resampled today (whole art pixels, fillRect
  // only), but the next thing added might be, and the headless canvas never smooths, so no
  // shot would show the blur.
  const { c, g } = newCanvas(w, h);
  let source = 'none';
  if (typeof e.paint === 'function') {
    const p = new Pix(w, h);
    e.paint(p, variant, frame, th);
    pixToCanvas(p, g);
    source = 'paint';
  } else if (typeof e.paintCanvas === 'function') {
    e.paintCanvas(g, variant, frame, th);
    source = 'placeholder';
  }
  return { img: c, sx: 0, sy: 0, source, pending: path || null };
}

/**
 * A cell from the cache, built the first time it is asked for. The element is looked up
 * in the registry by zone and key unless it is passed in (`el`), as a tool drawing a zone
 * of its own does.
 */
export function spriteFor(zone, key, variant, frame, th, el) {
  const id = `${zone}|${key}|${variant}|${frame}`;
  let c = cells.get(id);
  if (c && !(c.pending && ready(image(c.pending)))) return c;
  const z = ZONE_BY_NAME[zone];
  const e = el || (z && z.ELEMENTS[key]);
  if (!e) return null;
  c = buildCell(zone, key, e, variant, frame, th);
  cells.set(id, c);
  return c;
}

/**
 * Build every sprite of a zone now, so the first ledge of it on screen costs nothing.
 * Called by the backdrop while the zone before it is on screen (Backdrop.warm), one frame
 * after the next zone's three background layers. Returns how many cells it built.
 */
export function warmDecor(themeIndex, theme = THEMES[themeIndex]) {
  const z = ZONES[themeIndex];
  if (!z) return 0;
  let n = 0;
  for (const [key, e] of Object.entries(z.ELEMENTS)) {
    for (let v = 0; v < e.variants; v++) {
      for (let f = 0; f < e.frames; f++) {
        const id = `${z.name}|${key}|${v}|${f}`;
        if (cells.has(id)) continue;
        spriteFor(z.name, key, v, f, theme);
        n++;
      }
    }
  }
  return n;
}

export function resetDecorCache() { cells.clear(); }

// --- drawing ------------------------------------------------------------------------

/** Which frame an animated element shows at time t, offset by the instance's phase. */
export function frameAt(e, t, phase) {
  if (!(e.frames > 1)) return 0;
  const f = Math.floor(t * (e.fps || 1) + (e.frames * phase) / (2 * Math.PI));
  return ((f % e.frames) + e.frames) % e.frames;
}

/**
 * Where a hanging thing hangs FROM: the underside the zone's platform tile DRAWS, in art
 * px below the walking surface -- not the ledge's physics thickness.
 *
 * It was PLAT_THICK x PX, 28 px, for every zone, which is right only where the tile is
 * solid all the way down. The crypt's stone ends 16 px under the surface (13 at its
 * shallowest, with 1-px drips below), so the manacle hung 12 px under the stone from
 * nothing, in every frame; its verifier found it. Measured once per zone from the tile
 * art: for each column of the repeating tile, how many rows are solid going down from the
 * surface before the first gap, and the MEDIAN of those, so a drip or a notch does not
 * move it. A zone with no tile art keeps the physics thickness.
 */
const undersides = new Map();
export function undersideFor(name) {
  if (undersides.has(name)) return undersides.get(name);
  const rows = TILES[name] && TILES[name].tile;
  let d = PLAT_THICK * PX;
  if (rows && rows.length > HEAD) {
    const runs = [];
    for (let x = 0; x < rows[0].length; x++) {
      let y = HEAD;
      while (y < rows.length && rows[y][x] !== '.') y++;
      runs.push(y - HEAD);
    }
    runs.sort((a, b) => a - b);
    d = Math.max(1, runs[runs.length >> 1]);
  }
  undersides.set(name, d);
  return d;
}

/** How far a hanging thing's top row laps up over the stone's last row, in art px: an
 *  underside is ragged, and without the lap a column of sky shows between them. */
export const HANG_LAP = 1;

/**
 * Where an element's box sits, in art px above the walking surface: its BOTTOM edge.
 * Negative is below the surface -- a hanging thing's box starts at the ledge's drawn
 * underside (`under`, from undersideFor; the physics thickness if not given), lapping
 * HANG_LAP over it, and hangs its own height further.
 */
export function boxBottom(e, t = 0, phase = 0, under = PLAT_THICK * PX) {
  let b = e.anchor === 'hang' ? -(under - HANG_LAP) - e.box[1] : e.anchor === 'float' ? (e.lift || 0) : 0;
  if (e.bob) b += Math.round(e.bob(t, phase));
  return b;
}

/**
 * How far any ledge's furniture can reach above its walking surface (`up`) and below it
 * (`down`, a hanging thing), in world units, over every zone's elements. The death uses it
 * to tell a ledge the fire's crust covers completely -- nothing of it or on it reaches above
 * the fire's line -- from one that shows. Measured from the registry rather than kept as a
 * number, so a taller tree drawn tomorrow moves it. A bob is allowed its two world units.
 */
let reach = null;
export function decorReach() {
  if (reach) return reach;
  let up = 0, down = 0;
  for (const z of ZONES) {
    if (!z) continue;
    const under = undersideFor(z.name);
    for (const e of Object.values(z.ELEMENTS)) {
      const b = boxBottom({ ...e, bob: null }, 0, 0, under);
      up = Math.max(up, b + e.box[1] + (e.bob ? 2 * PX : 0));
      down = Math.max(down, -b);
    }
  }
  reach = { up: up / PX, down: down / PX };
  return reach;
}

/** Every ledge's stream, seeded by its own floor number, so nothing reshuffles as it scrolls. */
const ledgeStream = (pl) => mulberry32((pl.n * 2654435761) >>> 0);

/**
 * Whether this ledge carries anything at all in this zone: nothing on a ledge under
 * DECOR_MIN_W, and on the rest only the zone's CHANCE of them, decided by the first draw
 * of the ledge's own stream.
 *
 * Split out of drawDecor so a tool can ASK rather than keep its own copy of the rule --
 * tools/shot-platforms.mjs has to find a furnished ledge to photograph, and the one thing
 * a reference sheet must never do is re-implement what it claims to be showing.
 */
export function carriesDecor(pl, themeIndex) {
  if (pl.w < DECOR_MIN_W) return false;
  if (!ZONES[themeIndex]) return false;
  return ledgeStream(pl)() < chanceFor(themeIndex);
}

/**
 * A ledge's furniture. Called from Renderer.drawPlatforms inside the world transform
 * (world units, y up), after the ledge.
 */
export function drawDecor(ctx, pl, themeIndex, theme, t) {
  if (!carriesDecor(pl, themeIndex)) return;
  const z = ZONES[themeIndex];
  const r = ledgeStream(pl);
  // The chance roll again, on this ledge's own stream, because the scene is drawn from
  // what comes AFTER it. carriesDecor makes the same draw from an identical stream, so
  // every ledge's furniture is the arrangement it has always had.
  r();
  drawScene(ctx, pl, z, z.scene(r, Math.floor(pl.w * PX), theme), theme, t);
}

/**
 * Draw a list of { key, variant, x } on a ledge { x, y, w } (world units), in the world
 * transform. Exported for the tools, which draw a chosen scene rather than a random one;
 * an item may also carry `frame` to show that frame whatever the time.
 *
 * Every position is on the ART grid: the ledge's left end is rounded to an art pixel once
 * (it is a whole world unit for every ledge but the ground's), each x is a whole number of
 * art pixels from it, and each box's height in art pixels is whole. At zoom 1 that puts
 * every art pixel on exactly one backing-store pixel, and at zoom 2 on exactly a 2 x 2
 * block -- the transform under it is already on whole pixels (setWorldTransform rounds
 * the camera). At the rest zooms 1.75, 1.5 and 1.25 an art pixel is not a whole number of
 * backing pixels at all, and the furniture is resampled there exactly as the platform tiles
 * and the Duke are: on the same grid as the tile it stands on.
 */
export function drawScene(ctx, pl, z, items, th, t) {
  const x0 = Math.round(pl.x * PX);

  // The shadow a thing casts into the lit lip it stands on. It began on the old procedural
  // slab, whose lip was near-white (#f7f7f7, luma 247) under bone at 232: without a shadow
  // they merged, and a near-black row would have punched a hole in the landing line, the
  // one row a player tracks at speed, so it is stone-coloured -- darker than the lip, still
  // obviously the top of a platform. The drawn tiles' lips are darker now and most redrawn
  // elements end in their own dark contact row or stand on a heap, so only the ones that
  // ask for it get one (the crypt's standing pieces today). Drawn before the sprites, below
  // the surface, so it never covers one; each element says how wide and deep (`shadow`).
  let fill = null;
  for (const it of items) {
    const e = z.ELEMENTS[it.key];
    if (!e || !e.shadow) continue;
    const [dx, w, h] = e.shadow;
    if (!fill) { fill = shade(th.platTop, 0.5); ctx.fillStyle = fill; }
    ctx.fillRect((x0 + it.x + dx) / PX, pl.y - h / PX, w / PX, h / PX);
  }

  // The sprites, in the same flipped space the platform tiles are drawn in: the world is y
  // UP and an image is y DOWN, so under scale(1, -1) the image's rows run with the screen
  // and a destination's top is the NEGATED world height of the box's top row.
  ctx.save();
  ctx.scale(1, -1);
  for (const it of items) {
    const e = z.ELEMENTS[it.key];
    if (!e) continue;
    const [w, h] = e.box;
    const x = x0 + it.x;
    const phase = x / PX;
    const f = it.frame === undefined ? frameAt(e, t, phase) : it.frame;
    const c = spriteFor(z.name, it.key, it.variant || 0, f, th, e);
    if (!c) continue;
    const a = e.alpha ? Math.max(0, Math.min(1, e.alpha(t, phase))) : 1;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    const top = boxBottom(e, t, phase, undersideFor(th && th.name)) + h;
    // Explicit source AND destination rects, always: the short forms draw at the image's
    // intrinsic size in world units, which is PX times too big.
    ctx.drawImage(c.img, c.sx, c.sy, w, h, x / PX, -(pl.y + top / PX), w / PX, h / PX);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
