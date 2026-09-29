// The race's tower: a ghost race is run on the ghost run's OWN tower (src/game/course.js, the
// survey in src/game/race.js, the arena rule in Game.step, the race section of a replay file in
// src/game/replaycodec.js), against the real simulation. The screens that start a race and draw
// its ghost are test-replayui's; this is the engine under them.
//
// Why it exists: a race used to be a new run on the replay's seed, and the seed is not the
// tower -- each floor is laid out in the shaft as the run has opened it, and the shaft opens
// with the player's own climb, so a racer who climbed differently got other ledges and the
// ghost stood where his tower had none (the replay screens' second verifier, 2026-09-28).
//
//   1. Normal runs are byte for byte what they were: seeded bot runs' every floor, score,
//      length and arena hashed against hashes taken at 2d5c882, before the race existed, and
//      re-taken only where the score or the tower changed on purpose.
//   2. The survey finds the ghost's tower from its replay alone: every floor the run generated,
//      exactly; each one's arena step inside the bracket the live run was in when it laid it
//      out; the arena's steps against the ghost's best floor as the live run took them; the
//      generator's state at the end. And it runs on a budget: the slices, and what a
//      ten-minute replay costs, measured.
//   3. A race where the racer climbs DIFFERENTLY (the bot standing still for spells; the ghost
//      itself a stop-start climber and the racer the full bot): at every floor the ghost's run
//      had, the racer's floor is the ghost's floor exactly; the ghost's Duke never stands where
//      the racer's tower has no ledge (and on the seed alone, as before, it does); after every
//      step no floor in the tower lies outside the walls, the walls are the shaft's, the shaft
//      is at least the ghost's at the racer's best floor and at least the racer's own, and it
//      never narrows. After its run the ghost stands on its last ledge (Race.stand).
//   4. Past the ghost's last floor: the tower goes on from the ghost's generator as its run
//      would have (a racer who climbs exactly as a short ghost did, and then on, gets the plain
//      run's tower floor for floor), and every floor stays reachable, inside the play area and
//      wide enough -- test-reach's checks, over thousands of floors past each course's top.
//   5. The race's own replay: a byte-exact round trip; its size against its bound; played back
//      from the store with the raced replay DELETED and the raced replay's fingerprint changed:
//      no desync, the same Duke every step, the same floors; the ghost's track in it is the
//      ghost's; copies of the game (a seek) share the course rather than copy it.
//   6. GHOST ONLY: a replay from another build, and one that does not play back as recorded,
//      give no course; the race is then on the seed, exactly the plain run's tower, and says so
//      (Race.ghostOnly); its replay carries the ghost and plays back.
//   7. Hostile race sections, each with a valid checksum and broken one way -- a ledge outside
//      its shaft, one no one could reach, one narrower than the Duke, more tower than the run
//      could have made, an unknown kind, thresholds out of order, a pattern past the list, less
//      play than its ghost's, cut short -- refused fast, and random format-2 bytes never throw.
//   8. A race on a race's replay: its survey gives that race's own tower, which the next racer
//      climbs. And the race's replay is kept whatever it raced: a race that ended early on a
//      long ghost's course, a ghost that generated a thousand floors from outside.
//   9. Determinism: a race steps with Math.random, performance.now and Date.now throwing, and a
//      race on a Game that has played before is the race on a fresh one.
//
//   node tools/test-racetower.mjs                 # ~5 s
//   node tools/test-racetower.mjs --mutant=NAME   # patches a copy of src/; must exit 1
//   node tools/test-racetower.mjs --mutants       # every mutant, one process at a time

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
globalThis.window = globalThis.window || { addEventListener() {} };
const realNow = performance.now.bind(performance);
const T_START = realNow();

