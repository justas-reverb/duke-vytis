// COSMOS: sparse, sharp white stars on deep blue-black space, from the backgrounds board.
//
//   FAR   faint clouds, darker dust and lighter glow a step off the sky, and a scatter
//         of tiny dim stars
//   MID   single stars in the pale blues, some with a one-pixel glint
//   NEAR  a few big four-point sparkles with white hearts, and a few lesser ones
//
// The board shows a pattern of points over deep space, so the depth has to come from the
// three scales of point: the old painter drew every star as the same blue fleck in two
// opacities, which read as snow rather than distance. The clouds are kept to a whisper --
// at a quarter opacity or more they read as stains, then as camouflage -- and the sky
// stays visible through all three layers: COSMOS's ledges are slabs of dark starfield,
// and anything laid over the whole tile would take away the one thing they read against.
//
// STARFIELD imports starSky() from here, so a change to the shape of the stars changes
// both zones, which is the point. But it is NOT this sky in green: it swaps the clouds for
// an even veil, a dense field of dim points and readable clusters (see starfield.js),
// because the two zones come one after the other and a tint alone did not tell them apart.
//
// Wrapping: every star is drawn through dotW, which repeats whatever crosses an edge on
// the opposite side, and the haze is wrapNoise, which tiles by construction. The stars
// are placed at a minimum WRAPPED distance from each other, so no two clump across a seam.

import { dotW, wrapNoise, mix } from './util.js';

/** Distance between two tile coordinates on a torus of size T. */
const wd = (a, b, T) => { const d = Math.abs(a - b) % T; return Math.min(d, T - d); };

/**
 * Up to n whole-pixel points, each at least minD from every other and from `avoid`,
 * measured across the wrap. A point that finds no room in 40 tries is dropped rather
 * than forced, so the count is a ceiling and the spacing is the rule.
 */
export function scatter(r, n, minD, T, avoid = []) {
  const pts = [];
  const clear = (x, y) => {
    for (const p of avoid) if (Math.hypot(wd(x, p.x, T), wd(y, p.y, T)) < minD) return false;
    for (const p of pts) if (Math.hypot(wd(x, p.x, T), wd(y, p.y, T)) < minD) return false;
    return true;
  };
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < 40; t++) {
      const x = Math.floor(r() * T), y = Math.floor(r() * T);
      if (clear(x, y)) { pts.push({ x, y }); break; }
    }
  }
  return pts;
}

/**
 * A star as a plus: arms[0] is the heart, arms[d] the four pixels d out from it. `halo`,
 * if given, puts one pixel on each diagonal next to the heart, which rounds a big sparkle
 * the way the board's do instead of leaving it a thin cross.
 */
export function star(g, T, x, y, arms, halo) {
  if (halo) {
    g.fillStyle = halo;
    dotW(g, x - 1, y - 1, T); dotW(g, x + 1, y - 1, T);
    dotW(g, x - 1, y + 1, T); dotW(g, x + 1, y + 1, T);
  }
  for (let d = arms.length - 1; d >= 1; d--) {
    g.fillStyle = arms[d];
    dotW(g, x + d, y, T); dotW(g, x - d, y, T);
    dotW(g, x, y + d, T); dotW(g, x, y - d, T);
  }
  g.fillStyle = arms[0];
  dotW(g, x, y, T);
}

/**
 * Soft space haze, posterised to a few translucent steps with hard edges: smooth tileable
 * noise, cut into bands. `bands` is [{ lo, hi, colour, alpha }], and lo and hi are SHARES
 * OF THE TILE, lowest first: a band [0, 0.56] is the darkest 56% of the noise, whatever
 * values this tile's noise happens to take. A pixel in no band stays transparent. Bands
 * at the bottom are dark dust that deepens the sky, bands at the top faint glow.
 * Painted as runs along each row, so a tile costs a few thousand rectangles rather than
 * 65,536. Hard steps rather than a dither because the wrap test compares a tile's edge
 * column with its opposite, and a checkerboard at the seam is a large difference between
 * two pixels that are, correctly, neighbours.
 *
 * Shares, not raw noise values, because three octaves of smooth noise averaged together
 * pile up around the middle and never reach either end -- and WHERE they pile up depends
 * on nine lattice numbers, so it moves with the seed. Cut at fixed values, this zone drew
 * 56% dark dust and not one pixel of glow on one seed and 12% dust against 41% glow on the
 * next, from the same three lines of description. The cut is now the tile's own quantile,
 * so a band covers the share it asks for on every seed and the zone stops depending on a
 * roll of the dice.
 */
