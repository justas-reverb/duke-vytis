// The title screen and every screen reached from it, in the Duke's skin (src/render/menuskin.js).
//
//   node tools/test-menu.mjs               the checks, about 20 s
//   node tools/test-menu.mjs --mutations   and then each check against a broken copy of the
//                                           source, which it must catch (about a minute more)
//   node tools/test-menu.mjs --baseline    run in an OLD tree (before the skin): writes the old
//                                           layout to tools/menu-layout.json
//
// WHAT IT HOLDS THE MENU TO -- the brief the skin was made to:
//
// 1. LAYOUT. Every word each screen drew before the skin is still drawn, the same text, where
//    it was: each word's box within LAYOUT_TOL view units of the box the old font drew it in
//    (tools/menu-layout.json, recorded from the screens at 62bb95e by --baseline, which decodes
//    the old font's glyph blits back into words). And no word is drawn in the old font any
//    more: a glyph blitted from font.js's atlases on these screens is a word the skin missed.
//    The same for every other ELEMENT the old screens drew -- the panels, the title's frame,
//    the selected row and tab, the key caps, the bars and columns, the guide's page dots, the
//    awards' marks, the stats rule -- each read back from the old fills by colour and matched
//    to what the skin reports drawing, within ELEM_TOL; what the skin adds is listed. And the
//    plaques made round centred contents (the key hints', the prompt's, the notices') hold
//    them in their middle, and the active stats tab stands open on its rule (CENTRED).
// 2. THE PROMPT READS over every zone the attract run climbs through: its gold letters against
//    the plaque they stand on, the key's legend against the key, and the plaque against the
//    backdrop round it, in a real demo frame of each zone -- and the plaque identical in every
//    zone, which is what makes the first two hold everywhere. And it is THERE at every moment:
//    the old prompt blinked off for a fifth of each cycle; this one is sampled every 50 ms.
// 3. NOTHING COVERS THE WORDS. main.js draws the attract run before the menu (a check on the
//    real source, since the tools re-stage its order); every letter drawn stands on an opaque
//    bed at least two pixels deep, and every plate is opaque; and the menu drawn over a real
//    demo frame and over flat magenta is identical in every pixel of every word, its bed, and
//    every plate -- whatever the demo draws behind, nothing of it shows there. On the screens
//    over the demo every letter lies on a PLATE, not just its own keyline: a keyline covers a
//    letter and nothing between two lines, and the demo's companion calls come up from the
//    bottom of the screen in lines of their own. And nothing the menu draws lands ON a word
//    after it: each word's pixels as they stood when it was drawn are what the finished frame
//    shows, or a later word's (only lettering may lie over lettering) -- the with/without
//    check cannot see a plate of the menu's own drawn over a word, since it is the same plate
//    over the demo and over magenta.
// 4. PAINTED ONCE. After the title screen's warm-up, drawing every screen paints nothing; a
//    frame of the title screen is a few dozen blits (reported, with its headless time).
// 5. THE DEMO BEHIND IT DOES NOT BLINK. The attract run crosses a zone every ten seconds or
//    so, and each arrival used to flash the whole screen white under the menu -- with no zone
//    title to say why, since the demo draws no HUD -- after its backdrop had already jumped
//    to 0.6 of the next zone half a second before ("my whole menu starts blinking",
//    2026-09-28). (a) The title screen as main.js draws it, 60 frames a second from before
//    the demo's first arrival until its dissolve is over: no frame's mean luma differs from
//    the one before by CALM_MAX or more (every arrival measured +20 to +24; now about 2, the
//    menu's own breathing and the bot's motion). (b) Over two arrivals, what the backdrop and
//    the walls show (Renderer.zoneFade) moves at most DISSOLVE_STEP a frame -- the share of
//    each zone on screen, summed -- and lands on the zone the demo is in, with nothing left
//    to blend, within DEMO_DISSOLVE. (c) A flash and a shake are not drawn on the demo, pixel
//    for pixel, and both are on the same frame of a run in play (the check sees them).
//
// --mutations copies src/ to the system temp folder once per mutation, breaks one thing, loads
// that copy in this process (its own module instances) and runs the check that should catch
// it; a mutation that goes uncaught is a failure of the test.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const BASELINE = argv.includes('--baseline');
const MUTATIONS = argv.includes('--mutations');
const LAYOUT_FILE = path.join(HERE, 'menu-layout.json');

/** How far a word may sit from where the old font drew it [view units; 2 -- the old outline
 *  and the new keyline differ by up to 1.25, a real move is a whole unit or more]. */
const LAYOUT_TOL = 2;
/** Words allowed to move further, and why. */
const MOVED = {
  'menu-sound': {
    'CLICK OR PRESS A KEY TO ENABLE SOUND': 'moved over the prompt plaque: the plaques take the rows under the prompt',
  },
};
/** How far an element's box may move [view units; 2 -- the gems are a stone centred in the
 *  old square, half a unit off its corner]. */
const ELEM_TOL = 2;
/** Elements allowed to move further, by screen and old box, and why. */
const MOVED_EL = {
  'stats-1': { '20,176,460,236': 'COMBOS BY TIER is three units deeper: its counts ended on the bevelled frame' },
};
/**
 * Rows that moved as a whole since the baseline, each by an exact amount rather than a free
 * pass: [screens, [top, bottom] of the old boxes' tops the row covers, dx, dy, why]. Every
 * word and element of the row must be within LAYOUT_TOL / ELEM_TOL of its old box moved so.
 */
const TITLE_SCREENS = ['menu', 'menu-first', 'menu-sound', 'menu-static'];
/**
 * GRAPHICS gained two rows, JUMP SPEED after COMPANIONS and LOW LATENCY after FRAME CAP, and
 * the rows went from 15 apart to 12 (screens.js OPTION_ROW) so that thirteen of them, the note
 * and the two measured lines still end above the key hints. Old row i was at 50 + 15i; it is at
 * 50 + 12j now, j its new place: rows 0-8 keep theirs, FRAME CAP is 10th, HOW TO PLAY 12th.
 * The panel ends four units under its last row as before, so 6 units higher, and the note and
 * the measured lines keep their distances from its end.
 */
const OPTION_SCREENS = ['options-0', 'options-3', 'options-10'];
// Then (2026-09-28) JUMP SPEED moved to the top and LOW LATENCY under it -- the two rows that
// change how the game plays, which the user could not find ninth and twelfth of thirteen --
// and PLATFORMS and DIFFICULTY joined between them the same day, so every old row is four further
// down and HOW TO PLAY is still last, the fifteenth -- and the rows went to 11 apart (screens.js
// OPTION_ROW), or the measured lines ran into the key hints. And GRAVITY after DIFFICULTY
// (2026-09-29), so every old row is five further down, HOW TO PLAY the sixteenth, and the rows 10
// apart: at 11 the second measured line lay across the key hints. Sixteen rows 10 apart end where
// eleven 15 apart did, so the panel, the note and HOW TO PLAY are back where the baseline had them.
const OPTION_NEW_ROW = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const ROW = 10;
const OPTION_SHIFTS = OPTION_NEW_ROW.map((j, i) => [OPTION_SCREENS, [48 + 15 * i, 50 + 15 * i], 0, ROW * j - 15 * i,
  `options row ${i}, now row ${j} at ${ROW} apart (JUMP SPEED, PLATFORMS, DIFFICULTY, GRAVITY and LOW LATENCY joined the list)`]).filter((s) => s[3] !== 0);
const SHIFTED = [
  [TITLE_SCREENS, [236, 244], -28.5, 0,
    'the row of keys that open a screen, re-centred round R REPLAYS (ui/replays.js), which joined it, and O OPTIONS, a letter shorter than O GRAPHICS'],
  ...OPTION_SHIFTS,
  [OPTION_SCREENS, [233, 245], 0, -3, 'the measured lines, 3 closer to the note than they were, so the last clears the key hints'],
];
/**
 * Words renamed since the baseline: [which screens, old text, new text, alignment]. The new word
 * is held to the old one's place by its rows and by its CENTRE -- a centred line of another
 * length is re-centred -- or by its LEFT edge where the words start at a fixed place.
 * GRAPHICS became OPTIONS (2026-09-28): the user looked for JUMP SPEED and LOW LATENCY and could
 * not find them on a screen, and behind a key, called GRAPHICS.
 */
