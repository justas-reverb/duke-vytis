// DOWNTOWN: a street of tall houses at night, after the board's "night wall of square
// windows in a regular grid, some lit pale lavender, some dark".
//
//   FAR   the far wall: a fine grid of small four-pane windows, most dark, a few dimly
//         lit, faint piers and storey lines between them
//   MID   a house front in the middle distance, two bays wide: brick, pilasters, a
//         window per bay with sill and lintel, nearly half of them lit
//   NEAR  one big narrow house front: rusticated pilasters, a drainpipe and a tall
//         six-pane window per storey. Between the two houses, alleys show FAR
//
// The board's preview is one whole house, roof and chimneys and all -- which cannot
// repeat up a tower. Here every house is a slice of its facade, storey on storey, with
// no roof and no ground: a street of houses too tall to see the top of, which is what
// the old painter's grid of windows was already saying.
//
// Night, and quiet. The walls are the board's deep blue-violet, darker than the old
// lavender-grey, and the only bright things are lit window panes -- small, vertical
// and in the grid, never a line. There is no string course running across a house:
// on screen every storey line of every house would sit at the same height, a dark
// ruled line every 128 screen pixels behind a tower whose ledges are about 120 apart.

import { mix, shade } from './util.js';
import { pixTile, dither, rgba } from './forest.js';

/** A palette that hands out indices: add(colour) returns the colour's index. */
function palette() {
  const list = [null];
  const seen = new Map();
  return {
    list,
    add(c) {
      if (!seen.has(c)) { seen.set(c, list.length); list.push(c); }
      return seen.get(c);
    },
  };
}

/** The tones a wall is drawn in, from its base colour. */
function wallTones(pal, base) {
  return {
    wall: pal.add(base),
    alt: pal.add(shade(base, 1.07)),
    mortar: pal.add(shade(base, 0.84)),
    pier: pal.add(shade(base, 1.12)),
    light: pal.add(shade(base, 1.28)),
    dark: pal.add(shade(base, 0.7)),
    deep: pal.add(shade(base, 0.48)),
  };
}

/**
 * A window w x h at (x, y), cols x rows panes. Lit: pale lavender, brighter toward the
 * middle, dithered between the two. Dark: night glass with a glint of reflection.
 */
function window(P, x, y, w, h, cols, rows, lit, t, g) {
  P.rect(x - 1, y - 1, w + 2, h + 2, t.deep);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let c;
      if (lit) {
        const dx = (i + 0.5) / w - 0.5, dy = (j + 0.5) / h - 0.55;
        const k = 1 - Math.sqrt(dx * dx + dy * dy) * 2.2;
        c = k + (dither(x + i, y + j) - 0.5) * 0.5 > 0.35 ? g.hi : g.lit;
      } else {
        c = (i - j + h) % (w + h) === Math.floor(w * 0.6) || (i - j + h) % (w + h) === Math.floor(w * 0.6) + 1
          ? g.glint : g.glass;
      }
      P.set(x + i, y + j, c);
    }
  }
  // Mullions and transoms, one pixel, in the frame's colour.
  for (let k = 1; k < cols; k++) P.rect(x + Math.round((k * w) / cols), y, 1, h, t.deep);
  for (let k = 1; k < rows; k++) P.rect(x, y + Math.round((k * h) / rows), w, 1, t.deep);
}

/**
 * A strip of house front, W wide from x0, the full height of the tile. `s` sets the
 * bays, pilasters, storeys and windows; `t` the wall tones; `g` the glass tones.
 */
