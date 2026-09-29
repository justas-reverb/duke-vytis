// Art briefs for the textures around the play and the effects over it: what the code draws
// today, and what a hand could still improve.
//
//   node tools/brief-sheets.mjs        brief-textures.png and brief-effects.png
//
// WHAT CHANGED. These sheets first went out while all five things on them were drawn the
// old way: rectangles in world units, four screen pixels to the unit and four times
// chunkier than the Duke and the ledges, and a trail of square specks. The user then asked
// for them to be drawn in code instead, and they are, at one art pixel per screen pixel and
// in the shapes this brief asked for:
//
//   TEXTURES  the start floor (src/render/ground.js), the rising floor (risefloor.js) and
//             the side walls (walls.js, one painter per zone in wallpaint/).
//   EFFECTS   the speed streaks (streaks.js) and the combo trail (sparks.js).
//
// The sheets went on printing the old brief beside frames of the new drawing -- a "flat
// brown slab" beside flagstones, a "loading bar" beside a tide of fire, streaks that "pass
// over everything, the Duke included" when they now run behind him. So each block now says
// what the code draws, what a hand could still do better, and which files would replace the
// code's drawing. None of the five loads a PNG yet: every one would need a loader written
// first, as the backgrounds and the ledge furniture have (docs/ART-BRIEF.md).
//
// Each block shows a REAL frame of the game (rendered here through tools/shot.mjs, one
// process at a time). The text is the game's pixel font, wrapped by hand, so every line is
// measured against its column as the sheet is drawn and one that would run past it is
// reported -- otherwise an overrun only shows in the PNG.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();
const { drawText, textWidth } = await import('../src/render/font.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'));
function shot(name, args) {
  const out = path.join(TMP, `${name}.png`);
  execFileSync(process.execPath, ['tools/shot.mjs', ...args, `--out=${out}`], { stdio: 'ignore' });
  const img = new Image();
  img.src = out;
  if (!img.width) throw new Error(`shot.mjs produced nothing for ${name} (${args.join(' ')})`);
  return img;
}

// The frames. Each one is chosen to show one thing; the comments say what.
const F = {
  start: shot('start', ['--sec=0.02']),                              // standing on the start floor
  rise: shot('rise', ['--floor=640', '--sec=0.62']),                 // the rising floor on screen
  fast: shot('fast', ['--demo', '--sec=45']),                        // the demo at full speed, big combo
  near: shot('near', ['--demo', '--sec=45', '--crop=0,0,560,330', '--follow', '--scale=2']),
};

