// The death, measured: the fall, the burst, the landing and the blood.
//
//   node tools/test-death.mjs
//
// Every one of these was wrong on screen while nothing failed, because nothing looked.
// The plunge drew him already in pieces; the pieces burst from one clump, came to rest
// on top of each other, hung in the air or sank into the floor by half their length
// depending on which way up they landed, and snapped a quarter turn as they stopped; and
// a fall from floor 900 bled exactly as much as one from floor 220. tools/shot-death.mjs
// shows each of those. This keeps them fixed.
//
// It runs the REAL death -- Game.die() and the fixed-step simulation -- across seeds,
// death floors and both extremes of the arena, and asserts on what it produces. Nothing
// here calls the planner directly.

import { installDom } from './headless.mjs';

installDom();

const S = await import('../src/render/sprites.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const C = await import('../src/game/constants.js');
const { bloodStains } = await import('../src/render/renderer.js');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

// --- 1. he falls in ONE piece --------------------------------------------------
//
// The plunge drawing has his crown, shield and sword already flying off him. The pose
// the fall actually draws must be him held together: its largest 8-connected piece is
// at least 97% of its ink, in both facings.
function largestShare(grid) {
  const H = grid.length, W = grid[0].length;
  const seen = new Uint8Array(W * H);
  let total = 0, best = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!grid[y][x] || seen[y * W + x]) continue;
      let n = 0;
      const stack = [x, y];
      seen[y * W + x] = 1;
      while (stack.length) {
        const cy = stack.pop(), cx = stack.pop();
        n++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (!grid[ny][nx] || seen[ny * W + nx]) continue;
            seen[ny * W + nx] = 1;
            stack.push(nx, ny);
          }
        }
      }
      total += n;
      if (n > best) best = n;
    }
  }
  return { share: total ? best / total : 0, total };
}
{
  const r = largestShare(S.FRAMES[S.FALL_POSE]);
  const l = largestShare(S.FRAMES_LEFT[S.FALL_POSE]);
  const raw = largestShare(S.FRAMES.backfall);
  if (r.share < 0.97 || l.share < 0.97) {
    fail(`${S.FALL_POSE} is not one piece: largest is ${(r.share * 100).toFixed(1)}% / ` +
      `${(l.share * 100).toFixed(1)}% of its ink`);
  } else {
    ok(`the fall is drawn in one piece: ${(r.share * 100).toFixed(1)}% of ${r.total} px ` +
      `connected (the raw plunge drawing: ${(raw.share * 100).toFixed(1)}%)`);
  }
}

