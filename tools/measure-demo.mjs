// The attract demo, measured against what the title screen is supposed to show.
//
// "i want a full showcase of the actual game there but the bot should be impeccably good"
// (the user, 2026-09-29). The demo plays the real tower at the game's DEFAULT settings under
// the real fire (autoplay.js startDemo, settings.js DEFAULTS), so what this prints is what the
// menu shows -- measured, not eyeballed. Per tower, over a run of up to --minutes:
//
//   floor      the best floor reached; DIED, with the second the fire took him
//   @2300 @4600  the second each ascension came (Game.ascend); '-' if it never did
//   f/min      floors a minute over the time he was alive; pre and post 2300 separately
//   miss>3     times he fell more than 3 floors below his best: a landing missed badly
//   worst      the deepest he fell below his best [floors]
//   drops      landings on a floor under his best (any depth)
//   stall>2    times 2 s went by with no new best floor while he was alive; the longest gap [s]
//   out gone   steps any part of him was outside the camera's view, and all of him
//   bnc air    wall bounces and air jumps a minute
//   combo      the best combo [floors]; chains of 50 floors or more a minute
//   safe       seconds in the bot's survival mode (AutoPlayer.safeStep: slow and dull)
//   kick       grounded wall kicks a minute (a turn at the wall on foot)
//
//   node tools/measure-demo.mjs                  the DEMO_SEEDS at settings.js DEFAULTS, 10 minutes
//   node tools/measure-demo.mjs --minutes=4 --seeds=463284063,2700617161
//   node tools/measure-demo.mjs --count=40 [--from=0]    40 fresh towers instead
//   node tools/measure-demo.mjs --speed=1.4 --platforms=0.875 --difficulty=1 --gravity=0.9
//   node tools/measure-demo.mjs --json           and one JSON object per tower
//
// The coordinator's re-run on a merged tree is the plain command: DEFAULTS are read from
// settings.js at the time it runs, so a change of default is measured without an edit here.

import { fileURLToPath } from 'node:url';
import { Game, STATE } from '../src/game/game.js';
import { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo, demoSettings } from '../src/game/autoplay.js';
import { STEP } from '../src/core/loop.js';
import { FLOOR_H, PLAYER_W, PLAYER_H, VW, VH, CX } from '../src/game/constants.js';
import { CYCLE_FLOORS } from '../src/game/themes.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };

/**
 * Step `game` with `bot` for up to `minutes` of the world's clock (or until the fire takes him)
 * and return the criteria above. `onStep(game, i)` is called after every step, for a caller
 * that wants frames or a trace of its own.
 */
