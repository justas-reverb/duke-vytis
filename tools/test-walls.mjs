// The side walls against the brief: every zone painted, seamless, quieter than its ledges.
//
//   node tools/test-walls.mjs            checks, and a table of the numbers behind them
//
// WHAT IT HOLDS EACH ZONE TO (src/render/wallpaint/<zone>.js, drawn by src/render/walls.js)
//
//   PAINTED      every zone in THEMES has its own painter; none borrows another's.
//   SHAPE        WALL 64 x 128 and FACE 8 x 128, as the artist's brief asks, fully opaque:
//                walls.js crossfades a zone change by drawing one wall over the other at the
//                blend, which is an exact crossfade only between opaque drawings.
//   SEAMLESS     the tile repeats up the shaft forever and sideways as it widens, the face up
//                the shaft. The difference across each seam (last row to first, last column
//                to first) may not exceed the 98th percentile of the differences between
//                neighbouring rows or columns INSIDE the tile: a seam is then no more visible
//                than the joints in the drawing. (An equality test would fail every honest
//                course of brick that crosses the edge; at the 95th a continuous root bank
//                failed by chance, its wrap row pair being one of the sharper ones.)
//   QUIETER      nothing on the wall brighter than the zone's ledge top -- the 95th percentile
//                luma of the ledge tile's standing surface and the two rows under it, or, on
//                COSMOS's night-dark slab, its stars -- and the wall's body darker again: its
//                99th percentile under 90% of that.
//   NOT A LEDGE  no lit line across the wall. In every row of the tile, the longest run of
//                lit-line pixels -- 10 luma over the tile's mean AND at least 6 luma brighter
//                than the pixels two rows above and two below them: a thin lit row, which is
//                what a ledge's standing surface is at a glance -- is under 3/8 of the tile
//                (24 px); and no row's mean stands more than 12 luma above the tile's mean.
//                A lit horizontal across the wall is a ledge to the eye.
//   A RIM        the face's brightest column is brighter than the wall's body (its 90th
//                percentile), so the edge the Duke hits reads as a line at speed.
//   CLEAN        lone pixels -- a colour none of its eight neighbours share -- under 2% of the
//                tile. A wall of specks reads as noise, not as brick or bark.
//   COST         the strip for a zone builds in under 25 ms cold (headless, pessimistic).
//   SEEDED       a renamed zone (DOWNTOWN, once VILLAGE) is still painted from its old name's
//                stream, so the rename did not re-roll its wall (see below).

import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const { THEMES } = await import('../src/game/themes.js');
const { WALL_PAINTERS } = await import('../src/render/wallpaint/index.js');
const { luma, WALL_W, WALL_H, FACE_W } = await import('../src/render/wallpaint/util.js');
const W = await import('../src/render/walls.js');
const { ZONES, HEAD } = await import('../src/render/platart.js');

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log('  FAIL  ' + msg); }
  return cond;
};

const L = (p, x, y) => {
  const i = (y * p.w + x) * 4;
  return 0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2];
};
const pct = (arr, q) => {
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
};
const diffRow = (p, y0, y1) => {
  let s = 0;
  for (let x = 0; x < p.w; x++) {
    const a = (y0 * p.w + x) * 4, b = (y1 * p.w + x) * 4;
    s += Math.abs(p.data[a] - p.data[b]) + Math.abs(p.data[a + 1] - p.data[b + 1]) + Math.abs(p.data[a + 2] - p.data[b + 2]);
  }
  return s / (3 * p.w);
};
const diffCol = (p, x0, x1) => {
  let s = 0;
  for (let y = 0; y < p.h; y++) {
    const a = (y * p.w + x0) * 4, b = (y * p.w + x1) * 4;
    s += Math.abs(p.data[a] - p.data[b]) + Math.abs(p.data[a + 1] - p.data[b + 1]) + Math.abs(p.data[a + 2] - p.data[b + 2]);
  }
  return s / (3 * p.h);
};

/**
 * The zone's ledge top: p95 luma of the standing surface row and the two under it. Where
 * that surface is itself dark -- COSMOS's ledge is a slab of night sky, luma 42 at the top,
 * that reads by the stars in it -- the ledge's bright is its stars: p99 of the whole cell.
 */
function ledgeTop(name) {
  // Each zone's keys are its own (`pal` on the zone), not one palette for the sheet.
  const z = ZONES[name];
  const pal = z.pal;
  const v = [], all = [];
  for (let y = 0; y < z.tile.length; y++) {
    const row = (z.left[y] || '') + (z.tile[y] || '') + (z.right[y] || '');
    for (const k of row) {
      if (!k || k === '.' || !pal[k]) continue;
      all.push(luma(pal[k]));
      if (y >= HEAD && y <= HEAD + 2) v.push(luma(pal[k]));
    }
  }
  const top = pct(v, 0.95);
  return top < 60 ? pct(all, 0.99) : top;
}

