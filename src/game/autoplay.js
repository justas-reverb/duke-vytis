// Attract mode: a bot that plays the real game behind the menu.
//
// Not a recording and not a renderer special case -- a second Game instance running the
// same simulation, driven by a synthetic input. Whatever it does on screen is something
// the game can actually do, including dying, which is why the menu restarts it.
//
// Since 2026-09-29 it plays the game a player gets: the real tower, the real fire, at the
// game's default settings (startDemo): the user asked for the title screen to show the real
// game in full, played flawlessly. Until then the demo was a game of its own --
// a flow tower (a ramp at the steepest legal slope, ledges 1.6 times as wide, no squeeze), a
// fire at 0.55 of EASY's, 130% -- and the bot had been tuned for four rounds against it.
//
// ROUNDS ONE TO FOUR, the planner that did (see docs/BOT.md for each change and its number):
// every frame it asked, from the closed-form jump arc the reach proof uses, which floors it
// could reach, picked the highest whose platform the ballistic path landed on, and steered by
// flying three stick positions forward through the wall physics. Over 400 towers it went from
// 205 floors a minute to 826 on the flow tower, and 805 after the walls began answering the
// combo. On the real tower at the defaults it could not live: measured on the five demo seeds
// of the day at 140%, NORMAL ledges (0.875), MEDIUM fire and gravity 0.9, it died on every
// one inside 66 seconds (floors 26, 449, 526, 900, 990), and on thirty fresh towers it died
// on all thirty (mean floor 680). Not by falling: 29 of the 30 were caught by the fire above
// their best floor. Past floor 450 MEDIUM's fire trails the best floor by 43 units -- under a
// floor and a half -- and climbs 7 to 10 floors a second, so every landing must be a new best
// taken fast enough to outrun it. The planner took short hops (19 of the deaths came in the
// air after a planned hop of one to six floors): a jump at speed rises to its full apex
// whatever floor it is aimed at, so a two-floor hop is a 0.85-second flight, and the fire
// gains seven floors in it. Its window also never saw far targets -- it folded the walls in
// only as a fallback, and a flight at 430 units a second meets a wall in a quarter of a second.
//
// ROUND FIVE is this file: a planner that flies every option it considers by his own rules.
//
//   1. THE MODEL IS PLAYER.STEP. fly() is Player.step in the air, a step of the world's clock
//      at his rate, the same sums in the same order: the stick, the overdrive's bleed, the cap,
//      the meter, the air jump, gravity, the walls through the game's own wallBounceOut, and
//      the one-way ledges landed on as Player.step lands on them -- the first one his feet
//      cross going down, any overlap. takeoff() is the step he jumps in. So a flight flown in
//      the model is the flight he flies: over three minutes of play, 139 landings in 139 were
//      on the ledge planned. (Where it is not: the shaft widening mid-flight, which verify
//      catches.)
//   2. A PLAN IS A FLIGHT: a stick held one way (-1, 0, 1), or changed once -- after 0.05 to
//      0.36 of his seconds, or at the first wall bounce, flat out into the wall and then let
//      go or pushed on with it -- and an air jump spent early, late, now, or kept: PLANS by
//      AIR_MODES, 124 of them. On the ground each is flown from the step he would jump in;
//      the best by value() is taken, and flown.
//   3. IT FLIES WHAT IT CHOSE. The frame-by-frame choice the controller used to make flip-
//      flopped: flights of a second with combo-lifted wall bounces land chaotically -- one step
//      of difference in the stick moved a landing 177 units -- so the best choice changed from
//      frame to frame, and his facing turned 800 times a minute, the sprite flickering left and
//      right. Now the flight chosen is flown open loop, checked every frame (flown on from where
//      he is: does it still land where it said?), and re-planned only when it no longer does,
//      or every TUNE.replanEvery steps when something better by TUNE.switchMargin turns up.
//   4. VALUE. A flight is worth the floors it gains, less its time (TUNE.timeWeight floors a
//      world second), plus what the landing leaves for the next jump (nextProxy: the apex a
//      jump off it reaches at the landing speed and meter, and whether that jump can outrun the
//      fire), minus a landing the fire gets to first (fireAt), and less the things that look
//      wrong: a landing on the last units of a ledge, his facing turned and turned back (a
//      twitch), steps spent beyond the edge of the view while it glides out after the shaft.
//
// Measured on the same thirty towers at the same settings: none died in four minutes. The
// numbers the demo is held to are beside DEMO_SEEDS, and tools/measure-demo.mjs prints them.

import {
  FLOOR_H, PLAYER_W, VX_MAX_COLD, VX_MAX_HOT, ACCEL_AIR, ACCEL_GROUND, FRICTION,
  AIR_JUMP_SCALE, AIR_JUMP_UNLOCK, CX, VW, WALL_BOUNCE_MIN, WALL_RESTITUTION_GROUND,
  MOM_RUN_THRESHOLD, MOM_UP, MOM_DOWN, JUMP_V0_MIN, JUMP_V0_MAX, JUMP_MOMENTUM_BONUS,
  INSTAJUMP_BONUS, OVERDRIVE_DECAY, RISE_CATCHUP,
} from './constants.js';
// gravityOf and terminalOf: HIS gravity and fall cap, the run's GRAVITY setting times the
// world's. The model flies him by them, as Player.step does.
import { wallBounceOut, gravityOf, terminalOf } from './player.js';
// The game's defaults, which the attract demo plays at (demoSettings).
import { DEFAULTS } from './settings.js';

