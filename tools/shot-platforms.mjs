// Every zone's platform and the environment it sits in, on one sheet.
//
//   node tools/shot-platforms.mjs                 all twelve
//   node tools/shot-platforms.mjs --first=4       just the first few
//   node tools/shot-platforms.mjs --scale=3
//
// Rendered through the REAL renderer against a real Game, one frame per theme, rather
// than by re-drawing the platform here from the style table. A sheet built from a second
// copy of the drawing code is a sheet that can disagree with the game, and this project
// has already shipped one of those: the companion reference laid its figures out at the
// world size while the art had moved to four times that, and the picture overlapped its
// own labels for a week without anybody noticing.
//
// WHY IT SHOWED NOTHING
//
// Every cell came out as a beautifully lit rectangle of empty backdrop -- right sky, right
// parallax, no ledge anywhere -- and two agents wanting to look at platform art wrote
// their own scratch scripts rather than find out why. The renderer was innocent: the full
// 1920x1080 frame behind the crop had six ledges in it. The crop was pointed at floors
// that had scrolled off the bottom, for two reasons that both come down to asking the
// wrong object where the camera is.
//
//   1. It searched for a subject in the band `p.floor + 2 .. p.floor - 14`. `p.floor` is
//      the floor the Duke last LANDED on, and the demo bot is a combo climber: measured
//      over this seed it is airborne at almost every sampled frame and crosses seven or
//      eight floors per jump, so `p.floor` trails the camera by up to eight floors. At
//      step 900 he had last landed on floor 20 while the view held floors 26 to 33 -- the
//      entire search band was below the bottom of the screen. Every candidate failed the
//      on-screen test, the fallback `peek(p.floor - 1)` sat 200 world units under the
//      camera, and the crop clamped to the bottom strip of the frame, which is sky.
//   2. It did its own world-to-screen arithmetic from `game.zoom`, while the renderer
//      draws with `game.zoomView` -- the EASED zoom, still 1.5133 when the logic zoom had
//      stepped to 1.5. A one-percent scale error is seventeen pixels at the edge of the
//      frame: not what broke it, but enough to shave a ledge off a crop that was right.
//
// So the subject is chosen from the TOWER and the camera is then put on it, at the height
// the game's own camera settles to when he stands there (CAM_ANCHOR), and the crop is mapped
// with the transform `setWorldTransform` actually installed. The Duke's floor number is not
// consulted at all; he is left climbing several floors below, out of frame, so the sheet
// photographs a ledge rather than his boots.
//
// Moving the camera is also what gets FURNITURE into all twelve cells. Only a fifth of
// ABYSS ledges and a fifth of STORM's carry any (CHANCE in decorpaint/), so about a third
// of the time no ledge in a single screenful has any, and those two zones came out bare.
// Given a band of floors to choose from there is always one.

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

const SCALE = Number(flag('scale', 2));
const OUT = String(flag('out', 'platforms.png'));

const { Game } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { THEMES } = await import('../src/game/themes.js');
const { PLAT_STYLES, styleFor } = await import('../src/game/platstyles.js');
const { SW, SH, PX, VW, CX, FLOOR_H, PLAYER_H, CAM_ANCHOR, PLAT_THICK } =
  await import('../src/game/constants.js');
const { drawText } = await import('../src/render/font.js');
const { HEAD, BODY } = await import('../src/render/platsprites.js');
// Asked of the runtime rather than reimplemented here. Which ledges carry furniture is a
// seeded coin flip per floor, and where a piece of furniture's box ends up is the anchor
// and the bob hook; a copy of either rule in this file is exactly the second copy of the
// drawing code the header above warns about.
const { carriesDecor, boxBottom, undersideFor } = await import('../src/render/decor.js');
const { ZONES } = await import('../src/render/decorpaint/index.js');

const FIRST = Number(flag('first', THEMES.length));
const themes = THEMES.slice(0, Math.max(1, Math.min(THEMES.length, FIRST)));

