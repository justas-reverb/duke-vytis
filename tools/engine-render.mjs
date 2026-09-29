// Render what the REAL music engine plays, offline.
//
// tools/render-music.mjs renders a theme by mirroring the engine: it re-schedules the
// notes itself from the same constants. That is fine for one theme at a steady intensity,
// and it cannot show a handover the engine decides at run time -- where a cut falls, what
// key a track takes from the music it cut into, what a later resetKeys() does or does not
// move. This drives src/render/audio.js itself, unmodified, through a recording
// AudioContext: every oscillator it starts, every gain automation event it schedules,
// every node it connects and disconnects. renderContext() then plays that graph back into
// samples the way WebAudio would -- band-limited oscillators, each note through its own
// envelope, each bus through its gain curve, the biquad low-passes -- so a WAV or a
// loudness figure from here is the game's own output, not a reconstruction of it.
//
// Used by tools/render-music.mjs --gameover (the lament's previews) and
// tools/test-lament.mjs (its key and its level). Nothing here plays a sound.

import fs from 'node:fs';
import {
  GRAVITY, FALL_GRAVITY, FALL_TERMINAL, FLOOR_GRAB, PIT_BASE, PIT_PER_FLOOR, PIT_MAX,
  IMPACT_HOLD, IMPACT_HOLD_DAZED, SPLAT_FLOOR,
} from '../src/game/constants.js';

export const SR = 44100;
const FRAME = 1 / 60;   // the game's frame: main.js drives setIntensity once a frame

// --- a recording AudioContext ------------------------------------------------------
class Param {
  constructor(ctx, v) { this.ctx = ctx; this.v0 = v; this.events = []; this.ordered = true; this.frozen = null; }
  push(e) {
    const last = this.events[this.events.length - 1];
    if (last && e[2] < last[2]) this.ordered = false;
    this.events.push(e);
  }
  list() {
    if (!this.ordered) {
      // Stable: events at one instant keep the order they were scheduled in.
      this.events = this.events.map((e, i) => [e, i]).sort((a, b) => a[0][2] - b[0][2] || a[1] - b[1]).map((x) => x[0]);
      this.ordered = true;
    }
    return this.events;
  }
  // WebAudio's getter returns the value as last computed, which a cancel made since does
  // not change: crossTo reads it straight after cancelScheduledValues to start its fade
  // from where the gain really was.
  get value() {
    if (this.frozen && this.frozen.t === this.ctx.currentTime) return this.frozen.v;
    return valueAt(this.list(), this.v0, this.ctx.currentTime);
  }
  set value(v) { this.push(['set', v, this.ctx.currentTime]); }
  setValueAtTime(v, t) { this.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.push(['exp', v, t]); return this; }
  cancelScheduledValues(t) {
    this.frozen = { t: this.ctx.currentTime, v: this.value };
    this.events = this.list().filter((e) => e[2] < t);
    return this;
  }
}

/** A gain automation's value at `t`: a ramp runs from the event before it to its own. */
function valueAt(ev, v0, t) {
  let k = -1;
  while (k + 1 < ev.length && ev[k + 1][2] <= t) k++;
  const a = k >= 0 ? ev[k][1] : v0;
  const ta = k >= 0 ? ev[k][2] : 0;
  const nx = ev[k + 1];
  if (!nx || nx[0] === 'set') return a;
  const x = (t - ta) / (nx[2] - ta);
  return nx[0] === 'lin' ? a + (nx[1] - a) * x : a * Math.pow(nx[1] / a, x);
}

class Node {
  constructor(ctx, kind, extra) {
    this.ctx = ctx; this.kind = kind; this.out = null; this.cutAt = Infinity;
    Object.assign(this, extra);
    ctx.nodes.push(this);
  }
  connect(n) { this.out = n; }
  // The engine disconnects a theme's buses once they are silent (dropSet): what they
  // carried stops reaching the mix from that instant.
  disconnect() { this.cutAt = Math.min(this.cutAt, this.ctx.currentTime); }
}

