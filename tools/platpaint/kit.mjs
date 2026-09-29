// The painters' kit: what every tools/platpaint/<zone>.mjs paints a ledge cell with.
//
// The contract a painter works to is at the top of ./index.mjs. This file is the tools that
// make its rules hold by construction rather than by care: one strip function for the tile
// and both caps, the 4-pixel slot check, a way to put a repeating object in every repeat
// and not near the ends, ASCII stamps, an outline pass, and a measurement of the finished
// cell that --provisional prints for every painted zone.
//
// DOWNTOWN and STORM (./downtown.mjs, ./storm.mjs) are built from it and decode pixel for
// pixel as they did when they lived in one file (tools/platform-painters.mjs), so a change
// here that moves them is a change to the kit, and `node tools/diff-platforms.mjs` says so.
//
// A cell is CELL_H rows of CELL_W entries, each a '#rrggbb' string or null (transparent).

// --- the cell -------------------------------------------------------------------------
//
//   x  0-15   LEFT CAP    drawn once, at the left end of every ledge
//   x 16-47   TILE        repeated as many times as the width needs
//   x 48-63   RIGHT CAP   drawn once, at the right end
//
// Row 12 is the walking surface: the boots stand on its top edge. Twelve rows of headroom
// above it for anything proud of the surface, twenty-eight below for the body -- PLAT_THICK
// (7 world units) at PX 4, one art pixel per backing pixel at zoom 1.
export const CELL_W = 64, CELL_H = 40, CAP_W = 16, TILE_W = 32;
export const HEAD = 12, BODY = CELL_H - HEAD;
/** The walking surface's row. */
export const SURFACE = HEAD;
/** The texture's period in columns: ONE LESS than the tile, so tile column 31 IS column 0. */
export const PERIOD = TILE_W - 1;
/** The width of a slot a discrete object must fit in: PX art pixels, one world unit. */
export const SLOT = 4;

export const mod = (a, n) => ((a % n) + n) % n;

/** A small deterministic hash in [0, 1) of two integers, for grain and speckle. */
export function hash(a, b) {
  let s = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0;
  return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}

/** An empty cell: CELL_H rows of CELL_W colours, null where it is transparent. */
export function blank() {
  return Array.from({ length: CELL_H }, () => new Array(CELL_W).fill(null));
}

// --- the period-31 wrap strip -----------------------------------------------------------
//
// The importer's wrap test butts the tile's last column against its first, and in play the
// renderer does exactly that at every join. Nothing about a drawing makes the two meet,
// so paint the whole cell from ONE function of a strip coordinate X = x - 16 whose
// texture repeats every 31 columns, not 32: the tile's column 31 is then the same pixels
// as its column 0, the edge difference is zero by construction, and in play the join shows
// one column twice, which in grain, stone or cloud nobody can see.
//
// The caps come out of the same function: the left cap is strip X -16..-1 (repeat columns
// u 15..30), the right cap X 32..47 (u 1..16). So each cap meets the tile as two
// neighbouring columns of one drawing, and only its far end is drawn as an end.

/** The strip coordinate of cell column x: 0 at the tile's first column. */
export const stripX = (x) => x - CAP_W;
/** The repeat column (0..30) of cell column x. */
export const stripU = (x) => mod(x - CAP_W, PERIOD);

/**
 * A whole cell -- both caps and the tile -- from one strip function.
 * fn(u, y, X): u the repeat column 0..30, y the row, X the strip coordinate (-16..47, for
 * anything that must know where the cell's ends are). Returns a colour, or null.
 */
export function fromStrip(fn) {
  const c = blank();
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) c[y][x] = fn(stripU(x), y, stripX(x)) || null;
  }
  return c;
}

/**
 * The cap/tile assembly: the strip across the whole cell, then each far END drawn over it.
 *
 * end(put, get, side) is called once for 'left' and once for 'right'. put(d, y, colour) and
 * get(d, y) address columns by d, the distance in from that end (0 = the ledge's last
 * column), so one function draws both ends and they cannot drift apart. It mirrors the
 * COLUMNS only: light still comes from the upper left, so a lit outer face on the left end
 * is a shaded one on the right -- use `side` for that.
 */
export function assemble(strip, end) {
  const c = fromStrip(strip);
  if (end) {
    for (const side of ['left', 'right']) {
      const x = (d) => (side === 'left' ? d : CELL_W - 1 - d);
      const ok = (d, y) => d >= 0 && d < CELL_W && y >= 0 && y < CELL_H;
      end((d, y, col) => { if (ok(d, y)) c[y][x(d)] = col || null; },
        (d, y) => (ok(d, y) ? c[y][x(d)] : null), side);
    }
  }
  return c;
}

