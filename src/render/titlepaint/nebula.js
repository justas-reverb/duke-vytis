// NEBULA: letters of crystal -- every straight stroke a faceted prism.
//
// The zone's crystals (decorpaint/nebula.js) in the shape of the letter. Each straight run of
// a stroke is a prism seen from the side: three long faces split along its length -- the lit
// face toward the upper left, the face toward us, the shaded face -- with a pale lit edge
// where the lit face turns into the front one, as the decor's shards have. The ramp runs
// down each face from tip to foot, cyan catching the light at the top of the lit face,
// violet through the body, magenta at the foot: the decor's whole palette in one letter.
// Long pale reflections cross the faces at 45 degrees, the light caught inside the stone.
// The faces' steps are staggered a few rows from one face to the next, or the bands would
// read as stripes straight across (the pixel-art-in-code rule for crystals). Where two
// prisms meet at a corner the nearer one's facets win, and a stroke's end is cut off in a
// chamfer, a facet of its own, so the corners come out angular and every run reads as a
// length of crystal. With the round ends every other title has, it read as glossy tubing. A
// glint sits on the lit corner of a few letters.
//
// AGAINST THE NEBULA. The sky is deep purple cloud (#1c0a30 to #3f1a5e, luminance ~0.01-
// 0.05). Violet on violet would sink, so the value is carried by the lit face's cyans and the
// pale edge line (luminance 0.4-0.9), and a near-black violet outline and shadow hold the
// front faces off the clouds.
//
// THE ENTRANCE: each letter grows as a crystal does -- a thin seed along the stroke, a flash
// of the whole prism, then the crystal -- and a glint runs across the word.

import { layoutWord, straightRuns, Plan, dropShadowSteps, haloSteps, hash2, overdue, drain } from './util.js';

// The decor's prism faces (decorpaint/nebula.js VIOLET), each tip to foot, joined in one ramp
// per face; the lit edge and the outline.
const LIT = ['#a6f4ff', '#5cbcff', '#7272ec', '#9656de'];
const FRONT = ['#7262e8', '#7c48d6', '#9a3ac8', '#c23ec8'];
const SHADE = ['#40289a', '#582698', '#7626a4', '#9c2eb2'];
const EDGE_HI = '#e2fbff';
const OUT = '#12071f';
const SHADOW = '#080210';
// One ramp for the plan: 0..3 SHADE, 4..7 FRONT, 8..11 LIT, 12 the lit edge, 13 white.
const RAMP = [...SHADE, ...FRONT, ...LIT, EDGE_HI, '#ffffff'];
const M_CRY = 1;

export const METRICS = { K: 11, R: 7, gap: 12, pad: [16, 16, 18, 16], reach: 12 };

/** 0 tip .. 3 foot, from the height in the letter, stepped `lag` rows later per face. */
function band(y, plan, lag) {
  const u = (y + 0.5 - plan.top - lag) / plan.inkH;
  return u < 0.2 ? 0 : u < 0.5 ? 1 : u < 0.78 ? 2 : 3;
}

