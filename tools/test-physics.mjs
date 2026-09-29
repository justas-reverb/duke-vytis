// Physics invariants.
//
// Two of these exist specifically because the local model's code review flagged the
// speed-cap clamp as a defect. Its reading was that `Math.max(cap, vx - FRICTION*dt)`
// leaves vx above the cap. It does -- for a few milliseconds, on purpose, because the
// cap MOVES when momentum decays and snapping to it would visibly stutter the player.
// These tests pin the behaviour that was actually intended: vx must converge to the
// cap quickly and must never exceed it in steady state.

import { Player, wallComboBoost, wallBounceOut } from '../src/game/player.js';
import { Tower } from '../src/game/generator.js';
import {
  VX_MAX_COLD, VX_MAX_HOT, JUMP_V0_MIN, JUMP_V0_MAX, JUMP_MOMENTUM_BONUS,
  GRAVITY, FLOOR_H, CX, WALL_BOUNCE_MIN, WALL_VX_MAX, WALL_LIFT_CAP, WALL_COMBO_FULL,
  WALL_RESTITUTION, WALL_RESTITUTION_GROUND, WALL_BOUNCE_LIFT, MOM_UP, OVERDRIVE_DECAY,
} from '../src/game/constants.js';
import { STEP } from '../src/core/loop.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = globalThis.window || { addEventListener() {} };

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond ? '' : '   ' + detail));
};

const fakeInput = (axis = 0, jump = false, held = true) => ({
  axis,
  jumpHeld: held,
  consumeJump() { if (jump) { jump = false; return true; } return false; },
});

const tower = new Tower(12345);
tower.ensure(200);

// --- speed cap --------------------------------------------------------------
{
  // A player builds speed by running the full width and turning at the walls -- the
  // play area is 448 px and top speed is 330 px/s, so nobody can hold one direction
  // for the ~3 s the momentum meter needs. Holding right just pins you to the wall.
  // Use the player's OWN shaft, which now starts narrow. Reversing at the absolute
  // maximum bounds just pins the runner against a wall it can never reach.
  const p = new Player();
  let dir = 1;
  let peak = 0, peakMom = 0, tFull = -1;
  const input = { axis: 1, jumpHeld: false, consumeJump: () => false };
  for (let i = 0; i < 240 * 20; i++) {
    if (p.x > p.hi - 24) dir = -1;
    if (p.x < p.lo + 24) dir = 1;
    input.axis = dir;
    p.step(STEP, input, tower);
    peak = Math.max(peak, Math.abs(p.vx));
    peakMom = Math.max(peakMom, p.momentum);
    if (tFull < 0 && p.momentum > 0.99) tFull = i / 240;
  }
  ok('the NARROW starting shaft still builds full momentum',
    peakMom > 0.99, 'peak=' + peakMom.toFixed(3));
  ok('  within 10 seconds', tFull >= 0 && tFull < 10, tFull.toFixed(2) + 's');
  ok('vx never exceeds the hot cap', peak <= VX_MAX_HOT + 0.5,
    'peak=' + peak.toFixed(2) + ' cap=' + VX_MAX_HOT);
  ok('vx actually reaches the cap', peak > VX_MAX_HOT - 3, 'peak=' + peak.toFixed(2));

  // A wall turnaround must not wipe the meter -- that is the whole flow of the game.
  const q = new Player();
  q.vx = VX_MAX_HOT; q.momentum = 1; q.x = q.hi - 9; q.grounded = true;
  const away = { axis: -1, jumpHeld: true, consumeJump: () => false };
  for (let i = 0; i < 240 * 0.5; i++) q.step(STEP, away, tower);
  ok('a wall turnaround keeps most momentum', q.momentum > 0.8, 'momentum=' + q.momentum.toFixed(3));

  // The claim under test: does an over-cap vx converge, or does it stick?
  //
  // Measured with momentum PINNED at zero. Left free it would not converge to the cold
  // cap at all, and correctly so: travelling at 660 px/s is running by any definition,
  // so the meter fills and drags the cap up to meet the speed. That is the mechanic
  // working, not the clamp failing. Pinning momentum isolates the clamp itself, which
  // is what the review actually called a defect.
  const c = new Player();
  c.setBounds(0, 480);
  c.x = 240;
  c.vx = VX_MAX_HOT * 2;
  let steps = 0;
  const idle = fakeInput(0, false);
  while (Math.abs(c.vx) > VX_MAX_COLD + 0.5 && steps < 240 * 5) {
    c.momentum = 0;
    c.step(STEP, idle, tower);
    steps++;
  }
  ok('over-cap vx converges to the cap', Math.abs(c.vx) <= VX_MAX_COLD + 0.5,
    'vx=' + c.vx.toFixed(2) + ' after ' + steps + ' steps');
  // 510 px/s of excess at FRICTION 1100 is 0.46 s by construction. The old 400 ms
  // threshold was a guess, not a requirement.
  ok('  and does so within 500 ms', steps < 240 * 0.5, steps + ' steps (' + (steps / 240).toFixed(3) + 's)');

  // And with momentum free, it converges to the cap momentum has earned -- never above.
  const f = new Player();
  f.setBounds(0, 480);
  f.x = 240;
  f.vx = VX_MAX_HOT * 2;
  for (let i = 0; i < 240 * 3; i++) f.step(STEP, idle, tower);
  ok('with momentum free, vx never exceeds its own cap',
    Math.abs(f.vx) <= f.vxMax + 0.5, 'vx=' + f.vx.toFixed(1) + ' cap=' + f.vxMax.toFixed(1));
}

