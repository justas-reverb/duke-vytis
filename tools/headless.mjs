// A canvas, in Node, with no browser.
//
// WHY THIS EXISTS
//
// Every visual check so far meant opening a real browser, letting it run the game at
// whatever rate it felt like, and taking a screenshot. That is slow, it is unreliable
// -- the pane loses its renderer, drops query strings, scales the canvas down so the
// thing being inspected is resampled before it is seen -- and it is expensive on the
// machine, which for a change nobody can see is a bad trade.
//
// The renderer does not need a browser. Counted across src/render and src/ui on
// 2026-09-23 -- call sites, comment lines left out -- it makes about 190 fillRect calls,
// about 230 fillStyle assignments, 80 uses of globalAlpha, 44 drawImage calls in sixteen
// files, 35 transform calls and seven path calls. This said "under twenty drawImage" when
// it was written; the count more than doubled as the start floor, the rising floor, the
// side walls, the speed streaks, the combo trail, the HUD's skin and the zone titles were
// each painted once into a canvas and then blitted -- the pattern the sprites, the font, the
// backdrop and the platform tiles already followed. It is still a small enough surface to
// implement honestly, so this implements it: an affine transform stack, a pixel buffer,
// nearest-neighbour drawImage, and enough of the path API for the two places that use it
// (the particles' shockwave rings, and the constellation line of a legacy decor painter).
//
// The result is a real frame -- the same code, the same pixels -- produced by one node
// process in well under a second, and written out as a PNG that can be looked at.
//
// WHAT IT IS NOT: it is not a conformance-grade canvas. Strokes are approximated, arcs
// are filled circles, and anything drawn through a path is close rather than exact. The
// game uses paths for two decorations. Everything that matters -- the world, the
// sprites, the HUD, the screens -- is rectangles and images, and those are exact.

import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from './pngread.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- what only this canvas has --------------------------------------------------------
//
// This canvas keeps things a browser's does not: its pixels in `data` (on the canvas, on
// its context and on an Image), the context's matrix in `m` and its size in `w` and `h`, a
// gradient's stops, and helpers like `_box`. Game code can reach every one of them, and
// every suite runs here, so a read that only works here passes everything and breaks the
// game. It happened (2026-09-24): the prestige badge measured its word off the cached
// canvas's `data`, every suite was green, and in Chromium the renderer threw a TypeError
// every frame the badge was up -- no badge, and the rest of that frame skipped.
//
// So this module keeps its own state under private names (the symbols below, which it never
// exports), and every one of those names a browser does not have is an accessor that
// throws when the code reaching for it is the GAME's -- a .js module under src/, or a
// test's mutated copy of one -- naming the field and the line. The tools (.mjs), scratch
// scripts and this module keep full access. The rasterising loops never go through an
// accessor: they read the private names, so the guard costs a frame nothing. An outside
// read pays for a stack walk (about 3 us, measured), so a tool reading pixels in a loop
// takes `const d = canvas.data` once, outside it: per pixel, a 1920x1080 frame's worth of
// reads would be six seconds.
const PIXELS = Symbol('pixels');
const CW = Symbol('canvas width'), CH = Symbol('canvas height'), CTX = Symbol('context');
const W = Symbol('w'), H = Symbol('h'), M = Symbol('m'), STACK = Symbol('stack');
const PATH = Symbol('path'), SCRATCH = Symbol('scratch');
const MUL = Symbol('mul'), PT = Symbol('pt'), BOX = Symbol('box'), BLEND = Symbol('blend');
const COMPOSITE = Symbol('composite'), STROKE_OR_FILL = Symbol('strokeOrFill');
const STOPS = Symbol('stops'), SAMPLE = Symbol('sample'), SRC = Symbol('src');

// The game's own code is every .js file: src/, and the copies of src/ that tests mutate in a
// temp folder and import -- some copy the folder's CONTENTS, so a copy's main.js sits at its
// root with no src/ above it, and a rule keyed on the folder's name missed it. The tools and
// scratch scripts are all .mjs, and electron/'s two .js files never run beside this canvas.
const ELECTRON_DIR = (path.join(REPO_ROOT, 'electron') + path.sep).toLowerCase();
const isGameFile = (file) => file.endsWith('.js') && !file.toLowerCase().startsWith(ELECTRON_DIR);
const asFrames = (_, frames) => frames;