// Every piece he comes apart into has a role and a place on the body.
{
  const roles = S.SPLAT_BITS.map((b) => b.role);
  const need = ['head', 'torso', 'arm', 'leg', 'shield', 'sword', 'crown'];
  const missing = need.filter((r) => !roles.includes(r));
  if (missing.length) fail(`no piece found for: ${missing.join(', ')} (have ${roles.join(' ')})`);
  else ok(`${S.SPLAT_BITS.length} pieces: ${roles.join(' ')}`);
  const lost = S.SPLAT_BITS.filter((b) => !b.anchor || !Number.isFinite(b.anchor.ax));
  if (lost.length) fail(`${lost.length} piece(s) with no anchor on the body`);
  // Chunk colours by ROLE: five distinct inks, none the magenta of an unmapped key.
  const inks = new Set(S.SPLAT_INKS);
  if (inks.size < 5 || S.SPLAT_INKS.some((c) => !/^#[0-9a-f]{6}$/i.test(c))) {
    fail(`debris inks are not five distinct colours: ${S.SPLAT_INKS.join(' ')}`);
  }
}

// --- one body ------------------------------------------------------------------------
//
// The parts drawing has four arms -- three near-copies of one, and the arm cut off the torso --
// and the burst threw all four, with a spare steel shoulder: the user saw four arms fly out at
// a death (2026-09-29). He comes apart into ONE body: a head, a torso, two arms, two
// legs, his shield, sword and crown, and no plate. The counts are literals, the spec whatever
// the drawing holds. The two arms are a left and a right: of every pair of arms the drawing
// has, the one most nearly each other's mirror image (measured here with a copy of the rule's
// own: silhouettes laid on their centroids, one flipped). Which side each bursts from is held
// below, with the bursts (as many arms either side of him).
// Mutations: every piece thrown (four arms and the plate) fails the counts; the pair chosen
// by how alike they are UNflipped (two copies of one arm) fails the mirror check.
{
  const count = (role) => S.SPLAT_BITS.filter((b) => b.role === role).length;
  const want = { head: 1, torso: 1, arm: 2, leg: 2, shield: 1, sword: 1, crown: 1, plate: 0 };
  const off = Object.entries(want).filter(([r, n]) => count(r) !== n).map(([r, n]) => `${count(r)} ${r} (one body has ${n})`);
  if (off.length) fail(`he comes apart into more or less than one body: ${off.join(', ')}`);
  const share = (a, b) => {
    const cells = (p, flip) => {
      const cx = p.cells.reduce((s, c) => s + c[0], 0) / p.cells.length, cy = p.cells.reduce((s, c) => s + c[1], 0) / p.cells.length;
      return new Set(p.cells.map(([x, y]) => `${Math.round(flip ? cx - x : x - cx)},${Math.round(y - cy)}`));
    };
    const A = cells(a, false), B = cells(b, true);
    let n = 0;
    for (const k of A) if (B.has(k)) n++;
    return n / (A.size + B.size - n);
  };
  const all = S.PARTS_BITS.filter((b) => b.role === 'arm');
  const pairs = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) pairs.push({ a: all[i], b: all[j], s: share(all[i], all[j]) });
  pairs.sort((p, q) => q.s - p.s);
  const kept = S.SPLAT_BITS.filter((b) => b.role === 'arm');
  const best = pairs[0];
  const isBest = best && kept.length === 2 && kept.includes(best.a) && kept.includes(best.b);
  if (all.length > 2 && !isBest) {
    fail(`the two arms thrown are not the drawing's best mirrored pair: kept ${kept.map((b) => b.n + ' px').join(' + ')} ` +
      `(${kept.length === 2 ? share(kept[0], kept[1]).toFixed(2) : '-'}), best ${best.a.n} + ${best.b.n} px (${best.s.toFixed(2)})`);
  } else if (!off.length) {
    ok(`one body: ${S.SPLAT_BITS.length} pieces of the drawing's ${S.PARTS_BITS.length}, two arms of its ${all.length} -- ` +
      `the pair most nearly mirror images (${best ? best.s.toFixed(2) : '-'}; the next ${pairs[1] ? pairs[1].s.toFixed(2) : '-'}), no plate`);
  }
}

