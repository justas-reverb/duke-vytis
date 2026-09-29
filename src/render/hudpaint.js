// The twelve HUD skins: each zone's lettering inks, and the material its SPEED bar and
// COMBO meter are made of. hudskin.js paints and draws them; this file is only the zones.
//
// Every colour here is taken from the zone's own art -- its ledge palette (platart.js), its
// decor and its wall -- so a gauge reads as a thing from that zone, not a theme swatch:
// FOREST's bark is its ledge's earth browns and its leaves the canopy's greens, ABYSS's bone
// is the purple-tinted bone of its vertebra ledges, NEBULA's crystal the amethyst of its
// faceted ledges, ZENITH's gilt the gold bars of its ledges.
//
// A spec:
//   text    the inks, each five tones deep -> lit (see ink() below), and the keyline:
//           `edge` the near-black outer pixel where a letter meets the backdrop, `line`
//           the zone's dark hue that fills the rest of the keyline
//   mats    material ramps, each [outline, tone 1 (deepest) .. tone 5 (highlight)]; `rim`
//           is the frame's own material and must be there
//   well    the colour of the empty gauge, and its alpha
//   fill    the gauge's light, [unused, 1..5]; fillHot the same lifted toward white
//   frame   (plan, geo) paints the zone's texture and ornaments over the bevelled rim; a
//           generator, run to its end by hudskin.js paintFrame (see rimEach)
//   pattern (x, y, kind, w, h) a tone nudge for the fill: specks, bolts
//
// The frames are drawn round boxes of fixed size (hudskin.js GAUGE_ART). The bar's inside
// is 296 x 20 art pixels, its rim 3 px on top, 6 below and 8 at each end, with 7 px of room
// past each end and 4 below; the SPEED label sits just over its left 140 px, so nothing
// rises off it there. The meter's inside is 28 x 416, its rim 6 left, 4 right, 5 on top
// and 6 below, with 34 px above for a finial; the combo count rides beside its right rim,
// so nothing sticks out on that side.

import { mix, rng } from './decorpaint/util.js';
import { overdue } from './slices.js';
import { artSeed } from '../game/themes.js';

// --- inks ------------------------------------------------------------------------------

/**
 * A lettering ink: five tones from a base, two toward the zone's shadow hue and two toward
 * its light, so the shading is hue-shifted rather than greyed. The shadow side is kept
 * shallow -- the low band 12% of the way to the dark, the one-pixel bottom edge 22% -- so
 * the darkest pixel of any letter stays at 4.5:1 or better against the keyline round it.
 * At 25% and 50% the bottom edges measured 2.6:1 in the dim inks (FOREST's red,
 * STARFIELD's orange): shading that ate into the letterform.
 */
const ink = (base, dark, lite) => [
  mix(base, dark, 0.22), mix(base, dark, 0.12), base, mix(base, lite, 0.35), mix(base, lite, 0.7),
];

/**
 * CLIMB!, the one warning, is the same in every zone: the rising floor's red, FLAT -- no
 * darker bands or bottom edge, only a lit top -- on its own near-black keyline (DANGER_KEY).
 * In the zone's shaded ink on the zone's keyline its darkest pixel measured 3.2-3.8:1
 * against the keyline under the danger band that flashes over it, where the old flat red on
 * black had 5.3:1; a warning may not read worse than the one it replaced.
 */
const DANGER = ['#ff4d64', '#ff4d64', '#ff4d64', mix('#ff4d64', '#ffe0e6', 0.35), mix('#ff4d64', '#ffe0e6', 0.7)];
export const DANGER_KEY = { edge: '#030001', line: '#0c0105' };

/**
 * A zone's full set of inks. Three are the same hue in every zone because the player has
 * learned them: gold for the multiplier and a record, green for a held-jump chain, red for
 * CLIMB! -- red is the rising floor's colour. The gold's and the green's shading and
 * keyline are the zone's; CLIMB! is the same everywhere (above).
 */
function inks({ edge, line, dark, lite, ink: label, num, hot, flash, shout }) {
  return {
    edge, line,
    ink: ink(label, dark, lite),
    num: ink(num, dark, '#ffffff'),
    hot: ink(hot, dark, lite),
    flash: ink(flash || mix(hot, '#ffffff', 0.62), dark, '#ffffff'),
    gold: ink('#ffe23d', dark, '#fffbe0'),
    chain: ink('#7dff5a', dark, '#f0ffe8'),
    danger: DANGER,
    shout: ink(shout || mix(hot, '#ffffff', 0.5), dark, '#ffffff'),
  };
}

// --- frame kit -----------------------------------------------------------------------------

const R = (zone, kind, salt = '') => rng('HUD', zone, kind, salt);

/**
 * Visit every pixel of the frame's own material: fn(x, y, face). A generator, as the helpers
 * that use it and every zone's frame are: round a gauge this is a few thousand pixels, but
 * round a scoreboard panel (gameoverskin.js) it is the whole 400,000-pixel box, and the
 * board is painted a fraction of a millisecond a frame, so each pass yields between rows
 * once its slice is spent (slices.js). Run to its end (hudskin.js paintFrame) with no
 * deadline set, it paints exactly what it did.
 */
function* rimEach(P, g, fn) {
  for (let y = g.top; y <= g.bottom; y++) {
    if (overdue()) yield;
    for (let x = g.left; x <= g.right; x++) {
      if (P.mat(x, y) === g.rim) fn(x, y, g.face(x, y));
    }
  }
}

/** Joints across the rail every `every` px (bricks, blocks, planks), `d` tones darker. */
function* joints(P, g, every, phase, d, notch = false) {
  yield* rimEach(P, g, (x, y, f) => {
    if ((((f.along + phase) % every) + every) % every !== 0) return;
    if (notch && f.out === f.width) P.clear(x, y);
    else P.add(x, y, d);
  });
}

