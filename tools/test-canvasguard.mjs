// The headless canvas's own fields are the tools', never the game's.
//
//   node tools/test-canvasguard.mjs      a few seconds
//
// tools/headless.mjs keeps things a browser's canvas does not: its pixels in `data` (on the
// canvas, its context and an Image), the context's matrix and size (`m`, `w`, `h`), a
// gradient's stops, helpers like `_box`. Every suite runs on it, so game code that reads one of
// them passes everything and fails in the browser. It happened: the prestige badge measured its
// word off the cached canvas's `data` (1cfebb5); every suite was green, and in Chromium the
// renderer threw a TypeError in every frame the badge was up, so it never drew and the rest of
// each of those frames was skipped (4246569). test-callouts guards that one module. This guards
// the canvas: every such field answers the tools and throws at the game's code, naming the
// field and the line that reached for it.
//
//   1. THE GAME CANNOT READ THEM. A .js module under src/ (written into a temp folder, as a
//      test's mutated copy of src/ is) reads and writes every headless-only field of a canvas,
//      a context, a gradient and an Image: each throws a TypeError naming the field and
//      probe.js's line -- through Reflect.get too, and from a .js at the root of a copy (some
//      suites copy src/'s CONTENTS, so their main.js has no src/ above it).
//   2. THE TOOLS CAN. This file (.mjs), and a scratch .mjs beside the probe, read the same
//      fields and get what they always got.
//   3. THE GAME'S DRAWING NEVER GOES THROUGH THEM. The probe draws with everything the game
//      draws with -- fills, a gradient, images from a canvas and from a PNG, transforms, paths,
//      a composite, getImageData, clearRect, a resize -- and nothing throws, the pixels are
//      right, and not one stack is captured while it draws (the guard's only cost, a stack walk
//      per outside read, would land in every pixel loop otherwise). Checked against a read
//      made on purpose inside the counted window, which the count must see.
//   4. THE BUG THAT STARTED IT. src/ is copied, the badge's placement put back to 1cfebb5's
//      read off its frames' canvases, and the copy's badge drawn: the guard throws, naming
//      canvas.data and wordPlace in callouts.js. The real callouts.js draws the same badge.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const check = (cond, m, detail = '') => (cond ? ok(m) : fail(m + (detail ? `  (${detail})` : '')));

// Every headless-only name, by the object that answers to it. A browser's canvas, context,
// gradient and Image have none of these.
const FIELDS = {
  canvas: ['data', '_w', '_h', '_ctx'],
  context: ['data', 'w', 'h', 'm', 'stack', '_path', '_scratch', '_mul', '_pt', '_box', '_blend',
    '_composite', '_strokeOrFill'],
  gradient: ['x0', 'y0', 'x1', 'y1', 'stops', 'sample'],
  image: ['data', '_src'],
};

// The probe: a game module, by its extension and its place. Line numbers matter below.
const PROBE = [
  '// A game module that reaches for the headless canvas\'s own fields.',
  'export const read = (o, name) => o[name];',
  'export const reflect = (o, name) => Reflect.get(o, name);',
  'export function write(o, name, v) { o[name] = v; }',
  'export function draw(cv, img) {',
  '  const g = cv.getContext(\'2d\');',
  '  g.setTransform(1, 0, 0, 1, 0, 0);',
  '  g.fillStyle = \'#ff0000\';',
  '  g.fillRect(0, 0, 8, 8);',
  '  g.save(); g.translate(8, 0); g.scale(2, 2); g.fillStyle = \'#00ff00\'; g.fillRect(0, 0, 4, 4); g.restore();',
  '  const grad = g.createLinearGradient(0, 8, 0, 16);',
  '  grad.addColorStop(0, \'#000000\'); grad.addColorStop(1, \'#0000ff\');',
  '  g.fillStyle = grad; g.fillRect(0, 8, 16, 8);',
  '  const small = document.createElement(\'canvas\'); small.width = 2; small.height = 2;',
  '  const s = small.getContext(\'2d\'); s.fillStyle = \'#ffffff\'; s.fillRect(0, 0, 2, 2);',
  '  g.globalAlpha = 0.5; g.drawImage(small, 16, 0, 4, 4); g.globalAlpha = 1;',
  '  g.save(); g.translate(24, 4); g.rotate(Math.PI / 2); g.drawImage(small, -2, -2, 4, 4); g.restore();',
  '  g.drawImage(img, 0, 0, 4, 4, 28, 0, 4, 4);',
  '  g.strokeStyle = \'#ffff00\'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 20); g.lineTo(8, 20); g.stroke();',
  '  g.fillStyle = \'#ff00ff\'; g.beginPath(); g.arc(20, 20, 2); g.fill();',
  '  g.globalCompositeOperation = \'destination-out\'; g.fillRect(0, 0, 1, 1); g.globalCompositeOperation = \'source-over\';',
  '  g.clearRect(31, 31, 1, 1);',
  '  const px = g.getImageData(1, 1, 1, 1).data;',
  '  const big = document.createElement(\'canvas\'); big.width = 4; big.height = 4; big.width = 6;',
  '  big.getContext(\'2d\').fillRect(0, 0, 6, 4);',
  '  return [px[0], px[1], px[2], px[3], big.width, big.height];',
  '}',
].join('\n') + '\n';
const LINE = { read: 2, reflect: 3, write: 4 };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duke-canvasguard-'));
const probeFile = path.join(TMP, 'src', 'render', 'probe.js');
fs.mkdirSync(path.dirname(probeFile), { recursive: true });
fs.writeFileSync(probeFile, PROBE);
const rootFile = path.join(TMP, 'copy', 'main.js');   // a copy of src/'s contents: no src/ above
fs.mkdirSync(path.dirname(rootFile), { recursive: true });
fs.writeFileSync(rootFile, PROBE);
const toolFile = path.join(TMP, 'src', 'render', 'scratch.mjs');
fs.writeFileSync(toolFile, PROBE);
const probe = await import(pathToFileURL(probeFile).href);
const rootProbe = await import(pathToFileURL(rootFile).href);
const toolProbe = await import(pathToFileURL(toolFile).href);

