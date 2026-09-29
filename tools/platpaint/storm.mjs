// STORM: a bank of cloud, painted in code.
//
//   used by  node tools/import-platforms.mjs --provisional   (see ./index.mjs)
//
// WHY THIS ZONE IS PAINTED. The stand-in cut from the old one-off strip set cream cloud
// puffs into a grey stone slab: a ledge of masonry in a zone whose ledges are meant to be
// the cloud tops themselves. No re-cut fixes a drawing of the wrong object, so the cell is
// painted here, and --provisional writes it over the cut.
//
// What it is: cloud all the way through -- a flat, sunlit top to land on, puffs banked
// below it, a scalloped underside, rounded ends. No slab.
//
// It lived in tools/platform-painters.mjs with DOWNTOWN's gallery until each zone got a
// module of its own; it was moved onto the kit (./kit.mjs) without a pixel changing, which
// `node tools/diff-platforms.mjs --ref=0ce590a` shows.
//
// The zone's sky is purple-grey cumulus (src/render/bgpaint/storm.js), soft-edged and no
// brighter than the theme's near tone; its header already says the ledges are the cream
// cloud-tops and must stay the palest thing on screen. So this cloud is cream where the
// sky's are grey, lit from the upper left like theirs, and its shading stays in warm
// creams rather than going grey, because a grey shadow on a flat-topped cream shape is
// exactly what read as stone. The old strip's gold under-light survives as one line on
// the underside's edge; a first version shaded the whole lower half gold and the bank
// read as a loaf.
//
// The decor on this ledge (src/render/decorpaint/storm.js) and the zone's title lettering
// (src/render/titlepaint/storm.js) are drawn in these same creams: change CLOUD and follow
// it there.

import { CELL_W, CELL_H, CAP_W, PERIOD, mod, hash, blank, copies } from './kit.mjs';

export const CLOUD = {
  top: '#fcf9ef',       // row 12: the landing line, the palest colour in the palette
  hi: '#f1e7dd',
  lt: '#e2dad4',
  md: '#d5c9c0',
  sh: '#cdc1b5',
  warm: '#ddb172',      // the storm-light on the underside
  rim: '#8c70a0',       // the sky's lavender, caught on the underside's very edge
};
const RAMP = [CLOUD.hi, CLOUD.lt, CLOUD.md, CLOUD.sh];
const CUTS = [0.5, 0.2, -0.15];

// The puffs of one repeat, in repeat columns: an upper row whose crowns the flat top cuts
// off, and a lower row offset between them, drawn in front, whose bottoms make the
// scalloped underside. Radii vary so the scallops are not a ruled wave. Cloud is texture,
// not an object, so the 4-px slot rule does not apply: a cut through a puff reads as more
// cloud.
const UPPER = [{ u: 10.5, cy: 20, R: 9 }, { u: 27.5, cy: 19.5, R: 9.5 }];
const LOWER = [{ u: 4.5, cy: 28, R: 8 }, { u: 15.5, cy: 30, R: 6 }, { u: 24.5, cy: 28.5, R: 8.5 }];
// How far either side of a tone threshold the checker dither reaches.
const DITHER = 0.06;

