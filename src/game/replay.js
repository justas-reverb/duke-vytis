// Replays: record a run, keep it, share it, play it back, race its ghost.
//
// ============================================================================
// THE API THE UI CALLS. Nothing else here is meant to be called from outside.
//
//   import * as Replay from './game/replay.js';
//
// At boot
//   Replay.simFingerprint()       this build's fingerprint, computed once (~20 ms) and
//                                 cached; call it at boot so the first death does not pay
//
// Recording (the live game)
//   const rec = Replay.startRecording(game, { ghost })
//       Right after game.newRun(), before the first step. Puts a recorder in front of
//       game.input that passes every read through unchanged; it seals itself in the step
//       the fire takes him. Throws if the game has already stepped. `ghost`: in a race, the
//       replay raced -- its track goes into this run's replay (replay.race.ghost), and so
//       does the ghost's tower when the run was on it (game.newRun(seed, course, speed);
//       replay.race.course), so the race plays back, ghost and all, without the raced
//       replay: deleted, or refused by this build (its fingerprint no longer this one's).
//   rec.time                      seconds of climb recorded (steps x 1/240, slow motion NOT
//                                 applied): the clock a ghost is raced against
//   rec.sealed                    true once the run is over for the recording
//   const replay = rec.finish()
//       Hands game.input back and returns the Replay, in memory; the same object every
//       call. Call it after the death (any time in the fall or on the scoreboard) or, for
//       a run abandoned from the pause menu, BEFORE anything starts a new run. A replay
//       whose `invalid` is set (a new run started first, the game was stepped at a rate
//       other than the loop's) plays and saves nothing. rec.cancel() drops it instead.
//   replay.result                 { floor, score, seconds, zone, ended } -- `seconds` is
//                                 the run's own clock (run.seconds, slow motion applied),
//                                 `ended` 'fire', 'quit' or 'cut' (it reached two hours)
//
// Keeping them (localStorage today; setReplayBackend swaps in file storage)
//   Replay.saveRun(replay)        -> { ok, id, kept, rank, error }   the player's own run
//   Replay.storeImported(replay)  -> { ok, id, kept, error }          kept pinned
//   Replay.listReplays()          -> [{ id, score, floor, seconds, zone, date, ended, seed,
//                                       origin: 'own'|'imported', pinned, last,
//                                       rank: 1..10 (0 = not one of the ten best), chars,
//                                       speed: its JUMP SPEED (1 = 100%),
//                                       gravity: its GRAVITY (1 = NORMAL),
//                                       playable: this build can play it (else ghost only) }]
//                                    the bests in rank order, then the rest newest first
//   Replay.loadReplay(id)         -> { ok, replay, compatible, error }
//   Replay.pinReplay(id, pinned)  -> boolean. Unpinning one that is neither the last run nor
//                                    a best lets it go.
//   Replay.deleteReplay(id)       -> boolean
//   Replay.setReplayBackend({ get(key), set(key, text), remove(key), keys() })
//
// Sharing
//   Replay.exportReplay(replay)   -> string: the text to paste, and the exact (ASCII)
//                                    contents of a file named with Replay.FILE_EXTENSION
//                                    ('.dvreplay'). Throws on an invalid one.
//   Replay.importReplay(text)     -> { ok, replay, compatible, error }. Never throws; a
//                                    refusal's `error` is a sentence a player can read.
//                                    Takes a pasted text or a file's contents alike.
//   Replay.compatible(replay)     -> boolean: this build plays it as it was recorded
//
// Playing back
//   Replay.createPlayback(replay, { particleBudget, onGame })
//       -> { ok, playback, error, incompatible }. Refuses an invalid or incompatible one.
//       particleBudget: the viewer's PARTICLES setting (PARTICLE_BUDGET[...]) instead of the
//         recorded one. The climb is the same; the sparks and the shake are no longer the
//         run's (the cosmetic stream is drawn for the pool it feeds).
//       onGame(game): called with every Game the playback puts in pb.game -- at the start
//         and after each seek -- to hang the sounds on it the way main.js hangs them on the
//         live game. A playback's game has no hooks of its own, so it commits no stats.
//   pb.game                       the Game to draw. A seek REPLACES it: read it every frame
//   pb.step()                     one simulation step (1/240 s); false once it is over
//   pb.seekTime(seconds, budgetMs = Infinity) / pb.seekStep(step, budgetMs = Infinity)
//       -> true when there; false if the budget ran out first (call again next frame).
//       Pass a budget from the UI, always: a seek into a long replay simulates up to its
//       whole length the first time (0.45 s for ten minutes headless), and an imported
//       file's length is whatever its author made it (up to two hours).
//   pb.time, pb.stepIndex         where it is, the fall included
//   pb.duration                   seconds of climb (= Replay.durationOf(replay))
//   pb.done                       on the scoreboard, or at the end of a quit or cut run
//   pb.desync                     null, or { step, seconds } of the first checksum that
//                                 disagreed: this build does not play the run as recorded
//   The instant replay: rec.finish(), createPlayback(replay), then
//     seekTime(durationOf(replay) - N). The recorder keeps copies of the live game from the
//     last 20-30 s, so that seek is a restore and at most 10 s of simulation (~10 ms).
//
// Racing a ghost
//   Replay.ghostAt(replay, seconds) -> { x, y, facing, pose, done } | null
//       Where the recorded Duke was `seconds` into the climb: world units, y up, his feet;
//       facing -1 or 1; pose a sprite frame name for drawSprite (a tuck is not spun: spin
//       it by the clock, as Renderer.drawPlayer does). Race it against rec.time of the
//       live run, NOT game.elapsed, which slow motion stretches. Read from the stored
//       track, so it needs no simulation and works when compatible() is false.
//   Replay.durationOf(replay)     seconds from the start to the death (or the quit)
//   Replay.ghostOf(replay)        what a race keeps of the replay it raced (its track, its
//                                 length and result): ghostAt and durationOf read it as a replay
//   The tower a race is run on is the ghost run's own when this build plays the replay: see
//   race.js (CourseSurvey, which re-simulates the run to find it) and course.js.
// ============================================================================
//
// What a replay IS: the run's seed, and the input the simulation saw at every step of the
// fixed 240 Hz loop -- the axis, whether jump was held, and whether a jump press reached it
// -- recorded AT the input surface Game.step reads (axis, jumpHeld, consumeJump). The
// keyboard, the attract bot and the gamepad (core/gamepad.js, which presses the same Input
// the keyboard does) are all recorded the same way, and a touch input would be too. Only
// changes are stored.
//
// The press is recorded where the simulation TAKES it: a step is marked when
// consumeJump() returned true in it. The brief was to record when a press ARRIVED and
// refill the jump buffer before the same step in the playback. That bakes the keyboard's
// buffer into the player -- Input holds a press for JUMP_BUFFER (0.12 s) and drops it
// after; AutoInput holds one until it is taken -- so the bot's presses would replay
// through a buffer they never had, and a gamepad's through whatever its own is. Recording
// the consumption records what the simulation saw and nothing about how any input
// produced it. The one assumption: within a step, the first consumeJump() is the one that
// takes the press (a buffer changes only between steps, when events land), which every
// input here satisfies.
//
// Besides the input, what outside the simulation changes it is recorded where it
// happens, all of it between two steps: resuming from pause zeroes the idle clock
// (Game.resume), the COMPANIONS option (their movement decides which floors they peek at,
// and Tower.peek GENERATES a floor it is asked for), the PARTICLES option (the pool the
// cosmetic stream is drawn for), steps taken on a menu mid-run (the particles, the shake
// and the banners go on moving) -- and floors generated from outside the step: the attract
// bot looks ahead with Tower.peek between steps, at the shaft's width OF THAT MOMENT, and
// the same floors generated later, after the shaft has widened, are different floors. The
// first bot replays desynced on exactly that, some 1,500 steps in.
//
// A header carries the seed, the settings, the date, the result and a SIMULATION
// FINGERPRINT (below), so a build that would simulate the input differently refuses the
// replay instead of playing something else. A 32-bit checksum of the state every
// REPLAY_CHECK_EVERY steps catches whatever the fingerprint missed, at the second it
// happens. A ghost track -- the Duke at 30 Hz, quantised -- lets a ghost race without a
// second simulation, and survives a build change that the input does not.