export function measureRun(game, bot, { minutes = 10, onStep = null } = {}) {
  const steps = Math.round((minutes * 60) / STEP);
  const p = game.player;
  let safeSteps = 0;
  const safeStep = bot.safeStep;
  bot.safeStep = function (g) { safeSteps++; return safeStep.call(this, g); };

  let t = 0, alive = 0, died = false;
  let best = game.run.maxFloor, bestT = 0, longestGap = 0, gapAt = 0, stalls = 0, stallOpen = false;
  let misses = 0, armed = true, worst = 0, drops = 0, dropDepth = 0;
  let out = 0, gone = 0, gturns = 0;
  let wasGrounded = p.grounded, lastVxSign = Math.sign(p.vx);
  let chainsLong = 0, prevActive = false, prevFloors = 0;
  const at = { 2300: null, 4600: null };
  let preT = null;
  // What reads as a glitch rather than a climb: his facing flipping back and forth in the air
  // (the sprite turns with the stick), and a landing on the last few units of a ledge.
  let facing = p.facing, flips = 0, jitter = 0, lastFlip = -1, edges = 0, landings = 0;
  let botMs = 0, worstMs = 0;
  // The opening half minute, which is most of what anyone sees of the title screen.
  let opening = null;

  for (let i = 0; i < steps; i++) {
    const c0 = performance.now();
    bot.step(game, STEP);
    const c1 = performance.now() - c0;
    botMs += c1; if (c1 > worstMs) worstMs = c1;
    game.step(STEP);
    t += STEP;
    if (game.state !== STATE.PLAYING) { died = true; break; }
    alive = t;

    if (p.facing !== facing) {
      facing = p.facing;
      if (!p.grounded) { flips++; if (lastFlip >= 0 && t - lastFlip < 0.15) jitter++; lastFlip = t; }
    }
    if (p.grounded && !wasGrounded) {
      landings++;
      const pl = game.tower.peek(p.floor);
      if (pl && pl.n > 0 && Math.min(p.x + PLAYER_W / 2 - pl.x, pl.x + pl.w - (p.x - PLAYER_W / 2)) < 4) edges++;
    }

    const mf = game.run.maxFloor;
    if (mf > best) {
      best = mf; bestT = t; stallOpen = false;
      for (const k of [CYCLE_FLOORS, 2 * CYCLE_FLOORS]) if (at[k] === null && mf >= k) at[k] = t;
    } else if (t - bestT > 2 && !stallOpen) { stalls++; stallOpen = true; }
    if (t - bestT > longestGap) { longestGap = t - bestT; gapAt = bestT; }

    const below = mf - p.y / FLOOR_H;
    if (below > worst) worst = below;
    if (below > 3 && armed) { misses++; armed = false; }
    if (below < 1) armed = true;

    if (p.grounded && !wasGrounded && p.floor < mf) { drops++; dropDepth = Math.max(dropDepth, mf - p.floor); }
    const sg = Math.sign(p.vx);
    if (p.grounded && wasGrounded && sg && lastVxSign && sg !== lastVxSign) gturns++;
    if (sg) lastVxSign = sg;
    wasGrounded = p.grounded;

    // The camera's view, as the renderer draws it (Renderer.setWorldTransform): the eased
    // zoom, the camera's y at the bottom of the screen.
    const z = game.zoomView || game.zoom;
    const bottom = game.camY, top = game.camY + VH / z;
    const left = CX - VW / z / 2, right = CX + VW / z / 2;
    const x0 = p.x - PLAYER_W / 2, x1 = p.x + PLAYER_W / 2, y0 = p.y, y1 = p.y + PLAYER_H;
    if (y0 < bottom || y1 > top || x0 < left || x1 > right) out++;
    if (y1 < bottom || y0 > top || x1 < left || x0 > right) gone++;

    const c = game.combo;
    if (prevActive && (!c.active || c.floors < prevFloors) && prevFloors >= 50) chainsLong++;
    prevActive = c.active; prevFloors = c.floors;

    if (preT === null && mf >= CYCLE_FLOORS) preT = { t, floor: mf };
    if (opening === null && t >= 30) opening = { floor: mf, bounces: game.run.wallBounces, air: game.run.doubleJumps + game.run.tripleJumps, jitter };
    if (onStep) onStep(game, i);
  }
  if (prevActive && prevFloors >= 50) chainsLong++;
  bot.safeStep = safeStep;

  const r = game.run;
  const mins = Math.max(1 / 60, alive / 60);
  const post = preT && alive > preT.t ? (r.maxFloor - preT.floor) / ((alive - preT.t) / 60) : null;
  return {
    floor: r.maxFloor, died, seconds: alive,
    at2300: at[CYCLE_FLOORS], at4600: at[2 * CYCLE_FLOORS],
    perMin: r.maxFloor / mins,
    perMinPre: preT ? preT.floor / (preT.t / 60) : r.maxFloor / mins,
    perMinPost: post,
    misses, worst, drops, dropDepth, stalls, longestGap, gapAt, out, gone,
    bouncesPerMin: r.wallBounces / mins,
    airPerMin: (r.doubleJumps + r.tripleJumps) / mins,
    bestCombo: r.bestCombo, longChainsPerMin: chainsLong / mins,
    safe: safeSteps * STEP,
    kicksPerMin: r.wallKicks / mins, gturnsPerMin: gturns / mins,
    flipsPerMin: flips / mins, jitter, landings, edges,
    botMsPerSec: botMs / Math.max(1e-9, alive), worstMs,
    opening,
  };
}

/** The demo as the title screen starts it, on `seed`, at `over` in place of any default. */
export function measureDemo(seed, over = {}, opts = {}) {
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  startDemo(game, seed, over);
  return { seed, settings: demoSettings(over), ...measureRun(game, bot, opts) };
}

