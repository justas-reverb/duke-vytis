// The side walls, zone by zone, in real frames of the game.
//
//   node tools/shot-walls.mjs                            walls.png: every zone, zoom 1
//   node tools/shot-walls.mjs --zone=FOREST,ZENITH       only those
//   node tools/shot-walls.mjs --zoom=2                   the starting box: 128 px of wall
//   node tools/shot-walls.mjs --mag=3 --h=360            closer, shorter
//   node tools/shot-walls.mjs --tiles                    the painted tiles alone, magnified:
//                                                        WALL 2 x 2 with the FACE beside it
//   node tools/shot-walls.mjs --out=some.png
//
// WHAT IT DRAWS. For each zone, a real frame through the game's own renderer, standing on a
// floor sixty into the zone (the camera set up as tools/shot.mjs --floor does), and from it
// the LEFT wall and the RIGHT wall with a strip of the shaft beside each, magnified -- the
// wall against the backdrop, the ledges and the HUD it actually sits among. A wall that
// looks right alone and wrong in the frame is wrong.
//
// --tiles shows the two pieces as painted, the tile twice over in both axes so a seam is a
// cross through the middle, and the face repeated down beside it, at --mag (default 4).

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

const { THEMES } = await import('../src/game/themes.js');
const C = await import('../src/game/constants.js');
const { drawText } = await import('../src/render/font.js');

const ONLY = flag('zone', null);
const zones = THEMES.filter((t) => !ONLY || String(ONLY).split(',').includes(t.name));
const TILES = !!flag('tiles', false);
const OUT = String(flag('out', 'walls.png'));

function blit(dst, src, sx, sy, sw, sh, dx, dy, k) {
  const dd = dst.data, sd = src.data;
  for (let y = 0; y < sh * k; y++) {
    for (let x = 0; x < sw * k; x++) {
      const X = sx + Math.floor(x / k), Y = sy + Math.floor(y / k);
      if (X < 0 || Y < 0 || X >= src.width || Y >= src.height) continue;
      const s = (Y * src.width + X) * 4, d = ((dy + y) * dst.width + dx + x) * 4;
      if (dx + x < 0 || dy + y < 0 || dx + x >= dst.width || dy + y >= dst.height) continue;
      dd[d] = sd[s]; dd[d + 1] = sd[s + 1];
      dd[d + 2] = sd[s + 2]; dd[d + 3] = 255;
    }
  }
}

if (TILES) {
  const W = await import('../src/render/walls.js');
  const { pixToCanvas } = await import('../src/render/decorpaint/util.js');
  const k = Number(flag('mag', 4));
  const cw = (2 * W.WALL_W + W.FACE_W) * k + 16, chh = 2 * W.WALL_H * k + 40;
  const sheet = new HeadlessCanvas(cw * zones.length + 16, chh);
  const g = sheet.getContext('2d');
  g.fillStyle = '#ff00ff'; g.fillRect(0, 0, sheet.width, sheet.height);
  zones.forEach((th, i) => {
    const { wall, face } = W.paintWall(th);
    const wc = new HeadlessCanvas(wall.w, wall.h), fc = new HeadlessCanvas(face.w, face.h);
    pixToCanvas(wall, wc.getContext('2d'));
    pixToCanvas(face, fc.getContext('2d'));
    const x0 = 16 + i * cw;
    g.fillStyle = '#16121e'; g.fillRect(x0 - 4, 0, cw - 8, 36);
    drawText(g, th.name, x0, 8, th.text, 2);
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) blit(sheet, wc, 0, 0, wall.w, wall.h, x0 + tx * wall.w * k, 40 + ty * wall.h * k, k);
      blit(sheet, fc, 0, 0, face.w, face.h, x0 + 2 * wall.w * k, 40 + ty * wall.h * k, k);
    }
  });
  fs.writeFileSync(OUT, encodePNG(sheet));
  console.log(`  ${OUT}  ${sheet.width}x${sheet.height}  tiles of ${zones.length} zone(s)`);
  process.exit(0);
}

const { Game } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { themeIndexFor } = await import('../src/game/themes.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');

const ZOOM = Number(flag('zoom', 1));
const MAG = Number(flag('mag', 2));
const CH = Number(flag('h', 480));      // crop height, backing px
const CW = ZOOM === 2 ? 220 : 150;       // crop width per side: wall plus a strip of shaft

/** The first floor of each zone, found by asking the schedule, not assumed. */
function floorIn(name) {
  for (let f = 0; f < 2300; f++) if (THEMES[themeIndexFor(f)].name === name) return f + 60;
  return 40;
}

function frame(th) {
  // Seeded, so a before/after pair differs only where the code does.
  let a = 12345;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const canvas = new HeadlessCanvas(C.SW, C.SH);
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(0x2f6f1b21);
  const FLOOR = floorIn(th.name);
  const half = ZOOM === 2 ? C.ARENA_HALF_MIN : C.ARENA_HALF_MAX;
  game.openness = ZOOM === 2 ? 0 : 1;
  game.arenaEase = half;
  game.arenaHalfView = half;
  game.zoom = game.zoomView = ZOOM;
  game.viewH = C.VH / game.zoom;
  game.tower.setBounds(C.CX - half, C.CX + half);
  game.player.setBounds(C.CX - half, C.CX + half);
  game.tower.ensure(FLOOR + 12);
  const pl = game.tower.get(FLOOR);
  const p = game.player;
  p.x = p.px = pl.x + pl.w / 2;
  p.y = p.py = pl.y;
  p.floor = FLOOR;
  game.run.maxFloor = FLOOR;
  game.camY = p.y - game.viewH * C.CAM_ANCHOR;
  const r = new Renderer(canvas);
  r.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'high',
    streaks: false, shake: false, trails: true, showFps: false, music: false });
  // A few steps, so the camera and the arena settle; the floor-60 banner is long gone.
  for (let i = 0; i < 24; i++) { bot.step(game, STEP); game.step(STEP); }
  game.flash = 0;
  game.banners.length = 0;
  game.particles.n = 0;     // the arrival burst: not what is being looked at
  r.draw(game, 1, STEP);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(C.PX, 0, 0, C.PX, 0, 0);
  drawHud(ctx, game, Stats.BLANK_ALL(), 1);
  return canvas;
}

const colW = (2 * CW + 12) * MAG + 12;
const sheet = new HeadlessCanvas(colW * zones.length + 12, CH * MAG + 44);
const g = sheet.getContext('2d');
g.fillStyle = '#16121e'; g.fillRect(0, 0, sheet.width, sheet.height);
zones.forEach((th, i) => {
  const cv = frame(th);
  const x0 = 12 + i * colW;
  drawText(g, th.name, x0, 8, th.text, 2);
  const y = Math.round((C.SH - CH) / 2);
  blit(sheet, cv, 0, y, CW, CH, x0, 36, MAG);
  blit(sheet, cv, C.SW - CW, y, CW, CH, x0 + (CW + 12) * MAG, 36, MAG);
});
fs.writeFileSync(OUT, encodePNG(sheet));
console.log(`  ${OUT}  ${sheet.width}x${sheet.height}  ${zones.map((t) => t.name).join(', ')} at zoom ${ZOOM}`);
