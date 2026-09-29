// ABYSS: the void -- a nearly empty dark field, sparse dim squares and tiny plus marks.
//
// The board (assets/backgrounds-reference.webp, zone 8) asks for structure you can barely
// see: a dark field, a scatter of dark-purple squares floating in it, and tiny plus
// shapes. The old painter filled the tile with overlapping mid-purple blocks and bright
// dots, which is busy -- the one zone whose whole point is emptiness was one of the
// noisiest backgrounds in the game.
//
// So this is mostly nothing. Each layer is a handful of marks on the zone's own sky:
//   FAR   a faint lattice -- tiny squares and specks on a jittered 32-pixel grid, the
//         "structure", a shade off the sky so it is felt more than seen.
//   MID   small floating squares, bevelled (lit top-left, dark bottom-right) so they read
//         as blocks at a distance, and tiny three-pixel pluses.
//   NEAR  a few bigger squares, some of them VOIDS -- an empty frame with the sky in it
//         -- and the largest pluses, the only marks allowed to glow, and no brighter
//         than the old painter's brightest dot.
// Marks keep a minimum distance from each other (measured across the wrap), so the scatter
// is even rather than clumped. Everything is drawn through rectW and dotW, so a mark
// across an edge continues from the opposite one: the tile wraps by construction.
//
// On a tools/shot.mjs frame at floor 1400 the play area's mean luma is 25 against the old
// painter's 26 -- darker, and quieter by far; the brightest glint core (luma 90) matches
// the old brightest dot.

import { mix, rectW, dotW } from './util.js';

// The board's plus marks are a cold lavender, bluer than the theme's violet.
const LAVENDER = '#7a74b0';

/** Wrapped distance on the tile, the longer of the two axes (squares, not circles). */
function gap(a, b, T) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return Math.max(Math.min(dx, T - dx), Math.min(dy, T - dy));
}

/** Up to n points, each at least minD (plus both sizes) from every point already taken. */
function scatter(rr, T, n, minD, taken, size) {
  const out = [];
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const p = { x: Math.floor(rr() * T), y: Math.floor(rr() * T), s: size(rr) };
    if (taken.some((q) => gap(p, q, T) < minD + (p.s + q.s) / 2)) continue;
    taken.push(p);
    out.push(p);
  }
  return out;
}

/** A floating square: a fill, lit top and left edges, shadowed bottom and right. */
function block(g, T, x, y, s, fill, lit, dark) {
  g.fillStyle = fill; rectW(g, x, y, s, s, T);
  g.fillStyle = lit; rectW(g, x, y, s - 1, 1, T); rectW(g, x, y + 1, 1, s - 2, T);
  g.fillStyle = dark; rectW(g, x + 1, y + s - 1, s - 1, 1, T); rectW(g, x + s - 1, y, 1, s - 1, T);
}

/** A plus: arms of `arm` pixels each side, fading outward through `tones`, then a core. */
function plus(g, T, x, y, arm, tones, core) {
  for (let a = arm; a >= 1; a--) {
    g.fillStyle = tones[Math.min(tones.length - 1, a - 1)];
    dotW(g, x - a, y, T); dotW(g, x + a, y, T);
    dotW(g, x, y - a, T); dotW(g, x, y + a, T);
  }
  g.fillStyle = core;
  dotW(g, x, y, T);
}

export default {
  // A lattice felt more than seen: one mark or none per 32-pixel cell.
  far(g, T, th, r) {
    const [s0, s1] = th.sky;
    const sq = mix(s1, th.bgFar, 0.55), speck = mix(th.bgFar, LAVENDER, 0.18);
    const C = 32;
    for (let j = 0; j < T / C; j++) {
      for (let i = 0; i < T / C; i++) {
        const x = i * C + 6 + Math.floor(r() * (C - 12));
        const y = j * C + 6 + Math.floor(r() * (C - 12));
        const roll = r();
        if (roll < 0.42) {
          const s = 2 + Math.floor(r() * 3);
          g.fillStyle = sq; rectW(g, x, y, s, s, T);
        } else if (roll < 0.6) {
          g.fillStyle = speck; dotW(g, x, y, T);
        } else if (roll < 0.68) {
          g.fillStyle = mix(s0, sq, 0.6); rectW(g, x - 1, y, 3, 1, T); rectW(g, x, y - 1, 1, 3, T);
        }
      }
    }
  },
  // Small floating squares and tiny pluses.
  mid(g, T, th, r) {
    const f = th.bgFar, n = th.bgNear, s0 = th.sky[0];
    const taken = [];
    for (const p of scatter(r, T, 9, 22, taken, (q) => 5 + Math.floor(q() * 6))) {
      block(g, T, p.x, p.y, p.s, mix(f, n, 0.15), mix(f, n, 0.7), mix(s0, f, 0.4));
    }
    const arm = mix(f, LAVENDER, 0.22), core = mix(n, LAVENDER, 0.4);
    for (const p of scatter(r, T, 14, 18, taken, () => 3)) plus(g, T, p.x, p.y, 1, [arm], core);
  },
  // A few bigger squares -- some of them empty frames -- and the largest, faintly glowing
  // pluses.
  near(g, T, th, r) {
    const f = th.bgFar, n = th.bgNear, [s0] = th.sky;
    const taken = [];
    const blocks = scatter(r, T, 5, 34, taken, (q) => 12 + Math.floor(q() * 9));
    blocks.forEach((p, k) => {
      if (k % 2) {
        // A void: an empty frame, the sky showing through it, its rim lit the other way
        // round from a block's -- shadowed top-left, catching light bottom-right -- so it
        // reads as an opening rather than a thing. It was a filled hole darker than the
        // sky, and against the sky's lighter foot it read as a black square punched
        // through the screen; one sat against a ledge's end and the ledge seemed to stop
        // early, the crypt's old lesson again.
        const s = p.s;
        g.fillStyle = mix(s0, f, 0.5);
        rectW(g, p.x, p.y, s - 1, 1, T); rectW(g, p.x, p.y + 1, 1, s - 2, T);
        g.fillStyle = mix(f, n, 0.6);
        rectW(g, p.x + 1, p.y + s - 1, s - 1, 1, T); rectW(g, p.x + s - 1, p.y, 1, s - 1, T);
      } else {
        block(g, T, p.x, p.y, p.s, mix(f, n, 0.35), mix(n, LAVENDER, 0.18), mix(s0, f, 0.5));
      }
    });
    const tones = [mix(n, LAVENDER, 0.35), mix(f, LAVENDER, 0.2), mix(f, n, 0.5)];
    for (const p of scatter(r, T, 7, 26, taken, () => 5)) {
      plus(g, T, p.x, p.y, 2, tones, mix(n, LAVENDER, 0.6));
    }
    // Two or three glints with longer arms: the brightest thing in the zone, and no
    // brighter than the old painter's brightest dot.
    for (const p of scatter(r, T, 3, 40, taken, () => 7)) {
      plus(g, T, p.x, p.y, 3, tones, mix(n, mix(th.accent, LAVENDER, 0.5), 0.6));
    }
  },
};