/**
 * Hand-picked towers for attract mode.
 *
 * The demo used to roll a random seed, which made the title screen a lottery. These are the
 * best five of 200 fresh towers searched by tools/find-demo-seed.mjs on the real tower at the
 * game's defaults (140%, NORMAL ledges 0.875, MEDIUM, gravity 0.9): each survived ten
 * minutes, passed floor 2300 at 91-92 s and 4600 at 169-172 s, with no landing missed by
 * three floors, no two seconds without a new best and not one step with any of him outside
 * the view. Measured over those ten minutes, the five:
 *
 *   floors (a minute to 2300, after)  bounces/min  air jumps/min  twitches  edge landings
 *   1086762850  18,777 (1,532, 1,940)         98.3          121.3        19              3
 *    164282307  18,666 (1,520, 1,929)         98.8          121.3        23              0
 *    185864468  18,721 (1,516, 1,936)         98.8          120.5        16              2
 *    608062194  18,714 (1,529, 1,933)         98.8          119.3        19              4
 *   2896803167  18,748 (1,506, 1,941)         98.4          119.0        14              0
 *
 * Every one of the 200 passed floor 4600 alive, so survival no longer tells towers apart; they
 * were picked on the view (82 towers had a step with part of him past its edge, the shaft
 * widening under a view still gliding out to it) and then on what a viewer sees, the first
 * half minute counted twice. The demo of the day before, on its flow tower at 130% under a
 * fire at 0.55, climbed 1,100 floors a minute to 2300 on its five.
 *
 * Rotated rather than fixed, so the menu is consistently good without being identical
 * every time. Regenerate with:  node tools/find-demo-seed.mjs
 */
export const DEMO_SEEDS = [1086762850, 164282307, 185864468, 608062194, 2896803167];

/**
 * The attract demo's settings: the game's own DEFAULTS (settings.js) -- JUMP SPEED, PLATFORMS,
 * DIFFICULTY and GRAVITY -- with `over` in place of any of them (tools/measure-demo.mjs passes
 * values to measure at). Never the player's saved settings: the demo is the game as a new
 * player gets it, the same on every machine, whatever this one has chosen (test-feel section
 * 7 holds it). Read, not copied: a default changed in settings.js is the demo's too.
 */
export function demoSettings(over = {}) {
  return {
    jumpSpeed: DEFAULTS.jumpSpeed, platforms: DEFAULTS.platforms,
    difficulty: DEFAULTS.difficulty, gravity: DEFAULTS.gravity, ...over,
  };
}

/**
 * Start `game` as the title screen's demo, on `seed` (the next of DEMO_SEEDS by default), at
 * demoSettings(over). main.js starts every demo here, and so does every suite and tool that
 * stages the demo, so they all play the run the menu shows. `demo` is set first: newRun
 * reads it.
 */
export function startDemo(game, seed = nextDemoSeed(), over = {}) {
  const s = demoSettings(over);
  game.demo = true;
  game.newRun(seed, null, s.jumpSpeed, s.platforms, s.difficulty, s.gravity);
  return game;
}

// Start somewhere random in the list, not at the beginning.
//
// This was a real bug and it was very visible: the index reset to 0 on every page load,
// and the first tower ran longer than the menu then let a demo run (120 s, since
// removed) -- so every single visit played seed [0] and nothing else. The rotation
// existed and never rotated. Anyone who opened the game twice saw the identical run.
let demoSeedIndex = Math.floor(Math.random() * DEMO_SEEDS.length);
export function nextDemoSeed() {
  const s = DEMO_SEEDS[demoSeedIndex % DEMO_SEEDS.length];
  demoSeedIndex++;
  return s;
}

/**
 * Every number the bot's judgement depends on, in one overridable object: a sweep sets
 * `globalThis.__BOTTUNE` before importing this module, and nothing else touches it.
 *
 * Measured, not chosen: tools/measure-demo.mjs over fresh towers at the demo's settings and
 * at the harshest the menu offers (100%, the old SMALL ledges, HARD, the heaviest gravity).
 * The two that matter most go together. timeWeight at 2 climbed 1,485 floors a minute over
 * twelve towers, at 20 1,710; at 45 five towers in twelve died (it takes short, quick hops).
 * At 20 with nextWeight 0.35 the harsh settings killed 23 towers in 24: it bought time by
 * landings that killed his speed, and a slow landing is a small next jump the fire catches.
 * With nextWeight 1 none of the 24 died, and they climbed fastest (1,161 a minute).
 */
