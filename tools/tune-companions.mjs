// What each companion setting actually costs, measured over real runs.
//
//   node tools/tune-companions.mjs                the default grid, on the human tower
//   node tools/tune-companions.mjs --frames=60000 --seeds=2
//   node tools/tune-companions.mjs --tower=attract   the menu demo's ramp instead
//
// ONE PROCESS, ONE CORE. tools/tune-bot.mjs forks a worker per core and saturates the
// machine for minutes; this does not need to. A run of forty thousand frames takes about
// a second, and the grid below is at most twelve of them.
//
// THE HUMAN TOWER BY DEFAULT. Every number here was once taken on the attract ramp only,
// which no player climbs, and the design that won there was off screen 23% of the time on
// the tower a player does climb. On the human tower the bot dies about once a minute; the
// run restarts on the next seed, so every sample is of a live game.
//
// WHY THIS EXISTS. Every hand-picked set of these numbers was wrong somewhere, and each
// in a way that looked fine in the code and wrong on the screen. The metrics that matter
// have changed with every design (see the top of src/game/companions.js), so this prints
// all of them, not the one the current design was built to win:
//
//   off       % of climbing frames a companion was not wholly on screen
//   x/min     times a minute they crossed him (a +-0.6 floor dead band); one per role
//             switch is the design, anything over that is noise
//   gap       p5 / p50 / p95 of their height minus his, in floors
//   hops/s    hops a second, per companion
//   p2p       % of hops that took off from AND landed on a platform surface. Must be 100
//   vx, vy    the fastest single frame, world units a second
//   stranded  frames stood on a platform that had been pruned. Must be 0

import { installDom } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(hit.indexOf('=') + 1)) : dflt;
};
const FRAMES = flag('frames', 40000);
const SEEDS = flag('seeds', 1);
const HUMAN = !argv.includes('--tower=attract');

const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const { FLOOR_H } = await import('../src/game/constants.js');
const { TUNE } = await import('../src/game/companions.js');

const q = (arr, p) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length * p)] : 0);

function onPlatform(tower, x, y) {
  const pl = tower.floors.get(Math.round(y / FLOOR_H));
  return !!pl && Math.abs(pl.y - y) <= 0.5 && x >= pl.x + 2 && x <= pl.x + pl.w - 2;
}

function measure() {
  let samples = 0, off = 0, cross = 0, hops = 0, p2p = 0, vx = 0, vy = 0, stranded = 0;
  const gaps = [];
  let seed = 0x2f6f1b21 + 7919;
  for (let run = 0; run < SEEDS; run++) {
    let input, game, bot;
    const start = () => {
      input = new AutoInput();
      game = new Game(input);
      bot = new AutoPlayer(input);
      game.demo = !HUMAN;
      game.newRun(seed);
      seed = (seed + 104729) >>> 0;
    };
    start();
    const prev = new Map();
    let n = 0;
    while (n < FRAMES) {
      if (game.state !== STATE.PLAYING) {
        if (!HUMAN) break;
        for (const c of game.companions.active) stranded += c.stranded || 0;
        start();
        prev.clear();
        continue;
      }
      bot.step(game, STEP);
      game.step(STEP);
      n++;
      if (game.state !== STATE.PLAYING) continue;
      for (const c of game.companions.active) {
        if (c.state !== 'climbing') { prev.delete(c.index); continue; }
        samples++;
        if (c.y < game.camY || c.y > game.camY + game.viewH - 34) off++;
        const gap = (c.y - game.player.y) / FLOOR_H;
        gaps.push(gap);
        const side = gap > 0.6 ? 1 : (gap < -0.6 ? -1 : 0);
        const o = prev.get(c.index);
        if (o) {
          if (side && o.side && side !== o.side) cross++;
          vx = Math.max(vx, Math.abs(c.x - o.x) / STEP);
          vy = Math.max(vy, Math.abs(c.y - o.y) / STEP);
          if (c.airborne && !o.air) { o.tx = o.x; o.ty = o.y; }
          if (!c.airborne && o.air) {
            hops++;
            if (onPlatform(game.tower, o.tx, o.ty) && onPlatform(game.tower, c.x, c.y)) p2p++;
          }
        }
        prev.set(c.index, { x: c.x, y: c.y, air: c.airborne, side: side || (o && o.side) || 0,
          tx: o && o.tx, ty: o && o.ty });
      }
    }
    for (const c of game.companions.active) stranded += c.stranded || 0;
  }
  const secs = samples * STEP;
  return {
    off: (off / Math.max(1, samples)) * 100,
    perMin: cross / Math.max(1e-6, secs / 60),
    gaps: [q(gaps, 0.05), q(gaps, 0.5), q(gaps, 0.95)],
    hops: hops / Math.max(1e-6, secs),
    p2p: (p2p / Math.max(1, hops)) * 100,
    vx, vy, stranded,
  };
}

// Eleven around the shipping numbers, one lever at a time. The rule is the one on the
// box: at most twelve settings a sweep, so it stays a short single-core job.
const GRID = [
  { lead: 1.7 }, { lead: 2.3 },
  { trail: 2.0 }, { trail: 2.8 },
  { tPenalty: 150 }, { tPenalty: 450 },
  { wView: 0 }, { wView: 2 },
  { holdBand: 0.7 },
  { hopFast: 0.08, gFast: 8 },
  { sideMargin: 0.6 },
];

const base = { ...TUNE };
console.log(`  ${GRID.length + 1} settings on the ${HUMAN ? 'human' : 'attract'} tower, ` +
  `${SEEDS} seed(s) x ${FRAMES} frames each\n`);
console.log('  setting                      off%   x/min   gap p5   p50   p95  hops/s   p2p%    vx    vy  stranded');

const runOne = (label, patch) => {
  Object.assign(TUNE, base, patch);
  const r = measure();
  console.log(`  ${label.padEnd(26)} ${r.off.toFixed(1).padStart(5)}  ${r.perMin.toFixed(1).padStart(6)}  ` +
    `${r.gaps.map((g) => g.toFixed(2).padStart(5)).join(' ')}  ${r.hops.toFixed(2).padStart(6)}  ` +
    `${r.p2p.toFixed(1).padStart(5)}  ${r.vx.toFixed(0).padStart(4)}  ${r.vy.toFixed(0).padStart(4)}  ${String(r.stranded).padStart(8)}`);
  return r;
};

const results = [{ label: 'current', r: runOne('current', {}) }];
for (const patch of GRID) {
  const label = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(' ');
  results.push({ label, r: runOne(label, patch) });
}

Object.assign(TUNE, base);
// Ranked by what the eye notices: off screen plus crossings, weighted so that a crossing
// a minute costs what a percent of frames off screen does.
results.sort((a, b) => (a.r.off + a.r.perMin) - (b.r.off + b.r.perMin));
console.log(`\n  best: ${results[0].label} (${results[0].r.off.toFixed(1)}% off, ` +
  `${results[0].r.perMin.toFixed(1)} crossings a minute)`);