export function haze(g, T, r, cells, bands) {
  const a = wrapNoise(r, cells, T), b = wrapNoise(r, cells * 2, T), c = wrapNoise(r, cells * 4, T);
  // Mostly the broadest octave. An even mix of the three cut into hard-edged bands read
  // as camouflage; weighted to the broad one, the bands are clouds. Evaluated once into
  // an array rather than per pixel inside the run loop, because the quantiles need the
  // whole field anyway.
  const F = new Float64Array(T * T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) F[y * T + x] = (a(x, y) * 5 + b(x, y) * 2 + c(x, y) * 0.6) / 7.6;
  }
  const sorted = Float64Array.from(F).sort();
  const at = (q) => sorted[Math.min(T * T - 1, Math.max(0, Math.round(q * (T * T - 1))))];
  const cuts = bands.map((bd) => [at(bd.lo), at(bd.hi)]);
  const band = (x, y) => {
    const v = F[y * T + x];
    // The top band takes its own upper edge, or the single brightest pixel of the tile
    // would fall through every band and be left transparent.
    for (let k = 0; k < bands.length; k++) {
      if (v >= cuts[k][0] && (v < cuts[k][1] || (bands[k].hi >= 1 && v <= cuts[k][1]))) return k;
    }
    return -1;
  };
  for (let y = 0; y < T; y++) {
    let x0 = 0, k0 = band(0, y);
    for (let x = 1; x <= T; x++) {
      const k = x < T ? band(x, y) : -2;
      if (k === k0) continue;
      if (k0 >= 0) {
        g.globalAlpha = bands[k0].alpha;
        g.fillStyle = bands[k0].colour;
        g.fillRect(x0, y, x - x0, 1);
      }
      x0 = x; k0 = k;
    }
  }
  g.globalAlpha = 1;
}

const pick = (r, list) => list[Math.floor(r() * list.length)];

/**
 * A three-layer star sky. `pal(th)` gives the colours from the zone's theme; `o` the
 * counts. Every count is per 256 x 256 tile, which is 128 x 128 view units: a screen is
 * under four tiles wide and just over two tall, so it shows about eight tiles of each
 * layer, and a count of 3 is two dozen of that thing on screen.
 */
