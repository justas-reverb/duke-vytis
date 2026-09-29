// FOREST: broadleaf trees rising out of the moss, each crown a few big leaf masses, and fern
// and grass along the lip.
//
// Drawn at one art pixel per screen pixel, the Duke's scale, after the user's fixes board
// (assets/decor-fixes-reference.webp): tree A a round-crowned sapling, tree B a low two-way
// fork carrying two leaf masses, tree C a tall trunk with its masses stacked left and right
// -- big masses with sky between them, lit from the upper left, dark trunks, a grassy foot.
// The board is followed for design and palette only; every pixel here is placed by the code
// below. The board's trees are squat, about as wide as tall; the slot is 60 wide and 120
// usable rows tall, so these keep its shapes on longer trunks. Before the board the canopy
// was built from many small even clumps, each with a dark crease under it, and close up the
// creases lined up in rows like roof tiles; before that the trees were three stacked green
// bars on a pole.
//
// Deliberately tall and high-contrast: the forest BACKDROP is already a wall of green
// trunks, so a small green sprout on a ledge disappears into it. A dark trunk and a pale
// rim on the top of every leaf mass are what separate the thing standing on the platform
// from the scenery behind it.
//
// A tree's box is taller than the gap to the ledge above (136 art px; ledges are 120 apart),
// and the ledge above is drawn later, so what reaches past it is covered and the canopy
// reads as rising behind the next floor -- but only what reaches past its BODY. The top 12
// rows would stand ON that ledge's walking surface, in front of everything, as a green bun
// with no trunk; a verifier found the tall tree doing exactly that. So nothing is drawn in
// a tree's top 16 rows (TOP, below).
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { rng, fit } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.72;   // the band is identified BY its growth

// --- the palette ----------------------------------------------------------------------
//
// Ramps run dark to light and are hue-shifted rather than shaded grey: leaf shadow leans
// blue-green and leaf light leans yellow, bark shadow leans plum and bark light leans
// orange. The backdrop is a cool, dark green (luminance 0.01-0.07, #17441e, #29542b), so
// the canopy is kept WARMER and lighter than it -- its light half is the board's olive and
// yellow-green, which that backdrop never is -- and the trunk is a dark warm brown against
// the backdrop's olive-grey trunks. The board's bark is near black; this ramp keeps its
// darkness but a warmer lit edge, which is what shows a dark trunk on a dark backdrop.
// Every material gets its own dark outline where it meets the air.
//
// The leaf SHADOW is teal, as on the board's tree A, whose shaded side is blue-green. The
// first ramp for this board kept it green (#10231f, #1b3a28, #2e5226): those three tones
// lie inside the backdrop's own range, luminance 0.014-0.068 against a median of 0.026 and
// a 95th percentile of 0.070, at the backdrop's hue: each within Lab dE 3-8 of a colour the
// backdrop really uses (#2e5226 is dE 3 from its mid green). They made up 41-55% of every
// crown, so in a real frame the underside of each mass vanished into the scenery and only
// its lit cap showed -- the crowns read as small pale puffs on long sticks, and the fork as
// a slingshot. Lifting the undersides a tone did not help (the tone above is the backdrop's
// own mid green), and value alone cannot leave that range without flattening the light.
// Hue can: teal and blue-green (hue 148-190 against the backdrop's 126) put every leaf tone
// at dE 9 or more from the backdrop while the lit half stays the board's olive and
// yellow-green.

const LEAF = ['#0f2226', '#1a3b3a', '#2f5c44', '#4a6c2b', '#71903a', '#a2b94d', '#c8da76'];
const BARK = ['#190d11', '#2f1a1a', '#4a2c21', '#69442f', '#8f613e'];
const FERN = ['#133019', '#234f22', '#3a7428', '#619b33', '#94c14b'];
const SOIL = ['#1d120f', '#33211a', '#4b3326'];

const M_BARK = 1, M_LEAF = 2, M_FERN = 4, M_SOIL = 5;
const RAMP = { [M_BARK]: BARK, [M_LEAF]: LEAF, [M_FERN]: FERN, [M_SOIL]: SOIL };
const EDGE = { [M_BARK]: '#140a0d', [M_LEAF]: '#0b1a12', [M_FERN]: '#0b1a10', [M_SOIL]: '#140c0a' };
const RIM = 6;   // LEAF[6], the pale rim, only ever on the top of a leaf mass

// --- the plan -------------------------------------------------------------------------
//
// A tree is drawn as a plan first -- a material and a tone per pixel, and for leaves which
// mass the pixel belongs to -- and turned into colours last. Shading needs to know what a
// pixel is and what is next to it (how far across the trunk, whether the air or another
// mass is above it), which colours alone do not say.