// --- every piece is ONE part -------------------------------------------------------
//
// This import's parts bin drew three arms loose and the fourth still hanging off the
// torso's shoulder, and the torso flew with it: a tabard with an arm dangling off it,
// while the other three arms flew free. Every check above passed, because a piece is
// "a connected piece of the drawing" and that one was. These measure what was seen on
// screen, not how sprites.js cuts it:
//
//  - nothing on the torso lies further from its tabard (its biggest 4-connected patch of
//    blue) than TORSO_REACH of the shortest arm's length. The arm that hung off it reached
//    0.57, with its hand. Its own right pauldron reaches 0.25, and this let that stay on at
//    first (0.4) as the torso's own armour -- until the user, of the build with the arm cut
//    free, still saw an arm that did not come off properly: in the settled pieces the tabard
//    wore a steel shoulder. It is cut off as a plate now, the tabard's own trim and belt
//    reach 0.18, and 0.22 fails the shoulder left on (PLATE_MIN set past reach: 0.25);
//  - no arm or leg is two: none has more than LIMB_TWICE the ink of the smallest of its
//    kind (they are within 5% of each other; a limb carrying another is about double);
//  - where a cut opened two pieces of one drawing, each has an outline there, as the
//    art's own pieces have all round: the only place they meet is a line of pixels BOTH
//    hold, and every pixel of it is outline ink in both. Pieces the artist drew apart
//    never meet at all.
//
// Mutations, each seen to fail here: the tree before the cut, and cutLimbs skipped (36.9
// px, 0.57 of an arm); the cut line given to the torso alone (41 px of the two meet with
// no line between them); the line painted in lit steel (41 lit px on it); a cut at the
// elbow instead of the armhole (the torso keeps the upper arm, 0.63, and the arms are no
// longer alike: 865 px against 1503-1545).
{
  const TORSO_REACH = 0.22, LIMB_TWICE = 1.5;
  const hsv = (c) => {
    const n = parseInt(c.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    return { h, s: mx ? d / mx : 0, v: mx };
  };
  const isBlue = (c) => { const t = hsv(c); return t.s > 0.3 && t.h >= 200 && t.h <= 250 && t.v >= 50; };
  const key = (x, y) => x * 4096 + y;
  const arms = S.SPLAT_BITS.filter((b) => b.role === 'arm');
  const armLen = Math.min(...arms.map((b) => Math.max(b.sw, b.sh)));
  for (const torso of S.SPLAT_BITS.filter((b) => b.role === 'torso')) {
    const blue = new Set(torso.cells.filter(([x, y]) => isBlue(torso.grid[y][x])).map(([x, y]) => key(x, y)));
    const seen = new Set();
    let tabard = [];
    for (const [x, y] of torso.cells) {
      if (!blue.has(key(x, y)) || seen.has(key(x, y))) continue;
      const patch = [[x, y]];
      seen.add(key(x, y));
      for (let i = 0; i < patch.length; i++) {
        const [cx, cy] = patch[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = key(cx + dx, cy + dy);
          if (blue.has(k) && !seen.has(k)) { seen.add(k); patch.push([cx + dx, cy + dy]); }
        }
      }
      if (patch.length > tabard.length) tabard = patch;
    }
    let reach = 0, at = null;
    for (const [x, y] of torso.cells) {
      let d = Infinity;
      for (const [tx, ty] of tabard) d = Math.min(d, (x - tx) ** 2 + (y - ty) ** 2);
      if (d > reach) { reach = d; at = [x, y]; }
    }
    reach = Math.sqrt(reach);
    if (!tabard.length || reach > TORSO_REACH * armLen) {
      fail(`the torso carries a limb: ink ${reach.toFixed(1)} px from its tabard at ${at}, ` +
        `${(reach / armLen).toFixed(2)} of an arm's ${armLen} px (at most ${TORSO_REACH})`);
    } else {
      ok(`the torso carries no limb: nothing further than ${reach.toFixed(1)} px from its tabard, ` +
        `${(reach / armLen).toFixed(2)} of an arm`);
    }
  }
  for (const role of ['arm', 'leg']) {
    const list = S.SPLAT_BITS.filter((b) => b.role === role);
    const least = Math.min(...list.map((b) => b.n));
    const fat = list.filter((b) => b.n > LIMB_TWICE * least);
    // A piece this far over the smallest carries a second limb -- or the smallest is a
    // limb cut short. Either way they are not one of a kind each.
    if (fat.length) fail(`${role}s are not one ${role} each: ${fat.map((b) => b.n).join(', ')} px against the smallest's ${least}`);
    else ok(`${list.length} ${role}s, each one ${role}: ${list.map((b) => b.n).join(', ')} px`);
  }
  const bare = [];
  let lines = 0, linePx = 0;
  const pieces = S.SPLAT_BITS.map((b) => ({ b, own: new Set(b.cells.map(([x, y]) => key(x, y))) }));
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const P = pieces[i], Q = pieces[j];
      if (P.b.frame !== Q.b.frame) continue;
      const shared = P.b.cells.filter(([x, y]) => Q.own.has(key(x, y)));
      // P's own pixels (not on a shared line) touching Q's own: opened with no outline between.
      let touch = 0;
      for (const [x, y] of P.b.cells) {
        if (Q.own.has(key(x, y))) continue;
        let hit = false;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1 && !hit; dx++) {
            const k = key(x + dx, y + dy);
            hit = Q.own.has(k) && !P.own.has(k);
          }
        }
        if (hit) touch++;
      }
      const lit = shared.filter(([x, y]) => hsv(P.b.grid[y][x]).v >= 64 || hsv(Q.b.grid[y][x]).v >= 64);
      if (shared.length) { lines++; linePx += shared.length; }
      if (touch || lit.length) {
        bare.push(`${P.b.role} and ${Q.b.role}: ` + [touch && `${touch} px meet with no line between them`,
          lit.length && `${lit.length} lit px on the line`].filter(Boolean).join(', '));
      }
    }
  }
  if (bare.length) fail(`a cut left a piece open, without an outline: ${bare.slice(0, 3).join('; ')}`);
  else ok(`every cut is outlined on both sides: ${lines} cut line(s), ${linePx} px, all outline ink in both pieces`);
  // ...and every piece is ONE piece, 8-connected. The drawing's own pieces are by
  // construction; a cut decides its sides by what the line leaves joined to the tabard,
  // so an island of ink the line happened to close off would fly with the limb, a fleck
  // detached from it. Mutation: a single stray pixel added to the cut arm fails here.
  const islands = [];
  for (const b of S.SPLAT_BITS) {
    const own = new Set(b.cells.map(([x, y]) => key(x, y)));
    const seen = new Set([key(b.cells[0][0], b.cells[0][1])]);
    const stack = [b.cells[0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = key(x + dx, y + dy);
          if (own.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
        }
      }
    }
    if (seen.size !== own.size) islands.push(`${b.role} (${b.n} px): ${own.size - seen.size} px apart from the rest`);
  }
  if (islands.length) fail(`a piece is more than one piece: ${islands.join('; ')}`);
  else ok(`every piece is one connected piece of ink (${S.SPLAT_BITS.length})`);
}

