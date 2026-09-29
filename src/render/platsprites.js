// The platform art, rasterised once per zone and kept.
//
// Three canvases each: a LEFT CAP, a TILE that repeats, and a RIGHT CAP. The renderer
// lays them end to end at whatever width a ledge happens to be.
//
// WHY THIS REPLACED THIRTEEN PAINTER FUNCTIONS
//
// A platform used to be drawn procedurally: a material function striping brick or plank
// or crystal into a rect, a cap function stippling studs along its top edge, and four
// colours per zone doing the rest. That was the right answer for exactly as long as the
// only platform art in the project was art I could compute, and it produced twelve zones
// that were recognisably twelve zones. It is the wrong answer the moment somebody who can
// draw hands you tiles.
//
// One art pixel is one screen pixel, the same invariant every other sprite here carries.
// The cell is 64x40: sixteen of cap, thirty-two of tile, sixteen of cap, with the standing
// surface on row 12 -- twelve above it for anything that stands proud, twenty-eight below
// for the body.
//
// EACH ZONE CARRIES ITS OWN PALETTE (`pal` on the zone in platart.js), keyed on its own:
// the same key is a different colour in another zone. There used to be one PAL for the
// whole sheet, eighty keys shared by twelve zones, and it was full -- a painted zone could
// only add colours on a handful of spare keys, and any colour added to the shared ones
// re-snapped zones nobody had touched. So a zone's rows are read with that zone's `pal`
// and nothing else.

import { ZONES, CAP_W, TILE_W, CELL_H, HEAD, BODY } from './platart.js';
import { newCanvas } from './canvases.js';

export { CAP_W, TILE_W, CELL_H, HEAD, BODY };

const cache = new Map();

function rasterise(rows, w, pal) {
  const { c, g } = newCanvas(w, CELL_H);
  for (let y = 0; y < CELL_H; y++) {
    const row = rows[y] || '';
    let x = 0;
    while (x < w) {
      const k = row[x];
      if (!k || k === '.') { x++; continue; }
      let run = 1;
      while (x + run < w && row[x + run] === k) run++;
      const col = pal[k];
      // An unmapped key is a typo in generated data and should be impossible to miss.
      g.fillStyle = col || '#ff00ff';
      g.fillRect(x, y, run, 1);
      x += run;
    }
  }
  return c;
}

/**
 * The three pieces for one zone, by theme name.
 *
 * Falls back to the first zone rather than throwing: a theme renamed in themes.js without
 * the art being re-cut should look wrong, not take the renderer down mid-frame.
 */
export function platArt(themeName) {
  let e = cache.get(themeName);
  if (e) return e;
  const z = ZONES[themeName] || ZONES[Object.keys(ZONES)[0]];
  e = {
    left: rasterise(z.left, CAP_W, z.pal),
    tile: rasterise(z.tile, TILE_W, z.pal),
    right: rasterise(z.right, CAP_W, z.pal),
    wrap: z.wrap,
  };
  cache.set(themeName, e);
  return e;
}

export function resetPlatCache() { cache.clear(); }

/** Which zones have a tile that actually wraps. Reported by tools/test-platstyles.mjs. */
export function wrapReport() {
  return Object.entries(ZONES).map(([name, z]) => ({ name, wrap: z.wrap }));
}