// How much WORLD each cell shows, in world units -- not in pixels, so a cell frames the
// same amount of tower whatever zoom the run happens to be at. The widest ledge the
// generator makes below the squeeze is 71 units, so 76 fits an ordinary one whole, both
// caps and sky either side of it.
//
// The zones disagree about how much room their furniture needs, and badly, in BOTH
// directions -- so neither edge of a cell is a number typed here. Both are asked of the
// registry and the bob hook, which is the one place that changes when the art does.
//
// ABOVE the surface: most furniture stands on the ledge and wants nine units; COSMOS's orb
// FLOATS 40 art pixels up and bobs two more, so a cell tall enough for the rest cropped it
// away entirely and the zone came out looking bare with the label claiming otherwise.
//
// BELOW the surface: the floor is the 7-unit body, the ledge's shadow under it and a unit
// of backdrop. The shadow is cast per column from the tile art (LEDGE_SHADOW in
// renderer.js): at most six art pixels, 1.5 units, under what the tile draws, and none in
// DOWNTOWN. It was a 3-unit bar laid at y - PLAT_THICK - 3 when BELOW_MIN_UNITS was written,
// which is where its "+ 3" comes from; that still covers today's 1.5 with room to spare.
// That floor was the whole rule, and it cropped the things that HANG. A hanging box starts
// at the ledge's drawn underside and falls its own height further: BASEMENT's cobweb has
// ink 18.5 units under the surface and was cut off 7.5 units short, in a cell captioned
// FURNISHED -- the same failure as the orb, at the other end, and it survived the first
// fix because only the top was being asked about.
//
// The caps are guards against a runaway box producing a sheet of sky, not a framing
// choice: 40 units is 160 art pixels, clear of FOREST's 136-pixel tree, which is the
// tallest thing any zone registers. The cap used to be 22 and took 8 units off the top of
// that tree -- a sheet for reviewing art that quietly cropped the art.
const CELL_W_UNITS = 76;
const HEAD_MIN_UNITS = 9, HEAD_MAX_UNITS = 40;
// The body, room for the ledge's shadow (sized for the old 3-unit bar; it reaches 1.5
// now, see above) and a unit of backdrop.
const BELOW_MIN_UNITS = PLAT_THICK + 3 + 1, BELOW_MAX_UNITS = 40;
const LABEL = 30;

// Long enough for a tower worth photographing, short enough that the arena is still at its
// first step, where zoom is 2 and one art pixel is exactly two backing-store pixels. At the
// in-between zooms (1.75, 1.5, 1.25) the tiles are resampled unevenly, which is honest about
// play and useless for judging art: a sheet for reviewing platform art should show the art,
// not the resampler. Measured on this seed: 400 steps is floor 10, zoom 2, five ledges in view.
const STEPS = 400;
// The renderer's own clock, pinned, so all twelve cells catch the animated furniture at the
// same phase and two runs of this tool produce the same sheet. Same value shot-decor uses.
const T_ANIM = 1.3;

const canvas = new HeadlessCanvas(SW, SH);
const input = new AutoInput();
const game = new Game(input);
const bot = new AutoPlayer(input);
game.demo = true;
game.newRun(0x2f6f1b21);

const renderer = new Renderer(canvas);
renderer.applySettings({
  scaleMode: 'integer', scanlines: false, particles: 'off',
  streaks: false, shake: false, trails: false, showFps: false, music: false,
});

// Climb a little so there is a tower with platforms in it to photograph.
for (let i = 0; i < STEPS; i++) { bot.step(game, STEP); game.step(STEP); }

// Land the eased render zoom on the logic zoom before anything is measured. The renderer
// scales by zoomView and this file's arithmetic has to agree with it to the pixel; pinning
// it here is also what puts the whole frame back on whole art pixels, which is the state
// the zoom eases TO and the one worth photographing.
game.zoomView = game.zoom;
const z = game.zoom;
const k = z * PX;                       // backing-store pixels per world unit
const u = 1 / PX;                       // one art pixel, in world units
const HEAD_U = HEAD * u, BODY_U = BODY * u;
const viewLeft = CX - (VW / z) / 2;
const halfArena = game.arenaHalfView || game.arenaHalf;
// The transform setWorldTransform installs, to the pixel: x -> tx + wx * k, y -> ty - wy * k.
// tx is fixed for the run; ty moves with the camera, so it is recomputed per cell.
const tx = Math.round(-viewLeft * k);
const worldToScreenY = () => Math.round(SH + game.camY * k);

const TW = Math.round(CELL_W_UNITS * k);