/** Throw if the code that touched `what`.`name` (the caller of `accessor`) is the game's. */
function vet(accessor, what, name) {
  const limit = Error.stackTraceLimit, prepare = Error.prepareStackTrace;
  const o = {};
  let frames;
  try {
    // A few frames, not one: a builtin between the reader and the field (Reflect.get, a
    // callback's caller) has no file, and the reader is the first frame past it.
    Error.stackTraceLimit = 4;
    Error.prepareStackTrace = asFrames;
    Error.captureStackTrace(o, accessor);
    frames = o.stack;
  } finally {
    Error.stackTraceLimit = limit;
    Error.prepareStackTrace = prepare;
  }
  if (!Array.isArray(frames)) return;
  const f = frames.find((s) => s.getFileName());
  if (!f) return;
  let file = f.getFileName();
  // An ES module's frame is its URL, query and all (test-death imports sprites.js?tag).
  try { if (file.startsWith('file:')) file = fileURLToPath(file); } catch (e) { /* keep it as it came */ }
  if (!isGameFile(file)) return;
  const rel = path.relative(REPO_ROOT, file);
  const where = `${rel.startsWith('..') ? file : rel.split(path.sep).join('/')}:${f.getLineNumber()}:${f.getColumnNumber()}`;
  const fn = f.getFunctionName();
  throw new TypeError(`${what}.${name} is the headless canvas's own (tools/headless.mjs), and ${where}`
    + `${fn ? ` (${fn})` : ''} reached for it: a browser's ${what} has no '${name}', so this works only in `
    + 'the tests, and in the game it is undefined. Take what you need from what the canvas was drawn '
    + 'from (the Pix, the numbers), not from the canvas.');
}

/**
 * Give `proto` the headless-only field `name`, stored under the private `key`: the tools read
 * and write it as before, the game's code gets a TypeError naming it.
 */
function toolsOnly(proto, what, name, key) {
  function get() { vet(get, what, name); return this[key]; }
  function set(v) { vet(set, what, name); this[key] = v; }
  Object.defineProperty(proto, name, { get, set, configurable: true, enumerable: false });
}

/** A drawable's pixels, from inside this module: a canvas's or Image's own, else `.data`. */
const pixelsOf = (img) => img[PIXELS] || img.data;

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function parseColour(css) {
  // Loud magenta rather than null. A null here propagates into the rasteriser and
  // crashes it several frames later, which is a much worse way to find out that
  // something handed the canvas a colour that is not a string.
  if (typeof css !== 'string') return [255, 0, 255, 255];
  if (css[0] === '#') {
    const h = css.slice(1);
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
    }
    if (h.length === 6) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
    }
    if (h.length === 8) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
    }
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(css);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [clamp255(p[0]), clamp255(p[1]), clamp255(p[2]), p.length > 3 ? clamp255(p[3] * 255) : 255];
  }
  return [255, 0, 255, 255];   // loud, so a colour this cannot parse is obvious
}

// The ends of the gradient's line, under private names; `x0`..`y1` are the tools' (below).
const GX0 = Symbol('x0'), GY0 = Symbol('y0'), GX1 = Symbol('x1'), GY1 = Symbol('y1');

class Gradient {
  constructor(x0, y0, x1, y1) {
    this[GX0] = x0; this[GY0] = y0; this[GX1] = x1; this[GY1] = y1;
    this[STOPS] = [];
  }
  addColorStop(t, css) { this[STOPS].push([t, parseColour(css)]); this[STOPS].sort((a, b) => a[0] - b[0]); }
  [SAMPLE](t) {
    const stops = this[STOPS];
    if (!stops.length) return [0, 0, 0, 255];
    if (t <= stops[0][0]) return stops[0][1];
    const last = stops[stops.length - 1];
    if (t >= last[0]) return last[1];
    for (let i = 1; i < stops.length; i++) {
      const [ta, ca] = stops[i - 1];
      const [tb, cb] = stops[i];
      if (t <= tb) {
        const k = (t - ta) / (tb - ta || 1);
        return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k,
          ca[2] + (cb[2] - ca[2]) * k, ca[3] + (cb[3] - ca[3]) * k];
      }
    }
    return last[1];
  }
}