function seams(p, vertOnly) {
  const inner = [];
  for (let y = 0; y + 1 < p.h; y++) inner.push(diffRow(p, y, y + 1));
  const out = { v: diffRow(p, p.h - 1, 0), vLim: pct(inner, 0.98) };
  if (!vertOnly) {
    const ic = [];
    for (let x = 0; x + 1 < p.w; x++) ic.push(diffCol(p, x, x + 1));
    out.h = diffCol(p, p.w - 1, 0);
    out.hLim = pct(ic, 0.98);
  }
  return out;
}

function lone(p) {
  let n = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      let same = false;
      for (let dy = -1; dy <= 1 && !same; dy++) {
        for (let dx = -1; dx <= 1 && !same; dx++) {
          if (!dx && !dy) continue;
          const xx = (x + dx + p.w) % p.w, yy = (y + dy + p.h) % p.h;
          const j = (yy * p.w + xx) * 4;
          if (p.data[j] === p.data[i] && p.data[j + 1] === p.data[i + 1] && p.data[j + 2] === p.data[i + 2]) same = true;
        }
      }
      if (!same) n++;
    }
  }
  return n / (p.w * p.h);
}

console.log('zone        ledge  wall p50 p99  max | face rim | row+ runs | seams v/h (lim)        | lone  | ms   runs');
for (const th of THEMES) {
  const name = th.name;
  ok(!!WALL_PAINTERS[name], `${name}: no painter of its own`);
  if (!WALL_PAINTERS[name]) continue;
  W.resetWalls();
  W.wallStrip(th);
  const cost = W.wallStats(name);
  const { wall, face } = W.paintWall(th);

  ok(wall.w === WALL_W && wall.h === WALL_H, `${name}: wall is ${wall.w} x ${wall.h}, not 64 x 128`);
  ok(face.w === FACE_W && face.h === WALL_H, `${name}: face is ${face.w} x ${face.h}, not 8 x 128`);
  let clear = 0;
  for (const p of [wall, face]) for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255) clear++;
  ok(clear === 0, `${name}: ${clear} pixels not opaque`);

  const lw = [], lf = [];
  for (let y = 0; y < WALL_H; y++) {
    for (let x = 0; x < WALL_W; x++) lw.push(L(wall, x, y));
    for (let x = 0; x < FACE_W; x++) lf.push(L(face, x, y));
  }
  const top = ledgeTop(name);
  const wMax = Math.max(...lw), fMax = Math.max(...lf);
  const w50 = pct(lw, 0.5), w90 = pct(lw, 0.9), w99 = pct(lw, 0.99);
  ok(Math.max(wMax, fMax) < top, `${name}: brightest wall pixel ${Math.max(wMax, fMax).toFixed(0)} not under the ledge top ${top.toFixed(0)}`);
  ok(w99 < 0.9 * top, `${name}: wall p99 ${w99.toFixed(0)} not under 90% of the ledge top (${(0.9 * top).toFixed(0)})`);

  // Not a ledge: rows.
  const mean = lw.reduce((a, b) => a + b, 0) / lw.length;
  let rowExcess = 0, longest = 0;
  for (let y = 0; y < WALL_H; y++) {
    let s = 0, run = 0;
    // Wrapped: a run may cross the tile's side edge, as it would on screen.
    for (let x = 0; x < 2 * WALL_W; x++) {
      const v = L(wall, x % WALL_W, y);
      if (x < WALL_W) s += v;
      // A lit LINE: 10 luma over the wall's mean and brighter than the wall both two rows
      // above and two rows below it. A light brick is not a line, nor is the dark joint
      // over it; a thin lit row standing proud of what is above and below it is.
      const over = L(wall, x % WALL_W, (y + WALL_H - 2) % WALL_H);
      const under = L(wall, x % WALL_W, (y + 2) % WALL_H);
      run = v >= mean + 10 && v >= over + 6 && v >= under + 6 ? run + 1 : 0;
      longest = Math.max(longest, Math.min(run, WALL_W));
    }
    rowExcess = Math.max(rowExcess, s / WALL_W - mean);
  }
  ok(longest < 24, `${name}: a lit run ${longest} px long in one row (limit 23)`);
  ok(rowExcess <= 12, `${name}: a row ${rowExcess.toFixed(1)} luma above the wall's mean (limit 12)`);

  // A rim: the face's brightest column against the body.
  let rim = 0;
  for (let x = 0; x < FACE_W; x++) {
    let s = 0;
    for (let y = 0; y < WALL_H; y++) s += L(face, x, y);
    rim = Math.max(rim, s / WALL_H);
  }
  ok(rim > w90, `${name}: the face's brightest column (${rim.toFixed(0)}) is no brighter than the wall (p90 ${w90.toFixed(0)})`);

  const sw = seams(wall, false), sf = seams(face, true);
  ok(sw.v <= sw.vLim + 0.5, `${name}: wall top/bottom seam ${sw.v.toFixed(1)} over ${sw.vLim.toFixed(1)}`);
  ok(sw.h <= sw.hLim + 0.5, `${name}: wall left/right seam ${sw.h.toFixed(1)} over ${sw.hLim.toFixed(1)}`);
  ok(sf.v <= sf.vLim + 0.5, `${name}: face top/bottom seam ${sf.v.toFixed(1)} over ${sf.vLim.toFixed(1)}`);

  const lo = lone(wall);
  ok(lo < 0.02, `${name}: ${(lo * 100).toFixed(1)}% lone pixels (limit 2%)`);
  ok(cost.ms < 25, `${name}: strip took ${cost.ms.toFixed(1)} ms to build (limit 25)`);

  const n0 = (v, w) => v.toFixed(0).padStart(w), n1 = (v, w = 0) => v.toFixed(1).padStart(w);
  console.log(`${name.padEnd(10)} ${n0(top, 5)}  ${n0(w50, 8)} ${n0(w99, 3)} ${n0(wMax, 4)} | `
    + `${n0(rim, 8)} | ${n1(rowExcess, 4)} ${String(longest).padStart(4)} | `
    + `${n1(sw.v)}/${n1(sw.h)} (${n1(sw.vLim)}/${n1(sw.hLim)}) face ${n1(sf.v)} (${n1(sf.vLim)}) | `
    + `${n1(lo * 100, 4)}% | ${n1(cost.ms, 4)} ${cost.runs}`);
}

