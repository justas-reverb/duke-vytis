// The start floor: the ground at the foot of the tower, floor 0.
//
// WHAT THIS REPLACED. Floor 0 was the BASEMENT ledge tile stretched across the whole shaft,
// with a flat slab of theme.platEdge filled under it in world units: one brown, no edge, no
// texture, four backing pixels to the unit -- four times chunkier than every drawn thing
// around it, and the first thing a player sees. It read as a placeholder because it was one.
//
// WHAT IT IS NOW. The floor of the cellar the BASEMENT backdrop (bgpaint/basement.js) is the
// walls of: a course of flagstones laid on rubble footings set in packed earth, drawn at one
// art pixel per backing-store pixel at zoom 1, like the ledges, the decor and the Duke.
//
//   - The flags' top row is THE landing line: the brightest clean row on the ground, as row
//     12 is on every ledge, broken only by a one-tone notch where two flags meet (a gap
//     there would put a hole in the line the player tracks). Over it, on row 11, a rim of
//     the deep colour, as every ledge has a dark row over its lit top where it meets the
//     backdrop: without it the line ran straight into the purple brick, the one lit edge in
//     the frame with no outline, and read softer than the ledges above it.
//   - Under the flags, rubble -- rounded stones of different sizes packed in dark earth, lit
//     from the upper left like everything else -- whose lit edges are short arcs, never a
//     long level line: a lit horizontal edge under the floor reads as another floor.
//   - The deeper it goes the darker it gets, stone by stone, until it is the one deep colour
//     the rest of the view below is filled with. The eye stops at the flags. A stone keeps
//     its silhouette as it darkens and goes out whole, rims and all; see SINK.
//
// THE BRIEF'S SHAPE (tools/brief-sheets.mjs, THE START FLOOR) is GROUND-TOP 64 x 40, surface
// on row 12, repeating left to right, over GROUND-FILL 64 x 64, repeating both ways. The
// painters below make exactly that pair (groundTiles(): the fill wraps both ways by
// construction, and the top tile's rubble is the fill's own last rows), which is what an
// artist's PNGs replace. No tool prints it today: brief-sheets.mjs shows the artist the
// ground as the game draws it, from a real frame, and nothing calls groundTiles().
//
// WHY THE GAME DOES NOT TILE IT. Rubble repeated every 64 px read, in the first real frame, as
// wallpaper: the same three stones every 128 backing pixels at the start zoom. (A ledge's
// bricks repeat every 32 and nobody sees it, because bricks are regular; rubble is not.)
// Variants that shared a border band so any could meet any fixed the depths and not the top:
// the band where the top tile meets the fill is the brightest rubble, and it was the same in
// every column. So the game paints the ground ONCE, across the widest the shaft can open,
// with the same painters -- a strip is finite, so it needs no wrap and has no seams. An
// artist's pair would be laid out by repetition instead, as the brief intends.
//
// HOW IT IS DRAWN. As a PLAN -- a material and a tone per pixel, and for a stone where that
// stone's centre is -- turned into colour only at the end, because darkening with depth is a
// question about the plan: a stone darkens as a whole, by where its centre lies (give or take
// its own jitter, so the steps are not ruled lines across the ground), never cut in two by a
// band. The strip is built once, at the Renderer's construction; a frame costs one drawImage
// and one fillRect for the deep colour below it.

import { Pix, pixToCanvas, rng, rgba } from './decorpaint/util.js';
import { PX, PLAY_L, PLAY_R, CX } from '../game/constants.js';
import { newCanvas } from './canvases.js';

/** The brief's sizes, in art pixels. */
export const GROUND_W = 64;
export const TOP_H = 40;
export const SURFACE = 12;      // the landing line: the top edge of this row is world y 0
export const FILL_H = 64;

// Materials in the plan.
const NONE = 0, FLAG = 1, STONE = 2, EARTH = 3;

