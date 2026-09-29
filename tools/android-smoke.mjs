// The Android build on an emulator, driven the way a thumb drives it: the APK installed on a
// headless emulator, the page's state read through the WebView's debugger, the on-screen keys
// pressed with Android's own touch input (adb shell input), screenshots taken.
//
//   node tools/android-smoke.mjs [--apk=PATH] [--avd=NAME] [--shots=DIR] [--gpu=host]
//                                [--keep]             leave the emulator running, for a look
//                                [--serial=emulator-N] use one already running; neither boot nor kill it
//
// What it proves, in order: the app starts and the page boots to the title with its touch keys up,
// and the title is ON THE SCREEN -- a screenshot whose game area is black fails, however well the
// page runs underneath (the first run here had the game running and nothing shown); a tap on
// SPACE starts a run (through the first-run guide, which a fresh install shows first); > held
// runs him right; the phone's Back pauses the run; the app sent to the background and brought
// back stays paused with the music held; Back twice more leaves the pause and pauses again; and
// the page logged no error. It exits 0 on all of it.
//
// The emulator is this game's own AVD (duke_vytis_test, made here from the newest installed
// system image if missing -- another project's AVD is never touched), run with no window and NO
// SOUND DEVICE (-no-audio), and shut down at the end. The adb server is shared with anything
// else on the machine and is left running.
//
// Needs the Android SDK with the emulator, a system image and platform-tools (build-apk.mjs
// finds the SDK the same way), and a JDK for avdmanager when the AVD must be made.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPNG } from './pngread.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x === `--${n}` || x.startsWith(`--${n}=`)); return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : true) : d; };
const APK = path.resolve(String(flag('apk', path.join(ROOT, 'dist', `Duke Vytis ${PKG.version}.apk`))));
const AVD = String(flag('avd', 'duke_vytis_test'));
const SHOTS = flag('shots', null);
const GPU = String(flag('gpu', 'swiftshader_indirect'));
const KEEP = !!flag('keep', false);
const REUSE = flag('serial', null);
const APP = 'lt.dukevytis.tower';
const exe = process.platform === 'win32' ? '.exe' : '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++; return !!c; };

function sdkDir() {
  const tries = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'), path.join(os.homedir(), 'Android', 'Sdk')];
  const d = tries.find((x) => x && fs.existsSync(path.join(x, 'emulator')) && fs.existsSync(path.join(x, 'platform-tools')));
  if (!d) throw new Error('no Android SDK with an emulator and platform-tools');
  return d;
}
const SDK = sdkDir();
const ADB = path.join(SDK, 'platform-tools', 'adb' + exe);
const EMU = path.join(SDK, 'emulator', 'emulator' + exe);

/** A free even console port for the emulator (its adb port is the next one). */
async function freePort() {
  const busy = (p) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(true)); s.listen(p, '127.0.0.1', () => s.close(() => r(false))); });
  for (let p = 5620; p < 5680; p += 2) if (!(await busy(p)) && !(await busy(p + 1))) return p;
  throw new Error('no free emulator port in 5620-5680');
}

function ensureAvd() {
  const list = execFileSync(EMU, ['-list-avds'], { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim());
  if (list.includes(AVD)) return false;
  const images = path.join(SDK, 'system-images');
  const api = fs.readdirSync(images).sort().pop();
  const tag = fs.readdirSync(path.join(images, api)).sort().pop();
  const abi = fs.readdirSync(path.join(images, api, tag)).find((a) => a === 'x86_64') || fs.readdirSync(path.join(images, api, tag))[0];
  const avdmanager = path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'avdmanager' + (process.platform === 'win32' ? '.bat' : ''));
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const jdkBase = path.join(pf, 'Eclipse Adoptium');
  const jdk = process.env.JAVA_HOME || (fs.existsSync(jdkBase) ? path.join(jdkBase, fs.readdirSync(jdkBase).sort().pop()) : '');
  execSync(`echo no| "${avdmanager}" create avd -n ${AVD} -k "system-images;${api};${tag};${abi}" -d pixel_6`,
    { env: { ...process.env, JAVA_HOME: jdk }, stdio: 'pipe' });
  return true;
}

