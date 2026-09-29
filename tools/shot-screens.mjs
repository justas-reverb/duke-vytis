// Screenshot every screen the menu reaches, without a browser.
//
//   node tools/shot-screens.mjs --dir=out/ [--tag=after] [--zones=0,2,4,6,8,10] [--only=menu,options]
//
// Writes, into --dir, one 1920 x 1080 PNG per screen at 1x, named <tag>-<screen>.png:
//
//   menu-z<N>-<ZONE>   the title screen over the attract run, a few seconds into zone N
//   menu-static        the title screen over its own starfield (what HELP draws under)
//   options-<sel>      OPTIONS with row <sel> selected
//   stats-<page>       each page of STATISTICS, and stats-reset for the confirm
//   help               HOW TO CLIMB over the static title
//   tutorial-<page>    each page of the guide, over the attract run
//   quit, quit-blocked the farewell and the refusal, over the title screen
//   paused             the pause screen over a run
//
// It only calls the screens' own exported functions (drawMenu, drawOptions, drawStats, ...)
// with the arguments main.js passes, so it runs unchanged in an older tree: copy it into
// that tree's tools/ to make the BEFORE pictures. Math.random is seeded before anything
// runs, so the attract run behind the menu is the same run in both trees and a before/after
// pair differs only where the menu does.
//
// --record also prints, per screen, every run of the 5x7 font's glyphs drawn from font.js's
// atlases (string and box in view units): in the old tree that is every word on the screen,
// in the new one it should be none.

import fs from 'node:fs';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};
const DIR = String(flag('dir', '.'));
const TAG = String(flag('tag', 'shot'));
const ZONES = String(flag('zones', '0,2,4,6,8,10')).split(',').map(Number);
const ONLY = flag('only', '') ? String(flag('only', '')).split(',') : null;
const RECORD = !!flag('record', false);
const want = (k) => !ONLY || ONLY.some((o) => k.startsWith(o));

