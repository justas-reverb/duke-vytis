// COSMOS: a single glowing orb that bobs slowly over the ledge. Deep space, weightless.
//
// The bob is not frames: the whole sprite rises and falls, as it always did, through the
// element's bob() hook, a whole world unit at a time. It floats where the sheet says, 40
// art px up -- 8 higher than the old painter's, which in a frame puts it at the Duke's
// waist rather than his knee, clear of anything standing on the ledge.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { PX } from '../../game/constants.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.26;

// The board's orb: a white-hot body, a ring of pale blue round it, a deeper blue rim, and
// a blue glow falling off into the dark. It is a light, so it has no dark outline -- the
// glow is what separates it from the navy sky, and a black ring would put it out. The
// body is shaded as a sphere lit from the upper left, white there and a cold pale blue
// toward the lower right, so it reads as a ball of light and not a hole punched in the sky.
const BODY_LIT = '#ffffff';
const BODY = '#f4f8ff';
const BODY_SHADE = '#c8dcff';
const RING = ['#8fb2ff', '#b4ccff'];     // at rest, swelling
const RIM = ['#4f6ff0', '#6c8cff'];
const HALO = '#3d63ff';
const GLOW = [[0.42, 0.18], [0.62, 0.34]];   // the halo's two rings' strength, per frame

/**
 * The orb's middle: a pixel, not the box's centre between pixels, so the orb is an odd
 * number of pixels across and round the same way on every side. The glow reaches 7 px from
 * it, so the box's last row and column stay empty.
 */
const C = 7;

export const ELEMENTS = {
  ORB: {
    name: 'ORB', box: [16, 16], anchor: 'float', lift: 40, frames: 2, variants: 1, fps: 1.5,
    notes: ['A SOFT GLOWING SPHERE FLOATING 40 PX', 'ABOVE THE LEDGE; THE GAME BOBS IT.',
      '2 FRAMES: ITS GLOW SWELLS AND SETTLES.'],
    // Up and down two world units, a whole unit at a time, as round(sin(1.8t) * 2) did.
    bob: (t, phase) => PX * Math.round(Math.sin(t * 1.8 + phase) * 2),
    // The pulse: at rest the orb is its body, rings and a faint glow; in the second frame
    // its rings flare a step brighter and the glow round it thickens -- then it settles
    // again. Its size never changes, only its light. The first draft flared four one-pixel
    // rays in that frame, and every other beat the orb became a four-point star: the
    // STARFIELD's motif, where the board's orb is a soft ball of light with no points.
    paint(p, v, f) {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const dx = x - C, dy = y - C, d = Math.hypot(dx, dy);
          if (d <= 3.7) {
            // Lit from the upper left: a two-by-two hot spot there, and the shade a crescent
            // round the lower right -- whatever falls outside the same disc moved toward the
            // light. The first shading cut the body along a straight diagonal, and at 4x the
            // orb read as a disc split in two, a button, rather than as a ball.
            const lit = Math.hypot(dx + 1.5, dy + 1.5), rim = Math.hypot(dx + 1.3, dy + 1.3);
            p.set(x, y, lit < 1.2 ? BODY_LIT : rim > 3.9 ? BODY_SHADE : BODY);
          } else if (d <= 4.7) p.set(x, y, RING[f]);
          else if (d <= 5.6) p.set(x, y, RIM[f]);
          else if (d <= 6.5) p.set(x, y, HALO, GLOW[f][0]);
          else if (d <= 7.3) p.set(x, y, HALO, GLOW[f][1]);
        }
      }
    },
  },
};

/** DECOR.orbs' draw, placed on the art pixel: the same random draw, the same place. */
export function scene(r, wArt) {
  const cx = Math.round(16 + r() * Math.max(4, wArt - 32));
  return [{ key: 'ORB', variant: 0, x: Math.max(0, Math.min(Math.floor(wArt) - 16, cx - 2)) }];
}