// --- the briefs -----------------------------------------------------------------------
// crop: [x, y, w, h] of the frame, shown at `k` times.
const TEXTURES = [
  {
    title: 'THE START FLOOR',
    img: F.start, crop: [0, 250, 1920, 830], k: 0.62,
    now: [
      'A COURSE OF FLAGSTONES WHOSE TOP ROW IS THE LANDING LINE -- THE',
      'BRIGHTEST CLEAN ROW, WITH A DARK ROW OVER IT AS EVERY LEDGE HAS --',
      'ON ROUNDED RUBBLE PACKED IN DARK EARTH, LIT FROM THE UPPER LEFT,',
      'EACH STONE SINKING WHOLE INTO THE ONE DEEP COLOUR BELOW. AT THE',
      'DUKE\'S SCALE. PAINTED ONCE AS ONE STRIP ACROSS THE WIDEST SHAFT,',
      'NOT TILED: RUBBLE REPEATED EVERY 64 PX READ AS WALLPAPER.',
    ],
    draw: [
      'THE STONES ARE GENERATED: A FIELD OF ROUNDED CELLS, EVERY ONE THE',
      'SAME KIND OF LUMP, AND THE FLAGS ARE SLABS WITH A FEW SHALLOW PITS,',
      'A GRAIN AND A CHIP OUT OF A LOWER EDGE, THROWN AT RANDOM. A HAND',
      'COULD GIVE THEM REAL WEAR -- A CRACK, A WORN DIP, A CHIPPED CORNER,',
      'MOSS IN A JOINT, A DRAIN GRATE -- AND LAY THE FOOTING LIKE A MASON,',
      'BIG STONES AND SMALL. IT IS THE FIRST THING A PLAYER SEES. KEEP THE',
      'LANDING LINE THE BRIGHTEST ROW, AND NOTHING LIT AND LEVEL UNDER IT:',
      'A LIT HORIZONTAL EDGE BELOW THE FLOOR READS AS ANOTHER FLOOR.',
    ],
    deliver: [
      'GROUND.PNG  1792 PX WIDE (THE SHAFT AT ITS WIDEST), UP TO 150 DEEP,',
      '  THE WALKING SURFACE ON ROW 12, DARKENING TO #0D080E AT THE BOTTOM.',
      '  ONE PICTURE, NOT A TILE -- THE CODE PAINTS IT THAT WAY FOR THE',
      '  REASON ABOVE. THE FIRST BRIEF\'S 64 X 40 AND 64 X 64 TILE PAIR IS',
      '  STILL WHAT THE PAINTERS MAKE, IF A TILED GROUND IS WANTED.',
    ],
  },
  {
    title: 'THE RISING FLOOR',
    img: F.rise, crop: [0, 420, 1920, 660], k: 0.62,
    now: [
      'A TIDE OF FIRE, THE SAME IN EVERY ZONE SO IT IS KNOWN AT A GLANCE:',
      'TWO RANKS OF FLAME TONGUES OFF A YELLOW-HOT CREST (THE KILL LINE),',
      'THEN A CRUST OF RED-HOT PLATES IN MOLTEN SEAMS, COOLING TO DARK',
      'SOME FIFTY PX DOWN. FLAMES AS THE DUNGEON TORCH DRAWS FIRE, WITH',
      'NO OUTLINE. 4 FLICKER FRAMES AT 9 A SECOND, CRAWLING SIDEWAYS; THE',
      'CRUST DRIFTS THE OTHER WAY; THE CREST PULSES WITH THE DANGER.',
    ],
    draw: [
      'FOUR FLAME FRAMES AND TWO CRUST FRAMES: MORE FLAME FRAMES WOULD',
      'FLICKER LESS LIKE A LOOP. THE PLATES ARE GENERATED CELLS, EVEN IN',
      'SIZE; A HAND COULD MAKE THE LAVA HEAVE -- A BUBBLE THAT SWELLS AND',
      'BURSTS, A SPIT OF EMBERS, A CRUST PLATE THAT TIPS AND SINKS. KEEP',
      'IT RED, KEEP THE LEADING EDGE THE BRIGHTEST THING ON IT, NO DARK',
      'OUTLINE ON FIRE (IT READ AS A ROW OF THORNS), AND NO BEAT ACROSS',
      'THE SCREEN AT THE TILE\'S 64 PX.',
    ],
    deliver: [
      'RISE-EDGE.PNG   64 X 16 PX PER FRAME, SIDE BY SIDE, THE KILL LINE',
      '  ON ROW 11. 4 FRAMES TODAY (256 X 16); SAY IF YOU DRAW MORE.',
      '  REPEATS LEFT TO RIGHT.',
      'RISE-BODY.PNG   64 X 64 PX PER FRAME, 2 FRAMES (128 X 64). REPEATS',
      '  IN BOTH DIRECTIONS: THE CODE STACKS IT DOWN AS WELL AS ACROSS. IT',
      '  WOULD REPLACE THE DEEP CRUST ONLY: THE HOT TOP OF THE CRUST IS',
      '  WORKED OUT FROM THE CODE\'S OWN PLATES.',
    ],
  },
  {
    title: 'THE SIDE WALLS',
    img: F.start, crop: [0, 250, 420, 830], k: 0.6,
    also: { img: F.rise, crop: [1500, 250, 420, 830], k: 0.6 },
    now: [
      'EACH ZONE PAINTS ITS OWN WALL FROM ITS LEDGES AND BACKGROUND:',
      'CELLAR BRICK, CRYPT RUBBLE, BARK, ROOTS IN MUD, HALF-TIMBERING,',
      'ASHLAR, BASALT, BONES, CRYSTAL, BLACK GLASS, A STAR CHART, GILDED',
      'SCALE. A 64 X 128 TILE AND AN 8 X 128 INNER FACE WITH A LIT RIM,',
      'KEPT NEAR THE BACKGROUND\'S VALUE, UNDER THE LEDGES\' LIT TOP. IT',
      'SCROLLS WITH THE CLIMB, SLIDES OUT AS THE SHAFT WIDENS AND FADES',
      'INTO THE NEXT ZONE\'S. THE RIGHT WALL IS THE LEFT ONE MIRRORED.',
    ],
    draw: [
      'ONE TILE REPEATS EVERY 128 PX UP A TOWER THAT NEVER ENDS, SO ANY',
      'FEATURE -- A WINDOW, A TORCH BRACKET, A ROOT KNOT -- BEATS UP THE',
      'SCREEN; TWO OR THREE VARIANTS PER ZONE WOULD BREAK THAT (THE CODE',
      'WOULD LEARN TO MIX THEM). THE RIGHT WALL IS THE LEFT ONE MIRRORED,',
      'SO ITS LIGHT COMES FROM THE UPPER RIGHT WHERE ALL ELSE IS LIT FROM',
      'THE UPPER LEFT: A RIGHT WALL OF ITS OWN WOULD FIX THAT. STAY QUIETER',
      'THAN THE LEDGES: NOTHING BRIGHTER THAN A LEDGE TOP, NOTHING LIT AND',
      'LEVEL ENOUGH TO LOOK STANDABLE. THE FLOOR TICKS STAY OVER IT.',
    ],
    deliver: [
      'PER ZONE, E.G. FOREST-WALL.PNG  64 X 128 PX, REPEATS IN BOTH',
      '  DIRECTIONS, AND FOREST-WALL-FACE.PNG  8 X 128 PX, THE INNER EDGE,',
      '  REPEATS TOP TO BOTTOM. DRAWN FOR THE LEFT WALL. FULLY OPAQUE: A',
      '  ZONE CHANGE FADES BY DRAWING ONE WALL OVER THE OTHER. ONE OR TWO',
      '  ZONES IS A FINE START; THE REST KEEP THEIR PAINTED WALLS.',
    ],
  },
];

