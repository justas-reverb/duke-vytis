// The eye candy, element by element, with how each is to be redrawn.
//
//   node tools/decor-sheet.mjs              decor-elements.png
//
// FOR THE ARTIST REDRAWING THE PLATFORM FURNITURE. No platforms on this sheet -- only the
// things that stand on, hang from or float over a ledge, each alone. For each element:
//
//   LEFT   the element as the game draws it NOW, at its real on-screen size (shown 2x):
//          the sprite from src/render/decor.js, whichever it is -- the artist's PNG or the
//          zone's redraw in code (every element has one since 2026-09-22; the old
//          world-unit painters, four times chunkier, were the placeholders until then).
//   RIGHT  the box to redraw it in, the SAME size on screen but gridded at the new
//          resolution -- one art pixel per screen pixel, the Duke's own scale -- with the
//          current drawing faintly inside for reference. The red line is the walking
//          surface; for things that hang, a blue one is the underside the zone's TILE draws,
//          which is where the game hangs them from (decor.js undersideFor).
//   BELOW  the size in art pixels, how it is anchored, how many animation frames and
//          variants it wants, and what to change so it belongs with the new art.
//
// Every number and every note comes from the registry, src/render/decorpaint/ -- one module
// per zone -- which the game draws from too, so the sheet cannot disagree with the game. It
// used to carry its own copy of all of it, and a draw closure per element feeding the old
// painters a scripted random stream; those closures are the placeholders in the zone
// modules now.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const { THEMES } = await import('../src/game/themes.js');
const { PX, FLOOR_H, PLAT_THICK } = await import('../src/game/constants.js');
const D = await import('../src/render/decor.js');
const { allElements } = await import('../src/render/decorpaint/index.js');
const { drawText } = await import('../src/render/font.js');

const MAG = 2;                 // sheet pixels per screen pixel
// Where a hanging box starts, in art px below the surface: the underside the zone's tile
// DRAWS, lapped one row, exactly as the game hangs it. This used to be PLAT_THICK for every
// zone, so the crypt's manacle hung 13 px lower on this sheet than in the game.
const hangTop = (e) => D.undersideFor(e.zone) - D.HANG_LAP;
const GAP_PX = (FLOOR_H - PLAT_THICK) * PX;   // clear height between ledges, art px

const TH = (name) => THEMES.find((t) => t.name === name);

const E = allElements().map(({ zone, key, e }) => ({
  zone, key, name: e.name, box: e.box, anchor: e.anchor, lift: e.lift || 0,
  frames: e.frames, variants: e.variants, notes: e.notes || [],
}));

// --- layout -------------------------------------------------------------------------
const PADX = 18;
const cellW = (e) => Math.max(e.box[0] * MAG, 60);
// In art pixels, the height of the whole cell: for a hanging thing, the ledge body (surface
// to underside) plus the box below it; for a floating thing, its lift plus the box.
const cellArt = (e) => (e.anchor === 'hang' ? hangTop(e) : e.anchor === 'float' ? e.lift : 0) + e.box[1];
const cellH = (e) => cellArt(e) * MAG + 20;
const blockW = (e) => Math.max(cellW(e) * 2 + 16, 250);
const HEAD_H = 200;
const zones = [...new Set(E.map((e) => e.zone))];
const W = 2000;

// Pack each zone's elements into lines that fit the width.
const layout = [];
let y = HEAD_H;
for (const z of zones) {
  const items = E.filter((e) => e.zone === z);
  let x = 190, lineH = 0, lineY = y + 30;
  const placed = [];
  for (const e of items) {
    const bw = blockW(e), bh = Math.max(...items.map(cellH)) + 90;
    if (x + bw > W - PADX) { x = 190; lineY += lineH; lineH = 0; }
    placed.push({ e, x, y: lineY });
    x += bw + PADX;
    lineH = Math.max(lineH, bh);
  }
  layout.push({ zone: z, y, placed });
  y = lineY + lineH + 20;
}
const H = y + 20;

const sheet = new HeadlessCanvas(W, H);
const g = sheet.getContext('2d');
g.fillStyle = '#15101f'; g.fillRect(0, 0, W, H);
const text = (s, x, yy, c = '#e8e4f0', sc = 1) => drawText(g, s, x, yy, c, sc, 'left');

text('EYE CANDY - EVERY ELEMENT ALONE, AND HOW TO REDRAW IT', 16, 12, '#ffe23d', 3);
[
  ['LEFT: THE ELEMENT AS THE GAME DRAWS IT NOW, ALONE, AT ITS REAL SIZE ON SCREEN (SHOWN 2X).', '#e8e4f0'],
  ['RIGHT: THE BOX TO REDRAW IT IN - SAME SIZE ON SCREEN, GRIDDED AT ONE ART PIXEL PER SCREEN PIXEL,', '#e8e4f0'],
  ['   FOUR TIMES FINER THAN THE OLD PAINTERS: THE DUKE\'S OWN SCALE. THE CURRENT DRAWING IS FAINT INSIDE.', '#e8e4f0'],
  [`RED LINE: THE WALKING SURFACE. BLUE LINE: THE UNDERSIDE THE TILE DRAWS (${hangTop({ zone: 'DUNGEON' })} PX DOWN IN THE CRYPT), FOR HANGING THINGS.`, '#ff8a8a'],
  [`MATCH THE NEW ART: 1-PX DARK OUTLINE AND SHADED FORMS LIKE THE DUKE AND COMPANIONS, THE ZONE'S BACKGROUND`, '#8fd0ff'],
  ['   PALETTE, A 1-2 PX CONTACT SHADOW UNDER STANDING THINGS. TRANSPARENT PNG. NOTHING WIDER THAN 96 PX', '#8fd0ff'],
  [`   (THE NARROWEST LEDGE), NOTHING BRIGHT ALONG THE BOTTOM ROW. CLEAR HEIGHT BETWEEN LEDGES: ${GAP_PX} PX.`, '#8fd0ff'],
  ['ONE PNG PER ELEMENT: FRAMES SIDE BY SIDE, VARIANTS STACKED, NAMED <ZONE>-<ELEMENT>.PNG (E.G. DUNGEON-WALL-TORCH.PNG).', '#8a8fa8'],
].forEach(([l, c], i) => text(l, 16, 48 + i * 18, c, 2));