// Seeded before any game module runs: the demo's tower, the bot, shake and particles all
// draw from Math.random.
let seed = 0x9e3779b9;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const { SW, SH, PX, VW, VH } = await import('../src/game/constants.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const S = await import('../src/ui/screens.js');
const Stats = await import('../src/game/stats.js');
const { ACHIEVEMENTS } = await import('../src/game/achievements.js');
const { THEMES } = await import('../src/game/themes.js');
const { drawHud } = await import('../src/ui/hud.js');

const canvas = new HeadlessCanvas(SW, SH);
const renderer = new Renderer(canvas);
const ctx = canvas.getContext('2d');   // AFTER the renderer sized the canvas

// A save file with something on every page: numbers in every row, a top ten, recent runs,
// half the awards (stamped long ago, so none is "fresh" and flashing).
function record() {
  const all = Stats.BLANK_ALL();
  Object.assign(all, {
    totalRuns: 37, bestFloor: 1234, bestScore: 45678, bestCombo: 212, bestComboScore: 18230,
    bestComboFlair: 9, totalFloors: 21345, totalScore: 987654, totalJumps: 18234,
    totalDoubleJumps: 1422, totalTripleJumps: 311, totalWallBounces: 2210, totalCombos: 988,
    totalComboFloors: 12000, totalDistance: 812345, totalAirTime: 1532, totalPlaySeconds: 5321,
    totalInstaJumps: 4410, bestInstaChain: 23, topSpeed: 431, topClimb: 402, themesSeen: 7,
    longestRunSeconds: 311, longestAir: 2.41, deaths: 37, checkpoints: 44,
  });
  all.comboHist = [320, 210, 140, 90, 44, 18, 6, 2, 0, 0];
  all.best = [
    { floor: 1234, score: 45678, combo: 212, seconds: 311 },
    { floor: 1101, score: 40211, combo: 150, seconds: 280 },
    { floor: 912, score: 31002, combo: 98, seconds: 240 },
    { floor: 640, score: 20110, combo: 77, seconds: 190 },
    { floor: 402, score: 9921, combo: 40, seconds: 130 },
    { floor: 211, score: 4410, combo: 22, seconds: 82 },
  ];
  all.recent = [
    { floor: 640, score: 20110, bounces: 44, air: 31 },
    { floor: 211, score: 4410, bounces: 12, air: 9 },
    { floor: 1234, score: 45678, bounces: 91, air: 77 },
    { floor: 88, score: 1022, bounces: 3, air: 1 },
    { floor: 402, score: 9921, bounces: 20, air: 14 },
  ];
  ACHIEVEMENTS.forEach((a, i) => { if (i % 2 === 0) all.achievements[a.id] = 1000; });
  return all;
}
const ALL = record();

function write(name) {
  const file = path.join(DIR, `${TAG}-${name}.png`);
  fs.writeFileSync(file, encodePNG(canvas));
  console.log('wrote ' + file);
}

// --- recording the font's glyph blits --------------------------------------------------
const ORDER = '0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ.,:;!?\'"-+=/\\()[]<>*#%&@_^$~|';
let calls = null;
if (RECORD) {
  const proto = Object.getPrototypeOf(ctx);
  const was = proto.drawImage;
  proto.drawImage = function (img, ...a) {
    if (calls && a.length === 8 && img && img.height === 7 && img.width === ORDER.length * 6) {
      const [sx, , , , dx, dy, dw, dh] = a;
      calls.push({ ch: ORDER[sx / 6], x: dx, y: dy, w: dw, h: dh });
    }
    return was.call(this, img, ...a);
  };
}
function runs() {
  // Glyphs drawn one after another on one row at one size are one run; the outline's eight
  // offset copies of a word are runs too, merged into the word's box below.
  const out = [];
  let cur = null;
  for (const g of calls) {
    const adv = g.w / 5 * 6 + (g.h > 7 ? g.h / 7 : 0);
    if (cur && g.y === cur.y && g.h === cur.h && g.x > cur.x1 - 1e-6
      && Math.abs((g.x - cur.last) / adv - Math.round((g.x - cur.last) / adv)) < 1e-6 && g.x - cur.last < adv * 3.5) {
      const gaps = Math.round((g.x - cur.last) / adv) - 1;
      cur.s += ' '.repeat(gaps) + g.ch;
      cur.last = g.x; cur.x1 = g.x + g.w;
    } else {
      cur = { s: g.ch, x0: g.x, y: g.y, h: g.h, x1: g.x + g.w, last: g.x };
      out.push(cur);
    }
  }
  const words = [];
  for (const r of out) {
    const box = [r.x0, r.y, r.x1, r.y + r.h];
    const hit = words.find((w) => w.s === r.s && box[0] <= w.b[2] + 3 && box[2] >= w.b[0] - 3 && box[1] <= w.b[3] + 3 && box[3] >= w.b[1] - 3);
    if (hit) hit.b = [Math.min(hit.b[0], box[0]), Math.min(hit.b[1], box[1]), Math.max(hit.b[2], box[2]), Math.max(hit.b[3], box[3])];
    else words.push({ s: r.s, b: box });
  }
  return words;
}
const recorded = {};
function begin() { if (RECORD) calls = []; }
function end(name) { if (RECORD) { recorded[name] = runs(); calls = null; } }

// --- the attract run behind the menu ------------------------------------------------------
const input = new AutoInput();
const demo = new Game(input);
const bot = new AutoPlayer(input);
startDemo(demo, DEMO_SEEDS[0]);   // as main.js starts it (autoplay.js)

/** Step the demo `sec` seconds as main.js's stepDemo does (restarting after a death). */
function stepDemo(sec) {
  for (let i = 0; i < Math.round(sec / STEP); i++) {
    if (demo.state === STATE.PLAYING || demo.state === STATE.FALLING) bot.step(demo, STEP);
    demo.step(STEP);
    if (demo.state === STATE.DEAD) { startDemo(demo, DEMO_SEEDS[0]); bot.reset(); }
  }
}
/** The demo frame as main.js draws it under the menu: the world, then the menu's wash. */
function demoFrame(wash) {
  for (let k = 0; k < 2; k++) renderer.draw(demo, 1, 1 / 60);
  renderer.draw(demo, 1, 1 / 60);
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, VW, VH);
}
function staticBack() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SW, SH);
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
}

