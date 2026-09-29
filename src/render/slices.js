// Painting cut into slices a frame can afford.
//
// Everything drawn at art resolution is painted ahead, into canvases, and blitted in play
// (ARCHITECTURE.md, "What the drawn layers cost a frame"). A warm-up that paints a PIECE a
// frame is only as smooth as its biggest piece, and a piece is whatever a painter does
// between two of its yields: for the scoreboard (gameoverskin.js) a panel or a word of its
// title was up to 22-46 ms in Chromium -- painted while the Duke fell, at 160 Hz, where a
// frame is 6.25 ms. A step boundary that falls wherever the painter happens to have one is
// not a budget.
//
// So a painter that may run under a budget is written as a generator that asks overdue()
// as it goes -- after each row of a pass over the pixels, each glyph of an atlas, each puff
// of a cloud -- and yields when it is true. runUntil() sets the deadline, resumes the
// painter, and hands the frame back the moment the deadline has passed: a frame spends its
// budget and at most one row's work more, whatever is being painted.
//
// Nothing changes for anything that runs the same painters WITHOUT a deadline -- the HUD
// skin's own warm-up, the zone titles, the callouts, the tools. overdue() is false while no
// deadline is set, so those painters never yield anywhere they did not before, and their
// plain entry points (drain) paint exactly what they painted, in the same number of steps.

let deadline = Infinity;

/** True once the slice being run has used its time; a painter checks it and yields. */
export function overdue() {
  return deadline !== Infinity && performance.now() >= deadline;
}

/** Run a generator to its end, whatever it yields, and return what it returns. */
export function drain(gen) {
  let r;
  do r = gen.next(); while (!r.done);
  return r.value;
}

/**
 * Whatever `v` is -- a generator a sliced painter returned, or the finished value a plain
 * one did -- its value: `yield* steps(f())` works for either, so a caller need not know
 * which kind of painter a zone's spec hands it (hudpaint.js frames are both).
 */
export function* steps(v) {
  return v && typeof v.next === 'function' ? yield* v : v;
}

/**
 * Resume `gen` until it finishes or the clock passes `until` (a performance.now() time).
 * Returns the generator's result, { done, value }, or { done: false } when time ran out.
 * The deadline is only set for the duration of the call, so a painter run from anywhere
 * else in the same frame is not cut short by it.
 */
export function runUntil(gen, until) {
  const was = deadline;
  deadline = until;
  try {
    for (;;) {
      const r = gen.next();
      if (r.done) return r;
      if (performance.now() >= until) return { done: false, value: undefined };
    }
  } finally {
    deadline = was;
  }
}
