// The replay engine (src/game/replay.js) against the real simulation.
//
// A replay is only worth having if playing it back IS the run, so the core checks here do
// not compare checksums or results: they run the original and the playback side by side
// and compare every value of the simulated state -- every field of the player, the tower,
// the combo, the companions, the rising floor, the death's pieces -- at every step to the
// last step of the fall, and the particle pool (the cosmetic stream) every 32 steps.
//
//   1. The attract bot, recorded to its death on several seeds (one on a Game that had
//      already played a run), exported to text, imported, played back: identical every
//      step. The recorder itself changes nothing (the same run with and without it).
//   2. A human-like session through the real Input class: keys pressed and released
//      between steps, jumps held and tapped, key repeats, a blur, pauses, the OPTIONS
//      screen mid-run with the companion and particle options changed -- once, or with
//      an arrow key HELD on the row (a change every 8 steps, as key repeats come), or
//      right before leaving, or after the screen has been open past REPLAY_COSMETIC_CAP:
//      imported and played back identically, particles included.
//  2b. The same screen scripted on a bot run, each shape Recorder.interlude writes staged
//      where it has something to get wrong, compared every step, every particle.
//   3. One flipped input bit: the first checksum that disagrees is the first one at or
//      after the step the state really diverged -- and a flip that changes nothing
//      reports nothing.
//   4. The fingerprint: a changed constant (GRAVITY, a jump's, a generator's, the combo's
//      step, the splat's cut), a changed rule in the generator, a changed rule in the
//      physics, COYOTE, a companion's tuning, the arena's widths and a bumped SIM_VERSION
//      each refuse the replay; a cosmetic change (more dust, another death line) does not,
//      nor does a render-only number (a GHOST_ alpha, BOARD_WARM_MS, IMPACT_FADE, and all
//      of them at once), and the replay still plays without a desync in that build. Each is
//      a patched copy of src/ in a temp folder.
//  4a. Which constants.js numbers the fingerprint holds, read from the source: every module
//      game.js reaches is read for what it imports from constants.js, and the fingerprint
//      must hold exactly the numbers the step reads -- none the renderer alone reads, none
//      the step reads left out, and no constant nobody classified. A drawing module the
//      step reaches (sprites.js) counts only for the numbers the step takes from it.
//   5. The file: a byte-exact round trip; the ghost within half a quantum of where he
//      was, in the frame Renderer.frameFor draws, and in the right poses when the sprite
//      sheet has renamed or lost one; fuzzed, truncated, garbage and hand-built hostile
//      files refused, cleanly and fast (the time is asserted: a 50 MB paste, the slowest
//      refusal); a budgeted seek that keeps its budget through a file of full menu visits;
//      chat-wrapped text accepted.
//   6. The cosmetic streams: two runs of one seed in one process, one on a Game that had
//      already played, throw the same particles and say the same lines -- with
//      Math.random, performance.now and Date.now made to THROW while they step.
//   7. Seeking: a restored copy of the game plays on exactly as the original; menu steps
//      past REPLAY_COSMETIC_CAP change nothing. Timings and sizes are printed.
//   8. The store: last run + ten best + pinned, ties, the budget, quota errors that never
//      cost the best run, a save refused for the quota that costs nothing at all, a crash
//      between a save's two writes, a corrupt index, a replay that would not load back is
//      not kept, and the list says which ones this build plays.
//   9. The instant replay of a game wearing main.js's hooks (a wrapped handleEvents, the
//      on* callbacks): restored from the recorder's copies of the live game, played to the
//      scoreboard as the straight playback is, without calling one of the live hooks.
//  10. A recording that reaches its length limit stops there ('cut') and plays back.
//
// Every assertion was seen to fail on a deliberately broken build: run with
// --mutant=NAME (see MUTANTS below) and it patches a copy of src/ and must FAIL. The
// comment beside each mutant records which check caught it when this was written.
//
//   node tools/test-replay.mjs                 # ~22 s
//   node tools/test-replay.mjs --mutant=NAME   # must exit 1
//   node tools/test-replay.mjs --mutants       # every mutant in turn, one process each; each must fail

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
globalThis.window = globalThis.window || { addEventListener() {} };
const realNow = performance.now.bind(performance);
const T_START = realNow();

// ---- mutants: [file, from, to] patches applied to a copy of src/ ------------------------
const MUTANTS = {
  // caught by the ten-minute replay's checksums (a desync 8 s in) and by 1 (the state differs the step a press is dropped)
  'press-dropped': [['game/replay.js', 'if (this._press && !this._took) { this._took = true; return true; }', 'if (false) { return true; }']],
  // caught by the ten-minute replay (a desync 1 s in) and 1b (the recorder feeds the simulation something other than the input)
  'recorder-changes-sim': [['game/replay.js', 'get axis() { return this.open ? this._axis : this.inner.axis; }', 'get axis() { return this.open ? this._axis * 0.999 : this.inner.axis; }']],
  // caught by 2 (the idle clock after a resume)
  'no-idle-event': [['game/replay.js', 'if (g.idleFor !== this.wIdle) this.push(K_IDLE, 0, g.idleFor);   // Game.resume', '']],
  // caught by 2 (the particles after a menu visit)
  'no-cosmetic-steps': [['game/replay.js', 'for (let n = R.val[j]; n > 0; n--) g.step(STEP);', '']],
  // caught by 2 (a lowered PARTICLES setting before a menu step: the pool's kills are missing)
  'no-pre-budget': [['game/replay.js', 'if (this.preMin !== null) { this.push(K_BUDGET, 0, this.preMin); set = this.preMin; }', '']],
  // caught by 2 and 2b by the SHAPE of the records only: the kills applied after the menu steps leave the pool's counts
  // stale where the run's were fresh, and those counts only decide a trail piece when the pool sits on a cap -- in every
  // staged run the particles came out the same. The shape check is what holds the order Recorder.interlude documents.
  'pre-budget-late': [['game/replay.js', '    if (this.preMin !== null) { this.push(K_BUDGET, 0, this.preMin); set = this.preMin; }\n    if (this.menu > 0) this.push(K_COSMETIC, 0, this.menu);',
    '    if (this.menu > 0) this.push(K_COSMETIC, 0, this.menu);\n    if (this.preMin !== null) { this.push(K_BUDGET, 0, this.preMin); set = this.preMin; }']],
  // caught by 2 and 2b by shape, and by 2b's particles (a setting lowered and raised after the screen passed the cap: the ring cursor is not reset)
  'no-post-min': [['game/replay.js', 'if (this.postMin !== null && this.postMin !== b) { this.push(K_BUDGET, 0, this.postMin); set = this.postMin; }', '']],
  // caught by 2 and 2b by shape only, like pre-budget-late (the menu steps replayed after the setting's last change)
  'menu-steps-last': [['game/replay.js', '    if (this.menu > 0) this.push(K_COSMETIC, 0, this.menu);\n', ''],
    ['game/replay.js', '    if (b !== set) this.push(K_BUDGET, 0, b);\n', '    if (b !== set) this.push(K_BUDGET, 0, b);\n    if (this.menu > 0) this.push(K_COSMETIC, 0, this.menu);\n']],
  // caught by 2 (the decoder holding a file to one BUDGET a step refuses the player's own run -- the old failure)
  'decoder-strict': [['game/replaycodec.js', 'const PER_STEP = [1, 1, 1, 3, 1, 16];', 'const PER_STEP = [1, 1, 1, 1, 1, 16];']],
  // caught by 3 (no desync reported at all)
  'verify-blind': [['game/replay.js', '    if (this.desync) return;\n    const r = this.replay', '    return;\n    const r = this.replay']],
  // caught by 3 (reported, but at the end rather than the second it happened)
  'verify-late': [['game/replay.js', 'if (k % ce === 0 && k / ce <= r.checks.length && simChecksum(g) !== r.checks[k / ce - 1]) bad = true;', '']],
  // caught by 4 (a changed GRAVITY leaves constHash alone)
  'fp-no-constants': [['game/replay.js', "  if (typeof v === 'number') return fold(h, v);", "  if (typeof v === 'number') return h;"]],
  // caught by 4 (a changed rule in the generator or the physics is accepted)
  'fp-no-probe': [['game/replay.js', '  h = probeClimb(h);\n  return mix32(h);', '  return 1;']],
  // caught by 4 (a companion's tuning is accepted, though they generate floors)
  'fp-no-companions': [['game/replay.js', "  ['companions', CompanionTables, () => true],\n", '']],
  // caught by 4 (COYOTE lives in input.js, outside constants.js)
  'fp-no-coyote': [['game/replay.js', "  h = foldStr(h, 'input.COYOTE'); h = fold(h, COYOTE);\n", '']],
  // caught by 5 (the ghost's pose disagrees with Renderer.frameFor)
  'ghost-frame': [['game/replay.js', "if (p.vy > 30) return fast ? 'jumpFast' : 'jump';", "if (p.vy > 0) return fast ? 'jumpFast' : 'jump';"]],
  // caught by 5 (a ghost from a sheet with other poses races in names this build cannot draw)
  'ghost-no-fallback': [['game/replay.js', 'if (!t) { t = ghost.names.map(nearestPose); DRAWN.set(ghost, t); }', 'if (!t) { t = ghost.names.slice(); DRAWN.set(ghost, t); }']],
  // caught by 5 (a damaged text is accepted)
  'codec-no-crc': [['game/replaycodec.js', "if (crc32(b, end) !== want) throw new Error('the replay is damaged (its checksum does not match)');", '']],
  // caught by 5 (a hostile file with two inputs on one step is accepted)
  'codec-dup-input': [['game/replaycodec.js', 'const PER_STEP = [1, 1, 1, 3, 1, 16];', 'const PER_STEP = [2, 1, 1, 3, 1, 16];']],
  // caught by 5 (a file asking its playback for a full menu visit on every step is accepted)
  'codec-no-menu-cap': [['game/replaycodec.js', "      if (menuSteps > menuCap) throw new Error('the replay spends longer on menus than a run could');\n", '']],
  // caught by 5 (a pose byte past the file's own names is accepted)
  'codec-pose-range': [['game/replaycodec.js', '(p & 0x7f) >= nn)', '(p & 0x7f) >= 128)']],
  // caught by the copies of the game (a closure in the state), 1, 2 and 6 (Math.random, made to throw, is called)
  'unseeded-particles': [['game/game.js', '    this.particles.rng = this.fx;\n', '    this.particles.rng = { next: () => Math.random() };\n']],
  // caught by 1 (the taunt clock differs between two runs of one seed) and 6 (performance.now, made to throw, is called)
  'wallclock-taunt': [['game/game.js', '      if (this.elapsed - this.lastTaunt > 4) {\n        this.lastTaunt = this.elapsed;', '      if (performance.now() - this.lastTaunt > 4000) {\n        this.lastTaunt = performance.now();']],
  // caught by 1 and 6 (a Game that played a run before throws its sparks from other slots)
  'no-clear-reset': [['render/particles.js', '    this.cursor = 0; this.shedCursor = 0; this.shedClock = 0;\n', '']],
  // (There was a no-fallfx-reset mutant here: the fall's debris clock, left from the death
  // before. The cleared fall sheds no debris, so the clock and its reset are gone, and the
  // mutant went uncaught because there was nothing left for it to break.)
  // caught by 1 (the bot's look-ahead generates floors the playback generates later, wider)
  'no-ensure-event': [['game/replay.js', 'for (; d > 0; d -= ENSURE_MAX) this.push(K_ENSURE, 0, Math.min(d, ENSURE_MAX));', '']],
  // caught by 7 (restored copies built with keyed stores: the live game slows down after)
  'snapshot-keyed-stores': [
    ['game/snapshot.js', '    c = { ...v };\n    const proto = Object.getPrototypeOf(v);\n    if (proto !== Object.prototype) Object.setPrototypeOf(c, proto);\n    memo.set(v, c);',
      '    const proto = Object.getPrototypeOf(v);\n    c = Object.create(proto);\n    memo.set(v, c);'],
    ['game/snapshot.js', "      if (x === null || (typeof x !== 'object' && typeof x !== 'function')) continue;",
      "      if (x === null || (typeof x !== 'object' && typeof x !== 'function')) { c[k] = x; continue; }"],
  ],
  // caught by the copies of the game and 7 (a closure in the state: no keyframes, so no fast seek)
  'rng-closure': [['core/rng.js', '    this.a = this.seed;\n  }\n  next() {', '    this.a = this.seed;\n    const m = mulberry32(this.seed);\n    this.next = () => m();\n  }\n  nextOld() {']],
  // caught by 7 (the restored copy shares its arrays with the keyframe)
  'snapshot-shares-arrays': [['game/snapshot.js', '      c = v.slice();\n      memo.set(v, c);\n      return c;', '      memo.set(v, v);\n      return v;']],
  // caught by 8 (a quota error costs the best run)
  'store-evicts-best': [['game/replaystore.js', '    if (best.length) protect.add(best[0].id);\n', ''],
    ['game/replaystore.js', "const spare = p.evictable.filter((x) => x !== id && x !== bestBefore);", 'const spare = [...p.keep].filter((x) => x !== id);']],
  // caught by 8 (a text that would not load is kept)
  'store-no-verify': [['game/replaystore.js', '    if (!back || !back.ok) {', '    if (false) {']],
  // caught by 9 (a restored copy of the live game has no handleEvents: the instant replay throws)
  'hook-shadows-method': [['game/snapshot.js', "if (typeof own === 'function') { c[k] = own; continue; }", "if (typeof own === 'function') { c[k] = undefined; continue; }"]],
  // caught by 9 (a restored copy keeps the live game's hooks: the playback plays the live sounds and commits its stats)
  'hook-copied': [['game/snapshot.js', "        if (typeof own === 'function') { c[k] = own; continue; }\n        if (HOOK.test(k)) { c[k] = undefined; continue; }",
    "        if (typeof own === 'function' || HOOK.test(k)) { c[k] = x; continue; }"]],
  // caught by 9 (render/gamesounds.js wraps game.step too; a copy that knows only the hooks
  // by name throws on it, the recorder keeps no copies, and the instant replay restores none)
  'wrapped-step-throws': [['game/snapshot.js', "        if (typeof own === 'function') { c[k] = own; continue; }\n",
    "        if (typeof own === 'function' && HOOK.test(k)) { c[k] = own; continue; }\n"]],
  // caught by 10 (a recording past its limit goes on, and writes a file the decoder refuses)
  'no-cut': [['game/replay.js', "    else if (this.k >= this.maxSteps) this.seal('cut');\n", '']],
  // The ones below were added by the verification pass: each is a way the engine could break
  // that no mutant above tried, and the last four were not caught until checks were added.
  // caught by 2 (the companions' movement after the options screen)
  'no-move-apply': [['game/replay.js', 'case K_MOVE: g.companions.movement = MOVES[R.val[j]]; break;', 'case K_MOVE: break;']],
  // caught by 2 (the particle budget and the cursors it resets)
  'no-budget-apply': [['game/replay.js', 'case K_BUDGET: if (this.budget === null) g.particles.setBudget(R.val[j]); break;', 'case K_BUDGET: break;']],
  // caught by the ten-minute replay's seeks, 7 and 9 (a restore forgets the axis and jump held going into it)
  'seek-no-levels': [['game/replay.js', 'if (R.kind[j] === K_INPUT) { this._axis = R.val[j]; this._held = (R.code[j] & 4) !== 0; break; }', 'if (R.kind[j] === K_INPUT) { break; }']],
  // caught by the ten-minute replay's seeks, 7 and 9 (a restore leaves the record cursor where it was)
  'restore-no-cursor': [['game/replay.js', '    this.input.seekTo(kf.k, this.replay.records);\n', '']],
  // caught by 4 (the particles drawn from the SIMULATION's stream: a cosmetic change moves the tower, so the fingerprint and the replay)
  'particles-on-sim-stream': [['game/game.js', '    this.tower.ensure(24);\n', '    this.tower.ensure(24);\n    this.particles.rng = this.tower.rng;\n']],
  // caught by 7 and 9 (a copy of the live game filed under the step before it was taken)
  'keyframe-wrong-step': [['game/replay.js', 'this.live.push({ step: this.k, game: snapshot(this.game) });', 'this.live.push({ step: this.k - 1, game: snapshot(this.game) });']],
  // caught by 8 (a pinned best evicted for room)
  'pins-evictable': [['game/replaystore.js', 'if (!protect.has(best[i].id) && best[i].id !== ix.last) evictable.push(best[i].id);', 'if (best[i].id !== ix.last) evictable.push(best[i].id);']],
  // caught by 5 (a 50 MB text decoded to the end before it was refused)
  'import-no-length-cap': [['game/replaycodec.js', "if (text.length > REPLAY_MAX_TEXT) return { ok: false, error: 'this is too long to be a replay' };", '']],
  // caught by 5 (a file asking for more tower than a run could climb, one legal record at a time)
  'no-ensure-total-cap': [['game/replaycodec.js', 'if (v < 1 || ensured > ensureCap)', 'if (v < 1)']],
  // caught by 5 (a budgeted seek through full menu visits reads the clock too rarely)
  'seek-budget-ignores-menus': [['game/replay.js', '          this.work += R.val[j];\n', '']],
  // caught by 8 (a save refused for the quota keeps the candidates it deleted for room deleted)
  'store-no-putback': [['game/replaystore.js', '      for (const [x, t] of held) {', '      for (const [x, t] of []) {']],
  // The fingerprint's classification of constants.js (4a and 4's render-only builds).
  // caught by 4a (numbers no module of the step reads are fingerprinted) and 4 (a GHOST_ alpha, BOARD_WARM_MS,
  // IMPACT_FADE and the render-only numbers all at once each move it): the bug this classification fixed
  'fp-hashes-drawn': [['game/replay.js', "const simulated = (k) => !k.startsWith('REPLAY_') && k !== 'SIM_VERSION' && !LEFT_OUT.has(k);",
    "const simulated = (k) => !k.startsWith('REPLAY_') && k !== 'SIM_VERSION';"]],
  // caught by 4a (a number player.js reads is listed as drawn only) and 4 (JUMP_V0_MIN changed is not refused)
  'fp-drops-sim': [['game/replay.js', "  'SW', 'SH', 'FALL_CLEAR',\n", "  'SW', 'SH', 'FALL_CLEAR', 'JUMP_V0_MIN',\n"]],
  // caught by 4a (a constant added to constants.js that nothing in the step reads, and nobody classified)
  'unclassified-constant': [['game/constants.js', 'export const GHOST_JUMP_SLACK = 2;',
    'export const GHOST_JUMP_SLACK = 2;\nexport const GHOST_TINT = 0.5;']],
  // caught by 4a (the step starts reading a number listed as drawn only)
  'step-reads-drawn': [['game/game.js', '  COMBO_GROUND_GRACE, ZOOM_EASE, ZOOM_SNAP, CALLOUT_LIFE, COMBO_STEP_BURST,\n} from',
    '  COMBO_GROUND_GRACE, ZOOM_EASE, ZOOM_SNAP, CALLOUT_LIFE, COMBO_STEP_BURST, BURN_T,\n} from']],
  // caught by 4a (the walk follows game.js into a drawing module it has no row for in STEP_READS_FROM_RENDER:
  // whether the afterimage's numbers are now the step's is a decision nobody made)
  'step-imports-renderer': [['game/game.js', "import { Particles } from '../render/particles.js';\n",
    "import { Particles } from '../render/particles.js';\nimport '../render/afterimage.js';\n"]],
  // caught by 4a (a number only the Duke's DRAWING imports, from sprites.js, which the step reaches for the
  // splat's pieces: it went into the fingerprint silently until 4a knew what the step takes from sprites.js)
  'sprites-draw-number': [['game/constants.js', 'export const GHOST_JUMP_SLACK = 2;', 'export const GHOST_JUMP_SLACK = 2;\nexport const GLINT_TEST = 0.5;'],
    ['render/sprites.js', "import { PX, CUT_OUTLINE_V, LIMB_MATCH, PLATE_MIN, PLATE_STEEL } from '../game/constants.js';",
      "import { PX, CUT_OUTLINE_V, LIMB_MATCH, PLATE_MIN, PLATE_STEEL, GLINT_TEST } from '../game/constants.js';"]],
  // caught by 4 (the combo step's spark count reaches the simulation: the left-out build desyncs the bot's replay,
  // and its run parts from this build's in lockstep). Only past floor 300, beyond the probe's ten seconds: fed from
  // the first combo step the probe moves too, and the lockstep was never reached
  'cosmetic-feeds-sim': [['game/game.js', "    this.particles.burst(p.x, p.y + 14, COMBO_STEP_BURST, [...cols, '#ffffff'], 1.1);\n",
    "    this.particles.burst(p.x, p.y + 14, COMBO_STEP_BURST, [...cols, '#ffffff'], 1.1);\n    if (p.floor > 300) p.vx += (COMBO_STEP_BURST - 28) * 0.1;\n"]],
};

