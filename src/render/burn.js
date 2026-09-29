// The tower burning away as the fire takes the Duke.
//
// WHAT WAS WRONG. Once the fire had him, the fall showed the tower as it stood: the ledges
// above him, their furniture and shadows, a companion frozen on one of them, and then --
// as he dropped out of the fire's underside -- the tower BELOW the fire, which the crust
// had hidden the whole run, ledge after ledge scrolling up past him for the rest of the
// fall, with a skeleton and a torch on them. The user asked for the fall to be him alone
// in the shaft. Cutting it all in the frame he was caught would have been one more thing
// that popped at the catch (the row "What flashed as he fell into the fire" in
// GAMEPLAY.md: a whole round went on things that switched in one frame there).
//
// WHAT IT DOES. The fire takes the tower. From the catch, every ledge on screen chars,
// glows at the edges of the holes that open in it and dissolves, over BURN_T; what stood
// on it (its furniture, a companion) burns with it, in the same pattern, and a companion
// goes no later than the ledge under its feet (drawBurnColumns). The tower below
// the fire, which the crust always covered, is simply not drawn in the death: it burned.
//
// HOW. Everything that burns is drawn as usual into an offscreen layer (renderer.js
// drawBurning), then this file's masks are laid over it IN THE WORLD, anchored to the
// tower, so the holes move up the screen with the ledge they are eaten into while the
// camera plunges:
//
//   char    one rect of near-black, 'source-atop' -- it darkens only what is there
//   embers  bands of ember orange, 'source-atop', on the pixels next in line to go
//   holes   'destination-out': the pixels whose turn has come, fading out over one stage
//
// Which pixel goes when is a tileable noise field ranked to an even spread (a pixel's rank
// is when it goes, 0..1), blobby at 12-40 art px so the holes grow as burns do rather than
// as a screen door, and a little earlier low in each floor's band than high, so a ledge
// goes from its underside up. The tile is one floor tall, so every ledge meets the same
// rows of it at the same height above its surface.
//
// NOTHING SWITCHES IN ONE FRAME. The char and the embers come up from nothing; a band of
// pixels fades out over a whole stage (BURN_T / BURN_STAGES) rather than vanishing, and
// the embers ramp through each band before it goes. Drawn at the catch with no progress,
// the layer IS the ledges as they were (source-over composites the same either way).
//
// COST. Built once, up front (Renderer's constructor; 31 ms headless): 2 x BURN_STAGES
// canvases of one 480 x 120 tile each, 3.7 MB. A frame of the burn draws each mask as a
// grid of tiles over the part of the view that burns -- about five masks of some fifty
// tiles at zoom 1 -- and allocates nothing.

import { PX, FLOOR_H } from '../game/constants.js';
import { mulberry32 } from '../core/rng.js';
import { newCanvas } from './canvases.js';

/** The noise tile's width. [art px; 480] Four times its height, so lattices of 40, 20 and
 *  12 px -- blobs big enough to eat a ledge in patches rather than lace it -- divide both. */
export const BURN_TW = 480;
/** Its height: one floor, so every ledge meets the same rows. [art px; FLOOR_H x PX = 120] */
export const BURN_TH = FLOOR_H * PX;
/** Stages the dissolve is cut into; each band fades over one. [count; 8] */
export const BURN_STAGES = 8;
/** How many stages ahead of its turn a band starts to glow. [stages; 2] */
const GLOW_LEAD = 2;
/** The embers' strength at their brightest, just before a band goes. [alpha 0..1; 0.75] */
const GLOW_MAX = 0.75;
/** How dark what is left chars, at full char. [alpha 0..1; 0.62] */
const CHAR_MAX = 0.62;
/** The share of the burn it takes to char fully. [0..1 of the burn; 0.5] */
const CHAR_BY = 0.5;
/** Weight of "low in the band goes first" against the noise. [0..1; 0.12] */
const RISE_BIAS = 0.12;

/** Near-black with the fire's warmth in it: char, not soot. */
const CHAR = '#170504';
/** The embers: the edge of a hole (nearest its turn) and the rim behind it. */
const EMBER_HOT = '#ff7a24';
const EMBER_DULL = '#c2330f';

let masks = null;

/**
 * The rank field: every pixel of the tile gets when it burns, 0..1, evenly spread. Value
 * noise on three lattices that divide both sides of the tile (40, 20 and 12 px), so it
 * tiles, plus the rise bias; then ranked, so each stage takes exactly its share of every
 * ledge.
 */