class Ctx {
  constructor(canvas) {
    this.canvas = canvas;
    this[PIXELS] = canvas[PIXELS];
    this[W] = canvas.width;
    this[H] = canvas.height;
    this[M] = [1, 0, 0, 1, 0, 0];      // a b c d e f
    this[STACK] = [];
    this[SCRATCH] = null;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.globalAlpha = 1;
    this.lineWidth = 1;
    this.imageSmoothingEnabled = false;
    // Three of the browser's operations: plain source-over, and the two the death's burn
    // uses on its own layer (renderer.js drawBurning) -- 'source-atop', which paints only
    // where the layer already has something (the char and the embers on a ledge, never in
    // the air round it), and 'destination-out', which takes alpha away (the holes it burns).
    // Anything else is drawn as source-over, which is what this canvas did for every
    // operation before, so a caller asking for one it does not know is no worse off.
    this.globalCompositeOperation = 'source-over';
    this[PATH] = [];
  }

  save() {
    this[STACK].push([this[M].slice(), this.fillStyle, this.globalAlpha, this.strokeStyle,
      this.lineWidth, this.globalCompositeOperation]);
  }
  restore() {
    const s = this[STACK].pop();
    if (!s) return;
    [this[M], this.fillStyle, this.globalAlpha, this.strokeStyle, this.lineWidth,
      this.globalCompositeOperation] = s;
  }

  /** Transparent black over the transformed rect's device box, as a browser clears. */
  clearRect(x, y, w, h) {
    const [bx0, by0, bx1, by1] = this[BOX](x, y, w, h);
    const x0 = Math.max(0, Math.round(bx0)), x1 = Math.min(this[W], Math.round(bx1));
    const y0 = Math.max(0, Math.round(by0)), y1 = Math.min(this[H], Math.round(by1));
    for (let py = y0; py < y1; py++) this[PIXELS].fill(0, (py * this[W] + x0) * 4, (py * this[W] + x1) * 4);
  }

  setTransform(a, b, c, d, e, f) { this[M] = [a, b, c, d, e, f]; }
  [MUL](n) {
    const [a, b, c, d, e, f] = this[M];
    this[M] = [
      a * n[0] + c * n[1], b * n[0] + d * n[1],
      a * n[2] + c * n[3], b * n[2] + d * n[3],
      a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f,
    ];
  }
  translate(x, y) { this[MUL]([1, 0, 0, 1, x, y]); }
  scale(x, y) { this[MUL]([x, 0, 0, y, 0, 0]); }
  rotate(r) { const s = Math.sin(r), c = Math.cos(r); this[MUL]([c, s, -s, c, 0, 0]); }

  [PT](x, y) {
    const [a, b, c, d, e, f] = this[M];
    return [a * x + c * y + e, b * x + d * y + f];
  }

