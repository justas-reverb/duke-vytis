// NEBULA: magenta-purple gas, swirled and lit from inside, with specks.
//
// The board (assets/backgrounds-reference.webp, zone 9) asks for glowing gas swirls and
// specks, lit from inside, with no straight edges. The old painter scattered small
// rectangles round one centre, so every tile showed the same squarish blot.
//
// Everything here is value noise that wraps, sampled through a warp that wraps: a soft
// domain warp plus a few VORTICES, each turning the plane about its centre by an angle
// that grows toward the centre and dies out before half a tile. That twist is what bends
// the gas into swirls, and because it is zero outside its radius and measured across the
// wrap, the warped field still tiles. A chunky GRAIN (2 x 2 blocks) mottles the inside of
// the gas, the clotted look of the board's; without it the gas came out smooth as plastic.
//
//   FAR   fills the tile: deep space in six dithered tones from darker than the sky's
//         top up to a dim haze, and faint specks. The gas glows against near-black as
//         on the board; over the bare sky's violet it was one mid-purple mottle.
//   MID   filaments -- the contour lines of the swirled noise, gathered into clumps by a
//         slower noise -- violet, from a halo of bgFar to a dim magenta line.
//   NEAR  the glowing knots, violet halo to a core toward pink, plus the brighter specks.
// Coverage is set by RANK, not by raw noise value: each layer's thresholds are quantiles
// of its own field ("the top 15% is gas"), so how much of the tile is gas does not drift
// with the seed or with the noise's own distribution. Tones meet through an ordered
// dither right at each threshold; only the gas's outer edge over transparency is left
// clean, for the reason given at quantise().
//
// What went wrong on the way, so it is not tried again:
//   - No lattice is coarser than 4 cells across the tile. A 2-cell value noise is a
//     mirror image of itself about every lattice point -- interpolating a, b, a, b -- and
//     the first version showed it: every tile was two reflected halves.
//   - Gas over a third of the tile, magenta in MID as well as NEAR, was camouflage: a hot
//     patch in every quarter of the screen and the Duke lost in it. Magenta is now only
//     the thick of NEAR's knots, about one pixel in twenty.
//
// Brightness: the play area's mean is BELOW the old painter's (31 against 38, measured on
// a tools/shot.mjs frame at floor 1600) and its 95th percentile a little above (77
// against 70), from the knots. The hottest core is about the old swirls' hottest pixel,
// twice bgNear at 80%. The platforms here are pale cyan, so gas and ledges never share
// a hue.

import { mix } from './util.js';

// 4 x 4 ordered dither, -0.47..0.47. Its period divides the tile, so it wraps too.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;

/**
 * Fractal value noise that wraps: [[cells, weight], ...], 0..1. The same noise as util.js
 * wrapNoise, octaves summed, but cells must be a power of two so the lattice wraps with a
 * mask, and each sample is one flat loop: this is sampled about a million times per zone,
 * and through wrapNoise's closures the three layers took 150 ms.
 */
function fbm(rr, T, octaves) {
  const tot = octaves.reduce((s, [, w]) => s + w, 0);
  const n = octaves.length;
  const C = new Int32Array(n), K = new Float64Array(n), Wt = new Float64Array(n);
  const Ls = [];
  octaves.forEach(([c, w], o) => {
    if (c < 4 || (c & (c - 1))) throw new Error(`fbm: ${c} cells -- use a power of two, 4 or more`);
    C[o] = c; K[o] = c / T; Wt[o] = w / tot;
    const L = new Float32Array(c * c);
    for (let i = 0; i < c * c; i++) L[i] = rr();
    Ls.push(L);
  });
  return (x, y) => {
    let s = 0;
    for (let o = 0; o < n; o++) {
      const c = C[o], m = c - 1, L = Ls[o];
      const fx = x * K[o], fy = y * K[o];
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const x0 = ix & m, x1 = (ix + 1) & m, y0 = (iy & m) * c, y1 = ((iy + 1) & m) * c;
      const a = L[y0 + x0] + (L[y0 + x1] - L[y0 + x0]) * tx;
      const b = L[y1 + x0] + (L[y1 + x1] - L[y1 + x0]) * tx;
      s += (a + (b - a) * ty) * Wt[o];
    }
    return s;
  };
}

/**
 * The swirl: a smooth domain warp of `amp` pixels, then `count` vortices of radius R
 * turning up to `twist` radians. warp(x, y, out) writes the warped point to out.x, out.y;
 * the warp is periodic in T.
 */