const RENAMED = [
  // A key hint's words start just after their key, so there the new word keeps the LEFT edge.
  [(n) => TITLE_SCREENS.includes(n), 'GRAPHICS', 'OPTIONS', 'left'],
  [(n) => OPTION_SCREENS.includes(n), 'GRAPHICS', 'OPTIONS', 'centre'],
  [(n) => n.startsWith('tutorial-'), 'YOU CAN REPLAY THIS FROM GRAPHICS (O)', 'YOU CAN REPLAY THIS FROM OPTIONS (O)', 'centre'],
];
/** Words the screens gained since the baseline, and where each must be: [screens, word, box]. */
const ADDED = [
  [TITLE_SCREENS, 'R', [297.5, 240, 302.5, 247]],
  [TITLE_SCREENS, 'REPLAYS', [307.5, 240, 348.5, 247]],
  [OPTION_SCREENS, 'JUMP SPEED', [62, 50, 121, 57]],
  [OPTION_SCREENS, '100%', [407, 50, 430, 57]],
  [OPTION_SCREENS, 'PLATFORMS', [62, 60, 115, 67]],
  [OPTION_SCREENS, 'NORMAL', [395, 60, 430, 67]],
  [OPTION_SCREENS, 'DIFFICULTY', [62, 70, 121, 77]],
  [OPTION_SCREENS, 'MEDIUM', [395, 70, 430, 77]],
  [OPTION_SCREENS, 'GRAVITY', [62, 80, 103, 87]],
  [OPTION_SCREENS, 'NORMAL', [395, 80, 430, 87]],
  [OPTION_SCREENS, 'LOW LATENCY', [62, 90, 127, 97]],
  [OPTION_SCREENS, 'OFF', [413, 90, 430, 97]],
];
/**
 * Elements that changed SIZE since the baseline, by screen and old box: the new box, held to
 * ELEM_TOL like any other, and why. (MOVED_EL lets an element go unchecked; this does not.)
 * The OPTIONS panel was one (4 units longer, fifteen rows 11 apart) until GRAVITY made sixteen
 * rows 10 apart, which end where the baseline's eleven did: it is its old size again.
 */
const RESIZED = {};
const shiftOf = (scr, b) => SHIFTED.find(([names, [y0, y1]]) => names.includes(scr) && b[1] >= y0 && b[1] <= y1) || null;
const moveBox = (b, s) => (s ? [b[0] + s[2], b[1] + s[3], b[2] + s[2], b[3] + s[3]] : b);
const T0 = 2.0;             // the clock the screens are staged at: the old prompt showing

// Seeded: the attract run behind the menu draws from Math.random.
let seed = 0x9e3779b9;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

// --- a tree ---------------------------------------------------------------------------------

async function load(root) {
  const u = (p) => pathToFileURL(path.join(root, p)).href;
  const T = { root };
  T.C = await import(u('src/game/constants.js'));
  T.S = await import(u('src/ui/screens.js'));
  T.Stats = await import(u('src/game/stats.js'));
  T.A = await import(u('src/game/achievements.js'));
  T.F = await import(u('src/render/font.js'));
  T.M = BASELINE ? null : await import(u('src/render/menuskin.js'));
  T.Set = await import(u('src/game/settings.js'));
  return T;
}

// --- the staging: the same screens, the same data, in any tree -------------------------------

function saveFile(T) {
  const all = T.Stats.BLANK_ALL();
  Object.assign(all, {
    totalRuns: 37, bestFloor: 1234, bestScore: 45678, bestCombo: 212, bestComboScore: 18230,
    bestComboFlair: 9, totalFloors: 21345, totalScore: 987654, totalJumps: 18234,
    totalDoubleJumps: 1422, totalTripleJumps: 311, totalWallBounces: 2210, totalCombos: 988,
    totalComboFloors: 12000, totalDistance: 812345, totalAirTime: 1532, totalPlaySeconds: 5321,
    totalInstaJumps: 4410, bestInstaChain: 23, topSpeed: 431, topClimb: 402, themesSeen: 7,
    longestRunSeconds: 311, longestAir: 2.41, deaths: 37, checkpoints: 44,
  });
  all.comboHist = [320, 210, 140, 90, 44, 18, 6, 2, 0, 0];
  all.best = [[1234, 45678, 212, 311], [1101, 40211, 150, 280], [912, 31002, 98, 240], [640, 20110, 77, 190],
    [402, 9921, 40, 130], [211, 4410, 22, 82]].map(([floor, score, combo, seconds]) => ({ floor, score, combo, seconds }));
  all.recent = [[640, 20110, 44, 31], [211, 4410, 12, 9], [1234, 45678, 91, 77], [88, 1022, 3, 1], [402, 9921, 20, 14]]
    .map(([floor, score, bounces, air]) => ({ floor, score, bounces, air }));
  T.A.ACHIEVEMENTS.forEach((a, i) => { if (i % 2 === 0) all.achievements[a.id] = 1000; });
  return all;
}
const SETTINGS = { scaleMode: 'auto', particles: 'high', streaks: true, trails: true, scanlines: false,
  shake: true, music: true, showFps: false, companions: 'hop', fpsCap: 0, jumpSpeed: 1, platforms: 0.875, difficulty: 1, gravity: 0.9, lowLatency: false };
const LOOP = { fps: 160, cpuMs: 1.23 };
const PAUSED_RUN = { run: { maxFloor: 35, score: 350, bestCombo: 35, seconds: 6 } };
const DEMO = { player: { momentum: 0.62 }, combo: { active: true, floors: 12, meterFrac: () => 0.4, x: 1 } };
globalThis.window.VYTIS_SCALE = 2;
globalThis.window.screen = { width: 3840, height: 2160 };

const MENU_WASH = '#05030a9e', GUIDE_WASH = '#05030ac4';   // main.js's, over the demo
function screens(T) {
  const S = T.S, all = saveFile(T), blank = T.Stats.BLANK_ALL(), dt = 1 / 60;
  const list = [
    { name: 'menu', demo: MENU_WASH, draw: (ctx, t) => S.drawMenu(ctx, all, t, dt, true, false) },
    { name: 'menu-first', demo: MENU_WASH, draw: (ctx, t) => S.drawMenu(ctx, blank, t, dt, true, false) },
    { name: 'menu-sound', demo: MENU_WASH, draw: (ctx, t) => S.drawMenu(ctx, all, t, dt, true, true) },
    { name: 'menu-static', draw: (ctx, t) => S.drawMenu(ctx, all, t, dt, false, false) },
    // Named by the row the recording selected -- 0 SCALING, 3 AFTERIMAGES, 10 HOW TO PLAY -- and
    // selected by that row's key, wherever the rows added since have put it.
    ...[[0, 'scaleMode'], [3, 'trails'], [10, 'replayGuide']].map(([n, k]) => ({ name: 'options-' + n,
      draw: (ctx, t) => S.drawOptions(ctx, SETTINGS, T.Set.OPTIONS.findIndex((o) => o.key === k), t, LOOP) })),
    ...[0, 1, 2, 3].map((p) => ({ name: 'stats-' + p, draw: (ctx, t) => S.drawStats(ctx, all, p, t, false) })),
    { name: 'stats-reset', draw: (ctx, t) => S.drawStats(ctx, all, 0, t, true) },
    { name: 'help', pre: (ctx, t) => S.drawMenu(ctx, all, t, dt, false, false), draw: (ctx, t) => S.drawHelp(ctx, t) },
    ...S.TUTORIAL_PAGES.map((_, p) => ({ name: 'tutorial-' + p, demo: GUIDE_WASH, draw: (ctx, t) => S.drawTutorial(ctx, p, DEMO, t) })),
    { name: 'quit', demo: MENU_WASH, pre: (ctx, t) => S.drawMenu(ctx, all, t, dt, true, false), draw: (ctx, t) => S.drawQuit(ctx, false, t) },
    { name: 'quit-blocked', demo: MENU_WASH, pre: (ctx, t) => S.drawMenu(ctx, all, t, dt, true, false), draw: (ctx, t) => S.drawQuit(ctx, true, t) },
    { name: 'paused', draw: (ctx, t) => S.drawPaused(ctx, PAUSED_RUN, t) },
  ];
  return list;
}

// --- what gets drawn -------------------------------------------------------------------------

const ORDER = '0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ.,:;!?\'"-+=/\\()[]<>*#%&@_^$~|';
let glyphs = null;            // the old font's glyph blits while a screen draws
let fills = null;             // every fillRect while a screen draws: [style, x, y, w, h]
const calls = { drawImage: 0, fillRect: 0 };
{
  const proto = Object.getPrototypeOf(new HeadlessCanvas(1, 1).getContext('2d'));
  const di = proto.drawImage, fr = proto.fillRect;
  proto.drawImage = function (img, ...a) {
    calls.drawImage++;
    if (glyphs && a.length === 8 && img && img.height === 7 && img.width === ORDER.length * 6) {
      glyphs.push({ ch: ORDER[a[0] / 6], x: a[4], y: a[5], w: a[6], h: a[7] });
    }
    return di.call(this, img, ...a);
  };
  proto.fillRect = function (...a) {
    calls.fillRect++;
    if (fills) fills.push([String(this.fillStyle).toLowerCase(), ...a]);
    if (onFill) onFill(...a);
    return fr.apply(this, a);
  };
}
let onFill = null;            // told of every fill while a screen draws (a wash starts a layer)

