// The combo trail's rules, checked without drawing a frame.
//
//   node tools/test-sparks.mjs
//
// What it holds sparks.js and Particles.comboTrail to:
//   - every sprite sits inside its atlas cell with a clear pixel all round, and no star
//     but the one-pixel spark frame has a lone pixel;
//   - the trail changes step exactly where the combo's milestones are, and grows (never
//     shrinks) as the chain does;
//   - the particle setting's cap holds -- at no moment are more pieces alive than the
//     setting allows, and a setting of zero sheds nothing at all;
//   - every piece leaves him going BACKWARD relative to him (it inherits under one of his
//     velocity), which is what keeps it off the ledge he is about to land on;
//   - the stream stops at its source the moment the chain ends;
//   - a burst's confetti lives its whole life under the stream, even while landings go on
//     spawning dust from the shared cursor (the trail has slots of its own, after the ring);
//   - no zone is given a ramp its own sky hides.
// What it looks like is for tools/shot-trail.mjs, and the frame-level promises (nothing
// drawn over a ledge's lit top rows) are checked there with --measure.

import { installDom } from './headless.mjs';

installDom();

const S = await import('../src/render/sparks.js');
const { Particles, KIND } = await import('../src/render/particles.js');
// The combo's own step ladder: the trail changes palette at each multiplier step. It was read
// off the callout table (MILESTONES) while the callouts were the combo's steps; they are the
// tower's heights now (game/milestones.js), and the steps are every MULT_STEP floors.
const { MULT_STEP } = await import('../src/game/combo.js');
const { THEMES } = await import('../src/game/themes.js');

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// --- the sprites ----------------------------------------------------------------------
{
  const p = S.paintAtlas();
  const C = S.CELL, NS = S.SHAPES.length, NR = p.h / (C * NS);
  let edge = 0, lone = 0, oversize = 0;
  for (let r = 0; r < NR; r++) {
    for (let s = 0; s < NS; s++) {
      for (let f = 0; f < 4; f++) {
        const ox = f * C, oy = (r * NS + s) * C;
        let x0 = C, x1 = -1, y0 = C, y1 = -1, n = 0;
        const a = (x, y) => (x < 0 || y < 0 || x >= C || y >= C ? 0 : p.data[((oy + y) * p.w + ox + x) * 4 + 3]);
        for (let y = 0; y < C; y++) {
          for (let x = 0; x < C; x++) {
            if (!a(x, y)) continue;
            n++;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            if (x === 0 || y === 0 || x === C - 1 || y === C - 1) edge++;
            let nb = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && a(x + dx, y + dy)) nb++;
            if (!nb && n > 0 && s !== S.SHAPE.SPARK) lone++;
          }
        }
        if (n && (x1 - x0 + 1 > S.SHAPE_SIZE[s] || y1 - y0 + 1 > S.SHAPE_SIZE[s])) oversize++;
      }
    }
  }
  check(edge === 0, `no sprite touches its cell's edge (${edge} pixels do)`);
  check(lone === 0, `no star has a lone pixel (${lone})`);
  check(oversize === 0, `every frame fits its stated size of 3/5/7/9 px (${oversize} do not)`);
  check(NR <= 32, `${NR} ramps fit the 5 bits pickTwinkle packs them in`);
}

// --- the steps ------------------------------------------------------------------------
{
  let ok = true;
  for (let i = 0; i < S.STEPS.length - 2; i++) {
    const x = (i + 1) * MULT_STEP;
    if (S.stepFor(x) !== i + 2 || S.stepFor(x - 1) !== i + 1) ok = false;
  }
  check(ok, `the trail steps up exactly at every multiplier step, ${MULT_STEP} to ${(S.STEPS.length - 2) * MULT_STEP} floors`);
  check(S.stepFor(0) === 0 && S.stepFor(2) === 1, 'no chain is the speed trail, any chain is at least CHAIN');
  check(S.stepFor(10000) === S.STEPS.length - 1, 'past GLORY it stays on its last row');
  let mono = true, last = -1;
  for (let f = 0; f <= 800; f++) { const r = S.trailRate(f, 1, true); if (r < last - 1e-9) mono = false; last = r; }
  check(mono, 'the rate never falls as the chain grows (0..800 floors)');
  check(S.trailRate(300, 1, false) === 0, 'nothing is shed standing still');
  const at = (f) => S.trailRate(f, 1, true).toFixed(0);
  console.log(`       pieces/s at 'high': none ${at(0)}, chain 20 ${at(20)}, SWIFT ${at(50)}, SOARING ${at(150)},` +
    ` CRUSADE ${at(250)}, GLORY ${at(350)}, 500 ${at(500)}`);
}

