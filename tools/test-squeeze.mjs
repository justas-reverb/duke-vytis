// The squeeze: past floor 2100 the ledges narrow to a trough and widen again, forever.
//
//   node tools/test-squeeze.mjs            the default: 6 seeds x 2 shafts x 2 towers to 7200
//   node tools/test-squeeze.mjs 12 9000    more seeds, higher
//
// Five claims, each of which could quietly stop being true while the tower still looked
// fine at a glance:
//
//   1. Nothing below 2100 moved. A hash of every platform on floors 1..2099, for fixed
//      seeds, in both shaft geometries and both kinds of tower. The squeeze is multiplied
//      in at the end of widthFor and draws nothing extra from the RNG, so for n < 2100
//      it is an identity -- and this is what proves that stays so. If you meant to change
//      the early tower, change it and then update EARLY_HASH on purpose, saying why.
//   2. It oscillates. Trough-phase ledges are clearly narrower than crest-phase ones, in
//      EVERY period from 2100 up, so it cannot have run once and stopped at 2300 where the
//      first cycle of zones ends.
//   3. It bottoms out where it says it does. Never under SQUEEZE_W_MIN (nor under the
//      PLAYER_W + 4 that reach.js calls a landing), and actually AT it near troughs --
//      a minimum nothing reaches is a number that is not doing anything.
//   4. The breathers survived. Checkpoints stay full width inside a squeeze.
//   5. Still a legal tower. Every transition reachable, nothing outside the shaft, no
//      clamp fallback -- all the way up, through three cycles of zones.
//   6. The flow tower never breathes. It is a hash again, of floors 1..4000 this time,
//      because a flow tower above 2100 must be exactly the tower it was before the squeeze
//      (see Tower.squeezes for why it is exempt). It was the attract demo's until 2026-09-29.
//
// Plus the banner: the real Game.step, driven to the cue floors, says each cue once --
// and a demo game, whose tower is a player's since 2026-09-29, says the same.

import crypto from 'node:crypto';
import { Tower, squeezeAt, squeezeFactor, squeezeCue } from '../src/game/generator.js';
import { isReachable } from '../src/game/reach.js';
import { bandFor, CYCLE_FLOORS } from '../src/game/themes.js';
import {
  PLAY_L, PLAY_R, PLAYER_W, FLOOR_H,
  SQUEEZE_FROM, SQUEEZE_PERIOD, SQUEEZE_DEPTH, SQUEEZE_W_MIN, SQUEEZE_CUE_LAG, PLAT_W_MIN,
} from '../src/game/constants.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = globalThis.window || { addEventListener() {} };

const SEEDS = Number(process.argv[2] || 6);
const TOP = Number(process.argv[3] || 7200);

let bad = 0;
const fail = (msg) => { bad++; console.log('  FAIL  ' + msg); };
const ok = (msg) => console.log('  ok    ' + msg);

// --- 1. floors 1..2099 are exactly what they were ----------------------------
//
// Recorded on the generator as it stood before the squeeze (commit 2c1b475), and
// re-checked after it went in: identical. 32 towers x 2099 floors, every x, w and kind.
// Re-recorded on purpose when the human tower's patterns changed (2026-09-28, generator.js
// SHAPES: six new shapes of climb, and a pattern never following itself). The flow towers
// in it did not change; 6 below holds them on their own.
const EARLY_SEEDS = [1, 12345, 0x2f6f1b21, 0x9e3779b9, 0x51ed270b, 0xdeadbeef, 7, 424242];
const EARLY_HASH = '57e731c97d20e32becf0a578390a61c6581318ba9c46731bfe3657b8acfd21bf';
{
  const h = crypto.createHash('sha256');
  for (const seed of EARLY_SEEDS) for (const open of [false, true]) for (const flow of [false, true]) {
    const t = new Tower(seed, flow);
    if (open) t.setBounds(PLAY_L, PLAY_R);
    t.ensure(SQUEEZE_FROM - 1);
    for (let n = 1; n < SQUEEZE_FROM; n++) {
      const p = t.floors.get(n);
      h.update(`${n}:${p.x}:${p.w}:${p.kind};`);
    }
  }
  const got = h.digest('hex');
  if (got !== EARLY_HASH) fail(`floors 1..${SQUEEZE_FROM - 1} changed: hash ${got.slice(0, 16)}..., want ${EARLY_HASH.slice(0, 16)}...`);
  else ok(`floors 1..${SQUEEZE_FROM - 1} unchanged across ${EARLY_SEEDS.length * 4} towers (hash ${got.slice(0, 12)})`);
}