/** Streaks along the rail (grain, bark furrows): n runs of 3-14 px on one row of it. */
function* grain(P, g, r, n, d, rows = [2, 3]) {
  // Kept as bare numbers, x and y in turn, and the face asked again for the few picked: a
  // list of [x, y, face] was tens of thousands of objects round a scoreboard panel, all
  // alive to the end of the pass, which the collector then had to copy (gameoverskin.js).
  const along = [];
  yield* rimEach(P, g, (x, y, f) => { if (rows.includes(f.out)) along.push(x, y); });
  for (let k = 0; k < n && along.length; k++) {
    const j = r.int(0, along.length / 2 - 1) * 2;
    const x = along[j], y = along[j + 1], f = g.face(x, y);
    const len = r.int(3, 14);
    const hz = f.side === 'top' || f.side === 'bottom';
    for (let i = 0; i < len; i++) {
      const X = hz ? x + i : x, Y = hz ? y : y + i;
      if (P.mat(X, Y) === g.rim && g.face(X, Y).out === f.out) P.add(X, Y, d);
    }
  }
}

/** Random chips: single rim pixels `d` tones off, a stone's pitting. */
function* chips(P, g, r, n, d) {
  const px = [];   // x and y in turn, bare numbers (see grain)
  yield* rimEach(P, g, (x, y, f) => { if (f.out > 1 && f.out < f.width) px.push(x, y); });
  for (let k = 0; k < n && px.length; k++) {
    const j = r.int(0, px.length / 2 - 1) * 2;
    P.add(px[j], px[j + 1], d);
  }
}

/**
 * A cluster of foliage (or cloud, or moss) built from puffs, shaded BY PUFF: each puff one
 * base tone from where its centre sits (lit high and to the left), a lit cap on its upper
 * left and a crease two tones down along its underside, drawn bottom-first so each upper
 * puff's crease shows over the one below (pixel-art-in-code: foliage). A tone per pixel
 * from the cluster's shape drew smooth bands -- a bun.
 */
function puffs(P, mat, cx, cy, rx, ry, r, rnd, lift = 0) {
  const list = [];
  const sy = Math.max(1.5, r * 1.4), sx = Math.max(1.5, r * 1.6);
  for (let y = -ry, row = 0; y <= ry + 0.01; y += sy, row++) {
    for (let x = -rx; x <= rx + 0.01; x += sx) {
      const jx = x + (row % 2) * sx * 0.5 + rnd.float(-0.5, 0.5);
      const jy = y + rnd.float(-0.5, 0.5);
      if ((jx * jx) / (rx * rx + 0.01) + (jy * jy) / (ry * ry + 0.01) <= 1.05) list.push([cx + jx, cy + jy]);
    }
  }
  list.sort((a, b) => b[1] - a[1]);
  for (const [px, py] of list) {
    const v = (py - (cy - ry)) / (2 * ry + 0.01);
    const u = (px - (cx - rx)) / (2 * rx + 0.01);
    let base = (v < 0.34 ? 4 : v < 0.7 ? 3 : 2) + lift;
    if (u < 0.35 && v < 0.6) base++;
    const lim = r * r + 0.8 * r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > lim) continue;
        let t = base;
        if (dy < 0 && dx <= 0 && dy + dx <= -r * 0.6) t = base + 1;
        if (dy >= r - 0.5) t = base - 2;
        P.set(Math.round(px + dx), Math.round(py + dy), mat, t);
      }
    }
  }
}

/** A rivet or stud: a 2 x 2 head, lit pixel upper left, dark lower right. */
function stud(P, x, y, mat) {
  P.set(x, y, mat, 5); P.set(x + 1, y, mat, 3);
  P.set(x, y + 1, mat, 3); P.set(x + 1, y + 1, mat, 1);
}

/**
 * A band of `mat` wrapped round the rail at `along` (px from the inside box's start), w px
 * wide and standing a pixel proud of the rim on both faces, with a stud on each face.
 */
function band(P, g, along, w, mat) {
  if (g.kind === 'bar') {
    const x0 = g.ix + along;
    for (let y = g.top - 1; y <= g.bottom + 1; y++) {
      if (y >= g.iy && y < g.iy + g.ih) continue;
      for (let x = x0; x < x0 + w; x++) {
        const t = y === g.top - 1 ? 5 : y === g.bottom + 1 ? 1 : x === x0 ? 4 : x === x0 + w - 1 ? 2 : 3;
        P.set(x, y, mat, t);
      }
    }
    stud(P, x0 + (w >> 1) - 1, g.bottom - 3, mat);
  } else {
    const y0 = g.iy + along;
    for (let x = g.left - 1; x <= g.right + 1; x++) {
      if (x >= g.ix && x < g.ix + g.iw) continue;
      for (let y = y0; y < y0 + w; y++) {
        const t = x === g.left - 1 ? 5 : x === g.right + 1 ? 1 : y === y0 ? 4 : y === y0 + w - 1 ? 2 : 3;
        P.set(x, y, mat, t);
      }
    }
    stud(P, g.left + 2, y0 + (w >> 1) - 1, mat);
  }
}

/** A plate over a corner of the frame, s x s centred on (cx, cy), bevelled, studded. */
function plate(P, cx, cy, s, mat) {
  const x0 = cx - (s >> 1), y0 = cy - (s >> 1);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const t = y === 0 || x === 0 ? 4 : y === s - 1 || x === s - 1 ? 2 : 3;
      P.set(x0 + x, y0 + y, mat, t);
    }
  }
  stud(P, x0 + (s >> 1) - 1, y0 + (s >> 1) - 1, mat);
}

/** The frame's four outer corners. */
const corners = (g) => [[g.left, g.top], [g.right, g.top], [g.left, g.bottom], [g.right, g.bottom]];