import { Game, STATE, ARENA_STEPS } from './game.js';
import { Tower } from './generator.js';
import { STEP } from '../core/loop.js';
import { COYOTE } from '../core/input.js';
import { mix32 } from '../core/rng.js';
import * as C from './constants.js';
import * as CompanionTables from './companions.js';
import * as ReachTables from './reach.js';
import * as ComboTables from './combo.js';
import * as ThemeTables from './themes.js';
import { COMBO_TIERS } from './flavour.js';
import { NAMES, RUN_CYCLE, IDLE_CYCLE } from '../render/sprites.js';
import { snapshot } from './snapshot.js';
import {
  encodeText, decodeText, fpText, menuStepCap, K_INPUT, K_IDLE, K_MOVE, K_BUDGET, K_COSMETIC,
  K_ENSURE, ENSURE_MAX, AXIS_OTHER, MOVES,
} from './replaycodec.js';
import { ReplayStore, defaultBackend } from './replaystore.js';

/** package.json's version. tools/test-replay.mjs fails when the two disagree. */
export const GAME_VERSION = '1.0.2';
/** A shared replay's file: exportReplay's text as it is, ASCII. */
export const FILE_EXTENSION = '.dvreplay';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---- hashing ----------------------------------------------------------------------
// Doubles are hashed by their bits, through a shared buffer. Every platform this ships
// on is little-endian; the order of the two words only has to agree with itself.
const F64 = new Float64Array(1);
const W32 = new Uint32Array(F64.buffer);
function word(h, k) {
  k = Math.imul(k, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}
function fold(h, v) {
  F64[0] = v;
  return word(word(h, W32[0]), W32[1]);
}
function foldStr(h, s) {
  for (let i = 0; i < s.length; i++) h = word(h, s.charCodeAt(i));
  return word(h, s.length);
}

/**
 * The state a desync shows up in first, hashed: where he is and how fast he is going,
 * his floor and momentum, the score and best floor, the live chain, the rising floor and
 * the camera (the simulation owns it: the tower is generated and pruned from it).
 */
export function simChecksum(g) {
  const p = g.player, c = g.combo;
  let h = 0x9747b28c;
  h = fold(h, p.x); h = fold(h, p.y); h = fold(h, p.vx); h = fold(h, p.vy);
  h = fold(h, p.floor); h = fold(h, p.momentum);
  h = fold(h, g.score); h = fold(h, g.run.maxFloor);
  h = fold(h, c.active ? c.floors : -1); h = fold(h, c.flair);
  h = fold(h, g.riseY); h = fold(h, g.camY);
  return mix32(h);
}

// ---- the simulation fingerprint ---------------------------------------------------
// Three parts, all in every header, all compared:
//
//   SIM_VERSION  a number a person bumps (constants.js says when);
//   constHash    every number the simulation reads: the constants.js numbers a module of
//                the step imports (FINGERPRINT_CONSTANTS, below), the companions' tables,
//                the reach proof's, the combo's and the zones', COYOTE from input.js, the
//                arena's widths from game.js and the combo tiers. Numbers inside objects
//                and arrays count; strings (names, colours) do not. The companions are in
//                because they are simulated inside the step and ask the tower for floors
//                ahead of him (Tower.peek generates what it is asked for): measured over
//                four bot runs, they generated 103 to 829 of the tower's floors, so a
//                changed companion rule is a different tower. JUMP_BUFFER is out on
//                purpose: it shapes the keyboard, and a replay records what came out of
//                the keyboard (see the header);
//   probeHash    the real code, run: the generator's first 1,800 floors on a fixed seed at
//                two arena widths and on a flow tower, and ten simulated seconds of a
//                frozen scripted climber, with the state hashed every step. So a changed
//                rule in player.js or generator.js refuses old replays by itself, which a
//                list of constants never could.
//
// The probe stays below the squeeze (SQUEEZE_FROM), where the generator calls Math.cos:
// everything under it is + - * / sqrt floor round, which every JavaScript engine computes
// to the same bit, so the fingerprint of a build is the same on a phone and a desktop.
// (The squeeze itself, and Math.hypot in the death's pieces, are the two transcendental
// calls the simulation makes. V8 -- Chrome, Android, Electron -- computes them the same
// everywhere; Safari's engine may round them differently, and a replay crossing between
// the two past floor 2100 would then show as a desync. The checksums say so; the
// fingerprint cannot.)
//
// WHICH constants.js numbers are the simulation's. It used to be all of them but the
// REPLAY_ ones and two UI timings, on the reasoning that a constant in by default costs a
// refused replay where one out by mistake costs a desync. Then the renderer's numbers were
// merged into constants.js -- the afterimage's GHOST_*, the scoreboard's painting budgets,
// the impact's word fade, the burn's time -- and each became part of every saved replay:
// a trail's alpha tweaked after release would have refused every replay a player had kept,
// "made by a different version", with nothing a replay plays changed.
//
// Now a number is the simulation's when a module the step runs IMPORTS it: Game.newRun,
// Game.step and everything they reach -- game.js, player.js, generator.js, reach.js,
// combo.js, milestones.js, companions.js, themes.js, flavour.js, stats.js, input.js (COYOTE)
// and, from render/, sprites.js (the pieces the fall simulates are cut from the art by
// CUT_OUTLINE_V, LIMB_MATCH, PLATE_MIN and PLATE_STEEL: see Game.burstGibs) and compsprites.js (who the companions
// are). The cosmetic stream is not the simulation -- render/particles.js and sparks.js draw
// from their own seeded stream, and nothing in the step reads what they do -- and neither is
// a number the step only hands to it (COSMETIC_ONLY). Every other constant is listed below
// as left out, and tools/test-replay.mjs 4a holds the lists to the source: it reads the
// imports of every module game.js reaches (not into the cosmetic stream) and fails on a
// listed number the step reads, on a fingerprinted one nothing in the step reads, and on a
// list naming a constant that is not there. So nothing goes into the fingerprint, or out of
// it, without a decision; and a constant added without one is IN until the suite asks,
// because a refused replay still costs less than a desync. The fall's numbers and the
// HUD's that game.js reads (GIB_*, IMPACT_HOLD, DANGER_RELEASE, CALLOUT_LIFE ...) stay in
// on that reasoning: the playback simulates the fall from the sealed state, the checksums
// stop at the seal, and the fingerprint is the only thing that sees them.
/**
 * constants.js numbers no module of the step reads: drawn, painted or shown, never simulated.
 * A number only the DRAWING of a render module the step reaches imports (a glint's alpha in
 * sprites.js, which the step reaches for the splat's pieces) belongs here too: test-replay 4a
 * names the numbers the step takes from each such module and fails on any other import there
 * until it is named or listed here.
 */
export const DRAWN_ONLY = Object.freeze([
  // the speed afterimage (render/afterimage.js, and its alphas in renderer.js)
  'GHOST_N', 'GHOST_DT', 'GHOST_GAP', 'GHOST_ALPHA', 'GHOST_FROM', 'GHOST_FULL',
  'GHOST_MOMENTUM_FROM', 'GHOST_MOMENTUM_FULL', 'GHOST_HISTORY', 'GHOST_JUMP_K', 'GHOST_JUMP_SLACK',
  // painting the scoreboard ahead (render/gameoverskin.js)
  'BOARD_WARM_MS', 'BOARD_IDLE_MS', 'BOARD_SLICE_MS',
  // renderer.js: the burn, the blood pool's spread, the fall camera's blend, a ledge's drawn depth
  'BURN_T', 'BLOOD_POOL_T', 'FALL_CAM_BLEND', 'PLAT_THICK',
  // the screens and the callouts (ui/screens.js, render/callouts.js)
  'IMPACT_FADE', 'HUD_OUT', 'SKIP_PROMPT_AT', 'BADGE_AFTER', 'BADGE_GAP',
  // the attract demo's dissolve (renderer.js)
  'DEMO_DISSOLVE',
  // the backing store's size, and the window tools/test-fallclear.mjs holds the renderer to
  'SW', 'SH', 'FALL_CLEAR',
]);
/**
 * constants.js numbers the step reads only to hand to the cosmetic stream: how many sparks a
 * combo step throws. tools/test-replay.mjs changes them and requires the simulation, the
 * fall included, the same every step while the particles differ.
 */
export const COSMETIC_ONLY = Object.freeze(['COMBO_STEP_BURST']);
const LEFT_OUT = new Set([...DRAWN_ONLY, ...COSMETIC_ONLY]);
const simulated = (k) => !k.startsWith('REPLAY_') && k !== 'SIM_VERSION' && !LEFT_OUT.has(k);
/** The constants.js names constHash folds, sorted: SIM_VERSION is its own part of the fingerprint. */
export const FINGERPRINT_CONSTANTS = Object.freeze(Object.keys(C)
  .filter((k) => typeof C[k] !== 'function' && typeof C[k] !== 'string' && simulated(k)).sort());
const FP_CONSTANTS = new Set(FINGERPRINT_CONSTANTS);
const SIM_TABLES = [
  ['constants', C, (k) => FP_CONSTANTS.has(k)],
  ['companions', CompanionTables, () => true],
  ['reach', ReachTables, () => true],
  ['combo', ComboTables, () => true],
  ['themes', ThemeTables, () => true],
];
const PROBE_SEED = 0x2d0c7a11;
const PROBE_STEPS = 2400;

/** Every number in `v`, its arrays' lengths and its objects' keys; strings and functions skipped. */
function foldNumbers(h, v, depth) {
  if (typeof v === 'number') return fold(h, v);
  if (typeof v === 'boolean') return word(h, v ? 1 : 2);
  if (v === null || typeof v !== 'object' || depth > 4) return h;
  if (Array.isArray(v)) {
    h = word(h, v.length);
    for (const x of v) h = foldNumbers(h, x, depth + 1);
    return h;
  }
  for (const k of Object.keys(v).sort()) { h = foldStr(h, k); h = foldNumbers(h, v[k], depth + 1); }
  return h;
}

function constantsHash() {
  let h = 0x3c6ef372;
  for (const [name, mod, take] of SIM_TABLES) {
    for (const k of Object.keys(mod).sort()) {
      const v = mod[k];
      if (typeof v === 'function' || typeof v === 'string' || !take(k)) continue;
      h = foldStr(h, `${name}.${k}`);
      h = foldNumbers(h, v, 0);
    }
  }
  h = foldStr(h, 'input.COYOTE'); h = fold(h, COYOTE);
  h = foldStr(h, 'game.ARENA_STEPS'); h = foldNumbers(h, ARENA_STEPS, 0);
  h = foldStr(h, 'flavour.COMBO_TIERS'); h = foldNumbers(h, COMBO_TIERS, 0);
  return mix32(h);
}

function foldTower(h, t, from, to) {
  for (let n = from; n <= to; n++) {
    const p = t.floors.get(n);
    h = fold(h, p ? p.x : NaN); h = fold(h, p ? p.w : NaN); h = fold(h, p ? p.y : NaN);
    if (p && p.kind) h = foldStr(h, p.kind);
  }
  return h;
}

/** A scripted climber, frozen: run at the far wall, hold jump, tap it for air jumps. */
function probeClimb(h) {
  const input = {
    axis: 1, jumpHeld: true, tap: false,
    consumeJump() { const t = this.tap; this.tap = false; return t; },
    pressed() { return false; }, step() {}, endFrame() {},
  };
  const g = new Game(input);
  g.newRun(PROBE_SEED);
  let dir = 1;
  for (let k = 0; k < PROBE_STEPS && g.state === STATE.PLAYING; k++) {
    const p = g.player;
    if (p.x > C.CX + g.arenaHalf - 30) dir = -1;
    else if (p.x < C.CX - g.arenaHalf + 30) dir = 1;
    input.axis = dir;
    input.jumpHeld = k % 480 < 440;
    input.tap = k % 72 === 36;
    g.step(STEP);
    h = word(h, simChecksum(g));
  }
  h = fold(h, g.run.maxFloor); h = fold(h, g.run.wallBounces); h = fold(h, g.run.combos);
  return h;
}

function probeHash() {
  let h = 0x6a09e667;
  const top = Math.min(1800, C.SQUEEZE_FROM - 1);
  const t = new Tower(PROBE_SEED, false);
  const mid = Math.floor(top / 3);
  t.ensure(mid);
  h = foldTower(h, t, 1, mid);
  t.setBounds(C.CX - C.ARENA_HALF_MAX, C.CX + C.ARENA_HALF_MAX);
  t.ensure(top);
  h = foldTower(h, t, mid + 1, top);
  const f = new Tower(PROBE_SEED, true);
  f.ensure(400);
  h = foldTower(h, f, 1, 400);
  h = probeClimb(h);
  return mix32(h);
}

let FP = null;
/** { simVersion, constHash, probeHash, text }. Computed once, then cached. */
export function simFingerprint() {
  if (!FP) {
    const fp = { simVersion: C.SIM_VERSION, constHash: constantsHash(), probeHash: probeHash() };
    FP = { ...fp, text: fpText(fp) };
  }
  return FP;
}

/** True when this build simulates `replay` as the build that recorded it did. */
export function compatible(replay) {
  if (!replay || !replay.header) return false;
  const h = replay.header, fp = simFingerprint();
  return h.simVersion === fp.simVersion && h.constHash === fp.constHash && h.probeHash === fp.probeHash;
}

// ---- the ghost's pose -------------------------------------------------------------
const POSE_INDEX = new Map(NAMES.map((n, i) => [n, i]));
if (NAMES.length > 127) throw new Error('replay: the pose byte holds 127 poses');

/**
 * The frame the renderer draws him in, from the player alone: Renderer.frameFor's live
 * branch, with the idle cycle keyed to the run's time where the renderer keys it to its
 * own clock. A second copy of a rule is how this codebase has been caught out before, so
 * tools/test-replay.mjs asks the real frameFor for every sample of a run and fails on the
 * first that differs.
 */
export function ghostFrame(p, t) {
  const fast = p.momentum > 0.6;
  if (!p.grounded) {
    if (p.spinT > 0) return 'tuck';
    if (p.vy > 30) return fast ? 'jumpFast' : 'jump';
    return fast ? 'fallFast' : 'fall';
  }
  if (p.landT > 0) return 'land';
  if (Math.abs(p.vx) > 12) return RUN_CYCLE[Math.floor(p.animT * 9) % RUN_CYCLE.length];
  return IDLE_CYCLE[Math.floor(t * 0.9) % IDLE_CYCLE.length];
}

/**
 * The frame THIS build draws for a pose name in a ghost: the name itself, or one of the
 * same family (run3 -> run0) when the sheet has lost it, or a plain fall. A replay names
 * its poses (see replaycodec.js), so an old one races in the right ones, not in whatever
 * now sits at the number it stored.
 */
function nearestPose(name) {
  if (POSE_INDEX.has(name)) return name;
  const stem = name.replace(/\d+$/, '');
  for (const n of NAMES) if (n.replace(/\d+$/, '') === stem) return n;
  return POSE_INDEX.has('fall') ? 'fall' : NAMES[0];
}
const DRAWN = new WeakMap();
function drawnNames(ghost) {
  let t = DRAWN.get(ghost);
  if (!t) { t = ghost.names.map(nearestPose); DRAWN.set(ghost, t); }
  return t;
}

// ---- recording --------------------------------------------------------------------
export class Recorder {
  /** `opts.maxSteps` shortens the two-hour limit; for tests. */
  constructor(game, opts = {}) {
    if (!game || !game.player || !game.tower || !game.input) throw new Error('startRecording needs a Game');
    if (game.state !== STATE.PLAYING || game.elapsed !== 0) {
      throw new Error('startRecording: call it right after game.newRun(), before the first step');
    }
    // A recorder still in front of the input is the last run's, never finished: hand the
    // input back (its replay is marked invalid, a new run having started) rather than
    // record through it and grow a chain of recorders one run at a time.
    if (game.input instanceof Recorder) game.input.finish();
    this.game = game;
    this.inner = game.input;
    this.tower = game.tower;
    this.maxSteps = Number.isFinite(opts.maxSteps)
      ? Math.max(1, Math.min(C.REPLAY_MAX_STEPS, Math.floor(opts.maxSteps))) : C.REPLAY_MAX_STEPS;
    this.header = {
      gameVersion: GAME_VERSION, simVersion: 0, constHash: 0, probeHash: 0,
      // jumpSpeed and platforms: the run's JUMP SPEED and PLATFORMS, simulation settings like the
      // seed; the playback runs at them, and at its DIFFICULTY and GRAVITY. (In the decoder's
      // order: the round trip compares the headers as text.)
      seed: game.seed >>> 0, demo: !!game.demo, jumpSpeed: game.jumpSpeed, platforms: game.platforms,
      difficulty: game.difficulty || 0, gravity: game.gravity || 1, companions: game.companions.movement,
      budget: game.particles.budget, date: Date.now(),
      checkEvery: C.REPLAY_CHECK_EVERY, ghostEvery: C.REPLAY_GHOST_EVERY, ghostQ: C.REPLAY_GHOST_Q,
    };
    this.k = 0;                 // PLAYING steps recorded
    this.open = false;          // inside a PLAYING step (between input.step and endFrame)
    this._axis = 0; this._held = false; this._press = false;
    this.lastAxis = 0; this.lastHeld = false;
    this.rs = []; this.rk = []; this.rc = []; this.rv = [];
    this.checks = [];
    this.gx = []; this.gy = []; this.gp = [];
    // What the simulation does not change itself, as it stood after the last PLAYING
    // step; anything different at the next one was changed from outside (see interlude).
    this.wIdle = game.idleFor;
    this.wMove = game.companions.movement;
    this.wHigh = game.tower.highest;
    this.bIn = game.particles.budget;   // the pool's budget at the last PLAYING step
    this.bSeen = this.bIn;              // ...and as last seen, on a menu step or here
    this.menu = 0;                      // menu steps since the last PLAYING step, counted
    this.menuTotal = 0;                 // ...and in the whole run (see menuStepCap)
    this.preMin = null;                 // lowest budget set before a counted menu step
    this.postMin = null;                // ...and after the last one
    this.live = [];             // copies of the live game, for the instant replay
    this.keyframesOk = C.REPLAY_LIVE_KEYFRAMES > 0;
    this.sealed = false;
    this.result = null;
    this.finalCheck = 0;
    this.invalid = MOVES.includes(this.wMove) ? null : 'companion movement ' + this.wMove;
    // A race carries what its own replay needs to be the race again with nothing else at
    // hand -- the raced replay deleted, or refused by this build as another's: the tower
    // it was run on (the course, when it was the ghost's own; course.js) and the ghost's track
    // to draw beside it. Not its input: the course IS the tower that input made.
    const course = game.tower.course || null;
    this.race = course || opts.ghost ? { ghost: opts.ghost ? ghostOf(opts.ghost) : null, course } : null;
    this.badSteps = 0;
    this.built = null;
    this.sampleGhost();
    game.input = this;
  }

  // -- the input surface Game.step reads. While a PLAYING step is open the simulation
  // -- sees exactly what was recorded for it; otherwise every read is passed through.
  get axis() { return this.open ? this._axis : this.inner.axis; }
  get jumpHeld() { return this.open ? this._held : this.inner.jumpHeld; }
  consumeJump() {
    const r = this.inner.consumeJump();
    if (r && this.open) this._press = true;
    return r;
  }
  // Game.newRun's, before the run's first step: passed through and not recorded, since no
  // step of any run reads what it drops (a recorder is still in front here only when its
  // run was never finished; see the constructor).
  dropStaleJump() { if (this.inner.dropStaleJump) this.inner.dropStaleJump(); }
  pressed(code) { return this.inner.pressed ? this.inner.pressed(code) : false; }

  step(dt) {
    this.inner.step(dt);
    if (this.sealed) return;
    const g = this.game;
    if (g.tower !== this.tower) { this.abandon(); return; }
    // Game.step hands the input the step already scaled by the slow motion; anything but
    // the loop's STEP under it is a caller stepping the game at another rate, which the
    // playback, stepping at STEP, would not reproduce.
    if (dt !== STEP * g.timeScale) this.badSteps++;
    this.interlude();
    this._axis = this.inner.axis;
    this._held = !!this.inner.jumpHeld;
    this._press = false;
    this.open = true;
  }

  endFrame() {
    this.inner.endFrame();
    if (this.sealed) return;
    if (this.open) { this.open = false; this.commit(); return; }
    // A step that was not a PLAYING step. Paused: nothing moved. On a menu mid-run
    // (OPTIONS, STATS, the guide): the particles, the shake, the banners and the zoom's
    // glide moved, and a replay takes the same steps so it throws the same sparks after.
    const g = this.game;
    if (g.tower !== this.tower) { this.abandon(); return; }
    const s = g.state;
    if (s === STATE.PAUSED || s === STATE.FALLING || s === STATE.DEAD) return;
    const counted = this.menu < C.REPLAY_COSMETIC_CAP && this.menuTotal < menuStepCap(this.k);
    if (counted) { this.menu++; this.menuTotal++; }
    const b = g.particles.budget;
    if (b !== this.bSeen) {
      // Set from the menu before this step ran: steps take no input, keys land between.
      this.bSeen = b;
      if (counted) this.preMin = this.preMin === null ? b : Math.min(this.preMin, b);
      else this.postMin = this.postMin === null ? b : Math.min(this.postMin, b);
    }
  }

  /**
   * What changed between the last PLAYING step and this one, written as records of this
   * step: at most one each of IDLE, MOVE and COSMETIC, three BUDGET and the ENSUREs.
   *
   * The first version wrote a record the moment it saw a setting change and cut the menu
   * steps round it, so holding an arrow key on the PARTICLES row -- the options screen
   * takes key repeats, about thirty a second -- wrote two records per change onto one
   * step, and the decoder, which allows sixteen, refused the player's own run: saved, and
   * then never loadable. Nothing between two PLAYING steps needs its order kept beyond
   * this:
   *   - the companions' movement, the idle clock and the tower are read only by PLAYING
   *     steps, so only the value at this step matters;
   *   - the particle budget matters on the menu steps only through what setBudget kills
   *     and the cursors it resets. Kills are for good (a menu step spawns nothing), and a
   *     smaller budget kills a superset of a larger one's, so every change before a menu
   *     step comes to one setBudget of the LOWEST value seen, before the menu steps; the
   *     menu steps then recount the pool as the last of them did in the run; and the
   *     changes after the last menu step, which the run never recounted, come to their
   *     lowest and then the final value, after them. The same kills, the same cursors, the
   *     same stale counts: tools/test-replay.mjs holds an arrow key on the options screen
   *     mid-run and compares every particle. (A stale count is read only by the trail's cap
   *     check, which it changes only when the pool sits on a cap, so no staged run showed a
   *     particle move when the order was broken; the suite holds the order by the records'
   *     shape as well.)
   * Menu steps past REPLAY_COSMETIC_CAP are not counted: by then everything they touch
   * has settled, and a change after them kills nothing (every particle is dead). Nor are
   * any past menuStepCap for the run so far (four times the climb, plus ten full visits),
   * the decoder's bound on what a playback may be asked to simulate; a player who sits in
   * the menus longer than that gets a replay whose sparks drift from the run after it,
   * never its climb.
   *
   * What it cannot see is a change undone before the next poll -- two keys landing between
   * the same two steps. That touches the sparks, never the simulation: the movement and
   * the idle clock are read here, at the step that reads them.
   */
  interlude() {
    const g = this.game;
    if (g.idleFor !== this.wIdle) this.push(K_IDLE, 0, g.idleFor);   // Game.resume
    const mv = g.companions.movement;
    if (mv !== this.wMove) {
      const i = MOVES.indexOf(mv);
      if (i < 0) this.invalid = 'companion movement ' + mv;
      else this.push(K_MOVE, 0, i);
      this.wMove = mv;
    }
    const hi = g.tower.highest;
    if (hi > this.wHigh) {
      let d = hi - this.wHigh;
      if (d > ENSURE_MAX * 16) { this.invalid = `${d} floors generated between two steps`; d = ENSURE_MAX * 16; }
      for (; d > 0; d -= ENSURE_MAX) this.push(K_ENSURE, 0, Math.min(d, ENSURE_MAX));
    }
    const b = g.particles.budget;
    if (b !== this.bSeen) { this.bSeen = b; this.postMin = this.postMin === null ? b : Math.min(this.postMin, b); }
    let set = this.bIn;
    if (this.preMin !== null) { this.push(K_BUDGET, 0, this.preMin); set = this.preMin; }
    if (this.menu > 0) this.push(K_COSMETIC, 0, this.menu);
    if (this.postMin !== null && this.postMin !== b) { this.push(K_BUDGET, 0, this.postMin); set = this.postMin; }
    if (b !== set) this.push(K_BUDGET, 0, b);
    this.bIn = b;
    this.menu = 0;
    this.preMin = null;
    this.postMin = null;
  }

  push(kind, code, val) { this.rs.push(this.k); this.rk.push(kind); this.rc.push(code); this.rv.push(val); }

  commit() {
    const g = this.game;
    const a = this._axis, h = this._held, pr = this._press;
    if (a !== this.lastAxis || h !== this.lastHeld || pr) {
      let ac, v;
      if (a === 0) { ac = 0; v = 0; } else if (a === 1) { ac = 1; v = 1; } else if (a === -1) { ac = 2; v = -1; }
      else {
        ac = AXIS_OTHER; v = a;
        if (!Number.isFinite(a) || Math.abs(a) > 8) this.invalid = 'an input axis of ' + a;
      }
      this.push(K_INPUT, ac | (h ? 4 : 0) | (pr ? 8 : 0), v);
      this.lastAxis = a; this.lastHeld = h;
    }
    this.k++;
    this.wIdle = g.idleFor;
    this.wHigh = g.tower.highest;
    if (this.k % C.REPLAY_CHECK_EVERY === 0) this.checks.push(simChecksum(g));
    if (this.k % C.REPLAY_GHOST_EVERY === 0) this.sampleGhost();
    if (this.keyframesOk && this.k % C.REPLAY_KEYFRAME_EVERY === 0) this.keyframe();
    if (g.state !== STATE.PLAYING) this.seal('fire');
    else if (this.k >= this.maxSteps) this.seal('cut');
  }

  sampleGhost() {
    const p = this.game.player, q = C.REPLAY_GHOST_Q;
    this.gx.push(Math.round(p.x * q));
    this.gy.push(Math.round(p.y * q));
    this.gp.push(POSE_INDEX.get(ghostFrame(p, this.k * STEP)) | (p.facing < 0 ? 0x80 : 0));
  }

  keyframe() {
    // Never allowed to break the live game: a copy that fails turns keyframes off and
    // the instant replay simulates from the start instead.
    try {
      this.live.push({ step: this.k, game: snapshot(this.game) });
      if (this.live.length > C.REPLAY_LIVE_KEYFRAMES) this.live.shift();
    } catch (e) {
      this.keyframesOk = false;
      this.live.length = 0;
    }
  }

  seal(ended) {
    if (this.sealed) return;
    this.sealed = true;
    this.open = false;
    const g = this.game;
    this.finalCheck = simChecksum(g);
    this.result = { floor: g.run.maxFloor, score: g.run.score, seconds: g.run.seconds, zone: g.themeIndex, ended };
  }

  abandon() {
    this.sealed = true;
    this.open = false;
    this.invalid = 'a new run started before the recording was finished';
  }

  get steps() { return this.k; }
  get time() { return this.k * STEP; }

  finish() {
    // Sealed already if the fire had him (the step it did) or the run reached its limit;
    // anything else still live is a run the player left.
    if (!this.sealed) {
      if (this.game.tower !== this.tower) this.abandon();
      else this.seal('quit');
    }
    if (this.game.input === this) this.game.input = this.inner;
    if (this.built) return this.built;
    const fp = simFingerprint();
    const header = { ...this.header, simVersion: fp.simVersion, constHash: fp.constHash, probeHash: fp.probeHash };
    const n = this.rs.length;
    const replay = {
      format: this.race ? 2 : 1,   // replaycodec.js: FORMAT_RACE for a race's
      header,
      steps: this.k,
      result: this.result || { floor: 0, score: 0, seconds: 0, zone: 0, ended: 'quit' },
      finalCheck: this.finalCheck,
      records: {
        n,
        step: Int32Array.from(this.rs), kind: Uint8Array.from(this.rk),
        code: Uint8Array.from(this.rc), val: Float64Array.from(this.rv),
      },
      checks: Uint32Array.from(this.checks),
      ghost: {
        n: this.gx.length,
        x: Int32Array.from(this.gx), y: Int32Array.from(this.gy), pose: Uint8Array.from(this.gp),
        names: NAMES,
      },
      // A race's tower and ghost (see the constructor), or null.
      race: this.race,
      // Not part of the file: copies of the live game for the instant replay.
      keyframes: this.live,
      invalid: this.invalid || (this.badSteps ? 'the game was stepped at a rate other than the loop\'s' : null),
    };
    this.built = replay;
    return replay;
  }

  cancel() {
    if (this.game.input === this) this.game.input = this.inner;
    this.sealed = true;
    this.live = [];
  }
}

export function startRecording(game, opts) { return new Recorder(game, opts); }

// ---- playback ---------------------------------------------------------------------
/**
 * The input surface, fed from a recording. The Playback applies each step's records:
 * the levels (axis, held) hold until the next record, and a press is taken by the first
 * consumeJump() of its step, as the recorder saw it taken (see the header).
 */
export class ReplayInput {
  constructor() { this.reset(); }
  reset() { this.j = 0; this._axis = 0; this._held = false; this._press = false; this._took = false; }
  get axis() { return this._axis; }
  get jumpHeld() { return this._held; }
  consumeJump() {
    if (this._press && !this._took) { this._took = true; return true; }
    return false;
  }
  pressed() { return false; }
  step() {}
  endFrame() {}

  /** Put the cursor at step k: the first record of k, and the levels held going into it. */
  seekTo(k, R) {
    let lo = 0, hi = R.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (R.step[mid] < k) lo = mid + 1; else hi = mid;
    }
    this.j = lo;
    this._axis = 0; this._held = false; this._press = false; this._took = false;
    for (let j = lo - 1; j >= 0; j--) {
      if (R.kind[j] === K_INPUT) { this._axis = R.val[j]; this._held = (R.code[j] & 4) !== 0; break; }
    }
  }
}

