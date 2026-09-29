// The pixel kit for furniture painters.
//
// An element's paint(p, variant, frame, th) draws into `p`, a Pix: an RGBA buffer exactly
// the size of the element's box, in ART pixels, with y pointing DOWN and (0, 0) at the
// top-left -- the way an artist's PNG of it would be laid out, and NOT the way the world
// is (world y points up). The runtime turns the Pix into a canvas once, caches it, and
// puts it on the screen with one drawImage, one art pixel to one backing-store pixel at
// zoom 1. So there is no scale to get wrong in here: a pixel is a pixel.
//
// Why a buffer and not a canvas: the only canvas every tool here can trust is the headless
// one (tools/headless.mjs), which implements fillRect and drawImage exactly and paths only
// approximately, and has no putImageData at all -- a painter built on arcs, strokes or
// image data would look one way in the game and another in every screenshot that is meant
// to prove it. Everything below writes pixels, and pixToCanvas() gets them onto a canvas
// as fillRect runs, which both canvases draw identically.
//
// Colours are '#rrggbb' (or '#rgb', '#rrggbbaa', or an [r, g, b, a] array, 0..255), and
// most calls take an alpha 0..1 after the colour. Writes outside the box are dropped and
// COUNTED in p.spill, which tools/test-decor.mjs requires to be zero: a box is the whole
// of an element's room, and anything drawn past its edge would simply be cut off.

import { Rng } from '../../core/rng.js';
import { PX } from '../../game/constants.js';

const parsed = new Map();

/** A colour as [r, g, b, a], each 0..255. Unparseable is loud magenta, not black. */
export function rgba(c) {
  if (Array.isArray(c)) return [c[0], c[1], c[2], c[3] === undefined ? 255 : c[3]];
  let v = parsed.get(c);
  if (v) return v;
  const h = typeof c === 'string' && c[0] === '#' ? c.slice(1) : '';
  if (h.length === 3) v = [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)).concat(255);
  else if (h.length === 6) v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(255);
  else if (h.length === 8) v = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (!v || v.some((n) => Number.isNaN(n))) v = [255, 0, 255, 255];
  parsed.set(c, v);
  return v;
}

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

/**
 * A seeded random stream for a painter, from any mix of strings and numbers -- say
 * rng('TREE', variant) -- so a variant is the same drawing every time it is built. An
 * Rng from core/rng.js: next(), float(lo, hi), int(lo, hi) inclusive, pick(arr),
 * chance(p). Never Math.random(): the sprite is rebuilt whenever the cache is cold, and
 * a tree that came out different each time would be a different tree after every load.
 */
