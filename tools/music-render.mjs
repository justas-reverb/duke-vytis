// The music, rendered offline exactly as the engine schedules it: the themes, the menu and
// the handovers between stages, as sample buffers at the level they reach the limiter in
// the game. tools/render-music.mjs writes them to WAV; tools/render-sfx.mjs and
// tools/test-sfx.mjs render them to measure the sound effects against, because an
// effect's level means something only next to the music it plays over.
//
// It MIRRORS THE ENGINE rather than approximating it: the voices, their oscillators and
// gains come from voicesOf(), every note's envelope from envelope(), the tempo and
// choir curves from tempoTargetFor()/choirLevelFor() with the engine's easing rates,
// the handover timings from the HANDOVER_ constants, and the bus levels and low-passes
// from MUSIC_BUS -- all imported from src/render/audio.js, so a change there changes
// the previews. What it adds is what WebAudio does inside the browser: band-limited
// oscillators (polyBLEP here, wavetables there), the built-in waves' normalisation, and
// the BiquadFilter low-pass with its Q in dB (tools/dsp.mjs). The limiter is left out:
// the music alone never reaches its threshold.

import { TRACKS } from '../src/render/tracks.js';
import {
  freq, voicesOf, pitchesOf, stopsOf, stopRatio, stopGain, VOICE_NAMES, envelope, tempoTargetFor, choirLevelFor, tempoStep,
  CHOIR_EASE, CHOIR_MIN, MUSIC_BUS, HANDOVER_FADE, HANDOVER_SWELL, HANDOVER_FROM, HANDOVER_TAIL,
} from '../src/render/audio.js';
import { SR, note, lowpass, rms } from './dsp.mjs';

export const FRAME = 1 / 60;        // the game's control rate: setIntensity runs once a frame

// --- the control curves -------------------------------------------------------
/**
 * The tempo multiplier and the choir bus level, frame by frame, for an intensity that
 * is a function of time -- eased exactly as Audio.setIntensity eases them for the track
 * `name` (tempoStep: a climb theme leans with the run, capped per bar of its written bpm;
 * the menu settles). A track starts at tempo 1 (playTrack) and the choir bus at CHOIR_MIN
 * (init).
 */
export function controls(seconds, intensityAt, name) {
  const frames = Math.ceil(seconds / FRAME) + 2;
  const tempo = new Float64Array(frames);
  const choir = new Float64Array(frames);
  const bar = (16 * 60) / TRACKS[name].bpm / 4;
  let tp = 1, ch = CHOIR_MIN;
  for (let f = 0; f < frames; f++) {
    const i = intensityAt(f * FRAME);
    tp = tempoStep(name, tp, tempoTargetFor(i), FRAME, bar);
    ch += (choirLevelFor(i) - ch) * Math.min(1, FRAME * CHOIR_EASE);
    tempo[f] = tp;
    choir[f] = ch;
  }
  return {
    tempo: (t) => tempo[Math.min(frames - 1, Math.max(0, Math.floor(t / FRAME)))],
    choir: (t) => choir[Math.min(frames - 1, Math.max(0, Math.floor(t / FRAME)))],
  };
}

// --- one theme playing --------------------------------------------------------
/**
 * The theme's song clock, as advance() in audio.js keeps it: the time at which the music
 * reaches `pos` sixteenths from its top, moving at the live tempo frame by frame. Every
 * voice times its notes from it, so notes that fall together start together.
 */
export function songClock(start, base, tempo) {
  const ts = [start];
  const ps = [0];
  return (pos) => {
    while (ps[ps.length - 1] < pos) {
      const t = ts[ts.length - 1];
      ts.push(t + FRAME);
      ps.push(ps[ps.length - 1] + (FRAME * tempo(t)) / base);
    }
    let lo = 0, hi = ps.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ps[m] <= pos) lo = m; else hi = m; }
    if (hi === lo || ps[hi] === ps[lo]) return ts[lo];
    return ts[lo] + ((pos - ps[lo]) / (ps[hi] - ps[lo])) * (ts[hi] - ts[lo]);
  };
}

