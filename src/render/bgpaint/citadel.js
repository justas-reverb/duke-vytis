// CITADEL: the great hall, from the board -- "tall repeating blue stone arches / niche
// windows, monumental interior", far arches and near arches, in blue stone.
//
//   FAR   the hall's far wall, the whole tile: two storeys of small blind arches between
//         pilasters, a moulded band over each storey, and here and there a lit window at
//         the back of a niche. Lowest contrast.
//   MID   the board's near arches: an arcade two bays to a tile and one storey tall, the
//         arches OPEN -- transparent -- so the far wall is seen through them, with the
//         shadow the arcade throws on it. Columns with capitals and bases, a ring of
//         voussoirs round each arch, a dentilled entablature over the storey.
//   NEAR  one giant compound pier per tile: a core with a shaft on its face and a half
//         shaft each side, bound by shaft rings, full height, shadowing what is behind it.
//
// A whole arcade has a top and a bottom, and a tile repeats upward forever, so every
// storey here is one repeat: the entablature over one storey is the top of the arches of
// the next. The pier runs the full height with its rings at a fixed pitch, as a real
// compound pier does. Light from the upper left. No moulding is lit along its length --
// the bands are the darkest thing in their layer -- because a long lit horizontal edge is
// a ledge to the eye, and the ledges here are white.
//
// The palette is the theme's blues pulled toward the board's navy. The board's hall is
// far darker than the old painted one (mean luma 28 against 75) and the old one was the
// brightest backdrop behind the whitest ledges in the game, so this comes down to between
// the two, 48: still blue stone, no longer a lit sky with shapes on it. The lit window panes
// are the theme's own FAR colour, the one light thing, and small.

import { shade, mix, rectW, dotW } from './util.js';

const NAVY = '#1b2443';    // the board's stone
const VOID = '#050c22';    // the board's deepest arch shadow

/** Half-width of a round arch of radius R, dy rows below its crown (0 <= dy < R). */
function archHW(R, dy) {
  const yy = R - dy - 0.5;
  return Math.round(Math.sqrt(Math.max(0, R * R - yy * yy)));
}

/** fillRect of one row from x0 to x1, wrapped. */
const span = (g, T, x0, x1, y) => rectW(g, x0, y, x1 - x0, 1, T);

