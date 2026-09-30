// The title screen's attract demo and its idle view, as main.js runs them -- booted for real over
// tools/fakepage.mjs, keys as keydown events on the window, frames driven by hand.
//
//   A. The demo is stepped only while it is on screen -- the title and the guide draw it; the
//      options, the statistics, the help and the replays' list are opaque screens, and it used
//      to climb on behind them unseen -- and starts its tower again from the first floor each
//      time it comes back into view: from each of those screens, and from a run left for the
//      title. On the title it goes on, never started again. The user asked for the bot to
//      start from the bottom every time the main menu comes back, rather than climb on out of
//      sight (2026-09-29).
//   B. Idle ATTRACT_IDLE seconds on the title (no key, button or click), the menu and its wash
//      fade out over ATTRACT_FADE and the prompt stands over the demo alone; before then the
//      menu is drawn and no prompt. Any key brings the menu back and does nothing else -- a
//      SPACE does not start a run -- and so does a click; every input starts the count again,
//      so a player pressing a key every few seconds never meets it; with the quit's question up
//      it never comes. The prompt flashes: over two seconds its alpha rises to 1 and falls to
//      ATTRACT_DIM of it, never below. The user asked for it (2026-09-29): after ten idle
//      seconds the menu clears so the bot can be watched whole, with a flashing prompt to
//      continue playing.
//
//   node tools/test-attract.mjs              the checks (a few seconds)
//   node tools/test-attract.mjs --mutant=N   patches a copy of src/ and must FAIL
//   node tools/test-attract.mjs --mutants    every mutant in turn, one process each

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installPage, bootMain, frame, key } from './fakepage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);

// ---- mutants: [file under src/, from, to], the check that catches each beside it -----------
const MUTANTS = {
  // caught by A (the demo climbs on behind an opaque screen)
  'demo-steps-unseen': [['src/main.js', '  if (demoOn) stepDemo(dt);\n', '  stepDemo(dt);\n']],
  // caught by A (the demo goes on from where it was when it comes back into view)
  'demo-not-restarted': [['src/main.js', '  if (demoOn && !demoWasOn) restartDemo();\n', '']],
  // caught by A (the demo started again on the title itself, every step)
  'demo-restarted-always': [['src/main.js', '  if (demoOn && !demoWasOn) restartDemo();\n', '  if (demoOn) restartDemo();\n']],
  // caught by B (the idle view never comes)
  'attract-never': [['src/ui/screens.js', 'export const ATTRACT_IDLE = 10;', 'export const ATTRACT_IDLE = 1e9;']],
  // caught by B (the key that wakes the view goes on to the menu: SPACE starts a run)
  'attract-key-leaks': [['src/main.js', "  if (woke) { audio.sfxMenu('move'); return; }\n", "  if (woke) audio.sfxMenu('move');\n"]],
  // caught by B (a key does not start the count again: the view comes while keys are pressed)
  'attract-keys-not-counted': [['src/main.js', '  const woke = attractK() > 0;\n  idleT = 0;\n', '  const woke = attractK() > 0;\n  if (woke) idleT = 0;\n']],
  // caught by B (a click does not wake it)
  'attract-click-ignored': [['src/main.js', "window.addEventListener('pointerdown', () => { idleT = 0; });\n", '']],
  // caught by B (it comes over the quit's question)
  'attract-over-quit': [['src/main.js', '  idleT = game.state === STATE.MENU && !quitting ? idleT + dt : 0;', '  idleT = game.state === STATE.MENU ? idleT + dt : 0;']],
  // caught by B (the menu is still drawn under the prompt)
  'attract-menu-stays': [['src/main.js', '      if (k < 1) {\n        ctx.globalAlpha = 1 - k;', '      if (true) {\n        ctx.globalAlpha = 1;']],
  // caught by B (the prompt does not flash)
  'prompt-steady': [['src/ui/screens.js', '  const wave = 0.5 + 0.5 * Math.tanh(4 * Math.cos(2 * Math.PI * ATTRACT_FLASH * t) + 1);', '  const wave = 1;']],
  // caught by B (the prompt's plate narrower than its letters: they ran off both ends, as the
  // first cut sized it -- twice the scale-1 width, 48 units short)
  'prompt-off-plate': [['src/ui/screens.js', '  const w = textWidth(words, 2) + 28;', '  const w = textWidth(words) * 2 + 28;']],
  // caught by B (the prompt flashes all the way off)
  'prompt-goes-out': [['src/ui/screens.js', 'const ATTRACT_FLASH = 1.2, ATTRACT_DIM = 0.2;', 'const ATTRACT_FLASH = 1.2, ATTRACT_DIM = 0;']],
};

