// A PNG reader, because these tools run in node with no canvas.
//
// Shared by import-sprite.mjs, import-shield.mjs, import-platforms.mjs and the headless
// Image in headless.mjs. It was a private copy inside the first of those; a second
// importer is the point at which a second copy of a decoder stops being a convenience and
// starts being a thing that can disagree with itself.
//
// Every filter type. 8-bit greyscale, RGB and RGBA come back exactly as they always did
// (ch 1, 3, 4). PALETTE images -- what pixel art is usually saved as, often at 1, 2 or 4
// bits a pixel, with transparency in a tRNS chunk -- and 8-bit grey+alpha come back
// expanded to RGBA (ch 4). The background tiles are the first art here drawn by someone
// else's tool, and a reader that only knew three of the five colour types would have
// rejected half of what an art program saves. Interlaced and 16-bit files are refused
// with a message rather than decoded wrong.

import fs from 'node:fs';
import zlib from 'node:zlib';

export function readPNG(file) {
  const b = fs.readFileSync(file);
  let p = 8, w, h, bd, ct, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('ascii', p + 4, p + 8);
    const d = b.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; interlace = d[12]; }
    else if (type === 'PLTE') palette = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  if (interlace) throw new Error(`${file}: interlaced PNG -- save it without interlacing`);
  if (bd === 16) throw new Error(`${file}: 16-bit PNG -- save it as 8-bit`);
  if (ct === 3 ? ![1, 2, 4, 8].includes(bd) : bd !== 8) {
    throw new Error(`${file}: unsupported bit depth ${bd} for colour type ${ct}`);
  }
  const fileCh = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!fileCh) throw new Error(`${file}: unknown PNG colour type ${ct}`);

  // Unfilter into raw scanline bytes. Filters work on BYTES, with the byte distance to the
  // "previous pixel" at least one even when pixels are smaller than a byte.
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((w * bd * fileCh) / 8);
  const bpp = Math.max(1, (bd * fileCh) >> 3);
  const lines = Buffer.alloc(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? lines[o + x - bpp] : 0;
      const bv = y > 0 ? lines[o - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? lines[o - stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += bv;
      else if (f === 3) v += (a + bv) >> 1;
      else if (f === 4) {
        const pa = Math.abs(bv - c), pb = Math.abs(a - c), pc = Math.abs(a + bv - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bv : c);
      }
      lines[o + x] = v & 255;
    }
    o += stride;
  }

  // The three types that always worked keep their exact old shape.
  if (ct === 0 || ct === 2 || ct === 6) return { w, h, ch: fileCh, data: lines };

  const out = Buffer.alloc(w * h * 4);
  if (ct === 4) {
    for (let i = 0; i < w * h; i++) {
      const g = lines[i * 2];
      out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = lines[i * 2 + 1];
    }
    return { w, h, ch: 4, data: out };
  }

  // Palette: unpack 1/2/4/8-bit indices, look each up, alpha from tRNS (opaque if absent).
  if (!palette) throw new Error(`${file}: palette PNG with no PLTE chunk`);
  const perByte = 8 / bd, mask = (1 << bd) - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const byte = lines[y * stride + Math.floor(x / perByte)];
      const shift = (perByte - 1 - (x % perByte)) * bd;
      const idx = (byte >> shift) & mask;
      const q = (y * w + x) * 4;
      out[q] = palette[idx * 3] || 0;
      out[q + 1] = palette[idx * 3 + 1] || 0;
      out[q + 2] = palette[idx * 3 + 2] || 0;
      out[q + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }
  return { w, h, ch: 4, data: out };
}
