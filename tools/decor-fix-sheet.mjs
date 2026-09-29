// The handful of ledge elements worth REDRAWING BY HAND, and what is wrong with each.
//
//   node tools/decor-fix-sheet.mjs                 decor-fixes.png
//   node tools/decor-fix-sheet.mjs --mag=6         bigger
//
// All 23 elements are drawn in code (src/render/decorpaint/) and every one of them was
// checked against the user's board and redrawn where it read as the wrong object. This
// sheet is the shorter list: the five where a hand is still better than an algorithm --
// organic mass, a figure's pose, cloth that folds as it moves, and light. It is FOR THE
// ARTIST, so each block says what the code draws today and where it still falls short (all
// five were redrawn from the user's second board, assets/decor-fixes-reference.webp), and
// what to draw instead, at the exact size the file has to be.
//
// The whole list, with every element and its box, is tools/decor-sheet.mjs; this one is a
// subset with a brief. Both read the registry, so neither can disagree with the game.
//
//   LEFT    what the game draws now: every variant and frame, magnified, and a 1x strip
//           beside it so the real size on screen is not a surprise.
//   MIDDLE  the file to deliver, laid out as the importer wants it -- frames left to
//           right, variants top to bottom -- with today's drawing faint inside it.
//   RIGHT   what the code draws now and its weak part, what to draw, and the exact PNG
//           size and name.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const { THEMES } = await import('../src/game/themes.js');
const D = await import('../src/render/decor.js');
const { ZONE_BY_NAME } = await import('../src/render/decorpaint/index.js');
const { drawText, textWidth } = await import('../src/render/font.js');

const argv = process.argv.slice(2);
const num = (n, d) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? Number(a.slice(a.indexOf('=') + 1)) : d;
};
const MAG = num('mag', 4);

