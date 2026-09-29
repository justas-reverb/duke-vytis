// The one door every painted-ahead canvas comes through: made while nobody is playing,
// brought up once off-screen, and reused rather than made again in a frame that matters.
//
// WHY. Everything drawn at art resolution is painted ahead into canvases -- the zones'
// backdrops, walls, streaks and furniture, the ledges and their shadows, the companions, the
// zone titles, the HUD's skins, the scoreboards, the burn -- and blitted in play
// (ARCHITECTURE.md, "What the drawn layers cost a frame"). A canvas has two first times that
// are not free in a browser, whatever the JavaScript that painted it cost: its backing is
// allocated the first time something is drawn INTO it, and what was painted into it -- often
// thousands of fillRect runs -- is handed to the GPU to raster the first time it is drawn
// FROM. Both used to land in play: a zone's new HUD skin, twenty canvases, was first drawn
// from in the frame of the zone's arrival; its sprites, shadows and companions were built in
// the frame that first showed them; the burn's masks and layer met the GPU for the first
// time in the frame the fire took him, where Chromium compiled the burn's blend programs
// (two tasks of 9-10 ms on the GPU process, measured in a trace of the catch).
//
// So:
//   * newCanvas(w, h) makes a canvas and remembers it until it is touched;
//   * touchCanvas(c) draws it once into a 1 x 1 sink, off the screen: its backing is
//     allocated and what was painted into it is flushed to the GPU now, in the painter's own
//     time, not in the frame that shows it. touchNew() touches everything made since the
//     last call -- the load-time prepaint (prepaint.js) ends with it;
//   * takeCanvas(w, h) hands back a released canvas of exactly that size, cleared, before it
//     makes a new one, and releaseCanvas(c) gives one back. The skins and the boards, the two
//     caches that are painted again in play for the zone ahead, take and release through it,
//     so a run reuses the canvases the zones behind it let go of instead of making new ones
//     (a canvas's size cannot change without a new backing, so reuse is by exact size);
//   * reserveCanvases(w, h, n) makes spares of a size now, touched, for takeCanvas to hand
//     out later -- the pool is primed at load, while nobody is playing.
//
// It keeps no canvas alive that nothing else does, except the ones released to it and the
// spares: their bytes are poolStats().bytes.

let sink = null, sinkG = null;
const untouched = new Set();
const free = new Map();          // 'w x h' -> [canvas, ...]
const stats = { made: 0, madeBytes: 0, reused: 0, released: 0, touched: 0, reserved: 0 };

const keyOf = (w, h) => w + 'x' + h;

/**
 * A canvas w x h (whole numbers: a size that arrives as a heap double slows every frame of the
 * headless canvas, headless-canvas-fidelity) with smoothing off -- a fresh canvas smooths by
 * default, and nothing painted here may blur. Remembered until touched.
 */
export function newCanvas(w, h, opts) {
  const made = make(w, h, opts);
  untouched.add(made.c);
  return made;
}

function make(w, h, opts) {
  const c = document.createElement('canvas');
  c.width = w | 0;
  c.height = h | 0;
  const g = opts ? c.getContext('2d', opts) : c.getContext('2d');
  g.imageSmoothingEnabled = false;
  stats.made++;
  stats.madeBytes += c.width * c.height * 4;
  return { c, g };
}

/**
 * Draw `c` once into a 1 x 1 sink: its backing exists from now on and what was painted into
 * it has gone to the GPU. The sink is cleared straight after, whole, so it holds no picture of
 * `c` -- a snapshot kept there would make the next painting into `c` copy it first.
 */
export function touchCanvas(c) {
  if (!c || !c.width || !c.height) return;
  if (!sink) {
    sink = document.createElement('canvas');
    sink.width = 1;
    sink.height = 1;
    sinkG = sink.getContext('2d');
  }
  sinkG.drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1);
  sinkG.clearRect(0, 0, 1, 1);
  untouched.delete(c);
  stats.touched++;
}

/** Touch every canvas made through newCanvas since the last call. Returns how many. */
export function touchNew() {
  const list = [...untouched];
  for (const c of list) touchCanvas(c);
  return list.length;
}

/**
 * A canvas of exactly w x h: a released one, cleared and with its state reset, or a new one.
 * The state a fresh canvas starts with is put back by hand, because the painters assume it.
 */
export function takeCanvas(w, h) {
  w |= 0; h |= 0;
  const list = free.get(keyOf(w, h));
  if (list && list.length) {
    const c = list.pop();
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    stats.reused++;
    return { c, g };
  }
  return newCanvas(w, h);
}

/** Give a canvas back for takeCanvas to hand out again. */
export function releaseCanvas(c) {
  if (!c || !c.width || !c.height) return;
  const k = keyOf(c.width, c.height);
  let list = free.get(k);
  if (!list) free.set(k, (list = []));
  if (list.includes(c)) return;
  list.push(c);
  stats.released++;
}

/**
 * `n` more spare canvases of w x h, made now and touched: backed and on the GPU before anyone
 * plays, for takeCanvas. A pixel is drawn into each first, so the browser allocates its
 * backing rather than skipping an empty canvas.
 */
export function reserveCanvases(w, h, n) {
  for (let i = 0; i < n; i++) {
    const { c, g } = make(w, h);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1, 1);
    g.clearRect(0, 0, 1, 1);
    touchCanvas(c);
    releaseCanvas(c);
    stats.reserved++;
  }
}

/** made / reused / released / touched counts, and the pool: canvases and bytes held spare. */
export function poolStats() {
  let canvases = 0, bytes = 0;
  for (const list of free.values()) for (const c of list) { canvases++; bytes += c.width * c.height * 4; }
  return { ...stats, pooled: canvases, bytes, untouched: untouched.size };
}

/** For the tools: forget the pool and the counts, as after loading. */
export function resetCanvasPool() {
  free.clear();
  untouched.clear();
  for (const k of Object.keys(stats)) stats[k] = 0;
}
