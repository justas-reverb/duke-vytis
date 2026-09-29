// The sound effects, as DATA.
//
// Every effect here is a function from what happened (how hard he jumped, how far he fell,
// how long the chain was) and the key the music is in, to a list of VOICES: an oscillator
// or a noise source, its pitch and gain as WebAudio automation, an optional filter. The
// engine (Audio.sfx in audio.js) turns a list into nodes on the audio clock, and the
// offline renderer (tools/sfx-render.mjs) evaluates exactly the same list into samples --
// the way envelope() serves the music -- so the previews written to WAV and the game
// cannot disagree about what a sound is, and the tests can measure what the player hears.
//
// It replaces thirteen functions that each built their nodes by hand and sequenced their
// notes with setTimeout. Those timers ran on the main thread, not the audio clock: an
// arpeggio smeared whenever a frame ran long, kept firing through a pause, and could not
// be rendered offline at all, so nobody had ever measured an effect against the music.
// Measured now (tools/render-sfx.mjs), the zone chime was an A major arpeggio over music
// in E minor, 4.4 LU louder than the music; the wail was 6.2 over it and a landing 17
// under; and a landing, a hop of the chain, the chain breaking, CLIMB!, the catch, the
// scoreboard and a companion speaking made no sound at all.
//
// THE WORLD THEY LIVE IN is the music's (tracks.js, compose-music.mjs): square, triangle
// and sawtooth oscillators with a hard attack and an exponential tail, a noise source in
// place of the NES noise channel (sample-and-hold, so a low rate crunches the way that
// channel does), and the same 5.2 kHz roll-off on the bus. Anything with a pitch that
// means something -- the chime, the fanfares, the chain's ladder, the payout, the voices
// -- is written in SCALE STEPS of whatever key the music is sounding in (Audio.keyNow):
// the rung of the key ladder the zones have lifted it to, a change waiting for its bar
// line from that bar line on, and the lament's held key -- so a chime never clashes with
// the theme under it. (A companion used to lift the key too, while they climbed with you;
// since 4fbe0f9 they do not.) Only the percussive sounds (a landing, a thud, the splat)
// are left unpitched.
//
// THE CALL -- tonic, fifth, the step below, fifth, octave -- is the motif the three climb
// themes share. The milestone fanfares are the call, rising a chord tone each milestone,
// and a companion arriving plays its head; the effects that matter most speak the
// music's own phrase.

/** Semitones of each mode's seven steps from the tonic. */
export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

/**
 * The home key of each track, as compose-music.mjs writes it: the tonic as a MIDI note in
 * octave 4 and the mode. tools/test-sfx.mjs checks every entry against the notes in
 * tracks.js, so a recomposed theme in a new key fails a test instead of putting every
 * chime out of tune with it.
 */
export const TRACK_KEYS = {
  menu: { tonic: 64, mode: 'ionian' },       // E major
  below: { tonic: 64, mode: 'aeolian' },     // E minor
  above: { tonic: 62, mode: 'aeolian' },     // D minor
  heavens: { tonic: 64, mode: 'lydian' },    // E Lydian
  gameover: { tonic: 64, mode: 'aeolian' },  // the lament: E minor
};

/** A key: the tonic's MIDI note (octave 4, already transposed) and the mode's steps. */
export function keyOf(track, transpose = 0) {
  const k = TRACK_KEYS[track] || TRACK_KEYS.below;
  return { tonic: k.tonic + transpose, steps: MODES[k.mode], track: track || 'below', transpose };
}

