// Where the frame time goes, measured without a browser.
//
// The game is 480x270 of rectangles and it should not trouble anything built this
// decade. When it does, the answer is in here rather than in a profiler tab: this runs
// the real simulation and the real renderer against the headless canvas and reports
// milliseconds per second of gameplay for each part separately.
//
// The numbers are NOT browser frame times -- the headless canvas rasterises in plain JS
// where a browser hands rectangles to the GPU, so RENDER here is a pessimistic upper
// bound and the ratios between parts are what to read. SIMULATION is exact: it is the
// same code the browser runs.
//
// Run:  node tools/test-perf.mjs [seconds]

import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const SECONDS = Number(process.argv[2] || 20);

const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, TUNE, startDemo } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { SW, SH, PX, VW, VH } = await import('../src/game/constants.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');

const SETTINGS = {
  scaleMode: 'integer', scanlines: true, particles: 'high',
  streaks: true, shake: true, trails: true, showFps: false, music: false,
};

const now = () => Number(process.hrtime.bigint()) / 1e6;

function freshGame(demo, seed) {
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  // The demo as the menu runs it (its settings, autoplay.js startDemo); anything else a run
  // at the simulation's own defaults.
  if (demo) startDemo(game, seed);
  else game.newRun(seed);
  return { game, bot, input };
}

/** Milliseconds of CPU per SECOND of simulated gameplay. */
function measureSim(label, demo, withBot) {
  const { game, bot } = freshGame(demo, 0x2f6f1b21);
  const steps = Math.round(SECONDS / STEP);
  // Warm up, so JIT compilation is not counted as game cost.
  for (let i = 0; i < 4000; i++) { if (withBot) bot.step(game, STEP); game.step(STEP); }
  const looks0 = { ...bot.stats };

  const t0 = now();
  let ran = 0;
  for (let i = 0; i < steps; i++) {
    if (withBot) bot.step(game, STEP);
    game.step(STEP);
    ran++;
    if (game.state !== STATE.PLAYING) game.newRun(0x2f6f1b21 + i);
  }
  const ms = now() - t0;
  const looks = {};
  for (const k of Object.keys(looks0)) looks[k] = bot.stats[k] - looks0[k];
  return { label, msPerSec: (ms / (ran * STEP)), floor: game.run.maxFloor, looks, secs: ran * STEP };
}

function measureRender(label, hud) {
  const { game, bot } = freshGame(false, 0x2f6f1b21);
  for (let i = 0; i < 240 * 6; i++) { bot.step(game, STEP); game.step(STEP); }

  const canvas = new HeadlessCanvas(SW, SH);
  const renderer = new Renderer(canvas);
  renderer.applySettings(SETTINGS);
  const ctx = canvas.getContext('2d');
  const all = Stats.BLANK_ALL();

  const FRAMES = 60;
  for (let i = 0; i < 6; i++) renderer.draw(game, 1, 1 / 160);   // warm up
  const t0 = now();
  for (let i = 0; i < FRAMES; i++) {
    for (let k = 0; k < 2; k++) { bot.step(game, STEP); game.step(STEP); }
    renderer.draw(game, 1, 1 / 160);
    if (hud) { ctx.setTransform(PX, 0, 0, PX, 0, 0); drawHud(ctx, game, all, i / 160); }
  }
  return { label, msPerFrame: (now() - t0) / FRAMES };
}

console.log(`\n  PERFORMANCE  (${SECONDS}s of gameplay, backing store ${SW}x${SH}, PX=${PX})\n`);

// --- simulation --------------------------------------------------------------
const simOnly = measureSim('game only', false, false);
const simBot = measureSim('game + attract bot', true, true);

console.log('  SIMULATION -- exactly what the browser runs');
console.log(`    ${'game alone'.padEnd(26)} ${simOnly.msPerSec.toFixed(2)} ms per second of play`);
console.log(`    ${'game + the attract bot'.padEnd(26)} ${simBot.msPerSec.toFixed(2)} ms per second of play`);
console.log(`    ${'the bot itself'.padEnd(26)} ${(simBot.msPerSec - simOnly.msPerSec).toFixed(2)} ms/s` +
  `   (${(((simBot.msPerSec - simOnly.msPerSec) / simOnly.msPerSec) * 100).toFixed(0)}% on top of the game)`);

// The menu runs BOTH: the real game stepping in its menu state, and the demo game with
// the bot driving it. That is the state the machine sits in while nobody is playing.
console.log(`    ${'menu (real + demo + bot)'.padEnd(26)} ${(simOnly.msPerSec + simBot.msPerSec).toFixed(2)} ms/s`);

// --- the bot's planner ---------------------------------------------------------
// Since 2026-09-29 the bot flies whole flights through an exact model of the step: on the
// ground, every stick plan with every use of the air jump (autoplay.js PLANS x AIR_MODES, up
// to 124 flights a look); in the air, the one it committed to, checked every step, and a
// fresh look every TUNE.replanEvery steps or when the check fails. Its cost is those looks.
// (It was a controller re-steered every frame, TUNE.steerPhases, until then.)
const L = simBot.looks, per = (n) => (n / simBot.secs).toFixed(1);
console.log(`\n  THE BOT'S PLANNER`);
console.log(`    ${per(L.plans - L.replans)} looks on the ground and ${per(L.replans)} in the air a second of play, ` +
  `${per(L.switches)} changes of flight, ${per(L.breaks)} flights that went wrong (replanEvery=${TUNE.replanEvery})`);

const was = TUNE.replanEvery;
TUNE.replanEvery = was * 2;
const simBot2 = measureSim('half the looks in the air', true, true);
TUNE.replanEvery = was;
console.log(`    a look in the air every ${was * 2} steps instead of ${was}: ${simBot2.msPerSec.toFixed(2)} ms/s` +
  `  (saves ${(simBot.msPerSec - simBot2.msPerSec).toFixed(2)} ms/s)`);

// --- render -------------------------------------------------------------------
const rNoHud = measureRender('world only', false);
const rHud = measureRender('world + HUD', true);
console.log(`\n  RENDER -- upper bound: this rasterises in JS, a browser uses the GPU`);
console.log(`    ${'world'.padEnd(26)} ${rNoHud.msPerFrame.toFixed(2)} ms/frame`);
console.log(`    ${'world + HUD'.padEnd(26)} ${rHud.msPerFrame.toFixed(2)} ms/frame`);
console.log(`    ${'pixels per frame'.padEnd(26)} ${(SW * SH / 1000).toFixed(0)}k` +
  `   (${VW}x${VH} world x PX ${PX})`);

console.log(`\n  BUDGET`);
const hz = 160;
const budget = 1000 / hz;
const menuSim = (simOnly.msPerSec + simBot.msPerSec) / 1000;   // ms of sim per ms of wall time
console.log(`    at ${hz} Hz a frame has ${budget.toFixed(2)} ms`);
console.log(`    simulation on the menu costs ${(menuSim * budget).toFixed(3)} ms of that`);
console.log(`    simulation in a run costs    ${((simOnly.msPerSec / 1000) * budget).toFixed(3)} ms of that`);
console.log('');
