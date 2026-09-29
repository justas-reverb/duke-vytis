// Screenshot the title screen without a browser.
//
//   node tools/shot-menu.mjs                     the menu over a live attract run
//   node tools/shot-menu.mjs --static            the menu over its own starfield
//   node tools/shot-menu.mjs --header --scale=4  just the header box, blown up
//   node tools/shot-menu.mjs --emblem --scale=8  just the shield
//
// The header is the one thing in this game a player sees before anything else, and it
// is drawn over a LIVE game behind it -- so "does the title read" cannot be answered by
// looking at the code. It has to be rendered and looked at. This does that in one short
// node process, the same way shot.mjs and shot-text.mjs do.

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

const SCALE = Number(flag('scale', 2));
const OUT = String(flag('out', 'menu.png'));
const STATIC = !!flag('static', false);
const HEADER = !!flag('header', false);
const EMBLEM = !!flag('emblem', false);
const T = Number(flag('t', 1.1));

const { SW, SH, PX, VW } = await import('../src/game/constants.js');
const { emblemCanvas, EMB_W, EMB_H } = await import('../src/render/emblem.js');

function write(canvas, k) {
  fs.writeFileSync(OUT, encodePNG(k > 1 ? upscale(canvas, k) : canvas));
  console.log(`wrote ${OUT}  ${canvas.width * k}x${canvas.height * k}`);
}

// --- the emblem on its own --------------------------------------------------
if (EMBLEM) {
  const src = emblemCanvas();
  const pad = 4;
  const c = new HeadlessCanvas(EMB_W + pad * 2, EMB_H + pad * 2);
  const g = c.getContext('2d');
  g.fillStyle = '#0e0a16';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, EMB_W, EMB_H, pad, pad, EMB_W, EMB_H);
  write(c, SCALE);
  process.exit(0);
}

// --- the whole screen -------------------------------------------------------
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { drawMenu } = await import('../src/ui/screens.js');
const Stats = await import('../src/game/stats.js');

const canvas = new HeadlessCanvas(SW, SH);
const renderer = new Renderer(canvas);
const all = Stats.BLANK_ALL();

let live = false;
if (!STATIC) {
  // A real attract run behind the menu, which is what a player actually sees.
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  startDemo(game, DEMO_SEEDS[0]);   // as main.js starts it (autoplay.js)
  for (let i = 0; i < Math.round(9 / STEP); i++) {
    bot.step(game, STEP);
    game.step(STEP);
    if (game.state === STATE.DEAD) { startDemo(game, DEMO_SEEDS[0]); bot.reset(); }
  }
  renderer.draw(game, 1, STEP);
  live = true;
} else {
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0e0a16';
  g.fillRect(0, 0, SW, SH);
}

const ctx = canvas.getContext('2d');
ctx.setTransform(PX, 0, 0, PX, 0, 0);
drawMenu(ctx, all, T, STEP, live, false);
ctx.setTransform(1, 0, 0, 1, 0, 0);

if (HEADER) {
  // The header box plus a generous margin, so the glow is in shot too.
  const h = Math.round(110 * PX);
  const c = new HeadlessCanvas(SW, h);
  c.getContext('2d').drawImage(canvas, 0, 0, SW, h, 0, 0, SW, h);
  write(c, SCALE);
} else {
  write(canvas, SCALE);
}
void VW;
