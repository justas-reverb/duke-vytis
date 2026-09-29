// Take a screenshot of the game without a browser.
//
//   node tools/shot.mjs                        8 seconds of play, shot.png
//   node tools/shot.mjs --sec=30 --scale=2     further in, doubled for legibility
//   node tools/shot.mjs --demo                 attract mode, as the menu starts it
//   node tools/shot.mjs --frames=6 --every=0.4 a strip of consecutive frames
//   node tools/shot.mjs --sprite=run0          one sprite frame, blown up
//   node tools/shot.mjs --floor=2625 --sec=0.3 start standing on floor 2625
//
// This exists because checking a visual change used to mean opening a browser, and that
// is slow, unreliable and expensive on the machine. This runs the real renderer against
// the real simulation in one short node process and writes a PNG.

import fs from 'node:fs';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

const SEC = Number(flag('sec', 8));
const SCALE = Number(flag('scale', 1));
const FRAMES = Number(flag('frames', 1));
const EVERY = Number(flag('every', 0.35));
const DEMO = !!flag('demo', false);
const SPRITE = flag('sprite', null);
const SEED = Number(flag('seed', 0)) || null;
const OUT = String(flag('out', 'shot.png'));
// --crop=x,y,w,h in backing-store pixels, magnified by --scale. For looking at one
// thing closely instead of squinting at a whole frame.
const CROP = flag('crop', null);
// --follow centres the crop on the player, which is the thing usually worth a look.
const FOLLOW = !!flag('follow', false);
// --floor=N starts the run standing on floor N instead of the ground. Nothing else could
// put the camera high in the tower: reaching floor 2000 honestly is two and a half
// simulated minutes of the attract bot, and on a human tower the bot does not get there
// at all. Keep --sec short with it -- the rising floor is live and two floors behind you
// up there, which is as it should be.
const FLOOR = Math.max(0, Math.floor(Number(flag('floor', 0)) || 0));

// Imported after installDom, because the sprite and backdrop atlases bake at load.
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { SW, SH, PX: PX0 } = await import('../src/game/constants.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');

// --- a single sprite frame, blown up ----------------------------------------
if (SPRITE) {
  const { FRAMES: SF, SPR_W, SPR_H, drawSprite } = await import('../src/render/sprites.js');
  const names = SPRITE === 'all' ? Object.keys(SF) : String(SPRITE).split(',');
  const k = SCALE > 1 ? SCALE : 6;
  const cell = SPR_W + 2;
  const cv = new HeadlessCanvas(cell * names.length, SPR_H + 2);
  const g = cv.getContext('2d');
  g.fillStyle = '#20182e';
  g.fillRect(0, 0, cv.width, cv.height);
  names.forEach((n, i) => {
    if (!SF[n]) { console.log(`no frame "${n}"`); return; }
    // drawSprite works in world units; here we want atlas pixels, so drive the atlas
    // directly rather than through the world transform.
    const grid = SF[n];
    for (let y = 0; y < SPR_H; y++) {
      for (let x = 0; x < SPR_W; x++) {
        const c = grid[y][x];
        if (!c) continue;
        g.fillStyle = c;
        g.fillRect(i * cell + 1 + x, 1 + y, 1, 1);
      }
    }
  });
  void drawSprite;
  fs.writeFileSync(OUT, encodePNG(upscale(cv, k)));
  console.log(`  ${OUT}  ${names.join(', ')}  (${cv.width * k}x${cv.height * k})`);
  process.exit(0);
}

// --- a frame of the real game -----------------------------------------------
const canvas = new HeadlessCanvas(SW, SH);
const input = new AutoInput();
const game = new Game(input);
const bot = new AutoPlayer(input);

// --demo: the attract demo as the menu starts it (autoplay.js startDemo: a player's tower at
// the game's default settings since 2026-09-29, when it stopped being a flow tower of its own).
if (DEMO) startDemo(game, SEED || DEMO_SEEDS[0]);
else game.newRun(SEED || 0x2f6f1b21);