/**
 * Schedule a track's voices from `start` until `end` (a cut) or `loops` loops, as
 * pump() does: each note starts where the song clock puts its place in the music, lasts
 * its sixteenths at the tempo of that moment, and each voice wraps at its own length.
 * Returns every note and, per voice, the times its notes started with their position in
 * the loop.
 */
export function schedule(name, start, { end = Infinity, loops = 1, tempo, transpose = 0, fromLoop = false }) {
  const t = TRACKS[name];
  const base = 60 / t.bpm / 4;
  const timeOf = songClock(start, base, tempo);
  const notes = [];
  const grid = [];
  for (const v of voicesOf(t)) {
    const len = v.part.reduce((s, n) => s + n[1], 0);
    // A track with an `intro` (the lament's fall and stab) plays it once and comes round to
    // the note after it, as pump() does (loopStart). This played the whole part every time
    // round, so a bed of the lament put its fall back every loop.
    let first = 0;
    for (let acc = 0; t.intro && first < v.part.length && acc < t.intro * 16; first++) acc += v.part[first][1];
    let pos = 0;
    const g = [];
    for (let loop = 0; loop < loops; loop++) {
      for (const [n, dur] of loop || fromLoop ? v.part.slice(first) : v.part) {
        const at = timeOf(pos);
        if (at >= end - 1e-6) break;
        g.push([at, pos % len, loop]);
        const d = (dur * base) / tempo(at);
        // A chord is one oscillator per name on the same envelope, and each name one per
        // stop of the voice (the lament's organ ranks), as pump() plays it.
        for (const p of pitchesOf(n)) {
          for (const s of stopsOf(v)) {
            const gain = v.gain * stopGain(s);
            notes.push({ voice: v.name, type: v.type, gain, env: envelope(v.env, at, d, gain),
              hz: freq(p) * Math.pow(2, transpose / 12) * stopRatio(s) });
          }
        }
        pos += dur;
      }
    }
    grid.push({ voice: v.name, starts: g, done: timeOf(pos) });
  }
  return { notes, grid };
}

/** Render scheduled notes into a buffer per voice: lead, bass, choir, brass. */
export function renderVoices(seconds, notes) {
  const n = Math.ceil(seconds * SR);
  const out = Object.fromEntries(VOICE_NAMES.map((k) => [k, new Float32Array(n)]));
  for (const x of notes) note(out[x.voice], x.type, x.hz, x.env);
  return out;
}

/** A set's bus gain over time, applied in place: for the handover's fades. */
export function applyBus(buf, gainAt) {
  for (let n = 0; n < buf.length; n++) buf[n] *= gainAt(n / SR);
}

/**
 * The music bus: choir through its filter and swell, everything through the tone filter
 * and levels. `sfx`, if given, is the effects already at the master (tools/sfx-render.mjs
 * puts them through their own bus), added on the way out.
 */
export function mixdown(seconds, sets, choirAt, sfx = null) {
  const n = Math.ceil(seconds * SR);
  const riff = new Float32Array(n);
  const choir = new Float32Array(n);
  // Everything but the choir is on the theme's riff bus (startSet), the brass included.
  for (const s of sets) {
    for (let i = 0; i < n; i++) { riff[i] += s.lead[i] + s.bass[i] + s.brass[i]; choir[i] += s.choir[i]; }
  }
  lowpass(choir, MUSIC_BUS.choirTone.hz, MUSIC_BUS.choirTone.q);
  for (let i = 0; i < n; i++) riff[i] += choir[i] * choirAt(i / SR);
  lowpass(riff, MUSIC_BUS.tone.hz, MUSIC_BUS.tone.q);
  const lvl = MUSIC_BUS.music * MUSIC_BUS.master;
  for (let i = 0; i < n; i++) riff[i] *= lvl;
  if (sfx) for (let i = 0; i < Math.min(n, sfx.length); i++) riff[i] += sfx[i];
  return riff;
}

