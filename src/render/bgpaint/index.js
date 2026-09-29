// Each zone's three background layers, painted in code: FAR, MID and NEAR.
//
// One module per zone so each can be repainted on its own. A zone module default-exports
// { far, mid, near }, each (g, T, th, r, i): paint a T x T tile (T is 256) into the 2D
// context g, in the colours of theme th, using the seeded random stream r; i is the zone's
// index. Leave pixels transparent where the layer behind should show. EVERY LAYER MUST
// WRAP both ways -- see util.js for drawing that wraps, and tools/test-backgrounds.mjs,
// which fails a layer whose opposite edges do not meet.
//
// These are the FALLBACK. Where the artist's PNG for a zone and layer exists (listed in
// src/render/bgart.js by tools/import-backgrounds.mjs), the game draws that instead.

import basement from './basement.js';
import dungeon from './dungeon.js';
import forest from './forest.js';
import swamp from './swamp.js';
import downtown from './downtown.js';
import citadel from './citadel.js';
import storm from './storm.js';
import abyss from './abyss.js';
import nebula from './nebula.js';
import cosmos from './cosmos.js';
import starfield from './starfield.js';
import zenith from './zenith.js';

export const ZONE_PAINTERS = {
  BASEMENT: basement,
  DUNGEON: dungeon,
  FOREST: forest,
  SWAMP: swamp,
  DOWNTOWN: downtown,
  CITADEL: citadel,
  STORM: storm,
  ABYSS: abyss,
  NEBULA: nebula,
  COSMOS: cosmos,
  STARFIELD: starfield,
  ZENITH: zenith,
};