/**
 * Draw an ASCII sprite into the plan: digits 1-5 are tones of `mat`, other letters look
 * themselves up in `key` as [material, tone]. '.' is left alone. Anchored at its top-left.
 */
function ascii(P, rows, x0, y0, mat, key = {}) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === '.') return;
      if (ch >= '1' && ch <= '5') P.set(x0 + i, y0 + j, mat, Number(ch));
      else if (key[ch]) P.set(x0 + i, y0 + j, key[ch][0], key[ch][1]);
    });
  });
}

/** A four-point star of `mat` about (x, y), arms k long, brightest at the centre. */
function star(P, x, y, k, mat) {
  for (let i = -k; i <= k; i++) {
    const t = i === 0 ? 5 : Math.abs(i) === 1 ? 4 : Math.abs(i) < k ? 3 : 2;
    P.set(x + i, y, mat, t);
    P.set(x, y + i, mat, t);
  }
  if (k >= 4) { P.set(x - 1, y - 1, mat, 4); P.set(x + 1, y + 1, mat, 3); P.set(x + 1, y - 1, mat, 3); P.set(x - 1, y + 1, mat, 3); }
}

/** The fill's plain texture: sparse specks `d` tones up, seeded, never moving. */
function specks(zone, n, d = 1) {
  const r = R(zone, 'specks');
  const pts = new Set();
  for (let i = 0; i < n; i++) pts.add(`${r.int(0, 295)},${r.int(0, 415)}`);
  return (x, y) => (pts.has(`${x},${y}`) ? d : 0);
}

// --- the zones -------------------------------------------------------------------------------