// [heading, width, decimals, value]: one column of the table each.
const COLUMNS = [
  ['seed', 11, 0, (a) => a.seed], ['floor', 7, 0, (a) => a.floor], ['dead', 5, 0, (a) => (a.died ? 'DIED' : '')],
  ['secs', 6, 0, (a) => a.seconds], ['@2300', 6, 0, (a) => a.at2300], ['@4600', 6, 0, (a) => a.at4600],
  ['f/min', 6, 0, (a) => a.perMin], ['pre', 6, 0, (a) => a.perMinPre], ['post', 6, 0, (a) => a.perMinPost],
  ['miss>3', 7, 0, (a) => a.misses], ['worst', 6, 1, (a) => a.worst], ['drops', 6, 0, (a) => a.drops],
  ['stall>2', 8, 0, (a) => a.stalls], ['gap', 5, 1, (a) => a.longestGap], ['gap@', 6, 0, (a) => a.gapAt],
  ['out', 5, 0, (a) => a.out], ['gone', 5, 0, (a) => a.gone],
  ['bnc/m', 6, 1, (a) => a.bouncesPerMin], ['air/m', 6, 1, (a) => a.airPerMin],
  ['combo', 7, 0, (a) => a.bestCombo], ['50+/m', 6, 2, (a) => a.longChainsPerMin],
  ['safe', 5, 1, (a) => a.safe], ['kick/m', 7, 1, (a) => a.kicksPerMin],
  ['flip/m', 7, 1, (a) => a.flipsPerMin], ['jitter', 7, 0, (a) => a.jitter],
  ['edge', 5, 0, (a) => a.edges], ['bot ms/s', 9, 1, (a) => a.botMsPerSec], ['worst ms', 9, 2, (a) => a.worstMs],
];
const HEAD = ' ' + COLUMNS.map(([h, w]) => h.padStart(w)).join('');
export function formatRow(a) {
  return ' ' + COLUMNS.map(([, w, d, get]) => {
    const v = get(a);
    const s = v === null || v === undefined ? '-' : typeof v === 'string' ? v : Number(v).toFixed(d);
    return s.padStart(w);
  }).join('');
}
export { HEAD };

const invoked = process.argv[1] && fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase()
  === process.argv[1].replace(/\\/g, '/').toLowerCase();
if (invoked) {
  const arg = (name, dflt) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : dflt;
  };
  const over = {};
  for (const [flag, key] of [['speed', 'jumpSpeed'], ['platforms', 'platforms'], ['difficulty', 'difficulty'], ['gravity', 'gravity']]) {
    const v = arg(flag, null);
    if (v !== null) over[key] = Number(v);
  }
  const minutes = Number(arg('minutes', 10));
  const count = Number(arg('count', 0));
  const from = Number(arg('from', 0));
  const seeds = arg('seeds', null) ? arg('seeds').split(',').map((s) => Number(s) >>> 0)
    : count > 0 ? Array.from({ length: count }, (_, i) => (0x9e3779b9 * (from + i + 1) + 0x7f4a7c15) >>> 0)
      : DEMO_SEEDS;
  const json = process.argv.includes('--json');
  const s = demoSettings(over);
  console.log(`\n  the attract demo: JUMP SPEED ${s.jumpSpeed}, PLATFORMS ${s.platforms}, DIFFICULTY ${s.difficulty}, GRAVITY ${s.gravity}; ${seeds.length} tower(s), up to ${minutes} min each\n`);
  console.log(HEAD);
  const all = [];
  for (const seed of seeds) {
    const a = measureDemo(seed, over, { minutes });
    all.push(a);
    console.log(formatRow(a));
    if (json) console.log('  ' + JSON.stringify(a));
  }
  const n = all.length;
  const mean = (k) => all.reduce((x, a) => x + (a[k] || 0), 0) / n;
  console.log(`\n  ${all.filter((a) => a.floor >= CYCLE_FLOORS).length}/${n} passed ${CYCLE_FLOORS}, ${all.filter((a) => a.floor >= 2 * CYCLE_FLOORS).length}/${n} passed ${2 * CYCLE_FLOORS}, ${all.filter((a) => a.died).length} died;`
    + ` mean ${mean('perMin').toFixed(0)} floors/min, misses>3 ${all.reduce((x, a) => x + a.misses, 0)}, stalls>2s ${all.reduce((x, a) => x + a.stalls, 0)},`
    + ` steps out of view ${all.reduce((x, a) => x + a.out, 0)} (gone ${all.reduce((x, a) => x + a.gone, 0)}),`
    + ` ${mean('bouncesPerMin').toFixed(1)} bounces/min, ${mean('airPerMin').toFixed(1)} air jumps/min`);
}