export class RecordingContext {
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = SR;
    this.nodes = []; this.oscs = [];
    this.destination = new Node(this, 'dest');
  }
  createGain() { return new Node(this, 'gain', { gain: new Param(this, 1) }); }
  createBiquadFilter() {
    return new Node(this, 'biquad', { type: 'lowpass', frequency: new Param(this, 350), Q: new Param(this, 1) });
  }
  createDynamicsCompressor() {
    // The limiter. Passed through: the music alone never reaches its threshold, and
    // render-music prints the peak going into it to show that.
    const p = () => new Param(this, 0);
    return new Node(this, 'comp', { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() });
  }
  createOscillator() {
    const o = {
      kind: 'osc', type: 'sine', frequency: new Param(this, 440), out: null, t0: undefined, t1: Infinity,
      connect(n) { this.out = n; }, start(t) { this.t0 = t; }, stop(t) { this.t1 = t; },
    };
    this.oscs.push(o);
    return o;
  }
  // Effects only; nothing rendered here plays one.
  createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
  createBufferSource() { return { connect() {}, start() {}, stop() {}, playbackRate: new Param(this, 1) }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

/**
 * Put the recording context where the engine looks for one, and stop its timers from
 * running on their own: the scheduler is pumped by hand, frame by frame, below.
 */
export function installRecorder() {
  globalThis.window = globalThis.window || {};
  globalThis.window.AudioContext = RecordingContext;
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  globalThis.setTimeout = () => 0;
}

// --- playing the graph back ---------------------------------------------------------
// Band-limited as WebAudio's are (polyBLEP here, wavetables there), each built-in wave
// normalised to a peak of 1 as WebAudio does: a band-limited square or sawtooth overshoots
// its plateau by about 18%, so the plateaus sit at about 0.85.
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const NORM = { square: 1 / 1.179, sawtooth: 1 / 1.179, triangle: 1, sine: 1 };
function wave(type, ph, dt) {
  switch (type) {
    case 'square': { let v = ph < 0.5 ? 1 : -1; v += blep(ph, dt); v -= blep((ph + 0.5) % 1, dt); return v; }
    case 'sawtooth': return 2 * ph - 1 - blep(ph, dt);
    case 'triangle': return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    default: return Math.sin(2 * Math.PI * ph);
  }
}

/**
 * A gain automation, sample by sample, from sample n0 for n samples; before its first event
 * it is `initial` (the param's default unless told).
 */
function curve(param, n0, n, initial = param.v0) {
  const ev = param.list();
  const out = new Float32Array(n);
  let k = -1;
  for (let i = 0; i < n; i++) {
    const t = (n0 + i) / SR;
    while (k + 1 < ev.length && ev[k + 1][2] <= t) k++;
    const a = k >= 0 ? ev[k][1] : initial;
    const ta = k >= 0 ? ev[k][2] : 0;
    const nx = ev[k + 1];
    if (!nx || nx[0] === 'set') { out[i] = a; continue; }
    const x = (t - ta) / (nx[2] - ta);
    out[i] = nx[0] === 'lin' ? a + (nx[1] - a) * x : a * Math.pow(nx[1] / a, x);
  }
  return out;
}

/** WebAudio's BiquadFilter low-pass, in place. For a low-pass its Q is in dB. */
function lowpass(buf, hz, qdb) {
  const w0 = (2 * Math.PI * hz) / SR;
  const alpha = Math.sin(w0) / (2 * Math.pow(10, qdb / 20));
  const c = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0;
  const a1 = (-2 * c) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < buf.length; n++) {
    const x = buf[n];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[n] = y;
  }
}

/**
 * Everything the context was asked to play, to `seconds`, as it would leave the speakers
 * (before the limiter). Each oscillator is rendered through its note's own gain envelope
 * straight into the bus that note is connected to; each bus then through its gain curve,
 * cut off where it was disconnected, into the node after it, down to the destination.
 */
