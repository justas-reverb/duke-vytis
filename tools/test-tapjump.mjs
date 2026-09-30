// A jump TAPPED just before touchdown jumps on landing. (docs/GAMEPLAY.md "The jump buffer".)
//
// The user found the game too slow and asked for jumps that feel faster. What two reviewers
// found under it was not speed: a jump tapped 4 to 100 ms before touchdown did
// NOTHING, at 100% and at every JUMP SPEED, and in every build before this one. Player.step
// called input.consumeJump() every step, so a press made in the air with no air jump to
// spend was taken there and thrown away, and the jump buffer (JUMP_BUFFER, 0.12 s -- in
// core/input.js for exactly "a jump pressed a few milliseconds before touching down") was
// empty by the time he landed. Only a HELD key jumped on landing. A well-timed tap ignored
// reads as input lag. A press is now taken only where it makes a jump happen.
//
// Everything runs through the real loop -- the real Input fed key events between steps (a
// fake event target), the real Game.step, which counts the buffer down (Input.step) before
// Player.step reads it -- on a real tower, never a copy of the rule:
//   1. THE SWEEP. Four flights with no air jump to spend -- a standing hop, a running jump
//      onto whatever ledge it reaches, a flight with a jump banked but not unlocked (as after
//      walking off a ledge that a cold takeoff and a hot landing left him on), and a flight
//      whose one air jump is already spent -- at every JUMP SPEED, with a tap going down 0 to
//      40 steps before the step his feet reach the ledge, as a 4 ms flick and as a 50 ms tap
//      (both up by then). Inside the buffer every tap jumps on the step after landing; past
//      it none does. The flight before the landing is the same with the tap as without it.
//      The same sweep runs on the old code (the unconditional consumeJump put back in a copy
//      of src/) and the taps each eats are counted: before and after.
//   2. The named timings: taps 4, 20, 50, 80 and 110 ms before touchdown jump on landing;
//      one 150 ms before does not.
//   3. THE WINDOW IS REAL TIME: the latest tap that still jumps is the same number of the
//      world's steps at every JUMP SPEED, and it is the one JUMP_BUFFER promises.
//   4. AN AIR JUMP STILL TAKES THE TAP (unchanged): with one banked and unlocked, a tap at
//      any of those moments fires the air jump in the step that first sees it, and nothing
//      is left over to fire again on landing.
//   5. THE HELD CHAIN (unchanged): holding jump re-fires on the step after every landing,
//      flagged insta, at every speed.
//   6. THE REPLAY records the press where the simulation TOOK it (the landing step's jump,
//      never the tap's own step in the air): the recorded presses are exactly the steps
//      consumeJump() returned true, and the file played back is the trial, every step.
//   7. A PRESS LEFT WAITING WHEN THE RUN ENDS (the fire, or a quit from the pause) does not
//      make him jump on the next run's first step, while the SPACE that starts that run
//      still does; a press waiting through a PAUSE still fires on the landing.
//
// Every check was seen to fail on a broken build:
//   node tools/test-tapjump.mjs                  the checks, a few seconds
//   node tools/test-tapjump.mjs --mutant=NAME    against a copy of src/ with MUTANTS[NAME]; must FAIL
//   node tools/test-tapjump.mjs --mutants        every mutant in turn, one process each

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice('--mutant='.length) || null;

