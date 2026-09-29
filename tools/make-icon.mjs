// Bake the application icon from the title emblem.
//
//   node tools/make-icon.mjs
//
// Writes build/icon.ico -- what electron-builder stamps on the exe -- and
// assets/icon.png, which main.js hands to BrowserWindow.
//
// The two live apart on purpose. electron-builder treats build/ as its buildResources
// directory and leaves it OUT of the packaged app, so a runtime icon kept there is
// present while developing and missing in the build, which is the worst of both.
//
// The icon is the Duke's shield -- the same art the title screen draws, not a second
// drawing of it that would drift. His FACE would be the obvious choice and it is the
// wrong one: a 48x56 character downsampled to 16x16 is four brown pixels, whereas a
// red shield with a silver saltire on it still reads at that size, which is the only
// thing a 16-pixel icon has to do.
//
// Every size is resampled from one 12x supersample rather than drawn at its own scale.
// Pixel art taken down by nearest-neighbour drops whole features -- at 16x16 a
// one-pixel blade edge either survives whole or vanishes entirely, depending on where
// the grid lands -- and an area average keeps a trace of everything.

import fs from 'node:fs';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';

installDom();

const { emblemCanvas, EMB_W, EMB_H } = await import('../src/render/emblem.js');

const SIZES = [256, 128, 64, 48, 32, 24, 16];
const SS = 12;   // supersample factor

/**
 * Area-average down to (w, h).
 *
 * Averaged in PREMULTIPLIED alpha. Averaging straight RGBA mixes the colour of fully
 * transparent pixels into the edge, and since untouched pixels are transparent BLACK
 * that puts a dark fringe around everything -- most visible at exactly the small sizes
 * this exists for.
 */
function resample(src, w, h) {
  const out = new HeadlessCanvas(w, h);
  const sx = src.width / w, sy = src.height / h;
  const sd = src.data, od = out.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < src.height; yy++) {
        for (let xx = x0; xx < x1 && xx < src.width; xx++) {
          const i = (yy * src.width + xx) * 4;
          const al = sd[i + 3] / 255;
          r += sd[i] * al; g += sd[i + 1] * al; b += sd[i + 2] * al;
          a += al; n++;
        }
      }
      const d = (y * w + x) * 4;
      if (a > 0) { od[d] = r / a; od[d + 1] = g / a; od[d + 2] = b / a; }
      od[d + 3] = Math.round((a / Math.max(1, n)) * 255);
    }
  }
  return out;
}

/**
 * An .ico holding PNG-compressed images at every size.
 *
 * Windows has accepted PNG entries since Vista, and they are what let one file carry a
 * 256 without it being a 256 KB uncompressed bitmap.
 */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);                 // reserved
  head.writeUInt16LE(1, 2);                 // type: icon
  head.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((im, i) => {
    const e = i * 16;
    // 256 is written as 0: the field is one byte and 256 does not fit in it.
    entries[e] = im.size >= 256 ? 0 : im.size;
    entries[e + 1] = im.size >= 256 ? 0 : im.size;
    entries[e + 2] = 0;                     // palette entries
    entries[e + 3] = 0;                     // reserved
    entries.writeUInt16LE(1, e + 4);        // colour planes
    entries.writeUInt16LE(32, e + 6);       // bits per pixel
    entries.writeUInt32LE(im.png.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += im.png.length;
  });
  return Buffer.concat([head, entries, ...images.map((im) => im.png)]);
}

// --- the supersampled source ------------------------------------------------
const big = upscale(emblemCanvas(), SS);
// Square, with the shield filling most of it. A taskbar already pads its icons, so
// leaving much more margin here just makes it look smaller than everything beside it.
const side = Math.round(EMB_H * SS * 1.10);
const square = new HeadlessCanvas(side, side);
const ox = Math.round((side - EMB_W * SS) / 2);
const oy = Math.round((side - EMB_H * SS) / 2);
const sqd = square.data, bgd = big.data;
for (let y = 0; y < big.height; y++) {
  for (let x = 0; x < big.width; x++) {
    const s = (y * big.width + x) * 4;
    const dx = x + ox, dy = y + oy;
    if (dx < 0 || dy < 0 || dx >= side || dy >= side) continue;
    const d = (dy * side + dx) * 4;
    sqd[d] = bgd[s];
    sqd[d + 1] = bgd[s + 1];
    sqd[d + 2] = bgd[s + 2];
    sqd[d + 3] = bgd[s + 3];
  }
}

fs.mkdirSync('build', { recursive: true });
fs.mkdirSync('assets', { recursive: true });

const images = SIZES.map((size) => {
  const c = size === side ? square : resample(square, size, size);
  return { size, png: encodePNG(c) };
});

fs.writeFileSync(path.join('build', 'icon.ico'), ico(images));
fs.writeFileSync(path.join('assets', 'icon.png'), images[0].png);

const total = images.reduce((s, i) => s + i.png.length, 0);
console.log(`  source     ${side}x${side} (emblem ${EMB_W}x${EMB_H} at ${SS}x)`);
console.log(`  sizes      ${SIZES.join(', ')}`);
console.log(`  wrote      build/icon.ico  ${(total / 1024).toFixed(1)} KB`);
console.log(`             assets/icon.png ${(images[0].png.length / 1024).toFixed(1)} KB`);