// Every ramp starts at the same DEEP colour, so darkening a pixel is lowering its tone, and
// at the bottom every material has become the one colour the view below is filled with.
// Hue-shifted: shadows go to plum (the cellar's purple), lights to warm tan (the ledges'
// brick). The flags are the ledges' material, a little greyer; the rubble and the earth
// under them are darker than anything on the flags even before depth darkens them.
export const DEEP = '#0d080e';
const RAMP = {
  // FLAG: 0 deep, 1 joint, 2 underside, 3 shadowed end, 4 pit, 5 face, 6 bevel, 7 the landing
  // line. The pit is half a step under the face: a whole step, the first try, drew every pit
  // and crack as a dark squiggle, and at the start zoom the faces read as lines of writing.
  [FLAG]: [DEEP, '#221720', '#392830', '#523e3a', '#614b40', '#6b5444', '#866b52', '#a68a66'],
  [STONE]: [DEEP, '#1c1320', '#2c2029', '#3d2d32', '#52403f', '#685349'],
  [EARTH]: [DEEP, '#170e16', '#24161d', '#33222a'],
};
const RGBA = Object.fromEntries(Object.entries(RAMP).map(([m, r]) => [m, r.map(rgba)]));

// Depth, in art rows below the landing line, where the rubble starts to darken, and how many
// rows each further step down the ramps takes. A little past DEEP_AT (a stone's jitter and
// its own half height) every pixel is DEEP, and warmGround ends the strip at the last row
// that is not.
const DARK_FROM = 18;
// 24, not the first draft's 32: with the stones now keeping their silhouettes as they sink
// (SINK), 32 left a field of busy rubble 280 backing pixels deep under the start frame's
// flags, more floor than footing; 24 ends it about where the eye expects the dark.
const DARK_STEP = 24;
const STEPS = 5;                 // the most tones any pixel of the fill sits above DEEP
const DEEP_AT = DARK_FROM + (STEPS - 1) * DARK_STEP;

// The flag course: 10 rows thick, a joint row of earth under it, the rubble from the row after.
const FLAG_ROWS = 10;
const UNDER = SURFACE + FLAG_ROWS;          // the joint row under the flags

class Plan {
  /** w x h; a tile wraps both ways; a strip clamps, and its rubble starts at row `top`. */
  constructor(w, h, wrap, top = 0) {
    this.w = w; this.h = h; this.wrap = wrap; this.top = top;
    this.mat = new Uint8Array(w * h);
    this.tone = new Int8Array(w * h);
    // For a pixel of a stone or an earth pocket (`whole`: it darkens with its cell, not with
    // its row), the cell's centre row minus this pixel's row, and the cell's jitter.
    this.whole = new Uint8Array(w * h);
    this.cyo = new Int16Array(w * h);
    this.jit = new Int8Array(w * h);
    // ...and its cell's body tone, which says what each of its tones is FOR (colour()).
    this.base = new Uint8Array(w * h);
  }
  /**
   * Index of (x, y): wrapped for a tile; for a strip, clamped to its edges -- and, with
   * `rubble` set, to the rubble's own top row, so a stone under the flags carries on up under
   * them instead of meeting an edge there and being rimmed along it.
   */
  i(x, y, rubble = false) {
    const { w, h } = this;
    if (this.wrap) return (((y % h) + h) % h) * w + (((x % w) + w) % w);
    const y0 = rubble ? this.top : 0;
    return (y < y0 ? y0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x);
  }
  put(x, y, m, t, cyo = 0, jit = 0, whole = m === STONE, base = 2) {
    const i = this.i(x, y);
    this.mat[i] = m; this.tone[i] = t; this.cyo[i] = cyo; this.jit[i] = jit; this.whole[i] = whole ? 1 : 0;
    this.base[i] = base;
  }
}

const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const N8 = [...N4, [-1, -1], [1, -1], [-1, 1], [1, 1]];
const DISC = [];
for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) DISC.push([dx, dy]);

// --- the rubble: footings of rounded stones packed in earth ----------------------------------
//
// Stones are the cells of a weighted Voronoi diagram of centres scattered as a Poisson disc
// set (every centre at least a stone's width from the rest, and no gap left that another
// would fit in) -- a grid of centres, the first try, laid them in rows like a honeycomb.
// Distance is measured a little narrower across than down so the stones lie long, as rubble
// is laid. A pixel near the border between two cells is the joint, about a pixel of earth.
// Each cell is then opened (eroded and grown back) with a disc, which rounds its corners:
// straight Voronoi edges met at points and read as crazy paving. A few of the small cells are
// pockets of earth with a pebble in them.

