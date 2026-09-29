// Is the attract bot as fast as it can be on the tower it is given?
//
// "Faster than before" is easy to show and worth very little. This asks the harder
// question -- how much of what the level geometry actually offers is being taken -- and
// it answers it three ways, because any one of them alone can flatter the bot.
//
//   1. THE ABSTRACT CEILING. Ignore the tower entirely. Given the physics, how many
//      floors per minute could a climber post if a platform always sat exactly where the
//      best possible jump lands? Nothing can beat this. Nothing can reach it either.
//
//   2. THE OFFERED CEILING. At every takeoff the bot actually made, find the highest
//      floor that was REACHABLE from that exact state -- platform present, inside an
//      honest reach window -- and compare it with what the bot took. This is the number
//      that matters: it is the difference between "the bot is leaving floors behind" and
//      "the tower has nothing higher to offer".
//
//   3. THE PERTURBATION TEST. Nudge every tuned parameter up and down and re-measure.
//      If the bot is at an optimum, every nudge should make it worse. If any single
//      change improves it, the search stopped early and this prints it.
//
// Run:  node tools/test-optimal.mjs [towers] [minutes]

import { Game, STATE } from '../src/game/game.js';
import { AutoInput, AutoPlayer, TUNE, startDemo } from '../src/game/autoplay.js';
import { gravityOf } from '../src/game/player.js';
import { audit } from './test-botskill.mjs';
import { STEP } from '../src/core/loop.js';
import {
  GRAVITY, FLOOR_H, PLAYER_W, ACCEL_AIR, AIR_JUMP_SCALE, AIR_JUMP_UNLOCK,
  JUMP_V0_MIN, JUMP_V0_MAX, JUMP_MOMENTUM_BONUS, INSTAJUMP_BONUS, VX_MAX_HOT,
} from '../src/game/constants.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = { addEventListener() {} };

const TOWERS = Number(process.argv[2] || 40);
const MINUTES = Number(process.argv[3] || 2);
const AIR_C = 0.35;
// How much of his air control the offered window of part 2 counts on. It was the bot's own
// TUNE.assistBest (0.602) until 2026-09-29, when the bot rebuilt that day stopped assuming
// any: it flies every plan through the model (autoplay.js fly). Kept at that number so the
// window is the one this suite always measured against.
const REACH_ASSIST = 0.602;

/**
 * Apex and airtime [his seconds] for a jump of v0 that spends `n` air jumps where the bot's
 * early release does (TUNE.relHi: the same number and meaning TUNE.releaseFrac had, 1.1), under
 * gravity `G` (GRAVITY, or HIS, gravityOf, at the run's setting).
 */
function arc(v0, dy, n, G = GRAVITY) {
  const J = v0 * AIR_JUMP_SCALE;
  const rel = TUNE.relHi * v0 * AIR_JUMP_SCALE;
  let vy = v0;
  let h = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (rel >= vy) break;
    t += (vy - rel) / G;
    h += (vy * vy - rel * rel) / (2 * G);
    vy = rel * AIR_C + J;
  }
  const apex = h + (vy * vy) / (2 * G);
  if (dy > apex) return null;
  // Platforms are one-way: landing means falling back through the surface.
  return { apex, t: t + vy / G + Math.sqrt(2 * (apex - dy) / G) };
}

// --- 1. the abstract ceiling ------------------------------------------------
const V0 = (JUMP_V0_MIN + (JUMP_V0_MAX - JUMP_V0_MIN) + JUMP_MOMENTUM_BONUS) * INSTAJUMP_BONUS;
let ceiling = 0;
let ceilingK = 0;
for (let k = 1; k <= 30; k++) {
  for (const n of [0, 1, 2]) {
    const a = arc(V0, k * FLOOR_H, n);
    if (!a) continue;
    const rate = (k / a.t) * 60;
    if (rate > ceiling) { ceiling = rate; ceilingK = k; }
  }
}

// --- 2. what the tower actually offered -------------------------------------
let got = 0;
let avail = 0;
let jumps = 0;
let best = 0;
let towerCapped = 0;