  /** Device-space bounding box of a transformed rect. Exact for axis-aligned matrices. */
  [BOX](x, y, w, h) {
    const p = [this[PT](x, y), this[PT](x + w, y), this[PT](x, y + h), this[PT](x + w, y + h)];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of p) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    return [x0, y0, x1, y1];
  }

  // SOURCE-OVER, with the destination's own alpha taken into account, as a browser does it.
  //
  // It used to mix the colour into whatever was there and set the pixel opaque, which is
  // right over an opaque pixel and wrong over a TRANSPARENT one: drawing at 50% onto an
  // empty canvas mixed the colour half with black and made it solid. Nothing noticed while
  // everything semi-transparent was drawn straight onto the frame; the background layers
  // are pre-rendered into transparent tiles, and every headless render of them came out
  // at two thirds of their real brightness.
  [BLEND](i, r, g, b, a) {
    if (a <= 0) return;
    const d = this[PIXELS];
    if (a >= 1) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; return; }
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    const k = da * (1 - a);
    d[i] = (r * a + d[i] * k) / oa;
    d[i + 1] = (g * a + d[i + 1] * k) / oa;
    d[i + 2] = (b * a + d[i + 2] * k) / oa;
    d[i + 3] = Math.round(oa * 255);
  }

  // The other two operations, in the same unpremultiplied terms (Porter-Duff, as the canvas
  // spec defines them): SOURCE-ATOP keeps the destination's alpha and mixes the colour,
  // out.rgb = src.rgb a + dst.rgb (1 - a), and leaves a transparent pixel transparent;
  // DESTINATION-OUT keeps the colour and scales the alpha, out.a = d.a (1 - a).
  //
  // The draw is made as plain source-over into a scratch layer, cleared over its box first
  // -- which on transparent pixels IS the source's own colour and coverage, globalAlpha and
  // all -- and then combined with this canvas pixel by pixel. So the rasterising loops above
  // and below are exactly what they were. The first version tested the operation inside
  // _blend, per pixel, and every headless frame drew half as slow again (a full-screen fill
  // and blit, 33 ms to 48); the next picked a blend per call and branched in the loops, and
  // test-perf's play frame went from 58 to 75 ms -- with the effect that needs them nowhere
  // on screen. Returns false for an operation this canvas does not know, which is then drawn
  // as source-over, as every operation was before.
  [COMPOSITE](draw, box) {
    const op = this.globalCompositeOperation;
    if (op !== 'destination-out' && op !== 'source-atop') return false;
    const [bx0, by0, bx1, by1] = box;
    const x0 = Math.max(0, Math.floor(bx0)), x1 = Math.min(this[W], Math.ceil(bx1));
    const y0 = Math.max(0, Math.floor(by0)), y1 = Math.min(this[H], Math.ceil(by1));
    if (x1 <= x0 || y1 <= y0) return true;
    if (!this[SCRATCH] || this[SCRATCH].width !== this[W] || this[SCRATCH].height !== this[H]) {
      this[SCRATCH] = new HeadlessCanvas(this[W], this[H]);
    }
    const sc = this[SCRATCH].getContext('2d');
    const sd = this[SCRATCH][PIXELS];
    for (let py = y0; py < y1; py++) sd.fill(0, (py * this[W] + x0) * 4, (py * this[W] + x1) * 4);
    sc[M] = this[M].slice();
    sc.globalAlpha = this.globalAlpha;
    sc.fillStyle = this.fillStyle;
    draw(sc);
    const d = this[PIXELS];
    for (let py = y0; py < y1; py++) {
      for (let i = (py * this[W] + x0) * 4, e = (py * this[W] + x1) * 4; i < e; i += 4) {
        const a = sd[i + 3] / 255;
        if (a <= 0) continue;
        if (op === 'destination-out') { d[i + 3] = Math.round(d[i + 3] * (1 - a)); continue; }
        if (!d[i + 3]) continue;
        d[i] = sd[i] * a + d[i] * (1 - a);
        d[i + 1] = sd[i + 1] * a + d[i + 1] * (1 - a);
        d[i + 2] = sd[i + 2] * a + d[i + 2] * (1 - a);
      }
    }
    return true;
  }

  fillRect(x, y, w, h) {
    if (this.globalCompositeOperation !== 'source-over'
      && this[COMPOSITE]((g) => g.fillRect(x, y, w, h), this[BOX](x, y, w, h))) return;
    const [bx0, by0, bx1, by1] = this[BOX](x, y, w, h);
    const x0 = Math.max(0, Math.round(bx0)), x1 = Math.min(this[W], Math.round(bx1));
    const y0 = Math.max(0, Math.round(by0)), y1 = Math.min(this[H], Math.round(by1));
    if (x1 <= x0 || y1 <= y0) return;

    const grad = this.fillStyle instanceof Gradient ? this.fillStyle : null;
    const col = grad ? null : parseColour(this.fillStyle);
    const ga = this.globalAlpha;
    // Gradients here are vertical or horizontal; each pixel is projected onto the axis.
    const gx0 = grad ? grad[GX0] : 0, gy0 = grad ? grad[GY0] : 0;
    const gdx = grad ? grad[GX1] - gx0 : 0, gdy = grad ? grad[GY1] - gy0 : 0;
    const len2 = gdx * gdx + gdy * gdy || 1;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        let c = col;
        if (grad) c = grad[SAMPLE](((px - gx0) * gdx + (py - gy0) * gdy) / len2);
        this[BLEND]((py * this[W] + px) * 4, c[0], c[1], c[2], ga * (c[3] / 255));
      }
    }
  }

  drawImage(img, ...a) {
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
    if (a.length === 2) { [dx, dy] = a; dw = sw; dh = sh; }
    else if (a.length === 4) { [dx, dy, dw, dh] = a; }
    else { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
    if (this.globalCompositeOperation !== 'source-over'
      && this[COMPOSITE]((g) => g.drawImage(img, ...a), this[BOX](dx, dy, dw, dh))) return;

    const [bx0, by0, bx1, by1] = this[BOX](dx, dy, dw, dh);
    const x0 = Math.max(0, Math.round(bx0)), x1 = Math.min(this[W], Math.round(bx1));
    const y0 = Math.max(0, Math.round(by0)), y1 = Math.min(this[H], Math.round(by1));
    if (x1 <= x0 || y1 <= y0) return;

    const src = pixelsOf(img), sW = img.width;
    const ga = this.globalAlpha;

    // A ROTATED destination. The axis-aligned path below only knows about flips: handed
    // a quarter turn it filled the rotated bounding box with the UNROTATED image,
    // squeezed to fit -- so every tumbling sprite in every headless render was a
    // stretched, upright copy of itself, and a death that tumbles in quarter turns could
    // not be looked at at all. Each device pixel is mapped back through the inverse
    // transform instead, which is exact for any affine matrix, rotations included.
    const [ma, mb, mc, md, me, mf] = this[M];
    if (Math.abs(mb) > 1e-9 || Math.abs(mc) > 1e-9) {
      const det = ma * md - mb * mc;
      if (!det) return;
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const X = px + 0.5 - me, Y = py + 0.5 - mf;
          const fu = ((md * X - mc * Y) / det - dx) / dw;
          const fv = ((-mb * X + ma * Y) / det - dy) / dh;
          if (fu < 0 || fu >= 1 || fv < 0 || fv >= 1) continue;
          const si = ((Math.floor(sy + fv * sh)) * sW + Math.floor(sx + fu * sw)) * 4;
          const sa = src[si + 3] / 255;
          if (sa <= 0) continue;
          this[BLEND]((py * this[W] + px) * 4, src[si], src[si + 1], src[si + 2], ga * sa);
        }
      }
      return;
    }

    // Whether the destination is flipped on either axis, so a mirrored or Y-up draw
    // samples the right way round.
    const flipX = ma < 0, flipY = md < 0;

    // The source is mapped across the WHOLE destination box, and only the part of it on
    // the canvas is visited. It used to be mapped across the CLIPPED box, so an image
    // hanging off an edge was squashed into its visible part instead of cropped: the
    // backdrop tiles from above the top of the screen, so its first and last rows of
    // windows came out as letterboxes in every headless frame, and any sprite half off
    // screen was a squeezed whole sprite. The box is rounded exactly as the clip is, so
    // an image that fits on the canvas samples precisely as it always did.
    const rx0 = Math.round(bx0), ry0 = Math.round(by0);
    const spanX = Math.round(bx1) - rx0, spanY = Math.round(by1) - ry0;

    for (let py = y0; py < y1; py++) {
      let v = (py - ry0 + 0.5) / spanY;
      if (flipY) v = 1 - v;
      // Clamped to the SOURCE RECT, not to [0, sh): the old clamp used sh as if the rect
      // always started at row 0, which every caller happens to satisfy today.
      const syi = Math.min(sy + sh - 1, Math.max(sy, Math.floor(sy + v * sh)));
      for (let px = x0; px < x1; px++) {
        let u = (px - rx0 + 0.5) / spanX;
        if (flipX) u = 1 - u;
        const sxi = Math.min(sx + sw - 1, Math.max(0, Math.floor(sx + u * sw)));
        const si = (syi * sW + sxi) * 4;
        const sa = src[si + 3] / 255;
        if (sa <= 0) continue;
        this[BLEND]((py * this[W] + px) * 4, src[si], src[si + 1], src[si + 2], ga * sa);
      }
    }
  }

  // --- paths: approximate, and only two things use them ----------------------
  beginPath() { this[PATH] = []; }
  moveTo(x, y) { this[PATH].push(['m', x, y]); }
  lineTo(x, y) { this[PATH].push(['l', x, y]); }
  arc(x, y, r) { this[PATH].push(['a', x, y, r]); }
  closePath() {}
  fill() { this[STROKE_OR_FILL](this.fillStyle); }
  stroke() { this[STROKE_OR_FILL](this.strokeStyle); }
  [STROKE_OR_FILL](style) {
    const save = this.fillStyle;
    this.fillStyle = style;
    let last = null;
    for (const seg of this[PATH]) {
      if (seg[0] === 'm') last = [seg[1], seg[2]];
      else if (seg[0] === 'l' && last) {
        const n = Math.max(1, Math.round(Math.hypot(seg[1] - last[0], seg[2] - last[1])));
        for (let i = 0; i <= n; i++) {
          this.fillRect(last[0] + ((seg[1] - last[0]) * i) / n,
            last[1] + ((seg[2] - last[1]) * i) / n, this.lineWidth, this.lineWidth);
        }
        last = [seg[1], seg[2]];
      } else if (seg[0] === 'a') {
        const [, cx, cy, r] = seg;
        for (let d = 0; d < 360; d += 6) {
          const t = (d * Math.PI) / 180;
          this.fillRect(cx + Math.cos(t) * r, cy + Math.sin(t) * r, this.lineWidth, this.lineWidth);
        }
      }
    }
    this.fillStyle = save;
    this[PATH] = [];
  }

  createLinearGradient(x0, y0, x1, y1) { return new Gradient(x0, y0, x1, y1); }
  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4), px = this[PIXELS];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const s = ((y + j) * this[W] + (x + i)) * 4;
        const d = (j * w + i) * 4;
        out[d] = px[s]; out[d + 1] = px[s + 1];
        out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
      }
    }
    return { data: out, width: w, height: h };
  }
  putImageData() {}
}

