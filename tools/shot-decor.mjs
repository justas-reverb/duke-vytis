// The platform furniture, zone by zone or element by element, drawn by the game's runtime.
//
//   node tools/shot-decor.mjs                          decor.png: every zone, four ledges each
//   node tools/shot-decor.mjs --mag=2                  twice the size
//   node tools/shot-decor.mjs --zone=FOREST,SWAMP      only those zones
//   node tools/shot-decor.mjs --legacy                 the OLD world-unit painters instead, same
//                                                      ledges, for comparing a redraw with today
//   node tools/shot-decor.mjs --t=2.5                  at another moment of the animations [1.3]
//   node tools/shot-decor.mjs --elements --zone=DUNGEON [--mag=4] [--out=dungeon.png]
//                                                      THE VIEWER: every element of one zone,
//                                                      every variant and frame, magnified
//
// WHAT IT DRAWS. The zones sheet puts each zone's furniture on that zone's REAL platform tile
// over its own sky, four seeds and widths each, through the same code the game runs --
// decor.js's drawScene, the sprite cache, the anchors -- so what it shows is what the game
// draws, at the size it draws it at zoom 1 (one art pixel per screen pixel, times --mag).
//
// THE VIEWER is where a zone's elements are redrawn. For every element of the zone, one row
// per variant, and in each row every frame twice: ALONE over magenta, magnified with
// nearest-neighbour, so every art pixel and every hole in the transparency shows; and IN
// PLACE, on a ledge of the zone's own tile over its own sky, anchored as the game anchors it
// (standing on the surface, hanging from the underside, floating above), at the same
// magnification. The label says where the sprite came from: PNG, PAINT (the zone module's
// paint()), or PLACEHOLDER (an old world-unit painter scaled into the box, as every element
// was before its redraw; none is now). In place, a pulsing or bobbing element
// is shown at full opacity and at rest; the game moves it.
//
// World y is UP in the game and DOWN in a PNG. Everything here goes through the world
// transform the renderer uses (y up, scale(1, -1) for the sprites), so a thing that should
// stand stands and a thing that should hang hangs; a viewer that drew into a plain y-down
// canvas once showed every artist's work upside down.

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

const { THEMES } = await import('../src/game/themes.js');
const { PX, PLAT_THICK } = await import('../src/game/constants.js');
const { mulberry32 } = await import('../src/core/rng.js');
const D = await import('../src/render/decor.js');
const { ZONES, ZONE_BY_NAME } = await import('../src/render/decorpaint/index.js');
const L = await import('../src/render/decorpaint/legacy.js');
const P = await import('../src/render/platsprites.js');
const { drawText, textWidth } = await import('../src/render/font.js');

const ELEMENTS_MODE = !!flag('elements', false);
const ZONE_ARG = flag('zone', null);
const pick = ZONE_ARG ? String(ZONE_ARG).toUpperCase().split(',') : null;
for (const z of pick || []) {
  if (!ZONE_BY_NAME[z]) { console.log(`  no zone "${z}" -- one of ${ZONES.map((q) => q.name).join(', ')}`); process.exit(1); }
}

/**
 * A ledge in the world transform (world units, y up), laid out from the zone's drawn tiles
 * exactly as Renderer.drawPlatforms lays them out: left cap, whole tiles, a part tile, right
 * cap. Its walking surface is at world y.
 */
function ledge(g, art, x, y, w) {
  g.save();
  g.scale(1, -1);
  const u = 1 / PX;
  const capW = P.CAP_W * u, tileW = P.TILE_W * u, cellH = P.CELL_H * u, headH = P.HEAD * u;
  const dy = -(y + headH);
  const put = (img, sx, sw, dx, dw) => {
    if (sw <= 0 || dw <= 0) return;
    g.drawImage(img, sx, 0, sw, P.CELL_H, dx, dy, dw, cellH);
  };
  const capFit = Math.min(capW, w / 2);
  put(art.left, 0, Math.round(capFit * PX), x, capFit);
  put(art.right, P.CAP_W - Math.round(capFit * PX), Math.round(capFit * PX), x + w - capFit, capFit);
  for (let k = 0; k < w - capFit * 2; k += tileW) {
    const tw = Math.min(tileW, w - capFit * 2 - k);
    put(art.tile, 0, Math.round(tw * PX), x + capFit + k, tw);
  }
  g.restore();
}