/**
 * Strip-coordinate copies of shapes that repeat but can overlap their neighbours (puffs,
 * stones, scallops): each item placed at item.u + k * PERIOD, for every k whose copy comes
 * within `reach` of the cell. Returned in order of k, then of `items`, each with `x` set,
 * so drawing them in list order is a fixed back-to-front order. A shape that crosses the
 * repeat's edge is then drawn whole on both sides of it, which is the only way a round
 * thing can wrap.
 */
export function copies(items, reach) {
  const out = [];
  const lo = -CAP_W - reach, hi = CELL_W - CAP_W - 1 + reach;
  for (let k = -3; k <= 4; k++) {
    for (const it of items) {
      const x = it.u + k * PERIOD;
      if (x >= lo && x <= hi) out.push({ ...it, x });
    }
  }
  return out;
}

// --- the 4-pixel slot --------------------------------------------------------------------
//
// The renderer lays a ledge as LEFT CAP, whole tiles, then a PART tile cut from the tile's
// left, then RIGHT CAP (Renderer.drawPlatforms). Ledge widths are whole world units and a
// world unit is 4 art pixels, so the part tile is 0, 4, 8, ... or 28 pixels: a cut falls
// between tile columns 4k - 1 and 4k, for any k, and the right cap follows it. Anything
// DISCRETE in the tile -- a post, a bolt, a skull, a block joint, a vertebra -- that
// straddles such a cut is sliced on one ledge width in eight. The first DOWNTOWN post was
// eight wide and one DOWNTOWN ledge in eight ended in half of it.
//
// So a discrete object sits in ONE slot, repeat columns 4k..4k+3. And never on column 0:
// tile column 31 repeats it, and the right cap starts at u 1, so after a part tile the cap
// shows the object without its first column. The slots are therefore 1-3, 4-7, 8-11, ...,
// 24-27 and 28-30. Texture (grain, cloud, moss) can cross a cut; objects cannot.
//
// The caps show the strip too: the left cap is u 15..30 and the right cap u 1..16, so an
// object in slot 12-15 leaves its last column at the left end (x 0), and one in 16-19 its
// first at the right end (x 63), unless the end drawn over them covers it. repeatAt's
// margin keeps whole copies away from the ends.

/**
 * Check a discrete object's place against the slot rule, and return u0. Throws, with the
 * reason, if repeat columns u0..u0+w-1 are not inside one slot or touch column 0 -- call
 * it where the object is defined, so a moved object fails the paint, not a review.
 * It checks the cuts INSIDE a run, not the ledge's two ends: an object drawn by the strip
 * function over u 14-15 or u 16-17 still shows a sliver at x 0 or x 63 (see the caps note
 * above, and rule 4 in ./index.mjs).
 */
export function slot(u0, w = SLOT, what = 'an object') {
  const u1 = u0 + w - 1;
  if (w < 1 || w > SLOT) throw new Error(`${what}: ${w} columns wide; a discrete object is at most ${SLOT}`);
  if (u0 < 1 || u1 > PERIOD - 1) {
    throw new Error(`${what}: repeat columns ${u0}-${u1}; objects live in 1..${PERIOD - 1} -- column 0 ` +
      'is repeated as tile column 31 and the right cap starts after it, so it is always sliced');
  }
  if (Math.floor(u0 / SLOT) !== Math.floor(u1 / SLOT)) {
    // The slot's USABLE columns: the first slot loses column 0 and the last one column 31
    // (which is column 0 again), so the advice is 1..3 and 28..30 there, not 0..3 and
    // 28..31 -- the bare slot bounds sent the next attempt straight into the error above.
    const s0 = Math.floor(u0 / SLOT) * SLOT;
    throw new Error(`${what}: repeat columns ${u0}-${u1} cross the cut at ${Math.floor(u1 / SLOT) * SLOT}; ` +
      `keep it inside ${Math.max(1, s0)}..${Math.min(PERIOD - 1, s0 + SLOT - 1)}`);
  }
  return u0;
}

/**
 * Every cell column x0 at which a w-column object whose repeat column is u0 starts, one per
 * repeat, including copies cut off by the cell's edges -- minus any copy not wholly inside
 * [margin, CELL_W - margin), so nothing repeating crowds an end or is sliced by one.
 */
export function repeatAt(u0, w = 1, { margin = 0 } = {}) {
  const out = [];
  for (let x = -(w - 1); x < CELL_W; x++) {
    if (stripU(x) !== u0) continue;
    if (x >= margin && x + w <= CELL_W - margin) out.push(x);
  }
  return out;
}

/**
 * Draw ASCII rows into the cell with its top-left at (x0, y0), clipped to the cell. `ink`
 * maps a character to a colour; '.' and any unmapped character leave the pixel alone.
 */
export function stamp(c, x0, y0, rows, ink) {
  rows.forEach((row, i) => {
    const y = y0 + i;
    if (y < 0 || y >= CELL_H) return;
    for (let j = 0; j < row.length; j++) {
      const x = x0 + j;
      const col = ink[row[j]];
      if (row[j] !== '.' && col && x >= 0 && x < CELL_W) c[y][x] = col;
    }
  });
  return c;
}