function facade(P, r, x0, W, T, s, t, g) {
  // Brick: courses of s.course rows, the last row of each mortar, head joints every
  // s.brick pixels, staggered by half a brick on alternate courses. A brick in five is
  // a shade lighter -- enough to read as brick, not enough to read as a pattern.
  for (let y = 0; y < T; y++) {
    const c = Math.floor(y / s.course), yr = y % s.course;
    const off = c % 2 ? s.brick >> 1 : 0;
    let bx = -off, tone = r() < 0.2 ? t.alt : t.wall;
    for (let x = 0; x < W; x++) {
      if (x - bx >= s.brick) { bx += s.brick; tone = r() < 0.2 ? t.alt : t.wall; }
      const joint = yr === s.course - 1 || x - bx === s.brick - 1;
      P.set(x0 + x, y, joint ? t.mortar : tone);
    }
  }
  // Pilasters between the bays, rusticated: a groove every s.rust rows.
  const step = s.bay + s.pil;
  for (let k = 0; k * step <= W - s.pil; k++) {
    const px = x0 + k * step;
    P.rect(px, 0, s.pil, T, t.pier);
    P.rect(px, 0, 1, T, t.light);
    P.rect(px + s.pil - 1, 0, 1, T, t.dark);
    for (let y = s.rustAt; y < T; y += s.rust) P.rect(px + 1, y, s.pil - 2, 1, t.mortar);
  }
  // A window per bay per storey, with a lintel over it and a sill under it. Exactly
  // s.lit of them lit, chosen at random: a coin tossed per window left one house with a
  // single lit window out of eight, a street with everyone asleep.
  const spots = [];
  for (let b = 0; b * step + s.pil + s.bay <= W; b++) {
    for (let y0 = s.storeyAt; y0 < T + s.storeyAt; y0 += s.storey) spots.push({ b, y0, key: r() });
  }
  const lit = new Set([...spots].sort((a, b) => a.key - b.key).slice(0, Math.round(spots.length * s.lit)));
  for (const spot of spots) {
    const wx = x0 + spot.b * step + s.pil + ((s.bay - s.win[0]) >> 1);
    const wy = spot.y0 + s.winY;
    P.rect(wx - 2, wy - 3, s.win[0] + 4, 2, t.pier);
    if (s.keystone) P.rect(wx + (s.win[0] >> 1) - 2, wy - 4, 5, 3, t.light);
    window(P, wx, wy, s.win[0], s.win[1], s.panes[0], s.panes[1], lit.has(spot), t, g);
    P.rect(wx - 2, wy + s.win[1] + 1, s.win[0] + 4, 1, t.alt);
    P.rect(wx - 2, wy + s.win[1] + 2, s.win[0] + 4, 1, t.deep);
    if (s.corbels) {
      P.rect(wx, wy + s.win[1] + 3, 2, 2, t.dark);
      P.rect(wx + s.win[0] - 2, wy + s.win[1] + 3, 2, 2, t.dark);
    }
  }
}

/** Glass tones: lit and its brighter middle, dark glass and its glint. */
function glass(pal, wall, lav, litK, hiK) {
  return {
    lit: pal.add(mix(wall, lav, litK)),
    hi: pal.add(mix(wall, lav, hiK)),
    glass: pal.add(mix(wall, '#07061a', 0.6)),
    glint: pal.add(mix(wall, '#07061a', 0.25)),
  };
}

function colours(th) {
  const navy = '#0c0b22';
  return {
    navy,
    // Pale lavender, from the zone's own violet toward white.
    lav: mix(th.bgNear, '#dccbff', 0.7),
    far: mix(th.bgFar, navy, 0.6),
    mid: mix(th.bgFar, navy, 0.42),
    near: mix(th.bgFar, navy, 0.55),
  };
}

