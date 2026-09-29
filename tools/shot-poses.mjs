// Every pose the game can draw, by NAME, as the game draws it.
//
//   node tools/shot-poses.mjs
//   node tools/shot-poses.mjs --scale=3 --left
//
// Baked from FRAMES, the same grids drawSprite blits, rather than from the sheet. A
// reference built from the source art answers "what did the artist send"; this answers
// "what does the game show", which is the question that has been wrong more often -- two
// poses have been mapped to the wrong drawing, a run frame spent a while as a fast fall,
// and the only way anyone found out was looking at them side by side with their names on.
//
// The name is the point. A contact sheet of cells tells you the import worked; a contact
// sheet of POSES tells you the mapping is right.

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

const Z = Number(flag('scale', 2));
const LEFT = !!flag('left', false);

const S = await import('../src/render/sprites.js');
const { drawText } = await import('../src/render/font.js');

const grids = LEFT ? S.FRAMES_LEFT : S.FRAMES;
const COLS = Number(flag('cols', 5));
const PAD = 8, LABEL = 22, HEAD = 40;
const tw = S.SPR_W * Z + PAD, th = S.SPR_H * Z + LABEL;
const rows = Math.ceil(S.NAMES.length / COLS);

const c = new HeadlessCanvas(tw * COLS, HEAD + th * rows);
const g = c.getContext('2d');
g.fillStyle = '#15101f';
g.fillRect(0, 0, c.width, c.height);

drawText(g, `DUKE VYTIS - ALL ${S.NAMES.length} POSES${LEFT ? ', FACING LEFT' : ''}`,
  10, 8, '#ffe23d', 2, 'left');
drawText(g, `${S.SPR_W}x${S.SPR_H} ART = ${S.BODY_W}x${S.BODY_H} WORLD AT ${Z}X`,
  10, 26, '#8a8fa8', 1, 'left');

S.NAMES.forEach((name, i) => {
  const x = (i % COLS) * tw + 4, y = HEAD + ((i / COLS) | 0) * th;
  g.fillStyle = '#0d0a16';
  g.fillRect(x, y, S.SPR_W * Z, S.SPR_H * Z);

  const buf = grids[name];
  for (let r = 0; r < S.SPR_H; r++) {
    let q = 0;
    while (q < S.SPR_W) {
      const col = buf[r][q];
      if (!col) { q++; continue; }
      let run = 1;
      while (q + run < S.SPR_W && buf[r][q + run] === col) run++;
      g.fillStyle = col;
      g.fillRect(x + q * Z, y + r * Z, run * Z, Z);
      q += run;
    }
  }

  // The floor he is positioned by, so a pose that does not stand on it is visible.
  const drop = (S.FOOT_DROP[name] || 0) * 4;        // world units back to art pixels
  g.fillStyle = '#4a4266';
  g.fillRect(x, y + (S.SPR_H - drop) * Z - 1, S.SPR_W * Z, 1);

  drawText(g, name.toUpperCase(), x + 2, y + S.SPR_H * Z + 4, '#ffe23d', 1, 'left');
  drawText(g, `CELL ${S.POSE_ART[name]}`, x + 2, y + S.SPR_H * Z + 14, '#8a8fa8', 1, 'left');
});

const out = String(flag('out', LEFT ? 'poses-left.png' : 'poses.png'));
fs.writeFileSync(out, encodePNG(c));
console.log(`  ${out}  ${c.width}x${c.height}  ${S.NAMES.length} poses`);
