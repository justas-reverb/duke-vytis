// ZENITH: vertical shafts of pale blue-white light in the dark at the top of the tower,
// from the backgrounds board.
//
//   FAR   a dark navy veil over the sky, and three faint, broad, steady shafts
//   MID   two shafts of middle width, transparent between them
//   NEAR  one broad shaft, the brightest, still translucent so the rest shows through
//
// MID's and NEAR's shafts carry motes of light drifting in them.
//
// The board draws each shaft rising from a bright foot and fading out above, which cannot
// tile: a tile repeats up the tower forever, and a shaft that ends at the top of the tile
// begins again, brightest, at the bottom of the one above -- a hard horizontal edge every
// 128 units, the most ledge-like thing a background can do. So each shaft here runs the
// full height. Its outer glow is straight; its HEART brightens and widens once per tile,
// each shaft at its own phase, so the swells never line up into a band across the screen.
// The first version swelled the whole shaft, and once the light is cut into steps every
// step's edge moved with it: the shafts came out as chains of lozenges.
//
// The old painter laid flat bars of bgNear at 80% over ZENITH's light steel sky, which
// made it the brightest zone in the game and put the gold ledges on a pale ground. The
// board's shafts glow against DARK navy, so FAR veils the sky in navy first -- at 90%,
// which leaves a trace of the theme's gradient lightening the screen toward the bottom --
// and the light is drawn over that. Overall the zone is much darker than it was, and only
// the hearts of the NEAR shafts, a few pixels wide, are brighter than the old sky's
// lightest pixel.
//
// The cost is at the zone change. Over STARFIELD's last twelve floors the sky crossfades
// toward ZENITH's light steel blue, and then this veil drops over it: the screen goes
// light, then dark. The real fix is ZENITH's sky in themes.js, which is lighter than the
// board's; with a navy sky there, this veil could go.
//
// Pixel art, not a blur: each shaft's light is cut into a handful of hard-edged steps.
// A 4 x 4 ordered dither between the steps was tried and, at two screen pixels to the art
// pixel and with the zone's falling particles in front, read as rain. Wrapping: shafts are
// laid out with wrapped x and the swell is a cosine with a whole period per tile.

import { dotW, mix } from './util.js';

// The board's light: its shafts are white at the heart and pale blue at the glow.
const PALE = '#b9cbe8';
const NAVY = '#0b1328';

/**
 * Paint shafts of light. Each beam is { x, w, gain, glow, swell, phase, fall }: centre and
 * half-width in tile pixels; peak brightness 0..1; the share of it that is the steady outer
 * glow, the rest being the heart; how far the heart dims between swells, 0..1; where in
 * the tile it swells, 0..1; and how narrow the heart is (1 a straight ramp, 3 a thin core).
 * `levels` are the steps, dim to bright, as { colour, alpha }.
 */
function shafts(g, T, beams, levels) {
  const K = levels.length;
  const buf = new Float32Array(T * T);
  for (const b of beams) {
    const span = Math.ceil(b.w);
    for (let y = 0; y < T; y++) {
      const s = 0.5 + 0.5 * Math.cos(2 * Math.PI * (y / T - b.phase));
      const m = 1 - b.swell * (1 - s);
      for (let dx = -span; dx <= span; dx++) {
        const u = Math.abs(dx) / b.w;
        if (u >= 1) continue;
        const v = b.gain * (b.glow * Math.pow(1 - u, 1.3) + (1 - b.glow) * m * Math.pow(1 - u, b.fall));
        const k = y * T + ((((b.x + dx) % T) + T) % T);
        buf[k] = 1 - (1 - buf[k]) * (1 - v);   // light adds where two shafts overlap
      }
    }
  }
  // Runs along each row: one rectangle per stretch of one step, not one per pixel.
  const level = (x, y) => Math.min(K, Math.floor(buf[y * T + x] * K + 0.5));
  for (let y = 0; y < T; y++) {
    let x0 = 0, l0 = level(0, y);
    for (let x = 1; x <= T; x++) {
      const l = x < T ? level(x, y) : -1;
      if (l === l0) continue;
      if (l0 > 0) {
        g.globalAlpha = levels[l0 - 1].alpha;
        g.fillStyle = levels[l0 - 1].colour;
        g.fillRect(x0, y, x - x0, 1);
      }
      x0 = x; l0 = l;
    }
  }
  g.globalAlpha = 1;
}

