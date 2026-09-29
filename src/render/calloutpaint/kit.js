// The kit the milestone callouts share: their colours, a bevelled letter body, italic, glow.
//
// A callout is lettered the way a zone title is (titlepaint/util.js): the game's own 5x7
// font as a skeleton, a node K art pixels from the next, strokes grown round the links, a
// material plan of tone per pixel, coloured last. What differs is where the COLOUR comes
// from. A zone title is made of its zone; a callout was made of the COMBO when each word was
// a multiplier step, so its colours are the combo trail's (sparks.js FIXED, the ramps its
// STEPS shed at each multiplier step), and the stars falling out of the Duke and the word
// over his head are one colour language. Each word is banded in the ramps of the step that
// bears its name, top to bottom (STEP_BANDS), the same bands the floaters at that step are
// drawn in (callouts.js), so SWIFT's cyan, RAMPAGE's fire and CRUSADE's tricolour mean the
// same thing in the trail, in the callout and in a BOUNCE. The words fire at the tower's
// heights now (game/milestones.js); they kept their steps' colours.
//
// Everything is in ART pixels, one to one with the backing store, y down.

import { FIXED } from '../sparks.js';
import { GLYPHS } from '../font.js';
import { mix } from '../decorpaint/util.js';
import { layoutWord, Plan, Pix, dropShadow, halo, distOut, hash2, rgba } from '../titlepaint/util.js';

export { layoutWord, Plan, Pix, dropShadow, halo, distOut, hash2, rgba, mix };

/** The near-black every keyline and shadow is pulled toward: the HUD plate's own. */
export const NIGHT = '#05030a';

/** The no-chain text's ramp (deep, body, light, highlight): a cool unlit steel. */
export const STEEL = ['#262838', '#6a6f8a', '#9ea3b8', '#d4d8e4'];

/** A ramp by name: the trail's (sparks.js FIXED), or STEEL. */
export const rampOf = (name) => (name === 'STEEL' ? STEEL : FIXED[name]);

/**
 * A trail ramp (deep, body, light, highlight) opened out to seven tones for a letter that is
 * big enough to shade: 0 an ink a little lighter than night in the ramp's hue (the outline),
 * 1 deep, 2 between deep and body, 3 body, 4 between body and light, 5 light, 6 highlight.
 */
export function ramp7(name) {
  const [deep, body, light, hi] = FIXED[name];
  return [mix(deep, NIGHT, 0.62), deep, mix(deep, body, 0.5), body, mix(body, light, 0.5), light, hi];
}

/**
 * Each step's COLOUR, as the bands of the floaters thrown at that step, top of the letter to
 * its foot, in trail ramp names -- each taken from that step's own ramps in sparks.js STEPS.
 * A callout's painter letters its word with the same colour in the middle band (it may
 * crown or foot it with another of the step's ramps), so the word and the floaters and
 * stars of the step it is named for are one colour (the word no longer fires AT that step:
 * it marks a height of the tower).
 *
 * Chosen for distance, measured: the letters' mean colour at 2 px a font pixel, in CIELAB.
 * The first table followed each step's ramps in order -- gold over amber over amber for a
 * chain, gold over amber over red for RAMPAGE, gold over emerald over red for CRUSADE,
 * white over gold for GLORY -- and the trail's palettes lean so hard on gold that CHAIN and
 * RAMPAGE came out 9 apart (the same orange), CRUSADE and GLORY 13, CHARGE and THUNDER 13.
 * In this table the nearest two steps are 30 apart (tools/test-callouts.mjs, 4). CRUSADE
 * keeps the tricolour of its trail, the flag's own order, because that stripe is its
 * identity; every other step is one colour.
 *
 * With no chain at all the text is plain STEEL, where the trail sheds the zone's own colour.
 * The zone's colour was the first choice, and seven zones' colours are near-whites
 * (DUNGEON's and CITADEL's are white, another a pale peach): a BOUNCE with no chain came
 * within 6 to 15 of GLORY's white and gold, the one step it most needs to be told from.
 * Grey says "no heat yet"; any colour at all says a chain is on, and steel stands 28 from
 * the nearest step. Indexed by the STEPS row.
 */
