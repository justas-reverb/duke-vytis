// The platform furniture: every element registered, painted, placed and drawn where it
// belongs.
//
//   node tools/test-decor.mjs
//
// What it holds the furniture to:
//
//   1. REGISTRY. The 23 elements of the sheet the artist drew to, by zone and by name, each
//      with a spec the runtime can use: a box in whole art pixels no wider than the
//      narrowest ledge, an anchor, a lift only if it floats, frames and variants, a frame
//      rate if it animates, something to draw it with. A hanging thing fits the gap under
//      its ledge.
//   2. PAINT. Every variant of every frame of every element paints something, paints the
//      same thing twice, and stays inside its box; the frames of a redrawn element differ
//      from one another. (A placeholder that spills or stands still is only reported: it is
//      today's drawing, and the box is the redraw's.) A Pix reaches a canvas exactly.
//   3. SCENES. Every zone's scene is the same twice for the same floor, and every box it
//      places lies inside the ledge, at every width from 22 units up -- and on the real
//      ledges of the squeeze from floor 2100, down to SQUEEZE_W_MIN. In a crypt, nothing
//      twice, nothing wider than its slot, and the torch only at the far end where no
//      piece is. Nothing at all on a ledge under 22 units, and each zone's share of the
//      rest as it was before the sprites -- both pinned as numbers, not read back.
//   4. IMPORT. tools/import-decor.mjs, on PNGs written to a temporary folder (never
//      assets/decor): accepts the right size in any capitalisation, rejects a wrong size, a
//      blank frame and an opaque background, ignores a name that is no element's -- and the
//      runtime cuts a delivered PNG into the right frame of the right variant.
//   5. DRAWN. A headless render through the renderer's own world transform, at zoom 1 and
//      2 with the camera between pixels: every art pixel lands on whole backing pixels, a
//      'stand' element's bottom row is on the walking surface, a 'hang' element's top row
//      laps one row over the underside the ledge's TILE draws (not its physics thickness:
//      the crypt's stone ends 16 px down, and a manacle hung at 28 px hung from nothing)
//      and is the right way up, a 'float' element floats; the
//      shadow lies in the lip. At the uneven rest zooms, it still stands ON the surface.
//   6. WARM. warmDecor builds every sprite of a zone, the second call builds nothing, and
//      the backdrop warms the next zone's furniture after its layers. Build time per zone
//      is printed.
//
// Every check in 1, 2, 3, 4 and 5b is also run once against something built to fail it -- a
// spec wider than the narrowest ledge, one hanging past the gap under its ledge, one with
// frames and no frame rate, one lifted while it stands, one with nothing to draw it; a
// painter that spills, frames that are all the same, a scene off the end of its ledge, a
// light shaft dimmed whole instead of breathing around a steady core, a light shaft that is
// perfectly steady and still the colour of the backdrop it stands against -- so a check that
// has stopped biting fails here rather than passing quietly. (This line used to leave out 1,
// though the registry's check has failed its own broken specs since the first version, and
// still left it out when 5b was added.)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const { THEMES } = await import('../src/game/themes.js');
const { PX, FLOOR_H, PLAT_THICK, SQUEEZE_W_MIN, SQUEEZE_FROM, PLAY_L, PLAY_R } = await import('../src/game/constants.js');
const { mulberry32 } = await import('../src/core/rng.js');
const { Tower } = await import('../src/game/generator.js');
const { ZONES, painter } = await import('../src/render/decorpaint/index.js');
const { Pix, pixToCanvas } = await import('../src/render/decorpaint/util.js');
const D = await import('../src/render/decor.js');
const { DECOR_FILES } = await import('../src/render/decorart.js');
const { Renderer } = await import('../src/render/renderer.js');
const { Backdrop } = await import('../src/render/backdrop.js');
const { scanDecor, manifest } = await import('./import-decor.mjs');
const { readPNG } = await import('./pngread.mjs');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const note = (m) => console.log('  note ' + m);

// --- 1. the registry ----------------------------------------------------------------
const SHEET = {
  BASEMENT: ['COBWEB', 'DRIP'],
  DUNGEON: ['SLUMPED SKELETON', 'SKULL', 'CROSSED FEMURS', 'OSSUARY STACK', 'REACHING HAND', 'MANACLED WRIST', 'WALL TORCH'],
  FOREST: ['TREE', 'UNDERGROWTH TUFT'],
  SWAMP: ['REED CLUMP', 'CATTAIL'],
  DOWNTOWN: ['LANTERN POST', 'FENCE'],
  CITADEL: ['BANNER'],
  STORM: ['LIGHTNING ROD'],
  ABYSS: ['SKULL', 'BONE'],
  NEBULA: ['CRYSTAL SHARD'],
  COSMOS: ['ORB'],
  STARFIELD: ['CONSTELLATION'],
  ZENITH: ['LIGHT SHAFT'],
};
const GAP = (FLOOR_H - PLAT_THICK) * PX;       // clear height under a ledge, art px
const NARROWEST = SQUEEZE_W_MIN * PX;          // the narrowest ledge, art px
const int = (v) => Number.isInteger(v);

/** Everything wrong with one element's spec, as strings. */
function specProblems(key, e) {
  const p = [];
  if (!e || typeof e !== 'object') return ['not an object'];
  if (typeof e.name !== 'string' || key !== e.name.replace(/ /g, '_')) p.push(`key ${key} is not its name "${e.name}" with _ for spaces`);
  if (!Array.isArray(e.box) || e.box.length !== 2 || !e.box.every((v) => int(v) && v > 0)) p.push(`box ${JSON.stringify(e.box)} is not [w, h] in whole art px`);
  else if (e.box[0] > NARROWEST) p.push(`box ${e.box[0]} wide, wider than the narrowest ledge (${NARROWEST})`);
  if (!['stand', 'hang', 'float'].includes(e.anchor)) p.push(`anchor "${e.anchor}"`);
  if (e.anchor === 'float' ? !(int(e.lift) && e.lift >= 0) : e.lift !== undefined) p.push(`lift ${e.lift} with anchor ${e.anchor}`);
  if (e.anchor === 'hang' && e.box && e.box[1] > GAP) p.push(`hangs ${e.box[1]} px into a ${GAP} px gap`);
  if (!(int(e.frames) && e.frames >= 1)) p.push(`frames ${e.frames}`);
  if (!(int(e.variants) && e.variants >= 1)) p.push(`variants ${e.variants}`);
  if (e.frames > 1 && !(e.fps > 0 && Number.isFinite(e.fps))) p.push(`${e.frames} frames but fps ${e.fps}`);
  if (painter(e) === 'none') p.push('neither paint() nor paintCanvas()');
  if (e.shadow !== undefined && !(Array.isArray(e.shadow) && e.shadow.length === 3 && e.shadow.every(int) && e.shadow[1] > 0 && e.shadow[2] > 0)) {
    p.push(`shadow ${JSON.stringify(e.shadow)} is not [dx, w, h] in art px`);
  }
  for (const hook of ['alpha', 'bob']) if (e[hook] != null && typeof e[hook] !== 'function') p.push(`${hook} is not a function`);
  if (!Array.isArray(e.notes)) p.push('no notes for the artist');
  return p;
}