function grid(x0, y0, w, h) {
  g.fillStyle = '#1e1830'; g.fillRect(x0, y0, w, h);
  g.fillStyle = '#2a2340';
  for (let x = 0; x <= w; x += MAG * 4) g.fillRect(x0 + x, y0, 1, h);
  for (let yy = 0; yy <= h; yy += MAG * 4) g.fillRect(x0, y0 + yy, w, 1);
}

for (const { zone, y: zy, placed } of layout) {
  const th = TH(zone);
  g.fillStyle = '#1b1530'; g.fillRect(0, zy, W, 2);
  text(zone, 16, zy + 14, th.accent || '#fff', 2);
  text(`decorpaint/${zone.toLowerCase()}.js`, 16, zy + 36, '#8a8fa8', 1);
  for (const { e, x, y: ey } of placed) {
    const cw = cellW(e), ch = cellArt(e) * MAG;
    const hang = e.anchor === 'hang', float = e.anchor === 'float';
    const top = ey + 18;
    // Where the walking surface sits in the cell: the top for a hanging thing (it hangs
    // below the ledge), the bottom otherwise.
    const surfY = hang ? top : top + ch;
    // The part of the cell that is the redraw box, in sheet pixels from the cell top.
    const boxTop = hang ? hangTop(e) * MAG : 0;
    const boxH = e.box[1] * MAG;
    const boxW = e.box[0] * MAG;
    const boxX = Math.floor((cw - boxW) / 2);
    text(e.name, x, ey, '#ffffff', 2);

    // LEFT: the sprite the game draws now, variant 1, frame 1, where its anchor puts it.
    const c = D.spriteFor(zone, e.key, 0, 0, th);
    grid(x, top, cw, ch);
    g.drawImage(c.img, c.sx, c.sy, e.box[0], e.box[1], x + boxX, top + boxTop, boxW, boxH);
    text('NOW', x, top + ch + 6, '#8a8fa8', 1);

    // RIGHT: the redraw box, gridded at the new resolution, current drawing faint. For a
    // hanging thing the ledge body above it is shaded; for a floating one, the lift below.
    const rx = x + cw + 16;
    g.fillStyle = '#18142a'; g.fillRect(rx, top, cw, ch);
    g.fillStyle = '#231c36'; g.fillRect(rx + boxX, top + boxTop, boxW, boxH);
    g.fillStyle = '#2e2646';
    for (let xx = 0; xx <= boxW; xx += MAG) g.fillRect(rx + boxX + xx, top + boxTop, 1, boxH);
    for (let yy = 0; yy <= boxH; yy += MAG) g.fillRect(rx + boxX, top + boxTop + yy, boxW, 1);
    g.globalAlpha = 0.25;
    g.drawImage(c.img, c.sx, c.sy, e.box[0], e.box[1], rx + boxX, top + boxTop, boxW, boxH);
    g.globalAlpha = 1;
    if (hang) text('LEDGE BODY', rx + 2, top + 4, '#5a5f78', 1);
    if (float) text(`${e.lift} PX LIFT`, rx + 2, top + boxH + 4, '#5a5f78', 1);
    text('REDRAW HERE', rx, top + ch + 6, '#8fd0ff', 1);

    g.fillStyle = '#ff5a5a';
    g.fillRect(x - 4, surfY, cw * 2 + 24, 2);
    if (hang) { g.fillStyle = '#5aa0ff'; g.fillRect(x - 4, top + boxTop, cw * 2 + 24, 2); }

    const spec = `${e.box[0]} X ${e.box[1]} PX  ${hang ? 'HANGS FROM THE UNDERSIDE' : float ? `FLOATS ${e.lift} PX UP` : 'STANDS ON THE SURFACE'}`;
    text(spec, x, top + ch + 20, '#ffe23d', 1);
    text(`${e.frames} FRAME${e.frames > 1 ? 'S' : ''}, ${e.variants} VARIANT${e.variants > 1 ? 'S' : ''}   NOW: ${c.source.toUpperCase()}`,
      x, top + ch + 32, '#c8c4d8', 1);
    e.notes.forEach((n, i) => text(n, x, top + ch + 46 + i * 11, '#b8b4c8', 1));
  }
}

fs.writeFileSync('decor-elements.png', encodePNG(sheet));
console.log(`  decor-elements.png  ${W}x${H}  ${E.length} elements in ${zones.length} zones`);
