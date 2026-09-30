// The touch controls (src/ui/touch.js), as main.js runs them on a phone -- booted for real over
// tools/fakepage.mjs with `?touch` in the address, the fingers driven through TouchControls'
// pointer(), which is what its layer's pointer events call.
//
//   A. When there are any: `?touch` yes, `?notouch` no, else a coarse pointer and no fine one;
//      a keycap's legend names its key and a pad's button names none; on a phone's viewport,
//      held sideways or upright, at every TOUCH KEYS size, every button is inside it and none
//      overlaps another; at the first cut's size each is big enough for a thumb, and ESC and the
//      top row keep that size at every other. The camera's hole: a key stands clear of it only
//      when beside it -- a hole in the middle of the edge (a Pixel's) moves nothing, one in a
//      corner moves the key there -- and where only a browser's safe-area band is known, every
//      key on that side clears the band. The Android app's holes are read in CSS px, asked of
//      gameShell.cutouts at the start and taken from its 'app:cutouts' event when they move.
//   B. The title: none of the fixed keys and no top row -- it draws its own buttons, TAP TO
//      CLIMB and OPTIONS STATS REPLAYS HELP, inside the frame, apart and a thumb tall, and a
//      finger presses what is drawn; STATS there opens the statistics. A composite's keycaps
//      are offered each time it is blitted (the desktop title's hints, drawn into the watch).
//   C. A run, started with TAP TO CLIMB: < > SPACE ESC, no ^ v; > held runs him right, a
//      thumb sliding onto < turns him, drifting up off both keeps the one it had, lifting stops
//      him; two fingers at once (> and SPACE) each hold their own key, a held SPACE is a held
//      jump, and two on one key hold it until both lift; nothing repeats in a run; ESC pauses and
//      the pause's row offers S and Q; Q goes back to the title, and for STRIP_HOLD after the
//      title stops drawing them their buttons stay, then go.
//   D. The options, opened with the title's OPTIONS: TOUCH KEYS is the first row, 80% by
//      default, and sizes < > SPACE as it changes; there is no LOW LATENCY in the WebView (the
//      row after GRAVITY is SCALING); a held v repeats as a held key does -- once, again after
//      REPEAT_DELAY, then every REPEAT_RATE. A phone's frame cap is 60 until chosen otherwise.
//   E. The Android build's background and foreground: a run pauses and the sound goes with the
//      app; back in front it stays paused and silent until the pause is left; on the title the
//      music stops and comes back.
//   F. The scoreboard: its row offers R, and R there plays the run back.
//   G. A touch's END asks for the sound, where Chromium lets a page start it.
//   H. In Android's WebView -- the page booted with its user agent, LOW LATENCY on as saved --
//      the screen's canvas is made WITHOUT the low-latency hint, which the WebView never puts on
//      the screen (a black game, on the emulator); in any other browser the setting holds.
//   I. The title's buttons under a finger: a finger that slides off before it lifts presses
//      nothing, and the button lights while the finger is on it (a pixel of the drawn frame);
//      HELP opens the help and a tap anywhere goes back; with the attract view up a tap only
//      wakes the title, even on TAP TO CLIMB's place.
//   J. The screen, filled by the GAME (render/renderer.js COVER_MAX): a 20:9 phone's canvas is
//      the whole viewport, the world drawn across all of it and the UI at its own size in the
//      middle -- TAP TO CLIMB where the frame puts it -- and a wash over the whole screen, not
//      the frame; a desktop's wide window keeps its mirrored wings. The Android app's holes are
//      followed as the phone turns.
//   K. The joystick (MOVE WITH, the default; the buttons are what A-J test): chosen in the
//      options, it stands in for the arrows each screen has; pushed past its line it holds the
//      arrow that way and lets go only well back (no stutter on the line); in a run left and
//      right alone, in a menu one axis at a time; the knob stays in its base; lifting lets go.
//      A fresh save moves with it.
//   L. Before the game is drawn a phone plays no music, and the Android app's loading screen is
//      told to go once it is (gameShell.ready, once); a phone's backdrop is drawn at half the
//      resolution and loses no pixel for it; a phone's defaults: FRAME CAP 60, PARTICLES MEDIUM,
//      no SCANLINES.
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
  'one-finger': [['src/ui/touch.js', '      this.fingers.set(id, b ? { id: b.id, code: b.code } : { id: null, code: null, tap: t ? t.code : null });', '      this.fingers.clear();\n      this.fingers.set(id, b ? { id: b.id, code: b.code } : { id: null, code: null, tap: t ? t.code : null });']],
  // caught by C (two fingers on one key: the first to lift lets go of it)
  'no-count': [['src/ui/touch.js', '    if (n > 0) { this.held.set(code, n); return; }\n', '']],
  // caught by C (the menus' ^ and v stay in a run)
  'arrows-in-run': [['src/main.js', "  run: ['left', 'right', 'jump', 'esc'],", "  run: ['left', 'right', 'up', 'down', 'jump', 'esc'],"]],
  // B: the title shows every fixed key, as the first cut did.
  'title-keys': [['src/main.js', '  none: [],', "  none: ['left', 'right', 'up', 'down', 'jump', 'esc'],"]],
  // B, C: the screen's list of keys ignored.
  'keys-ignored': [['src/ui/touch.js', '    for (const b of FIXED) if (shown.includes(b.id)) list.push({ ...b, ...R[b.id] });', '    for (const b of FIXED) list.push({ ...b, ...R[b.id] });']],
  // B: the title's buttons are not offered to a finger.
  'no-targets': [['src/main.js', '  if (game.state === STATE.MENU) return quitting || attractK() > 0 ? NO_TARGETS : menuTargets();', '  if (game.state === STATE.MENU) return NO_TARGETS;']],
  // B: a finger's page pixels taken as the frame's, forgetting the wings.
  'toview-no-wing': [['src/render/renderer.js', '    return [bx / PX - this.wing, by / PX];', '    return [bx / PX, by / PX];']],
  // I: a tap pressed on the finger's landing, as a key would be.
  'tap-on-down': [['src/ui/touch.js', '      if (t) { this.pressedCode = t.code; }', "      if (t) { this.pressedCode = t.code; this.send('keydown', t.code, false); this.send('keyup', t.code, false); }"]],
  // I: the button under a finger not lit.
  'pressed-unlit': [['src/main.js', '  touchState.pressed = touch.pressedCode;', '  touchState.pressed = null;']],
  // I: the help's tap-anywhere way back gone.
  'help-no-back': [['src/main.js', '  if (game.state === STATE.HELP) return ANYWHERE;\n', '']],
  // I: the attract view's tap pressing the button under it too.
  'attract-presses': [['src/main.js', '  if (game.state === STATE.MENU) return quitting || attractK() > 0 ? NO_TARGETS : menuTargets();', '  if (game.state === STATE.MENU) return quitting ? NO_TARGETS : menuTargets();']],
  // A, D: TOUCH KEYS ignored by the layout.
  'size-ignored': [['src/ui/touch.js', '  const u = k * Math.min(size, fits);', '  const u = k * Math.min(1, fits);']],
  // A: the keys grown past the width upright.
  'size-unbounded': [['src/ui/touch.js', '  const u = k * Math.min(size, fits);', '  const u = k * size;']],
  // A: a hole taken as a band down its whole side, as the safe-area insets are.
  'hole-as-band': [['src/ui/touch.js', '    for (const h of holes) if (h.x0 < vw / 2 && h.y0 < y1 + gap && h.y1 > y0 - gap) x = Math.max(x, h.x1 + gap);', '    for (const h of holes) if (h.x0 < vw / 2) x = Math.max(x, h.x1 + gap);']],
  // A: the holes ignored, the band alone.
  'holes-ignored': [['src/ui/touch.js', '    if (!holes) return m + ((inset && inset.l) || 0);', '    return m + ((inset && inset.l) || 0);']],
  // A: the app's holes taken in the screen's pixels, not CSS px.
  'holes-unscaled': [['src/ui/touch.js', '      const d = (this.win && this.win.devicePixelRatio) || 1;', '      const d = 1;']],
  // J: the app's word that the holes moved not heard.
  'holes-unheard': [['src/ui/touch.js', "    if (this.win && this.win.addEventListener) this.win.addEventListener('app:cutouts', (e) => this.readHoles(e && e.detail));\n", '']],
  // A: ESC as wide as the first cut's, over the HUD's floor counter where a band pushes it.
  'esc-wide': [['src/ui/touch.js', 'const ESC_W = 13;', 'const ESC_W = 17;']],
  // A: ESC and the top row sized with the play keys.
  'esc-scales': [['src/ui/touch.js', '  r.esc = { x: leftAt(m, m + KEY_H * k), y: m, w: ESC_W * k, h: KEY_H * k };', '  r.esc = { x: leftAt(m, m + KEY_H * k), y: m, w: ESC_W * u, h: KEY_H * u };']],
  // D: the first cut's size by default.
  'size-default-100': [['src/game/settings.js', '  touchKeys: 0.8,', '  touchKeys: 1,']],
  // D: the options' rows as a desktop's: TOUCH KEYS not first (not there at all) and LOW LATENCY in.
  'desktop-rows': [['src/main.js', 'const optList = () => Settings.optionsFor({ touch: touchUI, lowLatency: LOW_LATENCY_WORKS && !touchUI });', 'const optList = () => Settings.optionsFor({});']],
  // D: LOW LATENCY offered in the WebView, where it does nothing.
  'webview-row': [['src/main.js', 'const optList = () => Settings.optionsFor({ touch: touchUI, lowLatency: LOW_LATENCY_WORKS && !touchUI });', 'const optList = () => Settings.optionsFor({ touch: touchUI, lowLatency: true });']],
  // D: a phone left uncapped.
  'phone-uncapped': [['src/main.js', 'if (touchUI) Settings.phoneDefaults(settings);\n', '']],
  // J: a desktop's wide window with no wings, the 16:9 frame with bars either side.
  'no-wings': [['src/render/renderer.js', '      const wing = wingsFor(w, h);', '      const wing = 0;']],
  // J: a phone's screen with wings again, not filled by the game.
  'cover-off': [['src/render/renderer.js', '    this.cover = !!opts.cover;', '    this.cover = false;']],
  // J: the menus drawn at the world's size, over the phone's wider screen.
  'ui-in-world': [['src/render/renderer.js', "    // What main.js draws next is the UI: the menus, the boards, the pause.\n    this.useStage('ui');", "    // What main.js draws next is the UI: the menus, the boards, the pause.\n    this.useStage('world');"]],
  // J: a wash over the frame in the middle, the game bright down both sides.
  'wash-frame-only': [['src/render/menuskin.js', '  if (ctx.fillWhole) ctx.fillWhole();\n  else ctx.fillRect(0, 0, VW, VH);', '  ctx.fillRect(0, 0, VW, VH);']],
  // K: no gap between the joystick's lines: a thumb on the line stutters the key.
  'stick-no-gap': [['src/ui/touch.js', '    const line = (code) => (f.code === code ? STICK_RELEASE : STICK_ENGAGE);', '    const line = () => STICK_ENGAGE;']],
  // K: up and down on the joystick in a run.
  'stick-y-in-run': [['src/ui/touch.js', '    const ax = this.stickAxes || { x: true, y: false };', '    const ax = { x: true, y: true };']],
  // K: left and right always win, so a menu's cursor never moves on the joystick.
  'stick-x-always': [['src/ui/touch.js', '    if (ax.x && (!ax.y || Math.abs(nx) >= Math.abs(ny))) {', '    if (ax.x) {']],
  // K: the joystick's key kept when the thumb lifts.
  'stick-stays': [['src/ui/touch.js', "      if (type === 'move') { this.steer(f, x, y); return true; }\n      this.fingers.delete(id);\n      if (f.code) this.release(f.code);", "      if (type === 'move') { this.steer(f, x, y); return true; }\n      this.fingers.delete(id);"]],
  // K: the joystick never put up.
  'stick-never': [['src/ui/touch.js', "    const axes = move === 'stick' && shown.some((id) => STICK_AXIS[id])", "    const axes = false && shown.some((id) => STICK_AXIS[id])"]],
  // L: the title's music started at boot, as it was.
  'boot-music': [['src/main.js', "  if (!touchUI || onScreen) audio.crossTo('menu');", "  audio.crossTo('menu');"]],
  // L: the music up before the game is drawn, by the sound's retry.
  'music-first': [['src/main.js', '  if (touchUI && !onScreen) return;\n', '']],
  // L: the app's loading screen never told to go.
  'never-ready': [['src/main.js', "    try { if (window.gameShell && typeof window.gameShell.ready === 'function') window.gameShell.ready(); } catch (e) { /* no app */ }\n", '']],
  // L: a phone's backdrop at full resolution, four screens of pixels a frame.
  'full-backdrop': [['src/render/renderer.js', '    if (this.stages) {\n      // A phone draws the backdrop at HALF', '    if (false) {\n      // A phone draws the backdrop at HALF']],
  // L: the phone's second defaults never made.
  'phone-v1': [['src/game/settings.js', 'const TOUCH_V = 2;', 'const TOUCH_V = 1;']],
  // K: a fresh save moving with the buttons.
  'stick-not-default': [['src/game/settings.js', "  touchMove: 'stick',", "  touchMove: 'buttons',"]],
  // J: wings made, never painted.
  'wings-unpainted': [['src/render/renderer.js', '    if (this.wing) this.drawWings(s);', '']],
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
// MOVE WITH the buttons for A-J; K chooses the joystick in the options, and checks the default.
localStorage.setItem('dukevytis.settings.v2', JSON.stringify({ guideSeen: true, music: true, speedV: 3, touchMove: 'buttons' }));
// The Android app's shell, as its JavaScript interface presents it (MainActivity.Shell): L counts
// the page's ready().
const SHELL = { readies: 0 };
page.win.gameShell = { ready() { SHELL.readies++; }, cutouts: () => '[]', isFullscreen: () => true, toggleFullscreen() {}, quit() {} };
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const V = await bootMain(u('src/main.js'));
// Before anything is drawn (L): no music, and the loading screen not yet told to go -- after the
// sound's one-second retry (main.js's setInterval) has had its chance, still nothing drawn.
await new Promise((r) => setTimeout(r, 1300));
const AT_BOOT = { track: V.audio.track, voices: !!V.audio.voices, readies: SHELL.readies };
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
/**
 * A point of the frame [view units] in the page's CSS pixels, worked out here from what the
 * page is -- the canvas centred in the viewport (index.html #wrap) at its CSS size, the frame
 * `wing` units in from its left edge -- not asked of the renderer, whose toView is under test.
 */