// --- ...and the cut survives a re-import --------------------------------------------
//
// The cut is read from the art, so it is tried on the parts drawing changed the two ways
// a re-import could change it, each loaded as a second copy of sprites.js over the edited
// drawing (the generated art itself is untouched):
//  - the arm drawn two pixels clear of the torso: nothing may be cut, the arm is simply a
//    fifth loose piece of the upper bin and the torso is the same torso;
//  - the armhole painted over in lit steel with a lit bridge across its middle, so no
//    outline runs between them: the arm must still come off as one arm-sized piece, and
//    every piece must still be ONE piece.
// Mutation: the cut's far end taken as every pixel that far out, as first written, cuts
// the lit armhole round a tip of the torso's own right side too, and the arm flies with
// a 4 px fleck of it (the 30% and 40% far ends do the same on the art as drawn; the 50%
// one won there by 0.3% of an arm).
{
  const V = await import('../src/render/vytisart.js');
  const at = S.POSE_ART.parts0, orig = V.FRAMES[at];
  const torso = S.PARTS_BITS.find((b) => b.role === 'torso');
  const cut = S.PARTS_BITS.find((b) => b.hang && b.role === 'arm');
  const k = (x, y) => x * 4096 + y;
  const oneEach = (bits) => bits.filter((b) => {
    const own = new Set(b.cells.map(([x, y]) => k(x, y)));
    const seen = new Set([k(...b.cells[0])]), stack = [b.cells[0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (own.has(k(x + dx, y + dy)) && !seen.has(k(x + dx, y + dy))) { seen.add(k(x + dx, y + dy)); stack.push([x + dx, y + dy]); }
      }
    }
    return seen.size !== own.size;
  }).map((b) => `${b.role} (${b.n} px)`);
  const reimport = async (tag, paint) => {
    const rows = orig.map((r) => r.padEnd(S.SPR_W, '.').split(''));
    paint(rows);
    V.FRAMES[at] = rows.map((r) => r.join(''));
    try { return await import(`../src/render/sprites.js?${tag}`); } finally { V.FRAMES[at] = orig; }
  };
  // What a re-import THROWS is one body still: two arms, whatever it cut.
  const thrownArms = (mod) => mod.SPLAT_BITS.filter((b) => b.role === 'arm').length;
  if (!cut) {
    ok('no arm is cut off the torso on this sheet: no re-import of a cut to try');
  } else {
    const onTorso = new Set(torso.cells.map(([x, y]) => k(x, y)));
    const line = cut.cells.filter(([x, y]) => onTorso.has(k(x, y)));
    const apartMod = await reimport('apart', (rows) => {
      const dx = cut.hang.dx < 0 ? -2 : 2;
      for (const [x, y] of cut.cells) if (!onTorso.has(k(x, y))) rows[y][x] = '.';
      for (const [x, y] of cut.cells) {
        let near = false;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) near ||= onTorso.has(k(x + dx + i, y + j));
        if (!near) rows[y][x + dx] = orig[y][x];
      }
    });
    const apart = apartMod.PARTS_BITS;
    // No ARM is cut when the arm is drawn loose; the pauldron, which is the torso's own and
    // still on it, comes off as its plate either way.
    const cutApart = apart.filter((b) => b.hang && b.role === 'arm');
    const platesApart = apart.filter((b) => b.role === 'plate');
    const torsoApart = apart.find((b) => b.role === 'torso');
    if (cutApart.length || platesApart.length !== 1 || torsoApart.n !== torso.n || apart.filter((b) => b.role === 'arm').length !== 4
      || thrownArms(apartMod) !== 2) {
      fail(`the arm drawn clear of the torso: ${cutApart.length} arm(s) cut, ${platesApart.length} plate(s), torso ${torsoApart.n} px (was ${torso.n}), ` +
        `${apart.filter((b) => b.role === 'arm').length} arms drawn, ${thrownArms(apartMod)} thrown`);
    } else ok(`the arm drawn two pixels clear of the torso: no arm cut, the pauldron its plate, the same ${torso.n} px torso, four arms drawn and two thrown`);

    // A lit steel from the sheet's own palette: grey, the tone nearest 155.
    const hsv = (c) => { const n = parseInt(c.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
      const mx = Math.max(r, g, b); return { s: mx ? (mx - Math.min(r, g, b)) / mx : 0, v: mx }; };
    const lit = Object.entries(V.PAL).filter(([, c]) => hsv(c).s < 0.12)
      .sort((a, b) => Math.abs(hsv(a[1]).v - 155) - Math.abs(hsv(b[1]).v - 155))[0][0];
    const joinedMod = await reimport('lit', (rows) => {
      for (const [x, y] of line) rows[y][x] = lit;
      const [mx, my] = line[line.length >> 1];
      for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++) rows[my + j][mx + i] = lit;
    });
    const joined = joinedMod.PARTS_BITS;
    const cutLit = joined.filter((b) => b.hang && b.role === 'arm');
    const split = oneEach(joined);
    if (cutLit.length !== 1 || split.length || thrownArms(joinedMod) !== 2) {
      fail(`the armhole painted over in lit steel: ${cutLit.length} arm(s) cut off, ${thrownArms(joinedMod)} thrown` +
        (split.length ? `, and a piece is more than one piece: ${split.join(', ')}` : ''));
    } else ok(`the armhole painted over in lit steel: the arm still comes off, ${cutLit[0].n} px, every piece one piece, two arms thrown`);
  }
}

