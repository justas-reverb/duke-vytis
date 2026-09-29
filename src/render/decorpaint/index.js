// The platform furniture, zone by zone: what each element IS, how it is drawn, and where
// a ledge puts it. The single source of truth for all of it -- the runtime (decor.js),
// the importer (tools/import-decor.mjs), the artist's sheet (tools/decor-sheet.mjs), the
// viewer (tools/shot-decor.mjs) and the tests (tools/test-decor.mjs) all read it from here.
//
// One module per zone, so each can be redrawn on its own without touching another's file.
// A zone module exports:
//
//   CHANCE    the share of ledges at least 22 units wide that carry anything at all.
//
//   ELEMENTS  { KEY: element }, KEY being the name in capitals with '_' for spaces.
//             An element is:
//     name      as on the sheet: 'SLUMPED SKELETON'. The artist's PNG is named from it.
//     box       [w, h] in ART pixels -- one art pixel is one backing-store pixel at zoom 1,
//               the Duke's own scale, and a quarter of a world unit. The whole room the
//               element has: it is drawn as one sprite exactly this size.
//     anchor    'stand'  the box's bottom row sits ON the walking surface.
//               'hang'   the box's top row laps 1 px over the ledge's UNDERSIDE -- the
//                        underside the zone's tile DRAWS (decor.js undersideFor: 16 art px
//                        in the crypt, the full PLAT_THICK = 7 units = 28 px where the tile
//                        is solid). The clear gap below a ledge to the next is at least
//                        FLOOR_H - PLAT_THICK = 23 units (92 art px), and the Duke, 28 units
//                        tall, is already squeezing through it.
//               'float'  the box's bottom row is `lift` art px above the surface.
//     lift      art px, 'float' only.
//     frames    animation frames (1 = still), played at `fps` frames a second, each
//               instance at its own phase so a row of them does not pulse in step.
//     variants  different drawings of the same thing; a scene picks one per instance.
//     notes     what to draw, for the artist -- printed on the sheet under the box.
//     paint(p, variant, frame, th)
//               THE REDRAW GOES HERE. Draw into p, a Pix exactly box-sized, y DOWN, (0, 0)
//               top-left (util.js: rect, lines, discs, ASCII, an outline pass, shade/mix,
//               a seeded rng). th is the zone's theme from src/game/themes.js. Must be
//               deterministic and must stay inside the box (test-decor checks both).
//     paintCanvas(g, variant, frame, th)
//               the PLACEHOLDER: the old world-unit painter from legacy.js, scaled into
//               the box on a 2D context. Used only while there is no paint(). Every zone
//               has been redrawn, so no element carries one today; the hook stays for a
//               new element that needs a stand-in before it is drawn.
//   and optionally
//     shadow    [dx, w, h] art px: a stone-coloured shadow cast into the lit lip under a
//               'stand' element, dx from its box's left edge (see decor.js for why).
//     alpha(t, phase)  the whole sprite's opacity, 0..1, at time t -- a pulse. No element
//               uses it now: it dims the whole sprite, core and all, and ZENITH's light
//               shaft, the one that did, read as a warm-grey column among the backdrop's
//               pale ones; it breathes in its frames round a steady core instead, and
//               test-decor fails the shaft if it grows an alpha() hook again. Kept for a
//               thing that should fade as a whole.
//     bob(t, phase)    art px to lift the whole sprite by at time t -- a bob. Integer.
//               phase is the instance's x in world units, so neighbours differ.
//
//   scene(r, wArt, th) -> [{ key, variant, x }]
//             what one ledge carries. r is the ledge's own random stream (seeded by its
//             floor number, after the draw that decided it carries anything), wArt its
//             width in art px, th its theme. x is the box's left edge in art px from the
//             ledge's left end, and every box must lie inside [0, wArt]. Drawn in list
//             order, so later entries go on top. Deterministic: same r, same scene, or a
//             ledge's furniture would change as it scrolled.
//
// WHERE A SPRITE COMES FROM, per element, first that exists: the artist's PNG, if
// src/render/decorart.js lists one (assets/decor/, checked in by tools/import-decor.mjs);
// else paint(); else paintCanvas(). So a zone can be redrawn in code, or arrive as PNGs,
// one element at a time, and the rest keeps working.

import { THEMES } from '../../game/themes.js';
import * as BASEMENT from './basement.js';
import * as DUNGEON from './dungeon.js';
import * as FOREST from './forest.js';
import * as SWAMP from './swamp.js';
import * as DOWNTOWN from './downtown.js';
import * as CITADEL from './citadel.js';
import * as STORM from './storm.js';
import * as ABYSS from './abyss.js';
import * as NEBULA from './nebula.js';
import * as COSMOS from './cosmos.js';
import * as STARFIELD from './starfield.js';
import * as ZENITH from './zenith.js';

const MODULES = { BASEMENT, DUNGEON, FOREST, SWAMP, DOWNTOWN, CITADEL, STORM, ABYSS, NEBULA, COSMOS, STARFIELD, ZENITH };

/**
 * Every zone, in THEME order -- index i is themeIndex i -- as { name, ELEMENTS, scene,
 * CHANCE }. Built from themes.js rather than listed, so a reordered theme table cannot put
 * the forest's trees in the swamp. A theme with no module gets an empty zone.
 */
export const ZONES = THEMES.map(({ name }) => {
  const m = MODULES[name];
  return m ? { name, ELEMENTS: m.ELEMENTS, scene: m.scene, CHANCE: m.CHANCE }
    : { name, ELEMENTS: {}, scene: () => [], CHANCE: 0 };
});

export const ZONE_BY_NAME = Object.fromEntries(ZONES.map((z) => [z.name, z]));

// Not every ledge. A forest with a tree on all of them reads as a hedge.
//
// Per-band, because the bands differ in how much the decoration has to carry. The forest
// and the swamp are identified BY their growth, so they get more; the abyss wants bones to
// be an occasional shock rather than wallpaper. Each zone's number, and why, is in its
// module; this is them in theme order.
export const CHANCE_BY_THEME = ZONES.map((z) => z.CHANCE);

/** The element's PNG file name: DUNGEON-SLUMPED-SKELETON.png. */
export function pngName(zone, name) {
  return `${zone}-${name.replace(/ /g, '-')}.png`;
}

/** Every element of every zone, flat: [{ zone, key, e }] in theme order. */
export function allElements() {
  const out = [];
  for (const z of ZONES) for (const [key, e] of Object.entries(z.ELEMENTS)) out.push({ zone: z.name, key, e });
  return out;
}

/** Which source an element's sprite comes from when there is no PNG: 'paint' or 'placeholder'. */
export function painter(e) {
  return typeof e.paint === 'function' ? 'paint' : typeof e.paintCanvas === 'function' ? 'placeholder' : 'none';
}