const AX = 0.8;                  // across-to-down distance ratio: stones lie long
const GAP = 8.5;                 // closest two centres may be, before their weights
const WMAX = 2.4;                // largest weight: how much bigger than its spacing a stone grows
const CELL = 16;                 // side of the blocks centres are filed under, art px
// How far, in the stretched distance, a pixel's two nearest centres are looked for. The safe
// bound for a packed set is 2 x (GAP + weights), 24.7; 14 painted the strip and the tile
// pixel for pixel the same (diffed) with half the centres to test per pixel.
const REACH = 14;
const BLOCK = 8;                 // pixels are assigned a block of 8 x 8 at a time
// Moving d px changes a pixel's distance to any centre by at most d, so a pixel whose two
// nearest centres differ by m lies at least (m - 1.1) / 2 px inside its cell's border. Past
// DEEP_INSIDE (4.5 px in) the rims (4 px runs) and the despeckle cannot touch it; past
// DISC_INSIDE (the disc's 2.24 px) neither can the rounding. They skip such pixels.
const DEEP_INSIDE = 1.1 + 2 * 4.5;
const DISC_INSIDE = 1.1 + 2 * Math.sqrt(5);

/**
 * The rubble, painted into plan `p` from its row `p.top` down (a tile's whole plane, or a
 * strip's plane under its flags). A tile wraps both ways (the brief's GROUND-FILL); a strip
 * is finite, with no edges to meet.
 */