// --- the deaths ------------------------------------------------------------------
const OPEN_HALF = (C.VW - 2 * C.WALL_W) / 2;

function stage(seed, floor, open, left = false, turn = 0) {
  const game = new Game(new AutoInput());
  game.newRun(seed);
  for (let i = 0; i < 260; i++) game.step(STEP);
  game.run.maxFloor = floor;
  if (open) {
    game.zoom = game.zoomView = 1;
    game.arenaHalf = game.arenaHalfView = game.arenaEase = OPEN_HALF;
    game.arenaStep = 4;
    game.viewH = C.VH;
  }
  if (left) game.player.facing = -1;
  game.die();
  // Start the tumble on a different quarter turn, so the landings cover all four: the
  // staged falls are all about the same length and would otherwise land on the same two.
  game.tumble += turn;
  return game;
}

const quarter = (g) => S.pieceBox(g.w, g.h, g.x, g.y, g.rot).q;

/** One whole death, stepped to the scoreboard, with what happened to every piece. */
function runDeath(seed, floor, open, left = false, turn = 0) {
  const game = stage(seed, floor, open, left, turn);
  let n = 0;
  while (!game.impacted && n++ < 40000) game.step(STEP);
  const starts = (game.gibs || []).map((g) => ({ x: g.x, y: g.y, role: g.role, i: g.i }));
  const q0 = ((Math.floor(game.tumble) % 4) + 4) % 4;
  const before = new Map();       // the quadrant each piece was drawn in the step before it stopped
  // How far the step that STOPPED a piece moved its turn beyond that step's own spin, in
  // radians. The quadrant check above cannot see this: pieces are drawn in whole quarter
  // turns, so a rest that yanks the angle by anything under 45 degrees draws the same --
  // and a spin aimed three radians a second wrong did exactly that, unnoticed. Measured
  // on the angle itself, the rest is continuous or it is not.
  const restJump = new Map();
  // The lowest the drawn box of any piece ever got below the contact line IN FLIGHT --
  // resting pieces are checked separately, and one that clips the floor mid-bounce is
  // sunk into it just the same.
  let flightSink = 0;
  let last = null;
  let guard = 0;
  while (game.state === STATE.FALLING && guard++ < 40000) {
    const q = new Map(game.gibs.map((g) => [g, quarter(g)]));
    const spun = new Map(game.gibs.map((g) => [g, g.rot + g.vrot * STEP]));
    const moving = new Set(game.gibs.filter((g) => !g.rest));
    game.step(STEP);
    for (const g of moving) {
      if (g.rest) {
        before.set(g, q.get(g));
        restJump.set(g, Math.abs(g.rot - spun.get(g)));
      } else {
        flightSink = Math.max(flightSink, game.pitY - S.pieceBox(g.w, g.h, g.x, g.y, g.rot).bottom);
      }
    }
    if (game.state === STATE.FALLING) last = bloodStains(game);
  }
  return { game, starts, q0, before, restJump, flightSink, stains: last || [] };
}

/** The area of the blood, in art pixels, counted as a UNION: overlapping stains once. */
function bloodArea(stains) {
  const cells = new Set();
  for (const s of stains) {
    const x0 = Math.round(s.x * C.PX), x1 = Math.round((s.x + s.w) * C.PX);
    const y0 = Math.round(s.y * C.PX), y1 = Math.round((s.y + s.h) * C.PX);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells.add(x + ',' + y);
  }
  return cells.size;
}

