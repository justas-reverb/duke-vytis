// The touch controls (src/ui/touch.js), as main.js runs them on a phone -- booted for real over
// tools/fakepage.mjs with `?touch` in the address, the fingers driven through TouchControls'
// pointer(), which is what its layer's pointer events call.
//
//   A. When there are any: `?touch` yes, `?notouch` no, else a coarse pointer and no fine one;
//      a keycap's legend names its key and a pad's button names none; on a phone's viewport,
//      held sideways or upright, every button is inside it, none overlaps another and each is
//      big enough for a thumb.
//   B. The title: the top row offers exactly the keys its hints show (S H O R P M F), from the
//      keycaps the frame drew; S there opens the statistics; for STRIP_HOLD after a screen
//      stops drawing a key its button stays, then goes; ESC comes back.
//   C. A run, started with SPACE: the menus' ^ and v are put away; > held runs him right, a
//      thumb sliding onto < turns him, drifting up off both keeps the one it had, lifting stops
//      him; two fingers at once (> and SPACE) each hold their own key, a held SPACE is a held
//      jump, and two on one key hold it until both lift; nothing repeats in a run; ESC pauses and
//      the pause's row offers S and Q; Q goes back to the title.
//   D. The menus: a held v repeats as a held key does -- once, again after REPEAT_DELAY, then
//      every REPEAT_RATE.
//   E. The Android build's background and foreground: a run pauses and the sound goes with the
//      app; back in front it stays paused and silent until the pause is left; on the title the
//      music stops and comes back.
//   F. The scoreboard: its row offers R, and R there plays the run back.
//   G. A touch's END asks for the sound, where Chromium lets a page start it.
//   H. In Android's WebView -- the page booted with its user agent, LOW LATENCY on as saved --
//      the screen's canvas is made WITHOUT the low-latency hint, which the WebView never puts on
//      the screen (a black game, on the emulator); in any other browser the setting holds.
//
//   node tools/test-touch.mjs              the checks (a few seconds)
//   node tools/test-touch.mjs --mutant=N   patches a copy of src/ and must FAIL
//   node tools/test-touch.mjs --mutants    every mutant in turn, one process each

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
  // caught by B (the frame's keycaps are never watched: the title's row is empty)
  'caps-unwatched': [['src/main.js', '  if (touch) watchCaps(touch.beginCaps());\n', '']],
  // caught by B (a composite's keycaps are not counted when it is blitted: the title's hints go)
  'caps-composite-missed': [['src/render/menuskin.js', "  if (capWatch && ctx.globalAlpha > CAP_SEEN) for (const e of a.rec) if (e.kind === 'keycap') capWatch.add(e.s);\n", '']],
  // caught by A (the pad's A names the key A, which moves him left)
  'pad-letters-keys': [['src/ui/touch.js', "const PAD_LETTERS = new Set(['A', 'B', 'X', 'Y']);", 'const PAD_LETTERS = new Set();']],
  // caught by B (a key leaves the row the frame it stops being drawn)
  'strip-blinks': [['src/ui/touch.js', 'const STRIP_HOLD = 0.25;', 'const STRIP_HOLD = 0;']],
  // caught by B (a key stays in the row for good once drawn)
  'strip-sticks': [['src/ui/touch.js', '      if (this.t - at <= STRIP_HOLD || this.held.get(code) > 0) out.push(label);', '      out.push(label);']],
  // caught by C (the thumb cannot slide from > to <)
  'no-slide': [['src/ui/touch.js', '      if (other && x >= other.x && x <= other.x + other.w) {', '      if (false) {']],
  // caught by C (a thumb drifting off the arrows lets go: he stops dead)
  'slide-drops': [['src/ui/touch.js', '      if (other && x >= other.x && x <= other.x + other.w) {', '      if (other && !(x >= other.x && x <= other.x + other.w)) { this.release(f.code); f.id = null; f.code = null; return true; }\n      if (other) {']],
  // caught by C (SPACE is a tap, not a hold: no chain, no full jump)
  'jump-tap': [['src/ui/touch.js', "    this.send('keydown', code, false);\n    if (REPEATS.has(code))", "    this.send('keydown', code, false);\n    if (code === 'Space') { this.send('keyup', code, false); }\n    if (REPEATS.has(code))"]],
  // caught by C (one finger at a time: a second finger down forgets the first, whose key is then
  // never let go -- he runs on after both have lifted)
  'one-finger': [['src/ui/touch.js', '      this.fingers.set(id, b ? { id: b.id, code: b.code } : { id: null, code: null });', '      this.fingers.clear();\n      this.fingers.set(id, b ? { id: b.id, code: b.code } : { id: null, code: null });']],
  // caught by C (two fingers on one key: the first to lift lets go of it)
  'no-count': [['src/ui/touch.js', '    if (n > 0) { this.held.set(code, n); return; }\n', '']],
  // caught by C (the menus' ^ and v stay in a run)
  'arrows-in-run': [['src/ui/touch.js', '    for (const b of FIXED) if (!(run && b.menu)) list.push({ ...b, ...R[b.id] });', '    for (const b of FIXED) list.push({ ...b, ...R[b.id] });']],
  // caught by C (a held arrow repeats in a run)
  'repeat-in-run': [['src/ui/touch.js', "    if (this.mode() !== 'run') {\n      for (const [code, left] of this.rep) {", '    {\n      for (const [code, left] of this.rep) {']],
  // caught by D (a held arrow never repeats)
  'no-repeat': [['src/ui/touch.js', '    if (REPEATS.has(code)) this.rep.set(code, REPEAT_DELAY);\n', '']],
  // caught by D (it repeats at once, with no delay)
  'repeat-no-delay': [['src/ui/touch.js', '    if (REPEATS.has(code)) this.rep.set(code, REPEAT_DELAY);\n', '    if (REPEATS.has(code)) this.rep.set(code, REPEAT_RATE);\n']],
  // caught by E (the app's background does not pause the run)
  'background-plays-on': [['src/main.js', "  if (game.state === STATE.PLAYING) game.pause();\n  audio.suspend();\n", '  audio.suspend();\n']],
  // caught by E (the sound goes on behind another app)
  'background-loud': [['src/main.js', "  if (game.state === STATE.PLAYING) game.pause();\n  audio.suspend();\n", '  if (game.state === STATE.PLAYING) game.pause();\n']],
  // caught by E (back in front, a paused run's sound comes back under the pause screen)
  'foreground-unpauses-sound': [['src/main.js', '  if (game.state !== STATE.PAUSED) audio.resumeCtx();', '  audio.resumeCtx();']],
  // caught by H (the low-latency hint used in Android's WebView: a black screen)
  'webview-low-latency': [['src/render/renderer.js', "  return !/; wv\\)/.test(String(ua || ''));", '  return true;']],
  // caught by G (a touch's end does not ask for the sound)
  'touchend-deaf': [['src/main.js', "'keydown', 'keyup', 'pointerup', 'touchend']) {", "'keydown', 'keyup']) {"]],
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dvtouch-'));
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

