// Screenshot the death, which nothing else can reach.
//
//   node tools/shot-death.mjs                     the splat, 1.5s after impact
//   node tools/shot-death.mjs --dazed             the survivable fall instead
//   node tools/shot-death.mjs --after=0.1         earlier, while the burst is still up
//   node tools/shot-death.mjs --before=0.6        mid-FALL, this long before he lands
//   node tools/shot-death.mjs --floor=900         die having reached floor 900 (a deeper
//                                                 fall: more blood, wider scatter)
//   node tools/shot-death.mjs --open              in the fully open arena (zoom 1), which
//                                                 is what any death past floor ~200 is in
//   node tools/shot-death.mjs --left              facing left, so everything is mirrored
//   node tools/shot-death.mjs --scale=3 --crop    zoomed to the body
//   node tools/shot-death.mjs --band              the whole floor, wall to wall
//
// tools/shot.mjs drives the bot, and the bot's whole job is not to die, so the two
// states this game ends in were the only ones never looked at. Both were broken:
// he hovered off the floor and buzzed for the full hold, and the "splat" above floor
// 200 drew his body perfectly intact on top of its own debris.
//
// Neither is visible in code and both are obvious in a PNG.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

const DAZED = !!flag('dazed', false);
const AFTER = Number(flag('after', 1.5));
const BEFORE = flag('before', null);
const SCALE = Number(flag('scale', 2));
const CROP = !!flag('crop', false);
const BAND = !!flag('band', false);
const OPEN = !!flag('open', false);
const LEFT = !!flag('left', false);     // facing left: the mirrored body, mirrored pieces
const OUT = String(flag('out', 'death.png'));

const { Game } = await import('../src/game/game.js');
const { AutoInput } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { SW, SH, PX, VW, VH, WALL_W, CX, SPLAT_FLOOR } = await import('../src/game/constants.js');

const FLOOR = Number(flag('floor', DAZED ? Math.max(0, SPLAT_FLOOR - 40) : SPLAT_FLOOR + 220));

// Climb a little first so there is a tower under him to fall down, then set the floor
// the outcome is chosen from. Above SPLAT_FLOOR he bursts; below it he is only dazed.
function stage() {
  const game = new Game(new AutoInput());
  game.newRun(0x2f6f1b21);
  for (let i = 0; i < 260; i++) game.step(STEP);
  game.run.maxFloor = FLOOR;
  if (OPEN) {
    // The widest arena, as the climb would have left it. The bottom-of-tower stage above
    // is always in the narrowest one, which no real death past floor 200 happens in.
    game.zoom = game.zoomView = 1;
    game.arenaHalf = game.arenaHalfView = game.arenaEase = (VW - 2 * WALL_W) / 2;
    game.arenaStep = 4;
    game.viewH = VH;
  }
  if (LEFT) game.player.facing = -1;
  game.die();
  return game;
}

let game = stage();
if (BEFORE !== null) {
  // Mid-fall. The fall is deterministic, so count the steps to the impact on one copy
  // and stop a second copy short of it.
  let n = 0;
  while (!game.impacted && n < 20000) { game.step(STEP); n++; }
  game = stage();
  const stop = Math.max(0, n - 1 - Math.round(Number(BEFORE) / STEP));
  for (let i = 0; i < stop; i++) game.step(STEP);
  console.log(`  mid-fall: ${stop} of ${n} steps, ${(game.player.y - game.pitY).toFixed(1)} above the floor`);
} else {
  let guard = 0;
  while (!game.impacted && guard++ < 20000) game.step(STEP);
  if (!game.impacted) { console.log('  never landed'); process.exit(1); }
  const held = Math.max(0, Math.round(AFTER / STEP));
  for (let i = 0; i < held; i++) game.step(STEP);
}

const canvas = new HeadlessCanvas(SW, SH);
const renderer = new Renderer(canvas);
renderer.applySettings({
  scaleMode: 'integer', scanlines: false, particles: 'high',
  streaks: true, shake: true, trails: true, showFps: false, music: false,
});

const gibs = game.gibs || [];
const resting = gibs.filter((g) => g.rest).length;
console.log(`  floor=${FLOOR}  splat=${game.splat}  impacted=${game.impacted}  ` +
  `impactT=${(game.impactT || 0).toFixed(2)}  severity=${(game.severity || 0).toFixed(2)}  ` +
  `pieces ${resting}/${gibs.length} at rest`);

