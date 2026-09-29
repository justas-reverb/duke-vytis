// Guard for the title emblem and the header it sits in.
//
// "The shield goes between the words and the text is still visible" is a layout
// requirement, and a layout requirement is arithmetic -- so it can be checked instead
// of squinted at. Everything here reads headerBox(), the same function drawTitle()
// draws from, rather than a second copy of the numbers that would drift away from it.
//
// What this cannot check is whether the shield LOOKS like a shield. That is what
// `node tools/shot-menu.mjs --emblem --scale=8` is for.

import { installDom } from './headless.mjs';

installDom();

const E = await import('../src/render/emblem.js');
const S = await import('../src/ui/screens.js');
const { VW, VH, PX } = await import('../src/game/constants.js');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

const luma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

// --- the art ----------------------------------------------------------------
const art = E.emblemArt();
const INK = E.emblemInk();

if (art.length !== E.EMB_H) fail(`art is ${art.length} rows, EMB_H says ${E.EMB_H}`);
if (art[0].length !== E.EMB_W) fail(`art is ${art[0].length} columns, EMB_W says ${E.EMB_W}`);

const c = E.emblemCanvas();
if (c.width !== E.EMB_W || c.height !== E.EMB_H) {
  fail(`baked canvas is ${c.width}x${c.height}, art is ${E.EMB_W}x${E.EMB_H}`);
}

// One emblem pixel must be exactly one backing-store pixel, the same invariant the
// character sprite carries. Any other ratio resamples the two-pixel rim into mush.
//
// This was written as `EMB_WW * 2 !== EMB_W`, which is a TAUTOLOGY: emblem.js defined
// EMB_WW as EMB_W / 2, so the check compared a number to itself and passed at every
// value of PX while the invariant it claims to guard quietly became false. Asserting
// against PX is what makes it a test rather than a restatement.
if (E.EMB_WW * PX !== E.EMB_W || E.EMB_WH * PX !== E.EMB_H) {
  fail(`world size ${E.EMB_WW}x${E.EMB_WH} times PX ${PX} is not ${E.EMB_W}x${E.EMB_H}`);
} else {
  ok(`${E.EMB_W}x${E.EMB_H} emblem pixels at PX ${PX}, ${E.EMB_WW}x${E.EMB_WH} world units`);
}

// Every character the art uses has to have a colour, or it silently draws nothing.
const used = new Set();
for (const row of art) for (const ch of row) if (ch !== '.') used.add(ch);
for (const ch of used) if (!INK[ch]) fail(`art uses '${ch}', which has no colour`);

// The silhouette is a shield, and a shield is symmetric -- WITHIN A TOLERANCE.
//
// It used to demand exact mirror symmetry, which was right while the outline was
// computed from an arc. The logo is a drawing now (tools/import-shield.mjs) and a drawn
// rim has a hand on it: a stud a pixel off centre, a highlight that catches one side.
// Exact symmetry is not a property of drawn art and demanding it only trains whoever
// reads this to ignore it. A lopsided SHAPE is still worth catching, so the tolerance is
// generous and the number is reported either way.
{
  let asym = 0, ink = 0;
  for (let y = 0; y < E.EMB_H; y++) {
    for (let x = 0; x < E.EMB_W; x++) {
      const a = art[y][x] !== '.';
      const b = art[y][E.EMB_W - 1 - x] !== '.';
      if (a) ink++;
      if (a !== b) asym++;
    }
  }
  const pc = (asym / ink) * 100;
  if (pc > 1.5) fail(`the shield silhouette is lopsided: ${asym} of ${ink} px (${pc.toFixed(1)}%)`);
  else ok(`shield silhouette symmetric to ${pc.toFixed(2)}% (${asym} of ${ink} px)`);
}