const EFFECTS = [
  {
    title: 'THE SPEED STREAKS',
    img: F.fast, crop: [0, 0, 1920, 1080], k: 0.5,
    now: [
      'LINES POUR UP THE SCREEN, FASTER THE FASTER THE RUN: ABOUT 1,300',
      'PX A SECOND WHEN QUICK, 2,900 FAST, 6,500 FLAT OUT, 230 TO 650 PX',
      'LONG. ACROSS THE WHOLE WIDTH, CROWDED TOWARD THE EDGES, WHICH GLOW',
      'FLAT OUT. ONE OR TWO PX WIDE: A SMALL BRIGHT HEAD, A TAIL FADING IN',
      'STEPS, A DARK RIM EACH SIDE, IN A TONE PER ZONE PICKED AGAINST ITS',
      'BACKGROUND (CANDLE AMBER, TORCH ORANGE, GOLD, ICE BLUE, LILAC). THEY',
      'RUN BEHIND THE LEDGES, THE HUD AND THE DUKE, SO THEY NEVER CROSS HIS',
      'FACE OR A LEDGE TOP.',
    ],
    draw: [
      'THEY ARE GENERATED FROM A TABLE OF LENGTHS: EVERY ONE THE SAME',
      'STRAIGHT LINE, A NEAR ONE TWO PX WIDE FOR THE FIRST HALF OF ITS',
      'TAIL AND ONE AFTER. A HAND COULD GIVE THEM SHAPE -- A GLINT OR',
      'SPARK AT THE HEAD, A SHIMMER -- AND SET THE LOOK AT THREE MOMENTS,',
      'QUICK, FAST AND FLAT OUT. IN A STILL FRAME, THIN EVEN LINES STILL',
      'LEAN TOWARD RAIN; IT IS THE MOTION THAT SELLS THEM AS SPEED.',
    ],
    // The file used to be the first brief's four whole streaks, 96 px tall, short to long.
    // The code now draws 24 to 913 px, each at its own length and never stretched, so a
    // drawn streak could only be used at 96; what a hand can supply is the head.
    deliver: [
      'A BOARD OF THE THREE MOMENTS, AND IF YOU WANT THE SHAPES EXACT:',
      'STREAKS.PNG  THE HEAD OF A THIN STREAK AND OF A NEAR ONE, SIDE BY',
      '  SIDE, EACH 4 PX WIDE BY UP TO 16 TALL (8 X 16), TIP AT THE TOP,',
      '  WHITE ON TRANSPARENT. THE CODE RUNS THE TAIL ON BELOW A HEAD TO',
      '  EVERY LENGTH IT DRAWS, 24 TO 913 PX -- A WHOLE STREAK DRAWN SHORT',
      '  WOULD HAVE TO BE STRETCHED, WHICH IT NEVER DOES -- AND TINTS AND',
      '  PLACES THEM.',
    ],
  },
  {
    title: 'THE COMBO TRAIL',
    img: F.near, crop: null, k: 0.75,
    now: [
      'STARS AND SPARKS FALL OUT OF THE DUKE, KEYED TO THE LIVE COMBO: A',
      'FEW IN THE ZONE\'S COLOURS WITH NO CHAIN, A PALETTE OF ITS OWN AT',
      'EVERY STEP FROM SWIFT (50 FLOORS) TO GLORY (350), CRUSADE IN THE',
      'LITHUANIAN TRICOLOUR, GOLD AND WHITE AT GLORY AND EVERY COLOUR PAST',
      'IT. SHAPES DRAWN BY HAND: A 3 PX SPARK, TWINKLES AT 5 AND 7, STARS',
      'AT 7 AND 9, AN EIGHT-RAYED GLINT, 4 FRAMES EACH. BEHIND THE WALLS,',
      'THE LEDGES AND HIM, AND LEFT BEHIND ALONG HIS PATH.',
    ],
    draw: [
      'SIX SHAPES IN ALL, EVERY STEP THE SAME SIX RECOLOURED. A HAND COULD',
      'ADD THE GAME\'S OWN MOTIFS FOR THE HIGH STEPS -- A TINY GOLD CROSS,',
      'A CROWN, AN OAK LEAF, A BEAD OF AMBER -- AND A BURST FOR THE MOMENT',
      'A STEP IS CLAIMED. A PIECE BURNS OUT BY SHRINKING A SIZE AT A TIME',
      '(A PALE STAR FADED BY ALPHA GOES GREY OVER A COLOURED SKY); DRAWN',
      'DYING FRAMES WOULD DO IT BETTER. NEVER OVER THE DUKE OR THE LEDGE',
      'HE IS ABOUT TO LAND ON.',
    ],
    deliver: [
      'A BOARD OF FOUR STEPS (SWIFT, SOARING, CRUSADE, GLORY), AND:',
      'SPARKS.PNG  EACH PIECE IN AN 11 X 11 CELL, 4 FRAMES ACROSS, ONE',
      '  PIECE PER ROW, IN FOUR GREYS -- DEEP, BODY, LIGHT, HIGHLIGHT --',
      '  BECAUSE THE CODE COLOURS EACH TONE PER STEP. ANY COLOURS THAT MUST',
      '  STAY FIXED, SAY SO.',
    ],
  },
];