/**
 * The OLD screens' elements, read back from their fills by colour (screens.js at 62bb95e):
 * panel() filled its box in PANEL, the title's frame its inside in a dark wash, the selected
 * row and the active tab a LINE-coloured block, keyLine() each key a KEY block, hbar() and
 * the combo columns their back in black at 0x66, the guide's page dots and the awards' marks
 * 4- and 5-unit squares in their colours, the stats rule a one-unit LINE across the page
 * (told from a panel's LINE edges by not lying on one).
 */
function oldElements(list) {
  const out = [];
  const panels = [];
  for (const [s, x, y, w, h] of list) {
    if (!(w > 0 && h > 0)) continue;
    const b = [x, y, x + w, y + h];
    if (s === '#1a1428') { out.push({ k: 'plate', b }); panels.push(b); }
    else if (s === '#0b0718e0' || s === '#241c38') out.push({ k: 'plate', b });
    else if (s === '#2e2444' && w > 1 && h > 1) out.push({ k: 'plate', b });
    else if (s === '#2a2138') out.push({ k: 'keycap', b });
    else if (s === '#00000066') out.push({ k: 'gauge', b });
    else if (((w === 4 && h === 4) || (w === 5 && h === 5)) && ['#ffe23d', '#3a3f58', '#7dff5a', '#2a2a3a'].includes(s)) {
      out.push({ k: 'gem', b });
    }
  }
  for (const [s, x, y, w, h] of list) {
    if (s !== '#2e2444' || h !== 1 || w < 100) continue;
    if (panels.some((p) => p[0] === x && (p[1] === y || p[3] - 1 === y))) continue;
    out.push({ k: 'rule', b: [x, y, x + w, y + h] });
  }
  return out;
}
/** The skin's elements, as its probe reports them. */
const newElements = (probe) => probe.filter((e) => ['plate', 'keycap', 'gauge', 'gem', 'rule'].includes(e.kind))
  .map((e) => ({ k: e.kind, b: e.b, s: e.s }));

/**
 * What a word put down, pixel by pixel, at the moment it was drawn: `expect` maps a store
 * pixel to its packed colour. A small-text word's pixels are its glyphs' font pixels; a
 * lettered line's, the opaque pixels brighter than its outline inside its box. A later word
 * over the same pixel replaces the entry, so only lettering may lie over lettering.
 */
function captureWord(T, c, e, expect) {
  const { PX, SW, SH } = T.C;
  const d = c.data;
  const keep = (i) => expect.set(i, (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]);
  if (e.kind === 'text') {
    const left = e.b[0] + 0.5, top = e.b[1] + 0.5;
    [...e.s].forEach((ch, k) => {
      const rows = T.F.GLYPHS[ch];
      if (!rows || ch === ' ') return;
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) {
        if (rows[r][q] !== '#') continue;
        const x0 = Math.round((left + k * 6 + q) * PX), y0 = Math.round((top + r) * PX);
        for (let y = y0; y < y0 + PX; y++) for (let x = x0; x < x0 + PX; x++) if (x >= 0 && y >= 0 && x < SW && y < SH) keep(y * SW + x);
      }
    });
  } else if (e.kind === 'line') {
    const x0 = Math.max(0, Math.floor(e.b[0] * PX)), y0 = Math.max(0, Math.floor(e.b[1] * PX));
    const x1 = Math.min(SW, Math.ceil(e.b[2] * PX)), y1 = Math.min(SH, Math.ceil(e.b[3] * PX));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * SW + x;
      if (d[i * 4 + 3] === 255 && 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] >= 40) keep(i);
    }
  }
}

/** A screen drawn into a fresh store-sized canvas over `back` (pixels, or null for nothing). */
function stage(T, scr, t, back = null) {
  const { SW, SH, PX, VW, VH } = T.C;
  const c = new HeadlessCanvas(SW, SH);
  if (back) c.data.set(back);
  const ctx = c.getContext('2d');
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  if (back && scr.demo) { ctx.fillStyle = scr.demo; ctx.fillRect(0, 0, VW, VH); }
  if (scr.pre) scr.pre(ctx, t);
  const probe = T.M ? T.M.menuProbe(true) : null;
  const expect = new Map();
  // The probe is a plain array the skin pushes each thing it drew onto, just after drawing it:
  // that moment is when a word's own pixels are read.
  if (probe) probe.push = (e) => { captureWord(T, c, e, expect); return Array.prototype.push.call(probe, e); };
  // A wash over the whole view starts a new layer (the reset's confirm over the stats page):
  // the words under it are meant to be dimmed, and only what is drawn after it is held to it.
  onFill = (x, y, w, h) => { if (x <= 0 && y <= 0 && x + w >= VW && y + h >= VH) expect.clear(); };
  glyphs = [];
  fills = [];
  const n0 = calls.drawImage + calls.fillRect;
  scr.draw(ctx, t);
  const drawn = calls.drawImage + calls.fillRect - n0;
  const g = glyphs, f = fills;
  glyphs = null;
  fills = null;
  onFill = null;
  if (T.M) T.M.menuProbe(false);
  return { c, probe: probe || [], glyphs: g, fills: f, expect, drawn };
}

/** The old font's glyph blits, joined back into words (a run of three spaces splits them). */
function glyphWords(list) {
  const runs = [];
  let cur = null;
  for (const g of list) {
    const adv = g.w / 5 * 6 + (g.h > 7 ? g.h / 7 : 0);
    const steps = cur ? (g.x - cur.last) / adv : 0;
    if (cur && g.y === cur.y && g.h === cur.h && g.x > cur.x1 - 1e-6
      && Math.abs(steps - Math.round(steps)) < 1e-6 && steps < 3.5) {
      cur.s += ' '.repeat(Math.round(steps) - 1) + g.ch;
      cur.last = g.x; cur.x1 = g.x + g.w;
    } else {
      cur = { s: g.ch, x0: g.x, y: g.y, h: g.h, x1: g.x + g.w, last: g.x };
      runs.push(cur);
    }
  }
  // The outline's eight offset copies of a word are runs of their own: one word, one box.
  const words = [];
  for (const r of runs) {
    const b = [r.x0, r.y, r.x1, r.y + r.h];
    const hit = words.find((w) => w.s === r.s && b[0] <= w.b[2] + 3 && b[2] >= w.b[0] - 3 && b[1] <= w.b[3] + 3 && b[3] >= w.b[1] - 3);
    if (hit) hit.b = [Math.min(hit.b[0], b[0]), Math.min(hit.b[1], b[1]), Math.max(hit.b[2], b[2]), Math.max(hit.b[3], b[3])];
    else words.push({ s: r.s, b });
  }
  return words;
}

/** The skin's words (its probe's text and lines), cut where three spaces split them, as boxes. */
function probeWords(T, probe) {
  const out = [];
  for (const e of probe) {
    if (e.kind !== 'text' && e.kind !== 'line') continue;
    const scale = e.scale || 1;
    const pad = e.kind === 'line' ? 0.75 : 0.5;
    const adv = 6 * scale + T.F.tracking(scale);
    const left = e.b[0] + pad, top = e.b[1] + pad;
    const re = /\S+(?: {1,2}\S+)*/g;
    let m;
    while ((m = re.exec(e.s))) {
      const i0 = m.index, i1 = m.index + m[0].length - 1;
      out.push({ s: m[0], b: [left + i0 * adv - pad, top - pad, left + i1 * adv + 5 * scale + pad, top + 7 * scale + pad] });
    }
  }
  return out;
}

// --- 1. layout ---------------------------------------------------------------------------------