// --- jump height scales with speed ------------------------------------------
{
  const apex = (v0) => (v0 * v0) / (2 * GRAVITY);
  const cold = new Player();
  ok('standing jump clears at least 2 floors', apex(cold.jumpImpulse()) >= FLOOR_H * 2,
    apex(cold.jumpImpulse()).toFixed(1) + 'px');

  const hot = new Player();
  hot.vx = VX_MAX_HOT;
  hot.momentum = 1;
  const h = apex(hot.jumpImpulse());
  ok('full-speed jump clears at least 7 floors', h >= FLOOR_H * 7, h.toFixed(1) + 'px');
  ok('full-speed jump is not absurd (<12 floors)', h < FLOOR_H * 12, h.toFixed(1) + 'px');
  ok('jump impulse is monotonic in speed', (() => {
    let prev = -1;
    for (let v = 0; v <= VX_MAX_HOT; v += 5) {
      const q = new Player(); q.vx = v;
      const j = q.jumpImpulse();
      if (j < prev) return false;
      prev = j;
    }
    return true;
  })());
  ok('impulse stays inside declared bounds', (() => {
    const q = new Player(); q.vx = VX_MAX_HOT; q.momentum = 1;
    // Against the constant, not a hard-coded number -- the momentum bonus has been
    // retuned twice and the literal went stale both times.
    return q.jumpImpulse() >= JUMP_V0_MIN
        && q.jumpImpulse() <= JUMP_V0_MAX + JUMP_MOMENTUM_BONUS + 0.5;
  })());
}

// --- walls ------------------------------------------------------------------
{
  const p = new Player();
  p.y = 300;
  p.grounded = false;
  p.vx = -260;
  p.x = p.lo + 2;
  const before = Math.abs(p.vx);
  p.step(STEP, fakeInput(0, false), tower);
  ok('airborne wall hit reverses direction', p.vx > 0, 'vx=' + p.vx.toFixed(1));
  ok('  and retains most of its speed', Math.abs(p.vx) > before * 0.85,
    Math.abs(p.vx).toFixed(1) + ' of ' + before);
  ok('  and emits a wallbounce event', p.events.some((e) => e.type === 'wallbounce'));
  ok('  and stays inside the shaft', p.x >= p.lo && p.x <= p.hi, 'x=' + p.x.toFixed(1));
}

