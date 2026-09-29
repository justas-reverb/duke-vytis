// Every shield the Duke carries, in every pose, beside the logo they all come from.
//
//   node tools/shot-shields.mjs
//   node tools/shot-shields.mjs --zoom=8
//
// WHAT THIS IS FOR
//
// The shield is the artist's, drawn into each of the eighteen cells at the angle that pose
// holds it. Cropping it out of all of them and laying them side by side is the one view
// that shows whether they agree with each other -- and it is the view that caught the old
// stamper painting a coat of arms over his face, back when the game drew its own shields.
//
// The shield is FOUND rather than located by hand: the red field is measured and its box
// taken, by tools/shieldfind.mjs. Eighteen bounding boxes typed in here would survive
// exactly one re-import.
//
// Drawn with fillRect from the character grids rather than through drawImage. The headless
// canvas draws nothing from a large source offset (see SPLAT_BITS in sprites.js), and a
// tool that silently shows an empty box is worse than useless: it is misleading.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

const Z = Number(flag('zoom', 6));          // screen pixels per art pixel on the crops

const { SPR_W, SPR_H, PAL, FRAMES: ART } = await import('../src/render/vytisart.js');
const { POSE_ART, NAMES } = await import('../src/render/sprites.js');
const { resolve, shieldFace, shieldBox } = await import('./shieldfind.mjs');
const { INK, emblemArt, EMB_W, EMB_H } = await import('../src/render/emblem.js');
const { drawText } = await import('../src/render/font.js');

// What red and gold MEAN has to be decided before anything goes looking for a shield: the
// character's palette is generated per sheet and assigns its keys by population, so a key
// that means crimson on one import means gold on the next.
resolve(PAL);

const BG = '#15101f', PANEL = '#1e1830', LINE = '#4a4266';
const GOLDTX = '#ffe23d', DIM = '#8a8fa8', WHITE = '#e8e4f0';

const posesOf = (cell) => NAMES.filter((n) => POSE_ART[n] === cell);

/** A rectangle of a character grid, at z screen pixels per art pixel. */
function blit(g, grid, inks, sx, sy, w, h, dx, dy, z) {
  for (let y = 0; y < h; y++) {
    const row = grid[sy + y] || '';
    let x = 0;
    while (x < w) {
      const ch = row[sx + x];
      if (!ch || ch === '.') { x++; continue; }
      let run = 1;
      while (x + run < w && row[sx + x + run] === ch) run++;
      const col = inks[ch];
      if (col) { g.fillStyle = col; g.fillRect(dx + x * z, dy + y * z, run * z, z); }
      x += run;
    }
  }
}

function box(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
}

// --- measure every cell ---------------------------------------------------------

const CELLS = ART.map((frame, i) => {
  const face = shieldFace(frame, SPR_W);
  return { i, box: face ? shieldBox(frame, SPR_W, face) : null, poses: posesOf(i) };
});
const found = CELLS.filter((c) => c.box);
const PADPX = 2;
const maxW = Math.max(...found.map((c) => c.box.w)) + PADPX * 2;
const maxH = Math.max(...found.map((c) => c.box.h)) + PADPX * 2;

console.log(`  ${found.length}/${CELLS.length} cells carry a shield`);
for (const c of CELLS) {
  console.log(`  ${String(c.i).padStart(4)}  ${c.box ? `${c.box.w}x${c.box.h}`.padStart(7) : '      -'}` +
    `   ${c.poses.join(' ') || '-'}`);
}

// --- the sheet -------------------------------------------------------------------

const COLS = 3;
const GAP = 12, PAD = 14, LABEL = 30;
const CELLZ = 2;                                    // the whole drawing, for context
const cellW = SPR_W * CELLZ, cellH = SPR_H * CELLZ;
const cropW = maxW * Z, cropH = maxH * Z;
const tileW = cellW + cropW + GAP + PAD * 2;
const tileH = Math.max(cropH, cellH) + PAD + LABEL;
const rows = Math.ceil(CELLS.length / COLS);
const HEAD = 56 + EMB_H * 3;

