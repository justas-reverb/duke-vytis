// The kit the zone-title painters share: letterforms, a material plan, and the passes
// every title needs (outline, drop shadow, despeckle).
//
// THE LETTERFORMS come from the game's own 5x7 font (render/font.js), so a zone title spells
// its name in the same alphabet as every other word on screen -- only bigger and made of
// something. Each lit pixel of a glyph becomes a NODE K art pixels from its neighbours, and
// the glyph's strokes are the links between them: every pair of nodes side by side or one
// above the other, and a diagonal pair only where no node sits in the corner between them.
// (Linking every diagonal as well filled each L-corner with a triangle and the R's leg, the
// K's arms and the S's turns swelled into blobs.) A painter then asks, per pixel, how far it
// is from the nearest stroke -- `d` -- and which point of the stroke that is, and grows its
// material from that: leaves in a band round the stroke, a cloud's puffs along it, a gold
// bevel shaded by the direction away from it. A painter that wants the font's own square
// pixels (stone blocks, bricks) reads the glyph cells instead; they share the node grid, so
// block and stroke letters are the same size.
//
// Everything is in ART pixels, one to one with the backing store: y points DOWN, (0, 0) is
// the word's top-left, and a node's centre sits on a pixel centre (x + 0.5).

import { GLYPHS } from '../font.js';
import { Pix, rgba } from '../decorpaint/util.js';
import { overdue, drain } from '../slices.js';

export { Pix, rgba };
export { rng } from '../decorpaint/util.js';
export { overdue, drain };

// SLICED PASSES. The scoreboard letters GAME OVER with these painters while a run is being
// PLAYED, under a budget of a fraction of a millisecond a frame (gameoverskin.js), so every
// pass that walks the pixels has a generator form (layoutSteps, despeckleSteps, toPixSteps,
// dropShadowSteps, haloSteps, distOutSteps, depthInSteps) that yields between rows once its
// slice is spent (slices.js). The plain functions are those generators run to the end: with
// no deadline set they never yield, so every caller that used them -- the zone titles, the
// callouts -- gets the same pixels in the same number of steps as before.

/**
 * Letters whose strokes are drawn here rather than read off the font. At 5 x 7 the N, M and
 * W double a column ('##..#') to suggest a diagonal; scaled up as strokes, that doubled
 * column became a second stem beside the first and the N was a lump with a hook in it.
 * These take the font's stems and run each diagonal as ONE straight stroke instead: the
 * same letter, drawn the way a bigger font would draw it. Nodes are [col, row] on the
 * font's grid; a diagonal meets a stem at a node of its own, so that node joins three
 * strokes and nothing takes it for a stroke's end.
 */
const STROKES = {
  N: { nodes: [[0, 0], [0, 1], [0, 6], [4, 0], [4, 5], [4, 6]], links: [[0, 1], [1, 2], [3, 4], [4, 5], [1, 4]] },
  M: { nodes: [[0, 0], [0, 6], [4, 0], [4, 6], [2, 3]], links: [[0, 1], [2, 3], [0, 4], [2, 4]] },
  W: { nodes: [[0, 0], [0, 6], [4, 0], [4, 6], [2, 3]], links: [[0, 1], [2, 3], [1, 4], [3, 4]] },
};

/** A glyph's nodes [col, row] and the links between them, as pairs of node indices. */
export function skeleton(ch) {
  const own = STROKES[ch];
  if (own) return { nodes: own.nodes.map((n) => n.slice()), links: own.links.map((l) => l.slice()) };
  const rows = GLYPHS[ch] || GLYPHS[' '];
  const at = new Map();
  const nodes = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== '#') continue;
      at.set(c + ',' + r, nodes.length);
      nodes.push([c, r]);
    }
  }
  const on = (c, r) => at.has(c + ',' + r);
  const links = [];
  nodes.forEach(([c, r], i) => {
    // Right and down, so each pair is found once.
    if (on(c + 1, r)) links.push([i, at.get(c + 1 + ',' + r)]);
    if (on(c, r + 1)) links.push([i, at.get(c + ',' + (r + 1))]);
    // The diagonals, only where neither corner between them is lit.
    for (const dc of [-1, 1]) {
      if (on(c + dc, r + 1) && !on(c + dc, r) && !on(c, r + 1)) {
        links.push([i, at.get(c + dc + ',' + (r + 1))]);
      }
    }
  });
  return { nodes, links };
}