// ---- mutants: [file under src/, from, to]; each must make this suite FAIL -----------------
const MUTANTS = {
  // caught by 1 (a normal run's arena starts a step wide: its hash moves)
  'normal-run-changed': [['game/game.js', '    if (this.tower.course) {\n      const need = this.tower.shaftFor(this.run.maxFloor);',
    '    if (true) {\n      const need = this.tower.course ? this.tower.shaftFor(this.run.maxFloor) : 1;']],
  // caught by 3 (the racer on the seed alone, as before: other floors, the ghost on nothing)
  'race-on-seed': [['game/game.js', '  newRun(seed = randomSeed(), course = null, speed = 1, platforms = 1, difficulty = 0, gravity = 1) {\n', '  newRun(seed = randomSeed(), course = null, speed = 1, platforms = 1, difficulty = 0, gravity = 1) {\n    course = null;\n']],
  // caught by 3 (no shaft rule at all: served ledges outside the walls)
  'no-shaft-rule': [['game/game.js', '      if (need > this.arenaStep) this.arenaStep = need;\n', ''],
    ['game/game.js', '    if (this.tower.course) this.widenForCourse();\n    // Prune', '    // Prune']],
  // caught by 3 (floors served at the end of a step wait a step for their walls)
  'no-widen-after-ensure': [['game/game.js', '    if (this.tower.course) this.widenForCourse();\n    // Prune', '    // Prune']],
  // caught by 3 (the shaft ignores where the ghost stood: narrower than its at his floor)
  'no-reach-rule': [['game/course.js', '    while (r < c.reach.length && c.reach[r] <= best) r++;\n', '']],
  // caught by 2 and 4 (the survey keeps a step's threshold as the best floor it came in at: a
  // racer who climbs as the ghost did gets each step a floor early, a few steps before the ghost
  // had it, and parts from it -- which the old tower hid on the seeds here until 2026-09-28)
  'reach-at-best': [['game/race.js', 'this.reach.push(best > this.bestBefore ? best : best + 1);', 'this.reach.push(best);']],
  // caught by 3 (the ghost's shaft alone: the racer's own openness no longer counts)
  'ghost-shaft-only': [['game/game.js', '      if (need > this.arenaStep) this.arenaStep = need;\n', '      this.arenaStep = need;\n']],
  // caught by 2 and 3 (the survey logs every floor at the opening arena)
  'survey-misses-arena': [['game/race.js', '      log[n] = stepAt(this.hi);\n', '      log[n] = 0;\n']],
  // caught by 8 (a race's served floors logged in the shaft of the moment they were served, before
  // their walls came up: the course of a race's replay puts ledges in the wall, and its file is refused)
  'survey-served-floor-early': [['game/race.js', '      if (inner && n <= inner.top) {\n        let k = 0;', '      if (false) {\n        let k = 0;']],
  // caught by 2 (the survey ignores its budget: the whole run in one frame)
  'survey-unbudgeted': [['game/race.js', '        if (now() - t0 >= budgetMs) { out = true; break; }', '        if (false) { out = true; break; }']],
  // caught by 4 (the tower past the ghost's top starts the generator afresh)
  'handover-fresh-generator': [['game/course.js', '    this.rng.a = g.rng;\n', '']],
  // caught by 4 (the pattern's direction not carried over)
  'handover-no-direction': [['game/course.js', '    this.dir = g.dir;\n', '']],
  // caught by 5 (the race's file drops its tower: it plays back on the seed and desyncs)
  'file-drops-course': [['game/replaycodec.js', "  w.u8((g ? 1 : 0) | (c ? 2 : 0));\n", "  w.u8((g ? 1 : 0));\n"],
    ['game/replaycodec.js', '  if (c) {\n    w.v(c.steps); w.v(c.top);', '  if (false) {\n    w.v(c.steps); w.v(c.top);']],
  // caught by 5 (the race's file drops the ghost it raced)
  'file-drops-ghost': [['game/replay.js', "{ ghost: opts.ghost ? ghostOf(opts.ghost) : null, course }", '{ ghost: null, course }']],
  // caught by 5 (the course copied into every copy of the game)
  'snapshot-copies-frozen': [['game/snapshot.js', '    if (Object.isFrozen(v)) return v;\n', '']],
  // caught by 6 (a run that does not play back as recorded still gives a course)
  'survey-ignores-desync': [['game/race.js', "      if (pb.desync) { this.fail('its run did not play back as it was recorded'); break; }\n", ''],
    ['game/race.js', '    if (pb.desync || pb.k !== this.replay.steps) {', '    if (pb.k !== this.replay.steps) {']],
  // caught by 7 (the decoder takes a course's geometry on trust)
  'decoder-trusts-course': [['game/replaycodec.js', "      throw new Error('the race in the replay has a ledge outside the shaft');", '      /* trusted */'],
    ['game/replaycodec.js', "    if (!isReachable(prev, cur)) throw new Error('the race in the replay has a ledge no one could reach');", '']],
  // caught by 7 (no bound on how much tower a file may claim)
  'decoder-no-course-cap': [['game/replaycodec.js', 'const top = rd.v(courseCap(steps));', 'const top = rd.v();']],
  // caught by 8 (a course bounded by its ghost's run alone: a race on a race that ended early,
  // served the rest of that race's course, writes a replay that will not load back)
  'course-steps-ghost-only': [['game/race.js', 'steps: Math.max(this.replay.steps, inner ? inner.steps : 0),', 'steps: this.replay.steps,']],
  // caught by 8 (a course's cap without what its ghost's file may generate from outside: a
  // ghost that looked a thousand floors ahead, legal, gives a race whose replay will not load)
  'course-cap-no-ensure': [['game/replaycodec.js', ' + REPLAY_COURSE_FLAT + Math.floor(ensureCapFor(steps));', ' + REPLAY_COURSE_FLAT;']],
  // caught by 7 (a course may claim less play than its ghost's run had)
  'course-steps-unchecked': [['game/replaycodec.js', '  if (steps < ghostSteps) throw new Error(RACE_BAD);\n', '']],
  // caught by 3 (the ghost's stand taken from any sample near the floor's height, not the one
  // the track caught it standing on: GHOST ONLY, the bot on 116 stands on nothing)
  'stand-any-sample': [['game/race.js', '    if (stood >= 0) standAt = stood;\n    else if (standAt < 0) standAt', '    if (standAt < 0) standAt']],
  // caught by 3 (the ghost's stand after its run left where the track put it: on nothing)
  'stand-off-ledge': [['game/race.js', '      x = Math.max(course.x[f] + hw, Math.min(course.x[f] + course.w[f] - hw, x));\n', '']],
  // caught by 5 and 8 (a race's replay played back on the seed: Playback forgets the course)
  'playback-forgets-course': [['game/replay.js', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, h.difficulty, h.gravity);', 'g.newRun(h.seed, null, h.jumpSpeed, h.platforms, h.difficulty, h.gravity);']],
};

const argv = process.argv.slice(2);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
if (argv.includes('--mutants')) {
  const self = fileURLToPath(import.meta.url);
  const missed = [];
  for (const name of Object.keys(MUTANTS)) {
    const r = spawnSync(process.execPath, [self, `--mutant=${name}`], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const first = out.split('\n').find((l) => /^\s+FAIL |DID NOT APPLY|Error/.test(l)) || out.trim().split('\n').pop();
    const caught = r.status === 1;
    console.log(`  ${caught ? 'caught ' : 'MISSED '} ${name.padEnd(26)} ${r.status === 3 ? 'DID NOT APPLY' : String(first).trim().slice(0, 150)}`);
    if (!caught) missed.push(name);
  }
  console.log(missed.length ? `\n  ${missed.length} mutant(s) not caught: ${missed.join(', ')}` : `\n  all ${Object.keys(MUTANTS).length} mutants caught`);
  process.exit(missed.length ? 1 : 0);
}

let SRC = path.join(REPO, 'src');
let tmp = null;
process.on('exit', () => { if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* left */ } });
if (MUTANT) {
  const m = MUTANTS[MUTANT];
  if (!m) { console.log(`unknown mutant '${MUTANT}'; one of: ${Object.keys(MUTANTS).join(', ')}`); process.exit(2); }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dvrace-'));
  fs.cpSync(SRC, tmp, { recursive: true });
  for (const [file, from, to] of m) {
    const p = path.join(tmp, file);
    const t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const n = t.split(from).length - 1;
    if (n !== 1) { console.log(`  MUTANT ${MUTANT} DID NOT APPLY (${n} matches in ${file}): ${from.slice(0, 70)}`); process.exit(3); }
    fs.writeFileSync(p, t.replace(from, to));
  }
  SRC = tmp;
  console.log(`  MUTANT ${MUTANT}: this run must FAIL`);
}
const load = (rel) => import(pathToFileURL(path.join(SRC, rel)).href);

const { Game, STATE, ARENA_STEPS } = await load('game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS } = await load('game/autoplay.js');
const { STEP } = await load('core/loop.js');
const C = await load('game/constants.js');
const Replay = await load('game/replay.js');
const Codec = await load('game/replaycodec.js');
const Store = await load('game/replaystore.js');
const { CourseSurvey, Race } = await load('game/race.js');
const { CourseTower, makeCourse, COURSE_KINDS } = await load('game/course.js');
const { Tower, PATTERNS } = await load('game/generator.js');
const { isReachable, MAX_EDGE_GAP } = await load('game/reach.js');
const { IDLE_CYCLE, RUN_CYCLE } = await load('render/sprites.js');
const { snapshot } = await load('game/snapshot.js');

// ---- reporting -------------------------------------------------------------------------------
let failed = 0;
function ok(cond, msg) {
  if (cond) return true;
  failed++;
  console.log(`  FAIL ${msg}`);
  if (MUTANT) { console.log(`  (mutant ${MUTANT} caught)`); process.exit(1); }
  return false;
}
const note = (m) => console.log('  ok   ' + m);
const ms = (t) => `${t.toFixed(1)} ms`;
process.on('uncaughtException', (e) => { console.log('  FAIL an uncaught exception: ' + (e && e.stack)); process.exit(1); });

// ---- running games ---------------------------------------------------------------------------
/** Every floor the game's tower has generated since the last look, by floor number. */
function capture(game, floors) {
  const t = game.tower;
  for (let n = floors.length; n <= t.highest; n++) {
    const p = t.floors.get(n);
    floors.push(p ? { x: p.x, w: p.w, kind: p.kind } : null);
  }
}

/**
 * How the bot is let drive, step by step. 'bot' is the attract bot throughout; 'pauser' stands
 * still for 200 steps of every 480, 'lazy' for 120 of every 720 and 'stutter' for 60 of every
 * 240: each opens the shaft at other moments than the bot does, which is what gave a racer
 * other ledges. (A late start alone changes nothing: the shaft does not open while he waits,
 * and the same bot then climbs the same run a little later.)
 */
const DRIVE = {
  bot: () => true,
  pauser: (n) => n % 480 >= 200,
  lazy: (n) => n % 720 >= 120,
  stutter: (n) => n % 240 >= 60,
  // Climbs for a second and a quarter, then stands until the fire takes him: a race that ends early.
  stander: (n) => n < 300,
  // Climbs for a minute, then hops on the spot, jump held and the stick let go, until the fire
  // takes him -- in the air, as a climber's death mostly is: a run to the fire. The bot these
  // runs were pinned on died on its own in one to two minutes; the one rebuilt on 2026-09-29
  // (autoplay.js, round five) outruns this fire for as long as anyone has run it, and a run
  // that never ends leaves the ghost of it no last ledge (Race.stand) to be tested on. Standing
  // still instead, he died on his ledge, and the stand after a run was never in doubt.
  mortal: (n) => (n < 240 * 60 ? true : 'hop'),
  // A weak climber who never looks ahead, and no bot: test-sim's -- he stands on the point of
  // his ledge nearest the next, stops, and hops one floor, steering onto it -- so every floor
  // he meets is served by the step's own look up the view (Game.step's ensure), never between
  // two steps, and his shaft opens late (no speed, no chain). The bot rebuilt on 2026-09-29
  // looks fifteen to thirty-five floors ahead and serves every floor it meets itself; a racer
  // that opens the shaft with its meter full (a probe-like climber, held jump at the walls)
  // is always wider than its ghost. Neither ever had the step serve a floor laid out in a
  // wider shaft than his -- mutant no-widen-after-ensure's whole case -- and this one does.
  weak: (n, g) => {
    const p = g.player, t = g.tower.get(p.floor + 1);
    if (!t) return { axis: 0, held: false, tap: false };
    if (p.grounded) {
      const aim = Math.max(t.x + 5, Math.min(t.x + t.w - 5, p.x)), dx = aim - p.x;
      if (Math.abs(dx) > 4) {
        return { axis: Math.abs(p.vx) > 95 && Math.sign(p.vx) === Math.sign(dx) ? -Math.sign(p.vx) : Math.sign(dx), held: false, tap: false };
      }
      return { axis: Math.abs(p.vx) > 18 ? -Math.sign(p.vx) : 0, held: false, tap: Math.abs(p.vx) < 30 };
    }
    const dx = t.x + t.w / 2 - p.x;
    const inside = Math.abs(dx) < t.w * 0.35;
    return { axis: inside && Math.abs(p.vx) > 40 ? -Math.sign(p.vx) : Math.abs(dx) < 2 ? 0 : Math.sign(dx), held: true, tap: false };
  },
};

/**
 * A run from newRun to the fire (or `max` steps), recorded. `course` makes it a race on that
 * tower and `ghost` the replay it races; `each(game)` is called after every step. Returns the
 * game, every floor it generated, the arena step before and after the step that made each floor
 * (a floor is laid out in one of the two), the arena's steps against the best floor, the Duke
 * after every step, the replay, and its tower's top and generator at the seal.
 */
function play(seed, { course = null, ghost = null, drive = 'bot', max = 240 * 300, maxSteps, each = null, game = null, guard = null, look = 0 } = {}) {
  const input = new AutoInput();
  const g = game || new Game(input);
  g.input = input;
  g.demo = false;
  g.newRun(seed, course);
  const bot = new AutoPlayer(input);
  const rec = Replay.startRecording(g, { ghost, maxSteps });
  const floors = [null];
  capture(g, floors);
  const gen = [null];
  for (let k = 1; k < floors.length; k++) gen[k] = [g.arenaStep, g.arenaStep];
  // The arena's steps against the best floor as the survey keeps them (race.js take): the
  // lowest best floor first stood on in the new step -- the floor above, when the step came in
  // after he got there.
  const reach = [];
  let bestBefore = g.run.maxFloor;
  const stepsTaken = () => {
    const b = g.run.maxFloor;
    while (reach.length < g.arenaStep) reach.push(b > bestBefore ? b : b + 1);
    bestBefore = b;
  };
  stepsTaken();
  const log = [];
  for (let n = 0; n < max && g.state === STATE.PLAYING && !rec.sealed; n++) {
    const before = g.arenaStep;
    const d = DRIVE[drive](n, g);
    if (d === true) bot.step(g, STEP);
    else if (d && typeof d === 'object') { input.wantAxis = d.axis; input.jumpHeld = d.held; input.wantJump = d.tap; }
    else { input.wantAxis = 0; input.jumpHeld = d === 'hop'; input.wantJump = false; }
    // A look further ahead than the view, between two steps (the recorder keeps it as ENSURE):
    // floors served before the arena has come up to them.
    if (look) g.tower.peek(g.run.maxFloor + look);
    if (guard) guard(true);
    try { g.step(STEP); } finally { if (guard) guard(false); }
    for (let k = floors.length; k <= g.tower.highest; k++) gen[k] = [before, g.arenaStep];
    capture(g, floors);
    stepsTaken();
    log.push(g.player.x, g.player.y);
    if (each) each(g, n);
  }
  const t = g.tower;
  const end = {
    top: t.highest, rng: t.rng.a >>> 0, pattern: t.pattern, patternLeft: t.patternLeft, dir: t.dir,
    sideRun: t.sideRun, lastHalf: t.lastHalf, flowDir: t.flowDir, flowRun: t.flowRun,
    selfAlternating: !!t.selfAlternating,
  };
  return { game: g, floors, gen, reach, log, replay: rec.finish(), end };
}

/** The course of a replay, surveyed without a budget. */
function survey(replay) {
  const s = new CourseSurvey(replay);
  s.run();
  return s;
}

/** Floors of `a` and `b` that differ, 1..to, and the first one. */
function differ(a, b, to) {
  let bad = 0, first = -1;
  for (let n = 1; n <= to; n++) {
    const p = a[n], q = b[n];
    if (!p || !q || p.x !== q.x || p.w !== q.w || p.kind !== q.kind) { bad++; if (first < 0) first = n; }
  }
  return { bad, first };
}
const courseFloors = (c) => { const out = [null]; for (let n = 1; n <= c.top; n++) out.push({ x: c.x[n], w: c.w[n], kind: COURSE_KINDS[c.kind[n]] }); return out; };

/** How many of `thresholds` (sorted) are at or below v: an arena step. */
const stepFrom = (thresholds, v) => { let s = 0; while (s < thresholds.length && thresholds[s] <= v) s++; return s; };
/** The step a run's own openness gives: Game.step's nearest-step rule, on arenaEase alone. */
function ownStep(ease) {
  let s = 0;
  while (s + 1 < ARENA_STEPS.length && ease >= (ARENA_STEPS[s].half + ARENA_STEPS[s + 1].half) / 2) s++;
  return s;
}

const GROUND = new Set([...IDLE_CYCLE, ...RUN_CYCLE, 'land']);
/**
 * Every sample of a ghost's track where it STANDS on a ledge (a pose he is drawn in only while
 * grounded, and its feet on a floor's height), against the racer's floor at that height: does
 * the racer's ledge span the ghost's feet as the physics would have them (PLAYER_W wide)?
 */
function ghostStands(ghostReplay, floors) {
  const g = ghostReplay.ghost, q = ghostReplay.header.ghostQ, hw = C.PLAYER_W / 2;
  let checked = 0, bad = 0, first = null;
  for (let i = 0; i < g.n; i++) {
    if (!GROUND.has(g.names[g.pose[i] & 0x7f])) continue;
    const y = g.y[i] / q, n = Math.round(y / C.FLOOR_H);
    if (n < 1 || n >= floors.length || Math.abs(y - n * C.FLOOR_H) > 0.5 / q) continue;
    const p = floors[n], x = g.x[i] / q;
    checked++;
    if (!p || !(x + hw > p.x && x - hw < p.x + p.w)) { bad++; if (!first) first = `floor ${n} at x ${x} (the racer's ledge ${p ? p.x + '..' + (p.x + p.w) : 'missing'})`; }
  }
  return { checked, bad, first };
}

// =============================================================================================
// 1. Normal runs are byte for byte what they were
// =============================================================================================
const PLAIN = {};
{
  // sha1 of every floor generated (n:x,w,y,kind;) and then the score, the best floor, the steps
  // and the final arena step: the attract bot on a human tower to its death, taken at 2d5c882.
  // The scores were re-pinned when the score's scale changed (2026-09-28, combo.js scoreFor),
  // after the same hash WITHOUT the score was checked equal before and after that change on
  // 777 and 4242: every floor, the best floor, the steps and the arena as they were; 777
  // scored 7,910,110 and now 69,795, 4242 3,645,245 and now 56,125. Then all of it was
  // re-taken when the human tower's patterns changed on purpose (generator.js SHAPES, the same
  // day): other ledges, so other runs -- 777 to floor 791, 4242 to 453, 12345 to 1185.
  //
  // Re-taken 2026-09-29 for the bot, rebuilt to fly the real game (autoplay.js, round five),
  // with nothing of the tower, the race or the replay changed: it no longer dies on its own,
  // so each run is the bot for a minute and then hopping on the spot until the fire takes him (DRIVE's
  // `mortal`) -- 777 to floor 1107, 4242 to 1117, 12345 to 1100.
  const PINNED = {
    12345: 'bdc7455e38e3959f262a02d41e27eab79249f927',
    777: 'fe0902d20b8d49db00bd5156a84b26cb335a0744',
    4242: '317b1ac10d3d295aa3d75044de70419c03460650',
  };
  const got = [];
  for (const seed of Object.keys(PINNED).map(Number)) {
    const r = play(seed, { drive: 'mortal' });
    const h = crypto.createHash('sha1');
    for (let n = 1; n < r.floors.length; n++) { const p = r.floors[n]; h.update(`${n}:${p.x},${p.w},${n * C.FLOOR_H},${p.kind};`); }
    const g = r.game;
    h.update(`score ${g.run.score} floor ${g.run.maxFloor} steps ${r.replay.steps} arena ${g.arenaStep}`);
    const hex = h.digest('hex');
    ok(hex === PINNED[seed], `1. the bot's run on seed ${seed} is not the run it was when pinned (floor ${g.run.maxFloor}, score ${g.run.score}, ${r.floors.length - 1} floors)`);
    got.push(`${seed}: floor ${g.run.maxFloor} score ${g.run.score}`);
    PLAIN[seed] = r;
  }
  note(`1. normal runs byte for byte as pinned: ${got.join('; ')} -- every floor, the score, the length and the arena`);
}

// =============================================================================================
// 2. The survey finds the ghost's tower from its replay alone, on a budget
// =============================================================================================
const G1 = PLAIN[12345];            // the ghost of 3, 5, 7 and 8: the bot's whole run
let C1 = null;
let LONG = null;                    // the ten-minute replay and its course (8 races a race on it)
{
  const s = new CourseSurvey(G1.replay);
  let calls = 0;
  while (!s.run(C.REPLAY_SEEK_BUDGET) && calls < 100000) calls++;
  C1 = s.course;
  ok(!!C1 && !s.error, `2. the survey of a playable replay gave no course: ${s.error}`);
  if (C1) {
    const top = G1.end.top;
    ok(C1.top === top, `2. the course ends at floor ${C1.top}; the run's tower ended at ${top}`);
    const d = differ(courseFloors(C1), G1.floors, Math.min(top, C1.top));
    ok(d.bad === 0, `2. ${d.bad} of the course's floors are not the run's (the first, floor ${d.first})`);
    let out = 0, firstOut = -1;
    for (let n = 1; n <= C1.top; n++) {
      const s2 = stepFrom(C1.open, n);
      if (s2 < G1.gen[n][0] || s2 > G1.gen[n][1]) { out++; if (firstOut < 0) firstOut = n; }
    }
    ok(out === 0, `2. ${out} floors' arena steps are outside the arena the run had while laying them out (the first, floor ${firstOut}: the course says ${stepFrom(C1.open, firstOut)}, the run was at ${JSON.stringify(G1.gen[firstOut])})`);
    ok(JSON.stringify(C1.reach) === JSON.stringify(G1.reach), `2. the arena's steps against the best floor are ${JSON.stringify(C1.reach)}; the run took them at ${JSON.stringify(G1.reach)}`);
    const e = G1.end, gn = C1.gen;
    const same = gn.rng === e.rng && gn.pattern === PATTERNS.indexOf(e.pattern) && gn.patternLeft === e.patternLeft
      && gn.dir === e.dir && gn.sideRun === e.sideRun && gn.lastHalf === e.lastHalf && gn.flowDir === e.flowDir && gn.flowRun === e.flowRun
      && gn.selfAlternating === e.selfAlternating && gn.flow === false;
    ok(same, `2. the generator at the course's end is not the run's: ${JSON.stringify(gn)} against ${JSON.stringify(e)}`);
    ok(Object.isFrozen(C1) && Object.isFrozen(C1.gen) && Object.isFrozen(C1.open), '2. the course is not frozen (every copy of the game would copy it)');
  }
  // The budget: slices of REPLAY_SEEK_BUDGET, never the whole survey in one.
  const slack = 4;
  ok(s.frames >= 2 && s.worstMs <= C.REPLAY_SEEK_BUDGET + slack,
    `2. the survey of ${(G1.replay.steps / 240).toFixed(0)} s ran in ${s.frames} slice(s), the longest ${ms(s.worstMs)} against a budget of ${C.REPLAY_SEEK_BUDGET} ms`);
  note(`2. the survey of the bot's ${(G1.replay.steps / 240).toFixed(0)} s run (floor ${G1.replay.result.floor}): ${C1 && C1.top} floors, every one the run's, each in the arena it was laid out in (steps from floors ${C1 && C1.open.join(', ')}; the ghost stood on ${C1 && C1.reach.join(', ')} as they came); ${ms(s.ms)} in ${s.frames} slices of ${C.REPLAY_SEEK_BUDGET} ms, the longest ${ms(s.worstMs)}`);
  // A ten-minute replay: the attract bot on a demo tower, cut at ten minutes.
  {
    const input = new AutoInput();
    const g = new Game(input);
    g.demo = true;
    g.newRun(DEMO_SEEDS[1]);
    const bot = new AutoPlayer(input);
    const rec = Replay.startRecording(g, { maxSteps: 240 * 600 });
    for (let n = 0; n < 240 * 600 && g.state === STATE.PLAYING && !rec.sealed; n++) { bot.step(g, STEP); g.step(STEP); }
    const long = rec.finish();
    const top = g.tower.highest;
    const L = new CourseSurvey(long);
    let calls = 0;
    while (!L.run(C.REPLAY_SEEK_BUDGET) && calls < 100000) calls++;
    const steps = long.steps;
    // A demo's tower is a player's since 2026-09-29 (it was the flow ramp, gen.flow true).
    ok(!!L.course && L.course.top === top && L.course.gen.flow === false, `2. the ten-minute survey: ${L.error || (L.course && L.course.top)} against ${top}`);
    ok(L.worstMs <= C.REPLAY_SEEK_BUDGET + slack, `2. a slice of the ten-minute survey took ${ms(L.worstMs)}`);
    note(`2. a ${(steps / 240).toFixed(0)} s replay (floor ${long.result.floor}, ${top} floors): surveyed in ${ms(L.ms)} (${((steps / L.ms) * 1000 / 1e6).toFixed(2)} M steps a second headless) over ${L.frames} frames at ${C.REPLAY_SEEK_BUDGET} ms, the longest slice ${ms(L.worstMs)} -- ${(L.frames / 160).toFixed(2)} s of 160 Hz frames before the race starts`);
    LONG = { replay: long, course: L.course };
  }
}

// =============================================================================================
// 3. A race where the racer climbs differently: the ghost's floors, inside the walls
// =============================================================================================
/** A race on `course`, checked after every step. */
function race(seed, course, ghost, drive, opts = {}) {
  const ghostStep = (f) => stepFrom(opts.ghostReach, f);
  const w = { outside: 0, firstOut: null, walls: 0, underGhost: 0, underOwn: 0, shrank: 0, steps: 0, served: 0 };
  let last = 0;
  const each = (g) => {
    w.steps++;
    const lo = C.CX - g.arenaHalf, hi = C.CX + g.arenaHalf;
    for (const [k, p] of g.tower.floors) {
      if (k > 0 && (p.x < lo - 1e-9 || p.x + p.w > hi + 1e-9)) { w.outside++; if (!w.firstOut) w.firstOut = `floor ${k} ${p.x}..${p.x + p.w} in a shaft ${lo}..${hi} (best floor ${g.run.maxFloor})`; }
    }
    if (g.player.lo !== lo || g.player.hi !== hi) w.walls++;
    if (course && g.arenaStep < ghostStep(g.run.maxFloor)) w.underGhost++;
    if (g.arenaStep < ownStep(g.arenaEase)) w.underOwn++;
    if (g.arenaStep < last) w.shrank++;
    last = g.arenaStep;
  };
  const r = play(seed, { course, ghost, drive, each, max: opts.max, look: opts.look || 0 });
  r.watch = w;
  return r;
}
const R3 = [];
{
  // The attract bot as a ghost barely stands (it holds jump, and stands one step in 240), so
  // the ghosts that stand most are the stop-start ones; each pairing is a racer who opens the
  // shaft at other moments than his ghost did. The last is the other way round: a stop-start
  // ghost raced by the full bot, who opens the shaft sooner -- his own openness must count.
  // A stop-start ghost long enough to race: the first seed of `seeds` whose pausing bot climbs
  // 150 floors and whose racer, driven `drive`, meets 100 of them. These were 4242 and 777, and
  // went stale when the tower's patterns changed (2026-09-28): the pauser on 777 fell at 41, and
  // the stutterer died at 24 on 4242's. What they need is a long stop-start run, not one tower.
  const stopStart = (seeds, drive) => {
    for (const seed of seeds) {
      const ghost = play(seed, { drive: 'pauser' });
      if (ghost.game.run.maxFloor < 150) continue;
      const c = survey(ghost.replay).course;
      const r = c && play(seed, { course: c, ghost: ghost.replay, drive });
      if (r && Math.min(c.top, r.floors.length - 1) >= 100) return { seed, ghost };
    }
    ok(false, `3. none of ${seeds.join(', ')} gives a stop-start ghost of 150 floors a ${drive} racer follows 100 of`);
    return { seed: seeds[0], ghost: play(seeds[0], { drive: 'pauser' }) };
  };
  const s3 = stopStart([95, 99, 7, 1001, 4242], 'stutter');
  // 63 first: its race was the one where a floor the look-ahead serves at the end of a step
  // stood outside the walls unless the arena widened again right after (mutant
  // no-widen-after-ensure; 777's pauser run was that race until the tower changed). Since the bot
  // of 2026-09-29 serves every floor it meets itself, fifteen to thirty-five floors ahead, that
  // race is the weak climber's on s3's ghost below (DRIVE's `weak`).
  const s4 = stopStart([63, 1001, 4242, 99, 7], 'bot');
  const cases = [
    { name: 'the bot standing still for spells, on the bot\'s run', seed: 12345, ghost: G1, drive: 'pauser' },
    { name: 'a lazy bot, on the bot\'s run', seed: 4242, ghost: PLAIN[4242], drive: 'lazy' },
    { name: `a stuttering bot, on a stop-start run (${s3.seed})`, seed: s3.seed, ghost: s3.ghost, drive: 'stutter' },
    { name: `the bot, on a stop-start run (${s4.seed})`, seed: s4.seed, ghost: s4.ghost, drive: 'bot' },
    { name: `a weak climber who never looks ahead, on a stop-start run (${s3.seed})`, seed: s3.seed, ghost: s3.ghost, drive: 'weak' },
  ];
  let stood = 0;
  for (const cs of cases) {
    const course = cs.ghost === G1 ? C1 : survey(cs.ghost.replay).course;
    if (!ok(!!course, `3. no course for ${cs.name}`)) continue;
    const r = race(cs.seed, course, cs.ghost.replay, cs.drive, { ghostReach: cs.ghost.reach });
    const upTo = Math.min(course.top, r.floors.length - 1);
    const d = differ(r.floors, cs.ghost.floors, upTo);
    const st = ghostStands(cs.ghost.replay, r.floors);
    const w = r.watch;
    ok(upTo > 60 && d.bad === 0, `3. ${cs.name}: ${d.bad} of the ${upTo} floors the racer met are not the ghost's (the first, floor ${d.first})`);
    ok(st.bad === 0, `3. ${cs.name}: the ghost stands where the racer's tower has no ledge at ${st.bad} of ${st.checked} samples (${st.first})`);
    stood += st.checked;
    ok(w.outside === 0, `3. ${cs.name}: floors outside the walls at the end of a step ${w.outside} times (the first: ${w.firstOut})`);
    ok(w.walls === 0, `3. ${cs.name}: the Duke's walls are not the shaft's at ${w.walls} steps`);
    ok(w.underGhost === 0, `3. ${cs.name}: the shaft narrower than the ghost's at the racer's best floor at ${w.underGhost} steps`);
    ok(w.underOwn === 0, `3. ${cs.name}: the shaft narrower than the racer's own openness at ${w.underOwn} steps`);
    ok(w.shrank === 0, `3. ${cs.name}: the shaft narrowed ${w.shrank} times`);
    // The same racer on the seed alone, as races were: the defect this is here for.
    const old = play(cs.seed, { drive: cs.drive, ghost: cs.ghost.replay });
    const dOld = differ(old.floors, cs.ghost.floors, Math.min(course.top, old.floors.length - 1));
    const stOld = ghostStands(cs.ghost.replay, old.floors);
    note(`3. ${cs.name}: the racer reached floor ${r.game.run.maxFloor} (the ghost ${cs.ghost.replay.result.floor}); all ${upTo} floors he met the ghost's, the ghost on a ledge of his at all ${st.checked} standing samples, `
      + `nothing outside the walls in ${w.steps} steps -- on the seed alone ${dOld.bad} floors differed (the first ${dOld.first}) and the ghost stood on nothing at ${stOld.bad} samples`);
    R3.push({ ...cs, course, r, dOld, stOld });
  }
  ok(stood > 300, `3. the ghosts stood on a ledge at only ${stood} samples in all: too few to say where they stand`);
  ok(R3.filter((x) => x.dOld.bad > 0).length >= 3 && R3.some((x) => x.stOld.bad > 0),
    '3. too few racers on the seed alone met other ledges: these races cannot tell the fix from the defect');
}
{
  // After its run the ghost STANDS on its last floor for the rest of the race (Race.stand). Its
  // track has no landings, and a sample a few units above the ledge was as often him in the air
  // beside it: the ghost stood on nothing after its run in 4 of 16 runs (the verifier of the
  // race's tower, 2026-09-28; the bot on seed 21 is one). On the ghost's own tower its last
  // ledge is known and his feet go on it. Without it (GHOST ONLY) the last sample the track
  // caught him standing on that floor, when there is one, is on it (the bot on seed 31337 had
  // one, and the old choice of sample did not stand him on it; since the tower's patterns
  // changed, 2026-09-28, the bot on 116 is the one: stood at 189 on 196..252, the old choice 106).
  const STANDING = new Set([...IDLE_CYCLE, ...RUN_CYCLE, 'land']);
  const hw = C.PLAYER_W / 2;
  const ghosts = [['the bot on 12345', G1, C1], ...R3.map((x) => [x.name, x.ghost, x.course])];
  // Stop-start ghosts (DRIVE's `pauser`) since the bot of 2026-09-29, which the fire never
  // takes on its own: its run on 116 is again the one the choice of sample decides.
  for (const seed of [21, 116, 31337]) { const gh = play(seed, { drive: 'pauser' }); ghosts.push([`the bot on ${seed}`, gh, survey(gh.replay).course]); }
  let on = 0, off = 0, firstOff = null, bare = 0, bareOff = 0, bareFirst = null;
  for (const [name, gh, c] of ghosts) {
    if (!c || gh.replay.result.ended !== 'fire') continue;
    const f = gh.replay.result.floor;
    const onLedge = (x) => x + hw > c.x[f] && x - hw < c.x[f] + c.w[f];
    const st = new Race(gh.replay, { course: c }).stand;
    if (onLedge(st.x) && st.y === f * C.FLOOR_H) on++;
    else { off++; if (!firstOff) firstOff = `${name}: floor ${f} ${c.x[f]}..${c.x[f] + c.w[f]}, stands at ${st.x}`; }
    const t = gh.replay.ghost, q = gh.replay.header.ghostQ;
    let caught = false;
    for (let i = 0; i < t.n; i++) if (t.y[i] === f * C.FLOOR_H * q && STANDING.has(t.names[t.pose[i] & 0x7f])) caught = true;
    if (caught) {
      bare++;
      const sb = new Race(gh.replay, { ghostOnly: true }).stand;
      if (!onLedge(sb.x)) { bareOff++; if (!bareFirst) bareFirst = `${name}: floor ${f} ${c.x[f]}..${c.x[f] + c.w[f]}, stands at ${sb.x}`; }
    }
  }
  ok(on >= 6 && off === 0, `3. after its run the ghost stands on nothing in ${off} of ${on + off} races on its own tower (${firstOff})`);
  ok(bare >= 2 && bareOff === 0, `3. GHOST ONLY, the ghost stands off the ledge the track caught it standing on in ${bareOff} of ${bare} runs (${bareFirst})`);
  note(`3. after its run the ghost stands on its last ledge in all ${on} races on its own tower, and GHOST ONLY where its track caught it standing there (${bare} runs)`);
}

// =============================================================================================
// 4. Past the ghost's last floor
// =============================================================================================
{
  // A short ghost -- the bot's first 20 s on 777 -- and a racer who climbs exactly as it did
  // and then on: his whole tower must be the plain run's, floor for floor, since the course
  // is the plain run's tower up to its top and the generator goes on from where that one was.
  const short = play(777, { maxSteps: 240 * 20, drive: 'mortal' });
  const cs = survey(short.replay).course;
  const plain = PLAIN[777];
  if (ok(!!cs, '4. no course for the short ghost')) {
    const r = play(777, { course: cs, ghost: short.replay, drive: 'mortal' });
    const to = r.floors.length - 1;
    const d = differ(r.floors, plain.floors, Math.min(to, plain.floors.length - 1));
    ok(to > cs.top + 200 && d.bad === 0, `4. past the ghost's top (${cs.top}) the tower is not the one its run would have gone on to: ${d.bad} floors differ, the first ${d.first} (the racer's tower reached ${to})`);
    ok(r.game.run.maxFloor === plain.game.run.maxFloor && r.game.run.score === plain.game.run.score,
      `4. the racer who climbed as the plain run did did not end as it did: floor ${r.game.run.maxFloor} score ${r.game.run.score} against ${plain.game.run.maxFloor} ${plain.game.run.score}`);
    note(`4. a racer who climbs as a 20 s ghost did and then on: all ${to} floors his run generated are the plain run's -- ${cs.top} served, ${to - cs.top} generated from the ghost's generator where it left off`);
  }
  // The handover, exactly, for every ghost here: its course's tower past the top against the
  // ghost run's own tower carried on from where its run left it (a copy of it), both in the
  // shaft the ghost ended in and in the full one -- every part of the generator's state that
  // decides a floor (the stream, the pattern and what is left of it, the directions, the
  // one-side run) has to have come across for these to agree.
  {
    let hand = 0, handBad = 0, handFirst = null;
    const ghosts = [['the bot\'s', G1, C1], ['a 20 s ghost\'s', short, cs], ...R3.map((x) => [x.name, x.ghost, x.course])];
    // Built on two seeds whose own first draws (the directions a Tower starts with) are opposite,
    // so a part of the state left behind cannot agree with the ghost's by the seed's chance.
    const draws = (sd) => { const t = new Tower(sd); return `${t.flowDir},${t.dir}`; };
    const s1 = 1;
    let s2 = 2;
    while (draws(s2).split(',').some((v, i) => v === draws(s1).split(',')[i])) s2++;
    for (const [name, gh, c] of ghosts) {
      if (!c) continue;
      for (const [s, sd] of [[gh.game.arenaStep, s1], [gh.game.arenaStep, s2], [ARENA_STEPS.length - 1, s1], [ARENA_STEPS.length - 1, s2]]) {
        const ref = snapshot(gh.game).tower;
        const t = new CourseTower(sd, c);
        for (const tw of [ref, t]) tw.setBounds(C.CX - ARENA_STEPS[s].half, C.CX + ARENA_STEPS[s].half);
        ref.ensure(c.top + 300);
        t.ensure(c.top + 300);
        for (let n = c.top + 1; n <= c.top + 300; n++) {
          const a = ref.floors.get(n), b = t.floors.get(n);
          hand++;
          if (!a || !b || a.x !== b.x || a.w !== b.w || a.kind !== b.kind) { handBad++; if (!handFirst) handFirst = `${name} ghost, floor ${n} (top ${c.top}, arena step ${s})`; }
        }
      }
    }
    ok(hand > 3000 && handBad === 0, `4. past the top, ${handBad} of ${hand} floors are not the ghost's tower carried on (the first: ${handFirst})`);
    note(`4. the handover: ${hand} floors past the tops of ${ghosts.length} courses, each the floor the ghost run's own tower goes on to in the same shaft`);
  }
  // test-reach's checks over thousands of floors past each course's top, in a narrow shaft and
  // a full one.
  const courses = [['the bot\'s', C1], ['a 20 s ghost\'s', cs], ...R3.map((x) => [x.name.split(',')[1].trim() + ' (' + x.drive + ')', x.course])].filter((x) => x[1]);
  let pairs = 0, bad = 0, oob = 0, narrow = 0, viol = 0, firstBad = null;
  for (const [, c] of courses) {
    for (const open of [false, true]) {
      const t = new CourseTower(99, c);
      // As the race would have it: at least the ghost's last arena, or the whole play area.
      const s = open ? ARENA_STEPS.length - 1 : c.open.length;
      t.setBounds(C.CX - ARENA_STEPS[s].half, C.CX + ARENA_STEPS[s].half);
      t.ensure(c.top + 3000);
      viol += t.violations;
      for (let n = Math.max(1, c.top - 50); n <= c.top + 3000; n++) {
        const a = t.floors.get(n - 1), b = t.floors.get(n);
        pairs++;
        if (!a || !b || !isReachable(a, b)) { bad++; if (!firstBad) firstBad = `floor ${n} (top ${c.top})`; }
        if (b && (b.x < C.PLAY_L || b.x + b.w > C.PLAY_R || (n > c.top && (b.x < t.lo - 1e-9 || b.x + b.w > t.hi + 1e-9)))) oob++;
        if (b && b.w < C.PLAYER_W + 4) narrow++;
      }
    }
  }
  ok(pairs > 20000 && bad === 0 && oob === 0 && narrow === 0 && viol === 0,
    `4. past the courses' tops: ${bad} unreachable (${firstBad}), ${oob} outside, ${narrow} too narrow, ${viol} clamp fallbacks, over ${pairs} transitions`);
  note(`4. past the tops of ${courses.length} courses, narrow shaft and open: ${pairs} transitions from 50 below each top to 3000 above, every one reachable, inside, wide enough, no clamp fallback (MAX_EDGE_GAP ${MAX_EDGE_GAP})`);
}

// =============================================================================================
// 5. The race's own replay
// =============================================================================================
{
  const first = R3[0];
  const rr = first && first.r.replay;
  if (ok(!!rr && !!rr.race && rr.race.course === first.course && !!rr.race.ghost, '5. the race\'s replay carries no race')) {
    const text = Replay.exportReplay(rr);
    const back = Replay.importReplay(text);
    ok(back.ok && back.replay.format === Codec.FORMAT_RACE && Replay.exportReplay(back.replay) === text,
      `5. the race's replay does not survive a round trip: ${back.error || 'format ' + (back.replay && back.replay.format)}`);
    const B = back.replay;
    // The tower in it is the course, floor for floor, and the ghost's track is the ghost's.
    const bc = B.race && B.race.course;
    ok(bc && bc.top === first.course.top && differ(courseFloors(bc), courseFloors(first.course), bc.top).bad === 0
      && JSON.stringify(bc.open) === JSON.stringify(first.course.open) && JSON.stringify(bc.reach) === JSON.stringify(first.course.reach)
      && JSON.stringify(bc.gen) === JSON.stringify(first.course.gen), '5. the course read back is not the course written');
    const gg = B.race && B.race.ghost, og = first.ghost.replay;
    ok(gg && gg.steps === og.steps && gg.result.floor === og.result.floor && gg.ghost.n === og.ghost.n
      && gg.ghost.x.every((v, i) => v === og.ghost.x[i]) && gg.ghost.y.every((v, i) => v === og.ghost.y[i])
      && gg.ghost.pose.every((v, i) => gg.ghost.names[v & 0x7f] === og.ghost.names[og.ghost.pose[i] & 0x7f] && (v & 0x80) === (og.ghost.pose[i] & 0x80)),
    '5. the ghost in the race\'s replay is not the ghost it raced');
    // Its size, and the bound: about four bytes a floor of the ghost's tower and the ghost's
    // track at most as big as in the ghost's own file.
    const bytes = Codec.encodeBinary(rr).length;
    const plainBytes = Codec.encodeBinary({ ...rr, race: null }).length;
    const trackBytes = Codec.encodeBinary(og).length - Codec.encodeBinary({ ...og, ghost: { n: 1, x: [0], y: [0], pose: [0], names: ['fall'] } }).length;
    const section = bytes - plainBytes;
    const bound = trackBytes + 6 * first.course.top + 64;
    ok(section <= bound, `5. the race section is ${section} bytes, over its bound of ${bound} (${trackBytes} of track, ${first.course.top} floors)`);
    note(`5. the race's replay: ${text.length} characters, ${section} bytes of it the race (${(section - trackBytes).toFixed(0)} for ${first.course.top} floors, ${((section - trackBytes) / first.course.top).toFixed(2)} a floor; ${trackBytes} of ghost track) against a bound of ${bound}`);

    // Played back from the store with the raced replay deleted and its fingerprint changed.
    const st = new Store.ReplayStore(Store.memoryBackend(), { encode: Replay.exportReplay, decode: Replay.importReplay });
    const gs = st.save(og, 'own'), rs = st.save(rr, 'own');
    ok(gs.kept && rs.kept, `5. could not keep the two replays: ${gs.error} ${rs.error}`);
    ok(st.remove(gs.id) && !st.load(gs.id).ok, '5. the raced replay could not be deleted');
    og.header.probeHash = (og.header.probeHash ^ 1) >>> 0;       // and a build that no longer plays it
    const L = st.load(rs.id);
    ok(L.ok && L.compatible, `5. the race's replay did not load without the ghost's: ${L.error}`);
    if (L.ok) {
      const pb = Replay.createPlayback(L.replay).playback;
      const fl = [null];
      capture(pb.game, fl);
      let off = 0, firstOff = -1, k = 0, lastK = 0;
      while (pb.step()) {
        capture(pb.game, fl);
        // After each PLAYING step (the run's log has the Duke after each one), not in the fall.
        if (pb.k !== lastK) {
          lastK = pb.k;
          const i = 2 * (pb.k - 1);
          if (pb.game.player.x !== first.r.log[i] || pb.game.player.y !== first.r.log[i + 1]) { off++; if (firstOff < 0) firstOff = pb.k; }
        }
        if (++k > 240 * 400) break;
      }
      const dd = differ(fl, first.r.floors, Math.min(fl.length, first.r.floors.length) - 1);
      ok(pb.desync === null && off === 0 && dd.bad === 0 && pb.k === rr.steps,
        `5. the race's replay, played with the raced replay gone: desync ${JSON.stringify(pb.desync)}, the Duke off at ${off} steps (the first ${firstOff}), ${dd.bad} floors not the race's`);
      // A seek: copies of the game share the course; back to the start and forward again.
      const kfs = [...pb.keyframes.values()];
      ok(kfs.length > 0 && kfs.every((f) => f.game.tower.course === pb.game.tower.course && f.game.tower.course === L.replay.race.course),
        `5. the ${kfs.length} copies of the race's game do not share its course`);
      pb.seekStep(Math.floor(pb.stepIndex / 2));
      pb.seekStep(0);
      pb.seekStep(1e9);
      ok(pb.desync === null && pb.k === rr.steps, `5. the race's replay desynced after seeking: ${JSON.stringify(pb.desync)}`);
      note(`5. the race's replay kept, the raced replay deleted and its fingerprint changed: played back to the fire with no desync, the Duke where he was at all ${rr.steps} steps, the same ${fl.length - 1} floors; ${kfs.length} copies of the game share one course`);
    }
    og.header.probeHash = (og.header.probeHash ^ 1) >>> 0;
  }
}

// =============================================================================================
// 6. GHOST ONLY
// =============================================================================================
{
  const og = G1.replay;
  const other = Replay.importReplay(Replay.exportReplay(og)).replay;
  other.header.constHash = (other.header.constHash ^ 0x5a5a) >>> 0;
  const s1 = survey(other);
  ok(!s1.course && /version/.test(s1.error || ''), `6. a replay from another build was surveyed: ${s1.error}`);
  // One this build plays that does not play back as recorded: an input turned round early on.
  const bent = Replay.importReplay(Replay.exportReplay(og)).replay;
  const R = bent.records;
  let j = -1;
  for (let i = 0; i < R.n; i++) if (R.kind[i] === Codec.K_INPUT && R.step[i] > 240 && (R.code[i] & 3) === 1) { j = i; break; }
  R.code[j] = (R.code[j] & ~3) | 2; R.val[j] = -1;
  const s2 = survey(bent);
  ok(j >= 0 && !s2.course && /did not play back/.test(s2.error || ''), `6. a replay that does not play back as recorded was surveyed: ${s2.error}`);
  // ...and one whose run plays as it always did but whose checksums say otherwise: one altered.
  // Its tower may be the run's, but the replay is not what this build plays, so it is not
  // trusted with the racer's ledges. (An input turned round mostly ends the run at another
  // step, which the survey refuses by itself.)
  const sums = Replay.importReplay(Replay.exportReplay(og)).replay;
  sums.checks[Math.floor(sums.checks.length / 2)] ^= 1;
  const s3 = survey(sums);
  ok(!s3.course && /did not play back/.test(s3.error || ''), `6. a replay whose checksums disagree was surveyed: ${s3.error}`);
  // The race on the seed alone: exactly the plain run's tower for the same climb.
  const racer = play(12345, { ghost: other, drive: 'pauser' });
  const plain = play(12345, { drive: 'pauser' });
  const d = differ(racer.floors, plain.floors, Math.min(racer.floors.length, plain.floors.length) - 1);
  const rc = new Race(other, { ghostOnly: !s1.course });
  ok(d.bad === 0 && !racer.game.tower.course && rc.ghostOnly, `6. the GHOST ONLY race is not on the seed's own tower: ${d.bad} floors differ, course ${!!racer.game.tower.course}`);
  const rr = racer.replay;
  const back = Replay.importReplay(Replay.exportReplay(rr));
  const pb = back.ok && Replay.createPlayback(back.replay).playback;
  if (pb) pb.seekStep(1e9);
  ok(back.ok && back.replay.race && back.replay.race.ghost && !back.replay.race.course && pb && pb.desync === null && pb.k === rr.steps,
    `6. the GHOST ONLY race's replay: ${back.error || ''} desync ${pb && JSON.stringify(pb.desync)}`);
  note(`6. GHOST ONLY: another build's replay ("${s1.error}") and one that does not play back ("${s2.error}") give no course; that race is on the seed's own tower, floor for floor, and its replay carries the ghost and plays back`);
}

// =============================================================================================
// 7. Hostile race sections
// =============================================================================================
{
  const rr = R3[0] && R3[0].r.replay;
  const reseal = (b) => {
    const out = b.slice();
    new DataView(out.buffer).setUint32(out.length - 4, Codec.crc32(out, out.length - 4), true);
    return Codec.PREFIX + Buffer.from(out).toString('base64').replace(/=+$/, '');
  };
  const refused = [];
  const refuse = (what, text, want = null) => {
    const a = realNow();
    let r;
    try { r = Replay.importReplay(text); } catch (e) { r = { threw: e.message }; }
    const dt = realNow() - a;
    if (r.ok || r.threw || dt > 50 || (want && !want.test(r.error))) {
      ok(false, `7. ${what}: ${r.threw ? 'THREW ' + r.threw : r.ok ? 'accepted' : r.error} in ${ms(dt)}`);
    } else refused.push(what);
  };
  const withCourse = (mut) => {
    const c = rr.race.course;
    const parts = { top: c.top, steps: c.steps, x: c.x.slice(), w: c.w.slice(), kind: c.kind.slice(), open: [...c.open], reach: [...c.reach], gen: { ...c.gen } };
    mut(parts);
    return reseal(Codec.encodeBinary({ ...rr, race: { ghost: rr.race.ghost, course: makeCourse(parts) } }));
  };
  if (ok(!!rr, '7. no race replay to break')) {
    ok(Replay.importReplay(reseal(Codec.encodeBinary(rr))).ok, '7. a re-sealed untouched race replay was refused (the cases below would prove nothing)');
    const c = rr.race.course;
    const full = c.open.length ? c.open[c.open.length - 1] : 1;
    refuse('a ledge outside its shaft', withCourse((p) => { p.x[5] = C.PLAY_L; }), /outside the shaft/);
    // A ledge moved to the far side of the widest shaft the course reached: still inside it,
    // out of reach of the one below.
    const wide = ARENA_STEPS[c.open.length].half;
    const lo = Math.ceil(Math.max(C.PLAY_L, C.CX - wide)), hi = Math.floor(Math.min(C.PLAY_R, C.CX + wide));
    let at = -1, atX = 0;
    for (let n = full + 2; n < c.top && at < 0; n++) {
      const xr = hi - c.w[n];
      if (xr - (c.x[n - 1] + c.w[n - 1]) > MAX_EDGE_GAP + 1) { at = n; atX = xr; }
      else if (c.x[n - 1] - (lo + c.w[n]) > MAX_EDGE_GAP + 1) { at = n; atX = lo; }
    }
    ok(at > 0, '7. found no floor to move out of reach');
    refuse('a ledge no one could reach', withCourse((p) => { p.x[at] = atX; }), /reach/);
    refuse('a ledge narrower than the Duke', withCourse((p) => { p.w[full + 3] = C.PLAYER_W; }), /reach/);
    refuse('more tower than its run could have made', withCourse((p) => {
      const cap = Codec.courseCap(p.steps);
      const n = cap + 1;
      const x = new Float64Array(n + 1), w = new Float64Array(n + 1), k = new Uint8Array(n + 1);
      x.set(p.x); w.set(p.w); k.set(p.kind);
      for (let i = p.top + 1; i <= n; i++) { x[i] = p.x[p.top]; w[i] = p.w[p.top]; }
      p.top = n; p.x = x; p.w = w; p.kind = k;
    }));
    refuse('a kind of ledge the game does not know', withCourse((p) => { p.kind[3] = 7; }));
    refuse('arena steps out of order', withCourse((p) => { p.open = [30, 20]; }));
    // Past the list whatever its length: 9 was past it until the list grew to eleven (SHAPES).
    refuse('a pattern past the generator\'s list', withCourse((p) => { p.gen.pattern = PATTERNS.length; }));
    refuse('a course laid out in less play than its ghost\'s run', withCourse((p) => { p.steps = rr.race.ghost.steps - 1; }));
    {
      const b = Codec.encodeBinary(rr);
      const cut = new Uint8Array(b.length - 40);
      cut.set(b.subarray(0, b.length - 44)); cut.set(b.subarray(b.length - 4), cut.length - 4);
      refuse('a race section cut short', reseal(cut));
    }
    // Random bytes behind a valid magic, format 2 and a valid checksum: refused or decoded, never thrown.
    let threw = 0;
    let s = 0x9e3779b9;
    const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const base = Codec.encodeBinary(rr);
    for (let i = 0; i < 300; i++) {
      const b = base.slice();
      // A few bytes changed in the race section (it is the tail), or random bytes throughout.
      if (i % 2) { for (let k = 0; k < 4; k++) b[Math.max(4, b.length - 4 - 1 - Math.floor(rnd() * Math.min(2000, b.length - 8)))] = Math.floor(rnd() * 256); }
      else for (let k = 4; k < b.length - 4; k++) if (rnd() < 0.02) b[k] = Math.floor(rnd() * 256);
      b[3] = Codec.FORMAT_RACE;
      try { Replay.importReplay(reseal(b)); } catch (e) { threw++; }
    }
    ok(threw === 0, `7. import THREW on ${threw} damaged race files`);
    note(`7. ${refused.length} hostile race sections refused fast (${refused.join('; ')}); 300 damaged race files never threw`);
  }
}

// =============================================================================================
// 8. A race on a race's replay
// =============================================================================================
{
  // Two races to race again: R3's first, and one whose racer looks thirty floors ahead between
  // steps -- further than the view, so floors are served before his arena has come up to them
  // (a bot's look ahead, the renderer's, a companion's), which is where a survey that logged a
  // served floor in the shaft of that moment gave a course with ledges in the wall.
  const looker = race(12345, C1, G1.replay, 'pauser', { ghostReach: G1.reach, look: 30 });
  ok(looker.watch.outside === 0 && looker.watch.underGhost === 0, `8. the racer who looks ahead: ${looker.watch.outside} floors outside the walls (${looker.watch.firstOut})`);
  const sources = [['R3\'s first race', { r: R3[0] && R3[0].r, course: R3[0] && R3[0].course }], ['a race that looks ahead', { r: looker, course: C1 }]];
  for (const [label, first] of sources) {
    const rr = first.r && Replay.importReplay(Replay.exportReplay(first.r.replay)).replay;
    const s = rr && survey(rr);
    const c2 = s && s.course;
    if (!ok(!!c2, `8. ${label}: its replay could not be surveyed: ${s && s.error}`)) continue;
    // That race's tower: the floors its run generated, and above them the rest of the course it
    // was run on, which its generator's state comes after.
    const own = first.r.end.top, served = first.course.top;
    const whole = [...first.r.floors.slice(0, own + 1), ...courseFloors(first.course).slice(own + 1)];
    const d = differ(courseFloors(c2), whole, c2.top);
    ok(c2.top === Math.max(own, served) && d.bad === 0 && (own > served || JSON.stringify(c2.gen) === JSON.stringify(first.course.gen)),
      `8. ${label}: the survey of its replay is not its tower: top ${c2.top} against ${Math.max(own, served)}, ${d.bad} floors differ (the first ${d.first})`);
    // Every floor of the course inside the shaft its own arena steps say -- the decoder's rule --
    // and not by the luck of a ledge's width: every floor the race was served carries at least
    // the arena its own course laid it out in.
    let outside = 0, firstOut = -1, under = 0, firstUnder = -1;
    for (let n = 1; n <= c2.top; n++) {
      const half = ARENA_STEPS[stepFrom(c2.open, n)].half;
      if (c2.x[n] < Math.max(C.PLAY_L, C.CX - half) - 1e-9 || c2.x[n] + c2.w[n] > Math.min(C.PLAY_R, C.CX + half) + 1e-9) { outside++; if (firstOut < 0) firstOut = n; }
      if (n <= served && stepFrom(c2.open, n) < stepFrom(first.course.open, n)) { under++; if (firstUnder < 0) firstUnder = n; }
    }
    ok(outside === 0, `8. ${label}: ${outside} floors of its course lie outside the shaft its arena steps give them (the first, floor ${firstOut})`);
    ok(under === 0, `8. ${label}: ${under} floors of its course carry a narrower arena than the course it was served from (the first, floor ${firstUnder}: ${stepFrom(c2.open, firstUnder)} against ${stepFrom(first.course.open, firstUnder)})`);
    const next = race(12345, c2, rr, 'stutter', { ghostReach: first.r.reach });
    const upTo = Math.min(c2.top, next.floors.length - 1);
    const dn = differ(next.floors, whole, upTo);
    ok(dn.bad === 0 && next.watch.outside === 0 && next.watch.underGhost === 0,
      `8. ${label}: its racer: ${dn.bad} of ${upTo} floors not that race's, ${next.watch.outside} outside the walls, ${next.watch.underGhost} steps narrower than that race's shaft`);
    // The racer's own replay, kept and read back (the decoder holding its course to its shaft) and played.
    const b2 = Replay.importReplay(Replay.exportReplay(next.replay));
    const p2 = b2.ok && Replay.createPlayback(b2.replay).playback;
    if (p2) p2.seekStep(1e9);
    ok(b2.ok && p2 && p2.desync === null && p2.k === next.replay.steps, `8. ${label}: the replay of a race on its replay: ${b2.error || JSON.stringify(p2 && p2.desync)}`);
    note(`8. a race on ${label}'s replay: its survey is that race's tower (${own} floors its run generated, the rest of the ${served} of its course above them), every floor in its shaft and at least its course's arena; the next racer climbs it (${upTo} floors, all that race's) and his replay reads back and plays`);
  }
  // The race's own replay is KEPT, whatever the ghost it raced. A file's course is bounded by the
  // play that laid it out, and that is not always the ghost's run: (a) a race that ended early on
  // a long ghost's course carries that course, all of it, so the race on ITS replay is served
  // thousands of floors behind a few seconds of the ghost's play -- bounded by the ghost's run
  // alone that replay was refused, "would not load back", and the run not kept (found first with
  // the bot's 90 s run as the long ghost: 980 floors against a cap of 694); (b) a ghost whose file
  // generated floors from outside -- a look a thousand floors ahead, which the decoder allows
  // (ensureCapFor) -- is surveyed into a course that many floors taller than its climb.
  if (ok(!!LONG && !!LONG.course, '8. no ten-minute course to race')) {
    const seedL = LONG.replay.header.seed;
    const early = play(seedL, { course: LONG.course, ghost: LONG.replay, drive: 'stander' });
    const eb = Replay.importReplay(Replay.exportReplay(early.replay));
    const looker = play(12345, { look: 1000, maxSteps: 240 * 10 });
    const lb = Replay.importReplay(Replay.exportReplay(looker.replay));
    const cases = [['a race that ended early on the ten-minute run', eb], ['a ghost that looked a thousand floors ahead', lb]];
    const said = [];
    for (const [label, b] of cases) {
      if (!ok(b.ok, `8. ${label}: its own replay does not read back: ${b.error}`)) continue;
      const c = survey(b.replay).course;
      if (!ok(!!c, `8. ${label}: not surveyed`)) continue;
      const next = play(b.replay.header.seed, { course: c, ghost: b.replay, drive: 'bot', maxSteps: 240 * 20 });
      const st = new Store.ReplayStore(Store.memoryBackend(), { encode: Replay.exportReplay, decode: Replay.importReplay });
      const kept = st.save(next.replay, 'own');
      const L = kept.kept ? st.load(kept.id) : { ok: false, error: kept.error };
      const pb = L.ok && Replay.createPlayback(L.replay).playback;
      if (pb) pb.seekStep(1e9);
      const oldCap = Math.floor(b.replay.steps * C.REPLAY_COURSE_RATE) + C.REPLAY_COURSE_FLAT;
      ok(kept.kept && pb && pb.desync === null && pb.k === next.replay.steps,
        `8. ${label} (${b.replay.steps} steps, its tower ${c.top} floors, laid out in ${c.steps} steps): the race on its replay was not kept or does not play: ${L.error || JSON.stringify(pb && pb.desync)}`);
      said.push(`${label} (${(b.replay.steps / 240).toFixed(1)} s, a course of ${c.top} floors laid out in ${c.steps} steps; its own play alone allows ${Codec.courseCap(b.replay.steps)}, its climb alone ${oldCap})`);
    }
    note(`8. the race on each of these kept and played back: ${said.join('; ')}`);
  }
}

// =============================================================================================
// 9. Determinism
// =============================================================================================
{
  const real = { random: Math.random, now: performance.now, dnow: Date.now };
  let calls = 0;
  const guard = (on) => {
    if (on) {
      Math.random = () => { calls++; throw new Error('Math.random in a race\'s step'); };
      performance.now = () => { calls++; throw new Error('performance.now in a race\'s step'); };
      Date.now = () => { calls++; throw new Error('Date.now in a race\'s step'); };
    } else { Math.random = real.random; performance.now = real.now; Date.now = real.dnow; }
  };
  let threw = null, fresh = null;
  try { fresh = play(12345, { course: C1, ghost: G1.replay, drive: 'stutter', guard }); } catch (e) { threw = e.message; }
  guard(false);
  ok(!threw && calls === 0, `9. a race's step reached the clock or Math.random: ${threw}`);
  // The same race on a Game that has already played a run and died.
  const used = new Game(new AutoInput());
  used.newRun(55);
  for (let n = 0; n < 240 * 30 && used.state === STATE.PLAYING; n++) used.step(STEP);
  for (let n = 0; n < 600; n++) used.step(STEP);
  const again = play(12345, { course: C1, ghost: G1.replay, drive: 'stutter', game: used });
  const same = fresh && again.log.length === fresh.log.length && again.log.every((v, i) => v === fresh.log[i])
    && differ(again.floors, fresh.floors, fresh.floors.length - 1).bad === 0 && again.replay.finalCheck === fresh.replay.finalCheck;
  ok(same, '9. a race on a Game that had played before is not the race on a fresh one');
  note('9. a race steps with Math.random, performance.now and Date.now throwing, and on a used Game is the race on a fresh one');
}

const secs = ((realNow() - T_START) / 1000).toFixed(1);
if (failed) {
  console.log(`\n  ${failed} race-tower check(s) FAILED in ${secs} s`);
  process.exit(1);
}
console.log(`  the race's tower: the ghost's own, inside its walls, on through its top, in its file (${secs} s)`);