export default {
  far(g, T, th, r) {
    const P = pixTile(T);
    const c = colours(th);
    const pal = palette();
    // The far wall lets a little of the sky through, so the zone's gradient -- lighter
    // toward the street -- and the crossfade into the next zone still show.
    const wall = pal.add(rgba(c.far, 0.9));
    const pier = pal.add(rgba(shade(c.far, 0.82), 0.92));
    const speck = pal.add(rgba(shade(c.far, 1.1), 0.9));
    const t = { deep: pal.add(shade(c.far, 0.55)) };
    const gl = [
      { lit: pal.add(mix(c.far, c.lav, 0.24)), hi: pal.add(mix(c.far, c.lav, 0.3)) },
      { lit: pal.add(mix(c.far, c.lav, 0.36)), hi: pal.add(mix(c.far, c.lav, 0.44)) },
    ];
    const dark = { glass: pal.add(mix(c.far, '#07061a', 0.5)), glint: pal.add(mix(c.far, '#07061a', 0.2)) };
    P.buf.fill(wall);
    for (let k = 0; k < 400; k++) P.set(Math.floor(r() * T), Math.floor(r() * T), speck);
    // A 32-pixel grid: piers and storey lines two pixels wide, centred on the cell
    // boundaries, so the tile's own edges fall in the middle of one and match.
    for (let k = 0; k < T; k += 32) { P.rect(k - 1, 0, 2, T, pier); P.rect(0, k - 1, T, 2, pier); }
    for (let cy = 0; cy < T; cy += 32) {
      for (let cx = 0; cx < T; cx += 32) {
        const v = r();
        const lit = v < 0.12 ? gl[1] : v < 0.3 ? gl[0] : null;
        window(P, cx + 10, cy + 9, 12, 12, 2, 2, !!lit, t, lit || dark);
      }
    }
    P.flush(g, pal.list);
  },

  mid(g, T, th, r) {
    const P = pixTile(T);
    const c = colours(th);
    const pal = palette();
    const t = wallTones(pal, c.mid);
    const gl = glass(pal, c.mid, c.lav, 0.62, 0.8);
    const s = {
      bay: 36, pil: 8, course: 4, brick: 10, rust: 8, rustAt: 3,
      storey: 64, winY: 20, win: [18, 24], panes: [2, 2], lit: 0.45, keystone: false, corbels: false,
    };
    // One house of two bays, on the left of the tile; NEAR's stands on the right, and the
    // alleys between show FAR's wall. The layers scroll up and down but never sideways,
    // so where a house stands in its tile is where it stands against the other layers
    // for good -- placed at random, NEAR's house once landed squarely in front of this
    // one and hid it. Neither crosses the tile's side edge: brick changes every few
    // pixels, and a house across the edge puts a join in it that the seam test cannot
    // tell from a seam.
    facade(P, r, 8 + Math.floor(r() * 6), s.pil + 2 * (s.bay + s.pil), T, { ...s, storeyAt: 0 }, t, gl);
    P.flush(g, pal.list);
  },

  near(g, T, th, r) {
    const P = pixTile(T);
    const c = colours(th);
    const pal = palette();
    const t = wallTones(pal, c.near);
    const gl = glass(pal, c.near, c.lav, 0.66, 0.78);
    const pipe = [pal.add(shade(c.near, 0.62)), pal.add(shade(c.near, 0.9)), pal.add(shade(c.near, 0.4))];
    const s = {
      bay: 56, pil: 12, course: 8, brick: 16, rust: 12, rustAt: 5,
      storey: 128, storeyAt: 0, winY: 36, win: [28, 42], panes: [2, 3], lit: 0.5, keystone: true, corbels: true,
    };
    // On the right of the tile, clear of MID's house on the left (see mid()).
    const W = s.pil * 2 + s.bay;
    const x0 = Math.round(T * 0.56) + Math.floor(r() * 6);
    facade(P, r, x0, W, T, s, t, gl);
    // A drainpipe down the right-hand pilaster's outer edge, bracketed every 32 rows.
    const px = x0 + W + 2;
    P.rect(px, 0, 3, T, pipe[0]);
    P.rect(px, 0, 1, T, pipe[1]);
    for (let y = 14; y < T; y += 32) { P.rect(px - 2, y, 7, 2, pipe[2]); P.rect(px - 1, y + 2, 5, 1, pipe[0]); }
    P.flush(g, pal.list);
  },
};
