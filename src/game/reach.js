// Reachability: the proof that the tower is always climbable.
//
// The requirement: the ledges are random, but never so broken that the tower cannot be
// climbed. That has to hold for the WORST case, which is a player standing dead still on a
// platform with zero momentum -- the weakest jump the game can produce. Everything
// here is computed for that player. A moving player is strictly better off.
//
// Nothing below is a tuned magic number. The generator asks this module how far it
// is allowed to move the next platform, so retuning the physics automatically
// retunes the level generator instead of quietly making the tower impossible.

import {
  GRAVITY, JUMP_V0_MIN, ACCEL_AIR, VX_MAX_COLD, FLOOR_H, PLAYER_W,
} from './constants.js';

// Time from takeoff until the feet fall back through height dy, for a jump of v0.
// Returns Infinity if the jump never reaches dy at all.
export function airtimeAbove(dy, v0 = JUMP_V0_MIN, g = GRAVITY) {
  const disc = v0 * v0 - 2 * g * dy;
  if (disc < 0) return Infinity;
  return (v0 + Math.sqrt(disc)) / g;
}

// Furthest horizontal distance a player starting from rest can cover in T seconds,
// accelerating at A up to a cap of V.
export function maxHorizontal(T, A = ACCEL_AIR, V = VX_MAX_COLD) {
  if (!isFinite(T) || T <= 0) return 0;
  const tCap = V / A;
  if (T <= tCap) return 0.5 * A * T * T;
  return V * (T - tCap * 0.5);
}

// The hard ceiling: how far apart two consecutive platform EDGES may be and still be
// crossable by the weakest possible jump.
export const ABSOLUTE_REACH = maxHorizontal(airtimeAbove(FLOOR_H));

// What the generator is actually allowed to use. The margin covers everything the
// closed-form model does not: the discrete 1/240 s integration stepping slightly past
// the analytic crossing, the player needing to land with their body over the platform
// rather than a point, and simple human imprecision.
export const SAFETY = 0.62;
export const MAX_EDGE_GAP = Math.floor(ABSOLUTE_REACH * SAFETY);

// Gap between two x-intervals; 0 if they overlap at all.
export function edgeGap(aL, aR, bL, bR) {
  if (bL > aR) return bL - aR;
  if (aL > bR) return aL - bR;
  return 0;
}

// The verifier. Used by the generator on every single platform it emits, and by the
// offline test suite across millions of floors. If this ever returns false in play,
// the tower has a hole in it.
export function isReachable(prev, next) {
  const gap = edgeGap(prev.x, prev.x + prev.w, next.x, next.x + next.w);
  if (gap > MAX_EDGE_GAP) return false;
  // A platform narrower than the player is not a landing, it is a coin flip.
  if (next.w < PLAYER_W + 4) return false;
  return true;
}

// Clamp `x` so a platform of width w on the next floor stays reachable from `prev`.
export function clampReachable(x, w, prev, lo, hi) {
  const minX = Math.max(lo, prev.x - w - MAX_EDGE_GAP);
  const maxX = Math.min(hi - w, prev.x + prev.w + MAX_EDGE_GAP);
  if (minX > maxX) return Math.max(lo, Math.min(hi - w, prev.x));  // degenerate; hug prev
  return Math.max(minX, Math.min(maxX, x));
}