// --- the outline pass -----------------------------------------------------------------------
//
// Selective outline, the pixel-art way: an EMPTY pixel touching the drawing takes a dark
// colour, and which one can follow what it touches (stone's darkest for stone, moss's for
// moss) rather than one black for everything. Run it over the strip-painted cell and it
// keeps the wrap: tile columns 0 and 31 have the same neighbours (u 30 and u 1). It cannot
// reach past the cell's ends, so leave the ledge's end columns room for their own edge.
//
// `where(x, y)` limits it. The rim a ledge needs over its landing line is one call:
// outline(c, INK, { where: (x, y) => y === SURFACE - 1 }).

/**
 * Outline the drawing. ink: a colour, or fn(touching: colours[], x, y) -> colour | null.
 * Four-connected unless `diagonal`. Every pixel is decided from the cell as it was, then
 * written, so the pass never feeds on itself.
 */
export function outline(c, ink, { diagonal = false, where = null } = {}) {
  const dirs = diagonal
    ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const hits = [];
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      if (c[y][x] || (where && !where(x, y))) continue;
      const touching = [];
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < CELL_W && yy < CELL_H && c[yy][xx]) touching.push(c[yy][xx]);
      }
      if (!touching.length) continue;
      const col = typeof ink === 'function' ? ink(touching, x, y) : ink;
      if (col) hits.push([x, y, col]);
    }
  }
  for (const [x, y, col] of hits) c[y][x] = col;
  return c;
}

// --- looking at it ---------------------------------------------------------------------------

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Luma 0..255 (Rec. 601, as the rest of the project's tools measure it). */
export function luma(hex) {
  const [r, g, b] = rgbOf(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * The cell as ASCII, one character per colour, darkest first, plus the legend -- the way
 * to read what a drawing really is before judging it at 8x, where the eye fills in the
 * drawing it expects.
 */
export function ascii(c) {
  const cols = [...new Set(c.flat().filter(Boolean))].sort((a, b) => luma(a) - luma(b));
  const CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const key = new Map(cols.map((h, i) => [h, CH[i] || '?']));
  const rows = c.map((row, y) => `${String(y).padStart(2)} ${row.map((h) => (h ? key.get(h) : '.')).join('')}`);
  return rows.join('\n') + '\n' + cols.map((h) => `${key.get(h)} ${h} luma ${luma(h).toFixed(0)}`).join('\n');
}

/**
 * What the importer and the runtime will make of a finished cell, as numbers:
 *   colours   distinct colours (the zone's palette holds up to 91)
 *   wrapRows  rows where tile column 31 differs from column 0: must be 0
 *   joinRows  rows where a cap's inner column is not the tile's neighbouring column
 *             (cap x 15 = tile u 30, cap x 48 = tile u 1): 0 unless an end reaches in
 *   line      the landing row in the tile: solid columns of 32, its mean luma, the
 *             brightest mean-luma row below it, and how many columns have a rim over it
 *             (row 11 solid and under half the line's luma)
 *   under     the underside hanging furniture hangs from: per tile column, the solid run
 *             down from row 12, median -- decor.js undersideFor's rule
 */
export function measure(c) {
  const cols = new Set(c.flat().filter(Boolean));
  let wrapRows = 0, joinRows = 0;
  for (let y = 0; y < CELL_H; y++) {
    if (c[y][CAP_W] !== c[y][CAP_W + TILE_W - 1]) wrapRows++;
    if (c[y][CAP_W - 1] !== c[y][CAP_W + TILE_W - 2] || c[y][CAP_W + TILE_W] !== c[y][CAP_W + 1]) joinRows++;
  }
  const tile = (y) => c[y].slice(CAP_W, CAP_W + TILE_W);
  const rowLuma = (y) => {
    const v = tile(y).filter(Boolean).map(luma);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const line = tile(SURFACE);
  let below = { y: -1, luma: 0 };
  for (let y = SURFACE + 1; y < CELL_H; y++) {
    const l = rowLuma(y);
    if (l > below.luma) below = { y, luma: l };
  }
  let rim = 0;
  for (let i = 0; i < TILE_W; i++) {
    const top = line[i], over = c[SURFACE - 1][CAP_W + i];
    if (top && over && luma(over) < luma(top) * 0.5) rim++;
  }
  const runs = [];
  for (let i = 0; i < TILE_W; i++) {
    let y = SURFACE;
    while (y < CELL_H && c[y][CAP_W + i]) y++;
    runs.push(y - SURFACE);
  }
  runs.sort((a, b) => a - b);
  return {
    colours: cols.size, wrapRows, joinRows,
    line: { solid: line.filter(Boolean).length, luma: rowLuma(SURFACE), below, rim },
    under: Math.max(1, runs[runs.length >> 1]),
  };
}
