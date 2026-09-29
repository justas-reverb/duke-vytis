// Headless playtest.
//
// test-reach.mjs proves the GEOMETRY is always climbable. That is not the same claim
// as "a player can actually climb it": the geometry check uses a closed-form model of
// the jump, while the real game integrates at 1/240 s with friction, air control, a
// one-way collision scan and a rising camera. This harness runs the real simulation
// with a bot at the controls and checks the tower is climbable in practice.
//
// The bot is deliberately mediocre. It does not build momentum, it does not chain
// combos, it does not use wall bounces. It walks to roughly under the next platform
// and jumps. If a weak bot can climb forever, the guarantee holds for a human.

import { Game, STATE } from '../src/game/game.js';
import { Input } from '../src/core/input.js';
import { STEP } from '../src/core/loop.js';
import { FLOOR_H, PLAYER_W, CX, ARENA_HALF_MIN, ARENA_HALF_MAX } from '../src/game/constants.js';

// --- minimal stubs ---------------------------------------------------------
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = { addEventListener() {} };

class BotInput extends Input {
  constructor() {
    super({ addEventListener() {} });
    this.wantAxis = 0;
    this.wantJump = false;
  }
  get axis() { return this.wantAxis; }
  consumeJump() {
    if (this.wantJump) { this.wantJump = false; return true; }
    return false;
  }
  step() {}
  endFrame() {}
}

function runOne(seed, maxSeconds, opts = {}) {
  const input = new BotInput();
  const game = new Game(input);
  game.newRun(seed, null, 1, opts.platforms || 1);
  // The bot is being tested for climbing, not for surviving a rising floor, so the
  // rise is optional. With it off, getting stuck is the ONLY way the run can end.
  if (opts.noRise) game.riseRate = () => 0;

  let t = 0;
  let stuckFor = 0;
  let lastFloor = -1;
  let worstStall = 0;
  // The shaft must only ever open. If it could close, platforms committed while it was
  // narrow could end up outside it, and a wall could close onto the player.
  let arenaShrank = 0;
  let outOfBounds = 0;
  let platOutside = 0;
  let pruneMisses = 0;
  let prevArena = game.arenaHalf;
  const steps = Math.ceil(maxSeconds / STEP);

  for (let i = 0; i < steps; i++) {
    const p = game.player;
    const target = game.tower.get(p.floor + 1);
    if (target) {
      if (p.grounded && !opts.holdJump) {
        // Stand on the point of this platform nearest the next one, come to a near
        // stop, then jump. This is deliberately the WORST case the reachability
        // guarantee is written for: zero momentum, weakest jump in the game. A bot
        // that builds speed would be an easier test, not a harder one.
        const aim = Math.max(target.x + 5, Math.min(target.x + target.w - 5, p.x));
        const dx = aim - p.x;
        if (Math.abs(dx) > 4) {
          // Brake rather than sprint, so the meter never fills and the jump stays weak.
          input.wantAxis = (Math.abs(p.vx) > 95 && Math.sign(p.vx) === Math.sign(dx))
            ? -Math.sign(p.vx) : Math.sign(dx);
        } else {
          input.wantAxis = Math.abs(p.vx) > 18 ? -Math.sign(p.vx) : 0;
          if (Math.abs(p.vx) < 30) input.wantJump = true;
        }
      } else {
        // Airborne steering. Aim at the centre but BRAKE once inside the platform, or
        // on a narrow ledge the bot sails straight over it. Platforms are now sized
        // relative to the room and start around 33 px wide, which is a smaller window
        // than the old flat 130 px and needs actual control rather than full tilt.
        const tc = target.x + target.w / 2;
        const dx = tc - p.x;
        const inside = Math.abs(dx) < target.w * 0.35;
        if (inside && Math.abs(p.vx) > 40) input.wantAxis = -Math.sign(p.vx);
        else if (Math.abs(dx) < 2) input.wantAxis = 0;
        else input.wantAxis = Math.sign(dx);
        if (!opts.holdJump && p.vy < -10 && p.y < target.y - 2 && p.airJumps > 0) {
          input.wantJump = true;
        }
      }
    }
    // Held while airborne, released on landing.
    //
    // Both halves matter. Releasing in the air triggers the jump-cut and the bot only
    // gets a quarter of its jump height, which strands it. Holding on the ground
    // triggers the instajump and overrides the brake-and-line-up plan that makes this
    // the weakest-possible player the guarantee is written for. `holdJump` runs hold
    // throughout and are a separate pass below.
    input.jumpHeld = opts.holdJump ? true : !game.player.grounded;

    game.step(STEP);
    t += STEP;

    // A pruned floor being asked for again means the player is falling through a hole
    // where a platform used to be.
    if (game.tower.pruneMisses) pruneMisses = game.tower.pruneMisses;
    if (game.arenaHalf < prevArena - 1e-6) arenaShrank++;
    prevArena = game.arenaHalf;
    if (game.arenaHalf < ARENA_HALF_MIN - 1e-6 || game.arenaHalf > ARENA_HALF_MAX + 1e-6) arenaShrank++;
    const lo = CX - game.arenaHalf;
    const hi = CX + game.arenaHalf;
    if (game.player.x < lo - 0.01 || game.player.x > hi + 0.01) outOfBounds++;
    const here = game.tower.get(game.player.floor);
    if (here && here.n > 0 && (here.x < lo - 0.01 || here.x + here.w > hi + 0.01)) platOutside++;

    // "Stuck" means the player cannot change floor at all -- not merely that they have
    // not beaten their best. Since the camera fix, falling several floors is survivable
    // and the bot climbs back, which took seconds and looked identical to being stuck
    // under the old max-floor-based metric.
    if (game.player.floor !== lastFloor) {
      lastFloor = game.player.floor;
      if (stuckFor > worstStall) worstStall = stuckFor;
      stuckFor = 0;
    } else {
      stuckFor += STEP;
    }

    if (game.state !== STATE.PLAYING) break;
  }

  return {
    seed,
    arenaShrank,
    pruneMisses,
    outOfBounds,
    platOutside,
    openness: game.openness,
    arenaHalf: game.arenaHalf,
    instaChain: game.run.bestInstaChain,
    floor: game.run.maxFloor,
    seconds: t,
    died: game.state !== STATE.PLAYING,
    worstStall: Math.max(worstStall, stuckFor),
    violations: game.tower.violations,
    floorsPerSec: game.run.maxFloor / t,
  };
}

