// The sheet to draw backgrounds INTO: three layers per zone, the exact size, the rules on it.
//
//   node tools/background-template.mjs          background-template.png
//
// WHAT A BACKGROUND IS, for the person drawing one.
//
// Each zone's background is three TILES stacked behind the play, each 256x256 art pixels:
//
//   FAR   the deepest layer. Scrolls at 12% of the camera. Usually fills the tile.
//   MID   in between.         Scrolls at 22%. Usually partly transparent.
//   NEAR  the closest layer.  Scrolls at 34%. Usually partly transparent.
//
// behind all three, the zone's SKY: a vertical gradient between two colours. A tile spans
// 128 of the game's 480-unit width -- a little over a quarter of the screen -- and one art
// pixel is two screen pixels, so these are drawn at twice the detail of the old painted
// backgrounds and half the density of the sprites, which is right for things that are far
// away.
//
// THE ONE HARD RULE: EVERY TILE WRAPS, BOTH WAYS. It is repeated across the screen and up
// the tower forever, so its left edge must continue into its own right edge and its top
// edge into its own bottom edge. A tile that does not wrap puts a seam on the screen every
// 128 units, sideways and upward, scrolling -- the most visible thing in the game. The
// first platform art came back as twelve beautiful strips that could not tile; this sheet
// exists so the backgrounds do not.
//
// Deliver each tile as its own PNG in assets/backgrounds/, named <ZONE>-far.png,
// <ZONE>-mid.png and <ZONE>-near.png (ZONE in capitals, as on the sheet), 256x256, with
// transparency where the layer behind should show. A zone or a layer that is missing is
// drawn by the game's own painter until it arrives, so they can be delivered one at a time.
// tools/import-backgrounds.mjs checks size and wrap and says what it found.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const { THEMES } = await import('../src/game/themes.js');
const B = await import('../src/render/backdrop.js');
const { drawText } = await import('../src/render/font.js');

export const BG_TILE = 256;
const LAYERS = [
  ['FAR', '12% PARALLAX', 'DEEPEST. SMALLEST SCALE, LOWEST CONTRAST. MAY FILL THE TILE.'],
  ['MID', '22% PARALLAX', 'IN BETWEEN. MID SCALE. TRANSPARENT WHERE FAR SHOWS.'],
  ['NEAR', '34% PARALLAX', 'CLOSEST. BIGGEST SHAPES. TRANSPARENT WHERE MID SHOWS.'],
];

// What each zone is meant to be, from the user's backgrounds board
// (assets/backgrounds-reference.webp).
const BOARD = [
  ['BRICKS', 'PURPLE COURSED RUNNING-BOND BRICK WALL, VISIBLE MORTAR.', 'DARK, SOLID, ENCLOSING. SMALL BRICKS FAR, BIG ROUNDED ONES NEAR.'],
  ['CRYPT', 'DARK BLUE-GREY ASHLAR WITH RECESSED CROSS-SHAPED', 'BURIAL NICHES. COLD, SOLEMN AND ANCIENT.'],
  ['TREES', 'CANOPY IN SILHOUETTE WITH VERTICAL TRUNKS OF MIXED', 'THICKNESS. LAYERED, DEEP AND ENCLOSING.'],
  ['DRIPS', 'HANGING MOSS AND VERTICAL RUN-OFF STREAKS OVER A', 'DARK BOG. DANK, MISTY AND FOREBODING.'],
  ['WINDOWS', 'A NIGHT WALL OF SQUARE WINDOWS IN A REGULAR GRID,', 'SOME LIT PALE LAVENDER, SOME DARK. FAR GRID, NEAR GRID.'],
  ['ARCHES', 'TALL REPEATING BLUE STONE ARCHES AND NICHE WINDOWS.', 'MONUMENTAL INTERIOR. FAR ARCHES, NEAR ARCHES.'],
  ['CLOUDS', 'SOFT-EDGED PURPLE-GREY CLOUD PUFFS, NO HARD OUTLINES.', 'BANKED, LAYERED VAPOUR.'],
  ['VOIDS', 'A NEARLY EMPTY DARK FIELD: SPARSE DARK-PURPLE SQUARES', 'AND TINY PLUS SHAPES. STRUCTURE YOU CAN BARELY SEE.'],
  ['SWIRLS', 'MAGENTA-PURPLE GLOWING GAS SWIRLS AND SPECKS, LIT FROM', 'INSIDE. NO STRAIGHT EDGES.'],
  ['STARS', 'SPARSE SHARP WHITE STARS ON DEEP BLUE-BLACK.', 'A PATTERN OF POINTS OVER DEEP BLUE SPACE.'],
  ['STARS', 'SPARSE SHARP WHITE STARS ON DEEP GREEN-BLACK.', 'A PATTERN OF POINTS OVER DEEP GREEN SPACE.'],
  ['BEAMS', 'VERTICAL PALE BLUE-WHITE SHAFTS OF LIGHT: THE', 'ARCHITECTURE OF THE TOWER TOP. GLOWING.'],
];

const T = BG_TILE;
const LABEL = 400;
const GAP = 26;
const ROW = T + 70;
const HEAD_H = 300;
const W = LABEL + 3 * (T + GAP) + 20;
const H = HEAD_H + THEMES.length * ROW;

const sheet = new HeadlessCanvas(W, H);
const g = sheet.getContext('2d');
g.fillStyle = '#15101f';
g.fillRect(0, 0, W, H);
const text = (s, x, y, c = '#e8e4f0', sc = 1) => drawText(g, s, x, y, c, sc, 'left');