// ---- a stub AudioContext, running at once (the desktop's and the Android build's policy) ----
const AUDIO = { asked: 0 };
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
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 48000; this.destination = node(); }
  resume() { AUDIO.asked++; this.state = 'running'; return Promise.resolve(); }
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

// ---- the page: a phone held sideways, played by touch ---------------------------------------
const page = installPage({ seed: 31 });
page.win.innerWidth = 915;    // CSS pixels: a 20:9 phone held sideways (2400 x 1080 at 2.625)
page.win.innerHeight = 412;
globalThis.location.search = '?mute&touch';
// Android's WebView, as the Android build runs the page (H).
const WEBVIEW_UA = 'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.F3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36';
globalThis.navigator.userAgent = WEBVIEW_UA;
page.win.AudioContext = StubContext;
globalThis.fetch = () => Promise.reject(new Error('no network in a test'));
localStorage.setItem('dukevytis.settings.v2', JSON.stringify({ guideSeen: true, music: true, speedV: 3 }));
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const V = await bootMain(u('src/main.js'));
const { STATE } = await import(u('src/game/game.js'));
const Touch = await import(u('src/ui/touch.js'));
const { REPEAT_DELAY, REPEAT_RATE } = await import(u('src/core/gamepad.js'));
const game = V.game, T = V.touch;
const FPS = 60;
// The spec's own number, as a literal: how long a key stays offered after its hint goes [s].
const STRIP_HOLD = 0.25;