function cssOf(vx, vy) {
  const R = V.renderer, c = R.canvas;
  const cw = parseFloat(c.style.width), ch = parseFloat(c.style.height);
  return [(page.win.innerWidth - cw) / 2 + (vx + R.wing) * 4 * cw / c.width, (page.win.innerHeight - ch) / 2 + vy * 4 * ch / c.height];
}
const target = (code) => T.targets().find((t) => t.code === code) || null;
/** A finger down on the middle of what the screen drew for `code`; returns the finger's id. */
function downOn(code) {
  const t = target(code);
  if (!t) { fail(`nothing drawn to tap for ${code} (targets: ${T.targets().map((x) => x.code).join(' ')})`); return -1; }
  const f = ++fingerId;
  T.pointer('down', f, ...cssOf(t.x + t.w / 2, t.y + t.h / 2));
  return f;
}
/** A tap on what the screen drew for `code`, lifted where it landed. */
function tapOn(code) {
  const t = target(code);
  const f = downOn(code);
  tick();
  if (t) T.pointer('up', f, ...cssOf(t.x + t.w / 2, t.y + t.h / 2));
  tick();
}
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
  // At every TOUCH KEYS size (60% to 130%): inside, none over another. At the first cut's size
  // every button at least 40 CSS px (about 6 mm) across; ESC and the top row keep that size at
  // every size -- TOUCH KEYS is the play keys' (the user asked for < > and SPACE smaller, and
  // adjustable).
  const strip = ['ENTER', 'S', 'R', 'N', 'P', 'E', 'I', 'DEL'];
  const problems = [];
  for (const size of [0.6, 0.8, 1, 1.3]) {
    for (const [vw, vh] of [[915, 412], [800, 360], [640, 360], [412, 915], [1280, 800]]) {
      // The joystick and the arrows are never up together (MOVE WITH): each set is checked alone.
      const all = Object.entries(Touch.touchLayout(vw, vh, strip, size));
      const L = all.filter(([id]) => id !== 'stick');
      const LS = all.filter(([id]) => !['left', 'right', 'up', 'down'].includes(id));
      for (let i = 0; i < LS.length; i++) for (let j = i + 1; j < LS.length; j++) {
        const [a, p] = LS[i], [b, q] = LS[j];
        if ((a === 'stick' || b === 'stick') && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) problems.push(`${size} ${vw}x${vh} ${a} over ${b}`);
      }
      for (const [id, r] of all) {
        if (r.x < 0 || r.y < 0 || r.x + r.w > vw || r.y + r.h > vh) problems.push(`${size} ${vw}x${vh} ${id} outside`);
        const fixed = id === 'esc' || id.startsWith('key:');
        if ((size === 1 || fixed) && Math.min(r.w, r.h) < 40) problems.push(`${size} ${vw}x${vh} ${id} ${Math.min(r.w, r.h).toFixed(0)} px`);
      }
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const [a, p] = L[i], [b, q] = L[j];
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) problems.push(`${size} ${vw}x${vh} ${a} over ${b}`);
      }
    }
  }
  ok(!problems.length, `A. the layout: ${problems.slice(0, 6).join('; ')}`);
  // The size is the play keys' own: SPACE is 34 u across at 100% [u: a hundredth of the short
  // side], so on a 412 px short side 140.08 px at 100% and 112.06 at 80%; ESC 13 u at any size.
  const at = (s) => Touch.touchLayout(915, 412, [], s);
  const sized = Math.abs(at(1).jump.w - 140.08) < 0.01 && Math.abs(at(0.8).jump.w - 112.064) < 0.01
    && Math.abs(at(0.8).esc.w - 53.56) < 0.01 && Math.abs(at(1.3).esc.w - 53.56) < 0.01;
  ok(sized, `A. SPACE ${at(1).jump.w.toFixed(2)} px at 100% and ${at(0.8).jump.w.toFixed(2)} at 80% (want 140.08, 112.06); ESC ${at(0.8).esc.w.toFixed(2)} and ${at(1.3).esc.w.toFixed(2)} (want 53.56 at both)`);
  // The camera's hole, 915 x 412 at 80% [CSS px; m, the margin, is 12.36; a key clears a hole by
  // 8.24, two u]: in the middle of the left edge (a Pixel's, 0-38 across and 190-222 down) no key
  // moves -- ESC and < at 12.36, ^ at 55.21, where they stand with no hole; in the top left
  // corner (0-60) ESC alone moves, to 68.24; in the bottom right (870-915, 360-412) SPACE alone,
  // its right edge to 861.76. With only a browser's band (49 px down the left) every key on that
  // side moves 49 in: ESC and < at 61.36. And in every case no key over a hole.
  const L8 = (inset, holes) => Touch.touchLayout(915, 412, ['S', 'Q'], 0.8, inset, holes);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const mid = [{ x0: 0, y0: 190, x1: 38, y1: 222 }], tl = [{ x0: 0, y0: 0, x1: 60, y1: 60 }], br = [{ x0: 870, y0: 360, x1: 915, y1: 412 }];
  const a0 = L8({ l: 49, r: 49 }, mid), a1 = L8(null, tl), a2 = L8(null, br), a3 = L8({ l: 49, r: 0 }, null);
  const over = (R, holes) => Object.entries(R).filter(([, b]) => holes.some((h) => b.x < h.x1 && h.x0 < b.x + b.w && b.y < h.y1 && h.y0 < b.y + b.h)).map(([id]) => id);
  const holeWrong = [];
  if (!(near(a0.esc.x, 12.36) && near(a0.left.x, 12.36) && near(a0.up.x, 55.208))) holeWrong.push(`a middle hole moved ESC to ${a0.esc.x.toFixed(2)}, < to ${a0.left.x.toFixed(2)}, ^ to ${a0.up.x.toFixed(2)}`);
  if (!(near(a1.esc.x, 68.24) && near(a1.left.x, 12.36))) holeWrong.push(`a corner hole put ESC at ${a1.esc.x.toFixed(2)} (want 68.24) and < at ${a1.left.x.toFixed(2)} (want 12.36)`);
  if (!(near(a2.jump.x + a2.jump.w, 861.76) && near(a2.esc.x, 12.36))) holeWrong.push(`a bottom-right hole put SPACE's right edge at ${(a2.jump.x + a2.jump.w).toFixed(2)} (want 861.76)`);
  if (!(near(a3.esc.x, 61.36) && near(a3.left.x, 61.36))) holeWrong.push(`a band put ESC at ${a3.esc.x.toFixed(2)} and < at ${a3.left.x.toFixed(2)} (want 61.36)`);
  for (const [R, holes, name] of [[a0, mid, 'middle'], [a1, tl, 'corner'], [a2, br, 'bottom right']]) {
    const o = over(R, holes);
    if (o.length) holeWrong.push(`${o.join(' ')} over the ${name} hole`);
  }
  // The app's holes in CSS px: [[0, 500, 100, 580]] in the screen's pixels at a ratio of 2.625.
  const fake = new Touch.TouchControls({ target: { addEventListener() {}, dispatchEvent() {} },
    win: { innerWidth: 915, innerHeight: 412, devicePixelRatio: 2.625, gameShell: { cutouts: () => '[[0,500,100,580]]' } }, doc: {} });
  const fh = fake.holes && fake.holes[0];
  if (!(fh && near(fh.x1, 100 / 2.625) && near(fh.y0, 500 / 2.625) && near(fh.y1, 580 / 2.625))) holeWrong.push(`gameShell.cutouts read as ${JSON.stringify(fake.holes)} (want x1 38.10, y 190.48-220.95)`);
  ok(!holeWrong.length, `A. the camera's hole: ${holeWrong.join('; ')}`);
  note(`A. touch where asked or on a phone only; keycaps name their keys, a pad's none; five phone viewports laid out clear at 60-130%, the play keys sized by it; a key clears the camera's hole only beside it, a band where a band is all that is known`);
}