export function rng(...keys) {
  let h = 2166136261;
  for (const ch of keys.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return new Rng(h >>> 0);
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.spill = 0;
  }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  /** [r, g, b, a] at (x, y), or null outside the box. */
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return null;
    const i = (y * this.w + x) * 4, d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  /** Alpha 0..255 at (x, y); 0 outside. */
  alpha(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0;
  }

  /** REPLACE one pixel. a < 1 leaves a translucent pixel, not a blend with what was there. */
  set(x, y, col, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) { this.spill++; return; }
    const c = rgba(col), i = (y * this.w + x) * 4, d = this.data;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.round(c[3] * a);
  }

  /** Make one pixel transparent again. */
  clear(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return;
    this.data.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
  }

  /**
   * Paint OVER one pixel, source-over, as a canvas would: a translucent strand across an
   * opaque leaf tints it, across nothing it stays translucent.
   */
  blend(x, y, col, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) { this.spill++; return; }
    const c = rgba(col), i = (y * this.w + x) * 4, d = this.data;
    const sa = (c[3] / 255) * a;
    if (sa <= 0) return;
    const da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    const k = da * (1 - sa);
    d[i] = Math.round((c[0] * sa + d[i] * k) / oa);
    d[i + 1] = Math.round((c[1] * sa + d[i + 1] * k) / oa);
    d[i + 2] = Math.round((c[2] * sa + d[i + 2] * k) / oa);
    d[i + 3] = Math.round(oa * 255);
  }

  /** A filled rectangle, w x h pixels from its top-left (x, y). */
  rect(x, y, w, h, col, a = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col, a);
  }

  /** A row from x0 to x1 inclusive, either way round. */
  hline(x0, x1, y, col, a = 1) {
    const [l, r] = x0 <= x1 ? [x0, x1] : [x1, x0];
    for (let x = l; x <= r; x++) this.set(x, y, col, a);
  }

  /** A column from y0 to y1 inclusive, either way round. */
  vline(x, y0, y1, col, a = 1) {
    const [t, b] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = t; y <= b; y++) this.set(x, y, col, a);
  }

  /** Bresenham, both ends included: the one-pixel line pixel art is drawn with. */
  line(x0, y0, x1, y1, col, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, col, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /**
   * A filled disc of radius r about the pixel (cx, cy). The + 0.8r is what makes small
   * discs round: a plain r*r test gives radius 2 as a diamond with a one-pixel spike at
   * each point. Radius 1 is a plus either way, which is the right 3x3 dot.
   */
  disc(cx, cy, r, col, a = 1) {
    const lim = r * r + 0.8 * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) if (x * x + y * y <= lim) this.set(cx + x, cy + y, col, a);
    }
  }

  /** A filled ellipse with radii rx, ry about the pixel (cx, cy). */
  ellipse(cx, cy, rx, ry, col, a = 1) {
    const kx = rx + 0.4, ky = ry + 0.4;
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
        if ((x * x) / (kx * kx) + (y * y) / (ky * ky) <= 1) this.set(cx + x, cy + y, col, a);
      }
    }
  }

  /**
   * ASCII art: `rows` top-down, one character per pixel, `pal` mapping a character to a
   * colour -- or to [colour, alpha]. '.' and ' ' are transparent (nothing is written). A
   * character missing from the palette paints magenta, so a typo is impossible to miss.
   * Drawn with its top-left at (x, y). This is how the crypt was authored before (see
   * legacy.js): shapes stay editable as text rather than as coordinates.
   */
  ascii(rows, pal, x = 0, y = 0) {
    for (let j = 0; j < rows.length; j++) {
      const s = rows[j];
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '.' || ch === ' ') continue;
        const e = pal[ch];
        if (Array.isArray(e) && typeof e[0] === 'string') this.set(x + i, y + j, e[0], e[1]);
        else this.set(x + i, y + j, e === undefined ? '#ff00ff' : e);
      }
    }
  }

  /**
   * A one-pixel outline round everything drawn: every transparent pixel that touches an
   * opaque one (alpha at least `min`) becomes `col`. Four-neighbour by default, which
   * gives the rounded corners the Duke's and the companions' outlines have; diag = true
   * closes the corners too. It only ever adds pixels INSIDE the box, so leave a pixel of
   * margin where the outline must show.
   */
  outline(col = '#140c1c', { diag = false, min = 128, a = 1 } = {}) {
    const hit = [];
    const n = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 0) continue;
        if (n.some(([dx, dy]) => this.alpha(x + dx, y + dy) >= min)) hit.push([x, y]);
      }
    }
    for (const [x, y] of hit) this.set(x, y, col, a);
    return hit.length;
  }

  /** The same drawing mirrored left to right, as a new Pix -- a second variant for free. */
  flipped() {
    const q = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const s = (y * this.w + x) * 4, d = (y * this.w + (this.w - 1 - x)) * 4;
        q.data.set(this.data.subarray(s, s + 4), d);
      }
    }
    return q;
  }

  /** Copy another Pix onto this one at (x, y), source-over. */
  stamp(q, x = 0, y = 0) {
    for (let j = 0; j < q.h; j++) {
      for (let i = 0; i < q.w; i++) {
        const s = (j * q.w + i) * 4;
        if (q.data[s + 3]) this.blend(x + i, y + j, [q.data[s], q.data[s + 1], q.data[s + 2], q.data[s + 3]]);
      }
    }
  }

  /** How many pixels have any alpha at all. */
  count() {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i]) n++;
    return n;
  }
}

const hex2 = (v) => v.toString(16).padStart(2, '0');

/**
 * Draw a Pix onto a 2D context with its top-left at (dx, dy), one fillRect per horizontal
 * run of identical pixels. Translucent pixels go as '#rrggbbaa', which the browser and the
 * headless canvas both parse exactly (an rgba() string loses a step of alpha to rounding
 * in the headless parser). The context should be a FRESH, transparent canvas: the runs
 * are drawn source-over, so anything already there shows through translucent pixels.
 */
export function pixToCanvas(p, g, dx = 0, dy = 0, y0 = 0, y1 = p.h) {
  // Rows y0..y1 only, if asked: the scoreboard puts its pieces on their canvases a few rows
  // a frame (gameoverskin.js), and a whole panel is ten thousand calls.
  const d = p.data;
  g.globalAlpha = 1;
  for (let y = y0; y < y1; y++) {
    let x = 0;
    while (x < p.w) {
      const i = (y * p.w + x) * 4;
      if (!d[i + 3]) { x++; continue; }
      let n = 1;
      while (x + n < p.w) {
        const j = i + n * 4;
        if (d[j] !== d[i] || d[j + 1] !== d[i + 1] || d[j + 2] !== d[i + 2] || d[j + 3] !== d[i + 3]) break;
        n++;
      }
      g.fillStyle = '#' + hex2(d[i]) + hex2(d[i + 1]) + hex2(d[i + 2]) + (d[i + 3] === 255 ? '' : hex2(d[i + 3]));
      g.fillRect(dx + x, dy + y, n, 1);
      x += n;
    }
  }
}

/**
 * Keep a box of width bw inside a ledge wArt wide: scenes return x in [0, wArt - bw].
 * The old painters let a tree or a lantern overhang a ledge's end by a few units; a sprite
 * placed from the same random draw is clamped instead, so nothing hangs off into the air.
 */
export function fit(x, bw, wArt) {
  return Math.max(0, Math.min(Math.floor(wArt) - bw, x));
}

/**
 * Round an art-pixel position to a whole WORLD unit (PX art pixels), as the old painters
 * rounded. The placeholders are placed with it so that they land exactly where today's
 * furniture does and a before/after render can be compared pixel for pixel. A redrawn zone
 * may place on the art pixel instead (Math.round) -- nothing else depends on this.
 */
export const unit = (v) => PX * Math.round(v / PX);
