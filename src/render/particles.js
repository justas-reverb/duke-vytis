// Pooled particle system.
//
// Everything here is preallocated. At 160 Hz a run can be spawning a few hundred
// particles a second, and allocating a fresh object per particle hands the GC a
// steady drip of garbage -- which it collects, eventually, as a 4 ms pause at exactly
// the moment the player is going fastest. The pool never grows after construction:
// when it is full the oldest particle is recycled.

import { PX } from '../game/constants.js';
import { TWINKLE, SHAPE_SIZE, MOTION, INHERIT, stepFor, trailRate, pickTwinkle } from './sparks.js';

const MAX = 900;

export const KIND = {
  DUST: 0, SPARK: 1, TRAIL: 2, CONFETTI: 3, RING: 4, STAR: 5, DIGIT: 6, SHARD: 7,
  // The combo trail's stars and sparks: sprites, drawn by sparks.js BEHIND the ledges and
  // the Duke rather than by draw() below. See sparks.js.
  TWINKLE,
};

/**
 * The share of the particle budget the combo trail may hold alive at once: 360 of 900 on
 * HIGH, 208 on MEDIUM, 88 on LOW, none at a budget of zero. The setting governs the trail
 * as it does everything else. [share, 0..1]
 */
const TWINKLE_SHARE = 0.4;
/**
 * The trail's own slots, per piece its cap lets it hold: room enough that plain
 * round-robin through them only ever reuses a piece that has already died. A lap takes
 * room x cap / rate: 540 slots at 595 pieces a second is 0.9 s, the longest life a piece
 * has. [slots per capped piece; 1.5]
 */
const TWINKLE_ROOM = 1.5;
/** The cap the trail's rates are written for; a lower cap thins the stream in proportion. */
const TWINKLE_FULL = Math.round(MAX * TWINKLE_SHARE);
/** Air drag on a trail piece. Sets its terminal fall at grav / drag. [1/s; 1.6] */
const TWINKLE_DRAG = 1.6;
/** Height of the Duke's middle above his feet, where the trail sheds from. [world units] */
const BODY_MID = 14;

/** One art pixel in world units. See Particles.spawn. */
const AP = (n) => n / PX;

/**
 * Where a pool draws its random numbers when nobody hands it a stream: Math.random, as
 * every particle here did until replays. The game hands its pool the run's own seeded
 * COSMETIC stream instead (Game.newRun), so a replay throws the same sparks as the run
 * it replays -- and since nothing in the simulation reads a particle, no change to how
 * many numbers a burst draws can move a single simulated value. An object with a
 * `next`, not a bare function: a function stored on the pool would be dropped by the
 * replay's snapshot copy (src/game/snapshot.js), an object is copied with it.
 */
const MATH_RANDOM = { next: () => Math.random() };

export class Particles {
  constructor(max = MAX) {
    // Two regions in one set of arrays. [0, max) is the RING every burst, mote and ring
    // shares, walked by the round-robin cursor exactly as before the trail existed. After
    // it, [trailBase, trailBase + trailRoom), are the combo trail's own slots -- see
    // shedOne for why it no longer lives in the ring.
    this.max = max;
    this.trailBase = max;
    this.trailRoom = Math.round(max * TWINKLE_SHARE * TWINKLE_ROOM);
    this.slots = max + this.trailRoom;  // every slot, for anything that walks them all
    const all = this.slots;
    this.n = 0;
    this.cursor = 0;
    this.x = new Float32Array(all);
    this.y = new Float32Array(all);
    this.vx = new Float32Array(all);
    this.vy = new Float32Array(all);
    this.life = new Float32Array(all);
    this.maxLife = new Float32Array(all);
    this.size = new Float32Array(all);
    this.grav = new Float32Array(all);
    this.rot = new Float32Array(all);
    this.kind = new Uint8Array(all);
    this.colour = new Array(all).fill('#fff');
    this.alive = new Uint8Array(all);
    // A trail piece's sprite: which shape (sparks.js SHAPE) and which colour ramp.
    this.shape = new Uint8Array(all);
    this.ramp = new Uint8Array(all);
    this.budget = max;
    this.twinkles = 0;                  // trail pieces alive, counted in step()
    this.others = 0;                    // everything else alive, counted in step()
    this.twinkleCap = Math.round(max * TWINKLE_SHARE);
    this.shedRoom = this.trailRoom;     // the trail slots in use at this setting
    this.shedCursor = 0;                // round-robin through them, 0..shedRoom-1
    this.shedAcc = 0;                   // fractional pieces owed to the trail
    this.shedClock = 0;                 // seconds of shedding, for the colour bands
    this.shedDir = [-1, 0];             // the last direction he was travelling, reversed
    this.rng = MATH_RANDOM;             // the game sets its cosmetic stream; see MATH_RANDOM
  }

