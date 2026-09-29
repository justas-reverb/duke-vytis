// The speed trail: flat silhouettes of the Duke laid on the path he was actually drawn
// along (src/render/afterimage.js keeps the path, drawGhost in sprites.js draws a copy).
//
// Three trails came before it and each came apart from him in a way no unit test of its
// placement function saw: a row of reflections along x; copies of his CURRENT frame on a
// straight line back along -v that hung 28 units under him on a launch, anchored on the
// cell's bottom, in none of his squash or spin; a halo that sat on him but jumped with the
// ball of him at every quarter turn of the roll. So this runs the real renderer over real
// play and looks at what it drew.
//
// THE PLAY. Every frame at 160 Hz (and a pass at 60 Hz), the fixed-step simulation between
// them as the game runs it: the attract bot on floor 40 with momentum 1 -- held-jump
// launches, air-jump rolls (the tuck turns a quarter every 71 ms, about the ball's own
// middle since 1976f4a -- SPIN_PIVOT in sprites.js, and check 9; about the cell's centre,
// as it first did, the ball of him jumped 14-21 units a turn), wall bounces, descents -- a
// drop of 150 units onto a ledge, and runs both ways along the ground floor. At every rest
// zoom, 1 to 2. Both
// facings. The scenery is stubbed out of the frame (the backdrop, ledges, walls and the
// rest): only drawPlayer's calls are looked at, and they are drawn by the real draw().
//
// WHAT IT CHECKS, frame by frame:
//   1. RECORD  the newest state the trail recorded redraws his own sprite call exactly
//              (drawSprite, same matrix, same eight arguments): it is the state he was
//              DRAWN in, not one worked out beside it.
//   2. PATH    every copy lies on the path he was drawn along -- on the segment between two
//              consecutive drawn positions -- in the drawing that was on screen there (the
//              older frame's pose, facing, squash and quarter turn), never further back
//              than the last teleport, new run or switch of game.
//   3. ANCHOR  every copy's drawImage is drawSprite's for its state, bit for bit, from the
//              silhouette atlas of the same facing (FOOT_DROP, squash, spin, FRONT_FRAMES
//              refused the flip, all through the one placeCell).
//   4. CHAIN   each silhouette rasterised alone from its own recorded call: the nearest copy
//              covers at least NEAR_MIN of him, each copy overlaps or touches the one
//              before, and the farthest still covers FAR_MIN of him -- an afterimage, never
//              a second body hanging off him. "Overlaps at all" was the first bar, and it
//              passed a roll whose copies from before each quarter turn covered 2% of him
//              and landed a ball's width away: see 9. TURN.
//   5. ROLL    in the tuck, copies are drawn in quarter turns he has already left: the trail
//              curls with the roll, not every copy in his current rotation.
//   6. OFF     trails off draws no copy.
//   7. RESETS  no copy the frame after a teleport, a new run (even one that starts where he
//              stood), a switch of game (the menu's demo and the run share one renderer)
//              or a death.
//   8. SHAPE   the silhouette atlases are exactly the sprite atlases' alpha, cell for cell.
//   9. TURN    the tuck, drawn by drawSprite in each quarter turn and both facings, stays
//              where he is: its drawn box moves under half a unit from turn to turn and
//              never leaves his feet. It turned about the middle of its 63 x 53 cell, 12.4
//              units above the ball, so the ball hopped 17.5 units at every turn and the
//              trail's copies from before a turn hung a ball's width off him.
//  10. MUTANTS each check run against a build broken the way it guards against -- a copy of
//              src with one line changed, or the old straight-line trail -- and must fail.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