function checkLayout(T, quiet = false) {
  const errs = [];
  const old = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
  let worst = { d: 0 };
  let words = 0, elems = 0, worstEl = 0;
  const addedAll = [];
  for (const scr of screens(T)) {
    const want = old.screens[scr.name];
    if (!want) { errs.push(`${scr.name}: no old layout recorded`); continue; }
    const r = stage(T, scr, T0);
    if (r.glyphs.length) errs.push(`${scr.name}: ${r.glyphs.length} glyphs still blitted from the old font (${glyphWords(r.glyphs).map((w) => w.s).slice(0, 3).join(', ')})`);
    const have = probeWords(T, r.probe);
    let sw = { d: 0 };
    const shiftedSeen = new Map();   // each shift used on this screen -> the words it moved
    for (const w of want) {
      let s = w.s, b = w.b.slice();
      const shift = shiftOf(scr.name, b);
      if (shift) {
        b = moveBox(b, shift);
        if (!shiftedSeen.has(shift)) shiftedSeen.set(shift, []);
        shiftedSeen.get(shift).push(s);
      }
      // The selected option's pointer is drawn apart from its label now: '> LABEL' was one run.
      if (s.startsWith('> ')) {
        const ptr = have.find((h) => h.s === '>' && Math.abs(h.b[0] - b[0]) <= LAYOUT_TOL + 0.5 && Math.abs(h.b[1] - b[1]) <= LAYOUT_TOL);
        if (!ptr) errs.push(`${scr.name}: the pointer '>' of '${s}' is gone`);
        s = s.slice(2); b[0] += 12;
      }
      const rn = RENAMED.find(([on, from]) => on(scr.name) && from === s);
      if (rn) s = rn[2];
      const cands = have.filter((h) => h.s === s);
      if (!cands.length) { errs.push(`${scr.name}: '${s}' is not drawn`); continue; }
      const d = rn
        ? (h) => Math.max(rn[3] === 'left' ? Math.abs(h.b[0] - b[0]) : Math.abs((h.b[0] + h.b[2]) / 2 - (b[0] + b[2]) / 2),
          Math.abs(h.b[1] - b[1]), Math.abs(h.b[3] - b[3]))
        : (h) => Math.max(...h.b.map((v, k) => Math.abs(v - b[k])));
      const best = cands.reduce((a, h) => (d(h) < d(a) ? h : a));
      const dd = d(best);
      words++;
      const why = MOVED[scr.name] && MOVED[scr.name][s];
      if (dd > LAYOUT_TOL && !why) errs.push(`${scr.name}: '${s}' moved ${dd.toFixed(2)} units (was ${b.map((v) => +v.toFixed(2))}, now ${best.b.map((v) => +v.toFixed(2))})`);
      if (why) { if (!quiet) ok(`${scr.name}: '${s}' ${why}: ${(best.b[1] - b[1]).toFixed(2)} units down`); continue; }
      if (dd > sw.d) sw = { d: dd, s };
      if (dd > worst.d) worst = { d: dd, s, scr: scr.name };
    }
    if (!quiet) {
      for (const [sh, ws] of shiftedSeen) ok(`${scr.name}: ${ws.join(', ')} moved by exactly ${sh[2]}, ${sh[3]}: ${sh[4]}`);
    }
    for (const [names, word, box] of ADDED) {
      if (!names.includes(scr.name)) continue;
      const cands = have.filter((h) => h.s === word);
      const d = (h) => Math.max(...h.b.map((v, k) => Math.abs(v - box[k])));
      const best = cands.length ? cands.reduce((a, h) => (d(h) < d(a) ? h : a)) : null;
      if (!best) errs.push(`${scr.name}: '${word}', added since the baseline, is not drawn`);
      else if (d(best) > LAYOUT_TOL) errs.push(`${scr.name}: '${word}' is ${d(best).toFixed(2)} units from ${box} (now ${best.b.map((v) => +v.toFixed(2))})`);
      else words++;
    }
    // The other elements, kind for kind.
    const wantEl = (old.elements || {})[scr.name];
    if (!wantEl) { errs.push(`${scr.name}: no old elements recorded (re-run --baseline in the old tree)`); continue; }
    const haveEl = newElements(r.probe);
    const used = new Set();
    let ew = 0;
    for (const e0 of wantEl) {
      const rs = RESIZED[scr.name] && RESIZED[scr.name][e0.b.join(',')];
      const e = { ...e0, b: rs ? rs[0] : moveBox(e0.b, shiftOf(scr.name, e0.b)) };
      if (rs && !quiet) ok(`${scr.name}: the ${e0.k} at ${e0.b.join(',')} is now ${rs[0].join(',')}: ${rs[1]}`);
      const d = (h) => Math.max(...h.b.map((v, k) => Math.abs(v - e.b[k])));
      const cands = haveEl.filter((h, i) => h.k === e.k && !used.has(i));
      if (!cands.length) { errs.push(`${scr.name}: the ${e.k} at ${e.b.map((v) => +v.toFixed(2))} is not drawn`); continue; }
      const best = cands.reduce((a, h) => (d(h) < d(a) ? h : a));
      used.add(haveEl.indexOf(best));
      const dd = d(best);
      elems++;
      const why = MOVED_EL[scr.name] && MOVED_EL[scr.name][e.b.join(',')];
      if (why) { if (!quiet) ok(`${scr.name}: the ${e.k} at ${e.b.join(',')}: ${why} (${dd.toFixed(2)} units)`); continue; }
      if (dd > ELEM_TOL) errs.push(`${scr.name}: the ${e.k} at ${e.b.map((v) => +v.toFixed(2))} moved ${dd.toFixed(2)} units (now ${best.b.map((v) => +v.toFixed(2))})`);
      ew = Math.max(ew, dd);
      worstEl = Math.max(worstEl, dd);
    }
    const added = haveEl.filter((h, i) => !used.has(i));
    addedAll.push(...added.map((h) => `${scr.name}:${h.k}${h.s ? ' ' + h.s : ''}`));
    if (!quiet) {
      console.log(`       ${scr.name.padEnd(13)} ${String(want.length).padStart(3)} words, furthest ${sw.d.toFixed(2)} units${sw.s ? ` ('${sw.s}')` : ''};`
        + ` ${String(wantEl.length).padStart(2)} elements, furthest ${ew.toFixed(2)}; ${added.length} added`);
    }
  }
  if (!quiet && !errs.length) {
    ok(`${words} words on ${Object.keys(old.screens).length} screens where the old font drew them, the furthest ${worst.d.toFixed(2)} units ('${worst.s}', ${worst.scr}); none left in the old font`);
    ok(`${elems} elements where the old screens drew them, the furthest ${worstEl.toFixed(2)} units; the skin adds ${addedAll.length}`
      + ` (plates, tabs and rules: ${[...new Set(addedAll.map((a) => a.replace(/^[^:]*:/, '')))].slice(0, 12).join(', ')}...)`);
  }
  return errs;
}

/**
 * Plaques that are made round what stands on them hold it in the middle: the air left and
 * right of their contents (every word, line, keycap and gem whose middle lies inside) within
 * CENTRE_TOL of each other. The key plaque of the first run was sized by keyLine's centring
 * width, six units short of what it draws, and held its rows two units right of its middle:
 * 5.5 units of field left of ARROWS, 1 right of TO CHAIN. The records' plaque and the panels
 * of left-aligned tables are left out: what stands on them is not centred, by design.
 */
const CENTRE_TOL = 1.5;
const CENTRED = [
  ['menu-first', (e) => e.s === 'lower'], ['menu-first', (e) => e.s === 'prompt'],
  ['menu-sound', (e) => e.s === 'panel'], ['help', (e) => e.s === 'panel' && e.b[3] - e.b[1] === 15],
  ['quit', (e) => e.s === 'panel'], ['quit-blocked', (e) => e.s === 'panel'],
];
function checkCentred(T, quiet = false) {
  const errs = [];
  const pad = { text: 0.5, line: 0.75, keycap: 0, gem: 0 };
  let worst = 0;
  for (const [name, which] of CENTRED) {
    const scr = screens(T).find((s) => s.name === name);
    const r = stage(T, scr, T0);
    const plates = r.probe.filter((e) => e.kind === 'plate' && which(e));
    if (plates.length !== 1) { errs.push(`${name}: ${plates.length} plaques match, one wanted`); continue; }
    const p = plates[0].b;
    let x0 = Infinity, x1 = -Infinity;
    for (const e of r.probe) {
      if (!(e.kind in pad)) continue;
      const cx = (e.b[0] + e.b[2]) / 2, cy = (e.b[1] + e.b[3]) / 2;
      if (cx < p[0] || cx > p[2] || cy < p[1] || cy > p[3]) continue;
      x0 = Math.min(x0, e.b[0] + pad[e.kind]); x1 = Math.max(x1, e.b[2] - pad[e.kind]);
    }
    const L = x0 - p[0], R = p[2] - x1;
    worst = Math.max(worst, Math.abs(L - R));
    if (!(Math.abs(L - R) <= CENTRE_TOL)) errs.push(`${name}: the ${plates[0].s} plaque holds its contents off centre: ${L.toFixed(2)} units of it left of them, ${R.toFixed(2)} right`);
  }
  // The active stats tab stands OPEN on the rule: its last row is enamel, not a rim.
  {
    const scr = screens(T).find((s) => s.name === 'stats-1');
    const r = stage(T, scr, T0);
    const tab = r.probe.find((e) => e.kind === 'plate' && e.s === 'select');
    const { PX, SW } = T.C;
    const y = Math.round(tab.b[3] * PX) - 1, x = Math.round(((tab.b[0] + tab.b[2]) / 2) * PX);
    const d = r.c.data, i = (y * SW + x) * 4;
    // Deep crimson enamel: red well over green and blue, and dark.
    if (!(d[i] > d[i + 1] + 25 && d[i] > d[i + 2] + 25 && d[i] < 140)) {
      errs.push(`stats-1: the active tab is closed at its foot (its last row is ${d[i]},${d[i + 1]},${d[i + 2]}, not enamel)`);
    }
  }
  if (!quiet && !errs.length) ok(`${CENTRED.length} plaques made round their contents hold them centred (within ${worst.toFixed(2)} units); the active tab stands open on its rule`);
  return errs;
}