const sheet = new HeadlessCanvas(tileW * COLS, HEAD + tileH * rows);
const g1 = sheet.getContext('2d');
g1.fillStyle = BG;
g1.fillRect(0, 0, sheet.width, sheet.height);

drawText(g1, 'DUKE VYTIS - THE SHIELD HE CARRIES, EVERY POSE', 12, 12, GOLDTX, 2, 'left');
drawText(g1, `THE ARTIST'S OWN, IN EVERY CELL. THE BOX IS MEASURED FROM THE RED FIELD.   ${Z}X`,
  12, 32, DIM, 1, 'left');

// The logo, which is the same arms imported separately at its own resolution.
{
  const x = 20;
  g1.fillStyle = '#0d0a16'; g1.fillRect(x, 50, EMB_W * 3, EMB_H * 3);
  blit(g1, emblemArt(), INK, 0, 0, EMB_W, EMB_H, x, 50, 3);
  const tx = x + EMB_W * 3 + 20;
  drawText(g1, `THE LOGO, ${EMB_W}x${EMB_H} EMBLEM PIXELS`, tx, 54, WHITE, 1, 'left');
  drawText(g1, 'THE SAME ARMS, IMPORTED SEPARATELY FROM THE', tx, 70, DIM, 1, 'left');
  drawText(g1, 'ILLUSTRATION INTO src/render/shieldart.js. THE', tx, 82, DIM, 1, 'left');
  drawText(g1, 'TITLE SCREEN AND THE APP ICON ARE BOTH CUT', tx, 94, DIM, 1, 'left');
  drawText(g1, 'FROM IT. THE ONES BELOW ARE THE SPRITE SHEET.', tx, 106, DIM, 1, 'left');
}

CELLS.forEach((c, n) => {
  const col = n % COLS, row = (n / COLS) | 0;
  const tx = col * tileW, ty = HEAD + row * tileH;

  g1.fillStyle = PANEL;
  g1.fillRect(tx + 2, ty + 2, tileW - 4, tileH - 4);

  drawText(g1, `CELL ${c.i}`, tx + PAD, ty + 6, GOLDTX, 1, 'left');
  drawText(g1, (c.poses.join(' ') || 'unused').toUpperCase(), tx + PAD + 46, ty + 6, WHITE, 1, 'left');

  const dy = ty + 18;
  const dxC = tx + PAD, dxA = tx + PAD + cellW + GAP;
  g1.fillStyle = '#0d0a16';
  g1.fillRect(dxC, dy, cellW, cellH);
  g1.fillRect(dxA, dy, cropW, cropH);

  blit(g1, ART[c.i], PAL, 0, 0, SPR_W, SPR_H, dxC, dy, CELLZ);

  const base = dy + Math.max(cropH, cellH) + 6;
  drawText(g1, 'WHOLE CELL 2X', dxC, base, DIM, 1, 'left');

  if (!c.box) {
    drawText(g1, 'NO SHIELD IN THIS DRAWING', dxA + 6, dy + 8, DIM, 1, 'left');
    return;
  }

  box(g1, dxC + c.box.x * CELLZ, dy + c.box.y * CELLZ,
    c.box.w * CELLZ, c.box.h * CELLZ, GOLDTX);

  const sx = Math.max(0, c.box.x - PADPX), sy = Math.max(0, c.box.y - PADPX);
  blit(g1, ART[c.i], PAL, sx, sy, maxW, maxH, dxA, dy, Z);
  box(g1, dxA + (c.box.x - sx) * Z, dy + (c.box.y - sy) * Z, c.box.w * Z, c.box.h * Z, LINE);

  drawText(g1, `SHIELD ${c.box.w}x${c.box.h} PX`, dxA, base, DIM, 1, 'left');
});

fs.writeFileSync('shield-poses.png', encodePNG(sheet));
console.log(`  shield-poses.png  ${sheet.width}x${sheet.height}`);
