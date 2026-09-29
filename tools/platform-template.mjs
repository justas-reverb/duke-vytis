// The sheet to draw platforms INTO, one cell per zone, with the rules marked on it.
//
//   node tools/platform-template.mjs
//   node tools/platform-template.mjs --mag=10
//
// WHY A TEMPLATE AND NOT A BRIEF
//
// A platform is drawn at any width from about thirty world units to the whole shaft, so
// it cannot be one picture. It has to be three: a LEFT CAP, a TILE that repeats as many
// times as the width needs, and a RIGHT CAP. The tile is the whole difficulty, and it has
// exactly one rule -- its left edge must meet its own right edge, because the game will
// butt it against a copy of itself. Everything else is taste.
//
// The first version of this art was drawn from a reference sheet that showed one platform
// at one width, so that is what came back: twelve beautiful one-off strips, none of which
// tiled. Only three of the twelve had a repeat an autocorrelator could even find. That is
// not a mistake in the drawing, it is a mistake in what was asked for, and this file is
// the fix -- the cells are the exact size the game wants, and the cuts are printed on
// them.
//
// The existing art is fitted into each cell, squashed to the right proportions, as a
// starting point rather than a thing to preserve.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';
import { readPNG } from './pngread.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};
const MAG = Number(flag('mag', 8));

const { THEMES } = await import('../src/game/themes.js');
const { PLAT_THICK, PX } = await import('../src/game/constants.js');
const { drawText } = await import('../src/render/font.js');

// --- the cell -------------------------------------------------------------------
//
// BODY is PLAT_THICK world units at one art pixel per screen pixel, which is what every
// other sprite in this game is drawn at. HEAD is room for whatever stands above the
// surface -- studs, spikes, icicles, a lit lip.
const BODY = PLAT_THICK * PX;            // 28 art px
const HEAD = 12;                         // art px above the standing surface
const CELL_H = BODY + HEAD;              // 40
const CAP_W = 16;                        // each end
const TILE_W = 32;                       // the repeating middle
const CELL_W = CAP_W + TILE_W + CAP_W;   // 64

// Where each zone's current art lives on the artist's sheet, measured off it.
const SRC = [
  ['BASEMENT', 125, 164], ['DUNGEON', 182, 220], ['FOREST', 237, 273],
  ['SWAMP', 293, 338], ['DOWNTOWN', 345, 393], ['CITADEL', 401, 437],
  ['STORM', 455, 492], ['ABYSS', 509, 544], ['NEBULA', 562, 606],
  ['COSMOS', 610, 654], ['STARFIELD', 667, 703], ['ZENITH', 720, 757],
];
const SX0 = 233, SX1 = 500;
// The row of each band that the standing surface sits on, measured: the first nearly
// solid row from the top.
const SURFACE = [128, 183, 243, 297, 352, 401, 455, 518, 563, 619, 670, 721];

let sheetImg = null;
try { sheetImg = readPNG('assets/platform-sheet.png'); } catch { /* optional */ }
const src = (x, y) => {
  const i = (y * sheetImg.w + x) * sheetImg.ch;
  return [sheetImg.data[i], sheetImg.data[i + 1], sheetImg.data[i + 2]];
};

const BG = '#15101f', PANEL = '#221b36', DIM = '#8a8fa8', GOLD = '#ffe23d', WHITE = '#e8e4f0';
const CUT = '#5aa0ff', SURF = '#ff5a5a', TILEC = '#5ae678';

const LABEL = 172;
const ROW = CELL_H * MAG + 34;
const W = LABEL + CELL_W * MAG + 430;
const HEAD_H = 132;

const sheet = new HeadlessCanvas(W, HEAD_H + SRC.length * ROW + 30);
const g = sheet.getContext('2d');
g.fillStyle = BG;
g.fillRect(0, 0, sheet.width, sheet.height);
const text = (s, x, y, c = WHITE, sc = 1) => drawText(g, s, x, y, c, sc, 'left');

