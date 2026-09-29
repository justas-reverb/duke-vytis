// The backgrounds: three layers per zone, every one of them present, sized and tiling.
//
//   node tools/test-backgrounds.mjs
//
// What it holds the backgrounds to:
//
//   1. Every zone has a FAR, MID and NEAR painter, and each paints a 256 x 256 tile
//      without throwing -- or 960 x 256 for a zone that paints its layers one screen
//      wide (`wide: true`, SWAMP: see backdrop.js WIDE), whose tiles must then repeat no
//      more often than the shaft is wide at its widest, or its layers repeat across it
//      after all. A zone with a missing painter is a hole in the sky.
//   2. Every artist's tile listed in src/render/bgart.js exists on disk and is 256 x 256.
//      The manifest is generated, but files move, and a listed file that is not there is
//      a 404 in the desktop build.
//   3. A REPAINTED zone's layers wrap: left edge against right edge, top against bottom,
//      mean difference under WRAP_MAX. A layer tile repeats across the screen and up the
//      tower forever, so a seam in it walks up the screen for as long as you play. The
//      bottom edge is held against the top as the row of tiles below shows it: `shift`
//      pixels along, when the painter lays its rows like bricks (SWAMP; backdrop.js tile).
//      Held against the top straight below instead, SWAMP's MID and NEAR differ by 60
//      and 137, and NEAR against MID's bond by 132 (its own is 0), so a painter that
//      paints one bond and reports another fails. FAR's soft mist cannot tell: straight
//      below it reads 10 (0.8 at its own bond), under WRAP_MAX, so a wrong bond there
//      would pass. A zone on the old painters (legacyZone() in bgpaint/legacy.js) was
//      never written to wrap and is only reported -- none is now, all twelve are repainted -- as are the
//      artist's tiles: art arrives in stages, and a seam is a note for the artist, not a
//      broken game.
//   4. The headless canvas every background is looked at through CROPS an image that
//      hangs off its edge, as a browser does, rather than squashing it into what shows.

import { installDom } from './headless.mjs';

installDom();

const { THEMES } = await import('../src/game/themes.js');
const { ZONE_PAINTERS } = await import('../src/render/bgpaint/index.js');
const { BG_TILE, BG_FILES } = await import('../src/render/bgart.js');
const { layerSeed, paintedWidth, SPAN } = await import('../src/render/backdrop.js');
const { PLAY_L, PLAY_R } = await import('../src/game/constants.js');
const { mulberry32 } = await import('../src/core/rng.js');
const { readPNG } = await import('./pngread.mjs');

const WRAP_MAX = 12;
let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

function edgeError(data, W, H = W, period = W, shift = 0) {
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const d = (a, b) => {
    const aa = a[3] / 255, ba = b[3] / 255;
    const c = (Math.abs(a[0] * aa - b[0] * ba) + Math.abs(a[1] * aa - b[1] * ba) + Math.abs(a[2] * aa - b[2] * ba)) / 3;
    return Math.max(c, Math.abs(a[3] - b[3]));
  };
  let h = 0, v = 0;
  for (let y = 0; y < H; y++) h += d(px(0, y), px(W - 1, y));
  for (let x = 0; x < W; x++) v += d(px((((x - shift) % period) + period) % period, 0), px(x, H - 1));
  return [h / H, v / W];
}

// --- 1 and 3: the painters --------------------------------------------------------
const legacyZones = [];
for (const [i, th] of THEMES.entries()) {
  const zone = ZONE_PAINTERS[th.name];
  if (!zone) { fail(`${th.name}: no painter module`); continue; }
  // Through backdrop.js's own paintedWidth, for the reason layerSeed is below.
  const TW = paintedWidth(zone);
  for (const layer of ['far', 'mid', 'near']) {
    if (typeof zone[layer] !== 'function') { fail(`${th.name}: no ${layer} painter`); continue; }
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = BG_TILE;
    let lay;
    try {
      // Through backdrop.js's own layerSeed: the formula lived here a second time,
      // so a test could go on painting the tiles the game had stopped painting.
      lay = zone[layer](c.getContext('2d'), BG_TILE, th, mulberry32(layerSeed(i, layer)), i, TW) || {};
    } catch (e) { fail(`${th.name} ${layer}: painter threw ${e.message}`); continue; }
    if (c.width !== TW || c.height !== BG_TILE) fail(`${th.name} ${layer}: painted ${c.width}x${c.height}`);
    const period = lay.period || TW;
    if (zone.wide && (period * SPAN) / BG_TILE < PLAY_R - PLAY_L) {
      fail(`${th.name} ${layer}: paints wide, but repeats every ${(period * SPAN) / BG_TILE} units, inside the shaft's ${PLAY_R - PLAY_L}`);
    }
    const [h, v] = edgeError(c.data, TW, BG_TILE, period, lay.shift || 0);
    if (zone.legacy) continue;
    if (h > WRAP_MAX || v > WRAP_MAX) {
      fail(`${th.name} ${layer} does not wrap: left/right ${h.toFixed(1)}, top/bottom ${v.toFixed(1)} (max ${WRAP_MAX})`);
    }
  }
  if (zone.legacy) legacyZones.push(th.name);
}
const repainted = THEMES.length - legacyZones.length;
ok(`${THEMES.length} zones x FAR/MID/NEAR painted; ${repainted} repainted and wrapping`);
if (legacyZones.length) console.log(`  note ${legacyZones.length} still on the old painters: ${legacyZones.join(', ')}`);