// One seeded stream for the whole suite, so a failure is the same failure next time.
let rs = 0x5eed1234;
Math.random = () => {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const { Game } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const C = await import('../src/game/constants.js');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

const snap = (v) => Math.round(v * C.PX) / C.PX;
const quarter = (spin) => ((Math.round(spin) % 4) + 4) % 4;
const SEED = 463284063;
const ZOOMS = [1, 1.25, 1.5, 1.75, 2];
// 4. CHAIN's bars, fractions of his silhouette. Measured over this play with the tuck
// turning about the ball: the nearest copy covers 48% of him at least (a pose change, the
// ball's copies behind an upright jump), 86-90% typically; the farthest 34% at least. Other
// seeds and 8 s of play went to 41% and 29%. With the tuck turning about its cell's centre
// they fell to 13% and 2%.
const NEAR_MIN = 0.35;
const FAR_MIN = 0.2;

/** A build of the renderer: the real src, or a mutated copy of it. */
async function build(srcDir) {
  const base = pathToFileURL(srcDir + path.sep).href;
  const R = await import(base + 'render/renderer.js');
  const S = await import(base + 'render/sprites.js');
  const A = await import(base + 'render/afterimage.js');
  const sprites = new Set([S.spriteAtlas(false), S.spriteAtlas(true)]);
  const ghosts = new Set();
  for (const f of [false, true]) for (const l of [false, true]) ghosts.add(S.ghostAtlas(f, l));
  return { R, S, A, sprites, ghosts };
}

// --- staging ------------------------------------------------------------------------------

function openShaft(g) {
  g.openness = 1;
  g.arenaEase = C.ARENA_HALF_MAX;
  g.arenaHalfView = C.ARENA_HALF_MAX;
  g.zoom = g.zoomView = 1;
  g.viewH = C.VH / g.zoom;
  g.tower.setBounds(C.PLAY_L, C.PLAY_R);
  g.player.setBounds(C.PLAY_L, C.PLAY_R);
}

/** The attract bot standing on floor 40 at momentum 1 (shot.mjs --floor), playing on. */
function botRun(floor = 40, seed = SEED) {
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.demo = true;
  game.newRun(seed);
  openShaft(game);
  game.tower.ensure(floor + 12);
  const pl = game.tower.get(floor);
  const p = game.player;
  p.x = p.px = pl.x + pl.w / 2;
  p.y = p.py = pl.y;
  p.floor = floor;
  p.momentum = 1;
  game.run.maxFloor = floor;
  game.camY = p.y - game.viewH * C.CAM_ANCHOR;
  return { game, input, drive: () => bot.step(game, STEP) };
}

/**
 * Dropped from 150 units over a column no ledge of floors 37-48 covers, no input. On the tower
 * after SEED's: SEED's own was the attract demo's flow ramp until 2026-09-29, and since a demo
 * plays the real tower its floors 37-48 cover every column of the shaft (463284064's leave
 * one at x 372).
 */
function drop() {
  const st = botRun(40, SEED + 1);
  const g = st.game, p = g.player;
  const top = g.tower.get(40).y + 150;
  let x = null;
  for (let xx = C.PLAY_L + 30; xx <= C.PLAY_R - 30 && x === null; xx += 2) {
    let clear = true;
    for (let f = 37; f <= 48 && clear; f++) {
      const pl = g.tower.get(f);
      if (pl && pl.y < top && xx > pl.x - 12 && xx < pl.x + pl.w + 12) clear = false;
    }
    if (clear) x = xx;
  }
  if (x === null) throw new Error('no clear column to drop him down');
  p.x = p.px = x;
  p.y = p.py = top;
  p.vx = 40;
  p.grounded = false;
  g.camY = p.y - 60 - g.viewH * C.CAM_ANCHOR;
  st.drive = () => { st.input.wantAxis = 0; st.input.wantJump = false; st.input.jumpHeld = false; };
  return st;
}

/** Running flat out along the ground floor, the shaft open, no jump. */
function groundRun(dir) {
  const input = new AutoInput();
  const game = new Game(input);
  game.newRun(SEED);
  openShaft(game);
  game.player.momentum = 1;
  game.player.x = game.player.px = C.CX - 60 * dir;
  game.camY = game.player.y - game.viewH * C.CAM_ANCHOR;
  return { game, input, drive: () => { input.wantAxis = dir; input.wantJump = false; input.jumpHeld = false; } };
}

// --- a renderer, instrumented -----------------------------------------------------------

function view(B, trails = true) {
  const canvas = new HeadlessCanvas(C.SW, C.SH);
  const r = new B.R.Renderer(canvas);
  r.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'high',
    streaks: false, shake: false, trails, showFps: false, music: false });
  // The scenery is not what is being tested and is most of a frame's cost.
  r.backdrop = { draw() {} };
  for (const m of ['drawWalls', 'drawSpeedStreaks', 'drawPlatforms', 'drawRisingFloor', 'drawPit',
    'drawCompanions', 'drawCompanionCalls', 'drawFloaters', 'drawDangerBand']) r[m] = () => {};
  const ctx = r.ctx;
  const calls = [];
  let saveM = null;
  const save = ctx.save.bind(ctx), drawImage = ctx.drawImage.bind(ctx);
  ctx.save = () => { saveM = ctx.m.slice(); save(); };
  ctx.drawImage = (img, ...a) => {
    const kind = B.sprites.has(img) ? 'sprite' : B.ghosts.has(img) ? 'ghost' : null;
    if (kind) calls.push({ kind, img, m: ctx.m.slice(), a: a.slice(), saveM });
    drawImage(img, ...a);
  };
  return { B, r, calls };
}

