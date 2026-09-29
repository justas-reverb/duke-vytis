// The tower's LAYOUT, as a map: every ledge a run generated, in columns of floors from the
// bottom up, coloured by the pattern that laid it -- and how guessable each next ledge is.
//
//   node tools/shot-layout.mjs                              seeds 1,2,3, floors 100-339
//   node tools/shot-layout.mjs --seeds=12345 --from=0 --count=160
//   node tools/shot-layout.mjs --out=layout.png --per-col=80 --measure=700
//
// A tower is only what it is inside a run: each floor is laid out in the shaft as it stands
// when the floor is generated, and the shaft opens with the climb. So this plays the menu's
// bot on a HUMAN tower (demo off: not the flow tower attract mode builds) with the rising
// floor held off him, and keeps every floor as it is generated.
//
// The numbers, over floors 100 to --measure of every seed (checkpoints left out): for each
// next ledge, how far off the eye's best guess of where it is -- the last step again (a stair,
// a drift) or the last step reversed (a zigzag), whichever is nearer -- as a share of the mean
// step; 0 is clockwork. With the share of turns that are a plain zigzag, the spread of widths
// against the ten below, and each pattern's share of floors. docs/TOWER.md "The patterns"
// quotes them before and after the tower's patterns changed (2026-09-28).
//
// Colours: zigzag light grey, drift grey, stair dark grey (also the one-side breaker's forced
// crossing), cluster green, scatter rose, slalom teal, terrace blue, switchback yellow,
// leapfrog violet, chimney orange, gauntlet pink; a checkpoint gold, a wide ledge white.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const FROM = Number(arg('from', 100));
const COUNT = Number(arg('count', 240));
const PER_COL = Number(arg('per-col', 80));
const MEASURE = Number(arg('measure', 700));
const OUT = arg('out', 'layout.png');

const Gen = await import('../src/game/generator.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const { PLAY_L, PLAY_R } = await import('../src/game/constants.js');

// Tag each floor with the pattern that laid it. Only this tool does this, on its own copy of
// the module graph; the game's floors carry no such field.
const generate = Gen.Tower.prototype.generate;
Gen.Tower.prototype.generate = function (n) {
  const p = generate.call(this, n);
  p.pat = this.pattern;
  return p;
};

const WANT = Math.max(FROM + COUNT, MEASURE) + 1;
const runs = [];
for (const seed of SEEDS) {
  const input = new AutoInput();
  const g = new Game(input);
  const bot = new AutoPlayer(input);
  g.demo = false;
  g.newRun(seed);
  const floors = [null];
  const take = () => {
    const t = g.tower;
    for (let n = floors.length; n <= t.highest; n++) {
      const p = t.floors.get(n);
      floors.push(p ? { x: p.x, w: p.w, kind: p.kind, pat: p.pat, lo: t.lo, hi: t.hi } : null);
    }
  };
  take();
  for (let i = 0; i < 240 * 1200 && floors.length <= WANT && g.state === STATE.PLAYING; i++) {
    g.riseY = Math.min(g.riseY, g.player.y - 300);      // a look at the tower, not at the bot
    bot.step(g, STEP);
    g.step(STEP);
    take();
  }
  runs.push({ seed, floors });
}

// ---- the map -------------------------------------------------------------------------------
const PAL = {
  zigzag: '#c8c8d2', drift: '#a0a0af', stair: '#787887', cluster: '#96be96', scatter: '#c89696',
  slalom: '#50dcc8', terrace: '#78a0ff', switchback: '#dcdc5a', leapfrog: '#b46eff',
  chimney: '#ff783c', gauntlet: '#ff50a0',
};
const FH = 9, COLW = (PLAY_R - PLAY_L) + 16, COLS = Math.ceil(COUNT / PER_COL);
const W = runs.length * COLS * COLW + (runs.length - 1) * 24, H = PER_COL * FH + 16;
const cv = new HeadlessCanvas(W, H);
const ctx = cv.getContext('2d');
ctx.fillStyle = '#12101c';
ctx.fillRect(0, 0, W, H);
runs.forEach(({ floors }, ri) => {
  const ox0 = ri * (COLS * COLW + 24);
  for (let k = 0; k < COUNT; k++) {
    const p = floors[FROM + k];
    if (!p) continue;
    const col = Math.floor(k / PER_COL), row = k % PER_COL;
    const ox = ox0 + col * COLW + 8, y = H - 8 - (row + 1) * FH;
    ctx.fillStyle = '#222030';
    ctx.fillRect(Math.round(ox + p.lo - PLAY_L), y, Math.round(p.hi - p.lo), FH);
    ctx.fillStyle = p.kind === 'checkpoint' ? '#f0c83c' : p.kind === 'wide' ? '#ffffff' : (PAL[p.pat] || '#c8c8d2');
    ctx.fillRect(Math.round(ox + p.x - PLAY_L), y + 2, Math.max(1, Math.round(p.w)), FH - 4);
  }
});
fs.writeFileSync(OUT, encodePNG(cv));

// ---- the numbers ---------------------------------------------------------------------------
const dx = [], best = [], wr = [], turns = [], pats = new Map();
for (const { floors } of runs) {
  let run = 0, sign = 0;
  for (let n = 100; n <= Math.min(MEASURE, floors.length - 1); n++) {
    const a = floors[n - 2], b = floors[n - 1], c = floors[n];
    if (!a || !b || !c || c.kind === 'checkpoint' || b.kind === 'checkpoint') continue;
    pats.set(c.pat, (pats.get(c.pat) || 0) + 1);
    const mid = (p) => p.x + p.w / 2;
    const d1 = mid(b) - mid(a), d2 = mid(c) - mid(b);
    dx.push(Math.abs(d2));
    best.push(Math.min(Math.abs(d2 - d1), Math.abs(d2 + d1)));
    const below = floors.slice(Math.max(1, n - 10), n).filter(Boolean).map((p) => p.w).sort((x, y) => x - y);
    wr.push(c.w / below[Math.floor(below.length / 2)]);
    const s = Math.sign(d2);
    if (s && s === sign) run++; else { if (run) turns.push(run); run = 1; sign = s; }
  }
}
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const sd = (v) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const total = [...pats.values()].reduce((s, x) => s + x, 0);
console.log(`  ${OUT}  ${W}x${H}: seeds ${SEEDS.join(', ')}, floors ${FROM}-${FROM + COUNT - 1}, ${PER_COL} to a column`);
console.log(`  over floors 100-${MEASURE} (${dx.length} ledges): the eye's best guess off by ${(mean(best) / mean(dx)).toFixed(2)} of a step; ` +
  `${(turns.filter((r) => r === 1).length / turns.length * 100).toFixed(0)}% of turns a plain zigzag; widths spread ${sd(wr).toFixed(2)}`);
console.log('  floors by pattern: ' + [...pats.entries()].sort((a, b) => b[1] - a[1])
  .map(([p, k]) => `${p} ${(k / total * 100).toFixed(0)}%`).join(', '));