// --- 6. flow towers are the pre-squeeze tower all the way up -----------------
//
// Recorded on the generator at 2c1b475, before the squeeze existed: 16 flow towers, the
// same seeds in both shaft geometries, floors 1..4000 -- past where any demo run got in
// its three-minute window while the demo climbed one. It has not since 2026-09-29 (the demo
// breathes on a player's tower); the replay fingerprint's probe still climbs one.
const FLOW_TOP = 4000;
const FLOW_HASH = 'bdba7b280551eff556ef6fb75abf09ab0c480941b7e2a0683f2d62f5fa0f8bb9';
{
  const h = crypto.createHash('sha256');
  let squeezing = 0;
  for (const seed of EARLY_SEEDS) for (const open of [false, true]) {
    const t = new Tower(seed, true);
    if (t.squeezes) squeezing++;
    if (open) t.setBounds(PLAY_L, PLAY_R);
    t.ensure(FLOW_TOP);
    for (let n = 1; n <= FLOW_TOP; n++) {
      const p = t.floors.get(n);
      h.update(`${n}:${p.x}:${p.w}:${p.kind};`);
    }
  }
  const got = h.digest('hex');
  if (squeezing) fail(`${squeezing} flow towers say they squeeze`);
  if (got !== FLOW_HASH) fail(`flow towers changed on floors 1..${FLOW_TOP}: hash ${got.slice(0, 16)}..., want ${FLOW_HASH.slice(0, 16)}...`);
  else ok(`flow towers unsqueezed: floors 1..${FLOW_TOP} identical to the pre-squeeze tower (hash ${got.slice(0, 12)})`);
  if (!new Tower(1, false).squeezes) fail('a human tower says it does not squeeze');
}

// The curve itself: an identity below the start, 1 at every crest, the full depth at
// every trough.
{
  let curveBad = 0;
  for (let n = 0; n < SQUEEZE_FROM; n++) if (squeezeAt(n) !== 0 || squeezeFactor(n) !== 1) curveBad++;
  for (let k = 0; k < 40; k++) {
    const crest = SQUEEZE_FROM + k * SQUEEZE_PERIOD;
    if (Math.abs(squeezeFactor(crest) - 1) > 1e-9) curveBad++;
    if (SQUEEZE_PERIOD % 2 === 0
        && Math.abs(squeezeFactor(crest + SQUEEZE_PERIOD / 2) - (1 - SQUEEZE_DEPTH)) > 1e-9) curveBad++;
  }
  if (curveBad) fail(`the squeeze curve is wrong at ${curveBad} points`);
  else ok(`curve: identity below ${SQUEEZE_FROM}, 1 at every crest, ${(1 - SQUEEZE_DEPTH).toFixed(2)} at every trough`);
}

// SQUEEZE_W_MIN is only safe while it stays on the right side of the landing rule.
if (SQUEEZE_W_MIN < PLAYER_W + 4) fail(`SQUEEZE_W_MIN ${SQUEEZE_W_MIN} is under reach.js's PLAYER_W + 4 = ${PLAYER_W + 4}`);
if (SQUEEZE_W_MIN > PLAT_W_MIN) fail(`SQUEEZE_W_MIN ${SQUEEZE_W_MIN} is wider than PLAT_W_MIN ${PLAT_W_MIN}; it would widen the trough`);

// --- 2-5. the tower from 2100 up ---------------------------------------------
const PERIODS = Math.floor((TOP - SQUEEZE_FROM) / SQUEEZE_PERIOD);
// Per period, open-shaft ordinary ledges only: that is the geometry a player who has
// climbed to 2100 is actually in, and 'wide' and 'checkpoint' ledges are sized by
// their own rules.
const crestSum = new Array(PERIODS).fill(0), crestN = new Array(PERIODS).fill(0);
const troughSum = new Array(PERIODS).fill(0), troughN = new Array(PERIODS).fill(0);
let narrowest = Infinity, narrowestAt = 0, atMin = 0, atMinFarFromTrough = 0, troughFloors = 0;
let wideTrough = 0, wideTroughN = 0, wideCrest = 0, wideCrestN = 0;
let unreachable = 0, outside = 0, violations = 0, checkpoints = 0, cpNarrow = 0, transitions = 0;

