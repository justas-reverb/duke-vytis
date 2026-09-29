// Parallax backdrop: the zone's sky, and three tiled layers over it.
//
//   FAR   scrolls at 12% of the camera
//   MID   scrolls at 22%
//   NEAR  scrolls at 34%
//
// Each layer is a 256 x 256 tile spanning 128 of the 480 view units -- one art pixel is
// two screen pixels -- pre-rendered once per zone and drawn as a handful of blits, because
// painting the decor every frame would be the most expensive thing on screen.
//
// A layer comes from one of two places. If the artist's PNG for that zone and layer exists
// (assets/backgrounds/, listed in bgart.js by tools/import-backgrounds.mjs), that is drawn.
// Otherwise the zone's code painter in bgpaint/ paints it. So art arrives one tile at a
// time and the rest of the zone keeps working.
//
// It used to be TWO layers, far and near, both the same painter in two colours at 50% and
// 80% opacity. bgpaint/legacy.js's legacyZone() reproduced exactly that for every zone
// until it was repainted, so the change of structure changed nothing on screen by itself.
// All twelve zones have their own painters now and none calls legacyZone(); legacy.js
// stays only for the old tiles re-exported below. Layers are now drawn at full opacity:
// a layer owns its own transparency.
//
// Across a zone change the WHOLE next zone fades in, sky and layers. It used to be the sky
// alone, under the current zone's layers at full opacity, which worked while those layers
// were 50% and 80% washes the sky showed through. The repainted zones make FAR opaque or
// nearly so in most of the tower -- BASEMENT, DUNGEON, SWAMP, CITADEL and NEBULA fully,
// DOWNTOWN and ZENITH at 91-92% mean alpha, FOREST 73%; STORM, ABYSS, COSMOS and STARFIELD
// cover under a third of theirs (the painted tiles, measured 2026-09-28; this listed four
// opaque and "most of the rest 76-90%", and SWAMP's FAR has gone opaque since) -- so the
// crossfade was painted and then covered, and the whole background snapped at the
// boundary: floor 1099 showed none of STORM's purple.

import { mulberry32 } from '../core/rng.js';
import { VW, VH, SW, SH, PX } from '../game/constants.js';
import { THEMES } from '../game/themes.js';
import { BG_TILE, BG_FILES } from './bgart.js';
import { ZONE_PAINTERS } from './bgpaint/index.js';
import { warmDecor } from './decor.js';
import { newCanvas } from './canvases.js';

// The old single-tile painters, re-exported for the reference sheet that shows them,
// tools/background-template.mjs. Nothing in the game draws them.
export { TILE, PAINTERS, STYLE_BY_THEME, makeTile } from './bgpaint/legacy.js';

/** Background tiles span this many view units; the art is BG_TILE pixels across it. */
export const SPAN = 128;
export const LAYERS = [
  ['far', 0.12],
  ['mid', 0.22],
  ['near', 0.34],
];

/**
 * How wide a zone's PAINTED layer tiles are, in art pixels. BG_TILE, 128 view units, and
 * so 3.75 copies side by side across the screen -- unless the zone's bgpaint module says
 * `wide: true`, when they are one whole screen wide: 960 pixels, 480 units. The layers
 * scroll only up and down, so a tile that wide shows each of its columns once and nothing
 * on it repeats across the screen. SWAMP asks for it: its moss curtains stood side by
 * side, each at the same height every 128 units, and a careful eye found the stamp (see
 * bgpaint/swamp.js). Opt-in, because it costs painting 3.75 tiles' worth per layer. An
 * artist's PNG stays BG_TILE square whatever the zone says. Whole, because a canvas
 * size that is a heap double slows every headless frame.
 *
 * A painter may also RETURN how its tile is to be laid, { period, shift } (see tile):
 * SWAMP's does, to lay its rows like bricks.
 */
export const WIDE = ((BG_TILE * VW) / SPAN) | 0;
export const paintedWidth = (zone) => (zone && zone.wide ? WIDE : BG_TILE);

/**
 * How long a zone is on screen before the next zone's layers start being painted ahead
 * of its crossfade, one layer a frame. [frames; 120 is 0.5 s at 240 Hz, 2 s at 60 Hz]
 * Not zero, because the frame a zone arrives already carries the flash, the banner and
 * a sixty-particle burst.
 */
const WARM_AFTER = 120;

// --- the artist's tiles ------------------------------------------------------------
//
// Loaded once, at startup, and only the ones bgart.js lists -- requesting a file that is
// not there is a 404, and the desktop build's smoke test fails on any 404. A tile that
// has not finished loading is painted instead until it has.
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

export function preloadBackgrounds() {
  for (const zone of Object.values(BG_FILES)) {
    for (const [layer] of LAYERS) if (zone[layer]) image(zone[layer]);
  }
}

