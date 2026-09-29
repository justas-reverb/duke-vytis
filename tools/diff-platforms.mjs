// Which zones' ledge art moved: every zone decoded to RGBA, from the generated module and
// from the sheet, against the same two files at a git commit.
//
//   node tools/diff-platforms.mjs                              against HEAD
//   node tools/diff-platforms.mjs --ref=0ce590a
//   node tools/diff-platforms.mjs --ref=HEAD --allow=BASEMENT,DUNGEON
//                                  exit 1 if any zone NOT in --allow changed
//
// WHY PIXELS AND NOT TEXT. The module's text is the wrong thing to compare: a zone's keys
// can be renamed, its palette reordered or split out of a shared one, and every line of
// it differ while every pixel is what it was -- and the reverse happened, too: repainting
// two zones against a palette shared by all twelve once re-snapped 2751 pixels in nine
// zones nobody touched, with the text of those zones' rows looking like the ordinary churn
// of a regenerated file. So each zone is DECODED -- rows through its palette to RGBA, the
// way platsprites.js rasterises it -- and compared pixel by pixel, from
//
//   src/render/platart.js         what the game draws (either format: one PAL for the
//                                 sheet, as before 2026-09-23, or a `pal` per zone)
//   assets/platform-tiles.png     what it was generated from, the zone's 64 x 40 cell
//
// A painter runs it after `import-platforms --provisional --emit` with --allow naming the
// zones they painted: every other zone must come out identical in both files.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readPNG } from './pngread.mjs';
import { ZONES } from './platpaint/index.mjs';
import { FORMER_NAMES } from '../src/game/themes.js';

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(a.indexOf('=') + 1) : d;
};
const REF = flag('ref', 'HEAD');
const ALLOW = new Set(String(flag('allow', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
for (const z of ALLOW) if (!ZONES.includes(z)) throw new Error(`--allow: no zone ${z}`);

const CELL_W = 64, CELL_H = 40, CAP_W = 16, TILE_W = 32;
const MODULE = 'src/render/platart.js', SHEET = 'assets/platform-tiles.png';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'platdiff-'));
const fromGit = (file, as) => {
  const b = execFileSync('git', ['show', `${REF}:${file}`], { maxBuffer: 64 << 20 });
  const p = path.join(tmp, as);
  fs.writeFileSync(p, b);
  return p;
};

/** zone -> Uint8Array(64 * 40 * 4) from a platart.js module, any format it has had. */
async function decodeModule(file) {
  const m = await import(pathToFileURL(path.resolve(file)).href + `?t=${Date.now()}`);
  const out = {};
  for (const name of ZONES) {
    // A commit from before a zone was renamed has it under its old key (DOWNTOWN was
    // VILLAGE until 2026-09-23); without this it read as "missing", a zone that moved.
    const z = m.ZONES[name] || m.ZONES[FORMER_NAMES[name]];
    if (!z) continue;
    const pal = z.pal || m.PAL;
    const px = new Uint8Array(CELL_W * CELL_H * 4);
    const pieces = [[z.left, 0, CAP_W], [z.tile, CAP_W, TILE_W], [z.right, CAP_W + TILE_W, CAP_W]];
    for (const [rows, x0, w] of pieces) {
      for (let y = 0; y < CELL_H; y++) {
        for (let x = 0; x < w; x++) {
          const k = (rows[y] || '')[x];
          if (!k || k === '.') continue;
          // An unmapped key draws magenta in the game (platsprites.js); here it is a
          // colour no drawing uses, so it counts as a change wherever it appears.
          const hex = pal[k] || '#ff00ff';
          const o = (y * CELL_W + x0 + x) * 4;
          px.set([...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), 255], o);
        }
      }
    }
    out[name] = px;
  }
  return out;
}

/** zone -> Uint8Array(64 * 40 * 4) from the sheet, raw RGBA. */
function decodeSheet(file) {
  const img = readPNG(file);
  const out = {};
  ZONES.forEach((name, z) => {
    if ((z + 1) * CELL_H > img.h) return;
    const px = new Uint8Array(CELL_W * CELL_H * 4);
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const i = ((z * CELL_H + y) * img.w + x) * img.ch;
        const c = img.ch === 1 ? [img.data[i], img.data[i], img.data[i], 255]
          : [img.data[i], img.data[i + 1], img.data[i + 2], img.ch === 4 ? img.data[i + 3] : 255];
        px.set(c, (y * CELL_W + x) * 4);
      }
    }
    out[name] = px;
  });
  return out;
}

/** Pixels that differ in any channel; null if either side has no such zone. */
function differing(a, b) {
  if (!a || !b) return null;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
  }
  return n;
}

let mod0, modNow, sheet0, sheetNow;
try {
  mod0 = await decodeModule(fromGit(MODULE, 'platart-ref.mjs'));
  sheet0 = decodeSheet(fromGit(SHEET, 'tiles-ref.png'));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
modNow = await decodeModule(MODULE);
sheetNow = decodeSheet(SHEET);

console.log(`  every zone, decoded to RGBA, now against ${REF}: pixels that differ (of ${CELL_W * CELL_H})`);
console.log('  zone        platart.js   platform-tiles.png');
let bad = 0;
const show = (n) => (n === null ? 'missing' : n === 0 ? 'identical' : `${n} px`);
for (const name of ZONES) {
  const m = differing(mod0[name], modNow[name]);
  const s = differing(sheet0[name], sheetNow[name]);
  const moved = m !== 0 || s !== 0;
  const allowed = ALLOW.has(name);
  if (moved && !allowed) bad++;
  console.log(`  ${name.padEnd(11)} ${show(m).padEnd(12)} ${show(s).padEnd(12)}` +
    (moved ? (allowed ? ' (allowed)' : ' <-- MOVED') : ''));
}
console.log(bad ? `\n  ${bad} zone(s) moved that --allow does not name` : '\n  nothing moved that --allow does not name');
process.exit(bad ? 1 : 0);