const tick = () => frame(V, 1 / FPS);
const ticks = (secs) => { for (let i = 0; i < Math.round(secs * FPS); i++) tick(); };
/** A frame drawn, as the phone draws it: its keycaps are what the next frame's row offers. */
const drawnTick = () => { V.renderFrame(1, 1 / FPS); tick(); };
/**
 * Frames drawn for longer than STRIP_HOLD, so the row is this screen's alone. The steps between
 * the screens here draw nothing (a frame drawn headless is most of a tenth of a second), and the
 * last screen drawn -- the title -- stays offered until one is: its R would stand in for the
 * scoreboard's.
 */
const settle = () => { for (let i = 0; i < Math.ceil((STRIP_HOLD + 0.1) * FPS); i++) drawnTick(); };
const btn = (id) => T.buttons().find((b) => b.id === id) || null;
const ids = () => T.buttons().map((b) => b.id);
const row = () => T.buttons().filter((b) => b.id.startsWith('key:')).map((b) => b.label);
const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];
let fingerId = 100;
/** A finger down on a button (by id); returns the finger's id. */
function down(id) {
  const b = btn(id);
  if (!b) { fail(`no ${id} button to press (on screen: ${ids().join(' ')})`); return -1; }
  const f = ++fingerId;
  T.pointer('down', f, ...centre(b));
  return f;
}
const up = (f) => T.pointer('up', f, 0, 0);
const tapBtn = (id) => { const f = down(id); tick(); up(f); tick(); };
// Every keydown the window hears, with its repeat flag and the clock, for C and D.
const heard = [];
let clock = 0;
page.win.addEventListener('keydown', (e) => heard.push({ code: e.code, repeat: !!e.repeat, t: clock }));
const tickT = () => { tick(); clock += 1 / FPS; };

// =============================================================================================
// A. When there are touch controls, what a keycap names, and the layout.
// =============================================================================================
{
  const mm = (coarse, fine) => ({ matchMedia: (q) => ({ matches: q.includes('any-pointer: fine') ? fine : q.includes('pointer: coarse') ? coarse : false }) });
  const cases = [
    [{ search: '?mute' }, {}, false, 'a desktop page'],
    [{ search: '?touch' }, {}, true, '?touch'],
    [{ search: '?mute&touch' }, {}, true, '?mute&touch'],
    [{ search: '?touch&notouch' }, mm(true, false), false, '?notouch on a phone'],
    [{ search: '' }, mm(true, false), true, 'a phone (a coarse pointer, no fine one)'],
    [{ search: '' }, mm(true, true), false, 'a laptop with a touch screen (a fine pointer too)'],
    [{ search: '?touchy' }, {}, false, '?touchy is not ?touch'],
  ];
  const wrong = cases.filter(([loc, win, want]) => Touch.touchWanted(loc, win) !== want).map((c) => c[3]);
  ok(!wrong.length, `A. touchWanted is wrong for: ${wrong.join('; ')}`);
  const caps = { S: 'KeyS', DEL: 'Delete', ENTER: 'Enter', SPACE: 'Space', ESC: 'Escape', G: 'KeyG',
    A: null, B: null, X: null, Y: null, LB: null, RB: null, HOLD: null, ARROWS: null };
  const capWrong = Object.entries(caps).filter(([l, c]) => Touch.capCode(l) !== c).map(([l]) => `${l} -> ${Touch.capCode(l)}`);
  ok(!capWrong.length, `A. a keycap names the wrong key: ${capWrong.join(', ')}`);
  ok(!!T && T === V.touch, 'A. main.js made no touch controls with ?touch in the address');
  // Every viewport a phone gives, a full top row (the replays' list offers the most keys):
  // inside the viewport, no two overlapping, every one at least 40 CSS px (about 6 mm) across.
  const strip = ['ENTER', 'S', 'R', 'N', 'P', 'E', 'I', 'DEL'];
  const problems = [];
  for (const [vw, vh] of [[915, 412], [800, 360], [640, 360], [412, 915], [1280, 800]]) {
    const L = Object.entries(Touch.touchLayout(vw, vh, strip));
    for (const [id, r] of L) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > vw || r.y + r.h > vh) problems.push(`${vw}x${vh} ${id} outside`);
      if (Math.min(r.w, r.h) < 40) problems.push(`${vw}x${vh} ${id} ${Math.min(r.w, r.h).toFixed(0)} px`);
    }
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const [a, p] = L[i], [b, q] = L[j];
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) problems.push(`${vw}x${vh} ${a} over ${b}`);
    }
  }
  ok(!problems.length, `A. the layout: ${problems.slice(0, 6).join('; ')}`);
  note(`A. touch where asked or on a phone only; keycaps name their keys, a pad's none; five phone viewports laid out clear`);
}

