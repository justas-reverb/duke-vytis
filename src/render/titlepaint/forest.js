// FOREST: letters grown out of the forest -- a hedge of leaves on a frame of branches.
//
// Each letter is a bush clipped to the letter's shape, leafed the way the zone's own trees
// are (decorpaint/forest.js): the leaves are CELLS of a jittered 3 px grid, kept where
// enough of the cell falls inside the shape and toned by the light at the cell's centre,
// and each cell is a tone paler on its lit side and a tone darker on its far side, so the
// leaves stand apart instead of melting into one flat patch. The shape is the stroke's core
// plus a row of round lobes down each side, so its edge is a run of leafy bumps rather than
// a clean tube. The light falls from the upper left across each stroke -- its upper-left
// flank lit, its lower-right in shade -- and down the letter, top to bottom, and the lit
// pixels that face the air above or to the left take the canopy's pale rim.
//
// A first version laid small round puffs along the strokes, each with a crease two tones
// darker under it. Close up the creases lined up in rows, as the decor's first canopy's
// had, and the letters read as terry towelling -- knitted, not grown.
//
// Out of the top of about half the letters a sprig rises, a stalk with a few leaves, and a
// red berry -- the zone's accent -- sits here and there on the leaves.
//
// AGAINST THE FOREST. The backdrop is a cool dark green (luminance 0.01-0.07), so hue cannot
// carry green letters; value has to. The leaves are the canopy's LIT half -- olive to the
// pale yellow-green rim -- where the backdrop never goes, with the teal shadow tones kept
// to the creases, and each letter has a green-black outline and a deep shadow down and to
// its right.
//
// THE ENTRANCE: each letter arrives as its bare branch frame, puts out a scatter of leaves,
// then fills -- a hedge growing in an eighth of a second, one letter after another.

import { layoutWord, Plan, dropShadowSteps, haloSteps, hash2, rng, overdue, drain } from './util.js';

// The decor's leaf ramp (decorpaint/forest.js LEAF) and its pale rim, with one paler tip.
const LEAF = ['#0f2226', '#1a3b3a', '#2f5c44', '#4a6c2b', '#71903a', '#a2b94d', '#c8da76', '#e4efa2'];
const BARK = ['#190d11', '#2f1a1a', '#4a2c21', '#69442f', '#8f613e'];
// The accent (themes.js FOREST #ff3355), as a berry: a dark side, the body, a glint.
const BERRY = ['#5a0c22', '#b0173d', '#ff3355', '#ffb3c0'];
const M_LEAF = 1, M_BARK = 2, M_BERRY = 3;
const EDGE = { [M_LEAF]: '#0b1a12', [M_BARK]: '#140a0d', [M_BERRY]: '#2a0612' };
const RAMPS = { [M_LEAF]: LEAF, [M_BARK]: BARK, [M_BERRY]: BERRY };
const SHADOW = '#03100a';
const RIM = 6;

export const METRICS = { K: 11, R: 7, gap: 12, pad: [14, 16, 18, 18], reach: 12 };

/** The branch frame: a two-pixel bark line along every stroke, lit on its upper left. */
function branches(P, plan) {
  for (const L of plan.letters) {
    for (const s of L.segs) {
      const n = Math.ceil(Math.hypot(s.bx - s.ax, s.by - s.ay) * 2);
      const steep = Math.abs(s.by - s.ay) > Math.abs(s.bx - s.ax);
      for (let k = 0; k <= n; k++) {
        const x = Math.round(s.ax - 0.5 + (s.bx - s.ax) * k / n), y = Math.round(s.ay - 0.5 + (s.by - s.ay) * k / n);
        P.put(x, y, M_BARK, 3);
        if (steep) P.put(x + 1, y, M_BARK, 2);
        else P.put(x, y + 1, M_BARK, 2);
      }
    }
  }
}