for (let s = 0; s < TOWERS; s++) {
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  // The demo as the menu shows it: its settings, the real tower and fire (autoplay.js).
  startDemo(game, (0x27d4eb2f * (s + 11) + 0x165667b1) >>> 0);

  let wasG = true;
  let launchFloor = 0;
  let offered = 0;
  for (let i = 0; i < 240 * 60 * MINUTES; i++) {
    const p = game.player;
    const grounded = p.grounded;
    bot.step(game, STEP);
    game.step(STEP);

    if (grounded && !game.player.grounded) {
      launchFloor = p.floor;
      const v0 = p.jumpImpulse();
      const nAir = p.momentum >= AIR_JUMP_UNLOCK ? (p.tripleUnlocked ? 2 : 1) : 0;
      offered = 0;
      for (let k = 30; k >= 1; k--) {
        const tgt = game.tower.peek(p.floor + k);
        if (!tgt) continue;
        let t = null;
        for (let n = 0; n <= nAir && t === null; n++) {
          const a = arc(v0, k * FLOOR_H, n, gravityOf(p));
          if (a) t = a.t;
        }
        if (t === null) continue;
        const drift = p.x + p.vx * t;
        const ctrl = 0.5 * ACCEL_AIR * t * t * REACH_ASSIST;
        if (drift + ctrl >= tgt.x + PLAYER_W * 0.5 && drift - ctrl <= tgt.x + tgt.w - PLAYER_W * 0.5) {
          offered = k;
          break;
        }
      }
    }
    if (!wasG && game.player.grounded && offered > 0) {
      const gained = game.player.floor - launchFloor;
      got += Math.max(0, gained);
      avail += offered;
      jumps++;
      if (gained >= offered) best++;
      if (offered < ceilingK) towerCapped++;
      offered = 0;
    }
    wasG = game.player.grounded;
    if (game.state !== STATE.PLAYING) break;
  }
}

// --- 3. perturbation ---------------------------------------------------------
const seeds = Array.from({ length: 60 }, (_, i) => (0x9e3779b9 * (i + 1)) >>> 0);
const measure = () => {
  const rows = seeds.map((x) => audit(x, 1.5));
  return rows.reduce((a, r) => a + r.perMin, 0) / rows.length;
};
const baseRate = measure();
const DEFAULTS = { ...TUNE };
// Not judgement: the model's horizon (a flight longer is a fall) and the price of a death.
const skip = new Set(['maxFlight', 'firePenalty']);
const improvements = [];
for (const key of Object.keys(DEFAULTS)) {
  if (skip.has(key)) continue;
  const v = DEFAULTS[key];
  if (typeof v !== 'number') continue;
  for (const mult of [0.8, 1.25]) {
    TUNE[key] = v === 0 ? (mult > 1 ? 0.2 : 0) : v * mult;
    if (TUNE[key] === v) continue;
    const r = measure();
    if (r > baseRate + 4) improvements.push([key, v, TUNE[key], r]);
    TUNE[key] = v;
  }
  TUNE[key] = v;
}
Object.assign(TUNE, DEFAULTS);

// --- report ------------------------------------------------------------------
console.log(`\n  OPTIMALITY, ${TOWERS} towers x ${MINUTES} min, ${jumps} jumps\n`);
console.log(`  1. abstract ceiling (a platform always exactly where you want one)`);
console.log(`       ${ceiling.toFixed(0)} floors/min, via ${ceilingK}-floor jumps`);
console.log(`\n  2. what the tower actually offered`);
console.log(`       mean floors offered at takeoff   ${(avail / jumps).toFixed(2)}`);
console.log(`       mean floors taken                ${(got / jumps).toFixed(2)}`);
console.log(`       capture rate                     ${(got / avail * 100).toFixed(1)}%`);
console.log(`       jumps taking the best on offer   ${(best / jumps * 100).toFixed(1)}%`);
console.log(`       takeoffs where the TOWER, not the bot, was the limit  ${(towerCapped / jumps * 100).toFixed(1)}%`);
console.log(`\n  3. perturbation: every tuned number nudged +-20-25%`);
console.log(`       baseline ${baseRate.toFixed(1)} floors/min`);
if (!improvements.length) {
  console.log(`       no single change improved it by more than 4 floors/min -- at a local optimum`);
} else {
  console.log(`       ${improvements.length} change(s) DID improve it, the search stopped early:`);
  for (const [k, from, to, r] of improvements) {
    console.log(`         ${k.padEnd(14)} ${String(from).padStart(8)} -> ${String(to).padStart(8)}   ${r.toFixed(1)}/min`);
  }
}

const bad = improvements.length > 0 || (got / avail) < 0.9;
console.log('\n  ' + (bad
  ? 'RESULT: FAIL - there is measurable speed left on the table.'
  : 'RESULT: PASS - the bot takes what the tower offers and no parameter nudge beats it.'));
process.exit(bad ? 1 : 0);