if (argv.includes('--mutants')) {
  const self = fileURLToPath(import.meta.url);
  const missed = [];
  for (const name of Object.keys(MUTANTS)) {
    // A time limit, so a mutant that hangs the checks is a miss, not a stalled pass.
    const r = spawnSync(process.execPath, [self, `--mutant=${name}`], { encoding: 'utf8', timeout: 300000 });
    const last = (r.stdout || '').trim().split('\n').slice(-2).join(' | ');
    const caught = r.status === 1;
    console.log(`  ${caught ? 'caught ' : 'MISSED '} ${name.padEnd(26)} ${r.status === 3 ? 'DID NOT APPLY' : last.slice(0, 150)}`);
    if (!caught) missed.push(name);
  }
  console.log(missed.length ? `\n  ${missed.length} mutant(s) not caught: ${missed.join(', ')}` : `\n  all ${Object.keys(MUTANTS).length} mutants caught`);
  process.exit(missed.length ? 1 : 0);
}

let ROOT = REPO;
let tmp = null;
if (MUTANT) {
  const m = MUTANTS[MUTANT];
  if (!m) { console.log(`unknown mutant '${MUTANT}'; one of: ${Object.keys(MUTANTS).join(', ')}`); process.exit(2); }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dvattract-'));
  fs.cpSync(path.join(REPO, 'src'), path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'package.json'), fs.readFileSync(path.join(REPO, 'package.json')));
  for (const [file, from, to] of m) {
    const p = path.join(tmp, file);
    const t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const n = t.split(from).length - 1;
    if (n !== 1) { console.log(`  MUTANT ${MUTANT} DID NOT APPLY (${n} matches in ${file}): ${from.slice(0, 70)}`); process.exit(3); }
    fs.writeFileSync(p, t.replace(from, to));
  }
  ROOT = tmp;
  console.log(`  MUTANT ${MUTANT}: this run must FAIL`);
}
const cleanup = () => { if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* left */ } };

let bad = 0;
function fail(m) {
  console.log('  FAIL ' + m);
  bad++;
  if (MUTANT) { console.log(`  (mutant ${MUTANT} caught)`); cleanup(); process.exit(1); }
}
const ok = (c, m) => { if (!c) fail(m); return !!c; };
const note = (m) => console.log('  ok   ' + m);
process.on('uncaughtException', (e) => { fail('an uncaught exception: ' + (e && e.stack)); cleanup(); process.exit(1); });

// ---- the page ------------------------------------------------------------------------------
const page = installPage({ seed: 23 });
localStorage.setItem('dukevytis.settings.v2', JSON.stringify({ guideSeen: true, music: true, speedV: 3 }));
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const V = await bootMain(u('src/main.js'));
const { STATE } = await import(u('src/game/game.js'));
const Menu = await import(u('src/render/menuskin.js'));
const Screens = await import(u('src/ui/screens.js'));
const { ATTRACT_PROMPT } = Screens;
// The idle and the fade as LITERALS, the spec they are (ten idle seconds): read back from
// screens.js, a mutant that never lets the view come would set the test waiting for it forever.
const ATTRACT_IDLE = 10, ATTRACT_FADE = 0.6;
const game = V.game, demo = V.demoGame;
const FPS = 60;

/**
 * A frame's steps. Not drawn: the idle count and the demo live in the steps, and a frame drawn
 * headless at 1920 x 1080 is most of a tenth of a second -- the few this reads are drawn by
 * drawn(), below.
 */