// A sprig: a stalk of bark with leaves on it, drawn as ASCII (the pixel-art-in-code rule for
// anything this small). b bark, B its shaded side; d, l, L leaf shade, body and lit.
const SPRIGS = [
  [
    '......LL...',
    '.....LlLd..',
    '......dd...',
    '.LL...b....',
    'LlLd..b....',
    '.ddbbbb..L.',
    '.....b..LlL',
    '.....bbbldd',
    '.....b.....',
    '.....b.....',
    '.....B.....',
  ],
  [
    '...LL......',
    '..dLlL.....',
    '...dd......',
    '....b...LL.',
    '....b..dLlL',
    '.L..bbbbdd.',
    'LlL..b.....',
    'ddlbbb.....',
    '.....b.....',
    '.....b.....',
    '.....B.....',
  ],
];
const SPRIG_PAL = { b: [M_BARK, 3], B: [M_BARK, 1], d: [M_LEAF, 4], l: [M_LEAF, 5], L: [M_LEAF, RIM] };

/**
 * Sprigs: on about half the letters, a stalk with a few leaves rising out of the top of a
 * top stroke -- the hedge still growing. A first version ran a bare twig on from a stroke's
 * END, and at 1x a twig off the T's arm was an apostrophe and one off the S's tail a full
 * stop: anything leaving a letter sideways reads as punctuation. Straight up out of the top,
 * with its leaves, it reads as growth.
 */
function sprigs(P, plan) {
  plan.letters.forEach((L, li) => {
    if (hash2(li, plan.letters.length, 7) > 0.55) return;
    const tops = L.segs.filter((s) => L.nodes[s.a].r === 0 && L.nodes[s.b].r === 0);
    const cand = tops.length ? tops : L.segs.filter((s) => L.nodes[s.a].r === 0 || L.nodes[s.b].r === 0);
    if (!cand.length) return;
    const s = cand[Math.floor(hash2(li, 3, 8) * cand.length)];
    const u = tops.length ? 0.3 + hash2(li, 4, 8) * 0.4 : 0;
    const x = Math.round(s.ax + (s.bx - s.ax) * u - 0.5), top = Math.round(Math.min(s.ay, s.by) - 0.5 - plan.R);
    const art = SPRIGS[li % SPRIGS.length];
    // The stalk's foot sits four rows down inside the leaves, so it rises out of them.
    const col = art[art.length - 1].indexOf('B');
    for (let j = 0; j < art.length; j++) {
      for (let i = 0; i < art[j].length; i++) {
        const e = SPRIG_PAL[art[j][i]];
        if (!e) continue;
        const X = x - col + i, Y = top - art.length + 4 + j;
        // Only over air or the letter's own top edge: the stalk's foot is hidden by leaves.
        if (P.m(X, Y) === M_LEAF && e[0] === M_BARK) continue;
        P.put(X, Y, e[0], e[1]);
      }
    }
  });
}

/**
 * The leaves. `keep` is the share of leaf cells drawn (1 = the full hedge; less leaves the
 * scatter of the entrance), `trim` shrinks the lobes.
 */