export const HUD_ZONES = {
  // Brown brick in iron: the cellar's own coursed brick (its ledge), iron plates riveted
  // over the corners and iron straps round the rail; the fill torch-ember orange.
  BASEMENT: {
    text: inks({ edge: '#0a0408', line: '#2a1622', dark: '#4a2230', lite: '#fff8e0',
      ink: '#ffe099', num: '#f8ecdc', hot: '#ffaa33' }),
    mats: {
      rim: ['#190500', '#3d251b', '#553a2a', '#715644', '#957653', '#b8987a'],
      iron: ['#08060c', '#26222c', '#3e3946', '#5c5664', '#857e8c', '#b4aebc'],
    },
    well: '#0e0610', wellA: 0.72,
    fill: ['#2a0800', '#8a2808', '#cc4e14', '#f58426', '#ffb04a', '#ffe7a0'],
    fillHot: ['#401000', '#d8601c', '#ff8a2e', '#ffb450', '#ffdc8a', '#fff8e0'],
    *frame(P, g) {
      const r = R('BASEMENT', g.kind);
      yield* joints(P, g, 12, 0, -2);
      yield* chips(P, g, r, 60, -1);
      yield* chips(P, g, r, 20, 1);
      for (const [x, y] of corners(g)) plate(P, x, y, 9, 'iron');
      if (g.kind === 'meter') for (const a of [104, 208, 312]) band(P, g, a, 6, 'iron');
      else for (const a of [98, 196]) band(P, g, a, 6, 'iron');
      if (g.kind === 'meter') {
        // An iron cap with a ring hanging from it: how a cellar hangs things.
        const cx = g.ix + (g.iw >> 1);
        P.rect(g.left - 1, g.top - 4, g.right - g.left + 3, 4, 'iron', 3);
        P.rect(g.left - 1, g.top - 4, g.right - g.left + 3, 1, 'iron', 4);
        ascii(P, [
          '....44....',
          '....32....',
          '..344432..',
          '.34....21.',
          '34......21',
          '4........1',
          '4........1',
          '3........1',
          '24......11',
          '.23....11.',
          '..222111..',
        ], cx - 5, g.top - 15, 'iron');
      }
    },
    pattern: specks('BASEMENT', 900, 1),
  },

  // Crypt stone, grey-violet and chipped, in blocks with their joints cut into the edge,
  // and the pale drips its ledges hang; the fill candle yellow.
  DUNGEON: {
    text: inks({ edge: '#05050e', line: '#1c1a30', dark: '#34304e', lite: '#ffffff',
      ink: '#ffffcc', num: '#eeeef6', hot: '#ffee30' }),
    mats: {
      rim: ['#0a0814', '#211b30', '#3e2e4a', '#554262', '#796880', '#a898b0'],
      drip: ['#0a0814', '#6d5b73', '#8d867b', '#aaa49d', '#bcb6af', '#e2dad4'],
    },
    well: '#07060e', wellA: 0.72,
    fill: ['#2a2000', '#7a6200', '#c4a800', '#f4e020', '#ffff70', '#ffffd8'],
    fillHot: ['#3a3000', '#c8b020', '#fff040', '#ffff90', '#ffffc8', '#ffffff'],
    *frame(P, g) {
      const r = R('DUNGEON', g.kind);
      yield* joints(P, g, 16, 5, -2, true);
      yield* chips(P, g, r, 90, -1);
      yield* chips(P, g, r, 40, 1);
      // Drips under the bottom face: pale, pointed, two to five px.
      const drips = g.kind === 'bar'
        ? [30, 71, 118, 150, 203, 244, 281].map((a) => [g.ix + a, g.bottom + 1])
        : [[g.ix + 4, g.bottom + 1], [g.ix + 17, g.bottom + 1]];
      for (const [x, y] of drips) {
        const len = r.int(2, 4);
        for (let j = 0; j < len; j++) {
          P.set(x, y + j, 'drip', j === 0 ? 4 : 3);
          if (j < len - 1) P.set(x + 1, y + j, 'drip', 2);
        }
      }
      if (g.kind === 'meter') {
        // A grave cross over the meter, the crypt's own (its backdrop is set with them), on
        // a stone step. A keystone wider at the top was tried first: at 4x it was a bucket.
        const cx = g.ix + (g.iw >> 1);
        P.rect(cx - 8, g.top - 3, 17, 3, 'rim', 3);
        P.rect(cx - 8, g.top - 3, 17, 1, 'rim', 5);
        ascii(P, [
          '...454...',
          '...453...',
          '...442...',
          '455444432',
          '444444332',
          '222442221',
          '...442...',
          '...442...',
          '...432...',
          '...432...',
          '...432...',
          '..44322..',
        ], cx - 4, g.top - 15, 'rim');
      }
    },
    pattern: specks('DUNGEON', 500, 1),
  },

  // Bark and leaves: a branch of the forest's trees, furrowed, with leaf clusters in the
  // canopy's greens at the bar's ends and crowning the meter. The fill is the zone's own
  // firefly green, the colour of its particles.
  FOREST: {
    text: inks({ edge: '#060a02', line: '#1e1a0a', dark: '#3a2a14', lite: '#fffbe0',
      ink: '#fff3c4', num: '#f6f2e0', hot: '#ff7486' }),
    mats: {
      rim: ['#100804', '#2b1a0e', '#442f24', '#5e4432', '#7d6048', '#a4876a'],
      leaf: ['#061002', '#17340c', '#285414', '#3e7a1c', '#5ea42a', '#94d048'],
    },
    well: '#050a04', wellA: 0.7,
    fill: ['#0a2004', '#1c5a10', '#34961e', '#62d63a', '#a6f47a', '#e4ffcc'],
    fillHot: ['#143a08', '#3aa820', '#7aea4a', '#b0ff8a', '#dcffc4', '#ffffff'],
    *frame(P, g) {
      const r = R('FOREST', g.kind);
      yield* grain(P, g, r, g.kind === 'bar' ? 90 : 90, -1, [2, 3, 4]);
      yield* grain(P, g, r, 30, 1, [5]);
      if (g.kind === 'bar') {
        puffs(P, 'leaf', g.left + 1, g.iy + 8, 7, 9, 3, r);
        puffs(P, 'leaf', g.right, g.iy + 10, 7, 9, 3, r);
        // A twig of leaves hanging under the branch.
        puffs(P, 'leaf', g.ix + 214, g.bottom + 2, 8, 2, 2, r, -1);
      } else {
        puffs(P, 'leaf', g.ix + (g.iw >> 1), g.top - 12, 15, 11, 3, r);
        for (const a of [98, 236, 350]) puffs(P, 'leaf', g.left, g.iy + a, 4, 8, 2, r);
      }
    },
    pattern: specks('FOREST', 700, 1),
  },

  // Grey swamp stone under a blanket of moss, strands of it hanging off the bottom.
  SWAMP: {
    text: inks({ edge: '#060802', line: '#1c200e', dark: '#3a3a1a', lite: '#ffffe0',
      ink: '#ffff66', num: '#f2f4e0', hot: '#ffcc00' }),
    mats: {
      rim: ['#0a0c08', '#2b2a24', '#3f3a39', '#585654', '#776f69', '#9f9790'],
      moss: ['#080c00', '#282e05', '#3e4519', '#575d27', '#6c763a', '#8e9a52'],
    },
    well: '#060804', wellA: 0.72,
    fill: ['#1a2000', '#4a5a00', '#8aa000', '#c4d418', '#ecf45a', '#fcffc0'],
    fillHot: ['#2a3400', '#8aa800', '#d0e020', '#f0ff60', '#faffa8', '#ffffff'],
    *frame(P, g) {
      const r = R('SWAMP', g.kind);
      yield* joints(P, g, 14, 3, -2, true);
      yield* chips(P, g, r, 80, -1);
      yield* chips(P, g, r, 30, 1);
      // Moss over the lit faces, ragged along its lower edge, and strands hanging below.
      yield* rimEach(P, g, (x, y, f) => {
        const lit = f.side === 'top' || (g.kind === 'meter' && f.side === 'left');
        const deep = 2 + ((f.along * 7 + (f.along >> 2) * 3) % 3);
        if (lit && f.out > f.width - deep) P.set(x, y, 'moss', f.out === f.width ? 5 : 3);
      });
      const strands = g.kind === 'bar'
        ? [22, 64, 101, 140, 178, 226, 259, 288].map((a) => [g.ix + a, g.bottom])
        : [[g.ix + 6, g.bottom], [g.ix + 20, g.bottom]];
      for (const [x, y] of strands) {
        const len = r.int(3, 6);
        for (let j = 0; j < len; j++) P.set(x + (j > 3 ? 1 : 0), y + j, 'moss', j < 2 ? 3 : 2);
      }
      if (g.kind === 'meter') puffs(P, 'moss', g.ix + (g.iw >> 1), g.top - 3, 17, 5, 2, r);
      else {
        puffs(P, 'moss', g.left + 2, g.iy + 2, 6, 5, 2, r);
        puffs(P, 'moss', g.right - 2, g.iy + 2, 6, 5, 2, r);
      }
    },
    pattern: specks('SWAMP', 900, 1),
  },

  // Downtown's honey timber (its gallery beam), grained and bound with riveted iron; the
  // fill the warm orange of its lanterns. Its grain and specks draw from the stream of the
  // name it was painted under, VILLAGE (themes.js artSeed), so the rename moved none of them.
  DOWNTOWN: {
    text: inks({ edge: '#0a0610', line: '#241a30', dark: '#4a2e3a', lite: '#fff8f0',
      ink: '#ffe9d6', num: '#fff4ea', hot: '#ff9c70' }),
    mats: {
      rim: ['#231612', '#5a3218', '#94602e', '#b07436', '#d09a58', '#f2cf94'],
      iron: ['#0c0810', '#2a2230', '#40364a', '#5a5064', '#7c7288', '#a89eb2'],
    },
    well: '#0e0a14', wellA: 0.72,
    fill: ['#3a0e00', '#963010', '#dc5a28', '#ff8a5c', '#ffc09a', '#fff0dc'],
    fillHot: ['#5a1a04', '#e06a38', '#ff9a6a', '#ffc4a0', '#ffe4d0', '#ffffff'],
    *frame(P, g) {
      const r = R(artSeed('DOWNTOWN'), g.kind);
      yield* grain(P, g, r, 80, -1, [2, 3, 4]);
      yield* joints(P, g, 74, 36, -2);
      if (g.kind === 'bar') {
        band(P, g, -g.T.l + 1, 6, 'iron');
        band(P, g, g.iw + g.T.r - 7, 6, 'iron');
        band(P, g, 145, 6, 'iron');
      } else {
        band(P, g, -g.T.t + 1, 6, 'iron');
        for (const a of [136, 274]) band(P, g, a, 6, 'iron');
        band(P, g, g.ih + g.T.b - 7, 6, 'iron');
        // A little pitched roof over the meter, shingled, as the street's houses are.
        const cx = g.ix + (g.iw >> 1);
        for (let j = 0; j < 12; j++) {
          const hw = 3 + Math.round(j * 1.35);
          for (let i = -hw; i <= hw; i++) {
            const t = j === 0 ? 5 : i === -hw ? 4 : i === hw ? 1 : (j + (i + 40 >> 2)) % 3 === 0 ? 2 : i < 0 ? 4 : 3;
            P.set(cx + i, g.top - 13 + j, 'rim', t);
          }
        }
      }
    },
    pattern: specks(artSeed('DOWNTOWN'), 600, 1),
  },

  // White marble in gold: the citadel's blocks, a gilt line round the well and gilt
  // bosses at the corners, a gilt orb on a plinth over the meter; the fill royal gold.
  CITADEL: {
    text: inks({ edge: '#060a18', line: '#18223e', dark: '#2a3a66', lite: '#fffcee',
      ink: '#ffd21f', num: '#f4f6ff', hot: '#ffe680', flash: '#ffffff' }),
    mats: {
      rim: ['#161b1c', '#675f5b', '#8d867b', '#aaa49d', '#d5c9c0', '#fcf9ef'],
      gold: ['#2a1c00', '#7a5608', '#b88a18', '#e8b82a', '#ffdc5a', '#fff4c0'],
    },
    well: '#0a1024', wellA: 0.7,
    fill: ['#3a2800', '#8a6010', '#c89420', '#f4c42c', '#ffe070', '#fff8d0'],
    fillHot: ['#5a4000', '#d0a020', '#ffd040', '#ffe890', '#fff6cc', '#ffffff'],
    *frame(P, g) {
      yield* joints(P, g, 26, 0, -2);
      yield* rimEach(P, g, (x, y, f) => {
        if (f.out === 1) P.set(x, y, 'gold', f.side === 'top' || f.side === 'left' ? 2 : 4);
      });
      for (const [x, y] of corners(g)) {
        P.disc(x, y, 3, 'gold', 3);
        P.shadeBlob(x - 4, y - 4, x + 4, y + 4, 'gold', 3, g.ring);
        P.set(x - 1, y - 1, 'gold', 5); P.set(x + 1, y + 1, 'gold', 2);
      }
      if (g.kind === 'meter') {
        const cx = g.ix + (g.iw >> 1);
        P.rect(cx - 9, g.top - 5, 18, 5, 'rim', 4);
        P.rect(cx - 9, g.top - 5, 18, 1, 'rim', 5);
        P.rect(cx - 9, g.top - 1, 18, 1, 'rim', 2);
        P.rect(cx - 7, g.top - 7, 14, 2, 'gold', 3);
        P.disc(cx, g.top - 14, 6, 'gold', 3);
        P.shadeBlob(cx - 8, g.top - 22, cx + 8, g.top - 6, 'gold', 3, g.ring);
        P.set(cx, g.top - 22, 'gold', 4);
      }
    },
    pattern: specks('CITADEL', 600, 1),
  },

  // Cloud: the storm's own cloud ledges, puffed along every edge and shaded lavender
  // underneath, and the fill a violet charge with white lightning striking through it.
  STORM: {
    text: inks({ edge: '#0a0612', line: '#241838', dark: '#40305a', lite: '#ffffff',
      ink: '#ffe066', num: '#fbf6ff', hot: '#dc8cff' }),
    mats: {
      rim: ['#2e2040', '#8c70a0', '#b8a4b8', '#d5c9c0', '#ebe2da', '#fcf9ef'],
    },
    well: '#120a1e', wellA: 0.72,
    fill: ['#1a0630', '#4a1480', '#7c34c4', '#b35ef6', '#dca4ff', '#f8e8ff'],
    fillHot: ['#2a0a4a', '#8a3ad0', '#c070ff', '#e0b0ff', '#f4dcff', '#ffffff'],
    *frame(P, g) {
      const r = R('STORM', g.kind);
      if (g.kind === 'bar') {
        for (let a = 150; a < g.iw - 6; a += r.int(11, 16)) puffs(P, 'rim', g.ix + a, g.top + 1, 5, 1, 2, r);
        for (let a = 4; a < g.iw; a += r.int(10, 15)) puffs(P, 'rim', g.ix + a, g.bottom - 1, 5, 2, 3, r, -1);
        puffs(P, 'rim', g.left + 1, g.iy + 9, 5, 9, 3, r);
        puffs(P, 'rim', g.right - 1, g.iy + 9, 5, 9, 3, r);
      } else {
        puffs(P, 'rim', g.ix + (g.iw >> 1), g.top - 8, 16, 9, 4, r);
        for (let a = 20; a < g.ih - 10; a += r.int(34, 48)) puffs(P, 'rim', g.left + 1, g.iy + a, 2, 6, 3, r);
        puffs(P, 'rim', g.ix + (g.iw >> 1), g.bottom, 16, 2, 3, r, -1);
      }
    },
    // Lightning in the charge: STRIKES, not a trace. The first bolt here was one even zigzag
    // the whole length of the bar and of the meter, stepping up and down by the same pixel
    // every other column -- at 4x it was a heartbeat monitor's trace, and at 1x a wavy white
    // line: the squiggle any even zigzag becomes. What reads as lightning is a SLANT: long
    // legs all leaning the same way, short snaps back, a tip that thins out, a fork now and
    // then. The bar (20 rows) takes a few separate strikes, top to bottom across its height,
    // as if out of the cloud rim above it; the meter (416 rows) takes one strike down its
    // whole length. The core is +4 (the ramp's white), a one-pixel glow either side +1.
    pattern: (() => {
      const r = R('STORM', 'strike');
      const maps = { bar: new Map(), meter: new Map() };
      const put = (m, x, y, d) => { const k = `${x},${y}`; if ((m.get(k) || 0) < d) m.set(k, d); };
      // A leg walked row by row (every leg is steeper than 45 degrees), two px wide, one px
      // in its last `thin` rows, with the glow either side.
      const leg = (m, x0, y0, x1, y1, core = 4, thin = 0) => {
        for (let y = y0; y <= y1; y++) {
          const x = Math.round(x0 + ((x1 - x0) * (y - y0)) / Math.max(1, y1 - y0));
          const w = y > y1 - thin ? 1 : 2;
          for (let i = 0; i < w; i++) put(m, x + i, y, core);
          put(m, x - 1, y, 1);
          put(m, x + w, y, 1);
        }
      };
      // The snap back: a short run two rows deep, glowing above and below.
      const snap = (m, xa, xb, y) => {
        for (let x = Math.min(xa, xb); x <= Math.max(xa, xb) + 1; x++) {
          put(m, x, y, 4); put(m, x, y + 1, 4);
          put(m, x, y - 1, 1); put(m, x, y + 2, 1);
        }
      };
      // The bar: four strikes, each down-left, snap right, down-left to a thin tip. No forks
      // at this size: a branch off the lower leg made a stick figure running.
      for (const x0 of [44, 118, 196, 266]) {
        const X = x0 + r.int(-5, 5);
        const L1 = r.int(7, 9), s1 = r.int(2, 4), j = r.int(4, 6), s2 = r.int(5, 7);
        const xa = X - s1, xb = xa + j;
        leg(maps.bar, X, 0, xa, L1);
        snap(maps.bar, xa, xb, L1 + 1);
        leg(maps.bar, xb, L1 + 3, xb - s2, 19, 4, 3);
      }
      // The meter: one strike, legs of 20-34 rows drifting 4-7 px left, snaps 6-9 px right,
      // kept in the middle columns (the left fifth is the tube's own highlight, where white
      // would vanish), a thin fork off every third or so corner.
      let x = 16;
      for (let y = 0; y < 416;) {
        const L = r.int(20, 34), s = r.int(4, 7);
        const x1 = Math.max(9, x - s);
        leg(maps.meter, x, y, x1, Math.min(415, y + L));
        y += L + 1;
        if (y >= 414) break;
        const xb = Math.min(19, x1 + r.int(6, 9));
        snap(maps.meter, x1, xb, y);
        if (r.chance(0.35)) leg(maps.meter, x1 - 1, y + 2, x1 - 4, y + 11, 3, 10);
        y += 2;
        x = xb;
      }
      return (px, py, kind) => maps[kind].get(`${px},${py}`) || 0;
    })(),
  },

  // Bone: a spine of the abyss's pale violet vertebrae, knuckled at every joint, the head
  // of a long bone at each end of the bar and a skull on the meter. The fill is the zone's
  // violet soul-fire.
  ABYSS: {
    text: inks({ edge: '#04020a', line: '#180e28', dark: '#3a2450', lite: '#ffffff',
      ink: '#e2dad4', num: '#f6f0ff', hot: '#c884ff' }),
    mats: {
      rim: ['#0e0818', '#4c3759', '#796880', '#a898a8', '#d0c6c4', '#f1e7dd'],
      void: ['#0a0412', '#0a0412', '#0a0412', '#140a20', '#140a20', '#140a20'],
    },
    well: '#0a0414', wellA: 0.75,
    fill: ['#1a0430', '#4a1080', '#7a28c8', '#aa44ff', '#d09aff', '#f4e4ff'],
    fillHot: ['#2a0a50', '#8a3ae0', '#c070ff', '#dcaaff', '#f0dcff', '#ffffff'],
    *frame(P, g) {
      // Every 16 px a joint: the rail pinched in by a pixel for two, a knuckle swelling out
      // a pixel either side of it.
      const seg = 16;
      const knob = [];
      yield* rimEach(P, g, (x, y, f) => {
        const a = ((f.along % seg) + seg) % seg;
        if (a === 0 || a === 1) {
          if (f.out === f.width) P.clear(x, y);
          else P.add(x, y, -2);
        }
        if ((a === 2 || a === 3 || a === seg - 1 || a === seg - 2) && f.out === f.width) knob.push([x, y, f.side]);
      });
      for (const [x, y, side] of knob) {
        const dx = side === 'left' ? -1 : side === 'right' ? 1 : 0;
        const dy = side === 'top' ? -1 : side === 'bottom' ? 1 : 0;
        if (g.kind === 'meter' && side === 'right') continue;
        P.set(x + dx, y + dy, 'rim', side === 'top' || side === 'left' ? 5 : 2);
      }
      if (g.kind === 'bar') {
        // The head of a long bone at each end: two knuckles and the notch between them.
        for (const [x, dir] of [[g.left, -1], [g.right, 1]]) {
          P.disc(x + dir * 1, g.iy + 3, 4, 'rim', 3);
          P.disc(x + dir * 1, g.iy + 18, 5, 'rim', 3);
        }
        yield* P.shadeBlobSteps(0, 0, P.w - 1, P.h - 1, 'rim', 3, g.ring);
      } else {
        P.disc(g.ix + (g.iw >> 1) - 8, g.bottom + 2, 4, 'rim', 3);
        P.disc(g.ix + (g.iw >> 1) + 8, g.bottom + 2, 4, 'rim', 3);
        yield* P.shadeBlobSteps(0, g.bottom - 6, P.w - 1, P.h - 1, 'rim', 3, g.ring);
        // A skull on the meter, drawn pixel by pixel: round sockets with a lit bridge
        // between them, a nose that does not line up with a gap in the teeth.
        ascii(P, [
          '.....34443.....',
          '...345555443...',
          '..34555544443..',
          '.3455544444433.',
          '.3455444444433.',
          '345444444444432',
          '34ooo44444ooo32',
          '3ooooo454ooooo2',
          '3ooooo444ooooo2',
          '.3ooo44o44ooo2.',
          '..3444ooo4442..',
          '...344444442...',
          '...43434343....',
          '...3o3o3o3o....',
          '....22222......',
        ], g.ix + (g.iw >> 1) - 7, g.top - 15, 'rim', { o: ['void', 3] });
      }
    },
    pattern: specks('ABYSS', 900, 1),
  },

  // Crystal: the nebula's amethyst ledges, cut in facets that catch a glint, shards off
  // the bar's ends and a faceted point over the meter; the fill the zone's pink, starred.
  // The rim is the ledge's own ramp (tools/platpaint/nebula.mjs AMETHYST: deep indigo,
  // purple, violet, lavender, the top face's pink-white). It was the old ledge's teal, each
  // tone now replaced by the amethyst at nearly its luma (44/68/108/147/230 then, 47/76/121/
  // 149/231 now), so the frame keeps its weight and loses the teal-on-magenta clash.
  NEBULA: {
    text: inks({ edge: '#06020e', line: '#1e0e34', dark: '#3a1a5a', lite: '#ffffff',
      ink: '#a8e4ff', num: '#f0f8ff', hot: '#ff78dc' }),
    mats: {
      rim: ['#0b0618', '#302366', '#54399a', '#8862cc', '#a47ee0', '#f4dcfa'],
    },
    well: '#0c0418', wellA: 0.72,
    fill: ['#2a0420', '#6a1050', '#b02888', '#f046c4', '#ff9ae6', '#ffe4f8'],
    fillHot: ['#4a0a3a', '#d03aa8', '#ff6ad6', '#ffa8ec', '#ffd8f6', '#ffffff'],
    *frame(P, g) {
      // Facets: the rail cut into 12-px blocks, each split on its own diagonal -- the face
      // above and left of the cut one tone up, the other one down -- with a glint at each
      // block's lit corner. Diagonals running unbroken along the rail read as twisted ROPE.
      yield* rimEach(P, g, (x, y, f) => {
        const a = ((f.along % 12) + 12) % 12;
        if (a === 0) { P.add(x, y, -2); return; }
        P.add(x, y, a + (f.width - f.out) * (12 / f.width) * 0.5 < 7 ? 1 : -1);
        if (a === 1 && f.out === f.width && (f.side === 'top' || f.side === 'left')) P.set(x, y, 'rim', 5);
      });
      // A faceted crystal: a prism of half-width hw, `h` tall, pointing along (dx, dy),
      // its left face lit, a ridge left of the axis, the point short and faceted.
      const shard = (x0, y0, dx, dy, hw, h) => {
        for (let k = 0; k < h; k++) {
          const w = k < h - hw ? hw : Math.max(0, hw - (k - (h - hw)) - 1);
          for (let j = -w; j <= w; j++) {
            const t = j < -1 ? 4 : j === -1 ? 5 : j < w - 1 ? 3 : 2;
            P.set(x0 + dx * k + (dx ? 0 : j), y0 + dy * k + (dy ? 0 : j), 'rim', t);
          }
        }
      };
      if (g.kind === 'bar') {
        shard(g.left, g.iy + 10, -1, 0, 5, 8);
        shard(g.right, g.iy + 10, 1, 0, 5, 8);
        shard(g.ix + 210, g.bottom, 0, 1, 2, 5);
      } else {
        shard(g.ix + (g.iw >> 1), g.top, 0, -1, 8, 22);
        shard(g.ix + (g.iw >> 1) - 10, g.top, 0, -1, 3, 9);
        shard(g.ix + (g.iw >> 1) + 10, g.top, 0, -1, 3, 8);
      }
    },
    pattern: specks('NEBULA', 700, 2),
  },

  // Star-steel: pale blue-grey metal like the cosmos's ledge lights, set with four-point
  // stars at the corners and over the meter; the fill cold starlight.
  COSMOS: {
    text: inks({ edge: '#01030c', line: '#0c1a36', dark: '#1c2e5a', lite: '#ffffff',
      ink: '#b0c8e6', num: '#f4f8ff', hot: '#8fd0ff', flash: '#ffffff' }),
    mats: {
      rim: ['#01030c', '#2a3a55', '#4a5c78', '#6e8098', '#9aabbf', '#dfe9f5'],
      star: ['#01030c', '#6c88c0', '#9ab4e8', '#c8d8ff', '#e8f0ff', '#ffffff'],
    },
    well: '#01040e', wellA: 0.75,
    fill: ['#0a1a3a', '#1e3c7a', '#3c6cc0', '#7aa8f0', '#bcd6ff', '#f4f8ff'],
    fillHot: ['#1a3060', '#4a80d8', '#8ab8ff', '#c4dcff', '#e8f2ff', '#ffffff'],
    *frame(P, g) {
      yield* joints(P, g, 32, 16, -1);
      for (const [x, y] of corners(g)) star(P, x, y, 4, 'star');
      if (g.kind === 'meter') star(P, g.ix + (g.iw >> 1), g.top - 12, 9, 'star');
      else { star(P, g.ix + 180, g.top, 3, 'star'); star(P, g.ix + 246, g.bottom, 3, 'star'); }
    },
    pattern: specks('COSMOS', 900, 2),
  },

  // Jade: the starfield's green blocks with their pale chevrons; the fill its orange.
  STARFIELD: {
    text: inks({ edge: '#010a06', line: '#062a1c', dark: '#0e4030', lite: '#f0fff4',
      ink: '#44ffa0', num: '#eafff2', hot: '#ff9448' }),
    mats: {
      rim: ['#03100c', '#123128', '#1c4332', '#275140', '#3e7a60', '#8ccaa4'],
    },
    well: '#010c0a', wellA: 0.72,
    fill: ['#3a0800', '#8a1c00', '#d03600', '#ff5a10', '#ff9a50', '#ffe0b0'],
    fillHot: ['#5a1000', '#e04a08', '#ff7a30', '#ffb070', '#ffdcb0', '#ffffff'],
    *frame(P, g) {
      yield* joints(P, g, 20, 0, -2, true);
      // A pale chevron in each block of the wide faces, pointing up as the ledge's do. Put
      // on every face, the 3-px top and 4-px sides had room for only a stroke or two, and
      // at 4x they were stray marks -- a 'c' here, a caret there.
      yield* rimEach(P, g, (x, y, f) => {
        if (f.side !== 'bottom') return;
        const a = ((f.along % 20) + 20) % 20;
        const up = f.out - 1;                        // rows down from the apex
        if (up <= 4 && Math.abs(a - 10) === up) P.set(x, y, 'rim', 5);
      });
      if (g.kind === 'bar') {
        P.rect(g.left - 3, g.iy - 2, 4, 24, 'rim', 3);
        P.rect(g.right, g.iy - 2, 4, 24, 'rim', 3);
      } else {
        const cx = g.ix + (g.iw >> 1);
        for (let j = 0; j < 10; j++) {
          const hw = 2 + j * 1.6;
          for (let i = -Math.round(hw); i <= Math.round(hw); i++) P.set(cx + i, g.top - 10 + j, 'rim', 3);
        }
      }
      yield* P.shadeBlobSteps(0, 0, P.w - 1, P.h - 1, 'rim', 3, g.ring);
    },
    pattern: specks('STARFIELD', 700, 1),
  },

  // Gilt: the zenith's gold bars, beaded along every rail, a gilt knob at each end and a
  // crown of three gilt points over the meter, a glint of sun on it; the fill sunlight.
  ZENITH: {
    text: inks({ edge: '#140a02', line: '#3a2610', dark: '#5a3e1a', lite: '#ffffff',
      ink: '#fff0c8', num: '#ffffff', hot: '#ffd24a' }),
    mats: {
      rim: ['#1e0e02', '#5a3a0c', '#a46d09', '#ca9130', '#e9bc7e', '#fff4d0'],
      glint: ['#fff4d0', '#fff4d0', '#fff4d0', '#fffae8', '#ffffff', '#ffffff'],
    },
    well: '#1c1420', wellA: 0.62,
    fill: ['#5a3a00', '#b07a10', '#e0aa2a', '#ffd24a', '#fff0a0', '#ffffff'],
    fillHot: ['#7a5000', '#e0b030', '#ffe070', '#fff4b8', '#fffbe6', '#ffffff'],
    *frame(P, g) {
      // Beads: every 6 px along the middle of each face a lit pixel with its shadow below.
      yield* rimEach(P, g, (x, y, f) => {
        const a = ((f.along % 6) + 6) % 6;
        const mid = Math.ceil(f.width / 2);
        if (f.width < 4) return;
        if (f.out === mid + 1 && a === 0) P.set(x, y, 'rim', 5);
        if (f.out === mid && a === 0) P.add(x, y, -2);
      });
      if (g.kind === 'bar') {
        for (const [x, dir] of [[g.left, -1], [g.right, 1]]) {
          P.disc(x + dir * 1, g.iy + 10, 6, 'rim', 3);
          P.disc(x + dir * 6, g.iy + 10, 2, 'rim', 3);
        }
      } else {
        const cx = g.ix + (g.iw >> 1);
        P.rect(cx - 14, g.top - 6, 29, 6, 'rim', 3);
        for (const [dx, h] of [[-10, 11], [0, 17], [10, 11]]) {
          for (let k = 0; k < h; k++) {
            const hw = k < h - 5 ? 2 : k < h - 2 ? 1 : 0;
            for (let j = -hw; j <= hw; j++) P.set(cx + dx + j, g.top - 6 - k, 'rim', 3);
          }
          P.disc(cx + dx, g.top - 6 - h, 2, 'rim', 3);
        }
        P.disc(cx, g.bottom + 2, 4, 'rim', 3);
      }
      yield* P.shadeBlobSteps(0, 0, P.w - 1, P.h - 1, 'rim', 3, g.ring);
      if (g.kind === 'meter') star(P, g.ix + (g.iw >> 1) + 12, g.top - 26, 4, 'glint');
      else star(P, g.right + 2, g.iy + 3, 3, 'glint');
    },
    pattern: specks('ZENITH', 600, 1),
  },
};

/**
 * Materials that are LIGHT, not things: no dark outline, because a point of light drawn with
 * a dark edge reads as a cut-out of one (the art brief's rule, and the decor's).
 */
export const GLOWS = new Set(['star', 'glint']);

/**
 * The frame kit, for the scoreboard's panels (gameoverskin.js), which are these frames round
 * bigger boxes and dress their long rails with the same pieces.
 */
export { R as hudRng, chips, puffs, band, plate, corners, star };