for (let s = 0; s < SEEDS; s++) {
  const seed = (s * 2654435761 + 0x5bd1e995) >>> 0;
  for (const open of [true, false]) for (const flow of [false, true]) {
    const t = new Tower(seed, flow);
    if (open) t.setBounds(PLAY_L, PLAY_R);
    t.ensure(TOP);
    violations += t.violations;
    for (let n = SQUEEZE_FROM; n <= TOP; n++) {
      const prev = t.floors.get(n - 1);
      const cur = t.floors.get(n);
      transitions++;
      if (!isReachable(prev, cur)) unreachable++;
      if (cur.x < PLAY_L || cur.x + cur.w > PLAY_R || cur.y !== n * FLOOR_H) outside++;
      if (cur.w < narrowest) { narrowest = cur.w; narrowestAt = n; }

      if (bandFor(n).into === 0) {
        checkpoints++;
        if (cur.kind !== 'checkpoint' || cur.w !== Math.min(260, Math.floor(t.span * 0.72))) cpNarrow++;
        continue;
      }
      const sq = squeezeAt(n);
      if (cur.w === SQUEEZE_W_MIN && sq < 0.8) atMinFarFromTrough++;
      if (!open || flow) continue;

      if (cur.kind === 'wide') {
        if (sq > 0.8) { wideTrough += cur.w; wideTroughN++; }
        if (sq < 0.2) { wideCrest += cur.w; wideCrestN++; }
        continue;
      }
      const k = Math.floor((n - SQUEEZE_FROM) / SQUEEZE_PERIOD);
      if (k >= PERIODS) continue;
      if (sq < 0.2) { crestSum[k] += cur.w; crestN[k]++; }
      if (sq > 0.8) {
        troughSum[k] += cur.w; troughN[k]++; troughFloors++;
        if (cur.w === SQUEEZE_W_MIN) atMin++;
      }
    }
  }
}

if (violations) fail(`clamp fallback fired ${violations} times`);
if (unreachable) fail(`${unreachable} unreachable transitions from ${SQUEEZE_FROM} to ${TOP}`);
if (outside) fail(`${outside} platforms outside the shaft or off their floor`);
if (!violations && !unreachable && !outside) {
  ok(`${transitions.toLocaleString()} transitions ${SQUEEZE_FROM}..${TOP}, every one reachable, none outside`);
}

if (narrowest < SQUEEZE_W_MIN || narrowest < PLAYER_W + 4) {
  fail(`a ${narrowest}-unit ledge at floor ${narrowestAt}, under the ${SQUEEZE_W_MIN} minimum`);
} else ok(`narrowest ledge ${narrowest} units (floor ${narrowestAt}); minimum ${SQUEEZE_W_MIN}, landing rule ${PLAYER_W + 4}`);

// "Reached near troughs": a real share of the open-shaft trough floors sit exactly on the
// minimum, and none of the floors that sit on it are anywhere near a crest. Measured:
// 30% of open-shaft trough-phase floors (squeezeAt over 0.8) are at 24.
const atMinPct = (atMin / Math.max(1, troughFloors)) * 100;
if (atMinPct < 15) fail(`only ${atMinPct.toFixed(1)}% of trough floors reach ${SQUEEZE_W_MIN}; the trough is not biting`);
else ok(`${atMinPct.toFixed(1)}% of open-shaft trough floors sit on the ${SQUEEZE_W_MIN}-unit minimum`);
if (atMinFarFromTrough) fail(`${atMinFarFromTrough} floors at the minimum well away from a trough`);

// Every period, not the average of them: a squeeze that ran once and stopped at 2300
// would pass an average and fail this.
let flat = 0, worstRatio = 0;
const ratios = [];
for (let k = 0; k < PERIODS; k++) {
  if (!crestN[k] || !troughN[k]) { flat++; continue; }
  const r = (troughSum[k] / troughN[k]) / (crestSum[k] / crestN[k]);
  ratios.push(r);
  if (r > worstRatio) worstRatio = r;
  if (r > 0.5) flat++;
}
const lastCrestFloor = SQUEEZE_FROM + (PERIODS - 1) * SQUEEZE_PERIOD;
if (flat) fail(`${flat} of ${PERIODS} periods do not squeeze (trough mean over half the crest mean)`);
else ok(`all ${PERIODS} periods squeeze, ${SQUEEZE_FROM}..${lastCrestFloor + SQUEEZE_PERIOD} ` +
  `(cycles ${Math.floor(SQUEEZE_FROM / CYCLE_FLOORS)}..${Math.floor(lastCrestFloor / CYCLE_FLOORS)}); ` +
  `trough/crest mean width ${Math.min(...ratios).toFixed(2)}..${worstRatio.toFixed(2)}`);
{
  const cm = crestSum.reduce((a, b) => a + b, 0) / crestN.reduce((a, b) => a + b, 0);
  const tm = troughSum.reduce((a, b) => a + b, 0) / troughN.reduce((a, b) => a + b, 0);
  console.log(`        open shaft, ordinary ledges: crest-phase mean ${cm.toFixed(1)}, trough-phase mean ${tm.toFixed(1)}`);
}

