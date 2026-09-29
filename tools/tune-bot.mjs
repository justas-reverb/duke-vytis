// Sweep the attract-mode bot's judgement parameters, in parallel, across every core.
//
// The bot's behaviour is governed by two dozen numbers -- how many seconds of clearance
// it needs before it will gamble, how much speed meter it holds out for, how much a
// candidate floor's LANDING SPEED is worth against its height. Tuning those by hand means
// changing one, running a benchmark and forming an opinion, which is how the first
// version ended up with a survival gate that fired on every run from the first second.
//
// Two phases, because they fail differently:
//
//   1. Coordinate descent. Cheap, interpretable, and it prints a readable trail of what
//      mattered. It also gets stuck in axis-aligned local optima, where no SINGLE change
//      helps but a pair of simultaneous ones would.
//   2. Evolutionary refinement. A population mutating several keys at once, which is what
//      escapes those. Slower per unit of insight, so it runs second, from the winner.
//
// Every candidate sees exactly the same towers, so a difference in score is a difference
// in the bot and never a difference in luck. The final answer is then validated against a
// seed family the search never touched -- a search this aggressive WILL overfit 80 towers
// if nobody checks.
//
// Run:  node tools/tune-bot.mjs [seeds] [minutes] [passes] [generations]

import { fork } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = Number(process.argv[2] || 80);
const MINUTES = Number(process.argv[3] || 2);
const PASSES = Number(process.argv[4] || 3);
const GENS = Number(process.argv[5] || 12);
const CORES = Math.max(1, Math.min(os.cpus().length, 32));

const trainSeeds = Array.from({ length: SEEDS }, (_, i) => (0x9e3779b9 * (i + 1)) >>> 0);
// A different multiplier and offset entirely: towers the search never sees.
const holdSeeds = Array.from({ length: 200 }, (_, i) => (0x85ebca6b * (i + 7) + 0xc2b2ae35) >>> 0);

/**
 * What a good demo run is worth, in one number.
 *
 * Climb rate leads because the ask is speed, but it is deliberately not alone: a bot that
 * maximises the mean by taking every gamble posts a great average and dies at floor nine
 * on a third of seeds. p10 and the dead-run penalty buy consistency, and for attract mode
 * consistency IS the feature -- every run is on show, not just the average one.
 *
 * The mechanic weights were cut hard after watching this go wrong. Air jumps had been
 * worth 3.0 each, which sounds harmless until the bot is landing 50 a minute: the term
 * was then worth 150 points against a climb rate of 768, so the search happily traded
 * away real speed and a lot of consistency to collect more of them (768/min at p10 754
 * became 779/min at p10 718, via 49.5 air jumps/min becoming 71.4). Those terms exist to
 * stop the bot climbing like a ladder, which was a live risk at 4.7 air jumps a minute
 * and is not one at fifty. They are a floor, not a target, so they are now weighted like
 * one and p10 is weighted equal to the mean.
 */
function scoreOf(r) {
  return r.perMin * 1.0
       + r.p10 * 1.0
       + r.fast * 1.5
       + r.bounces * 0.4
       + r.air * 0.4
       + r.combo * 0.15
       - r.stuck * 40
       - r.dead * 10;
}

// --- worker pool ------------------------------------------------------------
const idle = [];
const queue = [];
let nextId = 0;
const pending = new Map();

function dispatch() {
  while (idle.length && queue.length) {
    const w = idle.pop();
    const job = queue.shift();
    w.send({ id: job.id, tune: job.tune, seeds: job.seeds, minutes: MINUTES });
    w.busy = job.id;
  }
}

function evaluate(tune, seeds = trainSeeds) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    queue.push({ id, tune, seeds });
    dispatch();
  });
}

const workers = [];
await new Promise((ready) => {
  let up = 0;
  for (let i = 0; i < CORES; i++) {
    const w = fork(path.join(HERE, 'tune-worker.mjs'), { stdio: 'inherit' });
    w.on('message', (m) => {
      if (m.id === 'ready') { idle.push(w); if (++up === CORES) ready(); return; }
      const done = pending.get(m.id);
      pending.delete(m.id);
      w.busy = null;
      idle.push(w);
      dispatch();
      done(m);
    });
    workers.push(w);
  }
});
console.log(`  ${CORES} workers, ${SEEDS} towers x ${MINUTES} min per evaluation\n`);