export const TUNE = {
  maxFlight: 2.4,      // his seconds the model flies before calling a flight a fall [s; flights last 0.5-1.4]
  replanEvery: 12,     // world steps between looks for a better flight while flying one [steps; 12 = 0.05 s]
  switchMargin: 1,     // how much more (value, in floors) a new flight must be worth to take over
  relHi: 1.1,          // an air jump spent early: when vy falls to relHi x AIR_JUMP_SCALE x v0
  relLo: 0.4,          // ...or late, near the height-optimal release (see docs/BOT.md)
  fireMin: 10,         // world units a landing must keep over the fire, or it is a death [typical 10]
  firePenalty: 1000,   // floors a landing the fire reaches first costs
  timeWeight: 20,      // floors a world second of flight costs [floors/s; the climb rate it trades at]
  nextWeight: 1,       // how much each floor the NEXT jump can reach off the landing is worth
  nextFireCost: 2,     // floors each floor that next jump would fall short of the fire costs
  ovWeight: 1.5,       // floors a landing well on its ledge is worth (ovFull or more of him on it)
  ovFull: 8,           // world units of overlap that count as well on [the Duke is 16 wide]
  edgeOv: 5,           // world units of overlap under which a landing is on the edge
  edgeCost: 3,         // floors a landing on the very edge costs, less the more of him is on
  bounceWeight: 0.25,  // floors a wall bounce on the way is worth: the show
  stick: 1.5,          // floors keeping the landing already committed to is worth
  flipCost: 0.3,       // floors a turn of his facing in the air costs
  twitch: 0.15,        // world seconds: a turn made this soon after the last one is a twitch
  twitchCost: 3,       // floors a twitch costs: the sprite turned and turned back reads as a glitch
  hiddenCost: 0.2,     // floors a step of him beyond the edge of the view costs
  minGain: 1,          // floors a jump must gain for him to take it while he has time to wait
  buildGain: 4,        // ...while the meter is still filling and he has time to fill it
  buildSlack: 2.5,     // seconds of fire slack that count as time to fill the meter
  waitSlack: 1.5,      // seconds of fire slack he needs before he waits on the ground for a gain
  noPlanLimit: 0.6,    // seconds on the ground without a jump before he takes the best there is
  stallLimit: 3.72,    // seconds on one floor before the watchdog forces safeStep
  safeFor: 5.856,      // seconds of safeStep once it trips
  turnEarly: 18.186,   // world units from the wall to turn round when running on the ground
};
Object.assign(TUNE, globalThis.__BOTTUNE || {});

/** Implements the same surface as core/input.js, without a keyboard. */
export class AutoInput {
  constructor() {
    this.wantAxis = 0;
    this.wantJump = false;
    this.jumpHeld = false;
    this.down = new Set();
  }
  get axis() { return this.wantAxis; }
  consumeJump() {
    if (this.wantJump) { this.wantJump = false; return true; }
    return false;
  }
  pressed() { return false; }
  step() {}
  endFrame() {}
}

// ---- the flight model --------------------------------------------------------------------

/** The jump impulse Player.jumpImpulse gives at speed |vx|, meter `mom` and bounce `b`. */
function impulse(vx, mom, b) {
  const sf = Math.min(1, Math.abs(vx) / VX_MAX_HOT);
  return (JUMP_V0_MIN + sf * (JUMP_V0_MAX - JUMP_V0_MIN) + mom * JUMP_MOMENTUM_BONUS) * b;
}

/**
 * The top of a jump of impulse `v0` off the ground (held: an instajump) that spends `nAir` air
 * jumps at TUNE.relHi, and the time from the takeoff to it [his seconds], under his gravity `G`:
 * the vertical alone, as the next jump off a landing would fly it. Into ARC, not a new object.
 */
function jumpArc(v0, nAir, G) {
  const J = v0 * AIR_JUMP_SCALE;
  const rel = TUNE.relHi * J;
  let vy = v0 * INSTAJUMP_BONUS, h = 0, t = 0;
  for (let i = 0; i < nAir && rel < vy; i++) {
    t += (vy - rel) / G;
    h += (vy * vy - rel * rel) / (2 * G);
    vy = rel * 0.35 + J;
  }
  ARC.apex = h + (vy * vy) / (2 * G);
  ARC.t = t + vy / G;
  return ARC;
}
const ARC = { apex: 0, t: 0 };

// The stick plans: held one way, or changed once -- at one of SWITCH_S of his seconds, or (sw
// -1) at the first wall bounce, whenever it comes. Three switch points used to be enough when
// the choice was remade every frame; a flight flown open loop needs its change of mind in it.
const SWITCH_S = [0.05, 0.12, 0.22, 0.36];
const PLANS = [];
for (const a1 of [-1, 0, 1]) {
  for (const a2 of [-1, 0, 1]) {
    if (a1 === a2) PLANS.push({ a1, a2, sw: 0 });
    else {
      for (const s of SWITCH_S) PLANS.push({ a1, a2, sw: s });
      // Flat out into the wall, then let go, or push on with the bounce.
      if (a1 !== 0 && a2 !== a1) PLANS.push({ a1, a2, sw: -1 });
    }
  }
}
// The air jump (each of them, for the triple): kept (0), spent early at relHi (1), late at
// relLo (2), or at once and any further one early (3).
const AIR_MODES = [0, 1, 2, 3];
const NO_AIR = [0];