function rubble(p, seed) {
  const { w, h, wrap, top } = p;
  const r = rng('GROUND', 'rubble', seed);
  const dxOf = (a, b) => (wrap ? a - b - w * Math.round((a - b) / w) : a - b);
  const dyOf = (a, b) => (wrap ? a - b - h * Math.round((a - b) / h) : a - b);
  const bw = Math.ceil(w / CELL), bh = Math.ceil(h / CELL);
  const blocks = Array.from({ length: bw * bh }, () => []);
  const blockAt = (bx, by) => {
    if (wrap) { bx = ((bx % bw) + bw) % bw; by = ((by % bh) + bh) % bh; }
    return bx >= 0 && by >= 0 && bx < bw && by < bh ? blocks[by * bw + bx] : null;
  };
  /** Calls f(cell) for the cells filed within `rx`, `ry` px of (x, y); stops if f is true. */
  const scan = (x, y, rx, ry, f) => {
    const bx0 = Math.floor((x - rx) / CELL), bx1 = Math.floor((x + rx) / CELL);
    const by0 = Math.floor((y - ry) / CELL), by1 = Math.floor((y + ry) / CELL);
    const nx = Math.min(bx1 - bx0 + 1, wrap ? bw : 1e9), ny = Math.min(by1 - by0 + 1, wrap ? bh : 1e9);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const b = blockAt(bx0 + i, by0 + j);
        if (b) for (const c of b) if (f(c)) return true;
      }
    }
    return false;
  };

  // Poisson disc (Bridson): from each placed centre, try new ones at one to two spacings off,
  // keeping a try that clears every centre near it; a centre that fails 24 tries in a row is
  // done. Cheap for a 1792 px strip, where rejecting random throws across the whole plane
  // until 400 missed running took a fifth of the build.
  const cells = [];
  const spacing = (a, b) => GAP + (a + b) * 0.8;
  const clear = (x, y, cw) => !scan(x, y, spacing(cw, WMAX) / AX, spacing(cw, WMAX), (c) => {
    const ddx = dxOf(x, c.x) * AX, ddy = dyOf(y, c.y);
    return ddx * ddx + ddy * ddy <= spacing(cw, c.w) ** 2;
  });
  const add = (x, y, cw) => {
    const c = {
      x, y, w: cw, k: cells.length,
      base: r.chance(0.35) ? 2 : 3,
      jit: r.int(-DARK_STEP / 2, DARK_STEP / 2),
      pocket: cw < 0.8 && r.chance(0.3),
      pit: r.chance(0.6) ? [r.chance(0.5) ? r.float(-5, -2) : r.float(1, 3), r.float(-1.5, 1.5)] : null,
    };
    cells.push(c);
    blockAt(Math.floor(x / CELL), Math.floor(y / CELL)).push(c);
    return c;
  };
  const active = [add(r.float(0, w), r.float(top, h), r.float(0, WMAX))];
  while (active.length) {
    const ai = r.int(0, active.length - 1), a = active[ai];
    let placed = false;
    for (let t = 0; t < 24 && !placed; t++) {
      const cw = r.float(0, WMAX), ang = r.float(0, Math.PI * 2);
      const rad = spacing(a.w, cw) * r.float(1.02, 2);
      let x = a.x + (Math.cos(ang) * rad) / AX, y = a.y + Math.sin(ang) * rad;
      if (wrap) { x = ((x % w) + w) % w; y = ((y % h) + h) % h; } else if (x < 0 || x >= w || y < top || y >= h) continue;
      if (clear(x, y, cw)) { active.push(add(x, y, cw)); placed = true; }
    }
    if (!placed) active.splice(ai, 1);
  }

  // Each pixel to its nearest cell, unless it is within a pixel of the border with the next.
  // A block of pixels at a time, against only the centres that can be nearest to any of it
  // (each placed at its wrapped image nearest the block, for a tile).
  let id = new Int32Array(w * h).fill(-1);
  const margin = new Float32Array(w * h);
  const cyOf = new Float32Array(w * h);
  const rx = REACH / AX, ry = REACH;
  const cx = new Float64Array(512), cy = new Float64Array(512), cwt = new Float64Array(512);
  const ck = new Int32Array(512);
  for (let y0 = top; y0 < h; y0 += BLOCK) {
    for (let x0 = 0; x0 < w; x0 += BLOCK) {
      const x1 = Math.min(w, x0 + BLOCK), y1 = Math.min(h, y0 + BLOCK);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      let n = 0;
      scan(mx, my, rx + BLOCK, ry + BLOCK, (c) => {
        const ox = mx + dxOf(c.x, mx), oy = my + dyOf(c.y, my);
        if (ox >= x0 - rx && ox <= x1 + rx && oy >= y0 - ry && oy <= y1 + ry) {
          cx[n] = ox; cy[n] = oy; cwt[n] = c.w; ck[n] = c.k; n++;
        }
        return false;
      });
      for (let y = y0; y < y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x < x1; x++) {
          const pxx = x + 0.5;
          let d1 = 1e9, d2 = 1e9, k1 = -1, dy1 = 0;
          for (let j = 0; j < n; j++) {
            const ddx = (pxx - cx[j]) * AX, ddy = py - cy[j];
            const d = Math.sqrt(ddx * ddx + ddy * ddy) - cwt[j];
            if (d < d1) { d2 = d1; d1 = d; k1 = ck[j]; dy1 = ddy; }
            else if (d < d2) d2 = d;
          }
          const i = y * w + x;
          margin[i] = d2 - d1;
          if (k1 >= 0 && d2 - d1 >= 1.1) { id[i] = k1; cyOf[i] = -dy1; }
        }
      }
    }
  }

  // Round every cell: erode by the disc, grow back by the same disc within the cell's own
  // pixels. Corners sharper than the disc stay earth. Away from the plane's edges a
  // neighbour is a fixed offset; only its rim goes through the wrapping or clamping index.
  const DOFF = Int32Array.from(DISC, ([dx, dy]) => dy * w + dx), ND = DOFF.length;
  const inside = (x, y, m) => x >= m && y >= top + m && x < w - m && y < h - m;
  const core = new Int32Array(w * h).fill(-1);
  const round = new Int32Array(w * h).fill(-1);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? core : id, dst = pass ? round : core;
    for (let y = top; y < h; y++) {
      const fastRow = y >= top + 2 && y < h - 2;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, k = id[i];
        if (k < 0) continue;
        if (margin[i] > DISC_INSIDE) { dst[i] = k; continue; }
        const fast = fastRow && x >= 2 && x < w - 2;
        let n = 0;       // disc pixels that are this cell's, in src
        for (let q = 0; q < ND; q++) {
          const j = fast ? i + DOFF[q] : p.i(x + DISC[q][0], y + DISC[q][1], true);
          if (src[j] === k) n++;
          else if (!pass) break;        // eroding: one miss is enough
        }
        if (pass ? n > 0 : n === ND) dst[i] = k;
      }
    }
  }
  id = round;

  // Into the plan, straight into its arrays: a put() per pixel through the clamping index
  // was most of this painter's cost on the strip.
  for (let y = top; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, k = id[i];
      if (k < 0) { p.mat[i] = EARTH; p.tone[i] = 1; continue; }
      const c = cells[k];
      p.mat[i] = c.pocket ? EARTH : STONE;
      p.tone[i] = c.pocket ? 2 : c.base;
      p.whole[i] = 1;
      p.cyo[i] = Math.round(cyOf[i]);
      p.jit[i] = c.jit;
      p.base[i] = c.pocket ? 2 : c.base;
    }
  }

  // Shade each stone from its own silhouette, lit from the upper left: the rim along its top
  // a tone up, and two tones up where that rim meets its left side (the highlight); its left
  // side a tone up above the bottom; its bottom rim and its right side a tone down. The rims
  // are what make a flat polygon a rounded stone -- without them the first try read as flat
  // cut-outs. (Clamped at a strip's edges, so a stone is not rimmed where the strip ends.)
  const same = (x, y, k) => id[p.i(x, y, true)] === k;
  const run = (x, y, dx, dy, k) => {
    let n = 0;
    if (inside(x, y, 4)) { const o = dy * w + dx, i = y * w + x; while (n < 4 && id[i + o * (n + 1)] === k) n++; }
    else while (n < 4 && same(x + dx * (n + 1), y + dy * (n + 1), k)) n++;
    return n;
  };
  for (let y = top; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (p.mat[i] !== STONE || margin[i] > DEEP_INSIDE) continue;
      const k = id[i], b = cells[k].base;
      const du = run(x, y, 0, -1, k), dd = run(x, y, 0, 1, k);
      const dl = run(x, y, -1, 0, k), dr = run(x, y, 1, 0, k);
      let t = b;
      if (du === 0) t = dl <= 2 ? b + 2 : dr === 0 ? b : b + 1;
      else if (dd === 0) t = b - 1;
      else if (dl === 0) t = dd >= 2 ? b + 1 : b;
      else if (dr === 0) t = b - 1;
      else if (du === 1 && dl <= 1) t = b + 1;
      p.tone[i] = t;
    }
  }

  // A pit in some of the bigger stones: two pixels a tone down, off the stone's middle, where
  // there is room round it. Two of them side by side, the first try, put a pair of closed
  // eyes in every stone.
  const ROOM = [[0, 0], [1, 0], [-1, 0], [2, 0], [0, -1], [1, -1], [0, 1], [1, 1], [2, 1], [-1, -1], [2, -1]];
  for (const c of cells) {
    if (c.pocket || !c.pit || c.w < 1) continue;
    const x = Math.round(c.x + c.pit[0]), y = Math.round(c.y + c.pit[1]);
    if (!ROOM.every(([dx, dy]) => same(x + dx, y + dy, c.k))) continue;
    p.tone[p.i(x, y)] = c.base - 1; p.tone[p.i(x + 1, y)] = c.base - 1;
  }

  // A pebble in each earth pocket that has room for one: 3 x 2, lit on top.
  for (const c of cells) {
    if (!c.pocket) continue;
    const x = Math.round(c.x) - 1, y = Math.round(c.y) - 1;
    let room = true;
    for (let yy = y - 1; yy <= y + 2 && room; yy++) for (let xx = x - 1; xx <= x + 3 && room; xx++) room = same(xx, yy, c.k);
    if (!room) continue;
    for (let xx = x; xx < x + 3; xx++) {
      p.put(xx, y, STONE, 3, 1, c.jit);
      p.put(xx, y + 1, STONE, xx === x + 2 ? 1 : 2, 0, c.jit);
    }
  }
  despeckle(p, top, h, margin);
}