// --- drawing --------------------------------------------------------------------------
const W = 2100;
const TX = 1250;            // where the text column starts
const LINE = 13;
const overruns = [];

/** Draw one line of text, noting it if it would run past `limit` (the column's right edge). */
function textIn(g, s, x, y, c, sc, limit) {
  if (x + textWidth(s, sc) > limit) overruns.push(`"${s.slice(0, 40)}..." is ${x + textWidth(s, sc) - limit} px too wide`);
  drawText(g, s, x, y, c, sc, 'left');
}

function blockHeight(b) {
  const imgH = Math.round((b.crop ? b.crop[3] : b.img.height) * b.k);
  const textH = (b.now.length + b.draw.length + b.deliver.length) * LINE + 3 * 22 + 20;
  return Math.max(imgH, textH) + 56;
}

function render(file, heading, lines, blocks) {
  const headH = 40 + lines.length * 12 + 26;
  const H = headH + blocks.reduce((s, b) => s + blockHeight(b), 0) + 20;
  const cv = new HeadlessCanvas(W, H);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#15101f'; g.fillRect(0, 0, W, H);
  const text = (s, x, y, c = '#e8e4f0', sc = 1, limit = W - 16) => textIn(g, s, x, y, c, sc, limit);

  text(heading, 16, 12, '#ffe23d', 3);
  lines.forEach(([l, c], i) => text(l, 16, 50 + i * 12, c, 1));

  let y = headH;
  for (const [i, b] of blocks.entries()) {
    g.fillStyle = '#2a2240'; g.fillRect(0, y - 10, W, 2);
    text(`${i + 1}. ${b.title}`, 16, y, '#ff8a5a', 2);
    const top = y + 28;
    text('THE GAME AS IT IS NOW', 16, top - 12, '#8a8fa8', 1);
    const [sx, sy, sw, sh] = b.crop || [0, 0, b.img.width, b.img.height];
    if (16 + Math.round(sw * b.k) > TX - 16) overruns.push(`${b.title}'s frame runs into the text column`);
    g.drawImage(b.img, sx, sy, sw, sh, 16, top, Math.round(sw * b.k), Math.round(sh * b.k));
    if (b.also) {
      const [ax, ay, aw, ah] = b.also.crop;
      const x2 = 16 + Math.round(sw * b.k) + 20;
      g.drawImage(b.also.img, ax, ay, aw, ah, x2, top, Math.round(aw * b.also.k), Math.round(ah * b.also.k));
      text('AND IN A LATER ZONE', x2, top - 12, '#8a8fa8', 1, TX - 16);
    }
    let ty = top;
    const section = (label, colour, body, bodyColour) => {
      text(label, TX, ty - 12, colour, 1);
      body.forEach((l, k) => text(l, TX, ty + k * LINE, bodyColour, 1));
      ty += body.length * LINE + 22;
    };
    section('WHAT THE CODE DRAWS NOW', '#ff8a8a', b.now, '#d8b8b8');
    section('WHAT A HAND COULD STILL IMPROVE', '#8fd0ff', b.draw, '#c8d8e8');
    section('WHAT TO DELIVER (EACH NEEDS A LOADER WRITTEN FIRST)', '#ffe23d', b.deliver, '#e8e0b0');
    y += blockHeight(b);
  }
  fs.writeFileSync(file, encodePNG(cv));
  console.log(`  ${file}  ${W}x${H}  ${blocks.length} blocks`);
}