export const STEP_BANDS = [
  ['STEEL', 'STEEL', 'STEEL'],            // 0 no chain: plain steel, no heat at all
  ['AMBER', 'AMBER', 'AMBER'],            // 1 CHAIN: orange
  ['CYAN', 'CYAN', 'CYAN'],               // 2 SWIFT: cyan
  ['CYAN', 'AZURE', 'AZURE'],             // 3 CHARGE: blue
  ['MAGENTA', 'MAGENTA', 'MAGENTA'],      // 4 SOARING: pink
  ['RED', 'RED', 'RED'],                  // 5 RAMPAGE: red
  ['GOLD', 'EMERALD', 'RED'],             // 6 CRUSADE: the flag
  ['VIOLET', 'VIOLET', 'VIOLET'],         // 7 THUNDER: violet
  ['WHITE', 'WHITE', 'GOLD'],             // 8 GLORY: white over gold
  null,                                   // 9 BEYOND: every colour in turn (callouts.js)
];

/**
 * Which band a point at relative height `ty` (0 the ink's top row, 1 its foot) falls in,
 * split where the 5x7 font splits its rows -- two, three, two -- with a one-pixel checker
 * along each boundary so two colours meet shaded, not ruled.
 */
export function bandAt(ty, x, y) {
  const b0 = 2 / 7, b1 = 5 / 7, dith = 0.012;
  const odd = (x + y) & 1;
  if (ty < b0 - dith) return 0;
  if (ty < b0 + dith) return odd ? 1 : 0;
  if (ty < b1 - dith) return 1;
  if (ty < b1 + dith) return odd ? 2 : 1;
  return 2;
}

/**
 * The letter body: every pixel within R of a stroke, as material (1 + its band) and tone.
 * The outer `bevel` pixels of the stroke are toned by the direction they face -- lit up and
 * to the left, shaded down and to the right -- and the face inside them by `faceTone(ty)`,
 * where ty is the pixel's height in the ink. Tones are ramp7 indices.
 */
export function bevelBody(plan, { bevel = 2, faceTone, edge = [6, 5, 4, 2, 1] }) {
  const P = new Plan(plan.w, plan.h);
  const { w, h, d, qx, qy, R } = plan;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] > R) continue;
      const ty = (y + 0.5 - plan.top) / plan.inkH;
      const band = bandAt(ty, x, y);
      let t;
      if (d[i] > R - bevel) {
        const nx = (x + 0.5 - qx[i]) / (d[i] || 1), ny = (y + 0.5 - qy[i]) / (d[i] || 1);
        const l = nx * -0.6 + ny * -0.8;
        t = l > 0.55 ? edge[0] : l > 0.15 ? edge[1] : l > -0.3 ? edge[2] : l > -0.7 ? edge[3] : edge[4];
      } else {
        t = faceTone(ty, x, y, band);
      }
      P.mat[i] = 1 + band;
      P.tone[i] = t;
    }
  }
  P.despeckle(1);
  return P;
}

/**
 * Italic: every row slid right by (foot - row) * s, in whole pixels, so the letters lean
 * forward on a staircase -- a pixel font's italic, not a resampled one. Returns a new plan.
 */
export function shearPlan(P, s, foot) {
  const Q = new Plan(P.w, P.h);
  for (let y = 0; y < P.h; y++) {
    const dx = Math.round((foot - y) * s);
    for (let x = 0; x < P.w; x++) {
      const i = y * P.w + x;
      if (!P.mat[i]) continue;
      const X = x + dx;
      if (X < 0 || X >= P.w) continue;
      Q.mat[y * P.w + X] = P.mat[i];
      Q.tone[y * P.w + X] = P.tone[i];
    }
  }
  return Q;
}

/** Tones of a plan raised by `lift` (a flash, white-hot), capped at the ramp's top. */
export function lifted(P, lift, top = 6) {
  const Q = new Plan(P.w, P.h);
  Q.mat.set(P.mat);
  for (let i = 0; i < P.tone.length; i++) Q.tone[i] = Math.min(top, P.tone[i] + lift);
  return Q;
}

/** A plan's materials coloured from bands of ramp names, outlined in each band's ink. */
export function colour(P, bands, { ink = null } = {}) {
  const ramps = {}, edges = {};
  bands.forEach((n, k) => {
    const r = ramp7(n);
    ramps[k + 1] = r;
    edges[k + 1] = ink || r[0];
  });
  return P.toPix(ramps, edges);
}

/**
 * What every callout stands on, whatever it is made of: a drop shadow down and to the right
 * and a dark bed round the letters, so the word holds off STORM's cream clouds and ZENITH's
 * pale sky as well as it does off the cellar's dark brick.
 */
export function ground(p, shadow = NIGHT) {
  dropShadow(p, shadow, [[1, 1, 0.9], [2, 2, 0.75], [3, 3, 0.5]]);
  // 0.7, not 0.55: at 0.55 the cream clouds of STORM showed through the bed enough to take
  // CHARGE's blue steel under 4.5:1 against its own edge (tools/test-callouts.mjs, 3).
  halo(p, shadow, 1, 0.7);
}

