// The fall is him alone in the shaft: what the climb left on screen is gone within FALL_CLEAR
// of the catch, none of it goes in one frame, and the camera's plunge has no hitch.
//
//   node tools/test-fallclear.mjs                 the suite
//   node tools/test-fallclear.mjs --mutate=NAME   the same, with the game broken on purpose
//
// WHY IT EXISTS. The user asked for the fire to clear the screen as it takes him, so the fall
// is smooth. Before that the whole plunge showed the tower: the ledges and their furniture
// over him, a companion frozen on one, the combo trail, the speed lines turned into the
// plummet's -- thin orange rain across the shaft -- and, as he dropped out of the crust, the
// tower BELOW the fire scrolling up past him to the pit. And the last round on this death
// ("What flashed as he fell into the fire", GAMEPLAY.md) was spent on things that switched
// in one frame at the catch, so clearing it all at once would have been the same bug again.
// None of that shows in a still: everything here is measured frame by frame at 160 Hz.
//
// WHAT IT RUNS. Real deaths, staged naturally: the seeded attract bot climbs the demo tower to
// a floor, then stops -- running back and forth off ledge ends into the fire (with a companion
// on screen), with a 350-floor chain forced live so the trail and the streaks are at full
// tilt, or standing still low in the tower (a dazed landing); and one early in a real run,
// dazed too, while the shaft is still opening and the zoom glides through the fall. The
// simulation and the drawing take separate seeded streams and one fake clock, and the frames
// are drawn the way the game's loop draws them: 240 Hz steps, 160 Hz frames, interpolated.
//
// WHAT IT ASSERTS, per death:
//   1. Nothing of the climb is drawn after FALL_CLEAR: no ledge, decor or companion draw
//      (through the burn layer or straight onto the frame), no streak, no trail spark, and
//      none of the particles alive at the catch is still alive -- checked on every frame
//      after the window's end to the impact and beyond, drawn every fourth frame.
//   2. The ledges and companions never pop: their ISOLATED renders (that class alone, on a
//      transparent frame) are diffed against the previous frame with the camera lined up,
//      outside the fire's crust (which hides what is under it). The alpha that changes in
//      one frame must stay under FRAME_STEP of what was visible before the catch (the
//      companions: FRAME_STEP_COMP of their own), and the pixels whose alpha jumps by half
//      or more in one frame under POP_PX (decor animation, a reed swaying, does that in
//      play: up to ~360 px in SWAMP).
//   3. No streak vanishes mid-screen: a line the pool drops must have shrunk away or risen
//      off the top, where the pool had just moved it.
//   4. The particles and floaters the climb left fade in their own steps: none disappears
//      from brighter than its last step (a particle's 0.25, a trail spark's smallest shape at
//      0.6, a floater's 0.4), and no drawn alpha steps by more than one of its steps a frame.
//   5. The camera's plunge is smooth: from the end of FALL_CAM_BLEND to the impact, neither
//      the camera's device row nor his row on screen changes its per-frame step by more
//      than CAM_JERK px (times the zoom) from one frame to the next.
//   6. No companion stands on nothing: per column of a companion, once the ledge right under
//      its feet in that column has burned away (a column hanging past the ledge's end is
//      judged by the nearest column over it), nothing of the companion is left there -- at
//      most FLOAT_MAX of its mass in all such columns together. The companion and the ledge
//      each burning a frame at a time (4) did not see it: in the floor-420 death the pilgrim
//      was 38% on burned-away ledge for 17 frames before burn.js drawBurnColumns.
//
// MUTATIONS, each must FAIL (run with --mutate=NAME; results in the commit that added this):
//   cut          the ledges and companions stop being drawn in the frame he is caught
//   noburn       the ledges are drawn on through the whole fall, as before
//   nofade       each band of the burn goes in one frame instead of over a stage
//   streakcut    the streak pool is emptied at the catch
//   streakstay   the streaks follow the plummet's speed, as before
//   sparkcut     the particles alive at the catch are killed at the catch
//   sparkstay    the particles alive at the catch run their whole lives
//   floatercut   the floaters are dropped at the catch
//   compstay     the companions are drawn on through the fall
//   oldcam       the fall's camera is the lerp with its hard clamp, as before
//   compfloat    the companions burn in their own pattern only, not tied to their ledge