// --- 2. the prompt -----------------------------------------------------------------------------

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lumOf = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** The prompt's parts in a frame: letters, legend, the plaque's field and rim, the backdrop. */
function promptParts(T, r) {
  const { PX, SW } = T.C;
  const line = r.probe.find((e) => e.kind === 'line' && e.s === T.M.PROMPT);
  const plate = r.probe.find((e) => e.kind === 'plate' && e.s === 'prompt');
  const key = r.probe.find((e) => e.kind === 'keycap' && e.s === 'SPACE');
  const a = T.M.menuPiece('prompt');
  if (!line || !plate || !a) return null;
  const d = r.c.data;
  const X = Math.round((line.b[0] + 0.75) * PX) - a.ax, Y = Math.round((line.b[1] + 0.75) * PX) - a.ay;
  const L = [], G = [];
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = ((Y + y) * SW + X + x) * 4;
    if (a.letters[y * a.w + x]) L.push(lumOf(d, i));
    else if (a.legend[y * a.w + x]) G.push(lumOf(d, i));
  }
  // The field: the commonest colour inside the plaque; the key's face: the commonest in the key.
  const mode = (b) => {
    const n = new Map();
    for (let y = Math.round(b[1] * PX) + 12; y < Math.round(b[3] * PX) - 12; y++) {
      for (let x = Math.round(b[0] * PX) + 12; x < Math.round(b[2] * PX) - 12; x++) {
        const i = (y * SW + x) * 4, k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        n.set(k, (n.get(k) || 0) + 1);
      }
    }
    const k = [...n.entries()].sort((p, q) => q[1] - p[1])[0][0];
    return lumOf([(k >> 16) & 255, (k >> 8) & 255, k & 255], 0);
  };
  // The rim: the plaque's outer three pixels along its top; the backdrop: the eight rows over
  // it. Not under it: with records to show, the records' plaque lies there.
  const pb = plate.b.map((v) => Math.round(v * PX));
  const rim = [], back = [];
  for (let x = pb[0] + 20; x < pb[2] - 20; x += 2) {
    for (let k = 1; k <= 3; k++) rim.push(lumOf(d, ((pb[1] + k) * SW + x) * 4));
    for (let k = 2; k <= 9; k++) back.push(lumOf(d, ((pb[1] - k) * SW + x) * 4));
  }
  let hash = 0;
  const ch = (plate.chamfer || 0) + 1;
  for (let y = pb[1]; y < pb[3]; y++) for (let x = pb[0]; x < pb[2]; x++) {
    const u = x - pb[0], v = y - pb[1], iu = pb[2] - 1 - x, iv = pb[3] - 1 - y;
    if (u + v < ch || iu + v < ch || u + iv < ch || iu + iv < ch) continue;   // its cut corners
    const i = (y * SW + x) * 4;
    hash = (Math.imul(hash, 31) + d[i] * 65599 + d[i + 1] * 257 + d[i + 2]) | 0;
  }
  return { letters: median(L), n: L.length, legend: median(G), field: mode(plate.b), face: key ? mode(key.b) : 0,
    rim: median(rim), back: median(back), hash, plate: plate.b };
}

/** The attract run's frames, a few seconds into each zone (as main.js draws them). */
async function zoneFrames(maxZones = 12) {
  const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
  const { Game, STATE } = await import(u('src/game/game.js'));
  const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await import(u('src/game/autoplay.js'));
  const { Renderer } = await import(u('src/render/renderer.js'));
  const { STEP } = await import(u('src/core/loop.js'));
  const { THEMES } = await import(u('src/game/themes.js'));
  const { SW, SH } = await import(u('src/game/constants.js'));
  const canvas = new HeadlessCanvas(SW, SH);
  const renderer = new Renderer(canvas);
  const input = new AutoInput();
  const demo = new Game(input);
  const bot = new AutoPlayer(input);
  startDemo(demo, DEMO_SEEDS[0]);   // as main.js starts it: its settings, a player's tower
  const step = (sec) => {
    for (let i = 0; i < Math.round(sec / STEP); i++) {
      if (demo.state === STATE.PLAYING || demo.state === STATE.FALLING) bot.step(demo, STEP);
      demo.step(STEP);
    }
  };
  const out = [];
  const seen = new Set();
  for (let guard = 0; guard < 1600 && seen.size < maxZones && demo.state !== STATE.DEAD; guard++) {
    step(0.25);
    const z = demo.themeIndex;
    if (seen.has(z)) continue;
    seen.add(z);
    step(2.5);
    for (let k = 0; k < 3; k++) renderer.draw(demo, 1, 1 / 60);
    out.push({ zone: THEMES[z].name, data: canvas.data.slice() });
  }
  return out;
}

function checkPrompt(T, zones, quiet = false) {
  const errs = [];
  const scr = screens(T)[0];
  const got = [];
  for (const z of zones) {
    const r = stage(T, scr, T0, z.data);
    const p = promptParts(T, r);
    if (!p) { errs.push(`${z.zone}: the prompt is not drawn`); continue; }
    got.push({ zone: z.zone, ...p });
  }
  if (!got.length) return errs.concat('no zone frames');
  for (const g of got) {
    const lf = ratio(g.letters, g.field), kf = ratio(g.legend, g.face), rb = ratio(g.rim, g.back);
    if (lf < 7) errs.push(`${g.zone}: PRESS / TO CLIMB against the plaque only ${lf.toFixed(1)}:1 (7 wanted)`);
    if (kf < 4.5) errs.push(`${g.zone}: the key's legend against the key only ${kf.toFixed(1)}:1 (4.5 wanted)`);
    if (rb < 1.5) errs.push(`${g.zone}: the plaque's rim against the backdrop only ${rb.toFixed(1)}:1 (1.5 wanted)`);
    if (!quiet) console.log(`       ${g.zone.padEnd(10)} letters ${lf.toFixed(1)}:1 on the plaque, legend ${kf.toFixed(1)}:1 on the key, rim ${rb.toFixed(1)}:1 on the backdrop (median luminance ${g.back.toFixed(3)})`);
  }
  const hashes = new Set(got.map((g) => g.hash));
  if (hashes.size !== 1) errs.push(`the plaque differs between zones (${hashes.size} versions): something behind shows through it`);
  // There at every moment: sampled every 50 ms over two whole shine cycles.
  let worst = Infinity, at = 0;
  for (let t = 0; t < 9.0; t += 0.05) {
    const r = stage(T, scr, t, zones[0].data);
    const p = promptParts(T, r);
    const v = p ? ratio(p.letters, p.field) : 1;
    if (v < worst) { worst = v; at = t; }
  }
  if (worst < 7) errs.push(`the prompt fades or goes: letters ${worst.toFixed(1)}:1 at t=${at.toFixed(2)} s`);
  if (!quiet && !errs.length) {
    ok(`the prompt reads over ${got.length} zones: letters ${Math.min(...got.map((g) => ratio(g.letters, g.field))).toFixed(1)}:1 or better on a plaque identical in every zone; never under ${worst.toFixed(1)}:1 at any moment of 9 s`);
  }
  return errs;
}

// --- 3. nothing covers the words -------------------------------------------------------------

/**
 * The letter pixels a frame's probe names. A line of small text is the font, so its letters
 * are exactly the font's pixels, read off the glyphs (by colour, a bright ink's inner keyline
 * passes for a letter). A lettered line's are its opaque pixels brighter than its outline.
 */