/**
 * How far this zone's furniture reaches above and below the standing surface, in art px,
 * asked of `boxBottom` -- the same function the runtime anchors a sprite with -- over a
 * spread of clock values, because a bob is a function of time and the sheet must clear
 * both ends of its swing.
 *
 * The real underside is passed in rather than left to the default. A hanging box starts at
 * the underside the zone's TILE draws, and only BASEMENT, FOREST, CITADEL, COSMOS,
 * STARFIELD and ZENITH have solid stone all the way down: the crypt's ends 16 art px under
 * the surface, so the default 28 would have this sheet reserving three units of sky the
 * manacle never occupies.
 */
function reachFor(themeIndex) {
  const z = ZONES[themeIndex];
  const under = undersideFor(themes[themeIndex].name);
  let top = HEAD, bottom = 0;      // the ledge's own art above the surface; nothing below
  for (const e of Object.values((z && z.ELEMENTS) || {})) {
    for (let t = 0; t < 4; t += 0.05) {
      const b = boxBottom(e, t, 0, under);
      top = Math.max(top, b + e.box[1]);
      bottom = Math.min(bottom, b);
    }
  }
  return {
    head: Math.min(HEAD_MAX_UNITS, Math.max(HEAD_MIN_UNITS, Math.ceil(top * u) + 2)),
    below: Math.min(BELOW_MAX_UNITS, Math.max(BELOW_MIN_UNITS, Math.ceil(-bottom * u) + 1)),
  };
}

// The band of floors a subject is chosen from: above the top of the view he climbed to, so
// the rising floor stays under the camera wherever it is put, and eighty floors deep, which
// is enough that even a zone furnishing one ledge in five has several to choose from.
const BAND_LO = Math.ceil((game.camY + game.viewH) / FLOOR_H) + 2;
const BAND_HI = BAND_LO + 80;

/**
 * The ledge to photograph for one zone: carrying this zone's furniture, whole inside the
 * cell if it will fit, clear of the walls, and not one the Duke is standing in front of.
 *
 * Nothing here reads the player's floor. See the header: that is what broke it.
 */
function pickLedge(themeIndex) {
  const p = game.player;
  let best = null, bestScore = -Infinity, bestDecor = false;
  for (let n = BAND_LO; n <= BAND_HI; n++) {
    const pl = game.tower.peek(n);
    if (!pl) continue;
    const cx = pl.x + pl.w / 2;
    const decor = carriesDecor(pl, themeIndex);
    // Furniture first -- the sheet exists to show a ledge as the zone dresses it -- then
    // ledges narrow enough to show both caps, then a cell clear of the shaft walls, then
    // the widest of what is left.
    let score = (decor ? 10000 : 0)
      + (pl.w <= CELL_W_UNITS - 8 ? 1000 : 0)
      + (Math.abs(cx - CX) + CELL_W_UNITS / 2 <= halfArena ? 500 : 0)
      + pl.w;
    // The Duke in the cell would make this a picture of the Duke. He is drawn over the
    // ledge, so "near" is his body box against the cell, not his floor number.
    const inCell = Math.abs(p.x - cx) < CELL_W_UNITS / 2 + 6
      && p.y + PLAYER_H > pl.y - reach[themeIndex].below
      && p.y - PLAYER_H < pl.y + reach[themeIndex].head;
    if (inCell) score -= 50000;
    if (score > bestScore) { bestScore = score; best = pl; bestDecor = decor; }
  }
  return best && { pl: best, decor: bestDecor };
}

// Each cell's own height, and where in the sheet it starts, worked out before anything is
// drawn so the sheet is the exact size it needs to be.
const reach = themes.map((_, i) => reachFor(i));
const heads = reach.map((r) => r.head);
const cellH = reach.map((r) => Math.round((r.head + r.below) * k));
const cellTop = cellH.reduce((a, h, i) => (a.push(a[i] + h + LABEL), a), [0]);

const sheet = new HeadlessCanvas(TW, cellTop[themes.length]);
const out = sheet.getContext('2d');
out.fillStyle = '#15101f';
out.fillRect(0, 0, sheet.width, sheet.height);

const src = canvas.getContext('2d');
const picked = [];