function subjects() {
  const canvas = new HeadlessCanvas(4, 3);
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 4);
  gradient.addColorStop(0, '#000000');
  const image = new Image();
  image.src = 'assets/icon.png';
  return { canvas, context, gradient, image };
}
const S = subjects();

/** What `fn` throws, or null. */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

// --- 1. the game cannot read them ----------------------------------------------------------
{
  const missed = [], unnamed = [];
  let n = 0;
  for (const [what, names] of Object.entries(FIELDS)) {
    for (const name of names) {
      const o = S[what];
      for (const [how, fn, file, line] of [
        ['read', () => probe.read(o, name), 'probe.js', LINE.read],
        ['Reflect.get', () => probe.reflect(o, name), 'probe.js', LINE.reflect],
        ['write', () => probe.write(o, name, o[name]), 'probe.js', LINE.write],
        ['read from a copy\'s root', () => rootProbe.read(o, name), 'main.js', LINE.read],
      ]) {
        n++;
        const e = thrown(fn);
        if (!e) { missed.push(`${how} ${what}.${name}`); continue; }
        // The field, and the file and line of the game's code that reached for it.
        if (!(e instanceof TypeError) || !e.message.includes(`${what}.${name} `)
          || !e.message.includes(`${file}:${line}:`)) unnamed.push(`${how} ${what}.${name}: ${e.message.slice(0, 120)}`);
      }
    }
  }
  check(!missed.length, `1. every headless-only field of a canvas, a context, a gradient and an Image throws when game code reaches for it (${n} reads and writes)`,
    missed.slice(0, 4).join('; '));
  check(!unnamed.length, '1. ...with a TypeError that names the field and the line of game code that reached for it',
    unnamed.slice(0, 2).join('; '));
  const e = thrown(() => probe.read(S.canvas, 'data'));
  if (e) console.log(`       e.g. ${e.message.slice(0, 150)}...`);
}

// --- 2. the tools can ----------------------------------------------------------------------
{
  const c = new HeadlessCanvas(5, 2);
  const g = c.getContext('2d');
  g.fillStyle = '#102030';
  g.fillRect(0, 0, 5, 2);
  const errs = [];
  const got = (fn) => { try { return fn(); } catch (e) { errs.push(e.message.slice(0, 80)); return undefined; } };
  const d = got(() => c.data);
  const same = got(() => g.data) === d;
  const gw = got(() => g.w), gh = got(() => g.h), m = got(() => g.m);
  const stops = got(() => S.gradient.stops);
  const img = got(() => S.image.data);
  const scratchRead = got(() => toolProbe.read(c, 'data'));
  check(!errs.length && d instanceof Uint8ClampedArray && d.length === 40 && d[0] === 0x10 && d[3] === 255 && same
    && gw === 5 && gh === 2 && Array.isArray(m) && m[0] === 1 && Array.isArray(stops) && stops.length === 1
    && img instanceof Uint8ClampedArray && img.length === S.image.width * S.image.height * 4 && scratchRead === d,
  '2. the tools (and a scratch .mjs) read them as before: pixels, the context\'s size and matrix, a gradient\'s stops, an Image\'s pixels',
  errs.join('; '));
  // A tool's write goes through as well (a harness pins or swaps a buffer).
  const e = thrown(() => { g.m = [2, 0, 0, 2, 0, 0]; });
  check(!e && g.m[0] === 2, '2. ...and write them', e ? e.message : '');
}

