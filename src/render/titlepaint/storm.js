// STORM: white fluffy cloud letters, with lightning crackling out of their undersides.
//
// Each letter is a bank of cloud in the shape of the letter, made as the zone's cloud ledge
// is (tools/platpaint/storm.mjs, CLOUD) and in its creams: round puffs along the strokes,
// with smaller bumps along the upper side of every stroke -- the cauliflower edge the
// backdrop's cumulus has -- each puff lit from the upper left on its own, and the whole
// letter a little darker toward its foot. Upper puffs are laid first and lower ones over
// them; only a lower puff creases the one behind it, a tone darker just outside its upper
// edge, which is what makes a clump read as puffs (creases between every puff made the
// ledge's first bank a pile of cobbles). Where two tones meet they meet on a checker, so a
// puff is shaded rather than ringed. The crowns catch the ledge's palest cream, and every
// underside the storm's two colours: the warm under-light one pixel up, the sky's lavender
// on the very edge.
//
// AGAINST THE STORM. The sky is purple-grey cumulus (about #413052 to #74688e) and the
// ledges are the only cream on screen, so cream letters stand out by value -- four to five
// times the sky's luminance -- and still belong to the zone. A deep violet outline and
// shadow hold them off the paler clouds behind.
//
// THE LIGHTNING. From the undersides of a few letters, bolts in the decor rod's idiom
// (decorpaint/storm.js): legs each turning hard against the last, a white core in two steps
// of violet glow -- strong against the core, faint outside it -- and a fork leaving from the
// middle, and where each leaves the cloud the cloud's underside flashes violet-white. The
// core is two pixels wide where the rod's is one, and the legs swing wider (see bolts()):
// at the title's size the rod's proportions made a hairline squiggle. They are separate
// frames, flashed over the word a few times while it is up.
//
// THE ENTRANCE: each letter puffs in -- a wisp of small puffs, then half-grown ones, then
// the bank -- one letter after another, and the first bolt cracks as the last one fills.

import { layoutWord, strokePoints, Plan, Pix, dropShadowSteps, haloSteps, hash2, rng, overdue, drain } from './util.js';

// The ledge's creams (tools/platpaint/storm.mjs CLOUD), darkest first, with its two underside
// colours below them: 0 the lavender rim, 1 the warm under-light, 2..5 sh, md, lt, hi, 6 top.
const CLOUD = ['#8c70a0', '#ddb172', '#cdc1b5', '#d5c9c0', '#e2dad4', '#f1e7dd', '#fcf9ef'];
const M_CLOUD = 1;
const INK = '#2a1f3d';
const SHADOW = '#140c22';
// The decor rod's lightning (decorpaint/storm.js BOLT).
const BOLT = { core: '#ffffff', dim: '#f3e8ff', fade: '#c99cff', glow: '#b061ff', haze: '#7d2fe0' };

export const METRICS = { K: 11, R: 7, gap: 12, pad: [16, 16, 18, 44], reach: 14 };

const CUTS = [0.5, 0.2, -0.15];
const DITHER = 0.06;

/** Every puff of the bank, back to front: the big ones along the stroke, then the bumps. */
function* puffs(plan, r) {
  const list = [];
  for (const q of strokePoints(plan, 6, 0.8, r)) {
    list.push({ x: q.x, y: q.y, R: plan.R + 0.2 - r.float(0, 1.4), lit: 0 });
  }
  if (overdue()) yield;
  // The bumps: puffs riding the outside of each stroke, big on the sides that face up and
  // none on the sides that face down, so each letter has a cumulus's cauliflower top and
  // flat base. The first bank had small bumps an inch proud of the stroke on top only, and
  // read as a row of marshmallow tubes. A bump that would reach into a counter -- toward
  // another stroke of the same letter -- is left out, or the O and the R close up.
  for (const L of plan.letters) {
    for (const s of L.segs) {
      if (overdue()) yield;
      const vx = s.bx - s.ax, vy = s.by - s.ay, len = Math.hypot(vx, vy);
      for (const side of [-1, 1]) {
        const nx = (-vy / len) * side, ny = (vx / len) * side;
        const up = nx * -0.45 + ny * -0.9;
        if (up < -0.5) continue;
        const n = Math.max(1, Math.round(len / 7));
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5 + r.float(-0.2, 0.2)) / n;
          const rb = up > 0.35 ? r.float(4, 5.2) : r.float(3, 4);
          const out = up > 0.35 ? r.float(2, 3) : r.float(0.8, 1.6);
          const bx = s.ax + vx * u + nx * (plan.R - rb + out), by = s.ay + vy * u + ny * (plan.R - rb + out);
          const tipx = bx + nx * rb, tipy = by + ny * rb;
          const near = L.segs.some((o) => {
            if (o === s || o.a === s.a || o.a === s.b || o.b === s.a || o.b === s.b) return false;
            const ox = o.bx - o.ax, oy = o.by - o.ay;
            let q = ((tipx - o.ax) * ox + (tipy - o.ay) * oy) / (ox * ox + oy * oy);
            q = q < 0 ? 0 : q > 1 ? 1 : q;
            return Math.hypot(tipx - o.ax - ox * q, tipy - o.ay - oy * q) < plan.R + 3;
          });
          if (near) continue;
          list.push({ x: bx, y: by, R: rb, lit: up > 0.35 ? 0.1 : 0 , bump: true });
        }
      }
    }
  }
  // Upper first, so each lower (nearer) puff's lit top shows against the one behind it.
  list.sort((a, b) => a.y - b.y);
  return list;
}