// The five, in the order they matter. `wrong` is what the code draws today and where it
// still falls short of a hand; `draw` is the brief. Kept here rather than in
// the registry because it is a request to a person, not something the game reads.
const FIXES = [
  {
    zone: 'FOREST', key: 'TREE',
    why: 'THE BIGGEST SPRITE IN THE GAME AFTER THE DUKE, AND THE ONE A PLAYER SEES MOST',
    wrong: [
      'REDRAWN IN CODE FROM THE BOARD: A SAPLING, A LOW TWO-WAY FORK',
      'AND A TALL TREE WITH ITS MASSES STACKED LEFT AND RIGHT. EACH',
      'CROWN IS THREE OR FOUR BIG LEAF MASSES LIT FROM THE UPPER LEFT,',
      'SKY BETWEEN THEM, THE SHADED UNDERSIDES TEAL SO THEY DO NOT SINK',
      'INTO THE GREEN BACKDROP. STILL THE WEAK PART: EACH MASS IS AN',
      'ELLIPSE WITH LOBES ROUND IT AND ITS LEAVES ARE CELLS OF A',
      'JITTERED GRID, SO THE CROWNS ARE EVENER THAN DRAWN FOLIAGE; AND',
      'THE BOARD\'S SQUAT TREES ARE STRETCHED ONTO LONG TRUNKS TO FILL',
      'THE TALL SLOT.',
    ],
    draw: [
      'THREE TREES THAT DIFFER IN SHAPE, NOT JUST IN HEIGHT: A SAPLING,',
      'A LOW FORK LEANING ONE WAY, A TALL ONE. BREAK THE CANOPY INTO',
      'A FEW BIG MASSES WITH REAL GAPS AND SKY THROUGH THEM, LIT FROM',
      'THE UPPER LEFT, RATHER THAN EVEN CLUMPS. DARK TRUNK, PALE RIM',
      'ON THE TOP OF EACH MASS: THE FOREST BACKDROP IS ALSO GREEN AND',
      'THE TREE HAS TO SIT IN FRONT OF IT.',
      'KEEP THE TOP 16 ROWS OF THE BOX EMPTY -- THE LEDGE ABOVE IS',
      'THERE, AND ANYTHING HIGHER STANDS ON ITS WALKING SURFACE.',
    ],
  },
  {
    zone: 'DUNGEON', key: 'SLUMPED_SKELETON',
    why: 'A FIGURE WITH A POSE: THE ONE THING PROCEDURAL DRAWING IS WORST AT',
    wrong: [
      'REDRAWN IN CODE FROM THE BOARD: TWO DIFFERENT DEAD MEN. ONE',
      'SITS UPRIGHT AGAINST A STUB OF WALL, SKULL FACING US, JAW OPEN;',
      'ONE HAS SLID DOWN, HEAD FALLEN ONTO THE CHEST, PROPPED ON ONE',
      'ARM WITH THE HAND SPLAYED. THE CAGE IS AN EGG OF BONE CUT BY',
      'DROOPING SLITS, THE LIMBS TAPER, THE PELVIS IS A BASIN.',
      'STILL THE WEAK PART, THE POSE: THE FIRST SLID-DOWN MAN READ AS',
      'A SKELETON CRAWLING. EACH LONG BONE IS THREE STEPPED CAPSULES,',
      'NOT A DRAWN TAPER, AND THE CAGE HOLDS FEWER RIBS THAN THE BOARD\'S.',
    ],
    draw: [
      'TWO SEATED SKELETONS SLUMPED AGAINST A STUB OF WALL, AS ON THE',
      'BOARD: ONE UPRIGHT WITH THE SKULL FACING US, ONE FALLEN LOWER',
      'WITH THE HEAD TURNED ONTO THE CHEST.',
      'DRAW THE CAGE AS AN EGG OF BONE WITH SLITS CURVING DOWN TO THE',
      'FLANKS, NOT AS BARS. LET THE LIMBS TAPER, AND KEEP THE ARMS',
      'THINNER THAN THE LEGS.',
      'BONE IS THE LIGHTEST THING IN THE CRYPT: KEEP IT OFF THE LEDGE',
      'TOP ROW, AND GIVE THE FIGURE A DARK CONTACT ROW WHERE IT SITS.',
    ],
  },
  {
    zone: 'CITADEL', key: 'BANNER',
    why: 'CLOTH THAT MOVES -- FOUR FRAMES OF IT, WHICH CODE CANNOT FAKE WELL',
    wrong: [
      'REDRAWN IN CODE FROM THE BOARD: A CAPPED STAFF IN A STONE',
      'PLINTH, A CROSSBAR WITH GOLD FINIALS, A GOLD CLOTH ON TWO RINGS.',
      'OVER FOUR FRAMES THE FREE EDGE FLARES, THE CLOTH SWINGS AND',
      'WIDENS, THE TORN POINT LIFTS AND FALLS, AND FRAME 4 EASES BACK.',
      'STILL THE WEAK PART: THE CASTLE NEVER BENDS -- AT 11 PX A PIXEL',
      'OF SWING THROUGH IT BROKE EVERY TOWER, SO IT RIDES THE CLOTH',
      'WHOLE -- AND EACH FRAME IS THE ONE FLAT CLOTH CARRIED TO A NEW',
      'SHAPE, SO IT BENDS AND SWINGS BUT NEVER TWISTS OR FOLDS OVER.',
    ],
    draw: [
      'FOUR FRAMES OF ONE BANNER BREATHING IN A DRAUGHT: THE FREE EDGE',
      'SWINGS, THE FOLDS DEEPEN AND SHALLOW, THE TORN POINT AT THE',
      'BOTTOM LIFTS AND FALLS, AND THE LIT SIDE SHIFTS WITH THE FOLD.',
      'GOLD FIELD, DARK CASTLE CHARGE, A CROSSBAR AND A STAFF THAT DO',
      'NOT MOVE. THE CHARGE MAY DISTORT WITH THE CLOTH BUT MUST STAY',
      'READABLE IN ALL FOUR FRAMES.',
      'FRAME 4 HAS TO LEAD BACK INTO FRAME 1 WITHOUT A JUMP.',
    ],
  },
  {
    zone: 'DOWNTOWN', key: 'LANTERN_POST',
    why: 'A LIGHT SOURCE AT NIGHT: THE GLOW IS THE POINT, AND LIGHT IS WHERE A HAND BEATS CODE',
    wrong: [
      'REDRAWN IN CODE FROM THE BOARD: A SQUARE POST WITH FOUR IRON',
      'BANDS ON A PLINTH, AN ARM, BRACE AND RING, AND A HALO OF THREE',
      'FLAT ORANGE RINGS DITHERED INTO EACH OTHER. THE LIGHT IS STILL',
      'THE WEAK PART: THE RINGS ARE EVEN AND CONCENTRIC, AND THIN',
      'ORANGE OVER THE VIOLET WALL TURNS A DUSKY BROWN AT THE EDGE',
      'RATHER THAN FADING INTO A WARM DARK.',
    ],
    draw: [
      'TWO FRAMES, A LANTERN BURNING LOW AND BRIGHT. GIVE IT A REAL',
      'HALO: A WARM CORE AT THE FLAME, A FALLOFF IN TWO OR THREE',
      'STEPS, AND A LITTLE OF THAT WARMTH LANDING ON THE ARM, THE POST',
      'AND THE TIMBER UNDER IT, SO THE LIGHT TOUCHES WHAT IS AROUND',
      'IT. DITHER THE OUTER STEP RATHER THAN FADING IT SMOOTHLY.',
      'THE WOOD SHOULD MATCH THE DOWNTOWN LEDGE, A TIMBER GALLERY IN',
      'HONEY-COLOURED NEW WOOD, WITH THE POST THE SAME WOOD WEATHERED',
      'DARKER, AS ON THE BOARD -- NOT THE OLD GREY-BROWN.',
      'KEEP THE HALO OFF THE LEDGE TOP ROW -- THAT ROW IS THE LINE THE',
      'PLAYER TRACKS AT SPEED.',
    ],
  },
  {
    zone: 'SWAMP', key: 'REED_CLUMP',
    why: 'MANY THIN ORGANIC BLADES: THE SECOND HARDEST THING HERE TO GET RIGHT IN CODE',
    wrong: [
      'REDRAWN IN CODE FROM THE BOARD, IN A BOX WIDENED TO 32 X 40: A',
      'FAN, A WINDSWEPT CLUMP WITH A SNAPPED REED, A LOW TUFT WITH ONE',
      'TALL SPEAR. EACH BLADE IS A LEAF OF ITS OWN WIDTH TAPERING TO A',
      'POINT, AND THE WHOLE CLUMP SWAYS ABOUT ITS ROOTS.',
      'STILL THE WEAK PART: EVERY BLADE IS ONE SMOOTH CURVE SOLVED FROM',
      'ITS ROOT, TIP AND TURN, SO THE CLUMPS ARE TIDIER THAN THE',
      'BOARD\'S; THE FIRST LAYOUTS READ AS A FISH\'S BACKBONE AND A POLE.',
    ],
    draw: [
      'THREE CLUMPS: A FULL FOUNTAIN, A WINDSWEPT ONE WITH A SNAPPED',
      'REED, A LOW TUFT WITH ONE TALL SPEAR. BLADES OF DIFFERENT',
      'WIDTHS THAT TAPER TO A POINT, SOME CROSSING IN FRONT OF OTHERS',
      'WITH A DARK EDGE WHERE THEY CROSS, AND A FEW BENT RIGHT OVER.',
      'TWO FRAMES THAT SWAY THE WHOLE CLUMP, NOT ONLY THE TIPS.',
      'OLIVE GREEN, LIT ON THE UPPER LEFT EDGE OF EACH BLADE; THE BOG',
      'BEHIND THEM IS DARK TEAL, SO THEY MUST NOT BE ITS GREEN.',
      'A DARK KNOT OF MUD WHERE THE CLUMP MEETS THE LEDGE.',
    ],
  },
];

