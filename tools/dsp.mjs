// The signal processing the offline renderers share: band-limited oscillators, WebAudio's
// automation curves and BiquadFilters, loudness, and a WAV writer. Nothing here plays a
// sound; it all writes numbers into arrays.
//
// It was the inside of tools/render-music.mjs until the sound effects needed the same
// oscillators, the same bus and the same loudness meter to be measured against the music
// (tools/render-sfx.mjs, tools/test-sfx.mjs). Two copies of a polyBLEP square would have
// been two chances for the previews to disagree about what a square is.

import fs from 'node:fs';

export const SR = 44100;

// --- oscillators ------------------------------------------------------------
// Band-limited with polyBLEP, as WebAudio's are with wavetables: a naive square at
// these pitches aliases audibly, and a preview that fizzes where the game does not is
// worse than none.
export function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// WebAudio normalises each built-in wave so its peak is 1. A band-limited square or
// sawtooth overshoots its plateau by about 18% (the Gibbs peak), so its plateaus sit at
// about 0.85 after that; a triangle has no overshoot.
export const NORM = { square: 1 / 1.179, sawtooth: 1 / 1.179, triangle: 1, sine: 1 };
export function wave(type, ph, dt) {
  switch (type) {
    case 'square': {
      let v = ph < 0.5 ? 1 : -1;
      v += blep(ph, dt);
      v -= blep((ph + 0.5) % 1, dt);
      return v;
    }
    case 'sawtooth': return 2 * ph - 1 - blep(ph, dt);
    case 'triangle': return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    default: return Math.sin(2 * Math.PI * ph);
  }
}

/**
 * A WebAudio AudioParam's automation, [kind, value, time] with kind 'set', 'exp' or 'lin',
 * as a cursor that must be read at rising times: a ramp runs from the previous event's
 * value and time to its own; after the last event, or before a 'set', the value holds.
 * Before the first event the param has `initial` (every patch here opens on a 'set').
 */
export function automation(events, initial = 0) {
  const ev = events;
  let k = -1;
  return (t) => {
    while (k + 1 < ev.length && ev[k + 1][2] <= t) k++;
    if (k < 0) return initial;
    const nx = ev[k + 1];
    const v0 = ev[k][1];
    if (!nx || nx[0] === 'set') return v0;
    const x = (t - ev[k][2]) / (nx[2] - ev[k][2]);
    return nx[0] === 'lin' ? v0 + (nx[1] - v0) * x : v0 * Math.pow(nx[1] / v0, x);
  };
}

/** Add one note -- an oscillator through its gain envelope -- into `buf`. */
export function note(buf, type, hz, env, gain = 1) {
  const ev = env.events;
  const n0 = Math.max(0, Math.ceil(ev[0][2] * SR));
  const n1 = Math.min(buf.length, Math.ceil(env.stop * SR));
  const dt = hz / SR;
  const norm = NORM[type] * gain;
  let ph = 0;
  let k = 0;
  for (let n = n0; n < n1; n++) {
    const t = n / SR;
    while (k + 1 < ev.length && ev[k + 1][2] <= t) k++;
    // WebAudio automation: a ramp runs from the previous event's value and time to its
    // own; after the last event, or before a 'set', the value holds.
    const v0 = ev[k][1];
    const nx = ev[k + 1];
    let g = v0;
    if (nx && nx[0] !== 'set') {
      const x = (t - ev[k][2]) / (nx[2] - ev[k][2]);
      g = nx[0] === 'lin' ? v0 + (nx[1] - v0) * x : v0 * Math.pow(nx[1] / v0, x);
    }
    buf[n] += wave(type, ph, dt) * norm * g;
    ph += dt;
    if (ph >= 1) ph -= 1;
  }
}