/** The STORM cell. */
export function storm() {
  const c = blank();
  // Every puff copy that can touch the cell, in strip coordinates, back to front: all the
  // upper row's copies, then the lower row's. Only a LOWER puff draws a crease on what is
  // behind it: creases between the upper puffs too made every puff a ringed ball, and the
  // bank read as cobbles.
  const inst = [
    ...copies(UPPER, 12).map((p) => ({ x: p.x, cy: p.cy, R: p.R, crease: false })),
    ...copies(LOWER, 12).map((p) => ({ x: p.x, cy: p.cy, R: p.R, crease: true })),
  ];
  // The ends: each a big puff and a smaller one under it, drawn last, and nothing of the
  // repeat beyond them. Strip coordinates of the cell's ends are -16 and 47. They reach
  // no further in than 14 columns from either end, and only pixels out there look at
  // them at all, so the columns where a cap meets the tile are the repeat's and nothing
  // else's.
  const L = -CAP_W, Rt = CELL_W - CAP_W - 1;
  const ends = [
    { x: L + 6.5, cy: 18.5, R: 7 }, { x: L + 7.5, cy: 28, R: 6, crease: true },
    { x: Rt - 5.5, cy: 18.5, R: 7 }, { x: Rt - 6.5, cy: 28, R: 6, crease: true },
  ];
  const clipL = L + 7, clipR = Rt - 7;
  const reach = 14;
  // Rows solid right across, whatever the puffs do: the deck of cloud under the boots.
  // Its lower rows are a puff's in most columns anyway; the band fills between them. The
  // lower puffs reach row 36, filling the body the way the other zones' tiles do. (The
  // renderer's shadow under a ledge follows the drawn underside now, scallop by scallop;
  // when it was a bar at row 40 it hung loose under this cloud.)
  const band = [12, 24];

  for (let y = 12; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const X = x - CAP_W, px = X + 0.5, py = y + 0.5;
      const inside = (p) => Math.hypot(px - p.x, py - p.cy) <= p.R;
      const interior = X >= clipL && X <= clipR;
      const nearEnd = X < L + reach || X > Rt - reach;
      const list = [...(interior ? inst : []), ...(nearEnd ? ends : [])];
      let front = -1;
      list.forEach((p, i) => { if (inside(p)) front = i; });
      const inBand = interior && y >= band[0] && y <= band[1];
      if (front < 0 && !inBand) continue;
      let v;
      if (front >= 0) {
        const p = list[front];
        const l = -((px - p.x) * 0.5 + (py - p.cy) * 0.86) / p.R;
        v = l * 0.7 - (y - 12) / 26 + 0.3;
        // The crease: just outside a nearer puff's upper edge, a step darker.
        for (let i = front + 1; i < list.length; i++) {
          const q = list[i];
          if (!q.crease) continue;
          const d = Math.hypot(px - q.x, py - q.cy);
          if (d > q.R && d <= q.R + 1.2 && py - q.cy < -q.R * 0.3) { v -= 0.25; break; }
        }
      } else {
        v = 0.4 - (y - 12) / 26;
      }
      // A checker where two tones meet, so a puff is shaded rather than ringed.
      const u = mod(X, PERIOD);
      const k = CUTS.find((cut) => Math.abs(v - cut) < DITHER);
      if (k !== undefined) v = ((u + y) & 1) ? k + DITHER : k - DITHER;
      let t = CUTS.findIndex((cut) => v > cut);
      if (t < 0) t = RAMP.length - 1;
      // A sparse speckle a tone darker, below the top rows: the other ten zones are cut
      // from a painted strip and are textured all through, and a cloud in four clean
      // tones next to them looked pasted in. Keyed on the repeat's column, so it wraps.
      if (y > 14 && t < RAMP.length - 1 && hash(u, y + 101) < 0.1) t++;
      c[y][x] = RAMP[t];
    }
  }
  // The landing line: every solid pixel of row 12 the palest colour there is.
  for (let x = 0; x < CELL_W; x++) if (c[12][x]) c[12][x] = CLOUD.top;
  // The underside's edge: the lowest pixel of every column catches the sky's lavender,
  // and the one above it the storm's warm light.
  for (let x = 0; x < CELL_W; x++) {
    for (let y = CELL_H - 1; y > 12; y--) {
      if (!c[y][x]) continue;
      if (y > band[1]) {
        c[y][x] = CLOUD.rim;
        if (c[y - 1][x]) c[y - 1][x] = CLOUD.warm;
      }
      break;
    }
  }
  return c;
}

/** The painter the importer calls. */
export function paint() { return storm(); }