// ---- mutants: [file under src/, from, to] -----------------------------------------------
const WANT = 'const wantJump = (usable && input.consumeJump()) || held;';
const USABLE = 'const usable = onGround || (this.airJumps > 0 && this.airUnlocked);';
// The defect itself, put back: every press taken every step, usable or not.
const OLD = ['game/player.js', WANT, 'const wantJump = input.consumeJump() || held;'];
// The comment on each names the checks that caught it when this was written.
const MUTANTS = {
  // 1, 2, 3 and 6 (14 checks): every tap inside the buffer eaten, 864 of 864, and the
  // recording has the press in the air
  'old-consume': [OLD],
  // 0 (the spent flight cannot spend its own air jump) and 4: the air never takes a press,
  // so the double jump waits for the landing
  'air-never-takes': [['game/player.js', USABLE, 'const usable = onGround;']],
  // 1, 2, 3 (the locked flight, 216 taps): a banked but locked air jump takes the press and
  // throws it away
  'locked-jump-takes': [['game/player.js', USABLE, 'const usable = onGround || this.airJumps > 0;']],
  // 5: the held key no longer chains
  'no-held-chain': [['game/player.js', WANT, 'const wantJump = usable && input.consumeJump();']],
  // 1, 2, 3: the buffer counted down on his clock -- the latest tap that jumps is 24 steps
  // before touchdown at 110%, 21 at 120%, 20 at 130%
  'buffer-on-his-clock': [['game/game.js', '    this.input.step(dt);\n', '    this.input.step(dt * this.player.rate);\n']],
  // 1, 2, 3: the buffer never runs out, so a tap 150 ms early still jumps
  'buffer-never-runs-out': [['core/input.js', 'if (this.jumpBuffer > 0) this.jumpBuffer -= dt;', 'if (this.jumpBuffer > 0) this.jumpBuffer -= 0;']],
  // 6: the recorder notes a press when it ARRIVES (the design the replay's header rejects);
  // the playback offers it in the air, where nothing takes it, and the landing jump is lost
  // (the playback stands on the ledge the step the run jumped off it)
  'recorder-at-arrival': [
    ['game/replay.js', '    if (r && this.open) this._press = true;\n', ''],
    ['game/replay.js', '    this._press = false;\n    this.open = true;', '    this._press = Math.abs(this.inner.jumpBuffer - (0.12 - dt)) < 1e-12;\n    this.open = true;'],
  ],
  // (The verifier's, 2026-09-28.) 0 and 4: the held test first, so a press on the ground
  // with the key down is jumped on without being TAKEN, and it waits on in the buffer to fire
  // the air jump the step after takeoff
  'held-first': [['game/player.js', WANT, 'const wantJump = held || (usable && input.consumeJump());']],
  // 7: nothing drops a press left waiting when a run ends, and it jumps on the next run's first step
  'stale-press-kept': [['game/game.js', "    if (this.input && typeof this.input.dropStaleJump === 'function') this.input.dropStaleJump();\n", '']],
  // 7: every press dropped at a new run, the SPACE that starts it too
  'drop-every-press': [['core/input.js', '    if (this.jumpWaited) this.jumpBuffer = 0;', '    this.jumpBuffer = 0;']],
  // 7: a recorder still in front of the input does not pass the drop on
  'recorder-drops-nothing': [['game/replay.js', '  dropStaleJump() { if (this.inner.dropStaleJump) this.inner.dropStaleJump(); }', '  dropStaleJump() {}']],
};