/**
 * Lay a word out: every letter's nodes and strokes in word pixels, and the distance field.
 *
 * @param opt.K     node spacing [art px; 10 is a 50 x 70 letter at R 5.5]
 * @param opt.R     stroke half-width [art px; the stroke is about 2R wide, 5.5 gives 11]
 * @param opt.gap   clear columns between one letter's strokes and the next's [art px, ~10]
 * @param opt.pad   [left, top, right, bottom] room round the ink for outline, shadow and
 *                  whatever the material throws past the stroke [art px]
 * @param opt.reach how far past the stroke the distance field is filled [art px]
 * @param opt.advance if given, letters stand on the FONT's grid instead of being packed by
 *                  their ink: character i's cell starts `advance` art px after character
 *                  i - 1's, a space is an empty cell, and a node sits on the centre of the
 *                  font pixel it stands for when K is the font pixel's size. The menus letter
 *                  whole lines this way (menuskin.js), so a lettered line lands where the
 *                  same line in the font did and the screens keep their layout [art px;
 *                  (CELL * scale + tracking(scale)) * PX, 56 at scale 2]
 */
export function layoutWord(word, opt) {
  return drain(layoutSteps(word, opt));
}

/** layoutWord as a generator, yielding between rows of the distance field (see above). */
export function* layoutSteps(word, { K = 10, R = 5.5, gap = 10, pad = [12, 12, 12, 12], reach = 14, advance = 0 } = {}) {
  const Rf = Math.floor(R);
  const letters = [];
  let x = pad[0];
  let at = -1;
  for (const ch of word) {
    at++;
    if (advance && ch === ' ') continue;
    const sk = skeleton(ch);
    const cols = sk.nodes.map((n) => n[0]);
    const c0 = Math.min(...cols), c1 = Math.max(...cols);
    if (advance) x = pad[0] + at * advance + c0 * K;
    // Node centres: the glyph's first used column lands Rf px in from the letter's left.
    const ox = x + Rf - c0 * K;
    const oy = pad[1] + Rf;
    const nodes = sk.nodes.map(([c, r]) => ({ c, r, x: ox + c * K + 0.5, y: oy + r * K + 0.5, deg: 0 }));
    const segs = sk.links.map(([i, j]) => {
      nodes[i].deg++; nodes[j].deg++;
      const a = nodes[i], b = nodes[j];
      return { a: i, b: j, ax: a.x, ay: a.y, bx: b.x, by: b.y, diag: a.c !== b.c && a.r !== b.r };
    });
    const inkW = (c1 - c0) * K + 2 * Rf + 1;
    letters.push({ ch, x0: x, x1: x + inkW, ox, oy, nodes, segs, cols: [c0, c1] });
    x += inkW + gap;
  }
  // On the font's grid the box is the font's: the last cell's five pixels, whatever the
  // last letter's own ink, so a right-aligned line ends where the font's did.
  const w = (advance ? pad[0] + (at * advance) + 5 * K + pad[2] : x - gap + pad[2]) | 0;
  const inkH = 6 * K + 2 * Rf + 1;
  const h = (pad[1] + inkH + pad[3]) | 0;

  // Four fields of the word's size, a slice apiece: made at once they were the longest
  // stretch of the scoreboard's painting without a check.
  const n = w * h;
  if (overdue()) yield;
  const d = new Float32Array(n).fill(1e9);
  if (overdue()) yield;
  const qx = new Float32Array(n);
  const qy = new Float32Array(n);
  if (overdue()) yield;
  const own = new Int8Array(n).fill(-1);
  for (let li = 0; li < letters.length; li++) {
    const L = letters[li];
    const xa = Math.max(0, Math.floor(L.x0 - reach)), xb = Math.min(w, Math.ceil(L.x1 + reach));
    const ya = Math.max(0, Math.floor(pad[1] - reach)), yb = Math.min(h, Math.ceil(pad[1] + inkH + reach));
    const pts = L.nodes.filter((nd) => nd.deg === 0);
    for (let y = ya; y < yb; y++) {
      const py = y + 0.5;
      for (let xx = xa; xx < xb; xx++) {
        // Every 32 px as well as every row: a pixel here measures every stroke of the letter.
        if ((xx & 31) === 0 && overdue()) yield;
        const px = xx + 0.5;
        const i = y * w + xx;
        let best = d[i], bx = 0, by = 0, hit = false;
        for (const s of L.segs) {
          const vx = s.bx - s.ax, vy = s.by - s.ay;
          let t = ((px - s.ax) * vx + (py - s.ay) * vy) / (vx * vx + vy * vy);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = s.ax + vx * t, cy = s.ay + vy * t;
          const dd = Math.hypot(px - cx, py - cy);
          if (dd < best) { best = dd; bx = cx; by = cy; hit = true; }
        }
        for (const p of pts) {
          const dd = Math.hypot(px - p.x, py - p.y);
          if (dd < best) { best = dd; bx = p.x; by = p.y; hit = true; }
        }
        if (hit) { d[i] = best; qx[i] = bx; qy[i] = by; own[i] = li; }
      }
      if (overdue()) yield;
    }
  }

  // Where one letter's slice ends and the next begins, for an entrance that brings the
  // letters in one at a time: halfway across each gap, so the slices tile the word.
  const cuts = [0];
  for (let i = 1; i < letters.length; i++) cuts.push(Math.round((letters[i - 1].x1 + letters[i].x0) / 2));
  cuts.push(w);

  return { word, K, R, Rf, w, h, pad, letters, d, qx, qy, own, cuts,
    top: pad[1], bottom: pad[1] + inkH, inkH };
}