// --- the combo drives the walls ---------------------------------------------
//
// Deep in a combo a bounce returns MORE speed than it took and kicks harder upward.
// What has to hold: with no combo it is the old bounce exactly, not approximately;
// more combo never bounces less; both caps hold; the extra speed lasts long enough to
// be used and not forever; and the grounded kick-off does not care.
{
  const nothing = { get: () => null, peek: () => null };   // a shaft with no floors

  // No combo is the old bounce, to the bit. Checked against the constants rather than
  // literals, per the note on the impulse bounds above.
  let exact = true;
  let why = '';
  for (let s = WALL_BOUNCE_MIN; s <= VX_MAX_HOT * 2; s += 7.3) {
    for (let vy = -1400; vy <= 1100; vy += 97.1) {
      const r = wallBounceOut(s, vy, 0, VX_MAX_HOT);
      if (r.speed !== s * WALL_RESTITUTION || r.vy !== vy + WALL_BOUNCE_LIFT || r.overdrive !== 0) {
        exact = false;
        why = `s=${s} vy=${vy} -> ${r.speed}, ${r.vy}, od ${r.overdrive}`;
      }
    }
  }
  ok('no combo: the bounce is the old restitution and lift exactly', exact, why);

  // ...and through the Player, which is where a stray term would actually hide.
  const p0 = new Player();
  p0.grounded = false; p0.vx = -300; p0.vy = 123.5;
  p0.bounceOffWall(1);
  ok('  through Player.bounceOffWall too',
    p0.vx === 300 * WALL_RESTITUTION && p0.vy === 123.5 + WALL_BOUNCE_LIFT && p0.overdrive === 0,
    `vx=${p0.vx} vy=${p0.vy} od=${p0.overdrive}`);

  // A whole no-combo run of airborne wall bounces never grows an allowance, so the cap
  // it runs against is the old cap throughout.
  const n0 = new Player();
  n0.momentum = 1;
  let od0 = 0;
  let peak0 = 0;
  let bounces0 = 0;
  const hop = { axis: 1, jumpHeld: true, consumeJump: () => false };
  for (let i = 0; i < 240 * 20; i++) {
    if (n0.x > n0.hi - 12) hop.axis = -1;
    if (n0.x < n0.lo + 12) hop.axis = 1;
    n0.step(STEP, hop, tower);
    od0 = Math.max(od0, n0.overdrive);
    peak0 = Math.max(peak0, Math.abs(n0.vx));
    bounces0 += n0.drainEvents().filter((e) => e.type === 'wallbounce').length;
  }
  ok('  and 20 s of it never lifts the cap', od0 === 0 && peak0 <= VX_MAX_HOT + 0.5 && bounces0 > 10,
    `overdrive=${od0} peak=${peak0.toFixed(1)} bounces=${bounces0}`);

  // Monotonic in the combo, over a spread of arrival speeds and vertical states.
  let mono = true;
  let where = '';
  for (const s of [WALL_BOUNCE_MIN, 200, 330, VX_MAX_HOT, 500]) {
    for (const vy of [-900, -200, 0, 300, 700, 880]) {
      let prev = null;
      for (let f = 0; f <= WALL_COMBO_FULL * 2; f++) {
        const b = wallComboBoost(f);
        const r = wallBounceOut(s, vy, b, VX_MAX_HOT);
        if (prev && (b < prev.b || r.speed < prev.speed || r.vy < prev.vy)) {
          mono = false;
          where = `s=${s} vy=${vy} floors=${f}`;
        }
        prev = { b, speed: r.speed, vy: r.vy };
      }
    }
  }
  ok('more combo never bounces less, sideways or up', mono, where);
  ok('  no combo is no boost, and WALL_COMBO_FULL floors is all of it',
    wallComboBoost(0) === 0 && wallComboBoost(-5) === 0 && wallComboBoost(NaN) === 0
      && wallComboBoost(WALL_COMBO_FULL) === 1 && wallComboBoost(WALL_COMBO_FULL * 3) === 1);
  const full = wallBounceOut(VX_MAX_HOT, 300, 1, VX_MAX_HOT);
  ok('  a full-combo bounce GAINS speed and kicks harder',
    full.speed > VX_MAX_HOT * 1.1 && full.vy >= 300 + WALL_BOUNCE_LIFT + 200,
    `out=${full.speed.toFixed(1)} vy=${full.vy.toFixed(1)}`);
  // A TAP is not a bounce. The combo lift used to be paid in full on any contact over
  // WALL_BOUNCE_MIN, so at full boost flicking the stick into the wall at 80 units/s
  // bought 345 of lift per tap and turned the wall into a brake that held a fall.
  const tap = wallBounceOut(WALL_BOUNCE_MIN, -300, 1, VX_MAX_HOT);
  const tapLift = tap.vy - (-300 + WALL_BOUNCE_LIFT);
  const hitLift = full.vy - (300 + WALL_BOUNCE_LIFT);
  ok('  a slow tap earns a fraction of the combo lift, a flat-out hit all of it',
    tapLift <= hitLift * (WALL_BOUNCE_MIN / VX_MAX_HOT) + 1e-9 && tapLift > 0,
    `tap +${tapLift.toFixed(1)} against +${hitLift.toFixed(1)}`);

  // The caps bind the COMBO part, so the rule is: never above the cap, unless the plain
  // bounce alone was already above it -- and never below the plain bounce.
  let capsHold = true;
  let neverWorse = true;
  let capWhy = '';
  for (let b = 0; b <= 1.0001; b += 0.05) {
    for (let s = WALL_BOUNCE_MIN; s <= WALL_VX_MAX + 60; s += 9.7) {
      for (let vy = -1400; vy <= 1100; vy += 61.3) {
        const r = wallBounceOut(s, vy, b, VX_MAX_HOT);
        if (r.speed > Math.max(s * WALL_RESTITUTION, WALL_VX_MAX) + 1e-9
            || r.vy > Math.max(vy + WALL_BOUNCE_LIFT, WALL_LIFT_CAP) + 1e-9) {
          capsHold = false;
          capWhy = `b=${b.toFixed(2)} s=${s} vy=${vy} -> ${r.speed.toFixed(1)}, ${r.vy.toFixed(1)}`;
        }
        if (r.speed < s * WALL_RESTITUTION || r.vy < vy + WALL_BOUNCE_LIFT) neverWorse = false;
      }
    }
  }
  ok('the caps hold: WALL_VX_MAX sideways, WALL_LIFT_CAP upward', capsHold, capWhy);
  ok('  and a combo bounce is never worse than a plain one', neverWorse);
  ok('  and the lift cap is the best plain jump, so a bounce cannot out-jump one',
    WALL_LIFT_CAP <= JUMP_V0_MAX);

  // In play: a full-combo player hopping across the NARROW starting shaft, where the
  // walls come round fastest and the speed has the least time to bleed between them.
  const hot = new Player();
  hot.momentum = 1;
  hot.comboBoost = 1;
  let peakHot = 0;
  let liftOver = 0;
  let lifted = 0;
  let hotBounces = 0;
  const run = { axis: 1, jumpHeld: true, consumeJump: () => false };
  for (let i = 0; i < 240 * 20; i++) {
    if (hot.x > hot.hi - 12) run.axis = -1;
    if (hot.x < hot.lo + 12) run.axis = 1;
    hot.step(STEP, run, tower);
    peakHot = Math.max(peakHot, Math.abs(hot.vx));
    for (const e of hot.drainEvents()) {
      if (e.type !== 'wallbounce') continue;
      hotBounces++;
      if (e.vyOut > Math.max(e.vyIn + WALL_BOUNCE_LIFT, WALL_LIFT_CAP) + 1e-6) liftOver++;
      if (e.vyOut > e.vyIn + WALL_BOUNCE_LIFT + 100) lifted++;
    }
  }
  ok('a full-combo player never passes WALL_VX_MAX', peakHot <= WALL_VX_MAX + 0.5,
    `peak=${peakHot.toFixed(1)} cap=${WALL_VX_MAX.toFixed(1)}`);
  ok('  and does go well past the old top speed', peakHot > VX_MAX_HOT + 60, 'peak=' + peakHot.toFixed(1));
  ok('  and no bounce lifts past the cap, out of many that lift hard',
    liftOver === 0 && hotBounces > 10 && lifted > hotBounces / 2,
    `${liftOver} over, ${lifted} of ${hotBounces} bounces lifted by 100+ beyond the plain kick`);

  // The overspeed has to SURVIVE. Player.step bleeds anything above the cap at
  // FRICTION, which would take this excess in about 60 ms; the overdrive allowance is
  // what makes it last. One bounce into an open shaft, then neutral stick, no floors.
  const fly = (boost, vx0) => {
    const q = new Player();
    q.setBounds(0, 4000);
    q.x = 12; q.y = 5000; q.grounded = false;
    q.momentum = 1; q.comboBoost = boost; q.vx = vx0;
    const idle = { axis: 0, jumpHeld: true, consumeJump: () => false };
    let bounced = -1, lastAbove = -1, backAt = -1;
    for (let i = 0; i < 240 * 3; i++) {
      q.step(STEP, idle, nothing);
      if (bounced < 0 && q.vx > 0) bounced = i;
      if (bounced < 0) continue;
      if (q.vx > VX_MAX_HOT + 20) lastAbove = i;
      if (backAt < 0 && q.vx <= VX_MAX_HOT + 0.5) backAt = i;
    }
    return {
      above: lastAbove < 0 ? 0 : (lastAbove - bounced + 1) * STEP,
      back: backAt < 0 ? Infinity : (backAt - bounced) * STEP,
    };
  };
  const kept = fly(1, -VX_MAX_HOT);
  ok('combo overspeed lasts in the air: 20+ over the old top speed for 0.4 s or more',
    kept.above >= 0.4, kept.above.toFixed(3) + 's');
  ok('  but not forever: back at the normal cap within 1.5 s', kept.back < 1.5, kept.back.toFixed(3) + 's');
  // The same excess with no allowance behind it, for contrast -- this is the bleed the
  // allowance exists to hold off.
  const bare = new Player();
  bare.setBounds(0, 4000);
  bare.x = 2000; bare.y = 5000; bare.grounded = false; bare.momentum = 1;
  bare.vx = VX_MAX_HOT * 1.2;
  let bareSteps = 0;
  while (bare.vx > VX_MAX_HOT + 20 && bareSteps < 240) {
    bare.step(STEP, { axis: 0, jumpHeld: true, consumeJump: () => false }, nothing);
    bareSteps++;
  }
  ok('  where the same excess with no allowance is gone in under 0.1 s',
    bareSteps * STEP < 0.1, (bareSteps * STEP).toFixed(3) + 's');

  // ...and on the ground too. The allowance lifts the grounded cap so a landing does not
  // erase it before the instajump, which means ground acceleration can USE it -- so it
  // has to run out there on the same clock, not be held open by running flat out.
  // One full-combo bounce, a landing on an endless floor, then run away from the wall.
  {
    const floor0 = { get: (n) => (n === 0 ? { x: -1e5, w: 2e5, y: 0 } : null), peek: () => null };
    const q = new Player();
    q.setBounds(0, 6000);
    q.x = 9; q.y = 30; q.vy = -10; q.grounded = false;
    q.momentum = 1; q.comboBoost = 1; q.vx = -VX_MAX_HOT;
    const run = { axis: 1, jumpHeld: false, consumeJump: () => false };
    let bounceAt = -1, landed = false, backAt = -1, peak = 0;
    for (let i = 0; i < 240 * 4; i++) {
      q.step(STEP, run, floor0);
      if (bounceAt < 0 && q.drainEvents().some((e) => e.type === 'wallbounce')) bounceAt = i;
      if (q.grounded) landed = true;
      peak = Math.max(peak, Math.abs(q.vx));
      if (landed && backAt < 0 && q.overdrive === 0 && Math.abs(q.vx) <= q.vxMax + 1e-9) backAt = i;
    }
    const limit = (WALL_VX_MAX - VX_MAX_HOT) / OVERDRIVE_DECAY + 0.1;
    const took = (backAt - bounceAt) * STEP;
    ok('  and running on after landing does not keep it: back at the cap within its decay time',
      bounceAt >= 0 && landed && peak > VX_MAX_HOT + 40 && backAt > 0 && took <= limit,
      `back ${took.toFixed(3)} s after the bounce (limit ${limit.toFixed(2)} s), peak ${peak.toFixed(1)}`);
  }

  // Overdrive is speed, not meter. The meter charges by how close to flat out you are
  // running, and a combo bounce puts |vx| well past the earned cap -- 559 against 190
  // on an empty meter -- so unless that fraction stops at 1 the combo also buys the
  // meter, up to twice as fast. Full combo, empty meter, ping-ponging the narrow shaft.
  {
    const q = new Player();
    q.grounded = false; q.y = 1e6; q.momentum = 0; q.comboBoost = 1; q.vx = VX_MAX_COLD;
    const push = { axis: 1, jumpHeld: false, consumeJump: () => false };
    let maxRate = 0, over = 0;
    for (let i = 0; i < 240 * 4; i++) {
      push.axis = q.vx >= 0 ? 1 : -1;
      const m0 = q.momentum;
      q.step(STEP, push, nothing);
      q.drainEvents();
      maxRate = Math.max(maxRate, (q.momentum - m0) / STEP);
      if (Math.abs(q.vx) > q.vxMax + 20) over++;
    }
    ok('overdrive never charges the meter faster than flat out does',
      over > 100 && maxRate <= MOM_UP * (1 + 1e-9),
      `max ${maxRate.toFixed(3)}/s against MOM_UP ${MOM_UP}, ${over} steps over the earned cap`);
  }

  // The grounded kick-off is not a bounce and the combo does not touch it.
  const g = new Player();
  g.grounded = true; g.comboBoost = 1; g.vx = -300; g.vy = 0;
  g.bounceOffWall(1);
  ok('a grounded kick-off ignores the combo',
    g.vx === 300 * WALL_RESTITUTION_GROUND && g.vy === 0 && g.overdrive === 0
      && g.events.some((e) => e.type === 'wallkick'),
    `vx=${g.vx} vy=${g.vy} od=${g.overdrive}`);

  // And the game feeds the LIVE combo in, every step.
  const { Game } = await import('../src/game/game.js');
  const { AutoInput } = await import('../src/game/autoplay.js');
  const game = new Game(new AutoInput());
  game.newRun(12345);
  game.step(STEP);
  ok('the game feeds no boost without a combo', game.wallBoost === 0 && game.player.comboBoost === 0,
    `wallBoost=${game.wallBoost} player=${game.player.comboBoost}`);
  game.combo.active = true;
  game.combo.floors = 150;
  game.step(STEP);
  ok('  and the live combo\'s boost with one', game.player.comboBoost === wallComboBoost(150)
    && game.player.comboBoost > 0.5, 'player=' + game.player.comboBoost);
}