function* prisms(plan, grow = 1) {
  const P = new Plan(plan.w, plan.h);
  const { w, h } = plan;
  const R = plan.R * grow;
  const face = new Int8Array(w * h);     // which face: 1 lit, 2 front, 3 shade, 4 end
  for (const L of plan.letters) {
    const runs = straightRuns(L).map((r) => {
      const len = Math.hypot(r.bx - r.ax, r.by - r.ay), ux = (r.bx - r.ax) / len, uy = (r.by - r.ay) / len;
      // +1 if the run's right-hand normal (y down) faces the light, so s > 0 is its lit flank.
      const lit = (-uy * -0.6 + ux * -0.8) >= 0 ? 1 : -1;
      return { ...r, len, ux, uy, lit };
    });
    const x0 = Math.max(0, Math.floor(L.x0 - 2)), x1 = Math.min(w, Math.ceil(L.x1 + 2));
    for (let y = Math.max(0, plan.top - 2); y < Math.min(h, plan.bottom + 2); y++) {
      if (overdue()) yield;
      for (let x = x0; x < x1; x++) {
        let best = null, bs = 9, bAlong = 0;
        for (const r of runs) {
          const px = x + 0.5 - r.ax, py = y + 0.5 - r.ay;
          const along = px * r.ux + py * r.uy, s = (-px * r.uy + py * r.ux) * r.lit;
          if (Math.abs(s) > R) continue;
          // Past either end, cut off in a chamfer: the prism's end is a facet, and corners
          // come out angular. (Capsule ends made glossy tubes, not crystal.)
          const beyond = along < 0 ? -along : along > r.len ? along - r.len : 0;
          if (beyond + Math.abs(s) * 0.55 > R * 0.95) continue;
          const c = Math.abs(s) / R + (beyond ? 0.5 : 0);
          if (c < bs) { bs = c; best = r; bAlong = along; best.s = s; best.beyond = beyond; }
        }
        if (!best) continue;
        const s = best.s / R;
        let f;
        if (best.beyond) {
          // The end facet: lit if the end faces up or left, shaded if it faces away.
          const out = bAlong < 0 ? -1 : 1;
          f = (best.ux * out * -0.6 + best.uy * out * -0.8) > 0.2 ? 5 : 4;
        } else f = s > 0.42 ? 1 : s > -0.38 ? 2 : 3;
        face[y * w + x] = f;
        let t;
        if (f === 1 || f === 5) t = 8 + band(y, plan, -3);
        else if (f === 2) t = 4 + band(y, plan, 3);
        else t = 0 + band(y, plan, 7);
        P.put(x, y, M_CRY, t);
      }
    }
  }
  // The lit edge: a front or end pixel with the lit face just above it or to its left.
  for (let y = 1; y < h; y++) {
    if (overdue()) yield;
    for (let x = 1; x < w; x++) {
      const i = y * w + x;
      if (!P.mat[i] || face[i] === 1 || face[i] === 5) continue;
      const lu = face[i - w] === 1 || face[i - w] === 5, ll = face[i - 1] === 1 || face[i - 1] === 5;
      if (lu || ll) P.tone[i] = 12;
    }
  }
  // Inside the crystal, a few long reflections: pale lines at 45 degrees across the front
  // and lit faces, broken where they cross the shade -- the light caught inside the stone.
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (face[i] !== 2 && face[i] !== 1) continue;
      const diag = (x + y) % 23;
      if (diag === 0 && hash2((x + y) / 23 | 0, 1, 61) < 0.6) P.tone[i] = Math.min(13, P.tone[i] + 3);
    }
  }
  return P;
}

// A four-point glint, by hand: 2 white, 1 the pale edge colour.
const GLINT = ['...1...', '...1...', '..121..', '1122211', '..121..', '...1...', '...1...'];

function glints(p, plan) {
  plan.letters.forEach((L, li) => {
    if (hash2(li, plan.letters.length, 51) > 0.5) return;
    let best = null;
    for (const nd of L.nodes) if (!best || nd.x + nd.y < best.x + best.y) best = nd;
    const x0 = Math.round(best.x - 0.5 - plan.R / 2) - 3, y0 = Math.round(best.y - 0.5 - plan.R / 2) - 3;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      const c = GLINT[j][i];
      if (c === '2') p.set(x0 + i, y0 + j, '#ffffff');
      else if (c === '1') p.set(x0 + i, y0 + j, EDGE_HI);
    }
  });
}

function* finish(P, plan, lift = 0, sparkle = true) {
  if (lift) for (let i = 0; i < P.tone.length; i++) if (P.mat[i]) P.tone[i] = Math.min(13, P.tone[i] + lift);
  const p = yield* P.toPixSteps({ [M_CRY]: RAMP }, { [M_CRY]: OUT });
  if (sparkle) glints(p, plan);
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.5]]);
  yield* haloSteps(p, SHADOW, 1, 0.5);
  return p;
}

/** Only the crystal, every face lifted to its lit edge's pale: the glint's band. A generator,
 *  yielding between rows once its slice is spent (zonetitles.js paints it under a budget). */
function* sheen(plan) {
  const P = yield* prisms(plan);
  for (let i = 0; i < P.tone.length; i++) {
    if ((i & 16383) === 0 && overdue()) yield;
    if (P.mat[i]) P.tone[i] = Math.min(13, P.tone[i] + 5);
  }
  return yield* P.toPixSteps({ [M_CRY]: RAMP });
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    frames: [
      function* cut() { const P = yield* prisms(plan); yield; return yield* finish(P, plan); },
      // The entrance frames are generators too, and every step inside them sliced: they were
      // drained in one piece, and zonetitles.js paints them under a budget now.
      function* () { return yield* finish(yield* prisms(plan, 0.45), plan, 4, false); },
      function* () { return yield* finish(yield* prisms(plan), plan, 6, false); },
      () => sheen(plan),
    ],
    seq: [[1, 0.05], [2, 0.04]],
    stagger: 0.045,
    sweep: { frame: 3, from: 0.55, dur: 0.4, band: 8 },
  };
}
