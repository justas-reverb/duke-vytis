// Gate for the two generated look-up tables.
//
// Same discipline as test-themes: the model is fluent and confident, so the check has
// to be mechanical. Every rule here corresponds to a line in the prompt it was given.

import { PLAT_STYLES } from '../src/game/platstyles.js';
import { SPEED_RAMPS } from '../src/render/speedramps.js';
import { THEMES } from '../src/game/themes.js';

const ORDER = THEMES.map((t) => t.name);
const STYLES = new Set('plank brick stone slab crystal cloud metal bone rune energy ice star tomb'.split(' '));
const CAPS = new Set('none stud notch rivet spike glow bevel dash tomblid'.split(' '));
const HEX = /^#[0-9a-f]{6}$/i;

const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const sat = (h) => { const c = rgb(h); return Math.max(...c) - Math.min(...c); };

let bad = 0;
const fail = (m) => { console.log('  ' + m); bad++; };

// --- platform styles --------------------------------------------------------
if (PLAT_STYLES.length !== 12) fail('PLAT_STYLES has ' + PLAT_STYLES.length + ' entries, want 12');
const seenStyle = new Map();
PLAT_STYLES.forEach((p, i) => {
  if (p.theme !== ORDER[i]) fail(`order: slot ${i} is ${p.theme}, want ${ORDER[i]}`);
  if (!STYLES.has(p.style)) fail(`${p.theme}: unknown style "${p.style}"`);
  if (!CAPS.has(p.cap)) fail(`${p.theme}: unknown cap "${p.cap}"`);
  if (![0, 1, 2].includes(p.glow)) fail(`${p.theme}: glow ${p.glow} not 0/1/2`);
  if (![1, 2, 3].includes(p.edge)) fail(`${p.theme}: edge ${p.edge} not 1/2/3`);
  if (!(p.speckle >= 0 && p.speckle <= 0.4)) fail(`${p.theme}: speckle ${p.speckle} out of 0..0.4`);
  if (!HEX.test(p.trim)) fail(`${p.theme}: bad trim ${p.trim}`);
  if (seenStyle.has(p.style)) fail(`style "${p.style}" reused: ${seenStyle.get(p.style)} and ${p.theme}`);
  seenStyle.set(p.style, p.theme);
  // "glow 1 or 2 only for the upper cosmic bands"
  if (p.glow > 0 && i < 6) fail(`${p.theme}: glow ${p.glow} on a lower band (slot ${i})`);
});
// The upper bands should actually use the glow they were given.
if (!PLAT_STYLES.slice(7).some((p) => p.glow > 0)) fail('no upper band uses glow at all');

// --- speed ramps ------------------------------------------------------------
if (SPEED_RAMPS.length !== 12) fail('SPEED_RAMPS has ' + SPEED_RAMPS.length + ' entries, want 12');
SPEED_RAMPS.forEach((r, i) => {
  if (r.theme !== ORDER[i]) fail(`ramp order: slot ${i} is ${r.theme}, want ${ORDER[i]}`);
  if (!Array.isArray(r.ramp) || r.ramp.length !== 5) { fail(`${r.theme}: ramp is not 5 colours`); return; }
  for (const c of r.ramp) if (!HEX.test(c)) fail(`${r.theme}: bad colour ${c}`);
  const L = r.ramp.map(lum);
  for (let k = 1; k < 5; k++) if (L[k] <= L[k - 1]) fail(`${r.theme}: ramp not brightening at index ${k}`);
  if (L[4] < 0.55) fail(`${r.theme}: index 4 is not a blazing highlight (lum ${L[4].toFixed(2)})`);
  if (L[0] > 0.12) fail(`${r.theme}: index 0 is not dark (lum ${L[0].toFixed(2)})`);
  // "vivid and saturated, avoid grey" -- checked on the mid band where it matters.
  if (sat(r.ramp[2]) < 0.20) fail(`${r.theme}: midtone is washed out (sat ${sat(r.ramp[2]).toFixed(2)})`);
});