if (process.argv.includes('--mutants')) {
  // Each mutant in its own process, one after another, never two at once.
  const { spawnSync } = await import('node:child_process');
  const self = fileURLToPath(import.meta.url);
  const bad = [];
  for (const name of Object.keys(MUTANTS)) {
    const t = performance.now();
    const r = spawnSync(process.execPath, [self, `--mutant=${name}`], { encoding: 'utf8' });
    const first = (r.stdout || '').split('\n').find((l) => /^\s*FAIL /.test(l)) || (r.stderr || '').split('\n').find((l) => /Error/.test(l)) || '';
    const verdict = r.status === 1 ? 'caught' : r.status === 3 ? 'DID NOT APPLY' : 'SURVIVED';
    if (r.status !== 1) bad.push(name);
    console.log(`  ${name}: ${verdict} (${((performance.now() - t) / 1000).toFixed(1)} s)${first ? ' --' + first.replace(/^\s*FAIL/, '') : ''}`);
  }
  console.log(bad.length ? `\n  ${bad.length} mutant(s) not caught: ${bad.join(', ')}` : `\n  all ${Object.keys(MUTANTS).length} mutants caught`);
  process.exit(bad.length ? 1 : 0);
}

const MUTANT = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
const tmpDirs = [];
process.on('exit', () => { for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ } } });

let SRC = path.join(REPO, 'src');
function copySrc(tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `dvr-${tag}-`));
  fs.cpSync(SRC, d, { recursive: true });
  tmpDirs.push(d);
  return d;
}
function patch(dir, file, from, to) {
  const p = path.join(dir, file);
  const t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  if (!t.includes(from)) throw new Error(`patch: not found in ${file}: ${from.slice(0, 60)}`);
  fs.writeFileSync(p, t.replace(from, to));
}
const load = (dir, rel) => import(pathToFileURL(path.join(dir, rel)).href);

if (MUTANT) {
  const m = MUTANTS[MUTANT];
  if (!m) { console.log(`unknown mutant '${MUTANT}'; one of: ${Object.keys(MUTANTS).join(', ')}`); process.exit(2); }
  const d = copySrc('mutant');
  try {
    for (const [f, a, b] of m) patch(d, f, a, b);
  } catch (e) {
    // Not a failure of the suite: the mutant no longer matches the code, so it tests nothing.
    console.log(`  MUTANT ${MUTANT} DID NOT APPLY: ${e.message}`);
    process.exit(3);
  }
  SRC = d;
  console.log(`  MUTANT ${MUTANT}: this run must FAIL`);
}

const { Game, STATE } = await load(SRC, 'game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS } = await load(SRC, 'game/autoplay.js');
const { Input } = await load(SRC, 'core/input.js');
const { STEP } = await load(SRC, 'core/loop.js');
const { mulberry32, Rng } = await load(SRC, 'core/rng.js');
const C = await load(SRC, 'game/constants.js');
const Replay = await load(SRC, 'game/replay.js');
const Codec = await load(SRC, 'game/replaycodec.js');
const Store = await load(SRC, 'game/replaystore.js');
const { snapshot } = await load(SRC, 'game/snapshot.js');
const { Particles } = await load(SRC, 'render/particles.js');
const { Renderer } = await load(SRC, 'render/renderer.js');
const { NAMES } = await load(SRC, 'render/sprites.js');

// ---- reporting --------------------------------------------------------------------
let failed = 0;
const notes = [];
function ok(cond, msg) {
  if (cond) return true;
  failed++;
  console.log(`  FAIL ${msg}`);
  return false;
}
function note(line) { notes.push(line); console.log('  ' + line); }
const ms = (t) => `${t.toFixed(1)} ms`;

// ---- comparing two games, every value --------------------------------------------
// Fields a Game keeps from its last death until die() writes every one of them again;
// nothing reads them before that. A Game that has died before carries them into its next
// run, so against a fresh one they are compared only once this run has died too.
const DEATH_FIELDS = new Set(['deathLine', 'dangerAtDeath', 'fallIntensity', 'deathT', 'hudHeld',
  'impacted', 'gibs', 'blood', 'bloodPool', 'spatter', 'impactT', 'tumble', 'gibSeed', 'splat',
  'pitY', 'fallFrom', 'severity']);

/**
 * The first path at which two games differ, or null. The whole object graph is walked
 * in parallel: numbers by Object.is, objects by type, keys and identity (an object
 * shared in one must be shared the same way in the other). Skipped: the input (one is a
 * recorder, the other a ReplayInput), `resumeState` (where the pause menu returns to; a
 * playback never pauses), the UI's hooks (main.js's on* callbacks and handleEvents
 * wrapper, which a copy of the live game carries as the class's own method or nothing),
 * the DEATH_FIELDS while a `dirty` game has not died yet, and the particle pool's arrays
 * unless `particles` is set -- then only live slots are compared, since a slot's stale
 * values after it dies mean nothing.
 */
const HOOKS = /^(on[A-Z]\w*|handleEvents)$/;
function diffGames(a, b, particles, dirty = false) {
  const skip = (k) => k === 'input' || k === 'resumeState' || HOOKS.test(k)
    || (dirty && a.state === STATE.PLAYING && DEATH_FIELDS.has(k));
  const extraOk = false;
  const seen = new Map();
  const walk = (x, y) => {
    if (x === y) return null;
    const t = typeof x;
    if (t !== typeof y) return ` ${String(x)} vs ${String(y)}`;
    if (t === 'number') return Object.is(x, y) || (x !== x && y !== y) ? null : ` ${x} vs ${y}`;
    if (t === 'function') return null;
    if (t !== 'object' || x === null || y === null) return ` ${String(x)} vs ${String(y)}`;
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return ' (different types)';
    if (seen.has(x)) return seen.get(x) === y ? null : ' (shared differently)';
    seen.set(x, y);
    if (x instanceof Particles) return pool(x, y);
    if (ArrayBuffer.isView(x)) {
      if (x.length !== y.length) return ' (length)';
      for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i]) && !(x[i] !== x[i] && y[i] !== y[i])) return `[${i}] ${x[i]} vs ${y[i]}`;
      return null;
    }
    if (Array.isArray(x)) {
      if (x.length !== y.length) return ` (length ${x.length} vs ${y.length})`;
      for (let i = 0; i < x.length; i++) { const r = walk(x[i], y[i]); if (r) return `[${i}]${r}`; }
      return null;
    }
    if (x instanceof Map) {
      if (x.size !== y.size) return ` (size ${x.size} vs ${y.size})`;
      const ix = x.entries(), iy = y.entries();
      for (;;) {
        const p = ix.next(), q = iy.next();
        if (p.done) return null;
        if (!Object.is(p.value[0], q.value[0])) return ` (key ${p.value[0]} vs ${q.value[0]})`;
        const r = walk(p.value[1], q.value[1]);
        if (r) return `{${p.value[0]}}${r}`;
      }
    }
    const top = x === a;
    for (const k of Object.keys(x)) {
      if (top && skip(k)) continue;
      if (!(k in y)) { if (extraOk) continue; return `.${k} (missing)`; }
      const r = walk(x[k], y[k]);
      if (r) return `.${k}${r}`;
    }
    for (const k of Object.keys(y)) if (!(top && skip(k)) && !(k in x)) return `.${k} (extra)`;
    return null;
  };
  const SCALARS = ['n', 'cursor', 'shedCursor', 'shedAcc', 'shedClock', 'twinkles', 'others', 'budget', 'twinkleCap', 'shedRoom'];
  const ARRAYS = ['x', 'y', 'vx', 'vy', 'life', 'maxLife', 'size', 'grav', 'rot', 'kind', 'colour', 'shape', 'ramp'];
  const pool = (x, y) => {
    for (const k of SCALARS) if (!Object.is(x[k], y[k])) return `.${k} ${x[k]} vs ${y[k]}`;
    const r = walk(x.shedDir, y.shedDir) || walk(x.rng, y.rng);
    if (r) return r;
    if (!particles) return null;
    for (let i = 0; i < x.slots; i++) {
      if (x.alive[i] !== y.alive[i]) return `.alive[${i}]`;
      if (!x.alive[i]) continue;
      for (const k of ARRAYS) if (!Object.is(x[k][i], y[k][i])) return `.${k}[${i}] ${x[k][i]} vs ${y[k][i]}`;
    }
    return null;
  };
  const r = walk(a, b);
  return r ? 'game' + r : null;
}

// ---- drivers ----------------------------------------------------------------------
// Every section below wants a bot run that ends on the scoreboard, as the bot's did inside
// 200 s until 2026-09-29. The bot rebuilt that day outruns the fire for ten minutes on every
// tower tried, so his runs here are made mortal: he climbs for MORTAL steps, then hops in
// place -- jump held, no stick, through the same AutoInput -- until the fire takes him. It is
// still a real run of real input, recorded like any other; only the ten-minute run (timeRun)
// keeps him climbing.
const MORTAL = 240 * 60;
function mortal(bot, input, climb = MORTAL) {
  let n = 0;
  return {
    step(game, dt) {
      if (n++ < climb) { bot.step(game, dt); return; }
      input.wantAxis = 0; input.jumpHeld = true; input.wantJump = false;
    },
  };
}

function botGame(seed, { demo = false, dirty = false, climb = MORTAL } = {}) {
  const input = new AutoInput();
  const game = new Game(input);
  if (dirty) {
    // A whole run and its death first, on another seed and another bot.
    const bot0 = mortal(new AutoPlayer(input), input);
    game.newRun((seed ^ 0x5a5a5a5a) >>> 0);
    for (let n = 0; n < 240 * 200 && game.state !== STATE.DEAD; n++) {
      if (game.state === STATE.PLAYING) bot0.step(game, STEP);
      game.step(STEP);
    }
    for (let n = 0; n < 300; n++) game.step(STEP);
  }
  game.demo = demo;
  game.newRun(seed);
  return { input, game, bot: mortal(new AutoPlayer(input), input, climb) };
}

function recordBot(seed, opts = {}, maxSteps = 240 * 200) {
  const { game, bot } = botGame(seed, opts);
  const rec = Replay.startRecording(game);
  for (let n = 0; n < maxSteps && game.state === STATE.PLAYING; n++) { bot.step(game, STEP); game.step(STEP); }
  return rec.finish();
}

const JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'];
const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'];
class FakeTarget {
  constructor() { this.h = new Map(); }
  addEventListener(type, fn) { if (!this.h.has(type)) this.h.set(type, []); this.h.get(type).push(fn); }
  fire(type, code = '', repeat = false) { for (const fn of this.h.get(type) || []) fn({ code, repeat, preventDefault() {} }); }
}
const BUDGETS = [220, 520, 900];   // settings.js's PARTICLE_BUDGET, LOW to HIGH
/** One press on the options screen: the COMPANIONS row, the PARTICLES row cycling, or both. */
function changeSetting(game, r, row = null) {
  const x = row === 'companions' ? 0.1 : row === 'particles' ? 0.9 : r();
  if (x < 0.66) game.companions.movement = game.companions.movement === 'hop' ? 'glide' : 'hop';
  if (x > 0.33) {
    const i = BUDGETS.indexOf(game.particles.budget);
    game.particles.setBudget(BUDGETS[(i + (r() < 0.5 ? 1 : 2)) % 3]);
  }
}

/**
 * The options screen, open mid-run for `m` steps. Half the time an arrow key is HELD on a
 * row, and the screen takes key repeats: a change every 8 steps (30 a second at 240 Hz).
 * Now and then it stays open past REPLAY_COSMETIC_CAP with the key still held, and half
 * the time one more change lands with no step after it (the change and Escape in one
 * frame).
 */
function* optionsScreen(game, r, m) {
  const from = game.state;
  game.state = STATE.OPTIONS;
  const held = r() < 0.5;
  const n = r() < 0.12 ? C.REPLAY_COSMETIC_CAP + 1 + Math.floor(r() * 600) : m;
  const row = r() < 0.75 ? 'particles' : 'companions';
  for (let i = 0; i < n; i++) {
    if (held ? i % 8 === 3 : i === (n >> 1)) changeSetting(game, r, held ? row : null);
    game.step(STEP);
    yield;
  }
  if (r() < 0.5) changeSetting(game, r);
  game.state = from;
}

/**
 * A human at a keyboard, from a seed: yields after every game.step. Keys land between
 * steps in bursts of one to four steps (a 60 to 240 Hz display), a direction held for a
 * while, jumps tapped and held, repeats and a second jump key while one is held, a blur,
 * pauses (standing still, so the resume has an idle clock to zero), and the OPTIONS
 * screen mid-run -- from the pause menu or straight from play -- with the companion
 * movement or the particle setting changed while it is up.
 */
function* human(game, target, seed) {
  const r = mulberry32(seed);
  const down = new Set();
  const press = (c) => { target.fire('keydown', c); down.add(c); };
  const release = (c) => { if (down.delete(c)) target.fire('keyup', c); };
  let jumpUntil = -1, dirUntil = 0, n = 0, restUntil = 0;
  for (;;) {
    const live = game.state === STATE.PLAYING;
    // Now and then he stops to think: hands off the keys for a third of a second to one,
    // so the idle clock runs and a pause has something to zero. Not longer: standing
    // still, the floor comes up at 3.2 times its speed and takes him in a few seconds.
    if (n >= restUntil && r() < 0.003) {
      restUntil = n + 80 + Math.floor(r() * 160);
      for (const k of [...LEFT, ...RIGHT, ...JUMP]) release(k);
      jumpUntil = -1;
      dirUntil = restUntil;
    }
    const resting = n < restUntil;
    if (!resting && n >= dirUntil) {
      for (const k of [...LEFT, ...RIGHT]) release(k);
      // Mostly the way a climber goes -- at the far wall, to bounce off it -- and
      // sometimes anywhere, both at once, or nowhere.
      const x = r();
      const far = game.player.x < 240 ? RIGHT : LEFT;
      if (x < 0.6) press(far[r() < 0.5 ? 0 : 1]);
      else if (x < 0.8) press(LEFT[r() < 0.5 ? 0 : 1]);
      else if (x < 0.92) press(RIGHT[r() < 0.5 ? 0 : 1]);
      else if (x < 0.96) { press('ArrowLeft'); press('KeyD'); }
      dirUntil = n + 30 + Math.floor(r() * 240);
    }
    if (jumpUntil >= 0 && n >= jumpUntil) { for (const k of JUMP) release(k); jumpUntil = -1; }
    else if (!resting && jumpUntil < 0 && r() < 0.1) {
      press(JUMP[Math.floor(r() * 4)]);
      jumpUntil = n + (r() < 0.35 ? 1 + Math.floor(r() * 12) : 30 + Math.floor(r() * 400));
    }
    if (r() < 0.02) target.fire('keydown', JUMP[0], true);
    if (jumpUntil >= 0 && r() < 0.01) press(JUMP[Math.floor(r() * 4)]);
    if (live && ((game.idleFor > 0.25 && r() < 0.08) || r() < 0.0015)) {
      game.pause();
      for (let i = 1 + Math.floor(r() * 40); i > 0; i--) { game.step(STEP); yield; }
      if (r() < 0.5) yield* optionsScreen(game, r, 1 + Math.floor(r() * 300));
      game.resume();
    } else if (live && r() < 0.002) {
      yield* optionsScreen(game, r, 1 + Math.floor(r() * 500));
    } else if (live && r() < 0.0008) {
      target.fire('blur');
      down.clear();
      jumpUntil = -1;
    }
    for (let i = 1 + Math.floor(r() * 4); i > 0; i--) { game.step(STEP); n++; yield; }
  }
}

function humanGame(seed) {
  const target = new FakeTarget();
  const input = new Input(target);
  const game = new Game(input);
  game.newRun(seed);
  return { target, input, game };
}

function recordHuman(seed, maxSteps = 240 * 180) {
  const { target, game } = humanGame(seed);
  const rec = Replay.startRecording(game);
  const it = human(game, target, seed);
  let n = 0;
  while (!rec.sealed && n++ < maxSteps * 3) it.next();
  return rec.finish();
}

/** A bot run on a demo tower with game.step alone timed, optionally recorded: he climbs all of it. */
function timeRun(withRec, steps, s) {
  const { game, bot } = botGame(s, { demo: true, climb: Infinity });
  const rec = withRec ? Replay.startRecording(game) : null;
  let t = 0, n = 0;
  for (; n < steps && game.state === STATE.PLAYING; n++) {
    bot.step(game, STEP);
    const a = realNow();
    game.step(STEP);
    t += realNow() - a;
  }
  return { t, n, rec, game };
}
let baseStepNs = 0;

const encodeNoDate = (rep) => Replay.exportReplay({ ...rep, header: { ...rep.header, date: 0 } });
function roundTrip(rep) {
  const text = Replay.exportReplay(rep);
  const back = Replay.importReplay(text);
  if (!ok(back.ok, `import of an exported replay: ${back.error}`)) return null;
  return back.replay;
}

// ======================================================================================
// 0. Small things the rest leans on
// ======================================================================================
{
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  ok(Replay.GAME_VERSION === pkg.version, `GAME_VERSION ${Replay.GAME_VERSION} is not package.json's ${pkg.version}`);
  let same = true;
  for (const s of [0, 1, 0xdeadbeef]) {
    const f = mulberry32(s), g = new Rng(s);
    for (let i = 0; i < 2000; i++) if (f() !== g.next()) same = false;
  }
  ok(same, 'Rng no longer draws the numbers mulberry32 does: every tower would change');
  // What the first death pays if the UI does not compute the fingerprint at boot: cold.
  const a = realNow();
  const fp = Replay.simFingerprint();
  note(`numbers: the simulation fingerprint ${fp.text}, cold: ${ms(realNow() - a)}`);
}

// ---- the ten-minute run: timings and sizes, measured FIRST, before the rest of this
// ---- file has run the JIT through a dozen shapes and five copies of the game ------
{
  const seed = DEMO_SEEDS[1];
  const LEN = 240 * 600;
  // Warm the JIT on another tower first, then the same ten minutes without and with the
  // recorder, timing game.step alone (the bot costs more than the game and is not timed).
  timeRun(false, 240 * 30, DEMO_SEEDS[0]);
  // The recorder's cost: two minutes without and with it, three times over, the best of
  // each -- other processes on the machine move a single run by more than the difference.
  let perOff = Infinity, perOn = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = timeRun(false, 240 * 120, seed), b = timeRun(true, 240 * 120, seed);
    b.rec.finish();
    perOff = Math.min(perOff, (a.t / a.n) * 1e6);
    perOn = Math.min(perOn, (b.t / b.n) * 1e6);
  }
  baseStepNs = perOff;
  note(`numbers: the recorder: game.step ${perOff.toFixed(0)} ns without it, ${perOn.toFixed(0)} ns with it, best of three two-minute runs: ` +
    `${(perOn - perOff).toFixed(0)} ns a step (${(((perOn - perOff) * 240) / 1000).toFixed(1)} us a second of play), a live keyframe every ${C.REPLAY_KEYFRAME_EVERY / 240} s included`);
  const on = timeRun(true, LEN, seed);
  const rep = on.rec.finish();
  try {
    const a = realNow();
    snapshot(on.game);
    note(`numbers: one copy of the game at ${(on.n / 240).toFixed(0)} s: ${ms(realNow() - a)}`);
  } catch (e) {
    ok(false, `numbers: the game cannot be copied: ${e.message}`);
  }

  let t1 = realNow();
  const text = Replay.exportReplay(rep);
  const exportMs = realNow() - t1;
  const sizeOf = (m) => Codec.encodeBinary(m).length;
  const full = sizeOf(rep);
  const noRec = sizeOf({ ...rep, records: { n: 0, step: [], kind: [], code: [], val: [] } });
  const noGhost = sizeOf({ ...rep, ghost: { n: 1, x: [0], y: [0], pose: [0], names: NAMES } });
  note(`numbers: size of the ${(rep.steps / 240).toFixed(0)} s run (floor ${rep.result.floor}): ${(text.length / 1024).toFixed(1)} k characters of text (${(full / 1024).toFixed(1)} k bytes: input ${((full - noRec) / 1024).toFixed(1)} k in ${rep.records.n} records, ghost ${((full - noGhost) / 1024).toFixed(1)} k in ${rep.ghost.n} samples, checksums ${((rep.checks.length * 4) / 1024).toFixed(1)} k)`);
  // The human-like sessions die young, so their rate is taken over six of them together.
  let hChars = 0, hSteps = 0, hLongest = 0;
  for (const s of [404, 505, 606, 707, 808, 909]) {
    const h = recordHuman(s);
    const t = Replay.exportReplay(h);
    hChars += t.length; hSteps += h.steps; hLongest = Math.max(hLongest, h.steps);
  }
  note(`numbers: size of six human-like sessions (${(hSteps / 240).toFixed(0)} s of climb, the longest ${(hLongest / 240).toFixed(0)} s): ${(hChars / 1024).toFixed(1)} k characters, ${((hChars / hSteps) * 240 * 60 / 1024).toFixed(1)} k a minute`);

  const imp = Replay.importReplay(text);
  ok(imp.ok, `numbers: the ten-minute replay did not import: ${imp.error}`);
  {
    const a = realNow();
    Replay.importReplay(text);
    const importMs = realNow() - a;
    const st = new Store.ReplayStore(Store.memoryBackend(), { encode: Replay.exportReplay, decode: Replay.importReplay });
    t1 = realNow();
    const saved = st.save(rep, 'own');
    const saveMs = realNow() - t1;
    ok(saved.kept, `numbers: the ten-minute replay was not kept: ${saved.error}`);
    note(`numbers: exporting it: ${ms(exportMs)}, importing it: ${ms(importMs)}, saving it (encoded, checked by decoding, written): ${ms(saveMs)}`);
  }
  const R = imp.replay;
  const target = Math.max(0, R.steps - 240 * 10);
  // Straight from floor 0, the way a seek has to go without copies.
  const P = new Replay.Playback(R);
  P.keyframesOk = false;
  let a = realNow();
  P.seekStep(target);
  const cold = realNow() - a;
  note(`numbers: seek to the last 10 s of ${(R.steps / 240).toFixed(0)} s by simulating from the start: ${ms(cold)} (${((target / cold) * 1000 / 1e6).toFixed(2)} M steps a second headless, particles and companions included)`);
  // From the recorder's copies of the live game: the instant replay. The last 10 s of a
  // run that ends on a keyframe is a restore and nothing else, so the worst case is taken
  // over every start the copies promise to cover -- (REPLAY_LIVE_KEYFRAMES - 1) keyframe
  // intervals before the end, 20 s -- which is up to a whole interval of simulation after
  // the restore. Each from a fresh playback, as a death would build one. (A start further
  // back than the copies reach simulates from floor 0: 0.45 s here.)
  const cover = ((C.REPLAY_LIVE_KEYFRAMES - 1) * C.REPLAY_KEYFRAME_EVERY) / 240;
  let inst = 0, instAt = 0;
  for (let back = 1; back <= cover; back++) {
    const t = Math.max(0, rep.steps - 240 * back);
    const I = Replay.createPlayback(rep).playback;
    a = realNow();
    I.seekStep(t);
    const d = realNow() - a;
    if (d > inst) { inst = d; instAt = back; }
  }
  ok(inst < 100, `numbers: the instant replay's seek took up to ${ms(inst)} with the live keyframes`);
  note(`numbers: the instant replay, from the recorder's copies of the live game: a seek to any of the last 1-${cover} s takes at most ${ms(inst)} (${instAt} s before the end)`);
  // A budgeted seek from cold, a frame at a time.
  const Q = new Replay.Playback(R);
  let calls = 0, worst = 0;
  for (;;) {
    const b = realNow();
    const done = Q.seekStep(target, 4);
    worst = Math.max(worst, realNow() - b);
    calls++;
    if (done || calls > 10000) break;
  }
  note(`numbers: the same seek budgeted at 4 ms a call: ${calls} calls, the longest ${ms(worst)} -- about ${(calls / 60).toFixed(1)} s of 60 Hz frames behind the death's fall`);
  // After one pass, anywhere is a restore and at most a keyframe interval of simulation.
  while (Q.step());
  let worstSeek = 0;
  const r = mulberry32(99);
  for (let i = 0; i < 20; i++) {
    const s = Math.floor(r() * Q.stepIndex);
    const b = realNow();
    Q.seekStep(s);
    worstSeek = Math.max(worstSeek, realNow() - b);
  }
  ok(worstSeek < 150, `numbers: a seek after a full pass took ${ms(worstSeek)}`);
  ok(Q.desync === null, `numbers: the ten-minute replay desynced at ${JSON.stringify(Q.desync)}`);
  note(`numbers: after one pass, 20 random seeks: the slowest ${ms(worstSeek)} (${Q.keyframes.size} keyframes held)`);
}