  // The cursors, the shed clock and the last direction are reset too. They used to carry
  // over from the run before -- harmless on screen, but it made a run's sparks depend on
  // how many runs the same Game had played before it, so a replay built on a fresh Game
  // put its pieces in other slots with the colour bands at another phase.
  clear() {
    this.alive.fill(0); this.n = 0; this.twinkles = 0; this.others = 0; this.shedAcc = 0;
    this.cursor = 0; this.shedCursor = 0; this.shedClock = 0;
    this.shedDir[0] = -1; this.shedDir[1] = 0;
  }

  /**
   * Hurry every live particle through the rest of its life so none lasts longer than
   * `within` seconds more. Each keeps its fraction of life left (life / maxLife), which is
   * all its look is keyed on -- the alpha steps, a spark's taper, a trail piece's shrink,
   * a ring's spread -- so nothing jumps: it goes through the same fade, faster. Game.die()
   * calls it, so the fall does not carry the climb's sparks and confetti down with him.
   *
   * The whole life is squeezed into `within`, not what is left of it: a piece halfway
   * through has half of `within` to go. The first version gave every long-lived piece
   * exactly `within` more, so a 350-floor chain's trail -- dozens of stars, each at its
   * smallest -- went out together in one frame at 0.3 s. [seconds; FALL_LET_GO]
   */
  letGo(within) {
    for (let i = 0; i < this.slots; i++) {
      if (!this.alive[i] || this.maxLife[i] <= within) continue;
      const k = within / this.maxLife[i];
      this.life[i] *= k;
      this.maxLife[i] = within;
    }
  }

  /**
   * Cap how much of the pool may be in play, in both regions. The arrays are allocated once
   * at full size; this narrows the ring the cursor walks (`budget`), and sets the combo
   * trail's cap (`twinkleCap`, TWINKLE_SHARE of the number asked for) and how many of its
   * own slots it round-robins through (`shedRoom`, TWINKLE_ROOM times that cap, at most
   * `trailRoom`), killing whatever lives past either new end. So turning the setting down
   * is free and turning it back up needs no reallocation.
   */
  setBudget(n) {
    // The trail's share is taken from the number ASKED for, before the floor of 32 below:
    // a setting that asks for no particles gets no trail, where the ring would still keep
    // 32 slots for the bursts that mark a landing or a death.
    this.twinkleCap = n > 0 ? Math.round(Math.min(this.max, n) * TWINKLE_SHARE) : 0;
    this.shedRoom = Math.min(this.trailRoom, Math.round(this.twinkleCap * TWINKLE_ROOM));
    for (let i = this.trailBase + this.shedRoom; i < this.slots; i++) this.alive[i] = 0;
    if (this.shedCursor >= this.shedRoom) this.shedCursor = 0;
    this.budget = Math.max(32, Math.min(this.max, n | 0));
    for (let i = this.budget; i < this.max; i++) this.alive[i] = 0;
    if (this.cursor >= this.budget) this.cursor = 0;
  }

  /**
   * Art pixels to world units.
   *
   * EVERY particle size in this file used to be a raw world-unit number -- a spark was
   * "2", a trail "2 or 3". A world unit is PX screen pixels, so those were eight to
   * twenty-four pixels across: sparks the size of the character's head, and a white
   * confetti reading as a blank block stamped over him. Sizes are art pixels now, which
   * is the same unit the sprites are drawn in and the only one that means anything
   * fixed on screen.
   *
   * RING radii are deliberately NOT converted -- a shockwave is sized against the
   * character, not against the pixel grid, so its radius belongs in world units.
   */
  spawn(kind, x, y, vx, vy, life, size, colour, grav = 0) {
    // Plain round-robin over the ring. The first version scanned forward for a free
    // slot, which is O(1) on an empty pool and O(max) on a full one -- so the moment
    // the pool saturated, a burst of 70 particles cost 63,000 iterations and spawning
    // became quadratic. Under a stress test that wedged the page outright. Overwriting
    // the oldest slot is O(1) and, at 900 slots against lifetimes under two seconds,
    // only ever recycles a particle that was about to expire anyway.
    const lim = this.budget || this.max;
    const i = this.cursor % lim;
    this.cursor = (i + 1) % lim;
    return this.put(i, kind, x, y, vx, vy, life, size, colour, grav);
  }