export class HeadlessCanvas {
  constructor(w = 1, h = 1) {
    this[CW] = w; this[CH] = h;
    this[PIXELS] = new Uint8ClampedArray(w * h * 4);
    this[CTX] = null;
    this.style = {};
  }
  get width() { return this[CW]; }
  set width(v) { this[CW] = v; resized(this); }
  get height() { return this[CH]; }
  set height(v) { this[CH] = v; resized(this); }
  getContext() { if (!this[CTX]) this[CTX] = new Ctx(this); return this[CTX]; }
}

/**
 * A canvas resized: new, blank pixels -- and, as in a browser, the SAME context, moved onto them
 * with its state back to the defaults. It used to drop the context instead, so a renderer that
 * resized its canvas after taking the context (the side margins on a wide screen, renderer.js
 * setWings, 2026-09-29) went on drawing into the old, detached pixels: every frame came out
 * blank, where a browser drew them.
 */
function resized(canvas) {
  canvas[PIXELS] = new Uint8ClampedArray(canvas[CW] * canvas[CH] * 4);
  const c = canvas[CTX];
  if (!c) return;
  c[PIXELS] = canvas[PIXELS];
  c[W] = canvas[CW];
  c[H] = canvas[CH];
  c[M] = [1, 0, 0, 1, 0, 0];
  c[STACK] = [];
  c[PATH] = [];
  c[SCRATCH] = null;
  c.fillStyle = '#000000';
  c.strokeStyle = '#000000';
  c.globalAlpha = 1;
  c.lineWidth = 1;
  c.globalCompositeOperation = 'source-over';
}