// --- the model's third finding: grounded wall contact ------------------------
{
  const p = new Player();
  p.y = 0;
  p.grounded = true;
  p.vx = -300;
  p.x = p.lo + 1;
  // jumpHeld MUST be false here. The default fake input holds jump, which since the
  // instajump change makes the player bunny-hop off the ground on frame one -- so this
  // was measuring an airborne wall bounce, not the grounded contact it claims to.
  const grounded = { axis: 0, jumpHeld: false, consumeJump: () => false };
  const xs = [];
  for (let i = 0; i < 240; i++) { p.step(STEP, grounded, tower); xs.push(p.x); }
  ok('grounded wall contact does not oscillate', (() => {
    // "Physics instability" would mean the position never settles. Check the last
    // half-second is monotone-ish and bounded, not ping-ponging.
    const tail = xs.slice(-60);
    return Math.max(...tail) - Math.min(...tail) < 40;
  })(), 'spread=' + (Math.max(...xs.slice(-60)) - Math.min(...xs.slice(-60))).toFixed(1));
  ok('  and never escapes the wall', xs.every((x) => x >= p.lo));
}

// --- air jumps --------------------------------------------------------------
{
  // Air jumps unlock only with the meter pinned at takeoff.
  const cold = new Player();
  cold.momentum = 0;
  let cj = 0;
  const coldIn = { axis: 0, jumpHeld: false,
    consumeJump() { if (cj < 4) { cj++; return true; } return false; } };
  for (let i = 0; i < 40; i++) cold.step(STEP, coldIn, tower);
  ok('no air jumps without a full meter',
    cold.events.filter((e) => e.type === 'airjump').length === 0);

  const p = new Player();
  p.momentum = 1;
  let jumps = 0;
  const input = { axis: 0, jumpHeld: false,
    consumeJump() { if (jumps < 4) { jumps++; return true; } return false; } };
  for (let i = 0; i < 40; i++) p.step(STEP, input, tower);
  const airs = p.events.filter((e) => e.type === 'airjump');
  ok('a full meter grants ONE air jump', airs.length === 1, 'got ' + airs.length);
  ok('  and it is consumed', p.airJumps === 0, 'airJumps=' + p.airJumps);

  // The third jump exists only inside a combo long enough to have earned it.
  const t3 = new Player();
  t3.momentum = 1;
  t3.tripleUnlocked = true;
  let tj = 0;
  const tin = { axis: 0, jumpHeld: false,
    consumeJump() { if (tj < 5) { tj++; return true; } return false; } };
  for (let i = 0; i < 40; i++) t3.step(STEP, tin, tower);
  const tAirs = t3.events.filter((e) => e.type === 'airjump');
  ok('a 250-floor combo grants two', tAirs.length === 2, 'got ' + tAirs.length);
  ok('  numbered 1 then 2', tAirs[0] && tAirs[0].air === 1 && tAirs[1] && tAirs[1].air === 2);
}