const TH = (name) => THEMES.find((t) => t.name === name);
// A theme's `sky` is a gradient pair; the panels behind the sprites want one flat colour
// close to what the element actually hangs against, which is the near backdrop.
const BEHIND = (th) => th.bgNear || (Array.isArray(th.sky) ? th.sky[1] : th.sky);
const W = 2100;

// Every variant and frame stands in ONE row, each scaled to a common height so a 136-px
// tree does not take a column of its own three times over.
const blocks = FIXES.map((fx) => {
  const e = ZONE_BY_NAME[fx.zone].ELEMENTS[fx.key];
  const mag = Math.max(2, Math.min(MAG, Math.floor(330 / e.box[1])));
  const cellW = e.box[0] * mag + 14;
  const cellH = e.box[1] * mag + 22;
  const cells = e.variants * e.frames;
  const fileH = e.box[1] * e.variants * 2 + 44;
  const textH = (fx.wrong.length + fx.draw.length) * 13 + 76;
  return { fx, e, mag, cellW, cellH, cells, fileH, h: Math.max(cellH, fileH, textH, e.box[1] + 20) + 60 };
});

const HEAD_H = 150;
const H = HEAD_H + blocks.reduce((s, b) => s + b.h, 0) + 30;

const sheet = new HeadlessCanvas(W, H);
const g = sheet.getContext('2d');
g.fillStyle = '#15101f'; g.fillRect(0, 0, W, H);
const text = (s, x, y, c = '#e8e4f0', sc = 1) => drawText(g, s, x, y, c, sc, 'left');