/** drawSprite's call for a state, under base matrix `m`. */
function expected(B, m, s) {
  const c = new HeadlessCanvas(1, 1).getContext('2d');
  c.m = m.slice();
  let got = null;
  c.drawImage = (img, ...a) => { got = { img, m: c.m.slice(), a }; };
  B.S.drawSprite(c, s.frame, snap(s.x), snap(-s.y), s.flip, s.spin, s.sq);
  return got;
}
const same = (u, v) => u.length === v.length && u.every((x, i) => x === v[i]);
// The quarter turn a call was drawn in, read off its matrix.
const drawnQ = (c) => ((Math.round(Math.atan2(c.m[1], c.m[0]) / (Math.PI / 2)) % 4) + 4) % 4;

function callBox(c) {
  const [, , , , dx, dy, dw, dh] = c.a;
  const [a, b, cc, d, e, f] = c.m;
  const xs = [], ys = [];
  for (const [x, y] of [[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]]) {
    xs.push(a * x + cc * y + e); ys.push(b * x + d * y + f);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Each call's silhouette on its own, as the canvas draws it, in one box. */
function masks(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of list) {
    const [a, b, cc, d] = callBox(c);
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, cc); y1 = Math.max(y1, d);
  }
  const ox = Math.floor(x0) - 2, oy = Math.floor(y0) - 2;
  const w = (Math.ceil(x1) - ox + 2) | 0, h = (Math.ceil(y1) - oy + 2) | 0;
  return {
    w, h,
    m: list.map((c) => {
      const cv = new HeadlessCanvas(w, h);
      const g = cv.getContext('2d');
      const [a, b, cc, d, e, f] = c.m;
      g.m = [a, b, cc, d, e - ox, f - oy];
      g.drawImage(c.img, ...c.a);
      const out = new Uint8Array(w * h), px = cv.data;
      let n = 0;
      for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] > 0) { out[i] = 1; n++; }
      out.n = n;
      return out;
    }),
  };
}
const overlap = (A, Bm) => { let n = 0; for (let i = 0; i < A.length; i++) if (A[i] && Bm[i]) n++; return n; };
function touches(A, Bm, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!A[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && Bm[yy * w + xx]) return true;
        }
      }
    }
  }
  return false;
}

// --- one pass: play, draw, check every frame ------------------------------------------

function tally() {
  return { frames: 0, trailFrames: 0, copies: 0, left: 0, right: 0, record: 0, path: 0, anchor: 0,
    count: 0, near: 0, chain: 0, far: 0, nearMin: 1, farMin: 1, rollFrames: 0, curled: 0, drawnOff: 0,
    zoomOff: 0 };
}

/**
 * Play `secs` of a staged run through build B at `hz`, drawing at render zoom `zoom`.
 * `events` maps a frame index to a function run BEFORE that frame's simulation, which
 * returns true if it moved him discontinuously (the path log starts again there).
 */
