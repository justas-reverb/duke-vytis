// Turn the platform tile sheet into the art the game draws ledges from.
//
//   node tools/import-platforms.mjs --emit > src/render/platart.js
//   node tools/import-platforms.mjs                     report only
//   node tools/import-platforms.mjs --provisional --emit > src/render/platart.js
//                                  re-cut the stand-in, paint every zone that has a painter
//                                  in tools/platpaint/, write the sheet and the pins, and
//                                  emit: the one command a painter runs (from Git Bash --
//                                  PowerShell 5.1's > writes UTF-16)
//   node tools/import-platforms.mjs --repalette[=ZONE,...] --emit > src/render/platart.js
//                                  for real art: drop those zones' pins (all, with no list),
//                                  so their palettes come from their own pixels
//
// Status lines go to stderr whenever --emit is given, so they never land in the module.
//
// THE INPUT is assets/platform-tiles.png: 64 wide, 40 tall per zone, twelve zones
// stacked, 1:1 with the screen. Each row is three pieces side by side --
//
//   x 0-15    LEFT CAP    drawn once, at the left end of every platform
//   x 16-47   TILE        repeated as many times as the width needs
//   x 48-63   RIGHT CAP   drawn once, at the right end
//
// -- and row 12 is the standing surface: the player's boots rest on its top edge, with
// 28 px of body below it and 12 px of headroom above for anything that stands proud.
// tools/platform-template.mjs prints the same layout at 8x with the cuts marked, which
// is the thing to draw into; tools/platpaint/index.mjs is the contract for painting a
// cell in code.
//
// WHAT THIS CHECKS, AND WHY
//
// The tile has exactly one rule: it must WRAP. Its left edge column gets butted straight
// against its own right edge column, over and over, so if they do not meet the seam
// repeats every eight world units all the way up the tower -- at a third of the speed of
// a camera that never stops, which is the most visible thing in the game.
//
// Nothing about a PNG makes that true, so this measures it and says so per zone. The
// first round of this art tiled on two zones out of twelve and nobody could have told
// from looking at the sheet.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { readPNG } from './pngread.mjs';
import { ZONES } from './platpaint/index.mjs';

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(a.indexOf('=') + 1) : undefined;
};
const EMIT = has('emit');
/** Progress and verdicts: stdout for a report, stderr while stdout is the module. */
const note = (s) => (EMIT ? console.error(s) : console.log(s));

const CAP_W = 16, TILE_W = 32, CELL_W = 64;
const HEAD = 12, BODY = 28, CELL_H = HEAD + BODY;

// --- a palette PER ZONE, and why -----------------------------------------------------
//
// WHAT WAS WRONG. The whole sheet shared one palette of eighty keys, built from the
// colour counts of all twelve zones. The cut sheet has about fourteen thousand distinct
// colours, so the palette belonged to the sheet, not to any zone: change one zone's
// pixels, a different colour won a key, and zones nobody touched re-snapped (repainting
// DOWNTOWN and STORM moved 2751 pixels in nine of the other ten zones). It was pinned to
// stop that, and then it was full: DOWNTOWN's honey timber needed colours no strip had,
// and they went on eleven spare keys offered to DOWNTOWN alone, eight of which it used.
// Ten zones about to be painted could not have fitted in the three left.
//
// NOW every zone has a palette of its own, keyed independently and emitted as
// ZONES[name].pal: 'A' in BASEMENT and 'A' in DUNGEON are different colours, and a zone's
// palette is made from that zone's pixels alone. Nothing in one zone can move a pixel of
// another, and a zone has all of KEYS to itself. A zone's palette comes from, in order:
//
//   pinned  assets/platform-palette/<zone>.json -- only the zones still CUT from the old
//           strips; see PIN_DIR.
//   exact   a cell with at most KEYS.length distinct colours -- a painted cell, or art
//           drawn with a restrained palette -- keeps every colour exactly.
//   built   more colours than keys (resampled art): the zone's own colours merged within
//           MERGE_D and the commonest KEYS.length of them kept, the rest snapped to the
//           nearest. The report says how many pixels moved and how far.
//
// Keys are every printable ASCII character except space, '.' (transparent), and the two
// JSON would escape, letters first so the rows of a small palette read as letters.
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+-/:;<=>?@^_~'
  + "!'(),[]`{|}";
