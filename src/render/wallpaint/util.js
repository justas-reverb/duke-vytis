// The kit the side-wall painters draw with.
//
// A zone's wall is two pieces, the shape the artist's brief asks for (tools/brief-sheets.mjs,
// THE SIDE WALLS): a WALL tile, 64 x 128 art pixels, that repeats both ways -- up the shaft
// forever, and sideways as the wall widens -- and a FACE, 8 x 128, the inner edge the Duke
// bounces off, that repeats top to bottom. Both are drawn for the LEFT wall, with the face on
// the right of the tile, touching the shaft; the right wall is the same drawing mirrored.
//
// Painters work on a PLAN, not on colours: one palette index per pixel, turned into colours
// only at the end. Shading passes need to ask "what is this pixel and what is next to it",
// which colours cannot answer, and a plan keeps every zone to its own short hue-shifted
// ramps, so the result is clean clusters of a few tones rather than a smear.
//
// EVERYTHING WRAPS. A plan reads and writes modulo its own size, so a stone that crosses the
// bottom edge carries on at the top, and a crack that runs off the left continues from the
// right: the wall is seamless by construction, not by care. tools/test-walls.mjs measures
// the edges anyway.

import { Pix, rgba } from '../decorpaint/util.js';
import { Rng } from '../../core/rng.js';

/** Art pixels: the wall tile, and the face strip beside it. */
export const WALL_W = 64;
export const WALL_H = 128;
export const FACE_W = 8;