const T = Number(flag('t', 1.1));
const loop = { fps: 160, cpuMs: 1.23 };
globalThis.window.VYTIS_SCALE = 2;
globalThis.window.screen = { width: 3840, height: 2160 };

// Tutorial and quit over the first zone, a few seconds in.
stepDemo(4);
if (want('tutorial')) {
  for (let p = 0; p < S.TUTORIAL_PAGES.length; p++) {
    demoFrame('#05030ac4');
    begin(); S.drawTutorial(ctx, p, demo, T); end('tutorial-' + p);
    write('tutorial-' + p);
  }
}
if (want('quit')) {
  for (const blocked of [false, true]) {
    demoFrame('#05030a9e');
    S.drawMenu(ctx, ALL, T, 1 / 60, true, false);
    begin(); S.drawQuit(ctx, blocked, T); end(blocked ? 'quit-blocked' : 'quit');
    write(blocked ? 'quit-blocked' : 'quit');
  }
}
if (want('menu-sound')) {
  demoFrame('#05030a9e');
  begin(); S.drawMenu(ctx, ALL, T, 1 / 60, true, true); end('menu-sound');
  write('menu-sound');
}
if (want('menu-first')) {
  demoFrame('#05030a9e');
  begin(); S.drawMenu(ctx, Stats.BLANK_ALL(), T, 1 / 60, true, false); end('menu-first');
  write('menu-first');
}

if (want('menu-z')) {
  // Each zone the list asks for, a few seconds after the demo climbs into it.
  const seen = new Set();
  let guard = 0;
  while (seen.size < ZONES.length && guard++ < 4000) {
    stepDemo(0.25);
    const z = demo.themeIndex;
    if (ZONES.includes(z) && !seen.has(z)) {
      seen.add(z);
      stepDemo(3.5);
      const name = `menu-z${z}-${THEMES[z].name}`;
      demoFrame('#05030a9e');
      begin(); S.drawMenu(ctx, ALL, T, 1 / 60, true, false); end(name);
      write(name);
    }
  }
}

if (want('menu-static')) {
  staticBack();
  begin(); S.drawMenu(ctx, ALL, T, 1 / 60, false, false); end('menu-static');
  write('menu-static');
}
if (want('help')) {
  staticBack();
  S.drawMenu(ctx, ALL, T, 1 / 60, false, false);
  begin(); S.drawHelp(ctx, T); end('help');
  write('help');
}
if (want('options')) {
  const settings = { scaleMode: 'auto', particles: 'high', streaks: true, trails: true, scanlines: false,
    shake: true, music: true, showFps: false, companions: 'hop', fpsCap: 0, jumpSpeed: 1.2, platforms: 0.875, difficulty: 1, gravity: 0.9, lowLatency: false };
  // 9 is JUMP SPEED and 11 LOW LATENCY since they joined; in an older tree those are other rows.
  for (const sel of [0, 3, 9, 10, 11, 12]) {
    staticBack();
    begin(); S.drawOptions(ctx, settings, sel, T, loop); end('options-' + sel);
    write('options-' + sel);
  }
}
if (want('stats')) {
  for (let p = 0; p < S.PAGES.length; p++) {
    staticBack();
    begin(); S.drawStats(ctx, ALL, p, T, false); end('stats-' + p);
    write('stats-' + p);
  }
  staticBack();
  begin(); S.drawStats(ctx, ALL, 0, T, true); end('stats-reset');
  write('stats-reset');
}
if (want('paused')) {
  const pin = new AutoInput();
  const g = new Game(pin);
  const pb = new AutoPlayer(pin);
  g.newRun(12345);
  for (let i = 0; i < Math.round(6 / STEP); i++) { pb.step(g, STEP); g.step(STEP); }
  renderer.draw(g, 1, 1 / 60, () => drawHud(ctx, g, ALL, T));
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  begin(); S.drawPaused(ctx, g, T); end('paused');
  write('paused');
}

if (RECORD) fs.writeFileSync(path.join(DIR, `${TAG}-glyphruns.json`), JSON.stringify(recorded, null, 1));
