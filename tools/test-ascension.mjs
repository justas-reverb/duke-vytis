// ZENITH's ascension: a tenth higher and a tenth swifter for beating the top of the tower.
//
// (The aura that came with it -- the combo's stages burning round him -- is parked on the
// branch park/aura with its own checks, this suite's sections 5 and 6 there: "remove the aura
// glow and park it", 2026-09-28.)
//
// "have the duke go into sort of super saiyan stages and glowing all around him during the
// different stages if he keeps a combo through them. if we beat zenith he should get a 2x
// bounce and speed boost and again if he manages to beat it." (2026-09-28) Then, of the
// attract bot past 2300: "the bot in the background seems to be going at supersonic and not
// bound by the rules of the game ... can we have a 1.10x speed increase instead of literally
// doubling it?" (2026-09-29): each lap is a tenth more of both now (constants.js ASCENSION).
//
// THE ASCENSION (Game.ascend, constants.js ASCENT_*):
//   1. THE LAPS. The run's best floor reaching the top of a lap -- CYCLE_FLOORS, 2300, where
//      GLORY is called -- is level 1: his bounce the root of ASCENT_BOUNCE, his clock JUMP
//      SPEED times ASCENT_SPEED; 4600 is level 2, both again; 6900 is still level 2
//      (ASCENT_LAPS). Below 2300 nothing is changed. The run's JUMP SPEED (game.jumpSpeed,
//      which the scoreboard and a replay's header say) stays the one it was started at. And
//      the factors are the user's: 1.1 of height and 1.1 of clock a lap, two laps.
//   2. THE JUMP. A standing jump rises ASCENT_BOUNCE times as high at level 1 and its square at
//      level 2 (within 1%), and is in the air sqrt(bounce)/speed as long in the world's steps
//      -- the height a tenth more, the clock a tenth quicker.
//   3. THE WORDS. The herald says the pair of ASCENT_LINES for the level, head over tail, and
//      no number in either (they said BOUNCE X2 and X4, and were wrong the day the constants
//      moved); the HUD's line (flavour.js ascentWords) says the bounce and the speed to two
//      places -- BOUNCE X1.1  SPEED X1.1, then X1.21 -- and the HUD draws it, top centre,
//      only once he has ascended.
//   4. A REPLAY across it: the attract demo's run past floor 2300 (autoplay.js startDemo, the
//      game's defaults on the real tower) recorded, exported and imported, played back
//      identically every step it climbed, the ascension in the same step.
//
//   node tools/test-ascension.mjs                  the checks
//   node tools/test-ascension.mjs --mutant=NAME    against a copy of src/ with MUTANTS[NAME]; must FAIL
//   node tools/test-ascension.mjs --mutants        every mutant in turn, one process each

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice('--mutant='.length) || null;

// ---- mutants: [file under src/, from, to] -----------------------------------------------
const MUTANTS = {
  // 2: the jump no higher ascended
  'no-bounce': [['game/player.js', '+ this.momentum * JUMP_MOMENTUM_BONUS) * this.bounce;', '+ this.momentum * JUMP_MOMENTUM_BONUS);']],
  // 2: the bounce on the impulse, so the HEIGHT goes x4 and x16
  'bounce-on-impulse': [['game/game.js', 'p.bounce = Math.sqrt(ASCENT_BOUNCE ** level);', 'p.bounce = ASCENT_BOUNCE ** level;']],
  // 1: his clock untouched
  'no-speed': [['game/game.js', 'p.rate = this.run.jumpSpeed * ASCENT_SPEED ** level;', '']],
  // 1: a third lap counts
  'no-cap': [['game/game.js', 'const level = Math.min(ASCENT_LAPS, Math.floor(this.run.maxFloor / CYCLE_FLOORS));', 'const level = Math.floor(this.run.maxFloor / CYCLE_FLOORS);']],
  // 1: the scoreboard and the header would say the quickened clock
  'jumpSpeed-is-clock': [['game/game.js', 'get jumpSpeed() { return this.run ? this.run.jumpSpeed : this.player.rate; }', 'get jumpSpeed() { return this.player.rate; }']],
  // 3: the herald silent
  'no-herald': [['game/game.js', "    this.banner(head, '#ffffff', false, 3.2);\n", '']],
  // 3: the HUD's line never drawn
  'no-hud-line': [['ui/hud.js', '  if (game.ascent > 0) {\n    skinText(', '  if (false) {\n    skinText(']],
  // 1: the doubling the user asked to be rid of, back
  'doubling': [['game/constants.js', 'export const ASCENT_BOUNCE = 1.1;', 'export const ASCENT_BOUNCE = 2;'],
    ['game/constants.js', 'export const ASCENT_SPEED = 1.1;', 'export const ASCENT_SPEED = 1.25;']],
  // 3: a herald's line that says a number, as they used to
  'herald-numbers': [['game/flavour.js', "['THOU ART ASCENDED', 'HIGHER AND SWIFTER'],", "['THOU ART ASCENDED', 'BOUNCE X2 AND SWIFTER'],"]],
  // 3: the HUD's factors unrounded: X1.2100000000000002 at the second lap
  'hud-unrounded': [['game/flavour.js', 'const two = (x) => Math.round(x * 100) / 100;', 'const two = (x) => x;']],
};