text('THE FIVE WORTH DRAWING BY HAND', 16, 12, '#ffe23d', 3);
[
  ['ALL 23 LEDGE ELEMENTS ARE DRAWN IN CODE AND IN THE GAME. THESE FIVE ARE THE ONES A HAND WOULD BEAT AN ALGORITHM AT:', '#e8e4f0'],
  ['ORGANIC MASS, A FIGURE, CLOTH THAT FOLDS AS IT MOVES, AND LIGHT. NOTHING HERE IS BROKEN -- IT ALL WORKS TODAY.', '#e8e4f0'],
  ['DELIVER ONE PNG PER ELEMENT, AT THE EXACT SIZE PRINTED IN ITS BLOCK: FRAMES LEFT TO RIGHT, VARIANTS TOP TO BOTTOM,', '#8fd0ff'],
  ['TRANSPARENT BACKGROUND, NO SCALING, ONE ART PIXEL PER PIXEL -- THE DUKE IS 112 PX TALL AT THAT SCALE.', '#8fd0ff'],
  ['DROP THEM IN ASSETS/DECOR/ AND THEY REPLACE THE CODE DRAWING, ONE ELEMENT AT A TIME. THE REST KEEPS WORKING.', '#8fd0ff'],
  ['MATCH THE ART AROUND THEM: A 1-PX DARK OUTLINE (NONE ON FLAMES, GLOWS OR THREADS), 3-5 TONES PER MATERIAL,', '#b8b4c8'],
  ['LIT FROM THE UPPER LEFT, AND NOTHING BRIGHT ALONG THE BOTTOM ROW, WHICH SITS ON THE LEDGE THE PLAYER IS WATCHING.', '#b8b4c8'],
].forEach(([l, c], i) => text(l, 16, 52 + i * 11, c, 1));

