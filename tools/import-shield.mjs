// Turn the shield illustration into the shield the game carries and the logo it shows.
//
//   node tools/import-shield.mjs assets/shield-source.png --emit > src/render/shieldart.js
//   node tools/import-shield.mjs assets/shield-source.png            report only
//
//   --sizes=42x60,40x59   the carried sizes to bake (default: ask the game)
//   --emblem=96x148       the logo's size in emblem pixels
//   --colours=28          palette size
//   --bgtol=20            how close to the backdrop still counts as backdrop
//   --cover=0.5           ink coverage a target pixel needs to be opaque
//
// WHAT THIS IS FOR
//
// The logo: the shield between the two words of the title, and the application icon cut
// from the same art. The character carries a shield the ARTIST drew, in every pose, at the
// angle that pose holds it -- so nothing here goes on him.
//
// --sizes= will still bake the art at any list of sizes, which is what the carried shield
// used when the game had to draw its own. Kept because it is four lines and because the
// next thing that needs a shield at a size will want it resampled from the master rather
// than scaled from a small bitmap.

import fs from 'node:fs';
import path from 'node:path';
import { readPNG } from './pngread.mjs';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};
if (!file) {
  console.error('usage: node tools/import-shield.mjs <master.png> [--emit]');
  process.exit(2);
}

const EMIT = !!flag('emit', false);
const PAL_N = Number(flag('colours', 28));
const BGTOL = Number(flag('bgtol', 20));
const COVER = Number(flag('cover', 0.5));
const MERGE_D = Number(flag('merge', 26));
const [EMB_W, EMB_H] = String(flag('emblem', '96x148')).split('x').map(Number);

// The shield's OWN palette keys.
//
// Not letters. import-sprite.mjs assigns the character's palette A..Z then a..z by
// population, so every letter is spoken for and which colour a letter means changes with
// every re-import. That has already cost this project a gold shield and a rider drawn in
// the sheet's darkest red. Digits and punctuation are keys the sprite importer can never
// emit, so these two palettes cannot collide however either one is regenerated.
const KEYS = '0123456789#$%&*+-/:;<=>?@^_~!';

const img = readPNG(path.resolve(file));
const at = (x, y) => {
  const o = (y * img.w + x) * img.ch;
  return img.ch === 1 ? [img.data[o], img.data[o], img.data[o]]
    : [img.data[o], img.data[o + 1], img.data[o + 2]];
};

// --- the silhouette -------------------------------------------------------------
//
// By tolerance to the backdrop rather than by a flood fill from the border. A flood keeps
// whatever it cannot reach, and the gaps between the horse's legs are exactly that: they
// would import as solid blocks of backdrop rather than as holes.
const bg = at(2, 2);
const isBg = (x, y) => {
  const c = at(x, y);
  return Math.abs(c[0] - bg[0]) <= BGTOL && Math.abs(c[1] - bg[1]) <= BGTOL
    && Math.abs(c[2] - bg[2]) <= BGTOL;
};

let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
const ink = new Uint8Array(img.w * img.h);
for (let y = 0; y < img.h; y++) {
  for (let x = 0; x < img.w; x++) {
    if (isBg(x, y)) continue;
    ink[y * img.w + x] = 1;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
const BW = x1 - x0 + 1, BH = y1 - y0 + 1;

/**
 * The master, area-averaged down to exactly w by h.
 *
 * Every source pixel contributes to exactly one target cell, weighted by whether it is
 * ink. A cell is opaque when enough of it is ink -- COVER -- and its colour is the mean
 * of the ink that fell in it, never of the backdrop around it. Averaging the backdrop in
 * is what gives a downscaled sprite its grey halo.
 */
function resample(w, h) {
  const sum = new Float64Array(w * h * 3);
  const hits = new Float64Array(w * h);
  const total = new Float64Array(w * h);
  for (let sy = 0; sy < BH; sy++) {
    const ty = Math.min(h - 1, Math.floor((sy * h) / BH));
    for (let sx = 0; sx < BW; sx++) {
      const tx = Math.min(w - 1, Math.floor((sx * w) / BW));
      const i = ty * w + tx;
      total[i]++;
      if (!ink[(y0 + sy) * img.w + (x0 + sx)]) continue;
      const c = at(x0 + sx, y0 + sy);
      sum[i * 3] += c[0]; sum[i * 3 + 1] += c[1]; sum[i * 3 + 2] += c[2];
      hits[i]++;
    }
  }
  const out = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!hits[i] || hits[i] / total[i] < COVER) { row.push(null); continue; }
      row.push([sum[i * 3] / hits[i], sum[i * 3 + 1] / hits[i], sum[i * 3 + 2] / hits[i]]);
    }
    out.push(row);
  }
  return out;
}