function pass(B, stage, { secs, hz = 160, zoom = 1, trails = true, chain = true, events = {}, t = tally(), after }) {
  const v = view(B, trails);
  let st = stage();
  const dt = 1 / hz;
  let acc = 0;
  let log = [];
  const frames = Math.round(secs * hz);
  for (let f = 0; f < frames; f++) {
    if (events[f]) {
      const r = events[f](st);
      if (r) { if (r.stage) st = r.stage; log = []; }
    }
    acc += dt;
    while (acc >= STEP - 1e-12) { st.drive(); st.game.step(STEP); acc -= STEP; }
    st.game.zoomView = zoom;
    v.calls.length = 0;
    v.r.draw(st.game, acc / STEP, dt);
    const spr = v.calls.filter((c) => c.kind === 'sprite');
    const ghosts = v.calls.filter((c) => c.kind === 'ghost').reverse();   // nearest first
    const ai = v.r.afterimage;
    if (after) after(f, ghosts.length, ai);
    t.frames++;
    if (!trails) { t.drawnOff += ghosts.length + ai.count; continue; }
    const g = st.game;
    if (g.state === 'falling' || g.state === 'dead' || spr.length !== 1) { t.drawnOff += ghosts.length; continue; }
    const him = spr[0];
    // The zoom asked for is the one he was drawn at (one art pixel = zoom backing pixels).
    if (Math.abs(Math.hypot(him.m[0], him.m[1]) - zoom * C.PX) > 1e-9) t.zoomOff++;

    // 1. RECORD: the newest recorded state redraws his sprite call.
    const h = ai.head;
    const now = { t: ai.t[h], x: ai.x[h], y: ai.y[h], frame: ai.frame[h], flip: ai.flip[h] === 1, spin: ai.spin[h], sq: ai.sq[h] };
    const e = expected(B, quarter(now.spin) ? him.saveM : him.m, now);
    if (!ai.n || !e || !same(e.m, him.m) || !same(e.a, him.a)) t.record++;
    const last = log[log.length - 1];
    if (!last || last.t !== now.t) log.push(now);
    if (log.length > 64) log.shift();

    if (!ghosts.length) continue;
    t.trailFrames++;
    if (ghosts.length !== ai.count) t.count++;
    const states = [];
    for (let i = 0; i < ghosts.length; i++) {
      const s = { x: ai.cx[i], y: ai.cy[i], frame: ai.cframe[i], flip: ai.cflip[i] === 1, spin: ai.cspin[i], sq: ai.csq[i] };
      states.push(s);
      t.copies++;
      if (s.flip) t.left++; else t.right++;
      // 2. PATH: on a segment of the drawn path, in the older end's drawing.
      let on = false;
      for (let j = log.length - 1; j > 0 && !on; j--) {
        const a = log[j], b = log[j - 1];
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
        const u = L2 > 0 ? ((s.x - a.x) * dx + (s.y - a.y) * dy) / L2 : 0;
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        if (Math.hypot(a.x + dx * u - s.x, a.y + dy * u - s.y) > 1e-6) continue;
        const like = (q) => q.frame === s.frame && q.flip === s.flip && q.spin === s.spin && q.sq === s.sq;
        // Past the newer end, the drawing on screen was the older one's. Standing still,
        // both ends are the one point and the copy may be either.
        if (L2 === 0 ? like(a) || like(b) : like(u > 1e-9 ? b : a)) on = true;
      }
      if (!on) t.path++;
      // 3. ANCHOR: drawSprite's call for that state, from the silhouette atlas.
      const gc = ghosts[i];
      const x = expected(B, quarter(s.spin) ? gc.saveM : gc.m, s);
      const flipped = s.flip && !B.S.FRONT_FRAMES.has(s.frame);
      const atlas = gc.img === B.S.ghostAtlas(flipped, true) || gc.img === B.S.ghostAtlas(flipped, false);
      if (!x || !atlas || !same(x.m, gc.m) || !same(x.a, gc.a)) t.anchor++;
    }
    // 5. ROLL: in the tuck, a copy drawn in a quarter turn other than his.
    if (now.frame === 'tuck') {
      t.rollFrames++;
      if (ghosts.some((g) => drawnQ(g) !== drawnQ(him))) t.curled++;
    }
    // 4. CHAIN
    if (chain) {
      const M = masks([him, ...ghosts]);
      const [mh, ...mc] = M.m;
      const near = overlap(mc[0], mh), far = overlap(mc[mc.length - 1], mh);
      if (near < NEAR_MIN * mh.n) t.near++;
      if (far < FAR_MIN * mh.n) t.far++;
      t.nearMin = Math.min(t.nearMin, near / mh.n);
      t.farMin = Math.min(t.farMin, far / mh.n);
      for (let i = 1; i < mc.length; i++) if (!touches(mc[i], mc[i - 1], M.w, M.h)) { t.chain++; break; }
    }
  }
  return t;
}