/** WebAudio's BiquadFilter low-pass, in place. For a low-pass its Q is in dB. */
export function lowpass(buf, hz, qdb) {
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
 * The coefficients of WebAudio's BiquadFilter types the effects use, from the Audio EQ
 * Cookbook as the spec gives them: a low- or high-pass's Q is in dB, a band-pass's is
 * the plain Q (and its peak gain is 0 dB).
 */
export function biquadCoefs(type, hz, q) {
  const w0 = (2 * Math.PI * Math.min(hz, SR / 2 - 1)) / SR;
  const c = Math.cos(w0), s = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'bandpass') {
    const alpha = s / (2 * Math.max(1e-4, q));
    b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
  } else {
    const alpha = s / (2 * Math.pow(10, q / 20));
    if (type === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/**
 * A biquad over `buf` in place, from sample n0 on, its cutoff following `hzAt(t)` --
 * recomputed every 32 samples, which for a sweep is finer than the ear -- and a fixed Q.
 */
export function biquad(buf, type, hzAt, q, n0 = 0) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let co = null;
  for (let n = n0; n < buf.length; n++) {
    if (co === null || (n - n0) % 32 === 0) co = biquadCoefs(type, hzAt(n / SR), q);
    const x = buf[n];
    const y = co[0] * x + co[1] * x1 + co[2] * x2 - co[3] * y1 - co[4] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[n] = y;
  }
}

// --- measuring ----------------------------------------------------------------
/** The K-weighting of ITU BS.1770 applied to a copy: a +4 dB shelf and a 38 Hz high-pass. */
function kWeighted(buf, gain) {
  const x = Float32Array.from(buf, (v) => v * gain);
  const run = (b0, b1, b2, a0, a1, a2) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let n = 0; n < x.length; n++) {
      const v = x[n];
      const y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      x[n] = y;
    }
  };
  {
    // The shelf: RBJ high-shelf, 1681.97 Hz, +4 dB, Q 0.7072.
    const A = Math.pow(10, 4 / 40), w = (2 * Math.PI * 1681.97) / SR;
    const al = Math.sin(w) / (2 * 0.7072), c = Math.cos(w), s = 2 * Math.sqrt(A) * al;
    run(A * ((A + 1) + (A - 1) * c + s), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - s),
      (A + 1) - (A - 1) * c + s, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - s);
  }
  {
    // The high-pass: RBJ, 38.135 Hz, Q 0.5003.
    const w = (2 * Math.PI * 38.135) / SR, al = Math.sin(w) / (2 * 0.5003), c = Math.cos(w);
    run((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  return x;
}

/**
 * Loudness as the ear weighs it, roughly: ITU BS.1770's K-weighting (a +4 dB shelf over
 * about 1.7 kHz and a high-pass under about 40 Hz) before the mean square, in LUFS
 * without the gating. Plain RMS is not enough to balance three themes whose energy sits
 * in different places -- a galloping bass at 73 Hz and a triangle lead at 700 Hz can
 * have the same RMS and sound nothing alike in level -- and nobody here can listen.
 */
export function loudness(buf, gain = 1) {
  const x = kWeighted(buf, gain);
  let s = 0;
  for (const v of x) s += v * v;
  return -0.691 + 10 * Math.log10(Math.max(1e-12, s / x.length));
}

/**
 * The loudest `window` seconds of `buf`, K-weighted, in LUFS: with 0.4 s this is BS.1770's
 * MOMENTARY loudness at its maximum, the standard way to put a short sound on the same
 * scale as a programme's integrated loudness. A buffer shorter than the window is measured
 * as if padded with silence to it, which is what the meter would see.
 */
export function maxLoudness(buf, gain = 1, window = 0.4) {
  const x = kWeighted(buf, gain);
  const w = Math.max(1, Math.round(window * SR));
  let s = 0, best = 0;
  for (let n = 0; n < x.length; n++) {
    s += x[n] * x[n];
    if (n >= w) s -= x[n - w] * x[n - w];
    if (s > best) best = s;
  }
  return -0.691 + 10 * Math.log10(Math.max(1e-12, best / w));
}

export const rms = (b, from = 0, to = b.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
export const peak = (b) => { let p = 0; for (const v of b) p = Math.max(p, Math.abs(v)); return p; };
export const db = (x) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

// --- write ----------------------------------------------------------------------------
/** A mono 16-bit WAV of `buf` times `gain`, hard-limited at full scale. */
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