/** A flight: stick plan, air mode, the release speeds it was planned with, its first step. */
function newFlight() {
  return { a1: 0, a2: 0, sw: 0, mode: 0, relHi: 0, relLo: 0, airAt: 0 };
}
function copyFlight(a, b) {
  a.a1 = b.a1; a.a2 = b.a2; a.sw = b.sw; a.mode = b.mode; a.relHi = b.relHi; a.relLo = b.relLo; a.airAt = b.airAt;
  return a;
}
/** Whether flight `F` spends an air jump at its step `k`, going up at `vy`. */
function airNow(F, k, vy) {
  if (F.mode === 0) return false;
  if (F.mode === 3) return k === F.airAt || (k > F.airAt && vy <= F.relHi);
  return vy <= (F.mode === 1 ? F.relHi : F.relLo);
}
/** Flight `F`'s stick at its step `k`, `bounced` off a wall since it began or not. */
function stickAt(F, k, bounced) { return F.sw < 0 ? (bounced ? F.a2 : F.a1) : (k < F.sw ? F.a1 : F.a2); }

/** Where a flight ends: its landing, and what it did on the way. */
function newOut() {
  return {
    landed: false, n: 0, plat: null, x: 0, vx: 0, t: 0, ov: 0, mom: 0,
    bounces: 0, flips: 0, twitches: 0, hidden: 0,
  };
}
function copyOut(a, b) {
  a.landed = b.landed; a.n = b.n; a.plat = b.plat; a.x = b.x; a.vx = b.vx; a.t = b.t; a.ov = b.ov; a.mom = b.mom;
  a.bounces = b.bounces; a.flips = b.flips; a.twitches = b.twitches; a.hidden = b.hidden;
  return a;
}

/**
 * Fly state `s` forward under flight `F` from its step `k0`, by his own rules -- Player.step in
 * the air, one of the world's steps at his rate, the same sums in the same order -- until his
 * feet come down on a ledge (the first they cross going down, with any overlap, as
 * Player.step lands him), or fall under env.cut (the fire), or env.steps run out. Into `out`.
 *
 * On the way it counts what the value of a flight asks about: wall bounces; turns of his
 * facing (his sprite turns with the stick, and with a wall); twitches, a turn made within
 * env.twitch steps of the last; and steps beyond env.vlo..env.vhi, the view as it is drawn.
 */
function fly(env, s, F, k0, out) {
  let x = s.x, y = s.y, vx = s.vx, vy = s.vy, mom = s.mom, od = s.od;
  let air = s.unlocked ? s.air : 0;
  const h = env.h, G = env.G, term = env.term, tower = env.tower, lo = env.lo, hi = env.hi;
  const half = PLAYER_W / 2;
  const vlo = env.vlo + half, vhi = env.vhi - half;
  let bounces = 0, flips = 0, twitches = 0, hidden = 0;
  let face = s.face, lastTurn = -s.sinceTurn, bounced = s.bounced;
  out.landed = false; out.plat = null;
  for (let i = 0; i < env.steps; i++) {
    const k = k0 + i;
    const a = F.sw < 0 ? (bounced ? F.a2 : F.a1) : (k < F.sw ? F.a1 : F.a2);
    if (a !== 0) {
      vx += a * ACCEL_AIR * h;
      if (a !== face) { flips++; face = a; if (i - lastTurn < env.twitch) twitches++; lastTurn = i; }
    }
    if (od > 0) od = Math.max(0, od - OVERDRIVE_DECAY * h);
    const earned = VX_MAX_COLD + (VX_MAX_HOT - VX_MAX_COLD) * mom;
    const cap = earned + od;
    if (vx > cap) vx = Math.max(cap, vx - FRICTION * h);
    if (vx < -cap) vx = Math.min(-cap, vx + FRICTION * h);
    const av = Math.abs(vx);
    const rf = earned > 0 ? Math.min(1, av / earned) : 0;
    if (rf > MOM_RUN_THRESHOLD && av > VX_MAX_COLD * 0.55) {
      mom = Math.min(1, mom + MOM_UP * ((rf - MOM_RUN_THRESHOLD) / (1 - MOM_RUN_THRESHOLD)) * h);
    } else {
      mom = Math.max(0, mom - MOM_DOWN * 0.25 * h);
    }
    if (air > 0 && airNow(F, k, vy)) {
      vy = Math.max(vy, 0) * 0.35 + impulse(vx, mom, env.bounce) * AIR_JUMP_SCALE;
      air--;
    }
    vy -= G * h;
    if (vy < -term) vy = -term;
    const py = y;
    x += vx * h;
    y += vy * h;
    // The walls as Player.step has them, to the bit: the same comparisons, the same clamp.
    if (x - half < lo || x + half > hi) {
      const dir = x - half < lo ? 1 : -1;
      x = dir > 0 ? lo + half : hi - half;
      const speed = Math.abs(vx);
      if (speed >= WALL_BOUNCE_MIN) {
        const r = wallBounceOut(speed, vy, env.boost, VX_MAX_COLD + (VX_MAX_HOT - VX_MAX_COLD) * mom);
        vx = dir * r.speed;
        vy = r.vy;
        if (r.overdrive > od) od = r.overdrive;
        bounces++;
        bounced = true;
        if (face !== dir) { face = dir; lastTurn = i; }
      } else if (speed >= 20) {
        vx = dir * speed * WALL_RESTITUTION_GROUND;
      } else {
        vx = 0;
      }
    }
    if (x < vlo || x > vhi) hidden++;
    if (vy <= 0) {
      const from = Math.floor(py / FLOOR_H), to = Math.floor(y / FLOOR_H);
      for (let n = from; n >= to - 1 && n >= 0; n--) {
        const pl = tower.peek(n);
        if (!pl) continue;
        if (py >= pl.y - 0.001 && y <= pl.y && x + half > pl.x && x - half < pl.x + pl.w) {
          out.landed = true; out.n = n; out.plat = pl; out.x = x; out.vx = vx; out.t = (i + 1) * h;
          out.ov = Math.min(x + half - pl.x, pl.x + pl.w - (x - half)); out.mom = mom;
          out.bounces = bounces; out.flips = flips; out.twitches = twitches; out.hidden = hidden;
          return out;
        }
      }
      if (y < env.cut) break;
    }
  }
  out.bounces = bounces; out.flips = flips; out.twitches = twitches; out.hidden = hidden;
  return out;
}