const MERGE_D = 14;

// --- the pins: what keeps the cut zones exactly as they were ---------------------------
//
// A zone still cut from the old strips holds hundreds of colours, and was only ever what
// it is because it was snapped to the old shared palette -- the eighty colours of the
// whole cut, CUT_KEYS below. Its pin is the part of those eighty its own pixels snapped
// to, in the old palette's order. Snapping the cell to that subset gives exactly what
// snapping to all eighty gave: each pixel's nearest of the eighty is in the subset by
// construction, and keeping the order keeps every tie going the same way. So the cut
// zones decode pixel-identical, with no palette shared between them.
//
// ONE FILE PER ZONE, and only for the cut zones. A painted zone needs none -- its colours
// are exact -- and --provisional deletes a zone's pin the moment the zone has a painter.
// One file each, not one file with a section each, because five painters work at once and
// each one's run deletes its own zones' pins: in a single file those would be adjacent
// deletions, and every merge a conflict.
//
// A pin also records a fingerprint of the cell it was made for. A cell that has changed
// since -- the artist's drawing dropped over the stand-in -- is not what the pin
// describes, and snapping new art to an old strip's colours is never what anybody wants,
// so a stale pin is IGNORED, with a warning, and the zone's palette comes from its own
// pixels. --repalette deletes pins outright, which is how real art says the stand-in is
// gone for good.
const PIN_DIR = 'assets/platform-palette';
const pinPath = (name) => `${PIN_DIR}/${name.toLowerCase()}.json`;
// The single shared pin that the per-zone ones replaced. --provisional retires it.
const OLD_PIN = 'assets/platform-palette.json';
// The size of the old shared palette the cut zones were snapped to. It is not a limit on
// anything now; it is part of what the cut IS.
const CUT_KEYS = 80;

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (c) => '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * A palette from colour counts, over the cells of zones `zs`, from a pixel accessor
 * at(x, y) -> [r, g, b, a], of at most `max` colours: merged before the top ones are
 * taken, for the same reason the sprite importer does it -- a resampled illustration
 * holds thousands of near-duplicate values and the most populous of them are all one
 * colour. Returns [{ hex, rgb }] in order of count.
 */
function buildPalette(at, zs, max) {
  const tally = new Map();
  for (const z of zs) {
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const c = at(x, z * CELL_H + y);
        if (c[3] < 8) continue;
        const hex = hexOf(c);
        const e = tally.get(hex) || { n: 0, rgb: [c[0], c[1], c[2]] };
        e.n++;
        tally.set(hex, e);
      }
    }
  }
  const keep = [];
  for (const [hex, e] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n)) {
    let merged = false;
    for (const k of keep) {
      const d = Math.hypot(k.rgb[0] - e.rgb[0], k.rgb[1] - e.rgb[1], k.rgb[2] - e.rgb[2]);
      if (d < MERGE_D) { k.n += e.n; merged = true; break; }
    }
    if (merged) continue;
    keep.push({ hex, n: e.n, rgb: e.rgb });
    if (keep.length >= max) break;
  }
  return keep.map((k) => ({ hex: k.hex, rgb: k.rgb }));
}

/** Index of the nearest colour in `list` to c: the FIRST of equals, as it always was. */
function nearest(list, c) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i].rgb;
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * A cell's fingerprint: SHA-1 of its RGBA with every see-through pixel (alpha under 8,
 * the importer's own threshold) as zeros, so the colour a transparent pixel happens to
 * carry does not count.
 */
function fingerprint(at, z) {
  const b = Buffer.alloc(CELL_W * CELL_H * 4);
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const c = at(x, z * CELL_H + y);
      if (c[3] < 8) continue;
      b.set([c[0], c[1], c[2], 255], (y * CELL_W + x) * 4);
    }
  }
  return crypto.createHash('sha1').update(b).digest('hex');
}

