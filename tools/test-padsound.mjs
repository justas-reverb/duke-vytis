// The sound, for a player with only a controller.
//
//   node tools/test-padsound.mjs                 the checks, a few seconds
//   node tools/test-padsound.mjs --shots=DIR     and every frame a notice check looked at, as a PNG
//   node tools/test-padsound.mjs --mutant=NAME   the same checks against a copy of src/ with one
//                                                thing broken (MUTANTS below); it must FAIL. One
//                                                process each, run by hand: not part of the suite.
//
// A browser lets a page start audio only from a user activation -- a click, a key, a touch --
// and a gamepad press is not one (Chromium, Safari). main.js makes its AudioContext at load, so
// in a browser it waits, suspended, for the first click or key; the desktop build lets it run
// with no gesture at all. What this holds main.js to, booted for real over tools/fakepage.mjs
// with a stub AudioContext that keeps either policy:
//
//   1. A PAD PRESS ASKS. Every pad press asks the context to resume, as every key press does:
//      one that maps to nothing on the title, A in a run. Only the presses the menus acted on
//      used to reach ensureAudio (through onKey), so a pad in a run never asked at all.
//   2. IN A BROWSER IT IS REFUSED, AND THE NOTICE SAYS WHAT TO DO. The context stays suspended,
//      and the notice is on screen, in its own place, on every screen a pad reaches: the title,
//      the stats, the help, the options, the guide, the run, the pause, the fall and the board --
//      in the pad's words once a pad has been used: a pad cannot start the sound, click or press
//      a key. (It used to be on the title only, and a pad's first A there starts the run, so a
//      pad player saw it go and never heard a thing.)
//   3. A KEY STARTS IT, the music plays and the notice goes -- and stays gone through a pause,
//      which suspends the context itself. It goes with the key, not with the context's state,
//      which a browser changes a task later: SPACE on the title had already started the run,
//      and for those frames the notice came up at the run's top and vanished.
//   4. IN THE DESKTOP BUILD A PAD PRESS ALONE STARTS IT: with no gesture needed, a context that
//      has stopped comes back on a pad press in a run, and on the title with the music; and
//      electron/main.js asks for no gesture (its autoplayPolicy), so nothing there gates it.
//
// "On screen" is measured, not asked: each frame is drawn twice through main.js's renderFrame,
// once as it is and once with the audio told it has run before (the notice's latch), clock
// still; the pixels that differ are the notice, and their box must be its plate's -- its place,
// and its size, which is the wording's and its lines'.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BTN } from '../src/core/gamepad.js';
import { encodePNG } from './headless.mjs';
import { makePad, press, release, key, installPage, bootMain, frame } from './fakepage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const SHOTS = (argv.find((a) => a.startsWith('--shots=')) || '').slice(8);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const check = (cond, m, detail = '') => (cond ? ok(m) : fail(m + (detail ? `  (${detail})` : '')));

// Each breaks one thing a check here stands for: [file under src/ (or ../electron/main.js), the
// exact text, its replacement]. The text must occur exactly once, or the run stops -- a mutant that silently
// did not apply would read as a pass.
const MUTANTS = {
  // A pad's presses reach ensureAudio only through the menus' keys, as before.
  'no-touch': ['main.js', '  onTouch: ensureAudio,\n', ''],
  // The notice on the title only, as before.
  'title-only': ['main.js', '    if (notice && SOUND_PLACES[game.state]) {', '    if (false) {'],
  // No latch: the notice keyed on the context's state, so every pause brings it back.
  'no-latch': ['render/audio.js', '  get blocked() { return !!this.ctx && !this.running && !this.everRan; }',
    '  get blocked() { return !!this.ctx && !this.running; }'],
  // One wording for everyone: the pad player told to press a key he may not have.
  'one-wording': ['main.js', "  return input.lastDevice === 'pad' ? 'pad' : true;", '  return true;'],
  // The notice keyed on the context's state alone: up in the run for the frames before it starts.
  'no-activation': ['main.js', '  if (!audio.blocked || activated()) return false;', '  if (!audio.blocked) return false;'],
  // The desktop build put under a browser's gate: a pad player there would hear nothing either.
  'gated-desktop': ['../electron/main.js', "      autoplayPolicy: 'no-user-gesture-required',",
    "      autoplayPolicy: 'document-user-activation-required',"],
};