{
  let n = 0, badHere = 0;
  if (ZONES.length !== THEMES.length || ZONES.some((z, i) => z.name !== THEMES[i].name)) fail('zones are not in theme order');
  for (const z of ZONES) {
    const want = SHEET[z.name] || [];
    const have = Object.values(z.ELEMENTS).map((e) => e.name);
    if (want.join('|') !== have.join('|')) { fail(`${z.name}: elements [${have}], the sheet has [${want}]`); badHere++; }
    if (!(z.CHANCE >= 0 && z.CHANCE <= 1)) { fail(`${z.name}: CHANCE ${z.CHANCE}`); badHere++; }
    if (typeof z.scene !== 'function') { fail(`${z.name}: no scene()`); badHere++; }
    for (const [key, e] of Object.entries(z.ELEMENTS)) {
      n++;
      for (const p of specProblems(key, e)) { fail(`${z.name} ${key}: ${p}`); badHere++; }
    }
  }
  // The check itself, against specs built to fail it.
  const broken = [
    ['WIDE', { name: 'WIDE', box: [NARROWEST + 4, 8], anchor: 'stand', frames: 1, variants: 1, notes: [], paintCanvas() {} }],
    ['LONG', { name: 'LONG', box: [8, GAP + 1], anchor: 'hang', frames: 1, variants: 1, notes: [], paintCanvas() {} }],
    ['SPIN', { name: 'SPIN', box: [8, 8], anchor: 'stand', frames: 3, variants: 1, notes: [], paintCanvas() {} }],
    ['LIFT', { name: 'LIFT', box: [8, 8], anchor: 'stand', lift: 4, frames: 1, variants: 1, notes: [], paintCanvas() {} }],
    ['BARE', { name: 'BARE', box: [8, 8], anchor: 'stand', frames: 1, variants: 1, notes: [] }],
  ];
  const missed = broken.filter(([k, e]) => !specProblems(k, e).length).map(([k]) => k);
  if (missed.length) fail(`the spec check passed specs built to fail it: ${missed.join(', ')}`);
  if (!badHere) ok(`${n} elements registered in ${ZONES.length} zones, as on the sheet, each with a usable spec`);
}

// --- 2. every cell paints -----------------------------------------------------------
const M = 8;   // margin round a placeholder's box, to catch what it draws outside

/** One cell's pixels, painted from scratch: { data (box-sized RGBA), spill }. */
function paintCell(e, v, f, th) {
  const [w, h] = e.box;
  if (painter(e) === 'paint') {
    const p = new Pix(w, h);
    e.paint(p, v, f, th);
    return { data: p.data, spill: p.spill };
  }
  const c = new HeadlessCanvas(w + 2 * M, h + 2 * M);
  const g = c.getContext('2d');
  g.translate(M, M);
  e.paintCanvas(g, v, f, th);
  const data = new Uint8ClampedArray(w * h * 4);
  let spill = 0;
  for (let y = 0; y < h + 2 * M; y++) {
    for (let x = 0; x < w + 2 * M; x++) {
      const i = (y * c.width + x) * 4;
      const inBox = x >= M && y >= M && x < w + M && y < h + M;
      if (inBox) data.set(c.data.subarray(i, i + 4), ((y - M) * w + (x - M)) * 4);
      else if (c.data[i + 3]) spill++;
    }
  }
  return { data, spill };
}

/** A delivered PNG's cell, if the manifest lists one. */
function pngCell(file, e, v, f) {
  const img = readPNG(file);
  const [w, h] = e.box;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((v * h + y) * img.w + f * w + x) * img.ch;
      const px = img.ch === 4 ? [img.data[s], img.data[s + 1], img.data[s + 2], img.data[s + 3]]
        : img.ch === 3 ? [img.data[s], img.data[s + 1], img.data[s + 2], 255] : [img.data[s], img.data[s], img.data[s], 255];
      data.set(px, (y * w + x) * 4);
    }
  }
  return { data, spill: 0 };
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const empty = (d) => { for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; };

/** Everything wrong with one element's cells: { fails: [], notes: [] }. */
function cellProblems(zone, key, e, th) {
  const fails = [], notes = [];
  const file = DECOR_FILES[zone] && DECOR_FILES[zone][key];
  const source = file ? 'png' : painter(e);
  const strict = source !== 'placeholder';
  for (let v = 0; v < e.variants; v++) {
    const frames = [];
    for (let f = 0; f < e.frames; f++) {
      let a, b;
      try {
        a = file ? pngCell(file, e, v, f) : paintCell(e, v, f, th);
        b = file ? pngCell(file, e, v, f) : paintCell(e, v, f, th);
      } catch (err) { fails.push(`variant ${v} frame ${f} threw ${err.message}`); continue; }
      if (empty(a.data)) fails.push(`variant ${v} frame ${f} paints nothing`);
      if (!same(a.data, b.data)) fails.push(`variant ${v} frame ${f} paints differently each time`);
      if (a.spill) (strict ? fails : notes).push(`variant ${v} frame ${f} draws ${a.spill} px outside its box`);
      frames.push(a.data);
    }
    if (e.frames > 1 && frames.length === e.frames) {
      const still = frames.every((d) => same(d, frames[0]));
      const repeat = frames.findIndex((d, f) => f > 0 && same(d, frames[f - 1]));
      if (strict && repeat > 0) fails.push(`variant ${v}: frame ${repeat} is the same as frame ${repeat - 1}`);
      else if (!strict && still && v === 0) notes.push(`its ${e.frames} frames are all the same (today's drawing never moved)`);
    }
  }
  return { fails, notes, source };
}