const add = (a, b) => {
  for (const k of Object.keys(b)) {
    if (k === 'nearMin' || k === 'farMin') a[k] = Math.min(a[k], b[k]);
    else a[k] += b[k];
  }
  return a;
};
const describe = (t) => `${t.frames} frames, ${t.trailFrames} with a trail, ${t.copies} copies ` +
  `(${t.right} facing right, ${t.left} left)`;

// --- the real build -------------------------------------------------------------------

const REAL = await build(path.join(ROOT, 'src'));

// 8. SHAPE: a silhouette is exactly the sprite's alpha.
{
  let diff = 0, cells = 0;
  for (const flip of [false, true]) {
    const sa = REAL.S.spriteAtlas(flip);
    for (const light of [false, true]) {
      const ga = REAL.S.ghostAtlas(flip, light);
      if (ga.width !== sa.width || ga.height !== sa.height) { diff++; continue; }
      const sd = sa.data, gd = ga.data;
      for (let i = 3; i < sd.length; i += 4) if ((sd[i] > 0) !== (gd[i] > 0)) diff++;
      cells++;
    }
  }
  if (diff) fail(`the silhouette atlases differ from the sprite's alpha in ${diff} pixels`);
  else ok(`the silhouettes are the sprite atlases' alpha exactly, pixel for pixel (${cells} atlases, both facings, both tones)`);
}

// 9. TURN: the tuck, through drawSprite, in each quarter turn: where its drawn box is, in
// world units from his feet anchor. Returns the largest move from one turn to the next and
// the lowest and highest the box's bottom sits above his feet.
function turns(B) {
  const PXW = C.PX, W = 480, H = 480;
  let hop = 0, lo = Infinity, hi = -Infinity;
  for (const flip of [false, true]) {
    const box = [];
    for (let q = 0; q < 4; q++) {
      const cv = new HeadlessCanvas(W, H);
      const g = cv.getContext('2d');
      g.setTransform(PXW, 0, 0, PXW, W / 2, H / 2);
      B.S.drawSprite(g, 'tuck', 0, 0, flip, q, 0);
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      const px = cv.data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!px[(y * W + x) * 4 + 3]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      box.push([((x0 + x1 + 1) / 2 - W / 2) / PXW, ((y0 + y1 + 1) / 2 - H / 2) / PXW, (H / 2 - (y1 + 1)) / PXW]);
    }
    for (let q = 0; q < 4; q++) {
      const a = box[q], b = box[(q + 1) % 4];
      hop = Math.max(hop, Math.hypot(b[0] - a[0], b[1] - a[1]));
      lo = Math.min(lo, a[2]);
      hi = Math.max(hi, a[2]);
    }
  }
  return { hop, lo, hi };
}
const TURN_HOP = 0.5;       // world units the ball may move from one quarter turn to the next
const TURN_LIFT = 2;        // world units its bottom may sit above his feet in any turn
const turnBad = (r) => r.hop > TURN_HOP || r.lo < -0.01 || r.hi > TURN_LIFT;
{
  const r = turns(REAL);
  if (turnBad(r)) {
    fail(`9. TURN: the tuck moves up to ${r.hop.toFixed(2)} units from one quarter turn to the next (bar ${TURN_HOP}), ` +
      `its bottom ${r.lo.toFixed(2)} to ${r.hi.toFixed(2)} units above his feet (bar 0 to ${TURN_LIFT})`);
  } else {
    ok(`9. TURN: the tuck turns in place -- ${r.hop.toFixed(2)} units at most from one quarter turn to the next, ` +
      `its bottom ${r.lo.toFixed(2)} to ${r.hi.toFixed(2)} units above his feet, both facings`);
  }
}

// Real play at every rest zoom.
const plays = [
  ['bot on floor 40, 3.2 s', botRun, 3.2],
  ['a 150-unit drop onto a ledge', drop, 0.55],
  ['a run right along the ground', () => groundRun(1), 0.6],
  ['a run left along the ground', () => groundRun(-1), 0.6],
];
const all = tally();
for (const zoom of ZOOMS) {
  const z = tally();
  for (const [, stage, secs] of plays) add(z, pass(REAL, stage, { secs, zoom }));
  add(all, z);
  console.log(`  zoom ${zoom}: ${describe(z)}; nearest copy covers >= ${(z.nearMin * 100).toFixed(0)}% of him, ` +
    `farthest >= ${(z.farMin * 100).toFixed(0)}%`);
}
const at60 = pass(REAL, botRun, { secs: 3.2, hz: 60, zoom: 1 });
console.log(`  60 Hz, zoom 1: ${describe(at60)}; nearest >= ${(at60.nearMin * 100).toFixed(0)}%, farthest >= ${(at60.farMin * 100).toFixed(0)}%`);
add(all, at60);