/** Rec. 601 luma of a colour, 0..255 -- the number the brightness caps are stated in. */
export function luma(c) {
  const [r, g, b] = rgba(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** A seeded stream for one zone and piece, so a wall is the same drawing on every build. */
export function wallRng(zone, piece) {
  let h = 2166136261;
  for (const ch of `WALL|${zone}|${piece}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return new Rng(h >>> 0);
}

export class Plan {
  constructor(w, h, fill = 0) {
    this.w = w;
    this.h = h;
    this.t = new Uint8Array(w * h).fill(fill);
  }

  i(x, y) {
    const w = this.w, h = this.h;
    x = Math.floor(x); y = Math.floor(y);
    return (((y % h) + h) % h) * w + (((x % w) + w) % w);
  }

  get(x, y) { return this.t[this.i(x, y)]; }
  set(x, y, v) { this.t[this.i(x, y)] = v; }

  /** A filled rectangle from its top-left, wrapped. */
  rect(x, y, w, h, v) {
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) this.set(x + k, y + j, v);
  }

  hline(x0, x1, y, v) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, v); }
  vline(x, y0, y1, v) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, v); }

  /** Bresenham, both ends included, wrapped. */
  line(x0, y0, x1, y1, v) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Visit every pixel: fn(x, y, v) may return a new index, or undefined to leave it. */
  map(fn) {
    const out = new Uint8Array(this.t);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const v = fn(x, y, this.t[y * this.w + x]);
        if (v !== undefined) out[y * this.w + x] = v;
      }
    }
    this.t = out;
  }

  /**
   * A pixel whose index none of its four neighbours share, and that is not in `keep`, takes
   * the index most of them have. Covered creases and the ends of cracks leave these lone
   * specks, and a lone speck on a wall reads as dirt on the screen, not as texture.
   */
  despeckle(keep = new Set(), passes = 1) {
    for (let p = 0; p < passes; p++) {
      this.map((x, y, v) => {
        if (keep.has(v)) return undefined;
        const n = [this.get(x + 1, y), this.get(x - 1, y), this.get(x, y + 1), this.get(x, y - 1)];
        if (n.includes(v)) return undefined;
        const count = new Map();
        for (const q of n) count.set(q, (count.get(q) || 0) + 1);
        let best = n[0], bn = 0;
        for (const [q, c] of count) if (c > bn) { best = q; bn = c; }
        return bn >= 2 ? best : undefined;
      });
    }
  }

  /** The plan in colours: an opaque Pix, one palette entry per index. */
  pix(pal) {
    const p = new Pix(this.w, this.h);
    const cols = pal.map((c) => rgba(c));
    for (let k = 0; k < this.t.length; k++) {
      const c = cols[this.t[k]] || [255, 0, 255, 255];
      p.data[k * 4] = c[0]; p.data[k * 4 + 1] = c[1]; p.data[k * 4 + 2] = c[2]; p.data[k * 4 + 3] = 255;
    }
    return p;
  }
}

/**
 * Smooth value noise, 0..1, that wraps on a w x h tile: `cx` cells across and `cy` down.
 * Built from a seeded lattice that repeats, so the noise itself tiles. For damp, soot, moss
 * -- anything that should come in patches rather than per pixel.
 */
export function noise(r, cx, cy, w, h) {
  const L = [];
  for (let k = 0; k < cx * cy; k++) L.push(r.next());
  const at = (i, j) => L[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / w) * cx, fy = (y / h) * cy;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = sm(fx - i), ty = sm(fy - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/**
 * One dressed stone or brick in the backgrounds' idiom (bgpaint/basement.js, dungeon.js):
 * a FLAT face in tone b, lit along its top and left from the upper left, shadowed along its
 * bottom and right, its corners knocked round, a few two-pixel pits. The joint is the
 * stone's own top row and left column, in tone `joint`, so stones laid edge to edge need no
 * separate mortar pass. The lit top stops part of the way along, so a course of stones can
 * never light a whole row: a lit horizontal across a wall is a ledge to the eye.
 *
 * Options: joint (tone of the joint), jw (joint width, 1 or 2), lit (fraction of the top
 * that is lit), top (brightest tone allowed), pits [lo, hi], chip (chance of a broken
 * corner), crack (chance of a crack in from the top).
 */
export function stone(p, r, x0, y0, w, h, b, o = {}) {
  const joint = o.joint ?? 1, jw = o.jw ?? 1, top = o.top ?? b + 1;
  const lit = Math.min(top, b + 1), dark = Math.max(joint + 1, b - 1);
  p.rect(x0, y0, w, jw, joint);
  p.rect(x0, y0, jw, h, joint);
  const sx = x0 + jw, sy = y0 + jw, sw = w - jw, sh = h - jw;
  p.rect(sx, sy, sw, sh, b);
  p.hline(sx + 1, sx + Math.max(2, Math.floor(sw * (o.lit ?? 0.5))), sy, lit);
  p.vline(sx, sy + 1, sy + Math.max(2, Math.floor(sh * 0.65)), lit);
  p.hline(sx + 1, sx + sw - 1, sy + sh - 1, dark);
  p.vline(sx + sw - 1, sy + 1, sy + sh - 1, dark);
  // Knocked corners: the joint shows through at all four, deepest at the lower right.
  p.set(sx, sy, joint); p.set(sx + sw - 1, sy, joint);
  p.set(sx, sy + sh - 1, joint); p.set(sx + sw - 1, sy + sh - 1, Math.max(0, joint - 1));
  const [plo, phi] = o.pits ?? [1, 3];
  const n = r.int(plo, phi);
  for (let k = 0; k < n && sw > 7 && sh > 7; k++) {
    const px = sx + r.int(2, sw - 4), py = sy + r.int(2, sh - 4);
    if (r.chance(0.5)) p.rect(px, py, 2, 1, dark); else p.rect(px, py, 1, 2, dark);
  }
  if (r.chance(o.chip ?? 0.25) && sw > 8 && sh > 6) {
    // A broken corner low down: the joint shows in the gap, the break's upper edge shadowed.
    const right = r.chance(0.5);
    const cx = right ? sx + sw - 4 : sx;
    p.rect(cx, sy + sh - 3, 4, 3, joint);
    p.hline(cx, cx + 3, sy + sh - 4, dark);
  }
  if (r.chance(o.crack ?? 0) && sw > 12 && sh > 10) {
    // A crack in from the top edge, stepping sideways as it goes, lit on its right lip.
    let cx = sx + r.int(4, sw - 6);
    const len = r.int(4, Math.min(9, sh - 4)), dir = r.chance(0.5) ? 1 : -1;
    for (let k = 0; k < len; k++) {
      p.set(cx, sy + k, joint);
      if (k > 0) p.set(cx + 1, sy + k, lit);
      if (r.chance(0.4)) cx += dir;
    }
  }
}

/** Horizontal runs of identical pixels: what pixToCanvas draws, one fillRect each. */
export function runsOf(p) {
  const d = p.data;
  let n = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!d[i + 3]) continue;
      if (x > 0 && d[i - 4] === d[i] && d[i - 3] === d[i + 1] && d[i - 2] === d[i + 2]
          && d[i - 1] === d[i + 3]) continue;
      n++;
    }
  }
  return n;
}

/**
 * Split `total` into parts between lo and hi that sum to it exactly -- course heights up a
 * tile, stone widths across one -- so a repeating structure closes on itself at the seam.
 */
export function parts(r, total, lo, hi) {
  for (let tries = 0; tries < 200; tries++) {
    const out = [];
    let left = total;
    while (left > hi) {
      const v = r.int(lo, Math.min(hi, left - lo));
      out.push(v);
      left -= v;
    }
    if (left >= lo) { out.push(left); return out; }
  }
  // Even parts: always possible when lo <= total / n <= hi for some n.
  const n = Math.max(1, Math.round(total / ((lo + hi) / 2)));
  const out = new Array(n).fill(Math.floor(total / n));
  for (let k = 0; k < total - out[0] * n; k++) out[k]++;
  return out;
}