// --- SEEDED: a renamed zone keeps the wall it was painted with ----------------------------
//
// The wall painters draw from a stream seeded by the zone's NAME (wallpaint/util.js wallRng),
// so renaming a zone re-rolls every patch and streak on its wall: a repaint nobody asked for,
// which every check above still passes. VILLAGE became DOWNTOWN on 2026-09-23, and walls.js
// seeds it by the old name (themes.js FORMER_NAMES and artSeed); the HUD skin's grain and
// specks (hudpaint.js) hang on the same table. Deleting that table looks like tidying and
// nothing else failed when it was emptied: the wall moved 2,049 of its 8,192 pixels and the
// HUD skin tens of thousands a frame. So the old name is written out here, and the check is
// held to biting: seeded by the new name, the same painter must draw a different wall.
{
  const { wallRng } = await import('../src/render/wallpaint/util.js');
  const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
  for (const [name, was] of [['DOWNTOWN', 'VILLAGE']]) {
    const th = THEMES.find((t) => t.name === name);
    const z = WALL_PAINTERS[name];
    if (!ok(!!th && !!z, `${name}: renamed zone missing from THEMES or WALL_PAINTERS`)) continue;
    const got = W.paintWall(th);
    const want = { wall: z.wall(wallRng(was, 'wall'), th), face: z.face(wallRng(was, 'face'), th) };
    const kept = ok(same(got.wall, want.wall) && same(got.face, want.face),
      `${name}: wall not painted from ${was}'s stream -- the rename re-rolled it (themes.js FORMER_NAMES, artSeed)`);
    const bites = ok(!same(z.wall(wallRng(name, 'wall'), th), want.wall),
      `${name}: its own name's stream paints the same wall, so the check above cannot fail`);
    if (kept && bites) console.log(`seeded: ${name}'s wall is still the one painted as ${was}`);
  }
}

// --- the runtime: drawShaftWalls through the renderer's own world transform ---------------
//
//   CROSSFADE  across a zone change the wall pixels are exactly (1 - b) A + b B, within one
//              step of rounding, at b = 0.25, 0.5 and 0.75 -- the backdrop's promise, kept
//              by the walls. (A pop at the boundary is what this rules out.)
//   SCROLL     the texture belongs to the world: raising the camera one world unit moves every
//              wall pixel down exactly zoom x PX backing pixels, at zoom 1 and zoom 2.
//   MIRROR     the right wall is the left one mirrored, pixel for pixel.
//   ART GRID   at zoom 2 every art pixel is a 2 x 2 block: nothing is resampled.
//   BLITS      a frame draws both walls in at most 6 drawImage calls, 12 during a fade.

const { VW, VH, SW, SH, PX, CX, WALL_W: WW } = await import('../src/game/constants.js');

