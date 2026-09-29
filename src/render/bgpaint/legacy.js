// The ORIGINAL background painters: one procedural tile per style, 128 units square,
// painted in a single colour and drawn twice (far and near) at 50% and 80% opacity.
//
// Every zone's three-layer painter in this folder started as legacyZone() below, which
// reproduces exactly what the game drew before backgrounds had three layers -- so the
// change of structure changed nothing on screen until a zone was repainted. All twelve
// have been, and no zone calls legacyZone() any more. What still uses this file is
// tools/background-template.mjs, which draws the old tiles faintly in its cells for
// scale, through the re-exports in backdrop.js. tools/shot-backdrops.mjs used to show
// them for comparison as well; it draws only what the game draws now.

import { mulberry32 } from '../../core/rng.js';

// Exported, with the painters below, so a reference sheet can build the real tiles --
// tools/background-template.mjs does, through backdrop.js. A reference sheet made from a
// second copy of the drawing code is one that can disagree with the game.
export const TILE = 128;

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) * k), g = cl(((n >> 8) & 255) * k), b = cl((n & 255) * k);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
};

// --- tile painters ----------------------------------------------------------
export const PAINTERS = {
  // The DUNGEON is a catacomb: ashlar courses with a grid of loculi -- burial niches --
  // each with a slab lying in it. Drawn by its LIT lintel and jamb rather than as a dark
  // opening, because a dark opening reads as a hole punched in the world and ledge ends
  // dissolve into it.
  crypt(g, c, r) {
    const T = 128;
    for (let y = 0; y < T; y += 16) {
      const off = ((y / 16) % 2) ? 16 : 0;
      for (let x = -32; x < T; x += 32) {
        g.fillStyle = shade(c, 0.90 + r() * 0.20);
        g.fillRect(x + off + 1, y + 1, 30, 14);
      }
    }
    for (let gy = 0; gy < T; gy += 64) {
      for (let gx = 0; gx < T; gx += 42) {
        const nx = gx + 8, ny = gy + 18, nw = 22, nh = 26;
        g.fillStyle = shade(c, 1.42);
        g.fillRect(nx - 2, ny - 2, nw + 4, 2);
        g.fillRect(nx - 2, ny, 2, nh);
        g.fillStyle = shade(c, 0.76);
        g.fillRect(nx, ny, nw, nh);
        g.fillStyle = shade(c, 0.90);
        g.fillRect(nx + 3, ny + nh - 9, nw - 6, 6);
        g.fillStyle = shade(c, 0.55);
        g.fillRect(nx + 3, ny + nh - 10, nw - 6, 1);
      }
    }
    },
  bricks(g, c, r) {
    const bw = 32, bh = 16;
    for (let y = 0; y < TILE; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < TILE; x += bw) {
        g.fillStyle = shade(c, 0.86 + r() * 0.3);
        g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
  },
  blocks(g, c, r) {
    for (let y = 0; y < TILE; y += 32) {
      for (let x = 0; x < TILE; x += 32) {
        g.fillStyle = shade(c, 0.8 + r() * 0.45);
        g.fillRect(x + 2, y + 2, 28, 28);
        if (r() < 0.2) { g.fillStyle = shade(c, 1.5); g.fillRect(x + 12, y + 12, 6, 6); }
      }
    }
  },
  trees(g, c, r) {
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(r() * TILE), w = 8 + Math.floor(r() * 10);
      g.fillStyle = shade(c, 0.7 + r() * 0.3);
      g.fillRect(x, 0, w, TILE);
      g.fillStyle = shade(c, 1.25);
      for (let k = 0; k < 4; k++) g.fillRect(x - 4, Math.floor(r() * TILE), w + 8, 6);
    }
  },
  drips(g, c, r) {
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * TILE), y = Math.floor(r() * TILE), h = 6 + Math.floor(r() * 26);
      g.fillStyle = shade(c, 0.75 + r() * 0.5);
      g.fillRect(x, y, 3, h);
      g.fillRect(x - 1, y + h, 5, 4);
    }
  },
  windows(g, c, r) {
    for (let y = 8; y < TILE; y += 40) {
      for (let x = 8; x < TILE; x += 32) {
        g.fillStyle = shade(c, 0.7);
        g.fillRect(x, y, 18, 26);
        g.fillStyle = r() < 0.45 ? shade(c, 2.1) : shade(c, 0.5);
        g.fillRect(x + 3, y + 3, 12, 20);
      }
    }
  },
  arches(g, c, r) {
    for (let x = 0; x < TILE; x += 42) {
      g.fillStyle = shade(c, 0.78 + r() * 0.2);
      g.fillRect(x + 6, 0, 30, TILE);
      g.fillStyle = shade(c, 1.35);
      g.fillRect(x + 12, 14, 18, 4);
      g.fillRect(x + 10, 18, 22, 44);
      g.fillStyle = shade(c, 0.55);
      g.fillRect(x + 14, 22, 14, 38);
    }
  },
  clouds(g, c, r) {
    for (let i = 0; i < 9; i++) {
      const x = r() * TILE, y = r() * TILE, w = 22 + r() * 44;
      g.fillStyle = shade(c, 0.85 + r() * 0.5);
      g.fillRect(x, y, w, 9);
      g.fillRect(x + 8, y - 6, w * 0.6, 8);
      g.fillRect(x + 4, y + 8, w * 0.8, 5);
    }
  },
  voids(g, c, r) {
    for (let i = 0; i < 14; i++) {
      const x = r() * TILE, y = r() * TILE, s = 5 + r() * 18;
      g.fillStyle = shade(c, 0.6 + r() * 0.7);
      g.fillRect(x, y, s, s);
      if (r() < 0.35) { g.fillStyle = shade(c, 2.4); g.fillRect(x + s * 0.3, y + s * 0.35, 3, 3); }
    }
  },
  swirls(g, c, r) {
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, rad = r() * 60;
      const x = TILE / 2 + Math.cos(a) * rad, y = TILE / 2 + Math.sin(a) * rad;
      g.fillStyle = shade(c, 0.6 + (1 - rad / 60) * 1.4);
      g.fillRect(x, y, 2 + Math.floor(r() * 4), 2 + Math.floor(r() * 4));
    }
  },
  stars(g, c, r) {
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(r() * TILE), y = Math.floor(r() * TILE), s = r() < 0.15 ? 2 : 1;
      g.fillStyle = shade(c, 0.9 + r() * 1.6);
      g.fillRect(x, y, s, s);
      if (s === 2) { g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 2, y, 1, 1); }
    }
  },
  beams(g, c, r) {
    for (let i = 0; i < 7; i++) {
      const x = r() * TILE, w = 4 + r() * 16;
      g.fillStyle = shade(c, 1.05 + r() * 0.4);
      g.fillRect(x, 0, w, TILE);
    }
  },
};