if (argv.includes('--mutants')) {
  let bad = 0;
  for (const name of Object.keys(MUTANTS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--mutant=' + name], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const didNot = /DID NOT APPLY/.test(out);
    const fails = (out.match(/^ {2}FAIL .*/gm) || []).map((l) => l.trim().slice(5, 110));
    const caught = r.status === 1 && !didNot;
    if (!caught) bad++;
    console.log(`  ${caught ? 'caught' : 'MISSED'} ${name.padEnd(22)} ${didNot ? 'DID NOT APPLY' : fails.length + ' checks failed: ' + (fails[0] || '(exit ' + r.status + ')')}`);
  }
  console.log(bad ? `\n  ${bad} mutant(s) not caught` : `\n  every mutant caught (${Object.keys(MUTANTS).length})`);
  process.exit(bad ? 1 : 0);
}

const tmpDirs = [];
process.on('exit', () => { for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* left */ } } });
/** A copy of src/ with `patches` applied, or null (and a message) when one no longer matches. */
function patchedSrc(tag, patches) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tapjump-${tag}-`));
  tmpDirs.push(tmp);
  fs.cpSync(path.join(REPO, 'src'), tmp, { recursive: true });
  for (const [file, from, to] of patches) {
    const f = path.join(tmp, file);
    // LF, whatever the checkout wrote: git on this machine checks the sources out with CRLF.
    const text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    if (!text.includes(from)) return null;
    fs.writeFileSync(f, text.replace(from, to));
  }
  return tmp;
}

let SRC = path.join(REPO, 'src');
if (MUTANT) {
  const patches = MUTANTS[MUTANT];
  if (!patches) { console.log(`no mutant ${MUTANT}`); process.exit(2); }
  const d = patchedSrc('mut', patches);
  if (!d) { console.log(`  DID NOT APPLY: ${MUTANT}`); process.exit(2); }
  SRC = d;
  console.log(`  mutant ${MUTANT}: this run must FAIL`);
}
// The old code, always: the sweep's "before" column. A defect the sweep could not see on it
// would mean the sweep tests nothing.
const OLD_SRC = patchedSrc('old', [OLD]);
if (!OLD_SRC) { console.log('  DID NOT APPLY: the old consumeJump call (player.js changed; repoint OLD)'); process.exit(2); }

// ---- one build: its modules, and a log of what its Duke emits ----------------------------
let LOG = null;   // the running trial's events, or null
let K = 0;        // the step about to run, for the log
async function build(dir) {
  const imp = (p) => import(pathToFileURL(path.join(dir, p)).href);
  const B = {
    ...(await imp('game/game.js')),
    ...(await imp('core/input.js')),
    ...(await imp('game/settings.js')),
    Player: (await imp('game/player.js')).Player,
    STEP: (await imp('core/loop.js')).STEP,
    Replay: await imp('game/replay.js'),
    Codec: await imp('game/replaycodec.js'),
  };
  // Game.step drains his events into its own handlers inside the step, so they are logged
  // where they are made, with the step they were made in.
  const emit = B.Player.prototype.emit;
  B.Player.prototype.emit = function (type, data) {
    if (LOG) LOG.push({ k: K, type, ...data });
    return emit.call(this, type, data);
  };
  return B;
}
const NEW = await build(SRC);
const OLDB = await build(OLD_SRC);
const { STEP, JUMP_BUFFER, JUMP_SPEEDS } = NEW;

let pass = 0, failed = 0;
function check(cond, label, detail = '') {
  if (cond) { pass++; console.log('  ok   ' + label); } else { failed++; console.log('  FAIL ' + label + (detail ? '   ' + detail : '')); }
  return cond;
}
const note = (s) => console.log('       ' + s);
const pct = (s) => Math.round(s * 100) + '%';
const msOf = (d) => (d * STEP * 1000).toFixed(0) + ' ms';

class FakeTarget {
  constructor() { this.h = new Map(); }
  addEventListener(type, fn) { if (!this.h.has(type)) this.h.set(type, []); this.h.get(type).push(fn); }
  fire(type, code) { for (const fn of this.h.get(type) || []) fn({ code, repeat: false, preventDefault() {} }); }
}

// ---- the flights ---------------------------------------------------------------------------
// Keys land between steps, decided from his state before the step; `stage` may set state that
// the game reaches by a longer road (said where it does). The takeoff is the scenario's own
// press, held to the top of the arc; the tap under test is KeyZ, another jump key.
//
// Every tap of the sweep comes in the flight's last FALL. A jump key down while he is still
// rising holds off the jump cut (Player.step: "let go early, go less far"), so a tap on the
// way up changes the arc -- the first version of this suite tapped a running jump 36 steps
// before it landed on floor 5 at 120%, still rising, and the flight it compared came down a
// step later. Section 0 holds each flight to it.
const SEED = 0x2f6f1b21;
/** Jump key down before step `at`, up again at the top of the arc (the first step he is not rising). */
const fullJump = (at, code) => (k, fire, g, st) => {
  if (k === at) fire('keydown', code);
  if (k > at && st.takeoff >= 0 && st.ownUp < 0 && g.player.vy <= 0) { st.ownUp = k; fire('keyup', code); }
};
const hopKeys = fullJump(12, 'Space');
// Where the cold hops start (the standing hop and the locked flight): x 320 in the opening box
// (136-344), clear of floors 1-3 over him (225-263, 173-205, 237-277), so a standing hop comes
// back down to the ground after its whole fall. The hot flights keep the middle, where their
// air jump carries them to a ledge with room to spare at every speed (from 320 it put the spent
// flight on floor 4 after 34 steps). From
// the box's middle, x 240, it landed on floor 1, thirty units up, and at 140% -- the default
// since 2026-09-28 -- that fall was 37 steps: no room for a sweep reaching past 150 ms.
const HOP_FROM = 320;
const SCENARIOS = {
  hop: { what: 'a standing hop', keys: hopKeys, from: HOP_FROM },
  // The same hop from the box's middle, where every run starts: for 6, whose replay plays the
  // flight back from a new run and so cannot start it anywhere a key did not take it. Not swept,
  // so not held to the sweep's room in 0.
  hopMid: { what: 'a standing hop from the middle', keys: hopKeys, unswept: true },
  // Run left from the start and jump at step 30: on this seed it comes down on floor 2 at
  // every speed after a fall of 59-73 steps (to the right, and at other takeoffs, it met a
  // ledge a few steps past the top of the arc -- no room for the sweep).
  runup: {
    what: 'a running jump',
    keys: (k, fire, g, st) => { if (k === 0) fire('keydown', 'ArrowLeft'); fullJump(30, 'Space')(k, fire, g, st); },
  },
  // A jump banked by a landing on a full meter is unlocked only by a TAKEOFF on one, so
  // walking off a ledge after a cold takeoff and a hot landing leaves him in the air with
  // airJumps 1 and airUnlocked false: no air jump to spend. Staged here after the hop's takeoff.
  locked: {
    what: 'a flight with a jump banked but locked',
    keys: hopKeys,
    from: HOP_FROM,
    stage: (k, g, st) => { if (st.takeoff >= 0 && k === st.takeoff + 1) { g.player.airJumps = 1; g.player.airUnlocked = false; } },
  },
  // A full meter at takeoff, the air jump spent at the top of the arc by its own press (held
  // to the top of the second rise): then nothing left to spend.
  spent: {
    what: 'a flight with its air jump spent',
    keys: (k, fire, g, st) => {
      hopKeys(k, fire, g, st);
      if (st.ownUp >= 0 && st.apexAt < 0 && k > st.ownUp) { st.apexAt = k; fire('keydown', 'ArrowUp'); }
      if (st.apexAt >= 0 && st.ownUp2 < 0 && k > st.apexAt + 1 && g.player.vy <= 0) { st.ownUp2 = k; fire('keyup', 'ArrowUp'); }
    },
    stage: (k, g) => { if (k === 12) g.player.momentum = 1; },
  },
  // A full meter at takeoff and the air jump still banked: a tap takes it.
  air: { what: 'a flight with an air jump to spend', keys: hopKeys, stage: (k, g) => { if (k === 12) g.player.momentum = 1; } },
};

/**
 * One flight on build `B` at `speed`. `tap` = { at, len }: KeyZ down before step `at`, up before
 * step at + len. Runs until AFTER steps past the first landing that comes after both the
 * takeoff and the tap. Returns the log, the takeoff and landing steps, and (with `track`) his
 * state after every step, the steps consumeJump() returned true, and the finished recording.
 */
const AFTER = 120;
function flight(B, speed, scen, tap = null, opts = {}) {
  const target = new FakeTarget();
  const input = new B.Input(target);
  const taken = [];
  if (opts.track) {
    // What the simulation took, from the Input itself (the recorder wraps it, so this is
    // what reached the recorder too).
    input.consumeJump = function () { const r = B.Input.prototype.consumeJump.call(this); if (r) taken.push(K); return r; };
  }
  const game = new B.Game(input);
  game.newRun(SEED, null, speed);
  const rec = opts.track ? B.Replay.startRecording(game) : null;
  const log = [];
  const st = { takeoff: -1, land: -1, apexAt: -1, ownUp: -1, ownUp2: -1, lastOwn: -1, lands: [] };
  const states = [];
  const vys = [];
  // The scenario's own keys, and the step before which the last of them landed.
  const fire = (t, c) => { st.lastOwn = K; target.fire(t, c); };
  LOG = log;
  let end = Infinity;
  if (scen.from !== undefined) { const p = game.player; p.x = p.px = scen.from; }
  for (let k = 0; k < 2400 && k < end && game.state === B.STATE.PLAYING; k++) {
    K = k;
    scen.keys(k, fire, game, st);
    if (tap && k === tap.at) target.fire('keydown', 'KeyZ');
    if (tap && k === tap.at + tap.len) target.fire('keyup', 'KeyZ');
    if (scen.stage) scen.stage(k, game, st);
    const n = log.length;
    game.step(STEP);
    for (let i = n; i < log.length; i++) {
      const e = log[i];
      if (e.type === 'jump' && st.takeoff < 0) st.takeoff = e.k;
      if (e.type === 'land' && st.takeoff >= 0) {
        st.lands.push(e.k);
        if (st.land < 0 && (!tap || e.k >= tap.at)) { st.land = e.k; end = e.k + AFTER; }
      }
    }
    vys.push(game.player.vy);
    if (opts.track) { const p = game.player; states.push([p.x, p.y, p.vx, p.vy, p.grounded, p.floor, p.momentum, p.airJumps]); }
  }
  LOG = null;
  const landEv = log.find((e) => e.type === 'land' && e.k === st.land);
  // The first step of the last fall: every step from it to the landing ended with vy <= 0.
  let fallFrom = st.land;
  while (fallFrom > 0 && vys[fallFrom - 1] <= 0) fallFrom--;
  const out = { log, takeoff: st.takeoff, land: st.land, floor: landEv ? landEv.floor : -1, taken, states, lands: st.lands, fallFrom, lastOwn: st.lastOwn };
  if (rec) out.replay = rec.finish();
  return out;
}

/** Where a sweep tap's flight ended up: 'landing' (jumped the step after the landing), 'none', or where. */
function outcome(r, dry, tapAt) {
  const jumps = r.log.filter((e) => e.type === 'jump' && e.k >= tapAt);
  const airs = r.log.filter((e) => e.type === 'airjump' && e.k >= tapAt);
  if (r.land !== dry.land) return `the flight changed: landed at ${r.land}, not ${dry.land}`;
  if (airs.length) return `an air jump at ${airs[0].k}`;
  if (!jumps.length) return 'none';
  if (jumps.length === 1 && jumps[0].k === dry.land + 1 && !jumps[0].insta) return 'landing';
  return `jumped at ${jumps.map((e) => e.k).join(',')}${jumps[0].insta ? ' (insta)' : ''}`;
}

// A tap is counted down once before every read, the read in the step that first sees it
// included, and is read the step after the landing step: d + 2 decrements for a tap d steps
// before the landing step. So the last d that still jumps is the largest with (d + 2) steps
// under JUMP_BUFFER -- 26 steps (108 ms) at 240 Hz and 0.12 s.
let EXPECT_LAST = -1;
for (let d = 0; d < 200; d++) if ((d + 2) * STEP < JUMP_BUFFER) EXPECT_LAST = d;
// Past the 150 ms asked about; a standing hop at 140% falls for about 50 steps, so not much further.
const D_MAX = 37;
const TAPS = [{ len: 1, what: 'a 4 ms flick' }, { len: 12, what: 'a 50 ms tap' }];

/** The sweep on build `B`: every scenario without an air jump, every speed, d 0..D_MAX, both taps. */
function sweep(B) {
  const rows = [];
  for (const name of ['hop', 'runup', 'locked', 'spent']) {
    const scen = SCENARIOS[name];
    for (const speed of B.JUMP_SPEEDS) {
      const dry = flight(B, speed, scen);
      for (const t of TAPS) {
        for (let d = 0; d <= D_MAX; d++) {
          const at = dry.land - d;
          // Up by the landing step at the latest, so no `held` jump can stand in for the buffer.
          const len = Math.max(1, Math.min(t.len, d));
          const r = flight(B, speed, scen, { at, len });
          rows.push({ name, speed, len: t.len, d, at, dry, out: outcome(r, dry, at) });
        }
      }
    }
  }
  return rows;
}

console.log(`\n  JUMP_BUFFER ${JUMP_BUFFER} s = ${(JUMP_BUFFER / STEP).toFixed(1)} steps of ${(STEP * 1000).toFixed(2)} ms; the latest tap that can jump on landing goes down ${EXPECT_LAST} steps (${msOf(EXPECT_LAST)}) before the landing step`);

// ---- 0. the flights are what they say ------------------------------------------------------
console.log('\n  0. the flights');
let shortestFall = Infinity;
for (const [name, scen] of Object.entries(SCENARIOS)) {
  if (scen.unswept) continue;
  for (const speed of JUMP_SPEEDS) {
    const dry = flight(NEW, speed, scen);
    const takeoffEv = dry.log.find((e) => e.type === 'jump');
    // The earliest sweep tap goes down before step land - D_MAX: after the scenario's own
    // keys are up, and with him falling from the step before it (so the key it holds down
    // cannot hold off a jump cut) to the landing.
    const first = dry.land - D_MAX;
    const room = first > dry.lastOwn && first - 1 >= dry.fallFrom;
    // ...and after the spent flight's own air jump, which must really have fired.
    const spentOk = name !== 'spent' || dry.log.some((e) => e.type === 'airjump' && e.k < first);
    const ok = takeoffEv && dry.land > dry.takeoff && room && spentOk;
    shortestFall = Math.min(shortestFall, dry.land - dry.fallFrom);
    if (!ok || speed === 1 || speed === JUMP_SPEEDS[JUMP_SPEEDS.length - 1]) {
      check(ok, `${scen.what} at ${pct(speed)}: takes off at step ${dry.takeoff}, falls from step ${dry.fallFrom} and lands on floor ${dry.floor} at step ${dry.land}`
        + `${name === 'spent' ? ', its air jump spent before the earliest tap' : ''}: room for a tap ${D_MAX} steps before`,
        `its own keys up before step ${dry.lastOwn}`);
    }
  }
}
note(`the shortest last fall of them all: ${shortestFall} steps`);
{
  const r = flight(NEW, 1, SCENARIOS.runup);
  check(r.floor >= 1, `the running jump lands on a real ledge of the tower (floor ${r.floor}), not only the ground`);
}

// ---- 1. the sweep, before and after -----------------------------------------------------------
console.log('\n  1. the sweep: taps 0 to ' + D_MAX + ' steps before touchdown, no air jump to spend');
const after = sweep(NEW);
const before = sweep(OLDB);
const inside = (rows) => rows.filter((r) => r.d <= EXPECT_LAST);
const outside = (rows) => rows.filter((r) => r.d > EXPECT_LAST);
const eaten = (rows) => inside(rows).filter((r) => r.out !== 'landing');
const late = (rows) => outside(rows).filter((r) => r.out !== 'none');
note(`before (the old consumeJump call): ${eaten(before).length} of ${inside(before).length} taps inside the buffer eaten, ${late(before).length} of ${outside(before).length} past it jumped`);
note(`after:                             ${eaten(after).length} of ${inside(after).length} taps inside the buffer eaten, ${late(after).length} of ${outside(after).length} past it jumped`);
for (const name of ['hop', 'runup', 'locked', 'spent']) {
  for (const len of TAPS.map((t) => t.len)) {
    const a = after.filter((r) => r.name === name && r.len === len);
    const b = before.filter((r) => r.name === name && r.len === len);
    note(`  ${SCENARIOS[name].what.padEnd(40)} ${len === 1 ? 'flick' : 'tap  '}: eaten before ${String(eaten(b).length).padStart(3)}, after ${eaten(a).length} (of ${inside(a).length})`);
  }
}
check(eaten(before).length > 0, `the sweep sees the defect: the old code eats ${eaten(before).length} of ${inside(before).length} taps inside the buffer`);
{
  const bad = eaten(after);
  check(bad.length === 0, `every tap 0-${EXPECT_LAST} steps (0-${msOf(EXPECT_LAST)}) before touchdown jumps on the step after landing: ${inside(after).length} taps, 4 flights, ${JUMP_SPEEDS.length} speeds, a flick and a tap`,
    bad.slice(0, 4).map((r) => `${r.name} ${pct(r.speed)} len ${r.len} d ${r.d}: ${r.out}`).join('; '));
}
{
  const bad = late(after);
  check(bad.length === 0, `no tap ${EXPECT_LAST + 1}-${D_MAX} steps before touchdown jumps at all: ${outside(after).length} taps`,
    bad.slice(0, 4).map((r) => `${r.name} ${pct(r.speed)} len ${r.len} d ${r.d}: ${r.out}`).join('; '));
}

// ---- 2. the named timings -----------------------------------------------------------------
console.log('\n  2. the timings asked about');
for (const ms of [4, 20, 50, 80, 110, 150]) {
  const d = Math.round(ms / 1000 / STEP);
  const want = ms <= 120 ? 'landing' : 'none';
  const rows = after.filter((r) => r.d === d);
  const bad = rows.filter((r) => r.out !== want);
  const was = before.filter((r) => r.d === d && r.out !== want).length;
  check(rows.length > 0 && bad.length === 0,
    `a tap ${ms} ms (${d} steps) before touchdown ${want === 'landing' ? 'jumps on landing' : 'does not jump'}: ${rows.length - bad.length} of ${rows.length} flights`
    + ` (the old code: ${rows.length - was} of ${rows.length})`,
    bad.slice(0, 3).map((r) => `${r.name} ${pct(r.speed)} len ${r.len}: ${r.out}`).join('; '));
}

// ---- 3. the window is real time --------------------------------------------------------------
console.log('\n  3. the window in the world\'s seconds at every JUMP SPEED');
for (const speed of JUMP_SPEEDS) {
  const rows = after.filter((r) => r.speed === speed);
  let last = -1;
  for (let d = 0; d <= D_MAX; d++) if (rows.filter((r) => r.d === d).every((r) => r.out === 'landing')) last = d; else break;
  check(last === EXPECT_LAST, `at ${pct(speed)} the latest tap that jumps on landing goes down ${last} steps (${msOf(last)}) before touchdown: JUMP_BUFFER's ${EXPECT_LAST}, in the world's time`);
}

// ---- 4. an air jump still takes the tap -----------------------------------------------------
console.log('\n  4. with an air jump to spend, the tap takes it at once (unchanged)');
{
  let n = 0;
  const bad = [];
  for (const speed of JUMP_SPEEDS) {
    const dry = flight(NEW, speed, SCENARIOS.air);
    for (let d = 0; d <= EXPECT_LAST; d++) {
      const at = dry.land - d;
      const r = flight(NEW, speed, SCENARIOS.air, { at, len: 1 });
      const airs = r.log.filter((e) => e.type === 'airjump');
      const jumps = r.log.filter((e) => e.type === 'jump' && e.k > r.takeoff);
      n++;
      if (!(airs.length === 1 && airs[0].k === at && jumps.length === 0)) {
        bad.push(`${pct(speed)} d ${d}: air jumps at [${airs.map((e) => e.k)}], jumps after takeoff at [${jumps.map((e) => e.k)}]`);
      }
    }
  }
  check(bad.length === 0, `a tap 0-${EXPECT_LAST} steps before touchdown with an air jump banked and unlocked fires it in the step that first sees it, and nothing fires again on landing: ${n} taps`, bad.slice(0, 3).join('; '));
}

// ---- 5. the held chain ------------------------------------------------------------------------
console.log('\n  5. holding jump chains (unchanged)');
for (const speed of JUMP_SPEEDS) {
  const target = new FakeTarget();
  const input = new NEW.Input(target);
  const game = new NEW.Game(input);
  game.newRun(SEED, null, speed);
  const log = [];
  LOG = log;
  target.fire('keydown', 'Space');
  let k = 0;
  for (; k < 240 * 3 && game.state === NEW.STATE.PLAYING; k++) { K = k; game.step(STEP); }
  LOG = null;
  // A landing on the last step has no next step to re-fire in.
  const lands = log.filter((e) => e.type === 'land' && e.k + 1 < k);
  const refired = lands.filter((l) => log.some((e) => e.type === 'jump' && e.k === l.k + 1 && e.insta));
  check(lands.length >= 4 && refired.length === lands.length,
    `at ${pct(speed)} a held key re-fires on the step after every landing, as an instajump: ${refired.length} of ${lands.length} landings in 3 s`);
}

// ---- 6. the replay ----------------------------------------------------------------------------
console.log('\n  6. the replay records the press where the simulation took it');
for (const name of ['hopMid', 'runup']) {
  for (const speed of [1, JUMP_SPEEDS[JUMP_SPEEDS.length - 1]]) {
    const scen = SCENARIOS[name];
    const dry = flight(NEW, speed, scen);
    const d = 12;
    const at = dry.land - d;
    const r = flight(NEW, speed, scen, { at, len: 1 }, { track: true });
    const R = r.replay.records;
    const recorded = [];
    for (let j = 0; j < R.n; j++) if (R.kind[j] === NEW.Codec.K_INPUT && (R.code[j] & 8)) recorded.push(R.step[j]);
    const what = `${scen.what} at ${pct(speed)}, a tap ${d} steps before touchdown`;
    check(recorded.join() === r.taken.join() && recorded.includes(dry.land + 1) && !recorded.includes(at),
      `${what}: presses recorded at steps [${recorded}], the steps the simulation took one [${r.taken}] -- the landing jump (${dry.land + 1}), not the tap's own step (${at})`);
    const imp = NEW.Replay.importReplay(NEW.Replay.exportReplay(r.replay));
    const pb = imp.ok ? NEW.Replay.createPlayback(imp.replay) : { ok: false, error: imp.error };
    if (!check(pb.ok, `${what}: the file imports and plays (${pb.error || 'ok'})`)) continue;
    const Bk = pb.playback;
    let bad = null;
    for (let k = 0; k < r.states.length && !bad; k++) {
      Bk.step();
      const p = Bk.game.player;
      const s = [p.x, p.y, p.vx, p.vy, p.grounded, p.floor, p.momentum, p.airJumps];
      if (s.some((v, i) => !Object.is(v, r.states[k][i]))) bad = `step ${k}: [${s.map((v) => (typeof v === 'number' ? +v.toFixed(3) : v))}] against [${r.states[k].map((v) => (typeof v === 'number' ? +v.toFixed(3) : v))}]`;
    }
    const jumpedBack = Bk.game.player.floor;
    check(!bad && Bk.desync === null, `${what}: played back, the Duke is the trial's every one of ${r.states.length} steps, no desync (floor ${jumpedBack})`, bad || JSON.stringify(Bk.desync));
  }
}