class Plan {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.m = new Uint8Array(w * h);
    this.t = new Int8Array(w * h);
    this.g = new Uint8Array(w * h);   // the leaf mass a pixel belongs to, 1 up; 0 for the rest
  }

  ok(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  put(x, y, m, t, g = 0) {
    x = Math.round(x); y = Math.round(y);
    if (!this.ok(x, y)) return;
    const i = y * this.w + x;
    this.m[i] = m;
    this.t[i] = t;
    this.g[i] = g;
  }

  mat(x, y) { return this.ok(x, y) ? this.m[y * this.w + x] : 0; }

  tone(x, y) { return this.ok(x, y) ? this.t[y * this.w + x] : -1; }

  grp(x, y) { return this.ok(x, y) ? this.g[y * this.w + x] : 0; }

  setTone(x, y, t) { if (this.ok(x, y)) this.t[y * this.w + x] = t; }

  /**
   * fn(x, y) for every pixel of material m, top row first. A callback rather than a list:
   * a tree is several thousand pixels and five passes, and an [x, y] array for each of
   * them was most of what building a tree cost the first time.
   */
  forEach(m, fn) {
    for (let y = 0, i = 0; y < this.h; y++) for (let x = 0; x < this.w; x++, i++) if (this.m[i] === m) fn(x, y);
  }

  /**
   * Into the Pix, with a one-pixel outline in the darkest colour of whatever it borders --
   * a leaf's edge is green-black, a trunk's brown-black -- so the outline reads as the
   * edge of that thing rather than a black line drawn round everything.
   */
  paint(p) {
    const n4 = [[0, 1], [1, 0], [-1, 0], [0, -1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const m = this.mat(x, y);
        if (m) { p.set(x, y, RAMP[m][this.tone(x, y)]); continue; }
        for (const [dx, dy] of n4) {
          const q = this.mat(x + dx, y + dy);
          if (q) { p.set(x, y, EDGE[q]); break; }
        }
      }
    }
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// --- bark -------------------------------------------------------------------------------

/**
 * The trunk: a column whose centre and width are interpolated down `pts` ([y, cx, w], top
 * to bottom), flaring by `flare` px over the bottom `flareH` rows, where the roots join it.
 * Returns each row's span, for the bark texture to follow.
 */
function trunk(pl, s) {
  const yB = pl.h - 1;
  const spans = new Map();
  for (let y = s.pts[0][0]; y <= yB; y++) {
    let k = 0;
    while (k < s.pts.length - 2 && y > s.pts[k + 1][0]) k++;
    const [ya, xa, wa] = s.pts[k], [yb, xb, wb] = s.pts[k + 1];
    const f = clamp((y - ya) / (yb - ya), 0, 1);
    const cx = xa + (xb - xa) * f;
    let w = wa + (wb - wa) * f;
    const fl = y - (yB - s.flareH);
    if (fl > 0) w += s.flare * (fl / s.flareH) ** 2;
    const l = Math.round(cx - w / 2), r = Math.round(cx + w / 2) - 1;
    for (let x = l; x <= r; x++) pl.put(x, y, M_BARK, 2);
    spans.set(y, [l, r]);
  }
  return spans;
}

/** A limb from (x0, y0) to (x1, y1), w0 px thick at its root tapering to w1. */
function limb(pl, x0, y0, x1, y1, w0, w1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s, r = (w0 + (w1 - w0) * s) / 2;
    for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
      for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
        if ((px - x) ** 2 + (py - y) ** 2 <= r * r + 0.25) pl.put(px, py, M_BARK, 2);
      }
    }
  }
}

/**
 * Light the bark as a cylinder lit from the left: across its narrower cross-section --
 * the row for the trunk and the steep limbs, the column for a limb that runs nearly level,
 * which is then lit on top -- the first fifth is the light tone, the far fifth the deep.
 */
function shadeBark(pl) {
  pl.forEach(M_BARK, (x, y) => {
    let dl = 0, dr = 0, du = 0, dd = 0;
    while (pl.mat(x - dl - 1, y) === M_BARK) dl++;
    while (pl.mat(x + dr + 1, y) === M_BARK) dr++;
    while (pl.mat(x, y - du - 1) === M_BARK && du < 40) du++;
    while (pl.mat(x, y + dd + 1) === M_BARK && dd < 40) dd++;
    const u = dl + dr <= du + dd ? (dl + 0.5) / (dl + dr + 1) : (du + 0.5) / (du + dd + 1);
    pl.setTone(x, y, u < 0.22 ? 3 : u < 0.5 ? 2 : u < 0.82 ? 1 : 0);
  });
}

