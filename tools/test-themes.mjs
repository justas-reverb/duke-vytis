// Readability gate for the generated palettes.
//
// The local model was told "platforms must be clearly readable against the sky" and
// agreed in prose while shipping white platforms on a white sky. This is the check
// that would have caught it before it reached the screen.

import { THEMES } from '../src/game/themes.js';

const HEX = /^#[0-9a-f]{6}$/i;
const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const mix = (a, b) => {
  const h = (s, i) => parseInt(s.slice(i, i + 2), 16);
  const v = (i) => Math.round((h(a, i) + h(b, i)) / 2).toString(16).padStart(2, '0');
  return '#' + v(1) + v(3) + v(5);
};

// A full screen of high-chroma colour is tiring to look at for a long run, even when
// the contrast is fine. "Chroma load" is saturation weighted by lightness: a dark
// saturated sky is comfortable, a bright saturated one is not. The original VILLAGE, now
// DOWNTOWN (#8866aa), and NEBULA (#660088) both sat well over this and were called out as
// hurting to look at.
const hsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
};
// Colourfulness peaks at mid lightness, where chroma is most intense, and falls away
// toward both black and white. The first attempt used saturation x lightness, which
// flagged ZENITH's bright gold summit -- a deliberate and comfortable look -- while
// missing the purples it was written for.
//
// TWO guards, because eye strain has two separate causes and one number cannot see
// both. I previously loosened the chroma threshold to let ZENITH's near-white gold sky
// through on the grounds that warm hues are gentler than violet. That was wrong --
// the user found ZENITH blinding -- and the reason is the second
// axis: a near-white field filling the whole screen is painful whatever its hue.
//
//   chroma     saturation weighted toward mid lightness. Catches screaming colour.
//   brightness raw lightness. Catches a wall of white.
//
// Neither is a perceptual model. Together they cover the two failures actually seen.
const chromaLoad = (hex) => {
  const { s, l } = hsl(hex);
  return s * (1 - Math.abs(2 * l - 1));
};
const CHROMA_MAX = 0.32;
const LIGHT_MAX = 0.80;   // a full-screen field brighter than this is a flashbang
const lightness = (hex) => hsl(hex).l;

const PLAT_MIN = 2.0;   // platform vs sky
const BG_MIN = 2.0;     // platform vs the backdrop layer actually behind it
const TEXT_MIN = 3.2;   // HUD text vs sky
const EDGE_MIN = 1.25;  // platform top vs its own body, so the 3D edge reads

let bad = 0;
console.log('  theme            plat/sky  plat/bg  text/sky  top/body   chroma  light');
for (const t of THEMES) {
  for (const [k, v] of Object.entries(t)) {
    if (k === 'name') continue;
    const vals = Array.isArray(v) ? v : [v];
    for (const c of vals) if (!HEX.test(c)) { console.log('  BAD HEX', t.name, k, c); bad++; }
  }
  const sky = mix(t.sky[0], t.sky[1]);
  const ps = ratio(t.platTop, sky);
  const ts = ratio(t.text, sky);
  const tb = ratio(t.platTop, t.platBody);
  // What is actually BEHIND a platform is the near backdrop layer, not the raw sky.
  // Checking against the sky alone passed bands whose ledges dissolved into their own
  // wall texture.
  const pb = ratio(t.platTop, t.bgNear);
  const cl = Math.max(chromaLoad(t.sky[0]), chromaLoad(t.sky[1]));
  const lt = Math.max(lightness(t.sky[0]), lightness(t.sky[1]));
  const flag = (v, min) => (v < min ? ' <-- FAIL' : '');
  const line = '  ' + t.name.padEnd(16) + ps.toFixed(2).padStart(6) + '  ' +
    pb.toFixed(2).padStart(7) + '  ' +
    ts.toFixed(2).padStart(8) + '  ' + tb.toFixed(2).padStart(8) + '  ' +
    cl.toFixed(3).padStart(6) + '  ' + lt.toFixed(3).padStart(5) +
    flag(ps, PLAT_MIN) + flag(pb, BG_MIN) + flag(ts, TEXT_MIN) + flag(tb, EDGE_MIN) +
    (cl > CHROMA_MAX ? ' <-- CHROMA' : '') + (lt > LIGHT_MAX ? ' <-- TOO BRIGHT' : '');
  console.log(line);
  if (ps < PLAT_MIN || pb < BG_MIN || ts < TEXT_MIN || tb < EDGE_MIN
      || cl > CHROMA_MAX || lt > LIGHT_MAX) bad++;
}
console.log('');
console.log(THEMES.length + ' themes, ' + bad + ' failing readability');
process.exit(bad ? 1 : 0);