// Wide ledges shrink with the squeeze, so they relieve a trough without cancelling it.
if (wideTroughN && wideCrestN) {
  const wt = wideTrough / wideTroughN, wc = wideCrest / wideCrestN;
  if (wt > wc * 0.6) fail(`wide ledges in a trough average ${wt.toFixed(1)} against ${wc.toFixed(1)} at a crest; the trough is not tight`);
  else ok(`wide ledges: ${wt.toFixed(1)} in a trough, ${wc.toFixed(1)} at a crest`);
}

if (cpNarrow) fail(`${cpNarrow} of ${checkpoints} checkpoints above ${SQUEEZE_FROM} are not full width`);
else ok(`all ${checkpoints} checkpoints above ${SQUEEZE_FROM} are full width, squeeze or not`);

// --- the banner --------------------------------------------------------------
//
// The cue curve first, then the real Game.step driven through it. A closing cue must fall
// where the factor is falling and an opening one where it is rising, each exactly once.
{
  let cueBad = 0, last = -1, cues = 0;
  for (let n = 0; n <= TOP; n++) {
    const c = squeezeCue(n);
    if (c < last || c > last + 1) cueBad++;
    if (c === last + 1) {
      cues++;
      const falling = squeezeFactor(n + 1) < squeezeFactor(n);
      if ((c % 2 === 0) !== falling) cueBad++;
    }
    last = c;
  }
  if (squeezeCue(SQUEEZE_FROM - 1) !== -1 || squeezeCue(SQUEEZE_FROM) !== -1) cueBad++;
  if (cueBad) fail(`squeeze cues out of order or on the wrong slope (${cueBad})`);
  else ok(`${cues} cues to floor ${TOP}, alternating, each on the right slope`);

  const { Game, STATE } = await import('../src/game/game.js');
  const { SQUEEZE_CLOSING, SQUEEZE_OPENING } = await import('../src/game/flavour.js');
  const { AutoInput } = await import('../src/game/autoplay.js');
  const { STEP } = await import('../src/core/loop.js');
  // Pin the best floor at each value and take one real step. The run is not meant to be
  // survivable like this -- only the announcement is under test -- so it stops the
  // moment the game does.
  //
  // The floors are derived from the tunables, not written in: SQUEEZE_PERIOD and
  // SQUEEZE_CUE_LAG are knobs, and a test that fails because someone turned one is a
  // test that teaches people to stop reading it.
  const lag = Math.round(SQUEEZE_PERIOD * SQUEEZE_CUE_LAG);        // first closing cue
  const opens = Math.ceil(SQUEEZE_PERIOD / 2 + lag);               // first opening cue
  const F = SQUEEZE_FROM;
  const walk = [F - 1, F, F + lag - 1, F + lag, F + lag + 1, F + opens - 1, F + opens, F + opens + 1, F + 500];
  const say = (demo) => {
    const game = new Game(new AutoInput());
    game.demo = demo;
    game.newRun(0x2f6f1b21);
    game.state = STATE.PLAYING;
    const said = [];
    for (const f of walk) {
      game.run.maxFloor = f;
      game.banners.length = 0;
      game.step(STEP);
      if (game.state !== STATE.PLAYING) break;
      const hit = game.banners.filter((b) => SQUEEZE_CLOSING.includes(b.text) || SQUEEZE_OPENING.includes(b.text));
      said.push(hit.length ? (SQUEEZE_CLOSING.includes(hit[0].text) ? 'C' : 'O') + hit.length : '-');
    }
    return said.join(' ');
  };
  // 2099 -, 2100 -, 2114 -, 2115 close, 2116 -, 2189 -, 2190 open, 2191 -, 2600 one (newest)
  const want = ['-', '-', '-', 'C1', '-', '-', 'O1', '-', squeezeCue(F + 500) % 2 === 0 ? 'C1' : 'O1'].join(' ');
  const human = say(false);
  if (human !== want) fail(`banners said [${human}], want [${want}]`);
  else ok(`Game.step announces each cue once, and a jump over several says only the newest`);
  // The demo's tower is a player's since 2026-09-29, squeeze and all, so a demo game says what
  // a run says. It said nothing while it climbed a flow tower, which does not breathe (and
  // the title screen draws no HUD, so none of its banners is shown either way).
  const demo = say(true);
  if (demo !== want) fail(`a demo game did not announce the squeeze its tower makes: [${demo}], want [${want}]`);
  else ok(`a demo game announces the squeeze as a run does: its tower breathes`);
}

console.log(`\n  ${bad} problems`);
console.log(bad === 0
  ? `  RESULT: PASS - the tower breathes from ${SQUEEZE_FROM} and nothing below it moved.`
  : `  RESULT: FAIL - ${bad} problems.`);
process.exit(bad ? 1 : 0);