/**
 * Bark texture down the trunk: dark furrows that wander a pixel either way, broken into
 * lengths, and short light ridges on the lit side. Only where the trunk is wide enough
 * for a furrow to be a furrow and not a hole.
 */
function barkTexture(pl, spans, r, from, to) {
  const furrows = [0.4, 0.66];
  for (const u0 of furrows) {
    let y = from + r.int(0, 4);
    while (y < to) {
      const len = r.int(6, 14), ph = r.float(0, 6);
      for (let j = 0; j < len && y + j < to; j++) {
        const sp = spans.get(y + j);
        if (!sp || sp[1] - sp[0] < 6) continue;
        const x = Math.round(sp[0] + u0 * (sp[1] - sp[0]) + Math.sin((y + j) * 0.35 + ph) * 0.8);
        if (pl.mat(x, y + j) === M_BARK) pl.setTone(x, y + j, Math.max(0, pl.tone(x, y + j) - 2));
      }
      y += len + r.int(2, 5);
    }
  }
  let y = from + r.int(0, 3);
  while (y < to) {
    const len = r.int(3, 6);
    for (let j = 0; j < len && y + j < to; j++) {
      const sp = spans.get(y + j);
      if (!sp || sp[1] - sp[0] < 5) continue;
      const x = sp[0] + 1;
      if (pl.mat(x, y + j) === M_BARK && pl.tone(x, y + j) >= 3) pl.setTone(x, y + j, 4);
    }
    y += len + r.int(3, 7);
  }
}

// --- leaves -----------------------------------------------------------------------------
//
// The board's canopy is a few BIG masses, each lit as one rounded thing -- pale on its top
// and upper left, dark underneath and to the right -- with sky between them. The canopy
// before it was built from many small puffs, each with a dark crease along its underside;
// the puffs sat on a staggered grid, so close up the creases lined up in rows of short dark
// dashes, like roof tiles. Here the only crease is where one whole mass meets the next.
//
// What keeps a mass foliage rather than a smooth bun is the leaf CELL: the mass is cut into
// cells two to four pixels across (the nearest of a jittered grid of points), and each cell
// takes one tone from the light at its centre, give or take a little. Where the light
// changes from one tone to the next the boundary runs round whole cells, so it breaks into
// small clusters of pale leaves over darker ones, as the board's does, instead of a smooth
// band; and the silhouette keeps or drops whole cells at its edge, so it is ragged with
// leaves too, on top of the bigger lobes round it.

/**
 * A jittered grid of points ~3 px apart, and for every pixel of rows yA..yB (where the
 * masses are; the rest of the box never asks) the nearest one.
 */
function leafCells(w, h, r, yA, yB) {
  const S = 3, gw = Math.ceil(w / S) + 1, gh = Math.ceil(h / S) + 1, n = gw * gh;
  const cx = new Float32Array(n), cy = new Float32Array(n), jit = new Float32Array(n), cut = new Float32Array(n);
  for (let j = 0, k = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++, k++) {
      cx[k] = i * S + (j % 2) * 1.5 + r.float(-1, 1);
      cy[k] = j * S + r.float(-1, 1);
      jit[k] = r.float(-1, 1);
      cut[k] = r.float(0.3, 0.7);
    }
  }
  const id = new Int32Array(w * h);
  for (let y = Math.max(0, yA); y <= Math.min(h - 1, yB); y++) {
    for (let x = 0; x < w; x++) {
      const gi = Math.floor(x / S), gj = Math.floor(y / S);
      let best = 1e9, bk = 0;
      for (let j = Math.max(0, gj - 1); j <= Math.min(gh - 1, gj + 1); j++) {
        for (let i = Math.max(0, gi - 1); i <= Math.min(gw - 1, gi + 1); i++) {
          const k = j * gw + i, d = (x - cx[k]) ** 2 + (y - cy[k]) ** 2;
          if (d < best) { best = d; bk = k; }
        }
      }
      id[y * w + x] = bk;
    }
  }
  return { id, cx, cy, jit, cut, n };
}

// The light, from the upper left and a little in front: [x, y, z], y down, unit length.
const LX = -0.48, LY = -0.7, LZ = 0.53;

/**
 * One leaf mass: an ellipse with lobes round its edge -- bigger on top, smaller and
 * flatter underneath -- lit as a whole from the upper left and each lobe as its own round
 * bump, so the top of a mass is a row of lit bumps and its underside falls into shade.
 * `lit` moves the whole mass up or down the ramp, so one set back in the crown is darker.
 */