/**
 * His state after the step he jumps in, from the ground or in coyote time, with the stick at
 * `a`: Player.step for that one step, the jump held (an instajump from the ground). Into `st`.
 * `sinceTurn` is steps since his facing last turned, for fly's twitches.
 */
function takeoff(p, a, env, st, sinceTurn) {
  const h = env.h;
  const grounded = p.grounded;
  let vx = p.vx;
  let face = p.facing;
  if (a !== 0) { vx += a * (grounded ? ACCEL_GROUND : ACCEL_AIR) * h; face = a; }
  else if (grounded) {
    const f = FRICTION * h;
    if (Math.abs(vx) <= f) vx = 0;
    else vx -= Math.sign(vx) * f;
  }
  let od = p.overdrive > 0 ? Math.max(0, p.overdrive - OVERDRIVE_DECAY * h) : 0;
  let mom = p.momentum;
  const earned = VX_MAX_COLD + (VX_MAX_HOT - VX_MAX_COLD) * mom;
  const cap = earned + od;
  if (vx > cap) vx = Math.max(cap, vx - FRICTION * h);
  if (vx < -cap) vx = Math.min(-cap, vx + FRICTION * h);
  const av = Math.abs(vx);
  const rf = earned > 0 ? Math.min(1, av / earned) : 0;
  if (rf > MOM_RUN_THRESHOLD && av > VX_MAX_COLD * 0.55) {
    mom = Math.min(1, mom + MOM_UP * ((rf - MOM_RUN_THRESHOLD) / (1 - MOM_RUN_THRESHOLD)) * h);
  } else if (grounded) mom = Math.max(0, mom - MOM_DOWN * h);
  else mom = Math.max(0, mom - MOM_DOWN * 0.25 * h);
  const v0 = impulse(vx, mom, p.bounce);
  let vy = v0 * (grounded ? INSTAJUMP_BONUS : 1);
  const unlocked = mom >= AIR_JUMP_UNLOCK;
  vy -= env.G * h;
  let x = p.x + vx * h;
  const y = p.y + vy * h;
  const half = PLAYER_W / 2;
  st.bounced = false;
  if (x - half < env.lo || x + half > env.hi) {
    const dir = x - half < env.lo ? 1 : -1;
    x = dir > 0 ? env.lo + half : env.hi - half;
    const speed = Math.abs(vx);
    if (speed >= WALL_BOUNCE_MIN) {
      const r = wallBounceOut(speed, vy, env.boost, VX_MAX_COLD + (VX_MAX_HOT - VX_MAX_COLD) * mom);
      vx = dir * r.speed;
      vy = r.vy;
      if (r.overdrive > od) od = r.overdrive;
      face = dir;
      st.bounced = true;
    } else if (speed >= 20) vx = dir * speed * WALL_RESTITUTION_GROUND;
    else vx = 0;
  }
  st.x = x; st.y = y; st.vx = vx; st.vy = vy; st.mom = mom; st.od = od;
  st.unlocked = unlocked; st.air = unlocked ? (p.tripleUnlocked ? 2 : 1) : 0; st.v0 = v0;
  // A turn in the takeoff step itself counts toward a twitch in the flight after it.
  st.sinceTurn = face !== p.facing ? 1 : sinceTurn + 1;
  st.face = face;
  return st;
}