// ======================================================================================
// 1. The bot, recorded to its death and played back: every value, every step
// ======================================================================================
let botReplay = null, botText = null;
{
  const t0 = realNow();
  const cases = [[11, {}], [22, {}], [33, {}], [44, { dirty: true }]];
  let steps = 0;
  for (const [seed, opts] of cases) {
    const rep = recordBot(seed, opts);
    ok(!rep.invalid, `seed ${seed}: recording invalid: ${rep.invalid}`);
    ok(rep.result.ended === 'fire', `seed ${seed}: the bot did not die inside 200 s (${rep.result.ended})`);
    const back = roundTrip(rep);
    if (!back) continue;
    if (!botReplay) { botReplay = rep; botText = Replay.exportReplay(rep); }

    // Lockstep: the same run again (a fresh bot, its own recorder) against the playback.
    const A = botGame(seed, opts);
    const rec = Replay.startRecording(A.game);
    const pb = Replay.createPlayback(back);
    if (!ok(pb.ok, `seed ${seed}: playback refused: ${pb.error}`)) continue;
    const B = pb.playback;
    let i = 0, bad = null;
    while (A.game.state !== STATE.DEAD && i < 240 * 260) {
      if (A.game.state === STATE.PLAYING) A.bot.step(A.game, STEP);
      A.game.step(STEP);
      B.step();
      i++;
      const d = diffGames(A.game, B.game, i % 32 === 0, !!opts.dirty);
      if (d) { bad = `step ${i}: ${d}`; break; }
    }
    steps += i;
    ok(!bad, `seed ${seed}${opts.dirty ? ' (dirty game)' : ''}: playback differs from the run at ${bad}`);
    ok(A.game.state === STATE.DEAD && B.game.state === STATE.DEAD, `seed ${seed}: the fall did not end on the scoreboard in both`);
    ok(B.desync === null, `seed ${seed}: a desync was reported on an untouched replay: ${JSON.stringify(B.desync)}`);
    ok(B.game.run.score === rep.result.score && B.game.run.maxFloor === rep.result.floor, `seed ${seed}: the playback's result is not the run's`);
    ok(encodeNoDate(rec.finish()) === encodeNoDate(rep), `seed ${seed}: the same run recorded twice gave different files`);
  }
  note(`1. bot: ${cases.length} runs to their deaths, ${steps} steps compared value by value (${ms(realNow() - t0)})`);

  // 1b. The recorder is invisible: the same run with and without it.
  const X = botGame(55), Y = botGame(55);
  const rec = Replay.startRecording(Y.game);
  let bad = null, i = 0;
  while (X.game.state !== STATE.DEAD && i < 240 * 260) {
    if (X.game.state === STATE.PLAYING) { X.bot.step(X.game, STEP); Y.bot.step(Y.game, STEP); }
    X.game.step(STEP); Y.game.step(STEP);
    i++;
    const d = diffGames(X.game, Y.game, i % 32 === 0);
    if (d) { bad = `step ${i}: ${d}`; break; }
  }
  rec.finish();
  ok(!bad, `1b. recording changed the simulation at ${bad}`);
  ok(Y.game.input === Y.input, '1b. finish() did not hand the input back');
}