function mass(pl, c, cells, r, gid) {
  const lobes = [[c.cx, c.cy, Math.min(c.rx, c.ry) - 1]];
  const n = Math.max(5, Math.round((c.rx + c.ry) / 3.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI + r.float(-0.25, 0.25);
    const rb = Math.sin(a) > 0.35 ? r.float(3, 4) : r.float(4.2, 6);
    lobes.push([c.cx + Math.cos(a) * (c.rx - rb), c.cy + Math.sin(a) * (c.ry - rb), rb]);
  }
  // The shape, once per pixel of the mass's box: 2 inside the core or a lobe, 1 within
  // GROW px of them, 0 outside. A leaf cell is kept if enough of it is inside, and then
  // drawn where it is 1 or 2: a cell may stick out a little past the lobes, which is what
  // makes the edge leafy, but not further -- a long thin cell kept whole ran out three
  // pixels as a spike. The core stops well inside the lobes, or they add no more than a
  // pixel of relief and the mass is a round bun with a rough edge.
  const GROW = 1.5;
  const x0 = Math.max(0, Math.floor(c.cx - c.rx) - 4), x1 = Math.min(pl.w - 1, Math.ceil(c.cx + c.rx) + 4);
  const y0 = Math.max(0, Math.floor(c.cy - c.ry) - 4), y1 = Math.min(pl.h - 1, Math.ceil(c.cy + c.ry) + 4);
  const bw = x1 - x0 + 1, shape = new Uint8Array(bw * (y1 - y0 + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - c.cx, dy = y - c.cy;
      let s = (dx / (c.rx - 4)) ** 2 + (dy / (c.ry - 4)) ** 2 <= 1 ? 2
        : (dx / (c.rx - 4 + GROW)) ** 2 + (dy / (c.ry - 4 + GROW)) ** 2 <= 1 ? 1 : 0;
      for (let k = 1; k < lobes.length && s < 2; k++) {
        const [lx, ly, lr] = lobes[k], d2 = (x - lx) ** 2 + (y - ly) ** 2;
        if (d2 <= (lr + 0.25) ** 2) s = 2;
        else if (d2 <= (lr + 0.25 + GROW) ** 2) s = 1;
      }
      shape[(y - y0) * bw + x - x0] = s;
    }
  }
  const light = (x, y) => {
    const whole = -(0.6 * (x - c.cx) / c.rx + 0.95 * (y - c.cy) / c.ry);
    let best = -1e9, b = lobes[0];
    for (const lb of lobes) {
      const d = 1 - Math.hypot(x - lb[0], y - lb[1]) / lb[2];
      if (d > best) { best = d; b = lb; }
    }
    let ux = (x - b[0]) / b[2], uy = (y - b[1]) / b[2];
    const q = ux * ux + uy * uy;
    if (q > 1) { const s = 1 / Math.sqrt(q); ux *= s; uy *= s; }
    const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
    return whole + 0.4 * (ux * LX + uy * LY + uz * LZ - 0.5) + (c.lit || 0);
  };
  const cov = new Uint8Array(cells.n), tot = new Uint8Array(cells.n), tone = new Int8Array(cells.n).fill(-1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = cells.id[y * pl.w + x];
      tot[k]++;
      if (shape[(y - y0) * bw + x - x0] === 2) cov[k]++;
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = cells.id[y * pl.w + x];
      if (!cov[k] || cov[k] < tot[k] * cells.cut[k] || !shape[(y - y0) * bw + x - x0]) continue;
      if (tone[k] < 0) {
        const v = light(cells.cx[k], cells.cy[k]) + cells.jit[k] * 0.26;
        tone[k] = v > 0.3 ? 5 : v > 0.02 ? 4 : v > -0.22 ? 3 : v > -0.45 ? 2 : v > -0.7 ? 1 : 0;
      }
      pl.put(x, y, M_LEAF, tone[k], gid);
    }
  }
}

/**
 * Each leaf's own light and shade, in the lit half of the canopy: a cell's pixels furthest
 * from the light (measured from the cell's own jittered centre) go a tone down, and those
 * nearest it a tone up, so the pale leaves stand apart from one another as the board's do
 * instead of melting into one flat patch. Not by the cell's edges: darkening every cell's
 * whole bottom edge lined the dashes up in rows (the cells come from a grid), and that was
 * the old canopy's roof tiles again. After the despeckle, which would take these single
 * pixels back out.
 */
