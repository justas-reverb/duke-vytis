// STORM: banked storm clouds -- soft-edged purple-grey cumulus at three depths.
//
// The board (assets/backgrounds-reference.webp, zone 7) asks for scattered cloud puffs lit
// from above, no hard outlines, banked so the clouds behind show between the ones in
// front. The old painter drew each cloud as three flat bars of one colour, which read as
// stacked slabs -- and flat pale slabs are the one shape a background must never have,
// because they look like somewhere to stand.
//
// Each cloud here is a heap of round puffs in three tiers -- a big crown, a middle row, a
// base row of small ones on a flat bottom -- with little bumps along the top of every big
// puff, which is the cauliflower edge the board's clouds have. Tiers are drawn crown
// first, so each lower, nearer puff's lit top shows against the shaded underside of the
// one behind it; a one-tone crease where a puff meets the one behind is what makes a
// clump read as puffs rather than a blob. Shading is per puff (light from the upper left)
// plus darkening toward the base, in five flat tones with a checker only where two meet.
// The outside edge is a one-pixel stipple, not a line: the board's "no hard outlines".
//
// What went wrong on the way, so it is not tried again:
//   - A 4 x 4 ordered dither across every tone turned each puff into a shaded ball.
//   - Many small puffs with a wobbled outline read as a pile of stones, not vapour.
//     Few big puffs and small bumps on top is what reads as cloud.
//   - Two clouds in one grid row put their flat bases on one line across the tile: a
//     long straight horizontal edge, the ledge look again. There is now ONE cloud per
//     row, so no two bases can line up.
//
// Every puff is drawn at its position modulo the tile, so a cloud across an edge
// continues from the opposite one: the tile wraps by construction. It is painted into an
// index buffer first and emitted as one fillRect per horizontal run, grouped by colour,
// which keeps a layer to a few thousand calls.
//
// Brightness is held to the old one: the NEAR body is the theme's bgNear, as the old near
// clouds were, and only the puff tops reach past it, toward the board's lavender. On a
// tools/shot.mjs frame at floor 1200 the play area's mean luma is 74 against the old 75,
// and its 95th percentile the same 126. The board's clouds are brighter than that; here
// the ledges are cream cloud-tops themselves, and must stay the palest thing.

import { mix } from './util.js';

// The board's cloud-top lavender, bluer than the theme's purple-greys.
const LAVENDER = '#8c86b4';

// Tone thresholds, darkest first: index 1 deep shadow .. 5 highlight. 6 is the rim stipple.
const CUTS = [-0.3, -0.02, 0.26, 0.52];
const RIM = 6;
// How far either side of a threshold the checker dither reaches.
const DITHER = 0.05;

/**
 * Stamp one puff into the layer: a disc at (bx, by), radius R, nothing below the cloud's
 * flat base `cut`. Unwrapped coordinates; wrapped on write. Shaded as part of the sphere
 * `lit` ({ x, y, R }) -- itself, or the big puff a bump sits on, so a bump changes the
 * outline without drawing a contour of its own inside the cloud.
 */
function puff(L, bx, by, R, cut, h, lit = { x: bx, y: by, R }) {
  const { buf, solid, T } = L;
  const x0 = Math.floor(bx - R - 2), x1 = Math.ceil(bx + R + 2);
  const y0 = Math.floor(by - R - 2), y1 = Math.ceil(Math.min(by + R + 2, cut + 2));
  const crease = [];
  for (let py = y0; py <= y1; py++) {
    const wy = ((py % T) + T) % T;
    const dy = py + 0.5 - by;
    // Height in the whole cloud, 0 at its base, 1 at its crown.
    const up = (cut - py) / h;
    for (let px = x0; px <= x1; px++) {
      const wx = ((px % T) + T) % T;
      const k = wy * T + wx;
      const dx = px + 0.5 - bx;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R + 1.5) continue;
      if (d > R || py + 0.5 > cut) {
        if (solid[k]) {
          // Just outside this puff's upper half, on a puff behind it: the crease.
          if (lit.R === R && d <= R + 1.2 && dy < R * 0.2) crease.push(k);
        } else if (((px + py) & 1) === 0 && py + 0.5 <= cut + 1.5) {
          buf[k] = RIM;   // the soft edge: a checker, only over nothing solid yet
        }
        continue;
      }
      const l = -((px + 0.5 - lit.x) * 0.5 + (py + 0.5 - lit.y) * 0.86) / lit.R;
      const v = 0.55 * l + 0.9 * (up - 0.45) + (((px + py) & 1) ? DITHER : -DITHER);
      let c = 1;
      while (c <= CUTS.length && v > CUTS[c - 1]) c++;
      buf[k] = c;
      solid[k] = 1;
    }
  }
  for (const k of crease) if (buf[k] > 1 && buf[k] !== RIM) buf[k]--;
}