// --- the notice's plates, as LITERALS worked out from the design, not asked of screens.js -------
//
// The font's cell is 6 view units (a line of n letters is 6n - 1 wide); a plate is its widest line
// plus 8 either side, and 15 tall for one line from 4 over its top, 9 taller for each line more.
// Centred plates stand at Math.round(240 - w / 2). Lines, where a place breaks them (screens.js
// SOUND_PLACES): at most 150 wide, a phrase a line; at most 72, broken between words.
//   the keys' words, one line: 'CLICK OR PRESS A KEY TO ENABLE SOUND'             36 -> 215
//   the pad's words, one line: 'A PAD CANNOT START SOUND: CLICK OR PRESS A KEY'   46 -> 275
//   the pad's, at 150: 'A PAD CANNOT START SOUND:' 25 -> 149 / 'CLICK OR PRESS A KEY' 20 -> 119
//   the pad's, at 72: 'A PAD CANNOT' 71 / 'START SOUND:' 71 / 'CLICK OR' 47 / 'PRESS A KEY' 65
// [x0, y0, x1, y1] in view units.
const KEYS_TITLE = [125, 150, 356, 165];   // 231 wide, text at row 154 (over the prompt's plaque)
const PAD = {
  menu: [95, 150, 386, 165],               // 291 wide, the same row
  stats: [95, 241, 386, 256],              // text at 245: between the panels and the key hints
  help: [95, 234, 386, 249],               // text at 238: between the panel and PRESS ANY KEY
  options: [8, 1, 173, 25],                // two lines, left edge 8, text at 5: left of the title
  tutorial: [158, 1, 323, 25],             // two lines, centred, text at 5
  playing: [158, 1, 323, 25],
  paused: [95, 232, 386, 247],             // text at 236: under THE TOWER WAITS
  falling: [158, 1, 323, 25],
  dead: [36, 8, 123, 50],                  // four lines, left edge 36, text at 12: left of the board
};

// --- a stub AudioContext with a browser's autoplay policy, or the desktop build's --------
//
// 'gesture': a new context is suspended, and resume() starts it only once the page has had an
// activation (sticky, as Chromium's AudioContext counts it); otherwise its promise just waits,
// which is what Chromium does (it logs a warning and never rejects). And when it does start, its
// state says so a task later, as Chromium's does (17-24 ms after the key, measured under
// Chrome's autoplay policy in Electron): the frames drawn in between see it still suspended.
// 'desktop': running from the start, and resume() always works, at once.
const AUDIO = { policy: 'gesture', activated: false, asked: 0, refused: 0 };
const nextTask = () => new Promise((r) => setTimeout(r, 0));
class Param {
  constructor(v = 0) { this.value = v; }
  setValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  cancelScheduledValues() { return this; }
}
const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
class StubContext {
  constructor() {
    this.state = AUDIO.policy === 'desktop' ? 'running' : 'suspended';
    this.currentTime = 0; this.sampleRate = 48000; this.destination = node();
  }
  resume() {
    AUDIO.asked++;
    if (AUDIO.policy === 'desktop') { this.state = 'running'; return Promise.resolve(); }
    if (AUDIO.activated) return nextTask().then(() => { this.state = 'running'; });
    AUDIO.refused++;
    return new Promise(() => {});
  }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return node({ gain: new Param(1) }); }
  createBiquadFilter() { return node({ type: '', frequency: new Param(1000), Q: new Param(1) }); }
  createDynamicsCompressor() {
    return node({ threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() });
  }
  createOscillator() { return node({ type: '', frequency: new Param(440), detune: new Param(0), start() {}, stop() {} }); }
  createBuffer(ch, n) { const d = new Float32Array(n); return { duration: n / this.sampleRate, getChannelData: () => d }; }
  createBufferSource() { return node({ buffer: null, loop: false, playbackRate: new Param(1), start() {}, stop() {} }); }
  decodeAudioData() { return Promise.reject(new Error('no samples here')); }
}

