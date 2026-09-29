// One ledge per width remainder, per zone, through the REAL ledge drawing code.
//
//   node tools/shot-platwidths.mjs                          all twelve zones
//   node tools/shot-platwidths.mjs --zones=BASEMENT,DUNGEON --scale=4 --out=<png>
//   node tools/shot-platwidths.mjs --from=30                widths 30..37 instead of 24..31
//   node tools/shot-platwidths.mjs --decor                  with the zone's furniture
//
// WHY EIGHT WIDTHS. Renderer.drawPlatforms lays a ledge as left cap, whole tiles, a PART
// tile cut from the tile's left, and right cap. Ledge widths are whole world units, a tile
// is 8 of them, so the part tile takes one of eight sizes -- 0, 4, 8, ... 28 art px -- and
// each size cuts the tile at a different column. A discrete object in the tile (a post, a
// bolt, a skull) that straddles one of those cuts is sliced on one ledge in eight, and a
// single long ledge in a sheet never shows it: DOWNTOWN's first post was cut in half on
// 12.5% of its ledges while every sheet looked right. Eight consecutive widths show every
// cut once (tools/platpaint/index.mjs, rule 4).
//
// Drawn at zoom 1 -- one art pixel per backing pixel, the scale the ledges must read at --
// over the zone's own backdrop, by calling drawPlatforms with a stand-in tower that holds
// only these eight ledges, so the caps, the cuts and the shadow under each are exactly the
// game's. None of them is floor 0, which the renderer draws as the start floor instead.
// Under each ledge: its width in world units and the part tile's size, and ticks where the
// renderer joins pieces -- grey at a whole tile's edge, red where the part tile meets the
// right cap, which is the cut that slices.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

const { Renderer } = await import('../src/render/renderer.js');
const { THEMES } = await import('../src/game/themes.js');
const { SW, SH, PX, VW, VH, CX, FLOOR_H } = await import('../src/game/constants.js');
const { CAP_W, TILE_W, HEAD, BODY } = await import('../src/render/platsprites.js');
const { drawText } = await import('../src/render/font.js');

