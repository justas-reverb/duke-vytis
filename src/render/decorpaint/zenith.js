// ZENITH: a shaft of light falling onto the ledge -- the top of the tower, where it opens
// to the sky.
//
// The board's shaft is warm, not the pale blue the old painter used: a white-gold core,
// a gold glow either side of it that thins out in streaks, a few motes hanging in it, and
// where it lands a pool of light spread along the ledge, far wider than the beam. Warm is
// also what separates it here -- this zone's backdrop is already full of cold blue-white
// light columns, and a blue shaft in front of them was one more of them.
//
// THE BOX is 48 wide, not the sheet's first 16. The board's beam is broad for its height --
// its glow about a third as wide as it is tall -- and it lands in a pool of light reaching
// well beyond it along the ledge. In 16 pixels, in a real frame at zoom 1, the beam was a
// needle, or a sword with a hilt, standing on the ledge. At 32, with a four-pixel core in
// a sixteen-pixel glow, it was still a narrow golden post. At 48 the glow is about twenty
// four pixels, the core six, and the pool runs along the ledge to both ends of the box: a
// column of light, as the board draws it.
//
// THE BREATH, and why it is frames now. A light shaft breathes, and the shaft used to do
// it through the alpha() hook -- one opacity for the WHOLE sprite. That is the one thing a
// beam cannot survive: it dims the core along with the glow, and a white-gold core at half
// strength over this zone's blue is a warm grey. A real frame at zoom 1 caught it exactly
// as feared -- two of the three shafts on screen were pale columns standing among the
// backdrop's own pale columns, and only the one caught near the top of its breath read as
// a beam. Easing the hook (it lingered near full and dipped briefly) made the grey rarer,
// not impossible, and "rarer" is not a drawing.
//
// So the breath is drawn instead. Six frames, played at the same angular rate the hook ran
// at, so the period is the pi seconds it always was, and the frame index IS that old breath
// angle cut into six. In every one of them the core is painted identically -- the same six
// pixels, the same alphas, from the top of the box to the foot -- and only the glow, the
// streaks and the pool breathe around it. The beam therefore never goes grey: at the bottom
// of the breath it is the same bright core with a thinner, fainter halo, which is what a
// shaft of light in still air actually looks like.
//
// The hook is gone. tools/test-decor.mjs used to pin it ("the shaft breathes", a swing of
// at least half); that check was measuring the very thing that was wrong, so it now pins
// what the element does instead -- core steady, glow and pool moving, every frame shown.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { rng } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.24;

// Warm, and warmer the fainter it is: the sprite is laid over the sky with alpha, not
// added to it as light would be, so a pale gold at a third strength over this zone's blue
// comes out a dead grey. The faint outer glow is a deep, saturated orange-gold for that
// reason -- laid thin over the blue it lands on a warm light tone, which is what the board
// shows. The heart of the core is the one thing drawn near white: it is the light itself.
// The rest of the core is a cream-gold rather than the zone's particle white, which was
// chosen back when the whole sprite dimmed and the core had to survive being thinned; it
// stays because a warm core is what tells this beam apart from the backdrop's cold ones.
const HOT = '#fffbe8';          // the heart of the core
const CORE = '#ffe8b0';         // the zone's particle colour, warmed
const INNER = '#ffd67a';        // the ledge's lit gold (themes.js, ZENITH platTop), deeper
const GLOW = '#ffb640';
const OUTER = '#f8961e';
const DEEP = '#e87a0c';
const MOTE = '#fffbe8';

const W = 48, H = 92;

// The beam across, from its middle out: [half width, colour, alpha]; a pixel takes the
// innermost band its distance from the middle falls inside. Six pixels of core, a white
// heart two wide in it, and a glow that steps down through gold to a deep orange at its
// edge -- translucent all the way, so the sky shows through it and it reads as light rather
// than as a golden post. The glow's half widths are scaled per row by the shaft's `spread`
// and per frame by its breath; the core's never are, so the core is the same six pixels
// from top to foot and from the first frame to the last.
const CORE_W = 3;
const PROFILE = [
  [1, HOT, 1], [3, CORE, 0.9],
  [4.5, INNER, 0.62], [6.5, GLOW, 0.46], [9, OUTER, 0.32], [12, DEEP, 0.16],
];
const GLOW_FROM = 2;            // PROFILE index of the first band that breathes

