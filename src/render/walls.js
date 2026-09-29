// The shaft's side walls: the two edges the Duke bounces off, one drawing per zone.
//
// WHAT THIS REPLACED. The walls were two flat columns of the zone's ledge colour
// (theme.platBody, shaded), a two-unit edge line and a few brick courses, all drawn in WORLD
// units: every stroke was PX art pixels thick, four times chunkier than the drawn ledges,
// decor and backgrounds around them, and in the brown and ochre zones a flat bright column
// was the loudest thing on either side of the screen.
//
// Each zone now paints its own wall in wallpaint/<zone>.js, at one art pixel per backing-
// store pixel at zoom 1 like the ledges: a WALL tile 64 x 128 that repeats both ways and a
// FACE 8 x 128, the inner edge, that repeats down. They are painted once per zone and laid
// into one STRIP canvas -- two tiles of wall and the face beside them, four tiles tall --
// so a frame draws each wall with two or three blits, however much of it shows.
//
// THE TEXTURE BELONGS TO THE WORLD, NOT THE SCREEN. Its rows are pinned to world heights
// (a tile starts on every multiple of 32 units), so it scrolls past as the Duke climbs --
// a shaft, not wallpaper. Across, it is pinned to the INNER EDGE: the face is always the
// last eight pixels before the shaft, and as the walls slide outward when the camera zooms
// out, the wall slides with them and more tiles of it show beyond. The right wall is the
// left one mirrored, drawn through a negative x scale rather than stored twice.
//
// ACROSS A ZONE CHANGE the next zone's wall is drawn over this one at the backdrop's blend
// (game.themeBlend, climbing over the last twelve floors to 11/12 x 0.75 = 0.69 on the
// last one -- it steps by whole floors, so never reaches 0.75), and the zone switch itself
// completes it under the arrival flash, exactly as backdrop.js does for the sky and layers.
// Both walls are opaque and cover the same rectangle, so drawing one over the other at b IS
// the composite (1 - b) A + b B; the backdrop needs an offscreen buffer for that because its
// layers are translucent and stacked, a wall does not. The next zone's strip is painted
// ahead, one zone a frame after the current one has been on screen a moment, so the fade
// never paints mid-frame.

import { PX } from '../game/constants.js';
import { artSeed } from '../game/themes.js';
import { pixToCanvas } from './decorpaint/util.js';
import { WALL_W, WALL_H, FACE_W, wallRng, runsOf } from './wallpaint/util.js';
import { WALL_PAINTERS } from './wallpaint/index.js';
import { newCanvas } from './canvases.js';

export { WALL_W, WALL_H, FACE_W };

/** Wall tiles side by side in the strip, and stacked in it. */
const COLS = 2;
const ROWS = 4;
export const STRIP_W = FACE_W + COLS * WALL_W;
export const STRIP_H = ROWS * WALL_H;
const U = 1 / PX;
/** One wall tile's height in world units: tile rows start on every multiple of this. */
const TILE_WU = WALL_H * U;

/**
 * Drawn this far past the view on every side [world units; the screen shake moves the world
 * up to 7 view units, which is 3.5-7 world units depending on the zoom].
 */
const MARGIN = 8;

/**
 * Frames a zone is on screen before the next zone's wall is painted ahead. After the
 * backdrop's own warm-up (backdrop.js WARM_AFTER = 120, one layer a frame, then the decor),
 * so the two never land in the same frame. [frames; 150 is 0.6 s at 240 Hz, 2.5 s at 60]
 */
const WARM_AFTER = 150;

const strips = new Map();   // zone name -> { strip, ms, runs }

function freshCanvas(w, h) {
  // Smoothing off (canvases.js): although these are only ever copied 1:1 into the strip, the
  // strip itself is scaled up by the zoom on its way to the screen and must not be the one
  // buffer in the chain that blurs.
  return newCanvas(w, h);
}

/** A zone's wall and face as Pix buffers, freshly painted. For the runtime and the tools. */
export function paintWall(theme) {
  const z = WALL_PAINTERS[theme.name] || WALL_PAINTERS.BASEMENT;
  // Seeded by the name the zone was painted under (themes.js artSeed): DOWNTOWN's wall was
  // drawn as VILLAGE's, and the new name would have re-rolled every patch and streak on it.
  const seed = artSeed(theme.name);
  return {
    wall: z.wall(wallRng(seed, 'wall'), theme),
    face: z.face(wallRng(seed, 'face'), theme),
  };
}