const tick = () => frame(V, 1 / FPS);
const ticks = (secs) => { for (let i = 0; i < Math.round(secs * FPS); i++) tick(); };
const tap = (code) => { key(page.win, 'keydown', code); key(page.win, 'keyup', code); tick(); };
/** The words the next frame draws: the menu's, and whether the prompt is among them. */
function drawn() {
  const probe = Menu.menuProbe(true);
  V.renderFrame(1, 0);
  Menu.menuProbe(false);
  const words = probe.filter((e) => e.kind === 'text' || e.kind === 'line' || e.kind === 'keycap').map((e) => e.s);
  // The prompt's letters inside a plate: every word over the moving game stands on one.
  const line = probe.find((e) => e.kind === 'line' && e.s === ATTRACT_PROMPT);
  const plated = !!line && probe.some((p) => p.kind === 'plate'
    && line.b[0] >= p.b[0] && line.b[1] >= p.b[1] && line.b[2] <= p.b[2] && line.b[3] <= p.b[3]);
  return { prompt: words.includes(ATTRACT_PROMPT), plated, box: line && line.b, menu: words.filter((w) => w !== ATTRACT_PROMPT).length, words };
}
const where = () => [demo.player.x, demo.player.y, demo.run.maxFloor].map((v) => +v.toFixed(3)).join(',');

// =============================================================================================
// A. The demo: stepped only on screen, and started again when it comes back into view.
// =============================================================================================
{
  ok(game.state === STATE.MENU, `A. the page did not boot to the title (${game.state})`);
  // On the title it goes on: the same run, climbing.
  const run0 = demo.run;
  ticks(6);
  ok(demo.run === run0 && demo.run.maxFloor > 20, `A. the demo on the title did not go on climbing its run: floor ${demo.run.maxFloor}, the same run ${demo.run === run0}`);
  const onTitle = demo.run.maxFloor;
  // Each opaque screen: frozen behind it, and a new tower from the first floor on the way back.
  const screens = [['the options', 'KeyO', 'Escape', STATE.OPTIONS], ['the statistics', 'KeyS', 'Escape', STATE.STATS],
    ['the help', 'KeyH', 'Escape', STATE.HELP], ['the replays\' list', 'KeyR', 'Escape', null]];
  const lines = [];
  for (const [name, open, close, state] of screens) {
    ticks(2);
    tap(open);
    const up = state ? game.state === state : V.replays.mode === 'list';
    const before = where(), runBefore = demo.run;
    ticks(3);
    const frozen = where() === before && demo.run === runBefore;
    tap(close);
    const back = game.state === STATE.MENU && !V.replays.active;
    const fresh = demo.run !== runBefore && demo.run.maxFloor <= 2;
    ok(up && frozen && back && fresh,
      `A. ${name}: open ${up}; the demo ${frozen ? 'held' : 'went on'} behind it (${before} -> ${where()}); back on the title ${back}; its tower ${fresh ? 'started again' : 'went on'} (floor ${demo.run.maxFloor})`);
    lines.push(name);
  }
  // A run, left for the title from its pause: the demo held under the run, and started again.
  ticks(2);
  tap('Space');
  const playing = game.state === STATE.PLAYING;
  const runBefore = demo.run, before = where();
  ticks(2);
  const held = where() === before;
  tap('Escape');
  tap('KeyQ');
  ticks(0.2);
  const back = game.state === STATE.MENU;
  ok(playing && held && back && demo.run !== runBefore && demo.run.maxFloor <= 30,
    `A. a run left for the title: playing ${playing}, the demo held ${held}, back ${back}, its tower started again ${demo.run !== runBefore} (floor ${demo.run.maxFloor})`);
  note(`A. the demo climbs on the title (floor ${onTitle} in 6 s, one run) and nowhere else: held behind ${lines.join(', ')} and a run, and started again from the first floor each time the title came back`);
}