function rankField() {
  const W = BURN_TW, H = BURN_TH;
  const rnd = mulberry32(0x6b75726e);
  const lattice = (cell) => {
    const nx = W / cell, ny = H / cell;
    const v = new Float32Array(nx * ny);
    for (let i = 0; i < v.length; i++) v[i] = rnd();
    return (x, y) => {
      const fx = x / cell, fy = y / cell;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => v[((j + ny) % ny) * nx + ((i + nx) % nx)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const nA = lattice(40), nB = lattice(20), nC = lattice(12);
  const raw = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Row 0 is a floor's walking surface and the rows run down the screen from it, so a
      // HIGH row index is low on the screen: the underside of the ledge above, and the feet
      // of whatever stands on the ledge below. Those go a little first.
      const low = y / H;
      const n = 0.55 * nA(x + 0.5, y + 0.5) + 0.3 * nB(x + 0.5, y + 0.5) + 0.15 * nC(x + 0.5, y + 0.5);
      raw[y * W + x] = n * (1 - RISE_BIAS) + (1 - low) * RISE_BIAS;
    }
  }
  const order = Array.from(raw.keys()).sort((a, b) => raw[a] - raw[b]);
  const rank = new Float32Array(W * H);
  order.forEach((p, i) => { rank[p] = (i + 0.5) / order.length; });
  return rank;
}

/** A tile-sized canvas with every pixel `pick(rank)` returns a colour for, in runs. */
function maskCanvas(rank, pick) {
  const { c, g } = newCanvas(BURN_TW, BURN_TH);
  for (let y = 0; y < BURN_TH; y++) {
    let x = 0;
    while (x < BURN_TW) {
      const col = pick(rank[y * BURN_TW + x]);
      if (!col) { x++; continue; }
      let n = 1;
      while (x + n < BURN_TW && pick(rank[y * BURN_TW + x + n]) === col) n++;
      g.fillStyle = col;
      g.fillRect(x, y, n, 1);
      x += n;
    }
  }
  return c;
}

/**
 * Build the masks: for each stage k, `gone[k]` (every pixel whose turn came before stage k)
 * and `band[k]` (the pixels whose turn is stage k), the band in ember colours, hotter at the
 * end nearer its turn. Called once by the Renderer's constructor.
 */
export function warmBurn() {
  if (masks) return masks;
  const rank = rankField();
  const N = BURN_STAGES;
  const gone = [null];
  const band = [];
  for (let k = 1; k <= N; k++) gone.push(maskCanvas(rank, (r) => (r < k / N ? '#000000' : null)));
  for (let k = 0; k < N; k++) {
    band.push(maskCanvas(rank, (r) => {
      const f = r * N - k;
      if (f < 0 || f >= 1) return null;
      return f < 0.5 ? EMBER_HOT : EMBER_DULL;
    }));
  }
  masks = { gone, band };
  return masks;
}

/** Where floor band f's row of tiles starts, in world units: each floor's at its own
 *  whole-art-pixel offset, so two ledges one above the other never burn in the same shapes. */
const bandX = (f) => ((((f + 1) * 2654435761) >>> 0) % BURN_TW) / PX;

/**
 * One mask over the floors f0..f1 and the width x0..x1 (world units), in the flipped space
 * drawBurnMasks sets up. Returns the drawImage calls made.
 */
function tiles(ctx, img, a, op, f0, f1, x0, x1) {
  if (!img || a <= 0.004) return 0;
  const tw = BURN_TW / PX, th = BURN_TH / PX;
  let calls = 0;
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = Math.min(1, a);
  for (let f = f0; f <= f1; f++) {
    // In the flipped space an image's rows run down the screen, and the tile's row 0 -- a
    // floor's surface -- is at world height (f + 1) floors.
    const top = -(f + 1) * th;
    const o = bandX(f);
    const i0 = Math.floor((x0 - o) / tw), i1 = Math.ceil((x1 - o) / tw);
    for (let i = i0; i < i1; i++) { ctx.drawImage(img, 0, 0, BURN_TW, BURN_TH, o + i * tw, top, tw, th); calls++; }
  }
  return calls;
}

/**
 * Lay the burn over whatever the layer holds inside a world box. `ctx` is the layer, in the
 * world transform (y up); `h` is how far the burn is, 0..1 (0: nothing yet, 1: all gone).
 * Returns the number of drawImage calls, for the tests.
 */
export function drawBurnMasks(ctx, h, x0, y0, x1, y1) {
  const m = warmBurn();
  const N = BURN_STAGES;
  // s runs from -GLOW_LEAD (the embers not yet up) to N (the last band gone).
  const s = h * (N + GLOW_LEAD) - GLOW_LEAD;
  let calls = 0;
  const th = BURN_TH / PX;
  const f0 = Math.floor(y0 / th), f1 = Math.floor(y1 / th);

  ctx.save();
  // The char: one rect, darkening only what is drawn.
  const ch = CHAR_MAX * Math.min(1, h / CHAR_BY);
  if (ch > 0.004) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = ch;
    ctx.fillStyle = CHAR;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.scale(1, -1);
  // The embers: each band glows up over the GLOW_LEAD stages before its turn.
  const k = Math.floor(s);
  for (let j = Math.max(0, k); j <= k + GLOW_LEAD && j < N; j++) {
    calls += tiles(ctx, m.band[j], GLOW_MAX * Math.max(0, Math.min(1, 1 - (j - s) / GLOW_LEAD)),
      'source-atop', f0, f1, x0, x1);
  }
  // The holes: every band before this stage gone, this one fading out across the stage.
  if (k >= 1) calls += tiles(ctx, m.gone[Math.min(N, k)], 1, 'destination-out', f0, f1, x0, x1);
  if (k >= 0 && k < N) calls += tiles(ctx, m.band[k], s - k, 'destination-out', f0, f1, x0, x1);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return calls;
}

/** How far under a figure's feet the ledge it stands on is read, for drawBurnColumns: two
 *  art pixels, inside the ledge's lit top rows, which the noise's blobs (12 px and up) burn
 *  together. [world units; 0.5] */
const SUPPORT_UNDER = 0.5;

/** A world coordinate on the art grid. */
const onGrid = (v) => Math.round(v * PX) / PX;

/** The mask column (0..BURN_TW-1) a world x falls in, in a band whose tiles start at `o`,
 *  exactly as tiles() lays them. */
function maskCol(x, o) {
  const tw = BURN_TW / PX;
  return Math.floor(((((x - o) % tw) + tw) % tw) * PX + 1e-6) % BURN_TW;
}

/**
 * Tie a figure standing on a ledge to the ledge under its feet: every column of the box
 * [x0, x1] x [yFoot, yTop] goes no later than the ledge's pixel SUPPORT_UNDER below yFoot
 * in that column -- and a column hanging past the ledge's end [lx0, lx1] no later than the
 * ledge's last pixel on that side. Laid on top of drawBurnMasks, which burns the figure in
 * its own pattern with its own embers; the two holes multiply, so each pixel goes at
 * whichever of the two comes first. `ctx` is the layer in the world transform (y up).
 * Returns the drawImage calls made.
 *
 * WHY. The figure and the ledge under it burn in different floor bands of the noise (row 0
 * of a band is a floor's surface, and each band has its own offset), so their timings were
 * independent: in 23% of placements a companion stood more than half whole on a ledge under
 * a quarter there, for about 50 ms -- in a real death at floor 420 the pilgrim at a ledge's
 * end was 0.84 whole on 0.33 of the ledge under him 0.15 s in, standing on nothing, which
 * the user ruled out. Here each column is the mask's single row under his feet stretched up
 * his height, so where the ledge under a column goes, that column of him goes in the same
 * frames, fading over the same stage: none of 7,800 placements floats. Without embers of
 * its own: stretched up a figure, a band of ember colour is a flat orange slab across him,
 * and his own pattern's embers already say he is burning.
 */
export function drawBurnColumns(ctx, h, x0, x1, yFoot, yTop, lx0, lx1) {
  const m = warmBurn();
  const N = BURN_STAGES;
  const s = h * (N + GLOW_LEAD) - GLOW_LEAD;
  const k = Math.floor(s);
  if (yTop <= yFoot || k < 0 || lx1 <= lx0) return 0;
  const th = BURN_TH / PX;
  const ys = yFoot - SUPPORT_UNDER;
  const f = Math.floor(ys / th);
  const row = Math.max(0, Math.min(BURN_TH - 1, Math.floor(((f + 1) * th - ys) * PX)));
  const o = bandX(f);
  // On the art grid, so each column of the box is one column of the mask. The box reaches a
  // little under the feet too: a staff's tip can hang below the boots.
  const a0 = onGrid(x0), a1 = onGrid(x1), l0 = onGrid(lx0), l1 = onGrid(lx1);
  const yLow = ys - SUPPORT_UNDER;
  let calls = 0;
  if (k >= 1) calls += columns(ctx, m.gone[Math.min(N, k)], 1, row, o, a0, a1, l0, l1, yLow, yTop);
  if (k < N) calls += columns(ctx, m.band[k], s - k, row, o, a0, a1, l0, l1, yLow, yTop);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return calls;
}

/** One mask's `row` as holes over [a0, a1] x [yLow, yTop]: over the ledge [l0, l1] each
 *  column its own, past either end the end's. A function of its own rather than a closure,
 *  so a frame of the burn allocates nothing. */
function columns(ctx, img, a, row, o, a0, a1, l0, l1, yLow, yTop) {
  if (a <= 0.004 || a1 <= a0) return 0;
  const u = 1 / PX, hgt = yTop - yLow;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = Math.min(1, a);
  let calls = 0;
  if (a0 < l0) {
    ctx.drawImage(img, maskCol(l0, o), row, 1, 1, a0, yLow, Math.min(a1, l0) - a0, hgt);
    calls++;
  }
  if (a1 > l1) {
    const from = Math.max(a0, l1);
    ctx.drawImage(img, maskCol(l1 - u, o), row, 1, 1, from, yLow, a1 - from, hgt);
    calls++;
  }
  const b1 = Math.min(a1, l1);
  for (let x = Math.max(a0, l0); x < b1 - 1e-9;) {
    // A run of mask columns up to the tile's edge or the run's end, one art pixel each.
    const c = maskCol(x, o);
    const run = Math.min(BURN_TW - c, Math.round((b1 - x) * PX));
    if (run <= 0) break;
    ctx.drawImage(img, c, row, run, 1, x, yLow, run * u, hgt);
    calls++;
    x += run * u;
  }
  return calls;
}