/**
 * The glyph cell under a pixel, for painters that build letters from the font's own square
 * pixels: { li, c, r, u, v } with (u, v) the pixel's place inside its K x K cell, or null.
 * A cell is centred on its node, so block letters line up with stroke letters exactly.
 */
export function cellMap(plan) {
  const { w, h, K } = plan;
  const cell = new Int32Array(w * h).fill(-1);
  const list = [];
  plan.letters.forEach((L, li) => {
    // From the font's own pixels, not the stroke nodes: a letter drawn with STROKES of its
    // own still has the font's square cells.
    const rows = GLYPHS[L.ch] || GLYPHS[' '];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue;
        const x0 = Math.round(L.ox + c * K - (K - 1) / 2), y0 = Math.round(L.oy + r * K - (K - 1) / 2);
        const id = list.length;
        list.push({ li, c, r, x0, y0 });
        for (let v = 0; v < K; v++) {
          for (let u = 0; u < K; u++) {
            const x = x0 + u, y = y0 + v;
            if (x >= 0 && y >= 0 && x < w && y < h) cell[y * w + x] = id;
          }
        }
      }
    });
  });
  return { cell, list };
}

// --- a material plan ---------------------------------------------------------------------
//
// Paint materials and tones first, colours last (the pixel-art-in-code rule): the passes
// that shade, outline and clean up need to ask "what is this pixel and what is next to it",
// which colours cannot answer.

export class Plan {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.mat = new Uint8Array(w * h);     // 0 = empty
    this.tone = new Int8Array(w * h);
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  m(x, y) { return this.in(x, y) ? this.mat[y * this.w + x] : 0; }
  t(x, y) { return this.tone[y * this.w + x]; }
  put(x, y, mat, tone) {
    x |= 0; y |= 0;
    if (!this.in(x, y)) return;
    const i = y * this.w + x;
    this.mat[i] = mat;
    this.tone[i] = tone;
  }
  /** A disc of one material and tone, the + 0.8r rounding Pix.disc uses. */
  disc(cx, cy, r, mat, tone) {
    const lim = r * r + 0.8 * r;
    const R = Math.ceil(r);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      if (x * x + y * y <= lim) this.put(cx + x, cy + y, mat, tone);
    }
  }

  /**
   * A pixel whose tone none of its four same-material neighbours share takes the tone most
   * of them have: covered creases and dither ends leave lone specks otherwise.
   */
  despeckle(passes = 1) { drain(this.despeckleSteps(passes)); }

  /** despeckle as a generator, yielding between rows once its slice is spent. */
  *despeckleSteps(passes = 1) {
    const { w, h, mat, tone } = this;
    const nt = [0, 0, 0, 0];
    for (let k = 0; k < passes; k++) {
      const fix = [];
      for (let y = 0; y < h; y++) {
        if (overdue()) yield;
        for (let x = 0; x < w; x++) {
          const i = y * w + x, m = mat[i];
          if (!m) continue;
          let nb = 0, same = false;
          if (x + 1 < w && mat[i + 1] === m) { nt[nb++] = tone[i + 1]; }
          if (x > 0 && mat[i - 1] === m) { nt[nb++] = tone[i - 1]; }
          if (y + 1 < h && mat[i + w] === m) { nt[nb++] = tone[i + w]; }
          if (y > 0 && mat[i - w] === m) { nt[nb++] = tone[i - w]; }
          if (nb < 3) continue;
          for (let q = 0; q < nb; q++) if (nt[q] === tone[i]) { same = true; break; }
          if (same) continue;
          // The tone most of them have (the first of a tie).
          let bt = nt[0], bc = 0;
          for (let q = 0; q < nb; q++) {
            let c = 0;
            for (let r = 0; r < nb; r++) if (nt[r] === nt[q]) c++;
            if (c > bc) { bc = c; bt = nt[q]; }
          }
          fix.push(i, bt);
        }
      }
      for (let j = 0; j < fix.length; j += 2) tone[fix[j]] = fix[j + 1];
    }
  }

  /**
   * Colour the plan into a Pix. ramps[mat] is that material's colours, darkest first, and a
   * tone indexes it (clamped). edges[mat], if given, is the colour an empty pixel touching
   * the material becomes: each material outlined in its OWN darkest colour, not one black.
   */
  toPix(ramps, edges = null, opts = {}) { return drain(this.toPixSteps(ramps, edges, opts)); }

  /** toPix as a generator, yielding between rows once its slice is spent. */
  *toPixSteps(ramps, edges = null, { diag = false } = {}) {
    const { w, h, mat, tone } = this;
    const p = new Pix(w, h);
    const d = p.data;
    for (let y = 0; y < h; y++) {
      if (overdue()) yield;
      for (let i = y * w, e = i + w; i < e; i++) {
        const m = mat[i];
        if (!m) continue;
        const ramp = ramps[m];
        const c = rgba(ramp[Math.max(0, Math.min(ramp.length - 1, tone[i]))]);
        const o = i * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
      }
    }
    if (edges) {
      const nb = diag
        ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
        : [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let y = 0; y < h; y++) {
        if (overdue()) yield;
        for (let x = 0; x < w; x++) {
          if (mat[y * w + x]) continue;
          for (const [dx, dy] of nb) {
            const m = this.m(x + dx, y + dy);
            if (m && edges[m]) { p.set(x, y, edges[m]); break; }
          }
        }
      }
    }
    return p;
  }
}