function wallFrame(themeA, themeB, blend, camY, zoom) {
  const cv = new HeadlessCanvas(SW, SH);
  const ctx = cv.getContext('2d');
  const k = zoom * PX;
  const viewLeft = CX - (VW / zoom) / 2;
  ctx.setTransform(k, 0, 0, -k, Math.round(-viewLeft * k), Math.round(SH + camY * k));
  const half = (VW / zoom - 2 * WW) / 2;
  const game = { nextTheme: themeB, themeBlend: blend };
  W.drawShaftWalls(ctx, game, { viewLeft, viewRight: viewLeft + VW / zoom }, themeA,
    camY, camY + VH / zoom, CX - half, CX + half);
  return { cv, blits: W.wallBlits, wallPx: Math.round(WW * k) };
}

{
  const A = THEMES[1], B = THEMES[2];
  const a = wallFrame(A, null, 0, 1000, 1).cv, b = wallFrame(B, null, 0, 1000, 1).cv;
  let worst = 0;
  for (const bl of [0.25, 0.5, 0.75]) {
    const cd = wallFrame(A, B, bl, 1000, 1).cv.data, ad = a.data, bd = b.data;
    for (let i = 0; i < cd.length; i += 4) {
      if (!ad[i + 3]) continue;
      for (let ch = 0; ch < 3; ch++) {
        worst = Math.max(worst, Math.abs(cd[i + ch] - ((1 - bl) * ad[i + ch] + bl * bd[i + ch])));
      }
    }
  }
  ok(worst <= 1, `crossfade: a wall pixel ${worst.toFixed(2)} off (1 - b) A + b B`);
  console.log(`\ncrossfade DUNGEON -> FOREST at 0.25/0.5/0.75: worst pixel ${worst.toFixed(2)} off the exact mix`);
}

for (const zoom of [1, 2]) {
  const th = THEMES[0];
  const f0 = wallFrame(th, null, 0, 1000, zoom), f1 = wallFrame(th, null, 0, 1001, zoom);
  const k = zoom * PX, ww = f0.wallPx;
  let moved = 0, n = 0, mirror = 0, grid = 0;
  const d0 = f0.cv.data, d1 = f1.cv.data;
  for (let y = 0; y < SH - k; y++) {
    for (let x = 0; x < ww; x++) {
      const i = (y * SW + x) * 4, j = ((y + k) * SW + x) * 4;   // one world unit up: k px down
      n++;
      if (d1[j] !== d0[i] || d1[j + 1] !== d0[i + 1]) moved++;
      const m = (y * SW + (SW - 1 - x)) * 4;
      if (d0[m] !== d0[i] || d0[m + 2] !== d0[i + 2]) mirror++;
      if (zoom === 2) {
        const q = ((y - (y % 2)) * SW + (x - (x % 2))) * 4;
        if (d0[q] !== d0[i] || d0[q + 1] !== d0[i + 1]) grid++;
      }
    }
  }
  ok(moved === 0, `zoom ${zoom}: ${moved} of ${n} wall pixels did not move with the world`);
  ok(mirror === 0, `zoom ${zoom}: ${mirror} right-wall pixels are not the left wall mirrored`);
  ok(grid === 0, `zoom ${zoom}: ${grid} wall pixels off the 2 x 2 art grid`);
  ok(f0.blits <= 6, `zoom ${zoom}: ${f0.blits} drawImage calls for the walls (limit 6)`);
  const fade = wallFrame(th, THEMES[1], 0.5, 1000, zoom).blits;
  ok(fade <= 12, `zoom ${zoom}: ${fade} drawImage calls during a fade (limit 12)`);
  console.log(`zoom ${zoom}: ${ww} px of wall a side; scroll ${moved}/${n} off, mirror ${mirror} off, `
    + `grid ${grid} off; ${f0.blits} blits a frame, ${fade} in a fade`);
}

//   WARM       the next zone's strip is painted while this zone is on screen, after it has been
//              for a moment (walls.js WARM_AFTER frames), and not in the fade's first frame.
{
  W.resetWalls();
  const A = THEMES[3], B = THEMES[4];
  let at = -1;
  for (let f = 1; f <= 400 && at < 0; f++) {
    wallFrame(A, B, 0, 1000 + f, 1);
    if (W.wallStats(B.name)) at = f;
  }
  ok(at > 60 && at < 400, `warm: the next zone was painted at frame ${at} (want after the arrival, before 400)`);
  const t0 = performance.now();
  wallFrame(A, B, 0.1, 5000, 1);
  const first = performance.now() - t0;
  console.log(`warm: ${B.name} painted ahead at frame ${at} of ${A.name}; first fade frame drew in ${first.toFixed(1)} ms`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall side walls pass');
process.exit(fails ? 1 : 0);