/**
 * Stone pixels in rows y0..y1 whose tone no neighbour of the same stone shares, even at a
 * corner, take the tone most of their four neighbours have. The rim rules leave such specks
 * where a stone's top rim meets its right side on a staircase edge -- 40 to 50 in a 64 px
 * tile, measured -- and a lone pixel is noise, not drawing. A pixel joined to its like at a
 * corner is a clean diagonal and stays. (`margin`, when given, skips pixels deep inside.)
 */
function despeckle(p, y0, y1, margin = null) {
  const { w } = p;
  const N8OFF = N8.map(([dx, dy]) => dy * w + dx), N4OFF = N4.map(([dx, dy]) => dy * w + dx);
  for (let pass = 0; pass < 2; pass++) {
    const fix = [];
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (p.mat[i] !== STONE || (margin && margin[i] > DEEP_INSIDE)) continue;
        const t = p.tone[i];
        const fast = x > 0 && x < w - 1 && y > 0 && y < p.h - 1;
        let alone = true;
        for (let k = 0; k < 8; k++) {
          const j = fast ? i + N8OFF[k] : p.i(x + N8[k][0], y + N8[k][1]);
          if (j !== i && p.mat[j] === STONE && p.tone[j] === t) { alone = false; break; }
        }
        if (!alone) continue;
        const votes = new Map();
        for (let k = 0; k < 4; k++) {
          const j = fast ? i + N4OFF[k] : p.i(x + N4[k][0], y + N4[k][1]);
          if (j !== i && p.mat[j] === STONE) votes.set(p.tone[j], (votes.get(p.tone[j]) || 0) + 1);
        }
        let best = t, most = 0;
        for (const [v, n] of votes) if (n > most) { best = v; most = n; }
        if (best !== t) fix.push([i, best]);
      }
    }
    for (const [i, t] of fix) p.tone[i] = t;
  }
}

