// BASEMENT: a cellar, seen from inside the shaft.
//
// Cobwebs hang from the UNDERSIDE of the ledge rather than sitting on top of it, which is
// both what actually happens in a cellar and visually distinct from every other band,
// where things grow upward. And now and then water beads under a ledge and drips.
//
// Replaces the stack of little boxes that used to be here. Crates on a ledge in a
// vertical shaft never made sense -- nobody stacked them there.
//
// Redrawn at one art pixel per screen pixel from the artist's sheet. Both are 'hang': the
// box's top row laps one row over the underside the cellar's tile draws (decor.js
// undersideFor -- the full 28 px here, the tile being solid all the way down), so nothing
// here comes near the landing line on the ledge's top; the ledge's body is between them. Under a ledge they
// hang first through its cast shadow (#120c1f, 12 px deep) and then against the purple
// brick (luma 23 to 60, median 42); both are dark, so the pale web and the lit water
// separate from them by value alone, at ratios the dark brick cannot come near.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { Pix, fit, rng } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.28;

// --- the cobweb ---------------------------------------------------------------------
//
// Pale lilac-grey threads, one pixel wide, and TRANSLUCENT: each thread pixel is the thread
// colour at partial alpha, so the brick shows through it and the web reads as gossamer
// rather than as string. Crisp all the same: every thread is a whole-pixel line, no
// soft edges, and the alpha is a few fixed steps, not a blur.
//
//   - main strands, the ones the web hangs by: 0.72 -- over the median brick (#30244c)
//     that comes out luma 159, 5.3:1 against the brick; 6.5:1 in the ledge's shadow;
//   - the fine cross threads that sag between them: 0.46 -- luma 118, 3.0:1, and still
//     2.7:1 over the lightest brick face;
//   - a knot where two threads cross, and the odd bead of dust: 0.92, nearly white, 10.9:1.
//
// No dark outline round a thread: a one-pixel web with a one-pixel black rim either side
// is a black net, heavier than the brick. What it has instead is a shadow, one pixel down
// and right of every thread at low alpha -- the web standing a little off the wall, and
// the dark edge that keeps a thread crossing a lit brick face from melting into it.
const WEB = '#cdc8e0';
const KNOT = '#f2f0fa';
const WEB_SHADOW = '#0b0716';
const A_MAIN = 0.72, A_FINE = 0.46, A_KNOT = 0.92, A_SHADOW = 0.38;

/**
 * A web under construction: which pixels carry thread and how heavy (0 none, 1 fine, 2
 * main), and how many threads pass through each, so a crossing becomes a knot.
 */
class Web {
  constructor(w, h) { this.w = w; this.h = h; this.k = new Uint8Array(w * h); this.n = new Uint8Array(w * h); }

  dot(x, y, k) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.k[i] = Math.max(this.k[i], k);
    this.n[i]++;
  }

  /** A taut strand: Bresenham, both ends. */
  line(x0, y0, x1, y1, k = 2) {
    const pts = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      pts.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    // Each pixel once, so a strand never counts as crossing itself.
    for (const [px, py] of pts) this.dot(px, py, k);
  }

  /**
   * A slack thread from (x0, y0) to (x1, y1), sagging `s` px at its middle: a parabola,
   * walked column by column and joined where it steps more than a pixel, so it stays one
   * pixel thick and unbroken.
   */
  sag(x0, y0, x1, y1, s, k = 1) {
    const seen = new Set();
    const put = (x, y) => { const key = x * 1000 + y; if (!seen.has(key)) { seen.add(key); this.dot(x, y, k); } };
    const n = Math.abs(x1 - x0);
    let py = null;
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      const x = x0 + Math.sign(x1 - x0) * i;
      const y = Math.round(y0 + (y1 - y0) * t + s * 4 * t * (1 - t));
      if (py !== null) {
        const step = Math.sign(y - py);
        for (let yy = py + step; yy !== y && step; yy += step) put(x - Math.sign(x1 - x0), yy);
      }
      put(x, y);
      py = y;
    }
  }

  /**
   * A bead of dust caught on a strand's end: two pixels, one under the other, as bright as
   * a knot. (Two by two, three of them on the long web hung like the bulbs of a lamp.)
   */
  clump(x, y) {
    for (const dy of [0, 1]) { this.dot(x, y + dy, 2); this.dot(x, y + dy, 2); }
  }

  /** Onto a Pix: the shadow first, then the threads over it, knots where they cross. */
  paint(p) {
    const { w, h, k, n } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!k[y * w + x]) continue;
        const sx = x + 1, sy = y + 1;
        if (sx < w && sy < h && !k[sy * w + sx]) p.set(sx, sy, WEB_SHADOW, A_SHADOW);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!k[i]) continue;
        if (n[i] > 1) p.set(x, y, KNOT, A_KNOT);
        else p.set(x, y, WEB, k[i] === 2 ? A_MAIN : A_FINE);
      }
    }
  }
}