function leafTexture(pl, cells) {
  pl.forEach(M_LEAF, (x, y) => {
    const i = y * pl.w + x, t = pl.t[i], k = cells.id[i];
    const s = (x - cells.cx[k]) * 0.6 + (y - cells.cy[k]) * 0.8;
    if (t >= 3 && s > 0.9) pl.t[i] = t - 1;
    else if (t >= 3 && t <= 4 && s < -1.1) pl.t[i] = t + 1;
  });
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const around = [0, 0, 0, 0];

/**
 * A pixel inside a material (three or four neighbours of it) whose tone none of those
 * neighbours shares takes the tone most of them have -- the lone speck a leaf cell of one
 * pixel leaves behind.
 */
function despeckle(pl, m) {
  pl.forEach(m, (x, y) => {
    const t = pl.tone(x, y);
    let n = 0;
    for (const [dx, dy] of N4) {
      if (pl.mat(x + dx, y + dy) !== m) continue;
      const q = pl.tone(x + dx, y + dy);
      if (q === t) return;
      around[n++] = q;
    }
    if (n < 3) return;
    let best = around[0], most = 0;
    for (let a = 0; a < n; a++) {
      let k = 0;
      for (let b = 0; b < n; b++) if (around[b] === around[a]) k++;
      if (k > most) { best = around[a]; most = k; }
    }
    pl.setTone(x, y, best);
  });
}

/**
 * Where masses meet. A mass set further back is darkest along the row just above the one
 * in front of it -- its belly in that mass's shade -- and every mass's lit pixels that face
 * the air above, or a mass behind it, or the air to their left, take the pale rim. Together
 * they draw the board's separation: the pale top of each mass against the dark underside
 * of the one behind it, one crease per MASS rather than one under every clump.
 */
function rim(pl) {
  pl.forEach(M_LEAF, (x, y) => {
    const g = pl.grp(x, y), below = pl.grp(x, y + 1);
    if (pl.mat(x, y + 1) === M_LEAF && below > g) pl.setTone(x, y, Math.min(pl.tone(x, y), 1));
  });
  pl.forEach(M_LEAF, (x, y) => {
    const g = pl.grp(x, y);
    if (pl.tone(x, y) >= 4 && (pl.grp(x, y - 1) < g || !pl.mat(x - 1, y))) pl.setTone(x, y, RIM);
  });
}

/** The canopy's shade on the bark just under it. */
function canopyShade(pl) {
  pl.forEach(M_BARK, (x, y) => {
    let k = 0;
    for (let j = 1; j <= 5; j++) if (pl.mat(x, y - j) === M_LEAF) { k = j; break; }
    if (k) pl.setTone(x, y, Math.max(0, pl.tone(x, y) - (k <= 2 ? 2 : 1)));
  });
}

// --- the foot ---------------------------------------------------------------------------

/**
 * Moss and grass heaped round the foot of the trunk: a low mound whose top edge is blades,
 * not a curve. It sits four or five pixels above the landing line, so a lit edge running
 * the width of it would be a second, brighter line right beside the one a player tracks
 * (and a smooth lit dome reads as a bun besides). Only the blade tips catch the light --
 * a broken row of points -- the rest of the top is a middle green, and the bottom row is
 * the darkest, where the mound sits in the ledge's moss.
 */
function mound(pl, cx, rx, h, r) {
  const yB = pl.h - 1;
  for (let dx = -rx; dx <= rx; dx++) {
    const blade = (dx + rx) % 2 === 0 && Math.abs(dx) < rx - 1 ? r.int(0, 2) : 0;
    const top = Math.round(h * Math.sqrt(Math.max(0, 1 - (dx / (rx + 0.5)) ** 2))) + blade;
    const lit = dx < 0 ? 1 : 0;
    for (let j = 0; j < top; j++) {
      const fromTop = top - 1 - j;
      const t = j === 0 ? 0 : fromTop === 0 ? (blade ? 2 : 1) + lit : 1;
      pl.put(cx + dx, yB - j, M_FERN, t);
    }
  }
}

/**
 * The contact shadow, in place of the runtime's `shadow`. Elsewhere a standing thing
 * declares a stone-coloured shadow for decor.js to paint into the lit lip under it -- but
 * that colour is shade(platTop, 0.5) = #745e32, luminance 0.11, and this zone's lip is
 * dark olive moss, mean 0.052: here it would paint a BRIGHTER patch on the landing line,
 * not a shadow. So the tree carries its own, inside its box: its bottom row goes to the
 * darkest tone of whatever is there (bark to its second darkest, the darkest being all but
 * its outline), and the row above it no lighter than a middle one. Those two rows sit on
 * the tile's dark head, just above the lip, and continue it; the lit moss below stays the
 * brightest line there is.
 */
function contact(pl) {
  const y = pl.h - 1;
  for (let x = 0; x < pl.w; x++) {
    const m = pl.mat(x, y);
    if (m) pl.setTone(x, y, Math.min(pl.tone(x, y), m === M_BARK ? 1 : 0));
    if (pl.mat(x, y - 1) && pl.mat(x, y - 1) !== M_LEAF) pl.setTone(x, y - 1, Math.min(pl.tone(x, y - 1), 2));
  }
}

/** Stamp an ASCII drawing into the plan: digits are tones of `m`, s/S soil. */
function stamp(pl, rows, x0, y0, m, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][flip ? rows[j].length - 1 - i : i];
      if (ch === '.') continue;
      if (ch === 's' || ch === 'S') pl.put(x0 + i, y0 + j, M_SOIL, ch === 's' ? 0 : 1);
      else pl.put(x0 + i, y0 + j, m, Number(ch));
    }
  }
}