export class Playback {
  constructor(replay, opts = {}) {
    this.replay = replay;
    this.input = new ReplayInput();
    this.budget = Number.isFinite(opts.particleBudget) ? opts.particleBudget : null;
    this.onGame = typeof opts.onGame === 'function' ? opts.onGame : null;
    this.keyframes = new Map();
    this.keyframesOk = true;
    this.work = 0;              // game steps run, menu steps included; see seekStep
    for (const kf of replay.keyframes || []) {
      if (kf && kf.game && kf.step > 0 && kf.step <= replay.steps) this.keyframes.set(kf.step, { k: kf.step, game: kf.game });
    }
    this.desync = null;
    this.restart();
  }

  get stepIndex() { return this.i; }
  get time() { return this.i * STEP; }
  get duration() { return this.replay.steps * STEP; }
  get recordedSteps() { return this.replay.steps; }
  get result() { return this.replay.result; }
  get done() {
    const s = this.game.state;
    return s === STATE.DEAD || (s === STATE.PLAYING && this.k >= this.replay.steps);
  }

  install(g) {
    this.game = g;
    if (this.onGame) this.onGame(g);
  }

  restart() {
    const h = this.replay.header;
    const g = new Game(this.input);
    g.demo = h.demo;
    g.companions.movement = h.companions;
    g.particles.setBudget(this.budget !== null ? this.budget : h.budget);
    // A race is played on the tower it was run on: the ghost's own, when it carries one; and
    // at the JUMP SPEED, on the PLATFORMS, at the DIFFICULTY and the GRAVITY it was climbed at.
    g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, h.difficulty, h.gravity);
    this.i = 0;
    this.k = 0;
    this.input.reset();
    this.install(g);
  }

  restore(s) {
    const kf = this.keyframes.get(s);
    const g = snapshot(kf.game);
    g.input = this.input;
    if (this.budget !== null) g.particles.setBudget(this.budget);
    this.i = s;
    this.k = kf.k;
    this.input.seekTo(kf.k, this.replay.records);
    this.install(g);
  }

  /** One step. Returns false, and does nothing, once the replay is over. */
  step() {
    if (this.done) return false;
    const g = this.game;
    this.work++;
    if (g.state === STATE.PLAYING) {
      this.apply();
      g.step(STEP);
      this.k++;
      this.verify();
    } else {
      g.step(STEP);
    }
    this.i++;
    if (this.keyframesOk && this.i % C.REPLAY_KEYFRAME_EVERY === 0 && !this.keyframes.has(this.i)) {
      try { this.keyframes.set(this.i, { k: this.k, game: snapshot(this.game) }); }
      catch (e) { this.keyframesOk = false; }
    }
    return !this.done;
  }

  apply() {
    const R = this.replay.records, inp = this.input, g = this.game, k = this.k;
    inp._press = false;
    inp._took = false;
    while (inp.j < R.n && R.step[inp.j] === k) {
      const j = inp.j++;
      switch (R.kind[j]) {
        case K_INPUT: {
          const c = R.code[j];
          inp._axis = R.val[j]; inp._held = (c & 4) !== 0; inp._press = (c & 8) !== 0;
          break;
        }
        case K_IDLE: g.idleFor = R.val[j]; break;
        case K_MOVE: g.companions.movement = MOVES[R.val[j]]; break;
        case K_BUDGET: if (this.budget === null) g.particles.setBudget(R.val[j]); break;
        case K_ENSURE: g.tower.ensure(g.tower.highest + R.val[j]); break;
        case K_COSMETIC: {
          // The steps the run spent on a menu: not PLAYING, not PAUSED -- the generic
          // branch of Game.step, which OPTIONS, STATS, the guide and the menu all take.
          g.state = STATE.OPTIONS;
          for (let n = R.val[j]; n > 0; n--) g.step(STEP);
          g.state = STATE.PLAYING;
          this.work += R.val[j];
          break;
        }
      }
    }
  }

  verify() {
    if (this.desync) return;
    const r = this.replay, k = this.k, g = this.game, ce = r.header.checkEvery;
    let bad = false;
    if (k % ce === 0 && k / ce <= r.checks.length && simChecksum(g) !== r.checks[k / ce - 1]) bad = true;
    if (k === r.steps) {
      if (simChecksum(g) !== r.finalCheck) bad = true;
      if (r.result.ended === 'fire' && g.state === STATE.PLAYING) bad = true;   // he should have died here
    } else if (g.state !== STATE.PLAYING) {
      bad = true;                                                                // ...and not before
    }
    if (bad) this.desync = { step: k, seconds: k * STEP };
  }

  /** Seek to `target` steps (the fall counts). See the API at the top for the budget. */
  seekStep(target, budgetMs = Infinity) {
    target = Math.max(0, Math.floor(Number(target) || 0));
    let best = 0;
    for (const s of this.keyframes.keys()) if (s <= target && s > best) best = s;
    if (target < this.i) {
      if (best > 0) this.restore(best); else this.restart();
    } else if (best > this.i) {
      this.restore(best);
    }
    // The clock is read every 128 game steps of WORK, the menu steps a step replays
    // included. It was read every 128 playback steps, and one playback step can carry a
    // whole menu visit, 2,400 game steps: a file with a visit on each of 128 steps in a
    // row -- legal, the decoder's menu cap allows thousands -- held a 4 ms seek for 155 ms
    // a call. Now a step is the most a seek overruns by: one menu visit, about 1-5 ms.
    const t0 = now();
    let mark = this.work;
    while (this.i < target) {
      if (!this.step()) break;
      if (this.work - mark >= 128) {
        mark = this.work;
        if (now() - t0 >= budgetMs) return this.i >= target;
      }
    }
    return true;
  }

  seekTime(seconds, budgetMs = Infinity) { return this.seekStep(Math.round(Number(seconds) / STEP), budgetMs); }
}