// The three webs. Short, medium and long, as the sheet asks -- and each its own drawing,
// not one web cut to three lengths. Strands are laid on clean pixel slopes (1:1, 1:2, 1:3,
// 1:6) wherever they can be, because a line at an arbitrary slope steps unevenly and reads
// as a crack rather than a thread.
const WEBS = [
  // SHORT: the board's web, at the board's proportions -- a sheet as wide as the box and
  // three quarters as deep, hung from both corners and two points between: two long strands
  // crossing in the big X, shorter ones splaying to the sides, the outer edges falling
  // straight to the bottom corners, and slack threads hanging in scallops across all of it.
  (web) => {
    const strands = [[1, 0, 21, 20], [26, 0, 6, 20], [1, 0, 3, 20], [26, 0, 24, 20], [9, 0, 3, 12], [18, 0, 24, 12]];
    for (const s of strands) web.line(...s);
    scallops(web, [1, 9, 18, 26], strands, [6, 12, 17], 'SHORT');
    // The bottom corners trail a little past the last thread.
    web.line(3, 20, 3, 22, 1);
    web.line(24, 20, 25, 22, 1);
  },
  // MEDIUM: an orb web in the corner under the ledge, sagging -- a hub, spokes out to the
  // underside and down, two rings of thread round it, torn at the bottom with two spokes
  // hanging loose. The shape every player knows as "cobweb" before anything else.
  (web) => {
    const hx = 13, hy = 11;
    const spokes = [[1, 0], [7, 0], [14, 0], [21, 0], [26, 0], [26, 12], [23, 24], [14, 31], [5, 26], [1, 13]];
    for (const [x, y] of spokes) web.line(hx, hy, x, y, 2);
    // Rings: between each pair of neighbouring spokes, a thread nearly half and most of the
    // way out, sagging a little -- a web's spiral, seen as it hangs. (Three rings crowded
    // the hub into one bright knot.)
    for (const f of [0.48, 0.84]) {
      for (let i = 0; i < spokes.length - 1; i++) {
        const [ax, ay] = spokes[i], [bx, by] = spokes[i + 1];
        if (ay === 0 && by === 0) continue;       // along the underside: nothing to span
        const x0 = Math.round(hx + (ax - hx) * f), y0 = Math.round(hy + (ay - hy) * f);
        const x1 = Math.round(hx + (bx - hx) * f), y1 = Math.round(hy + (by - hy) * f);
        if (x0 === x1) web.line(x0, y0, x1, y1, 1);
        else web.sag(x0, y0, x1, y1, f > 0.5 ? 2 : 1, 1);
      }
    }
    web.line(14, 31, 15, 37, 1);
    web.line(5, 26, 4, 32, 1);
  },
  // LONG: an old web, half gone -- a sheet still spanning the underside and narrowing to a
  // point, and out of it strands hanging long and slack, beaded with dust at their ends.
  (web) => {
    const strands = [[2, 0, 14, 24], [25, 0, 13, 24], [9, 0, 5, 24], [18, 0, 23, 15]];
    for (const s of strands) web.line(...s);
    scallops(web, [2, 9, 18, 25], strands, [7, 14, 20], 'LONG');
    web.line(13, 24, 12, 34);
    web.line(12, 34, 12, 44);
    web.clump(12, 44);
    web.line(5, 24, 4, 34, 1);
    web.clump(4, 34);
    web.line(23, 15, 24, 31, 1);
    web.clump(23, 31);
  },
];

