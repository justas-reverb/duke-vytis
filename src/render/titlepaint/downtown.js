// DOWNTOWN: the name spelled in lit windows, the way a street of houses spells it at night.
//
// The letters are the font's own square pixels, and each square is a WINDOW: warm lamplit
// glass in a thin timber frame, with a glazing bar wherever one square meets the next, so a
// stroke is a row of panes and the word is a house front with its rooms lit in the shape of
// the name. Every pane is its own room: one of three warmths, chosen per pane (a hash of
// its place, so the two O's and the two W's are lit differently), a bloom low in the middle
// where the lamp stands, and its top row a tone down under the head of the frame. Round the
// word hangs the warm light of the decor's lantern (decorpaint/downtown.js): stepped,
// dithered rings of deep orange -- here the light the windows throw on the wall.
//
// WHY WINDOWS AND NOT THE PLANKS. Until 2026-09-23 the zone was VILLAGE, lettered in the
// gallery's honey planks, nailed. The user renamed it DOWNTOWN, and the planks spelled the
// new word legibly (5.8:1 against the street, 600 px wide), but in an arrival frame they
// were a wooden sign over a frontier town's gate. The one thing the street behind is made
// of is lit windows in a dark wall (bgpaint/downtown.js), and the same street's windows
// lit in the shape of the name read as downtown after dark at once. The planks are in the
// history (359c9ac) if the user wants them back.
//
// AGAINST THE STREET. The facade is a deep blue-violet (median luminance 0.019 behind the
// title in a real arrival frame) with pale lavender windows; these are the lantern's
// oranges and golds, near-complementary to it, and the glass measures 9.8:1 against the
// backdrop's median (the planks 5.8:1). A lit pane beside a lavender one can never be
// taken for the backdrop's own: the hue says which is which.
//
// THE FONT'S LETTERS, NOT STROKES. The N and the W come out as the 5x7 font draws them
// (BASEMENT's N is the same), which is what the HUD spells every word in, so the player has
// read them a thousand times; laid in squares they stay the font, where strokes would have
// needed their diagonals redrawn (util.js STROKES).
//
// THE ENTRANCE: each letter's lights come on -- dark glass with the night in it, a flicker
// lit low, dark again, low again as the lamp catches, then lit -- one letter after another
// along the word.

import { layoutWord, cellMap, Plan, dropShadowSteps, haloSteps, distOutSteps, hash2, overdue } from './util.js';

// Lit glass, darkest first: a lamp barely lit, the lamp's orange, the warm body, the bloom.
const GLASS = ['#5a2410', '#8e3a14', '#c45a1c', '#e8822a', '#f9a33a', '#ffc255', '#ffdb80', '#fff0b8'];
// Unlit glass, with the night in it: the street's dark windows.
const NIGHT = ['#100e1c', '#1a1729', '#262238', '#37314d', '#4c4566'];
// The frames and bars: the gallery's timber in its shadow tones (the lantern post's in
// decorpaint/downtown.js), so a frame is dark against lit glass, as a window's is at night.
const FRAME = ['#170e14', '#231612', '#331c12', '#5a3218', '#7a4c26', '#94602e'];
const M_FRAME = 1, M_GLASS = 2;
const INK = '#170e14';
const SHADOW = '#0a0610';
// The lantern's halo (decorpaint/downtown.js), bright frame: rings of deep orange. Lit low,
// a tighter, dimmer pair; dark, none.
const GLOW = [['#ffb040', 0.42, 3], ['#ff9028', 0.24, 5], ['#f47a1c', 0.12, 7]];
const GLOW_LOW = [['#f47a1c', 0.22, 2], ['#c85a14', 0.1, 4]];

export const METRICS = { K: 11, R: 5.5, gap: 12, pad: [22, 22, 22, 22], reach: 4 };

const LIT = 2, LOW = 1, DARK = 0;

/** The windows in one state of their lights: a plan of frame and glass. */
function* windows(plan, state) {
  const { w, h } = plan;
  const { cell, list } = cellMap(plan);
  const P = new Plan(w, h);
  const out = (x, y) => x < 0 || y < 0 || x >= w || y >= h || cell[y * w + x] < 0;
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cell[i] < 0) continue;
      const q = list[cell[i]];
      const u = x - q.x0, v = y - q.y0;
      // Touching the outside, the eight ways round: the frame. Lit where it faces up or
      // left, in shadow where it faces down or right. Asking all eight neighbours puts the
      // frame round an inside corner too, where two strokes meet round an empty square.
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (out(x + dx, y + dy)) { edge = true; break; }
      if (edge) {
        P.put(x, y, M_FRAME, out(x, y - 1) || out(x - 1, y) ? 5 : 2);
      } else if (u === 0 || v === 0) {
        // A glazing bar where this square meets the one left of it or above it: one pixel,
        // so a run of five squares is five panes, 10 px each, and not a grid of boxes.
        P.put(x, y, M_FRAME, 1);
      } else {
        const room = hash2(q.c + q.li * 7, q.r, 5);
        let t;
        if (state === LIT) {
          t = room < 0.18 ? 4 : room > 0.7 ? 6 : 5;
          const bx = u - 5.5, by = v - 6.5;
          if (bx * bx + by * by < 5.5) t++;                // the lamp's bloom
          if (v === 1) t--;                                // under the head of the frame
        } else if (state === LOW) {
          t = room < 0.5 ? 1 : 2;
          if (v === 1) t--;
        } else {
          t = v === 1 ? 0 : 1;
          if (u + v === 5 || u + v === 6) t = 3;           // the night's sheen across it
        }
        P.put(x, y, M_GLASS, t);
      }
    }
  }
  return P;
}

function* finish(P, state) {
  const p = yield* P.toPixSteps({ [M_FRAME]: FRAME, [M_GLASS]: state === DARK ? NIGHT : GLASS },
    { [M_FRAME]: INK, [M_GLASS]: INK });
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.55]]);
  yield* haloSteps(p, SHADOW, 1, 0.5);
  // The lamplight, ring by ring, each only on what is still empty, the ring's edge dithered
  // so the steps interleave on a checker instead of ruling a square.
  for (const [col, a, r] of state === LIT ? GLOW : state === LOW ? GLOW_LOW : []) yield* ring(p, col, r, a);
  return p;
}

/** One ring of lamplight: empty pixels within r (round, dithered by parity) get col at a. */
function* ring(p, col, r, a) {
  const d = yield* distOutSteps(p, 1.414, 1);
  const { w, h, data } = p;
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (data[i * 4 + 3]) continue;
      const rr = r - (((x + y) & 1) ? 1 : 0);
      if (d[i] <= rr + 0.5) p.set(x, y, col, a);
    }
  }
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  // A generator per frame: the windows in one step, the outline, shadow and light the next.
  const frame = (state) => function* lights() { const P = yield* windows(plan, state); yield; return yield* finish(P, state); };
  return {
    plan,
    frames: [frame(LIT), frame(DARK), frame(LOW)],
    // Dark, a flicker lit low, dark again, low again, and then the finished frame 0 (lit)
    // once the sequence has run: [frame, seconds, dy].
    seq: [[1, 0.06, 0], [2, 0.04, 0], [1, 0.03, 0], [2, 0.05, 0]],
    stagger: 0.06,
  };
}