// --- the flag course ------------------------------------------------------------------------
//
// Flags 10 rows thick, their top row the landing line, laid over the rubble with a row of
// earth under them and the two rows of rubble below that a tone darker, in their shadow.
// `joints` are the columns where two flags meet. Pits, grain and a chip are thrown per flag,
// and kept `margin` px off the plan's side edges (a tile's pair must meet its neighbour).

function flags(p, joints, seed, margin) {
  const w = p.w;
  const isJoint = new Uint8Array(w);
  for (const j of joints) isJoint[((j % w) + w) % w] = 1;
  const J = (x) => isJoint[((x % w) + w) % w] === 1;
  for (let x = 0; x < w; x++) {
    p.put(x, UNDER, EARTH, 1);
    for (const y of [UNDER + 1, UNDER + 2]) {
      const i = p.i(x, y);
      if (p.mat[i] !== NONE) p.tone[i] = Math.max(1, p.tone[i] - 1);
    }
  }
  despeckle(p, UNDER + 1, UNDER + 9);     // the shadow rows leave specks of their own under them

  const last = FLAG_ROWS - 1;
  for (let x = 0; x < w; x++) {
    const j = J(x), end = J(x + 1), start = J(x - 1);
    for (let row = 0; row < FLAG_ROWS; row++) {
      let t;
      if (row === 0) t = j ? 5 : 7;                        // the landing line, notched at a joint
      else if (j) t = 1;                                    // the joint
      else if (row === last) t = start || end ? 1 : 2;      // the underside, its corners round
      else if (end) t = row === last - 1 ? 2 : 3;           // the shadowed right end
      else if (row === last - 1) t = 3;                     // the face turning under
      else if (start) t = row === 1 ? 7 : 6;                // the lit left end, bevelled at the top
      else t = row === 1 ? 6 : 5;                           // the bevel under the top, then the face
      p.put(x, SURFACE + row, FLAG, t);
    }
    // The rim over the landing line, unbroken across the joints: the boots stand on it.
    p.put(x, SURFACE - 1, FLAG, 0);
  }

  // The faces: shallow pits (two to four pixels half a step under the face), every other one
  // with a pale grain beside it (the face is stone, not board), and a chip knocked out of a
  // lower edge now and then, well clear of a joint.
  const face = (x, row) => { const i = p.i(x, SURFACE + row); return p.mat[i] === FLAG && p.tone[i] === 5; };
  const r = rng('GROUND', 'flags', seed);
  const n = Math.round((w / GROUND_W) * 12);
  for (let k = 0; k < n; k++) {
    const x = r.int(margin, w - margin - 5), row = r.int(2, last - 2), len = r.int(2, 4);
    const room = [];
    for (let o = -1; o <= len; o++) room.push([o, 0], [o, -1], [o, 1]);
    if (!room.every(([o, dr]) => face(x + o, row + dr))) continue;
    for (let o = 0; o < len; o++) p.put(x + o, SURFACE + row, FLAG, 4);
    if (k % 2 && face(x + len + 1, row - 1) && face(x + len + 2, row - 1)) {
      p.put(x + len + 1, SURFACE + row - 1, FLAG, 6); p.put(x + len + 2, SURFACE + row - 1, FLAG, 6);
    }
  }
  const chips = Math.max(1, Math.round(w / 96)), chipAt = [];
  for (let k = 0; k < chips; k++) {
    const x = r.int(margin + 2, w - margin - 6);
    // Clear of a joint, and of another chip: two overlapping left one pixel of flag between.
    if (![-2, -1, 0, 1, 2, 3, 4].every((o) => !J(x + o)) || chipAt.some((c) => Math.abs(c - x) < 8)) continue;
    chipAt.push(x);
    for (const o of [0, 1, 2]) p.put(x + o, SURFACE + last, EARTH, 1);
    p.put(x + 1, SURFACE + last - 1, EARTH, 1);
    p.put(x, SURFACE + last - 1, FLAG, 2); p.put(x + 2, SURFACE + last - 1, FLAG, 2);
  }
}