/**
 * The slack threads of a sheet web: under the underside, a U hanging between each pair of
 * neighbouring anchors; and at each of `levels`, a U between each pair of neighbouring main
 * strands, where they cross that row. Their ends wander a row up or down (seeded by `key`,
 * so the web is the same every build) and they sag by a third of their span, up to 4 px --
 * enough to hang as scallops. Drawn level and shallow, the same threads made rungs, and a
 * web of rungs between straight strands reads as a ladder.
 */
function scallops(web, anchors, strands, levels, key) {
  const r = rng('COBWEB', key);
  for (let i = 0; i < anchors.length - 1; i++) web.sag(anchors[i], 0, anchors[i + 1], 0, 3, 1);
  for (const y of levels) {
    const xs = [];
    for (const [x0, y0, x1, y1] of strands) {
      if (y < Math.min(y0, y1) || y > Math.max(y0, y1)) continue;
      xs.push(Math.round(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const d = xs[i + 1] - xs[i];
      if (d < 4) continue;
      web.sag(xs[i], y + r.int(-1, 1), xs[i + 1], y + r.int(-1, 1), Math.min(4, Math.round(d / 3)), 1);
    }
  }
}

// --- the drip -------------------------------------------------------------------------
//
// A bead of water forming under a nub of wet mortar on the underside, swelling into a
// hanging drop, and letting go: the three frames the sheet asks for, one every half second.
// The water is the board's: pale, nearly white, shaded grey with only a breath of cool in
// it, a white glint on its upper left (the light is from there, as on everything else),
// and a dark rim where it meets the brick. (The first cut was a saturated sky blue: the one
// cool, bright-coloured thing in a brown-and-purple cellar, and not the board's drop.) The
// nub is the ledge's own brown, darkest at the underside so it grows out of the ledge's
// bottom row rather than sitting on it.
const DRIP = {
  o: '#190500',   // the underside's own darkest brown
  n: '#3d251b',   // the nub
  N: '#6a4a34',   // the nub, lit
  D: '#6a6c84',   // water in shadow
  M: '#aeb2c2',   // water
  L: '#dfe1e8',   // water, lit
  W: '#ffffff',   // the glint
  R: '#c9ccda',   // light come through the water, caught on its far side
  r: '#150f24',   // the dark rim round the water
};
// The drops are as fat as the box allows -- the board's is a full pear, and the first cut
// here, four pixels across, was a speck under the ledge at zoom 1.
//
// A drop is a PEAR: it tapers into its neck from above and is widest low down, with a round
// bottom. Drawn first as a ball on a two-pixel neck (widths 2 4 6 6 6 4 2, widest in the
// middle and pointed below), the swollen frame was a pale globe hanging from a brown nub --
// a light bulb in its socket -- and the bead a tiny diamond; with three rows at full width
// it was a flat-bottomed flask. Widths 2 2 4 4 6 6 4 are the pear. What says water rather than
// glass is the shape and one more light: besides the glint on the upper left, a paler
// pixel low on the far side, the light that comes through a drop and gathers there.
const DRIP_FRAMES = [
  [ // a bead forming: a dome of water under the nub
    '.onnNno.',
    '..onNo..',
    '..LLMD..',
    '..LWRD..',
    '...MD...',
  ],
  [ // swollen, about to go: neck, taper, round bottom
    '.onnNno.',
    '..onNo..',
    '...LM...',
    '...LM...',
    '..LLMD..',
    '..LWMD..',
    '.LWMMMD.',
    '.LMMMRD.',
    '..MMDD..',
  ],
  [ // gone: a drop falling, point up, and the bead it left behind
    '.onnNno.',
    '..onNo..',
    '...MD...',
    '........',
    '........',
    '....L...',
    '...LM...',
    '..LWMD..',
    '..LMMD..',
    '..MMRD..',
    '...DD...',
  ],
];

export const ELEMENTS = {
  COBWEB: {
    name: 'COBWEB', box: [28, 48], anchor: 'hang', frames: 1, variants: 3,
    notes: ['TORN FAN OF 1-PX STRANDS, PALE LILAC-GREY,', 'HALF-TRANSPARENT SO THE LEDGE SHOWS THROUGH.',
      'HANGS FROM THE UNDERSIDE, NEVER OVER THE FACE.', 'SHORT, MEDIUM AND LONG VARIANTS.'],
    paint(p, v) {
      const web = new Web(p.w, p.h);
      WEBS[v](web);
      web.paint(p);
    },
  },
  DRIP: {
    name: 'DRIP', box: [8, 12], anchor: 'hang', frames: 3, variants: 1, fps: 2,
    notes: ['A BEAD OF WATER FORMING UNDER THE LEDGE', 'AND FALLING: 3 FRAMES. CELLAR DAMP.'],
    paint(p, v, f) {
      // The water, rimmed; then the nub over the top of it, so the rim never runs across
      // the underside where the nub meets the ledge.
      const w = new Pix(p.w, p.h);
      w.ascii(DRIP_FRAMES[f].map((row, y) => (y < 2 ? '........' : row)), DRIP);
      w.outline(DRIP.r);
      p.stamp(w);
      p.ascii(DRIP_FRAMES[f].slice(0, 2), DRIP);
    },
  },
};

/** The clear space kept between two webs, and between a web and a drip. [art px] */
const WEB_GAP = 8;

/**
 * One or two webs on a ledge (two on one over 240 art px), and on three ledges in ten a
 * drip. The same draws in the same order as before the redraw, placed on the art pixel.
 *
 * Two things keep apart that did not have to before. A second web lands at least WEB_GAP
 * clear of the first, moved along to the nearest place that is if it has to be (and left
 * out if there is none): two webs touching read as one wide, lumpy one. And the drip keeps
 * as far out from under a web: a drop falling through the middle of one, or just beside
 * it, read as part of it.
 */
export function scene(r, wArt) {
  const out = [];
  const n = wArt > 240 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const cx = Math.round(16 + r() * Math.max(4, wArt - 32));
    const variant = Math.floor(r() * 3);
    let x = fit(cx - 14, 28, wArt);
    const first = out[0];
    if (first && Math.abs(x - first.x) < 28 + WEB_GAP) {
      const clear = [first.x - 28 - WEB_GAP, first.x + 28 + WEB_GAP].filter((a) => a >= 0 && a + 28 <= wArt);
      if (!clear.length) continue;
      x = clear.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
    }
    out.push({ key: 'COBWEB', variant, x });
  }
  if (r() < 0.3) {
    let x = fit(Math.round(12 + r() * (wArt - 24)) - 4, 8, wArt);
    for (const web of out) {
      if (x + 8 + WEB_GAP <= web.x || x >= web.x + 28 + WEB_GAP) continue;
      // Out to whichever side of the web has room, nearest first.
      const left = web.x - 8 - WEB_GAP, right = web.x + 28 + WEB_GAP;
      const fits = (a) => a >= 0 && a + 8 <= wArt && out.every((o) => a + 8 + WEB_GAP <= o.x || a >= o.x + 28 + WEB_GAP);
      const pick = [left, right].sort((a, b) => Math.abs(a - x) - Math.abs(b - x)).find(fits);
      x = pick === undefined ? null : pick;
      break;
    }
    if (x !== null) out.push({ key: 'DRIP', variant: 0, x });
  }
  return out;
}