/** src/ as it is, or a temp copy of it with MUTANT applied. */
function source() {
  if (!MUTANT) return path.join(ROOT, 'src');
  const m = MUTANTS[MUTANT];
  if (!m) { console.log(`  no mutant '${MUTANT}': ${Object.keys(MUTANTS).join(', ')}`); process.exit(2); }
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'duke-padsound-')), 'src');
  fs.cpSync(path.join(ROOT, 'src'), dir, { recursive: true });
  // The desktop shell beside it, where a mutant names it as ../electron/main.js.
  fs.mkdirSync(path.join(dir, '..', 'electron'));
  fs.copyFileSync(path.join(ROOT, 'electron', 'main.js'), path.join(dir, '..', 'electron', 'main.js'));
  const f = path.join(dir, m[0]);
  const src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const hits = src.split(m[1]).length - 1;
  if (hits !== 1) { console.log(`  mutant '${MUTANT}' did not apply: its text is in ${m[0]} ${hits} times`); process.exit(2); }
  fs.writeFileSync(f, src.replace(m[1], m[2]));
  console.log(`  MUTANT ${MUTANT}: ${m[0]} broken on purpose; this run must FAIL`);
  return dir;
}

const SRC = source();
const page = installPage({ storage: 'memory', seed: 1 });
page.win.AudioContext = StubContext;
// The browser's own record of a click or key (sticky), which the notice goes by.
Object.defineProperty(globalThis.navigator, 'userActivation', {
  configurable: true, get: () => ({ hasBeenActive: AUDIO.activated, isActive: false }),
});
globalThis.fetch = () => Promise.reject(new Error('no network in a test'));
const V = await bootMain(pathToFileURL(path.join(SRC, 'main.js')).href);
const { STATE } = await import(pathToFileURL(path.join(SRC, 'game', 'game.js')).href);
const { TUTORIAL_PAGES } = await import(pathToFileURL(path.join(SRC, 'ui', 'screens.js')).href);
const { PX } = await import(pathToFileURL(path.join(SRC, 'game', 'constants.js')).href);
const g = V.game;
const pad = makePad(0);
page.pads = [pad];
const tap = (btn) => { press(pad, btn); frame(V); release(pad, btn); frame(V); };
const run = (n) => { for (let i = 0; i < n; i++) frame(V); };
const land = () => { for (let i = 0; i < 240 && !g.player.grounded; i++) frame(V); };
// A key as a browser delivers one: the activation first, then the event.
const tapKey = (code) => {
  AUDIO.activated = true;
  key(page.win, 'keydown', code); frame(V); key(page.win, 'keyup', code); frame(V);
};
const screen = page.els.get('screen');

/**
 * The notice as drawn in this frame: the box, in view units, of every pixel that changes when
 * the frame is drawn again with the sound on -- the context running, and run before -- and
 * null when nothing does. Both, and both put back after: told only that it had run before, a
 * notice keyed on the context's state alone (no latch) would be drawn in both frames and read
 * as none.
 */
function notice(label) {
  V.renderFrame(1, 0);
  const a = Uint8ClampedArray.from(screen.data);
  const was = { ran: V.audio.everRan, state: V.audio.ctx.state };
  V.audio.ctx.state = 'running';
  V.audio.everRan = true;
  V.renderFrame(1, 0);
  V.audio.ctx.state = was.state;
  V.audio.everRan = was.ran;
  const b = screen.data, w = screen.width, h = screen.height;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const keep = new Uint8ClampedArray(b);
    b.set(a);
    fs.writeFileSync(path.join(SHOTS, `padsound-${label}.png`), encodePNG(screen));
    b.set(keep);
  }
  if (x1 < 0) return null;
  return [x0 / PX, y0 / PX, (x1 + 1) / PX, (y1 + 1) / PX];
}