/** The frequency of scale step `d` (0 the tonic, 7 its octave, negative below) in `key`. */
export function stepHz(key, d, oct = 0) {
  const s = key.steps;
  const midi = key.tonic + s[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** The steps of THE CALL, in scale steps and sixteenths (compose-music.mjs). */
export const CALL = [[0, 3], [4, 1], [3, 2], [4, 2], [7, 8]];

// --- building voices ------------------------------------------------------------
// A voice: { type, at, stop, f, g, filter, lfo, rate }. Times are seconds from the moment
// the effect is triggered. `f` and `g` are automation, [kind, value, time] with kind 'set',
// 'exp' or 'lin', exactly as envelope() writes a note's; `filter` is { type, q, f } with
// `f` a number or automation; `lfo` is { hz, depth } (depth in Hz, a number or
// automation) wobbling the pitch; `rate` is a noise voice's sample-and-hold rate in Hz.

/** A struck envelope: a 4 ms attack and an exponential tail to silence at `at + decay`. */
const hit = (at, gain, decay, atk = 0.004) => [
  ['set', 0.0001, at], ['exp', gain, at + atk], ['exp', 0.0001, at + decay],
];
/** Held at `gain` for `dur`, then released over `rel` -- a gated note. */
const held = (at, gain, dur, rel = 0.04, atk = 0.005) => [
  ['set', 0.0001, at], ['exp', gain, at + atk], ['set', gain, at + Math.max(atk, dur - rel)],
  ['exp', 0.0001, at + dur],
];
const fixed = (hz, at) => [['set', hz, at]];
const glide = (f0, f1, at, dur) => [['set', f0, at], ['exp', f1, at + dur]];

/** The last time any automation in a voice asks for, plus a little: when it stops. */
function stopOf(v) {
  let t = 0;
  for (const e of v.g) t = Math.max(t, e[2]);
  return t + 0.02;
}
function voice(type, g, f, extra = {}) {
  const v = { type, at: g[0][2], g, f, ...extra };
  v.stop = stopOf(v);
  return v;
}
const osc = (type, f, g, extra) => voice(type, g, f, extra);
const noise = (g, rate, filter, extra) => voice('noise', g, null, { rate, filter, ...extra });

/** The same voices `db` louder (or quieter): every gain but the silence the envelopes start from. */
function louder(voices, db) {
  const k = Math.pow(10, db / 20);
  return voices.map((v) => ({ ...v, g: v.g.map(([kd, val, t]) => [kd, val > 0.0001 ? val * k : val, t]) }));
}

/** How much louder each milestone's fanfare is than the one before. [dB; 1.0] */
export const MILESTONE_SWELL = 1.0;
/** How much longer each milestone's last note rings than the one before. [seconds; 0.08] */
export const MILESTONE_RING = 0.08;
/** How much louder the payout of the longest chain is than that of the shortest. [dB; 4] */
export const PAYOUT_SWELL = 4;

/** Notes of a phrase: [[hz, seconds, gain], ...] as struck voices, one after another. */
function phrase(type, notes, { at = 0, decay = 1.6, gain = 1 } = {}) {
  const out = [];
  let t = at;
  for (const [hz, len, g = 1] of notes) {
    if (hz) out.push(osc(type, fixed(hz, t), hit(t, gain * g, Math.max(0.03, len * decay))));
    t += len;
  }
  return out;
}

// --- the effects ------------------------------------------------------------------
//
// Each entry: `make(p, key)` builds the voices; `level` is the effect's place in the mix,
// set by measurement against the climb themes (tools/render-sfx.mjs prints it, and
// tools/test-sfx.mjs holds each effect inside `band`, in LU against the music's
// loudness); `limit` is how many of it may sound at once (a new one steals the oldest)
// and `gap` the shortest time between two (anything closer is dropped); `vary` is the
// small random difference between one playing and the next -- `cents` of pitch, `db` of
// level, `ms` of delay -- so that the sounds a player hears hundreds of times a run never
// come out identical. Pitched sounds carry no cents: out of tune is not variety.
// `duck` pulls the music down under the effect (dB, and the seconds it holds for).

/** How far a landing fell, 0..1, from the drop in world units from the top of the arc. */
export function landWeight(drop) {
  return Math.max(0, Math.min(1, (drop - 15) / 285));
}

/** How long a combo was, as the payout's size: 0 for the shortest chain, 1 from 300 floors. */
export function payoutSize(floors) {
  return Math.max(0, Math.min(1, Math.log2(Math.max(1, floors / 2)) / Math.log2(150)));
}

export const SFX = {
  // THE JUMP: a square sweeping up an octave and a fifth from a chord tone, the tone and
  // the length set by how fast he was running -- a walk jumps from the tonic, a sprint
  // from the fifth, so the jump rises with his speed the way the old one did, in key.
  jump: {
    level: 0.178, limit: 2, gap: 0.03, vary: { cents: 12, db: 1, ms: 3 }, band: [-10, -4],
    make({ power = 0 }, k) {
      const d = [0, 2, 4][Math.min(2, Math.floor(power * 3))];
      const len = 0.10 + 0.04 * power;
      const f0 = stepHz(k, d, -1), f1 = stepHz(k, d + 11, -1);
      const out = [osc('square', glide(f0, f1, 0, len * 0.8), hit(0, 1, len))];
      if (power > 0.5) out.push(osc('triangle', glide(f0 * 2, f1 * 2, 0, len * 0.8), hit(0, (power - 0.5) * 0.9, len * 0.8)));
      return out;
    },
  },
  // The first air jump: a flip, third to the octave's third, with a triangle an octave up.
  double: {
    level: 0.170, limit: 2, gap: 0.03, vary: { cents: 8, db: 1, ms: 2 }, band: [-9, -3],
    make(p, k) {
      const f0 = stepHz(k, 2), f1 = stepHz(k, 9);
      return [
        osc('square', glide(f0, f1, 0, 0.09), hit(0, 1, 0.14)),
        osc('triangle', glide(f0 * 2, f1 * 2, 0, 0.09), hit(0, 0.5, 0.11)),
      ];
    },
  },
  // The third: three steps of the triad struck in one voice, the last swept up to the
  // next fifth, with a spin of noise under it. A reward, but a routine one once earned:
  // past 250 combo floors the bot throws one on most jumps, 38 a minute, so it sits just
  // over the first air jump rather than a whole LU over it (-5.0, first set).
  triple: {
    level: 0.142, limit: 2, gap: 0.03, vary: { cents: 6, db: 1, ms: 2 }, band: [-8, -4],
    make(p, k) {
      const a = stepHz(k, 4), b = stepHz(k, 7), c = stepHz(k, 9), d = stepHz(k, 11);
      const f = [['set', a, 0], ['set', b, 0.035], ['set', c, 0.07], ['exp', d, 0.16]];
      return [
        osc('square', f, hit(0, 1, 0.2)),
        osc('triangle', f.map(([kd, hz, t]) => [kd, hz * 2, t]), hit(0, 0.45, 0.16)),
        noise(hit(0.02, 0.35, 0.12), 12000, { type: 'highpass', q: 0, f: 3000 }),
      ];
    },
  },
  // THE LANDING: soft, and heavier the further he fell -- a thump of low noise and a
  // triangle's knock, lower, longer and louder with `weight` (landWeight).
  land: {
    level: 0.164, limit: 2, gap: 0.045, vary: { cents: 70, db: 1.5, ms: 3 }, band: [-20, -6],
    make({ weight = 0 }) {
      const w = weight;
      return [
        noise(hit(0, 0.7 + 0.3 * w, 0.05 + 0.08 * w, 0.002), 3500, { type: 'lowpass', q: 0, f: 1300 - 650 * w }),
        osc('triangle', glide(150 - 45 * w, 55, 0, 0.05 + 0.05 * w), hit(0, 0.5 + 0.5 * w, 0.06 + 0.07 * w, 0.002)),
      ];
    },
  },
  // THE WALL BOUNCE: the old clang -- a square falling from high to low with a click of
  // noise -- and on top a ring that grows with the combo's drive (`boost`, 0..1), as the
  // spark spray and the floater do: a bounce off a long chain sings, a step higher and
  // longer the harder the chain drives it, and from 0.85 (the white BOUNCE!) an octave
  // sparkle rides it.
  //
  // Grown the way the visuals grow, which is with restraint (see the wallbounce case in
  // Game.handleEvents): past about 220 combo floors EVERY bounce is a full-drive bounce,
  // fifty a minute -- 83 of 101 in two minutes of the attract bot's run. The ring first
  // grew the bounce by six LU to -2.6 against the music, louder than the zone's chime
  // (-3) and than three of the seven fanfares, so the commonest sound of a long chain
  // outranked its rarest moments and the bounces alone were a third of all the effects'
  // energy. Now it grows by three, to about -5.7, under every moment that is rarer.
  wall: {
    level: 0.130, limit: 3, gap: 0.03, vary: { cents: 25, db: 1.5, ms: 3 }, band: [-11, -5],
    make({ speed = 200, boost = 0 }, k) {
      const s = Math.min(1, speed / 330);
      const b = Math.max(0, Math.min(1, boost));
      const out = [
        osc('square', glide(700 + 500 * s, 180, 0, 0.1), hit(0, 1, 0.12)),
        noise(hit(0, 0.6, 0.05, 0.002), 9000, { type: 'bandpass', q: 1.2, f: 2600 }),
      ];
      if (b > 0.05) {
        const f = stepHz(k, 7 + [0, 2, 4][Math.min(2, Math.floor(b * 3))]);
        out.push(osc('square', fixed(f, 0.02), hit(0.02, 0.2 + 0.2 * b, 0.12 + 0.22 * b)));
        out.push(osc('triangle', fixed(f / 2, 0.02), hit(0.02, 0.25 + 0.3 * b, 0.14 + 0.25 * b)));
      }
      if (b >= 0.85) out.push(osc('triangle', fixed(stepHz(k, 14), 0.05), hit(0.05, 0.25, 0.3)));
      return out;
    },
  },
  // A grounded kick-off from a wall: a scuff, barely there.
  wallkick: {
    level: 0.110, limit: 1, gap: 0.1, vary: { cents: 120, db: 2, ms: 2 }, band: [-22, -12],
    make() {
      return [noise(hit(0, 1, 0.035, 0.002), 8000, { type: 'highpass', q: 0, f: 1800 })];
    },
  },
  // THE CHAIN'S HOPS: every landing that carries the combo on ticks one note up a ladder,
  // the scale from the tonic to the octave across the MULT_STEP (fifty) floors to the
  // chain's next multiplier step, so the chain audibly climbs toward the step the meter is
  // filling to. The chain's first hop (it opening: combo step one) picks up from the fifth
  // below. A hop on a landing that fired a callout is the fanfare's, not the ladder's
  // (gamesounds.js).
  //
  // The hop that crosses a step is marked (`step`): picked up from the fifth into the top
  // of the ladder, the step claimed in the ladder's own voice. While the callouts were the
  // combo's own steps, SWIFT at 50 floors to GLORY at 350, the fanfare was that mark and
  // only the steps past GLORY needed one: there the hop that crossed a step was the ladder
  // falling back to the tonic with nothing where the fanfare had been -- a climb that led
  // nowhere, six times over in the bot's 673-floor chain. The callouts are the tower's
  // heights now (game/milestones.js), so every step gets the mark.
  hop: {
    level: 0.102, limit: 3, gap: 0.03, vary: { db: 1, ms: 4 }, band: [-16, -8],
    make({ progress = 0, first = false, step = false }, k) {
      const d = step ? 7 : Math.min(7, Math.floor(Math.max(0, progress) * 8));
      const out = [];
      const at = first || step ? 0.045 : 0;
      if (first) out.push(osc('square', fixed(stepHz(k, -3, 1), 0), hit(0, 0.7, 0.06)));
      if (step) out.push(osc('square', fixed(stepHz(k, 4, 1), 0), hit(0, 0.6, 0.06)));
      const g = step ? 0.8 : 1;
      out.push(osc('square', fixed(stepHz(k, d, 1), at), hit(at, g, step ? 0.14 : 0.08)));
      out.push(osc('triangle', fixed(stepHz(k, d, 0), at), hit(at, 0.6 * g, step ? 0.18 : 0.09)));
      return out;
    },
  },
  // THE CHAIN ENDING: a clipped drop from the fifth to the tonic and a click -- the chain
  // letting go -- in front of the payout.
  comboEnd: {
    level: 0.107, limit: 1, gap: 0.1, vary: { db: 1 }, band: [-16, -8],
    make(p, k) {
      return [
        osc('square', [['set', stepHz(k, 4, 1), 0], ['set', stepHz(k, 0, 1), 0.035]], hit(0, 1, 0.08)),
        noise(hit(0, 0.5, 0.03, 0.002), 6000, { type: 'bandpass', q: 1, f: 1800 }),
      ];
    },
  },
  // THE PAYOUT: the points counted in, a coin run up the triad, longer and higher for a
  // longer chain (`size`, payoutSize) -- three notes for the shortest, eight, to G6, for
  // one of three hundred floors -- its last note held over a triangle an octave down; a
  // big one lands on a brass chord.
  //
  // And louder for a longer chain, PAYOUT_SWELL dB from the shortest to the longest, as
  // the floater that shows the points grows. A single hop of two floors is banked as a
  // chain and paid out (+120), and for most players that is the commonest chain there is;
  // at one level for every size its three coins came in louder than the jump (-7 LU
  // against -8), after every short hop and a pause.
  payout: {
    level: 0.069, limit: 1, gap: 0.1, vary: { db: 0.5 }, band: [-13, -2],
    make({ size = 0 }, k) {
      const n = 3 + Math.round(5 * size);
      const run = [0, 2, 4, 7, 9, 11, 14, 16].slice(0, n);
      const at = 0.07;
      const step = 0.045 - 0.008 * size;
      const out = [];
      run.forEach((d, i) => {
        const t = at + i * step;
        const last = i === run.length - 1;
        out.push(osc('square', fixed(stepHz(k, d), t), hit(t, last ? 1 : 0.8, last ? 0.32 + 0.2 * size : 0.07)));
      });
      const tl = at + (run.length - 1) * step;
      out.push(osc('triangle', fixed(stepHz(k, run[run.length - 1], -1), tl), hit(tl, 0.9, 0.4 + 0.3 * size)));
      if (size >= 0.6) {
        for (const d of [0, 2, 4]) out.push(osc('sawtooth', fixed(stepHz(k, d, -1), tl), held(tl, 0.35, 0.3 + 0.2 * size, 0.12)));
      }
      return louder(out, -PAYOUT_SWELL * (1 - Math.max(0, Math.min(1, size))));
    },
  },
  // THE MILESTONE CALLOUT: THE CALL as a fanfare, one for each of the seven, in the key of
  // the moment. Each starts a chord tone higher than the last -- tonic, third, fifth,
  // octave -- and from there they grow instead of climbing, which keeps GLORY's top note
  // at the octave above E5 where a square is still a trumpet and not a whistle. What
  // grows: a snare from CHARGE, a harmony a third under the call from SOARING, a brass
  // chord under the last note from RAMPAGE, a drum roll into it from CRUSADE, thunder
  // under THUNDER, and for GLORY a second run up the triad to the top and the whole
  // chord held under it.
  // `i` is the milestone's index in MILESTONES (0 SWIFT .. 6 GLORY). A recorded callout
  // dropped into assets/sfx/ replaces it (`samples`).
  milestone: {
    level: 0.028, limit: 1, gap: 0.2, vary: {}, band: [-7, 3], duck: { db: -5, hold: 0.9 },
    samples: ({ x }) => ['milestone' + x, 'milestone'],
    make({ i = 0 }, k) {
      const root = [0, 2, 4, 7, 7, 7, 7][Math.max(0, Math.min(6, i))];
      const s16 = 0.052 - 0.003 * i;
      const out = [];
      const pre = i >= 4 ? 4 * s16 : 0;
      if (i >= 4) {
        // A roll into it: four snare strokes, rising.
        for (let r = 0; r < 4; r++) {
          out.push(noise(hit(r * s16, 0.35 + 0.15 * r, 0.05, 0.002), 9000, { type: 'bandpass', q: 0.8, f: 2200 + 300 * r }));
        }
      }
      let t = pre;
      CALL.forEach(([d, n], j) => {
        const len = n * s16;
        const last = j === CALL.length - 1;
        // The call speeds up a little each milestone (s16), so its last note has to ring on
        // by more than that saves or the fanfares get SHORTER as they get bigger: with 30 ms
        // a step they measured 0.95, 0.93, 0.91 and 0.89 s from SWIFT to RAMPAGE.
        const dur = last ? len + 0.15 + MILESTONE_RING * i : len * 0.9;
        const hz = stepHz(k, root + d);
        out.push(osc('square', fixed(hz, t), held(t, 1, dur, last ? 0.12 : 0.02)));
        if (i >= 2) out.push(osc('square', fixed(stepHz(k, root + d - 2), t), held(t, 0.45, dur, last ? 0.12 : 0.02)));
        if (j === 0 || last) {
          out.push(osc('triangle', fixed(stepHz(k, root, -1), t), held(t, 1, last ? dur : len * 2, 0.06)));
          if (i >= 1) out.push(noise(hit(t, 0.5, 0.07, 0.002), 9000, { type: 'bandpass', q: 0.8, f: 2400 }));
        }
        if (last && i >= 3) {
          for (const c of [0, 2, 4]) out.push(osc('sawtooth', fixed(stepHz(k, root + c, -1), t), held(t, 0.3, dur, 0.12)));
        }
        if (last && i >= 5) out.push(noise(hit(t, 0.5, 0.5, 0.004), 12000, { type: 'highpass', q: 0, f: 4000 }));
        t += len;
      });
      if (i === 5) {
        // THUNDER: a low rumble under the whole call.
        out.push(noise([['set', 0.0001, pre], ['exp', 1, pre + 0.08], ['exp', 0.0001, t + 0.6]], 400,
          { type: 'lowpass', q: 0, f: 220 }));
      }
      if (i === 6) {
        // GLORY: up the triad again, from the third to the call's top, and hold the chord.
        const top = [9, 11, 14].map((d) => stepHz(k, root + d));
        top.forEach((hz, j) => {
          const tt = t - 0.15 + j * s16 * 1.5;
          const last = j === top.length - 1;
          out.push(osc('square', fixed(hz / 2, tt), held(tt, 0.9, last ? 0.55 : s16 * 1.5, last ? 0.25 : 0.02)));
        });
        const tt = t - 0.15 + 3 * s16 * 1.5;
        for (const c of [0, 2, 4, 7]) out.push(osc('sawtooth', fixed(stepHz(k, root + c, -1), tt), held(tt, 0.3, 0.8, 0.3)));
        out.push(osc('triangle', fixed(stepHz(k, root, -1), tt), held(tt, 1, 0.8, 0.3)));
      }
      // And louder, a step at a time, as the lettering grows: the orchestration alone
      // moved the loudness by two LU from SWIFT to GLORY, because what it adds -- a roll
      // before, thunder under, a chord at the end -- mostly lies outside the loudest
      // moment. MILESTONE_SWELL dB a milestone, centred on RAMPAGE.
      return louder(out, (i - 3) * MILESTONE_SWELL);
    },
  },
  // A ZONE ARRIVES: a bell, up the triad to the octave -- triangle with a square an octave
  // above it for the bell's overtone -- in the key the music is playing, the last note left
  // to ring. It was five square blips spelling A major over E minor, 4.4 LU over the music.
  zone: {
    level: 0.083, limit: 1, gap: 0.5, vary: {}, band: [-6, 0],
    make(p, k) {
      const out = [];
      [0, 2, 4, 7].forEach((d, i) => {
        const t = i * 0.075;
        const last = i === 3;
        const hz = stepHz(k, d, 1);
        out.push(osc('triangle', fixed(hz, t), hit(t, 1, last ? 1.1 : 0.45)));
        out.push(osc('square', fixed(hz * 2, t), hit(t, 0.12, last ? 0.5 : 0.2)));
      });
      return out;
    },
  },
  // CLIMB!: the floor is close. An alarm -- the fifth and the step above it, the minor
  // sixth's rub, four times, each note sagging a little -- over a triangle an octave down.
  climb: {
    level: 0.033, limit: 1, gap: 1.0, vary: {}, band: [-8, -2],
    make(p, k) {
      const out = [];
      for (let i = 0; i < 4; i++) {
        const t = i * 0.085;
        const hz = stepHz(k, i % 2 ? 5 : 4, 1);
        out.push(osc('square', glide(hz, hz * 0.97, t, 0.07), held(t, 1, 0.075, 0.02)));
        out.push(osc('triangle', fixed(hz / 2, t), held(t, 0.7, 0.075, 0.02)));
      }
      return out;
    },
  },
  // THE CATCH: the fire has him. A roar of noise opening upward through a band-pass and a
  // square thudding down, under the start of the wail.
  catch: {
    level: 0.228, limit: 1, gap: 0.5, vary: {}, band: [-6, 0],
    make() {
      return [
        noise([['set', 0.0001, 0], ['exp', 1, 0.02], ['exp', 0.0001, 0.45]], 9000,
          { type: 'bandpass', q: 1.2, f: glide(300, 2400, 0, 0.3) }),
        osc('square', glide(130, 45, 0, 0.25), hit(0, 0.8, 0.3)),
      ];
    },
  },
  // THE DEATH FALL: the wail, a sawtooth dropping three octaves from E5 to E2 over the
  // fall with a wobble that makes it a voice rather than a siren, held until the landing
  // or a skip (Audio.stopScream). Its wobble narrows as it falls: a fixed 26 Hz, as the old
  // one had, is a semitone at the top and most of a fifth at the bottom.
  // From the lament's key, where the fall is going. That is the tonic the climb was
  // sounding when it was cut (Audio.lament), which is the key the engine hands it: the
  // climb's until the cut, the lament's held key after. It was fixed at E while the
  // lament always played in E; once the lament took the climb's tonic, a fixed E wail
  // fell across a lament in G minor or D minor.
  scream: {
    level: 0.050, limit: 1, gap: 0, vary: {}, band: [-7, -1],
    make(p, key) {
      const top = stepHz(key, 7);
      return [osc('sawtooth', glide(top, top / 8, 0, 3.2),
        [['set', 0.0001, 0], ['exp', 1, 0.05], ['set', 1, 2.6], ['exp', 0.0001, 3.4]],
        { lfo: { hz: 11, depth: glide(30, 4, 0, 3.2) }, filter: { type: 'lowpass', q: 0, f: 3000 } })];
    },
  },
  // The falling body glancing off a wall: a thud.
  fallWall: {
    level: 0.198, limit: 2, gap: 0.06, vary: { cents: 60, db: 2, ms: 2 }, band: [-14, -6],
    make() {
      return [
        osc('triangle', glide(160, 55, 0, 0.08), hit(0, 1, 0.1, 0.002)),
        noise(hit(0, 0.7, 0.06, 0.002), 3000, { type: 'lowpass', q: 0, f: 900 }),
      ];
    },
  },
  // THE IMPACT. The splat: a crunch of noise closing down through a low-pass, a square and
  // a triangle falling away underneath, and a wet band of noise -- bigger, lower and longer
  // the further he fell (`severity`, 0..1). The dazed landing: a thud, then three woozy
  // notes circling his head, in the lament's key.
  impact: {
    level: 0.108, limit: 1, gap: 0.3, vary: {}, band: [-8, 2],
    make({ splat = true, severity = 0.5 }, k) {
      if (splat) {
        const s = Math.max(0, Math.min(1, severity));
        const len = 0.4 + 0.25 * s;
        return [
          noise([['set', 0.0001, 0], ['exp', 1, 0.004], ['exp', 0.0001, len]], 5000,
            { type: 'lowpass', q: 0, f: glide(3500, 220, 0, len) }),
          osc('square', glide(200, 40, 0, 0.4), hit(0, 0.6, 0.42)),
          osc('triangle', glide(90, 32, 0, len), hit(0, 0.9 + 0.3 * s, len + 0.1)),
          noise(hit(0.03, 0.5, 0.14), 7000, { type: 'bandpass', q: 2, f: 700 }),
        ];
      }
      const out = [
        osc('triangle', glide(140, 50, 0, 0.12), hit(0, 1, 0.16, 0.002)),
        noise(hit(0, 0.6, 0.2, 0.002), 4000, { type: 'lowpass', q: 0, f: 700 }),
      ];
      [9, 7, 8].forEach((d, i) => {
        const t = 0.28 + i * 0.19;
        const hz = stepHz(k, d);
        out.push(osc('triangle', glide(hz, hz * 0.94, t, 0.26), hit(t, 0.55, 0.28), { lfo: { hz: 16, depth: hz * 0.025 } }));
      });
      // It shares the splat's level and is a much smaller sound: at the splat's gains it
      // measured 11 LU under the music, a thud nobody would hear land. 6 dB up puts it
      // about 5 under, softer than the splat as a fall from lower down should be.
      return louder(out, 6);
    },
  },
  // THE SCOREBOARD: a bell tolled twice, low, over the lament -- the tonic and the fifth
  // under it. A new record follows with a bright run up the triad; an award, with the
  // unlock's sparkle. Audio.sfxGameOver queues the three 0.55 s apart on the audio clock,
  // called from gamesounds.js when the scoreboard arrives (this said main.js staggered them).
  gameover: {
    level: 0.090, limit: 1, gap: 0.5, vary: {}, band: [-9, -3],
    make(p, k) {
      const out = [];
      [[0, 0], [-3, 0.6]].forEach(([d, t]) => {
        const hz = stepHz(k, d, -1);
        out.push(osc('triangle', fixed(hz, t), hit(t, 1, 1.4)));
        out.push(osc('square', fixed(hz * 2, t), hit(t, 0.15, 0.5)));
        out.push(osc('triangle', fixed(hz * 3, t), hit(t, 0.12, 0.35)));
      });
      return out;
    },
  },
  record: {
    level: 0.080, limit: 1, gap: 0.5, vary: {}, band: [-8, -2],
    make(p, k) {
      const out = phrase('square', [0, 2, 4, 7].map((d, i) => [stepHz(k, d, 1), i === 3 ? 0.3 : 0.06, i === 3 ? 1 : 0.8]), { decay: 1.3 });
      out.push(osc('triangle', fixed(stepHz(k, 7), 0.18), hit(0.18, 0.9, 0.5)));
      return out;
    },
  },
  // AN AWARD: a sparkle -- a quick run up the high triad, a trill at the top, a shimmer of
  // noise.
  unlock: {
    level: 0.065, limit: 1, gap: 0.3, vary: {}, band: [-7, -1],
    make(p, k) {
      const out = phrase('triangle', [7, 9, 11, 14].map((d) => [stepHz(k, d), 0.045]), { decay: 3 });
      const a = stepHz(k, 14), b = stepHz(k, 16);
      const f = [];
      for (let i = 0; i < 8; i++) f.push(['set', i % 2 ? b : a, 0.18 + i * 0.03]);
      out.push(osc('square', f, [['set', 0.0001, 0.18], ['exp', 0.5, 0.185], ['set', 0.5, 0.36], ['exp', 0.0001, 0.6]]));
      out.push(osc('triangle', fixed(stepHz(k, 7), 0.18), hit(0.18, 0.8, 0.6)));
      out.push(noise(hit(0.18, 0.3, 0.4), 16000, { type: 'highpass', q: 0, f: 5000 }));
      return out;
    },
  },
  // A COMPANION JOINS: the head of the call, softly, a triangle with a square echo an
  // octave up, in the key the music is in (their arrival no longer moves it).
  join: {
    level: 0.049, limit: 1, gap: 0.5, vary: {}, band: [-7, -1],
    make(p, k) {
      const out = [];
      let t = 0;
      const s16 = 0.06;
      CALL.slice(0, 4).concat([[7, 5]]).forEach(([d, n], j) => {
        const len = n * s16;
        const last = j === 4;
        out.push(osc('triangle', fixed(stepHz(k, d), t), held(t, 1, last ? 0.4 : len * 0.9, last ? 0.2 : 0.02)));
        out.push(osc('square', fixed(stepHz(k, d, 1), t), held(t, 0.2, last ? 0.3 : len * 0.8, 0.02)));
        t += len;
      });
      return out;
    },
  },
  // A COMPANION SPEAKS: a line's worth of babble, a few clipped syllables in their own
  // register -- `voice` is their COMPANION_KEY, in semitones, taken as the nearest number
  // of scale steps so the babble stays in the key -- so each of them sounds like someone.
  speak: {
    level: 0.078, limit: 2, gap: 0.15, vary: { cents: 30, db: 1 }, band: [-16, -8],
    make({ syllables = 3, voice = 0, seed = 0 }, k) {
      const n = Math.max(2, Math.min(5, syllables));
      const out = [];
      const pattern = [0, 2, 1, 4, 2, 3];
      const reg = Math.round((voice * 7) / 12);
      for (let i = 0; i < n; i++) {
        const t = i * 0.075;
        const hz = stepHz(k, reg + pattern[(i + seed) % pattern.length], 0);
        out.push(osc('square', glide(hz, hz * 0.96, t, 0.05), hit(t, 1, 0.055, 0.003),
          { filter: { type: 'lowpass', q: 4, f: 1800 } }));
      }
      return out;
    },
  },
  // A COMPANION FALLS AWAY: a slide whistle down two octaves.
  slip: {
    level: 0.016, limit: 1, gap: 0.5, vary: {}, band: [-13, -5],
    make(p, k) {
      const a = stepHz(k, 7, 1);
      return [osc('square', glide(a, a / 4, 0, 0.6), held(0, 1, 0.62, 0.15),
        { lfo: { hz: 7, depth: 12 }, filter: { type: 'lowpass', q: 0, f: 2500 } })];
    },
  },
  // THE MENUS. A tick to move; up a fourth to choose; down to go back; and a sweep down to
  // wipe the awards. In the menu's own E major on the title screen.
  menuMove: {
    level: 0.110, limit: 2, gap: 0.02, vary: { db: 0.5 }, band: [-18, -10],
    make(p, k) {
      return [osc('square', fixed(stepHz(k, 4, 1), 0), hit(0, 1, 0.045)),
        osc('triangle', fixed(stepHz(k, 4), 0), hit(0, 0.5, 0.05))];
    },
  },
  menuSelect: {
    level: 0.071, limit: 2, gap: 0.02, vary: {}, band: [-15, -7],
    make(p, k) {
      return [...phrase('square', [[stepHz(k, 4, 1), 0.045], [stepHz(k, 7, 1), 0.08]]),
        osc('triangle', fixed(stepHz(k, 7), 0.045), hit(0.045, 0.6, 0.12))];
    },
  },
  menuBack: {
    level: 0.071, limit: 2, gap: 0.02, vary: {}, band: [-16, -8],
    make(p, k) {
      return [...phrase('square', [[stepHz(k, 4, 1), 0.045], [stepHz(k, 0, 1), 0.07]]),
        osc('triangle', fixed(stepHz(k, 0), 0.045), hit(0.045, 0.6, 0.1))];
    },
  },
  menuErase: {
    level: 0.062, limit: 1, gap: 0.2, vary: {}, band: [-14, -6],
    make(p, k) {
      return [osc('square', glide(stepHz(k, 7, 1), stepHz(k, 0, -1), 0, 0.3), hit(0, 1, 0.34)),
        noise(hit(0, 0.4, 0.25), 6000, { type: 'lowpass', q: 0, f: glide(4000, 400, 0, 0.25) })];
    },
  },
  // PAUSE and RESUME: the pause is the octave and the fifth, twice, short enough to finish
  // before the audio clock is stopped under it (Audio.suspend); the resume climbs back.
  pause: {
    level: 0.096, limit: 1, gap: 0.1, vary: {}, band: [-13, -5],
    make(p, k) {
      return phrase('square', [7, 4, 7, 4].map((d) => [stepHz(k, d, 1), 0.035]), { decay: 1.2 })
        .concat(phrase('triangle', [7, 4, 7, 4].map((d) => [stepHz(k, d), 0.035, 0.6]), { decay: 1.2 }));
    },
  },
  resume: {
    level: 0.075, limit: 1, gap: 0.1, vary: {}, band: [-14, -6],
    make(p, k) {
      return phrase('square', [[stepHz(k, 4, 1), 0.045], [stepHz(k, 7, 1), 0.09]])
        .concat(phrase('triangle', [[stepHz(k, 4), 0.045, 0.6], [stepHz(k, 7), 0.09, 0.6]]));
    },
  },
};

/** How long an effect's voices run, in seconds from its trigger. */
export function lengthOf(voices) {
  return voices.reduce((m, v) => Math.max(m, v.stop), 0);
}

/**
 * The noise the effects play, the same in the game and in the offline renderer: white,
 * from a fixed seed, each value held for `hold` samples. Held values are what give the
 * NES noise channel its crunch at a low rate, and what separates a hiss from a roar here.
 */
export function noiseSamples(n, hold = 1, seed = 0x9e3779b9) {
  const out = new Float32Array(n);
  let s = seed >>> 0;
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i % hold === 0) {
      s = (s * 1664525 + 1013904223) >>> 0;
      v = s / 2147483648 - 1;
    }
    out[i] = v;
  }
  return out;
}

/** The hold, in samples at `sampleRate`, for a noise voice's rate in Hz. */
export const holdFor = (rate, sampleRate) => Math.max(1, Math.round(sampleRate / Math.max(1, rate || sampleRate)));