function writePin(name, colours, cell) {
  fs.mkdirSync(PIN_DIR, { recursive: true });
  const doc = {
    why: `${name}'s platform palette while its cell is still CUT from the old strips: the `
      + 'colours of the old shared palette its pixels snapped to, in that palette\'s order, so '
      + 'it decodes exactly as it did. Written by tools/import-platforms.mjs --provisional, '
      + 'deleted when the zone gets a painter (tools/platpaint/) or by --repalette; ignored '
      + 'if the cell no longer matches `cell`.',
    zone: name,
    cell,
    colours,
  };
  fs.writeFileSync(pinPath(name), JSON.stringify(doc, null, 2) + '\n');
}

/** name -> { cell, colours: [{ hex, rgb }] } for every zone with a pin on disk. */
function readPins() {
  const out = {};
  for (const name of ZONES) {
    if (!fs.existsSync(pinPath(name))) continue;
    const doc = JSON.parse(fs.readFileSync(pinPath(name), 'utf8'));
    if (doc.colours.length > KEYS.length) throw new Error(`${pinPath(name)}: more colours than keys`);
    out[name] = { cell: doc.cell, colours: doc.colours.map((hex) => ({ hex, rgb: rgbOf(hex) })) };
  }
  return out;
}

// --- a provisional sheet, cut from the one-off strips ----------------------------
//
// So the pipeline can be built and seen working before the real tiles exist. It takes a
// 64-pixel slice of each old strip at 1:1 and calls it a cell, which is wrong in exactly
// the way the old art is wrong -- the tile will not wrap -- and right in every other way.
// Except for the zones that have a painter in tools/platpaint/, which are painted over
// their cut at the end of this branch.
if (has('provisional')) {
  const src = readPNG('assets/platform-sheet.png');
  const BANDS = [[125, 164], [182, 220], [237, 273], [293, 336], [345, 389], [401, 437],
    [455, 492], [509, 544], [562, 606], [610, 654], [667, 703], [720, 757]];
  const SURFACE = [128, 183, 243, 297, 352, 401, 455, 518, 563, 619, 670, 721];
  const SX = 233 + 40;

  const out = Buffer.alloc(CELL_W * CELL_H * ZONES.length * 4);
  const at = (x, y) => {
    const i = (y * src.w + x) * src.ch;
    return [src.data[i], src.data[i + 1], src.data[i + 2]];
  };

  // THE SHEET'S BACKDROP IS NOT PART OF THE PLATFORM.
  //
  // The first cut copied every pixel of the band, opaque, so every tile carried a slab of
  // the sheet's near-black navy: twelve rows of it above the walking surface on every
  // zone -- a black box over the grass in the forest -- and, in ABYSS, the backdrop showing
  // above, below and between the bone segments, which are separate pieces on the sheet.
  //
  // It is cleared per CELL, by a flood from the cell's top row and its bottom row through
  // backdrop-coloured pixels, the way tools/import-sprite.mjs clears a character: what the
  // edge can reach through backdrop is backdrop, and a dark pixel enclosed by the drawing
  // stays. A flood from the SHEET's border was tried first and changed nothing -- the zone
  // strips sit inside a framed panel, and the frame line stops it. "Backdrop-coloured" is
  // a tight box around the panel's own navy AND a matching hue with brightness removed,
  // because a box alone around a dark colour holds every dark colour the art has.
  //
  // COSMOS is the exception, and deliberately: its platform is a slab of starfield drawn in
  // the backdrop's own blue-black (measured: its body and the panel overlap in colour), so
  // a flood would eat it into lace. Only the rows ABOVE its walking surface are cleared.
  const HEAD_ONLY = new Set(['COSMOS']);
  const BG = [2, 5, 12];                        // the zone panel's navy, sampled between strips
  const BG_TOL = Number(flag('bgtol')) || 16;
  const BG_CHROMA = Number(flag('bgchroma')) || 10;
  const chroma = (c) => { const m = (c[0] + c[1] + c[2]) / 3; return [c[0] - m, c[1] - m, c[2] - m]; };
  const cb = chroma(BG);
  const isBg = (c) => {
    if (Math.abs(c[0] - BG[0]) >= BG_TOL || Math.abs(c[1] - BG[1]) >= BG_TOL
      || Math.abs(c[2] - BG[2]) >= BG_TOL) return false;
    const k = chroma(c);
    return Math.hypot(k[0] - cb[0], k[1] - cb[1], k[2] - cb[2]) < BG_CHROMA;
  };
  const cleared = [];

  ZONES.forEach((_, z) => {
    const [y0, y1] = BANDS[z];
    const surf = SURFACE[z];
    const below = y1 - surf + 1;
    // The rows ABOVE the surface at the SAME scale as the body, and never past the gap
    // above into the zone drawn over this one. They used to stretch however many rows the
    // band had above its surface -- one or two, on the flat strips -- across all twelve, so
    // DUNGEON, CITADEL, STORM and ZENITH each wore a solid band of their own top edge
    // over the ledge, and the grass in FOREST stood twice as tall as it was drawn.
    const scale = below / BODY;
    const ceil = z ? BANDS[z - 1][1] + 1 : 0;
    for (let py = 0; py < CELL_H; py++) {
      const rel = py - HEAD;
      const sy = rel < 0
        ? Math.max(ceil, surf + Math.round(rel * scale))
        : surf + Math.round((rel / BODY) * below);
      for (let px = 0; px < CELL_W; px++) {
        const c = at(Math.min(src.w - 1, SX + px), Math.max(0, Math.min(src.h - 1, sy)));
        const o = ((z * CELL_H + py) * CELL_W + px) * 4;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
        // Above the band's own first row is the gap between strips, which carries the
        // sheet's dotted divider line -- not backdrop-coloured, so the flood below cannot
        // clear it, and it came through as a row of dashes over every ledge.
        out[o + 3] = sy < y0 ? 0 : 255;
      }
    }

    // The flood, in the cell. 4-connected, so a diagonal crack in the art does not leak.
    const headOnly = HEAD_ONLY.has(ZONES[z]);
    const yMax = headOnly ? HEAD : CELL_H;
    const seen = new Uint8Array(CELL_W * CELL_H);
    const stack = [];
    for (let x = 0; x < CELL_W; x++) {
      stack.push(x, 0);
      if (!headOnly) stack.push(x, CELL_H - 1);
    }
    let n = 0;
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (x < 0 || y < 0 || x >= CELL_W || y >= yMax) continue;
      const i = y * CELL_W + x;
      if (seen[i]) continue;
      const o = ((z * CELL_H + y) * CELL_W + x) * 4;
      if (!isBg([out[o], out[o + 1], out[o + 2]])) continue;
      seen[i] = 1;
      out[o + 3] = 0;
      n++;
      stack.push(x - 1, y, x + 1, y, x, y - 1, x, y + 1);
    }
    cleared.push(`${ZONES[z]} ${n}`);
  });
  const atOut = (x, y) => {
    const o = (y * CELL_W + x) * 4;
    return [out[o], out[o + 1], out[o + 2], out[o + 3]];
  };

  // THE CUT ZONES' PINS. The old shared palette is taken HERE, from all twelve zones as
  // cut, before anything is painted over them: that is the palette the cut always had.
  // Each zone still cut is pinned to the part of it its pixels snap to (see PIN_DIR).
  const cutPalette = buildPalette(atOut, ZONES.map((_, z) => z), CUT_KEYS);
  const { painters } = await import('./platpaint/index.mjs');
  const PAINTED = await painters();
  const pinned = [], unpinned = [];
  ZONES.forEach((name, z) => {
    if (PAINTED[name]) {
      if (fs.existsSync(pinPath(name))) { fs.rmSync(pinPath(name)); unpinned.push(name); }
      return;
    }
    const used = new Set();
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const c = atOut(x, z * CELL_H + y);
        if (c[3] >= 8) used.add(nearest(cutPalette, c));
      }
    }
    const colours = [...used].sort((a, b) => a - b).map((i) => cutPalette[i].hex);
    writePin(name, colours, fingerprint(atOut, z));
    pinned.push(`${name} ${colours.length}`);
  });
  if (fs.existsSync(OLD_PIN)) fs.rmSync(OLD_PIN);

  // THE PAINTED ZONES, over their cut. Their colours are exact and their own; the only
  // limits are the cell's shape and the keys a palette has.
  const { measure } = await import('./platpaint/kit.mjs');
  const HEX = /^#[0-9a-f]{6}$/;
  const reports = [];
  for (const [name, paint] of Object.entries(PAINTED)) {
    const z = ZONES.indexOf(name);
    const cell = paint();
    const where = `tools/platpaint/${name.toLowerCase()}.mjs`;
    if (!Array.isArray(cell) || cell.length !== CELL_H || cell.some((r) => !Array.isArray(r) || r.length !== CELL_W)) {
      throw new Error(`${where}: paint() must return ${CELL_H} rows of ${CELL_W}`);
    }
    const colours = new Set();
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const v = cell[y][x];
        const o = ((z * CELL_H + y) * CELL_W + x) * 4;
        if (!v) { out[o + 3] = 0; continue; }
        const hex = String(v).toLowerCase();
        if (!HEX.test(hex)) throw new Error(`${where}: ${JSON.stringify(v)} at ${x},${y} is not '#rrggbb'`);
        colours.add(hex);
        [out[o], out[o + 1], out[o + 2]] = rgbOf(hex);
        out[o + 3] = 255;
      }
    }
    if (colours.size > KEYS.length) {
      throw new Error(`${where}: ${colours.size} colours; a zone's palette holds ${KEYS.length}`);
    }
    const m = measure(cell);
    if (m.wrapRows) {
      throw new Error(`${where}: the tile does not wrap -- column 47 differs from column 16 on ` +
        `${m.wrapRows} rows. Paint through kit.fromStrip (period 31); see tools/platpaint/index.mjs`);
    }
    reports.push(`  ${name.padEnd(9)} ${String(m.colours).padStart(2)} colours, wraps exactly, ` +
      `cap joins off on ${m.joinRows} rows; row 12: ${m.line.solid}/32 solid, luma ` +
      `${m.line.luma.toFixed(0)} (brightest below: row ${m.line.below.y}, ${m.line.below.luma.toFixed(0)}), ` +
      `rim over it ${m.line.rim}/32; underside ${m.under} px`);
  }

  // Written through the headless canvas's encoder, which is the only PNG writer here.
  const { installDom, HeadlessCanvas, encodePNG } = await import('./headless.mjs');
  installDom();
  const cv = new HeadlessCanvas(CELL_W, CELL_H * ZONES.length);
  const g = cv.getContext('2d');
  for (let y = 0; y < CELL_H * ZONES.length; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const o = (y * CELL_W + x) * 4;
      if (!out[o + 3]) continue;                 // backdrop: left transparent
      g.fillStyle = `rgb(${out[o]},${out[o + 1]},${out[o + 2]})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  fs.writeFileSync('assets/platform-tiles.png', encodePNG(cv));
  note(`  assets/platform-tiles.png  ${CELL_W}x${CELL_H * ZONES.length}  (PROVISIONAL)`);
  note(`  backdrop cleared, pixels per zone: ${cleared.join(', ')}`);
  note(`  painted, not cut: ${Object.keys(PAINTED).join(', ') || 'none'}`);
  for (const r of reports) note(r);
  note(`  ${PIN_DIR}/  pinned, colours per zone: ${pinned.join(', ') || 'none'}` +
    (unpinned.length ? `; pins deleted for ${unpinned.join(', ')} (painted now)` : ''));
  note('  the cut tiles do NOT wrap; that is what the real art is for.');
  if (!EMIT) process.exit(0);
}

// --- read the sheet ---------------------------------------------------------------
const img = readPNG('assets/platform-tiles.png');
if (img.w !== CELL_W) throw new Error(`sheet is ${img.w} wide, expected ${CELL_W}`);
const rows = Math.floor(img.h / CELL_H);
if (rows < ZONES.length) throw new Error(`sheet holds ${rows} cells, expected ${ZONES.length}`);

const at = (x, y) => {
  const i = (y * img.w + x) * img.ch;
  return img.ch === 1
    ? [img.data[i], img.data[i], img.data[i], 255]
    : [img.data[i], img.data[i + 1], img.data[i + 2], img.ch === 4 ? img.data[i + 3] : 255];
};

// --repalette: delete the named zones' pins (every pin, with no list), before they are read.
if (argv.some((a) => a === '--repalette' || a.startsWith('--repalette='))) {
  const list = flag('repalette');
  const names = list ? list.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : ZONES;
  for (const n of names) if (!ZONES.includes(n)) throw new Error(`--repalette: no zone ${n}`);
  const gone = names.filter((n) => fs.existsSync(pinPath(n)));
  for (const n of gone) fs.rmSync(pinPath(n));
  note(`  --repalette: ${gone.length ? `deleted the pins of ${gone.join(', ')}` : 'no pins to delete'};` +
    ' those zones take their palettes from their own pixels');
}
if (fs.existsSync(OLD_PIN)) {
  note(`  ${OLD_PIN} is the old shared pin and is no longer read; --provisional deletes it`);
}

const pins = readPins();

/**
 * One zone's palette and how it was made: { source, list: [{ hex, rgb }], snapped, maxErr }.
 * snapped counts the pixels that are not exactly a palette colour, maxErr is how far the
 * furthest of them moved (RGB distance).
 */
function paletteFor(name, z) {
  let source, list;
  const pin = pins[name];
  if (pin && pin.cell === fingerprint(at, z)) {
    source = 'pinned';
    list = pin.colours;
  } else {
    if (pin) {
      note(`  WARNING ${name}: ${pinPath(name)} was made for a different cell (the cut), so it is ` +
        `ignored and the palette comes from the cell's own pixels; delete it with --repalette=${name}`);
    }
    const tally = new Map();
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const c = at(x, z * CELL_H + y);
        if (c[3] < 8) continue;
        const hex = hexOf(c);
        tally.set(hex, (tally.get(hex) || 0) + 1);
      }
    }
    if (tally.size <= KEYS.length) {
      source = 'exact';
      list = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([hex]) => ({ hex, rgb: rgbOf(hex) }));
    } else {
      source = 'built';
      list = buildPalette(at, [z], KEYS.length);
    }
  }
  return { source, list };
}