/** Whether the notice drawn now is the plate `want`, to within a unit, in state `state`. */
function at(state, want, label = state) {
  if (g.state !== state) return { good: false, detail: `in ${g.state}, not ${state}` };
  const box = notice(label);
  const good = !!box && box.every((v, i) => Math.abs(v - want[i]) <= 1);
  return { good, detail: box ? box.join(', ') : 'no notice' };
}

// --- 1 and 2: a browser -------------------------------------------------------------------
{
  const s0 = V.audio.ctx && V.audio.ctx.state;
  const t = at(STATE.MENU, KEYS_TITLE, 'title-keys');
  check(s0 === 'suspended' && V.audio.blocked && t.good,
    'in a browser the context waits at load, and the title says: click or press a key', `${s0}, ${t.detail}`);
}
let asked = AUDIO.asked;
tap(BTN.LB);                                     // a touch that maps to nothing on the title
{
  const lbAsked = AUDIO.asked - asked;
  check(lbAsked > 0 && V.audio.ctx.state === 'suspended',
    'a pad press that no screen acts on still asks the context to resume, and is refused', `asked ${lbAsked}, ${V.audio.ctx.state}`);
  const t = at(STATE.MENU, PAD.menu, 'title-pad');
  check(t.good, 'once a pad has been used the title says a pad cannot start the sound', t.detail);
}
// The screens a pad opens from the title: Y the stats, Back the options; B back. (X, the help,
// comes after the guide: opening the help counts as having read the guide, and it would skip it.)
const side = [];
const visit = (btn, state, want) => {
  tap(btn);
  const t = at(state, want);
  if (!t.good) side.push(`${state}: ${t.detail}`);
  tap(BTN.B);
};
visit(BTN.Y, STATE.STATS, PAD.stats);
visit(BTN.BACK, STATE.OPTIONS, PAD.options);

tap(BTN.START);                                  // the first run opens the guide
{
  const t = at(STATE.TUTORIAL, PAD.tutorial, 'guide');
  check(t.good, 'the guide keeps it up', t.detail);
}
for (let i = 0; i < TUTORIAL_PAGES.length; i++) tap(BTN.A);
run(30); land();
asked = AUDIO.asked;
tap(BTN.A);
{
  const aAsked = AUDIO.asked - asked;
  check(g.state === STATE.PLAYING && aAsked > 0 && V.audio.ctx.state === 'suspended',
    'in a run, A asks as well (it never did: only the menus\' presses reached ensureAudio), and is refused',
    `${g.state}, asked ${aAsked}, ${V.audio.ctx.state}`);
  const t = at(STATE.PLAYING, PAD.playing);
  check(t.good, 'in the run it stays up, on two lines clear of the score', t.detail);
}
tap(BTN.START);
{
  const t = at(STATE.PAUSED, PAD.paused);
  check(t.good, 'on the pause', t.detail);
}
tap(BTN.START);
g.die();
frame(V);
{
  const t = at(STATE.FALLING, PAD.falling);
  check(t.good, 'in the fall', t.detail);
}
tap(BTN.A);
{
  const t = at(STATE.DEAD, PAD.dead);
  check(t.good, 'and on the board, beside its head plate', t.detail);
}
tap(BTN.B);                                      // the board to the title, and X: the help
visit(BTN.X, STATE.HELP, PAD.help);
check(!side.length && g.state === STATE.MENU, 'the stats, the options and the help each keep it up, in a free place of their own',
  side.join('; ') || `back in ${g.state}`);
check(AUDIO.refused > 0 && V.audio.ctx.state === 'suspended' && !V.audio.everRan,
  `every pad press was refused (${AUDIO.refused} asks): the sound never started`, V.audio.ctx.state);