// =============================================================================================
// B. The title's row: the keys its hints show, from the keycaps the frame drew.
// =============================================================================================
{
  ok(game.state === STATE.MENU, `B. the page did not boot to the title (${game.state})`);
  ticks(1);
  for (let i = 0; i < 3; i++) drawnTick();
  const title = row();
  const want = ['S', 'H', 'O', 'R', 'P', 'M', 'F'];
  ok(title.join(' ') === want.join(' '), `B. the title's row is [${title.join(' ')}], its hints [${want.join(' ')}]`);
  ok(['left', 'right', 'up', 'down', 'jump', 'esc'].every((id) => ids().includes(id)), `B. the title lacks a fixed button: ${ids().join(' ')}`);
  tapBtn('key:S');
  ok(game.state === STATE.STATS, `B. S on the title's row did not open the statistics (${game.state})`);
  // The statistics draw their own hints; the title's go -- but not at once.
  drawnTick();
  const soon = row();
  let gone = null;
  for (let i = 0; i < 30; i++) {
    drawnTick();
    if (!row().includes('H')) { gone = (i + 2) / FPS; break; }
  }
  ok(soon.includes('H') && gone !== null && gone >= STRIP_HOLD - 0.02 && gone <= STRIP_HOLD + 0.1,
    `B. the title's H left the row ${gone === null ? 'never' : `after ${gone.toFixed(3)} s`} (it must stay ${STRIP_HOLD} s after its hint goes, then go); a frame on: [${soon.join(' ')}]`);
  tapBtn('esc');
  ok(game.state === STATE.MENU, `B. ESC did not leave the statistics (${game.state})`);
  note(`B. the title offers [${title.join(' ')}]; S opens the statistics; a key stays ${STRIP_HOLD} s after its hint goes (${gone && gone.toFixed(2)} s), then goes; ESC is back`);
}

// =============================================================================================
// C. A run: the arrows, the jump, two fingers, the pause.
// =============================================================================================
{
  const inp = V.input;
  tapBtn('jump');
  ok(game.state === STATE.PLAYING, `C. SPACE on the title did not start a run (${game.state})`);
  ticks(0.8);
  ok(!ids().includes('up') && !ids().includes('down') && ['left', 'right', 'jump', 'esc'].every((id) => ids().includes(id)),
    `C. a run's buttons are [${ids().join(' ')}]: the menus' ^ v must go, < > SPACE ESC stay`);
  const p = game.player;
  // > held runs him right.
  const x0 = p.x;
  const fr = down('right');
  ticks(0.3);
  const ranRight = inp.axis === 1 && p.x > x0 + 5;
  // Slid onto <: he turns -- running right, he brakes and runs left, so what shows it within a
  // few frames is his velocity going negative, not where he is yet.
  const L = btn('left');
  T.pointer('move', fr, L.x + L.w / 2, L.y + L.h / 2);
  let turnedAt = null;
  for (let i = 0; i < FPS && turnedAt === null; i++) { tick(); if (p.vx < 0) turnedAt = (i + 1) / FPS; }
  const turned = inp.axis === -1 && turnedAt !== null;
  // Drifted up off both: he keeps running left.
  T.pointer('move', fr, L.x + L.w / 2, L.y - L.h * 1.5);
  ticks(0.1);
  const kept = inp.axis === -1;
  up(fr);
  tick();
  const stopped = inp.axis === 0;
  ok(ranRight && turned && kept && stopped,
    `C. the arrows: > ran him right ${ranRight}, a slide onto < turned him ${turned} (${turnedAt === null ? 'never' : `in ${turnedAt.toFixed(2)} s`}), drifting up off both kept < ${kept}, lifting stopped him ${stopped}`);
  // Two fingers: > and SPACE, each its own.
  ticks(0.5);
  const f1 = down('right');
  tick();
  const f2 = down('jump');
  tick();
  const both = inp.axis === 1 && inp.jumpHeld;
  up(f2);
  tick();
  const jumpLet = !inp.jumpHeld && inp.axis === 1;
  up(f1);
  tick();
  ok(both && jumpLet && inp.axis === 0,
    `C. two fingers: > and SPACE held together ${both}, SPACE let go leaves > held ${jumpLet}, both lifted ${inp.axis === 0}`);
  // A held SPACE is a held jump: jumpHeld all the while the finger is down.
  ticks(0.6);
  const fj = down('jump');
  let heldAll = true;
  for (let i = 0; i < 20; i++) { tick(); if (!inp.jumpHeld) heldAll = false; }
  up(fj);
  tick();
  ok(heldAll && !inp.jumpHeld, `C. a finger kept on SPACE for 1/3 s: the jump held all the while ${heldAll}, let go on the lift ${!inp.jumpHeld}`);
  // Two fingers on one key: held until both lift.
  const g1 = down('left');
  const g2 = down('left');
  tick();
  up(g1);
  tick();
  const stillHeld = inp.axis === -1;
  up(g2);
  tick();
  ok(stillHeld && inp.axis === 0, `C. two fingers on <: held after the first lifted ${stillHeld}, let go after both ${inp.axis === 0}`);
  // Nothing repeats in a run.
  heard.length = 0;
  const h = down('left');
  for (let i = 0; i < 60; i++) tickT();
  up(h);
  tick();
  const lefts = heard.filter((e) => e.code === 'ArrowLeft');
  ok(lefts.length === 1, `C. < held a second in a run sent ${lefts.length} keydowns (${lefts.filter((e) => e.repeat).length} repeats): a run reads no repeat`);
  // ESC pauses; the pause offers S and Q; Q goes back to the title.
  tapBtn('esc');
  ok(game.state === STATE.PAUSED, `C. ESC in a run did not pause it (${game.state})`);
  settle();
  const pause = row();
  ok(pause.join(' ') === 'S Q', `C. the pause's row is [${pause.join(' ')}]: its hints are ESC RESUME, S STATS, Q QUIT TO MENU`);
  tapBtn('key:Q');
  ticks(0.2);
  ok(game.state === STATE.MENU, `C. Q on the pause did not go back to the title (${game.state})`);
  note(`C. a run: < > SPACE ESC only; the arrows run, slide and keep; two fingers each their own; a held jump; no repeat; the pause offers [${pause.join(' ')}], Q back`);
}