text('BACKGROUNDS - THE TEMPLATE TO DRAW INTO', 12, 12, '#ffe23d', 3);
[
  ['THREE LAYERS PER ZONE - FAR, MID, NEAR - EACH ONE 256 X 256 PNG TILE,', '#e8e4f0'],
  ['WITH THE ZONE\'S SKY GRADIENT BEHIND ALL THREE.', '#e8e4f0'],
  ['EVERY TILE MUST WRAP BOTH WAYS: LEFT EDGE INTO RIGHT, TOP INTO BOTTOM.', '#ff8a8a'],
  ['USE TRANSPARENCY WHERE THE LAYER BEHIND SHOULD SHOW.', '#e8e4f0'],
  ['NO TEXT, NO LEDGES, NO BRIGHT HORIZONTAL LINES: ANYTHING THAT LOOKS', '#e8e4f0'],
  ['LIKE SOMETHING TO STAND ON WILL BE MISTAKEN FOR A PLATFORM.', '#e8e4f0'],
  ['KEEP IT DARK AND QUIET: THE DUKE AND THE LEDGES MUST READ IN FRONT.', '#e8e4f0'],
  ['DELIVER assets/backgrounds/<ZONE>-far.png, -mid.png, -near.png', '#8fd0ff'],
  ['MISSING ONES FALL BACK TO THE PAINTED VERSION, SO SEND THEM AS THEY COME.', '#8fd0ff'],
].forEach(([l, c], i) => text(l, 12, 46 + i * 20, c, 2));
text('ON SCREEN ONE TILE IS 128 OF 480 UNITS WIDE; ONE ART PIXEL = 2 SCREEN PIXELS. THE FAINT PICTURE IN FAR AND NEAR IS THE OLD', 12, 232, '#8a8fa8', 1);
text('PRE-REPAINT BACKGROUND, FOR SCALE ONLY. THE CHECKER IS TRANSPARENCY. THE RED TICKS MARK EDGES THAT MUST MEET THEIR OPPOSITE.', 12, 244, '#8a8fa8', 1);

// A cell: checker for transparency, a guide tile faintly for scale, and the wrap marks on
// all four edges. The guide is the OLD single-tile painter (makeTile, bgpaint/legacy.js),
// in FAR and NEAR only -- not the zone's current three-layer painter in bgpaint/.
function cell(x0, y0, guide) {
  for (let y = 0; y < T; y += 16) {
    for (let x = 0; x < T; x += 16) {
      g.fillStyle = ((x + y) / 16) % 2 ? '#2a2438' : '#221d2e';
      g.fillRect(x0 + x, y0 + y, 16, 16);
    }
  }
  if (guide) {
    g.globalAlpha = 0.35;
    g.drawImage(guide, 0, 0, guide.width, guide.height, x0, y0, T, T);
    g.globalAlpha = 1;
  }
  g.fillStyle = '#ff5a5a';
  for (let k = 8; k < T; k += 32) {
    g.fillRect(x0 - 5, y0 + k, 4, 2);          // left edge  -> meets right
    g.fillRect(x0 + T + 1, y0 + k, 4, 2);      // right edge
    g.fillRect(x0 + k, y0 - 5, 2, 4);          // top edge   -> meets bottom
    g.fillRect(x0 + k, y0 + T + 1, 2, 4);      // bottom edge
  }
  g.fillStyle = '#5a4f78';
  g.fillRect(x0, y0, T, 1); g.fillRect(x0, y0 + T - 1, T, 1);
  g.fillRect(x0, y0, 1, T); g.fillRect(x0 + T - 1, y0, 1, T);
}

THEMES.forEach((th, i) => {
  const y0 = HEAD_H + i * ROW;
  if (i % 2) { g.fillStyle = '#1b1530'; g.fillRect(0, y0 - 30, W, ROW); }
  const style = B.STYLE_BY_THEME[i % B.STYLE_BY_THEME.length];
  const [motif, l1, l2] = BOARD[i];
  text(`${i + 1}. ${th.name}`, 12, y0, th.accent || '#fff', 2);
  text(motif, 12, y0 + 22, '#c8c4d8', 2);
  text(l1, 12, y0 + 50, '#b8b4c8', 1);
  text(l2, 12, y0 + 62, '#b8b4c8', 1);
  text('FILES:', 12, y0 + 86, '#8a8fa8', 1);
  ['far', 'mid', 'near'].forEach((k, j) => text(`${th.name}-${k}.png`, 12, y0 + 98 + j * 12, '#8fd0ff', 1));
  text('ZONE COLOURS:', 12, y0 + 146, '#8a8fa8', 1);
  [[th.sky[0], 'SKY TOP'], [th.sky[1], 'SKY LOW'], [th.bgFar, 'FAR'], [th.bgNear, 'NEAR']].forEach(([c, n], j) => {
    g.fillStyle = c;
    g.fillRect(12 + j * 70, y0 + 160, 60, 24);
    text(n, 12 + j * 70, y0 + 190, '#8a8fa8', 1);
    text(c.toUpperCase(), 12 + j * 70, y0 + 202, '#5a5f78', 1);
  });

  const far = B.makeTile(style, th.bgFar, 0x51ed + i * 7919);
  const near = B.makeTile(style, th.bgNear, 0x9e37 + i * 104729);
  LAYERS.forEach(([name, par, note], j) => {
    const x0 = LABEL + j * (T + GAP);
    text(`${name}  ${par}`, x0, y0 - 18, '#ffffff', 1);
    cell(x0, y0, j === 0 ? far : j === 2 ? near : null);
    text(note.slice(0, 44), x0, y0 + T + 8, '#5a5f78', 1);
    if (note.length > 44) text(note.slice(44).trim(), x0, y0 + T + 20, '#5a5f78', 1);
  });
});

fs.writeFileSync('background-template.png', encodePNG(sheet));
console.log(`  background-template.png  ${W}x${H}  12 zones x FAR/MID/NEAR, ${T}x${T} each`);