// --- instajump --------------------------------------------------------------
{
  // Holding jump must re-fire on landing, and the chain must actually count.
  const p = new Player();
  const held = { axis: 1, jumpHeld: true, consumeJump: () => false };
  let jumpEvents = 0, insta = 0, maxChain = 0;
  for (let i = 0; i < 240 * 6; i++) {
    p.step(STEP, held, tower);
    for (const e of p.drainEvents()) {
      if (e.type === 'jump') { jumpEvents++; if (e.insta) insta++; maxChain = Math.max(maxChain, e.chain); }
    }
  }
  ok('holding jump re-fires on landing', jumpEvents > 4, jumpEvents + ' jumps in 6s');
  ok('  they are flagged as instajumps', insta === jumpEvents, insta + '/' + jumpEvents);
  // This case holds RIGHT throughout, which pins the player against a wall and bounces
  // it on one platform -- see the speed-cap test above for why. It used to assert that
  // a chain builds here, which was asserting the bug: the counter climbed past x10
  // while the player went nowhere. A held chain now requires a floor gained.
  ok('  but not while bouncing on the spot', maxChain <= 3, 'chain=' + maxChain);

  const tapper = new Player();
  const tap = { axis: 1, jumpHeld: false, consumeJump: () => false };
  let tapJumps = 0;
  for (let i = 0; i < 240 * 6; i++) {
    tapper.step(STEP, tap, tower);
    tapJumps += tapper.drainEvents().filter((e) => e.type === 'jump').length;
  }
  ok('not holding jump does nothing', tapJumps === 0, tapJumps + ' jumps');
}