// Four one-pixel rects: the headless canvas has no strokeRect.
function frame(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
}

if (ELEMENTS_MODE) viewer();
else zonesSheet();

// --- the zones sheet ------------------------------------------------------------------

function zonesSheet() {
  const MAG = Number(flag('mag', 1));
  const T = Number(flag('t', 1.3));
  const LEGACY = !!flag('legacy', false);
  const OUT = String(flag('out', LEGACY ? 'decor-legacy.png' : 'decor.png'));

  // What each zone's furniture is FOR.
  const MEANS = {
    BASEMENT: ['COBWEBS UNDER THE LEDGE', 'Hang from the UNDERSIDE, not the top: a cellar',
      'seen from inside the shaft. The odd drip swells and', 'falls. Damp, forgotten, enclosing.'],
    DUNGEON: ['A CRYPT SCENE', 'Slumped skeletons, skulls, a reaching hand, crossed femurs,',
      'an ossuary, a manacle on its chain -- never two alike on', 'one ledge. A wall torch: the only light and motion.'],
    FOREST: ['TREES GROWING FROM THE LEDGE', 'Broadleaf trees -- a sapling, a low fork, a tall tiered',
      'one -- leaf clumps with a pale rim, fern and grass along', 'the lip. Warmer and lighter than any green behind.'],
    SWAMP: ['REEDS AND A CATTAIL', 'Clumps of reeds arching out from one root along the lip,',
      'now and then a bulrush in a slot of its own. The bog', 'pushing up through the ledge.'],
    DOWNTOWN: ['A LANTERN ON A POST', 'A lantern hung from a post\'s arm, its glow breathing, and',
      'on wider ledges a split-log fence at the end away from', 'it. The gallery\'s own timber: downtown at night.'],
    CITADEL: ['A BANNER ON A STAFF', 'A gold cloth with a dark castle, on a crossbar and a',
      'black staff, torn to a point, a wave running down it.', 'Heraldry of the citadel: order, ceremony.'],
    STORM: ['A LIGHTNING ROD', 'An iron rod planted in a clump of the ledge\'s cloud, a',
      'crown of purple arcs crackling from its tip nearly as', 'wide as it is tall. The storm hitting the tower.'],
    ABYSS: ['A SKULL, OR A BONE', 'An occasional shock rather than wallpaper: a skull or',
      'one long bone on a low heap of dark rubble. The abyss', 'has claimed climbers before.'],
    NEBULA: ['CRYSTAL CLUSTERS', 'One or two clusters of faceted crystal on rubble: cyan',
      'at the lit tip, violet body, side shards splaying out,', 'a glint moving. Nebula gas made solid.'],
    COSMOS: ['A DRIFTING ORB', 'A soft ball of light that bobs over the ledge, its glow',
      'swelling and settling. No points: it must not read as', 'one more of the backdrop\'s stars. Weightless.'],
    STARFIELD: ['A CONSTELLATION', 'One of three figures -- the board\'s, the Plough, Orion --',
      'stars joined by threads, pinned above the ledge, twinkling.', 'Distinct from the cosmos orb on purpose.'],
    ZENITH: ['A SHAFT OF LIGHT', 'A warm white-gold beam falling onto the ledge -- straight,',
      'or a cone widening as it falls -- landing in a wide pool.', 'It breathes. The top of the tower, open to the sky.'],
  };

  const K = PX * MAG;                // sheet pixels per world unit
  const SAMPLES = [
    { w: 44, seed: 11 }, { w: 72, seed: 29 }, { w: 100, seed: 53 }, { w: 72, seed: 97 },
  ];
  // The room shown above and below a ledge, in world units: the tallest thing that stands
  // or floats, and the ledge's own thickness plus the longest thing that hangs under it.
  const all = ZONES.flatMap((z) => Object.values(z.ELEMENTS));
  const BOX_UP = Math.max(34, ...all.map((e) => (e.anchor === 'hang' ? 0 : (D.boxBottom(e) + e.box[1]) / PX)));
  const BOX_DN = Math.max(18, ...all.filter((e) => e.anchor === 'hang').map((e) => PLAT_THICK + e.box[1] / PX));
  const LABEL = 300 * MAG;
  const DESC = 470 * MAG;
  const GAP = 14 * MAG;
  const ROW = (BOX_UP + BOX_DN) * K + 28 * MAG;
  const SAMPLE_W = SAMPLES.reduce((a, s) => a + s.w * K + GAP, 0);
  const W = LABEL + SAMPLE_W + DESC;
  const HEAD_H = 146 * MAG;
  const zones = ZONES.map((z, i) => ({ z, i })).filter(({ z }) => !pick || pick.includes(z.name));

  const sheet = new HeadlessCanvas(W, HEAD_H + zones.length * ROW + 20 * MAG);
  const g = sheet.getContext('2d');
  g.fillStyle = '#15101f';
  g.fillRect(0, 0, sheet.width, sheet.height);
  const text = (s, x, y, c = '#e8e4f0', sc = 1) => drawText(g, s, x, y, c, sc * MAG, 'left');

  text(LEGACY ? 'EYE CANDY - THE OLD WORLD-UNIT PAINTERS, FOR COMPARISON' : 'EYE CANDY - WHAT STANDS ON THE PLATFORMS, ZONE BY ZONE',
    10 * MAG, 10 * MAG, '#ffe23d', 3);
  [
    LEGACY
      ? 'DRAWN BY THE PAINTERS IN src/render/decorpaint/legacy.js, AS THE GAME DREW THEM BEFORE THE FURNITURE WAS SPRITES.'
      : 'DRAWN BY THE GAME\'S OWN RUNTIME (src/render/decor.js) FROM THE ZONE MODULES IN src/render/decorpaint/.',
    'ON THE ZONE\'S OWN PLATFORM TILE, OVER ITS OWN SKY, AT ONE ART PIXEL PER SCREEN PIXEL - ZOOM 1. FOUR SEEDS',
    'AND WIDTHS EACH: A ZONE PUTS DIFFERENT THINGS ON DIFFERENT LEDGES, AND WIDER LEDGES CARRY MORE.',
    'EVERY ELEMENT OF ONE ZONE, MAGNIFIED: node tools/shot-decor.mjs --elements --zone=<ZONE>',
    `RED LINE = THE WALKING SURFACE. THE BOX IS THE ROOM IT HAS: ${BOX_UP} UNITS UP (${BOX_UP * PX} PX), ${BOX_DN} DOWN (${BOX_DN * PX} PX).`,
  ].forEach((l, i) => text(l, 10 * MAG, (40 + i * 19) * MAG, '#8a8fa8', 2));

  zones.forEach(({ z, i }, row) => {
    const th = THEMES[i];
    const art = P.platArt(th.name);
    const ty = HEAD_H + row * ROW;
    if (row % 2) { g.fillStyle = '#1b1530'; g.fillRect(0, ty - 6 * MAG, W, ROW); }

    text(`${i + 1}. ${th.name}`, 10 * MAG, ty + 4 * MAG, th.accent || '#fff', 2);
    text(`src/render/decorpaint/${th.name.toLowerCase()}.js`, 10 * MAG, ty + 26 * MAG, '#c8c4d8', 1);
    text(`on ${Math.round(D.chanceFor(i) * 100)}% of ledges ${D.DECOR_MIN_W}+ units wide`, 10 * MAG, ty + 38 * MAG, '#8a8fa8', 1);

    let x0 = LABEL;
    for (const s of SAMPLES) {
      const bw = s.w * K;
      const bh = (BOX_UP + BOX_DN) * K;
      // The zone's own sky behind it, so contrast is judged against what the game shows.
      g.fillStyle = th.sky[1];
      g.fillRect(x0, ty, bw, bh);

      // World transform for this sample: y up, the ledge's surface at BOX_UP below the top.
      g.save();
      g.translate(x0, ty + BOX_UP * K);
      g.scale(K, -K);
      ledge(g, art, 0, 0, s.w);
      // The same seeded stream the game uses for a ledge, minus the draw that decides
      // whether it carries anything at all: every sample here does.
      const r = mulberry32((s.seed * 2654435761) >>> 0);
      if (LEGACY) L.decorFor(i)(g, 0, 0, s.w, th, r, T);
      else D.drawScene(g, { x: 0, y: 0, w: s.w, n: s.seed }, z, z.scene(r, s.w * PX, th), th, T);
      g.restore();

      g.fillStyle = '#ff5a5a';
      g.fillRect(x0, ty + BOX_UP * K, bw, 1);
      frame(g, x0, ty, bw, bh, '#3a3150');
      text(`${s.w} UNITS`, x0 + 2 * MAG, ty + bh + 4 * MAG, '#5a5f78', 1);
      x0 += bw + GAP;
    }

    const m = MEANS[th.name] || [th.name, '', '', ''];
    text(m[0], x0 + 6 * MAG, ty + 4 * MAG, '#ffffff', 2);
    m.slice(1).forEach((l, k) => l && text(l, x0 + 6 * MAG, ty + (26 + k * 12) * MAG, '#b8b4c8', 1));
  });

  fs.writeFileSync(OUT, encodePNG(sheet));
  console.log(`  ${OUT}  ${sheet.width}x${sheet.height}  ${zones.length} zones x ${SAMPLES.length} samples`);
}