const SEEDS = Number(process.argv[2] || 40);
const SECS = Number(process.argv[3] || 90);

console.log('');
console.log('  Bot playtest: ' + SEEDS + ' seeds x ' + SECS + 's of simulated play');
console.log('  (rising floor disabled -- the only way to stop is to get stuck)');
console.log('');

let fails = 0;
let totalFloors = 0;
let worstStallAll = 0;
let worstSeed = 0;
const stalls = [];

for (let s = 0; s < SEEDS; s++) {
  const seed = (0x9e3779b9 * (s + 1)) >>> 0;
  const r = runOne(seed, SECS, { noRise: true });
  totalFloors += r.floor;
  stalls.push(r.worstStall);
  if (r.worstStall > worstStallAll) { worstStallAll = r.worstStall; worstSeed = seed; }

  // A bot that cannot get up a floor within 6 seconds is stuck. The single longest
  // legitimate delay is walking the full play width and jumping, well under 3 s.
  const stuck = r.worstStall > 6;
  const tooSlow = r.floor < 40;
  const arenaBad = r.arenaShrank || r.outOfBounds || r.platOutside || r.pruneMisses;
  if (stuck || tooSlow || r.violations || arenaBad) {
    fails++;
    console.log('  FAIL seed ' + seed + '  floor=' + r.floor +
      '  worstStall=' + r.worstStall.toFixed(2) + 's  violations=' + r.violations +
      '  arenaShrank=' + r.arenaShrank + ' oob=' + r.outOfBounds +
      ' platOutside=' + r.platOutside + ' pruneMisses=' + r.pruneMisses);
  }
}