export const STYLE_BY_THEME = [
  'bricks', 'crypt', 'trees', 'drips', 'windows', 'arches',
  'clouds', 'voids', 'swirls', 'stars', 'stars', 'beams',
];

export function makeTile(style, colour, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  (PAINTERS[style] || PAINTERS.blocks)(g, colour, r);
  return c;
}

/**
 * A zone's three layers as the game drew them before there were three: the old painter
 * in the far colour at 50% for FAR, nothing for MID, the same painter in the near colour
 * at 80% for NEAR -- scaled from its 128-pixel tile to the 256-pixel layer tile, which is
 * the same 128 units on screen, so nothing moves.
 */
export function legacyZone(style) {
  const paint = (g, T, colour, seed, alpha) => {
    const t = makeTile(style, colour, seed);
    g.globalAlpha = alpha;
    g.imageSmoothingEnabled = false;
    g.drawImage(t, 0, 0, t.width, t.height, 0, 0, T, T);
    g.globalAlpha = 1;
  };
  return {
    far(g, T, th, r, i) { paint(g, T, th.bgFar, 0x51ed + i * 7919, 0.5); },
    mid() {},
    near(g, T, th, r, i) { paint(g, T, th.bgNear, 0x9e37 + i * 104729, 0.8); },
    // Marks a zone still on the old painters. Those were never written to wrap, so
    // tools/test-backgrounds.mjs only REPORTS their seams; a repainted zone must wrap.
    legacy: true,
  };
}