/** His state now, in the air; `bounced` off a wall since the flight being flown began. */
function airState(p, st, bounced, sinceTurn) {
  st.x = p.x; st.y = p.y; st.vx = p.vx; st.vy = p.vy; st.mom = p.momentum; st.od = p.overdrive;
  st.unlocked = p.airUnlocked; st.air = p.airJumps; st.v0 = p.jumpImpulse(); st.face = p.facing;
  st.bounced = bounced; st.sinceTurn = sinceTurn;
  return st;
}

export class AutoPlayer {
  constructor(input) {
    this.input = input;
    // Scratch space, reused every look, so a look allocates nothing.
    this.out = newOut();          // a flight's outcome
    this.best = newOut();         // the best outcome of a look
    this.st = { x: 0, y: 0, vx: 0, vy: 0, mom: 0, od: 0, air: 0, unlocked: false, v0: 0, face: 1, bounced: false, sinceTurn: 0 };
    this.env = { lo: 0, hi: 0, vlo: 0, vhi: 0, G: 0, term: 0, boost: 0, bounce: 1, h: 0, steps: 0, tower: null, cut: 0, twitch: 0 };
    this.F = newFlight();         // a flight being tried
    this.bestF = newFlight();     // the best of a look
    this.cur = newFlight();       // the flight he is flying
    this.reset();
  }

  /** Forget the last run: main.js calls it with every new demo. */
  reset() {
    this.plan = null;             // the jump taken: { k floors, n the floor, target ledge }
    this.flying = false;          // this.cur is being flown
    this.k = 0;                   // steps into it
    this.target = null;           // the floor it lands on
    this.since = 0;               // steps since the last look for a better one
    this.wb0 = 0;                 // the run's wall bounces when it began
    this.frame = 0;               // steps seen
    this.face = 0;                // his facing, as last seen
    this.turnedAt = -1e6;         // the step it last turned
    this.lastFloor = -1;
    this.stall = 0;
    this.safeT = 0;
    this.noPlan = 0;
    this.speedDir = 0;
    // Looks taken, and of them in the air; flights given up for a better one; flights that
    // stopped landing where they said (the shaft widening under him, mostly).
    this.stats = { plans: 0, replans: 0, switches: 0, breaks: 0 };
  }

  get safeMode() { return this.safeT > 0; }

  step(game, dt = 1 / 240) {
    const p = game.player;
    this.frame++;
    if (p.facing !== this.face) { this.face = p.facing; this.turnedAt = this.frame; }
    if (p.floor !== this.lastFloor) {
      this.lastFloor = p.floor;
      this.stall = 0;
    } else if (p.grounded) {
      this.stall += dt;
    }
    if (this.stall > TUNE.stallLimit) { this.safeT = TUNE.safeFor; this.stall = 0; }
    if (this.safeT > 0) {
      this.safeT -= dt;
      this.flying = false;
      this.safeStep(game);
      return;
    }
    // Coyote time counts as standing: he may still jump in it, so it is a decision.
    if (p.grounded || p.coyote > 0) this.groundStep(game, dt);
    else this.airStep(game, dt);
  }

  /** The model's surroundings for a look this step: into this.env. */
  envFor(game, dt) {
    const p = game.player, e = this.env;
    e.lo = p.lo; e.hi = p.hi;
    // The view as it is drawn now (Renderer.setWorldTransform, the eased zoom), never wider
    // than the walls. It only opens, so this is the narrowest it will be all flight.
    const half = VW / (game.zoomView || game.zoom) / 2;
    e.vlo = Math.max(p.lo, CX - half); e.vhi = Math.min(p.hi, CX + half);
    e.G = gravityOf(p); e.term = terminalOf(p);
    e.boost = game.wallBoost || 0; e.bounce = p.bounce;
    e.h = dt * (game.timeScale || 1) * p.rate;
    e.steps = Math.ceil(TUNE.maxFlight / e.h);
    e.tower = game.tower;
    e.cut = game.riseActive ? game.riseY : -FLOOR_H;
    e.twitch = Math.round(TUNE.twitch / dt);
    return e;
  }

  /**
   * Where the fire will be `tw` of the world's seconds from now, if nothing lands in between:
   * Game.step's rise at its rate, catching up to the best floor less the lead.
   */
  fireAt(game, tw) {
    const rate = game.riseRate();
    const line = game.run.maxFloor * FLOOR_H - game.riseLead();
    const y0 = game.riseY;
    if (y0 < line) {
      const reach = (line - y0) / (rate + RISE_CATCHUP);
      return tw <= reach ? y0 + (rate + RISE_CATCHUP) * tw : line + rate * (tw - reach);
    }
    return y0 + rate * tw;
  }