// THE BREATH, frame by frame. Six frames at FPS play in 2 pi / 2 = pi seconds, the period the
// old alpha() hook ran at (it was sin(t * 2 + phase)); decor.js's frameAt offsets each
// instance by frames * phase / 2 pi, so the frame index is that same angle in sixths and two
// shafts standing a world unit apart are a frame out of step with each other, as they were.
//
// The curve is the hook's easing kept: u = (1 - sin)/2, strength 1 - u^2, so the glow
// lingers near full and dips briefly rather than spending half its life dim. The floor is
// 0.52 and not the hook's 0.46 because it no longer has to carry the core: the glow alone
// may go thin, but a beam with almost no halo left is the needle the 16-px box drew, so the
// dip stops short of that. Each frame is read at the MIDDLE of its sixth, which also keeps
// any two neighbouring frames different -- read at the edges, two pairs came out identical.
const FRAMES = 6;
const FPS = (FRAMES * 2) / (2 * Math.PI);
const GLOW_LO = 0.52;
const BREATH = Array.from({ length: FRAMES }, (_, f) => {
  const u = (1 - Math.sin((2 * Math.PI * (f + 0.5)) / FRAMES)) / 2;
  return GLOW_LO + (1 - GLOW_LO) * (1 - u * u);
});

// Motes fall one row a frame, and fade in and out over the six, so the dust drifts down the
// beam and each one starts again while it is almost invisible. Each mote is a frame further
// through that fall than the one before it, so no frame is left without any.
const MOTE_FALL = FRAMES - 1;
const MOTE_FADE = [0.3, 0.75, 1, 1, 0.75, 0.3];

/**
 * The two shafts. The first is the board's: one straight column of light down the middle
 * of the box, its glow the same width all the way down. The second is the light through a
 * gap: a cone, narrow at the top and spreading as it falls, its streaks fanning out with
 * it, into a wider, hotter pool -- a spotlight's shape rather than a column's, and a
 * different drawing, not the first one bent. (A beam leaning in at an angle was tried for
 * it first: at zoom 1 it was a golden stick propped against nothing.)
 *
 * spread: the glow's width at the top row and at the foot, as a scale on PROFILE.
 * streaks: [offset from the middle at the foot, first row, rows] of the glow a step
 * brighter, as the board's rays are; each scales with the spread, so on the cone they fan.
 * pool: [half width, strength] of the light where it lands.
 */
const SHAFTS = [
  {
    spread: [1, 1.1],
    streaks: [[-6.5, 14, 40], [8.5, 30, 34], [-9.5, 50, 24], [6.5, 8, 18]],
    motes: 6, pool: [23, 1],
  },
  {
    spread: [0.6, 1.4],
    streaks: [[-7.5, 18, 50], [9.5, 26, 44], [-12.5, 52, 26], [12.5, 60, 20]],
    motes: 5, pool: [23.5, 1.1],
  },
];

/**
 * How much of the beam there is at row y: it comes in from above the box, so it fades in
 * over the top thirty rows -- in whole steps of five, flat across the beam, so the top of
 * it reads as a column that goes on up out of sight rather than as a point.
 */
const fade = (y) => Math.min(1, Math.ceil(((y + 1) / 30) * 6) / 6);