// --- the undergrowth ------------------------------------------------------------------
//
// Drawn by hand, pixel by pixel: at 12 px a frond is a zig-zag two pixels wide, and only a
// drawn one keeps its leaflets. Digits are FERN tones 0 (deep) to 4 (lit), s and S soil.
// The bottom rows are dark on purpose: they sit on the ledge's lit top, the row a player
// tracks at speed, and a bright tuft base would be a brighter line along it.

const TUFTS = [
  // A fern: three feathery fronds fanning out of one crown, two short ones low down.
  // Each frond is a two-pixel staircase, whose stepped edges are the leaflets.
  [
    '............',
    '......4.....',
    '.4...43.....',
    '.43...33..4.',
    '..33.43..43.',
    '...32.32.3..',
    '.3..232.32..',
    '.32.232.2.3.',
    '..221212222.',
    '...1121111..',
    '....1101....',
    '...sSsSs....',
  ],
  // Grass: upright blades of mixed height, one bent.
  [
    '............',
    '....4.......',
    '....3...4...',
    '.4..3...3...',
    '.3..32..3...',
    '..3.32..2.4.',
    '..3..2.32.3.',
    '..32.2.3..3.',
    '...2.21.22..',
    '...2121.1...',
    '...10111....',
    '..sSsSsSs...',
  ],
  // A low spray: three short fronds splayed wide -- one long and nearly level to the
  // left, one upright, one up to the right -- low and wide where the fern is tall. The
  // first drawing of this one was a fountain of blades arching out from the middle, each
  // nested inside the next; with the outline filling the gaps between them it came out a
  // smooth dome in concentric bands, and on a ledge it read as a bun. Splayed fronds with
  // the air reaching down between them keep a jagged top, and that is what reads as a plant.
  [
    '............',
    '............',
    '............',
    '............',
    '......4.....',
    '.44..43...4.',
    '.433.3..443.',
    '..323.3.33..',
    '...2232.3...',
    '....2222....',
    '....1111....',
    '...sSsSs....',
  ],
];

function paintTuft(p, v) {
  const pl = new Plan(p.w, p.h);
  stamp(pl, TUFTS[v], 0, 0, M_FERN);
  pl.paint(p);
}

// --- the trees --------------------------------------------------------------------------
//
// Three trees that differ in shape, not just in height, after the board. A is a sapling:
// one round crown of four masses on a slim trunk that forks just under it, the mass to the
// right in its own shade. B forks low into two limbs that lean apart, each carrying a
// mass and a smaller one hanging off its outer side, with sky down the middle between
// them -- all the way up: the first B's two big masses met for four rows at their widest
// (a dark underside straight against a pale rim, no outline between), which closed the top
// of the V, so the left one is narrower and two pixels further left, the right one smaller.
// Sixty pixels hold two crowns side by side only if each is a main mass with its partner
// under it, not beside it as on the board's wider tree. C is the tall one: a straight trunk and four masses stacked alternately left and
// right up it, each lower one in front of the one above, so every mass's lit top shows
// against the dark underside of the next. All three stand in a low heap of moss with a
// clump of grass either side of the trunk, the board's grassy foot. (The old foot also had
// stones, from the first board; this board has none, and the grass alone reads as moss.)
//
// TOP: no tree draws above row 16 of its box, though the box is 136 tall. Ledges are 120
// art px apart, so row 16 is the ledge above's surface row: from there down a pixel is
// behind that ledge's 28 px of body, and above it a pixel would stand ON that ledge. The
// first tall tree reached row 4, and wherever a ledge was over it the top of its crown --
// pale rim and all, the brightest thing in the zone -- showed as a trunkless green bun
// sitting on the next floor's landing line. Kept below row 16 it rises behind the ledge
// above and vanishes there, as it should; with open air above, the whole tree shows.
//
// All in art px in the 60 x 136 box, y down, the bottom row (135) on the ledge:
//   trunk     { pts: [[y, cx, w], ...] top to bottom, flare, flareH } -- see trunk()
//   limbs     [x0, y0, x1, y1, w0, w1]: from the trunk out, w0 thick tapering to w1
//   masses    { cx, cy, rx, ry, lit }, drawn in list order, each later one in front; lit
//             moves a whole mass up or down the ramp, so one set back sits in shade
//   mound     [cx, rx, h]; grass [x, y, tuft variant, mirrored]
// Keep every mass's cx +- rx inside 4..55: its ragged edge reaches a pixel or two past
// that, and a leaf cut off at the box's edge loses its outline there.