export default {
  far(g, T, th, r) {
    const wall = mix(th.bgNear, NAVY, 0.62);
    const joint = shade(wall, 0.88);
    const pil = shade(wall, 1.1), pilHi = shade(wall, 1.2), pilLo = shade(wall, 0.82);
    const ring = shade(wall, 1.08), ringLo = shade(wall, 0.84);
    const deep = mix(wall, VOID, 0.5), deeper = mix(wall, VOID, 0.72);
    const band = shade(wall, 0.9), bandLo = shade(wall, 0.72);
    const pane = th.bgFar, paneHi = mix(th.bgFar, th.sky[0], 0.8);
    g.fillStyle = wall;
    g.fillRect(0, 0, T, T);
    // Ashlar: a joint every 8 rows, the vertical joints staggered.
    g.fillStyle = joint;
    for (let j = 0; j < T / 8; j++) {
      const y = 3 + j * 8;
      rectW(g, 0, y, T, 1, T);
      for (let x = 5 + (j % 2) * 8; x < T + 5; x += 16) rectW(g, x, y + 1, 1, 7, T);
    }
    // Two storeys of four bays, niches centred on x = 0, 64, 128 and 192. The layers
    // never move sideways, so that puts the niche at 128 in the middle of the MID arch
    // in front of it, framed by it, with a pilaster either side; the niches at 64 and 192
    // stand behind the arcade's columns and the one at 0 behind the pier. Storeys start
    // 60 down, so the tile's top and bottom rows fall mid-niche and agree, as its first and
    // last columns do either side of a niche's centre line.
    const OY = 60, R = 17;
    // The lit window: in the framed niche, one storey in two.
    const lit = new Set([2]);
    for (let s = 0; s < 2; s++) {
      const sy = OY + 128 * s;
      const crown = sy + 22, spring = crown + R, bottom = sy + 121;
      for (let k = 0; k < 4; k++) {
        const nx = 64 * k, px = nx + 32;
        // The arch ring round the niche head, then the niche, its upper-left inside in
        // shadow and a lit edge down its right.
        g.fillStyle = ring;
        for (let dy = 0; dy < R + 3; dy++) {
          const h = archHW(R + 3, dy);
          span(g, T, nx - h, nx + h, crown - 3 + dy);
        }
        g.fillStyle = ringLo;
        span(g, T, nx - 1, nx + 1, crown - 3);
        g.fillStyle = deeper;
        for (let dy = 0; dy < R; dy++) {
          const h = archHW(R, dy);
          span(g, T, nx - h, nx + h, crown + dy);
        }
        rectW(g, nx - R, spring, 2 * R, bottom - spring, T);
        g.fillStyle = deep;
        for (let dy = 3; dy < R; dy++) {
          const h = archHW(R, dy);
          span(g, T, nx - h + 3, nx + h, crown + dy);
        }
        rectW(g, nx - R + 3, spring, 2 * R - 3, bottom - spring, T);
        g.fillStyle = ring;
        rectW(g, nx + R - 1, spring, 1, bottom - spring, T);
        // A window at the back of every niche, one of them lit.
        const wy = sy + 42;
        g.fillStyle = deeper;
        rectW(g, nx - 6, wy - 1, 12, 24, T);
        if (lit.has(s * 4 + k)) {
          g.fillStyle = pane;
          for (const [ox, oy] of [[-5, 0], [1, 0], [-5, 11], [1, 11]]) rectW(g, nx + ox, wy + oy, 4, 10, T);
          g.fillStyle = paneHi;
          rectW(g, nx - 5, wy, 1, 3, T);
          rectW(g, nx + 1, wy, 1, 3, T);
        } else {
          g.fillStyle = deep;
          for (const [ox, oy] of [[-5, 0], [1, 0], [-5, 11], [1, 11]]) rectW(g, nx + ox, wy + oy, 4, 10, T);
        }
        // The pilaster between this bay and the next, with its capital and base.
        g.fillStyle = pil;
        rectW(g, px - 5, sy + 8, 10, 120, T);
        g.fillStyle = pilHi;
        rectW(g, px - 5, sy + 8, 1, 120, T);
        g.fillStyle = pilLo;
        rectW(g, px + 4, sy + 8, 1, 120, T);
        g.fillStyle = pil;
        rectW(g, px - 7, spring - 3, 14, 3, T);
        rectW(g, px - 7, sy + 124, 14, 4, T);
        g.fillStyle = pilLo;
        rectW(g, px - 7, spring, 14, 1, T);
        rectW(g, px + 6, sy + 124, 1, 4, T);
      }
      // The band over the storey, dentilled, a shadow under it and no lit edge on top.
      g.fillStyle = band;
      rectW(g, 0, sy, T, 8, T);
      g.fillStyle = bandLo;
      rectW(g, 0, sy + 8, T, 1, T);
      for (let x = 2; x < T; x += 8) rectW(g, x, sy + 3, 4, 3, T);
    }
  },

  mid(g, T, th, r) {
    const wall = mix(th.bgNear, NAVY, 0.45);
    const joint = shade(wall, 0.85);
    const ring = shade(wall, 1.1), ringLo = shade(wall, 0.72), key = shade(wall, 1.2);
    const face = shade(wall, 1.04), hi = mix(wall, th.bgFar, 0.55), lo = shade(wall, 0.72);
    const dark = mix(wall, VOID, 0.55);
    const band = shade(wall, 0.86), bandLo = shade(wall, 0.62);

    // One storey per tile, 40 down. Two arches 108 wide, centred on 0 and 128, so the
    // tile's edges fall in an opening; between them, 20-wide columns at 64 and 192.
    const OY = 40, R = 54, CROWN = 34, SPRING = CROWN + R;
    const N = [0, 128], C = [64, 192];
    const hwAt = (rel) => (rel < CROWN ? -1 : rel < SPRING ? archHW(R, rel - CROWN) : R);

    // Solid where no opening is.
    const mask = new Uint8Array(T * T);
    for (let rel = 0; rel < T; rel++) {
      const y = (OY + rel) % T, hw = hwAt(rel);
      for (let x = 0; x < T; x++) {
        let open = false;
        for (const n of N) {
          const d = ((x - n) % T + T + T / 2) % T - T / 2;   // signed distance, wrapped
          if (d >= -hw && d < hw) open = true;
        }
        if (!open) mask[y * T + x] = 1;
      }
    }
    const at = (x, y) => mask[((y + T) % T) * T + ((x + T) % T)];

    // The shadow the arcade throws on the far wall through its own arches.
    g.fillStyle = 'rgba(3,7,20,0.45)';
    for (let y = 0; y < T; y++) {
      let run = -1;
      for (let x = 0; x <= T; x++) {
        let s = false;
        if (x < T && !mask[y * T + x]) {
          for (let dy = 0; dy <= 7 && !s; dy++) for (let dx = 0; dx <= 5 && !s; dx++) {
            if ((dx || dy) && at(x - dx, y - dy)) s = true;
          }
        }
        if (s && run < 0) run = x;
        if (!s && run >= 0) { g.fillRect(run, y, x - run, 1); run = -1; }
      }
    }

    // The wall, as runs of solid.
    g.fillStyle = wall;
    for (let y = 0; y < T; y++) {
      let run = -1;
      for (let x = 0; x <= T; x++) {
        const s = x < T && mask[y * T + x];
        if (s && run < 0) run = x;
        if (!s && run >= 0) { g.fillRect(run, y, x - run, 1); run = -1; }
      }
    }
    // Ashlar joints in the spandrels, every 10 rows, the vertical joints staggered.
    g.fillStyle = joint;
    for (let rel = 20, j = 0; rel < SPRING; rel += 10, j++) {
      const y = OY + rel;
      for (let x = 0; x < T; x++) if (at(x, y % T)) dotW(g, x, y, T);
      for (let x = 7 + (j % 2) * 12; x < T; x += 24) {
        if (at(x, (y + 5) % T)) rectW(g, x, y + 1, 1, 9, T);
      }
    }

    for (const n of N) {
      // The ring of voussoirs, 7 thick, with its keystone.
      g.fillStyle = ring;
      for (let rel = CROWN - 7; rel < SPRING; rel++) {
        const ho = archHW(R + 7, rel - (CROWN - 7));
        const hi2 = rel < CROWN ? 0 : archHW(R, rel - CROWN);
        span(g, T, n - ho, n - hi2, OY + rel);
        span(g, T, n + hi2, n + ho, OY + rel);
      }
      g.fillStyle = ringLo;
      for (let a = 1; a < 12; a++) {
        if (a === 6) continue;
        const t = (a / 12) * Math.PI;
        for (let q = R + 1; q < R + 7; q++) {
          dotW(g, Math.round(n - Math.cos(t) * q), Math.round(OY + SPRING - Math.sin(t) * q), T);
        }
      }
      for (let rel = CROWN; rel < SPRING; rel++) {
        const h = archHW(R, rel - CROWN);
        dotW(g, n - h, OY + rel, T);
        dotW(g, n + h - 1, OY + rel, T);
      }
      g.fillStyle = key;
      rectW(g, n - 4, OY + CROWN - 9, 8, 11, T);
      g.fillStyle = ringLo;
      rectW(g, n + 3, OY + CROWN - 8, 1, 10, T);
    }

    // The columns: the solid between two arches below their springing, drawn round.
    const PROFILE = [dark, lo, hi, hi, hi, face, face, face, face, face, face, face, face, face, face, lo, lo, lo, dark, dark];
    for (const c of C) {
      for (let i = 0; i < 20; i++) {
        g.fillStyle = PROFILE[i];
        rectW(g, c - 10 + i, OY + SPRING + 8, 1, T - SPRING - 20, T);
      }
      // Capital: abacus over a narrower echinus.
      g.fillStyle = face;
      rectW(g, c - 16, OY + SPRING - 2, 32, 4, T);
      rectW(g, c - 13, OY + SPRING + 2, 26, 6, T);
      g.fillStyle = hi;
      rectW(g, c - 16, OY + SPRING - 2, 3, 4, T);
      rectW(g, c - 13, OY + SPRING + 2, 3, 5, T);
      g.fillStyle = lo;
      rectW(g, c - 16, OY + SPRING + 1, 32, 1, T);
      rectW(g, c - 13, OY + SPRING + 7, 26, 1, T);
      rectW(g, c + 12, OY + SPRING + 2, 1, 6, T);
      // Base: a torus on a plinth, standing on the entablature of the storey below.
      g.fillStyle = face;
      rectW(g, c - 13, OY + T - 12, 26, 4, T);
      rectW(g, c - 15, OY + T - 8, 30, 8, T);
      g.fillStyle = hi;
      rectW(g, c - 13, OY + T - 12, 3, 4, T);
      rectW(g, c - 15, OY + T - 8, 3, 8, T);
      g.fillStyle = lo;
      rectW(g, c - 13, OY + T - 9, 26, 1, T);
      rectW(g, c + 12, OY + T - 8, 3, 8, T);
    }

    // The entablature over the storey: the darkest thing in the layer, dentils, and a
    // shadow under it; no lit top edge.
    g.fillStyle = band;
    rectW(g, 0, OY, T, 14, T);
    g.fillStyle = bandLo;
    rectW(g, 0, OY + 14, T, 2, T);
    rectW(g, 0, OY + 4, T, 1, T);
    for (let x = 2; x < T; x += 8) rectW(g, x, OY + 7, 4, 4, T);
  },

  near(g, T, th, r) {
    const face = mix(th.bgNear, NAVY, 0.3);
    const hi = mix(face, th.bgFar, 0.6), mid = mix(face, th.bgFar, 0.3);
    const lo = shade(face, 0.7), dark = mix(face, VOID, 0.6);
    const joint = shade(face, 0.8);

    // Centred on the tile's edge (x = 0), so every shading profile is laid out to be the
    // same colour either side of it.
    // Its shadow on the layers behind, to the right, first.
    g.fillStyle = 'rgba(3,7,20,0.45)';
    rectW(g, 30, 0, 12, T, T);

    // The core, 44 wide, ashlar coursed every 32.
    g.fillStyle = face;
    rectW(g, -22, 0, 44, T, T);
    g.fillStyle = joint;
    for (let j = 0; j < 8; j++) {
      const y = 16 + j * 32;
      rectW(g, -22, y, 44, 1, T);
      rectW(g, j % 2 ? 14 : -15, y + 1, 1, 31, T);
    }
    // A shaft on its face, 16 wide, and a half shaft each side, 8 wide, shaded round.
    const shaft = (x0, prof) => prof.forEach((c, i) => { g.fillStyle = c; rectW(g, x0 + i, 0, 1, T, T); });
    shaft(-8, [dark, mid, hi, hi, hi, mid, face, face, face, face, face, face, mid, lo, lo, dark]);
    shaft(-30, [dark, mid, hi, hi, face, face, lo, dark]);
    shaft(22, [dark, mid, face, face, mid, lo, lo, dark]);
    // Shaft rings every half tile, binding all three: 6 tall, 2 proud of the shafts.
    for (const y of [60, 188]) {
      g.fillStyle = face;
      rectW(g, -32, y, 64, 6, T);
      g.fillStyle = mid;
      rectW(g, -32, y, 6, 3, T);
      g.fillStyle = hi;
      rectW(g, -32, y + 1, 3, 2, T);
      g.fillStyle = lo;
      rectW(g, -32, y + 4, 64, 2, T);
      rectW(g, 30, y, 2, 6, T);
      g.fillStyle = dark;
      rectW(g, -30, y + 6, 60, 1, T);
    }
  },
};