// --- the palette, built once at the logo's resolution ---------------------------
//
// Merged BEFORE the top N are taken. The master is an illustration, not pixel art: it
// holds 54,504 colours, and the twenty most populous of them are twenty shades of the
// same red. Merging first is what makes the twenty-eight kept colours twenty-eight
// DIFFERENT colours -- the golds, the reds, the horse, the steel and the keyline --
// rather than a gradient sampled twenty-eight times.
const master = resample(EMB_W, EMB_H);
const tally = new Map();
for (const row of master) {
  for (const c of row) {
    if (!c) continue;
    const q = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
    const hex = '#' + q.map((v) => v.toString(16).padStart(2, '0')).join('');
    const e = tally.get(hex) || { n: 0, rgb: q };
    e.n++;
    tally.set(hex, e);
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
  if (keep.length >= PAL_N) break;
}
if (keep.length > KEYS.length) throw new Error(`${keep.length} colours, only ${KEYS.length} keys`);
const palette = keep.map((k, i) => ({ key: KEYS[i], hex: k.hex, rgb: k.rgb }));

const snap = (c) => {
  let best = palette[0], bd = Infinity;
  for (const p of palette) {
    const d = (p.rgb[0] - c[0]) ** 2 + (p.rgb[1] - c[1]) ** 2 + (p.rgb[2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best.key;
};

const grid = (cells) => cells.map((row) => row.map((c) => (c ? snap(c) : '.')).join(''));

const sizes = String(flag('sizes', '')).split(',').filter(Boolean)
  .map((s) => s.split('x').map(Number));
sizes.sort((a, b) => b[0] * b[1] - a[0] * a[1]);

const baked = sizes.map(([w, h]) => ({ w, h, rows: grid(resample(w, h)) }));

// --- report or emit --------------------------------------------------------------

if (!EMIT) {
  console.log(`  master ${img.w}x${img.h}, shield ${BW}x${BH} (ratio ${(BW / BH).toFixed(3)})`);
  console.log(`  backdrop ${'#' + bg.map((v) => v.toString(16).padStart(2, '0')).join('')} ` +
    `at tolerance ${BGTOL}`);
  console.log(`  ${palette.length} colours:`);
  palette.forEach((p) => console.log(`    ${p.key}  ${p.hex}`));
  console.log(`  logo ${EMB_W}x${EMB_H}, ${baked.length} carried sizes:`);
  baked.forEach((b) => {
    const opaque = b.rows.reduce((t, r) => t + [...r].filter((c) => c !== '.').length, 0);
    console.log(`    ${String(b.w).padStart(2)}x${b.h}  ${opaque} px  ` +
      `${(b.w / b.h).toFixed(2)} vs ${(BW / BH).toFixed(2)} drawn`);
  });
  process.exit(0);
}

const rows = (r) => '  ' + r.map((s) => JSON.stringify(s)).join(',\n  ');
const out = [];
out.push('// GENERATED by tools/import-shield.mjs -- do not edit by hand.');
out.push('//');
out.push(`//   node tools/import-shield.mjs ${file} --colours=${PAL_N} \\`);
out.push(`//        --emblem=${EMB_W}x${EMB_H} --bgtol=${BGTOL} --emit > src/render/shieldart.js`);
out.push('//');
out.push('// The arms of the Grand Duchy, resampled from the master illustration once per size');
out.push('// the game asks for. The keys are digits and punctuation so they cannot collide with');
out.push('// the character palette, which is letters assigned by population.');
out.push('');
out.push('export const PAL = {');
palette.forEach((p) => out.push(`  ${JSON.stringify(p.key)}: '${p.hex}',`));
out.push('};');
out.push('');
out.push(`export const EMB_W = ${EMB_W};`);
out.push(`export const EMB_H = ${EMB_H};`);
out.push('');
out.push('/** The logo, at its own resolution. */');
out.push('export const EMBLEM = [');
out.push(rows(grid(master)));
out.push('];');
out.push('');
out.push('/** One grid per box size the game carries it at, keyed "WxH". */');
out.push('export const SIZES = {');
baked.forEach((b) => {
  out.push(`  '${b.w}x${b.h}': [`);
  out.push('  ' + rows(b.rows));
  out.push('  ],');
});
out.push('};');
out.push('');
console.log(out.join('\n'));