export function starSky(pal, o) {
  return {
    far(g, T, th, r) {
      const P = pal(th);
      // An even veil under everything, for a sky that should be darker without clouds.
      if (P.veil) {
        g.globalAlpha = P.veil.alpha;
        g.fillStyle = P.veil.colour;
        g.fillRect(0, 0, T, T);
        g.globalAlpha = 1;
      }
      // A cloudless sky (STARFIELD) used to re-seed here before scattering its stars:
      // FAR and MID were handed the same stream, and with no haze to spend a couple of
      // hundred numbers first, FAR's first stars sat exactly under MID's. The layers
      // have their own streams now (backdrop.js layerSeed), so it scatters from r.
      if (P.haze.length) haze(g, T, r, o.hazeCells, P.haze);
      for (const p of scatter(r, o.farStars, 7, T)) {
        g.fillStyle = pick(r, P.far);
        dotW(g, p.x, p.y, T);
      }
    },
    mid(g, T, th, r) {
      const P = pal(th);
      const pts = scatter(r, o.midStars, 14, T);
      for (const p of pts) {
        if (r() < o.midGlint) star(g, T, p.x, p.y, [pick(r, P.mid), P.glint]);
        else { g.fillStyle = pick(r, P.mid); dotW(g, p.x, p.y, T); }
      }
      // Loose clusters: a handful of dim points round a brighter one. STARFIELD has them
      // and COSMOS does not; with its cloudless dense field, they are what tells the two
      // apart once the colour is taken away. Seven points in the far layer's colours were
      // too faint to find in play, so a sky can ask for more, in its own `cluster` tones.
      for (let k = 0; k < (o.clusters || 0); k++) {
        const c = scatter(r, 1, 30, T, pts)[0];
        if (!c) break;
        g.fillStyle = P.mid[P.mid.length - 1];
        dotW(g, c.x, c.y, T);
        for (let j = 0; j < (o.clusterStars || 7); j++) {
          const a = r() * Math.PI * 2, d = 3 + r() * 9;
          g.fillStyle = pick(r, P.cluster || P.far);
          dotW(g, Math.round(c.x + Math.cos(a) * d), Math.round(c.y + Math.sin(a) * d * 0.8), T);
        }
        pts.push(c);
      }
    },
    near(g, T, th, r) {
      const P = pal(th);
      const big = scatter(r, o.sparkles, 70, T);
      for (const p of big) star(g, T, p.x, p.y, P.sparkle, P.halo);
      for (const p of scatter(r, o.nearStars, 26, T, big)) {
        if (r() < 0.5) star(g, T, p.x, p.y, P.small);
        else { g.fillStyle = P.small[0]; dotW(g, p.x, p.y, T); }
      }
    },
  };
}

// The board's COSMOS is blue-black with WHITE points. The theme's own colours give the
// blues -- bgFar and bgNear for the glow and the dimmest stars, text (#88aacc) and
// particle (#ccddff) for the pale ones -- and its accent is white, which is the board's.
// The dust is the board's blue-black, darker than the theme's sky, which is a little
// lighter and bluer than the board.
const DUST = '#000614';

export default starSky((th) => ({
  // Shares of the tile, darkest first: the darkest 56% is dust, the brightest 6% is
  // glow, and the 38% between them is bare sky.
  //
  // These four numbers were 0.36 / 0.64 / 0.74 / 1 while the cut was a VALUE of the
  // noise, and they were left alone when the cut became a quantile -- but under the new
  // meaning 0.64 and up is no longer "the sliver of noise that ever gets that high", it
  // is "the brightest 36% of the tile". COSMOS grew a blue cloud field: FAR's coverage
  // went 56% -> 72%, the mean of its lit pixels 6 -> 26, and the zone read as stains
  // over the sky rather than the board's flat deep blue-black with sparse white points
  // -- the thing this module's header says to keep the clouds away from. Measured on the
  // backdrop at game size: mean 20.9 before the seed change, 22.7 with 36/36, 21.1 here,
  // and p5/p50/p95 16/21/28 both before and here.
  //
  // 56% dust is the share the zone was verified at. 6% glow is the "lighter glow" the
  // header promises -- present on every seed now, where the old fixed cuts happened to
  // give 0.1% of it on one seed and 41% on the next.
  haze: [
    { lo: 0, hi: 0.56, colour: DUST, alpha: 0.2 },
    { lo: 0.94, hi: 0.97, colour: th.bgFar, alpha: 0.14 },
    { lo: 0.97, hi: 1, colour: th.bgNear, alpha: 0.12 },
  ],
  far: [mix(th.bgNear, th.text, 0.25), mix(th.bgNear, th.text, 0.45), mix(th.bgNear, th.particle, 0.5)],
  mid: [th.text, mix(th.text, th.particle, 0.6), th.particle],
  glint: mix(th.bgNear, th.text, 0.4),
  sparkle: [th.accent, th.particle, th.text, mix(th.bgNear, th.text, 0.35)],
  halo: mix(th.bgNear, th.text, 0.5),
  small: [mix(th.particle, th.accent, 0.4), mix(th.bgNear, th.text, 0.5)],
}), { hazeCells: 3, farStars: 80, midStars: 24, midGlint: 0.3, sparkles: 2, nearStars: 5 });
