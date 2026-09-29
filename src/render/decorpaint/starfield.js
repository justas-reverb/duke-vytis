// STARFIELD: a constellation pinned above the ledge, its stars joined by threads, twinkling.
//
// Distinct from COSMOS: a figure of stars rather than a single drifting orb, so the two
// star bands do not look like the same place twice. And distinct from this zone's own sky,
// which is full of loose four-point stars: what makes these a constellation is the thread
// between them, so every figure is drawn with its lines, and its stars are the board's
// blue-white where the sky's are white and mint.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.26;

const CORE = '#ffffff';
const ARM = '#cfe0ff';          // the first pixel out from a star's heart
const GLOW = '#9fbfff';         // the second, and a small star's arms
const THREAD = '#a4c0ee';       // the line between stars, laid on at 0.7
const RED = ['#ffe0c0', '#ffb070'];   // Betelgeuse: a heart and arms of orange

/**
 * The three figures, in box pixels (40 x 48, y down), each star [x, y, size] with size 2 a
 * bright star and 1 a faint one, and each thread a pair of star indices.
 *
 *  0  The board's figure: a loop of six stars with a branch off three of its corners.
 *  1  The Plough -- Grizulo Ratai, the Wagon, in Lithuania: a bowl and a bent handle.
 *  2  Orion, standing: shoulders, the three-star belt (the Mowers, Sienpjoviai), and feet,
 *     with Betelgeuse at his shoulder the one star that is not blue-white.
 */
const FIGURES = [
  {
    stars: [[3, 14, 1], [10, 19, 2], [10, 29, 1], [3, 36, 1], [13, 34, 1], [22, 25, 1],
      [31, 25, 2], [37, 16, 2], [31, 33, 1], [26, 39, 2]],
    threads: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 9], [9, 8], [8, 6], [6, 7], [6, 5], [5, 1]],
  },
  {
    stars: [[4, 8, 2], [8, 15, 1], [13, 21, 2], [19, 26, 1], [33, 22, 2], [35, 33, 2], [21, 36, 1]],
    threads: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    stars: [[19, 4, 1], [9, 9, 2], [30, 11, 1], [15, 27, 1], [20, 25, 2], [25, 23, 1], [10, 41, 1], [32, 40, 2]],
    threads: [[0, 1], [0, 2], [1, 3], [2, 5], [3, 4], [4, 5], [3, 6], [5, 7]],
    red: 1,
  },
];

/**
 * A thread from star a to star b, a one-pixel line that stops two pixels short of each
 * star's heart, so every star stands clear in a small gap of its own and the figure reads
 * as stars joined up, not as a wire with knots in it.
 */
function thread(p, [ax, ay], [bx, by]) {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
    if (Math.max(Math.abs(x - ax), Math.abs(y - ay)) < 2 || Math.max(Math.abs(x - bx), Math.abs(y - by)) < 2) continue;
    p.set(x, y, THREAD, 0.7);
  }
}

/**
 * One star: a white heart in a cross of light, round at the corners for a bright one. A
 * star that flares stretches its cross a pixel further (a bright one) or lights it fully
 * (a faint one): the twinkle.
 */
function star(p, x, y, size, flare, red) {
  const arm = red ? RED[1] : ARM;
  p.set(x, y, red ? RED[0] : CORE);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (size === 2) {
      p.set(x + dx, y + dy, arm);
      if (flare) p.set(x + 2 * dx, y + 2 * dy, red ? RED[1] : GLOW, 0.7);
    } else p.set(x + dx, y + dy, flare ? arm : GLOW, flare ? 0.9 : 0.55);
  }
  if (size === 2) for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.set(x + dx, y + dy, red ? RED[1] : GLOW, 0.45);
}

export const ELEMENTS = {
  CONSTELLATION: {
    name: 'CONSTELLATION', box: [40, 48], anchor: 'float', lift: 36, frames: 2, variants: 3,
    // Each star twinkled as sin(3t) on its own phase; two frames are the two halves.
    fps: (2 * 3) / (2 * Math.PI),
    notes: ['BLUE-WHITE STARS JOINED BY 1-PX THREADS,', 'PINNED ABOVE THE LEDGE. 3 DIFFERENT FIGURES, 2',
      'FRAMES OF TWINKLE. NOT LIKE THE COSMOS ORB.'],
    // The twinkle: half the stars flare in one frame and the other half in the next, so the
    // figure shimmers without ever going dark.
    paint(p, v, f) {
      const fig = FIGURES[v];
      for (const [a, b] of fig.threads) thread(p, fig.stars[a], fig.stars[b]);
      fig.stars.forEach(([x, y, size], i) => star(p, x, y, size, i % 2 === f, fig.red === i));
    },
  },
};

/**
 * DECOR.constellation's draw, placed on the art pixel: the same random draw, the same
 * place. The figure is one more draw after it, which moves nothing: nothing follows it.
 */
export function scene(r, wArt) {
  const cx = Math.round(16 + r() * Math.max(4, wArt - 32));
  return [{ key: 'CONSTELLATION', variant: Math.floor(r() * 3), x: Math.max(0, Math.min(Math.floor(wArt) - 40, cx - 16)) }];
}