// =============================================================================================
// D. The menus: a held v repeats as a held key does.
// =============================================================================================
{
  for (let i = 0; i < 3; i++) drawnTick();
  tapBtn('key:O');
  ok(game.state === STATE.OPTIONS, `D. O on the title's row did not open the options (${game.state})`);
  ok(ids().includes('up') && ids().includes('down'), `D. the options have no ^ v: ${ids().join(' ')}`);
  heard.length = 0;
  clock = 0;
  const f = down('down');
  for (let i = 0; i < 60; i++) tickT();
  up(f);
  tick();
  const downs = heard.filter((e) => e.code === 'ArrowDown');
  const reps = downs.filter((e) => e.repeat);
  const want = 1 + Math.floor((1 - REPEAT_DELAY) / REPEAT_RATE + 1e-9) + 1;   // the press, the first at the delay, then every rate
  const first = reps.length ? reps[0].t : null;
  ok(downs.length >= want - 1 && downs.length <= want + 1 && first !== null && first >= REPEAT_DELAY - 1 / FPS && first <= REPEAT_DELAY + 2 / FPS,
    `D. v held a second: ${downs.length} keydowns, the first repeat at ${first === null ? 'none' : first.toFixed(3) + ' s'} (want about ${want}, the first at ${REPEAT_DELAY} s)`);
  tapBtn('esc');
  ok(game.state === STATE.MENU, `D. ESC did not leave the options (${game.state})`);
  note(`D. v held a second in the options: ${downs.length} keydowns, repeating from ${first && first.toFixed(2)} s every ${REPEAT_RATE} s`);
}

// =============================================================================================
// E. The Android build going to the background and back.
// =============================================================================================
{
  const A = V.audio;
  const send = (name) => page.win.dispatchEvent(new Event(name));
  // On the title: the music stops, and comes back.
  ticks(0.5);
  send('app:background');
  const titleOff = A.paused === true;
  ticks(0.5);
  send('app:foreground');
  const titleOn = A.paused === false;
  // In a run: paused, silent, and still so in front again until the pause is left.
  tapBtn('jump');
  ticks(0.5);
  const playing = game.state === STATE.PLAYING;
  send('app:background');
  const paused = game.state === STATE.PAUSED && A.paused === true;
  ticks(1);
  send('app:foreground');
  ticks(0.5);
  const stillPaused = game.state === STATE.PAUSED && A.paused === true;
  tapBtn('esc');
  const resumed = game.state === STATE.PLAYING && A.paused === false;
  ok(titleOff && titleOn, `E. the title in the background: the sound stopped ${titleOff}, came back in front ${titleOn}`);
  ok(playing && paused && stillPaused && resumed,
    `E. a run in the background: paused and silent ${paused}; in front again still paused and silent ${stillPaused}; ESC resumed it, sound and all ${resumed}`);
  note('E. the app in the background: a run pauses and the sound goes; in front it waits for the pause to be left; the title\'s music stops and comes back');
}

