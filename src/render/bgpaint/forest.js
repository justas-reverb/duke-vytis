// FOREST: a deep wood seen from inside it, after the board's "vertical green trunks,
// canopy silhouette".
//
//   FAR   a green haze over the sky, paler stands of trees in it, thin bare trunks and
//         spruces in silhouette -- stacked tiers of drooping branches up a thin trunk
//   MID   three trunks of middle thickness with leaf clumps hanging off short branches
//   NEAR  two big dark trunks, ivy on one, and a few large, darker clumps
//
// The board draws each tree whole: canopy at the top, trunk, undergrowth at the foot. A
// tile repeats up the tower forever, so a tree with a top would be a column of trees
// standing on each other's crowns every 128 units. Here the trunks run the full height
// and the leaves come in clumps along them, so the tile is a slice out of the middle of a
// forest too tall to see the top of -- which is what climbing through one looks like.
//
// FAR is translucent: the zone's sky shows through it, dimmed, so the sky's gradient
// still lights the top of the screen and the crossfade into the next zone's sky still
// shows. Everything is darker than the old green-on-green stripes, so the platforms'
// own little pines and the Duke read in front, and there is not a horizontal line in it
// -- the old painter's bright cross-bars were the most ledge-like thing in the zone.

import { shade, mix, wrapNoise } from './util.js';

// --- shared with swamp.js and downtown.js --------------------------------------------
//
// These three are here rather than in util.js only because this change was limited to
// the three zone modules; they are general and belong there.

/**
 * A tile painted as palette indices first and put on the canvas last. Every write goes
 * through modulo T, so a shape that runs off one edge carries on from the opposite one:
 * the layer wraps by construction, whatever is drawn into it. Index 0 is transparent.
 * flush() emits each row as runs of one colour, so a whole tile is a few thousand
 * fillRect calls rather than 65,536 -- that is what keeps three layers inside the budget.
 */
export function pixTile(T) {
  const buf = new Uint8Array(T * T);
  const w = (v) => ((Math.floor(v) % T) + T) % T;
  return {
    buf,
    T,
    set(x, y, c) { buf[w(y) * T + w(x)] = c; },
    rect(x, y, rw, rh, c) {
      for (let j = 0; j < rh; j++) {
        const row = w(y + j) * T;
        for (let i = 0; i < rw; i++) buf[row + w(x + i)] = c;
      }
    },
    flush(g, pal) {
      for (let y = 0; y < T; y++) {
        const row = y * T;
        let x = 0;
        while (x < T) {
          const c = buf[row + x];
          let e = x + 1;
          while (e < T && buf[row + e] === c) e++;
          if (c) { g.fillStyle = pal[c]; g.fillRect(x, y, e - x, 1); }
          x = e;
        }
      }
    },
  };
}

// A 4 x 4 ordered dither. Its period divides T, so a dithered edge wraps like everything
// else. `dither(x, y) < f` is true on a fraction f of pixels, evenly spread.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** A #rrggbb colour at alpha a, for a layer that lets the one behind show through. */
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// --- the forest ---------------------------------------------------------------------

/** Evenly spread positions across the tile, with some jitter. */
function spread(r, n, T, jitter) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round(((i + 0.5 + (r() - 0.5) * jitter) / n) * T));
  return out;
}

/**
 * A clump of leaves: overlapping discs, the lower ones drawn first so the upper ones sit
 * on them, each lit from the upper left in the palette's tones -- dark to light in
 * `tones` -- with a dithered step between tones. The darkest tone is kept for the clump's
 * underside and the odd gap between leaves. The first version outlined every disc and
 * sprinkled gaps at 7%; in play that was a field of scalloped broccoli, busier than the
 * platforms in front of it.
 */
function clump(P, r, cx, cy, spanX, spanY, rMin, rMax, n, tones) {
  const T = P.T;
  const discs = [];
  for (let k = 0; k < n; k++) {
    discs.push([cx + (r() - 0.5) * 2 * spanX, cy + (r() - 0.5) * 2 * spanY, rMin + r() * (rMax - rMin)]);
  }
  discs.sort((a, b) => b[1] - a[1]);
  const last = tones.length - 1;
  const m = new Map();
  for (const [dx0, dy0, rad] of discs) {
    const R = Math.ceil(rad);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        if (x * x + y * y > rad * rad) continue;
        const px = (((Math.round(dx0) + x) % T) + T) % T, py = (((Math.round(dy0) + y) % T) + T) % T;
        // Light falls from the upper left: -1 lit, +1 in shadow.
        const lit = (x * 0.55 + y * 0.85) / rad + (dither(px, py) - 0.5) * 0.45;
        let t = Math.round(0.8 + ((1 - lit) / 2) * (last - 0.8));
        if (r() < 0.03) t -= 1;
        m.set(py * T + px, Math.max(1, Math.min(last, t)));
      }
    }
  }
  for (const [k, t] of m) {
    const x = k % T, y = (k - x) / T;
    const below = ((y + 1) % T) * T + x;
    P.buf[k] = tones[m.has(below) ? t : 0];
  }
}