// Every name the objects above answer to that a browser's do not. The tools use `data`, `m`,
// `w` and `h` all the time; the rest are here because a name nobody means to use is exactly
// the kind that gets used once, in a hurry, and works -- here.
for (const [name, key] of [['data', PIXELS], ['_w', CW], ['_h', CH], ['_ctx', CTX]]) {
  toolsOnly(HeadlessCanvas.prototype, 'canvas', name, key);
}
for (const [name, key] of [['data', PIXELS], ['w', W], ['h', H], ['m', M], ['stack', STACK],
  ['_path', PATH], ['_scratch', SCRATCH], ['_mul', MUL], ['_pt', PT], ['_box', BOX],
  ['_blend', BLEND], ['_composite', COMPOSITE], ['_strokeOrFill', STROKE_OR_FILL]]) {
  toolsOnly(Ctx.prototype, 'context', name, key);
}
for (const [name, key] of [['x0', GX0], ['y0', GY0], ['x1', GX1], ['y1', GY1], ['stops', STOPS],
  ['sample', SAMPLE]]) {
  toolsOnly(Gradient.prototype, 'gradient', name, key);
}

/**
 * Install the globals the render code expects. Call before importing anything under
 * src/render, because the sprite and backdrop atlases are built at module load.
 */
export function installDom() {
  if (globalThis.document && globalThis.document.__headless) return;
  globalThis.document = {
    __headless: true,
    createElement: (tag) => (tag === 'canvas' ? new HeadlessCanvas(1, 1) : { style: {} }),
    getElementById: () => null,
    addEventListener: () => {},
  };
  globalThis.window = globalThis.window || {};
  globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
  globalThis.window.innerWidth = 3840;
  globalThis.window.innerHeight = 2160;
  globalThis.performance = globalThis.performance || { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 };
  // An Image that loads a PNG from the repo, synchronously, so headless renders show the
  // artist's tiles exactly where the game would. Paths are resolved against the repo root,
  // as the page resolves them against index.html. Looks like a canvas to drawImage: it
  // carries width, height and RGBA data.
  if (!globalThis.Image) globalThis.Image = HeadlessImage;
}