// --- 3. the game's drawing never goes through them -----------------------------------------
{
  const cv = new HeadlessCanvas(32, 32);
  const img = S.image;
  // Every outside read captures a stack; count the captures while the game draws.
  const capture = Error.captureStackTrace;
  let captures = 0, extra = 0;
  Error.captureStackTrace = function (...a) { captures++; return capture.apply(this, a); };
  let e, out, seen;
  try {
    e = thrown(() => { out = probe.draw(cv, img); });
    const before = captures;
    extra = cv.data.length;          // one read on purpose: the count must see it
    seen = captures - before;
  } finally {
    Error.captureStackTrace = capture;
  }
  check(!e, '3. game code draws with all of it -- fills, a gradient, images, transforms, paths, a composite, getImageData, clearRect, a resize -- without a throw',
    e ? e.message.slice(0, 160) : '');
  const d = cv.data, at = (x, y) => Array.from(d.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)).join(',');
  const pixels = {
    fill: at(4, 4) === '255,0,0,255',
    transform: at(15, 7) === '0,255,0,255' && at(16, 8) !== '0,255,0,255',
    gradient: at(2, 15) !== at(2, 8) && d[(15 * 32 + 2) * 4 + 2] > d[(8 * 32 + 2) * 4 + 2],
    halfAlpha: at(17, 1).startsWith('255,255,255,') && Math.abs(d[(1 * 32 + 17) * 4 + 3] - 128) <= 1,
    composite: d[3] === 0,
    getImageData: out && out.slice(0, 4).join(',') === '255,0,0,255',
    resize: out && out[4] === 6 && out[5] === 4,
  };
  const wrong = Object.keys(pixels).filter((k) => !pixels[k]);
  check(!e && !wrong.length, '3. ...and draws them right', `wrong: ${wrong.join(', ')}`);
  check(!e && captures - seen === 0 && seen > 0 && extra === 32 * 32 * 4,
    '3. ...and not one stack is captured while it draws: the pixel loops read the private names, never the guarded ones',
    `${captures - seen} captured in the drawing; ${seen} for the read made on purpose`);
}

// --- 4. the bug that started it ------------------------------------------------------------
{
  const OLD = [
    '  for (const k of shown) {',
    '    const F = e.frames[k], d = F.c.data;',
    '    for (let x = F.w - 1; x >= 0 && x - F.ax > right; x--) {',
    '      let any = false;',
    '      for (let y = 0; y < F.h && !any; y++) if (d[(y * F.w + x) * 4 + 3]) any = true;',
    '      if (any) { right = x - F.ax; break; }',
    '    }',
    '  }',
  ].join('\n');
  const NOW = '  for (const k of shown) right = Math.max(right, e.frames[k].xr - e.frames[k].ax);';
  const copy = path.join(TMP, 'badge', 'src');
  fs.cpSync(path.join(ROOT, 'src'), copy, { recursive: true });
  const file = path.join(copy, 'render', 'callouts.js');
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const hits = src.split(NOW).length - 1;
  // Exactly once, or the mutation silently tests the unmutated code: a refactor of wordPlace
  // fails this suite, and it is updated with it.
  check(hits === 1, '4. the badge\'s placement line is found once in callouts.js, to put the old read back', `found ${hits}`);
  if (hits === 1) {
    fs.writeFileSync(file, src.replace(NOW, OLD));
    const draw = async (base) => {
      const CO = await import(pathToFileURL(path.join(base, 'render', 'callouts.js')).href);
      const { MILESTONES } = await import(pathToFileURL(path.join(base, 'game', 'milestones.js')).href);
      const { CALLOUT_LIFE, SW, SH, PX } = await import(pathToFileURL(path.join(base, 'game', 'constants.js')).href);
      const name = MILESTONES[0].name;
      const cv = new HeadlessCanvas(SW, SH);
      const ctx = cv.getContext('2d');
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      // badgeAt measures the word as the first showing does, so the old read fires there.
      return { name, e: thrown(() => {
        const age = CO.badgeAt(name, 2).after + 0.5;
        if (!CO.drawCalloutBadge(ctx, { shout: name, shoutLap: 2, shoutT: CALLOUT_LIFE - age, state: 'playing' })) {
          throw new Error('the badge did not draw');
        }
      }) };
    };
    const old = await draw(copy);
    const real = await draw(path.join(ROOT, 'src'));
    const m = old.e ? old.e.message : '';
    check(!!old.e && m.includes('canvas.data ') && /callouts\.js:\d+:\d+ \(wordPlace\)/.test(m),
      `4. with 1cfebb5's read put back, placing ${old.name}'s second-lap badge throws, naming canvas.data and wordPlace in callouts.js`,
      m.slice(0, 200) || 'nothing thrown');
    if (old.e) console.log(`       ${m.slice(0, m.indexOf(' reached for it') + 15)}`);
    check(!real.e, `4. the real callouts.js places and draws the same badge`, real.e ? real.e.message.slice(0, 160) : '');
  }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n  ' + (bad === 0
  ? 'RESULT: PASS - the headless canvas\'s own fields answer the tools and throw at the game, and its drawing never pays for the guard.'
  : `RESULT: FAIL - ${bad} problem(s).`));
process.exit(bad ? 1 : 0);