/** A straight trunk, lit from the left, with bark grooves and the odd knot. */
function trunk(P, r, x0, w, T, c) {
  for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w;
    for (let y = 0; y < T; y++) {
      const e = u + (dither(x0 + x, y) - 0.5) * 0.12;
      P.set(x0 + x, y, e < 0.2 ? c.light : e > 0.72 ? c.dark : c.mid);
    }
  }
  // Grooves: dashed dark lines down the bark. Their lengths are drawn from r, so a dash
  // can end at the bottom of the tile and a different one start at the top -- a single
  // pixel's difference, which the eye does not see and the seam test does not count.
  const grooves = Math.max(1, Math.round(w / 5));
  for (let k = 0; k < grooves; k++) {
    const gx = x0 + 1 + Math.floor(r() * (w - 2));
    let y = Math.floor(r() * 8);
    while (y < T) {
      const len = 4 + Math.floor(r() * 14);
      for (let j = 0; j < len && y + j < T; j++) P.set(gx, y + j, c.groove);
      y += len + 2 + Math.floor(r() * 10);
    }
  }
  const knots = Math.floor(r() * 3);
  for (let k = 0; k < knots; k++) {
    const kx = x0 + 2 + Math.floor(r() * Math.max(1, w - 5)), ky = Math.floor(r() * T);
    P.rect(kx, ky, 2, 3, c.groove);
    P.set(kx, ky - 1, c.light);
  }
}

/** A short branch from a trunk's edge up and out to a clump, two pixels thick. */
function branch(P, x0, y0, x1, y1, col) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= n; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / n), y = Math.round(y0 + ((y1 - y0) * s) / n);
    P.set(x, y, col);
    P.set(x, y + 1, col);
  }
}

function barkColours(th, k) {
  // The board's trunks are near-black grey-brown; tinted a little toward the zone's
  // deep green so they sit in the haze rather than on it.
  const base = mix('#2a251d', th.bgNear, 0.2);
  return {
    light: shade(base, 1.3 * k), mid: shade(base, k), dark: shade(base, 0.7 * k), groove: shade(base, 0.52 * k),
  };
}

/** Heights between lo and hi that add up to exactly T, so a stack of them wraps. */
function stack(r, T, lo, hi) {
  const out = [];
  let left = T;
  while (left > hi + lo) { const h = lo + Math.floor(r() * (hi - lo + 1)); out.push(h); left -= h; }
  if (left > hi) { out.push(left >> 1); left -= left >> 1; }
  out.push(left);
  return out;
}

/**
 * Leaves hung from a trunk: a big clump reached by a branch, off to one side. The clumps
 * are spaced down the tile with room between, so each layer's canopy comes in masses
 * with trunk showing between them rather than as a band -- a band of leaves right
 * across the screen is exactly the shape of a ledge.
 */
function foliage(P, r, t, T, n, size, tones, branchCol) {
  const y0 = Math.floor(r() * T);
  for (let k = 0; k < n; k++) {
    let side = r() < 0.5 ? -1 : 1;
    const cy = y0 + Math.round((k / n) * T + (r() - 0.5) * T * 0.12);
    const off = t.w / 2 + size.reach * (0.4 + r() * 0.6);
    // Hung off whichever side keeps the clump inside the tile. One across the side edge
    // still wraps, but its dithered leaves change every pixel, and the seam test --
    // which compares the two edge columns -- cannot tell that from a seam.
    const out = (x) => x - size.spanX - size.rMax < 1 || x + size.spanX + size.rMax > T - 2;
    if (out(t.cx + side * off) && !out(t.cx - side * off)) side = -side;
    const cx = t.cx + side * off;
    branch(P, t.cx + side * (t.w >> 1), cy + size.spanY + 8, Math.round(cx), cy, branchCol);
    clump(P, r, cx, cy, size.spanX, size.spanY, size.rMin, size.rMax, size.n + Math.floor(r() * 4), tones);
  }
}

// Where the trunks stand, as fractions of the tile's width: MID's three between NEAR's
// two, and all of them clear of the tile's side edge.
const TRUNKS_MID = [0.07, 0.49, 0.9];
const TRUNKS_NEAR = [0.27, 0.72];