// --- passes on the finished Pix ----------------------------------------------------------

/**
 * A drop shadow under everything opaque, down and to the right, on empty pixels only: the
 * title's second keyline. The outline alone is one pixel and sinks into a busy backdrop at
 * a glance; a shadow a few pixels deep lifts the word off it the way the old text's two-pixel
 * black keyline did.
 *
 * @param steps [[dx, dy, alpha], ...] offsets drawn nearest first; a pixel keeps the first
 *              one that reaches it
 */
export function dropShadow(p, col, steps) { drain(dropShadowSteps(p, col, steps)); }

/** dropShadow as a generator, yielding between rows once its slice is spent. */
export function* dropShadowSteps(p, col, steps) {
  const { w, h, data } = p;
  const src = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let i = y * w, e = i + w; i < e; i++) src[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  }
  const c = rgba(col);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3]) continue;
      for (const [dx, dy, a] of steps) {
        const X = x - dx, Y = y - dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h || !src[Y * w + X]) continue;
        data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2];
        data[i * 4 + 3] = Math.round(255 * a);
        break;
      }
    }
  }
}

/**
 * Distance from every pixel to the nearest pixel of `p` at least `min` opaque, by a two-pass
 * chamfer: with diag 1 it is the Chebyshev distance exactly (a square step round the
 * letters' own pixel stairs), with diag 1.414 close to the Euclidean (round). One pass down
 * and one up, whatever the reach -- the halos and glows first searched a square round every
 * empty pixel, 225 looks a pixel for a seven-pixel glow, and DOWNTOWN's lamplight alone
 * cost 13 ms of a frame.
 */
export function distOut(p, diag = 1, min = 128) { return drain(distOutSteps(p, diag, min)); }

/** distOut as a generator, yielding between rows once its slice is spent. */
export function* distOutSteps(p, diag = 1, min = 128) {
  const { w, h, data } = p;
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let i = y * w, e = i + w; i < e; i++) d[i] = data[i * 4 + 3] >= min ? 0 : 1e6;
  }
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + diag);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + diag);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    if (overdue()) yield;
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + diag);
        if (x > 0) v = Math.min(v, d[i + w - 1] + diag);
      }
      d[i] = v;
    }
  }
  return d;
}

/**
 * A halo: every empty pixel within r of something opaque gets col at alpha a -- a soft dark
 * bed that keeps a pale backdrop off the word's edge. Chebyshev distance, so it follows the
 * letters' own pixel steps instead of rounding them.
 */