stalls.sort((a, b) => a - b);
const median = stalls[stalls.length >> 1];

console.log('  seeds run            ' + SEEDS);
console.log('  floors climbed       ' + totalFloors.toLocaleString() +
  '  (avg ' + Math.round(totalFloors / SEEDS) + ' per run)');
console.log('  median worst stall   ' + median.toFixed(2) + 's');
console.log('  longest stall of all ' + worstStallAll.toFixed(2) + 's  (seed ' + worstSeed + ')');
console.log('  failures             ' + fails);
console.log('');

// Second pass WITH the rising floor, to confirm the game is actually survivable
// for a mediocre player rather than an instant loss.
console.log('  Shaft: opens from ' + (ARENA_HALF_MIN * 2) + 'px to ' + (ARENA_HALF_MAX * 2) + 'px');
console.log('');
console.log('  Same bot, rising floor ON:');
let died = 0;
let sum = 0;
for (let s = 0; s < 12; s++) {
  const seed = (0x85ebca6b * (s + 1)) >>> 0;
  const r = runOne(seed, 120, {});
  sum += r.floor;
  if (r.died) died++;
  console.log('    seed ' + String(seed).padStart(10) + '  floor ' + String(r.floor).padStart(4) +
    '  ' + r.seconds.toFixed(1) + 's  ' + (r.died ? 'fell' : 'survived to time limit'));
}
console.log('  avg floor ' + Math.round(sum / 12) + ', ' + died + '/12 eventually fell');
console.log('');

// Third pass: the held-jump style the instajump exists for.
console.log('  Held-jump (instajump) bot, rising floor ON:');
let hSum = 0, hChain = 0, hFloorBest = 0;
for (let s2 = 0; s2 < 12; s2++) {
  const seed = (0xc2b2ae35 * (s2 + 1)) >>> 0;
  const r = runOne(seed, 120, { holdJump: true });
  hSum += r.floor;
  hChain = Math.max(hChain, r.instaChain);
  hFloorBest = Math.max(hFloorBest, r.floor);
  if (r.arenaShrank || r.outOfBounds || r.platOutside) {
    fails++;
    console.log('    FAIL seed ' + seed + ' arena invariants broken');
  }
}
console.log('    avg floor ' + Math.round(hSum / 12) + ', best ' + hFloorBest +
  ', longest instajump chain ' + hChain);
// Fourth pass: the same weak bot on NORMAL platforms (settings.js PLATFORM_WIDTHS), the
// narrowest offered and the tower a player gets by default since 2026-09-29 -- ledges an eighth
// narrower than 1's, down to 28 where 1 stops at 32 (SMALL, 0.75, until then). Still never
// stuck: the gaps are the reach proof's whatever the width.
console.log('  Same bot on NORMAL platforms, rising floor off:');
{
  let sFloors = 0, sWorst = 0, sFails = 0;
  for (let s = 0; s < 16; s++) {
    const seed = (0x27d4eb2f * (s + 1)) >>> 0;
    const r = runOne(seed, SECS, { noRise: true, platforms: 0.875 });
    sFloors += r.floor;
    sWorst = Math.max(sWorst, r.worstStall);
    if (r.worstStall > 6 || r.floor < 40 || r.violations || r.arenaShrank || r.outOfBounds || r.platOutside || r.pruneMisses) {
      sFails++;
      console.log('    FAIL seed ' + seed + '  floor=' + r.floor + '  worstStall=' + r.worstStall.toFixed(2) + 's');
    }
  }
  fails += sFails;
  console.log('    16 seeds: avg floor ' + Math.round(sFloors / 16) + ', longest stall ' + sWorst.toFixed(2) + 's, ' + sFails + ' stuck');
}
console.log('');
console.log(fails === 0 ? '  RESULT: PASS - the bot never got stuck.'
                        : '  RESULT: FAIL - ' + fails + ' seed(s) unclimbable.');
process.exit(fails === 0 ? 0 : 1);