import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const MUTATE = (argv.find((a) => a.startsWith('--mutate=')) || '').slice(9) || null;

// Seeded, in two streams: the simulation's and the drawing's (the streak pool spawns from
// Math.random while it draws), so the frames drawn cannot move the deaths themselves.
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let simR = mulberry(1), drawR = mulberry(2), cur = simR;
Math.random = () => cur();
let fakeNow = 1000;
Object.defineProperty(globalThis.performance, 'now', { value: () => fakeNow, configurable: true, writable: true });

const C = await import('../src/game/constants.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { PARTICLE_BUDGET } = await import('../src/game/settings.js');
const { Particles, KIND } = await import('../src/render/particles.js');
const { warmSparks } = await import('../src/render/sparks.js');
const { STREAK_LENGTHS } = await import('../src/render/streaks.js');
const { RISE_DEPTH } = await import('../src/render/risefloor.js');
const { SW, SH, PX, FALL_CLEAR, FALL_CAM_BLEND } = C;

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

// --- 0. the two compositing operations the burn uses, against the canvas spec -------------
//
// The burn is drawn with 'source-atop' and 'destination-out' on its own layer, which this
// headless canvas did not implement until the burn needed them. Expected values worked out
// by hand from the Porter-Duff definitions (unpremultiplied): source-atop keeps the
// destination's alpha and mixes the colour, src a + dst (1 - a); destination-out keeps the
// colour and scales the alpha by (1 - a). A transparent pixel stays transparent under both.
{
  const cv = new HeadlessCanvas(3, 1);
  const g = cv.getContext('2d');
  cv.data.set([200, 100, 0, 255, 0, 0, 0, 0, 40, 80, 120, 128]);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.5;
  g.fillStyle = '#0000ff';
  g.fillRect(0, 0, 3, 1);
  const a = Array.from(cv.data);
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.25;
  g.fillRect(0, 0, 3, 1);
  g.globalCompositeOperation = 'source-over';
  const b = Array.from(cv.data);
  const wantA = [100, 50, 128, 255, 0, 0, 0, 0, 20, 40, 188, 128];
  const wantB = [100, 50, 128, 191, 0, 0, 0, 0, 20, 40, 188, 96];
  const same = (x, y) => x.every((v, i) => Math.abs(v - y[i]) <= 1);
  if (!same(a, wantA) || !same(b, wantB)) {
    fail(`headless compositing: source-atop gave ${a.join(',')} (want ${wantA.join(',')}), ` +
      `destination-out ${b.join(',')} (want ${wantB.join(',')})`);
  } else ok('headless source-atop and destination-out match the canvas spec, pixel for pixel');
}

// --- the deaths --------------------------------------------------------------------------

/** How much of the ledges visible before the catch may change in one frame. [share; 0.08]
 *  The burn takes an eighth of every ledge a stage, each pixel fading over the stage: about
 *  2-3% a frame measured, 10-15% with the fade taken out. */
const FRAME_STEP = 0.08;
/** The same for the companions, against their own mass. [share; 0.25] A sprite a few blobs
 *  of the burn's noise across can have half its pixels in one stage, which fades over about
 *  five frames: up to a fifth a frame, with nothing popping. Cut, it is all of it. */
const FRAME_STEP_COMP = 0.25;
/** The same for the ledges while the zoom glides, compared row by row rather than pixel by
 *  pixel: an art pixel resampled at a new scale moves a column now and then. [share; 0.1] */
const FRAME_STEP_GLIDE = 0.1;
/** Pixels whose alpha may jump by half or more in one frame. [px; 1500] Decor animation
 *  does up to ~360 in play; one ledge popping is thousands. */
const POP_PX = 1500;
/** How much the per-frame step of the camera, and of his row on screen, may change from one
 *  frame to the next in the plunge. [device px at zoom 1; 2.5] The old camera: 3.1 to 4.8
 *  as its clamp caught him; this one 0.4 to 0.7. */
const CAM_JERK = 2.5;
/** How much of a companion may be left over ledge that has burned from under it, all such
 *  columns together. [share of its mass at the catch; 0.03] Tied to its ledge, 0.0%; in its
 *  own pattern only, 38% (floor 420) and 18 to 51% in a quarter of placements. */
const FLOAT_MAX = 0.03;

const DEATHS = [
  // name, demo seed, the floor he stops at, how he dies, a chain forced live
  { name: 'falling in at floor 420, a companion by him', seed: 0, floor: 420, mode: 'run', combo: 0 },
  { name: 'a 350-floor chain running at floor 900', seed: 2, floor: 900, mode: 'run', combo: 350 },
  { name: 'standing, dazed, at floor 150', seed: 1, floor: 150, mode: 'idle', combo: 0 },
  // Not the attract tower: a real run, whose shaft is still opening this low -- the zoom is
  // gliding from 1.06 to 1 through the whole fall -- and the fall is dazed.
  { name: 'falling in at floor 60 as the shaft opens', seed: 1, floor: 60, mode: 'run', combo: 0, real: true },
];

// The particle pool's slots, each tagged with when it was written, so the climb's particles
// (alive at the catch) can be told from the death's own (the splash, wall sparks, impact).
let genCounter = 0;
const gen = new Float64Array(4096);
const put = Particles.prototype.put;
Particles.prototype.put = function (i, ...rest) { gen[i] = ++genCounter; return put.call(this, i, ...rest); };

const canvas = new HeadlessCanvas(SW, SH);
const renderer = new Renderer(canvas);
renderer.applySettings({
  scaleMode: 'integer', scanlines: false, particles: 'high',
  streaks: true, shake: true, trails: true, showFps: false, music: false,
});
const sparkAtlas = warmSparks();

// Every draw the frame makes, by what it belongs to. The phase is the renderer method on the
// stack; sparks are known by their atlas.
const count = { ledges: 0, companions: 0, streaks: 0, floaters: 0, sparks: 0 };
let phase = null;
for (const [m, cls] of [['drawPlatforms', 'ledges'], ['drawCompanions', 'companions'],
  ['drawSpeedStreaks', 'streaks'], ['drawFloaters', 'floaters'], ['drawBurning', null]]) {
  const orig = renderer[m].bind(renderer);
  renderer[m] = (...a) => {
    const was = phase;
    phase = cls || (a[9] ? 'companions' : 'ledges');
    try { return orig(...a); } finally { phase = was; }
  };
}
for (const g of [renderer.ctx, renderer.burnCtx]) {
  for (const op of ['drawImage', 'fillRect']) {
    const orig = g[op].bind(g);
    g[op] = (...a) => {
      if (op === 'drawImage' && a[0] === sparkAtlas) count.sparks++;
      else if (phase) count[phase]++;
      return orig(...a);
    };
  }
}

// --- the mutations -----------------------------------------------------------------------
if (MUTATE) console.log(`  [mutation: ${MUTATE}]`);
const dying = (g) => g.state === STATE.FALLING || g.state === STATE.DEAD;
if (MUTATE === 'cut') {
  const f = renderer.burnAt.bind(renderer);
  renderer.burnAt = (g, a) => (f(g, a) < 0 ? -1 : 1);
}
if (MUTATE === 'noburn') {
  renderer.burnAt = () => -1;
}
if (MUTATE === 'nofade') {
  const f = renderer.burnAt.bind(renderer);
  renderer.burnAt = (g, a) => { const h = f(g, a); return h < 0 ? h : Math.ceil(h * 10) / 10; };
}
if (MUTATE === 'streakcut') {
  const f = renderer.drawSpeedStreaks;
  renderer.drawSpeedStreaks = (...a) => { if (dying(theGame)) renderer.streaks.length = 0; return f(...a); };
}
if (MUTATE === 'streakstay') {
  const d = Object.getOwnPropertyDescriptor(Game.prototype, 'intensity');
  Object.defineProperty(Game.prototype, 'intensity', {
    configurable: true,
    get() { return dying(this) ? Math.min(1, Math.max(0, -this.player.vy) / C.FALL_TERMINAL) : d.get.call(this); },
  });
  Object.defineProperty(Game.prototype, 'fallPace', {
    configurable: true, get() { return this.intensity; }, set() {},
  });
}
if (MUTATE === 'sparkcut') Particles.prototype.letGo = function () { this.clear(); };
if (MUTATE === 'sparkstay') Particles.prototype.letGo = function () {};
if (MUTATE === 'floatercut') {
  const die = Game.prototype.die;
  Game.prototype.die = function () { die.call(this); this.floaters.length = 0; };
}
if (MUTATE === 'compstay') {
  const draw = renderer.draw.bind(renderer);
  renderer.draw = (g, alpha, dt, hud) => {
    draw(g, alpha, dt, hud);
    if (!dying(g)) return;
    renderer.setWorldTransform(renderer.ctx, g);
    renderer.drawCompanions(renderer.ctx, g, alpha);
  };
}
if (MUTATE === 'oldcam') {
  const step = Game.prototype.stepFalling;
  Game.prototype.stepFalling = function (dt) {
    const was = this.camY;
    step.call(this, dt);
    const p = this.player;
    this.camY = was + (p.y - this.viewH * (this.impacted ? 0.42 : 0.55) - was) * Math.min(1, 9 * dt);
    this.camY = Math.max(p.y - this.viewH * 0.82, Math.min(p.y - this.viewH * 0.18, this.camY));
  };
}
if (MUTATE === 'compfloat') {
  // The companions' burn finds no ledge under them, so nothing ties them to it.
  const burning = renderer.drawBurning;
  renderer.drawBurning = (...a) => {
    if (!a[8]) return burning(...a);
    const tower = a[1].tower, peek = tower.peek;
    tower.peek = () => null;
    try { return burning(...a); } finally { tower.peek = peek; }
  };
}

let theGame = null;

// --- one death ---------------------------------------------------------------------------

function makeRun(d) {
  simR = mulberry(0x51a1 + d.seed); drawR = mulberry(0xd4a7 + d.seed); cur = simR; fakeNow = 1000;
  genCounter = 0; gen.fill(0);
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.demo = !d.real;
  game.newRun(DEMO_SEEDS[d.seed]);
  game.particles.setBudget(PARTICLE_BUDGET.high);
  return { d, game, bot, input, n: 0, stopped: -1, caught: -1, dir: 1, forced: false };
}

/** The chain held live, as tools/shot-trail.mjs --combo does: every landing counts. */
function forceCombo(game, floors) {
  const c = game.combo;
  const land = c.onLand.bind(c);
  c.onLand = (gain) => land(Math.max(gain, 2));
  c.onGrounded = () => null;
  c.active = true;
  c.floors = floors;
  c.hops = Math.max(c.hops, 1);
}

function stepOnce(r) {
  cur = simR;
  const g = r.game;
  if (g.state === STATE.PLAYING) {
    if (r.stopped < 0 && r.d.combo && !r.forced && g.run.maxFloor >= r.d.floor - 40) {
      forceCombo(g, r.d.combo);
      r.forced = true;
    }
    if (r.stopped < 0 && g.run.maxFloor >= r.d.floor) r.stopped = r.n;
    if (r.stopped < 0) r.bot.step(g, STEP);
    else {
      // Stopped: stand, or run back and forth, dropping off ledge ends into the fire.
      r.input.wantJump = false;
      r.input.jumpHeld = false;
      if (r.d.mode === 'idle') r.input.wantAxis = 0;
      else {
        const x = g.player.x;
        if (x > C.CX + g.arenaHalf - 12) r.dir = -1;
        if (x < C.CX - g.arenaHalf + 12) r.dir = 1;
        r.input.wantAxis = r.dir;
      }
    }
  }
  g.step(STEP);
  r.n++;
  if (r.caught < 0 && g.state === STATE.FALLING) r.caught = r.n;
}

/** Everything but one class stubbed out, onto a transparent frame; dt 0 and the clock kept. */
const STUBS = ['drawWalls', 'drawSpeedStreaks', 'drawPlatforms', 'drawRisingFloor', 'drawPit',
  'drawCompanions', 'drawPlayer', 'drawCompanionCalls', 'drawFloaters', 'drawDangerBand',
  'drawFallOverlay', 'drawVignette'];
function isolated(game, alpha, keep) {
  const R = renderer;
  const saved = {};
  for (const m of STUBS) if (m !== keep) { saved[m] = R[m]; R[m] = () => {}; }
  const bd = R.backdrop.draw;
  R.backdrop.draw = () => { canvas.data.fill(0); };
  const P = game.particles;
  const pdraw = P.draw, room = P.shedRoom, flash = game.flash;
  P.draw = () => {};
  P.shedRoom = 0;
  game.flash = 0;
  const t = R.t;
  const was = cur;
  cur = drawR;
  R.draw(game, alpha, 0);
  cur = was;
  R.t = t;
  P.draw = pdraw; P.shedRoom = room; game.flash = flash;
  R.backdrop.draw = bd;
  for (const m of Object.keys(saved)) R[m] = saved[m];
  const a = new Uint8Array(SW * SH);
  const d = canvas.data;
  for (let i = 0, j = 3; i < a.length; i++, j += 4) a[i] = d[j];
  return a;
}

/** Device rows the fire's crust covers, crest to end: nothing there can be seen. */
function crustRows(g, ty, k) {
  const crest = Math.round(ty - g.riseY * k);
  const alive = g.state === STATE.PLAYING;
  const depth = Math.max(RISE_DEPTH * g.viewH, g.crustDepth || 0);
  const end = alive ? SH + 1 : Math.round(ty - (g.riseY - depth) * k);
  return [crest, end];
}
const seen = (y, c) => !c || y < c[0] || y > c[1];

function visibleMass(a, c) {
  let m = 0;
  for (let y = 0; y < SH; y++) {
    if (!seen(y, c)) continue;
    for (let x = 0, i = y * SW; x < SW; x++, i++) m += a[i];
  }
  return m / 255;
}

/** One frame's change, with the camera lined up: pixel (x, y) now was (x - dx, y - dy). */
function change(prev, now, dx, dy, cNow, cPrev) {
  let dA = 0, pops = 0;
  for (let y = 0; y < SH; y++) {
    const py = y - dy;
    if (py < 0 || py >= SH || !seen(y, cNow) || !seen(py, cPrev)) continue;
    for (let x = Math.max(0, dx), i = y * SW + x; x < Math.min(SW, SW + dx); x++, i++) {
      const d = Math.abs(now[i] - prev[py * SW + x - dx]);
      if (!d) continue;
      dA += d;
      if (d >= 128) pops++;
    }
  }
  return { dA: dA / 255, pops };
}

/** Alpha mass per row. */
function rowSums(a) {
  const out = new Float64Array(SH);
  for (let y = 0; y < SH; y++) { let m = 0; for (let x = 0, i = y * SW; x < SW; x++, i++) m += a[i]; out[y] = m / 255; }
  return out;
}

/** Mass that changed between two frames at different scales, row against row. */
function glideChange(prev, now, ty, k, crust) {
  const A = rowSums(prev.L), B = rowSums(now);
  let d = 0;
  for (let y = 0; y < SH; y++) {
    const ya = Math.round(prev.ty - (ty - y) * prev.k / k);
    if (ya < 0 || ya >= SH || !seen(y, crust) || !seen(ya, prev.crust)) continue;
    d += Math.abs(B[y] - A[ya] * k / prev.k);
  }
  return d;
}

const particleAlpha = (P, i) => {
  const t = P.life[i] / P.maxLife[i];
  if (P.kind[i] === KIND.TWINKLE) return t <= 0.15 ? 0.6 : 1;
  return t > 0.66 ? 1 : t > 0.4 ? 0.75 : t > 0.2 ? 0.5 : 0.25;
};
const floaterAlpha = (f) => { const a = Math.min(1, f.life / 0.4); return a > 0.66 ? 1 : a > 0.33 ? 0.7 : 0.4; };

const summary = [];
for (const d of DEATHS) {
  // Pass 1: where the fire takes him, without drawing.
  let r = makeRun(d);
  {
    let acc = 0;
    while (r.n < 240 * 400) {
      fakeNow += 1000 / 160;
      acc += 3;
      while (acc >= 2) { stepOnce(r); acc -= 2; }
      if (r.caught >= 0) break;
    }
  }
  if (r.caught < 0) { fail(`${d.name}: never caught`); continue; }
  const CATCH = r.caught;

  // Pass 2: the same run, drawn from just before the catch.
  r = makeRun(d);
  renderer.streaks.length = 0;
  theGame = r.game;
  const g = r.game;
  const problems = [];
  let catchGen = Infinity, acc = 0, prevIso = null, ref = null, refC = null;
  let worstStep = 0, worstStepC = 0, worstPops = 0, vanished = 0, frames = 0;
  let worstJerk = 0, worstJerkDuke = 0;
  let stands = null, worstFloat = 0;
  const lastAlpha = new Map(), lastFloater = new Map();
  let prevLines = new Map();
  let lastDrawn = 0;
  let camHist = [];
  let impactN = -1;
  let crustChecked = false;
  while (true) {
    fakeNow += 1000 / 160;
    acc += 3;
    while (acc >= 2) {
      const before = genCounter;
      stepOnce(r);
      acc -= 2;
      if (r.n === CATCH) catchGen = before;
      if (impactN < 0 && g.impacted) impactN = r.n;
    }
    const t = (r.n - CATCH) * STEP;
    if (t < -0.06) continue;
    const alpha = acc / 2;
    const inWindow = t <= FALL_CLEAR + 0.05;
    const after = t > FALL_CLEAR + 1 / 160;
    frames++;

    // The camera, drawn or not: where it is (world units, with the frame's scale) and his row
    // on screen, unrounded.
    if (dying(g)) {
      const z = g.zoomView || g.zoom, k = z * PX;
      const cam = renderer.cameraY(g, alpha);
      const p = g.player;
      const py = p.py + (p.y - p.py) * alpha;
      camHist.push({ t, n: r.n, cam, k, duke: (cam - py) * k, z, impacted: g.impacted });
    }

    // What the climb left in the particle pool, and the floaters, from the state -- tracked
    // from before the catch, so anything the catch itself takes away is seen going.
    {
      const P = g.particles;
      for (let i = 0; i < P.slots; i++) {
        const was = lastAlpha.get(i);
        const same = P.alive[i] && was !== undefined && was.g === gen[i];
        if (was !== undefined && !same) {
          // Died, from whatever it showed last -- or its slot was written over by a new
          // particle, which the pool does to the oldest when it is full (not this change's).
          if (!P.alive[i] && was.a > (was.twinkle ? 0.6 : 0.25) + 1e-9) {
            problems.push(`a particle vanished from alpha ${was.a} at ${t.toFixed(3)} s`);
          }
          lastAlpha.delete(i);
        }
        if (!P.alive[i] || gen[i] > catchGen) continue;
        const a = particleAlpha(P, i);
        if (same && Math.abs(a - was.a) > 0.4 + 1e-9) {
          problems.push(`a particle's alpha stepped ${was.a} -> ${a} at ${t.toFixed(3)} s`);
        }
        lastAlpha.set(i, { a, g: gen[i], twinkle: P.kind[i] === KIND.TWINKLE });
        if (after) problems.push(`a particle alive at the catch is still alive ${t.toFixed(3)} s in`);
      }
      const nowF = new Map(g.floaters.map((f) => [f, floaterAlpha(f)]));
      for (const [f, a] of lastFloater) {
        if (!nowF.has(f) && a > 0.4 + 1e-9) problems.push(`a floater vanished from alpha ${a} at ${t.toFixed(3)} s`);
        else if (nowF.has(f) && Math.abs(nowF.get(f) - a) > 0.3 + 1e-9) problems.push(`a floater stepped ${a} -> ${nowF.get(f)}`);
      }
      lastFloater.clear();
      for (const [f, a] of nowF) lastFloater.set(f, a);
      if (after && g.floaters.length) problems.push(`${g.floaters.length} floater(s) still up ${t.toFixed(3)} s in`);
    }

    // Draw: every frame through the window, every fourth after it, until well past the impact.
    const draw = inWindow || frames % 4 === 0;
    if (draw) {
      for (const k of Object.keys(count)) count[k] = 0;
      cur = drawR;
      renderer.draw(g, alpha, (frames - lastDrawn) / 160);
      cur = simR;
      if (after) {
        const n = count.ledges + count.companions + count.streaks + count.sparks;
        if (n) {
          problems.push(`drawn ${t.toFixed(3)} s after the catch: ${count.ledges} ledge, ` +
            `${count.companions} companion, ${count.streaks} streak, ${count.sparks} spark draws`);
        }
      }
      // Streaks: a line the pool dropped must have shrunk away or risen off the top.
      const nowLines = new Map();
      for (const s of renderer.streaks) nowLines.set(s, true);
      if (t >= 0 && lastDrawn === frames - 1) {
        for (const s of prevLines.keys()) {
          if (nowLines.has(s)) continue;
          const n = s.out ? Math.ceil(s.cut) : STREAK_LENGTHS[s.li];
          if (n >= 1 && s.y + n * (s.g || 1) > 0 && s.y < SH) vanished++;
        }
      }
      prevLines = nowLines;
      lastDrawn = frames;
    }

    // The ledges and the companions, isolated, lined up with the frame before.
    if (inWindow) {
      const z = g.zoomView || g.zoom, k = z * PX;
      // The shake as the renderer draws it: none on the attract tower these deaths are staged on.
      const [sx, sy] = renderer.shakeOffset(g);
      const cam = renderer.cameraY(g, alpha);
      const ty = Math.round(SH + cam * k) + sy * PX;
      const tx = Math.round(-(C.CX - (C.VW / z) / 2) * k) + sx * PX;
      const crust = g.riseActive ? crustRows(g, ty, k) : null;
      const L = isolated(g, alpha, 'drawPlatforms');
      const Cm = isolated(g, alpha, 'drawCompanions');
      // The first frame of the death: the crust still covers the view to its bottom, which is
      // what lets the tower under the fire go undrawn without a frame showing it go.
      if (dying(g) && !crustChecked) {
        crustChecked = true;
        const F = isolated(g, alpha, 'drawRisingFloor');
        let open = 0;
        for (let y = SH - 6; y < SH; y++) for (let x = 0; x < SW; x++) if (F[y * SW + x] < 255) open++;
        if (open > SW * 6 * 0.02) problems.push(`the crust does not reach the view's bottom as the fire takes him: ${open} px open in the last 6 rows`);
      }
      if (t < 0) { ref = visibleMass(L, crust); refC = visibleMass(Cm, crust); }
      if (prevIso && prevIso.z !== z && t >= 0) {
        // The zoom is gliding, so the pixels do not line up (every art pixel is resampled at
        // a new scale): compare the mass row by row instead, each row now against the row the
        // same world height was on a frame ago, only where both are on screen and seen.
        const step = ref > 0 ? glideChange(prevIso, L, ty, k, crust) / ref : 0;
        worstStep = Math.max(worstStep, step);
        if (step > FRAME_STEP_GLIDE) problems.push(`ledges changed by ${(step * 100).toFixed(1)}% of their mass in one frame at ${t.toFixed(3)} s, zoom gliding`);
      }
      if (prevIso && prevIso.z === z) {
        const dl = change(prevIso.L, L, tx - prevIso.tx, ty - prevIso.ty, crust, prevIso.crust);
        const dc = change(prevIso.C, Cm, tx - prevIso.tx, ty - prevIso.ty, crust, prevIso.crust);
        const step = ref > 0 ? dl.dA / ref : 0;
        const stepC = refC > 0 ? dc.dA / refC : 0;
        if (t >= 0) {
          worstStep = Math.max(worstStep, step);
          worstStepC = Math.max(worstStepC, stepC);
          worstPops = Math.max(worstPops, dl.pops, dc.pops);
          if (step > FRAME_STEP) problems.push(`ledges changed by ${(step * 100).toFixed(1)}% of their mass in one frame at ${t.toFixed(3)} s`);
          if (stepC > FRAME_STEP_COMP && refC > 200) problems.push(`companions changed by ${(stepC * 100).toFixed(1)}% in one frame at ${t.toFixed(3)} s`);
          if (dl.pops > POP_PX || dc.pops > POP_PX) problems.push(`${Math.max(dl.pops, dc.pops)} px popped in one frame at ${t.toFixed(3)} s`);
        }
      }
      // 6. What each companion stands on. In the catch's frame (nothing burned yet): each
      // companion's columns (a run of columns with any of it), its lowest row, and per column
      // the ledge in the few rows under that row; a column past the ledge's end takes the
      // nearest column over it. Then, every frame: its pixels in columns whose ledge is gone.
      if (t >= 0 && !stands) {
        stands = [];
        for (let x = 0; x < SW; x++) {
          let any = false;
          for (let y = 0; y < SH && !any; y++) if (Cm[y * SW + x]) any = true;
          if (!any) continue;
          let x1 = x, y0 = SH, y1 = -1;
          for (;;) {
            let hit = false;
            for (let y = 0; y < SH; y++) if (Cm[y * SW + x1]) { hit = true; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            if (!hit || x1 + 1 >= SW) { if (!hit) x1--; break; }
            x1++;
          }
          const dep = Math.max(2, Math.round(0.75 * k));
          const sup = [];
          for (let c = x; c <= x1; c++) {
            let a = 0;
            for (let y = y1 + 1; y <= Math.min(SH - 1, y1 + dep); y++) a = Math.max(a, L[y * SW + c]);
            sup.push(a);
          }
          const near = sup.map((v, i) => {
            if (v) return i;
            for (let e = 1; e < sup.length; e++) {
              if (i - e >= 0 && sup[i - e]) return i - e;
              if (i + e < sup.length && sup[i + e]) return i + e;
            }
            return -1;
          });
          let mass = 0;
          for (let c = x; c <= x1; c++) for (let y = y0; y <= y1; y++) mass += Cm[y * SW + c];
          if (x1 - x >= 8 && near.some((v) => v >= 0)) stands.push({ x0: x, y0, y1, dep, near, mass, tx, ty, z });
          x = x1;
        }
      }
      if (stands && t >= 0) {
        for (const s of stands) {
          if (s.z !== z) continue;
          const dx = tx - s.tx, dy = ty - s.ty;
          let on = 0;
          for (let i = 0; i < s.near.length; i++) {
            const j = s.near[i];
            if (j < 0) continue;
            const cj = s.x0 + j + dx, ci = s.x0 + i + dx;
            if (cj < 0 || cj >= SW || ci < 0 || ci >= SW) continue;
            let a = 0;
            for (let y = s.y1 + 1 + dy; y <= s.y1 + s.dep + dy; y++) if (y >= 0 && y < SH) a = Math.max(a, L[y * SW + cj]);
            if (a) continue;
            for (let y = Math.max(0, s.y0 + dy); y <= Math.min(SH - 1, s.y1 + dy); y++) on += Cm[y * SW + ci];
          }
          const share = s.mass ? on / s.mass : 0;
          worstFloat = Math.max(worstFloat, share);
          if (share > FLOAT_MAX) problems.push(`a companion stands on nothing at ${t.toFixed(3)} s: ${(share * 100).toFixed(1)}% of it over ledge that has burned away`);
        }
      }
      prevIso = { L, C: Cm, tx, ty, z, k, crust };
    }

    if (g.state === STATE.DEAD || (impactN >= 0 && r.n - impactN > 0.3 / STEP)) break;
  }

  // The camera: from the end of the blend to the impact.
  const fall = camHist.filter((h) => h.t >= FALL_CAM_BLEND + 2 * STEP && !h.impacted);
  for (let i = 2; i < fall.length; i++) {
    const a = fall[i], b = fall[i - 1], c = fall[i - 2];
    const lim = CAM_JERK * a.z;
    // How far the world scrolls this frame, in device px at this frame's scale -- not the
    // camera's absolute row, which a gliding zoom rescales by thousands of px a frame.
    const j = Math.abs((a.cam - b.cam) * a.k - (b.cam - c.cam) * b.k);
    const jd = Math.abs((a.duke - b.duke) - (b.duke - c.duke));
    worstJerk = Math.max(worstJerk, j);
    worstJerkDuke = Math.max(worstJerkDuke, jd);
    if (j > lim || jd > lim) {
      problems.push(`the plunge hitches at ${a.t.toFixed(3)} s: the camera's step changes by ${j.toFixed(1)} px, his by ${jd.toFixed(1)} px`);
    }
  }
  if (vanished) problems.push(`${vanished} streak(s) vanished mid-screen`);

  const uniq = [...new Set(problems)];
  if (uniq.length) {
    fail(`${d.name}: ${uniq.length} problem(s): ${uniq.slice(0, 4).join('; ')}`);
  } else {
    ok(`${d.name}: clear by ${FALL_CLEAR} s; ledges <= ${(worstStep * 100).toFixed(1)}%, companions ` +
      `<= ${(worstStepC * 100).toFixed(1)}% a frame, ${worstPops} px popping at most; no streak ` +
      `vanished; the plunge's step changes by <= ${worstJerk.toFixed(1)} px (his ${worstJerkDuke.toFixed(1)}); ` +
      (stands && stands.length ? `${stands.length} companion(s) on a ledge, at most ${(worstFloat * 100).toFixed(1)}% on nothing`
        : 'no companion on a ledge'));
  }
  summary.push({ name: d.name, frames });
}

console.log(`  [${summary.length} deaths, ${summary.reduce((t, s) => t + s.frames, 0)} frames at 160 Hz]`);
console.log(`\n  RESULT: ${bad ? `FAIL - ${bad} problem(s)` : 'PASS'}`);
process.exit(bad ? 1 : 0);