function swirl(rr, T, { amp, count, R, twist }) {
  const wx = fbm(rr, T, [[4, 1]]), wy = fbm(rr, T, [[4, 1]]);
  // Flat arrays and a squared-distance reject: this runs for every pixel of every layer,
  // and written with objects and a double modulo it was two thirds of NEBULA's time.
  const VX = new Float64Array(count), VY = new Float64Array(count);
  const VR = new Float64Array(count), VA = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    VX[k] = rr() * T; VY[k] = rr() * T; VR[k] = R[0] + rr() * (R[1] - R[0]);
    const sign = rr() < 0.5 ? -1 : 1;
    VA[k] = twist * sign * (0.6 + rr() * 0.4);
  }
  return (x, y, out) => {
    let px = x + (wx(x, y) - 0.5) * amp, py = y + (wy(x, y) - 0.5) * amp;
    for (let k = 0; k < count; k++) {
      // Delta across the wrap, so a vortex near an edge turns the gas on both sides.
      let dx = px - VX[k], dy = py - VY[k];
      dx -= T * Math.round(dx / T);
      dy -= T * Math.round(dy / T);
      const d2 = dx * dx + dy * dy, R2 = VR[k] * VR[k];
      if (d2 >= R2) continue;
      const f = 1 - Math.sqrt(d2) / VR[k];
      const a = VA[k] * f * f;
      const c = Math.cos(a), s = Math.sin(a);
      px = VX[k] + dx * c - dy * s;
      py = VY[k] + dx * s + dy * c;
    }
    out.x = px; out.y = py;
  };
}

/** A T x T field: fn(u, v, x, y) where (u, v) is (x, y) through the warp. */
function field(T, warp, fn) {
  const F = new Float32Array(T * T), p = { x: 0, y: 0 };
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      warp(x, y, p);
      F[y * T + x] = fn(p.x, p.y, x, y);
    }
  }
  return F;
}

/** The field's values at the given ranks (0..1), from a 4096-bin histogram. */
function quantiles(F, qs) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < F.length; i++) { const v = F[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const B = 4096, k = (B - 1) / (hi - lo || 1), h = new Uint32Array(B);
  for (let i = 0; i < F.length; i++) h[((F[i] - lo) * k) | 0]++;
  return qs.map((q) => {
    const want = q * F.length;
    let acc = 0, b = 0;
    while (b < B - 1 && acc + h[b] < want) acc += h[b++];
    return lo + (b + 1) / k;
  });
}

/**
 * Quantise field F into buf: tone base + k where F passes the k-th threshold, untouched
 * below the first. The dither nudges each pixel by up to `eps` so tones stipple at a seam;
 * `chunk` 2 dithers in 2 x 2 blocks, for FAR's wide soft bands, where a one-pixel
 * stipple cost as many fillRects as the other two layers together.
 *
 * Over transparency (base 0) the FIRST threshold is the gas's outer edge, and it is
 * neither dithered nor grained: it is tested, undithered, on the grain-free field E if one
 * is given. A ragged edge over transparency is a spray of opaque and clear pixels, which
 * is all edge -- and tools/test-backgrounds.mjs, which compares a tile's opposite edges
 * pixel by pixel, failed MID on it (a mean difference of 23 against a limit of 12)
 * though the tile wraps exactly: the columns either side of ANY line through that layer
 * differed as much. The grain now mottles the inside of the gas only.
 */
function quantise(F, T, cuts, eps, buf, base = 0, chunk = 1, E = F) {
  const sh = chunk === 2 ? 1 : 0;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = y * T + x;
      if (base === 0 && !(E[i] > cuts[0])) continue;
      const v = F[i] + dith(x >> sh, y >> sh) * eps;
      let c = base === 0 ? 1 : 0;
      while (c < cuts.length && v > cuts[c]) c++;
      if (c) buf[i] = base + c;
    }
  }
}

/**
 * The grain: half a random value per 2 x 2 block, half a 32-cell noise for lumps. The
 * blocks are what mottle the gas in the board's chunky pixels, and a lookup costs next to
 * nothing where the fine noise octaves it replaced were a third of the layer's time.
 */
function grainOf(rr, T) {
  const H = T >> 1, G = new Float32Array(H * H);
  for (let i = 0; i < H * H; i++) G[i] = rr();
  const lump = fbm(rr, T, [[32, 1]]);
  return (x, y) => 0.55 * G[(y >> 1) * H + (x >> 1)] + 0.45 * lump(x, y);
}

/**
 * Emit the buffer: one fillRect per run, all runs of one colour together. A buffer with
 * no transparent pixel is first filled with its commonest tone in one call, and that
 * tone's runs are skipped -- FAR fills its tile, and this saves a tenth of its calls.
 */
function blit(g, T, buf, pal) {
  const count = new Uint32Array(pal.length + 1);
  for (let i = 0; i < buf.length; i++) count[buf[i]]++;
  let skip = 0;
  if (!count[0]) {
    for (let c = 1; c <= pal.length; c++) if (count[c] > count[skip]) skip = c;
    g.fillStyle = pal[skip - 1];
    g.fillRect(0, 0, T, T);
  }
  for (let c = 1; c <= pal.length; c++) {
    if (c === skip || !count[c]) continue;
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

/** n specks of palette tone `tone`: single pixels, or 2 x 2 with probability `big`. */
function specks(rr, T, buf, n, tone, big = 0) {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rr() * T), y = Math.floor(rr() * T);
    const s = rr() < big ? 2 : 1;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) buf[((y + j) % T) * T + (x + i) % T] = tone;
  }
}