// The arms cut off the torso, found from the pixels -- an arm that shares a line of
// pixels with the torso in the same drawing, or touches it (see "every piece is ONE
// part") -- and where each hung: its box's centre from the torso's, in art pixels, x
// right and y down.
const CUT = [];
for (const t of S.SPLAT_BITS.filter((b) => b.role === 'torso')) {
  const own = new Set(t.cells.map(([x, y]) => x * 4096 + y));
  const near = (x, y) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => own.has((x + dx) * 4096 + y + dy)));
  S.SPLAT_BITS.forEach((b, i) => {
    if (b.role !== 'arm' || b.frame !== t.frame || !b.cells.some(([x, y]) => near(x, y))) return;
    CUT.push({ i, torso: S.SPLAT_BITS.indexOf(t),
      dx: b.sx + b.sw / 2 - (t.sx + t.sw / 2), dy: b.sy + b.sh / 2 - (t.sy + t.sh / 2) });
  });
}

const SEEDS = [0x2f6f1b21, 1, 7, 42, 1234, 99991, 0xdecafbad, 31337];
const FLOORS = [220, 420, 900];
const ARENAS = [false, true];

let deaths = 0, pieces = 0;
const turns = [0, 0, 0, 0];     // how many deaths landed on each quarter turn of the tumble
const settle = [], offX = [], snaps = [], sunk = [], unsettled = [], clumps = [];
const overlap = [], outside = [], upside = [], jumps = [];
const hung = [], hungOff = [], cutArm = [], pushed = [], lopsided = [];
let worstJump = 0, worstFlightSink = 0;
const area = {};