// =============================================================================================
// B. The title's row: the keys its hints show, from the keycaps the frame drew.
// =============================================================================================
{
  ok(game.state === STATE.MENU, `B. the page did not boot to the title (${game.state})`);
  ticks(1);
  settle();
  // Nothing of the fixed keys and no top row: the user found up and down arrows on the main
  // menu that did nothing there (2026-09-29).
  ok(ids().length === 0, `B. the title draws its own buttons and needs no fixed keys, but shows [${ids().join(' ')}]`);
  // Its buttons, as a finger finds them: TAP TO CLIMB, then the row, left to right.
  const tg = T.targets();
  const codes = tg.map((t) => t.code).join(' ');
  ok(codes === 'Space KeyO KeyS KeyR KeyH', `B. the title's buttons press [${codes}] (want TAP TO CLIMB, OPTIONS, STATS, REPLAYS, HELP: Space KeyO KeyS KeyR KeyH)`);
  // Inside the frame, apart, and a thumb tall on this phone: 44 CSS px at least (Apple's figure,
  // under Android's 48 dp) -- the frame is 412 px for 270 view units here.
  const pxPerUnit = parseFloat(V.renderer.canvas.style.height) / 270;
  const bad = [];
  for (let i = 0; i < tg.length; i++) {
    const t = tg[i];
    if (t.x < 0 || t.y < 0 || t.x + t.w > 480 || t.y + t.h > 270) bad.push(`${t.code} outside the frame`);
    if (t.h * pxPerUnit < 44) bad.push(`${t.code} ${(t.h * pxPerUnit).toFixed(0)} px tall`);
    for (let j = i + 1; j < tg.length; j++) {
      const q = tg[j];
      if (t.x < q.x + q.w && q.x < t.x + t.w && t.y < q.y + q.h && q.y < t.y + t.h) bad.push(`${t.code} over ${q.code}`);
    }
  }
  ok(!bad.length, `B. the title's buttons: ${bad.join('; ')}`);
  tapOn('KeyS');
  ok(game.state === STATE.STATS, `B. STATS on the title did not open the statistics (${game.state})`);
  tapBtn('esc');
  ok(game.state === STATE.MENU, `B. ESC did not leave the statistics (${game.state})`);
  settle();
  // A composite's keycaps reach the row each time it is blitted, as well as the keys drawn
  // straight: no phone screen letters its hints into one today, so the desktop's title -- whose
  // key hints are one (screens.js drawLower) -- is drawn here, twice, into the watched set: once
  // as the composite is built, once from the cache.
  const S = await import(u('src/ui/screens.js'));
  const M = await import(u('src/render/menuskin.js'));
  const caps = [];
  for (let i = 0; i < 2; i++) {
    const seen = new Set();
    M.watchCaps(seen);
    S.drawMenu(V.renderer.ctx, V.stats(), 1, 1 / FPS, true, false, null);
    M.watchCaps(null);
    caps.push([...seen].filter((s) => Touch.capCode(s)).sort().join(' '));
  }
  ok(caps[0] === 'F H M O P R S SPACE' && caps[1] === caps[0],
    `B. the desktop title's hints, from its composite: [${caps[0]}] built, [${caps[1]}] from the cache (want F H M O P R S SPACE both times: the hints' keys, SPACE among them)`);
  note(`B. the title: no fixed keys, its own five buttons (${codes}); STATS opens the statistics, ESC is back; a composite's keycaps are offered, built or cached`);
}