// --- the emitter ----------------------------------------------------------------------
const STEP = 1 / 240;
function run(budget, floorsAt, seconds, player) {
  const P = new Particles();
  if (budget !== null) P.setBudget(budget);
  let most = 0, spawned = 0, backward = 0, measured = 0, reusedLive = 0, over = 0;
  for (let t = 0; t < seconds; t += STEP) {
    // The trail writes round-robin into slots of its own, after the bursts' ring: walk
    // from where its cursor stood to where it stands now to find what was just shed.
    const before = P.shedCursor;
    const pl = player(t);
    const aliveBefore = P.alive.slice(P.trailBase, P.trailBase + P.shedRoom);
    P.comboTrail(STEP, pl, floorsAt(t), 5);
    for (let c = before; c !== P.shedCursor; c = (c + 1) % P.shedRoom) {
      const i = P.trailBase + c;
      spawned++;
      if (aliveBefore[c]) reusedLive++;          // took the slot of a piece still falling
      if (P.kind[i] !== KIND.TWINKLE) continue;
      const sp = Math.hypot(pl.vx, pl.vy);
      if (sp > 40) {
        measured++;
        if ((P.vx[i] - pl.vx) * pl.vx + (P.vy[i] - pl.vy) * pl.vy < 0) backward++;
      }
    }
    P.step(STEP);
    most = Math.max(most, P.twinkles);
    if (P.n > P.budget) over++;
  }
  return { P, most, spawned, backward, measured, reusedLive, over };
}
// He moves the way a fast climb does: a launch, a fall, a run along a ledge.
const climber = (t) => {
  const ph = t % 1.2;
  return ph < 0.5 ? { x: 240, y: 100, vx: 200, vy: 880 - 1200 * ph, momentum: 1, grounded: false }
    : ph < 0.9 ? { x: 240, y: 100, vx: -300, vy: -500, momentum: 1, grounded: false }
      : { x: 240, y: 100, vx: 420, vy: 0, momentum: 1, grounded: true };
};
{
  for (const [name, b] of [['high', 900], ['medium', 520], ['low', 220]]) {
    const r = run(b, () => 600, 6, climber);
    check(r.most <= r.P.twinkleCap, `${name}: at most ${r.most} pieces alive, cap ${r.P.twinkleCap}`);
    check(r.reusedLive === 0 && r.spawned > 0,
      `${name}: the trail's ${r.P.shedRoom} slots never reuse a piece still falling (${r.reusedLive} of ${r.spawned})`);
    check(r.over === 0, `${name}: never more particles alive than the setting's ${r.P.budget} (${r.over} steps over)`);
  }
  const off = run(0, () => 600, 3, climber);
  check(off.most === 0 && off.P.twinkleCap === 0, `a setting of zero sheds nothing (${off.most} alive)`);
  const r = run(900, () => 300, 6, climber);
  check(r.measured > 500 && r.backward === r.measured,
    `every piece leaves backward relative to him (${r.backward} of ${r.measured})`);
  // The chain ends halfway, and he has slowed to a walk: nothing more comes out of him.
  const walk = (t) => (t < 2 ? climber(t) : { x: 240, y: 100, vx: 100, vy: 0, momentum: 0.2, grounded: true });
  const b = run(900, (t) => (t < 2 ? 300 : 0), 4, walk);
  let after = 0;
  for (let i = 0; i < b.P.slots; i++) if (b.P.alive[i]) after++;
  check(after === 0, `the stream stops when the chain ends (${after} pieces left 2 s later)`);

  // A milestone's confetti lives its whole life under a trail at full stream: the trail
  // has slots of its own and never touches a burst's.
  for (const [name, bud] of [['high', 900], ['low', 220]]) {
    const P = new Particles();
    P.setBudget(bud);
    for (let t = 0; t < 1; t += STEP) { P.comboTrail(STEP, climber(t), 600, 5); P.step(STEP); }
    P.burst(240, 100, 70, ['#ffffff'], 1);
    const mine = [];
    for (let i = 0; i < P.max; i++) if (P.alive[i] && P.kind[i] === KIND.CONFETTI) mine.push([i, P.maxLife[i]]);
    let lost = 0;
    for (let t = 0; t < 1.5; t += STEP) {
      P.comboTrail(STEP, climber(t + 1), 600, 5);
      P.step(STEP);
      for (const [i, life] of mine) if (life - t > 2 * STEP && (!P.alive[i] || P.kind[i] !== KIND.CONFETTI)) lost++;
    }
    check(mine.length === 70 && lost === 0, `${name}: all ${mine.length} confetti of a burst live their full life under the stream (${lost} slot-steps lost)`);
  }

  // ...and while the rest of the game goes on spawning. Every landing throws a dozen motes
  // of dust from the SHARED round-robin cursor, and the first version of the trail moved
  // that cursor on with every piece it shed -- so the ring was lapped two to eight times
  // faster than before, and the next landings' dust landed on confetti still in the air.
  // In a real 60 s attract run that cut short 22 confetti on MEDIUM (none before the
  // trail) and 102 on LOW (74 before). The trail has slots of its own now.
  for (const [name, bud] of [['high', 900], ['medium', 520], ['low', 220]]) {
    const P = new Particles();
    P.setBudget(bud);
    for (let t = 0; t < 1; t += STEP) { P.comboTrail(STEP, climber(t), 600, 5); P.step(STEP); }
    P.burst(240, 100, 70, ['#ffffff'], 1);
    const mine = [];
    for (let i = 0; i < P.max; i++) if (P.alive[i] && P.kind[i] === KIND.CONFETTI) mine.push([i, P.maxLife[i]]);
    let lost = 0, land = 0.25;
    for (let t = 0; t < 1.6; t += STEP) {
      P.comboTrail(STEP, climber(t + 1), 600, 5);
      if (t >= land) { P.landing(240, 100, 0.8, '#ffffff'); land += 0.25; }
      P.step(STEP);
      for (const [i, life] of mine) if (life - t > 2 * STEP && (!P.alive[i] || P.kind[i] !== KIND.CONFETTI)) lost++;
    }
    check(lost === 0, `${name}: a burst's confetti outlives the stream AND a landing's dust every 0.25 s (${lost} slot-steps lost)`);
  }

  // ...and the trail does not stall behind one either. A trail that walked the RING with a
  // cursor of its own, standing still whenever every probe found a live burst, sat in
  // front of a milestone's seventy confetti until they died: dark for up to 1.6 s at the
  // very moment it changes palette. A quarter of a second after a burst the stream must be
  // running.
  {
    const P = new Particles();
    P.burst(240, 100, 70, ['#ffffff'], 1);            // slots 0..69, where the trail's cursor stands
    for (let t = 0; t < 0.25; t += STEP) { P.comboTrail(STEP, climber(t), 300, 5); P.step(STEP); }
    const want = S.trailRate(300, 1, true) * 0.25;
    check(P.twinkles > want * 0.6,
      `a burst in front of the trail's cursor does not stall it (${P.twinkles} pieces alive 0.25 s later, ~${want.toFixed(0)} shed)`);
  }
}