for (const seed of SEEDS) {
  for (const open of ARENAS) {
    for (const floor of FLOORS) {
      // Every other seed dies facing LEFT: the body and every piece mirrored.
      const left = SEEDS.indexOf(seed) % 2 === 1;
      const { game, starts, q0, before, restJump, flightSink, stains } =
        runDeath(seed, floor, open, left, deaths % 4);
      worstFlightSink = Math.max(worstFlightSink, flightSink);
      deaths++;
      turns[q0]++;
      const tag = `seed ${seed} floor ${floor} ${open ? 'open' : 'narrow'}${left ? ' left' : ''}`;
      const lo = C.CX - game.arenaHalf, hi = C.CX + game.arenaHalf;
      area[`${seed}/${open}`] = area[`${seed}/${open}`] || [];
      area[`${seed}/${open}`].push(bloodArea(stains));

      // THE BURST comes from his body, not a clump: the head starts above the legs
      // along whichever way is UP for the quarter turn he hit the floor in, and the
      // pieces are spread over most of a body length.
      const up = [[0, 1], [1, 0], [0, -1], [-1, 0]][q0];
      const along = (s) => s.x * up[0] + s.y * up[1];
      const head = starts.find((s) => s.role === 'head');
      const legs = starts.filter((s) => s.role === 'leg');
      if (head && legs.some((l) => along(head) <= along(l))) upside.push(tag);
      let spread = 0;
      for (const a of starts) for (const b of starts) spread = Math.max(spread, Math.hypot(a.x - b.x, a.y - b.y));
      if (spread < 25) clumps.push(`${tag}: all within ${spread.toFixed(1)} units`);

      // THE ARM CUT OFF THE TORSO bursts from the shoulder it hung on: it starts where
      // the parts drawing hangs it off the torso, turned and mirrored with him, wherever
      // the torso starts. It used to fly AS the torso; from a loose arm's slot it would
      // come off another part of him. The one exception is the burst's own: a piece that
      // would start through a wall is pushed in by its own reach, and one under the floor
      // up onto it, so where either of the two is pushed, that axis is not compared.
      // Mutation: the cut arm given the first loose arm's slot, as it had before it was
      // given its own -- 48 of 48 fail, 17 to 28 art px from where it hung.
      for (const c of CUT) {
        const s = starts.find((q) => q.i === c.i), t = starts.find((q) => q.i === c.torso);
        const g = game.gibs.find((q) => q.i === c.i), gt = game.gibs.find((q) => q.i === c.torso);
        const e0 = S.posePoint(S.FALL_POSE, 0, 0, left, q0), e1 = S.posePoint(S.FALL_POSE, c.dx, c.dy, left, q0);
        const atWall = (q, st) => Math.abs(st.x - (lo + q.reach)) < 1e-9 || Math.abs(st.x - (hi - q.reach)) < 1e-9;
        const onFloor = (q, st) => Math.abs(st.y - (game.pitY + S.halfHeight(q.w, q.h, g.rot) + 0.5)) < 1e-9;
        const wall = atWall(g, s) || atWall(gt, t), floor = onFloor(g, s) || onFloor(gt, t);
        const miss = Math.hypot(wall ? 0 : s.x - t.x - (e1.x - e0.x), floor ? 0 : s.y - t.y - (e1.y - e0.y));
        hung.push(miss);
        if (wall || floor) pushed.push(`${tag} ${wall ? 'wall' : 'floor'}`);
        if (miss > 1e-6) hungOff.push(`${tag} (turn ${q0}): ${(miss * C.PX).toFixed(1)} art px from where it hung`);
        cutArm.push({ K: g.K, restT: g.restT });
      }
      // ...and the loose arms fill his sides around it: as many arms either side of the
      // torso, across his own up, give or take one. Handed out in size order regardless,
      // it was three on the side the cut arm hung on and one on the other, in every death.
      if (CUT.length) {
        const t = starts.find((q) => q.role === 'torso');
        const across = (s) => (s.x - t.x) * up[1] - (s.y - t.y) * up[0];
        const arms = starts.filter((q) => q.role === 'arm');
        const l = arms.filter((s) => across(s) < 0).length, r = arms.length - l;
        if (Math.abs(l - r) > 1) lopsided.push(`${tag} (turn ${q0}): ${l} arms one side, ${r} the other`);
      }

      // THE PLAN: every resting place inside the walls, none overlapping another.
      const spots = game.gibs.map((g) => ({ l: g.tx - Math.max(g.w, g.h) / 2, r: g.tx + Math.max(g.w, g.h) / 2 }))
        .sort((a, b) => a.l - b.l);
      for (const s of spots) if (s.l < lo - 1e-9 || s.r > hi + 1e-9) outside.push(tag);
      for (let i = 1; i < spots.length; i++) {
        if (spots[i].l < spots[i - 1].r - 1e-9) overlap.push(`${tag}: ${(spots[i - 1].r - spots[i].l).toFixed(2)} units`);
      }

      for (const g of game.gibs) {
        pieces++;
        if (!g.rest) { unsettled.push(`${tag} ${g.role}`); continue; }
        settle.push(g.restT);
        offX.push(Math.abs(g.x - g.tx));
        // ALREADY at its planned turn when it stopped: the quadrant it was drawn in on
        // the step before resting, and the one it rests in, are both the planned one.
        const q = quarter(g);
        if (q !== g.tq || before.get(g) !== g.tq) {
          snaps.push(`${tag} ${g.role}: planned ${g.tq}, drawn ${before.get(g)} then ${q}`);
        }
        // ...and the angle itself does not jump on the step it stops. A thousandth of a
        // radian is far under a pixel at the tip of the longest piece.
        const jump = restJump.get(g) || 0;
        worstJump = Math.max(worstJump, jump);
        if (jump > 1e-3) jumps.push(`${tag} ${g.role}: ${(jump * 180 / Math.PI).toFixed(1)} degrees`);
        // ON the contact line: its drawn lowest pixel, and its true lowest point.
        const box = S.pieceBox(g.w, g.h, g.x, g.y, g.rot);
        const low = g.y - S.halfHeight(g.w, g.h, g.rot);
        if (Math.abs(box.bottom - game.pitY) > 1e-9 || Math.abs(low - game.pitY) > 1e-6) {
          sunk.push(`${tag} ${g.role}: drawn bottom ${(box.bottom - game.pitY).toFixed(3)}, ` +
            `lowest point ${(low - game.pitY).toFixed(3)} from the floor`);
        }
        if (g.px !== g.x || g.py !== g.y || g.prot !== g.rot) sunk.push(`${tag} ${g.role}: prev not synced at rest`);
      }
    }
  }
}

const pct = (arr, p) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
console.log(`  [${deaths} deaths, ${pieces} pieces; landed on quarter turns 0-3: ${turns.join(" / ")}]`);

if (unsettled.length) {
  fail(`${unsettled.length} piece(s) still moving when the scoreboard came up: ${unsettled.slice(0, 4).join('; ')}`);
} else {
  // Every piece down with time to spare: the board is IMPACT_HOLD after the impact, and
  // a second of stillness before it is what makes the landing read as final.
  const worst = Math.max(...settle);
  if (worst > C.IMPACT_HOLD - 0.5) fail(`the slowest piece settles at ${worst.toFixed(2)} s, too close to the ${C.IMPACT_HOLD} s hold`);
  else ok(`all ${pieces} pieces at rest before the board: settle p50 ${pct(settle, 0.5).toFixed(2)} s, ` +
    `max ${worst.toFixed(2)} s of the ${C.IMPACT_HOLD} s hold`);
}