  /**
   * What landing `o` is worth to the NEXT jump, guessed from the landing: how high a jump off
   * it reaches (taken at the landing's speed and meter, with its air jumps if the meter is
   * full), and whether that jump can outrun the fire at all. Landed on a new best, the fire
   * closes to the lead under him; the jump tops out arc.t of his seconds later, and the fire
   * rises by its rate times that. A landing he cannot jump on from before the fire arrives is a
   * death with a delay, however high it is.
   */
  nextProxy(game, o) {
    const p = game.player;
    const v0 = impulse(o.vx, o.mom, p.bounce);
    const nAir = o.mom >= AIR_JUMP_UNLOCK ? (p.tripleUnlocked ? 2 : 1) : 0;
    const arc = jumpArc(v0, nAir, this.env.G);
    const reach = arc.apex / FLOOR_H;
    let v = TUNE.nextWeight * reach;
    if (game.riseActive) {
      const tNext = arc.t / ((game.timeScale || 1) * p.rate);
      const short = game.riseRate() * tNext - game.riseLead(Math.max(o.n, game.run.maxFloor)) - arc.apex;
      if (short > 0) v -= (TUNE.nextFireCost * short) / FLOOR_H;
    }
    return v;
  }

  /** What flight outcome `o` is worth, in floors (see the note at the top of the file, 4). */
  value(game, o) {
    const p = game.player;
    if (!o.landed) return -1e6;
    let v = o.n - p.floor;
    const tw = o.t / ((game.timeScale || 1) * p.rate);
    if (game.riseActive) {
      const clear = o.plat.y - this.fireAt(game, tw);
      if (clear < TUNE.fireMin) v -= TUNE.firePenalty - Math.max(-500, clear);
    }
    v += this.nextProxy(game, o);
    v += TUNE.ovWeight * Math.min(1, o.ov / TUNE.ovFull);
    if (o.ov < TUNE.edgeOv && o.n > 0) v -= TUNE.edgeCost * (1 - o.ov / TUNE.edgeOv);
    v += TUNE.bounceWeight * o.bounces;
    v -= TUNE.timeWeight * tw;
    v -= TUNE.flipCost * o.flips + TUNE.twitchCost * o.twitches + TUNE.hiddenCost * o.hidden;
    if (this.flying && o.n === this.target) v += TUNE.stick;
    return v;
  }

  /**
   * A look: every flight -- stick plan by air mode -- flown from where he is (in the air) or
   * from the step he would jump in (on the ground), the best by value() left in this.bestF and
   * this.best. Returns its value, -Infinity if nothing was flown.
   */
  choose(game, dt, ground) {
    const p = game.player;
    const env = this.envFor(game, dt);
    const out = this.out, st = this.st, F = this.F;
    // A flight's steps count from the one he jumps in: that one is takeoff()'s.
    const k0 = ground ? 1 : 0;
    let bestV = -Infinity;
    let lastA = 99;
    if (!ground) airState(p, st, false, this.frame - this.turnedAt);
    this.stats.plans++;
    for (const pl of PLANS) {
      if (ground && pl.a1 !== lastA) { takeoff(p, pl.a1, env, st, this.frame - this.turnedAt); lastA = pl.a1; }
      F.a1 = pl.a1; F.a2 = pl.a2; F.sw = pl.sw > 0 ? Math.max(1, Math.round(pl.sw / env.h)) : pl.sw;
      F.relHi = TUNE.relHi * st.v0 * AIR_JUMP_SCALE;
      F.relLo = TUNE.relLo * st.v0 * AIR_JUMP_SCALE;
      F.airAt = k0;
      const modes = st.unlocked && st.air > 0 ? AIR_MODES : NO_AIR;
      for (const mode of modes) {
        F.mode = mode;
        fly(env, st, F, k0, out);
        const v = this.value(game, out);
        if (v > bestV) {
          bestV = v;
          copyOut(this.best, out);
          copyFlight(this.bestF, F);
        }
      }
    }
    return bestV;
  }

  /** Fly the flight being flown on from where he is: into this.out. */
  check(game, dt) {
    const env = this.envFor(game, dt);
    const st = airState(game.player, this.st, game.run.wallBounces > this.wb0, this.frame - this.turnedAt);
    return fly(env, st, this.cur, this.k, this.out);
  }

  /**
   * Standing, or in coyote time. Look, and jump now with the best flight there is -- unless
   * there is time to spare and staying buys something: the meter, still filling with the fire
   * far off and nothing tall on offer, or any gain at all when the best flight gains none.
   * Waiting because the best flight is unsafe buys nothing: the fire only comes closer.
   */
  groundStep(game, dt) {
    const p = game.player;
    const inp = this.input;
    // A landing ends the flight: nothing may be kept for landing where he stands.
    this.flying = false;
    const coyoting = !p.grounded;
    const v = this.choose(game, dt, true);
    const b = this.best;
    const slack = this.slack(game);
    const gain = b.landed && v > -1e5 ? b.n - p.floor : -99;
    const patient = !coyoting && this.noPlan < TUNE.noPlanLimit;
    const building = patient && slack > TUNE.buildSlack && p.momentum < AIR_JUMP_UNLOCK && gain < TUNE.buildGain;
    const pointless = patient && slack > TUNE.waitSlack && gain < TUNE.minGain;
    if (!building && !pointless) {
      copyFlight(this.cur, this.bestF);
      this.flying = true;
      this.k = 0;
      this.since = 0;
      this.wb0 = game.run.wallBounces;
      this.target = b.landed ? b.n : null;
      this.plan = b.landed ? { k: b.n - p.floor, n: b.n, target: b.plat } : null;
      inp.wantAxis = stickAt(this.cur, 0, false);
      inp.wantJump = true;
      inp.jumpHeld = true;
      this.noPlan = 0;
      return;
    }
    this.noPlan += dt;
    inp.jumpHeld = false;
    this.run(game);
  }

