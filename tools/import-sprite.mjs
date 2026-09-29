// Turn a reference sprite sheet into the art arrays sprites.js uses.
//
//   node tools/import-sprite.mjs ref.png                    report what it finds
//   node tools/import-sprite.mjs ref.png --emit > art.js    emit the art arrays
//   node tools/import-sprite.mjs ref.png --quantize=24      salvage a LOSSY sheet
//
//   --grid=6x2      cut a fixed grid instead of splitting on gaps
//   --cells=10      take the N largest blobs as the frames, in reading order
//   --boxes=x,y,w,h;...  name every frame's rectangle outright (the Duke's sheet)
//   --height=212    SMOOTH path: resample onto a cell this many pixels tall
//   --idle=130      ...scaled so the FIRST frame stands this tall (a cast, one scale)
//   --colours=36    size of the palette built from the art when there is no --palette
//   --bgtol=28      per-channel distance from the corner colour that counts as backdrop
//   --bgchroma=10   ...and the HUE distance too; see BG_CHROMA below. Per sheet
//   --open=400      also clear ENCLOSED backdrop pockets of at least N source pixels,
//                   such as the inside of a drawn bow. See OPEN below. Per sheet
//   --palette=FILE  snap every colour to the PAL exported by FILE
//
// The exact command for each sheet in the game is written into the head of the module it
// generated, so a re-import never has to be reconstructed from a doc that has drifted.
//
// WHY THIS EXISTS, and why it is not a person typing pixels in.
//
// Hand-transcribing a 55x76 sprite is 4,180 characters per frame, and six frames is
// twenty-five thousand. This project has measured, repeatedly, what happens when
// grid-shaped art is produced a character at a time: the local model cannot do it at
// all, and neither can I reliably -- a beard came out as chainmail, an outline came out
// as floating dots, a nose came out as a finger. Every one of those was a hand-authored
// grid that looked right in a text editor.
//
// So the pixels are READ, not retyped. The reference is the source of truth and this is
// a lossless path from it to the game, which means the sprite in the game is the sprite
// that was drawn, not my impression of it.
//
// THE 5x GRID. The sheet arrives nearest-neighbour upscaled 5x -- measured, not
// assumed: 67.8% of horizontal runs are exactly 5 px and almost every other run is a
// multiple of 5. Each 5x5 cell is collapsed by MAJORITY VOTE rather than by sampling
// its top-left pixel, because the upscale is very slightly off-grid in places and a
// point sample lands on the wrong side of an edge about one time in fifty.
//
// LOSSY SHEETS. Majority vote assumes the 25 pixels of a cell agree. Save the same
// sheet as lossy WebP and they do not: the companion sheet came back with 91% of its
// horizontal runs one pixel long and 35,563 distinct colours, because the codec put
// slightly different values on every pixel of every block. There is no majority to
// find and the import produced 52 near-duplicate whites.
//
// --quantize=N collapses by MEAN instead, then merges colours together until at most N
// remain, most-populous first. It recovers clean art from a mangled sheet -- but it is
// a repair, not a substitute for being sent lossless PNG.
//
// SMOOTH SHEETS. A harder case than lossy: art that was never on a pixel grid at all.
// The second Duke sheet arrived as a high-resolution illustration in a pixel-art STYLE
// -- 41,795 colours, no block structure at any zoom, every edge anti-aliased. Collapsing
// it by any factor just gives a smaller smooth image.
//
// --height + --palette is the path for those. Each frame is area-averaged down to the
// target height and every resulting colour is SNAPPED to an existing palette, which is
// what re-hardens the edges: a gradient across four pixels becomes two pixels of one
// colour and two of the next, which is what pixel art is. Snapping to the palette of
// the sheet already in the game also makes the two match, which no amount of prompting
// reliably achieves.

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SS = 5;                       // the sheet's upscale factor

// How close to the backdrop colour still counts as backdrop.
//
// This number is the whole game. The artist outlined the character in #131020 and set
// the backdrop to #171229 -- 4, 2 and 9 apart on R, G and B. At 14 the outline is
// classed as empty and the character imports with NO EDGES AT ALL. At 6 the outline
// survives (9 > 6) and every backdrop resampling artefact on the sheet -- #171625,
// #17122a, #131226, all within 4 -- is still absorbed.
//
// A flood fill from the border was tried first and is worse, not better: it keeps
// anything the border cannot reach, so the gaps between the sword and the body, and
// the holes inside the crown, import as solid backdrop-coloured blocks instead of as
// transparency.
const BG_TOLERANCE = 6;

import { readPNG } from './pngread.mjs';

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const luma = (h) => {
  const n = parseInt(h.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

// --- collapse the 5x upscale ------------------------------------------------

/** Mean of a cell. Robust to per-pixel codec noise in a way majority vote is not. */
function meanCell(img, x, y) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let j = 0; j < SS; j++) {
    for (let i = 0; i < SS; i++) {
      const sx = x * SS + i, sy = y * SS + j;
      if (sx >= img.w || sy >= img.h) continue;
      const o = (sy * img.w + sx) * img.ch;
      r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2]; n++;
    }
  }
  return hex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
}