// --- the theme previews -------------------------------------------------------------
// A steady climb: tempoTargetFor(0.2) is x0.96, a little under the written tempo (it was
// about x1.0 while TEMPO_MAX was x1.70).
export const PASS1 = 0.2;
export const PASS2 = 0.6;           // the run going hard: tempoTargetFor(0.6) is x1.09

/**
 * A climb theme: one full loop at PASS1, a second with the run going hard at PASS2, and
 * the tail. With `loops: 1` only the first pass is rendered, which is what the effects
 * are measured against.
 */
export function themePreview(name, { loops = 2 } = {}) {
  const t = TRACKS[name];
  const start = 0.08;        // playTrack's first note
  // Where the first loop ends is found by scheduling the lead at the first pass's
  // intensity; the second pass's intensity starts there.
  const steady = controls(400, () => PASS1, name);
  const probe = schedule(name, start, { loops: 1, tempo: steady.tempo });
  const turn = probe.grid[0].done;
  const ctl = controls(400, (s) => (s < turn ? PASS1 : PASS2), name);
  const { notes, grid } = schedule(name, start, { loops, tempo: ctl.tempo });
  const end = Math.max(...grid.map((g) => g.done));
  const seconds = end + 2.5;
  const v = renderVoices(seconds, notes);
  const levels = {
    lead: rms(v.lead, 0, Math.floor(turn * SR)),
    bass: rms(v.bass, 0, Math.floor(turn * SR)),
    choir: rms(v.choir, 0, Math.floor(turn * SR)),
  };
  const out = mixdown(seconds, [v], ctl.choir);
  return { name, out, seconds, turn, end, levels, bpm: t.bpm, secondTempo: ctl.tempo(end - 1) };
}

// --- the menu preview ---------------------------------------------------------------
/**
 * The menu's sections, in bars from its top, read from the track: the fanfare is everything
 * before the song's first note, the song runs to the bar its last note ends in, and the way
 * back is the rest of the loop. They were a table kept beside compose-music.mjs by hand, and
 * a fanfare cut from eight bars to four would have been measured against bars that were no
 * longer it.
 */
export function menuSections(t = TRACKS.menu) {
  let at = 0, first = null, last = 0;
  for (const [n, d] of t.lead) {
    if (n && first === null) first = at;
    at += d;
    if (n) last = at;
  }
  const song = first / 16, back = Math.ceil(last / 16), end = at / 16;
  return [['fanfare', 0, song], ['song', song, back], ['way back', back, end]];
}

/**
 * The menu as the title screen plays it. main.js drives the intensity to 0 off the climb,
 * so from the first note the tempo eases from the written bpm to TEMPO_MIN's x0.92 and
 * the choir bus sits at CHOIR_MIN -- which is why the menu's choir carries more gain
 * than a climb theme's. Rendering it at the climb's 0.2 and 0.6, as themePreview does and
 * as the old menu was measured, measured a menu nobody hears: 8 to 38% faster, and its
 * choir two to three times as loud. One whole loop and the first `extra` bars of the next,
 * so the loop point is heard.
 */
export function menuPreview(extra = 4) {
  const t = TRACKS.menu;
  const start = 0.08;
  const ctl = controls(400, () => 0, 'menu');
  const len = t.lead.reduce((s, n) => s + n[1], 0);
  const timeOf = songClock(start, 60 / t.bpm / 4, ctl.tempo);
  const turn = timeOf(len);
  const end = timeOf(len + extra * 16);
  const { notes } = schedule('menu', start, { loops: 2, end, tempo: ctl.tempo });
  const seconds = end + 2.5;
  const v = renderVoices(seconds, notes);
  const levels = Object.fromEntries(Object.entries(v).map(([k, b]) => [k, rms(b, 0, Math.floor(turn * SR))]));
  const out = mixdown(seconds, [v], ctl.choir);
  const sections = menuSections(t).map(([label, from, to]) => [label,
    Math.floor(timeOf(from * 16) * SR), Math.floor(timeOf(to * 16) * SR)]);
  return {
    name: 'menu', out, seconds, turn, end, levels, sections, bpm: t.bpm,
    heard: t.bpm * ctl.tempo(turn), loopSecs: turn - start,
  };
}