// --- colour ---------------------------------------------------------------------------------

/** How many tones down a pixel steps at depth d (art rows below the landing line). */
const band = (d) => (d < DARK_FROM ? 0 : Math.min(STEPS, 1 + Math.floor((d - DARK_FROM) / DARK_STEP)));

/**
 * SINK[base][s]: what a stone whose body is tone `base` shows `s` bands down, as the tones of
 * its four parts -- shadow (bottom and right rims, pits), body, lit rim, highlight. Set by
 * hand, like a ramp. The first band keeps every part a tone apart; then the lit rim closes
 * onto the body and the highlight onto the rim; then the stone is one dim tone with its
 * shadow side gone into the joints; then it is gone -- the paler stones (body 3) a band after
 * the darker, so the rubble thins out stone by stone instead of ending on one line.
 *
 * It used to subtract s from every tone, which put the BODY out first: two or three bands
 * down the body was DEEP while its top and left rims were still one or two tones up, and all
 * that was left of each stone was a thin lit arc on black -- 5,462 such pixels in the strip,
 * down the lower third of the start frame, reading as scratches or rain on the dark rather
 * than stones sinking into it. (Holding every tone at 1 or more until the last band, the
 * next try, turned the middle depths into one flat mesh of identical dim stones that all
 * went out on the same row.)
 */