function* bank(plan, list, scale, crowns = true) {
  const P = new Plan(plan.w, plan.h);
  const used = [];
  for (const q of list) {
    if (overdue()) yield;
    if (!crowns && q.bump) continue;
    const R = q.R * scale;
    if (R < 1.2) continue;
    used.push(q);
    const x0 = Math.floor(q.x - R - 2), x1 = Math.ceil(q.x + R + 2);
    const y0 = Math.floor(q.y - R - 2), y1 = Math.ceil(q.y + R + 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!P.in(x, y)) continue;
        const px = x + 0.5, py = y + 0.5, d = Math.hypot(px - q.x, py - q.y);
        const i = y * P.w + x;
        if (d <= R) {
          const l = -((px - q.x) * 0.5 + (py - q.y) * 0.86) / R;
          let v = l * 0.7 - 0.8 * (py - plan.top) / plan.inkH + 0.55 + q.lit;
          const k = CUTS.find((c) => Math.abs(v - c) < DITHER);
          if (k !== undefined) v = ((x + y) & 1) ? k + DITHER : k - DITHER;
          let t = CUTS.findIndex((c) => v > c);
          if (t < 0) t = 3;
          P.mat[i] = M_CLOUD;
          P.tone[i] = 5 - t;
        } else if (d <= R + 1.2 && py - q.y < -R * 0.3 && P.mat[i] && !q.bump) {
          // The crease: just outside this nearer puff's upper edge, a step darker.
          P.tone[i] = Math.max(2, P.tone[i] - 1);
        }
      }
    }
  }
  yield* P.despeckleSteps(1);
  // Crowns in the palest cream; every underside warm, then lavender on its very edge.
  const { w, h } = P;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 && overdue()) yield;
    const i = y * w + x;
    if (!P.mat[i]) continue;
    if (!P.m(x, y + 1)) P.tone[i] = 0;
    else if (!P.m(x, y + 2)) P.tone[i] = 1;
    else if (!P.m(x, y - 1) && P.tone[i] >= 4) P.tone[i] = 6;
  }
  return P;
}

function* finish(P) {
  const p = yield* P.toPixSteps({ [M_CLOUD]: CLOUD }, { [M_CLOUD]: INK });
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.8], [2, 2, 0.65], [3, 3, 0.5]]);
  yield* haloSteps(p, SHADOW, 2, 0.45);
  return p;
}

/**
 * One flash of lightning: a bolt down out of the underside of each letter in `which`, in
 * its own Pix the size of the word, laid over the finished title while it flashes. Where it
 * leaves the cloud, the cloud's underside lights up violet-white across a few puffs -- the
 * flash seen from inside the bank -- and the bolt itself covers only what is not cloud.
 *
 * The first bolts were short legs of one to three pixels across, and at 1x each was a small
 * vertical squiggle under a letter: a worm, not a strike. Wider legs swinging evenly left and
 * right were a taller squiggle. What reads as a strike is a SLANT: long legs of three to six
 * pixels one way and short snaps of one to three back, ten of them, 35 px -- and a start at
 * the cloud's own edge rather than under its shadow, which left them hanging a few pixels
 * below it.
 */