  /** On the ground with no jump worth taking yet: run, to fill the meter or find a line. */
  run(game) {
    const p = game.player;
    const inp = this.input;
    const here = game.tower.peek(p.floor);
    const roomR = CX + game.arenaHalf - p.x;
    const roomL = p.x - (CX - game.arenaHalf);
    if (!this.speedDir) this.speedDir = roomR >= roomL ? 1 : -1;
    const ahead = this.speedDir > 0 ? roomR : roomL;
    if (ahead < TUNE.turnEarly) this.speedDir = -this.speedDir;
    if (here) {
      const margin = PLAYER_W * 0.6;
      if (p.x < here.x + margin && this.speedDir < 0) this.speedDir = 1;
      else if (p.x > here.x + here.w - margin && this.speedDir > 0) this.speedDir = -1;
    }
    inp.wantAxis = this.speedDir;
  }

  /**
   * In the air: fly the flight chosen, checking every step that it still lands where it said;
   * look again when it does not, and every TUNE.replanEvery steps for one better by
   * TUNE.switchMargin. The jump is held throughout, so he jumps again the step he lands if
   * groundStep says so; except in coyote time, where a held jump would fire by accident.
   */
  airStep(game, dt) {
    const p = game.player;
    const inp = this.input;
    inp.jumpHeld = p.coyote <= 0;
    if (this.flying) {
      this.k++;
      this.since++;
      const o = this.check(game, dt);
      if (!(o.landed && o.n === this.target)) { this.flying = false; this.stats.breaks++; }
    }
    if (!this.flying || this.since >= TUNE.replanEvery) {
      // Valued before choose() reuses the scratch space its outcome sits in.
      const curV = this.flying ? this.value(game, this.out) : -Infinity;
      const v = this.choose(game, dt, false);
      this.stats.replans++;
      this.since = 0;
      if (!this.flying || v > curV + TUNE.switchMargin) {
        if (this.flying) this.stats.switches++;
        copyFlight(this.cur, this.bestF);
        this.flying = true;
        this.k = 0;
        this.wb0 = game.run.wallBounces;
        this.target = this.best.landed ? this.best.n : null;
      }
    }
    inp.wantAxis = stickAt(this.cur, this.k, game.run.wallBounces > this.wb0);
    if (p.airJumps > 0 && p.airUnlocked && airNow(this.cur, this.k, p.vy)) inp.wantJump = true;
  }

  /**
   * How long, in SECONDS, until the rising floor reaches the player at its current rate.
   * Infinity (99) before it arms. Danger is a time, not a distance: at the foot of the tower
   * three floors of clearance is fifteen seconds, nine hundred floors up it is under two.
   */
  slack(game) {
    if (!game.riseActive) return 99;
    const rate = game.riseRate();
    if (!(rate > 0)) return 99;
    return (game.player.y - game.riseY) / rate;
  }

  /**
   * The boring strategy, used only while the watchdog is tripped: line up on the point
   * of this ledge nearest the next one, brake to a near stop, hop exactly one floor.
   * Slow, but it is the approach the reachability suite proves can always climb.
   */
  safeStep(game) {
    const p = game.player;
    const inp = this.input;
    const target = game.tower.peek(p.floor + 1);
    if (!target) { inp.wantAxis = 0; inp.jumpHeld = false; return; }
    const onGround = p.grounded || p.coyote > 0;
    inp.jumpHeld = !onGround;   // never fire by accident in coyote time
    if (!onGround) {
      const dx = target.x + target.w / 2 - p.x;
      const inside = Math.abs(dx) < target.w * 0.35;
      if (inside && Math.abs(p.vx) > 50) inp.wantAxis = -Math.sign(p.vx);
      else inp.wantAxis = Math.abs(dx) < 2 ? 0 : Math.sign(dx);
      if (p.vy < -20 && p.y < target.y - 4 && p.airJumps > 0 && p.airUnlocked) inp.wantJump = true;
      return;
    }
    const aim = Math.max(target.x + 5, Math.min(target.x + target.w - 5, p.x));
    const dx = aim - p.x;
    if (Math.abs(dx) > 4) {
      inp.wantAxis = (Math.abs(p.vx) > 110 && Math.sign(p.vx) === Math.sign(dx))
        ? -Math.sign(p.vx) : Math.sign(dx);
    } else {
      inp.wantAxis = Math.abs(p.vx) > 20 ? -Math.sign(p.vx) : 0;
      if (Math.abs(p.vx) < 35 || !p.grounded) {
        inp.wantJump = true;
        inp.jumpHeld = true;
        this.plan = null;
        this.target = null;
      }
    }
  }
}

export { VX_MAX_HOT };