const SINK = {
  2: [[1, 2, 3, 4], [1, 1, 2, 3], [1, 1, 1, 2], [0, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  3: [[2, 3, 4, 5], [1, 2, 3, 4], [1, 2, 2, 3], [1, 1, 2, 2], [0, 1, 1, 1], [0, 0, 0, 0]],
};

/**
 * A plan coloured with its row 0 lying `d0` rows below the landing line. A stone or an earth
 * pocket steps down as a whole, by its centre's depth plus its jitter, so no step is a ruled
 * line across the ground. The joints between step by row: their one step is from a near-black
 * to DEEP (luma 17 to 10), invisible as a line. (A checker at each step's edge, the first try,
 * was a stippled patch wherever a step crossed a pocket, and a hundred lone pixels in the
 * joints.) `lastLit` is the last row with anything in it but DEEP.
 */
function colour(plan, d0) {
  const pix = new Pix(plan.w, plan.h);
  const out = pix.data;
  pix.lastLit = -1;
  for (let y = 0; y < plan.h; y++) {
    const d = d0 + y;
    for (let x = 0; x < plan.w; x++) {
      const i = y * plan.w + x, m = plan.mat[i];
      if (m === NONE) continue;
      let t;
      if (plan.whole[i]) {
        // A stone or an earth pocket as a whole, by its centre's depth. In the first band it
        // is as painted (the shadow rows under the flags included); below, by SINK.
        const s = band(d + plan.cyo[i] + plan.jit[i]);
        const b = plan.base[i], role = plan.tone[i] - b;
        t = s === 0 ? plan.tone[i] : SINK[b][s][(role < -1 ? -1 : role > 2 ? 2 : role) + 1];
      } else {
        t = m === FLAG ? plan.tone[i] : Math.max(0, plan.tone[i] - band(d));
      }
      if (t > 0) pix.lastLit = y;
      const c = RGBA[m][t];
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
  }
  return pix;
}

function toCanvas(pix) {
  // Smoothing off where the canvas is made (canvases.js), as for every other buffer here: a
  // fresh canvas smooths by default, and the headless one never does, so no shot would show
  // the blur.
  const { c, g } = newCanvas(pix.w, pix.h);
  pixToCanvas(pix, g);
  return c;
}

// --- the brief's pair -------------------------------------------------------------------------

/**
 * GROUND-TOP (64 x 40) and GROUND-FILL (64 x 64) at full strength, painted as the brief asks
 * for them: the fill wraps both ways, the top wraps left to right and its rubble is the
 * fill's own last rows, so the top continues into the fill below it. The shape an artist's
 * pair replaces; nothing calls it today (no review tool prints it).
 */
export function groundTiles() {
  const fill = new Plan(GROUND_W, FILL_H, true);
  rubble(fill, 'tile');
  const top = new Plan(GROUND_W, TOP_H, true);
  for (let y = UNDER + 1; y < TOP_H; y++) {
    const fy = FILL_H - (TOP_H - y);
    for (let x = 0; x < GROUND_W; x++) {
      const i = fill.i(x, fy);
      top.put(x, y, fill.mat[i], fill.tone[i], fill.cyo[i], fill.jit[i], fill.whole[i], fill.base[i]);
    }
  }
  flags(top, [6, 37], 'tile', 8);
  return { top: toCanvas(colour(top, -1e4)), fill: toCanvas(colour(fill, -1e4)) };
}

// --- the game's strip -------------------------------------------------------------------------

let built = null;

/**
 * Build the ground now. The Renderer calls this at construction, so the first frame of the
 * first run -- where the ground is all the scenery under the Duke -- costs nothing. Returns
 * what was built, with the build's cost by part, for the tools.
 */
export function warmGround() {
  if (built) return built;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
  const t0 = now();
  const w = Math.round((PLAY_R - PLAY_L) * PX);
  // Rows enough for the deepest stone to reach DEEP: its jitter and its half height past
  // DEEP_AT. The strip is cut back to the last row that is not all DEEP below.
  const h = SURFACE + DEEP_AT + DARK_STEP / 2 + 12;
  const plan = new Plan(w, h, false, UNDER + 1);
  rubble(plan, 'strip');
  const t1 = now();
  // Flags of 26 to 38, as they came from the quarry, from a few pixels in.
  const r = rng('GROUND', 'joints');
  const joints = [];
  for (let x = r.int(3, 20); x < w; x += r.int(26, 38)) joints.push(x);
  flags(plan, joints, 'strip', 0);
  const t2 = now();
  const pix = colour(plan, -SURFACE);
  const height = pix.lastLit + 1;
  const cut = new Pix(w, height);
  cut.data.set(pix.data.subarray(0, w * height * 4));
  const wide = toCanvas(cut);
  const t3 = now();
  built = {
    wide, height, joints,
    ms: t3 - t0, msRubble: t1 - t0, msFlags: t2 - t1, msColour: t3 - t2,
  };
  return built;
}

export function resetGround() { built = null; }

/**
 * Floor 0, in the world transform (world units, y up): the ground strip under the ledge's
 * span, then the deep colour down to the bottom of the view. `bottom` is the view's lower
 * edge in world units; `half` is the half-width the walls are DRAWN at (game.arenaHalfView).
 *
 * The walls are drawn before the ledges, and while the shaft widens they glide out to the
 * new width over a second or so, where the ground (floor 0 of the tower) has already
 * stepped to it. Spanning the ledge's own width, the ground then painted its flags and
 * rubble straight across both walls to the edges of the screen -- which happens to anyone
 * who runs along the start floor to build speed before the first jump (measured: the shaft
 * steps at 1.8 s with the ground on screen, for 291 steps). The old brown slab did the same
 * and passed for more wall. So the ground stops where the walls are drawn.
 */
export function drawGround(ctx, pl, bottom, half = Infinity) {
  const b = warmGround();
  const u = 1 / PX;
  const lo = Math.max(pl.x, CX - half), hi = Math.min(pl.x + pl.w, CX + half);
  // On the art grid, covering the span: floor on the left, ceil on the right, since the
  // shaft's width is not a whole number of art pixels at every arena step. The strip is
  // anchored to the shaft's left limit, so it stays put in the world as the walls move out.
  const l = Math.max(Math.floor(lo * PX), Math.round(PLAY_L * PX));
  const r = Math.min(Math.ceil(hi * PX), Math.round(PLAY_R * PX));
  if (r <= l) return;
  const sx = l - Math.round(PLAY_L * PX);
  const low = pl.y - (b.height - SURFACE) * u;   // the strip's bottom edge, world y
  if (pl.y + SURFACE * u >= bottom - 3) {
    ctx.save();
    ctx.scale(1, -1);
    // Flipped, so the image's rows run down the screen; its top is the negated world y of
    // its first row, SURFACE art rows above the landing line.
    ctx.drawImage(b.wide, sx, 0, r - l, b.height, l * u, -(pl.y + SURFACE * u), (r - l) * u, b.height * u);
    ctx.restore();
  }
  if (low > bottom - 3) {
    ctx.fillStyle = DEEP;
    ctx.fillRect(l * u, bottom - 3, (r - l) * u, low - (bottom - 3));
  }
}