// --- the WebView's debugger, over adb ----------------------------------------------------------

let serial = null;
const adb = (...args) => execFileSync(ADB, ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const adbBuf = (...args) => execFileSync(ADB, ['-s', serial, ...args], { maxBuffer: 1 << 27 });

/**
 * The page's debugger: the WebView's socket of the app's CURRENT process, forwarded to a local
 * port. Every wait has a limit. A forward made before the page's debugger listens accepts the
 * connection and never answers, and a fetch without a timeout waited on it for good -- the
 * second run of this tool hung there, silent, after the boot.
 */
async function devtools() {
  let sock = null;
  for (let i = 0; i < 60 && !sock; i++) {
    let pid = '';
    try { pid = adb('shell', 'pidof', APP).trim().split(/\s+/)[0]; } catch (e) { /* not up yet */ }
    if (pid && adb('shell', 'cat', '/proc/net/unix').includes(`@webview_devtools_remote_${pid}`)) sock = `webview_devtools_remote_${pid}`;
    else await sleep(500);
  }
  if (!sock) throw new Error('the WebView offered no debugger (is the APK a debug build?)');
  const port = 9300 + Math.floor(Math.random() * 600);
  adb('forward', `tcp:${port}`, `localabstract:${sock}`);
  let pages = [];
  for (let i = 0; i < 40 && !pages.length; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2000) });
      pages = (await res.json()).filter((p) => p.type === 'page' && p.webSocketDebuggerUrl);
    } catch (e) { /* not yet */ }
    if (!pages.length) await sleep(500);
  }
  if (!pages.length) throw new Error('the WebView debugger listed no page to attach to');
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, j) => {
    const t = setTimeout(() => j(new Error('the page\'s debugger did not open')), 10000);
    ws.onopen = () => { clearTimeout(t); r(); };
    ws.onerror = () => { clearTimeout(t); j(new Error('the page\'s debugger refused the connection')); };
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const evaluate = (expr) => new Promise((r) => {
    const n = ++id;
    const t = setTimeout(() => { waiting.delete(n); r(undefined); }, 15000);
    waiting.set(n, (m) => { clearTimeout(t); r(m.result && m.result.result ? m.result.result.value : undefined); });
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
  });
  return { evaluate, close: () => { try { ws.close(); } catch (e) { /* gone */ } try { adb('forward', '--remove', `tcp:${port}`); } catch (e) { /* gone */ } } };
}

/**
 * The share of the screen's middle that is not near black [0..1]: the game's title, a run, a
 * pause screen all light most of it. The middle only -- the touch keys sit at the edges.
 */
function lit(png) {
  const f = path.join(os.tmpdir(), `dv-android-${process.pid}.png`);
  fs.writeFileSync(f, png);
  const im = readPNG(f);
  fs.rmSync(f, { force: true });
  let n = 0, on = 0;
  for (let y = Math.floor(im.h * 0.2); y < im.h * 0.8; y += 4) {
    for (let x = Math.floor(im.w * 0.3); x < im.w * 0.7; x += 4) {
      const i = (y * im.w + x) * im.ch;
      n++;
      if (im.data[i] + im.data[i + 1] + im.data[i + 2] > 60) on++;
    }
  }
  return on / n;
}