{
  let cells = 0, badHere = 0;
  const placeholderNotes = [];
  const sources = { png: 0, paint: 0, placeholder: 0 };
  for (const [i, z] of ZONES.entries()) {
    for (const [key, e] of Object.entries(z.ELEMENTS)) {
      const { fails, notes, source } = cellProblems(z.name, key, e, THEMES[i]);
      sources[source] = (sources[source] || 0) + 1;
      cells += e.variants * e.frames;
      for (const f of fails) { fail(`${z.name} ${e.name}: ${f}`); badHere++; }
      for (const n of notes) placeholderNotes.push(`${z.name} ${e.name} placeholder: ${n}`);
    }
  }
  // The checks themselves, against painters built to fail them.
  const th = THEMES[0];
  const mk = (paint, extra = {}) => ({ name: 'X', box: [6, 6], anchor: 'stand', frames: 2, variants: 1, fps: 2, notes: [], paint, ...extra });
  let calls = 0;
  const controls = [
    ['spills', /outside its box/, mk((p, v, f) => { p.rect(0, 0, 3, 3, f ? '#ffffff' : '#eeeeee'); p.set(-1, 0, '#ffffff'); })],
    ['stands still', /frame 1 is the same as frame 0/, mk((p) => p.rect(1, 1, 3, 3, '#ffffff'))],
    ['changes every time', /differently each time/, mk((p, v, f) => { p.rect(0, 0, 3, 3, f ? '#ffffff' : '#eeeeee'); p.set(4, 4, [calls++ % 250, 0, 0, 255]); })],
    ['paints nothing', /paints nothing/, mk(() => {})],
  ];
  const missed = controls.filter(([, why, e]) => !cellProblems('TEST', 'X', e, th).fails.some((m) => why.test(m))).map(([n]) => n);
  if (missed.length) fail(`the paint checks passed a painter that ${missed.join(', ')}`);
  if (!badHere) {
    ok(`${cells} cells of ${Object.values(sources).reduce((a, b) => a + b, 0)} elements paint, deterministically ` +
      `(${sources.png || 0} from PNGs, ${sources.paint || 0} redrawn, ${sources.placeholder || 0} placeholders)`);
  }
  for (const n of placeholderNotes) note(n);

  // A Pix reaches a canvas exactly, translucency included, through fillRect runs -- the
  // one path from paint() to the screen.
  const p = new Pix(13, 7);
  const r = mulberry32(7);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 13; x++) {
      if (r() < 0.25) continue;
      const c = [Math.floor(r() * 4) * 80, Math.floor(r() * 4) * 80, Math.floor(r() * 4) * 80];
      p.set(x, y, c.concat(r() < 0.5 ? 255 : 1 + Math.floor(r() * 254)));
    }
  }
  const cv = new HeadlessCanvas(13, 7);
  pixToCanvas(p, cv.getContext('2d'));
  if (!same(cv.data, p.data)) fail('a Pix drawn onto a canvas does not come out pixel for pixel');
  else ok('a Pix reaches a canvas exactly, translucent pixels included');
}

// --- 3. scenes ----------------------------------------------------------------------

/** Everything wrong with one scene on a ledge wArt wide. */
function sceneProblems(z, items, wArt, crypt) {
  const p = [];
  if (!Array.isArray(items)) return ['is not a list'];
  const seen = new Set();
  for (const it of items) {
    const e = z.ELEMENTS[it.key];
    if (!e) { p.push(`places "${it.key}", no such element`); continue; }
    if (!(int(it.variant) && it.variant >= 0 && it.variant < e.variants)) p.push(`${it.key} variant ${it.variant} of ${e.variants}`);
    if (!int(it.x)) p.push(`${it.key} at x = ${it.x}, not a whole art pixel`);
    if (it.x < 0 || it.x + e.box[0] > Math.floor(wArt)) p.push(`${it.key} at ${it.x}..${it.x + e.box[0]} on a ledge ${wArt} wide`);
    if (crypt && it.key !== 'WALL_TORCH') {
      if (seen.has(it.key)) p.push(`${it.key} twice on one ledge`);
      seen.add(it.key);
    }
  }
  if (crypt) p.push(...cryptProblems(z, items, wArt));
  return p;
}

/**
 * The crypt's two placement rules besides "nothing twice", as the old cryptScene had them.
 * NOTHING WIDER THAN ITS SLOT: the ledge less 16 art px at each end, shared between one,
 * two or three slots (from 46 and 70 units), and no piece more than a unit wider than its
 * share -- the old `c[2] <= span + 1`. No box today is wide enough for this to bite, which
 * is exactly why it is checked: a redrawn skeleton that grows is the case it exists for.
 * THE TORCH ONLY WHERE THE SPACE IS FREE: at the far end, and only if no piece reaches
 * within 32 art px of it -- the old `right < x + w - 8`.
 */
function cryptProblems(z, items, wArt) {
  const p = [];
  const slots = wArt >= 70 * PX ? 3 : wArt >= 46 * PX ? 2 : 1;
  const span = (wArt - 32) / slots;
  const pieces = items.filter((it) => it.key !== 'WALL_TORCH' && z.ELEMENTS[it.key]);
  if (pieces.length > slots) p.push(`${pieces.length} pieces in ${slots} slot${slots > 1 ? 's' : ''}`);
  for (const it of pieces) {
    const bw = z.ELEMENTS[it.key].box[0];
    if (bw > span + PX) p.push(`${it.key} ${bw} px wide in a ${span.toFixed(1)} px slot`);
  }
  const torch = items.find((it) => it.key === 'WALL_TORCH');
  if (torch && z.ELEMENTS.WALL_TORCH) {
    if (torch.x + z.ELEMENTS.WALL_TORCH.box[0] < wArt - 16) p.push(`WALL_TORCH at ${torch.x}, not at the far end of ${wArt}`);
    const right = Math.max(0, ...pieces.map((it) => it.x + z.ELEMENTS[it.key].box[0]));
    if (right >= wArt - 32) p.push(`WALL_TORCH where a piece already reaches ${right} of ${wArt}`);
  }
  return p;
}