// ======================================================================================
// 2. A human through the real Input: keys between steps, holds, pauses, menus
// ======================================================================================
{
  const t0 = realNow();
  const kinds = new Map();
  const lengths = [];
  let presses = 0, heldPresses = 0, steps = 0;
  // The shapes the options screen leaves between two steps (see Recorder.interlude).
  let budgetsAround = 0, capped = 0, maxBudgets = 0;
  for (const seed of [101, 202, 303]) {
    const rep = recordHuman(seed);
    ok(!rep.invalid, `human ${seed}: recording invalid: ${rep.invalid}`);
    const R = rep.records;
    let wasHeld = false;
    const busy = new Set();
    for (let j = 0; j < R.n; j++) {
      kinds.set(R.kind[j], (kinds.get(R.kind[j]) || 0) + 1);
      if (R.kind[j] !== Codec.K_INPUT && R.kind[j] !== Codec.K_ENSURE) busy.add(R.step[j]);
      if (R.kind[j] === Codec.K_COSMETIC) {
        if (R.val[j] === C.REPLAY_COSMETIC_CAP) capped++;
        const around = (d) => { for (let i = j + d; i >= 0 && i < R.n && R.step[i] === R.step[j]; i += d) if (R.kind[i] === Codec.K_BUDGET) return true; return false; };
        if (around(-1) && around(1)) budgetsAround++;
      }
      if (R.kind[j] === Codec.K_BUDGET) {
        let n = 0;
        for (let i = j; i < R.n && R.step[i] === R.step[j]; i++) if (R.kind[i] === Codec.K_BUDGET) n++;
        maxBudgets = Math.max(maxBudgets, n);
      }
      if (R.kind[j] !== Codec.K_INPUT) continue;
      // A press while jump was already held going into the step: a second jump key.
      if (R.code[j] & 8) { presses++; if (wasHeld) heldPresses++; }
      wasHeld = (R.code[j] & 4) !== 0;
    }
    lengths.push(`${(rep.steps / 240).toFixed(0)} s to floor ${rep.result.floor} (${rep.result.ended})`);
    const back = roundTrip(rep);
    if (!back) continue;
    const pb = Replay.createPlayback(back);
    if (!ok(pb.ok, `human ${seed}: playback refused: ${pb.error}`)) continue;
    const B = pb.playback;
    const { target, game } = humanGame(seed);
    const rec = Replay.startRecording(game);
    const it = human(game, target, seed);
    let bad = null;
    // The climb: the session runs until it has taken one more PLAYING step -- through
    // whatever pauses and menus come first -- and the playback takes that step.
    while (!bad && !rec.sealed && rec.steps < rep.steps) {
      const k0 = rec.steps;
      for (let guard = 0; rec.steps === k0 && !rec.sealed && guard < 1e6; guard++) it.next();
      B.step();
      steps++;
      // Every particle after every visit to the options screen, and every 32 steps.
      const d = diffGames(game, B.game, steps % 32 === 0 || busy.has(k0));
      if (d) bad = `climb step ${rec.steps}: ${d}`;
    }
    // The fall, step for step.
    while (!bad && rep.result.ended === 'fire' && game.state !== STATE.DEAD) {
      it.next();
      B.step();
      steps++;
      const d = diffGames(game, B.game, steps % 32 === 0);
      if (d) bad = `fall step ${B.stepIndex}: ${d}`;
    }
    ok(!bad, `human ${seed}: playback differs from the session at ${bad}`);
    ok(B.desync === null, `human ${seed}: a desync was reported on an untouched replay`);
    ok(encodeNoDate(rec.finish()) === encodeNoDate(rep), `human ${seed}: the same session recorded twice gave different files`);
  }
  const count = (k) => kinds.get(k) || 0;
  ok(count(Codec.K_IDLE) > 0 && count(Codec.K_COSMETIC) > 0 && count(Codec.K_MOVE) > 0 && count(Codec.K_BUDGET) > 0,
    `2. the sessions did not exercise every event (idle ${count(Codec.K_IDLE)}, menu ${count(Codec.K_COSMETIC)}, companions ${count(Codec.K_MOVE)}, particles ${count(Codec.K_BUDGET)})`);
  ok(heldPresses > 0, '2. no jump press landed while another jump key was held');
  ok(budgetsAround > 0 && capped > 0 && maxBudgets === 3,
    `2. the options screen did not leave every shape (a change before and after its steps ${budgetsAround}, open past the cap ${capped}, most particle records on a step ${maxBudgets} of 3)`);
  note(`2. human: 3 sessions (${lengths.join(', ')}), ${steps} steps compared; ${count(Codec.K_INPUT)} input changes, ${presses} presses (${heldPresses} over a held key), ` +
    `${count(Codec.K_IDLE)} resumes that zeroed the idle clock, ${count(Codec.K_COSMETIC)} menu visits (${capped} open past the cap, ${budgetsAround} with the particles changed before and after their steps), ` +
    `${count(Codec.K_MOVE)} companion and ${count(Codec.K_BUDGET)} particle records (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 2b. The options screen between two steps, scripted: every shape Recorder.interlude writes
// ======================================================================================
// The human sessions above reach these by chance. Here each is staged on a bot run at a
// moment chosen so the shape has something to get wrong -- particles alive in the slots a
// lowered setting cuts, a ring cursor the dip would reset -- and the run is compared with
// its playback on every value and every particle, every step.
function* scripted(game, bot, seen) {
  const P = game.particles;
  let k = 0;
  const done = new Set();
  function* screen(n, at) {
    const from = game.state;
    game.state = STATE.OPTIONS;
    for (let i = 0; i < n; i++) { if (at[i]) at[i](); game.step(STEP); yield; }
    if (at.after) at.after();
    game.state = from;
  }
  // Alive in a slot the LOW setting cuts, with time to outlive a short screen.
  const doomed = () => { for (let i = 220; i < P.budget; i++) if (P.alive[i] && P.life[i] > 0.5) return true; return false; };
  for (;;) {
    if (game.state === STATE.PLAYING) {
      if (!done.has('pre') && k >= 2400 && P.budget === 900 && doomed()) {
        // Paused, then the screen: LOW and back to HIGH while what LOW kills is alive.
        done.add('pre'); seen.pre = k;
        game.pause();
        for (let i = 0; i < 12; i++) { game.step(STEP); yield; }
        yield* screen(100, { 10: () => P.setBudget(220), 50: () => P.setBudget(900) });
        game.resume();
      } else if (!done.has('post') && k >= 4800 && doomed()) {
        // LOW set after the screen's last step: kills the run never recounted.
        done.add('post'); seen.post = k;
        yield* screen(50, { after: () => P.setBudget(220) });
      } else if (!done.has('raise') && k >= 6000) {
        done.add('raise');
        yield* screen(20, { 5: () => P.setBudget(900) });
      } else if (!done.has('dip') && k >= 7200 && P.budget === 900 && P.cursor >= 220 && P.cursor < 520) {
        // Open past the cap: MEDIUM before it, then LOW and HIGH after it, where nothing is
        // alive to kill but the dip to LOW still resets a cursor between 220 and 520.
        done.add('dip'); seen.dip = k; seen.cursor = P.cursor;
        const cap = C.REPLAY_COSMETIC_CAP;
        yield* screen(cap + 300, { 10: () => P.setBudget(520), [cap + 100]: () => P.setBudget(220), [cap + 200]: () => P.setBudget(900) });
      } else if (!done.has('move') && k >= 9000) {
        // The companions' movement there and back on one screen (nothing to record), then
        // changed on the next, a step later.
        done.add('move'); seen.move = k;
        const mine = game.companions.movement, other = mine === 'hop' ? 'glide' : 'hop';
        yield* screen(30, { 5: () => { game.companions.movement = other; }, 15: () => { game.companions.movement = mine; } });
        bot.step(game, STEP); game.step(STEP); k++; yield;
        yield* screen(30, { 5: () => { game.companions.movement = other; } });
      }
      if (game.state === STATE.PLAYING) { bot.step(game, STEP); game.step(STEP); k++; } else game.step(STEP);
    } else {
      game.step(STEP);
    }
    yield;
  }
}
{
  const t0 = realNow();
  const seen = {};
  const A = botGame(11);
  const recA = Replay.startRecording(A.game);
  const itA = scripted(A.game, A.bot, seen);
  for (let g = 0; !recA.sealed && g < 2e6; g++) itA.next();
  const rep = recA.finish();
  ok(!rep.invalid && rep.result.ended === 'fire', `2b. the scripted run: ${rep.invalid || rep.result.ended}`);
  ok(seen.pre && seen.post && seen.dip && seen.move, `2b. not every shape was staged before the bot died: ${JSON.stringify(seen)}`);
  // What each screen left on the step after it, in order (the idle clock aside: the bot
  // is rarely standing when it pauses, so that one is left to section 2).
  const R = rep.records;
  const K = ['INPUT', 'IDLE', 'MOVE', 'BUDGET', 'MENU', 'ENSURE'];
  const at = (k) => {
    const out = [];
    for (let j = 0; j < R.n; j++) {
      if (R.step[j] !== k || R.kind[j] === Codec.K_INPUT || R.kind[j] === Codec.K_ENSURE || R.kind[j] === Codec.K_IDLE) continue;
      out.push(K[R.kind[j]] + (R.kind[j] === Codec.K_MOVE ? '' : ' ' + R.val[j]));
    }
    return out.join(', ');
  };
  const cap = C.REPLAY_COSMETIC_CAP;
  for (const [k, w] of [
    [seen.pre, 'BUDGET 220, MENU 100, BUDGET 900'],
    [seen.post, 'MENU 50, BUDGET 220'],
    [seen.dip, `BUDGET 520, MENU ${cap}, BUDGET 220, BUDGET 900`],
    [seen.move, 'MENU 30'],
    [seen.move + 1, 'MOVE, MENU 30'],
  ]) ok(at(k) === w, `2b. the step after a screen at ${k} carries '${at(k)}', not '${w}'`);
  const back = roundTrip(rep);
  if (back) {
    const B = botGame(11);
    const recB = Replay.startRecording(B.game);
    const itB = scripted(B.game, B.bot, {});
    const pb = Replay.createPlayback(back).playback;
    let bad = null;
    while (!bad && !recB.sealed) {
      const k0 = recB.steps;
      for (let g = 0; recB.steps === k0 && !recB.sealed && g < 1e5; g++) itB.next();
      pb.step();
      const d = diffGames(B.game, pb.game, true);
      if (d) bad = `step ${recB.steps}: ${d}`;
    }
    ok(!bad, `2b. the playback of the scripted screens differs from the run at ${bad}`);
    ok(pb.desync === null, '2b. a desync was reported on the scripted run');
  }
  note(`2b. the options screen staged on a bot run (at steps ${seen.pre}, ${seen.post}, ${seen.dip} with the ring cursor at ${seen.cursor}, ${seen.move}): each written as documented, every particle identical every step (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 3. One flipped input bit: caught at the first checksum after it matters
// ======================================================================================
if (botReplay) {
  const t0 = realNow();
  const base = Replay.importReplay(botText).replay;
  const R = base.records;
  const ce = base.header.checkEvery;
  const inputs = [];
  for (let j = 0; j < R.n; j++) if (R.kind[j] === Codec.K_INPUT) inputs.push(j);
  let caught = 0, inert = 0;
  const flips = [];
  for (const at of [0.2, 0.45, 0.7]) {
    const j = inputs[Math.floor(inputs.length * at)];
    flips.push([j, 'axis'], [j, 'held'], [j + 1 < R.n ? inputs[Math.floor(inputs.length * at) + 1] : j, 'press']);
  }
  for (const [j, what] of flips) {
    const m = { ...base, records: { n: R.n, step: R.step, kind: R.kind, code: R.code.slice(), val: R.val.slice() } };
    const c = m.records.code[j];
    if (what === 'axis') {
      const a = c & 3;
      const na = a === 1 ? 2 : a === 2 ? 1 : 1;
      m.records.code[j] = (c & ~3) | na;
      m.records.val[j] = na === 1 ? 1 : -1;
    } else if (what === 'held') m.records.code[j] = c ^ 4;
    else m.records.code[j] = c ^ 8;
    const text = Replay.exportReplay(m);
    const M = Replay.createPlayback(Replay.importReplay(text).replay).playback;
    const O = Replay.createPlayback(base).playback;
    // Ground truth: the first step the checksummed state of the two differs, and whether
    // the flipped run left the climb (died) at another step.
    let D = -1;
    while (!M.done && !O.done && M.game.state === STATE.PLAYING) {
      M.step(); O.step();
      if (D < 0 && (Replay.simChecksum(M.game) !== Replay.simChecksum(O.game) || M.game.state !== O.game.state)) D = M.stepIndex;
      if (D >= 0 && M.desync) break;
    }
    while (!M.done && M.game.state === STATE.PLAYING) M.step();
    if (D < 0) {
      inert++;
      ok(M.desync === null, `3. flip ${what} at record ${j} changed nothing and still reported a desync at ${JSON.stringify(M.desync)}`);
      continue;
    }
    let want = Math.ceil(D / ce) * ce;
    if (want > base.steps) want = base.steps;
    ok(M.desync !== null, `3. flip ${what} at record ${j} (state differs from step ${D}) was never reported`);
    if (M.desync) {
      // It may also be caught sooner, if the flipped run died before the next checkpoint.
      const died = M.desync.step < want && M.game.state !== STATE.PLAYING;
      ok(M.desync.step === want || died, `3. flip ${what} at record ${j}: state differs from step ${D}, first checkpoint after is ${want}, reported ${M.desync.step}`);
      ok(M.desync.seconds - D * STEP <= 1.0 + 1e-9, `3. flip ${what}: reported ${(M.desync.seconds - D * STEP).toFixed(2)} s after it happened`);
      caught++;
    }
  }
  ok(caught >= 5, `3. only ${caught} of ${flips.length} flips changed the run`);
  note(`3. flipped bits: ${caught} caught at the first checkpoint after the divergence, ${inert} changed nothing and reported nothing (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 4a. Which constants.js numbers are the simulation's, read from the source
// ======================================================================================
// The fingerprint hashes the constants.js numbers a module of the step imports, and leaves
// out the ones replay.js lists (DRAWN_ONLY, COSMETIC_ONLY). It hashed all of them once, and
// when the renderer's numbers were merged into constants.js every saved replay came to
// depend on a trail's alpha and a fade. The lists are only as good as this check: every
// module game.js reaches is read for what it takes from constants.js -- except the cosmetic
// stream's, whose particles draw from their own seeded stream (the particles-on-sim-stream
// mutant and 4's builds hold that) -- and the fingerprint must hold exactly those numbers.
// A constant added to constants.js lands in the fingerprint until it is decided, and fails
// here if nothing in the step reads it. The files are read from SRC, so a mutant's copy is
// read as patched.
const COSMETIC_MODULES = new Set(['render/particles.js', 'render/sparks.js']);
// The DRAWING modules the step reaches, and the constants.js numbers each reads for what the
// step takes from it. sprites.js is reached because the fall's pieces are cut from the Duke's
// art at load (SPLAT_BITS: CUT_OUTLINE_V, LIMB_MATCH and the PLATE_ pair decide the cuts, PX the scale), and
// compsprites.js because the companions are who its sheets say (PX); every other line of
// both draws. This check first counted every constants.js import of a reached module as the
// step's, so a number either takes for its drawing -- a glint's alpha, a shield's shine --
// went into the fingerprint without a word: the bug this check exists for, through the
// module the Duke's drawing tunables go into (the verifier added a GLINT_ALPHA imported by
// sprites.js alone, and 4a passed and fingerprinted it). Now an import of a render module
// the step reaches is the step's only when it is named here; any other fails until someone
// decides -- named here (the step's result depends on it) or listed in replay.js DRAWN_ONLY
// (only drawn; 4 then changes it with the rest and plays the bot's replay beside this build).
// A render module the step comes to reach with no row fails too.
const STEP_READS_FROM_RENDER = new Map([
  ['render/sprites.js', new Set(['PX', 'CUT_OUTLINE_V', 'LIMB_MATCH', 'PLATE_MIN', 'PLATE_STEEL'])],
  ['render/compsprites.js', new Set(['PX'])],
]);
const relSrc = (f) => path.relative(SRC, f).replace(/\\/g, '/');
// An import or re-export at the start of a line -- a line comment starts with //, so one
// quoted in a comment is not read -- and its clause: { names }, * as NS, a default, or none.
const IMPORT_RE = /^(?:import|export)\s+(?:(\{[^}]*\}|\*\s*(?:as\s+\w+)?|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+\w+))?)\s*from\s*)?['"]([^'"\n]+)['"]/gm;
function stepReads() {
  const constFile = path.join(SRC, 'game', 'constants.js');
  const reads = new Map(), drawnBy = new Map(), seen = new Set(), problems = [];
  const stack = [path.join(SRC, 'game', 'game.js')];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const text = fs.readFileSync(f, 'utf8');
    if (/\bimport\s*\(/.test(text.replace(/\/\/[^\n]*/g, ''))) problems.push(`${relSrc(f)} imports a module at run time, which this check cannot follow`);
    const rel = relSrc(f);
    const row = rel.startsWith('render/') ? STEP_READS_FROM_RENDER.get(rel) : null;
    for (const m of text.matchAll(IMPORT_RE)) {
      const to = path.resolve(path.dirname(f), m[2]);
      if (to === constFile) {
        const clause = (m[1] || '').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').trim();
        if (!clause.startsWith('{')) { problems.push(`${rel} imports constants.js as '${clause || 'a side effect'}', so which numbers it reads cannot be told`); continue; }
        if (rel.startsWith('render/') && !row) { problems.push(`${rel} is drawing code the step now reaches, and imports constants.js: name in STEP_READS_FROM_RENDER the numbers the step's result depends on, and list the ones it only draws with in replay.js DRAWN_ONLY`); continue; }
        for (const s of clause.slice(1, -1).split(',')) {
          const n = s.trim().split(/\s+as\s+/)[0].trim();
          if (!n) continue;
          const into = row && !row.has(n) ? drawnBy : reads;
          if (!into.has(n)) into.set(n, []);
          into.get(n).push(rel);
        }
      } else if (!COSMETIC_MODULES.has(relSrc(to))) {
        stack.push(to);
      }
    }
  }
  return { reads, drawnBy, modules: [...seen].map(relSrc), problems };
}
{
  const { reads, drawnBy, modules, problems } = stepReads();
  for (const p of problems) ok(false, `4a. ${p}`);
  for (const [mod, row] of STEP_READS_FROM_RENDER) {
    ok(modules.includes(mod), `4a. STEP_READS_FROM_RENDER names ${mod}, which the step no longer reaches`);
    for (const k of row) ok((reads.get(k) || []).includes(mod), `4a. STEP_READS_FROM_RENDER names ${k} for ${mod}, which does not import it`);
  }
  // The walk itself: a reader that found nothing would pass everything below.
  for (const m of ['game/game.js', 'game/player.js', 'game/generator.js', 'game/reach.js', 'game/companions.js',
    'game/combo.js', 'game/milestones.js', 'game/themes.js', 'render/sprites.js', 'core/input.js']) {
    ok(modules.includes(m), `4a. the walk from game.js did not reach ${m}`);
  }
  ok((reads.get('GRAVITY') || []).includes('game/player.js') && (reads.get('CUT_OUTLINE_V') || []).includes('render/sprites.js'),
    '4a. the import reader missed GRAVITY in player.js or CUT_OUTLINE_V in sprites.js');
  ok(!modules.some((m) => COSMETIC_MODULES.has(m)), '4a. the walk went into the cosmetic stream');
  const fpSet = new Set(Replay.FINGERPRINT_CONSTANTS);
  const drawn = new Set(Replay.DRAWN_ONLY), cosmetic = new Set(Replay.COSMETIC_ONLY);
  const own = (k) => k.startsWith('REPLAY_') || k === 'SIM_VERSION';
  let n = 0;
  for (const k of Object.keys(C)) {
    if (typeof C[k] === 'function') continue;   // code: the probe runs what the step calls
    n++;
    const places = [own(k), fpSet.has(k), drawn.has(k), cosmetic.has(k)].filter(Boolean).length;
    ok(places === 1, `4a. constants.js ${k} is in ${places} of: the replay's own, the fingerprint, DRAWN_ONLY, COSMETIC_ONLY`);
    const by = reads.get(k);
    if (fpSet.has(k)) {
      ok(by, drawnBy.has(k)
        ? `4a. ${k} is in the replay fingerprint, but only ${drawnBy.get(k).join(', ')} imports it, drawing code the step reaches for something else: name it in STEP_READS_FROM_RENDER if the step's result depends on it, or list it in replay.js DRAWN_ONLY, or tweaking it refuses every replay saved before`
        : `4a. ${k} is in the replay fingerprint, but no module of the step reads it: a number only the renderer, the HUD or a screen reads goes in replay.js DRAWN_ONLY, or tweaking it refuses every replay saved before`);
    }
    if (drawn.has(k)) ok(!by, `4a. ${k} is listed DRAWN_ONLY, but the step reads it (${by}): it is the simulation's, and left out of the fingerprint a change to it desyncs old replays instead of refusing them`);
    if (cosmetic.has(k)) ok(by, `4a. ${k} is listed COSMETIC_ONLY, but nothing in the step reads it: it belongs in DRAWN_ONLY`);
  }
  for (const k of [...drawn, ...cosmetic]) ok(k in C, `4a. replay.js lists ${k}, which constants.js does not have`);
  ok(drawn.size === Replay.DRAWN_ONLY.length && cosmetic.size === Replay.COSMETIC_ONLY.length, '4a. replay.js lists a name twice');
  for (const [k, by] of reads) {
    if (typeof C[k] !== 'function') ok(fpSet.has(k) || cosmetic.has(k), `4a. the step reads ${k} (${by.join(', ')}), which the fingerprint leaves out`);
  }
  const readers = new Set([...reads.values()].flat());
  note(`4a. constants.js: ${fpSet.size} of its ${n} numbers are read by the step (${readers.size} of the ${modules.length} modules game.js reaches import them) and fingerprinted; ${drawn.size} drawn only (${[...drawnBy.keys()].filter((k) => drawn.has(k)).length} of them by the drawing of a module the step reaches) and ${cosmetic.size} handed only to the cosmetic stream are not, nor the replay's own`);
}

// ======================================================================================
// 4. The fingerprint: a build that simulates differently refuses; a cosmetic one does not
// ======================================================================================
if (botText) {
  const t0 = realNow();
  const fp = Replay.simFingerprint();
  // A patch that no longer matches the code (someone rewrote the line) fails with its own
  // message rather than crashing the suite: the check it made has stopped testing anything.
  const variant = async (tag, patches) => {
    const d = copySrc(tag);
    try { for (const [f, a, b] of patches) patch(d, f, a, b); }
    catch (e) { ok(false, `4. the '${tag}' build could not be made, so it tests nothing: ${e.message}`); return null; }
    return load(d, 'game/replay.js');
  };
  // A copy of src/ with each named constants.js number moved: its initializer wrapped in a
  // bump that takes a number, or each number of an array, to half again plus a quarter, so
  // that 0 and 1 move too. By name, so the list can come from replay.js itself.
  const bumped = async (tag, names) => {
    const d = copySrc(tag);
    const file = path.join(d, 'game', 'constants.js');
    let t = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const k of names) {
      const re = new RegExp(`^export const ${k} = ([^;]+);`, 'm');
      if (!re.test(t)) { ok(false, `4. the '${tag}' build could not change ${k}: it is not declared as 'export const ${k} = ...;'`); return null; }
      t = t.replace(re, `export const ${k} = FP_BUMP($1);`);
    }
    fs.writeFileSync(file, 'const FP_BUMP = (v) => (Array.isArray(v) ? v.map((x) => x * 1.5 + 0.25) : v * 1.5 + 0.25);\n' + t);
    const V = await load(d, 'game/constants.js');
    for (const k of names) ok(JSON.stringify(V[k]) !== JSON.stringify(C[k]), `4. the '${tag}' build did not change ${k}`);
    return load(d, 'game/replay.js');
  };
  // A build that must NOT refuse: the same fingerprint, and the replay recorded by this one
  // plays in it to the scoreboard without a desync, with the score it was recorded with.
  const accepted = (V, what) => {
    if (!V) return false;
    const f = V.simFingerprint();
    ok(f.text === fp.text, `4. ${what} moved the fingerprint (${f.text} vs ${fp.text})`);
    const imp = V.importReplay(botText);
    const pb = imp.ok && V.createPlayback(imp.replay);
    if (!ok(pb && pb.ok, `4. ${what}: the build refused the replay: ${pb && pb.error}`)) return false;
    const B = pb.playback;
    while (B.step());
    ok(B.desync === null, `4. ${what} desynced the replay at ${JSON.stringify(B.desync)}`);
    ok(B.game.run.score === botReplay.result.score, `4. ${what} changed the score`);
    return true;
  };
  let nRefused = 0;
  const refused = (V, what, part) => {
    if (!V) return;
    nRefused++;
    const f = V.simFingerprint();
    const imp = V.importReplay(botText);
    ok(imp.ok && imp.compatible === false, `4. ${what}: the replay was not refused (fingerprint ${f.text} vs ${fp.text})`);
    const pb = V.createPlayback(imp.replay);
    ok(!pb.ok && pb.incompatible, `4. ${what}: createPlayback did not refuse it`);
    if (part) ok(f[part] !== fp[part], `4. ${what}: ${part} did not change`);
    const g = V.ghostAt(imp.replay, 3);
    ok(g && Number.isFinite(g.x) && Number.isFinite(g.y), `4. ${what}: the ghost no longer races`);
  };
  refused(await variant('gravity', [['game/constants.js', 'export const GRAVITY = 1680;', 'export const GRAVITY = 1681;']]), 'GRAVITY 1680 -> 1681', 'constHash');
  // One of each kind of number the step reads, each only a hair off, and constHash itself
  // must move (the probe would refuse most of them anyway, and hide a constant left out).
  refused(await variant('jump', [['game/constants.js', 'export const JUMP_V0_MIN = 465;', 'export const JUMP_V0_MIN = 466;']]), 'a jump: JUMP_V0_MIN 465 -> 466', 'constHash');
  refused(await variant('generator', [['game/constants.js', 'export const PLAT_W_JITTER = 0.30;', 'export const PLAT_W_JITTER = 0.31;']]), 'the generator: PLAT_W_JITTER 0.30 -> 0.31', 'constHash');
  refused(await variant('combostep', [['game/combo.js', 'export const MULT_STEP = 50;', 'export const MULT_STEP = 51;']]), "the combo's step: MULT_STEP 50 -> 51", 'constHash');
  refused(await variant('combogain', [['game/constants.js', 'export const COMBO_MIN_GAIN = 2;', 'export const COMBO_MIN_GAIN = 3;']]), 'COMBO_MIN_GAIN 2 -> 3', 'constHash');
  // In render/, but the step reads what it decides: the pieces the fall simulates.
  refused(await variant('splatcut', [['game/constants.js', 'export const CUT_OUTLINE_V = 64;', 'export const CUT_OUTLINE_V = 70;']]), "the splat's cut: CUT_OUTLINE_V 64 -> 70", 'constHash');
  refused(await variant('pattern', [['game/generator.js', "const PATTERNS = ['zigzag', 'drift',", "const PATTERNS = ['drift', 'zigzag',"]]), 'the generator\'s pattern order', 'probeHash');
  refused(await variant('jumpcut', [['game/player.js', 'this.vy -= this.vy * JUMP_CUT * h * 10;', 'this.vy -= this.vy * JUMP_CUT * h * 11;']]), 'a rule in player.js', 'probeHash');
  // Whatever it stands at now: it read '= 1' literally, so the first bump (2, the jump
  // buffer kept through the air) could not make this build and failed the suite.
  refused(await variant('simver', [['game/constants.js', `export const SIM_VERSION = ${C.SIM_VERSION};`, `export const SIM_VERSION = ${C.SIM_VERSION + 1};`]]), 'SIM_VERSION bumped', 'simVersion');
  refused(await variant('coyote', [['core/input.js', 'export const COYOTE = 0.09;', 'export const COYOTE = 0.1;']]), 'COYOTE 0.09 -> 0.1', 'constHash');
  refused(await variant('companion', [['game/companions.js', '  lead: 2.0,              // floors ABOVE', '  lead: 2.1,              // floors ABOVE']]), "the companions' lead 2.0 -> 2.1", 'constHash');
  refused(await variant('arena', [['game/game.js', 'export const ARENA_STEPS = [2, 1.75, 1.5, 1.25, 1]', 'export const ARENA_STEPS = [2, 1.75, 1.5, 1.2, 1]']]), 'an arena step 1.25 -> 1.2', 'constHash');
  const V = await variant('cosmetic', [
    ['render/particles.js', 'const n = 4 + Math.floor(power * 10);', 'const n = 7 + Math.floor(power * 10);'],
    ['game/flavour.js', "'THE EARTH CLAIMS ITS DUE',", "'THE EARTH IS PATIENT',"],
  ]);
  if (V) {
    const f = V.simFingerprint();
    ok(f.text === fp.text, `4. a cosmetic change moved the fingerprint (${f.text} vs ${fp.text})`);
    const imp = V.importReplay(botText);
    const pb = imp.ok && V.createPlayback(imp.replay);
    if (ok(pb && pb.ok, `4. a cosmetic build refused the replay: ${pb && pb.error}`)) {
      const B = pb.playback;
      while (B.step());
      ok(B.desync === null, `4. a cosmetic change desynced the replay at ${JSON.stringify(B.desync)}`);
      ok(B.game.run.score === botReplay.result.score, '4. a cosmetic change changed the score');
    }
  }
  // Render-only numbers, one at a time as a tweak after release would come...
  let nAccepted = 0;
  for (const k of ['GHOST_ALPHA', 'BOARD_WARM_MS', 'IMPACT_FADE']) if (accepted(await bumped(k.toLowerCase(), [k]), k)) nAccepted++;
  // ...and every number the fingerprint leaves out at once, played beside this build over the
  // bot's run (to floor 985, combo steps on the way) and its fall to the scoreboard: the
  // simulation, as the replay's checksum reads it, and the fall's pieces, the same at every
  // step, while the sparks differ -- COMBO_STEP_BURST is read by the step, so its only proof
  // is that it moved the cosmetic stream and nothing else.
  const all = [...Replay.DRAWN_ONLY, ...Replay.COSMETIC_ONLY];
  const W = await bumped('leftout', all);
  let lock = '';
  if (accepted(W, `all ${all.length} numbers the fingerprint leaves out`)) {
    const A = Replay.createPlayback(Replay.importReplay(botText).replay).playback;
    const B = W.createPlayback(W.importReplay(botText).replay).playback;
    const pieces = (g) => (g.gibs || []).map((q) => `${q.x},${q.y},${q.rot}`).join(';');
    let i = 0, bad = null, sparks = false;
    for (;;) {
      const a = A.step(), b = B.step();
      i++;
      if (Replay.simChecksum(A.game) !== W.simChecksum(B.game) || A.game.state !== B.game.state || pieces(A.game) !== pieces(B.game)) {
        bad = `step ${i} (${A.game.state})`;
        break;
      }
      if (A.game.fx.a !== B.game.fx.a) sparks = true;
      if (!a || !b) { if (a !== b) bad = `step ${i}: one playback ended before the other`; break; }
    }
    ok(!bad, `4. the numbers the fingerprint leaves out moved the simulation at ${bad}`);
    ok(sparks, '4. the left-out build threw the same sparks as this one: COMBO_STEP_BURST was never exercised, so this proves nothing about it');
    if (!bad) ok(A.game.state === STATE.DEAD && A.game.gibs.length > 0, "4. the bot's run did not end in a splat on the scoreboard, so the fall's pieces were not compared");
    ok(A.desync === null && B.desync === null, "4. the bot's replay desynced");
    lock = `; all ${all.length} left-out numbers at once, beside this build over the bot's run: the same simulation every one of ${i} steps, the fall's ${A.game.gibs.length} pieces included, and different sparks`;
  }
  note(`4. fingerprint ${fp.text}: ${nRefused} simulation changes refused, each moving its own part of it; a cosmetic change and ${nAccepted} render-only numbers accepted and played without a desync${lock} (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 5. The file: round trip, the ghost, and everything hostile refused
// ======================================================================================
if (botReplay) {
  const t0 = realNow();
  const rep = botReplay, text = botText;
  const back = Replay.importReplay(text).replay;
  const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  ok(JSON.stringify(back.header) === JSON.stringify(rep.header) && JSON.stringify(back.result) === JSON.stringify(rep.result)
    && back.steps === rep.steps && back.finalCheck === rep.finalCheck, '5. the header or result changed in a round trip');
  const R = rep.records, Q = back.records;
  ok(R.n === Q.n && same(R.step, Q.step) && same(R.kind, Q.kind) && same(R.code, Q.code) && same(R.val, Q.val), '5. the records changed in a round trip');
  ok(same(rep.checks, back.checks), '5. the checksums changed in a round trip');
  // Poses by NAME and facing: the file numbers them in its own list (see replaycodec.js).
  const poseOf = (gh, i) => `${gh.names[gh.pose[i] & 0x7f]}/${gh.pose[i] & 0x80}`;
  let posesSame = rep.ghost.n === back.ghost.n;
  for (let i = 0; posesSame && i < rep.ghost.n; i++) posesSame = poseOf(rep.ghost, i) === poseOf(back.ghost, i);
  ok(rep.ghost.n === back.ghost.n && same(rep.ghost.x, back.ghost.x) && same(rep.ghost.y, back.ghost.y) && posesSame, '5. the ghost changed in a round trip');
  ok(Replay.exportReplay(back) === text, '5. export(import(text)) is not the text');
  ok(back.ghost.names.length < NAMES.length, `5. the file carries ${back.ghost.names.length} pose names, not only the ones the ghost uses`);

  // A replay from a build whose sheet named its poses differently: one renamed within its
  // family (run1 -> run9), one this build has never heard of. It still imports, and races
  // in poses this build draws -- the family's, or a fall.
  {
    const names = back.ghost.names.slice();
    const fam = names.findIndex((n) => /\d$/.test(n) && NAMES.some((m) => m !== n && m.replace(/\d+$/, '') === n.replace(/\d+$/, '')));
    const odd = names.findIndex((n, i) => i !== fam);
    const stem = fam >= 0 ? names[fam].replace(/\d+$/, '') : '';
    if (fam >= 0) names[fam] = stem + '9';
    names[odd] = 'somersault';
    const older = Replay.importReplay(Replay.exportReplay({ ...back, ghost: { ...back.ghost, names } }));
    ok(older.ok, `5. a replay naming poses this build lacks was refused: ${older.error}`);
    let wrong = null, seen = 0;
    for (let i = 0; older.ok && i < back.ghost.n && !wrong; i++) {
      const was = back.ghost.pose[i] & 0x7f;
      const h = Replay.ghostAt(older.replay, i * STEP * C.REPLAY_GHOST_EVERY);
      if (!NAMES.includes(h.pose)) wrong = `sample ${i}: '${h.pose}' is not a pose this build draws`;
      else if (was === fam && h.pose.replace(/\d+$/, '') !== stem) wrong = `sample ${i}: '${stem}9' raced as '${h.pose}'`;
      else if (was === odd && h.pose !== 'fall') wrong = `sample ${i}: 'somersault' raced as '${h.pose}'`;
      else if (was !== fam && was !== odd && h.pose !== back.ghost.names[was]) wrong = `sample ${i}: '${back.ghost.names[was]}' raced as '${h.pose}'`;
      if (was === fam || was === odd) seen++;
    }
    ok(!wrong && seen > 0 && fam >= 0, `5. a ghost from another sheet: ${wrong || `${seen} renamed samples, family ${fam}`}`);
  }

  // The ghost against where he really was, and in the frame the renderer draws.
  {
    const { game, bot } = botGame(11);
    const rec = Replay.startRecording(game);
    const truth = [];
    const ge = C.REPLAY_GHOST_EVERY;
    truth.push({ k: 0, x: game.player.x, y: game.player.y, f: game.player.facing, pose: Renderer.prototype.frameFor.call({ t: 0 }, game.player, game) });
    for (let k = 1; game.state === STATE.PLAYING; k++) {
      bot.step(game, STEP); game.step(STEP);
      if (k % ge === 0) truth.push({ k, x: game.player.x, y: game.player.y, f: game.player.facing, pose: Renderer.prototype.frameFor.call({ t: k * STEP }, game.player, game) });
    }
    const g = Replay.importReplay(Replay.exportReplay(rec.finish())).replay;
    let worst = 0, poseBad = null, faceBad = 0;
    for (const s of truth) {
      const h = Replay.ghostAt(g, s.k * STEP);
      worst = Math.max(worst, Math.abs(h.x - s.x), Math.abs(h.y - s.y));
      if (h.facing !== s.f) faceBad++;
      if (h.pose !== s.pose && !poseBad) poseBad = `step ${s.k}: ghost ${h.pose}, renderer ${s.pose}`;
    }
    const half = 0.5 / C.REPLAY_GHOST_Q;
    ok(worst <= half + 1e-9, `5. the ghost is ${worst.toFixed(4)} units from him, over half a quantum (${half})`);
    ok(!poseBad, `5. the ghost's pose is not the renderer's: ${poseBad}`);
    ok(faceBad === 0, `5. the ghost faces the wrong way on ${faceBad} samples`);
    ok(truth.length === g.ghost.n, '5. the ghost has the wrong number of samples');
    const end = Replay.ghostAt(g, 1e6);
    ok(end && end.done, '5. past its end the ghost does not say it is done');
    ok(Replay.ghostAt(g, -1) === null && Replay.ghostAt(g, NaN) === null, '5. a negative or NaN time gave a ghost');
    note(`5. ghost: ${truth.length} samples within ${worst.toFixed(4)} units (half a quantum is ${half}), every pose the renderer's`);
  }

  // Hostile input. Each must be refused, not thrown, and quickly.
  let worstMs = 0, refusedN = 0;
  const refuse = (t, what) => {
    const a = realNow();
    let r;
    try { r = Replay.importReplay(t); } catch (e) { r = { ok: true, threw: e.message }; }
    const dt = realNow() - a;
    worstMs = Math.max(worstMs, dt);
    ok(!r.threw, `5. import THREW on ${what}: ${r.threw}`);
    ok(!r.ok, `5. import accepted ${what}`);
    if (!r.ok) refusedN++;
    return r;
  };
  const rnd = mulberry32(777);
  const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let flipsSame = 0;
  for (let i = 0; i < 400; i++) {
    const p = 5 + Math.floor(rnd() * (text.length - 5));
    const c = A64[Math.floor(rnd() * 64)];
    if (c === text[p]) continue;
    const t = text.slice(0, p) + c + text.slice(p + 1);
    const r = Replay.importReplay(t);
    // A change in the last character's unused bits decodes to the same bytes: allowed.
    if (r.ok) { ok(Replay.exportReplay(r.replay) === text, `5. a flipped character at ${p} was accepted as a different replay`); flipsSame++; }
    else refusedN++;
  }
  for (let i = 0; i < 300; i++) refuse(text.slice(0, Math.floor(rnd() * text.length)), 'a truncated text');
  for (let i = 0; i < 200; i++) {
    let s = rnd() < 0.5 ? Codec.PREFIX : '';
    const len = Math.floor(rnd() * 3000);
    for (let k = 0; k < len; k++) s += String.fromCharCode(rnd() < 0.8 ? 32 + Math.floor(rnd() * 95) : Math.floor(rnd() * 65536));
    refuse(s, 'garbage');
  }
  for (const v of [null, undefined, 42, {}, [], '', 'DVR1:', 'DVR1', 'DVR9:AAAA', ' '.repeat(100)]) refuse(v, `the value ${JSON.stringify(v)}`);
  refuse(Codec.PREFIX + 'A'.repeat(C.REPLAY_MAX_TEXT), 'a text over REPLAY_MAX_TEXT');
  {
    // Fifty megabytes pasted in is refused on its length, before a byte of it is decoded.
    // Without that check it decoded all of it (37 MB of zeros) to find it was not a replay.
    const huge = Codec.PREFIX + 'A'.repeat(50 * 1024 * 1024);
    const a = realNow();
    refuse(huge, 'a 50 MB text');
    const dt = realNow() - a;
    ok(dt < 50, `5. a 50 MB text took ${ms(dt)} to refuse`);
  }
  ok(/newer/.test(Replay.importReplay('DVR2:AAAAAAAA').error || ''), '5. a newer format was not named as one');

  // Hand-built files with a VALID checksum, each broken in one way the checksum cannot see.
  const bin = Codec.encodeBinary(rep);
  const reseal = (b) => {
    const out = b.slice();
    new DataView(out.buffer).setUint32(out.length - 4, Codec.crc32(out, out.length - 4), true);
    return Codec.PREFIX + Buffer.from(out).toString('base64').replace(/=+$/, '');
  };
  ok(Replay.importReplay(reseal(bin)).ok, '5. a re-sealed untouched file was refused (the hostile cases below would prove nothing)');
  const hostile = (what, mut) => {
    const m = { ...rep, header: { ...rep.header }, result: { ...rep.result },
      records: { n: R.n, step: R.step.slice(), kind: R.kind.slice(), code: R.code.slice(), val: R.val.slice() },
      checks: rep.checks.slice(), ghost: { n: rep.ghost.n, x: rep.ghost.x.slice(), y: rep.ghost.y.slice(), pose: rep.ghost.pose.slice(), names: rep.ghost.names } };
    mut(m);
    let b;
    try { b = Codec.encodeBinary(m); } catch (e) { ok(false, `5. could not build the hostile file '${what}': ${e.message}`); return; }
    refuse(reseal(b), what);
  };
  const firstInput = (m) => { for (let j = 0; j < m.records.n; j++) if (m.records.kind[j] === Codec.K_INPUT) return j; return 0; };
  hostile('more steps than REPLAY_MAX_STEPS', (m) => { m.steps = C.REPLAY_MAX_STEPS + 1; });
  hostile('a record past the end', (m) => { m.records.step[m.records.n - 1] = m.steps + 5; });
  hostile('two inputs on one step', (m) => { const j = firstInput(m); m.records.step[j + 1] = m.records.step[j]; m.records.kind[j + 1] = Codec.K_INPUT; });
  hostile('an axis of NaN', (m) => { const j = firstInput(m); m.records.code[j] = (m.records.code[j] & ~3) | 3; m.records.val[j] = NaN; });
  hostile('an axis of 1e9', (m) => { const j = firstInput(m); m.records.code[j] = (m.records.code[j] & ~3) | 3; m.records.val[j] = 1e9; });
  hostile('a negative idle clock', (m) => { m.records.kind[0] = Codec.K_IDLE; m.records.code[0] = 0; m.records.val[0] = -1; });
  hostile('a menu visit over REPLAY_COSMETIC_CAP', (m) => { m.records.kind[0] = Codec.K_COSMETIC; m.records.code[0] = 0; m.records.val[0] = C.REPLAY_COSMETIC_CAP + 1; });
  hostile('an unknown record kind', (m) => { m.records.kind[0] = 9; m.records.code[0] = 0; m.records.val[0] = 1; });
  hostile('seventeen records on one step', (m) => { for (let j = 0; j < 17; j++) { m.records.step[j] = 0; m.records.kind[j] = Codec.K_BUDGET; m.records.code[j] = 0; m.records.val[j] = 900; } });
  hostile('a checksum interval of 0', (m) => { m.header.checkEvery = 0; });
  hostile('two menu visits on one step', (m) => { const j = firstInput(m); m.records.n += 1; for (const k of ['step', 'kind', 'code', 'val']) { const t = new m.records[k].constructor(m.records.n); t.set(m.records[k].subarray(0, j + 1)); t.set(m.records[k].subarray(j), j + 1); m.records[k] = t; } m.records.kind[j] = Codec.K_COSMETIC; m.records.kind[j + 1] = Codec.K_COSMETIC; m.records.code[j] = m.records.code[j + 1] = 0; m.records.val[j] = m.records.val[j + 1] = 5; });
  hostile('an ENSURE past ENSURE_MAX', (m) => { m.records.kind[0] = Codec.K_ENSURE; m.records.code[0] = 0; m.records.val[0] = Codec.ENSURE_MAX + 1; });
  hostile('more tower than a run could climb', (m) => {
    // ENSURE_MAX on each of enough steps to pass the decoder's total, every record legal alone.
    // The total is the codec's own (ensureCapFor), not a copy of its formula: the bot rebuilt on
    // 2026-09-29 generates 0.08 to 0.10 floors a step between steps, over the sixteenth the cap
    // allowed, so the cap is the codec's to raise and this file must still pass it when it is.
    const n = Math.ceil(Codec.ensureCapFor(m.steps) / Codec.ENSURE_MAX) + 1;
    m.records = { n, step: Int32Array.from({ length: n }, (_, j) => j), kind: new Uint8Array(n).fill(Codec.K_ENSURE),
      code: new Uint8Array(n), val: new Float64Array(n).fill(Codec.ENSURE_MAX) };
  });
  hostile('more menu steps than a run could spend', (m) => {
    // A full visit on each of enough steps to pass menuStepCap, every one legal alone.
    const n = Math.ceil(Codec.menuStepCap(m.steps) / C.REPLAY_COSMETIC_CAP) + 1;
    m.records = { n, step: Int32Array.from({ length: n }, (_, j) => j), kind: new Uint8Array(n).fill(Codec.K_COSMETIC),
      code: new Uint8Array(n), val: new Float64Array(n).fill(C.REPLAY_COSMETIC_CAP) };
  });
  {
    // The ghost's pose names and bytes, by hand: the encoder cannot write them wrong.
    const b = bin.slice();
    b[b.length - 5] = (b[b.length - 5] & 0x80) | 0x7f;          // the last run's pose byte
    refuse(reseal(b), "a pose byte past the file's own names");
    const names = back.ghost.names;
    const at = (name) => {
      const seq = [name.length, ...[...name].map((c) => c.charCodeAt(0))];
      for (let i = 0; i + seq.length <= bin.length; i++) if (seq.every((v, k) => bin[i + k] === v)) return i;
      return -1;
    };
    const p0 = at(names[0]);
    ok(p0 > 0, '5. could not find the pose names in the file');
    const c = bin.slice(); c[p0 + 1] = 0x21;                   // '!' in a name
    refuse(reseal(c), 'a pose name with a character outside [A-Za-z0-9_]');
    const twin = names.findIndex((n, i) => i > 0 && n.length === names[0].length);
    if (twin > 0) {
      const d = bin.slice(), p1 = at(names[twin]);
      for (let k = 0; k < names[0].length; k++) d[p1 + 1 + k] = names[0].charCodeAt(k);
      refuse(reseal(d), 'a pose name listed twice');
    }
  }
  hostile('a ghost with fewer samples than its steps', (m) => { m.ghost.n -= 1; });
  hostile('a checksum list one short', (m) => { m.checks = m.checks.slice(0, -1); });
  hostile('five more inputs on the last step', (m) => { m.records.n += 5; for (const k of ['step', 'kind', 'code', 'val']) { const t = new m.records[k].constructor(m.records.n); t.set(m.records[k]); m.records[k] = t; } for (let j = m.records.n - 5; j < m.records.n; j++) m.records.step[j] = m.steps - 1; });
  {
    const b = bin.slice(0, bin.length - 4);
    const t = new Uint8Array(b.length + 5); t.set(b); t[b.length] = 0;
    refuse(reseal(t), 'a byte after the end');
    const g = bin.slice(); g[5] = 0x07;          // a control character in the version string
    refuse(reseal(g), 'a control character in the header');
    const v = bin.slice(); v[3] = 0x01;
    const nine = new Uint8Array([...v.slice(0, 4 + 1 + v[4]), 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, ...v.slice(4 + 1 + v[4] + 1)]);
    refuse(reseal(nine), 'a nine-byte varint');
  }
  // Random bytes behind a valid magic and a valid checksum: refused or decoded, never thrown.
  for (let i = 0; i < 300; i++) {
    const len = 8 + Math.floor(rnd() * 600);
    const b = new Uint8Array(len);
    for (let k = 0; k < len; k++) b[k] = Math.floor(rnd() * 256);
    b[0] = 0x44; b[1] = 0x56; b[2] = 0x52; b[3] = Codec.FORMAT;
    const t = reseal(b);
    let r;
    try { r = Replay.importReplay(t); } catch (e) { r = { threw: e.message }; }
    ok(!r.threw, `5. import THREW on random bytes: ${r.threw}`);
  }
  // A valid but hostile replay: two hours of steps and no input. It decodes; playing it
  // is the viewer's time, and a budgeted seek hands control back when asked.
  {
    const m = { ...rep, steps: C.REPLAY_MAX_STEPS, records: { n: 0, step: new Int32Array(0), kind: new Uint8Array(0), code: new Uint8Array(0), val: new Float64Array(0) },
      checks: new Uint32Array(Math.floor(C.REPLAY_MAX_STEPS / rep.header.checkEvery)),
      ghost: { n: Math.floor(C.REPLAY_MAX_STEPS / rep.header.ghostEvery) + 1, x: new Int32Array(Math.floor(C.REPLAY_MAX_STEPS / rep.header.ghostEvery) + 1), y: new Int32Array(Math.floor(C.REPLAY_MAX_STEPS / rep.header.ghostEvery) + 1), pose: new Uint8Array(Math.floor(C.REPLAY_MAX_STEPS / rep.header.ghostEvery) + 1), names: ['fall'] } };
    const t = Replay.exportReplay(m);
    const a = realNow();
    const r = Replay.importReplay(t);
    const dt = realNow() - a;
    ok(r.ok, `5. a two-hour replay was refused: ${r.error}`);
    const pb = r.ok && Replay.createPlayback(r.replay);
    if (pb && pb.ok) {
      const b = realNow();
      const done = pb.playback.seekStep(C.REPLAY_MAX_STEPS, 5);
      const dt2 = realNow() - b;
      ok(!done && dt2 < 60, `5. a budgeted seek into a two-hour replay did not hand back control (${ms(dt2)})`);
      // A two-hour recording of nobody touching the keys: the rising floor takes him, and
      // the checksums (all zero here) report it at once.
      pb.playback.seekStep(240 * 60, Infinity);
      ok(pb.playback.desync !== null, '5. a replay with forged checksums played without a desync');
    }
    // ...and one that packs a full menu visit onto each of its first steps, as many as
    // the decoder's menu cap lets a two-hour file have. A budgeted seek still hands back
    // control: the clock counts the menu steps a playback step replays.
    const visits = Math.floor(Codec.menuStepCap(m.steps) / C.REPLAY_COSMETIC_CAP);
    const packed = { ...m, records: { n: visits, step: Int32Array.from({ length: visits }, (_, j) => j),
      kind: new Uint8Array(visits).fill(Codec.K_COSMETIC), code: new Uint8Array(visits), val: new Float64Array(visits).fill(C.REPLAY_COSMETIC_CAP) } };
    const rp = Replay.importReplay(Replay.exportReplay(packed));
    ok(rp.ok, `5. a file of full menu visits was refused: ${rp.error}`);
    const pp = rp.ok && Replay.createPlayback(rp.replay);
    if (pp && pp.ok) {
      let worstCall = 0;
      for (let i = 0; i < 3; i++) {
        const b = realNow();
        pp.playback.seekStep(m.steps, 5);
        worstCall = Math.max(worstCall, realNow() - b);
      }
      ok(worstCall < 60, `5. a budgeted seek through ${visits} menu visits held on for ${ms(worstCall)} a call`);
    }
    ok(worstMs < 100, `5. the slowest refusal took ${ms(worstMs)}`);
    note(`5. file: round trip exact; ${refusedN} hostile inputs refused, none thrown, slowest ${ms(worstMs)}; ${flipsSame} of 400 flipped characters decoded to the same bytes; a ${(t.length / 1000).toFixed(0)} k two-hour file decodes in ${ms(dt)} (${ms(realNow() - t0)})`);
  }
  // Chat mangling that is allowed: wrapped lines, zero-width spaces, padding, a BOM.
  {
    let w = '﻿  ';
    for (let i = 0; i < text.length; i += 70) w += text.slice(i, i + 70) + (i % 140 ? '​' : '\r\n');
    w += '==\n';
    const r = Replay.importReplay(w);
    ok(r.ok && Replay.exportReplay(r.replay) === text, `5. chat-wrapped text was refused: ${r.error}`);
  }
}