// =============================================================================================
// F. The scoreboard: R plays the run back.
// =============================================================================================
{
  ok(game.state === STATE.PLAYING, `F. no run to lose (${game.state})`);
  // A climb by thumb onto the first ledge -- walked under with < or >, let settle, SPACE held
  // for a full jump -- which lights the fire (RISE_START_FLOOR); then he stands, and it takes
  // him in a step, as in play. The recording seals on the step he dies in: a die() from outside
  // the steps would leave it open for good, and the scoreboard with no replay to offer.
  const p = game.player;
  const f1 = game.tower.get(1);
  const target = f1.x + f1.w / 2;
  for (let tries = 0; tries < 5 && game.run.maxFloor < 1; tries++) {
    const dir = p.x < target ? 'right' : 'left';
    const fm = down(dir);
    for (let i = 0; i < 6 * FPS && (dir === 'right' ? p.x < target - 4 : p.x > target + 4); i++) tick();
    up(fm);
    ticks(0.5);
    const fj = down('jump');
    ticks(0.45);
    up(fj);
    ticks(1.2);
  }
  const climbed = game.run.maxFloor;
  for (let i = 0; i < 120 * FPS && game.state !== STATE.DEAD; i++) tick();
  ok(climbed >= 1 && game.state === STATE.DEAD, `F. a climb by thumb reached floor ${climbed}, and the run ${game.state === STATE.DEAD ? 'reached' : 'did not reach'} the scoreboard (${game.state})`);
  ticks(1);
  settle();
  const board = row();
  ok(board.includes('S') && board.includes('R') && !board.includes('H') && !board.includes('O'),
    `F. the scoreboard's row is [${board.join(' ')}]: its hints are S STATS and R REPLAY (and G RACE BEST), and the title's H and O are gone`);
  tapBtn('key:R');
  ok(V.replays.mode === 'watch', `F. R on the scoreboard's row did not play the run back (${V.replays.mode})`);
  tapBtn('esc');
  ticks(0.2);
  ok(!V.replays.active && game.state === STATE.DEAD, `F. ESC did not leave the replay for the scoreboard (${V.replays.mode}, ${game.state})`);
  note(`F. a climb by thumb to floor ${climbed}, the fire; the scoreboard offers [${board.join(' ')}]; R plays the run back; ESC returns`);
}

// =============================================================================================
// G. A touch's end asks for the sound.
// =============================================================================================
{
  V.audio.ctx.state = 'suspended';
  const before = AUDIO.asked;
  page.win.dispatchEvent(new Event('touchend'));
  ok(AUDIO.asked > before, 'G. a touchend did not ask the context to resume: on a phone the first tap would start no sound');
  note('G. a touch\'s end asks for the sound');
}

// =============================================================================================
// H. In Android's WebView the low-latency hint is never used.
// =============================================================================================
{
  const R = await import(u('src/render/renderer.js'));
  const saved = JSON.parse(localStorage.getItem('dukevytis.settings.v2') || '{}');
  const wanted = saved.lowLatency !== false;   // LOW LATENCY as saved, or the default: on
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const android = 'Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
  ok(wanted && V.renderer.lowLatency === false, `H. in the WebView, with LOW LATENCY ${wanted ? 'on' : 'off'} as saved, the renderer used the hint: ${V.renderer.lowLatency}`);
  ok(R.lowLatencyWorks(chrome) && R.lowLatencyWorks(android) && !R.lowLatencyWorks(WEBVIEW_UA),
    'H. lowLatencyWorks is wrong about desktop Chrome, Chrome for Android or the WebView');
  V.renderer.setLowLatency(true);
  ok(V.renderer.lowLatency === false, 'H. turning LOW LATENCY on in the WebView put the hint on');
  note('H. in Android\'s WebView the screen is drawn without the low-latency hint, whatever the setting says');
}

cleanup();
if (bad) { console.log(`\n  ${bad} check(s) failed`); process.exit(1); }
console.log('\n  all passed');
process.exit(0);
