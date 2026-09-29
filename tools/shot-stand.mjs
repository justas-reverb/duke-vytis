import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';
installDom();
const { Game } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const C = await import('../src/game/constants.js');

const canvas = new HeadlessCanvas(C.SW, C.SH);
const input = new AutoInput(); const game = new Game(input); const bot = new AutoPlayer(input);
game.newRun(0x2f6f1b21);
const r = new Renderer(canvas);
r.applySettings({ scaleMode:'integer', scanlines:false, particles:'off', streaks:false,
                  shake:false, trails:false, showFps:false, music:false });
// find a frame where he is standing still on a platform
let found = false;
for (let i = 0; i < 20000 && !found; i++) {
  bot.step(game, STEP); game.step(STEP);
  const p = game.player;
  if (p.grounded && p.floor > 3) found = true;
}
const p = game.player;
const pl = game.tower.peek(p.floor);
console.log(`grounded=${p.grounded} floor=${p.floor} p.y=${p.y.toFixed(3)} plat.y=${pl ? pl.y.toFixed(3) : 'none'} zoom=${game.zoom}`);
r.draw(game, 1, STEP);
const k = game.zoom * C.PX;
const viewLeft = C.CX - (C.VW / game.zoom) / 2;
const sxp = Math.round((p.x - viewLeft) * k);
const syp = Math.round(C.SH - (p.y - game.camY) * k);
console.log(`player feet on screen: x=${sxp} y=${syp}`);
const cw = 200, ch = 150;
const x0 = Math.max(0, Math.min(C.SW - cw, sxp - cw / 2));
const y0 = Math.max(0, Math.min(C.SH - ch, syp - ch + 40));
const src = canvas.getContext('2d').getImageData(x0, y0, cw, ch).data;
const cut = new HeadlessCanvas(cw, ch); const g = cut.getContext('2d');
const at = (x, y) => { const i = (y * cw + x) * 4; return `rgb(${src[i]},${src[i+1]},${src[i+2]})`; };
for (let y = 0; y < ch; y++) { let x = 0; while (x < cw) { const c = at(x, y); let run = 1;
  while (x + run < cw && at(x + run, y) === c) run++; g.fillStyle = c; g.fillRect(x, y, run, 1); x += run; } }
const out = path.join(os.tmpdir(), 'grounded.png');
fs.writeFileSync(out, encodePNG(upscale(cut, 6)));
console.log('wrote ' + out);