const SCALE = Number(flag('scale', 2));
const OUT = String(flag('out', 'platwidths.png'));
const FROM = Number(flag('from', 24));
const DECOR = !!flag('decor', false);
const ZOOM = 1;
const want = String(flag('zones', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const themes = THEMES.map((t, i) => ({ t, i })).filter(({ t }) => !want.length || want.includes(t.name));
if (!themes.length) throw new Error(`--zones: none of ${want.join(', ')} is a zone`);

const k = ZOOM * PX;                          // backing px per world unit; 4 = one per art px
const u = 1 / PX;                             // one art pixel in world units
const capU = CAP_W * u, tileU = TILE_W * u;   // 4 and 8 world units
const GAP = 6;                                // world units between ledges
// Above the surface: the head rows and a margin; with furniture, the tallest thing any zone
// stands on a ledge (FOREST's tree, 136 art px). Below: the body, the shadow and a margin;
// with furniture, BASEMENT's cobweb hangs about 60 under the surface.
const ABOVE = DECOR ? 150 : HEAD + 12;
const BELOW = DECOR ? BODY + 50 : BODY + 12;
const LABEL = 15;

// The stand-in world. Eight ledges side by side at one height, floors 15-22 of a view
// centred on them; the renderer asks the tower for every floor in view and gets these.
const Y = 20 * FLOOR_H;
const viewH = VH / ZOOM;
const camY = Y - viewH / 2;
const ledges = [];
let x = 8;
for (let j = 0; j < 8; j++) {
  const w = FROM + j;
  ledges.push({ n: 15 + j, x, y: Y, w, kind: 'normal' });
  x += w + GAP;
}
const spanU = x - GAP + 8;
const CROP_W = Math.min(SW, Math.round(spanU * k));
const ROW_H = ABOVE + BELOW + LABEL;

const canvas = new HeadlessCanvas(SW, SH);
const renderer = new Renderer(canvas);
renderer.applySettings({
  scaleMode: 'integer', scanlines: false, particles: 'off',
  streaks: false, shake: false, trails: false, showFps: false, music: false,
});
renderer.t = 1.3;                             // the furniture's clock, pinned as the other sheets pin it
const ctx = canvas.getContext('2d');

const sheet = new HeadlessCanvas(CROP_W, themes.length * ROW_H);
const out = sheet.getContext('2d');
out.fillStyle = '#15101f';
out.fillRect(0, 0, sheet.width, sheet.height);

for (const [row, { t: theme, i }] of themes.entries()) {
  // The backdrop of this zone behind them, as the game draws it at this camera.
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  renderer.backdrop.draw(ctx, camY * ZOOM, i, theme, null, 0);
  const game = {
    zoom: ZOOM, zoomView: ZOOM, viewH, camY,
    // An index with no furniture registered unless --decor: drawDecor then draws nothing.
    themeIndex: DECOR ? i : -1,
    arenaHalf: VW / 2, arenaHalfView: VW / 2,
    tower: { peek: (n) => ledges.find((l) => l.n === n) || null },
  };
  renderer.setWorldTransform(ctx, game);
  renderer.drawPlatforms(ctx, game, theme);

  // The surface's screen row, from the transform setWorldTransform installed.
  const viewLeft = CX - (VW / ZOOM) / 2;
  const tx = Math.round(-viewLeft * k), ty = Math.round(SH + camY * k);
  const sy = ty - Y * k;
  const img = ctx.getImageData(0, sy - ABOVE, CROP_W, ABOVE + BELOW).data;
  const oy = row * ROW_H;
  for (let yy = 0; yy < ABOVE + BELOW; yy++) {
    let xx = 0;
    while (xx < CROP_W) {
      const o = (yy * CROP_W + xx) * 4;
      let run = 1;
      while (xx + run < CROP_W) {
        const q = o + run * 4;
        if (img[q] !== img[o] || img[q + 1] !== img[o + 1] || img[q + 2] !== img[o + 2]) break;
        run++;
      }
      out.fillStyle = `rgb(${img[o]},${img[o + 1]},${img[o + 2]})`;
      out.fillRect(xx, oy + yy, run, 1);
      xx += run;
    }
  }

  // The zone's name on its own picture, top left: printed in the strip under it, it sat
  // against the next zone's picture and read as that one's label.
  out.fillStyle = '#15101f';
  out.fillRect(0, oy, theme.name.length * 6 + 5, 11);
  drawText(out, theme.name, 2, oy + 2, theme.accent || '#ffe23d', 1, 'left');
  // Widths and joins, in the strip under the picture.
  const ly = oy + ABOVE + BELOW;
  out.fillStyle = '#15101f';
  out.fillRect(0, ly, CROP_W, LABEL);
  for (const l of ledges) {
    const lx = Math.round(tx + l.x * k);
    const mid = l.w - 2 * Math.min(capU, l.w / 2);
    const part = Math.round((mid % tileU) * PX);
    drawText(out, `${l.w}U +${part}`, lx, ly + 5, '#8a8fa8', 1, 'left');
    // A tick at every join the renderer makes: after the left cap, between whole tiles,
    // and before the right cap -- red there, where the part tile's cut meets the cap.
    const joins = [];
    for (let s = 0; s < mid - 1e-9; s += tileU) joins.push(capU + s);
    const capAt = l.w - capU;
    out.fillStyle = '#5c6078';
    for (const j of joins) out.fillRect(Math.round(tx + (l.x + j) * k), ly, 1, 2);
    out.fillStyle = part ? '#ff5a5a' : '#5c6078';
    out.fillRect(Math.round(tx + (l.x + capAt) * k), ly, 1, 3);
  }
}

fs.writeFileSync(OUT, encodePNG(SCALE > 1 ? upscale(sheet, SCALE) : sheet));
console.log(`  ${themes.map(({ t }) => t.name).join(', ')} -> ${OUT}  ${sheet.width * SCALE}x${sheet.height * SCALE}`);
console.log(`  widths ${FROM}-${FROM + 7} world units: part tiles ` +
  ledges.map((l) => Math.round(((l.w - 2 * capU) % tileU) * PX)).join(', ') +
  ` art px; zoom ${ZOOM}, one art pixel per backing pixel, x${SCALE}` + (DECOR ? ', with furniture' : ''));