const dist = (a, b) => {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return Math.abs(((x >> 16) & 255) - ((y >> 16) & 255))
    + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255))
    + Math.abs((x & 255) - (y & 255));
};

/**
 * Merge a noisy colour set down to at most `target` colours.
 *
 * Agglomerative and population-ordered: the most-used colour is kept, anything within
 * `d` of it collapses into it, and `d` widens until few enough survive. Keeping the
 * POPULOUS one as the representative matters -- the true colour of a flat region is the
 * one most of it still has, and the codec's smears around the edges are the minority.
 */
function quantize(grid, target) {
  const tally = new Map();
  for (const row of grid) for (const c of row) tally.set(c, (tally.get(c) || 0) + 1);
  const byPop = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  let keep = [], map = new Map();
  for (let d = 0; d <= 160; d += 4) {
    keep = []; map = new Map();
    for (const c of byPop) {
      const hit = keep.find((k) => dist(c, k) <= d);
      if (hit) map.set(c, hit);
      else { keep.push(c); map.set(c, c); }
    }
    if (keep.length <= target) break;
  }
  return { grid: grid.map((row) => row.map((c) => map.get(c) || c)), colours: keep.length };
}

function toNative(img) {
  const nw = Math.floor(img.w / SS), nh = Math.floor(img.h / SS);
  const grid = [];
  for (let y = 0; y < nh; y++) {
    const row = [];
    for (let x = 0; x < nw; x++) {
      const tally = new Map();
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const sx = x * SS + i, sy = y * SS + j;
          if (sx >= img.w || sy >= img.h) continue;
          const o = (sy * img.w + sx) * img.ch;
          const k = hex(img.data[o], img.data[o + 1], img.data[o + 2]);
          tally.set(k, (tally.get(k) || 0) + 1);
        }
      }
      row.push([...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    }
    grid.push(row);
  }
  return grid;
}

/** The backdrop is whatever colour occupies the most of the sheet. */
function backdropOf(grid) {
  const tally = new Map();
  for (const row of grid) for (const c of row) tally.set(c, (tally.get(c) || 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const near = (a, b, tol) => {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return Math.abs(((x >> 16) & 255) - ((y >> 16) & 255)) <= tol
    && Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) <= tol
    && Math.abs((x & 255) - (y & 255)) <= tol;
};

/** Split the sheet into frames on empty columns and rows. */
function segment(grid, bg) {
  const h = grid.length, w = grid[0].length;
  const solid = grid.map((row) => row.map((c) => !near(c, bg, BG_TOLERANCE)));
  const bands = (n, occupied) => {
    const out = [];
    let start = -1;
    for (let i = 0; i < n; i++) {
      if (occupied(i)) { if (start < 0) start = i; }
      else if (start >= 0) { out.push([start, i - 1]); start = -1; }
    }
    if (start >= 0) out.push([start, n - 1]);
    return out;
  };
  const rows = bands(h, (y) => solid[y].some(Boolean));
  const cols = bands(w, (x) => solid.some((r) => r[x]));
  const frames = [];
  for (const [y0, y1] of rows) {
    for (const [x0, x1] of cols) {
      // Tighten to this frame's own content, not the whole band's.
      let ax = x1, ay = y1, bx = x0, by = y0, any = false;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!solid[y][x]) continue;
          any = true;
          if (x < ax) ax = x; if (x > bx) bx = x;
          if (y < ay) ay = y; if (y > by) by = y;
        }
      }
      if (any) frames.push({ x0: ax, y0: ay, w: bx - ax + 1, h: by - ay + 1, band: rows.indexOf([y0, y1]) });
    }
  }
  return { frames, rows, cols, solid };
}

/**
 * Split the sheet into frames by CONNECTED COMPONENTS instead of by empty columns.
 *
 * Gap-splitting needs every pose to own a column of its own. The companion sheets are
 * laid out diagonally -- a run of poses stepping up and to the right -- so three of them
 * share columns and come back merged into one 138-wide frame. Components do not care
 * about the layout: two poses are separate unless they actually touch.
 *
 * Loose pieces -- a pick head clear of the body, a shield that has left the arm, a
 * thrown staff -- are attached to the NEAREST BODY rather than counted as poses of their
 * own. That is the same rule the Duke's sheet needed, for the same reason: a companion
 * dropping their gear mid-tumble is one frame, not two.
 */