// --- the two regions -------------------------------------------------------------------
// The trail's pieces live after the ring, the bursts' in it, and neither ever in the other's.
{
  for (const [name, bud] of [['high', 900], ['low', 220]]) {
    const P = new Particles();
    P.setBudget(bud);
    let strays = 0, land = 0;
    for (let t = 0; t < 3; t += STEP) {
      P.comboTrail(STEP, climber(t), 600, 5);
      if (t >= land) { P.landing(240, 100, 0.8, '#ffffff'); P.burst(240, 100, 30, ['#ffffff'], 1); land += 0.2; }
      P.step(STEP);
      for (let i = 0; i < P.slots; i++) {
        if (!P.alive[i]) continue;
        if ((i >= P.trailBase) !== (P.kind[i] === KIND.TWINKLE)) strays++;
      }
    }
    check(strays === 0, `${name}: trail pieces only in the trail's slots, everything else only in the ring (${strays} strays)`);
  }
}

// --- the zones ------------------------------------------------------------------------
{
  let bad = [];
  for (let z = 0; z < THEMES.length; z++) {
    for (let s = 1; s < S.STEPS.length; s++) {
      if (!S.rampsFor(s, z).length) bad.push(`${THEMES[z].name}/${S.STEPS[s].name} empty`);
    }
  }
  check(!bad.length, `every step has colours in every zone ${bad.join(', ')}`);
  const swapped = [];
  for (let z = 0; z < THEMES.length; z++) {
    for (let s = 1; s < S.STEPS.length; s++) {
      const want = S.STEPS[s].ramps.map((n) => S.RAMP[n]);
      const got = S.rampsFor(s, z);
      got.forEach((g, i) => { if (g !== want[i]) swapped.push(`${THEMES[z].name} ${S.STEPS[s].name}`); });
    }
  }
  console.log(`       swapped for their sky: ${[...new Set(swapped)].join(', ') || 'none'}`);
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