/**
 * A big puff with small bumps along the top of its rim: the cauliflower edge. The bumps
 * are lit as part of the big puff, so they change its outline and nothing inside it.
 * They stay off its shoulders: bumps there once squared every crown off into a box.
 */
function billow(L, x, y, R, cut, h, rr) {
  const lit = { x, y, R };
  puff(L, x, y, R, cut, h);
  const n = 1 + Math.floor(R / 9);
  for (let m = 0; m < n; m++) {
    const a = Math.PI * (1.26 + (m + 0.2 + rr() * 0.6) / n * 0.48);
    const br = R * (0.2 + rr() * 0.12);
    puff(L, x + Math.cos(a) * R * 0.84, y + Math.sin(a) * R * 0.84, br, cut, h, lit);
  }
}

/** One cumulus: centred on cx, flat base at cy, about w wide and h tall (art pixels). */
function cumulus(L, cx, cy, w, h, rr) {
  const cut = cy;
  // [share of the width, puff radius as a share of h, height of the puff centres]
  const tiers = [
    [0.34, 0.36, 0.6],    // crown
    [0.7, 0.28, 0.36],    // middle
    [0.85, 0.2, 0.16],    // base row
  ];
  for (const [span, rad, lift] of tiers) {
    const R0 = h * rad;
    const n = Math.max(1, Math.round((w * span) / (R0 * 1.5)));
    for (let m = 0; m < n; m++) {
      const t = n === 1 ? 0.5 : m / (n - 1);
      const R = R0 * (1 - Math.abs(t - 0.5) * 0.4) * (0.85 + rr() * 0.3);
      const x = cx + (t - 0.5) * Math.max(0, w * span - 2 * R) + (rr() - 0.5) * R * 0.4;
      const y = cut - h * lift + (rr() - 0.5) * h * 0.08;
      if (R > 7) billow(L, x, y, R, cut, h, rr);
      else puff(L, x, y, R, cut, h);
    }
  }
}

/** Emit the buffer: one fillRect per run, all runs of one colour together. */
function blit(g, L, pal) {
  const { buf, T } = L;
  for (let c = 1; c <= pal.length; c++) {
    g.fillStyle = pal[c - 1];
    for (let y = 0; y < T; y++) {
      const row = y * T;
      for (let x = 0; x < T; x++) {
        if (buf[row + x] !== c) continue;
        let e = x + 1;
        while (e < T && buf[row + e] === c) e++;
        g.fillRect(x, y, e - x, 1);
        x = e - 1;
      }
    }
  }
}

/**
 * A bank of cumuli, one per row of `rows` so no two share a base line, each w wide and
 * h tall (art pixels, ranges), painted in pal: [deep, shade, body, light, top, rim].
 */
function bank(g, T, r, { rows, w, h }, pal) {
  const L = { T, buf: new Uint8Array(T * T), solid: new Uint8Array(T * T) };
  const ch = T / rows;
  // Each row's cloud steps across by a golden-ratio stride, so neighbours never stack
  // in one column, then jitters.
  let x = r() * T;
  for (let j = 0; j < rows; j++) {
    x += T * (0.618 + (r() - 0.5) * 0.2);
    const cw = w[0] + r() * (w[1] - w[0]);
    const chh = h[0] + r() * (h[1] - h[0]);
    cumulus(L, x, j * ch + ch * (0.55 + r() * 0.4), cw, chh, r);
  }
  blit(g, L, pal);
}

export default {
  // Deepest: small, low-contrast banks barely lifted off the sky.
  far(g, T, th, r) {
    const [s0, s1] = th.sky, f = th.bgFar;
    bank(g, T, r, { rows: 7, w: [70, 120], h: [26, 38] }, [
      mix(s0, f, 0.5), mix(s0, f, 0.8), f, mix(f, s1, 0.4), mix(f, LAVENDER, 0.13), mix(s0, f, 0.4),
    ]);
  },
  // Between: fewer, bigger clouds, one step lighter.
  mid(g, T, th, r) {
    const [s0] = th.sky, f = th.bgFar, n = th.bgNear;
    bank(g, T, r, { rows: 4, w: [100, 150], h: [40, 54] }, [
      mix(f, n, 0.05), mix(f, n, 0.3), mix(f, n, 0.55), mix(f, n, 0.8), mix(n, LAVENDER, 0.1), mix(s0, f, 0.8),
    ]);
  },
  // Closest: a few big cumuli in the theme's near tone, tops toward the board's lavender.
  near(g, T, th, r) {
    const f = th.bgFar, n = th.bgNear;
    bank(g, T, r, { rows: 2, w: [150, 196], h: [62, 80] }, [
      mix(f, n, 0.4), mix(f, n, 0.72), n, mix(n, LAVENDER, 0.2), mix(n, LAVENDER, 0.38), f,
    ]);
  },
};