// --- the viewer -----------------------------------------------------------------------

function viewer() {
  if (!pick || pick.length !== 1) { console.log('  --elements needs one --zone=<ZONE>'); process.exit(1); }
  const MAG = Math.max(1, Math.round(Number(flag('mag', 4))));
  const z = ZONE_BY_NAME[pick[0]];
  const ti = ZONES.indexOf(z);
  const th = THEMES[ti];
  const art = P.platArt(th.name);
  const OUT = String(flag('out', `decor-${z.name.toLowerCase()}.png`));
  const entries = Object.entries(z.ELEMENTS);

  // In place, the pulse and the bob are left out: the element at full opacity, at rest.
  const still = { name: z.name, ELEMENTS: Object.fromEntries(entries.map(([k, e]) => [k, { ...e, alpha: null, bob: null }])) };

  const PAD = 12, GAP = 10, LABEL_H = 34, ROWLABEL = 22;
  // Everything about a cell in art pixels first: the sprite's box, and the in-place scene --
  // a ledge wider than the box, with room above and below for the anchor.
  const geo = entries.map(([key, e]) => {
    const [w, h] = e.box;
    const lw = Math.max(96, Math.ceil((w + 32) / PX) * PX);            // ledge, art px
    const up = Math.max(16, D.boxBottom(e) + h) + 8;                    // above the surface
    const dn = Math.max(P.CELL_H - P.HEAD, -D.boxBottom(e)) + 8;        // below it
    return { key, e, w, h, lw, up, dn };
  });
  const rowW = (q) => q.e.frames * (q.w * MAG + GAP) + GAP * 2 + q.e.frames * (q.lw * MAG + GAP);
  const rowH = (q) => Math.max(q.h, q.up + q.dn) * MAG + ROWLABEL;
  const TITLE = `${z.name} - EVERY ELEMENT, EVERY VARIANT AND FRAME, AT ${MAG}X`;
  const HELP = ['LEFT: ALONE OVER MAGENTA. RIGHT: IN PLACE ON THE ZONE\'S OWN LEDGE AND SKY,',
    'AS THE GAME ANCHORS IT (PULSE AND BOB LEFT OUT).', `src/render/decorpaint/${z.name.toLowerCase()}.js`];
  const W = PAD * 2 + Math.max(textWidth(TITLE, 3), ...HELP.map((l) => textWidth(l, 2)), ...geo.map(rowW));
  const H = 98 + geo.reduce((a, q) => a + LABEL_H + q.e.variants * (rowH(q) + GAP), 0) + PAD;

  const cv = new HeadlessCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#15101f';
  g.fillRect(0, 0, W, H);
  const text = (s, x, y, c = '#e8e4f0', sc = 1) => drawText(g, s, x, y, c, sc, 'left');
  text(TITLE, PAD, PAD, th.accent || '#ffe23d', 3);
  HELP.forEach((l, i) => text(l, PAD, PAD + 30 + i * 18, '#8a8fa8', 2));

  let y = 98;
  for (const q of geo) {
    const { key, e, w, h } = q;
    const c0 = D.spriteFor(z.name, key, 0, 0, th);
    const src = c0 ? c0.source.toUpperCase() : 'NONE';
    const anchor = e.anchor === 'hang' ? 'HANGS FROM THE UNDERSIDE' : e.anchor === 'float' ? `FLOATS ${e.lift} PX UP` : 'STANDS ON THE SURFACE';
    text(`${e.name}`, PAD, y, '#ffffff', 2);
    text(`${w} X ${h} PX   ${anchor}   ${e.frames} FRAME${e.frames > 1 ? 'S' : ''}` +
      `${e.frames > 1 ? ` AT ${(+e.fps).toFixed(2)} FPS` : ''}   ${e.variants} VARIANT${e.variants > 1 ? 'S' : ''}   FROM: ${src}`,
    PAD, y + 20, src === 'PLACEHOLDER' ? '#c8a060' : '#8fd0ff', 1);
    y += LABEL_H;

    for (let v = 0; v < e.variants; v++) {
      const cellH = Math.max(h, q.up + q.dn) * MAG;
      let x = PAD;
      // Alone, over magenta.
      for (let f = 0; f < e.frames; f++) {
        text(`V${v + 1} F${f + 1}`, x, y, '#8a8fa8', 1);
        const cy = y + ROWLABEL;
        g.fillStyle = '#ff00ff';
        g.fillRect(x, cy, w * MAG, h * MAG);
        const c = D.spriteFor(z.name, key, v, f, th);
        g.drawImage(c.img, c.sx, c.sy, w, h, x, cy, w * MAG, h * MAG);
        x += w * MAG + GAP;
      }
      x += GAP * 2;
      // In place: the zone's sky, its ledge, and the element through the game's own drawScene.
      for (let f = 0; f < e.frames; f++) {
        text(`V${v + 1} F${f + 1} IN PLACE`, x, y, '#8a8fa8', 1);
        const cy = y + ROWLABEL;
        const cw = q.lw * MAG;
        g.fillStyle = th.sky[1];
        g.fillRect(x, cy, cw, cellH);
        g.save();
        // World units, y up, the ledge's surface `up` art px below the cell's top.
        g.translate(x, cy + q.up * MAG);
        g.scale(PX * MAG, -PX * MAG);
        const lwu = q.lw / PX;
        ledge(g, art, 0, 0, lwu);
        const ex = Math.round((q.lw - w) / 2);
        D.drawScene(g, { x: 0, y: 0, w: lwu, n: 0 }, still, [{ key, variant: v, x: ex, frame: f }], th, 0);
        g.restore();
        frame(g, x, cy, cw, cellH, '#3a3150');
        x += cw + GAP;
      }
      y += rowH(q) + GAP;
    }
  }

  fs.writeFileSync(OUT, encodePNG(cv));
  console.log(`  ${OUT}  ${W}x${H}  ${z.name}: ${entries.length} elements at ${MAG}x`);
}