/**
 * A glow round the word: rings of `cols` on the empty pixels outside everything drawn so
 * far, at the alphas given, each ring `step` px, the distance nudged half a pixel by (x + y)
 * parity so neighbouring rings interleave on a checker instead of stepping on a clean edge.
 * Deep, saturated colours: a pale glow thinned over a coloured sky lands on grey.
 */
export function glow(p, cols, alphas, step = 2) {
  const d = distOut(p, 1.414, 100);
  const cs = cols.map(rgba);
  const { w, h, data } = p;
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3]) continue;
    const x = i % w, y = (i / w) | 0;
    const r = d[i] + (((x + y) & 1) ? 0.5 : -0.5);
    const k = Math.floor((r - 0.5) / step);
    if (k < 0 || k >= alphas.length) continue;
    const c = cs[Math.min(k, cs.length - 1)];
    data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = Math.round(255 * alphas[k]);
  }
}

/**
 * The small lettering: every glyph in `chars` at each size in `sizes` (backing pixels per
 * font pixel), one row of cells per size, banded by the font's own rows in `bands` (three
 * ramps, deep / body / light / highlight, top of the letter to its foot), lit along each top
 * edge and shaded along each foot at art resolution, inside a keyline `key` pixels wide --
 * night outside, and one pixel of the middle band's deep tone pulled toward night inside it.
 *
 * It was the floaters' own painter (callouts.js paintInk) until the title screen needed the
 * same letters in the Duke's colours: the menus' words are lettered from this too
 * (menuskin.js), so a floater, a key hint and a stats row are one alphabet, cut one way. A
 * cell is 5g + 2key wide and 7g + 2key tall; the key-pixel keylines of neighbouring glyphs
 * meet in the font's gap at g = key * 2, so a word sits on one plate.
 */
export function glyphInk(bands, { chars, sizes, key = 2 }) {
  const cellW = (g) => 5 * g + 2 * key;
  const cellH = (g) => 7 * g + 2 * key;
  const rowY = {};
  let top = 0;
  for (const g of sizes) { rowY[g] = top; top += cellH(g); }
  const p = new Pix(chars.length * cellW(sizes[sizes.length - 1]), top);
  // The inner keyline in the middle band's deep tone pulled toward night; the outer, night.
  const inner = mix(bands[1][0], NIGHT, 0.4);
  for (const g of sizes) {
    const cw = cellW(g), y0 = rowY[g];
    [...chars].forEach((ch, ci) => {
      const rows = GLYPHS[ch];
      const ox = ci * cw + key, oy = y0 + key;
      const on = (c, r) => r >= 0 && r < 7 && c >= 0 && c < 5 && rows[r][c] === '#';
      // Keylines first, outer then inner, then the letter over them.
      for (const [rad, col] of [[key, NIGHT], [1, inner]]) {
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
          if (!on(c, r)) continue;
          p.rect(ox + c * g - rad, oy + r * g - rad, g + 2 * rad, g + 2 * rad, col);
        }
      }
      for (let r = 0; r < 7; r++) {
        // Bands by the font's own rows, two, three, two -- each band a ramp.
        const [, body, light, hi] = bands[r < 2 ? 0 : r < 5 ? 1 : 2];
        const face = r < 2 ? mix(light, hi, 0.4) : r < 5 ? light : mix(light, body, 0.3);
        for (let c = 0; c < 5; c++) {
          if (!on(c, r)) continue;
          for (let v = 0; v < g; v++) for (let u = 0; u < g; u++) {
            // Lit along a top edge, shaded along a foot: at art resolution, one pixel each.
            let col = face;
            if (v === 0 && !on(c, r - 1)) col = hi;
            else if (v === g - 1 && !on(c, r + 1)) col = mix(light, body, 0.75);
            p.set(ox + c * g + u, oy + r * g + v, col);
          }
        }
      }
    });
  }
  return p;
}

/** The ink's bounding box in a Pix: [x0, y0, x1, y1] of pixels at least `min` opaque. */
export function inkBox(p, min = 128) {
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (p.data[(y * p.w + x) * 4 + 3] < min) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/**
 * A frame the runtime can place: the Pix, the pixel in it that is the word's anchor, and --
 * given the plan the letters were painted from -- which pixels are LETTER, as opposed to
 * flame, streak, glow or shadow, for the tools that measure how well the word reads.
 */
export function frame(pix, plan, dx = 0, letters = null) {
  const L = plan.letters;
  return { pix, ax: Math.round((L[0].x0 + L[L.length - 1].x1) / 2) + dx, ay: plan.top,
    letters: letters ? letters.mat : null };
}