class HeadlessImage {
  constructor() {
    this.width = 0; this.height = 0; this.naturalWidth = 0; this.naturalHeight = 0;
    this.complete = false; this.onload = null; this.onerror = null; this[SRC] = ''; this[PIXELS] = null;
  }
  get src() { return this[SRC]; }
  set src(p) {
    this[SRC] = p;
    try {
      const img = readPNG(path.resolve(REPO_ROOT, String(p)));
      const rgba = new Uint8ClampedArray(img.w * img.h * 4);
      for (let i = 0; i < img.w * img.h; i++) {
        const s0 = i * img.ch;
        if (img.ch === 4) { rgba.set(img.data.subarray(s0, s0 + 4), i * 4); continue; }
        const r = img.data[s0], g = img.ch >= 3 ? img.data[s0 + 1] : r, b = img.ch >= 3 ? img.data[s0 + 2] : r;
        rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
      }
      this[PIXELS] = rgba;
      this.width = this.naturalWidth = img.w;
      this.height = this.naturalHeight = img.h;
      this.complete = true;
      if (this.onload) queueMicrotask(() => this.onload());
    } catch (e) {
      this.complete = true;
      if (this.onerror) queueMicrotask(() => this.onerror(e));
    }
  }
}
toolsOnly(HeadlessImage.prototype, 'image', 'data', PIXELS);
toolsOnly(HeadlessImage.prototype, 'image', '_src', SRC);

// --- PNG ---------------------------------------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encode a HeadlessCanvas as a PNG buffer. */
export function encodePNG(canvas) {
  const w = canvas.width, h = canvas.height, data = pixelsOf(canvas);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       // filter: none
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = data[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Scale a canvas up by a whole number, nearest-neighbour, for legibility. */
export function upscale(canvas, k) {
  const out = new HeadlessCanvas(canvas.width * k, canvas.height * k);
  const od = out[PIXELS], cd = pixelsOf(canvas);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = (Math.floor(y / k) * canvas.width + Math.floor(x / k)) * 4;
      const d = (y * out.width + x) * 4;
      od[d] = cd[s];
      od[d + 1] = cd[s + 1];
      od[d + 2] = cd[s + 2];
      od[d + 3] = cd[s + 3];
    }
  }
  return out;
}
