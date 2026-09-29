// Every platform in the game, from the art the game actually draws.
//
//   node tools/shot-platsheet.mjs                     platsheet.png
//   node tools/shot-platsheet.mjs --mag=6 --tiles=5
//   node tools/shot-platsheet.mjs --out=file.png
//
// WHAT THIS SHOWS, AND WHY IT CHANGED
//
// It used to show thirteen procedural materials and nine caps, because that is what a
// platform WAS: a painter function and a cap function over four colours a zone supplied.
// That is gone. A platform is three pieces of drawn art now -- a left cap, a tile that
// repeats, and a right cap -- so this shows those, laid out the way the renderer lays
// them out.
//
// THE COLUMN THAT MATTERS is the last one. The tile is butted against a copy of itself
// over and over, so its left edge column has to meet its own right edge column. Nothing
// about a PNG makes that true, and a tile that fails it repeats the seam every eight
// world units all the way up a tower that never stops scrolling. The number is the mean
// difference between those two columns: under ten is seamless, over thirty is a join you
// can see.
//
// tools/platform-template.mjs prints the sheet to draw INTO. This one shows what came
// back from it.

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
const MAG = Number(flag('mag', 5));
const TILES = Number(flag('tiles', 4));
// Its own name, platsheet.png. It used to default to platforms.png, the same file
// tools/shot-platforms.mjs writes, so whichever ran second silently replaced the other's
// sheet in the current directory -- which is how a reviewer ends up looking at the wrong
// one and believing it. --out still names any file.
const OUT = String(flag('out', 'platsheet.png'));

const P = await import('../src/render/platsprites.js');
const { THEMES } = await import('../src/game/themes.js');
const { drawText, GH } = await import('../src/render/font.js');
const { PLAT_THICK, PX } = await import('../src/game/constants.js');

const KINDS = [
  ['normal', 'The ordinary platform. Most of the tower'],
  ['wide', 'A 6% chance. Room to build speed, or to recover a botched landing'],
  ['checkpoint', 'Every 100 floors. Wide on purpose -- it is where a run is saved'],
  ['ground', 'Floor zero only. Spans the whole shaft'],
];

const BG = '#15101f', PANEL = '#1b1530', DIM = '#8a8fa8', GOLD = '#ffe23d', WHITE = '#e8e4f0';
const GOODC = '#5ae678', BADC = '#ff6b6b';

/** Blit a canvas at MAG, runs of equal colour at a time. Returns its drawn width. */
function blit(g, src, dx, dy) {
  const px = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  for (let y = 0; y < src.height; y++) {
    let x = 0;
    while (x < src.width) {
      const i = (y * src.width + x) * 4;
      if (px[i + 3] <= 8) { x++; continue; }
      let run = 1;
      const same = () => {
        const j = (y * src.width + x + run) * 4;
        return px[j + 3] > 8 && px[j] === px[i] && px[j + 1] === px[i + 1] && px[j + 2] === px[i + 2];
      };
      while (x + run < src.width && same()) run++;
      g.fillStyle = `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`;
      g.fillRect(dx + x * MAG, dy + y * MAG, run * MAG, MAG);
      x += run;
    }
  }
  return src.width * MAG;
}

const LEDGE_W = (P.CAP_W * 2 + P.TILE_W * TILES) * MAG;
const LABEL = 150;
const ROW = P.CELL_H * MAG + 34;
const W = LABEL + LEDGE_W + 360;
// The four lines under the title are drawn at scale 2, so each is GH * 2 = 14 pixels tall.
// They were stepped 13 apart, one pixel LESS than their own height, so every line printed
// its top row into the descenders of the line above and the block read as a smear. Stepped
// from the font's own glyph height now rather than from a number typed here, so a change to
// the font cannot reintroduce it; the header box is measured from the same arithmetic.
const SUB = 2, SUB_STEP = GH * SUB + 5, SUB_TOP = 42, SUBS = 4;
const HEAD_H = SUB_TOP + SUBS * SUB_STEP + 8;

const sheet = new HeadlessCanvas(W, HEAD_H + THEMES.length * ROW + KINDS.length * 26 + 80);
const g = sheet.getContext('2d');
g.fillStyle = BG;
g.fillRect(0, 0, sheet.width, sheet.height);
const text = (s, x, y, c = WHITE, sc = 1) => drawText(g, s, x, y, c, sc, 'left');

text('PLATFORMS - THE ART THE GAME DRAWS', 10, 8, GOLD, 3);
[
  `LEFT CAP ${P.CAP_W}px + TILE ${P.TILE_W}px REPEATED + RIGHT CAP ${P.CAP_W}px, ${P.CELL_H}px TALL.`,
  `ONE ART PIXEL IS ONE SCREEN PIXEL. THE BODY IS ${P.BODY}px = PLAT_THICK ${PLAT_THICK} WORLD UNITS AT PX ${PX}.`,
  'RED LINE = WHERE BOOTS REST. BLUE LINES = THE TILE JOINS.',
  'THE LAST COLUMN IS WHETHER THE TILE WRAPS, WHICH IS THE ONLY RULE A TILE HAS.',
].forEach((l, i) => text(l, 10, SUB_TOP + i * SUB_STEP, DIM, SUB));

let y = HEAD_H;
THEMES.forEach((th, i) => {
  const art = P.platArt(th.name);
  const ty = y + i * ROW;
  if (i % 2) { g.fillStyle = PANEL; g.fillRect(0, ty - 6, W, ROW); }
  text(`${i + 1}. ${th.name}`, 10, ty + 4, th.accent || WHITE, 2);

  let x = LABEL;
  x += blit(g, art.left, x, ty);
  for (let t = 0; t < TILES; t++) x += blit(g, art.tile, x, ty);
  blit(g, art.right, x, ty);

  g.fillStyle = '#ff5a5a';
  g.fillRect(LABEL, ty + P.HEAD * MAG - 1, LEDGE_W, 1);
  g.globalAlpha = 0.45;
  g.fillStyle = '#5aa0ff';
  for (let t = 0; t <= TILES; t++) {
    g.fillRect(LABEL + (P.CAP_W + t * P.TILE_W) * MAG, ty, 1, P.CELL_H * MAG);
  }
  g.globalAlpha = 1;

  const tx = LABEL + LEDGE_W + 18;
  const ok = art.wrap < 10;
  const rough = art.wrap < 30;
  text(ok ? 'TILE WRAPS' : (rough ? 'ROUGH JOIN' : 'SEAM'), tx, ty + 4,
    ok ? GOODC : (rough ? GOLD : BADC), 2);
  text(`edge difference ${art.wrap.toFixed(1)}`, tx, ty + 26, DIM);
  if (!ok) text(`a join every ${P.TILE_W / PX} world units`, tx, ty + 38, DIM);
});

y += THEMES.length * ROW + 20;
text('THE FOUR KINDS THE GENERATOR MAKES - SIZE AND ROLE, NOT ART', 10, y, GOLD, 2);
KINDS.forEach(([k, why], i) => {
  text(k.toUpperCase(), 14, y + 24 + i * 24, WHITE, 2);
  text(why, LABEL, y + 26 + i * 24, DIM);
});

fs.writeFileSync(OUT, encodePNG(sheet));
console.log(`  ${OUT}  ${sheet.width}x${sheet.height}`);
const bad = THEMES.filter((t) => P.platArt(t.name).wrap >= 30).map((t) => t.name);
console.log(`  ${THEMES.length} zones; ${THEMES.length - bad.length} tile cleanly` +
  (bad.length ? `, seams on ${bad.join(', ')}` : ''));