function wordMask(T, r) {
  const { PX, SW, SH } = T.C;
  const d = r.c.data;
  const letter = new Uint8Array(SW * SH);
  for (const e of r.probe) {
    if (e.kind === 'text') {
      const left = e.b[0] + 0.5, top = e.b[1] + 0.5;
      [...e.s].forEach((ch, i) => {
        const rows = T.F.GLYPHS[ch];
        if (!rows || ch === ' ') return;
        for (let rr = 0; rr < 7; rr++) for (let c = 0; c < 5; c++) {
          if (rows[rr][c] !== '#') continue;
          const x0 = Math.round((left + i * 6 + c) * PX), y0 = Math.round((top + rr) * PX);
          for (let y = y0; y < y0 + PX; y++) for (let x = x0; x < x0 + PX; x++) if (x >= 0 && y >= 0 && x < SW && y < SH) letter[y * SW + x] = 1;
        }
      });
      continue;
    }
    if (e.kind !== 'line') continue;
    const x0 = Math.max(0, Math.floor(e.b[0] * PX)), y0 = Math.max(0, Math.floor(e.b[1] * PX));
    const x1 = Math.min(SW, Math.ceil(e.b[2] * PX)), y1 = Math.min(SH, Math.ceil(e.b[3] * PX));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * SW + x;
      if (d[i * 4 + 3] === 255 && 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] >= 40) letter[i] = 1;
    }
  }
  return letter;
}
/** Each plate's inside, less its chamfered corners. */
function plateMask(T, r) {
  const { PX, SW, SH } = T.C;
  const m = new Uint8Array(SW * SH);
  for (const e of r.probe) {
    if (e.kind !== 'plate' && e.kind !== 'keycap') continue;
    const c = (e.chamfer || 4) + 1;
    const x0 = Math.round(e.b[0] * PX), y0 = Math.round(e.b[1] * PX), x1 = Math.round(e.b[2] * PX), y1 = Math.round(e.b[3] * PX);
    for (let y = Math.max(0, y0 + 1); y < Math.min(SH, y1 - 2); y++) for (let x = Math.max(0, x0 + 1); x < Math.min(SW, x1 - 1); x++) {
      const u = x - x0, v = y - y0, iu = x1 - 1 - x, iv = y1 - 1 - y;
      if (u + v < c || iu + v < c || u + iv < c || iu + iv < c) continue;
      m[y * SW + x] = 1;
    }
  }
  return m;
}