async function main() {
  if (!fs.existsSync(APK)) throw new Error(`no APK at ${APK}: node tools/build-apk.mjs`);
  let emu = null;
  if (REUSE) {
    serial = String(REUSE);
    console.log(`  using ${serial}, already running`);
  } else {
    const made = ensureAvd();
    const port = await freePort();
    serial = `emulator-${port}`;
    console.log(`  ${made ? 'made the AVD ' + AVD + ', and ' : ''}booting it headless on ${serial} (gpu ${GPU}, no audio)`);
    emu = spawn(EMU, ['-avd', AVD, '-port', String(port), '-no-window', '-no-audio', '-no-boot-anim',
      '-no-snapshot-save', '-gpu', GPU], { stdio: 'ignore', detached: KEEP });
    if (KEEP) emu.unref();
  }
  let dt = null;
  try {
    const t0 = Date.now();
    execFileSync(ADB, ['-s', serial, 'wait-for-device'], { timeout: 240000 });
    while (Date.now() - t0 < 300000) {
      try { if (adb('shell', 'getprop', 'sys.boot_completed').trim() === '1') break; } catch (e) { /* not yet */ }
      await sleep(2000);
    }
    ok(adb('shell', 'getprop', 'sys.boot_completed').trim() === '1', `the emulator booted (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    console.log('  installing and starting the app');
    // This emulator's own setting, so the system's one-time "Viewing full screen" card does not
    // stand over the screenshots (a player dismisses it once, on a phone).
    adb('shell', 'settings', 'put', 'secure', 'immersive_mode_confirmations', 'confirmed');
    adb('shell', 'am', 'force-stop', APP);
    adb('install', '-r', APK);
    adb('logcat', '-c');
    adb('shell', 'am', 'start', '-n', `${APP}/.MainActivity`);
    dt = await devtools();
    const V = (expr) => dt.evaluate(`(() => { try { return ${expr}; } catch (e) { return 'ERR ' + e.message; } })()`);
    let state = null;
    for (let i = 0; i < 60 && state !== 'menu'; i++) { state = await V('window.VYTIS && VYTIS.game.state'); if (state !== 'menu') await sleep(500); }
    ok(state === 'menu', `the page booted to the title (${state})`);
    const shot = (name) => { if (SHOTS) { fs.mkdirSync(String(SHOTS), { recursive: true }); fs.writeFileSync(path.join(String(SHOTS), name + '.png'), adbBuf('exec-out', 'screencap', '-p')); } };
    await sleep(2500);
    const page = await V('({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight, touch: !!VYTIS.touch, buttons: VYTIS.touch ? VYTIS.touch.buttons().map((b) => [b.id, b.x, b.y, b.w, b.h]) : [] })');
    ok(page && page.touch && page.buttons.length >= 6, `the touch keys are up: ${page && page.buttons.map((b) => b[0]).join(' ')}`);
    // On the screen, not only in the page: the emulator draws in software, and the title's first
    // frames -- the painting ahead of a cold start -- take seconds there, so it is waited for.
    const tShow = Date.now();
    let shown = 0;
    while (Date.now() - tShow < 60000 && (shown = lit(adbBuf('exec-out', 'screencap', '-p'))) <= 0.15) await sleep(1000);
    shot('1-title');
    ok(shown > 0.15, `the title is on the screen after ${((Date.now() - tShow) / 1000).toFixed(0)} s: ${(shown * 100).toFixed(0)}% of the middle lit (a black game area is under 5%)`);
    // Where a key is on the SCREEN: the page's CSS pixels times its ratio, past the cut-out.
    const pad = /cut-out padding (\d+),(\d+),(\d+),(\d+)/.exec(adb('logcat', '-d', '-s', 'DukeVytis:I'));
    const [pl, pt] = pad ? [Number(pad[1]), Number(pad[2])] : [0, 0];
    const at = async (id) => {
      const bs = await V('VYTIS.touch.buttons().map((b) => [b.id, b.x, b.y, b.w, b.h])');
      const b = bs.find((x) => x[0] === id);
      return b ? [Math.round(pl + (b[1] + b[3] / 2) * page.dpr), Math.round(pt + (b[2] + b[4] / 2) * page.dpr)] : null;
    };
    // SPACE: a run.
    const sp = await at('jump');
    adb('shell', 'input', 'tap', String(sp[0]), String(sp[1]));
    let run = null, guide = false;
    for (let i = 0; i < 20 && run !== 'playing'; i++) {
      await sleep(250);
      run = await V('VYTIS.game.state');
      // A fresh install shows the guide on its first climb; SPACE there starts the climb.
      if (run === 'tutorial' && !guide) { guide = true; await sleep(500); adb('shell', 'input', 'tap', String(sp[0]), String(sp[1])); }
    }
    ok(run === 'playing', `a tap on SPACE (${sp.join(',')}) started a run${guide ? ', through the first-run guide' : ''} (${run})`);
    // A run's first frames stall a software-drawn page for seconds; a hold made then arrives as a
    // press and a release together, and he never moves. Wait until it draws at a playable rate.
    const rate = () => V('new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })');
    let fps = 0;
    const tRate = Date.now();
    while (Date.now() - tRate < 30000 && (fps = await rate()) < 15) await sleep(500);
    console.log(`  (the run draws ${fps} frames a second here, ${((Date.now() - tRate) / 1000).toFixed(0)} s after it started)`);
    // > held a second and a half: he runs right.
    const x0 = await V('VYTIS.game.player.x');
    const rt = await at('right');
    adb('shell', 'input', 'swipe', String(rt[0]), String(rt[1]), String(rt[0]), String(rt[1]), '1500');
    const x1 = await V('VYTIS.game.player.x');
    ok(typeof x0 === 'number' && x1 > x0 + 20, `> held 1.5 s ran him right: x ${Number(x0).toFixed(0)} -> ${Number(x1).toFixed(0)}`);
    shot('2-run');
    const runShown = lit(adbBuf('exec-out', 'screencap', '-p'));
    ok(runShown > 0.15, `the run is on the screen: ${(runShown * 100).toFixed(0)}% of the middle lit`);
    // Back: the pause.
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(600);
    ok(await V('VYTIS.game.state') === 'paused', `the phone's Back paused the run (${await V('VYTIS.game.state')})`);
    shot('3-paused');
    // Home and back again: still paused, the music held.
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await sleep(1500);
    adb('shell', 'am', 'start', '-n', `${APP}/.MainActivity`);
    await sleep(2000);
    const after = await V('({ state: VYTIS.game.state, held: VYTIS.audio.paused })');
    ok(after && after.state === 'paused' && after.held === true, `away and back: the run ${after && after.state}, the music held ${after && after.held}`);
    // Back resumes (ESC on the pause), Back pauses again.
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(600);
    const resumed = await V('VYTIS.game.state');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await sleep(600);
    ok(resumed === 'playing' && await V('VYTIS.game.state') === 'paused', `Back left the pause (${resumed}) and paused again`);
    // What the page said.
    const log = adb('logcat', '-d', '-s', 'DukeVytis:*');
    const errors = log.split(/\r?\n/).filter((l) => / E DukeVytis/.test(l));
    ok(!errors.length, `the page logged ${errors.length} error(s)${errors.length ? ':\n      ' + errors.slice(0, 5).join('\n      ') : ''}`);
    console.log('  (all of it on the emulator\'s software-drawn screen: a phone\'s GPU is another matter)');
  } finally {
    if (dt) dt.close();
    if (KEEP || REUSE) console.log(`  the emulator is left running: ${serial} (adb -s ${serial} emu kill)`);
    else {
      try { execFileSync(ADB, ['-s', serial, 'emu', 'kill'], { timeout: 20000 }); } catch (e) { /* already down */ }
      await sleep(3000);
      try { if (emu) emu.kill(); } catch (e) { /* gone */ }
    }
  }
}

try {
  await main();
} catch (e) {
  console.log('  FAIL ' + (e && e.message));
  bad++;
}
console.log(bad ? `\n  ANDROID SMOKE FAIL - ${bad} problem(s)` : '\n  ANDROID SMOKE PASS - the APK boots, plays by touch, pauses and holds its sound on a phone');
process.exit(bad ? 1 : 0);