// =============================================================================================
// C. A run: the arrows, the jump, two fingers, the pause.
// =============================================================================================
{
  const inp = V.input;
  tapOn('Space');
  ok(game.state === STATE.PLAYING, `C. TAP TO CLIMB on the title did not start a run (${game.state})`);
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
  ok(game.state === STATE.MENU, `C. Q on the pause did not go back to the title (${game.state})`);
  // The title draws no keycaps: the pause's go from the row -- but not at once.
  drawnTick();
  const soon = row();
  let gone = null;
  for (let i = 0; i < 30; i++) {
    drawnTick();
    if (!row().includes('Q')) { gone = (i + 2) / FPS; break; }
  }
  ok(soon.includes('Q') && gone !== null && gone >= STRIP_HOLD - 0.02 && gone <= STRIP_HOLD + 0.1,
    `C. the pause's Q left the row ${gone === null ? 'never' : `after ${gone.toFixed(3)} s`} (it must stay ${STRIP_HOLD} s after its hint goes, then go); a frame on: [${soon.join(' ')}]`);
  ticks(0.2);
  note(`C. a run: < > SPACE ESC only; the arrows run, slide and keep; two fingers each their own; a held jump; no repeat; the pause offers [${pause.join(' ')}], Q back, and its keys stay ${STRIP_HOLD} s (${gone && gone.toFixed(2)} s), then go`);
}

