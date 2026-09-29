// Fixed-timestep simulation with an interpolated render pass.
//
// The target is a 160 Hz display, but nothing here assumes 160. Physics runs at a
// fixed STEP regardless of refresh rate, and the renderer draws a blend between the
// previous and current state. That is what keeps motion smooth at 160 Hz without the
// simulation behaving differently than it does at 60.
//
// Interpolation matters more than usual here: at 160 Hz a single dropped step is 6 ms,
// and a tower scrolling at 300 px/s moves ~2 virtual pixels in that time. Snapping
// instead of blending reads as judder.

export const STEP = 1 / 240;          // simulation tick (s)
const MAX_FRAME = 0.25;               // never simulate more than this per frame

export class Loop {
  constructor({ update, render, onStats, onFrame }) {
    this.update = update;
    this.render = render;
    this.onStats = onStats;
    // Called once per frame with the frame's dt, BEFORE its simulation steps: input that
    // has to be polled rather than delivered as events (the gamepad) is read here, so
    // this frame's steps already see it.
    this.onFrame = onFrame;
    this.acc = 0;
    this.prev = 0;
    this.running = false;
    this.rafId = 0;
    this.ticks = 0;
    this.fallback = false;
    this.watchdog = 0;

    // Render governor. The SIMULATION always runs in real time at STEP -- capping that
    // would change the physics -- but drawing is the expensive half and there is no
    // reason to do it 160 times a second while the game sits on a menu the player is
    // not looking at. 0 means uncapped, which is what a live run gets.
    this.minFrame = 0;
    this._renderAcc = 0;
    this.rendered = 0;

    // rolling perf counters
    this.frames = 0;
    this.steps = 0;
    this.fpsAcc = 0;
    this.fps = 0;
    this.worstFrameMs = 0;
    this.cpuMs = 0;
    this._cpuAcc = 0;

    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.prev = performance.now();
    this.acc = 0;
    this.ticks = 0;
    this.rafId = requestAnimationFrame(this._tick);

    // Watchdog. Some embedded webviews, automation harnesses and heavily throttled
    // background tabs never fire requestAnimationFrame at all, and the failure mode is
    // a game that draws exactly one frame and then looks frozen with no error anywhere.
    // If nothing has ticked shortly after start, drive the loop from a timer instead.
    // Timer pacing is worse than vsync -- that is the point of preferring rAF -- but a
    // badly paced game beats a still image.
    this.watchdog = setTimeout(() => {
      if (this.running && this.ticks === 0) this.useTimerFallback();
    }, 400);
  }

  useTimerFallback() {
    if (this.fallback) return;
    this.fallback = true;
    cancelAnimationFrame(this.rafId);
    console.warn('requestAnimationFrame is not firing; falling back to a timer.');
    this.prev = performance.now();
    this.timerId = setInterval(() => {
      if (this.running) this._tick(performance.now());
    }, 8);
  }

  /** Cap the DRAW rate. 0 uncaps it; the simulation is never capped. */
  setRenderCap(fps) {
    this.minFrame = fps > 0 ? 1 / fps : 0;
    if (this.minFrame > 0 && this._renderAcc > this.minFrame) this._renderAcc = this.minFrame;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.watchdog);
    if (this.timerId) { clearInterval(this.timerId); this.timerId = 0; }
  }

  _tick(now) {
    if (!this.running) return;
    this.ticks++;
    if (!this.fallback) this.rafId = requestAnimationFrame(this._tick);

    let dt = (now - this.prev) / 1000;
    this.prev = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;   // tab was hidden / breakpoint hit
    const frameMs = dt * 1000;
    if (frameMs > this.worstFrameMs) this.worstFrameMs = frameMs;

    const t0 = performance.now();

    if (this.onFrame) this.onFrame(dt);

    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP) {
      this.update(STEP);
      this.acc -= STEP;
      this.steps++;
      // Hard bound. If the machine cannot keep up we drop simulation time rather
      // than freeze: a spiral of death on a rising camera is an instant unfair loss.
      if (++n > 12) { this.acc = 0; break; }
    }

    // Draw, unless the governor says this frame is not worth drawing. The interpolation
    // argument is still the live accumulator, so a capped frame is a correct frame --
    // just a less frequent one.
    this._renderAcc += dt;
    if (this.minFrame <= 0 || this._renderAcc >= this.minFrame) {
      // SUBTRACT the interval, never reset to zero. Resetting quantises the cap to a
      // whole number of display frames -- a 60 cap on a 160 Hz panel drew every third
      // frame, which is 53 fps, not 60. Subtracting lets the remainder carry so the
      // average comes out right, with the cost that the gaps alternate slightly.
      this._renderAcc -= this.minFrame;
      // Do not let the debt run away if the display is slower than the cap, or the
      // first frame after a stall would draw several times in a row.
      if (this._renderAcc > this.minFrame) this._renderAcc = this.minFrame;
      this.render(this.acc / STEP);
      this.rendered++;
    }

    this._cpuAcc += performance.now() - t0;

    this.frames++;
    this.fpsAcc += dt;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.frames / this.fpsAcc;
      this.cpuMs = this._cpuAcc / this.frames;
      if (this.onStats) this.onStats(this);
      this.frames = 0;
      this.fpsAcc = 0;
      this._cpuAcc = 0;
      this.worstFrameMs = 0;
    }
  }
}