const TREES = [
  { // A, the sapling
    trunk: { pts: [[74, 30, 5], [100, 28.5, 6], [135, 30, 7]], flare: 6, flareH: 9 },
    limbs: [[29, 100, 20, 78, 3, 2], [30, 98, 41, 76, 3, 2], [29, 88, 28, 60, 3, 2]],
    masses: [
      { cx: 31, cy: 76, rx: 13, ry: 8, lit: -0.4 },
      { cx: 42, cy: 60, rx: 13, ry: 14, lit: -0.35 },
      { cx: 27, cy: 49, rx: 18, ry: 16 },
      { cx: 16, cy: 71, rx: 12, ry: 11 },
    ],
    mound: [30, 11, 4],
    grass: [[18, 124, 1, false], [31, 124, 2, true]],
  },
  { // B, the low fork
    trunk: { pts: [[102, 29, 8], [118, 29, 9], [135, 29, 9]], flare: 8, flareH: 10 },
    limbs: [[27, 108, 22, 86, 6, 4], [22, 86, 18, 58, 4, 3], [31, 108, 37, 88, 6, 4], [37, 88, 43, 56, 4, 3],
      [21, 80, 13, 64, 2, 1], [39, 80, 47, 70, 2, 1]],
    masses: [
      { cx: 17, cy: 40, rx: 13, ry: 15 },
      { cx: 45, cy: 47, rx: 10, ry: 13 },
      { cx: 12, cy: 59, rx: 8, ry: 10, lit: -0.05 },
      { cx: 47, cy: 64, rx: 8, ry: 10, lit: -0.1 },
    ],
    mound: [29, 13, 4],
    grass: [[14, 124, 1, false], [34, 124, 0, true]],
  },
  { // C, the tall one -- nothing above row 16; see TOP above
    trunk: { pts: [[44, 29, 5], [76, 29, 7], [106, 29, 9], [135, 29, 10]], flare: 10, flareH: 12 },
    limbs: [[29, 58, 26, 34, 4, 2], [30, 66, 43, 48, 3, 2], [28, 84, 16, 64, 4, 2], [31, 96, 43, 76, 4, 2]],
    masses: [
      { cx: 26, cy: 32, rx: 15, ry: 13 },
      { cx: 43, cy: 46, rx: 12, ry: 11 },
      { cx: 17, cy: 62, rx: 13, ry: 12 },
      { cx: 42, cy: 76, rx: 13, ry: 11 },
    ],
    mound: [29, 16, 5],
    grass: [[9, 124, 1, false], [38, 124, 2, true]],
  },
];

function paintTree(p, v) {
  const T = TREES[v];
  const r = rng('FOREST TREE', v);
  const pl = new Plan(p.w, p.h);
  const spans = trunk(pl, T.trunk);
  for (const l of T.limbs) limb(pl, ...l);
  shadeBark(pl);
  barkTexture(pl, spans, r, T.trunk.pts[0][0], p.h - 8);
  const cells = leafCells(p.w, p.h, r, Math.min(...T.masses.map((c) => c.cy - c.ry)) - 4,
    Math.max(...T.masses.map((c) => c.cy + c.ry)) + 4);
  T.masses.forEach((c, i) => mass(pl, c, cells, r, i + 1));
  despeckle(pl, M_LEAF);
  despeckle(pl, M_LEAF);
  leafTexture(pl, cells);
  rim(pl);
  canopyShade(pl);
  mound(pl, ...T.mound, r);
  for (const [x, y, k, flip] of T.grass) stamp(pl, TUFTS[k].slice(0, 11), x, y, M_FERN, flip);
  contact(pl);
  pl.paint(p);
}