// --- 2: the artist's tiles --------------------------------------------------------
let tiles = 0;
for (const [zone, e] of Object.entries(BG_FILES)) {
  for (const layer of ['far', 'mid', 'near']) {
    if (!e[layer]) continue;
    tiles++;
    let img;
    try { img = readPNG(e[layer]); } catch (err) { fail(`${zone} ${layer}: ${e[layer]} unreadable: ${err.message}`); continue; }
    if (img.w !== BG_TILE || img.h !== BG_TILE) fail(`${zone} ${layer}: ${img.w}x${img.h}, want ${BG_TILE}x${BG_TILE}`);
    const w = e[`${layer}Wrap`] || [0, 0];
    if (w[0] >= 30 || w[1] >= 30) console.log(`  note ${zone} ${layer} art shows a seam (edge difference ${w.join(' / ')})`);
  }
}
ok(`${tiles} artist's tiles listed, all present and ${BG_TILE}x${BG_TILE}`);

// --- 4: the headless canvas crops what hangs off its edge -------------------------
//
// Every background is judged through tools/headless.mjs, and the layers are tiled from
// above the top of the screen, so the first and last rows of tiles are always partly off
// it. drawImage used to map the source across only the VISIBLE part of the destination,
// squashing an overhanging image into it: those rows of windows came out as letterboxes
// in every headless frame. A browser crops. Each case draws a 4 x 4 image, a different
// colour in every pixel, partly off a 6 x 6 canvas, and says by hand which image pixel a
// browser shows at each canvas pixel -- worked out on paper, not by the inverse
// transform, because that is the code under test.
{
  const { HeadlessCanvas } = await import('./headless.mjs');
  const img = new HeadlessCanvas(4, 4);
  const colour = (ix, iy) => [10 + 60 * ix, 10 + 60 * iy, 200, 255];
  for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 4; ix++) img.data.set(colour(ix, iy), (iy * 4 + ix) * 4);

  const cases = [
    // Half off the top: the image's bottom two rows, one canvas row each.
    ['half off the top', [1, 0, 0, 1, 0, 0], [0, -2],
      (x, y) => (x < 4 && y < 2 ? [x, y + 2] : null)],
    // Mirrored, as a sprite facing left is, and half off the left: its first two columns
    // land on the canvas the wrong way round, as they should.
    ['mirrored, half off the left', [-1, 0, 0, 1, 4, 0], [2, 0],
      (x, y) => (x < 2 && y < 4 ? [1 - x, y] : null)],
    // At twice the size, hanging off the bottom right: its top-left quarter, each pixel
    // two canvas pixels square.
    ['scaled x2, off the bottom right', [2, 0, 0, 2, 0, 0], [1, 1],
      (x, y) => (x >= 2 && y >= 2 ? [(x - 2) >> 1, (y - 2) >> 1] : null)],
  ];
  let cropBad = 0;
  for (const [name, m, at, want] of cases) {
    const c = new HeadlessCanvas(6, 6);
    const g = c.getContext('2d');
    g.setTransform(...m);
    g.drawImage(img, ...at);
    let wrong = null;
    for (let y = 0; y < 6 && !wrong; y++) {
      for (let x = 0; x < 6 && !wrong; x++) {
        const w = want(x, y);
        const exp = w ? colour(...w) : [0, 0, 0, 0];
        const got = Array.from(c.data.subarray((y * 6 + x) * 4, (y * 6 + x) * 4 + 4));
        if (got.join() !== exp.join()) wrong = `canvas (${x},${y}) is [${got}], want ${w ? `image (${w})` : 'nothing'}`;
      }
    }
    if (wrong) { fail(`headless drawImage, ${name}: ${wrong}`); cropBad++; }
  }
  if (!cropBad) ok(`headless drawImage crops an image hanging off the canvas, as a browser does (${cases.length} cases)`);
}

console.log(`\n  RESULT: ${bad ? `FAIL - ${bad} problem(s)` : 'PASS - every zone has three layers, every repainted one tiles, and the headless canvas crops them.'}`);
process.exit(bad ? 1 : 0);