function* foliage(P, plan, r, keep = 1, trim = 0) {
  const { w, h, d, qx, qy, R } = plan;
  // The shape: 2 inside the core or a lobe, 1 a little outside them. A leaf cell is kept if
  // enough of it is 2, then drawn where it is 1 or 2, so the edge is leafy but not spiky.
  const shape = new Uint8Array(w * h);
  const CORE = R - 2.5, GROW = 1.5;
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let i = y * w, e = i + w; i < e; i++) shape[i] = d[i] <= CORE - trim ? 2 : d[i] <= CORE + GROW - trim ? 1 : 0;
  }
  const stamp = (cx, cy, rb) => {
    const R2 = Math.ceil(rb + GROW + 1);
    for (let y = -R2; y <= R2; y++) for (let x = -R2; x <= R2; x++) {
      const X = Math.round(cx - 0.5) + x, Y = Math.round(cy - 0.5) + y;
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const dd = Math.hypot(X + 0.5 - cx, Y + 0.5 - cy), i = Y * w + X;
      if (dd <= rb + 0.25) shape[i] = 2;
      else if (dd <= rb + 0.25 + GROW && !shape[i]) shape[i] = 1;
    }
  };
  for (const L of plan.letters) {
    for (const s of L.segs) {
      if (overdue()) yield;
      const vx = s.bx - s.ax, vy = s.by - s.ay, len = Math.hypot(vx, vy);
      const nx = -vy / len, ny = vx / len;
      const n = Math.max(1, Math.round(len / 6));
      for (let k = 0; k <= n; k++) {
        for (const side of [-1, 1]) {
          // The lobes on a stroke's upper side are the bigger ones, as a crown's are.
          const up = (nx * side) * -0.6 + (ny * side) * -0.8 > 0.2;
          const rb = (up ? r.float(3, 3.8) : r.float(2.4, 3.2)) - trim;
          const off = R - 1.6 - rb + r.float(-0.4, 0.4);
          stamp(s.ax + vx * k / n + nx * side * off, s.ay + vy * k / n + ny * side * off, rb);
        }
      }
    }
    for (const nd of L.nodes) if (nd.deg < 2) stamp(nd.x, nd.y, 4 - trim);
  }

  yield;
  // Leaf cells: a jittered 3 px grid, and for every pixel the nearest centre.
  const S = 3, gw = Math.ceil(w / S) + 1, gh = Math.ceil(h / S) + 1, nc = gw * gh;
  const cx = new Float32Array(nc), cy = new Float32Array(nc), jit = new Float32Array(nc), cut = new Float32Array(nc);
  for (let j = 0, k = 0; j < gh; j++) for (let i = 0; i < gw; i++, k++) {
    cx[k] = i * S + (j % 2) * 1.5 + r.float(-1, 1);
    cy[k] = j * S + r.float(-1, 1);
    jit[k] = r.float(-1, 1);
    cut[k] = r.float(0.3, 0.7);
  }
  const id = new Int32Array(w * h), cov = new Uint16Array(nc), tot = new Uint16Array(nc);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 && overdue()) yield;
    const i = y * w + x;
    if (!shape[i]) { id[i] = -1; continue; }
    const gi = Math.floor(x / S), gj = Math.floor(y / S);
    let best = 1e9, bk = 0;
    for (let jj = Math.max(0, gj - 1); jj <= Math.min(gh - 1, gj + 1); jj++) {
      for (let ii = Math.max(0, gi - 1); ii <= Math.min(gw - 1, gi + 1); ii++) {
        const k = jj * gw + ii, dd = (x - cx[k]) ** 2 + (y - cy[k]) ** 2;
        if (dd < best) { best = dd; bk = k; }
      }
    }
    id[i] = bk;
    tot[bk]++;
    if (shape[i] === 2) cov[bk]++;
  }

  yield;
  // The light at a cell's centre: down the letter from the top, across the stroke from its
  // upper-left flank, and a little across the letter from its left.
  const tone = new Int8Array(nc).fill(-1);
  const toneOf = (k) => {
    const X = Math.max(0, Math.min(w - 1, Math.round(cx[k]))), Y = Math.max(0, Math.min(h - 1, Math.round(cy[k])));
    const i = Y * w + X;
    const L = plan.letters[Math.max(0, plan.own[i])];
    const down = (cy[k] - plan.top) / plan.inkH - 0.5;
    const across = (cx[k] - (L.x0 + L.x1) / 2) / (L.x1 - L.x0);
    const dd = Math.max(0.5, d[i]);
    const flank = ((cx[k] - qx[i]) * -0.6 + (cy[k] - qy[i]) * -0.8) / dd * Math.min(1, dd / (R - 1));
    const v = -0.55 * down - 0.2 * across + 0.3 * flank + jit[k] * 0.2 + 0.24;
    return v > 0.32 ? 5 : v > 0.02 ? 4 : v > -0.3 ? 3 : 2;
  };
  for (let i = 0; i < w * h; i++) {
    if (i % w === 0 && overdue()) yield;
    const k = id[i];
    if (k < 0 || !cov[k] || cov[k] < tot[k] * cut[k]) continue;
    if (keep < 1 && hash2(k, 5, 9) > keep) continue;
    if (tone[k] < 0) tone[k] = toneOf(k);
    P.mat[i] = M_LEAF;
    P.tone[i] = tone[k];
  }
  yield* P.despeckleSteps(1);

  // Each leaf's own light and shade, after the despeckle, which would take them back out.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 && overdue()) yield;
    const i = y * w + x;
    if (P.mat[i] !== M_LEAF || id[i] < 0) continue;
    const k = id[i], t = P.tone[i];
    const s = (x - cx[k]) * 0.6 + (y - cy[k]) * 0.8;
    if (t >= 3 && s > 0.9) P.tone[i] = t - 1;
    else if (t >= 3 && t <= 4 && s < -1.1) P.tone[i] = t + 1;
  }
  // The pale rim: lit leaf facing the air above or to its left.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 && overdue()) yield;
    const i = y * w + x;
    if (P.mat[i] !== M_LEAF || P.tone[i] < 4) continue;
    if (P.m(x, y - 1) !== M_LEAF || P.m(x - 1, y) !== M_LEAF) P.tone[i] = P.tone[i] >= 5 ? 7 : RIM;
  }
}