export const ELEMENTS = {
  TREE: {
    name: 'TREE', box: [60, 136], anchor: 'stand', frames: 1, variants: 3,
    // The last line is the TOP rule above: an artist's tall tree drawn to the top of the
    // box would put its crown back on the next floor's landing line.
    notes: ['DARK TRUNK, BIG LEAF MASSES, PALE RIM ON', 'TOP, TEAL SHADE BELOW, TO STAND OFF THE',
      'BACKDROP. SAPLING, LOW FORK, TALL. GRASS', 'AT THE FOOT. KEEP THE TOP 16 ROWS EMPTY.'],
    paint(p, v) { paintTree(p, v); },
  },
  UNDERGROWTH_TUFT: {
    name: 'UNDERGROWTH TUFT', box: [12, 12], anchor: 'stand', frames: 1, variants: 3,
    notes: ['FERN AND GRASS CLUMPS ALONG THE LIP.', '3 SHAPES. SITS ON THE PLATFORM GRASS.'],
    paint(p, v) { paintTuft(p, v); },
  },
};

/** Trunks at least this far apart, art px: two crowns 60 wide overlap by 16 at most. */
const TREE_GAP = 44;

/**
 * The part of each tree's box its foot -- mound and grass -- covers, art px, measured from
 * the drawn pixels. The feet used to carry stones out to the box's edges; the board's foot
 * is grass alone and narrower, and a tuft may now stand just beside it.
 */
const FOOT = [[18, 43], [14, 46], [9, 50]];

/**
 * DECOR.trees, placed on the art pixel: the same random draws in the same order as the old
 * painter, so a ledge still carries as many trees and tufts as it did and roughly where.
 *
 * What changed is spacing. The old trees were three units wide and could stand anywhere,
 * two in the same spot included; a tree is 60 art px across now, and two drawn where the
 * dice put them came out as one tree with two trunks. So after the draws, left to right,
 * a tree too close to the one before it steps right to TREE_GAP; a row that runs off the
 * end is packed back from it; and a tree with no room left even then (a narrow ledge,
 * three trees) is not planted. Two trees side by side are never the same drawing: with
 * three variants a third of neighbours were, and two identical silhouettes 44 px apart read
 * as one tree stamped twice. The second takes one of the other two, chosen by the rest of
 * the same draw, so nothing else about the ledge moves. They are drawn tallest first, so a
 * sapling stands in front of the big tree beside it rather than being swallowed by its
 * crown. A tuft whose box would land on a tree's foot is left out: the foot carries its own
 * ferns, and a tuft on top of them is clutter. Trees first, tufts after, on top.
 */
export function scene(r, wArt) {
  const trees = [];
  const n = wArt > 336 ? 3 : wArt > 192 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const cx = Math.round(16 + r() * Math.max(4, wArt - 40));
    const u = r() * 3;                     // was the height
    r();                                   // was the canopy's width; the variant sets it now
    trees.push({ key: 'TREE', variant: Math.floor(u), x: fit(cx - 29, 60, wArt), alt: u % 1 < 0.5 ? 1 : 2 });
  }
  trees.sort((a, b) => a.x - b.x);
  for (let i = 1; i < trees.length; i++) trees[i].x = Math.max(trees[i].x, trees[i - 1].x + TREE_GAP);
  // ...and back from the right end, so a row pushed off it slides left instead of losing
  // its last tree; only a tree that still does not fit is left out.
  const last = Math.floor(wArt) - 60;
  for (let i = trees.length - 1; i >= 0; i--) {
    trees[i].x = Math.min(trees[i].x, i === trees.length - 1 ? last : trees[i + 1].x - TREE_GAP);
  }
  const planted = trees.filter((t) => t.x >= 0);
  for (let i = 1; i < planted.length; i++) {
    const prev = planted[i - 1].variant;
    if (planted[i].variant === prev) planted[i].variant = (prev + planted[i].alt) % 3;
  }
  const out = planted.map(({ key, variant, x }) => ({ key, variant, x }))
    .sort((a, b) => b.variant - a.variant || a.x - b.x);
  // Undergrowth along the lip: a tuft every five units, half of them.
  for (let i = 8; i < wArt - 8; i += 20) {
    const p = r();
    if (p > 0.5) continue;
    const x = fit(i, 12, wArt);
    if (planted.some((t) => x + 12 > t.x + FOOT[t.variant][0] && x < t.x + FOOT[t.variant][1])) continue;
    out.push({ key: 'UNDERGROWTH_TUFT', variant: Math.min(2, Math.floor(p * 6)), x });
  }
  return out;
}