{
  let scenes = 0, pieces = 0, badHere = 0;
  const report = (m) => { if (badHere < 12) fail(m); badHere++; };
  const widths = [];
  for (let w = 22; w <= 270; w++) widths.push(w, w + 0.37);
  for (const [i, z] of ZONES.entries()) {
    const th = THEMES[i];
    for (const w of widths) {
      for (let n = 1; n <= 60; n++) {
        const seed = ((n * 7919 + Math.round(w * 100)) * 2654435761) >>> 0;
        const wArt = Math.floor(w * PX);
        const a = z.scene(mulberry32(seed), wArt, th);
        scenes++;
        pieces += a.length;
        for (const p of sceneProblems(z, a, wArt, z.name === 'DUNGEON')) report(`${z.name} w=${w}: ${p}`);
        if (n % 6 === 0 && JSON.stringify(z.scene(mulberry32(seed), wArt, th)) !== JSON.stringify(a)) {
          report(`${z.name} w=${w}: a different scene from the same stream`);
        }
      }
    }
  }

  // The real squeeze: every ledge from SQUEEZE_FROM up the next 600 floors of two towers,
  // through the game's own decision (width, chance) and each zone's scene, as drawn there.
  let squeezed = 0, narrow = 0;
  for (const [seed, open] of [[1234, false], [98765, true]]) {
    const t = new Tower(seed, false);
    if (open) t.setBounds(PLAY_L, PLAY_R);
    t.ensure(SQUEEZE_FROM + 600);
    for (let n = SQUEEZE_FROM; n <= SQUEEZE_FROM + 600; n++) {
      const pl = t.floors.get(n);
      if (!pl || pl.w < D.DECOR_MIN_W) continue;
      if (pl.w <= SQUEEZE_W_MIN) narrow++;
      for (const [i, z] of ZONES.entries()) {
        const r = mulberry32((pl.n * 2654435761) >>> 0);
        r();
        const wArt = Math.floor(pl.w * PX);
        for (const p of sceneProblems(z, z.scene(r, wArt, THEMES[i]), wArt, z.name === 'DUNGEON')) report(`${z.name} floor ${n} (w ${pl.w}): ${p}`);
        squeezed++;
      }
    }
  }
  if (!narrow) report(`no ledge at SQUEEZE_W_MIN (${SQUEEZE_W_MIN}) among the squeezed floors -- the check did not reach the narrow ones`);

  // The checks themselves, against scenes built to fail them.
  const crypt = ZONES.find((z) => z.name === 'DUNGEON');
  const controls = [
    ['off the right end', [{ key: 'SKULL', variant: 0, x: 90 - 19 }], 90],
    ['off the left end', [{ key: 'SKULL', variant: 0, x: -1 }], 90],
    ['repeats a piece', [{ key: 'SKULL', variant: 0, x: 0 }, { key: 'SKULL', variant: 1, x: 40 }], 200],
    ['a variant too many', [{ key: 'SKULL', variant: 2, x: 0 }], 90],
    ['half a pixel', [{ key: 'SKULL', variant: 0, x: 0.5 }], 90],
    ['a torch beside a piece at the far end', [{ key: 'SKULL', variant: 0, x: 150 }, { key: 'WALL_TORCH', variant: 0, x: 176 }], 200],
    ['a torch away from the far end', [{ key: 'WALL_TORCH', variant: 0, x: 40 }], 200],
    ['four pieces on a three-slot ledge', ['SKULL', 'REACHING_HAND', 'CROSSED_FEMURS', 'OSSUARY_STACK'].map((key, k) => ({ key, variant: 0, x: 16 + 70 * k })), 300],
  ];
  const missed = controls.filter(([, items, w]) => !sceneProblems(crypt, items, w, true).length).map(([n]) => n);
  // A piece wider than its slot needs a box no piece has yet: a skeleton grown to 80 px, on
  // a ledge of 22 units whose one slot is 56.
  const grown = { ...crypt, ELEMENTS: { ...crypt.ELEMENTS, SLUMPED_SKELETON: { ...crypt.ELEMENTS.SLUMPED_SKELETON, box: [80, 52] } } };
  if (!sceneProblems(grown, [{ key: 'SLUMPED_SKELETON', variant: 0, x: 0 }], 88, true).length) missed.push('wider than its slot');
  if (missed.length) report(`the scene checks passed a scene that is ${missed.join(', ')}`);

  // The two rules the port was told to keep, as the NUMBERS they were before the furniture
  // became sprites: nothing on a ledge under 22 units, and each zone's share of the rest.
  // Literals on purpose. Everything else here reads DECOR_MIN_W and chanceFor(), so it would
  // follow a changed rule rather than catch it -- changing one is a decision, and this is
  // where it has to be made on purpose.
  const KEPT_MIN_W = 22;
  const KEPT_CHANCE = { BASEMENT: 0.28, DUNGEON: 0.42, FOREST: 0.72, SWAMP: 0.55, DOWNTOWN: 0.32, CITADEL: 0.28,
    STORM: 0.22, ABYSS: 0.20, NEBULA: 0.34, COSMOS: 0.26, STARFIELD: 0.26, ZENITH: 0.24 };
  if (D.DECOR_MIN_W !== KEPT_MIN_W) report(`DECOR_MIN_W is ${D.DECOR_MIN_W}, the rule is ${KEPT_MIN_W} units`);
  for (const [i, z] of ZONES.entries()) {
    if (D.chanceFor(i) !== KEPT_CHANCE[z.name]) report(`${z.name} furnishes ${D.chanceFor(i)} of its ledges, the rule is ${KEPT_CHANCE[z.name]}`);
  }

  // Under 22 units, nothing; at 22, some; over it, the zone's chance. Counted as drawImage calls.
  const counter = { n: 0, save() {}, restore() {}, scale() {}, fillRect() {}, drawImage() { this.n++; } };
  for (let n = 0; n < 400; n++) D.drawDecor(counter, { n, x: 10, y: 30, w: KEPT_MIN_W - 0.01 }, 1, THEMES[1], 0);
  if (counter.n) report(`${counter.n} sprites drawn on ledges just under ${KEPT_MIN_W} units wide`);
  for (let n = 0; n < 400; n++) D.drawDecor(counter, { n, x: 10, y: 30, w: KEPT_MIN_W }, 1, THEMES[1], 0);
  if (!counter.n) report(`nothing drawn on 400 ledges exactly ${KEPT_MIN_W} units wide`);
  counter.n = 0;
  let carried = 0;
  for (let n = 0; n < 2000; n++) { const before = counter.n; D.drawDecor(counter, { n, x: 10, y: 30, w: 80 }, 1, THEMES[1], 0); if (counter.n > before) carried++; }
  const share = carried / 2000;
  if (Math.abs(share - D.chanceFor(1)) > 0.04) report(`DUNGEON furnished ${(share * 100).toFixed(1)}% of ledges, its CHANCE is ${D.chanceFor(1) * 100}%`);

  if (!badHere) {
    ok(`${scenes} scenes (${pieces} pieces) at every width 22-270 units, and ${squeezed} on real squeezed ledges ` +
      `(${narrow} at ${SQUEEZE_W_MIN}): deterministic, inside the ledge; in a crypt nothing twice, nothing wider ` +
      'than its slot, the torch only in free space at the far end');
    ok(`nothing under ${KEPT_MIN_W} units and every zone's chance as it was; DUNGEON furnishes ` +
      `${(share * 100).toFixed(1)}% of ledges for a CHANCE of ${D.chanceFor(1) * 100}%`);
  } else if (badHere > 12) console.log(`  ...and ${badHere - 12} more scene problems`);
  bad += Math.max(0, badHere - Math.min(badHere, 12));
}