function bolts(plan, main, which, seed) {
  const r = rng('STORM-BOLT', seed);
  const out = new Pix(plan.w, plan.h);
  const solid = (x, y) => main.alpha(x, y) === 255;
  const cells = [];
  // A core two pixels wide: at the title's size a one-pixel bolt was a hairline.
  const put = (x, y, dim) => { cells.push([x, y, dim], [x + 1, y, true]); };
  const leg = (x0, y0, dx, dy, dim) => {
    const n = Math.max(Math.abs(dx), dy);
    for (let s = 1; s <= n; s++) put(Math.round(x0 + dx * s / n), Math.round(y0 + dy * s / n), dim);
  };
  const roots = [];
  for (const li of which) {
    const L = plan.letters[li];
    // A root under the letter's lowest stroke, somewhere across its middle.
    const low = L.nodes.filter((n) => n.r === 6);
    const nd = low.length ? low[Math.floor(r.next() * low.length)] : L.nodes[0];
    let x = Math.round(nd.x - 0.5 + r.int(-2, 2));
    let y = Math.round(nd.y - 0.5);
    while (y < plan.h - 1 && solid(x, y + 1)) y++;
    roots.push([x, y]);
    y++;
    // The strike slants one way: long legs that way, short snaps back.
    const drift = r.chance(0.5) ? 1 : -1;
    const legs = r.int(9, 11);
    let fork = null;
    for (let k = 0; k < legs && y < plan.h - 7; k++) {
      const back = k & 1;
      const dx = back ? -drift * r.int(1, 3) : drift * r.int(3, 6), dy = back ? r.int(2, 3) : r.int(3, 5);
      leg(x, y, dx, dy, k >= legs - 2);
      x += dx; y += dy;
      if (k === 3) fork = [x, y, -drift];
    }
    // A fork from the middle, off the other way, three legs.
    if (fork) {
      let [fx, fy] = fork;
      const fd = fork[2];
      for (let k = 0; k < 3 && fy < plan.h - 7; k++) {
        const dx = (k & 1) ? -fd * 2 : fd * r.int(3, 5), dy = r.int(2, 4);
        leg(fx, fy, dx, dy, true);
        fx += dx; fy += dy;
      }
    }
  }
  // The flash in the cloud: its underside across a few puffs either side of each root.
  for (const [rx] of roots) {
    for (let x = rx - 12; x <= rx + 13; x++) {
      for (let y = plan.h - 2; y > plan.top; y--) {
        if (!solid(x, y) || main.alpha(x, y + 1) === 255) continue;
        // The outline pixel under the cloud stays; the two cloud rows above it flash.
        const fall = Math.abs(x - rx) > 8 ? 1 : 0;
        if (solid(x, y - 1)) out.set(x, y - 1, fall ? BOLT.fade : BOLT.dim);
        if (solid(x, y - 2) && !fall) out.set(x, y - 2, BOLT.fade);
        break;
      }
    }
  }
  const free = (x, y) => !solid(x, y);
  // Haze, then glow, then the core, each only off the cloud.
  for (const [x, y] of cells) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 2 || !free(x + dx, y + dy)) continue;
      if (out.alpha(x + dx, y + dy) === 0) out.set(x + dx, y + dy, BOLT.haze, 0.55);
    }
  }
  for (const [x, y] of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (free(x + dx, y + dy)) out.set(x + dx, y + dy, BOLT.glow, 0.95);
    }
  }
  for (const [x, y, dim] of cells) if (free(x, y)) out.set(x, y, dim ? BOLT.dim : BOLT.core);
  return out;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  // The puffs are laid out in the first frame's painting, not here, so the scoreboard can
  // slice them (a millisecond, run cold); the other frames are always painted after it.
  let list = null;
  const bankOf = () => list || (list = drain(puffs(plan, rng('TITLE', word))));
  const n = plan.letters.length;
  // Two sets of bolts, from different letters, so the flashes do not repeat.
  const a = [], b = [];
  for (let i = 0; i < n; i++) (hash2(i, n, 31) < 0.5 ? a : b).push(i);
  const pickA = a.length ? a.slice(0, 2) : [0];
  const pickB = b.length ? b.slice(0, 2) : [n - 1];
  let main = null;
  return {
    plan,
    // One function per frame, in order: the bolts need the finished word to keep off it.
    frames: [
      function* cumulus() {
        if (!list) list = yield* puffs(plan, rng('TITLE', word));
        const P = yield* bank(plan, list, 1);
        yield;
        return (main = yield* finish(P));
      },
      // The entrance frames are generators too, and every step inside them sliced: they were
      // drained in one piece, and zonetitles.js paints them under a budget now.
      function* () { return yield* finish(yield* bank(plan, bankOf(), 0.45, false)); },
      function* () { return yield* finish(yield* bank(plan, bankOf(), 0.75)); },
      () => bolts(plan, main, pickA, 1),
      () => bolts(plan, main, pickB, 2),
    ],
    seq: [[1, 0.05], [2, 0.05]],
    stagger: 0.04,
    // [frame, from, to] in seconds of the banner's age: a double crack as the word lands,
    // one more before it goes.
    over: [[3, 0.34, 0.40], [4, 0.43, 0.49], [3, 1.30, 1.35]],
  };
}