export function halo(p, col, r, a) { drain(haloSteps(p, col, r, a)); }

/** halo as a generator, yielding between rows once its slice is spent. */
export function* haloSteps(p, col, r, a) {
  const { w, h, data } = p;
  const d = yield* distOutSteps(p, 1);
  const c = rgba(col);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let i = y * w, e = i + w; i < e; i++) {
      if (data[i * 4 + 3] || d[i] > r) continue;
      data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2];
      data[i * 4 + 3] = Math.round(255 * a);
    }
  }
}

/** A cheap hash of two integers to [0, 1): texture that does not depend on draw order. */
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Points along every stroke of the plan, spaced about `step` apart and each nudged up to
 * `jit` px sideways, with the letter they belong to: where a painter puts its puffs.
 */
export function strokePoints(plan, step, jit, r) {
  const out = [];
  plan.letters.forEach((L, li) => {
    const seen = new Set();
    const add = (x, y) => {
      const k = Math.round(x) + ',' + Math.round(y);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ x: x + (r.next() * 2 - 1) * jit, y: y + (r.next() * 2 - 1) * jit, li });
    };
    for (const s of L.segs) {
      const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
      const n = Math.max(1, Math.round(len / step));
      for (let k = 0; k <= n; k++) add(s.ax + (s.bx - s.ax) * k / n, s.ay + (s.by - s.ay) * k / n);
    }
    for (const nd of L.nodes) if (!nd.deg) add(nd.x, nd.y);
  });
  return out;
}

// --- straight runs -----------------------------------------------------------------------

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * A letter's strokes merged into maximal STRAIGHT runs: links that continue one another in
 * the same direction become one run, end to end. The L is two runs, not seven links. What
 * a painter wants when the material comes in lengths -- a plank, a bone, a crystal prism --
 * so a stroke is one board and not a row of eleven-pixel offcuts.
 * Returns [{ a, b, ax, ay, bx, by }] with a, b node indices.
 */
export function straightRuns(L) {
  const dir = (i, j) => {
    const dc = L.nodes[j].c - L.nodes[i].c, dr = L.nodes[j].r - L.nodes[i].r;
    const g = gcd(Math.abs(dc), Math.abs(dr)) || 1;
    return [dc / g, dr / g];
  };
  const adj = L.nodes.map(() => []);
  L.segs.forEach((s) => { adj[s.a].push({ j: s.b, s }); adj[s.b].push({ j: s.a, s }); });
  const used = new Set();
  const runs = [];
  for (const s of L.segs) {
    if (used.has(s)) continue;
    used.add(s);
    const [dc, dr] = dir(s.a, s.b);
    let head = s.b, tail = s.a;
    const walk = (from, wc, wr) => {
      for (;;) {
        const e = adj[from].find((q) => {
          if (used.has(q.s)) return false;
          const [c, r] = dir(from, q.j);
          return c === wc && r === wr;
        });
        if (!e) return from;
        used.add(e.s);
        from = e.j;
      }
    };
    head = walk(head, dc, dr);
    tail = walk(tail, -dc, -dr);
    const A = L.nodes[tail], B = L.nodes[head];
    runs.push({ a: tail, b: head, ax: A.x, ay: A.y, bx: B.x, by: B.y });
  }
  return runs;
}

/**
 * How deep each pixel of a mask lies inside it, in steps of 4-neighbour erosion (1 = on the
 * edge, 2 = one in, ...), capped at `cap`; 0 outside. For bevels and gilt edges on block
 * letters, whose shape is the font's square cells rather than a stroke.
 */
export function depthIn(mask, w, h, cap = 4) { return drain(depthInSteps(mask, w, h, cap)); }

/** depthIn as a generator, yielding between rows once its slice is spent. */
export function* depthInSteps(mask, w, h, cap = 4) {
  const dep = new Uint8Array(w * h);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (N4.some(([dx, dy]) => { const j = at(x + dx, y + dy); return j < 0 || !mask[j]; })) dep[y * w + x] = 1;
    }
  }
  for (let k = 2; k < cap; k++) {
    const hit = [];
    for (let y = 0; y < h; y++) {
      if (overdue()) yield;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i] || dep[i]) continue;
        if (N4.some(([dx, dy]) => { const j = at(x + dx, y + dy); return j >= 0 && dep[j] === k - 1; })) hit.push(i);
      }
    }
    for (const i of hit) dep[i] = k;
  }
  for (let i = 0; i < w * h; i++) if (mask[i] && !dep[i]) dep[i] = cap;
  return dep;
}