/**
 * Any track -- the lament, or a climb theme -- playing `seconds` at a steady intensity
 * `i` in the key `transpose`: the bed the sound-effect previews are heard over. A track
 * with an `intro` is heard from its loop: the scoreboard's sounds come over the lament's
 * loop, seconds after its fall and its stab.
 */
export function bedPreview(name, seconds, { i = PASS1, transpose = 0, start = 0.08 } = {}) {
  const ctl = controls(seconds + 5, () => i, name);
  const { notes } = schedule(name, start, { loops: 8, end: seconds, tempo: ctl.tempo, transpose, fromLoop: true });
  const v = renderVoices(seconds, notes);
  return mixdown(seconds, [v], ctl.choir);
}

// --- the handover previews ----------------------------------------------------------
/**
 * The outgoing theme from its top in the key it has at the end of its stage, the zone
 * arriving at `arrive` seconds, the handover as crossTo does it, and the new theme in its
 * home key. `chime(buf, at)` adds the zone's chime at the master into `buf`, as the game
 * plays it: on the outgoing theme's first bar line past the notes already queued when
 * the zone arrives (the engine's lookahead, 0.1 s), in its key (tools/sfx-render.mjs).
 */
export function handoverPreview(from, to, key, chime, arrive = 18) {
  const I = 0.35;
  const ctl = controls(400, () => I, from);
  const start = 0.08;
  // The cut: the outgoing lead's first bar line at least HANDOVER_FADE after arrival.
  const probe = schedule(from, start, { loops: 3, tempo: ctl.tempo });
  const bar = probe.grid[0].starts.find(([at, pos]) => pos % 16 === 0 && at >= arrive + HANDOVER_FADE);
  const T = bar[0];
  const old = schedule(from, start, { loops: 3, end: T, tempo: ctl.tempo, transpose: key });
  const neu = schedule(to, T, { loops: 1, end: T + 22, tempo: ctl.tempo });
  const seconds = T + 22 + 2;
  const a = renderVoices(seconds, old.notes);
  const b = renderVoices(seconds, neu.notes);
  // Down to HANDOVER_FROM at the cut, where the new theme comes in at the same level,
  // then gone over HANDOVER_TAIL -- as crossTo automates the old theme's buses.
  const outGain = (s) => (s < arrive ? 1
    : s < T ? 1 + (HANDOVER_FROM - 1) * ((s - arrive) / (T - arrive))
      : s < T + HANDOVER_TAIL ? HANDOVER_FROM + (0.0001 - HANDOVER_FROM) * ((s - T) / HANDOVER_TAIL)
        : 0.0001);
  const inGain = (s) => (s < T ? 0 : s >= T + HANDOVER_SWELL ? 1
    : HANDOVER_FROM + (1 - HANDOVER_FROM) * ((s - T) / HANDOVER_SWELL));
  for (const k of VOICE_NAMES) { applyBus(a[k], outGain); applyBus(b[k], inGain); }
  const sfx = new Float32Array(Math.ceil(seconds * SR));
  const ring = probe.grid[0].starts.find(([at, pos]) => pos % 16 === 0 && at >= arrive + 0.1);
  if (chime) chime(sfx, ring ? ring[0] : arrive);
  const out = mixdown(seconds, [a, b], ctl.choir, sfx);
  return { name: `${from}-to-${to}`, out, seconds, arrive, T };
}