if (argv.includes('--mutants')) {
  let bad = 0;
  for (const name of Object.keys(MUTANTS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--mutant=' + name], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const didNot = /DID NOT APPLY/.test(out);
    const fails = (out.match(/^ {2}FAIL .*/gm) || []).map((l) => l.trim().slice(5, 90));
    const caught = r.status === 1 && !didNot;
    if (!caught) bad++;
    console.log(`  ${caught ? 'caught' : 'MISSED'} ${name.padEnd(20)} ${didNot ? 'DID NOT APPLY' : fails.length + ' checks failed: ' + (fails[0] || '(exit ' + r.status + ')')}`);
  }
  console.log(bad ? `\n  ${bad} mutant(s) not caught` : `\n  every mutant caught (${Object.keys(MUTANTS).length})`);
  process.exit(bad ? 1 : 0);
}

let SRC = path.join(REPO, 'src');
if (MUTANT) {
  const patches = MUTANTS[MUTANT];
  if (!patches) { console.log(`no mutant ${MUTANT}`); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ascent-mut-'));
  fs.cpSync(SRC, path.join(tmp, 'src'), { recursive: true });
  for (const [file, from, to] of patches) {
    const f = path.join(tmp, 'src', file);
    const text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    if (!text.includes(from)) { console.log(`  DID NOT APPLY: ${MUTANT} (${file})`); process.exit(2); }
    fs.writeFileSync(f, text.replace(from, to));
  }
  SRC = path.join(tmp, 'src');
  console.log(`  mutant ${MUTANT}: src/ copied to ${tmp} and patched`);
}
const mod = (p) => import(pathToFileURL(path.join(SRC, p)).href);

let pass = 0, failed = 0;
function check(cond, label, detail = '') {
  if (cond) { pass++; console.log('  ok   ' + label); } else { failed++; console.log('  FAIL ' + label + (detail ? '   ' + detail : '')); }
  return cond;
}
const t0 = Date.now();

const C = await mod('game/constants.js');
const { Game, STATE } = await mod('game/game.js');
const { Player } = await mod('game/player.js');
const { CYCLE_FLOORS } = await mod('game/themes.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await mod('game/autoplay.js');
const { STEP } = await mod('core/loop.js');
const F = await mod('game/flavour.js');
const Replay = await mod('game/replay.js');
const { drawHud } = await mod('ui/hud.js');
const Stats = await mod('game/stats.js');

const SPEED = 1.2;
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);

/** A run with the shaft open and the Duke standing on `floor`, the best floor one under it. */
function standOn(game, floor, best = floor - 1) {
  game.openness = 1; game.arenaEase = C.ARENA_HALF_MAX; game.arenaHalfView = C.ARENA_HALF_MAX;
  game.zoom = game.zoomView = 1; game.viewH = C.VH;
  game.tower.setBounds(C.PLAY_L, C.PLAY_R); game.player.setBounds(C.PLAY_L, C.PLAY_R);
  game.tower.ensure(floor + 12);
  const pl = game.tower.get(floor), p = game.player;
  p.x = p.px = pl.x + pl.w / 2; p.y = p.py = pl.y; p.floor = floor; p.vx = 0; p.vy = 0; p.grounded = true;
  game.run.maxFloor = best;
  game.camY = p.y - game.viewH * C.CAM_ANCHOR;
  game.riseY = p.y - 400;
}

// ---- 1. the laps ------------------------------------------------------------------------
console.log('\n  1. the laps');
{
  const g = new Game(new AutoInput());
  g.newRun(4242, null, SPEED, 0.75, 1);
  const p = g.player;
  check(g.ascent === 0 && p.bounce === 1 && p.rate === SPEED, `a new run: level ${g.ascent}, bounce ${p.bounce}, clock ${p.rate}`);
  standOn(g, CYCLE_FLOORS - 1, CYCLE_FLOORS - 2);
  g.step(STEP);
  check(g.ascent === 0 && p.bounce === 1 && p.rate === SPEED, `on floor ${CYCLE_FLOORS - 1}, a floor under ZENITH's top: nothing yet (level ${g.ascent})`);
  standOn(g, CYCLE_FLOORS);
  g.step(STEP);
  const b1 = Math.sqrt(C.ASCENT_BOUNCE), r1 = SPEED * C.ASCENT_SPEED;
  check(g.ascent === 1 && Math.abs(p.bounce - b1) < 1e-12 && Math.abs(p.rate - r1) < 1e-12,
    `on floor ${CYCLE_FLOORS}, ZENITH beaten: level ${g.ascent}, bounce ${p.bounce.toFixed(4)} (sqrt ${C.ASCENT_BOUNCE}), clock ${p.rate.toFixed(4)} (${SPEED} x ${C.ASCENT_SPEED})`);
  check(g.jumpSpeed === SPEED, `the run's JUMP SPEED is still ${g.jumpSpeed} (the setting it was started at)`);
  standOn(g, 2 * CYCLE_FLOORS);
  g.step(STEP);
  const b2 = Math.sqrt(C.ASCENT_BOUNCE ** 2), r2 = SPEED * C.ASCENT_SPEED ** 2;
  check(g.ascent === 2 && Math.abs(p.bounce - b2) < 1e-12 && Math.abs(p.rate - r2) < 1e-12,
    `on floor ${2 * CYCLE_FLOORS}, beaten again: level ${g.ascent}, bounce ${p.bounce.toFixed(4)}, clock ${p.rate.toFixed(4)}`);
  standOn(g, 3 * CYCLE_FLOORS + 5);
  let threw = null;
  try { g.step(STEP); } catch (e) { threw = e; }
  check(!threw && g.ascent === C.ASCENT_LAPS && Math.abs(p.bounce - b2) < 1e-12 && Math.abs(p.rate - r2) < 1e-12,
    `on floor ${3 * CYCLE_FLOORS + 5}, a third lap: still level ${g.ascent} (ASCENT_LAPS ${C.ASCENT_LAPS})` + (threw ? `; the step threw: ${threw.message}` : ''));
  g.newRun(4242, null, SPEED, 0.75, 1);
  check(g.ascent === 0 && g.player.bounce === 1 && g.player.rate === SPEED, 'and the next run starts un-ascended');
  check(C.ASCENT_BOUNCE === 1.1 && C.ASCENT_SPEED === 1.1 && C.ASCENT_LAPS === 2,
    `a lap beaten is x${C.ASCENT_BOUNCE} of height and x${C.ASCENT_SPEED} of clock, ${C.ASCENT_LAPS} laps: the user's 1.1, not the doubling`);
}

// ---- 2. the jump ------------------------------------------------------------------------
console.log('\n  2. the jump');
{
  // A standing jump off an endless floor, the key held to the top.
  const ground = { x: -5000, w: 10000, y: 0 };
  const tower = { get: (n) => (n === 0 ? ground : null), peek: (n) => (n === 0 ? ground : null) };
  const fly = (level) => {
    const p = new Player();
    p.reset(); p.setBounds(-5000, 5000);
    p.bounce = Math.sqrt(C.ASCENT_BOUNCE ** level);
    p.rate = SPEED * C.ASCENT_SPEED ** level;
    let pressed = true;
    const input = { axis: 0, jumpHeld: true, consumeJump() { const was = pressed; pressed = false; return was; }, step() {} };
    let top = 0, steps = 0, left = false;
    for (let i = 0; i < 4000; i++) {
      p.step(STEP, input, tower);
      if (p.y > top) top = p.y;
      if (!p.grounded) left = true;
      steps++;
      if (left && p.grounded) break;
    }
    return { top, steps };
  };
  const j0 = fly(0), j1 = fly(1), j2 = fly(2);
  check(near(j1.top / j0.top, C.ASCENT_BOUNCE, 0.01) && near(j2.top / j0.top, C.ASCENT_BOUNCE ** 2, 0.01),
    `a standing jump rises ${j0.top.toFixed(1)}, ${j1.top.toFixed(1)} and ${j2.top.toFixed(1)} world units: x${(j1.top / j0.top).toFixed(3)} and x${(j2.top / j0.top).toFixed(3)} (x${C.ASCENT_BOUNCE}, x${+(C.ASCENT_BOUNCE ** 2).toFixed(4)})`);
  const want1 = Math.sqrt(C.ASCENT_BOUNCE) / C.ASCENT_SPEED, want2 = C.ASCENT_BOUNCE / C.ASCENT_SPEED ** 2;
  check(Math.abs(j1.steps - j0.steps * want1) <= 2 && Math.abs(j2.steps - j0.steps * want2) <= 2,
    `in the air ${j0.steps}, ${j1.steps} and ${j2.steps} steps: x${(j1.steps / j0.steps).toFixed(3)} and x${(j2.steps / j0.steps).toFixed(3)} (sqrt(bounce) / speed: x${want1.toFixed(3)}, x${want2.toFixed(3)})`);
}

// ---- 3. the words -----------------------------------------------------------------------
console.log('\n  3. the words');
{
  const g = new Game(new AutoInput());
  g.newRun(4242, null, SPEED, 0.75, 1);
  standOn(g, CYCLE_FLOORS);
  g.banners.length = 0;
  g.step(STEP);
  const said = g.banners.map((b) => b.text);
  const [head, tail] = F.ASCENT_LINES[0];
  // The stack draws the newest at its top: the head is pushed after the tail. (Other lines
  // may come in the same step -- staged here, the squeeze's first warning does.)
  const hi = said.indexOf(head), ti = said.indexOf(tail);
  check(hi >= 0 && ti >= 0 && hi > ti,
    `at the ascension the herald says '${head}' over '${tail}' (${JSON.stringify(said)})`);
  const numbered = F.ASCENT_LINES.flat().filter((l) => /\d/.test(l));
  check(!numbered.length && F.ASCENT_LINES.length === C.ASCENT_LAPS,
    `each lap's pair says no number, one pair a lap (${JSON.stringify(F.ASCENT_LINES)})` + (numbered.length ? `; numbers in ${JSON.stringify(numbered)}` : ''));
  const w1 = F.ascentWords(1, C.ASCENT_BOUNCE, C.ASCENT_SPEED), w2 = F.ascentWords(2, C.ASCENT_BOUNCE, C.ASCENT_SPEED);
  check(w1 === 'BOUNCE X1.1  SPEED X1.1' && w2 === 'BOUNCE X1.21  SPEED X1.21' && F.ascentWords(0, 1.1, 1.1) === '',
    `the HUD's line: '${w1}', then '${w2}'`);
  // Drawn, top centre, only once ascended: the HUD over a blank canvas, level 0 against 1.
  const cv = new HeadlessCanvas(C.SW, C.SH), ctx = cv.getContext('2d');
  const hudAt = (level) => {
    cv.data.fill(0);
    ctx.setTransform(C.PX, 0, 0, C.PX, 0, 0);
    g.ascent = level;
    drawHud(ctx, g, Stats.BLANK_ALL(), 0.2);
    let n = 0;
    for (let y = 0; y < 16 * C.PX; y++) for (let x = (C.VW / 2 - 80) * C.PX; x < (C.VW / 2 + 80) * C.PX; x++) if (cv.data[(y * C.SW + x) * 4 + 3]) n++;
    return n;
  };
  const none = hudAt(0), one = hudAt(1);
  check(none === 0 && one > 500, `the HUD draws it at the top centre once ascended (${one} pixels there; ${none} before)`);
}

// ---- 4. a replay across it --------------------------------------------------------------
console.log('\n  4. a replay across it');
{
  // The attract demo as the menu starts it: the real tower at the game's defaults, which the
  // bot takes past floor 2300 in about a minute and a half.
  const input = new AutoInput(), g = new Game(input), bot = new AutoPlayer(input);
  startDemo(g, DEMO_SEEDS[0]);
  const rec = Replay.startRecording(g);
  const digest = (q) => [q.player.x, q.player.y, q.player.vx, q.player.vy, q.player.rate, q.camY, q.score, q.ascent];
  const log = [];
  let ascendedAt = -1;
  for (let n = 0; n < 240 * 200 && g.state === STATE.PLAYING; n++) {
    bot.step(g, STEP);
    g.step(STEP);
    log.push(digest(g));
    if (ascendedAt < 0 && g.ascent > 0) ascendedAt = n;
    if (ascendedAt >= 0 && n > ascendedAt + 240 * 5) break;
  }
  const rep = rec.finish();
  const text = Replay.exportReplay(rep);
  const back = Replay.importReplay(text);
  check(ascendedAt > 0 && back.ok && back.compatible,
    `the attract demo ascended at step ${ascendedAt} (floor ${g.run.maxFloor} by the end); recorded, exported (${text.length} chars) and imported: ok ${back.ok}, compatible ${back.compatible}`, back.error || '');
  let first = -1, ascendBack = -1, desync = null, ran = 0;
  if (back.ok) {
    const made = Replay.createPlayback(back.replay);
    if (made.ok) {
      const pb = made.playback;
      for (let i = 0; i < log.length; i++) {
        if (pb.game.state !== STATE.PLAYING) { first = i; break; }
        pb.step(); ran++;
        const d = digest(pb.game);
        if (first < 0 && d.some((v, j) => v !== log[i][j])) first = i;
        if (ascendBack < 0 && pb.game.ascent > 0) ascendBack = i;
      }
      while (pb.step()) { /* to the end: the checksums */ }
      desync = pb.desync;
    }
  }
  check(ran === log.length && first < 0 && !desync && ascendBack === ascendedAt,
    `played back: every one of ${log.length} steps the run's own (his place, speed and clock, the camera, the score, the level), no desync, ascending in step ${ascendBack}`,
    `first difference at step ${first}, desync ${JSON.stringify(desync)}`);
}

console.log(`\n  ${pass} passed, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