export default {
  far(g, T, th, r) {
    const P = pixTile(T);
    const haze = shade(th.bgNear, 0.5);
    const pal = [null,
      rgba(haze, 0.76),                             // 1 haze: the sky through it, dimmed
      rgba(mix(haze, th.bgFar, 0.4), 0.66),        // 2 paler stands of trees, far off
      rgba(shade(haze, 0.75), 0.78),                // 3 trunks and spruces in silhouette
    ];
    // Far stands of trees: noise sampled at twice the rate across as down, so its
    // light patches are tall and narrow -- tree-shaped, not cloud-shaped.
    const n1 = wrapNoise(r, 6, T), n2 = wrapNoise(r, 16, T);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const v = n1((x * 2) % T, y) * 0.7 + n2((x * 2) % T, y) * 0.3;
        P.buf[y * T + x] = v - 0.55 > (dither(x, y) - 0.5) * 0.1 ? 2 : 1;
      }
    }
    // Distant bare trunks, thin and straight.
    for (const cx of spread(r, 9, T, 0.8)) P.rect(cx, 0, 2 + Math.floor(r() * 3), T, 3);
    // Spruces: a trunk and tiers of drooping branches all the way up. The tiers are of
    // uneven height but add up to the tile, so a tree carries on across the top edge.
    for (const cx of spread(r, 4, T, 0.5)) {
      const maxHw = 10 + Math.floor(r() * 5);
      P.rect(cx - 1, 0, 3, T, 3);
      let t0 = Math.floor(r() * 32);
      for (const h of stack(r, T, 24, 38)) {
        for (let k = 0; k < h - 4; k++) {
          const hw = Math.min(maxHw, 1 + Math.floor((k * maxHw) / (h - 7)));
          const jag = Math.floor(r() * 3) - 1;
          P.rect(cx - hw + jag, t0 + k, 2 * hw + 1 - jag, 1, 3);
        }
        t0 += h;
      }
    }
    P.flush(g, pal);
  },

  mid(g, T, th, r) {
    const P = pixTile(T);
    const c = barkColours(th, 1.1);
    const green = mix(th.bgFar, '#556655', 0.25);
    const leaf = [shade(th.bgNear, 0.7), shade(th.bgNear, 1.0), shade(green, 0.8), shade(mix(green, '#a8c888', 0.2), 0.86)];
    const pal = [null, c.light, c.mid, c.dark, c.groove, ...leaf];
    const C = { light: 1, mid: 2, dark: 3, groove: 4 };
    // Trunks at set places across the tile, in the gaps between NEAR's two. The layers
    // scroll up and down but never sideways, so a trunk placed at random can stand
    // exactly behind a NEAR trunk for good -- the first version lost one that way.
    const trunks = TRUNKS_MID.map((f) => ({ cx: Math.round(T * (f + (r() - 0.5) * 0.04)), w: 13 + Math.floor(r() * 7) }));
    for (const t of trunks) trunk(P, r, t.cx - (t.w >> 1), t.w, T, C);
    const size = { reach: 20, spanX: 20, spanY: 11, rMin: 6, rMax: 11, n: 13 };
    trunks.forEach((t, k) => foliage(P, r, t, T, k === 2 ? 1 : 2, size, [5, 6, 7, 8], C.dark));
    P.flush(g, pal);
  },

  near(g, T, th, r) {
    const P = pixTile(T);
    const c = barkColours(th, 0.8);
    const green = mix(th.bgNear, '#445544', 0.2);
    const leaf = [shade(green, 0.45), shade(green, 0.66), shade(green, 0.86), shade(green, 1.08)];
    const ivy = [shade(th.bgNear, 0.62), shade(th.bgNear, 0.95)];
    const pal = [null, c.light, c.mid, c.dark, c.groove, ...leaf, ...ivy];
    const C = { light: 1, mid: 2, dark: 3, groove: 4 };
    const x1 = Math.round(T * (TRUNKS_NEAR[0] + (r() - 0.5) * 0.04));
    const x2 = Math.round(T * (TRUNKS_NEAR[1] + (r() - 0.5) * 0.04));
    const trunks = [{ cx: x1, w: 30 + Math.floor(r() * 7) }, { cx: x2, w: 20 + Math.floor(r() * 5) }];
    for (const t of trunks) trunk(P, r, t.cx - (t.w >> 1), t.w, T, C);
    // Ivy up the big trunk: small leaves along a wandering stem.
    const big = trunks[0];
    const lo = big.cx - (big.w >> 1) + 2, hi = big.cx + (big.w >> 1) - 4;
    let ix = lo + 4;
    for (let y = 0; y < T; y += 3) {
      ix = Math.max(lo, Math.min(hi, ix + Math.round((r() - 0.5) * 3)));
      if (r() < 0.8) { P.set(ix, y, 9); P.set(ix + 1, y + 1, 9); P.set(ix, y + 2, 9); }
      if (r() < 0.5) P.rect(ix + (r() < 0.5 ? -2 : 1), y + 1, 2, 2, 10);
    }
    const size = { reach: 26, spanX: 26, spanY: 14, rMin: 8, rMax: 15, n: 13 };
    foliage(P, r, trunks[0], T, 2, size, [5, 6, 7, 8], C.dark);
    foliage(P, r, trunks[1], T, 1, size, [5, 6, 7, 8], C.dark);
    P.flush(g, pal);
  },
};