if (!all.trailFrames || !all.left || !all.right) fail(`the play drew too little to test: ${describe(all)}`);
if (all.zoomOff) fail(`${all.zoomOff} frames were not drawn at the zoom asked for`);
if (all.record) fail(`1. RECORD: in ${all.record} frames the newest recorded state does not redraw his sprite call`);
else ok(`1. RECORD: in all ${all.frames} frames the newest recorded state redraws his sprite exactly`);
if (all.path) fail(`2. PATH: ${all.path} of ${all.copies} copies are not on his drawn path in the drawing on screen there`);
else ok(`2. PATH: all ${all.copies} copies lie on his drawn path, each in the older frame's pose, facing, squash and quarter turn`);
if (all.anchor || all.count) fail(`3. ANCHOR: ${all.anchor} copies not drawn as drawSprite draws their state; ${all.count} frames drew a different number than placed`);
else ok(`3. ANCHOR: every copy is drawSprite's call for its state, bit for bit, from the silhouette atlas of its facing`);
if (all.near || all.chain || all.far) {
  fail(`4. CHAIN: nearest copy covers under ${NEAR_MIN * 100}% of him in ${all.near} frames (least ${(all.nearMin * 100).toFixed(0)}%), ` +
    `a copy clear of the one before in ${all.chain}, farthest under ${FAR_MIN * 100}% of him in ${all.far} (least ${(all.farMin * 100).toFixed(0)}%)`);
} else {
  ok(`4. CHAIN: in all ${all.trailFrames} frames with a trail the nearest copy covers >= ${(all.nearMin * 100).toFixed(0)}% of him ` +
    `(bar ${NEAR_MIN * 100}%), every copy touches the one before, and the farthest covers >= ${(all.farMin * 100).toFixed(0)}% (bar ${FAR_MIN * 100}%)`);
}
if (!all.rollFrames || !all.curled) fail(`5. ROLL: ${all.rollFrames} tuck frames, ${all.curled} with a copy in a quarter turn he has left`);
else ok(`5. ROLL: ${all.curled} of ${all.rollFrames} tuck frames draw copies in quarter turns he has already left -- the trail curls with him`);

// 6. OFF
function offCheck(B) { return pass(B, botRun, { secs: 1.6, trails: false, chain: false }).drawnOff; }
{
  const n = offCheck(REAL);
  if (n) fail(`6. OFF: trails off drew or placed ${n} copies`);
  else ok('6. OFF: trails off draws no copy over 1.6 s of play');
}