if (FLOOR > 0) {
  // Open the shaft fully, then generate every floor up to the target, in order. The
  // tower is sequential -- each floor is placed against the one below it -- so walking
  // it up is the only way to get the platforms that seed really has at floor N. The first
  // 24 were made in the starting box by newRun; everything above is made in the full
  // shaft, which is where every measured run is long before floor 2000.
  const C = await import('../src/game/constants.js');
  game.openness = 1;
  game.arenaEase = C.ARENA_HALF_MAX;     // the next step() walks arenaStep to the top
  game.arenaHalfView = C.ARENA_HALF_MAX;
  game.zoom = game.zoomView = 1;         // and the view is not left gliding out to it
  game.viewH = C.VH / game.zoom;
  game.tower.setBounds(C.PLAY_L, C.PLAY_R);
  game.player.setBounds(C.PLAY_L, C.PLAY_R);
  game.tower.ensure(FLOOR + 12);
  const pl = game.tower.get(FLOOR);
  const p = game.player;
  // px/py with x/y: the renderer interpolates between them, and a stale previous
  // position would draw him streaking up from the ground on the first frame.
  p.x = p.px = pl.x + pl.w / 2;
  p.y = p.py = pl.y;
  p.floor = FLOOR;
  p.momentum = 1;                        // nobody is at floor 2000 at walking pace
  game.run.maxFloor = FLOOR;
  game.camY = p.y - game.viewH * C.CAM_ANCHOR;
}

const renderer = new Renderer(canvas);
renderer.applySettings({
  scaleMode: 'integer', scanlines: false, particles: 'high',
  streaks: true, shake: true, trails: true, showFps: false, music: false,
});

const all = Stats.BLANK_ALL();
const shots = [];

let t = 0;
let nextShot = SEC;
const total = SEC + (FRAMES - 1) * EVERY;
const steps = Math.ceil(total / STEP) + 2;
// The speed trail is laid on the path he was DRAWN along (render/afterimage.js), so a frame
// drawn cold, with nothing drawn before it, has no trail at all: every shot showed him
// without one. The game draws every display frame, so draw the steps just before each shot
// too -- 50 ms covers the trail's 36 ms -- and the shot shows what a player sees.
const LEAD = 0.05;   // s

for (let i = 0; i < steps && shots.length < FRAMES; i++) {
  bot.step(game, STEP);
  game.step(STEP);
  t += STEP;
  if (t < nextShot && t >= nextShot - LEAD) renderer.draw(game, 1, STEP);
  if (t >= nextShot) {
    renderer.draw(game, 1, STEP);
    const ctx = canvas.getContext('2d');
    const { PX } = await import('../src/game/constants.js');
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    if (game.state === STATE.PLAYING) drawHud(ctx, game, all, t);
    shots.push({
      t,
      floor: game.run.maxFloor,
      // Where the player is on screen, so --follow can centre on him.
      cx: Math.round((game.player.x - (240 - (480 / game.zoom) / 2)) * game.zoom * PX0),
      // player.y is his FEET, so centring the crop on it puts his head at the very top
      // of the box. Offset by half a body.
      cy: Math.round(SH - (game.player.y + 14 - game.camY) * game.zoom * PX0),
      data: Uint8ClampedArray.from(canvas.data),
    });
    nextShot += EVERY;
  }
  if (game.state !== STATE.PLAYING) break;
}

if (!shots.length) {
  console.log('  nothing rendered -- the run ended before the requested time');
  process.exit(1);
}

// Optionally cut a window out of each frame before stacking them.
let cw = SW, ch = SH;
let box = null;
if (CROP || FOLLOW) {
  if (CROP && CROP !== true) {
    const [x, y, w, h] = String(CROP).split(',').map(Number);
    box = { x, y, w, h };
  } else {
    box = { x: 0, y: 0, w: 140, h: 140 };
  }
  cw = box.w; ch = box.h;
}

const sheet = new HeadlessCanvas(cw, ch * shots.length);
const shd = sheet.data;
shots.forEach((s, i) => {
  if (!box) { sheet.data.set(s.data, i * cw * ch * 4); return; }
  const ox = FOLLOW ? Math.max(0, Math.min(SW - box.w, s.cx - (box.w >> 1))) : box.x;
  const oy = FOLLOW ? Math.max(0, Math.min(SH - box.h, s.cy - (box.h >> 1))) : box.y;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sxi = ox + x, syi = oy + y;
      if (sxi < 0 || sxi >= SW || syi < 0 || syi >= SH) continue;
      const si = (syi * SW + sxi) * 4;
      const di = ((i * ch + y) * cw + x) * 4;
      shd[di] = s.data[si];
      shd[di + 1] = s.data[si + 1];
      shd[di + 2] = s.data[si + 2];
      shd[di + 3] = s.data[si + 3];
    }
  }
});
const out = SCALE > 1 ? upscale(sheet, SCALE) : sheet;
fs.writeFileSync(OUT, encodePNG(out));

console.log(`  ${path.resolve(OUT)}`);
console.log(`  ${shots.length} frame(s) at ${out.width}x${out.height}` +
  (DEMO ? '  [attract mode]' : '') +
  `  floors ${shots.map((s) => s.floor).join(', ')}`);