// ALPHA INVARIANCE. At rest the drawn frame must not depend on where the fixed-step
// accumulator happens to sit, or the body buzzes. Two draws, two extreme alphas, one
// comparison -- this is the check the hovering bug would have failed. Only meaningful
// once everything has stopped: pieces in flight are interpolated and SHOULD differ.
// draw() advances the renderer's OWN clock, which drives the daze stars' orbit, so two
// back-to-back draws differ for reasons that have nothing to do with alpha. Pinning the
// clock is what makes this measure the thing it claims to measure -- without it the test
// reported 240 moving pixels on a body that was not moving at all.
const clock = renderer.t;
renderer.draw(game, 0, STEP);
const a0 = canvas.getContext('2d').getImageData(0, 0, SW, SH).data.slice();
renderer.t = clock;
renderer.draw(game, 1, STEP);
const a1 = canvas.getContext('2d').getImageData(0, 0, SW, SH).data;
renderer.t = clock;
let diff = 0;
for (let i = 0; i < a0.length; i += 4) if (a0[i] !== a1[i] || a0[i + 1] !== a1[i + 1]) diff++;
const still = game.impacted && resting === gibs.length;
console.log(`  alpha 0 vs alpha 1: ${diff} pixels differ ` +
  (!still ? '(things are still moving)' : diff ? '<-- HE IS STILL MOVING AT REST' : '(at rest)'));

renderer.draw(game, 1, STEP);

/** Cut a rectangle out of the frame. */
function cut(sx, sy, cw, ch) {
  // getImageData works here; putImageData and canvas-to-canvas drawImage do not
  // implement what this needs, so the crop is rebuilt out of run-length fillRects --
  // the primitive this canvas actually implements.
  sx = Math.max(0, Math.min(SW - cw, sx));
  sy = Math.max(0, Math.min(SH - ch, sy));
  const out = new HeadlessCanvas(cw, ch);
  const g = out.getContext('2d');
  const src = canvas.getContext('2d').getImageData(sx, sy, cw, ch).data;
  const at = (x, y) => {
    const i = (y * cw + x) * 4;
    return `rgb(${src[i]},${src[i + 1]},${src[i + 2]})`;
  };
  for (let y = 0; y < ch; y++) {
    let x = 0;
    while (x < cw) {
      const col = at(x, y);
      let run = 1;
      while (x + run < cw && at(x + run, y) === col) run++;
      g.fillStyle = col;
      g.fillRect(x, y, run, 1);
      x += run;
    }
  }
  return out;
}

// Computed with the renderer's own transform rather than a remembered version of it:
// k = zoom * PX, screenY = SH - (worldY - camY) * k. Guessing at this put the crop in an
// empty corner of the shaft and produced a very convincing screenshot of nothing.
const k = game.zoom * PX;
const viewLeft = CX - (VW / game.zoom) / 2;
const screenY = (wy) => Math.round(SH - (wy - game.camY) * k);
let out = canvas;
if (CROP) {
  // Sized off the BODY, which has grown twice since this crop was a fixed 560 x 300.
  const p = game.player;
  const { BODY_W, BODY_H } = await import('../src/render/sprites.js');
  const cw = Math.min(SW, Math.round(BODY_W * k * 1.7)), ch = Math.min(SH, Math.round(BODY_H * k * 1.6));
  const cx = Math.round((p.x - viewLeft) * k - cw / 2);
  const cy = Math.round(screenY(p.y) - ch * 0.62);
  console.log(`  crop ${cw}x${ch} at ${cx},${cy}  (zoom ${game.zoom.toFixed(3)}, k ${k.toFixed(2)})`);
  out = cut(cx, cy, cw, ch);
} else if (BAND) {
  // Wall to wall, from well above the floor to just under it: every piece, every stain.
  const top = screenY(game.pitY + 70), bottom = screenY(game.pitY - 10);
  out = cut(0, top, SW, Math.min(SH, bottom - top));
}

fs.writeFileSync(OUT, encodePNG(SCALE > 1 ? upscale(out, SCALE) : out));
console.log(`  ${OUT}  ${out.width * (SCALE > 1 ? SCALE : 1)}x${out.height * (SCALE > 1 ? SCALE : 1)}`);