/**
 * The seeded stream a zone's layer is painted from.
 *
 * It used to be keyed by the layer's NAME LENGTH, and 'far' and 'mid' are both three
 * letters: FAR and MID of every zone were handed the SAME stream. Two painters that
 * drew the same kind of thing in the same order then drew it in the same places, and
 * every painter that could collide had to carry its own dodge -- re-seed with a salt,
 * or spend a couple of hundred numbers first so the streams fall out of step. SWAMP is
 * where it was caught: its MID hung moss in the order and at the tilts its FAR did, once
 * a retry loop drew enough numbers to bring the two into step.
 *
 * Keyed by the layer's POSITION in LAYERS instead -- three layers, three streams. Index
 * rather than a hash of the name because it cannot collide at all: a fourth layer added
 * to LAYERS gets its own stream by construction, where a hash only makes a collision
 * unlikely, and an unlikely collision in a seed is the kind that is found by eye a year
 * later.
 *
 * The + 2 is not decoration. Changing a seed re-rolls where everything in that layer
 * sits, in all twelve zones, and every zone was verified by eye at the placements it
 * had. Indices 1 and 2 land on the 3 and 4 that 'mid' and 'near' used to give, so MID
 * and NEAR come out byte for byte as before and only FAR -- the layer with the least on
 * it, at 12% of the camera -- is re-rolled. The zones that also drop their own dodge
 * (ABYSS, NEBULA, STORM, and STARFIELD's FAR) re-roll further; the rest do not move.
 */
export function layerSeed(themeIndex, layer) {
  const li = LAYERS.findIndex(([k]) => k === layer);
  return ((themeIndex + 1) * 2654435761 + (li + 2) * 40503) >>> 0;
}

/**
 * One layer tile for a zone: the artist's PNG if it is listed and loaded, else painted.
 * Returns { canvas, art, pending } -- `pending` is true while a listed PNG is still
 * loading, so the caller can rebuild the layer once it arrives. A painted tile is
 * paintedWidth() across and BG_TILE down, and the painter is handed that width last.
 */
export function layerTile(theme, themeIndex, layer) {
  const path = BG_FILES[theme.name] && BG_FILES[theme.name][layer];
  const im = path ? image(path) : null;
  const zone = ZONE_PAINTERS[theme.name];
  // Through canvases.js, so the load-time prepaint can bring every layer up before a run.
  const { c, g } = newCanvas(ready(im) ? BG_TILE : paintedWidth(zone), BG_TILE);
  if (ready(im)) {
    g.drawImage(im, 0, 0, im.width, im.height, 0, 0, BG_TILE, BG_TILE);
    return { canvas: c, art: true, pending: false };
  }
  const lay = (zone && zone[layer]
    && zone[layer](g, BG_TILE, theme, mulberry32(layerSeed(themeIndex, layer)), themeIndex, c.width)) || {};
  return { canvas: c, art: false, pending: !!path, period: lay.period, shift: lay.shift };
}

