// Each zone's side wall, painted in code: a WALL tile and its FACE.
//
// One module per zone, as bgpaint/ and decorpaint/ have, so each can be repainted on its
// own. A zone module default-exports { PAL, wall(r, th), face(r, th) }: wall returns a
// 64 x 128 Pix that repeats both ways, face an 8 x 128 Pix that repeats top to bottom, both
// drawn for the LEFT wall (face on the right, touching the shaft) and both fully opaque --
// the crossfade in walls.js is exact only because they are. r is the zone's seeded stream
// (wallRng), th its theme. tools/test-walls.mjs holds every zone to the brief: seamless,
// darker than its ledges' lit top, no lit line running across it.

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

export const WALL_PAINTERS = {
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