// --- 4. the importer ----------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'decor-import-'));
  let badHere = 0;
  const f = (m) => { fail(m); badHere++; };
  try {
    const byName = (zone, name) => Object.values(ZONES.find((z) => z.name === zone).ELEMENTS).find((e) => e.name === name);
    // A sheet for element e: each cell its own colour (so a cell cut from the wrong place
    // is caught), transparent in its top-left corner. `fill` overrides a cell's colour; null
    // leaves it empty.
    const colourOf = (v, f) => [40 + 50 * f, 40 + 60 * v, 200, 255];
    const sheet = (e, { w, h, fill, opaque } = {}) => {
      const [bw, bh] = e.box;
      const c = new HeadlessCanvas(w || bw * e.frames, h || bh * e.variants);
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const v = Math.floor(y / bh), fr = Math.floor(x / bw);
          const col = fill ? fill(v, fr) : colourOf(v, fr);
          if (!col) continue;
          if (!opaque && x % bw === 0 && y % bh === 0) continue;
          c.data.set(col, (y * c.width + x) * 4);
        }
      }
      return encodePNG(c);
    };
    const reed = byName('SWAMP', 'REED CLUMP');
    fs.writeFileSync(path.join(tmp, 'SWAMP-REED-CLUMP.png'), sheet(reed));
    fs.writeFileSync(path.join(tmp, 'dungeon-wall-torch.png'), sheet(byName('DUNGEON', 'WALL TORCH')));
    fs.writeFileSync(path.join(tmp, 'FOREST-TREE.png'), sheet(byName('FOREST', 'TREE'), { w: 60, h: 136 }));
    fs.writeFileSync(path.join(tmp, 'DOWNTOWN-FENCE.png'), sheet(byName('DOWNTOWN', 'FENCE'), { opaque: true }));
    fs.writeFileSync(path.join(tmp, 'NEBULA-CRYSTAL-SHARD.png'), sheet(byName('NEBULA', 'CRYSTAL SHARD'), { fill: (v, fr) => (v === 1 && fr === 1 ? null : colourOf(v, fr)) }));
    fs.writeFileSync(path.join(tmp, 'DUNGEON-DRAGON.png'), sheet(reed));

    const { found, problems, stray } = await scanDecor(tmp);
    const has = (zone, key) => !!(found[zone] && found[zone][key]);
    if (!has('SWAMP', 'REED_CLUMP')) f('import-decor rejected a right-size SWAMP-REED-CLUMP.png');
    if (!has('DUNGEON', 'WALL_TORCH')) f('import-decor rejected a right-size dungeon-wall-torch.png (lower case)');
    if (has('FOREST', 'TREE') || !problems.some((p) => /FOREST-TREE.*60x136, must be 60x408/.test(p))) f('import-decor accepted a FOREST-TREE.png of one variant\'s height');
    if (has('DOWNTOWN', 'FENCE') || !problems.some((p) => /DOWNTOWN-FENCE.*transparent/.test(p))) f('import-decor accepted a DOWNTOWN-FENCE.png with no transparency');
    if (has('NEBULA', 'CRYSTAL_SHARD') || !problems.some((p) => /CRYSTAL-SHARD.*variant 2 frame 2/.test(p))) f('import-decor accepted a CRYSTAL-SHARD.png with a blank frame');
    if (!stray.includes('DUNGEON-DRAGON.png')) f('import-decor did not report DUNGEON-DRAGON.png as no element\'s');
    const src = manifest(found);
    if (!/export const DECOR_FILES = \{/.test(src) || !/REED_CLUMP: '/.test(src) || /TREE:/.test(src)) f('the emitted manifest does not list exactly what passed');

    // The runtime cuts a delivered sheet the way the importer checked it: frame f of
    // variant v is the cell f across and v down.
    const files = { SWAMP: { REED_CLUMP: found.SWAMP && found.SWAMP.REED_CLUMP } };
    let wrongCell = null;
    for (let v = 0; v < reed.variants && !wrongCell; v++) {
      for (let fr = 0; fr < reed.frames && !wrongCell; fr++) {
        const c = D.buildCell('SWAMP', 'REED_CLUMP', reed, v, fr, THEMES[3], files);
        if (c.source !== 'png') { wrongCell = `variant ${v} frame ${fr} came from ${c.source}, not the PNG`; break; }
        const out = new HeadlessCanvas(reed.box[0], reed.box[1]);
        out.getContext('2d').drawImage(c.img, c.sx, c.sy, reed.box[0], reed.box[1], 0, 0, reed.box[0], reed.box[1]);
        const got = Array.from(out.data.subarray((2 * out.width + 3) * 4, (2 * out.width + 3) * 4 + 4));
        if (got.join() !== colourOf(v, fr).join()) wrongCell = `variant ${v} frame ${fr} shows [${got}], want [${colourOf(v, fr)}]`;
      }
    }
    if (wrongCell) f(`the runtime cut the PNG wrong: ${wrongCell}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // What the game actually lists must exist and pass today.
  for (const [zone, e] of Object.entries(DECOR_FILES)) {
    for (const [key, file] of Object.entries(e)) if (!fs.existsSync(file)) f(`decorart.js lists ${zone} ${key} at ${file}, which is not there`);
  }
  if (!badHere) {
    ok(`import-decor takes a right-size PNG in any case and turns away a wrong size, an opaque one, a blank frame and a stray; ` +
      `the runtime cuts frame and variant from it; ${Object.values(DECOR_FILES).reduce((a, e) => a + Object.keys(e).length, 0)} listed in decorart.js`);
  }
}

// --- 5. drawn through the world transform --------------------------------------------
{
  let badHere = 0;
  const f = (m) => { fail(m); badHere++; };
  // Three elements whose every art pixel says where it came from: rows top to bottom,
  // columns left to right, all distinct colours, so a pixel on the screen names the art
  // pixel it shows -- and a flipped, shifted or resampled sprite cannot pass.
  const W = 5, H = 4;
  const artColour = (tag, x, y) => [tag, 20 + x * 40, 20 + y * 50, 255];
  const mk = (tag, anchor, extra = {}) => ({
    name: 'T', box: [W, H], anchor, frames: 1, variants: 1, notes: [], ...extra,
    paint(p) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, artColour(tag, x, y)); },
  });
  const zone = {
    name: 'TESTDRAW',
    ELEMENTS: {
      STAND: mk(60, 'stand', { shadow: [-2, W + 3, 3] }),
      HANG: mk(120, 'hang'),
      FLOAT: mk(180, 'float', { lift: 9 }),
    },
  };
  const th = THEMES[1];
  // The drawn underside of this theme's tile, worked out here from the tile art rather
  // than asked of decor.js: per column of the repeating tile, the solid rows going down
  // from the surface before the first gap; the median. The crypt's is 16, not 28.
  const UNDER = await (async () => {
    const P = await import('../src/render/platart.js');
    const rows = P.ZONES[th.name].tile, runs = [];
    for (let x = 0; x < rows[0].length; x++) {
      let y = P.HEAD;
      while (y < rows.length && rows[y][x] !== '.') y++;
      runs.push(y - P.HEAD);
    }
    return runs.sort((a, b) => a - b)[runs.length >> 1];
  })();
  if (UNDER === PLAT_THICK * PX) f(`${th.name}'s tile is solid to PLAT_THICK, so this cannot tell the drawn underside from the physics one -- pick a theme whose stone ends higher`);
  const shadowColour = (() => { const n = parseInt(th.platTop.slice(1), 16); return [((n >> 16) & 255) * 0.5, ((n >> 8) & 255) * 0.5, (n & 255) * 0.5].map(Math.round); })();
  const pl = { x: 181, y: 1030, w: 60, n: 0 };   // in view at every zoom, 1 to 2

  for (const zoom of [1, 2, 1.75, 1.5, 1.25]) {
    const k = zoom * PX;
    for (const [key, e] of Object.entries(zone.ELEMENTS)) {
      const canvas = new HeadlessCanvas(1920, 1080);
      const g = canvas.getContext('2d');
      const game = { zoom, zoomView: zoom, camY: pl.y - 70 / zoom + 0.37 };
      // setWorldTransform places the world by the renderer's interpolated camera (this.cam)
      // since the fall's camera was interpolated; called on the bare prototype it read
      // undefined and put the world at y = NaN. A stand-in holding the game's camera is what
      // the renderer holds between steps.
      Renderer.prototype.setWorldTransform.call({ cam: game.camY }, g, game);
      const [, , , , tx, ty] = g.m;
      if (!int(tx) || !int(ty)) { f(`zoom ${zoom}: the world transform is not on whole pixels (${tx}, ${ty})`); continue; }
      const ax = 7;   // an odd number of art pixels in: not a whole world unit
      D.drawScene(g, pl, zone, [{ key, variant: 0, x: ax }], th, 0);
      const cd = canvas.data;   // once: every read of it is a stack walk (headless.mjs)

      // By hand, from the definitions: the ledge's left end and surface in device pixels,
      // one art pixel = k / PX device pixels, y down on the screen.
      const S = ty - k * pl.y;                       // the surface line
      const X0 = tx + k * pl.x + ax * zoom;           // the box's left edge
      const bottom = key === 'STAND' ? S : key === 'FLOAT' ? S - 9 * zoom : S + (UNDER - 1) * zoom + H * zoom;
      const top = bottom - H * zoom;
      const tag = e === zone.ELEMENTS.STAND ? 60 : e === zone.ELEMENTS.HANG ? 120 : 180;

      // Where the element's pixels actually are.
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, mixed = 0;
      for (let y = 0; y < 1080; y++) {
        for (let x = 0; x < 1920; x++) {
          const i = (y * 1920 + x) * 4;
          if (!cd[i + 3] || cd[i] !== tag) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (zoom === 1 || zoom === 2) {
            const want = artColour(tag, Math.floor((x - X0) / zoom), Math.floor((y - top) / zoom));
            if (Array.from(cd.subarray(i, i + 4)).join() !== want.join()) mixed++;
          }
        }
      }
      const name = `${key.toLowerCase()} at zoom ${zoom}`;
      if (!Number.isFinite(x0)) { f(`${name}: nothing drawn`); continue; }
      if (zoom === 1 || zoom === 2) {
        // Whole art pixels: exactly the box, each art pixel exactly zoom x zoom backing pixels.
        if (x0 !== X0 || x1 !== X0 + W * zoom - 1 || y0 !== top || y1 !== bottom - 1) {
          f(`${name}: drawn at ${x0}..${x1} x ${y0}..${y1}, want ${X0}..${X0 + W * zoom - 1} x ${top}..${bottom - 1}`);
        } else if (mixed) f(`${name}: ${mixed} backing pixels show the wrong art pixel (flipped, shifted or resampled)`);
      } else if (key === 'STAND' && y1 !== Math.round(S) - 1) {
        // The uneven zooms resample the art, as they do every tile; the sprite must still
        // stand ON the surface, not float above it or sink into it.
        f(`${name}: bottom row at ${y1}, the surface row above ${S} is ${Math.round(S) - 1}`);
      }
      // Right way up at every zoom: the art's top row (y = 0) is the highest on the screen.
      const at = (y) => { for (let x = x0; x <= x1; x++) { const i = (y * 1920 + x) * 4; if (cd[i] === tag && cd[i + 3]) return cd[i + 2]; } return -1; };
      if (at(y0) !== artColour(tag, 0, 0)[2] || at(y1) !== artColour(tag, 0, H - 1)[2]) f(`${name}: upside down (top row shows art row ${(at(y0) - 20) / 50})`);

      if (key === 'STAND' && (zoom === 1 || zoom === 2)) {
        // The shadow: in the lip, from 2 art px left of the box, 3 art px deep, under the surface.
        let sx0 = Infinity, sx1 = -1, sy0 = Infinity, sy1 = -1;
        for (let y = 0; y < 1080; y++) {
          for (let x = 0; x < 1920; x++) {
            const i = (y * 1920 + x) * 4;
            if (cd[i + 3] && cd[i] === shadowColour[0] && cd[i + 1] === shadowColour[1] && cd[i + 2] === shadowColour[2]) {
              if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y;
            }
          }
        }
        const want = [X0 - 2 * zoom, X0 + (W + 1) * zoom - 1, S, S + 3 * zoom - 1];
        if ([sx0, sx1, sy0, sy1].join() !== want.join()) f(`${name}: shadow at ${sx0}..${sx1} x ${sy0}..${sy1}, want ${want[0]}..${want[1]} x ${want[2]}..${want[3]}`);
      }
    }
  }
  if (!badHere) {
    ok('drawn through the world transform with the camera between pixels: at zoom 1 and 2 every art pixel is exactly ' +
      'one / a 2x2 of backing pixels, standing on the surface, hanging right way up from the underside, floating ' +
      'at its lift, shadow in the lip; at 1.75, 1.5 and 1.25 still standing on the surface');
  }
}

// --- 5b. moving: frames, breath and bob --------------------------------------------------
//
// Recorded rather than rendered: a context that notes which sprite each drawImage drew, at
// what alpha and how high. The torch must step through all four of its frames, a quarter
// of the time each, and two torches a unit apart must not flicker in step; the light shaft
// must breathe in its frames, with the core the same in every one of them; the orb must
// bob by whole units, as it always did.
//
// THE SHAFT'S CHECK USED TO PIN THE DEFECT. It required the sprite's opacity to follow an
// alpha() hook and to swing by at least half -- and a swing of the WHOLE sprite's opacity
// is exactly what was wrong with it. One opacity dims the bright core along with the glow,
// and a real ZENITH frame at zoom 1 showed two of the three shafts on screen as warm-grey
// columns standing among the backdrop's own pale light columns. The element breathes in
// frames now, with the core painted identically in each, so the hook is gone; what follows
// pins what the shaft DOES -- a steady core, WARM against this zone's own sky, a glow and a
// pool that move around it, every frame shown, and never a dimmed sprite -- and is itself run
// against five mutations of the real element, one of them the old whole-sprite pulse, so it
// cannot pass them quietly. The warmth is pinned because steadiness alone is not the fix: the
// complaint was a warm-grey ghost standing among pale columns, and a cold repaint of this
// very drawing is perfectly steady and still that column.
{
  let badHere = 0;
  const f = (m) => { fail(m); badHere++; };
  const rec = { calls: [], globalAlpha: 1, save() {}, restore() {}, scale() {}, fillRect() {},
    drawImage(img, sx, sy, sw, sh, dx, dy) { this.calls.push({ img, dy, a: this.globalAlpha }); } };
  const draw = (zoneName, key, x, t) => {
    const i = ZONES.findIndex((z) => z.name === zoneName);
    rec.calls.length = 0;
    D.drawScene(rec, { x: 40, y: 300, w: 60, n: 0 }, ZONES[i], [{ key, variant: 0, x }], THEMES[i], t);
    return rec.calls[0];
  };
  const torch = ZONES[1].ELEMENTS.WALL_TORCH;
  const frameOf = new Map();
  for (let fr = 0; fr < torch.frames; fr++) frameOf.set(D.spriteFor('DUNGEON', 'WALL_TORCH', 0, fr, THEMES[1]).img, fr);
  const period = torch.frames / torch.fps, N = 400;
  const seen = new Array(torch.frames).fill(0);
  let inStep = 0;
  for (let s = 0; s < N; s++) {
    const t = (s / N) * period;
    const a = frameOf.get(draw('DUNGEON', 'WALL_TORCH', 10, t).img);
    const b = frameOf.get(draw('DUNGEON', 'WALL_TORCH', 14, t).img);
    if (a === undefined) { f('the torch drew a sprite that is none of its frames'); break; }
    seen[a]++;
    if (a === b) inStep++;
  }
  if (seen.some((n) => Math.abs(n / N - 1 / torch.frames) > 0.02)) f(`the torch's frames over one cycle: ${seen.map((n) => `${(100 * n / N).toFixed(0)}%`).join(' ')}`);
  if (inStep === N) f('two torches a unit apart flicker in step');

  const shaft = ZONES[11].ELEMENTS.LIGHT_SHAFT;
  const SHAFT_CORE = 3;      // the core's half width in art px: zenith.js CORE_W
  const SHAFT_POOL = 8;      // and the rows at the foot the pool spills across, core included
  // How much warmer than its own sky the core has to come out, in R minus B, once it is
  // laid over that sky. See breathProblems: the gold core measures +107 and a cold repaint
  // of the identical drawing +33, so this sits between them with room on both sides.
  const SHAFT_WARM = 60;

  /**
   * Everything wrong with a light shaft's breath, as strings, from its painted cells: the
   * core the same in every frame, opaque, WARM against its own sky, and the glow and the
   * pool moving together around it. The core is read down to where the pool begins -- the
   * pool is spilt glow, it washes across the core columns too, and it is MEANT to move.
   */
  function breathProblems(e, th) {
    const out = [];
    const [w, h] = e.box;
    const poolTop = h - SHAFT_POOL;
    const isCore = (x) => Math.abs(x + 0.5 - w / 2) <= SHAFT_CORE;
    // The sky's two stops as [r, g, b], for compositing the core over them below.
    const skies = (th.sky || []).map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    if (e.alpha) out.push('has an alpha() hook again, which would scale its core with its glow');
    if (!(e.frames >= 4)) out.push(`${e.frames} frames is not a breath`);
    for (let v = 0; v < e.variants; v++) {
      const cells = [];
      for (let fr = 0; fr < e.frames; fr++) { const q = new Pix(w, h); e.paint(q, v, fr, th); cells.push(q); }
      const mean = (q, pick) => {
        let s = 0, n = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (!pick(x, y)) continue;
            s += q.data[(y * w + x) * 4 + 3] / 255; n++;
          }
        }
        return s / n;
      };
      let moved = 0;
      for (const q of cells) {
        for (let y = 0; y < poolTop; y++) {
          for (let x = 0; x < w; x++) {
            if (!isCore(x)) continue;
            const i = (y * w + x) * 4;
            for (let c = 0; c < 4; c++) if (q.data[i + c] !== cells[0].data[i + c]) { moved++; break; }
          }
        }
      }
      // AND IT HAS TO BE A BEAM, not merely a steady one. What was wrong with the old
      // drawing was never that the core moved: it was that the core ARRIVED ON SCREEN as a
      // warm grey, one more of this zone's own pale light columns, and a check that pins
      // only steadiness does not see that. A sprite is laid over the sky with alpha, not
      // added to it, so the core is measured composited over the zone's own sky -- and
      // brightness cannot tell a beam from a pale column there: the same drawing repainted
      // in the backdrop's cold blue-white, alphas and shape untouched, comes out at
      // luminance 0.875 against the gold one's 0.895. Hue can, and by a mile: +53 R-B over
      // a sky at -54, against the cold repaint's -21. Only pixels the beam actually owns
      // count (alpha >= 0.5); at the very top it fades into the sky and is meant to.
      // c_R - c_B after compositing is (px_R - px_B) * a + (sky_R - sky_B) * (1 - a).
      let coldest = null;
      for (const [si, s] of skies.entries()) {
        const skyWarm = s[0] - s[2];
        for (const [fr, q] of cells.entries()) {
          let sw = 0, n = 0;
          for (let y = 0; y < poolTop; y++) {
            for (let x = 0; x < w; x++) {
              if (!isCore(x)) continue;
              const i = (y * w + x) * 4, a = q.data[i + 3] / 255;
              if (a < 0.5) continue;
              sw += (q.data[i] - q.data[i + 2]) * a + skyWarm * (1 - a); n++;
            }
          }
          const gap = n ? sw / n - skyWarm : 0;
          if (!coldest || gap < coldest[0]) coldest = [gap, fr, th.sky[si]];
        }
      }
      if (coldest && coldest[0] < SHAFT_WARM) {
        out.push(`variant ${v} frame ${coldest[1]}: over sky ${coldest[2]} its core comes out only ` +
          `${coldest[0].toFixed(0)} warmer than that sky in R-B, want ${SHAFT_WARM} -- that is a pale column, not a beam`);
      }

      const core = mean(cells[0], (x, y) => isCore(x) && y < poolTop);
      const glow = cells.map((q) => mean(q, (x, y) => !isCore(x) && y < poolTop));
      const pool = cells.map((q) => mean(q, (x, y) => y >= poolTop));
      const swing = (a) => 1 - Math.min(...a) / Math.max(...a);
      const at = (a, pick) => a.indexOf(pick(...a));
      if (moved) out.push(`variant ${v}: ${moved} core pixels are not the same in every frame`);
      if (core < 0.7) out.push(`variant ${v}: its core averages ${core.toFixed(2)} alpha, too thin to hold the beam`);
      if (swing(glow) < 0.35) out.push(`variant ${v}: the glow swings ${swing(glow).toFixed(2)} over the frames, which is not a breath`);
      if (swing(pool) < 0.2) out.push(`variant ${v}: the pool swings ${swing(pool).toFixed(2)} over the frames`);
      if (at(pool, Math.min) !== at(glow, Math.min) || at(pool, Math.max) !== at(glow, Math.max)) {
        out.push(`variant ${v}: the pool is faintest at frame ${at(pool, Math.min)} and fullest at ${at(pool, Math.max)}, ` +
          `the glow at ${at(glow, Math.min)} and ${at(glow, Math.max)} -- the pool does not follow the glow`);
      }
    }
    return out;
  }

  for (const m of breathProblems(shaft, THEMES[11])) f(`the light shaft ${m}`);

  // And in the game: every frame over a cycle, none of them dimmed by a hook, and two
  // shafts a world unit apart mostly out of step, so a row of ledges does not breathe
  // together. (Real neighbours are further apart than that and further out of step: the
  // two on floors 2200 and 2201 of seed 0x2f6f1b21 stand 59.25 units apart, which is two
  // and a half frames.)
  const shaftPeriod = shaft.frames / shaft.fps, SN = 480;
  const shaftFrame = new Map();
  for (let fr = 0; fr < shaft.frames; fr++) shaftFrame.set(D.spriteFor('ZENITH', 'LIGHT_SHAFT', 0, fr, THEMES[11]).img, fr);
  const shaftSeen = new Array(shaft.frames).fill(0);
  let dimmed = 0, together = 0;
  for (let s = 0; s < SN; s++) {
    const t = (s / SN) * shaftPeriod;
    const a = draw('ZENITH', 'LIGHT_SHAFT', 12, t);
    const b = draw('ZENITH', 'LIGHT_SHAFT', 16, t);
    const fa = shaftFrame.get(a.img);
    if (fa === undefined) { f('the light shaft drew a sprite that is none of its frames'); break; }
    shaftSeen[fa]++;
    if (a.a < 1) dimmed++;
    if (fa === shaftFrame.get(b.img)) together++;
  }
  if (shaftSeen.some((n) => Math.abs(n / SN - 1 / shaft.frames) > 0.02)) f(`the light shaft's frames over one cycle: ${shaftSeen.map((n) => `${(100 * n / SN).toFixed(0)}%`).join(' ')}`);
  if (dimmed) f(`the light shaft was drawn at less than full opacity in ${dimmed} of ${SN} moments`);
  if (together > SN / 4) f(`two light shafts a unit apart show the same frame ${(100 * together / SN).toFixed(0)}% of a cycle`);

  const heights = new Set();
  for (let s = 0; s < 200; s++) heights.add(Math.round(-draw('COSMOS', 'ORB', 12, s * 0.02).dy * PX - 300 * PX));
  const hs = [...heights].sort((a, b) => a - b);
  const orb = ZONES[9].ELEMENTS.ORB;
  const rest = orb.lift + orb.box[1];
  if (hs.join() !== [-8, -4, 0, 4, 8].map((d) => rest + d).join()) f(`the orb's top rides at [${hs}] art px, want ${rest} +- 8 in whole units`);

  // The breath check itself, against five mutations of the real shaft. The first is the
  // drawing this redraw replaced -- the whole sprite scaled by a per-frame number, core and
  // all -- so if the check ever stops seeing that, it has stopped doing its job. The last is
  // the same defect arrived at from the other side: a shaft that is perfectly steady and
  // still a pale column. It passed every check here until the warmth one was added.
  {
    const [sw, sh] = shaft.box;
    const copyRows = (q, from, y0, y1) => {
      for (let y = y0; y < y1; y++) for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        for (let c = 0; c < 4; c++) q.data[i + c] = from.data[i + c];
      }
    };
    const cellOf = (v, fr, th) => { const q = new Pix(sw, sh); shaft.paint(q, v, fr, th); return q; };
    const mutants = [
      ['scales the whole sprite, core and all', /core pixels are not the same/, {
        ...shaft,
        paint(q, v, fr, th) {
          shaft.paint(q, v, fr, th);
          const k = 0.46 + 0.54 * (fr / (shaft.frames - 1));
          for (let i = 3; i < q.data.length; i += 4) q.data[i] = Math.round(q.data[i] * k);
        },
      }],
      ['never changes frame', /the glow swings/, { ...shaft, paint(q, v, fr, th) { shaft.paint(q, v, 0, th); } }],
      ['leaves the pool behind while the glow breathes', /the pool swings/, {
        ...shaft,
        paint(q, v, fr, th) { shaft.paint(q, v, fr, th); copyRows(q, cellOf(v, 0, th), sh - SHAFT_POOL, sh); },
      }],
      ['brings the alpha() hook back', /alpha\(\) hook/, { ...shaft, alpha: () => 0.5 }],
      // Red and blue swapped: the beam's own drawing, its own alphas, its own breath, in
      // the cold blue-white of the light columns the backdrop is already full of. Every
      // other check here is blind to it, because every other check reads alpha.
      ['is drawn in the backdrop\'s own cold blue-white', /warmer than that sky/, {
        ...shaft,
        paint(q, v, fr, th) {
          shaft.paint(q, v, fr, th);
          for (let i = 0; i < q.data.length; i += 4) { const r = q.data[i]; q.data[i] = q.data[i + 2]; q.data[i + 2] = r; }
        },
      }],
    ];
    const missed = mutants.filter(([, why, e]) => !breathProblems(e, THEMES[11]).some((m) => why.test(m))).map(([n]) => n);
    if (missed.length) f(`the light shaft's breath check passed a shaft that ${missed.join(', ')}`);
  }

  if (!badHere) {
    ok(`moving: the torch shows each of its ${torch.frames} frames a quarter of the time, out of step with its neighbour; ` +
      `the shaft breathes in ${shaft.frames} frames with its core the same in every one, warm against its sky, at full opacity, ` +
      `two a unit apart in step ${(100 * together / SN).toFixed(0)}% of a cycle; the orb bobs a unit at a time`);
  }
}