export const ELEMENTS = {
  LIGHT_SHAFT: {
    name: 'LIGHT SHAFT', box: [W, H], anchor: 'stand', frames: FRAMES, fps: FPS, variants: 2,
    notes: ['A WARM WHITE-GOLD BEAM FALLING ONTO THE', 'LEDGE: A BRIGHT CORE, A STREAKY GLOW, A',
      'WIDE POOL WHERE IT LANDS. THE GLOW BREATHES.'],
    paint(p, v, frame = 0) {
      const s = SHAFTS[v];
      const r = rng('SHAFT', v);
      const mid = W / 2;
      // The beam stops a row short of the box's foot: that last row lies over the tile's
      // own dark top edge, which is what the landing line is drawn against, and the light
      // lands ON the ledge -- it does not paint over its edge.
      const foot = H - 2;
      const breath = BREATH[((frame % FRAMES) + FRAMES) % FRAMES];
      // The glow swells and shrinks a little as well as brightening and dimming: about a
      // pixel and a half either side over the breath. Alpha alone read as a lamp being
      // turned up and down; the moving edge is what makes it look like air.
      const swell = 0.8 + 0.2 * breath;
      const base = (y) => s.spread[0] + ((s.spread[1] - s.spread[0]) * y) / foot;
      const spread = (y) => base(y) * swell;

      // The beam. Each band is filled as a span, outermost first, and the next one in is
      // painted over it -- p.set replaces, so a pixel ends in the innermost band it falls
      // inside, which is the same rule as asking each pixel for the first band that fits it
      // and six spans a row instead of forty-eight searches. That matters now: six frames
      // of two variants is six times the sprites the still shaft built, and warmDecor
      // builds every one of them in a single frame while the zone below is still on screen.
      //
      // Where the beam fades in at the top, the core takes the colour of the band outside
      // it -- white thinned over the blue sky is grey, and the top of the beam should be a
      // gold haze, not a grey one.
      for (let y = 0; y <= foot; y++) {
        const k = fade(y), sc = spread(y);
        const warm = k >= 1 ? 0 : k > 0.5 ? 1 : 2;
        for (let i = PROFILE.length - 1; i >= 0; i--) {
          const [hw, , a] = PROFILE[i];
          const half = i < GLOW_FROM ? hw : CORE_W + (hw - CORE_W) * sc;
          const col = PROFILE[Math.min(PROFILE.length - 1, i < GLOW_FROM ? i + warm : i)][1];
          // The one line the whole redraw is about: only the glow is multiplied by the
          // breath. The core's alpha is what it is in every frame.
          const alpha = a * k * (i < GLOW_FROM ? 1 : breath);
          const x1 = Math.floor(mid - 0.5 + half);
          for (let x = Math.ceil(mid - 0.5 - half); x <= x1; x++) p.set(x, y, col, alpha);
        }
      }

      // Streaks: stretches of the glow a step brighter, as the board's rays are. Each keeps
      // to its place in the glow as the glow widens, so on the cone they fan out with it --
      // and as the glow breathes they draw in and out with it. They belong to the glow, so
      // they breathe with it and they never touch the core: a streak blended over the core
      // would make it a different colour in different frames, and the core is the promise.
      for (const [off, y0, len] of s.streaks) {
        const side = Math.sign(off), out = Math.abs(off) - CORE_W;
        for (let y = y0; y < Math.min(foot - 6, y0 + len); y++) {
          const x = Math.floor(mid + side * (CORE_W + (out * spread(y)) / s.spread[1]));
          if (Math.abs(x + 0.5 - mid) <= CORE_W) continue;
          p.blend(x, y, INNER, 0.28 * fade(y) * breath);
        }
      }

      // Motes hanging in the light: single bright pixels in the glow, never two near each
      // other and never on the core. They used to be placed at least three pixels out from
      // the middle, which is still inside a six-pixel core -- one of them sat in the core
      // where, being nearly the core's own colour, it simply did not show. Four is out.
      //
      // Their fall is the one thing here that moves rather than brightens, which is what
      // makes the shaft read as alive even at the top of the breath where the glow barely
      // changes. Blended, not set: a mote faded to a third would otherwise REPLACE the
      // brighter glow under it and punch a dim hole in the beam.
      const taken = [];
      for (let i = 0; i < s.motes; i++) {
        let x, y, tries = 0;
        do {
          y = r.int(28, H - 14 - MOTE_FALL);
          const reach = Math.max(6, Math.floor(CORE_W + 3 * base(y)));
          x = Math.floor(mid) + (r.next() < 0.5 ? -1 : 1) * r.int(4, reach);
          tries++;
        } while (tries < 30 && taken.some(([a, b]) => Math.abs(a - x) < 4 && Math.abs(b - y) < 10));
        taken.push([x, y]);
        const age = (frame + i) % FRAMES;
        p.blend(x, y + age, MOTE, 0.95 * MOTE_FADE[age]);
      }

      // The pool where it lands: light spilled along the ledge, a low mound of it -- wide
      // at the ledge and narrowing as it rises, hottest where the core strikes and dying
      // away toward the box's ends. Its last two rows are held dim, because they sit right
      // on the ledge's top edge and a bright band there would read as a second, brighter
      // landing line; its brightest row is the one above them.
      //
      // The pool is spilt glow, so it breathes with the glow: the mound shrinks back along
      // the ledge and steps down the ramp as the halo thins, and is never brighter than it
      // is here at the top of the breath, which is what the landing line was checked against.
      const [half, strength] = s.pool;
      const RISE = [0.55, 0.85, 1, 0.72, 0.42, 0.18];     // by rows above the foot
      const STEPS = [[0.85, HOT, 1], [0.7, CORE, 0.9], [0.52, INNER, 0.72], [0.36, GLOW, 0.52],
        [0.2, OUTER, 0.36], [0.08, DEEP, 0.2]];
      const dim = 0.7 + 0.3 * breath;
      for (let y = foot - RISE.length + 1; y <= foot; y++) {
        const cap = y === foot ? 0.3 : y === foot - 1 ? 0.55 : 1;
        for (let x = 0; x < W; x++) {
          const dx = Math.abs(x + 0.5 - mid);
          const across = dx <= CORE_W ? 1 : Math.max(0, 1 - (dx - CORE_W) / (half - CORE_W));
          const step = STEPS.find(([lo]) => across * RISE[foot - y] * strength * breath > lo);
          if (step) p.blend(x, y, step[1], Math.min(step[2] * dim, cap));
        }
      }
    },
  },
};

/**
 * DECOR.beams' draw, placed on the art pixel: the same random draw, the beam's middle in
 * the same place as when the box was 16 wide (the wider box starts 16 pixels further
 * left). The variant is one more draw after it, which moves nothing: nothing follows it.
 */
export function scene(r, wArt) {
  const cx = Math.round(16 + r() * Math.max(4, wArt - 32));
  return [{ key: 'LIGHT_SHAFT', variant: Math.floor(r() * 2), x: Math.max(0, Math.min(Math.floor(wArt) - W, cx - 18)) }];
}