// 7. RESETS. Each at a frame the trail is up, and each with him moving on as before, so the
// only thing that can clear the path is the reset under test.
const LIVE = 225;                       // 1.40 s in: just after a launch, four copies up
function resets(B) {
  // The count drawn the frame after each, and -- over the 20 frames that follow -- every copy
  // on the path drawn since (2. PATH, its log started again at the event).
  const out = {};
  let offPath = 0;
  const firstAfter = (name, events) => {
    let n = null;
    offPath += pass(B, botRun, { secs: (LIVE + 20) / 160, chain: false, events,
      after: (f, drawn) => { if (f === LIVE) n = drawn; } }).path;
    out[name] = n;
  };
  // A teleport: 100 units across and 40 up, previous position moved with him.
  firstAfter('teleport', { [LIVE]: (st) => {
    const p = st.game.player;
    p.x += 100; p.px += 100; p.y += 40; p.py += 40;
    return {};
  } });
  // A new run of the same game that happens to start where he is, moving as he was.
  firstAfter('new run', { [LIVE]: (st) => {
    const g = st.game, p = g.player;
    const keep = { x: p.x, y: p.y, px: p.px, py: p.py, vx: p.vx, vy: p.vy };
    g.newRun(SEED + 1);
    openShaft(g);
    Object.assign(p, keep);
    p.grounded = false;
    p.momentum = 1;
    return {};
  } });
  // Another game drawn by the same renderer, its Duke exactly where this one is.
  firstAfter('switch of game', { [LIVE]: (st) => {
    const next = botRun();
    const p = st.game.player, q = next.game.player;
    for (const k of ['x', 'y', 'px', 'py', 'vx', 'vy', 'facing', 'momentum', 'grounded', 'spinT', 'squash']) q[k] = p[k];
    next.game.camY = st.game.camY;
    return { stage: next };
  } });
  // A death: nothing while he falls, and nothing from before it once a run is back.
  let dying = 0, back = null;
  offPath += pass(B, botRun, { secs: (LIVE + 50) / 160, chain: false,
    events: {
      [LIVE]: (st) => { st.game.die(); return {}; },
      [LIVE + 30]: (st) => {
        const g = st.game, p = g.player;
        const keep = { x: p.x, y: p.y, px: p.x, py: p.y, vx: 300, vy: 600 };
        g.newRun(SEED + 2);
        openShaft(g);
        Object.assign(p, keep);
        p.grounded = false;
        p.momentum = 1;
        return {};
      },
    },
    after: (f, drawn) => { if (f >= LIVE && f < LIVE + 30) dying += drawn; if (f === LIVE + 30) back = drawn; } }).path;
  out['death'] = dying;
  out['run after a death'] = back;
  out['copies off his path since the event'] = offPath;
  return out;
}
{
  // The trail must be up at LIVE, or none of this means anything.
  let before = 0;
  pass(REAL, botRun, { secs: (LIVE + 1) / 160, chain: false, after: (f, drawn) => { if (f === LIVE - 1) before = drawn; } });
  const r = resets(REAL);
  const bads = Object.entries(r).filter(([, n]) => n !== 0);
  if (!before) fail(`7. RESETS: the trail is not up at frame ${LIVE}, so the resets were not tested`);
  else if (bads.length) fail(`7. RESETS: copies drawn after ${bads.map(([k, n]) => `${k} (${n})`).join(', ')}`);
  else ok(`7. RESETS: ${before} copies up, then none the frame after a teleport, a new run where he stood, a switch of game, a death, or the run after it, and every copy after on the path drawn since`);
}