function componentSegment(solid, want) {
  const h = solid.length, w = solid[0].length;
  const seen = solid.map((r) => r.map(() => false));
  const blobs = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid[y][x] || seen[y][x]) continue;
      const stack = [[x, y]];
      seen[y][x] = true;
      let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
      const cells = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        cells.push([cx, cy]);
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (!solid[ny][nx] || seen[ny][nx]) continue;
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
      blobs.push({ x0, y0, x1, y1, n, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
  }
  if (!blobs.length) return [];

  // The bodies are the `want` largest; everything else is a loose piece.
  const bySize = blobs.slice().sort((a, b) => b.n - a.n);
  const bodies = bySize.slice(0, want).map((b) => ({ ...b }));
  const loose = bySize.slice(want);
  for (const piece of loose) {
    let best = null, bestD = Infinity;
    for (const b of bodies) {
      const d = Math.hypot(piece.cx - b.cx, piece.cy - b.cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) continue;
    best.x0 = Math.min(best.x0, piece.x0); best.x1 = Math.max(best.x1, piece.x1);
    best.y0 = Math.min(best.y0, piece.y0); best.y1 = Math.max(best.y1, piece.y1);
  }
  bodies.sort((a, b) => a.cx - b.cx);
  return bodies.map((b) => ({ x0: b.x0, y0: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, band: 0 }));
}

// --- run it -----------------------------------------------------------------
const file = process.argv[2];
const emit = process.argv.includes('--emit');
const flagOf = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
if (!file) {
  console.error('usage: node tools/import-sprite.mjs <sheet.png> [--emit]');
  process.exit(2);
}

const QUANT = Number(String(flagOf('quantize') || 0)) || 0;
const GRID = flagOf('grid');
const CELLS = Number(flagOf('cells')) || 0;
// --boxes=x,y,w,h;... names the cells OUTRIGHT, in source pixels.
//
// The last resort, and sometimes the only one. Both automatic segmenters answer the
// question "which blobs belong together" with a rule -- largest N, or nearer than D --
// and a sheet exists where no rule is right: the third Duke sheet has poses whose limbs
// cross into the next drawing's box, and a death row where a dropped shield sits closer
// to the NEXT pose's body than to the man it fell from. Measured, not guessed: the boxes
// are computed from the sheet's own blobs and recorded in assets/vytis-sheet-boxes.txt,
// explained in docs/ART-PIPELINE.md, so they can be re-derived rather than re-invented.
const BOXES = String(flagOf('boxes') || '').split(';').filter(Boolean)
  .map((b) => b.split(',').map(Number));
const PAL_N = Number(flagOf('colours')) || 20;
const BG_TOL = Number(flagOf('bgtol')) || 18;
// How far a pixel's HUE may sit from the backdrop's and still count as backdrop, as the
// distance between the two colours once each has had its own grey removed. Off unless given.
//
// A per-channel tolerance is a box around the backdrop colour, and a dark backdrop's box
// contains every dark colour there is. The Duke's sheet is on navy (15,10,39); at the
// tolerance the JPEG noise needs, (28,26,25) -- the darkest steel in the shadow under his
// pauldrons -- is inside it on all three channels. The border's flood fill came in through
// the outline, found that shadow, and followed it down both sides of his tabard: the
// front-facing idle imported with a hole through the armour on the left and on the right,
// and the game drew the backdrop through him. Shadowed steel is GREY and the backdrop is
// BLUE, and that difference survives any amount of darkness, where a brightness test does
// not. The Duke, the archer and the hooded king are imported at 10: every shade of the
// navy sits within that of the corner, and neutral darks sit 20 and more away. 14 still
// let the tabard's navy folds leak in the fall pose, because they share the backdrop's
// hue; 7 is so tight that the JPEG noise in the REAL gaps between limbs stops counting as
// backdrop and those gaps fill with dark. The delver's sheet is imported without it --
// there the gate breaks segmentation, two poses merging and one collapsing to 23 pixels.
const BG_CHROMA = Number(flagOf('bgchroma')) || Infinity;
// ENCLOSED BACKDROP THAT IS STILL BACKDROP. The flood from the border keeps anything it
// cannot reach, on purpose -- that is what stops a backdrop-coloured glint inside the
// armour becoming a hole. But a drawn bow closes a region off with its string, and the
// archer imported with the space between bow and string solid navy, a dark shape in his
// hand in every pose that carries the bow. --open=N clears an enclosed pocket only when
// EVERY pixel of it passes the backdrop test (value and hue) and it is at least N source
// pixels: a region that big and that uniform is the sheet showing through, not a glint.
// Off unless given, and given only for the sheet that needs it. What it clears is counted
// per frame into OPENED in the emitted module, so tools/test-sprites.mjs can tell a hole
// that was opened on purpose from one that leaked.
const OPEN = Number(flagOf('open')) || 0;
const IDLE = Number(flagOf('idle')) || 0;
const HEIGHT = Number(String(flagOf('height') || 0)) || 0;
const PALFILE = flagOf('palette');
const img = readPNG(file);

// --- the smooth path -----------------------------------------------------------
//
// Runs instead of everything below when --height is given. Art that was never on a
// pixel grid cannot be collapsed onto one; it has to be resampled onto one and then
// have its colours snapped, which is what turns a gradient back into an edge.
if (HEIGHT) {
  const raw = (x, y) => {
    const i = (y * img.w + x) * img.ch;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const corner = raw(2, 2);
  // Each colour minus its own mean: what is left is the hue, with the brightness gone.
  const chromaDist = (a, b) => {
    const ma = (a[0] + a[1] + a[2]) / 3, mb = (b[0] + b[1] + b[2]) / 3;
    return Math.hypot(a[0] - ma - (b[0] - mb), a[1] - ma - (b[1] - mb), a[2] - ma - (b[2] - mb));
  };
  const looksBg = (x, y) => {
    const c = raw(x, y);
    // Tolerance is tunable because a JPEG background is not one colour. At 18 the
    // codec's noise left faint bridges between poses and two of them came back as a
    // single blob -- nine frames out of ten, with no other symptom.
    if (!(Math.abs(c[0] - corner[0]) < BG_TOL && Math.abs(c[1] - corner[1]) < BG_TOL
      && Math.abs(c[2] - corner[2]) < BG_TOL)) return false;
    if (BG_CHROMA === Infinity) return true;
    return chromaDist(c, corner) < BG_CHROMA;
  };

  // BACKGROUND IS WHAT THE BORDER CAN REACH, not what matches a colour.
  //
  // A colour test alone punches HOLES in the character. An image generator asked for a
  // specific background colour treats it as part of its palette and scatters it through
  // the art -- ask for magenta and you get magenta glints on the armour, every one of
  // which a colour test then reads as empty. That is not hypothetical: it is what came
  // back the first time this brief specified a chroma key.
  //
  // Flood fill from the border cannot do that. A stray background-coloured pixel inside
  // the silhouette is enclosed, so it stays. The cost is that a genuine enclosed gap --
  // between an arm and the body, say -- comes through opaque instead of transparent,
  // which against this game's dark backdrop is close to invisible. Holes in the
  // character are not.
  const outside = new Uint8Array(img.w * img.h);
  {
    const stack = [];
    for (let x = 0; x < img.w; x++) { stack.push(x, 0, x, img.h - 1); }
    for (let y = 0; y < img.h; y++) { stack.push(0, y, img.w - 1, y); }
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = y * img.w + x;
      if (outside[i] || !looksBg(x, y)) continue;
      outside[i] = 1;
      stack.push(x - 1, y, x + 1, y, x, y - 1, x, y + 1);
    }
  }
  const opened = new Uint8Array(img.w * img.h);
  if (OPEN > 0) {
    const seen = new Uint8Array(img.w * img.h);
    for (let y0 = 0; y0 < img.h; y0++) {
      for (let x0 = 0; x0 < img.w; x0++) {
        const i0 = y0 * img.w + x0;
        if (outside[i0] || seen[i0] || !looksBg(x0, y0)) continue;
        const pocket = [];
        const stack = [x0, y0];
        seen[i0] = 1;
        while (stack.length) {
          const y = stack.pop(), x = stack.pop();
          pocket.push(y * img.w + x);
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
            const ni = ny * img.w + nx;
            if (seen[ni] || outside[ni] || !looksBg(nx, ny)) continue;
            seen[ni] = 1;
            stack.push(nx, ny);
          }
        }
        if (pocket.length >= OPEN) for (const i of pocket) { outside[i] = 1; opened[i] = 1; }
      }
    }
  }
  const bgAt = (x, y) => outside[y * img.w + x] === 1;

  // CONNECTED COMPONENTS, assigned to a cell by their centroid.
  //
  // A fixed grid alone does not work and the failure is subtle: frames in a smooth sheet
  // touch, so a swung sword or a thrown crown crosses into the next cell. Cutting on the
  // grid line then does two wrong things at once -- it amputates this frame's sword AND
  // hands the stump to the neighbour, who renders a disembodied blade floating beside
  // his shield. That is exactly what came out.
  //
  // Labelling connected blobs and assigning each whole blob to the cell its CENTROID
  // falls in fixes both directions. A sword attached to the Duke travels with him
  // wherever it reaches, and a neighbour's sword reaching in belongs to the neighbour.
  // A genuinely detached piece -- the crown thrown off in the backfall, the sword
  // dropped beside the splat -- lands in whichever cell it is actually over, which is
  // its own.
  const [gc, gr] = String(GRID || '1x1').split('x').map(Number);
  const cw = img.w / gc, chh = img.h / gr;
  const cellOf = (x, y) => Math.min(gr - 1, Math.floor(y / chh)) * gc + Math.min(gc - 1, Math.floor(x / cw));

  const label = new Int32Array(img.w * img.h).fill(-1);
  const comps = [];
  for (let y0 = 0; y0 < img.h; y0++) {
    for (let x0 = 0; x0 < img.w; x0++) {
      const i0 = y0 * img.w + x0;
      if (label[i0] !== -1 || bgAt(x0, y0)) continue;
      const id = comps.length;
      const c = { n: 0, sx: 0, sy: 0, minX: x0, minY: y0, maxX: x0, maxY: y0 };
      const stack = [x0, y0];
      label[i0] = id;
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        c.n++; c.sx += x; c.sy += y;
        if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x;
        if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
            const ni = ny * img.w + nx;
            if (label[ni] !== -1 || bgAt(nx, ny)) continue;
            label[ni] = id;
            stack.push(nx, ny);
          }
        }
      }
      comps.push(c);
    }
  }

  const compCellExplicit = comps.map(() => -1);

  // Specks are resampling noise, not art.
  const biggest = Math.max(...comps.map((c) => c.n));
  const live = comps.map((c, i2) => ({ c, i2 })).filter(({ c }) => c.n >= biggest / 1000);

  // The BODIES are the largest blobs, one per cell, and they own their centroid's cell.
  // Everything else -- a thrown crown, a dropped sword, a detached gauntlet -- attaches
  // to the nearest BODY rather than to whatever cell it happens to float over.
  //
  // Its own centroid is not good enough: the crown knocked off beside the splat lies far
  // enough to the right that it fell in the next frame's cell and rendered as a stray
  // crown at that Duke's feet. A loose piece belongs to the man it came off.
  // How many frames to find, and how a body claims one of them.
  //
  // With --grid a body claims the cell its centroid falls in. With --cells there is no
  // grid to fall into: the bodies are simply the N largest blobs, ORDERED LEFT TO
  // RIGHT. That is what the companion sheets need -- they are laid out diagonally, a
  // run of poses stepping up and across, so no grid describes them and gap-splitting
  // merges the ones that share columns.
  const wantCells = BOXES.length || CELLS || gc * gr;
  const bodies = [...live].sort((a, b) => b.c.n - a.c.n).slice(0, wantCells)
    .map(({ c, i2 }) => ({ i2, x: c.sx / c.n, y: c.sy / c.n, h: c.maxY - c.minY + 1, cell: 0 }));
  if (BOXES.length) {
    // Every blob goes to the box it sits in. Boxes may overlap -- a dropped shield and a
    // severed arm can share a rectangle without sharing a pose -- so a blob inside more
    // than one goes to the nearest CENTRE, and a blob inside none goes to the nearest
    // centre as well. Nothing is discarded: a silently dropped blob is a limb that simply
    // is not in the game.
    for (const { c, i2 } of live) {
      const x = c.sx / c.n, y = c.sy / c.n;
      let best = 0, bd = Infinity;
      BOXES.forEach((b, k) => {
        const inside = x >= b[0] && y >= b[1] && x < b[0] + b[2] && y < b[1] + b[3];
        const d = (b[0] + b[2] / 2 - x) ** 2 + (b[1] + b[3] / 2 - y) ** 2;
        const score = inside ? d : d + 1e9;
        if (score < bd) { bd = score; best = k; }
      });
      compCellExplicit[i2] = best;
    }
  } else if (CELLS) {
    // READING ORDER: rows top to bottom, then left to right within each row.
    //
    // Sorting by x alone is right for a sheet laid out in one line and wrong for one in
    // two, where it interleaves the rows -- the archer's ten poses came back as eight,
    // with a top and a bottom pose merged into one cell. A new row starts wherever the
    // vertical gap between bodies exceeds half a body height, which no sheet's own line
    // spacing ever does.
    const byY = [...bodies].sort((a, b) => a.y - b.y);
    const typical = byY[Math.floor(byY.length / 2)].h;
    const rows2 = [[byY[0]]];
    for (let i2 = 1; i2 < byY.length; i2++) {
      if (byY[i2].y - byY[i2 - 1].y > typical * 0.5) rows2.push([]);
      rows2[rows2.length - 1].push(byY[i2]);
    }
    let n2 = 0;
    for (const r of rows2) {
      r.sort((a, b) => a.x - b.x);
      for (const b of r) b.cell = n2++;
    }
  } else {
    for (const b of bodies) b.cell = cellOf(b.x, b.y);
  }

  const compCell = BOXES.length ? compCellExplicit.slice() : comps.map(() => -1);
  if (!BOXES.length) for (const b of bodies) compCell[b.i2] = b.cell;
  for (const { c, i2 } of live) {
    if (compCell[i2] !== -1) continue;
    const x = c.sx / c.n, y = c.sy / c.n;
    let best = bodies[0], bd = Infinity;
    for (const b of bodies) {
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    compCell[i2] = best.cell;
  }

  const cells = [];
  for (let k = 0; k < wantCells; k++) {
    const mine = comps.map((c, i2) => (compCell[i2] === k ? c : null)).filter(Boolean);
    if (!mine.length) continue;
    cells.push({
      x: Math.min(...mine.map((c) => c.minX)),
      y: Math.min(...mine.map((c) => c.minY)),
      w: Math.max(...mine.map((c) => c.maxX)) - Math.min(...mine.map((c) => c.minX)) + 1,
      h: Math.max(...mine.map((c) => c.maxY)) - Math.min(...mine.map((c) => c.minY)) + 1,
      key: k,
    });
  }
  // A pixel belongs to a frame only if its BLOB does. Bounding boxes overlap; ownership
  // does not, and ownership is what decides whether a pixel is drawn.
  const ownedBy = (x, y, key) => {
    const l = label[y * img.w + x];
    return l !== -1 && compCell[l] === key;
  };

  // The palette to snap to. Borrowing the one already in the game is what makes an
  // imported sheet match the sheet beside it.
  let palette = null;
  if (PALFILE) {
    const mod = await import(pathToFileURL(path.resolve(PALFILE)).href);
    palette = Object.entries(mod.PAL).map(([k, h]) => {
      const n = parseInt(h.slice(1), 16);
      return { key: k, hex: h, rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255] };
    });
  }
  // With no --palette, build one FROM THE ART: every frame's pixels, merged down to
  // PAL_N colours most-populous-first. Borrowing the game's existing palette is right
  // when the new art has to sit beside the old; the companions are all being replaced
  // at once and each has colours of its own.
  if (!palette) {
    const tally2 = new Map();
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        if (bgAt(x, y)) continue;
        const c = raw(x, y);
        const hex = '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        tally2.set(hex, (tally2.get(hex) || 0) + 1);
      }
    }
    // MERGE BEFORE TAKING THE TOP N. A JPEG puts a slightly different value on nearly
    // every pixel, so the most-populous twenty colours off a lossy sheet are twenty
    // shades of the same near-black halo round the silhouette and the art gets none of
    // them. Colours within MERGE_D of one already kept are folded into it.
    const MERGE_D = 34;
    const keep = [];
    for (const [hex, n] of [...tally2.entries()].sort((a, b) => b[1] - a[1])) {
      const v = parseInt(hex.slice(1), 16);
      const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      let merged = false;
      for (const k of keep) {
        const d = Math.hypot(k.rgb[0] - rgb[0], k.rgb[1] - rgb[1], k.rgb[2] - rgb[2]);
        if (d < MERGE_D) { k.n += n; merged = true; break; }
      }
      if (merged) continue;
      keep.push({ hex, n, rgb });
      if (keep.length >= PAL_N) break;
    }
    const KEYS2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    palette = keep.map((k, i2) => ({ key: KEYS2[i2], hex: k.hex, rgb: k.rgb }));
  }

  const snap = (r, g, b) => {
    let best = palette[0], bd = Infinity;
    for (const p2 of palette) {
      const d = (p2.rgb[0] - r) ** 2 + (p2.rgb[1] - g) ** 2 + (p2.rgb[2] - b) ** 2;
      if (d < bd) { bd = d; best = p2; }
    }
    return best.key;
  };

  // ONE SCALE FOR EVERY FRAME, set by the tallest.
  //
  // Scaling each frame to the target height independently is wrong and looks it: a
  // crouch, a leap and a splat are all different heights ON PURPOSE, and normalising
  // them makes the crouching Duke exactly as tall as the standing one and the splat as
  // tall as both. The tallest pose defines the cell and everything else keeps its real
  // proportion to it.
  const tallest = Math.max(...cells.map((c) => c.h));
  // --idle=N scales so the FIRST frame comes out N pixels tall, and --height is then
  // just the cell.
  //
  // Scaling by the tallest frame is right for one sheet and wrong across six: each
  // companion sheet was drawn at its own size, so making every tallest pose the same
  // height makes the halfling exactly as tall as the shield-maiden. Their standing
  // heights are what has to agree, and the cell is whatever the biggest leap needs.
  const K = IDLE ? IDLE / cells[0].h : HEIGHT / tallest;

  const scaled = cells.map((f) => {
    const k = K;
    const tw = Math.max(1, Math.round(f.w * k));
    const th = Math.max(1, Math.round(f.h * k));
    const rows = [];
    const marks = [];     // per output pixel: 'o' where an OPENED pocket made it transparent
    // Bottom-aligned in the cell: the feet are the anchor the game positions him by.
    const top = HEIGHT - th;
    for (let y = 0; y < HEIGHT; y++) {
      let line = '';
      let mark = '';
      if (y < top) { rows.push(''); marks.push(''); continue; }
      for (let x = 0; x < tw; x++) {
        const yy0 = y - top;
        const sx0 = f.x + Math.floor(x / k), sx1 = f.x + Math.max(Math.floor(x / k) + 1, Math.ceil((x + 1) / k));
        const sy0 = f.y + Math.floor(yy0 / k), sy1 = f.y + Math.max(Math.floor(yy0 / k) + 1, Math.ceil((yy0 + 1) / k));
        let r = 0, g = 0, b = 0, n = 0, solidN = 0, openN = 0;
        for (let yy = sy0; yy < sy1 && yy < img.h; yy++) {
          for (let xx = sx0; xx < sx1 && xx < img.w; xx++) {
            n++;
            if (opened[yy * img.w + xx]) openN++;
            if (!ownedBy(xx, yy, f.key)) continue;
            const c = raw(xx, yy);
            solidN++; r += c[0]; g += c[1]; b += c[2];
          }
        }
        // A cell that is mostly backdrop becomes transparent. Averaging the backdrop in
        // would put a dark halo round every silhouette.
        line += (solidN * 2 < n) ? '.' : snap(r / solidN, g / solidN, b / solidN);
        mark += (solidN * 2 < n && openN * 2 >= n - solidN) ? 'o' : '.';
      }
      rows.push(line.replace(/\.+$/, ''));
      marks.push(mark);
    }
    // Bottom-align AFTER sampling, not before. The pre-computed top edge assumes the
    // bottom source row lands in the bottom output row, and rounding sometimes leaves
    // that last row mostly background, so it comes out empty and the frame hovers one
    // pixel. Feet on the floor is checked by test-sprites, which caught exactly that.
    let last = -1;
    for (let y = 0; y < rows.length; y++) if (rows[y].trim()) last = y;
    const drop = HEIGHT - 1 - last;
    if (last >= 0 && drop > 0) {
      for (let i2 = 0; i2 < drop; i2++) { rows.pop(); rows.unshift(''); marks.pop(); marks.unshift(''); }
    }
    return { rows, marks, w: tw };
  });

  // EVEN, always.
  //
  // drawSprite centres the sprite with `cx - BODY_W / 2`, and BODY_W is SPR_W / PX. An
  // odd SPR_W makes that half a fractional number of art pixels -- at 121 it is 15.125,
  // and (k/4 - 15.125) * PX is always k - 60.5, so the left edge lands on a HALF
  // backing-store pixel on every blit no matter how carefully the centre is snapped.
  // The browser then breaks the tie whichever way it likes, which can put the character
  // a pixel left on one machine and a pixel right on another.
  //
  // Rounding the cell up to an even width costs one transparent column and restores the
  // exact 1:1 blit the whole pipeline exists to protect.
  const W = Math.max(...scaled.map((f) => f.w)) + (Math.max(...scaled.map((f) => f.w)) % 2);
  if (!emit) {
    console.log(`sheet        ${img.w}x${img.h}  smooth path`);
    console.log(`grid         ${gc}x${gr} -> ${cells.length} frames`);
    console.log(`scale        ${K.toFixed(4)} for every frame, set by the tallest (${tallest} px)`);
    cells.forEach((f, i) => console.log(`  ${String(i).padStart(2)}  source ${f.w}x${f.h}  ->  ${scaled[i].w}x${Math.round(f.h * K)}`));
    console.log(`palette      ${palette ? `${palette.length} keys from ${PALFILE}` : 'NONE -- pass --palette'}`);
    const used = new Set();
    for (const f of scaled) for (const r of f.rows) for (const c of r) if (c !== '.') used.add(c);
    console.log(`used         ${used.size} of them`);
    process.exit(0);
  }

  const out = [];
  // The header used to say "Duke Vytis" and "the palette exported by null" on every
  // sheet it was run over, companions included. It says what was imported and HOW now:
  // the command line is the one thing a re-import needs and the one thing docs drift on.
  const cmd = ['node tools/import-sprite.mjs',
    ...process.argv.slice(2).filter((a) => a !== '--emit')
      .map((a) => (/[;\s"]/.test(a) ? `'${a}'` : a))].join(' ');
  out.push(`// ${path.basename(file)}, imported from a SMOOTH reference sheet by tools/import-sprite.mjs.`);
  out.push('//');
  out.push('// GENERATED. Re-run the importer against the sheet rather than editing this:');
  out.push('//');
  out.push(`//   ${cmd} --emit`);
  out.push('//');
  out.push('// The source was not pixel art: it was resampled to this height and every colour');
  out.push(PALFILE
    ? `// snapped to the palette exported by ${PALFILE}, which is what re-hardens the edges.`
    : `// snapped to a ${palette.length}-colour palette built from the sheet itself, which is what re-hardens the edges.`);
  out.push('');
  out.push(`export const SPR_W = ${W}, SPR_H = ${HEIGHT};`);
  out.push('');
  out.push('export const PAL = {');
  for (const p2 of palette) out.push(`  ${p2.key}: '${p2.hex}',`);
  out.push('};');
  out.push('');
  out.push('export const FRAMES = [');
  const openedPerFrame = [];
  for (const f of scaled) {
    const pad = Math.floor((W - f.w) / 2);
    out.push('  [');
    for (const r of f.rows) out.push(`    '${('.'.repeat(pad) + r).replace(/\.+$/, '')}',`);
    out.push('  ],');
    if (OPEN > 0) {
      // Flood the frame's transparency from its border, then count the opened pixels the
      // flood could not reach -- the enclosed ones, which are what a hole test sees.
      const H = f.rows.length, Wd = W;
      const solid = (x, y) => { const c = (f.rows[y] || '')[x - pad]; return !!c && c !== '.'; };
      const seen = new Uint8Array(Wd * H);
      const st = [];
      for (let x = 0; x < Wd; x++) st.push(x, 0, x, H - 1);
      for (let y = 0; y < H; y++) st.push(0, y, Wd - 1, y);
      while (st.length) {
        const y = st.pop(), x = st.pop();
        if (x < 0 || y < 0 || x >= Wd || y >= H) continue;
        const i = y * Wd + x;
        if (seen[i] || solid(x, y)) continue;
        seen[i] = 1;
        st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
      let n = 0;
      for (let y = 0; y < H; y++) {
        const m = f.marks[y] || '';
        for (let x = 0; x < m.length; x++) if (m[x] === 'o' && !seen[y * Wd + x + pad]) n++;
      }
      openedPerFrame.push(n);
    }
  }
  out.push('];');
  out.push('');
  if (OPEN > 0) {
    out.push('// Enclosed pixels per frame that --open cleared on purpose; test-sprites subtracts');
    out.push('// these from its hole count, so only a hole nobody meant still fails it.');
    out.push(`export const OPENED = [${openedPerFrame.join(', ')}];`);
    out.push('');
  }
  console.log(out.join('\n'));
  process.exit(0);
}

let grid = QUANT
  ? Array.from({ length: Math.floor(img.h / SS) }, (_, y) =>
    Array.from({ length: Math.floor(img.w / SS) }, (_, x) => meanCell(img, x, y)))
  : toNative(img);
if (QUANT) {
  const q = quantize(grid, QUANT);
  grid = q.grid;
  if (!emit) console.log(`quantised    mean-collapsed and merged to ${q.colours} colours`);
}
const bg = backdropOf(grid);
const seg = segment(grid, bg);
const solid = seg.solid;
// --cells=N segments by connected components instead of by empty columns. See
// componentSegment: a diagonal layout has poses sharing columns, and gap-splitting
// merges them.
const frames = CELLS ? componentSegment(solid, CELLS) : seg.frames;

// Palette: every colour that is not backdrop, ordered bright to dark so the key letters
// read as a ramp rather than as whatever order the scan happened to hit them in.
const tally = new Map();
for (let y = 0; y < grid.length; y++) {
  for (let x = 0; x < grid[0].length; x++) {
    if (!solid[y][x]) continue;
    const c = grid[y][x];
    tally.set(c, (tally.get(c) || 0) + 1);
  }
}
const palette = [...tally.entries()]
  .filter(([, n]) => n >= 8)                       // drop stray resample artefacts
  .sort((a, b) => luma(b[0]) - luma(a[0]))
  .map(([c, n]) => ({ hex: c, n }));

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
palette.forEach((p, i) => { p.key = KEYS[i]; });
const keyFor = new Map(palette.map((p) => [p.hex, p.key]));
const nearestKey = (c) => {
  if (keyFor.has(c)) return keyFor.get(c);
  let best = null, bd = Infinity;
  const x = parseInt(c.slice(1), 16);
  for (const p of palette) {
    const y = parseInt(p.hex.slice(1), 16);
    const d = Math.abs(((x >> 16) & 255) - ((y >> 16) & 255))
      + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255))
      + Math.abs((x & 255) - (y & 255));
    if (d < bd) { bd = d; best = p.key; }
  }
  return best;
};

if (!emit) {
  console.log(`sheet        ${img.w}x${img.h} -> native ${grid[0].length}x${grid.length} (collapsed ${SS}x)`);
  console.log(`backdrop     ${bg}`);
  console.log(`frames       ${frames.length}`);
  frames.forEach((f, i) => console.log(`  ${String(i).padStart(2)}  at ${String(f.x0).padStart(3)},${String(f.y0).padStart(3)}  ${f.w}x${f.h}`));
  const mw = Math.max(...frames.map((f) => f.w)), mh = Math.max(...frames.map((f) => f.h));
  console.log(`largest      ${mw}x${mh}  -- the cell every frame has to fit in`);
  console.log(`palette      ${palette.length} colours`);
  for (const p of palette) {
    console.log(`  ${p.key}  ${p.hex}  luma ${String(Math.round(luma(p.hex))).padStart(3)}  ${String(p.n).padStart(5)} px`);
  }
  process.exit(0);
}

// --- emit -------------------------------------------------------------------
const CELL_W = Math.max(...frames.map((f) => f.w));
const CELL_H = Math.max(...frames.map((f) => f.h));

const out = [];
out.push('// Duke Vytis, imported from the reference sheet by tools/import-sprite.mjs.');
out.push('//');
out.push('// GENERATED. Do not hand-edit: re-run the importer against the sheet instead.');
out.push('// These are the reference artist\'s pixels, collapsed from their 5x upscale by');
out.push('// majority vote and mapped onto the palette below. Nothing here was retyped.');
out.push('');
out.push(`export const SPR_W = ${CELL_W}, SPR_H = ${CELL_H};`);
out.push('');
out.push('export const PAL = {');
for (const p of palette) out.push(`  ${p.key}: '${p.hex}',   // luma ${Math.round(luma(p.hex))}`);
out.push('};');
out.push('');
out.push('export const FRAMES = [');
for (const f of frames) {
  // Bottom-aligned and horizontally centred in the cell: the feet are the anchor, the
  // same way drawSprite() places the sprite by its baseline.
  const padX = Math.floor((CELL_W - f.w) / 2);
  const padY = CELL_H - f.h;
  const rows = [];
  for (let y = 0; y < CELL_H; y++) {
    let line = '';
    for (let x = 0; x < CELL_W; x++) {
      const sy = y - padY, sx = x - padX;
      if (sy < 0 || sx < 0 || sy >= f.h || sx >= f.w) { line += '.'; continue; }
      if (!solid[f.y0 + sy][f.x0 + sx]) { line += '.'; continue; }
      line += nearestKey(grid[f.y0 + sy][f.x0 + sx]);
    }
    rows.push(line.replace(/\.+$/, ''));
  }
  out.push('  [');
  for (const r of rows) out.push(`    '${r}',`);
  out.push('  ],');
}
out.push('];');
out.push('');
console.log(out.join('\n'));