export function renderContext(ctx, seconds) {
  const N = Math.ceil(seconds * SR);
  const input = new Map();
  const buf = (nd) => { let b = input.get(nd); if (!b) { b = new Float32Array(N); input.set(nd, b); } return b; };
  for (const o of ctx.oscs) {
    const g = o.out;
    if (!g || o.t0 === undefined) continue;
    g.isNote = true;
    if (!g.out) continue;
    const n0 = Math.max(0, Math.ceil(o.t0 * SR));
    const n1 = Math.min(N, Math.ceil(o.t1 * SR));
    if (n1 <= n0) continue;
    // A note's envelope opens on an event at the instant its oscillator starts, and the
    // first sample, ceiled from t0 * SR, can come a rounding error BEFORE that event. Read
    // there, the gain was its default, 1: a whole note at full level for one sample. Nobody
    // heard it while notes came one or two at a time; the lament's stab starts fifty at
    // once, and in one death they summed to a click at -10.8 dBFS, 12 dB over the music's
    // peak. WebAudio has no such sample -- the oscillator is silent until it starts -- so
    // before its first event a note's gain is that event's value.
    const first = g.gain.list()[0];
    const env = curve(g.gain, n0, n1 - n0, first ? first[1] : g.gain.v0);
    const hz = o.frequency.events.length ? o.frequency.events[0][1] : o.frequency.v0;
    const dest = buf(g.out);
    const dt = hz / SR;
    const norm = NORM[o.type];
    let ph = 0;
    for (let n = n0, j = 0; n < n1; n++, j++) {
      dest[n] += wave(o.type, ph, dt) * norm * env[j];
      ph += dt;
      if (ph >= 1) ph -= 1;
    }
  }
  const children = new Map();
  for (const nd of ctx.nodes) {
    if (!nd.out || nd.isNote) continue;
    if (!children.has(nd.out)) children.set(nd.out, []);
    children.get(nd.out).push(nd);
  }
  // Every node has one output, so the graph is a tree into the destination: each node is
  // worked out once, from its inputs, and its buffer let go as soon as it is summed.
  const output = (nd) => {
    const b = buf(nd);
    for (const c of children.get(nd) || []) {
      const cb = output(c);
      const cut = Math.min(N, Math.ceil(c.cutAt * SR));
      for (let i = 0; i < cut; i++) b[i] += cb[i];
      input.delete(c);
    }
    if (nd.kind === 'gain') {
      const g = curve(nd.gain, 0, N);
      for (let i = 0; i < N; i++) b[i] *= g[i];
    } else if (nd.kind === 'biquad') lowpass(b, nd.frequency.value, nd.Q.value);
    return b;
  };
  return output(ctx.destination);
}

// --- measuring ----------------------------------------------------------------------
/**
 * Loudness as the ear weighs it, roughly: ITU BS.1770's K-weighting (a +4 dB shelf over
 * about 1.7 kHz and a high-pass under about 40 Hz) before the mean square, in LUFS
 * without the gating -- the figure tools/render-music.mjs balances the themes by.
 */
export function loudness(buf, from = 0, to = buf.length) {
  const x = Float32Array.from(buf.subarray(from, to));
  const biquad = (b0, b1, b2, a0, a1, a2) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let n = 0; n < x.length; n++) {
      const v = x[n];
      const y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      x[n] = y;
    }
  };
  {
    const A = Math.pow(10, 4 / 40), w = (2 * Math.PI * 1681.97) / SR;
    const al = Math.sin(w) / (2 * 0.7072), c = Math.cos(w), s = 2 * Math.sqrt(A) * al;
    biquad(A * ((A + 1) + (A - 1) * c + s), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - s),
      (A + 1) - (A - 1) * c + s, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - s);
  }
  {
    const w = (2 * Math.PI * 38.135) / SR, al = Math.sin(w) / (2 * 0.5003), c = Math.cos(w);
    biquad((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  let s = 0;
  for (const v of x) s += v * v;
  return -0.691 + 10 * Math.log10(Math.max(1e-12, s / Math.max(1, x.length)));
}
export const rms = (b, from = 0, to = b.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
export const peak = (b, from = 0, to = b.length) => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(b[i]));
  return p;
};
export const dB = (x) => 20 * Math.log10(Math.max(1e-9, x));

export function wav(file, buf, gain) {
  const n = buf.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, buf[i] * gain));
    b.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, b);
}

// --- a run and a death, as the game drives the engine ---------------------------------
/**
 * How long the fall takes from a run whose highest floor is `maxFloor`, as
 * Game.stepFalling runs it: the pit's depth from the floor count, the grab's downward
 * yank, the fall's own gravity and terminal speed. 1.0 s from the ground, 2.45 s from
 * floor 654 up (the depth's cap).
 */