// --- the platform ART --------------------------------------------------------------
//
// A platform is three drawn pieces now -- a left cap, a tile that repeats, and a right
// cap -- rather than thirteen painter functions over four colours. Two things have to
// hold, and only one of them is checkable from a PNG.
//
// THE INVARIANT: the body is PLAT_THICK world units at one art pixel per screen pixel.
// Get that wrong and every ledge in the game is the wrong thickness, silently, because
// nothing else in the renderer knows how tall a platform is meant to be.
//
// THE RULE: the tile must WRAP. Its left edge column is butted against its own right edge
// column, over and over, so a tile that fails it repeats a seam every TILE_W/PX world
// units all the way up a tower that never stops scrolling. This cannot FAIL the build --
// art arrives in stages and a seam is a note for the artist, not a broken game -- so it
// reports, loudly, and the count is in the summary.
{
  const { installDom } = await import('./headless.mjs');
  installDom();
  const P = await import('../src/render/platsprites.js');
  const { PLAT_THICK, PX } = await import('../src/game/constants.js');
  const { THEMES } = await import('../src/game/themes.js');

  if (P.BODY !== PLAT_THICK * PX) {
    fail(`platform art body is ${P.BODY}px against PLAT_THICK ${PLAT_THICK} x PX ${PX} ` +
      `= ${PLAT_THICK * PX} -- every ledge in the game is the wrong thickness`);
  } else {
    console.log(`  ok   platform body ${P.BODY}px = PLAT_THICK ${PLAT_THICK} at PX ${PX}, 1:1`);
  }
  if (P.CELL_H !== P.HEAD + P.BODY) {
    fail(`cell ${P.CELL_H} is not head ${P.HEAD} plus body ${P.BODY}`);
  }

  const missing = THEMES.filter((t) => {
    const a = P.platArt(t.name);
    return !a || a.left.width !== P.CAP_W || a.tile.width !== P.TILE_W;
  });
  if (missing.length) fail(`no art for ${missing.map((t) => t.name).join(', ')}`);

  // EVERY KEY A ZONE USES IS IN THAT ZONE'S OWN PALETTE. Each zone carries its own `pal`
  // now, keyed independently, where there was one PAL for the whole sheet; a key missing
  // from it draws as magenta (platsprites.js), and with twelve palettes a zone reading
  // another's -- or the old shared one -- would be exactly that. Checked per zone, per
  // piece, against the rows the game rasterises.
  {
    const { ZONES: ART } = await import('../src/render/platart.js');
    const before = bad;
    for (const t of THEMES) {
      const z = ART[t.name];
      if (!z) continue;
      if (!z.pal || typeof z.pal !== 'object') { fail(`${t.name}: no palette of its own (pal)`); continue; }
      for (const [k, hex] of Object.entries(z.pal)) {
        if (k.length !== 1 || k === '.' || !HEX.test(hex)) fail(`${t.name}: bad palette entry ${JSON.stringify(k)}: ${hex}`);
      }
      const unmapped = new Set();
      for (const piece of ['left', 'tile', 'right']) {
        for (const row of z[piece]) for (const k of row) if (k !== '.' && !(k in z.pal)) unmapped.add(k);
      }
      if (unmapped.size) fail(`${t.name}: keys ${[...unmapped].join(' ')} are not in its palette -- they draw magenta`);
    }
    if (bad === before) console.log(`  ok   every zone's rows use only its own palette's keys`);
  }

  const seams = THEMES.map((t) => ({ name: t.name, wrap: P.platArt(t.name).wrap }))
    .filter((z) => z.wrap >= 30);
  if (seams.length) {
    console.log(`  note ${seams.length} of ${THEMES.length} tiles do not wrap, so they join ` +
      `visibly every ${P.TILE_W / PX} world units:`);
    for (const z of seams) console.log(`         ${z.name} (edge difference ${z.wrap.toFixed(1)})`);
    console.log('       node tools/shot-platsheet.mjs shows them (platsheet.png); the template to redraw');
    console.log('       into is node tools/platform-template.mjs');
  } else {
    console.log(`  ok   all ${THEMES.length} tiles wrap`);
  }
}

console.log(`\n  ${PLAT_STYLES.length} styles, ${SPEED_RAMPS.length} ramps, ${bad} problems`);
process.exit(bad ? 1 : 0);