// =============================================================================================
// D. The menus: a held v repeats as a held key does.
// =============================================================================================
{
  settle();
  // A phone's frame cap: 60, the first time it is played by touch (Settings.phoneDefaults).
  ok(V.settings().fpsCap === 60, `D. a phone's frame cap is ${V.settings().fpsCap || 'UNCAPPED'} (want 60 until chosen otherwise)`);
  tapOn('KeyO');
  ok(game.state === STATE.OPTIONS, `D. OPTIONS on the title did not open the options (${game.state})`);
  ok(ids().includes('up') && ids().includes('down'), `D. the options have no ^ v: ${ids().join(' ')}`);
  // TOUCH KEYS: the first row, 80% by default, and > and < on it size the play keys. SPACE is
  // 34 u across [u: 4.12 px here] at 100%: 112.06 px at 80%, 126.07 at 90%.
  const w80 = btn('jump').w;
  tapBtn('right');
  const w90 = btn('jump').w, s90 = V.settings().touchKeys;
  tapBtn('left');
  const back = V.settings().touchKeys, w80b = btn('jump').w;
  ok(Math.abs(w80 - 112.064) < 0.01 && s90 === 0.9 && Math.abs(w90 - 126.072) < 0.01 && back === 0.8 && Math.abs(w80b - 112.064) < 0.01,
    `D. TOUCH KEYS, the first row: SPACE ${w80.toFixed(2)} px at the default, ${w90.toFixed(2)} after > (TOUCH KEYS ${s90}), ${w80b.toFixed(2)} after < (${back}); want 112.06 at 80%, 126.07 at 90%`);
  // No LOW LATENCY on a phone: six rows down from TOUCH KEYS -- MOVE WITH, JUMP SPEED,
  // PLATFORMS, DIFFICULTY, GRAVITY -- is SCALING, and > there changes the scaling, not the hint.
  const was = { scale: V.settings().scaleMode, low: V.settings().lowLatency };
  for (let i = 0; i < 6; i++) tapBtn('down');
  tapBtn('right');
  const now = { scale: V.settings().scaleMode, low: V.settings().lowLatency };
  tapBtn('left');
  ok(now.scale !== was.scale && now.low === was.low && V.settings().scaleMode === was.scale,
    `D. the phone's options: > six rows under TOUCH KEYS changed SCALING ${was.scale} -> ${now.scale} and LOW LATENCY ${was.low} -> ${now.low} (want SCALING, LOW LATENCY not offered)`);
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
  note(`D. the options: TOUCH KEYS first, 80% and sizing SPACE; no LOW LATENCY in the WebView; frame cap 60; v held a second: ${downs.length} keydowns, repeating from ${first && first.toFixed(2)} s every ${REPEAT_RATE} s`);
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
  settle();
  tapOn('Space');
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

// =============================================================================================
// I. The title's buttons under a finger: lift to press, slide off to cancel, lit while held; the
//    help's way back; the attract view's tap.
// =============================================================================================
{
  // Back to the title from the scoreboard (F left it there).
  if (game.state === STATE.DEAD) tapBtn('esc');
  ticks(0.3);
  settle();
  ok(game.state === STATE.MENU, `I. no title to tap on (${game.state})`);
  // A finger down on OPTIONS, slid up off it, lifted: nothing. Lit while it was on.
  const t = target('KeyO');
  const f = downOn('KeyO');
  const lit = T.pressedCode === 'KeyO';
  tick();
  const [ox, oy] = cssOf(t.x + t.w / 2, t.y - 30);
  T.pointer('move', f, ox, oy);
  const unlit = T.pressedCode === null;
  T.pointer('up', f, ox, oy);
  ticks(0.2);
  ok(lit && unlit && game.state === STATE.MENU,
    `I. a finger on OPTIONS slid off before it lifted: lit on it ${lit}, unlit off it ${unlit}, and the screen is ${game.state} (want the title: a slide off is a change of mind)`);
  // Lit in the drawn frame: STATS' middle under a finger against without one. The pixel is the
  // plate's field, left of the word: dark panel without, crimson enamel with.
  const s = target('KeyS');
  const C = V.renderer.canvas;
  const px = () => {
    V.renderFrame(1, 1 / FPS);
    const X = Math.round((s.x + 4 + 3 + V.renderer.wing) * 4), Y = Math.round((s.y + s.h / 2) * 4);
    const i = (Y * C.width + X) * 4;
    return [C.data[i], C.data[i + 1], C.data[i + 2]];
  };
  const off = px();
  const fs = downOn('KeyS');
  const on = px();
  T.pointer('cancel', fs, 0, 0);
  const redder = on[0] - on[2] > off[0] - off[2] + 20;
  ok(redder && game.state === STATE.MENU,
    `I. STATS under a finger drew rgb(${on.join(',')}), without rgb(${off.join(',')}) (want it lit: crimson), and a cancelled finger left the title ${game.state}`);
  // HELP, and a tap anywhere back -- the wings too.
  tapOn('KeyH');
  const inHelp = game.state === STATE.HELP;
  const fh = ++fingerId;
  T.pointer('down', fh, 5, 5);
  tick();
  T.pointer('up', fh, 5, 5);
  ticks(0.2);
  ok(inHelp && game.state === STATE.MENU, `I. HELP opened the help ${inHelp}; a tap in the corner went back to ${game.state} (want the title: the help says TAP TO GO BACK)`);
  // The attract view: idle past ATTRACT_IDLE; a tap on TAP TO CLIMB's place wakes the title and
  // does not start a run.
  const climb = menuT();
  ticks(12);
  const k0 = V.attractK ? V.attractK() : null;
  const fa = ++fingerId;
  const [cx, cy] = cssOf(climb.x + climb.w / 2, climb.y + climb.h / 2);
  T.pointer('down', fa, cx, cy);
  page.win.dispatchEvent(new Event('pointerdown'));
  tick();
  T.pointer('up', fa, cx, cy);
  ticks(0.3);
  ok(game.state === STATE.MENU, `I. a tap on the attract view (at ${k0 === null ? '?' : k0.toFixed(2)} of it) started ${game.state} (want the title back, and no run)`);
  note('I. the title\'s buttons: lit under a finger, pressed on the lift, a slide off presses nothing; the help goes back on any tap; the attract view\'s tap only wakes the title');
}
function menuT() { return target('Space') || { x: 122, y: 146, w: 244, h: 42 }; }
function near2(a, b) { return typeof a === 'number' && Math.abs(a - b) < 0.01; }

// =============================================================================================
// J. The screen, filled by the game on a phone; a desktop's wide window keeps its wings.
// =============================================================================================
{
  const R = V.renderer, C = R.canvas;
  const Rm = await import(u('src/render/renderer.js'));
  // On this 915 x 412 phone [CSS px] the canvas is the screen's shape at the frame's height:
  // 1080 x 915/412 = 1199.3, to the nearest even, 2398 px wide -- the world drawn 2398/1920 =
  // 1.249 times its frame's size, the UI 239 px (59.75 units) in from the left at its own.
  const cw0 = parseFloat(C.style.width), ch0 = parseFloat(C.style.height);
  ok(C.width === 2398 && C.height === 1080 && R.wing === 59.75 && !!R.stages
    && Math.abs(cw0 - page.win.innerWidth) <= 1 && Math.abs(ch0 - page.win.innerHeight) <= 1,
    `J. a 915 x 412 phone's canvas is ${C.width} x ${C.height}, the UI ${R.wing} units in, shown at ${cw0} x ${ch0} (want 2398 x 1080, 59.75, the whole viewport)`);
  // Where the drawn UI is: TAP TO CLIMB's crimson face 10 units inside its left end [UI units:
  // it spans 122-358 across, 150-184 down], and the dark of the title 3 units outside it. Drawn
  // at the world's size the face would reach out over that dark.
  if (game.state !== STATE.MENU) { tapBtn('esc'); ticks(0.3); }
  if (game.state === STATE.PAUSED) { tapBtn('key:Q'); ticks(0.3); }
  settle();
  V.renderFrame(1, 1 / FPS);
  const px = (x, y) => { const i = (Math.round(y) * C.width + Math.round(x)) * 4; return [C.data[i], C.data[i + 1], C.data[i + 2]]; };
  const at = (ux, uy) => px(239 + ux * 4, uy * 4);
  const face = at(132, 167), outside = at(119, 167);
  const crimson = (c) => c[0] > c[1] + 40 && c[0] > c[2] + 20;
  ok(game.state === STATE.MENU && crimson(face) && !crimson(outside) && outside[0] < 120,
    `J. TAP TO CLIMB where the UI puts it: its face rgb(${face}) at 132, rgb(${outside}) 3 units outside it (want crimson inside, the dark title outside)`);
  // A run: the world across the whole canvas (its edges lit), and the pause's wash over all of
  // it, the edges too.
  tapOn('Space');
  ticks(0.6);
  V.renderFrame(1, 1 / FPS);
  const edgeLuma = () => {
    let s = 0, n = 0;
    for (let y = 300; y < 780; y += 8) for (const x of [4, 60, C.width - 61, C.width - 5]) {
      const c = px(x, y);
      s += 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      n++;
    }
    return s / n;
  };
  const lit = edgeLuma();
  tapBtn('esc');
  ticks(0.2);
  V.renderFrame(1, 1 / FPS);
  const dim = edgeLuma();
  ok(game.state === STATE.PAUSED && lit > 12 && dim < lit * 0.5,
    `J. the world to the canvas's edges (mean luma ${lit.toFixed(1)} there in a run) and the pause's wash over them (${dim.toFixed(1)} paused; want under half)`);
  tapBtn('esc');
  ticks(0.2);
  // A desktop's window as wide: the 16:9 frame in the middle and its edges mirrored into wings
  // [view units a side]: (w/h x 270 - 480) / 2, rounded up to cover the edge. 915 x 412: 59.6 ->
  // 60; 2400 x 1080: 60; 16:9: 0; 4:3: 0; 3440 x 1440 (an ultrawide): 82.5 -> 83; 32:9 at most
  // WING_MAX, 200. A renderer of its own, not a phone's.
  const want = [[915, 412, 60], [2400, 1080, 60], [1920, 1080, 0], [1024, 768, 0], [3440, 1440, 83], [5120, 1440, 200]];
  const wrong = want.filter(([w, h, n]) => Rm.wingsFor(w, h) !== n).map(([w, h, n]) => `${w}x${h}: ${Rm.wingsFor(w, h)} (want ${n})`);
  ok(!wrong.length, `J. wingsFor: ${wrong.join('; ')}`);
  const D = new Rm.Renderer(document.createElement('canvas'), {});
  D.draw(game, 1, 1 / FPS);
  D.present();
  const DC = D.canvas, dd = DC.data;
  const W = D.wing * 4, Y = 540;
  const dat = (x) => { const i = (Y * DC.width + x) * 4; return (dd[i] << 16) | (dd[i + 1] << 8) | dd[i + 2]; };
  let mism = 0, wlit = 0;
  for (let i = 0; i < 48; i++) {
    if (dat(W - 1 - i) !== dat(W + i)) mism++;
    if (dat(DC.width - W + i) !== dat(DC.width - W - 1 - i)) mism++;
    if (dat(W - 1 - i) !== 0) wlit++;
  }
  ok(D.wing === 60 && DC.width === 2400 && mism === 0 && wlit > 24,
    `J. a desktop's 915 x 412 window: ${D.wing} units of wings, ${mism} of 96 pixels on row ${Y} not the frame's edge mirrored, ${wlit} of 48 lit (want 60, 0, and a picture)`);
  // The Android app turned over: its 'app:cutouts' says where the hole is now [the screen's
  // pixels; this page's ratio is 1]. In the top left corner ESC stands clear of it; in the middle
  // of the edge, and with none, back at the margin.
  const escAt = () => btn('esc') && btn('esc').x;
  const cut = (list) => { page.win.dispatchEvent(new CustomEvent('app:cutouts', { detail: list })); tick(); return escAt(); };
  const [e1, e2, e3] = [cut([[0, 0, 60, 60]]), cut([[0, 190, 38, 222]]), cut([])];
  ok(near2(e1, 68.24) && near2(e2, 12.36) && near2(e3, 12.36),
    `J. the app's holes as the phone turns: ESC at ${e1 && e1.toFixed(2)} by a corner hole, ${e2 && e2.toFixed(2)} by a middle one, ${e3 && e3.toFixed(2)} with none (want 68.24, 12.36, 12.36)`);
  note(`J. a 20:9 phone's screen filled by the game: ${C.width} x ${C.height}, the world ${(C.width / 1920).toFixed(3)} times its frame, the UI at its own size in the middle, washes over all of it; a desktop's wide window keeps its wings`);
}

// =============================================================================================
// K. The joystick: chosen in the options, in the arrows' place, with a gap between its lines.
// =============================================================================================
{
  const S = await import(u('src/game/settings.js'));
  ok(S.DEFAULTS.touchMove === 'stick', `K. a fresh save moves with ${S.DEFAULTS.touchMove} (want the joystick)`);
  const inp = V.input;
  // To the options from wherever J left the run.
  if (game.state === STATE.PLAYING) { tapBtn('esc'); ticks(0.2); }
  if (game.state === STATE.PAUSED) { tapBtn('key:Q'); ticks(0.3); }
  settle();
  tapOn('KeyO');
  ok(game.state === STATE.OPTIONS && ids().includes('left'), `K. the options with the buttons (${game.state}: ${ids().join(' ')})`);
  // MOVE WITH is the second row: v, then > turns the buttons into the joystick.
  tapBtn('down');
  tapBtn('right');
  tick();
  const optKeys = ids().join(' ');
  ok(V.settings().touchMove === 'stick' && optKeys === 'jump esc stick',
    `K. MOVE WITH chosen as ${V.settings().touchMove}: the options' keys are [${optKeys}] (want the joystick in place of ^ v < >: jump esc stick)`);
  const st = () => btn('stick');
  const mid = () => { const b = st(); return [b.x + b.w / 2, b.y + b.h / 2, b.w / 2]; };
  // A thumb on the joystick [its base's radius r]: pushed down 0.6 r, the options' cursor moves
  // down, repeating; pushed right and a little down (0.5 r, 0.4 r), only the value changes.
  heard.length = 0;
  let [cx, cy, r] = mid();
  const sf = ++fingerId;
  T.pointer('down', sf, cx, cy);
  T.pointer('move', sf, cx, cy + 0.6 * r);
  for (let i = 0; i < 40; i++) tickT();
  const downs = heard.filter((e) => e.code === 'ArrowDown').length;
  const before = heard.length;
  T.pointer('move', sf, cx + 0.5 * r, cy + 0.4 * r);
  tick();
  const diag = heard.slice(before).map((e) => e.code);
  T.pointer('up', sf, cx, cy);
  tick();
  ok(downs >= 3 && diag.join(' ') === 'ArrowRight' && !inp.axis,
    `K. the joystick in the options: pushed down it sent ${downs} ArrowDowns (want a held key's repeats); right-and-down then sent [${diag.join(' ')}] (want ArrowRight alone); lifted, nothing held`);
  // A run: the joystick in < >'s place.
  tapBtn('esc');
  settle();
  tapOn('Space');
  ticks(0.6);
  const runKeys = ids().join(' ');
  ok(game.state === STATE.PLAYING && runKeys === 'jump esc stick', `K. a run's keys are [${runKeys}] (want jump esc stick: no < >)`);
  [cx, cy, r] = mid();
  heard.length = 0;
  const g = ++fingerId;
  const at = (fx, fy) => { T.pointer('move', g, cx + fx * r, cy + fy * r); tick(); return inp.axis; };
  T.pointer('down', g, cx, cy);
  tick();
  const a0 = inp.axis;
  const a1 = at(0.25, 0);      // under the line from rest: nothing
  const a2 = at(0.5, 0);       // past it: right
  const a3 = at(0.25, 0);      // back under it but over the let-go line: still right
  const a4 = at(0.15, 0);      // under the let-go line: nothing
  const a5 = at(-0.5, 0);      // left
  const a6 = at(0, -0.8);      // up, in a run: nothing
  const knobAt = (() => { at(2, 0); return T.knob && T.knob.dx; })();
  T.pointer('up', g, cx, cy);
  tick();
  const ups = heard.filter((e) => e.code === 'ArrowUp' || e.code === 'ArrowDown').length;
  ok(a0 === 0 && a1 === 0 && a2 === 1 && a3 === 1 && a4 === 0 && a5 === -1 && a6 === 0 && ups === 0
    && Math.abs(knobAt - r) < 0.01 && inp.axis === 0 && !T.knob,
    `K. the joystick in a run [axis at rest, 0.25 r, 0.5 r, back to 0.25 r, 0.15 r, -0.5 r, up]: ${[a0, a1, a2, a3, a4, a5, a6].join(' ')} (want 0 0 1 1 0 -1 0), ${ups} up/down keys (want 0), the knob at ${knobAt && knobAt.toFixed(1)} of ${r.toFixed(1)} pushed twice its base's radius (want the rim), lifted: axis ${inp.axis}, knob ${T.knob ? 'held' : 'home'}`);
  // Grabbed a little outside its base: a thumb need not land inside the ring.
  const gf = ++fingerId;
  T.pointer('down', gf, cx + 1.3 * r, cy);
  tick();
  const grabbed = inp.axis === 1;
  T.pointer('up', gf, cx, cy);
  tick();
  ok(grabbed && inp.axis === 0, `K. a thumb landing 1.3 radii right of the joystick grabbed it and ran him right: ${grabbed}`);
  note('K. the joystick: chosen in the options, in the arrows\' place on each screen, a gap between its lines, one axis at a time in a menu, left and right alone in a run, the knob held in its base, and the default');
}

// =============================================================================================
// L. The first frames, the phone's backdrop at half resolution, a phone's defaults.
// =============================================================================================
{
  // Booted with the music on and a context that runs at once (the WebView's policy): nothing
  // played before the game was drawn; after it, the title's music, and ready() once.
  ok(AT_BOOT.track === null && !AT_BOOT.voices && AT_BOOT.readies === 0 && SHELL.readies === 1 && !!V.audio.track,
    `L. at boot the music was ${AT_BOOT.track || 'off'} (${AT_BOOT.voices ? 'playing' : 'silent'}), ready() ${AT_BOOT.readies} times; drawn, the music is ${V.audio.track}, ready() ${SHELL.readies} times (want silent and none, then music and once)`);
  // A phone's backdrop through the half-resolution buffer: every one of its pixels the full
  // resolution's, the art being two backing pixels to the pixel. BASEMENT, whose FAR is opaque,
  // so the sky -- a gradient, which halving would band -- is nowhere seen.
  const Rm = await import(u('src/render/renderer.js'));
  const { Backdrop } = await import(u('src/render/backdrop.js'));
  const { THEMES } = await import(u('src/game/themes.js'));
  const full = document.createElement('canvas'); full.width = 1920; full.height = 1080;
  const half = document.createElement('canvas'); half.width = 960; half.height = 540;
  const gf = full.getContext('2d'), gh = half.getContext('2d');
  gf.imageSmoothingEnabled = false; gh.imageSmoothingEnabled = false;
  const B = new Backdrop();
  let diff = 0, n = 0;
  for (const cam of [0, 37, 1234.5]) {
    gf.setTransform(4, 0, 0, 4, 0, 0); B.draw(gf, cam, 0, THEMES[0], null, 0);
    gh.setTransform(2, 0, 0, 2, 0, 0); B.draw(gh, cam, 0, THEMES[0], null, 0);
    const F = full.data, H = half.data;
    for (let y = 0; y < 1080; y += 3) for (let x = 0; x < 1920; x += 3) {
      const i = (y * 1920 + x) * 4, j = ((y >> 1) * 960 + (x >> 1)) * 4;
      n++;
      if (F[i] !== H[j] || F[i + 1] !== H[j + 1] || F[i + 2] !== H[j + 2]) diff++;
    }
  }
  // And a phone's frame draws it so: the tiles into the half buffer, the buffer onto the screen
  // once -- no tile on the screen's own canvas.
  const R = V.renderer, P = Object.getPrototypeOf(R.ctx), di = P.drawImage;
  let tilesOnScreen = 0, halfBlits = 0;
  P.drawImage = function (img, ...a) {
    if (this === R.ctx) { if (img === R.halfBg) halfBlits++; else if (img.height === 256) tilesOnScreen++; }
    return di.call(this, img, ...a);
  };
  try { V.renderFrame(1, 1 / FPS); } finally { P.drawImage = di; }
  ok(diff === 0 && n > 600000 && halfBlits === 1 && tilesOnScreen === 0,
    `L. the backdrop at half resolution: ${diff} of ${n} sampled pixels unlike the full resolution's (want 0); a phone's frame blits the half buffer ${halfBlits} time(s) and draws ${tilesOnScreen} tile(s) on the screen itself (want 1 and 0)`);
  // A phone's defaults, made once into the save (Settings.phoneDefaults).
  const s = V.settings();
  ok(s.fpsCap === 60 && s.particles === 'medium' && s.scanlines === false && s.touchV === 2,
    `L. a phone's defaults: FRAME CAP ${s.fpsCap}, PARTICLES ${s.particles}, SCANLINES ${s.scanlines ? 'on' : 'off'}, marked ${s.touchV} (want 60, medium, off, 2)`);
  note('L. no music until the game is drawn, then the loading screen told to go once; a phone\'s backdrop at half resolution, pixel for pixel; a phone\'s defaults');
}

cleanup();
if (bad) { console.log(`\n  ${bad} check(s) failed`); process.exit(1); }
console.log('\n  all passed');
process.exit(0);