export function fallSeconds(maxFloor) {
  const depth = Math.min(PIT_MAX, PIT_BASE + maxFloor * PIT_PER_FLOOR);
  const dt = 1 / 240;
  let y = 0, vy = -FLOOR_GRAB, t = 0;
  while (y > -depth) {
    vy = Math.max(-FALL_TERMINAL, vy - GRAVITY * FALL_GRAVITY * dt);
    y += vy * dt;
    t += dt;
  }
  return t;
}

/**
 * Drive a fresh engine through a run and its death the way the game does, frame by frame
 * -- main.js starts the climb and sets the intensity each frame; the hooks on the Game
 * (onFallStart, onImpact) are render/gamesounds.js's, which were main.js's when this was
 * written:
 *
 *   startClimb(floor), in the key of the rung its zone has reached, or `key` (a companion's
 *   lift used to add to it; they no longer move the key); the run's intensity every
 *   frame (PLAYING)
 *   at `fallAt`, onFallStart: lament()
 *   nothing drives the tempo while he falls (FALLING)
 *   at the impact, onImpact: resetKeys(); crossTo('gameover') if the lament is not on;
 *   landLament(), the stab struck with the body                  -- unless `skip`
 *   the scoreboard (DEAD) from IMPACT_HOLD after it: landLament() (which only a skip still
 *   needs), then intensity 0 every frame
 *
 * `skip` is Space during the fall: straight to the scoreboard, and no impact at all.
 * `climbTo` is [time, floor]: the run reaches that floor then (followClimb), which at a
 * stage's first floor starts a stage handover. Returns the engine and the times things
 * happened on its clock, plus `cut`, where the lament's first note fell, and `stab`: when
 * the stab was struck and the buses it plays on (the fall's were let go under it).
 */
export function playDeath(Audio, { floor, key = null, fallAt, until, intensity = 0.35, skip = null, climbTo = null }) {
  const a = new Audio();
  a.init();
  const ctx = a.ctx;
  a.startClimb(floor);
  // A key other than the rung at `floor`, for a death in a key the floor alone does not reach.
  if (key !== null) a.setKey(key);
  const fall = fallSeconds(floor);
  const impact = skip === null ? fallAt + fall : Infinity;
  const dead = skip === null ? impact + (floor >= SPLAT_FLOOR ? IMPACT_HOLD : IMPACT_HOLD_DAZED) : fallAt + skip;
  const heard = { track: null, transpose: 0 };
  let cut = null, climb = null, lament = null, stab = null;
  let fell = false, landed = false, scored = false;
  for (let f = 1; f * FRAME <= until + 1e-9; f++) {
    const t = f * FRAME;
    ctx.currentTime = t;
    if (climbTo && !fell && t >= climbTo[0]) { a.followClimb(climbTo[1]); climbTo = null; }
    if (!fell && t >= fallAt) {
      fell = true;
      // The key sounding at the fall, which is what the effects are tuned to (keyNow).
      const k = a.keyNow(t);
      heard.track = k.track;
      heard.transpose = k.transpose;
      a.lament();
      // The climb as it was handed over (the engine lets go of it once it is silent).
      climb = a.outgoing;
      lament = { bus: a.bus, choirBus: a.choirBus };
      cut = climb ? climb.end : t;
    }
    // As gamesounds.js's onImpact: the live keys cleared, the lament started if the catch
    // could not, and its stab landed with the body (landLament).
    if (fell && !landed && t >= impact) {
      landed = true;
      a.resetKeys();
      if (a.track !== 'gameover' && a.pendingTrack !== 'gameover') a.crossTo('gameover');
      a.landLament();
      stab = { at: a.landing && a.landing.at, bus: a.bus, choirBus: a.choirBus };
    }
    // And its scoreboard arriving, which is a skipped fall's landing.
    if (fell && !scored && t >= dead) {
      scored = true;
      a.landLament();
      if (!stab) stab = { at: a.landing && a.landing.at, bus: a.bus, choirBus: a.choirBus };
    }
    if (!fell) a.setIntensity(intensity, FRAME);
    else if (t >= dead) a.setIntensity(0, FRAME);
    a.pump();
  }
  return { audio: a, ctx, fall: fallAt, cut, impact, dead, heard, climb, lament, stab, fallSecs: fall };
}