/** One zone's cell as rows of keys, '.' where transparent, plus how far the snap moved it. */
function zoneRows(z, list) {
  const exact = new Map(list.map((p, i) => [p.hex, i]));
  let snapped = 0, maxErr = 0;
  const grid = [];
  for (let y = 0; y < CELL_H; y++) {
    let line = '';
    for (let x = 0; x < CELL_W; x++) {
      const c = at(x, z * CELL_H + y);
      if (c[3] < 8) { line += '.'; continue; }
      let i = exact.get(hexOf(c));
      if (i === undefined) {
        i = nearest(list, c);
        const p = list[i].rgb;
        snapped++;
        maxErr = Math.max(maxErr, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
      }
      line += KEYS[i];
    }
    grid.push(line);
  }
  return { grid, snapped, maxErr };
}

// --- does each tile WRAP? ----------------------------------------------------------
function wrapError(z) {
  let sum = 0, n = 0;
  for (let y = 0; y < CELL_H; y++) {
    const l = at(CAP_W, z * CELL_H + y);
    const r = at(CAP_W + TILE_W - 1, z * CELL_H + y);
    if (l[3] < 8 && r[3] < 8) continue;
    if (l[3] < 8 || r[3] < 8) { sum += 255; n++; continue; }
    sum += (Math.abs(l[0] - r[0]) + Math.abs(l[1] - r[1]) + Math.abs(l[2] - r[2])) / 3;
    n++;
  }
  return n ? sum / n : 0;
}

const zones = ZONES.map((name, z) => {
  const { source, list } = paletteFor(name, z);
  const { grid, snapped, maxErr } = zoneRows(z, list);
  return {
    name, source, snapped, maxErr,
    pal: list.map((p, i) => ({ key: KEYS[i], hex: p.hex })),
    left: grid.map((r) => r.slice(0, CAP_W)),
    tile: grid.map((r) => r.slice(CAP_W, CAP_W + TILE_W)),
    right: grid.map((r) => r.slice(CAP_W + TILE_W)),
    wrap: wrapError(z),
  };
});

const paletteNote = (z) => z.source === 'pinned'
  ? `pinned to the cut, ${z.pal.length} colours (${z.snapped} px snapped, up to ${z.maxErr.toFixed(0)} apart)`
  : z.source === 'exact'
    ? `exact, ${z.pal.length} colours`
    : `built from its counts, ${z.pal.length} colours (${z.snapped} px snapped, up to ${z.maxErr.toFixed(0)} apart)`;

if (!EMIT) {
  note(`  ${rows} cells, ${CELL_W}x${CELL_H} each, a palette per zone`);
  note('  zone        tile wraps?');
  for (const z of zones) {
    const v = z.wrap;
    const verdict = v < 10 ? 'YES' : v < 30 ? 'roughly' : 'NO';
    note(`  ${z.name.padEnd(11)} ${verdict.padEnd(8)} edge difference ${v.toFixed(1).padStart(5)}` +
      `   palette ${paletteNote(z)}` + (v >= 30 ? '   <-- a seam every 8 world units' : ''));
  }
  process.exit(0);
}

const rowsOut = (r) => '      ' + r.map((s) => JSON.stringify(s)).join(',\n      ');
const out = [];
out.push('// GENERATED by tools/import-platforms.mjs -- do not edit by hand.');
out.push('//');
// The header names the command that regenerates THIS file. It used to name --emit alone,
// which only re-reads the sheet: a painter who followed it after writing a module in
// tools/platpaint/ got the old cell back, with no error, because nothing ran the painter.
out.push('//   node tools/import-platforms.mjs --provisional --emit > src/render/platart.js');
out.push('//');
out.push('// That re-cuts the stand-in, runs every painter in tools/platpaint/ and writes the');
out.push('// sheet and the pins first; --emit alone only re-reads assets/platform-tiles.png,');
out.push('// which is the command once real art has replaced the provisional sheet.');
out.push('//');
out.push('// Three pieces per zone: a left cap, a tile that repeats, and a right cap. Row');
out.push(`// ${HEAD} is the standing surface -- the player's boots rest on its top edge.`);
out.push('//');
out.push('// Each zone has its OWN palette, `pal`, keyed independently: a key means a');
out.push('// different colour in another zone, and nothing in one zone can re-snap another.');
out.push('// \'.\' is transparent in every zone.');
out.push('');
out.push(`export const CAP_W = ${CAP_W};`);
out.push(`export const TILE_W = ${TILE_W};`);
out.push(`export const CELL_H = ${CELL_H};`);
out.push(`export const HEAD = ${HEAD};   // art pixels above the standing surface`);
out.push(`export const BODY = ${BODY};   // ...and below it`);
out.push('');
out.push('export const ZONES = {');
for (const z of zones) {
  out.push(`  ${z.name}: {`);
  out.push(`    wrap: ${z.wrap.toFixed(1)},   // mean edge difference; under 10 is seamless`);
  out.push(`    // palette ${paletteNote(z)}`);
  out.push('    pal: {');
  z.pal.forEach((p) => out.push(`      ${JSON.stringify(p.key)}: '${p.hex}',`));
  out.push('    },');
  out.push('    left: [');
  out.push(rowsOut(z.left));
  out.push('    ],');
  out.push('    tile: [');
  out.push(rowsOut(z.tile));
  out.push('    ],');
  out.push('    right: [');
  out.push(rowsOut(z.right));
  out.push('    ],');
  out.push('  },');
}
out.push('};');
out.push('');
console.log(out.join('\n'));