themes.forEach((th, i) => {
  const TH = cellH[i];
  // Force the theme, put the camera on this zone's subject, then redraw. themeIndex is
  // what every draw call reads -- the backdrop, the platform art and the furniture registry
  // alike -- so this shows the zone exactly as the game would, on a tower the real
  // generator built; and camY is set to the height the game's own camera eases to when he
  // stands on that ledge, so the parallax behind it is the parallax it really has.
  game.themeIndex = i;
  game.themeBlend = 0;

  const hit = pickLedge(i);
  const pl = hit ? hit.pl : null;
  picked.push({ name: th.name, pl, decor: hit ? hit.decor : false });
  if (pl) game.camY = pl.y - game.viewH * CAM_ANCHOR;

  renderer.t = T_ANIM;
  renderer.draw(game, 1, 0);

  const ty = worldToScreenY();
  const cxWorld = pl ? pl.x + pl.w / 2 : CX;
  const yWorld = pl ? pl.y : game.camY + game.viewH / 2;
  const cx = Math.round(tx + cxWorld * k);
  const cy = Math.round(ty - yWorld * k);
  const sx = Math.max(0, Math.min(SW - TW, cx - Math.round(TW / 2)));
  const sy = Math.max(0, Math.min(SH - TH, cy - Math.round(heads[i] * k)));

  const px = src.getImageData(sx, sy, TW, TH).data;
  const oy = cellTop[i];
  const at = (x, y) => {
    const n = (y * TW + x) * 4;
    return `rgb(${px[n]},${px[n + 1]},${px[n + 2]})`;
  };
  for (let y = 0; y < TH; y++) {
    let x = 0;
    while (x < TW) {
      const c = at(x, y);
      let run = 1;
      while (x + run < TW && at(x + run, y) === c) run++;
      out.fillStyle = c;
      out.fillRect(x, oy + y, run, 1);
      x += run;
    }
  }

  const st = styleFor(th.name);
  drawText(out, th.name, 4, oy + TH + 5, th.accent || '#ffe23d', 1, 'left');
  drawText(out, `${st.style} / ${st.cap} cap`.toUpperCase(), 4, oy + TH + 15,
    '#8a8fa8', 1, 'left');
  if (pl) {
    drawText(out, `floor ${pl.n}  ${pl.w} wide  ${hit.decor ? 'furnished' : 'bare'}`.toUpperCase(),
      TW - 134, oy + TH + 15, '#5c6078', 1, 'right');
  }

  // The palette the zone is built from, as swatches.
  const sw = [th.platTop, th.platBody, th.platEdge, st.trim, th.accent, th.particle,
    th.sky[0], th.sky[1], th.bgFar, th.bgNear];
  sw.forEach((c, j) => {
    out.fillStyle = '#000000';
    out.fillRect(TW - 6 - (sw.length - j) * 12, oy + TH + 4, 11, 11);
    out.fillStyle = c;
    out.fillRect(TW - 5 - (sw.length - j) * 12, oy + TH + 5, 9, 9);
  });
});

fs.writeFileSync(OUT, encodePNG(SCALE > 1 ? upscale(sheet, SCALE) : sheet));
console.log(`  ${themes.length} of ${THEMES.length} zones -> ${OUT}  ` +
  `${sheet.width * SCALE}x${sheet.height * SCALE}`);
console.log(`  shot at zoom ${z} (${k} px/unit, ${k / PX} px per art pixel), ` +
  `subjects from floors ${BAND_LO}-${BAND_HI}, cells ${CELL_W_UNITS} units wide, ` +
  `${Math.min(...reach.map((r) => r.head + r.below))}-` +
  `${Math.max(...reach.map((r) => r.head + r.below))} tall ` +
  `(${Math.max(...reach.map((r) => r.head))} over the surface at most, ` +
  `${Math.max(...reach.map((r) => r.below))} under)`);
const missing = picked.filter((p) => !p.pl).map((p) => p.name);
const bare = picked.filter((p) => p.pl && !p.decor).map((p) => p.name);
console.log(`  ledges: ${picked.filter((p) => p.pl).length}/${themes.length} found` +
  (missing.length ? `, NO LEDGE IN THE BAND for ${missing.join(', ')}` : '') +
  (bare.length ? `; nothing furnished in the band for ${bare.join(', ')}` : ''));
console.log('  styles: ' + PLAT_STYLES.slice(0, themes.length)
  .map((s) => `${s.theme}=${s.style}/${s.cap}`).join('  '));