  /** Write one particle into slot i: the ring's, from spawn, or the trail's, from shedOne. */
  put(i, kind, x, y, vx, vy, life, size, colour, grav) {
    this.kind[i] = kind;
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size;
    this.colour[i] = colour;
    this.grav[i] = grav;
    this.rot[i] = this.rng.next() * Math.PI * 2;
    this.alive[i] = 1;
    return i;
  }

  step(dt) {
    let n = 0, tw = 0;
    for (let i = 0; i < this.slots; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alive[i] = 0; continue; }
      this.vy[i] -= this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      if (this.kind[i] === KIND.CONFETTI) {
        this.vx[i] *= 1 - 1.2 * dt;
        this.rot[i] += dt * 9;
      } else if (this.kind[i] === KIND.DUST) {
        this.vx[i] *= 1 - 3 * dt;
      } else if (this.kind[i] === TWINKLE) {
        const k = 1 - TWINKLE_DRAG * dt;
        this.vx[i] *= k;
        this.vy[i] *= k;
        tw++;
      }
      n++;
    }
    this.n = n;
    this.twinkles = tw;
    this.others = n - tw;
  }

  // Drawn in world space; the caller has already translated for the camera.
  //
  // Four passes, one per alpha step, instead of writing ctx.globalAlpha once per
  // particle. Canvas state changes are far more expensive than the fillRect itself:
  // with a saturated pool this was ~1800 state writes a frame and it dominated the
  // whole render. Four passes over the array costs more iterations and ~4 alpha
  // writes. fillStyle is tracked the same way -- particles from one burst share a
  // colour, so consecutive slots usually hit the cached value.
  draw(ctx, view) {
    const STEPS = [1, 0.75, 0.5, 0.25];
    // Cull outside the view. Under the world zoom every fillRect is a transformed
    // rasteriser call, and a saturated pool spends most of its budget on particles
    // that have already drifted off-screen.
    const cl = view ? view.l - 8 : -1e9;
    const cr = view ? view.r + 8 : 1e9;
    const cb = view ? view.b - 8 : -1e9;
    const ct = view ? view.t + 8 : 1e9;
    let rings = false;
    for (let s = 0; s < 4; s++) {
      let opened = false;
      let lastColour = '';
      for (let i = 0; i < this.max; i++) {
        if (!this.alive[i]) continue;
        const k = this.kind[i];
        if (k === KIND.RING) { rings = true; continue; }
        if (k === TWINKLE) continue;          // sparks.js draws these, behind the play
        const cx = this.x[i];
        const cy = this.y[i];
        if (cx < cl || cx > cr || cy < cb || cy > ct) continue;
        const t = this.life[i] / this.maxLife[i];
        // Alpha in four hard steps rather than a smooth fade: a continuous ramp on a
        // low-resolution buffer just produces muddy grey pixels once it is upscaled.
        const stepIdx = t > 0.66 ? 0 : t > 0.4 ? 1 : t > 0.2 ? 2 : 3;
        if (stepIdx !== s) continue;

        if (!opened) { ctx.globalAlpha = STEPS[s]; opened = true; }
        const c = this.colour[i];
        if (c !== lastColour) { ctx.fillStyle = c; lastColour = c; }

        // Snapped to the ART grid, not to whole world units. At a 4-to-8 screen-pixel
        // lattice a settling mote teleports between cells instead of drifting, and a
        // SPARK tapering from two units went 2, 2, 1, 1, 1 and then vanished at full
        // size -- two steps where there should be eight.
        const x = Math.round(this.x[i] * PX) / PX;
        const y = Math.round(this.y[i] * PX) / PX;
        const U = 1 / PX;
        let sz = Math.max(U, Math.round(this.size[i] * (k === KIND.SPARK ? t : 1) * PX) / PX);
        if (k === KIND.TRAIL) sz = Math.max(U, Math.round(this.size[i] * t * PX) / PX);
        // Centred on HALF THE SIZE, snapped to the art grid.
        //
        // This was `sz >> 1`, a bitwise shift -- which coerces to a 32-bit integer, so
        // for any particle under two WORLD units (which is all of them) the offset was
        // zero and nothing was centred at all. It is a leftover from when sizes were
        // whole screen pixels rather than world units.
        const half = Math.round(sz * PX / 2) / PX;
        if (k === KIND.CONFETTI) {
          // Height in ART PIXELS. It was `Math.max(1, Math.round(...))` -- a whole WORLD
          // unit floor on a value rounded to whole world units, so every confetti was at
          // least eight screen pixels tall at the opening zoom and could only ever be a
          // whole number of them. Spinning flat it became a solid bar; a white one on a
          // burst read as a blank block stamped over the character.
          const h = Math.max(U, Math.round(sz * Math.abs(Math.cos(this.rot[i])) * PX) / PX + U);
          ctx.fillRect(x - half, y - Math.round(h * PX / 2) / PX, sz, h);
        } else {
          ctx.fillRect(x - half, y - half, sz, sz);
        }
      }
    }

    // Rings are strokes, so they cannot share the fill batching above. There are never
    // many of them -- one per air jump or wall bounce.
    if (rings) {
      // One ART pixel. `1` is a user-space unit here, so under the world transform the
      // shockwave was stroked four to eight screen pixels thick -- as wide as the motes
      // it expands past, where it is meant to be a hairline.
      ctx.lineWidth = 1 / PX;
      for (let i = 0; i < this.max; i++) {
        if (!this.alive[i] || this.kind[i] !== KIND.RING) continue;
        const t = this.life[i] / this.maxLife[i];
        ctx.globalAlpha = t;
        ctx.strokeStyle = this.colour[i];
        ctx.beginPath();
        ctx.arc(Math.round(this.x[i]), Math.round(this.y[i]),
          Math.max(1, (1 - t) * this.size[i]), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- emitters ------------------------------------------------------------
  landing(x, y, power, colour) {
    const n = 4 + Math.floor(power * 10);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.spawn(KIND.DUST, x + dir * (2 + this.rng.next() * 4), y + 1,
        dir * (25 + this.rng.next() * 70 * (0.4 + power)), 12 + this.rng.next() * 40,
        0.24 + this.rng.next() * 0.3, AP(2 + (this.rng.next() < 0.3 ? 1 : 0)), colour, 140);
    }
  }

  wallBounce(x, y, dir, speed, colour) {
    const n = 8 + Math.floor(speed / 28);
    for (let i = 0; i < n; i++) {
      const a = (this.rng.next() - 0.5) * 1.5;
      this.spawn(KIND.SPARK, x, y + this.rng.next() * 14 - 7,
        dir * (60 + this.rng.next() * speed * 0.7), Math.sin(a) * 110,
        0.2 + this.rng.next() * 0.3, AP(3), colour, 90);
    }
    this.spawn(KIND.RING, x, y, 0, 0, 0.3, 18, colour, 0);
  }

  airJump(x, y, which, colour) {
    this.spawn(KIND.RING, x, y, 0, 0, 0.34, which === 1 ? 20 : 28, colour, 0);
    const n = which === 1 ? 10 : 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(KIND.SPARK, x, y, Math.cos(a) * 95, Math.sin(a) * 60 - 30,
        0.28 + this.rng.next() * 0.22, AP(3), colour, 220);
    }
  }

  trail(x, y, colour, power) {
    this.spawn(KIND.TRAIL, x + (this.rng.next() - 0.5) * 6, y + this.rng.next() * 16,
      (this.rng.next() - 0.5) * 18, 8 + this.rng.next() * 22,
      0.16 + power * 0.22, AP(3 + (power > 0.7 ? 1 : 0)), colour, -30);
  }

  /**
   * The trail: stars and sparks falling out of him, more and brighter as the chain grows.
   * Called every simulation step with the LIVE chain's floors (0 when none is running);
   * sparks.js decides how many a second and what they look like.
   *
   * With no chain it is the plain speed trail it replaced -- a few sparks in the zone's own
   * colour, only while he is fast -- and the moment a chain ends it is that again: the
   * stream stops at its source, and what has already fallen out of him finishes its fall.
   */
  comboTrail(dt, p, floors, zone) {
    const moving = !p.grounded || Math.abs(p.vx) > 120;
    const rate = trailRate(floors, p.momentum, moving) * (this.twinkleCap / TWINKLE_FULL);
    if (!(rate > 0)) { this.shedAcc = 0; return; }
    // Shed per second of HIS clock (JUMP SPEED, Player.step), so the stream lies as thick
    // along his path at any speed; on the world's it thinned by the speed as he sped up.
    const k = p.rate || 1;
    this.shedClock += dt * k;
    this.shedAcc += rate * dt * k;
    // Which way is BEHIND him: his velocity reversed. At the top of a jump, where the
    // velocity vanishes and its direction is noise, the last one that meant anything.
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 40) { this.shedDir[0] = -p.vx / sp; this.shedDir[1] = -p.vy / sp; }
    const step = stepFor(floors);
    while (this.shedAcc >= 1) {
      this.shedAcc -= 1;
      // Its own cap, and the setting's: while the bursts hold most of the budget (a LOW
      // setting in a shower of confetti) the trail waits for room rather than adding to it.
      if (this.twinkles >= this.twinkleCap || this.twinkles + this.others >= this.budget) {
        this.shedAcc = 0;
        return;
      }
      this.shedOne(p, step, zone);
    }
  }

  shedOne(p, step, zone) {
    const pick = pickTwinkle(step, zone, this.rng.next(), this.rng.next(), this.shedClock);
    const shape = pick >> 5;
    const m = MOTION[shape];
    const bx = this.shedDir[0], by = this.shedDir[1];
    // From his body, pushed toward his back and scattered across it, so the stream comes
    // out of HIM rather than out of one point behind him. It is drawn behind him, so a
    // piece born inside his outline is hidden until he moves off it -- which is what
    // makes it read as falling out of him.
    const along = 2 + this.rng.next() * 6;           // world units behind his middle
    const across = (this.rng.next() - 0.5) * 14;     // world units either side of that line
    const x = p.x + bx * along - by * across;
    const y = p.y + BODY_MID + by * along + bx * across;
    // Launched BACKWARD, within about 25 degrees of straight back, on top of a share of
    // his own velocity that is always under one (INHERIT): it goes his way, slower, so it
    // is left behind along his path and cannot run ahead of him onto the ledge he is
    // about to land on.
    const kick = m.kick[0] + this.rng.next() * (m.kick[1] - m.kick[0]);
    const a = (this.rng.next() - 0.5) * 0.9;
    const c = Math.cos(a), s = Math.sin(a);
    const inh = INHERIT[0] + this.rng.next() * (INHERIT[1] - INHERIT[0]);
    const life = m.life[0] + this.rng.next() * (m.life[1] - m.life[0]);
    // Its OWN slots, round-robin, never the ring the bursts share. The first version took
    // free or trail slots in the ring, probing from the shared cursor and leaving it where
    // the piece went: at full stream that pushed the cursor round the ring two to eight
    // times faster than the rest of the game did, and every landing's dust, which spawns
    // plainly from it, came round onto confetti still in the air -- over a 60 s attract
    // run 22 confetti cut short on MEDIUM, where there had been none, and 102 on LOW
    // against 74. Walking the ring with a cursor of its own instead let every landing's
    // dust land on trail pieces (a fifth of them popped mid-fall on LOW) and stalled the
    // trail behind a milestone's block of confetti, dark for up to 1.6 s at the moment it
    // changes palette. In a region of its own it touches nothing and nothing touches it:
    // the ring moves exactly as it did before the trail existed, and the region is big
    // enough (TWINKLE_ROOM) that round-robin only reuses a slot whose piece has died.
    const i = this.trailBase + (this.shedCursor % this.shedRoom);
    this.shedCursor = (this.shedCursor + 1) % this.shedRoom;
    // His share in the world's units: his velocity is on his clock (JUMP SPEED) and a piece
    // flies on the world's, so it still leaves at under one of his REAL speed, as INHERIT says.
    const k = p.rate || 1;
    this.put(i, TWINKLE, x, y,
      (bx * c - by * s) * kick + p.vx * k * inh, (by * c + bx * s) * kick + p.vy * k * inh,
      life, SHAPE_SIZE[shape] / PX, '', m.grav);
    this.shape[i] = shape;
    this.ramp[i] = pick & 31;
    this.twinkles++;
  }

  burst(x, y, n, colours, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const sp = (40 + this.rng.next() * 170) * power;
      this.spawn(KIND.CONFETTI, x, y, Math.cos(a) * sp, Math.sin(a) * sp + 60,
        // Size in ART PIXELS, not world units. Two to four world units is sixteen to
        // thirty-two screen pixels at the opening zoom -- a confetti the size of the
        // character's head. Bursts fire on every air jump and landing, and the palette
        // includes white.
        0.7 + this.rng.next() * 0.9, AP(2 + Math.floor(this.rng.next() * 3)),
        colours[Math.floor(this.rng.next() * colours.length)], 260);
    }
  }

  shards(x, y, n, colour) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      this.spawn(KIND.SHARD, x, y, Math.cos(a) * 130, Math.sin(a) * 130 + 40,
        0.4 + this.rng.next() * 0.5, AP(3), colour, 300);
    }
  }
}