// --- 6. warming ---------------------------------------------------------------------
{
  let badHere = 0;
  D.resetDecorCache();
  const times = [];
  for (const [i, z] of ZONES.entries()) {
    const want = Object.values(z.ELEMENTS).reduce((a, e) => a + e.variants * e.frames, 0);
    const t0 = performance.now();
    const built = D.warmDecor(i, THEMES[i]);
    times.push([z.name, performance.now() - t0, built]);
    if (built !== want) { fail(`${z.name}: warmDecor built ${built} cells, the zone has ${want}`); badHere++; }
    if (D.warmDecor(i, THEMES[i]) !== 0) { fail(`${z.name}: a second warmDecor built again`); badHere++; }
  }
  // The backdrop warms the next zone's furniture, in the frame after its three layers.
  D.resetDecorCache();
  const b = new Backdrop();
  for (let k = 0; k < 4; k++) b.warm(2, THEMES[2]);
  if (D.warmDecor(2, THEMES[2]) !== 0) { fail('four Backdrop.warm calls did not build the next zone\'s furniture'); badHere++; }
  const worst = times.reduce((a, t) => (t[1] > a[1] ? t : a));
  if (!badHere) ok(`warmDecor builds each zone's sprites once, and the backdrop calls it after the next zone's layers`);
  console.log(`  build ms per zone (headless): ${times.map(([n, ms, c]) => `${n} ${ms.toFixed(1)} (${c})`).join(', ')}; worst ${worst[0]} ${worst[1].toFixed(1)} ms`);
}

console.log(`\n  RESULT: ${bad ? `FAIL - ${bad} problem(s)` : 'PASS - 23 elements registered, painted, placed inside their ledges and drawn where their anchors say.'}`);
process.exit(bad ? 1 : 0);