const COMMON = [
  ['EVERYTHING HERE IS DRAWN IN CODE NOW, AT ONE ART PIXEL PER SCREEN PIXEL LIKE THE DUKE AND THE LEDGES, IN THE SHAPES THE FIRST BRIEF ASKED FOR.', '#e8e4f0'],
  ['EACH BLOCK SAYS WHAT THE CODE DRAWS AND WHERE A HAND COULD STILL DO BETTER. THE FRAME BESIDE IT IS THE GAME AS IT IS TODAY.', '#8fd0ff'],
  ['A BOARD OF THE LOOK IS WELCOME: THE CODE IS REDRAWN FROM IT. EXACT FILES AT THESE SIZES CAN REPLACE THE CODE\'S DRAWING ONCE A LOADER IS WRITTEN.', '#8fd0ff'],
];

render('brief-textures.png', 'TEXTURES: THE START FLOOR, THE RISING FLOOR, THE WALLS', [
  ...COMMON,
  ['A TILE THAT REPEATS MUST MEET ITSELF AT EVERY EDGE IT REPEATS ACROSS, OR A SEAM WALKS UP THE SCREEN FOR AS LONG AS ANYONE PLAYS.', '#b8b4c8'],
], TEXTURES);

render('brief-effects.png', 'EFFECTS: THE SPEED STREAKS AND THE COMBO TRAIL', [
  ...COMMON,
  ['THE CODE DECIDES WHERE, WHEN, HOW MANY AND WHAT COLOUR; WHAT A HAND CAN ADD IS THE LOOK, AND THE SMALL SHAPES IT PLACES.', '#b8b4c8'],
], EFFECTS);

fs.rmSync(TMP, { recursive: true, force: true });
if (overruns.length) {
  console.log(`  ${overruns.length} line(s) run past their column:`);
  for (const o of overruns) console.log('    ' + o);
  process.exitCode = 1;
}