// =============================================================================================
// B. Idle on the title: the menu goes, the prompt comes; any input brings the menu back.
// =============================================================================================
{
  tap('ArrowDown');                         // any key: the count starts now
  ticks(ATTRACT_IDLE - 0.5);
  const early = drawn();
  ok(early.menu > 5 && !early.prompt, `B. ${ATTRACT_IDLE - 0.5} s idle: the menu ${early.menu} words, the prompt ${early.prompt} -- the view came early`);
  ticks(0.5 + ATTRACT_FADE + 0.2);
  const late = drawn();
  ok(late.menu === 0 && late.prompt, `B. ${ATTRACT_IDLE + ATTRACT_FADE + 0.2} s idle: the menu still drew ${late.menu} words (${late.words.slice(0, 4).join(', ')}), the prompt ${late.prompt}`);
  ok(late.plated, `B. the prompt's letters (${late.box && late.box.map((v) => v.toFixed(1)).join(', ')}) are not inside its plate`);
  // The demo goes on under it.
  const runIn = demo.run, floorIn = demo.run.maxFloor;
  ticks(3);
  ok(demo.run === runIn && demo.run.maxFloor > floorIn, `B. the demo did not go on under the view (floor ${floorIn} -> ${demo.run.maxFloor})`);
  // SPACE wakes it, and does nothing else.
  tap('Space');
  const woke = drawn();
  ok(game.state === STATE.MENU && woke.menu > 5 && !woke.prompt,
    `B. SPACE on the view: the state ${game.state} (a run started?), the menu ${woke.menu} words, the prompt ${woke.prompt}`);
  // The count starts again: another whole wait before it comes back.
  ticks(ATTRACT_IDLE - 1);
  const again = drawn();
  ok(again.menu > 5 && !again.prompt, `B. the count did not start again after the key: the view back ${ATTRACT_IDLE - 1} s later`);
  // A key every few seconds: never.
  let seen = false;
  for (let i = 0; i < 5; i++) { tap('ArrowUp'); ticks(ATTRACT_IDLE / 2); seen = seen || drawn().prompt; }
  ok(!seen, `B. a player pressing a key every ${ATTRACT_IDLE / 2} s met the idle view`);
  // A click wakes it.
  ticks(ATTRACT_IDLE + ATTRACT_FADE + 0.2);
  const before = drawn().prompt;
  page.win.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10 }));
  tick();
  const clicked = drawn();
  ok(before && clicked.menu > 5 && !clicked.prompt, `B. a click did not bring the menu back (the view up before it ${before}; after, the menu ${clicked.menu} words, the prompt ${clicked.prompt})`);
  // The quit's question up: it never comes.
  tap('Escape');
  ticks(ATTRACT_IDLE + ATTRACT_FADE + 1);
  const overQuit = drawn();
  ok(!overQuit.prompt, `B. the idle view came over the quit's question`);
  tap('ArrowDown');                          // any key sets the question down
  note(`B. idle ${ATTRACT_IDLE} s on the title: the menu gone over ${ATTRACT_FADE} s and the prompt over the demo, which goes on; SPACE and a click bring the menu back and nothing else, and start the count again; a key every ${ATTRACT_IDLE / 2} s never meets it, nor does the quit's question`);
}

// The prompt flashes: its alpha over two seconds, drawn on a context that keeps count.
{
  const alphas = [];
  const rec = {
    globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: false,
    drawImage() { alphas[alphas.length - 1].push(this.globalAlpha); },
    fillRect() {}, save() {}, restore() {}, setTransform() {}, getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
  };
  const per = [];
  for (let i = 0; i < 120; i++) {
    alphas.push([]);
    Screens.drawAttractPrompt(rec, i / 60, 1);
    const a = alphas[alphas.length - 1];
    if (a.length) per.push(Math.max(...a));
  }
  const lo = Math.min(...per), hi = Math.max(...per);
  let flips = 0;
  for (let i = 1; i < per.length; i++) if ((per[i] > 0.6) !== (per[i - 1] > 0.6)) flips++;
  ok(per.length === 120 && hi > 0.95 && lo >= 0.18 && lo < 0.35 && flips >= 3,
    `B. the prompt's alpha over 2 s ran ${lo.toFixed(2)} to ${hi.toFixed(2)} and crossed the middle ${flips} times: it must flash (up to 1, down near ${0.2}, never out)`);
  note(`B. the prompt flashes: alpha ${lo.toFixed(2)} to ${hi.toFixed(2)}, ${flips} crossings in 2 s, never out`);
}

console.log(bad ? `\n  ${bad} FAILED` : '\n  all passed');
cleanup();
process.exit(bad ? 1 : 0);