// --- the search space -------------------------------------------------------
// [candidate values for coordinate descent, min, max, isInteger]
//
// The keys of TUNE since the planner was rebuilt to fly the real game (round five in
// autoplay.js, 2026-09-29). timeWeight and nextWeight trade climb against survival: measured
// over 24 towers at the harshest settings the menu offers, timeWeight 20 with nextWeight 0.35
// lost 23 of them and with nextWeight 1 none, so a sweep that scores only the defaults' climb
// (scoreOf, on test-botskill's audit) will pull timeWeight up and should be checked there.
const SPEC = {
  timeWeight:   [[10, 15, 20, 25, 30], 0, 45, false],
  nextWeight:   [[0.5, 0.7, 1, 1.5], 0, 3, false],
  nextFireCost: [[1, 2, 4], 0, 10, false],
  relHi:        [[1.0, 1.05, 1.1, 1.15], 0.5, 1.2, false],
  relLo:        [[0.2, 0.4, 0.6], 0, 1, false],
  fireMin:      [[5, 10, 20], 0, 40, false],
  ovWeight:     [[0.5, 1.5, 3], 0, 6, false],
  ovFull:       [[4, 8, 12], 1, 16, false],
  edgeOv:       [[3, 5, 8], 0, 16, false],
  edgeCost:     [[1, 3, 6], 0, 12, false],
  bounceWeight: [[0, 0.25, 0.5, 1], 0, 3, false],
  stick:        [[0.5, 1.5, 3], 0, 6, false],
  switchMargin: [[0.5, 1, 2], 0, 6, false],
  replanEvery:  [[6, 12, 24], 1, 60, true],
  flipCost:     [[0, 0.3, 0.6], 0, 2, false],
  twitchCost:   [[1, 3, 6], 0, 12, false],
  twitch:       [[0.1, 0.15, 0.2], 0.05, 0.4, false],
  hiddenCost:   [[0, 0.2, 0.5], 0, 2, false],
  minGain:      [[0, 1, 2], 0, 4, true],
  buildGain:    [[2, 4, 6], 0, 12, true],
  buildSlack:   [[1.5, 2.5, 4], 0.5, 8, false],
  waitSlack:    [[1, 1.5, 2.5], 0.3, 6, false],
  noPlanLimit:  [[0.3, 0.6, 1], 0.05, 2, false],
  stallLimit:   [[2.6, 3.72, 5], 1, 8, false],
  safeFor:      [[2, 4, 6], 1, 8, false],
  turnEarly:    [[10, 18, 26], 4, 40, false],
};
const KEYS = Object.keys(SPEC);

const { TUNE: DEFAULTS } = await import('../src/game/autoplay.js');
let best = { ...DEFAULTS };
let bestR = await evaluate(best);
let bestScore = scoreOf(bestR);
const show = (tag, r) => `${tag}  score ${scoreOf(r).toFixed(1)}  ${r.perMin.toFixed(0)}/min  ` +
  `p10 ${r.p10.toFixed(0)}  air ${r.air.toFixed(1)}  fast ${r.fast.toFixed(0)}%  dead ${r.dead}`;
console.log(show('  start ', bestR));

// --- phase 1: coordinate descent -------------------------------------------
for (let pass = 1; pass <= PASSES; pass++) {
  let improved = 0;
  for (const key of KEYS) {
    const [values] = SPEC[key];
    const cands = values.filter((v) => v !== best[key]);
    if (!cands.length) continue;
    const results = await Promise.all(cands.map((v) => evaluate({ ...best, [key]: v })));
    let pick = null;
    results.forEach((r, i) => {
      const sc = scoreOf(r);
      if (sc > bestScore + 0.5) { bestScore = sc; bestR = r; pick = cands[i]; }
    });
    if (pick !== null) {
      const was = best[key];
      best[key] = pick;
      improved++;
      console.log(show(`  p${pass} ${key.padEnd(12)} ${String(was).padStart(6)} -> ${String(pick).padStart(6)}`, bestR));
    }
  }
  console.log(`  --- pass ${pass}: ${improved} change(s) ---`);
  if (!improved) break;
}

// --- phase 2: evolutionary refinement --------------------------------------
const rnd = (a, b) => a + Math.random() * (b - a);
function mutate(base, strength) {
  const out = { ...base };
  const n = 1 + Math.floor(Math.random() * 4);           // change several keys at once
  for (let i = 0; i < n; i++) {
    const key = KEYS[Math.floor(Math.random() * KEYS.length)];
    const [, lo, hi, isInt] = SPEC[key];
    const span = (hi - lo) * strength;
    let v = out[key] + rnd(-span, span);
    v = Math.max(lo, Math.min(hi, v));
    out[key] = isInt ? Math.round(v) : Math.round(v * 1000) / 1000;
  }
  return out;
}

console.log(`\n  --- evolving, ${GENS} generations of ${CORES} ---`);
for (let g = 1; g <= GENS; g++) {
  const strength = 0.25 * (1 - (g - 1) / GENS) + 0.03;   // anneal
  const pop = Array.from({ length: CORES }, () => mutate(best, strength));
  const results = await Promise.all(pop.map((t) => evaluate(t)));
  let pick = -1;
  results.forEach((r, i) => {
    const sc = scoreOf(r);
    if (sc > bestScore + 0.5) { bestScore = sc; bestR = r; pick = i; }
  });
  if (pick >= 0) {
    best = pop[pick];
    console.log(show(`  gen ${String(g).padStart(2)}`, bestR));
  } else {
    console.log(`  gen ${String(g).padStart(2)}  --`);
  }
}

// --- validate on towers the search never saw --------------------------------
const holdBest = await evaluate(best, holdSeeds);
const holdBase = await evaluate(DEFAULTS, holdSeeds);
console.log('\n  HOLD-OUT (200 towers the search never saw)');
console.log(show('  before', holdBase));
console.log(show('  after ', holdBest));
console.log(`\n  train ${bestR.perMin.toFixed(0)}/min vs hold-out ${holdBest.perMin.toFixed(0)}/min` +
  `  (a large gap here means the search overfitted)`);

console.log('\n  Paste into TUNE in src/game/autoplay.js:');
for (const k of KEYS) console.log(`    ${k}: ${best[k]},`);

for (const w of workers) w.send({ cmd: 'stop' });