// ---- 7. a press left waiting when the run ends ---------------------------------------------
// (Added by the verifier, 2026-09-28.) The buffer is counted down only in PLAYING steps, so a
// press that is WAITING for a landing when the run ends sits frozen through the fall, the
// scoreboard and the menu. Before Input.dropStaleJump it made him jump on the next run's first
// step when that run was started without a jump key (Enter, the pad's Start, the menu): a tap
// 1, 5 or 20 steps before the fire took him, every time -- the build before this change never
// did (the press was taken and dropped in the air). A press made AFTER the run's last step --
// the SPACE that starts the next run, a jump key on the pause screen -- is kept, as always.
console.log('\n  7. a press left waiting when a run ends does not carry into the next run');
/**
 * A standing hop, a tap in its fall (nothing to spend), `between` PLAYING steps, then the run
 * ends -- the fire's catch (`end: 'fire'`) or a quit from the pause (`end: 'quit'`, as main.js's
 * Q: the title) -- and a new run starts with `start` ('enter': no jump key; 'space'), the
 * recording finished first as startRun's replays.endRun() does, or left in front (`recLeft`).
 * `pauseKey` is a jump key pressed on the pause screen. Returns whether the press was still
 * waiting when the run ended and whether he jumped on the new run's first step.
 */
function endAndRestart(B, { between = 5, end = 'fire', start = 'enter', recLeft = false, pauseKey = null }) {
  const target = new FakeTarget();
  const input = new B.Input(target);
  const game = new B.Game(input);
  game.newRun(SEED, null, 1);
  const rec = B.Replay.startRecording(game);
  const log = [];
  LOG = log;
  K = 0;
  target.fire('keydown', 'Space');
  let up = false;
  for (let k = 0; k < 600 && game.state === B.STATE.PLAYING; k++) {
    const p = game.player;
    if (!up && k > 0 && p.vy <= 0) { target.fire('keyup', 'Space'); up = true; }
    if (up && p.vy < -150) break;
    game.step(STEP);
  }
  target.fire('keydown', 'KeyZ');
  target.fire('keyup', 'KeyZ');
  for (let i = 0; i < between; i++) game.step(STEP);
  const falling = !game.player.grounded && game.player.vy < 0;
  const waiting = input.jumpBuffer > 0;
  if (end === 'fire') {
    game.caughtByFloor();
    for (let i = 0; i < 240 * 3 && game.state === B.STATE.FALLING; i++) game.step(STEP);
    game.skipFall();
    for (let i = 0; i < 240; i++) game.step(STEP);
  } else {
    game.pause();
    for (let i = 0; i < 120; i++) game.step(STEP);
    if (pauseKey) { target.fire('keydown', pauseKey); target.fire('keyup', pauseKey); }
    game.state = B.STATE.PLAYING;   // main.js's Q: back to PLAYING, then toMenu()
    game.state = B.STATE.MENU;
    for (let i = 0; i < 240; i++) game.step(STEP);
  }
  if (!recLeft) rec.finish();
  if (start === 'space') target.fire('keydown', 'Space');
  game.newRun(SEED + 1, null, 1);
  const first = log.length;
  K = 0;
  game.step(STEP);
  if (start === 'space') target.fire('keyup', 'Space');
  LOG = null;
  const jumped = log.slice(first).some((e) => e.type === 'jump');
  return { falling, waiting, jumped };
}
for (const between of [1, 5, 20]) {
  const a = endAndRestart(NEW, { between });
  const b = endAndRestart(OLDB, { between });
  check(a.falling && a.waiting && !a.jumped && !b.jumped,
    `a tap ${between} steps before the fire takes him (still waiting: ${a.waiting}), a new run started with Enter: no jump on its first step (${a.jumped ? 'JUMPED' : 'none'}; the old code: ${b.jumped ? 'jumped' : 'none'})`);
}
{
  const a = endAndRestart(NEW, { between: 5, recLeft: true });
  check(a.waiting && !a.jumped, `...and with the last run's recorder never finished, still in front of the input: no jump (${a.jumped ? 'JUMPED' : 'none'})`);
  const q = endAndRestart(NEW, { between: 5, end: 'quit' });
  check(q.waiting && !q.jumped, `a tap 5 steps before a pause, quit to the title, a new run with Enter: no jump (${q.jumped ? 'JUMPED' : 'none'})`);
  const s = endAndRestart(NEW, { between: 5, start: 'space' });
  const so = endAndRestart(OLDB, { between: 5, start: 'space' });
  check(s.jumped && so.jumped, `a new run started with SPACE still jumps on its first step, the start key's own press (unchanged: the old code ${so.jumped ? 'jumped' : 'did not'})`);
  const pk = endAndRestart(NEW, { between: 5, end: 'quit', pauseKey: 'ArrowUp' });
  const pko = endAndRestart(OLDB, { between: 5, end: 'quit', pauseKey: 'ArrowUp' });
  check(pk.jumped === pko.jumped, `a jump key pressed ON the pause screen, then quit and Enter: as before (${pk.jumped ? 'jumps' : 'no jump'}; the old code ${pko.jumped ? 'jumps' : 'no jump'})`);
}
{
  // Not a new run: a press waiting through a PAUSE is kept (resumed with Escape, not a jump
  // key) and fires on the landing as if the pause had not happened.
  const target = new FakeTarget();
  const input = new NEW.Input(target);
  const game = new NEW.Game(input);
  game.newRun(SEED, null, 1);
  const log = [];
  LOG = log;
  target.fire('keydown', 'Space');
  let up = false, k = 0, tapped = -1, landAt = -1;
  for (; k < 600 && game.state !== NEW.STATE.DEAD; k++) {
    K = k;
    const p = game.player;
    if (!up && k > 0 && p.vy <= 0) { target.fire('keyup', 'Space'); up = true; }
    if (up && tapped < 0 && p.vy < -300) {
      target.fire('keydown', 'KeyZ'); target.fire('keyup', 'KeyZ'); tapped = k;
      game.pause();
      for (let i = 0; i < 240; i++) game.step(STEP);
      game.resume();
    }
    game.step(STEP);
    if (landAt < 0 && tapped >= 0 && log.some((e) => e.type === 'land' && e.k === k)) landAt = k;
    if (landAt >= 0 && k > landAt + 2) break;
  }
  LOG = null;
  const fired = log.some((e) => e.type === 'jump' && e.k === landAt + 1);
  check(tapped >= 0 && landAt >= 0 && landAt - tapped <= EXPECT_LAST && fired,
    `a tap ${landAt - tapped} steps before touchdown, a second's pause between: it still jumps on landing (a pause is not a new run)`);
}

console.log(`\n  ${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