export function createPlayback(replay, opts = {}) {
  if (!replay || !replay.header || !replay.records) return { ok: false, error: 'there is no replay' };
  if (replay.invalid) return { ok: false, error: replay.invalid };
  if (!compatible(replay)) {
    return { ok: false, incompatible: true, error: 'this replay was made by a different version of the game (its ghost can still race)' };
  }
  try {
    return { ok: true, playback: new Playback(replay, opts) };
  } catch (e) {
    return { ok: false, error: 'the replay could not be started: ' + (e && e.message) };
  }
}

// ---- the ghost --------------------------------------------------------------------
export function durationOf(replay) { return replay && replay.steps ? replay.steps * STEP : 0; }

/**
 * What a race keeps of the replay it raced, for its own file: the ghost's track, its length
 * and result, and the two numbers the track is read with -- a replay in every way ghostAt,
 * durationOf and Race read one, and nothing else. The arrays are the replay's own, shared.
 */
export function ghostOf(replay) {
  const h = replay.header;
  return {
    header: { seed: h.seed >>> 0, ghostEvery: h.ghostEvery, ghostQ: h.ghostQ },
    steps: replay.steps, result: { ...replay.result }, ghost: replay.ghost,
  };
}

export function ghostAt(replay, seconds) {
  const g = replay && replay.ghost;
  if (!g || !g.n) return null;
  const h = replay.header;
  // In samples. Snapped when it is a hair off a whole one: 984 steps come back from
  // 984 * STEP as 983.9999999, and the pose and facing, which are not interpolated, were
  // read from the sample BEFORE -- the tuck a jump had left, in the frame it jumped again.
  let s = Number(seconds) / (STEP * h.ghostEvery);
  const r = Math.round(s);
  if (Math.abs(s - r) < 1e-6) s = r;
  if (!(s >= 0)) return null;
  const last = g.n - 1;
  const done = s >= last;
  const i = done ? last : Math.floor(s);
  const f = done ? 0 : s - i;
  const j = done ? last : i + 1;
  const q = h.ghostQ;
  const pb = g.pose[i];
  return {
    x: (g.x[i] + (g.x[j] - g.x[i]) * f) / q,
    y: (g.y[i] + (g.y[j] - g.y[i]) * f) / q,
    facing: pb & 0x80 ? -1 : 1,
    pose: drawnNames(g)[pb & 0x7f],
    done,
  };
}

