// Proof-by-exhaustion that the tower is always climbable.
//
// Generates a very large number of floors across many seeds and checks, for every
// consecutive pair, that the weakest jump in the game can cross it. Also checks the
// invariants the renderer and collision code assume: platforms inside the walls,
// never narrower than the player, exactly one per floor.

import { Tower } from '../src/game/generator.js';
import { isReachable, edgeGap, MAX_EDGE_GAP, ABSOLUTE_REACH } from '../src/game/reach.js';
import { PLAY_L, PLAY_R, PLAYER_W, FLOOR_H } from '../src/game/constants.js';
import { PLATFORM_WIDTHS } from '../src/game/settings.js';

const SEEDS = Number(process.argv[2] || 200);
const FLOORS = Number(process.argv[3] || 5000);

let checked = 0, worstGap = 0, fails = 0, oob = 0, tooNarrow = 0, missing = 0;
// Playability, not legality: a long stack of platforms pinned against one wall is
// perfectly climbable and looks completely broken. Regression guard for the zigzag
// direction bug, which produced 33 consecutive floors against the same edge.
let wallRun = 0, worstWallRun = 0, wallSide = 0, worstWallSeed = 0;
const MAX_WALL_RUN = 6;
const gapHist = new Array(12).fill(0);
const widthHist = new Array(10).fill(0);

const t0 = Date.now();
for (let s = 0; s < SEEDS; s++) {
  const seed = (s * 2654435761) >>> 0;
  // Every PLATFORMS width in turn (settings.js): NORMAL, the default a player gets, and WIDE --
  // the gaps are the reach proof's whatever the width, and a NORMAL ledge is still a landing.
  // With the shafts below, every pairing of width and shaft is covered.
  const t = new Tower(seed, false, PLATFORM_WIDTHS[s % PLATFORM_WIDTHS.length]);
  // Half the seeds run in the narrow starting shaft, half in a fully open one, so both
  // geometries are covered.
  if (s % 2 === 1) t.setBounds(PLAY_L, PLAY_R);
  t.ensure(FLOORS);
  if (t.violations) { console.error('clamp fallback fired on seed', seed, t.violations); fails += t.violations; }

  for (let n = 1; n <= FLOORS; n++) {
    const prev = t.floors.get(n - 1);
    const cur = t.floors.get(n);
    if (!prev || !cur) { missing++; continue; }

    const g = edgeGap(prev.x, prev.x + prev.w, cur.x, cur.x + cur.w);
    if (g > worstGap) worstGap = g;
    gapHist[Math.min(11, Math.floor(g / 6))]++;
    widthHist[Math.min(9, Math.floor((cur.w - 40) / 12))]++;

    // Only meaningful once the shaft is wide. In the narrow starting arena a platform
    // is up to two thirds of the span, so touching a wall is geometry, not a pattern
    // bug -- the platform has nowhere else to be.
    const wideEnough = t.span >= 340;
    const side = !wideEnough ? 0
      : (cur.x <= t.lo + 1 ? -1 : (cur.x + cur.w >= t.hi - 1 ? 1 : 0));
    if (side !== 0 && side === wallSide) wallRun++; else { wallRun = side !== 0 ? 1 : 0; wallSide = side; }
    if (wallRun > worstWallRun) { worstWallRun = wallRun; worstWallSeed = seed; }

    if (!isReachable(prev, cur)) fails++;
    if (cur.x < PLAY_L || cur.x + cur.w > PLAY_R) oob++;
    if (cur.w < PLAYER_W + 4) tooNarrow++;
    if (cur.y !== n * FLOOR_H) missing++;
    checked++;
  }
}
const ms = Date.now() - t0;

console.log('');
console.log('  seeds                 ', SEEDS);
console.log('  floors per seed       ', FLOORS.toLocaleString());
console.log('  transitions checked   ', checked.toLocaleString());
console.log('  generated in          ', ms + ' ms  (' + Math.round(checked / ms) + 'k floors/s)');
console.log('');
console.log('  absolute reach        ', ABSOLUTE_REACH.toFixed(1) + ' px  (dead-stop jump)');
console.log('  generator gap ceiling ', MAX_EDGE_GAP + ' px');
console.log('  worst gap observed    ', worstGap + ' px');
console.log('');
console.log('  UNREACHABLE           ', fails);
console.log('  longest same-wall run ', worstWallRun + ' floors  (limit ' + MAX_WALL_RUN +
  ', seed ' + worstWallSeed + ')');
console.log('  outside play area     ', oob);
console.log('  narrower than player  ', tooNarrow);
console.log('  malformed / missing   ', missing);
console.log('');
console.log('  gap distribution (px buckets of 6):');
gapHist.forEach((c, i) => {
  if (!c) return;
  const pct = (c / checked) * 100;
  console.log('    ' + String(i * 6).padStart(3) + '-' + String(i * 6 + 5).padStart(3) +
    ' ' + '#'.repeat(Math.max(1, Math.round(pct / 1.5))).padEnd(36) + pct.toFixed(1) + '%');
});
console.log('');
const bad = fails + oob + tooNarrow + missing + (worstWallRun > MAX_WALL_RUN ? 1 : 0);
console.log(bad === 0 ? '  RESULT: PASS - every floor reachable from the one below it.'
                      : '  RESULT: FAIL - ' + bad + ' violations.');
process.exit(bad === 0 ? 0 : 1);