// --- no tunnelling at terminal velocity -------------------------------------
{
  const p = new Player();
  p.y = 100 * FLOOR_H;
  p.x = CX;
  p.grounded = false;
  p.vy = -2000;              // far past terminal, deliberately
  let landed = false;
  for (let i = 0; i < 240 * 30 && !landed; i++) {
    p.step(STEP, fakeInput(0, false), tower);
    if (p.grounded) landed = true;
  }
  ok('a falling player always hits something', landed, 'y=' + p.y.toFixed(1));
  ok('  and lands exactly on a floor line', landed && Math.abs(p.y % FLOOR_H) < 0.001,
    'y=' + p.y.toFixed(4));
}

// --- the held chain must END ------------------------------------------------
//
// Two ways it used to fail to. It reset only inside the jump branch, on a jump taken
// without the key held, so releasing the key and walking away left the old count
// standing forever. And it counted landings that went nowhere, so holding jump while
// pinned against a wall farmed CHAIN x10 on a single platform.
{
  // A staircase where every floor is a full-width ledge, so a held-jump player really
  // climbs: on the way up it passes through the platforms above it, and coming down it
  // lands on the first one it crosses -- the apex floor, not the one it left.
  const stairs = {
    get: (n) => (n >= 0 ? { n, x: CX - 200, w: 400, y: n * FLOOR_H } : null),
  };
  stairs.peek = stairs.get;

  const held = { axis: 0, jumpHeld: true, consumeJump: () => false };
  const idle = { axis: 0, jumpHeld: false, consumeJump: () => false };

  const p = new Player();
  for (let i = 0; i < 240 * 4; i++) p.step(STEP, held, stairs);
  ok('a held chain builds while climbing', p.instaChain > 2,
    'chain=' + p.instaChain + ' floor=' + p.floor);

  // Let go and do nothing else. No further jump is ever taken, which is exactly the
  // case the old code could not see.
  for (let i = 0; i < 240 * 3; i++) p.step(STEP, idle, stairs);
  ok('  and ends when the key is released', p.instaChain === 0, 'chain=' + p.instaChain);

  // Rebuild, then drop onto a lower floor while still holding.
  const q = new Player();
  for (let i = 0; i < 240 * 4; i++) q.step(STEP, held, stairs);
  ok('  rebuilds', q.instaChain > 2, 'chain=' + q.instaChain);
  q.floor = 40;                     // pretend we launched from far above
  q.y = 40 * FLOOR_H;
  q.vy = -400;
  q.grounded = false;
  // Sample the instant the feet touch down: holding through a fall re-fires the
  // instajump immediately and starts a NEW chain, so checking later measures that one.
  let chainOnLanding = -1;
  for (let i = 0; i < 240 * 3 && chainOnLanding < 0; i++) {
    q.step(STEP, held, stairs);
    if (q.grounded) chainOnLanding = q.instaChain;
  }
  ok('  and ends on a fall, even holding', chainOnLanding === 0, 'chain=' + chainOnLanding);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