// ======================================================================================
// 6. The cosmetic streams: the same particles and lines, with no clock and no Math.random
// ======================================================================================
{
  const t0 = realNow();
  const f64 = new Float64Array(1), w32 = new Uint32Array(f64.buffer);
  const digest = (g) => {
    const P = g.particles;
    let h = 0x12345;
    const mixn = (v) => {
      f64[0] = v;
      h = Math.imul(h ^ w32[0], 0x01000193);
      h = Math.imul(h ^ w32[1], 0x01000193) >>> 0;
    };
    mixn(P.cursor); mixn(P.shedCursor); mixn(P.shedClock); mixn(P.n); mixn(P.twinkles);
    for (let i = 0; i < P.slots; i++) {
      if (!P.alive[i]) continue;
      mixn(i); mixn(P.x[i]); mixn(P.y[i]); mixn(P.vx[i]); mixn(P.vy[i]); mixn(P.life[i]); mixn(P.kind[i]); mixn(P.rot[i]);
      mixn(P.shape[i]); mixn(P.ramp[i]);
      for (let k = 0; k < P.colour[i].length; k++) mixn(P.colour[i].charCodeAt(k));
    }
    mixn(g.shakeX); mixn(g.shakeY);
    // The death line only once this run has one: a used Game still holds its last.
    const words = g.banners.map((b) => b.text).join('|') + '#' + g.floaters.map((f) => f.text).join('|')
      + '#' + (g.state === STATE.PLAYING ? '' : g.deathLine);
    for (let k = 0; k < words.length; k++) mixn(words.charCodeAt(k));
    for (const c of g.companions.active) mixn(c.bob);
    return h;
  };
  const trap = () => {
    const where = (new Error().stack || '').split('\n').slice(2, 4).map((s) => s.trim()).join(' <- ');
    throw new Error(`the simulation called Math.random, performance.now or Date.now: ${where}`);
  };
  const saved = { random: Math.random, now: performance.now, date: Date.now };
  const run = (game, bot) => {
    const out = [];
    Math.random = trap; Date.now = trap;
    Object.defineProperty(performance, 'now', { value: trap, configurable: true, writable: true });
    try {
      for (let n = 0; n < 240 * 260 && game.state !== STATE.DEAD; n++) {
        if (game.state === STATE.PLAYING) bot.step(game, STEP);
        game.step(STEP);
        out.push(digest(game));
      }
    } catch (e) {
      out.push(e.message);
    } finally {
      Math.random = saved.random; Date.now = saved.date;
      Object.defineProperty(performance, 'now', { value: saved.now, configurable: true, writable: true });
    }
    return out;
  };
  const fresh = botGame(66);
  const a = run(fresh.game, fresh.bot);
  const dirty = botGame(66, { dirty: true });
  const b = run(dirty.game, dirty.bot);
  const threw = [a, b].map((x) => x.find((v) => typeof v === 'string')).find(Boolean);
  ok(!threw, `6. ${threw}`);
  let first = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { first = i; break; }
  ok(first < 0, `6. the particles, shake or lines of two runs of one seed differ from step ${first + 1}`);
  const lines = fresh.game.deathLine;
  note(`6. cosmetic: ${a.length} steps, particles, shake, lines and bob identical on a fresh and a used Game with Math.random, performance.now and Date.now throwing; the death line '${lines}' (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 7. Seeking: restored copies, the menu-step cap, and the numbers
// ======================================================================================
if (botReplay) {
  const t0 = realNow();
  // A restored copy plays on exactly as the game it was copied from.
  const back = Replay.importReplay(botText).replay;
  const straight = Replay.createPlayback(back).playback;
  const seeker = Replay.createPlayback(back).playback;
  while (seeker.step());
  const kfs = [...seeker.keyframes.keys()].sort((x, y) => x - y);
  ok(kfs.length >= 3, `7. playback kept only ${kfs.length} keyframes over ${seeker.stepIndex} steps`);
  const at = kfs[Math.floor(kfs.length / 2)] || 0;
  seeker.seekStep(at);
  straight.seekStep(at);
  let bad = diffGames(straight.game, seeker.game, true);
  let n = 0;
  while (!bad && !straight.done) {
    straight.step(); seeker.step(); n++;
    bad = diffGames(straight.game, seeker.game, n % 32 === 0);
  }
  ok(!bad, `7. a game restored at step ${at} differs from the straight one ${n} steps later: ${bad}`);
  ok(seeker.done && seeker.desync === null, '7. the restored playback did not reach the end cleanly');
  // ...and the recorder's own copies of the live game, which the instant replay starts from.
  const live = botReplay.keyframes;
  ok(live.length === Math.min(C.REPLAY_LIVE_KEYFRAMES, Math.floor(botReplay.steps / C.REPLAY_KEYFRAME_EVERY)), `7. the recorder kept ${live.length} live keyframes`);
  if (live.length) {
    const L = Replay.createPlayback(botReplay).playback, S = Replay.createPlayback(back).playback;
    const s = live[0].step;
    L.seekStep(s); S.seekStep(s);
    ok(L.keyframes.has(s), '7. the live keyframes were not taken up by the playback');
    let d = diffGames(S.game, L.game, true), m = 0;
    while (!d && !S.done) { S.step(); L.step(); m++; d = diffGames(S.game, L.game, m % 32 === 0); }
    ok(!d, `7. a live keyframe differs from the replayed game: ${d}`);
  }
  // Menu steps past the cap change nothing.
  try {
    const { game, bot } = botGame(77);
    for (let k = 0; k < 240 * 20 && game.state === STATE.PLAYING; k++) { bot.step(game, STEP); game.step(STEP); }
    const one = snapshot(game), two = snapshot(game);
    one.input = two.input = game.input;
    for (const [g, extra] of [[one, 0], [two, 700]]) {
      g.state = STATE.OPTIONS;
      for (let k = C.REPLAY_COSMETIC_CAP + extra; k > 0; k--) g.step(STEP);
    }
    ok(!diffGames(one, two, true), `7. ${C.REPLAY_COSMETIC_CAP} menu steps have not settled everything they touch: ${diffGames(one, two, true)}`);
  } catch (e) {
    ok(false, `7. the game cannot be copied: ${e.message}`);
  }
  // A restored copy must not slow the live game. The first copies were built a property
  // at a time with computed keys, which V8 turns into hash tables past a dozen: restored
  // games stepped at 33 us and the live game, sharing their code, at 19 us instead of 3.
  let after = Infinity;
  for (let i = 0; i < 2; i++) { const x = timeRun(false, 240 * 120, DEMO_SEEDS[1]); after = Math.min(after, (x.t / x.n) * 1e6); }
  ok(after < 2.5 * baseStepNs, `7. after the seeks the live game steps at ${after.toFixed(0)} ns, against ${baseStepNs.toFixed(0)} before them`);
  note(`7. seek: a copy restored at step ${at} and one of the live game played on identically; ${C.REPLAY_COSMETIC_CAP} menu steps settle everything; ` +
    `the live game steps at ${after.toFixed(0)} ns after the seeks, ${baseStepNs.toFixed(0)} before (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 8. The store
// ======================================================================================
{
  const t0 = realNow();
  let date = 1e12;
  let quotaNote = '';
  const fake = (score, floor = 10, seconds = 60, bulk = 0) => {
    const n = bulk;
    const steps = 8 * (n + 2);
    const R = { n, step: new Int32Array(n), kind: new Uint8Array(n), code: new Uint8Array(n), val: new Float64Array(n) };
    for (let j = 0; j < n; j++) { R.step[j] = j; R.kind[j] = Codec.K_IDLE; R.val[j] = j * 0.37; }
    const gn = Math.floor(steps / 8) + 1;
    return {
      format: 1,
      header: { gameVersion: '1.0.0', simVersion: 1, constHash: 1, probeHash: 2, seed: 7, demo: false, companions: 'hop', budget: 900, date: date++, checkEvery: 240, ghostEvery: 8, ghostQ: 8 },
      steps, result: { floor, score, seconds, zone: 0, ended: 'fire' }, finalCheck: 0,
      records: R, checks: new Uint32Array(Math.floor(steps / 240)),
      ghost: { n: gn, x: new Int32Array(gn), y: new Int32Array(gn), pose: new Uint8Array(gn), names: ['fall'] },
      invalid: null,
    };
  };
  const mk = (limit = Infinity, budget = Infinity) => {
    const be = Store.memoryBackend(limit);
    return { be, st: new Store.ReplayStore(be, { encode: Replay.exportReplay, decode: Replay.importReplay, budget, bestKept: 10 }) };
  };

  // Last run + ten best, by the documented order.
  {
    const { st } = mk();
    const r = mulberry32(5);
    const saved = [];
    for (let i = 0; i < 30; i++) { const f = fake(Math.floor(r() * 1000) * 10); const s = st.save(f, 'own'); saved.push({ s, f }); }
    const list = st.list();
    const lastId = saved[29].s.id;
    const want = saved.map((x) => ({ id: x.s.id, score: x.f.result.score, floor: 10, seconds: 60, date: x.f.header.date })).sort(Store.rankOrder).slice(0, 10).map((e) => e.id);
    const ranked = list.filter((e) => e.rank).sort((a, b) => a.rank - b.rank).map((e) => e.id);
    ok(JSON.stringify(ranked) === JSON.stringify(want), '8. the ten best are not the ten highest scores in rank order');
    ok(list.some((e) => e.id === lastId && e.last), '8. the last run is not kept');
    ok(list.length === 10 + (want.includes(lastId) ? 0 : 1), `8. ${list.length} replays kept, not the last run and ten best`);
    ok(list.every((e) => st.load(e.id).ok), '8. a kept replay does not load');
  }
  // Ties: score, then floor, then fewer seconds, then the earlier run.
  {
    const { st } = mk();
    const a = st.save(fake(500, 20, 90), 'own').id;
    const b = st.save(fake(500, 30, 90), 'own').id;
    const c = st.save(fake(500, 30, 70), 'own').id;
    const d = st.save(fake(500, 30, 70), 'own').id;
    const order = st.list().filter((e) => e.rank).sort((x, y) => x.rank - y.rank).map((e) => e.id);
    ok(JSON.stringify(order) === JSON.stringify([c, d, b, a]), `8. ties ranked ${order.join(',')}, not ${[c, d, b, a].join(',')}`);
  }
  // The score's scale (Store.SCORE_SCALE_SINCE): runs from before it scored hundreds of
  // millions, and ranked on score they would hold every place among the ten best for good,
  // the best of them protected from eviction. Every run on the current scale ranks first.
  {
    const { st } = mk();
    const era = (score, v) => { const f = fake(score); f.header.simVersion = v; return f; };
    const old = [];
    for (let i = 0; i < 10; i++) old.push(st.save(era(300000000 + i, Store.SCORE_SCALE_SINCE - 1), 'own').id);
    const now = st.save(era(459960, Store.SCORE_SCALE_SINCE), 'own').id;
    const first = st.list().find((e) => e.id === now);
    ok(first && first.rank === 1, `8. a run on the current score scale ranks ${first && first.rank} below ten of hundreds of millions from before it`);
    for (let i = 0; i < 10; i++) st.save(era(1000 + i, Store.SCORE_SCALE_SINCE), 'own');
    const li = st.list();
    ok(old.every((id) => !li.some((e) => e.id === id && e.rank)), '8. a run from before the score scale still holds a place among the ten best');
  }
  // Pinned and imported.
  {
    const { st } = mk();
    const low = st.save(fake(1), 'own').id;
    ok(st.pin(low, true), '8. pin failed');
    for (let i = 0; i < 15; i++) st.save(fake(1000 + i), 'own');
    ok(st.list().some((e) => e.id === low && e.pinned), '8. a pinned run was evicted');
    const imp = st.save(fake(99999), 'imported');
    const li = st.list();
    const e = li.find((x) => x.id === imp.id);
    ok(e && e.pinned && e.origin === 'imported' && e.rank === 0, '8. an imported replay is not kept pinned, or counts among the bests');
    ok(st.pin(imp.id, false) && !st.list().some((x) => x.id === imp.id), '8. unpinning an import did not let it go');
    ok(st.remove(low) && !st.list().some((x) => x.id === low) && !st.load(low).ok, '8. remove did not remove');
  }
  // The budget: lowest ranks first, then the last run; never the best or a pinned one.
  {
    const size = Replay.exportReplay(fake(1, 1, 1, 200)).length;
    const { st } = mk(Infinity, size * 4 + 10);
    const best = st.save(fake(900, 1, 1, 200), 'own').id;
    const ids = [];
    for (let i = 0; i < 8; i++) ids.push(st.save(fake(100 + i, 1, 1, 200), 'own').id);
    // Scores 900, 107, 106, 105 fit; 107 is also the last run.
    const li = st.list();
    const want = [best, ids[7], ids[6], ids[5]];
    ok(JSON.stringify(li.map((e) => e.id)) === JSON.stringify(want), `8. over budget kept ${li.map((e) => e.id).join(',')}, not the four best ${want.join(',')}`);
    // A low run as the last one: the lowest best goes to make room for it, not the best.
    const low = st.save(fake(1, 1, 1, 200), 'own').id;
    const li2 = st.list();
    const want2 = [best, ids[7], ids[6], low];
    ok(JSON.stringify(li2.map((e) => e.id)) === JSON.stringify(want2), `8. over budget with a low last run kept ${li2.map((e) => e.id).join(',')}, not ${want2.join(',')}`);
    const pin = ids[6];
    st.pin(pin, true);
    for (let i = 0; i < 5; i++) st.save(fake(500 + i, 1, 1, 200), 'own');
    ok(st.list().some((e) => e.id === pin) && st.list().some((e) => e.id === best), '8. over budget a pinned run or the best was evicted');
  }
  // Quota errors never cost the best run.
  {
    const r = mulberry32(31);
    const { be, st } = mk(60000);
    let quota = 0;
    const set = be.set;
    be.set = (k, v) => { try { return set(k, v); } catch (e) { quota++; throw e; } };
    let champion = null, champ = null, lost = 0, notKept = 0;
    for (let i = 0; i < 250; i++) {
      const f = fake(Math.floor(r() * 5000), 10, 60, Math.floor(r() * 900));
      const s = st.save(f, 'own');
      if (!s.kept) notKept++;
      if (s.kept && (!champ || Store.rankOrder({ ...f.result, date: f.header.date, id: s.id }, champ) < 0)) {
        champion = s.id;
        champ = { ...f.result, date: f.header.date, id: s.id };
      }
      if (champion && !(st.list().some((e) => e.id === champion) && st.load(champion).ok)) lost++;
    }
    ok(lost === 0, `8. the best run was lost to a quota error ${lost} times`);
    ok(quota > 20, `8. the quota was hit only ${quota} times, so this proved little`);
    quotaNote = `${quota} quota errors, ${notKept} saves not kept`;
    // One too big to fit at all, a new best and a low one: refused, and costing nothing. The
    // candidates each let go for room are written back -- they used to stay deleted, so a
    // save that failed anyway took the second to tenth best runs and the last one with it.
    for (const score of [1e9, 1]) {
      const had = st.list().map((e) => e.id);
      const huge = st.save(fake(score, 10, 60, 6000), 'own');
      ok(!huge.kept && st.load(champion).ok, '8. a replay larger than the quota was kept, or cost the best run');
      const now = st.list().map((e) => e.id);
      const gone = had.filter((id) => !now.includes(id) || !st.load(id).ok);
      ok(gone.length === 0 && now.length === had.length, `8. a save refused for the quota (score ${score}) cost ${gone.length} of ${had.length} replays: ${gone.join(',')}`);
    }
    ok(be.used <= 60000, '8. the store wrote past the quota');
  }
  // A crash between a save's two writes, and a corrupt index.
  {
    const { be, st } = mk();
    const a = st.save(fake(10), 'own').id;
    be.set(Store.TEXT_PREFIX + 'o9z', Replay.exportReplay(fake(20)));     // text written, index not
    be.set(Store.TEXT_PREFIX + 'i9y', 'DVR1:garbage');                     // and one that is broken
    const li = st.list();
    ok(li.some((e) => e.id === 'o9z' && e.origin === 'own') && li.some((e) => e.id === a), '8. an orphaned text was not adopted');
    ok(be.get(Store.TEXT_PREFIX + 'i9y') === null, '8. an orphan that does not decode was not deleted');
    be.set(Store.INDEX_KEY, '{"entries": [ {"id": "o1", "score": "lots"} ], "next": -4');
    ok(st.list().length === 2, '8. a corrupt index was not rebuilt from the texts');
    ok(!st.load('../../x').ok && !st.load(null).ok, '8. a bad id loaded something');
    be.set(Store.TEXT_PREFIX + a, be.get(Store.TEXT_PREFIX + a).slice(0, -3) + 'AAA');
    ok(!st.load(a).ok, '8. a damaged stored text loaded');
  }
  // A replay that encodes but would not load back is not kept, and costs nothing kept.
  {
    const { be, st } = mk();
    const a = st.save(fake(10), 'own').id;
    const keys = be.keys().length;
    const big = fake(1e6);
    big.steps = C.REPLAY_MAX_STEPS + 8;
    big.checks = new Uint32Array(Math.floor(big.steps / 240));
    const gn = Math.floor(big.steps / 8) + 1;
    big.ghost = { n: gn, x: new Int32Array(gn), y: new Int32Array(gn), pose: new Uint8Array(gn), names: ['fall'] };
    const s = st.save(big, 'own');
    ok(!s.kept && be.keys().length === keys && st.list().length === 1 && st.list()[0].id === a,
      `8. a replay that would not load back was kept (${s.error})`);
  }
  // The list says which replays this build plays, without decoding them.
  {
    Replay.setReplayBackend(Store.memoryBackend());
    const mine = Replay.saveRun(botReplay);
    const other = Replay.storeImported(fake(5));
    const li = Replay.listReplays();
    const p = (id) => (li.find((e) => e.id === id) || {}).playable;
    ok(mine.kept && other.kept && p(mine.id) === true && p(other.id) === false,
      `8. listReplays: this build's replay playable ${p(mine.id)}, another build's ${p(other.id)}`);
    const back = Replay.loadReplay(mine.id);
    ok(back.ok && back.compatible, '8. a saved run did not load back as playable');
  }
  note(`8. store: last run + ten best, ties, pinned and imported, the budget, 250 saves under a quota with the best never lost (${quotaNote}), crash recovery (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 9. The instant replay of a game wearing main.js's hooks
// ======================================================================================
// main.js hangs the stats, the sounds and the music on the live game: on* callbacks, and
// handleEvents and step replaced by wrappers bound to the live game (render/gamesounds.js
// wraps both). The recorder's copies of that game are what the instant replay starts from,
// and every other test's game had no hooks.
{
  const t0 = realNow();
  const { game, bot } = botGame(44);
  const calls = { events: 0, steps: 0, death: 0, other: 0 };
  game.onDeath = () => { calls.death++; };
  for (const k of ['onAnnounce', 'onCompanionJoin', 'onCompanionSlip', 'onFallStart', 'onImpact', 'onFallWallHit']) game[k] = () => { calls.other++; };
  const orig = game.handleEvents.bind(game);
  game.handleEvents = function () { calls.events++; orig(); };
  const origStep = game.step.bind(game);
  game.step = function (dt) { calls.steps++; origStep(dt); };
  const rec = Replay.startRecording(game);
  while (game.state === STATE.PLAYING) { bot.step(game, STEP); game.step(STEP); }
  const rep = rec.finish();
  ok(calls.death === 1 && calls.events > 0 && calls.steps > 0, '9. the hooks were not called in the run itself');
  ok(rep.keyframes.length > 0, '9. the recorder kept no copies of the live game');
  const before = JSON.stringify(calls);
  let games = 0, threw = null, d = null, n = 0, pb = null;
  try {
    pb = Replay.createPlayback(rep, { onGame: () => { games++; } }).playback;
    pb.seekTime(Replay.durationOf(rep) - 10);          // a restore from a copy of the live game
    const straight = Replay.createPlayback(Replay.importReplay(Replay.exportReplay(rep)).replay).playback;
    straight.seekStep(pb.stepIndex);
    d = diffGames(straight.game, pb.game, true);
    while (!d && !straight.done) { straight.step(); pb.step(); n++; d = diffGames(straight.game, pb.game, n % 8 === 0); }
  } catch (e) {
    threw = e.message;
  }
  ok(!threw, `9. the instant replay threw: ${threw}`);
  ok(!d, `9. the instant replay differs from the straight playback ${n} steps after the restore: ${d}`);
  ok(pb && pb.done && pb.desync === null && pb.game.state === STATE.DEAD, '9. the instant replay did not reach the scoreboard cleanly');
  ok(JSON.stringify(calls) === before, `9. the playback called the live game's hooks: ${before} -> ${JSON.stringify(calls)}`);
  ok(games === 2, `9. onGame was called ${games} times, not at the start and at the restore`);
  note(`9. instant replay with main.js's hooks on the live game: restored ${(Replay.durationOf(rep) - 10).toFixed(1)} s in, ${n} steps to the scoreboard as the straight playback, no live hook called (${ms(realNow() - t0)})`);
}

// ======================================================================================
// 10. A recording that reaches its length limit
// ======================================================================================
{
  const { input, game, bot } = botGame(22);
  const rec = Replay.startRecording(game, { maxSteps: 1000 });
  for (let n = 0; n < 1500 && game.state === STATE.PLAYING; n++) { bot.step(game, STEP); game.step(STEP); }
  ok(rec.sealed && rec.steps === 1000 && game.state === STATE.PLAYING, `10. the recording did not stop at 1000 steps (${rec.steps}, ${game.state})`);
  const rep = rec.finish();
  ok(rep.result.ended === 'cut' && rep.steps === 1000 && game.input === input, `10. a cut recording ended '${rep.result.ended}' at ${rep.steps}`);
  const back = roundTrip(rep);
  if (back) {
    const pb = Replay.createPlayback(back).playback;
    while (pb.step());
    ok(pb.done && pb.stepIndex === 1000 && pb.desync === null, `10. a cut replay played to ${pb.stepIndex} (desync ${JSON.stringify(pb.desync)})`);
  }
  // A recording never finished before the next run: the next one replaces it, not wraps it.
  {
    game.newRun(5);
    const r1 = Replay.startRecording(game);
    for (let n = 0; n < 100; n++) { bot.step(game, STEP); game.step(STEP); }
    game.newRun(6);
    const r2 = Replay.startRecording(game);
    ok(game.input === r2 && r2.inner === input && r1.finish().invalid, '10. a second recording wrapped the unfinished first one');
    r2.cancel();
    ok(game.input === input, '10. cancel() did not hand the input back');
  }
  note('10. a recording that reaches its limit ends there as \'cut\' and plays back; one left unfinished is replaced by the next');
}

const secs = ((realNow() - T_START) / 1000).toFixed(1);
if (failed) {
  console.log(`\n  ${failed} replay check(s) FAILED in ${secs} s`);
  process.exit(1);
}
console.log(`  replays: record, file, fingerprint, playback, seek and store all hold (${secs} s)`);
