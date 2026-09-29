// The speed afterimage's memory: the Duke as he was DRAWN, frame by frame, and where on
// that path the copies behind him go. The silhouettes themselves are sprites.js's
// (drawGhost); the renderer records a state every frame and draws what place() returns.
//
// WHY A HISTORY AND NOT A LINE ALONG -v.
//
// The first silhouette trail put its copies on a straight line back along his velocity,
// 9 ms of it a copy, each in his CURRENT drawing. His path is not a straight line: it
// curves through every arc, folds at every wall bounce and every held-jump landing, and in
// the tuck the drawing itself turns a quarter at a time. A line along -v can follow none
// of that; on a launch it hung 28 units straight down under his boots. Here each copy
// is a point he was actually drawn at, in the pose, facing, squash and quarter turn he was
// drawn in at that moment, so the trail bends, folds and curls with him.
//
// WHERE THE COPIES GO. Copy k is where he was k x GHOST_DT ago -- the old trail's spacing
// in time -- unless that is more than k x GHOST_GAP back along his path, in which case it
// is there instead. The cap is what keeps it ON him: at a launch's 990 units/s, 9 ms is
// 8.9 units a copy, which is how the old trail came to hang a body's height under him;
// capped, four copies reach 8 units behind him at most, against an outline 25 (the tuck)
// to 50 units across, so the nearest overlaps most of him and even the farthest overlaps
// him in every frame measured, the roll's quarter turns included (see GHOST_GAP).
//
// That needed the tuck to turn about the ball of him. It turned about the middle of its
// cell, 12.4 units above the ball, so the ball hopped 17.5 units at every quarter turn,
// and the copies from before a turn -- rightly drawn where he had been drawn -- stood a
// ball's width off him for two or three frames, six times a roll: a second ball beside
// him, which is the roll "breaking" in another shape. See SPIN_PIVOT in sprites.js.
//
// A point between two recorded frames takes the OLDER frame's state -- the drawing that
// was on screen while he crossed it -- and its position is interpolated, so the spacing
// is the same at 60 Hz as at 240.
//
// WHEN THE PATH STARTS AGAIN. A new run or another game (the menu's demo and the real run
// share one renderer), a frame further from the last than his speed could have carried
// him (a staged floor, a teleport in a tool), the death, or the trails switched off. A
// copy is never drawn across a jump in position, and after a reset the trail grows back
// over its first 36 ms instead of reaching into where he used to be.
//
// Nothing here allocates after construction: fixed rings of numbers, reused every frame.

import { GHOST_N, GHOST_DT, GHOST_GAP, GHOST_HISTORY, GHOST_JUMP_K, GHOST_JUMP_SLACK }
  from '../game/constants.js';

export class Afterimage {
  constructor() {
    const n = GHOST_HISTORY;
    // The ring of drawn states, newest at `head`.
    this.t = new Float64Array(n);       // the renderer's clock, s
    this.x = new Float64Array(n);       // where he was drawn, world units (unsnapped)
    this.y = new Float64Array(n);
    this.v = new Float64Array(n);       // his speed then, units/s (for the jump test)
    this.spin = new Float64Array(n);    // the quarter-turn count drawSprite was given
    this.sq = new Float64Array(n);      // squash, -1..1
    this.flip = new Uint8Array(n);      // 1 facing left
    this.frame = new Array(n).fill(null);
    this.head = 0;
    this.n = 0;
    this.game = null;
    this.tower = null;
    // What place() found, nearest him first: `count` copies.
    this.count = 0;
    this.cx = new Float64Array(GHOST_N);
    this.cy = new Float64Array(GHOST_N);
    this.cspin = new Float64Array(GHOST_N);
    this.csq = new Float64Array(GHOST_N);
    this.cflip = new Uint8Array(GHOST_N);
    this.cframe = new Array(GHOST_N).fill(null);
    // How fast he has moved along his path over the trail's span, units/s. The trail
    // fades with this rather than with his velocity this instant: landing straight down,
    // his velocity is gone in one step, and a fade keyed to it cut the trail off in one
    // frame while the copies were still showing where he came down from.
    this.speed = 0;
  }

  reset() {
    this.n = 0;
    this.count = 0;
    this.speed = 0;
  }

  /** Start again when the game drawn is another game, or the same game on a new run. */
  follow(game) {
    if (game !== this.game || game.tower !== this.tower) {
      this.game = game;
      this.tower = game.tower;
      this.reset();
    }
  }

  /**
   * One drawn state. `now` is the renderer's clock; a frame at the same moment as the
   * last (a paused game draws with dt 0) adds nothing, so a pause freezes the trail.
   */
  record(now, x, y, speed, frame, flip, spin, sq) {
    if (this.n) {
      const h = this.head;
      const dt = now - this.t[h];
      if (dt === 0) return false;
      const d = Math.hypot(x - this.x[h], y - this.y[h]);
      if (dt < 0 || d > Math.max(speed, this.v[h]) * dt * GHOST_JUMP_K + GHOST_JUMP_SLACK) this.reset();
    }
    const h = (this.head + 1) % GHOST_HISTORY;
    this.t[h] = now;
    this.x[h] = x;
    this.y[h] = y;
    this.v[h] = speed;
    this.frame[h] = frame;
    this.flip[h] = flip ? 1 : 0;
    this.spin[h] = spin;
    this.sq[h] = sq;
    this.head = h;
    if (this.n < GHOST_HISTORY) this.n++;
    return true;
  }

  /** Place the copies behind the newest state; returns how many there are. */
  place() {
    this.count = 0;
    this.speed = 0;
    if (this.n < 2) return 0;
    const CAP = GHOST_HISTORY, span = GHOST_N * GHOST_DT;
    let a = this.head;
    const t0 = this.t[a];
    let s = 0;              // path from him back to sample a, world units
    let k = 1;              // the copy being placed
    let path = 0, age = 0;  // path covered over the trail's span, and the time it took
    for (let m = 1; m < this.n; m++) {
      const b = (a - 1 + CAP) % CAP;
      const ax = this.x[a], ay = this.y[a], bx = this.x[b], by = this.y[b];
      const d = Math.hypot(bx - ax, by - ay);
      const ageA = t0 - this.t[a], ageB = t0 - this.t[b];
      if (age < span) {
        const f = ageB <= span ? 1 : (span - ageA) / (ageB - ageA);
        path += d * f;
        age = ageA + (ageB - ageA) * f;
      }
      // Every copy that falls on this segment, a -> b, at the fraction u along it.
      while (k <= GHOST_N) {
        const lag = k * GHOST_DT, cap = k * GHOST_GAP;
        let u = 2;
        if (ageB >= lag) u = (lag - ageA) / (ageB - ageA);
        if (d > 0 && s + d >= cap) u = Math.min(u, (cap - s) / d);
        if (u > 1) break;
        if (u < 0) u = 0;
        // Strictly past a, the drawing on screen was b's until a replaced it.
        const src = u > 0 ? b : a;
        const i = k - 1;
        this.cx[i] = ax + (bx - ax) * u;
        this.cy[i] = ay + (by - ay) * u;
        this.cframe[i] = this.frame[src];
        this.cflip[i] = this.flip[src];
        this.cspin[i] = this.spin[src];
        this.csq[i] = this.sq[src];
        k++;
      }
      s += d;
      a = b;
      if (k > GHOST_N && age >= span) break;
    }
    this.count = k - 1;
    this.speed = age > 0 ? path / age : 0;
    return this.count;
  }
}