text('PLATFORM TEMPLATE - DRAW INSIDE THE CELLS', 10, 10, GOLD, 3);
[
  `EACH CELL IS ${CELL_W} x ${CELL_H} ART PIXELS, SHOWN AT ${MAG}X. ONE PIXEL HERE IS ONE PIXEL ON SCREEN.`,
  '',
  `LEFT CAP    x 0-${CAP_W - 1}      drawn once, at the left end of every platform`,
  `TILE        x ${CAP_W}-${CAP_W + TILE_W - 1}     REPEATED as many times as the width needs`,
  `RIGHT CAP   x ${CAP_W + TILE_W}-${CELL_W - 1}     drawn once, at the right end`,
  '',
  `THE RED LINE IS THE FLOOR. Its top row is where the player's boots rest: row ${HEAD}.`,
  `Below it is ${BODY} px of body, above it ${HEAD} px for anything that stands proud.`,
  '',
  'THE ONE RULE: the TILE must WRAP. Its left edge column is butted directly against its',
  'own right edge column, over and over. If they do not meet, the seam repeats every',
  `${TILE_W / PX} world units all the way up the tower. The caps have no such rule.`,
].forEach((l, i) => text(l, 10, 34 + i * 8, i < 2 ? DIM : (l.startsWith('THE ONE') ? GOLD : DIM)));

let y = HEAD_H;
SRC.forEach(([name, y0, y1], i) => {
  const th = THEMES[i];
  const ty = y + i * ROW;
  if (i % 2) { g.fillStyle = '#1b1530'; g.fillRect(0, ty - 6, W, ROW); }
  text(`${i + 1}. ${name}`, 10, ty + 4, th.accent || WHITE, 2);

  const cx = LABEL;
  // The cell, filled with the zone's own body colour so it is never drawn on black.
  g.fillStyle = PANEL;
  g.fillRect(cx, ty, CELL_W * MAG, CELL_H * MAG);

  // The existing art, squashed into the cell as a starting point: the whole strip's
  // width into the cell's width, and its surface row onto the cell's surface row.
  if (sheetImg) {
    const surf = SURFACE[i];
    const aboveSrc = surf - y0, belowSrc = y1 - surf + 1;
    for (let py = 0; py < CELL_H; py++) {
      // Above and below the surface are scaled SEPARATELY, so the floor lands on the
      // floor whatever proportion the drawing used.
      const rel = py - HEAD;
      const sy = rel < 0
        ? surf + Math.round((rel / HEAD) * aboveSrc)
        : surf + Math.round((rel / BODY) * belowSrc);
      if (sy < 0 || sy >= sheetImg.h) continue;
      for (let pxx = 0; pxx < CELL_W; pxx++) {
        // A SLICE of the strip, not the whole of it squashed in. The vertical scale is
        // about 1:1, so squeezing 267 source pixels into 64 turned every brick into a
        // vertical smear and made the guide useless as a guide.
        const sx = SX0 + 40 + pxx;
        const c = src(sx, sy);
        g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        g.fillRect(cx + pxx * MAG, ty + py * MAG, MAG, MAG);
      }
    }
  }

  // The three regions.
  const line = (x, col, w = 2) => { g.fillStyle = col; g.fillRect(cx + x * MAG - w / 2, ty, w, CELL_H * MAG); };
  g.globalAlpha = 0.85;
  line(CAP_W, CUT, 3);
  line(CAP_W + TILE_W, CUT, 3);
  g.globalAlpha = 1;
  // The tile outlined, because it is the piece with the rule on it.
  g.fillStyle = TILEC;
  g.fillRect(cx + CAP_W * MAG, ty, TILE_W * MAG, 2);
  g.fillRect(cx + CAP_W * MAG, ty + CELL_H * MAG - 2, TILE_W * MAG, 2);
  // The standing surface.
  g.fillStyle = SURF;
  g.fillRect(cx, ty + HEAD * MAG - 1, CELL_W * MAG, 2);

  const tx = cx + CELL_W * MAG + 20;
  text('LEFT CAP', tx, ty + 2, CUT);
  text(`${CAP_W} x ${CELL_H}`, tx, ty + 12, DIM);
  text('TILE  (must wrap)', tx + 120, ty + 2, TILEC);
  text(`${TILE_W} x ${CELL_H}`, tx + 120, ty + 12, DIM);
  text('RIGHT CAP', tx + 250, ty + 2, CUT);
  text(`${CAP_W} x ${CELL_H}`, tx + 250, ty + 12, DIM);
  text('FLOOR LINE', tx, ty + 30, SURF);
  text(`row ${HEAD} - boots rest on its top edge`, tx + 90, ty + 30, DIM);
});

fs.writeFileSync('platform-template.png', encodePNG(sheet));
console.log(`  platform-template.png  ${sheet.width}x${sheet.height}`);
console.log(`  cell ${CELL_W}x${CELL_H} art px = ${CELL_W / PX}x${CELL_H / PX} world units, ` +
  `body ${BODY} (PLAT_THICK ${PLAT_THICK}), head ${HEAD}`);
console.log(`  caps ${CAP_W}, tile ${TILE_W} (= ${TILE_W / PX} world units per repeat)`);