/** n shafts spread evenly across the tile, each nudged, sized and phased by r. */
function layout(r, T, n, o) {
  const out = [];
  const x0 = r() * T;
  for (let k = 0; k < n; k++) {
    out.push({
      x: Math.round(x0 + (k + 0.5) * T / n + (r() - 0.5) * 2 * o.jitter),
      w: o.w[0] + r() * (o.w[1] - o.w[0]),
      gain: o.gain[0] + r() * (o.gain[1] - o.gain[0]),
      glow: o.glow,
      swell: o.swell,
      phase: r(),
      fall: o.fall,
    });
  }
  return out;
}

/**
 * Motes of light drifting in a shaft: single pixels, most near its middle. They are what
 * gives a shaft that is the same all the way up something to look at, without a line
 * across it.
 */
function motes(g, T, r, beams, n, colour, alpha) {
  g.globalAlpha = alpha;
  g.fillStyle = colour;
  for (const b of beams) {
    for (let k = 0; k < n; k++) {
      const off = (r() + r() + r() - 1.5) * b.w * 0.6;
      dotW(g, Math.round(b.x + off), Math.floor(r() * T), T);
    }
  }
  g.globalAlpha = 1;
}

export default {
  far(g, T, th, r) {
    g.globalAlpha = 0.9;
    g.fillStyle = mix(th.bgFar, NAVY, 0.7);
    g.fillRect(0, 0, T, T);
    g.globalAlpha = 1;
    // Mostly glow and little heart, and no swell: at this distance a shaft is a faint
    // broad band, not a line. With a strong heart they came out as thin rods, like pipes,
    // and a swelling heart this faint only moved one step's edge by a pixel -- a notch.
    shafts(g, T, layout(r, T, 3, { jitter: 20, w: [12, 18], gain: [0.3, 0.45], glow: 0.85, swell: 0, fall: 2 }), [
      { colour: th.bgFar, alpha: 0.6 },
      { colour: mix(th.bgFar, th.bgNear, 0.5), alpha: 0.7 },
      { colour: th.bgNear, alpha: 0.6 },
    ]);
  },
  mid(g, T, th, r) {
    const b = layout(r, T, 2, { jitter: 16, w: [16, 22], gain: [0.55, 0.7], glow: 0.5, swell: 0.6, fall: 3 });
    shafts(g, T, b, [
      { colour: th.bgFar, alpha: 0.5 },
      { colour: th.bgNear, alpha: 0.45 },
      { colour: th.bgNear, alpha: 0.7 },
      { colour: th.sky[1], alpha: 0.6 },
    ]);
    motes(g, T, r, b, 6, th.sky[1], 0.6);
  },
  near(g, T, th, r) {
    const b = layout(r, T, 1, { jitter: 0, w: [26, 30], gain: [0.95, 0.95], glow: 0.45, swell: 0.65, fall: 3.5 });
    shafts(g, T, b, [
      { colour: th.bgNear, alpha: 0.25 },
      { colour: th.bgNear, alpha: 0.45 },
      { colour: th.sky[1], alpha: 0.45 },
      { colour: th.sky[1], alpha: 0.6 },
      { colour: mix(th.sky[1], PALE, 0.5), alpha: 0.7 },
      { colour: PALE, alpha: 0.8 },
    ]);
    motes(g, T, r, b, 12, PALE, 0.75);
  },
};