// ---- sharing ----------------------------------------------------------------------
/** The text to paste, and the exact contents of a .dvreplay file. */
export function exportReplay(replay) {
  if (!replay || replay.invalid) throw new Error('this replay cannot be exported: ' + (replay && replay.invalid));
  const h = replay.header;
  // Written only if it would read back: the counts the decoder insists on.
  if (replay.checks.length !== Math.floor(replay.steps / h.checkEvery)
      || replay.ghost.n !== Math.floor(replay.steps / h.ghostEvery) + 1) {
    throw new Error('this replay cannot be exported: its checksums or ghost do not match its length');
  }
  const rg = replay.race && replay.race.ghost;
  if (rg && rg.ghost.n !== Math.floor(rg.steps / rg.header.ghostEvery) + 1) {
    throw new Error('this replay cannot be exported: the ghost it raced does not match its length');
  }
  return encodeText(replay);
}

/** Untrusted text in: a replay and whether this build can play it, or a refusal. */
export function importReplay(text) {
  const r = decodeText(text);
  if (!r.ok) return r;
  return { ok: true, replay: r.replay, compatible: compatible(r.replay) };
}

// ---- the store --------------------------------------------------------------------
let store = null;
function theStore() {
  if (!store) store = new ReplayStore(defaultBackend(), { encode: exportReplay, decode: importReplay });
  return store;
}
export function setReplayBackend(backend) {
  store = new ReplayStore(backend, { encode: exportReplay, decode: importReplay });
  return store;
}
export function saveRun(replay) { return theStore().save(replay, 'own'); }
export function storeImported(replay) { return theStore().save(replay, 'imported'); }
export function listReplays() {
  const fp = simFingerprint().text;
  return theStore().list().map((e) => ({ ...e, playable: e.fp === fp }));
}
export function loadReplay(id) { return theStore().load(id); }
export function pinReplay(id, pinned) { return theStore().pin(id, pinned); }
export function deleteReplay(id) { return theStore().remove(id); }