// --- 3: a key ------------------------------------------------------------------------------
tapKey('Space');                                 // climb, from the title
{
  // Two frames on, the context has not caught up (a browser says so a task later), and SPACE has
  // already started the run: nothing may come up in the run's place for those frames.
  const box = notice('playing-key-pending');
  check(g.state === STATE.PLAYING && V.audio.ctx.state === 'suspended' && !box,
    'the key takes the notice down at once, before the context says it runs: it does not come up in the run for those frames',
    `${g.state}, ${V.audio.ctx.state}, notice ${box ? box.join(', ') : 'none'}`);
}
await nextTask();
{
  const box = notice('playing-after-key');
  check(g.state === STATE.PLAYING && V.audio.running && !!V.audio.voices && !V.audio.blocked && !box,
    'a key starts the sound: the climb\'s music plays and the notice is gone',
    `${g.state}, ${V.audio.ctx.state}, voices ${!!V.audio.voices}, notice ${box ? box.join(', ') : 'none'}`);
}
tapKey('Escape');
await new Promise((r) => setTimeout(r, 400));   // the pause stops the clock PAUSE_HOLD (0.2 s) later
{
  const box = notice('paused-after-key');
  check(g.state === STATE.PAUSED && V.audio.ctx.state === 'suspended' && !box,
    'the pause suspends the context itself, and the notice does not come back for it',
    `${g.state}, ${V.audio.ctx.state}, notice ${box ? box.join(', ') : 'none'}`);
}

// --- 4: the desktop build ---------------------------------------------------------------------
// No activation has ever happened in a desktop session's page, and none is needed.
AUDIO.policy = 'desktop';
AUDIO.activated = false;
tap(BTN.START);                                  // back to the run
run(30); land();
V.audio.ctx.state = 'suspended';                 // stopped by something outside the game
asked = AUDIO.asked;
tap(BTN.A);
check(g.state === STATE.PLAYING && AUDIO.asked > asked && V.audio.running,
  'in the desktop build a pad press in a run brings a stopped context back', `${g.state}, ${V.audio.ctx.state}`);
tap(BTN.START);                                  // the pause
await new Promise((r) => setTimeout(r, 400));
{
  // Here no click or key has ever been made (a pad player on the desktop build), so only the
  // latch keeps the notice away when the pause stops the clock: keyed on the state, it came
  // back at every pause, telling a player whose sound works to click for it.
  const box = notice('paused-desktop');
  check(g.state === STATE.PAUSED && V.audio.ctx.state === 'suspended' && !box,
    'a pad player\'s pause stops the clock with no key ever pressed, and the notice stays away',
    `${g.state}, ${V.audio.ctx.state}, notice ${box ? box.join(', ') : 'none'}`);
}
tap(BTN.X);                                      // the title
V.audio.stopMusic();
V.audio.ctx.state = 'suspended';
tap(BTN.LB);
check(g.state === STATE.MENU && V.audio.running && !!V.audio.voices,
  'and on the title a pad press alone starts the sound and the menu\'s music', `${g.state}, ${V.audio.ctx.state}, voices ${!!V.audio.voices}`);
{
  // All of that holds only while the desktop shell asks for no gesture. Electron's default is
  // the same (measured in Electron 44, with and without the line: the context runs at load and
  // a pad press alone resumes it); put under Chrome's policy it waits as a browser's does, a
  // pad press is refused, and a pad player hears nothing.
  const shell = fs.readFileSync(path.join(SRC, '..', 'electron', 'main.js'), 'utf8');
  const policies = [...shell.matchAll(/autoplay-?policy['"]?\s*[:,]\s*['"]([^'"]+)['"]/gi)].map((m) => m[1]);
  check(policies.length > 0 && policies.every((p) => p === 'no-user-gesture-required'),
    'and electron/main.js asks for no gesture: its autoplay policy is no-user-gesture-required', policies.join(', ') || 'none named');
}

console.log('\n  ' + (bad === 0
  ? 'RESULT: PASS - a pad asks for the sound as a key does; where it cannot start it, the notice says what will.'
  : `RESULT: FAIL - ${bad} problem(s).`));
process.exit(bad ? 1 : 0);