let y = HEAD_H;
for (const [i, b] of blocks.entries()) {
  const { fx, e } = b;
  const th = TH(fx.zone);
  g.fillStyle = '#1b1530'; g.fillRect(0, y - 8, W, 2);
  text(`${i + 1}. ${fx.zone} - ${e.name}`, 16, y, th.accent || '#ffffff', 2);
  text(fx.why, 16 + textWidth(`${i + 1}. ${fx.zone} - ${e.name}`, 2) + 24, y + 6, '#8a8fa8', 1);
  const top = y + 30;

  // LEFT: every variant and frame as the game draws it now, magnified, over the colour it
  // hangs against in play, so the contrast is the one the player sees.
  text(`AS THE GAME DRAWS IT NOW (${b.mag}X)`, 16, top - 12, '#8a8fa8', 1);
  let cx = 16;
  for (let v = 0; v < e.variants; v++) {
    for (let f = 0; f < e.frames; f++) {
      g.fillStyle = BEHIND(th); g.fillRect(cx, top, b.cellW - 8, b.cellH - 10);
      const c = D.spriteFor(fx.zone, fx.key, v, f, th);
      g.drawImage(c.img, c.sx, c.sy, e.box[0], e.box[1], cx + 6, top + 6, e.box[0] * b.mag, e.box[1] * b.mag);
      text(`V${v + 1}${e.frames > 1 ? ` F${f + 1}` : ''}`, cx + 6, top + b.cellH - 14, '#8a8fa8', 1);
      cx += b.cellW;
    }
  }

  // ...and the same drawing at its real size on screen, which is what has to read.
  const x1 = cx + 10;
  text('REAL SIZE', x1, top - 12, '#5a5f78', 1);
  g.fillStyle = BEHIND(th); g.fillRect(x1, top, e.box[0] + 8, e.box[1] + 8);
  const c0 = D.spriteFor(fx.zone, fx.key, 0, 0, th);
  g.drawImage(c0.img, c0.sx, c0.sy, e.box[0], e.box[1], x1 + 4, top + 4, e.box[0], e.box[1]);

  // MIDDLE: the file to deliver, at 2x, laid out the way the importer reads it.
  const fx0 = x1 + e.box[0] + 48;
  const fw = e.box[0] * e.frames * 2, fh = e.box[1] * e.variants * 2;
  text('THE FILE TO DELIVER (SHOWN 2X)', fx0, top - 12, '#8fd0ff', 1);
  g.fillStyle = '#18142a'; g.fillRect(fx0, top, fw, fh);
  g.fillStyle = '#2e2646';
  for (let xx = 0; xx <= fw; xx += 2 * 8) g.fillRect(fx0 + xx, top, 1, fh);
  for (let yy = 0; yy <= fh; yy += 2 * 8) g.fillRect(fx0, top + yy, fw, 1);
  g.globalAlpha = 0.3;
  for (let v = 0; v < e.variants; v++) {
    for (let f = 0; f < e.frames; f++) {
      const c = D.spriteFor(fx.zone, fx.key, v, f, th);
      g.drawImage(c.img, c.sx, c.sy, e.box[0], e.box[1],
        fx0 + f * e.box[0] * 2, top + v * e.box[1] * 2, e.box[0] * 2, e.box[1] * 2);
    }
  }
  g.globalAlpha = 1;
  // The cell borders, so frame and variant boundaries are unmistakable.
  g.fillStyle = '#5aa0ff';
  for (let f = 0; f <= e.frames; f++) g.fillRect(fx0 + f * e.box[0] * 2 - (f === e.frames ? 1 : 0), top, 1, fh);
  for (let v = 0; v <= e.variants; v++) g.fillRect(fx0, top + v * e.box[1] * 2 - (v === e.variants ? 1 : 0), fw, 1);

  const anchor = e.anchor === 'hang' ? 'HANGS UNDER THE LEDGE'
    : e.anchor === 'float' ? `FLOATS ${e.lift} PX ABOVE IT` : 'STANDS ON THE LEDGE';
  const file = `${fx.zone}-${e.name.replace(/ /g, '-')}.PNG`;
  text(`${file}   ${e.box[0] * e.frames} X ${e.box[1] * e.variants} PX`, fx0, top + fh + 8, '#ffe23d', 1);
  text(`ONE CELL ${e.box[0]} X ${e.box[1]} PX, ${e.frames} FRAME${e.frames > 1 ? 'S' : ''} ACROSS, ${e.variants} VARIANT${e.variants > 1 ? 'S' : ''} DOWN`,
    fx0, top + fh + 20, '#b8b4c8', 1);
  text(anchor, fx0, top + fh + 32, '#b8b4c8', 1);

  // RIGHT: the brief.
  const tx = Math.max(fx0 + fw + 48, 1120);
  text('WHAT THE CODE DRAWS NOW, AND WHERE IT FALLS SHORT', tx, top - 12, '#ff8a8a', 1);
  fx.wrong.forEach((l, k) => text(l, tx, top + k * 13, '#d8b8b8', 1));
  const dy = top + fx.wrong.length * 13 + 18;
  text('WHAT TO DRAW', tx, dy - 12, '#8fd0ff', 1);
  fx.draw.forEach((l, k) => text(l, tx, dy + k * 13, '#c8d8e8', 1));

  y += b.h;
}

fs.writeFileSync('decor-fixes.png', encodePNG(sheet));
console.log(`  decor-fixes.png  ${W}x${H}  ${FIXES.length} elements`);