// --- the arms are the right colours, and the charge reads ----------------------
//
// Measured off the ART, not off named palette keys. The old checks named the keys the
// procedural painter used -- 's' for steel, 'v' for the field -- and a named key is
// exactly what stops meaning anything the moment art is imported instead of drawn: the
// imported palette is keyed by population, in digits, and every one of those checks went
// on passing while measuring colours nothing on screen was using.
//
// Colour ROLES are resolved by hue and value here for the same reason shieldstamp.js
// resolves its field that way. A shield that imports grey, or with its gold and its
// gules swapped, is the failure this is for -- both have happened.
{
  const parts = (k) => { const n = parseInt(INK[k].slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hsv = (k) => {
    const [r, g, b] = parts(k);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return { h, s: mx ? d / mx : 0, v: mx / 255 };
  };

  const tally = new Map();
  let ink = 0;
  for (const row of art) {
    for (const ch of row) {
      if (ch === '.') continue;
      ink++;
      tally.set(ch, (tally.get(ch) || 0) + 1);
    }
  }
  const share = (test) => [...tally.entries()].filter(([k]) => test(hsv(k), k))
    .reduce((t, [, n]) => t + n, 0) / ink;

  const gules = (c) => c.h <= 18 && c.s > 0.55;                    // the red field
  const or = (c) => c.h >= 26 && c.h <= 58 && c.s > 0.30 && c.v > 0.42;   // the gold rim
  const argent = (c) => c.v > 0.62 && c.s < 0.26;                  // horse and plate

  const f = share(gules), g = share(or), a = share(argent);
  if (f < 0.18) fail(`the field is only ${(f * 100).toFixed(1)}% red -- these are not the arms`);
  else ok(`gules field over ${(f * 100).toFixed(0)}% of the shield`);
  if (g < 0.06) fail(`only ${(g * 100).toFixed(1)}% gold -- the rim did not survive the import`);
  else ok(`or rim and mounts ${(g * 100).toFixed(0)}%`);
  if (a < 0.03) fail(`only ${(a * 100).toFixed(1)}% argent -- the rider will not read`);
  else ok(`argent charge ${(a * 100).toFixed(0)}%, the horse and the knight`);

  // Argent on gules: the whole point of the charge. Same rule the character's palette is
  // held to -- touching materials must differ in value.
  const pick = (test) => [...tally.entries()].filter(([k]) => test(hsv(k)))
    .sort((x, y2) => y2[1] - x[1])[0];
  const fk = pick(gules), ak = pick(argent);
  if (!fk || !ak) fail('the emblem has no field or no charge to compare');
  else {
    const d = Math.abs(luma(INK[ak[0]]) - luma(INK[fk[0]]));
    if (d < 40) fail(`charge against field is only ${d.toFixed(0)} luma apart`);
    else ok(`charge reads against the field, ${d.toFixed(0)} luma apart`);
  }
}

// --- the header -------------------------------------------------------------
const b = S.headerBox();

// The glow reaches GLOW_RINGS outside the frame. If that is off-screen it is clipped
// on one side and not the other, which looks like a bug because it is one.
if (b.x - S.GLOW_RINGS < 0 || b.x + b.w + S.GLOW_RINGS > VW) {
  fail(`the box plus its halo spans ${b.x - S.GLOW_RINGS}..${b.x + b.w + S.GLOW_RINGS} of ${VW}`);
} else if (b.y - S.GLOW_RINGS < 0) {
  fail(`the halo starts at y=${b.y - S.GLOW_RINGS}`);
} else {
  ok(`box ${b.w}x${b.h} at (${b.x}, ${b.y}), halo clear of every edge`);
}

// Both lines inside the frame, with the padding the frame was sized for.
for (const [what, w] of [['title row', b.titleW], ['subtitle', b.subW]]) {
  if (w > b.w - S.BOX_PAD * 2) fail(`${what} is ${w} wide inside a ${b.w} box`);
}

// THE REQUIREMENT: the shield is between the words and covers neither of them.
if (b.emblem.x0 < b.wordL.x1) {
  fail(`the shield starts at ${b.emblem.x0.toFixed(1)} and DUKE ends at ${b.wordL.x1} -- it covers the E`);
} else if (b.emblem.x1 > b.wordR.x0) {
  fail(`the shield ends at ${b.emblem.x1.toFixed(1)} and VYTIS starts at ${b.wordR.x0} -- it covers the V`);
} else {
  const gapL = b.emblem.x0 - b.wordL.x1;
  const gapR = b.wordR.x0 - b.emblem.x1;
  if (Math.min(gapL, gapR) < 6) fail(`only ${Math.min(gapL, gapR).toFixed(1)} units of air beside the shield`);
  else ok(`${gapL.toFixed(0)} and ${gapR.toFixed(0)} units of air either side of the shield`);
}

// The words and the shield bob inside a frame that does not. Check the extremes, not
// the rest position -- the rest position is never the tight one.
for (const bob of [-S.BOB, S.BOB]) {
  if (b.emblem.y0 + bob < b.y + 4) fail(`at bob ${bob} the shield reaches y=${(b.emblem.y0 + bob).toFixed(1)}, inside the frame at ${b.y}`);
  if (b.sub.y1 + bob > b.y + b.h - 4) fail(`at bob ${bob} the subtitle reaches y=${b.sub.y1 + bob}, the frame ends at ${b.y + b.h}`);
  // The shield hangs below the letters; it must not land on the subtitle.
  if (b.emblem.y1 > b.sub.y0 - 2) fail(`the shield bottom (${b.emblem.y1.toFixed(1)}) meets the subtitle top (${b.sub.y0})`);
}

// The header is a header: it has to leave the screen to the game.
const bottom = b.y + b.h + S.GLOW_RINGS;
if (bottom > VH * 0.45) fail(`the header reaches y=${bottom} of ${VH} -- it is eating the play area`);
else ok(`header ends at y=${bottom}, ${Math.round((bottom / VH) * 100)}% down the screen`);

console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
