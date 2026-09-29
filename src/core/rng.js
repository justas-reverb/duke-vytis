// Seeded PRNG. The tower must be reproducible: a seed in the URL replays the exact
// same 100,000 floors, which is what makes the reachability test suite meaningful.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * mulberry32 with its state in a FIELD rather than in a closure.
 *
 * It used to be `this.next = mulberry32(seed)`, the same numbers from a closure. A replay
 * seeks by restoring a copy of the whole game (src/game/snapshot.js), and a closure's
 * state cannot be copied: a restored tower would have gone on drawing from the ORIGINAL
 * tower's stream, both of them advancing it. As a field it is copied like any other
 * number. The sequence is bit for bit the one mulberry32 gives for the same seed --
 * tools/test-replay.mjs checks it against the function above.
 */
export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.a = this.seed;
  }
  next() {
    const a = this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(lo = 0, hi = 1) { return lo + this.next() * (hi - lo); }
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }   // inclusive
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

/**
 * A 32-bit integer hash (murmur3's finaliser), for deriving one seed from another. The
 * cosmetic streams of a run are seeded from the run's seed through this, so they do not
 * start as the tower's own stream shifted along by a few draws.
 */
export function mix32(x) {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export function randomSeed() { return (Math.random() * 0xffffffff) >>> 0; }