/** The zone's strip, painted the first time it is asked for. */
export function wallStrip(theme) {
  let e = strips.get(theme.name);
  if (e) return e.strip;
  const t0 = performance.now();
  const { wall, face } = paintWall(theme);
  const w = freshCanvas(WALL_W, WALL_H);
  const f = freshCanvas(FACE_W, WALL_H);
  pixToCanvas(wall, w.g);
  pixToCanvas(face, f.g);
  const runs = runsOf(wall) + runsOf(face);
  const s = freshCanvas(STRIP_W, STRIP_H);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      s.g.drawImage(w.c, 0, 0, WALL_W, WALL_H, i * WALL_W, j * WALL_H, WALL_W, WALL_H);
    }
    s.g.drawImage(f.c, 0, 0, FACE_W, WALL_H, COLS * WALL_W, j * WALL_H, FACE_W, WALL_H);
  }
  e = { strip: s.c, ms: performance.now() - t0, runs };
  strips.set(theme.name, e);
  return e.strip;
}

/** Build cost of a zone's strip, once built: { ms, runs } -- for tools/test-walls.mjs. */
export function wallStats(name) {
  const e = strips.get(name);
  return e ? { ms: e.ms, runs: e.runs } : null;
}

export function resetWalls() { strips.clear(); shown = null; shownFor = 0; }

/** drawImage calls made by the last drawShaftWalls, for the perf report. */
export let wallBlits = 0;

let shown = null;
let shownFor = 0;

/**
 * Both walls, in the world transform the renderer has set (y up, zoom x PX per unit).
 *
 * @param bottom, top  the view's world span
 * @param lo, hi       the inner edges: the left wall ends at lo, the right one starts at hi
 */
export function drawShaftWalls(ctx, game, view, theme, bottom, top, lo, hi,
  next = game.nextTheme, blend = game.themeBlend || 0) {
  wallBlits = 0;
  pair(ctx, wallStrip(theme), view, bottom, top, lo, hi);

  if (!next || next === theme) return;
  if (blend > 0) {
    ctx.globalAlpha = blend;
    pair(ctx, wallStrip(next), view, bottom, top, lo, hi);
    ctx.globalAlpha = 1;
    return;
  }
  if (shown !== theme.name) { shown = theme.name; shownFor = 0; }
  if (++shownFor > WARM_AFTER && !strips.has(next.name)) wallStrip(next);
}

function pair(ctx, strip, view, bottom, top, lo, hi) {
  ctx.save();
  // In this flipped space the image's own downward y runs with the screen, so a strip whose
  // top row belongs at world height y is drawn at -y.
  ctx.scale(1, -1);
  side(ctx, strip, lo, view.viewLeft, bottom, top);
  // And mirrored: x' = -x turns the right wall into a left wall whose inner edge is at -hi
  // and whose outer edge is at -viewRight, so one routine draws both.
  ctx.scale(-1, 1);
  side(ctx, strip, -hi, -view.viewRight, bottom, top);
  ctx.restore();
}

function side(ctx, strip, edge, outer, bottom, top) {
  const sh = STRIP_H * U, sw = STRIP_W * U, bw = COLS * WALL_W * U;
  // The first tile boundary above the top of the view: the strip's first row goes there.
  const y0 = Math.ceil((top + MARGIN) / TILE_WU) * TILE_WU;
  for (let y = y0; y > bottom - MARGIN; y -= sh) {
    ctx.drawImage(strip, 0, 0, STRIP_W, STRIP_H, edge - sw, -y, sw, sh);
    wallBlits++;
    // Further out, wall only: the strip's first two tiles, which wrap on each other.
    for (let x = edge - sw; x > outer - MARGIN; x -= bw) {
      ctx.drawImage(strip, 0, 0, COLS * WALL_W, STRIP_H, x - bw, -y, bw, sh);
      wallBlits++;
    }
  }
}