export function makeSky(sky) {
  const { c, g } = newCanvas(1, VH);
  const grad = g.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(1, sky[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, VH);
  return c;
}

export class Backdrop {
  constructor() {
    this.cache = new Map();
    this.fade = null;
    this.fadeG = null;
    // The zone on screen, and for how many frames it has been; see WARM_AFTER.
    this.shown = -1;
    this.shownFor = 0;
    preloadBackgrounds();
  }

  /** A zone's cache entry, with its sky and whichever layers have been painted so far. */
  entry(themeIndex, theme) {
    let e = this.cache.get(themeIndex);
    if (!e) {
      e = { sky: makeSky(theme.sky), far: null, mid: null, near: null };
      this.cache.set(themeIndex, e);
    }
    // A layer painted while its PNG was still loading is dropped once the PNG has arrived,
    // and the art goes in on the next fill. Only that layer: this used to repaint the
    // whole zone.
    for (const [k] of LAYERS) {
      if (e[k] && e[k].pending && ready(image(BG_FILES[theme.name][k]))) e[k] = null;
    }
    return e;
  }

  /** Every layer of a zone, painting whatever is still missing right now. */
  layers(themeIndex, theme) {
    const e = this.entry(themeIndex, theme);
    for (const [k] of LAYERS) if (!e[k]) e[k] = layerTile(theme, themeIndex, k);
    return e;
  }

  /**
   * Paint at most ONE missing layer of a zone, so it is ready before it is needed. Left to
   * layers(), the next zone was painted in the first frame of its crossfade, all of it:
   * up to 35 ms for NEBULA (measured headless, 10 + 14 + 9), where one layer a frame puts
   * no more than 14 ms in any frame.
   *
   * The zone's platform furniture goes the same way, in the frame after its last layer:
   * every sprite of it built (decor.js warmDecor), so the first ledge of the new zone on
   * screen draws from the cache instead of building its sprites mid-frame.
   */
  warm(themeIndex, theme) {
    const e = this.entry(themeIndex, theme);
    const gap = LAYERS.find(([k]) => !e[k]);
    if (gap) e[gap[0]] = layerTile(theme, themeIndex, gap[0]);
    else if (!e.decor) { warmDecor(themeIndex, theme); e.decor = true; }
    else this.fadeCtx();
  }

  /**
   * The buffer the next zone is composited into before it is faded in, made once.
   *
   * Fading the next zone's layers in one by one, each at the blend, is not a crossfade:
   * its sky shows through its own opaque FAR, its translucent layers wash out over each
   * other, and the current zone drops out faster than the blend says -- at 0.75 over an
   * opaque FAR, a sixteenth of it is left rather than a quarter. Composited first and
   * drawn once, the frame is exactly (1 - blend) of one zone and blend of the other.
   *
   * It has the transform the renderer sets for the backdrop, so the buffer is one pixel
   * per backing-store pixel and the blit back is 1:1. Smoothing is off as it is on the
   * game's canvas: a fresh canvas smooths by default and would blur every two-pixel art
   * pixel of the incoming zone for the whole fade -- and the headless canvas never
   * smooths, so no shot would show it. No clear is needed: the sky covers it, opaque.
   */
  fadeCtx() {
    if (!this.fadeG) {
      ({ c: this.fade, g: this.fadeG } = newCanvas(SW, SH, { alpha: false }));
      // Tagged, so the tools know it for a layer drawn every frame of a fade (test-smooth).
      this.fade.layer = 'backdropFade';
      this.fadeG.setTransform(PX, 0, 0, PX, 0, 0);
    }
    return this.fadeG;
  }

  /**
   * @param camY  camera bottom edge in world space
   * @param blend 0..1 crossfade into the NEXT zone's whole backdrop, across a zone change
   */
  draw(ctx, camY, themeIndex, theme, nextTheme, blend = 0) {
    this.stack(ctx, this.layers(themeIndex, theme), camY);

    // The next zone keyed by its own index, not themeIndex + 1. After the last zone the
    // game used to hand back the last zone again, and themeIndex + 1 painted ZENITH a
    // second time under index 12 with a different seed -- invisible while only the sky
    // faded, a ghost of the same scene sliding over itself once whole layers do. Since
    // 7bdc6d3 Game.nextTheme asks the schedule and never names the zone on screen, so the
    // next === themeIndex test below is only a guard.
    const next = nextTheme ? THEMES.indexOf(nextTheme) : -1;
    if (next < 0 || next === themeIndex) return;

    if (blend > 0) {
      const g = this.fadeCtx();
      this.stack(g, this.layers(next, nextTheme), camY);
      ctx.globalAlpha = blend;
      ctx.drawImage(this.fade, 0, 0, SW, SH, 0, 0, VW, VH);
      ctx.globalAlpha = 1;
      return;
    }

    if (this.shown !== themeIndex) { this.shown = themeIndex; this.shownFor = 0; }
    if (++this.shownFor > WARM_AFTER) this.warm(next, nextTheme);
  }

  /** A zone's sky and its three layers, each scrolled at its own rate. */
  stack(ctx, e, camY) {
    ctx.drawImage(e.sky, 0, 0, 1, VH, 0, 0, VW, VH);
    for (const [k, rate] of LAYERS) this.tile(ctx, e[k], camY * rate);
  }

  /**
   * One layer ({ canvas, period, shift } from layerTile) over the screen, `scroll` units
   * down. The tile repeats every SPAN units down and every `period` of its pixels across
   * -- its whole width unless the painter said otherwise -- and each row of tiles is laid
   * `shift` pixels further along than the row above it. Every zone but SWAMP says
   * neither, and is drawn exactly as it always was: rows square, from x = 0.
   */
  tile(ctx, layer, scroll) {
    const t = layer.canvas, period = layer.period || t.width, shift = layer.shift || 0;
    const k = SPAN / BG_TILE;              // view units per tile pixel
    const off = ((scroll % SPAN) + SPAN) % SPAN;
    // Which row of the layer the first row drawn is, counted down the layer itself, so
    // a row keeps its place along as it scrolls.
    let row = -1 - Math.round((scroll - off) / SPAN);
    for (let y = -SPAN + off; y < VH; y += SPAN, row++) {
      const along = shift ? (((row * shift) % period) + period) % period : 0;
      // Explicit destination size, always: the three-argument form draws at the image's
      // INTRINSIC size in the current transform's units, which is how a scanline overlay
      // once came out quadruple-size. The tile is BG_TILE pixels down SPAN units.
      for (let x = (along ? along - period : 0) * k; x < VW; x += period * k) {
        ctx.drawImage(t, 0, 0, period, t.height, x, Math.round(y), period * k, SPAN);
      }
    }
  }
}
