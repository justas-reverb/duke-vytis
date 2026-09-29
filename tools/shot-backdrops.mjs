// Every background in the game, layer by layer, the way the game builds it.
//
//   node tools/shot-backdrops.mjs                 backdrops.png, all twelve zones
//   node tools/shot-backdrops.mjs --zone=FOREST   backdrop-FOREST.png, one zone, large
//
// A zone's background is its SKY gradient and three 256 x 256 tiled layers over it --
// FAR, MID, NEAR, scrolling at 12%, 22% and 34% of the camera. Each layer is the artist's
// PNG where one exists (src/render/bgart.js) and the zone's code painter otherwise
// (src/render/bgpaint/); the sheet says which.
//
// THE THING TO LOOK FOR IS THE SEAM. A layer repeats across the screen and up the tower
// forever, so each is drawn here twice over in both axes: if its edges do not meet, the
// seam is a cross through the middle of the block. The overview draws the composite that
// way at half size; --zone draws every layer that way at full size, which is what to use
// while painting one.

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
const ONE = flag('zone', null);

const B = await import('../src/render/backdrop.js');
const { THEMES } = await import('../src/game/themes.js');
const { drawText } = await import('../src/render/font.js');
const { BG_TILE } = await import('../src/render/bgart.js');

const T = BG_TILE;
const DIM = '#8a8fa8', GOLD = '#ffe23d', WHITE = '#e8e4f0';

function checker(g, x0, y0, w, h) {
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
    g.fillStyle = ((x + y) / 16) % 2 ? '#2a2438' : '#221d2e';
    g.fillRect(x0 + x, y0 + y, Math.min(16, w - x), Math.min(16, h - y));
  }
}
/** The sky gradient for a block: the upper window of it, which is what sits behind play. */
function sky(g, th, x0, y0, w, h) {
  const s = B.makeSky(th.sky);
  g.drawImage(s, 0, 0, 1, s.height * (h / (T * 2)), x0, y0, w, h);
}
/** A tile drawn n x n times at scale k, so any seam falls inside the block. */
function tiled(g, c, x0, y0, n, k) {
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    g.drawImage(c, 0, 0, c.width, c.height, x0 + tx * T * k, y0 + ty * T * k, T * k, T * k);
  }
}
function zoneLayers(th, i) {
  const out = {};
  for (const [k] of B.LAYERS) out[k] = B.layerTile(th, i, k);
  return out;
}
const src = (l) => (l.art ? 'ART' : 'PAINTED');

if (ONE) {
  const i = THEMES.findIndex((t) => t.name === String(ONE).toUpperCase());
  if (i < 0) { console.error(`no zone ${ONE}; zones: ${THEMES.map((t) => t.name).join(' ')}`); process.exit(1); }
  const th = THEMES[i];
  const L = zoneLayers(th, i);
  const BLK = T * 2, GAP = 24, TOP = 60;
  const W = 4 * BLK + 5 * GAP, H = TOP + BLK + 40;
  const sheet = new HeadlessCanvas(W, H);
  const g = sheet.getContext('2d');
  g.fillStyle = '#15101f'; g.fillRect(0, 0, W, H);
  drawText(g, `${i + 1}. ${th.name} - EACH LAYER 2 X 2, SO A SEAM IS A CROSS IN THE MIDDLE`, GAP, 14, GOLD, 2, 'left');
  B.LAYERS.forEach(([k, rate], j) => {
    const x0 = GAP + j * (BLK + GAP);
    drawText(g, `${k.toUpperCase()}  ${Math.round(rate * 100)}%  ${src(L[k])}`, x0, TOP - 16, WHITE, 1, 'left');
    checker(g, x0, TOP, BLK, BLK);
    tiled(g, L[k].canvas, x0, TOP, 2, 1);
  });
  const xc = GAP + 3 * (BLK + GAP);
  drawText(g, 'COMPOSITE OVER THE SKY', xc, TOP - 16, WHITE, 1, 'left');
  sky(g, th, xc, TOP, BLK, BLK);
  for (const [k] of B.LAYERS) tiled(g, L[k].canvas, xc, TOP, 2, 1);
  const out = `backdrop-${th.name}.png`;
  fs.writeFileSync(out, encodePNG(sheet));
  console.log(`  ${out}  ${W}x${H}  far ${src(L.far)}, mid ${src(L.mid)}, near ${src(L.near)}`);
  process.exit(0);
}

const LABEL = 200, GAP = 16, ROW = T + 46, TOP = 70;
const W = LABEL + 4 * (T + GAP) + GAP;
const H = TOP + THEMES.length * ROW;
const sheet = new HeadlessCanvas(W, H);
const g = sheet.getContext('2d');
g.fillStyle = '#15101f'; g.fillRect(0, 0, W, H);
drawText(g, 'BACKGROUNDS - SKY + FAR / MID / NEAR, AS THE GAME BUILDS THEM', 12, 12, GOLD, 2, 'left');
drawText(g, 'LAYERS AT FULL SIZE OVER A CHECKER (TRANSPARENCY). COMPOSITE 2 X 2 AT HALF SIZE: A SEAM IS A CROSS IN ITS MIDDLE.', 12, 40, DIM, 1, 'left');
drawText(g, 'ART = THE ARTIST\'S PNG FROM assets/backgrounds/. PAINTED = THE ZONE\'S CODE PAINTER IN src/render/bgpaint/.', 12, 52, DIM, 1, 'left');
THEMES.forEach((th, i) => {
  const y0 = TOP + i * ROW + 16;
  if (i % 2) { g.fillStyle = '#1b1530'; g.fillRect(0, y0 - 18, W, ROW); }
  drawText(g, `${i + 1}. ${th.name}`, 12, y0, th.accent || WHITE, 2, 'left');
  const L = zoneLayers(th, i);
  B.LAYERS.forEach(([k, rate], j) => {
    const x0 = LABEL + j * (T + GAP);
    drawText(g, `${k.toUpperCase()} ${Math.round(rate * 100)}% ${src(L[k])}`, x0, y0 - 12, WHITE, 1, 'left');
    checker(g, x0, y0, T, T);
    tiled(g, L[k].canvas, x0, y0, 1, 1);
  });
  const xc = LABEL + 3 * (T + GAP);
  drawText(g, 'COMPOSITE 2X2', xc, y0 - 12, WHITE, 1, 'left');
  sky(g, th, xc, y0, T, T);
  for (const [k] of B.LAYERS) tiled(g, L[k].canvas, xc, y0, 2, 0.5);
});
fs.writeFileSync('backdrops.png', encodePNG(sheet));
console.log(`  backdrops.png  ${W}x${H}`);
