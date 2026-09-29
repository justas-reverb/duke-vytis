// 5x7 bitmap font, hand-authored.
//
// This was the one asset I tried hardest to delegate to the local model and it was the
// one it could not do: it produced syntactically perfect arrays whose glyphs were not
// letters (its C and D were identical, its O had no bowl, its T was an F). Pixel art is
// a 2D spatial problem and the model reasons about it as a 1D token stream. Writing 70
// glyphs by hand is faster than reviewing 70 wrong ones.

import { newCanvas } from './canvases.js';

const G = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  '5': ['#####', '#....', '#....', '####.', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '\\': ['#....', '#....', '.#...', '..#..', '...#.', '....#', '....#'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '[': ['..###', '..#..', '..#..', '..#..', '..#..', '..#..', '..###'],
  ']': ['###..', '..#..', '..#..', '..#..', '..#..', '..#..', '###..'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '~': ['.....', '.....', '.##.#', '#..#.', '.....', '.....', '.....'],
  '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

export const GW = 5;
export const GH = 7;
export const GAP = 1;
export const CELL = GW + GAP; // 6 px advance

const ORDER = Object.keys(G);
const INDEX = new Map(ORDER.map((c, i) => [c, i]));

// One atlas per colour. Text is drawn constantly (HUD, popups, the whole stats screen),
// and blitting from a pre-tinted atlas costs one drawImage per character instead of up
// to 35 fillRects.
const atlases = new Map();

function buildAtlas(color) {
  // Through canvases.js, so the load-time prepaint brings every atlas up with the rest: the
  // companions' calls drew from colours first used in a run.
  const { c, g } = newCanvas(ORDER.length * CELL, GH);
  g.fillStyle = color;
  ORDER.forEach((ch, i) => {
    const rows = G[ch];
    for (let y = 0; y < GH; y++) {
      const row = rows[y];
      let run = -1;
      for (let x = 0; x <= GW; x++) {
        const on = x < GW && row[x] === '#';
        if (on && run < 0) run = x;
        else if (!on && run >= 0) { g.fillRect(i * CELL + run, y, x - run, 1); run = -1; }
      }
    }
  });
  return c;
}

// Atlases built AFTER warming, i.e. mid-game. Every one of these is a canvas allocation
// and a full glyph rasterisation happening inside a frame, and at 160 Hz there is no
// room for it. Counted so a test can assert it stays at zero.
let lateBuilds = 0;
let warmed = false;

export function atlasFor(color) {
  let a = atlases.get(color);
  if (!a) {
    if (warmed) lateBuilds++;
    a = buildAtlas(color);
    atlases.set(color, a);
  }
  return a;
}

/**
 * Build every atlas the game can need, up front.
 *
 * Text is drawn from a per-colour atlas, and building one allocates a canvas and
 * rasterises the whole character set. Doing that lazily meant the FIRST use of any new
 * colour cost a few milliseconds in the middle of a frame -- and `drawTextOutline`
 * draws in two colours, so one new banner could build two. It is most visible exactly
 * where it is least welcome: a theme boundary brings a new accent and a new text colour
 * with it, and a big combo fires a white taunt, a flash and a slow-motion effect all in
 * the same frame. That reads as a stutter, and it was one.
 */
export function warmAtlases(colours) {
  // Themes carry a `sky` that is an ARRAY of gradient stops, not a colour, so a caller
  // spreading theme fields will hand this one of those sooner or later.
  for (const c of colours) if (typeof c === 'string' && c) atlasFor(c);
  warmed = true;
  return atlases.size;
}

export function fontStats() { return { atlases: atlases.size, lateBuilds }; }
export function resetFontStats() { lateBuilds = 0; }

/**
 * Extra space between letters, on top of the font's own one-pixel gap.
 *
 * At scale 1 the gap is one pixel and the outline is one pixel, so adjacent outlines
 * just touch and it reads as a normal keyline. Scale everything up and that stops
 * working: `drawTextOutline` offsets the outline by `scale` in all eight directions, so
 * at scale 3 a three-pixel outline has exactly three pixels of gap to fill, and it fills
 * ALL of it. The letters fuse into one black slab with coloured cores -- which is what
 * the grand callout, drawn at scale 3, had been doing.
 *
 * Tracking grows with scale so there is always clear space left over.
 */
export function tracking(scale) {
  return scale > 1 ? scale : 0;
}

export function textWidth(str, scale = 1) {
  if (!str.length) return 0;
  return (str.length * CELL - GAP) * scale + (str.length - 1) * tracking(scale);
}

/**
 * Draw `str` with its top-left at (x, y). `scale` must be an integer to stay crisp.
 * align: 'left' | 'center' | 'right'.
 */
export function drawText(ctx, str, x, y, color = '#ffffff', scale = 1, align = 'left') {
  str = String(str).toUpperCase();
  const track = tracking(scale);
  const w = textWidth(str, scale);
  let px = align === 'center' ? Math.round(x - w / 2)
         : align === 'right'  ? Math.round(x - w)
         : Math.round(x);
  const atlas = atlasFor(color);
  const top = Math.round(y);
  for (let i = 0; i < str.length; i++) {
    const idx = INDEX.get(str[i]);
    if (idx !== undefined && str[i] !== ' ') {
      ctx.drawImage(atlas, idx * CELL, 0, GW, GH, px, top, GW * scale, GH * scale);
    }
    px += CELL * scale + track;
  }
  return w;
}

/** Text with a 1px drop shadow. Most of the HUD uses this. */
export function drawTextShadow(ctx, str, x, y, color, shadow = '#000000', scale = 1, align = 'left') {
  drawText(ctx, str, x + scale, y + scale, shadow, scale, align);
  return drawText(ctx, str, x, y, color, scale, align);
}

/** Text with a full 1px outline, for anything that must read over busy art. */
export function drawTextOutline(ctx, str, x, y, color, outline = '#000000', scale = 1, align = 'left') {
  // The outline is a KEYLINE, so it does not grow with the glyph. It used to be offset
  // by `scale`, which at scale 3 put a three-pixel band around every letter and closed
  // the three-pixel gap between them completely. Two pixels is enough to hold the text
  // off any background this game has, and it leaves the letters separate.
  const o = Math.min(2, scale);
  for (let dy = -o; dy <= o; dy += o) {
    for (let dx = -o; dx <= o; dx += o) {
      if (dx || dy) drawText(ctx, str, x + dx, y + dy, outline, scale, align);
    }
  }
  return drawText(ctx, str, x, y, color, scale, align);
}

export const GLYPHS = G;