function checkCover(T, zones, quiet = false) {
  const errs = [];
  const { SW, SH } = T.C;
  // (a) main.js: the attract run first, then the menu over it.
  errs.push(...orderErrors(fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8')));
  // (b) beds and plates, on every screen, drawn over nothing at all.
  let letters = 0, plates = 0, kept = 0, onPlate = 0;
  for (const scr of screens(T)) {
    const r = stage(T, scr, T0);
    const d = r.c.data;
    const L = wordMask(T, r), P = plateMask(T, r);
    let open = 0, holes = 0, off = 0, where = '', offAt = '';
    for (let y = 2; y < SH - 2; y++) for (let x = 2; x < SW - 2; x++) {
      const i = y * SW + x;
      if (P[i]) { plates++; if (d[i * 4 + 3] !== 255) { holes++; where = where || `${x},${y}`; } }
      if (!L[i]) continue;
      letters++;
      // (e) Over the demo, on a plate.
      if (scr.demo) { if (P[i]) onPlate++; else { off++; offAt = offAt || `${x},${y}`; } }
      let seen = false;
      for (let dy = -2; dy <= 2 && !seen; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (d[(i + dy * SW + dx) * 4 + 3] !== 255) { seen = true; break; }
      }
      if (seen) { open++; where = where || `${x},${y}`; }
    }
    if (open) errs.push(`${scr.name}: ${open} letter pixels within two pixels of something see-through (first at backing px ${where})`);
    if (holes) errs.push(`${scr.name}: ${holes} see-through pixels inside its plates (first at backing px ${where})`);
    if (off) errs.push(`${scr.name}: ${off} letter pixels over the demo on no plate, only their keyline (first at backing px ${offAt})`);
    // (d) Each word's pixels as they stood when it was drawn, in the finished frame.
    let changed = 0, changedAt = '';
    for (const [i, col] of r.expect) {
      const k = i * 4;
      if (((d[k] << 16) | (d[k + 1] << 8) | d[k + 2]) !== col) { changed++; changedAt = changedAt || `${i % SW},${(i / SW) | 0}`; }
    }
    kept += r.expect.size;
    if (changed) errs.push(`${scr.name}: ${changed} pixels of its words drawn over after the word (first at backing px ${changedAt})`);
  }
  // (c) the screens over the attract run, over a real demo frame and over flat magenta.
  const magenta = new Uint8ClampedArray(SW * SH * 4);
  for (let i = 0; i < SW * SH; i++) { magenta[i * 4] = 255; magenta[i * 4 + 2] = 255; magenta[i * 4 + 3] = 255; }
  let compared = 0;
  for (const scr of screens(T).filter((s) => s.demo)) {
    for (const z of zones) {
      const a = stage(T, scr, T0, z.data), b = stage(T, scr, T0, magenta);
      const o = stage(T, scr, T0);
      const L = wordMask(T, o), P = plateMask(T, o);
      let diff = 0;
      const box = [SW, SH, 0, 0], ad = a.c.data, bd = b.c.data;
      for (let y = 2; y < SH - 2; y++) for (let x = 2; x < SW - 2; x++) {
        const i = y * SW + x;
        let hit = P[i];
        if (!hit) for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2; dx++) if (L[i + dy * SW + dx]) { hit = 1; break; }
        if (!hit) continue;
        compared++;
        const k = i * 4;
        if (ad[k] !== bd[k] || ad[k + 1] !== bd[k + 1] || ad[k + 2] !== bd[k + 2]) {
          diff++;
          box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
        }
      }
      if (diff) errs.push(`${scr.name} over ${z.zone}: ${diff} pixels of its words or plates change with what is behind them (backing px ${box.join(',')})`);
    }
  }
  if (!quiet && !errs.length) {
    ok(`main.js draws the attract run before the menu and the guide; ${letters} letter pixels, every one two pixels deep in an opaque bed; ${plates} plate pixels, all opaque`);
    ok(`over the demo, ${onPlate} letter pixels, every one on a plate; ${kept} pixels of words, each what its word put down (nothing drawn on a word after it)`);
    ok(`over a demo frame and over magenta: ${compared} word, bed and plate pixels compared, none different`);
  }
  return errs;
}

/** main.js's MENU and TUTORIAL branches draw the demo, then the menu. */
function orderErrors(src) {
  const errs = [];
  // Inside renderFrame: update() tests the same states first, for stepping the demo.
  const from = src.indexOf('function renderFrame');
  if (from < 0) return ['main.js: no renderFrame'];
  for (const [state, fn] of [['STATE.MENU', 'drawMenu(ctx'], ['STATE.TUTORIAL', 'drawTutorial(ctx']]) {
    const at = src.indexOf(`game.state === ${state})`, from);
    if (at < 0) { errs.push(`main.js: no ${state} branch found`); continue; }
    const next = src.indexOf('} else if', at + 10);
    const body = src.slice(at, next < 0 ? undefined : next);
    const world = body.indexOf('renderer.draw(demoGame'), menu = body.indexOf(fn);
    if (world < 0 || menu < 0 || menu < world) errs.push(`main.js: in the ${state} branch the menu is not drawn after the attract run`);
  }
  return errs;
}

// --- 4. painted once -------------------------------------------------------------------------

function checkOnce(T, zones, quiet = false) {
  const errs = [];
  const scrs = screens(T);
  // The title screen up for as long as its warm-up takes.
  for (let k = 0; k < 400 && T.M.menuStats().pending; k++) stage(T, scrs[0], k / 60);
  const st0 = T.M.menuStats();
  if (st0.pending) errs.push(`${st0.pending} pieces still unpainted after 400 title-screen frames`);
  T.M.resetMenuStats();
  const before = T.M.menuStats().builds;
  for (const scr of scrs) for (const t of [T0, 0.5, 0.9, 2.8, 7.3]) stage(T, scr, t, scr.demo ? zones[0].data : null);
  const st = T.M.menuStats();
  if (st.late) errs.push(`${st.late} pieces painted in the frame that drew them: ${st.pieces.slice(-st.late).map((p) => p[0]).slice(0, 5).join(', ')}`);
  if (st.builds !== before) errs.push(`${st.builds - before} pieces painted again after the warm-up`);
  // A frame of the title screen: blits and fills, quiet and while a glint crosses it.
  const quietN = stage(T, scrs[0], T0).drawn, glintN = stage(T, scrs[0], 0.7).drawn;
  // A few blits a frame: the halo's four strips, the plate, two words, the arms, the subtitle,
  // the lower plaque's composite, the prompt's plaque, glow and line -- 13 when it landed,
  // and a glint's slanted strips on top (about fifty). A hundred and more is the key hints
  // drawn a character at a time again.
  if (quietN > 20 || glintN > 100) errs.push(`a title-screen frame is ${quietN} canvas calls (${glintN} with a glint): the pieces are not being drawn as pieces`);
  const ms = [];
  for (let k = 0; k < 15; k++) {
    const c = new HeadlessCanvas(T.C.SW, T.C.SH);
    c.data.set(zones[0].data);
    const ctx = c.getContext('2d');
    ctx.setTransform(T.C.PX, 0, 0, T.C.PX, 0, 0);
    const t0 = performance.now();
    T.S.drawMenu(ctx, saveFile(T), T0 + k * 0.1, 1 / 60, true, false);
    ms.push(performance.now() - t0);
  }
  if (!quiet && !errs.length) {
    const heavy = st0.pieces.slice().sort((a, b) => b[1] - a[1])[0];
    ok(`${st0.builds} pieces painted once (the heaviest ${heavy[0]}, ${heavy[1].toFixed(1)} ms headless), 0 painted late over every screen at five moments`);
    ok(`a title-screen frame: ${quietN} canvas calls, ${glintN} while a glint crosses; ${median(ms).toFixed(1)} ms headless (median of 15, over the demo)`);
  }
  return errs;
}

// --- 5. the demo behind it does not blink ---------------------------------------------------------

const CALM_MAX = 6;          // a frame's mean luma against the one before [0-255; arrivals were 20-24]
const DISSOLVE_STEP = 0.05;  // what the backdrop shows, per frame at 60 Hz [share of the screen, summed]

async function checkCalm(root, quiet = false) {
  const errs = [];
  const u = (p) => pathToFileURL(path.join(root, p)).href;
  const { Game, STATE } = await import(u('src/game/game.js'));
  const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await import(u('src/game/autoplay.js'));
  const { Renderer } = await import(u('src/render/renderer.js'));
  const { STEP } = await import(u('src/core/loop.js'));
  const { SW, SH, PX, VW, VH, DEMO_DISSOLVE } = await import(u('src/game/constants.js'));
  const S = await import(u('src/ui/screens.js'));
  const Stats = await import(u('src/game/stats.js'));
  const all = Stats.BLANK_ALL();
  const FRAME = 4 * STEP;    // 60 Hz against the 240 Hz simulation
  const demoRun = () => {
    const input = new AutoInput(), g = new Game(input), bot = new AutoPlayer(input);
    // As main.js starts it (autoplay.js startDemo): the game's default settings since
    // 2026-09-29, when DEMO_JUMP_SPEED (130%) went.
    startDemo(g, DEMO_SEEDS[0]);
    return { g, frame: () => { for (let i = 0; i < 4; i++) { if (g.state === STATE.PLAYING) bot.step(g, STEP); g.step(STEP); } } };
  };
  // Where the first arrival is, from the simulation alone.
  let arrive = -1;
  {
    const d = demoRun(), z0 = d.g.themeIndex;
    for (let f = 0; f < 60 * 40 && arrive < 0; f++) { d.frame(); if (d.g.themeIndex !== z0) arrive = f; }
  }
  if (arrive < 0) return ['the attract run never left its first zone in 40 s'];

  // (a) the title screen through that arrival.
  {
    const canvas = new HeadlessCanvas(SW, SH);
    const renderer = new Renderer(canvas);
    renderer.applySettings(SETTINGS);
    const ctx = renderer.ctx;
    const d = demoRun();
    const from = arrive - 30, to = arrive + Math.ceil(DEMO_DISSOLVE * 60) + 12;
    let prev = null, worst = 0, worstAt = 0, frames = 0;
    for (let f = 0; f <= to; f++) {
      d.frame();
      if (f < from) continue;
      renderer.draw(d.g, 1, FRAME);
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      ctx.fillStyle = MENU_WASH;
      ctx.fillRect(0, 0, VW, VH);
      S.drawMenu(ctx, all, f * FRAME, FRAME, true, false);
      const px = canvas.data;
      let s = 0, n = 0;
      for (let y = 0; y < SH; y += 4) for (let x = 0; x < SW; x += 4) {
        const i = (y * SW + x) * 4;
        s += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; n++;
      }
      const m = s / n;
      if (prev !== null && Math.abs(m - prev) > worst) { worst = Math.abs(m - prev); worstAt = f - arrive; }
      prev = m; frames++;
    }
    if (!(worst < CALM_MAX)) errs.push(`the title screen jumped ${worst.toFixed(1)} in mean luma between two frames, ${worstAt} frames from the demo's arrival (under ${CALM_MAX} wanted)`);
    else if (!quiet) ok(`the title screen over the demo's first arrival (floor ${d.g.run.maxFloor}): ${frames} frames, the largest step in mean luma ${worst.toFixed(1)} (under ${CALM_MAX})`);
  }

  // (b) what the backdrop shows, over two arrivals.
  {
    const renderer = new Renderer(new HeadlessCanvas(8, 8));
    const d = demoRun();
    const share = (zf) => {
      const w = new Map([[zf.theme.name, 1 - zf.blend]]);
      if (zf.blend > 0 && zf.next) w.set(zf.next.name, (w.get(zf.next.name) || 0) + zf.blend);
      return w;
    };
    let prev = null, worst = 0, worstAt = '', arrivals = 0, since = -1, late = 0, lastZ = d.g.themeIndex;
    for (let f = 0; f < 60 * 40; f++) {
      d.frame();
      if (d.g.themeIndex !== lastZ) { arrivals++; lastZ = d.g.themeIndex; since = 0; }
      if (arrivals > 2) break;
      const zf = renderer.zoneFade(d.g, FRAME);
      const w = share(zf);
      if (prev) {
        let moved = 0;
        for (const k of new Set([...w.keys(), ...prev.keys()])) moved += Math.abs((w.get(k) || 0) - (prev.get(k) || 0));
        if (moved > worst) { worst = moved; worstAt = `floor ${d.g.run.maxFloor}`; }
      }
      prev = w;
      if (since >= 0) {
        since++;
        if (since > Math.ceil(DEMO_DISSOLVE * 60) + 1 && (zf.index !== d.g.themeIndex || zf.blend !== 0)) late++;
      }
    }
    if (!(worst <= DISSOLVE_STEP)) errs.push(`the demo's backdrop moved ${worst.toFixed(2)} of the screen in one frame at ${worstAt} (at most ${DISSOLVE_STEP})`);
    else if (late) errs.push(`the demo's backdrop was still not its zone's, alone, ${late} frames after DEMO_DISSOLVE`);
    else if (arrivals < 2) errs.push(`the attract run crossed ${arrivals} zones in 40 s, not two`);
    else if (!quiet) ok(`over two arrivals the demo's backdrop dissolves: at most ${worst.toFixed(3)} of the screen a frame, and on its zone alone within ${DEMO_DISSOLVE} s`);
  }

  // (c) the flash and the shake, on the demo and in play.
  {
    const canvas = new HeadlessCanvas(SW, SH);
    const renderer = new Renderer(canvas);
    renderer.applySettings(SETTINGS);
    const d = demoRun();
    for (let f = 0; f < 90; f++) d.frame();
    const shot = (flash, shake) => {
      d.g.flash = flash; d.g.shakeX = shake; d.g.shakeY = shake;
      renderer.draw(d.g, 1, 0);
      return canvas.data.slice();
    };
    const differ = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
    const still = shot(0, 0), flashed = shot(1, 0), shaken = shot(0, 5);
    d.g.demo = false;
    const playStill = shot(0, 0), playFlash = shot(1, 0), playShake = shot(0, 5);
    d.g.demo = true;
    const nf = differ(still, flashed), ns = differ(still, shaken), pf = differ(playStill, playFlash), ps = differ(playStill, playShake);
    if (nf || ns) errs.push(`on the demo a flash changed ${nf} pixels and a shake ${ns} (none wanted)`);
    else if (!pf || !ps) errs.push(`the check cannot see a flash (${pf} pixels) or a shake (${ps}) in play`);
    else if (!quiet) ok(`on the demo a flash and a shake change no pixel; in play the same frame's flash changes ${pf} and its shake ${ps}`);
  }
  return errs;
}

// --- the old layout, from an old tree ------------------------------------------------------------

if (BASELINE) {
  const T = await load(ROOT);
  const out = { from: 'screens at the tree this was run in (tools/test-menu.mjs --baseline)', screens: {}, elements: {} };
  for (const scr of screens(T)) {
    const r = stage(T, scr, T0);
    out.screens[scr.name] = glyphWords(r.glyphs).map((w) => ({ s: w.s, b: w.b.map((v) => +v.toFixed(3)) }));
    out.elements[scr.name] = oldElements(r.fills).map((e) => ({ k: e.k, b: e.b.map((v) => +v.toFixed(3)) }));
    console.log(`  ${scr.name.padEnd(13)} ${out.screens[scr.name].length} words, ${out.elements[scr.name].length} elements, ${r.drawn} canvas calls`);
  }
  fs.writeFileSync(LAYOUT_FILE, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote ' + LAYOUT_FILE);
  process.exit(0);
}

// --- the checks --------------------------------------------------------------------------------

const T = await load(ROOT);
const zones = await zoneFrames(12);
console.log(`\n  ${zones.length} zones of the attract run: ${zones.map((z) => z.zone).join(', ')}`);

console.log('\n  1. every word where it was');
for (const e of checkLayout(T)) fail(e);
for (const e of checkCentred(T)) fail(e);
console.log('\n  2. PRESS SPACE TO CLIMB over every zone');
for (const e of checkPrompt(T, zones)) fail(e);
console.log('\n  3. nothing covers the words');
for (const e of checkCover(T, zones.slice(0, 3))) fail(e);
console.log('\n  4. painted once');
for (const e of checkOnce(T, zones)) fail(e);
console.log('\n  5. the demo behind it does not blink');
for (const e of await checkCalm(ROOT)) fail(e);

// --- and each of them against a broken copy ------------------------------------------------------

if (MUTATIONS) {
  console.log('\n  MUTATIONS: each check against a copy of src/ broken on purpose');
  const two = [zones[0], zones[Math.min(zones.length - 1, 6)]];
  const MUTS = [
    { name: 'a key hint row four units down', file: 'src/ui/screens.js', check: 'layout',
      // Repointed when R REPLAYS joined the row: its old text was gone and the check had no mutant.
      from: "[[['S', 'STATS'], ['H', 'HELP'], ['O', 'OPTIONS'], ['R', 'REPLAYS']], 240, 12]",
      to: "[[['S', 'STATS'], ['H', 'HELP'], ['O', 'OPTIONS'], ['R', 'REPLAYS']], 244, 12]" },
    { name: 'the awards count left off the title screen', file: 'src/ui/screens.js', check: 'layout',
      from: "if (pr) statLine(g, 'AWARDS', awards, VALUE2, VW / 2, 210);", to: '' },
    { name: 'the GRAPHICS panel four units down', file: 'src/ui/screens.js', check: 'layout',
      from: 'mPanel(ctx, 40, 42, 400, panelEnd - 42);', to: 'mPanel(ctx, 40, 46, 400, panelEnd - 42);' },
    // Its keyline still beds every letter, so only the on-a-plate check can see this one.
    { name: 'the sound notice on its keyline alone, over the demo', file: 'src/ui/screens.js', check: 'cover',
      from: '  mPlate(ctx, \'panel\', x, at.y + SOUND_TAB.dy, p.w, p.h);', to: '' },
    { name: 'the selected row\'s plate drawn over its label', file: 'src/ui/screens.js', check: 'cover',
      from: "    mText(ctx, on ? 'gold' : 'label', o.label, 50 + 2 * 6, y, 'left');",
      to: "    mText(ctx, on ? 'gold' : 'label', o.label, 50 + 2 * 6, y, 'left');\n    if (on) mSelect(ctx, 44, y - 2, 392, 11, t);" },
    { name: 'a heading back in the old font', file: 'src/ui/screens.js', check: 'layout',
      from: "mLine(ctx, 'gold', 'OPTIONS', VW / 2, 8, 2, 'center');", to: "drawTextOutline(ctx, 'OPTIONS', VW / 2, 8, '#7fdcff', '#000000', 2, 'center');" },
    { name: 'the prompt in crimson on its dark plaque', file: 'src/render/menuskin.js', check: 'prompt',
      from: 'gold: { ramp: OR, face: metal },', to: 'gold: { ramp: GULES, face: enamel },' },
    { name: 'the prompt blinking again', file: 'src/render/menuskin.js', check: 'prompt',
      from: 'export function mPrompt(ctx, x, y, t) {', to: 'export function mPrompt(ctx, x, y, t) {\n  if (Math.sin(t * 4) < -0.3) return;' },
    { name: 'the plates\' field see-through', file: 'src/render/menuskin.js', check: 'cover',
      from: "const FIELD = '#140c13';", to: "const FIELD = '#140c1380';" },
    { name: 'glyphs with no keyline', file: 'src/render/menuskin.js', check: 'cover',
      from: 'const KEY = 2;', to: 'const KEY = 0;' },
    { name: 'the key hints drawn a character at a time again', file: 'src/render/menuskin.js', check: 'once',
      from: '  const a = asset(full, () => {', to: '  if (family) { draw(ctx); return; }\n  const a = asset(full, () => {' },
    { name: 'the cache forgetting what it painted', file: 'src/render/menuskin.js', check: 'once',
      from: 'const a = cache.get(key);\n  if (a) return a;', to: 'const a = null;' },
    // The first cut's key plaque: centred on the width keyLine centres by, six units short.
    { name: 'the key plaque sized by keyLine\'s centring width', file: 'src/ui/screens.js', check: 'centred',
      from: 'return { x: x0, y: KEY_PLATE.y, w: x1 - x0, h: KEY_PLATE.h };',
      to: 'return { x: Math.round(VW / 2 - (x1 - x0 - 8) / 2), y: KEY_PLATE.y, w: x1 - x0 - 8, h: KEY_PLATE.h };' },
    { name: 'the active tab closed at its foot', file: 'src/render/menuskin.js', check: 'centred',
      from: 'const PH = open ? H + OPEN_FOOT : H;', to: 'const PH = H;' },
    { name: 'the demo flashing at a zone arrival again', file: 'src/render/renderer.js', check: 'calm',
      from: 'if (game.flash > 0 && !game.demo) {', to: 'if (game.flash > 0) {' },
    { name: 'the demo shaking behind the menu', file: 'src/render/renderer.js', check: 'calm',
      from: 'const on = (!this.settings || this.settings.shake) && !game.demo;', to: 'const on = !this.settings || this.settings.shake;' },
    { name: 'the demo stepping into a zone and snapping to it', file: 'src/render/renderer.js', check: 'calm',
      from: '    if (!game.demo) {\n      return { theme: game.theme,', to: '    if (true) {\n      return { theme: game.theme,' },
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-mut-'));
  try {
    for (const [i, m] of MUTS.entries()) {
      const dir = path.join(tmp, 'm' + i);
      fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
      const f = path.join(dir, m.file);
      // Line endings as git stores them: a Windows checkout has CRLF, and a mutation's
      // two-line target would not be found in it.
      const src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
      if (!src.includes(m.from)) { fail(`mutation '${m.name}': its target text is gone from ${m.file} -- update the mutation`); continue; }
      fs.writeFileSync(f, src.replace(m.from, m.to));
      const M = await load(dir);
      const errs = m.check === 'calm' ? await checkCalm(dir, true)
        : m.check === 'layout' ? checkLayout(M, true) : m.check === 'centred' ? checkCentred(M, true)
        : m.check === 'prompt' ? checkPrompt(M, two, true)
        : m.check === 'cover' ? checkCover(M, two.slice(0, 1), true) : checkOnce(M, two, true);
      if (errs.length) ok(`caught '${m.name}': ${errs[0]}`);
      else fail(`'${m.name}' went uncaught by the ${m.check} check`);
    }
    // The draw order is read from main.js itself; swapped, it must be caught.
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    // Whatever the call's last arguments are (the sound notice's was !audio.running, and is
    // soundNotice() since the pad got its own words).
    const swapped = main.replace(/(renderer\.draw\(demoGame, alpha, dt\);)([\s\S]*?)(drawMenu\(ctx, all, uiT, dt, true[^;]*\);)/,
      '$3$2$1');
    if (swapped === main) fail('mutation \'the menu drawn before the attract run\': could not find the MENU branch to swap');
    else if (orderErrors(swapped).length) ok(`caught 'the menu drawn before the attract run': ${orderErrors(swapped)[0]}`);
    else fail('\'the menu drawn before the attract run\' went uncaught');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