/** Berries: two on each letter's upper two thirds, a pixel cluster with a glint. */
function berries(P, plan) {
  plan.letters.forEach((L, li) => {
    const segs = L.segs.filter((s) => (s.ay + s.by) / 2 < plan.top + plan.inkH * 0.7);
    for (let k = 0; k < 2 && segs.length; k++) {
      const s = segs[Math.floor(hash2(li, k, 21) * segs.length)];
      const u = 0.25 + hash2(li, k, 22) * 0.5;
      const side = hash2(li, k, 23) < 0.5 ? -1 : 1;
      const vx = s.bx - s.ax, vy = s.by - s.ay, len = Math.hypot(vx, vy) || 1;
      const x = Math.round(s.ax + vx * u - (vy / len) * side * 2 - 0.5);
      const y = Math.round(s.ay + vy * u + (vx / len) * side * 2 - 0.5);
      P.put(x, y, M_BERRY, 2); P.put(x + 1, y, M_BERRY, 1);
      P.put(x, y + 1, M_BERRY, 1); P.put(x + 1, y + 1, M_BERRY, 0);
      P.put(x - 1, y, M_BERRY, 3);
    }
  });
}

function* finish(P) {
  const p = yield* P.toPixSteps(RAMPS, EDGE);
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.75], [3, 3, 0.6], [4, 4, 0.45]]);
  yield* haloSteps(p, SHADOW, 2, 0.62);
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    // One function per frame, so the runtime can paint them a frame apart (see zonetitles.js);
    // the leafy ones are generators, a pass a step.
    frames: [
      function* leafy() {
        const full = new Plan(plan.w, plan.h);
        branches(full, plan);
        if (overdue()) yield;
        yield* foliage(full, plan, rng('TITLE', word));
        sprigs(full, plan);
        if (overdue()) yield;
        berries(full, plan);
        yield;
        return yield* finish(full);
      },
      // The entrance frames are generators too, and every step inside them sliced: they were
      // drained in one piece, and zonetitles.js paints them under a budget now.
      function* () {
        const bare = new Plan(plan.w, plan.h);
        branches(bare, plan);
        if (overdue()) yield;
        return yield* finish(bare);
      },
      function* sprouting() {
        const sprout = new Plan(plan.w, plan.h);
        branches(sprout, plan);
        yield* foliage(sprout, plan, rng('TITLE', word), 0.4, 0.8);
        yield;
        return yield* finish(sprout);
      },
    ],
    seq: [[1, 0.06], [2, 0.07]],
    stagger: 0.045,
  };
}