export default {
  // Deep space filling the tile, and faint specks.
  far(g, T, th, r) {
    const [s0] = th.sky, f = th.bgFar, n = th.bgNear;
    const warp = swirl(r, T, { amp: 40, count: 2, R: [60, 100], twist: 2.2 });
    const noise = fbm(r, T, [[4, 0.55], [8, 0.27], [16, 0.12], [32, 0.06]]);
    const F = field(T, warp, (u, v) => noise(u, v));
    // Deep space, filling the tile: six tones from darker than the sky's top up to a dim
    // haze, each band wide and dithered into the next, so the gas in front glows against
    // near-black as it does on the board. Over the bare sky everything came out one
    // mid-purple mottle, and two dark tones with the sky between them made flat cut-outs.
    const cuts = quantiles(F, [0.22, 0.42, 0.6, 0.76, 0.9]);
    const [q10, q90] = quantiles(F, [0.1, 0.9]);
    const buf = new Uint8Array(T * T).fill(1);
    quantise(F, T, cuts, (q90 - q10) * 0.14, buf, 1, 2);
    specks(r, T, buf, 150, 7);
    specks(r, T, buf, 40, 8);
    blit(g, T, buf, [
      mix(s0, '#000000', 0.42), mix(s0, '#000000', 0.26), mix(s0, '#000000', 0.1), s0,
      mix(s0, f, 0.55), mix(f, n, 0.15),
      mix(s0, th.particle, 0.14), mix(f, th.particle, 0.24),
    ]);
  },
  // Filaments: the swirled noise's contour lines, gathered into clumps.
  mid(g, T, th, r) {
    const f = th.bgFar, n = th.bgNear, a = th.accent;
    const warp = swirl(r, T, { amp: 36, count: 3, R: [50, 90], twist: 3.2 });
    const noise = fbm(r, T, [[4, 0.5], [8, 0.3], [16, 0.14], [32, 0.06]]);
    const clump = fbm(r, T, [[4, 0.7], [8, 0.3]]);
    const grain = grainOf(r, T);
    const E = field(T, warp, (u, v, x, y) => {
      const ridge = 1 - Math.abs(2 * noise(u, v) - 1);
      return ridge * ridge * (0.25 + clump(x, y));
    });
    const F = E.map((e, i) => e * (0.8 + 0.4 * grain(i % T, (i / T) | 0)));
    // A wide dim halo, a narrower body, and the bright line only in the thick of it: lit
    // from inside. Equal bands made the whole filament bright. Violet rather than
    // magenta: the magenta is the knots in front, and a magenta mid layer put a hot patch
    // in every quarter of the screen. The outermost tone is bgFar itself, barely off the
    // far layer's haze: the glow's falloff, and what keeps the gas's smooth outer edge
    // (see quantise) from reading as a cut-out.
    const [q83, q10] = quantiles(E, [0.83, 0.1]);
    const [q89, q94, q975, q994] = quantiles(F, [0.89, 0.94, 0.975, 0.994]);
    const buf = new Uint8Array(T * T);
    quantise(F, T, [q83, q89, q94, q975, q994], (q975 - q10) * 0.06, buf, 0, 1, E);
    blit(g, T, buf, [f, mix(f, n, 0.55), mix(f, n, 0.85), mix(n, a, 0.1), mix(n, a, 0.2)]);
  },
  // The glowing knots and the brighter specks.
  near(g, T, th, r) {
    const n = th.bgNear, a = th.accent;
    const warp = swirl(r, T, { amp: 30, count: 3, R: [50, 90], twist: 3.6 });
    const noise = fbm(r, T, [[8, 0.55], [16, 0.3], [32, 0.15]]);
    const clump = fbm(r, T, [[4, 1]]);
    const grain = grainOf(r, T);
    const E = field(T, warp, (u, v, x, y) => noise(u, v) * clump(x, y));
    const F = E.map((e, i) => e * (0.8 + 0.4 * grain(i % T, (i / T) | 0)));
    // Each knot sits in a violet halo and only its thick is magenta: one in twenty
    // pixels of the tile. At twice that the knots were the loudest thing on the screen,
    // a hot blot every 128 units.
    const cuts = [...quantiles(E, [0.895]), ...quantiles(F, [0.925, 0.955, 0.982, 0.995])];
    const [q10, q95] = quantiles(F, [0.1, 0.95]);
    const buf = new Uint8Array(T * T);
    quantise(F, T, cuts, (q95 - q10) * 0.07, buf, 0, 1, E);
    const hot = mix(a, th.particle, 0.4);
    specks(r, T, buf, 50, 6, 0.25);
    specks(r, T, buf, 10, 7, 0.3);
    blit(g, T, buf, [
      mix(th.bgFar, n, 0.4), mix(th.bgFar, n, 0.8), mix(n, a, 0.14), mix(n, a, 0.28), mix(n, hot, 0.46),
      mix(n, th.particle, 0.3), mix(n, '#f4d8ff', 0.5),
    ]);
  },
};