// --- 10. MUTANTS -------------------------------------------------------------------------

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duke-afterimage-'));
let mutantN = 0;
async function mutant(file, from, to) {
  const dir = path.join(TMP, `m${++mutantN}`, 'src');
  fs.cpSync(path.join(ROOT, 'src'), dir, { recursive: true });
  const f = path.join(dir, file);
  const src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const hits = src.split(from).length - 1;
  if (hits !== 1) return null;
  fs.writeFileSync(f, src.replace(from, to));
  return build(dir);
}
const rollPlay = (B) => pass(B, botRun, { secs: 2.0 });
const MUTANTS = [
  ['a state recorded without his squash', '1. RECORD',
    'render/renderer.js', 'frame, p.facing < 0, spin, p.squash);', 'frame, p.facing < 0, spin, 0);',
    (B) => rollPlay(B).record],
  ['the old silhouette placement: cell bottom on his feet, no FOOT_DROP, squash or spin', '3. ANCHOR',
    'render/sprites.js',
    'placeCell(ctx, ghostAtlas(flip, light), i * SPR_W, frame, cx, by0, spin, sq, flip);',
    'ctx.drawImage(ghostAtlas(flip, light), i * SPR_W, 0, SPR_W, SPR_H, cx - BODY_W / 2, by0 - BODY_H, BODY_W, BODY_H);',
    (B) => rollPlay(B).anchor],
  ['the tuck turned about its cell\'s centre, as it was', '9. TURN and 4. CHAIN',
    'render/sprites.js', 'const pv = (flip ? SPIN_PIVOT.left : SPIN_PIVOT.right)[frame];', 'const pv = null;',
    (B) => { const t = rollPlay(B); return turnBad(turns(B)) && t.near + t.far ? t.near + t.far : 0; }],
  ['every copy drawn in his CURRENT quarter turn', '5. ROLL',
    'render/renderer.js', 'ai.cspin[i], ai.csq[i], light);', 'spin, ai.csq[i], light);',
    (B) => rollPlay(B).curled === 0 ? 1 : 0],
  ['a copy between two frames in the NEWER frame\'s drawing', '2. PATH',
    'render/afterimage.js', 'const src = u > 0 ? b : a;', 'const src = a;',
    (B) => rollPlay(B).path],
  ['copies 9 ms apart with no cap on the path between them (the old spacing)', '4. CHAIN',
    'render/afterimage.js', 'if (d > 0 && s + d >= cap) u = Math.min(u, (cap - s) / d);', '',
    (B) => { const t = rollPlay(B); return t.near + t.chain + t.far; }],
  ['the silhouette built from the whole grid, shield point and all', '8. SHAPE',
    'render/sprites.js', 'g.fillStyle = colour;\n  NAMES.forEach((name, i) => {\n    const buf = grids[name];\n    const rows = atlasRows(name);',
    'g.fillStyle = colour;\n  NAMES.forEach((name, i) => {\n    const buf = grids[name];\n    const rows = SPR_H;',
    (B) => {
      let d = 0;
      for (const f of [false, true]) {
        const sd = B.S.spriteAtlas(f).data, gd = B.S.ghostAtlas(f, true).data;
        for (let i = 3; i < sd.length; i += 4) if ((sd[i] > 0) !== (gd[i] > 0)) d++;
      }
      return d;
    }],
  ['no reset on a jump in position', '7. RESETS (teleport)',
    'render/afterimage.js', 'if (dt < 0 || d > Math.max(speed, this.v[h]) * dt * GHOST_JUMP_K + GHOST_JUMP_SLACK) this.reset();',
    'if (dt < 0) this.reset();', (B) => resets(B).teleport],
  ['no reset on a new run or another game', '7. RESETS (new run, switch)',
    'render/afterimage.js', 'if (game !== this.game || game.tower !== this.tower) {', 'if (!this.game) {',
    (B) => { const r = resets(B); return (r['new run'] ? 1 : 0) + (r['switch of game'] ? 1 : 0) === 2 ? 1 : 0; }],
  ['the trails setting ignored', '6. OFF',
    'render/renderer.js', 'if (!trails) ai.reset();', 'if (false) ai.reset();',
    (B) => offCheck(B)],
];
try {
  for (const [what, check, file, from, to, run] of MUTANTS) {
    const B = await mutant(file, from, to);
    if (!B) { fail(`mutant "${what}": its line is not in ${file} exactly once -- update the suite`); continue; }
    const n = await run(B);
    if (n) ok(`${check} fails against ${what} (${n})`);
    else fail(`${check} PASSES against ${what}`);
  }
  // And the trail it replaced: copies of his current drawing, unturned and unsquashed, on a
  // straight line back along his motion, 9 ms a copy clamped at 6 and 7 units.
  {
    const B = REAL;
    const Old = class extends B.A.Afterimage {
      place() {
        this.count = 0;
        this.speed = 0;
        if (this.n < 2) return 0;
        const h = this.head, g = (h - 1 + this.t.length) % this.t.length, dt = this.t[h] - this.t[g];
        const vx = (this.x[h] - this.x[g]) / dt, vy = (this.y[h] - this.y[g]) / dt;
        const dx = Math.max(-6, Math.min(6, -vx * 0.009)), dy = Math.max(-7, Math.min(7, -vy * 0.009));
        for (let i = 0; i < 4; i++) {
          this.cx[i] = this.x[h] + dx * (i + 1);
          this.cy[i] = this.y[h] + dy * (i + 1);
          this.cframe[i] = this.frame[h];
          this.cflip[i] = this.flip[h];
          this.cspin[i] = 0;
          this.csq[i] = 0;
        }
        this.count = 4;
        this.speed = Math.hypot(vx, vy);
        return 4;
      }
    };
    // The real renderer with the old trail's placement in its afterimage's place.
    const OldRenderer = class extends B.R.Renderer {
      constructor(c) { super(c); this.afterimage = new Old(); }
    };
    const res = pass({ ...B, R: { Renderer: OldRenderer } }, botRun, { secs: 2.0 });
    if (res.near + res.far && res.path) {
      ok(`4. CHAIN and 2. PATH fail against the old straight-line trail (a copy clear of him in ` +
        `${res.near + res.far} frames, ${res.path} copies off his path)`);
    } else {
      fail(`4. CHAIN or 2. PATH passes against the old straight-line trail (clear ${res.near + res.far}, off path ${res.path})`);
    }
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n  RESULT: ${bad ? `FAIL - ${bad} problem(s)` : 'PASS'}`);
process.exit(bad ? 1 : 0);