const worstX = Math.max(...offX);
if (worstX > 1) fail(`a piece came to rest ${worstX.toFixed(2)} units from its planned spot`);
else ok(`every piece rests on its planned spot: p50 ${pct(offX, 0.5).toFixed(4)}, max ${worstX.toFixed(4)} units off`);

if (snaps.length) fail(`${snaps.length} piece(s) not already on their planned turn: ${snaps.slice(0, 3).join('; ')}`);
else if (jumps.length) fail(`${jumps.length} piece(s) jump their angle as they stop: ${jumps.slice(0, 3).join('; ')}`);
else ok(`every piece arrives on its planned quarter turn -- nothing snaps as it stops ` +
  `(largest turn on the stopping step ${worstJump.toExponential(1)} rad)`);

if (sunk.length) fail(`${sunk.length} resting piece(s) off the floor: ${sunk.slice(0, 3).join('; ')}`);
else ok('every resting piece\'s lowest pixel is exactly on the contact line');
if (worstFlightSink > 1e-9) fail(`a piece in flight was drawn ${worstFlightSink.toFixed(3)} units into the floor`);
else ok('no piece in flight is ever drawn below the contact line');

if (overlap.length || outside.length) {
  fail(`planned spots overlap (${overlap.length}) or leave the floor (${outside.length}): ${overlap.concat(outside).slice(0, 3).join('; ')}`);
} else {
  ok('planned resting places: side by side, none overlapping, all between the walls');
}

if (upside.length || clumps.length) {
  fail(`the burst is not from his body: ${upside.concat(clumps).slice(0, 3).join('; ')}`);
} else {
  ok('every burst starts from the body -- head above legs along his own up, never a clump');
}

if (!CUT.length) {
  ok('no arm is cut off the torso on this sheet (nothing to burst from a shoulder)');
} else if (hungOff.length) {
  fail(`${hungOff.length} of ${hung.length} cut arm(s) do not burst from where they hung off the torso: ${hungOff.slice(0, 3).join('; ')}`);
} else if (lopsided.length) {
  fail(`${lopsided.length} burst(s) put the arms on one side of him: ${lopsided.slice(0, 3).join('; ')}`);
} else {
  const ks = cutArm.map((c) => c.K).sort((a, b) => a - b);
  ok(`the arm cut off the torso bursts from where it hung off it in all ${hung.length} deaths, ` +
    `both facings, every quarter turn (off by at most ${Math.max(...hung).toExponential(1)} units; ` +
    `${pushed.length} pushed off a wall or the floor on one axis, as any piece is there), ` +
    `and the arms split evenly either side of him; ` +
    `it strikes ${ks[0]}-${ks[ks.length - 1]} times and is still by ${Math.max(...cutArm.map((c) => c.restT)).toFixed(2)} s`);
}

// --- more blood the further he fell ----------------------------------------------
{
  const wrong = [];
  const rows = [];
  for (const [k, list] of Object.entries(area)) {
    rows.push(list);
    for (let i = 1; i < list.length; i++) if (!(list[i] > list[i - 1])) wrong.push(`${k}: ${list.join(' -> ')}`);
  }
  const mean = FLOORS.map((_, i) => Math.round(rows.reduce((t, r) => t + r[i], 0) / rows.length));
  if (wrong.length) fail(`blood does not grow with the fall: ${wrong.slice(0, 3).join('; ')}`);
  else ok(`blood grows with the fall, every seed: mean ${FLOORS.map((f, i) => `floor ${f} ${mean[i]} px`).join(', ')}`);
}

// --- the same seed, the same death ---------------------------------------------------
{
  const a = runDeath(SEEDS[0], 420, true), b = runDeath(SEEDS[0], 420, true);
  const sig = (r) => JSON.stringify(r.game.gibs.map((g) => [g.tx, g.tq, g.x, g.y, g.rot]))
    + JSON.stringify(r.stains);
  if (sig(a) !== sig(b)) fail('the same seed produced two different deaths');
  else ok('deterministic: the same seed lays out and bleeds identically');
}

// --- below SPLAT_FLOOR he lands whole ------------------------------------------------
{
  const { game } = runDeath(SEEDS[0], C.SPLAT_FLOOR - 40, false);
  if (game.splat || (game.gibs && game.gibs.length) || bloodStains(game).length) {
    fail('a fall from below SPLAT_FLOOR came apart or bled');
  } else ok(`below floor ${C.SPLAT_FLOOR} he lands in one piece, no blood`);
}

console.log(`\n  RESULT: ${bad ? `FAIL - ${bad} problem(s)` : 'PASS'}`);
process.exit(bad ? 1 : 0);
