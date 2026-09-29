// Helpers for background painters. The one that matters is WRAPPING.
//
// A layer tile is repeated across the screen and up the tower forever, so anything drawn
// across one edge must continue from the opposite edge. Drawing through these instead of
// straight onto the context makes that true by construction: a shape that crosses the
// right edge is drawn again, shifted left by T, and the same for every edge and corner.

/** Scale a #rrggbb colour's channels by k (k > 1 lightens, k < 1 darkens). */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + (
    (cl(((n >> 16) & 255) * k) << 16) | (cl(((n >> 8) & 255) * k) << 8) | cl((n & 255) * k)
  ).toString(16).padStart(6, '0');
}

/** Mix two #rrggbb colours, t = 0 is a, t = 1 is b. */
export function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const ch = (n, s) => (n >> s) & 255;
  const m = (s) => Math.max(0, Math.min(255, Math.round(ch(na, s) + (ch(nb, s) - ch(na, s)) * t)));
  return '#' + ((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0');
}

/** fillRect that wraps on a T x T tile: whatever crosses an edge reappears opposite. */
export function rectW(g, x, y, w, h, T) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w <= 0 || h <= 0) return;
  const x0 = ((x % T) + T) % T, y0 = ((y % T) + T) % T;
  for (const ox of [0, -T]) {
    for (const oy of [0, -T]) {
      const rx = x0 + ox, ry = y0 + oy;
      if (rx + w <= 0 || ry + h <= 0 || rx >= T || ry >= T) continue;
      g.fillRect(rx, ry, w, h);
    }
  }
}

/** One pixel, wrapped. */
export function dotW(g, x, y, T) { rectW(g, x, y, 1, 1, T); }

/**
 * Smooth tileable value noise, 0..1, with a period of `cells` across the tile. Built from
 * a seeded lattice that wraps, so the noise itself tiles -- use it for clouds, gas, moss,
 * anything soft. Returns a function (x, y) of tile pixel coordinates.
 */
export function wrapNoise(r, cells, T) {
  const L = [];
  for (let i = 0; i < cells * cells; i++) L.push(r());
  const at = (i, j) => L[((j % cells) + cells) % cells * cells + ((i % cells) + cells) % cells];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / T) * cells, fy = (y / T) * cells;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = sm(fx - i), ty = sm(fy - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return a + (b - a) * ty;
  };
}
