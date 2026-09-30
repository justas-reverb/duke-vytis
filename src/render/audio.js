// Chiptune audio on WebAudio: square, triangle and sawtooth oscillators and a filtered
// noise source, all synthesised. The effects are data (src/render/sfx.js), played here
// on the audio clock by sfx(). There is a sample path as well (loadSamples, below): a
// recorded file in assets/sfx/ replaces the effect it is named after. Only the milestone
// callout asks for one, so with none on disk every sound is synthesised.
//
// Music uses a lookahead scheduler rather than one timer per note. Browsers throttle
// timers and the main thread is busy drawing at 160 Hz, so anything that fires a note
// "when the timer says so" drifts audibly. This queues notes ~100 ms ahead against the
// AudioContext's own clock, which does not drift.
//
// Each voice loops at its OWN length. That started as a workaround -- the generated
// lead parts did not sum to the bar count they declared -- and compose-music.mjs now
// fit()s every voice to exactly 256 sixteenths, so in practice they wrap together. The
// per-voice wrap costs nothing and is what would let voices of different lengths phase
// against each other, the way a tracker does with mismatched pattern lengths.
//
// The voices of a theme keep ONE clock, though: each note is timed from where it falls
// in the music, sixteenths from the top, on a song clock that every voice of the theme
// reads (startSet, advance). Each voice used to keep its own, a running sum of its note
// lengths at the tempo of the moment each note was queued -- so while the tempo moved,
// a sixteen-sixteenth pad kept one tempo for its whole bar and the lead's sixteenths
// kept another, and the difference never came back: it walked. With the intensity
// wandering the way a run drives it, ten minutes of one theme put the lead of the
// heavens 0.96 s off its harp and the choir 1.2 s off (the old single climb track,
// 2.5 s). Scheduled from the shared clock, notes that fall together start together.
//
// What changes over a run is the TEMPO, which tracks how hard the climb is going, the
// KEY, which steps up with each zone of a stage, and the THEME, one per stage of the
// tower (src/game/stages.js). Each of them changes slowly and only on the music's own
// terms: the tempo by a few percent a bar at most, the key only on the bar line where a
// zone arrives (its chime rings on that same downbeat), never twice in eight bars, and
// the theme never twice in one loop. They used to change at random moments and far too
// often, which is what the user heard as music that changed too much, at random: a
// companion joining or slipping moved the whole piece mid-phrase, the key stepped every
// 200 floors out of step with the zones, the tempo swung up to 35% in one bar of a
// human-paced climb, and past the first lap a theme could be handed over after five bars.
//
// The riff inside a theme does not change: a version that swapped in a different
// arrangement of each voice at every loop point was built, heard and removed. A riff that quietly becomes a different riff every twenty-four seconds is
// not variety, it is the track losing its nerve. A new theme at a new stage is a
// different thing -- it arrives with the zone's title, and it is the climb being
// somewhere else.
//
// Handovers between themes run on the AudioContext's clock (crossTo), not on setTimeout.
// The old crossTo faded out, then set a timer to start the next track; a death, a pause
// or a second crossTo inside that window left the timer to fire afterwards and start the
// old destination over whatever had replaced it. Nothing called it with music playing
// then, so it never showed; the stage handover calls it mid-run, where all three happen.

import { TRACKS } from './tracks.js';
import { MILESTONES } from '../game/combo.js';
import { stageVisit, STAGES } from '../game/stages.js';
import { SFX, keyOf, noiseSamples, holdFor, lengthOf, payoutSize } from './sfx.js';

// The milestone callouts, taken from the one table that fires them (MILESTONES in
// game/milestones.js, imported here through combo.js). The fanfare and the sample names
// both come from it, so neither can drift from what the game announces -- which is what
// happened when the ladder moved from hop counts (x5, x10, x20) to combo floors (50 to
// 350): the fanfare's old rank formula went on expecting 5 to 20 and put every callout at
// its cap, and main.js went on loading milestone5 to milestone100 while the game asked for
// milestone50 to milestone350. When the callouts moved again, to the tower's heights (330
// to 2300 floors of a lap), nothing here had to change.

/** The file a milestone's recorded callout is looked for under: 'milestone330'. */
export const milestoneSample = (x) => 'milestone' + x;

/**
 * Every sample the game will look for on disk: the catch-all, and one per milestone.
 * Absent files are not an error -- each effect keeps its synthesised version -- so this
 * can name more than exists.
 */
export const SAMPLE_NAMES = ['milestone', ...MILESTONES.map((m) => milestoneSample(m.x))];

/**
 * Which of the seven a callout's floor is, 0 (SWIFT) to 6 (GLORY): the fanfare it plays
 * (SFX.milestone). x is the floor within the lap the callout fires at (MILESTONES, 330 to
 * 2300; it was a combo's floor count, 50 to 350, until the callouts moved to the tower's
 * heights). A floor between two -- nothing fires one -- takes the one below it.
 */
export function milestoneIndex(x) {
  let i = 0;
  MILESTONES.forEach((m, j) => { if (x >= m.x) i = j; });
  return i;
}

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function freq(name) {
  if (!name) return 0;
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  const semi = NOTE[m[1]] + (m[2] ? 1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const sum = (part) => part.reduce((s, n) => s + n[1], 0);

export const LOOPS = Object.fromEntries(
  Object.entries(TRACKS).map(([k, t]) => [k, {
    lead: sum(t.lead), bass: sum(t.bass), choir: t.choir ? sum(t.choir) : 0, brass: t.brass ? sum(t.brass) : 0,
  }])
);

/**
 * The key ladder: one step per ZONE of a stage, taken on the bar line where the zone
 * arrives (Audio.followClimb), so the zone's chime and the new key are one event.
 *
 * Degrees of the natural minor scale, climbing to a fifth above the stage theme's home
 * key and easing back down, so every step lands somewhere the last one was not. A theme
 * opens at the first rung and each zone of its stage it plays through takes the next:
 * in the first cycle that is the zone's place in its stage -- BELOW's five zones at 0, 2,
 * 3, 5, 7, THE WORLD ABOVE's three at 0, 2, 3, THE HEAVENS' four at 0, 2, 3, 5 -- and a
 * fifth is the ceiling by construction, which test-music.mjs checks every theme against.
 *
 * It stepped every 200 floors counted from the stage's entry until 2026-09-24. BELOW's
 * zones change at 100, 300, 500 and 700, so there the zone and the key changed
 * alternately about every hundred floors, each key change applied to whatever note came
 * next, mid-phrase -- and a companion joining or slipping moved the whole piece again,
 * at random. A companion does not touch the key any more (their call still plays).
 */
export const KEY_BANDS = [0, 2, 3, 5, 7, 5, 3, 2];

/** The key of the `n`th rung of the ladder, in semitones over the theme's home key. */
export function keyForStep(n) {
  const L = KEY_BANDS.length;
  return KEY_BANDS[((n % L) + L) % L];
}

// How far apart the music's changes are held, in the music's own units. A zone that
// arrives sooner after the last change of key -- or after its theme's first downbeat,
// which is a change of key as well -- keeps the key it arrived in; a zone of another
// stage that arrives before the playing theme has come round once waits for it.
export const KEY_MIN_BARS = 8;        // bars: the least between two changes of key (typ. 8)
export const THEME_MIN_LOOPS = 1;     // loops: the least a theme plays before the next (typ. 1)

const LOOKAHEAD = 0.1;      // seconds of notes queued ahead
const TICK = 25;            // scheduler poll, ms
// s: a handover waiting for a loop's end starts this much before its fade must, so a frame
// or two late it still cuts on that bar line rather than the one after.
const HANDOVER_EARLY = 0.05;

// Tempo range driven by how hard the run is going, as a multiple of each track's written
// bpm. TEMPO_MIN is also where the menu and the lament rest (the intensity is 0 off the
// climb), which is why it stayed where it was.
export const TEMPO_MIN = 0.92;
export const TEMPO_MAX = 1.30;
// 1/s: how fast the tempo follows its target, typ. 0.15 -- a time constant of about 7 s,
// so it follows how the run has been going over the last several seconds, not the last jump.
export const TEMPO_EASE = 0.15;
// The most the tempo moves in one bar as heard, as a fraction of itself: typ. 0.02 (the
// run's bursts and pauses used to move it up to 35% in one bar).
export const TEMPO_BAR_MAX = 0.02;
// 1/s: how fast the tempo settles OFF the climb -- the menu and the lament, where nothing
// drives it and it only has to come to rest at TEMPO_MIN from the written tempo it starts
// at. Typ. 2.8, the easing everything had before the climb's was slowed: within a bar.
export const TEMPO_SETTLE = 2.8;
// The climb's own themes, the only tracks the run's intensity drives (TEMPO_EASE and
// TEMPO_BAR_MAX are for them).
const CLIMB_TRACKS = new Set(STAGES.map((s) => s.track));
// The choir bus swells between these as intensity rises.
export const CHOIR_MIN = 0.06;
export const CHOIR_MAX = 0.30;
export const CHOIR_EASE = 2.2;    // 1/s

/** The tempo multiplier a run of intensity `i` (0..1) is driven toward. */
export function tempoTargetFor(i) {
  // Going BELOW 1 when you are crawling matters as much as going above it when you are
  // flying: the track sagging is what makes it lift. But not by much, and not fast. The
  // range was x0.92-x1.70 eased at 2.8/s, which followed every burst and pause of a run
  // within half a second: a human-paced climb swung up to 35% in a single bar and moved
  // more than 3% in four bars of five, and the bot sat pinned at x1.70 -- 245 bpm for a
  // march written at 144. The song lurched; it did not lift.
  return TEMPO_MIN + (TEMPO_MAX - TEMPO_MIN) * (i * i * 0.65 + i * 0.35);
}

/**
 * One frame, `dt` seconds, of the tempo easing toward `target`: at TEMPO_EASE of the gap a
 * second, and never faster than TEMPO_BAR_MAX of itself over one bar as heard (`bar` is a
 * bar's length in seconds at the written tempo). The ease makes it follow the run over
 * several seconds rather than every wall bounce; the cap keeps each bar close to the last
 * whatever the run does. Exported so tools/music-render.mjs eases as the engine does.
 */
export function easeTempo(tempo, target, dt, bar) {
  const step = (target - tempo) * Math.min(1, dt * TEMPO_EASE);
  const most = (tempo * tempo * TEMPO_BAR_MAX * dt) / bar;
  return tempo + Math.max(-most, Math.min(most, step));
}

/**
 * One frame of the tempo of `track` easing toward `target`: the climb's themes lean with
 * the run (easeTempo); every other track -- the menu, the lament -- settles at TEMPO_SETTLE.
 *
 * The slow easing was first applied to every track, and the menu and the lament, which
 * start at their written tempo and rest at TEMPO_MIN, took about 25 s to get there instead
 * of a bar: the title music sagged 8% over its whole fanfare and song, and the lament's
 * first time round slowed bar by bar -- a new change the music had not made before, in a
 * change meant to take changes out. Nothing drives those two, so there is nothing to
 * smooth: they settle as they always did. Exported for tools/music-render.mjs.
 */
export function tempoStep(track, tempo, target, dt, bar) {
  if (CLIMB_TRACKS.has(track)) return easeTempo(tempo, target, dt, bar);
  return tempo + (target - tempo) * Math.min(1, dt * TEMPO_SETTLE);
}

/** The choir bus level at intensity `i`. */
export function choirLevelFor(i) {
  return CHOIR_MIN + (CHOIR_MAX - CHOIR_MIN) * i;
}

/**
 * The fixed stages of the music bus, from each voice to the speakers. Exported so the
 * offline preview renderer (tools/render-music.mjs) runs the same chain as the game.
 * `q` is the WebAudio BiquadFilter Q, which for a low-pass is in dB.
 */
export const MUSIC_BUS = {
  master: 0.5,
  music: 0.30,
  tone: { hz: 5200, q: 0.4 },        // the whole music bus
  choirTone: { hz: 2400, q: 1 },     // the choir's own low-pass (Q left at its default, 1)
};

/**
 * The effects' bus, from each effect's own level to the master: sfxGain, then the same
 * low-pass as the music so a recorded sample lands in the same tonal world. Exported for
 * the offline renderer (tools/sfx-render.mjs), as MUSIC_BUS is.
 */
export const SFX_BUS = { gain: 0.85, tone: { hz: 5200, q: 0.4 } };

/**
 * The limiter on the way out: a compressor, threshold in dBFS. tools/test-sfx.mjs holds
 * every effect, on top of the loudest moment of the music, under the threshold, so the
 * limiter never has to catch an effect and pump the music down with it.
 */
export const LIMITER = { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.12 };

/**
 * How the music gets out of the way. A pause pulls it to silence over PAUSE_FADE seconds
 * and stops the audio clock PAUSE_HOLD seconds later, once the pause's own jingle has
 * played; a resume brings it back over RESUME_FADE. [seconds; 0.04, 0.2, 0.08]
 */
export const PAUSE_FADE = 0.04;
export const PAUSE_HOLD = 0.2;
export const RESUME_FADE = 0.08;

// The handover between stage themes, in seconds of the audio clock. The outgoing theme
// fades for at least HANDOVER_FADE and is cut on its own next bar line after that, so
// the new theme's downbeat lands where the old theme's next one would have: 1.5 s plus
// up to a bar, about 1.5-3.2 s at 144 bpm -- around the 2.2 s the zone's title stays
// up. The new theme then swells from HANDOVER_FROM of full level over HANDOVER_SWELL,
// so its first note, the call the three themes share, is heard rather than faded over.
//
// The old theme fades DOWN TO HANDOVER_FROM at the cut, not to silence, and only then
// lets go over HANDOVER_TAIL, so the two meet at the same level on the downbeat. It
// first faded all the way to silence at the cut: a linear ramp to zero spends its last
// tenth under -20 dB, and rendered through the engine that was 0.5 s of the music more
// than 12 dB down and 0.2 s at -57 to -65 dB against -34 on either side -- a gap before
// every new theme, not a handover. The two themes are in different keys and tempos, so
// they are not overlapped; they are spliced on the bar line at a matched level.
export const HANDOVER_FADE = 1.5;    // s, the least the old theme fades for
export const HANDOVER_SWELL = 1.2;   // s, the new theme's swell to full level
export const HANDOVER_FROM = 0.3;    // fraction of full level where the two themes meet
export const HANDOVER_TAIL = 0.08;   // s, the old theme's last tails let go after the cut

// The handover when he falls (Audio.lament). The climb is cut DOWN, not faded out: it sags
// to LAMENT_FROM over at least LAMENT_FADE and is cut on its own next BEAT, where the
// lament's first note -- its lead alone -- comes in at that level and rises to full over
// LAMENT_SWELL. A beat, not the stage handover's bar line: a bar of the march is 1.7 s at
// its written tempo and the whole fall can be 1.0 s, while a beat is at most 0.42 s, so
// the cut lands within about half a second of the grab and on the pulse the climb was
// already keeping. Before this there was no handover at all (see lament()).
export const LAMENT_FADE = 0.15;     // s, the least the climb sags for before its cut
export const LAMENT_FROM = 0.4;      // fraction of full level where climb and lament meet
export const LAMENT_SWELL = 0.25;    // s, the lament's first note rising to full
export const LAMENT_GRID = 4;        // sixteenths: the climb is cut on a beat
// s, how fast stopMusic() silences whatever is playing: the next track starts 0.08 s on.
export const STOP_RELEASE = 0.12;

// The landing (Audio.landLament): the impact asks the lament to leave its fall and play its
// stab, and the stab sounds LANDING_LEAD after the ask -- long enough for the note pump,
// run in the same call, to queue it before the audio clock gets there, and short enough to
// land with the splat, which plays at once. The fall's notes still sounding are let go
// under it over LANDING_CUT. Before this the landing chord was written into the fall at a
// fixed place, 1.7 s into the lament, while the fall itself takes 1.0 to 2.45 s: the chord
// came 0.2 to 1.2 s off the impact, early from high up and late from low down.
export const LANDING_LEAD = 0.03;    // s, from the impact to the stab (typ. 0.03, two frames)
export const LANDING_CUT = 0.02;     // s, the fall let go under the stab (typ. 0.02)

const pitchClass = (name) => NOTE[name[0]] + (name[1] === '#' ? 1 : 0);

/**
 * The transpose a track that follows the cut (`keyFromCut` -- the lament) plays at when it
 * cuts into `heard` sounding `transpose` semitones from its own key: its tonic on the tonic
 * that was sounding, folded to within -6..+5 semitones of the key it is written in.
 *
 * The same tonic, because the climb can be cut in many keys -- three themes on two home
 * notes, KEY_BANDS up to +7 (a companion's lift, -5 to +7, used to add to it too) -- and
 * no one fixed key follows all of them: from the march at +3 (G minor) an E minor lament
 * is a chromatic lurch, the same one the impact's resetKeys() used to make mid-phrase. On
 * the tonic that was sounding, the lament is the parallel minor of whatever the climb was
 * in -- the same key out of the march and the gallop, the Lydian heavens' own tonic turned
 * minor -- and the first thing it plays after the cut is the note the climb was centred on.
 *
 * Folded, because the tonic alone does not say which octave: the ladder reaches +7 over a
 * theme in D or E (and with a companion's lift it reached +14), and a funeral march an
 * octave up is not one. Within a tritone of E the lament keeps the register it was written in.
 */
export function keyFromCut(name, heard, transpose) {
  const t = TRACKS[name];
  const h = heard && TRACKS[heard];
  if (!t || !t.tonic || !h || !h.tonic) return 0;
  const k = (((pitchClass(h.tonic) + (transpose | 0) - pitchClass(t.tonic)) % 12) + 12) % 12;
  return k > 5 ? k - 12 : k;
}

// How long a plucked note rings, as a multiple of its written length. 3 lets a run of
// sixteenths overlap three deep, which is what makes an arpeggio shimmer, not tick.
const PLUCK_RING = 3;

// The organ envelope ('organ', the lament's). A pipe does not strike: it speaks, over
// ORGAN_SPEAK, where a gate's attack is 6 ms, then holds at full level for as long as the key
// is down -- no decay -- and rings ORGAN_RING past its written length into the next chord, so
// a chord change is legato and a chord struck again breathes instead of clicking.
export const ORGAN_SPEAK = 0.03;     // s, typ. 0.03
export const ORGAN_RING = 0.08;      // s, typ. 0.08

/**
 * What each voice sounds like unless its track says otherwise, in `mix`. The first three
 * are the values every track played with before tracks could choose; every track now sets
 * some of its own, by measurement (compose-music.mjs).
 */
export const VOICE_MIX = {
  lead: { type: 'square', gain: 0.13, env: 'gate' },
  // Triangle, not sawtooth. A sawtooth at E1 is almost all harmonics and at
  // sixteenth-note rates it buzzes; a triangle has the weight without the fizz.
  bass: { type: 'triangle', gain: 0.22, env: 'gate' },
  choir: { type: 'triangle', gain: 0.5, env: 'pad' },
  // Block chords: one sawtooth per note, so this gain is per NOTE of a chord and a chord
  // gets louder as it gets bigger, which is how the menu's fanfare accents a hit. Only the
  // menu and the lament have brass, and each sets its own level (compose-music.mjs).
  brass: { type: 'sawtooth', gain: 0.07, env: 'gate' },
};
/** The oscillator shapes and note envelopes a track's `mix` may ask for. */
export const VOICE_TYPES = ['square', 'triangle', 'sawtooth', 'sine'];
export const ENVELOPES = ['gate', 'pad', 'pluck', 'organ'];
/** Every voice a track may have, in play order. */
export const VOICE_NAMES = ['lead', 'bass', 'choir', 'brass'];

/**
 * The pitches a note sounds: none for a rest, one for a name, several for a chord. A note
 * could only ever be one name until the menu's brass needed to play chords; a chord is an
 * array of names, one oscillator each, all on the note's envelope.
 */
export const pitchesOf = (n) => (n === null ? [] : Array.isArray(n) ? n : [n]);

/**
 * The ranks every pitch of a voice sounds on, as an organ's stops do: a track's `mix` may
 * give a voice `stops`, [{ semi, cents, gain }] -- semitones over the written pitch (12 is
 * the 4' over the 8', -12 the 16' under it), a few cents of detune, and the rank's level
 * against the voice's gain -- and each pitch then sounds one oscillator per stop, all on the
 * note's envelope. The lament's organ is two squares an octave apart with the upper one 7
 * cents sharp: the slow beat between them is what turns a chiptune square into a pipe
 * organ's chorus, and a pair of pulse channels in octaves is how an 8-bit score gets an
 * organ at all. With no stops, a pitch is one oscillator, as it always was.
 */
const UNISON = [{ semi: 0, cents: 0, gain: 1 }];
export const stopsOf = (v) => (v && v.stops && v.stops.length ? v.stops : UNISON);
/** The frequency ratio of a stop over the written pitch. */
export const stopRatio = (s) => Math.pow(2, ((s.semi || 0) + (s.cents || 0) / 100) / 12);
/** A stop's level against its voice's gain (1 when it does not say). */
export const stopGain = (s) => (s.gain === undefined ? 1 : s.gain);

/** A track's voices in play order, each with its part and its resolved timbre. */
export function voicesOf(track) {
  const out = [];
  for (const name of VOICE_NAMES) {
    const part = track[name];
    // Only the lead and bass are required: only the menu and the lament have brass.
    if (!part || !part.length) continue;
    out.push({ name, part, ...VOICE_MIX[name], ...((track.mix && track.mix[name]) || {}) });
  }
  return out;
}

/**
 * One note's gain envelope as WebAudio automation -- [kind, value, time] with kind 'set',
 * 'exp' or 'lin' -- and the time its oscillator stops. pump() applies exactly this list
 * to a GainNode and tools/render-music.mjs evaluates exactly this list offline, so the
 * previews and the game cannot disagree about the shape of a note.
 */
export function envelope(env, at, d, gain) {
  if (env === 'pad') {
    // A slow swell and a long tail, so sustained notes overlap into a chord instead of
    // firing like a lead.
    return {
      events: [['set', 0.0001, at], ['exp', gain, at + Math.min(0.35, d * 0.4)],
        ['set', gain, at + d * 0.75], ['exp', 0.0001, at + d * 1.05]],
      stop: at + d * 1.1 + 0.02,
    };
  }
  if (env === 'organ') {
    // Speaks on a straight ramp, holds, and rings on past the written length (ORGAN_SPEAK,
    // ORGAN_RING). A quarter of the note at most for the speech, so a sixteenth -- a beat of
    // the pedal's heartbeat in the lament's fall -- still reaches full level.
    const speak = Math.min(ORGAN_SPEAK, d * 0.25);
    return {
      events: [['set', 0.0001, at], ['lin', gain, at + speak],
        ['set', gain, at + d], ['exp', 0.0001, at + d + ORGAN_RING]],
      stop: at + d + ORGAN_RING + 0.02,
    };
  }
  const atk = Math.min(0.006, d * 0.15);
  if (env === 'pluck') {
    // Struck and left to ring past its written length, the way a harp string does.
    return {
      events: [['set', 0.0001, at], ['exp', gain, at + atk], ['exp', 0.0001, at + d * PLUCK_RING]],
      stop: at + d * PLUCK_RING + 0.02,
    };
  }
  // 'gate'. Short but non-zero attack and release. Ramping to 0.0001 and stopping the
  // oscillator at the same instant leaves a step in the waveform, and a step is a click
  // -- thousands of them a minute is the crackle. The node runs a little past its
  // envelope so it is silent before it stops.
  const rel = Math.min(0.03, d * 0.3);
  return {
    events: [['set', 0.0001, at], ['exp', gain, at + atk],
      ['set', gain, at + Math.max(atk, d - rel)], ['exp', 0.0001, at + d]],
    stop: at + d + 0.02,
  };
}

// Where each note of a part starts, in sixteenths from the top of the loop. The handover
// reads it to find the playing theme's next bar line.
const STARTS = new WeakMap();
function startsOf(part) {
  let s = STARTS.get(part);
  if (!s) {
    s = [];
    let acc = 0;
    for (const [, d] of part) { s.push(acc); acc += d; }
    STARTS.set(part, s);
  }
  return s;
}

/** Apply WebAudio automation, [kind, value, time] relative to `t0`, values times `ratio`. */
function automate(param, events, t0, ratio) {
  for (const [kind, value, t] of events) {
    if (kind === 'set') param.setValueAtTime(value * ratio, t0 + t);
    else if (kind === 'exp') param.exponentialRampToValueAtTime(value * ratio, t0 + t);
    else param.linearRampToValueAtTime(value * ratio, t0 + t);
  }
}

/**
 * The note a voice comes back to at the end of its part: its first, or for a track with an
 * `intro` -- bars that play once, as the lament's fall does -- the first note after them.
 */
function loopStart(part, introBars) {
  const i = introBars ? startsOf(part).indexOf(introBars * 16) : 0;
  return i < 0 ? 0 : i;
}

/**
 * Bring a theme's song clock up to `now`, then let it run on at `sixteenth`.
 *
 * The clock is a position in the music -- `pos` sixteenths from the theme's top at the
 * audio time `at` -- and every voice of the theme times its next note from it: at +
 * (note's position - pos) * sixteenth. It moves forward at the sixteenth it was left
 * with, the tempo in force since the last pump, and is not moved before the theme's
 * first note: a theme waiting for a handover's cut keeps that cut as its downbeat
 * whatever the tempo does in the meantime.
 */
function advance(clock, now, sixteenth) {
  if (now > clock.at) {
    clock.pos += (now - clock.at) / clock.sixteenth;
    clock.at = now;
  }
  clock.sixteenth = sixteenth;
}

/** Where a song clock is in the music at audio time `t`, in sixteenths from the top. */
const posAt = (clock, t) => clock.pos + (t - clock.at) / clock.sixteenth;

/**
 * The key a playing theme -- the engine itself, or a handover's outgoing set -- sounds in
 * at audio time `t`: its key, or the change waiting for its bar line once the music is there.
 */
function keyOfSet(set, t) {
  const next = set.keyNext;
  if (next && set.clock && posAt(set.clock, t) >= next.pos - 1e-9) return next.key;
  return set.transpose;
}

/**
 * A theme's first bar line that no voice of it has been scheduled into yet -- the first a
 * change of key can still land on whole: a note already queued past it would sound in the
 * old key after the line. No note of any track crosses a bar line (compose-music.mjs
 * writes them so), so this is the next bar line after the lookahead, as a position and a
 * time off the theme's clock (which must have been advanced to now).
 */
function freeBar(set, now) {
  const c = set.clock;
  let pos = posAt(c, now);
  for (const v of set.voices) pos = Math.max(pos, v.pos);
  const bar = Math.max(0, Math.ceil(pos / 16 - 1e-9) * 16);
  return { pos: bar, at: c.at + (bar - c.pos) * c.sixteenth };
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.everRan = false;   // the context has run at least once (see `blocked`)
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicOn = true;
    this.track = null;
    this.pendingTrack = null;
    this.timer = 0;
    this.voices = null;
    // Live tempo. 1.0 is the track's written bpm; the climb track is driven up toward
    // TEMPO_MAX as the run intensifies and eased back down when it calms.
    this.tempo = 1;
    this.tempoTarget = 1;
    this.baseSixteenth = 0.1;
    // The live key, in semitones over the playing theme's home key: the rung of the key
    // ladder the climb has reached. It had a second layer that added to it, a companion's
    // lift, set the moment they joined and cleared when they slipped -- at random moments,
    // mid-phrase, by up to seven semitones; that is gone.
    this.key = 0;
    this.transpose = 0;
    // A change of key waiting for its bar line: { pos, at, key }, pos in sixteenths from
    // the playing theme's top. Notes from that place in the music on play in the new key
    // (schedule), and keyNow() says so from that instant; pump() makes it the live key once
    // the music has got there. Applied at once, as it was, a key change landed on whatever
    // note the scheduler queued next -- a sixteenth into the lead, a bar into the choir.
    this.keyNext = null;
    // The climb's place on the key ladder (keyForStep), where the playing theme's last
    // change of key fell (sixteenths; its first downbeat, 0, counts as one), the zone the
    // run is in (its first floor), and a stage theme waiting for the playing one to come
    // round (see followClimb).
    this.keyStep = 0;
    this.lastKeyPos = 0;
    this.zoneAt = -1;
    this.wantTrack = null;
    // Where the latest zone lands in the music, { pos, at } -- the bar line its chime rings
    // on -- and the audio time until which the tempo is held still, so that bar line comes
    // exactly when it was promised to the chime.
    this.arrival = null;
    this.tempoHold = 0;
    // The key the playing track is held at whatever the live key does, or null to follow
    // it: set for the lament, from the music it cut into (startSet, keyFromCut). While it
    // is set, `transpose` IS that key (applyKey), because `transpose` is what anything
    // outside the scheduler reads to learn the key the music is sounding in -- an effect
    // tuned to the music, a test. It was kept beside `transpose` at first, and `transpose`
    // went on reporting the live key underneath: after the impact's resetKeys() it said E
    // while the lament played in, say, C minor, so an effect tuned by it would clash.
    this.pinned = null;
    // The playing theme's own pair of buses (see startSet), the theme a handover is
    // fading out, and the climb theme the stage map last asked for.
    this.bus = null;
    this.choirBus = null;
    this.clock = null;      // the playing theme's song clock (see advance)
    this.outgoing = null;
    this.stageTrack = null;
    // The lament's landing: where its stab is and whether it has come (startSet,
    // landLament); the buses its fall played on once it has, silent and waiting to be let go;
    // and the playing theme's swell into full level.
    this.landing = null;
    this.fallen = null;
    this.swell = null;
    // The effects: what of each is sounding (for its voice limit), the noise they play,
    // and where their small random differences come from (a test can seed it).
    this.live = Object.create(null);
    this.noiseBufs = Object.create(null);
    this.rng = Math.random;
    this.paused = false;
    this.suspendTimer = 0;
  }

  /**
   * Set the live key at once, for notes scheduled from now on: what a run starting at a
   * floor, or a test, needs. The climb itself changes key only through followClimb, on a
   * bar line.
   */
  setKey(semitones) { this.key = semitones | 0; this.keyNext = null; this.applyKey(); }
  /** Back to the home key, the bottom of the ladder, with nothing waiting. */
  resetKeys() { this.key = 0; this.keyNext = null; this.keyStep = 0; this.applyKey(); }
  applyKey() { this.transpose = this.pinned ?? this.key; }

  // Must be called from a user gesture; browsers refuse to start audio otherwise.
  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();

      // A limiter on the way out. Without one, a dense chug plus a lead plus a choir
      // plus overlapping SFX occasionally sums past 1.0, and WebAudio hard-clips --
      // which is exactly the crackle you hear under the music. A compressor with a
      // fast attack catches those peaks instead of letting them square off.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = LIMITER.threshold;
      this.limiter.knee.value = LIMITER.knee;
      this.limiter.ratio.value = LIMITER.ratio;
      this.limiter.attack.value = LIMITER.attack;
      this.limiter.release.value = LIMITER.release;
      this.limiter.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = MUSIC_BUS.master;
      this.master.connect(this.limiter);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_BUS.music;
      // A gentle roll-off on the whole music bus. A sawtooth bass at 41 Hz carries a
      // stack of high harmonics that read as fizz at these note rates; trimming the
      // top takes the harshness out without making it dull.
      this.musicTone = this.ctx.createBiquadFilter();
      this.musicTone.type = 'lowpass';
      this.musicTone.frequency.value = MUSIC_BUS.tone.hz;
      this.musicTone.Q.value = MUSIC_BUS.tone.q;
      this.musicTone.connect(this.musicGain);
      // The duck: the one gain that moves the whole of the music, for a milestone callout
      // and for a pause. Its own node, so neither has to touch musicGain, which the level
      // of the music is set by.
      this.duckGain = this.ctx.createGain();
      this.duckGain.gain.value = 1;
      this.musicGain.connect(this.duckGain);
      this.duckGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = SFX_BUS.gain;
      // The SFX bus used to connect straight to master, bypassing the tone filter the
      // music goes through. That was fine while every sound here was a square wave with
      // nothing above 5 kHz in it anyway, and it stops being fine the moment a real
      // recorded sample is dropped in: full-bandwidth samples over a music bed that is
      // capped at 5.2 kHz sound like they come from a different game. Same filter, same
      // corner frequency, so anything loaded from disk lands in the same tonal world.
      this.sfxTone = this.ctx.createBiquadFilter();
      this.sfxTone.type = 'lowpass';
      this.sfxTone.frequency.value = SFX_BUS.tone.hz;
      this.sfxTone.Q.value = SFX_BUS.tone.q;
      this.sfxTone.connect(this.master);
      this.sfxGain.connect(this.sfxTone);
      this.samples = Object.create(null);

      // The choir gets its own bus so its level can be driven independently of the
      // riff, which is what lets the sacred layer swell without the whole mix getting
      // louder.
      this.choirGain = this.ctx.createGain();
      this.choirGain.gain.value = CHOIR_MIN;
      this.choirGain.connect(this.musicTone);
      // A low-pass on the choir alone, fixed at MUSIC_BUS.choirTone (2.4 kHz), darker than
      // the 5.2 kHz on the whole bus. Nothing moves its frequency: what swells with the run
      // is choirGain's level (setIntensity), not its brightness. This said the filter
      // opened as the choir swelled; it has sat at 2.4 kHz since it was added (a406385).
      this.choirFilter = this.ctx.createBiquadFilter();
      this.choirFilter.type = 'lowpass';
      this.choirFilter.frequency.value = MUSIC_BUS.choirTone.hz;
      this.choirFilter.Q.value = MUSIC_BUS.choirTone.q;
      this.choirFilter.connect(this.choirGain);
      return true;
    } catch (e) {
      console.warn('audio unavailable:', e);
      this.ctx = null;
      return false;
    }
  }

  /** True only when sound can actually be heard right now. */
  get running() {
    const on = !!this.ctx && this.ctx.state === 'running';
    if (on) this.everRan = true;
    return on;
  }

  /**
   * Whether the page is still waiting to be let make any sound at all: a browser holds a new
   * AudioContext suspended until the page's first click, key or touch -- and a gamepad press
   * is not one of those, in Chromium or Safari -- while the desktop build's comes up running.
   * main.js keeps the "click or press a key" notice up while this holds.
   *
   * Latched on the first time the context is seen running, because the game suspends it
   * itself at every pause (suspend()), and a notice keyed to the state alone would come back
   * there, and for the moment every resume takes, though a click would change nothing.
   */
  get blocked() { return !!this.ctx && !this.running && !this.everRan; }

  resume() {
    if (!this.ctx) return Promise.resolve();
    const p = this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
    // Restart the note pump as well. suspend() clears the interval, and only resumeCtx()
    // ever put it back -- so after the window lost focus mid-run, clicking back in
    // resumed the AudioContext and then played the ~100 ms already queued, followed by
    // silence, because nothing was scheduling any more.
    if (!this.paused && !this.timer && this.voices) {
      this.timer = setInterval(() => this.pump(), TICK);
    }
    return p;
  }

  /**
   * Freeze everything. Suspending the AudioContext stops the clock the scheduler is
   * queued against, so notes already in flight hold rather than playing out over a
   * paused game, and resuming picks up exactly where it stopped.
   *
   * Not at once, though. It used to suspend in the same call, and main.js played the pause
   * blip straight after -- onto a clock that had just stopped, so the blip was never heard
   * at the pause; it sat queued and came out at the RESUME, on top of the resume's own.
   * Now the music is pulled to silence over PAUSE_FADE, the pause's jingle (sfxPause,
   * played just before this) rings out, and the clock stops PAUSE_HOLD later. The note
   * pump keeps running until then, into the silenced bus, so the music's clock and its
   * notes stay in step and nothing is owed when it resumes.
   */
  suspend() {
    if (!this.ctx) return;
    this.paused = true;
    this.rampDuck(0.0001, PAUSE_FADE);
    // The effects still sounding go with the music, all but the pause's own jingle. Left
    // alone they were cut off mid-waveform when the clock stopped under them -- a click --
    // and picked up where they had stopped at the resume, so the tail of a fanfare or a
    // zone chime came out over the first jump after it. (A key pressed while paused resumes
    // the context too -- ensureAudio -- and let them play out over the pause screen.)
    for (const name of Object.keys(this.live)) if (name !== 'pause') this.stopEffect(name, PAUSE_FADE);
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = 0;
      if (!this.paused) return;
      if (this.timer) { clearInterval(this.timer); this.timer = 0; }
      try { this.ctx.suspend(); } catch (e) { /* nothing to do */ }
    }, PAUSE_HOLD * 1000);
  }

  resumeCtx() {
    if (!this.ctx) return;
    this.paused = false;
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = 0; }
    try { this.ctx.resume(); } catch (e) { /* nothing to do */ }
    this.rampDuck(1, RESUME_FADE);
    if (!this.timer && this.voices) this.timer = setInterval(() => this.pump(), TICK);
  }

  /** Move the music's duck to `to` over `secs`, from wherever it is now. */
  rampDuck(to, secs) {
    if (!this.duckGain) return;
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(to, now + secs);
  }

  /**
   * Pull the music down by `db` for `hold` seconds under an effect that has earned the
   * room -- only the milestone callout asks (SFX.milestone.duck): a recorded shout needs
   * the space, and the fanfare is the one moment the game stops to celebrate. Not the
   * death: the catch calls lament() in the same moment as the wail, which already sags the
   * climb to LAMENT_FROM and cuts it on its next beat, and a duck there would pull the
   * lament's first notes down with it -- the duck moves the whole of the music. (This used
   * to say the climb's music had already stopped when the wail started, true while main.js
   * called stopMusic() at the fall.)
   */
  duck(db, hold) {
    if (!this.duckGain || this.paused) return;
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    const low = Math.pow(10, db / 20);
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(low, now + 0.03);
    g.setValueAtTime(low, now + hold);
    g.linearRampToValueAtTime(1, now + hold + 0.45);
  }

  /**
   * Drive the tempo from how hard the run is going. Eased over seconds and capped per bar
   * (easeTempo): the beat should lean with the climb, not flutter with every wall bounce.
   * Already-scheduled notes keep their timing, so nothing that has been queued shifts.
   * Held still while a zone's bar line is on its way (see arrival), so it falls when the
   * chime was told it would.
   *
   * And held still while paused, the choir with it: the music stops where it is and
   * resumes as it was. main.js goes on calling this every frame on the pause screen, with
   * an intensity of 0, and the tempo used to go on easing toward its rest the whole time
   * the clock was stopped -- harmless while it settled in a second and came straight back,
   * but at the climb's own pace a 20 s pause brought the march back 15% slower in one bar
   * (x1.13 to x0.97) and then crept up for half a minute: the lurch the easing is there
   * to prevent, made by the easing.
   */
  setIntensity(k, dt = 1 / 60) {
    if (this.paused) return;
    const i = Math.max(0, Math.min(1, k));
    this.intensity = i;
    this.tempoTarget = tempoTargetFor(i);
    const held = this.ctx && this.ctx.currentTime < this.tempoHold;
    if (!held) this.tempo = tempoStep(this.track, this.tempo, this.tempoTarget, dt, 16 * this.baseSixteenth);
    this.sixteenth = this.baseSixteenth / this.tempo;

    // The holy layer swells with the run. At a crawl it is barely there; at full tilt
    // the choir is carrying the track and the riff is riding on top of it.
    if (this.choirGain) {
      const want = choirLevelFor(i);
      const g = this.choirGain.gain;
      g.value += (want - g.value) * Math.min(1, dt * CHOIR_EASE);
    }
  }

  resetTempo() {
    this.tempo = 1;
    this.tempoTarget = 1;
    this.sixteenth = this.baseSixteenth;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : MUSIC_BUS.master;
  }

  // --- the effects -------------------------------------------------------------
  //
  // One method plays every effect: sfx(name, params) looks the effect up in SFX
  // (src/render/sfx.js), builds its voices for the key the music is in, and schedules them
  // on the audio clock. The sfxJump()-style methods below are the names the game calls
  // it by.

  /**
   * The key the effects are tuned to: the key the music is SOUNDING in at audio time `t`
   * (now, unless an effect is queued for later). During a handover that is the outgoing
   * theme until its cut -- a zone chime at a stage change rings over the old theme, and in
   * the new theme's key it clashed with it -- a change of key waiting for its bar line
   * counts from that bar line, and with no music at all it is the key of the track the
   * game wants playing.
   */
  keyNow(t = this.ctx ? this.ctx.currentTime : 0) {
    const out = this.outgoing;
    // The new theme from its first downbeat -- and from a microsecond before it, as
    // schedule() counts the cut: a zone arriving in the last bar before a handover's cut
    // queues its chime ON the cut, over the new theme's first notes, and `now + (cut - now)`
    // can round to just under the cut. A strict `t < out.end` then tuned that chime to the
    // theme that had stopped (the attract bot's run at seed 1 rang the heavens' chime over
    // the march's downbeat, 474.4 s).
    if (out && t < out.end - 1e-6) return keyOf(out.track, keyOfSet(out, t));
    return keyOf(this.track || this.pendingTrack, keyOfSet(this, t));
  }

  /** A second and a half of looped noise at a sample-and-hold rate, built once per rate. */
  noiseBuffer(rate) {
    const sr = this.ctx.sampleRate;
    const hold = holdFor(rate, sr);
    if (!this.noiseBufs[hold]) {
      const n = Math.floor(sr * 1.5);
      const buf = this.ctx.createBuffer(1, n, sr);
      buf.getChannelData(0).set(noiseSamples(n, hold));
      this.noiseBufs[hold] = buf;
    }
    return this.noiseBufs[hold];
  }

  /**
   * Play effect `name`, `delay` seconds from now on the audio clock. Returns the playing
   * instance, or false when nothing was played: no sound, muted, paused, or too soon after
   * the last one (its `gap`).
   *
   * Every effect has a VOICE LIMIT: at most `limit` of it sound at once, and a new one
   * steals the oldest, fading it out over 15 ms. Without one a burst of wall bounces or
   * landings stacked a copy per event and summed into a buzz several times as loud as
   * one; the old code had no limit at all and a fresh noise buffer per landing.
   */
  sfx(name, params = {}, delay = 0) {
    const spec = SFX[name];
    if (!spec || !this.ctx || this.muted || this.paused) return false;
    const now = this.ctx.currentTime + Math.max(0, delay);
    const live = (this.live[name] || []).filter((v) => v.end > now);
    this.live[name] = live;
    const last = live[live.length - 1];
    if (spec.gap && last && now - last.start < spec.gap) return false;

    while (live.length >= (spec.limit || 1)) this.release(live.shift(), now);

    // A recorded file wins, if one has been dropped into assets/sfx/. It counts against the
    // effect's voice limit like the synthesised one: it was played outside it, so a second
    // callout talked over the first, and nothing -- a pause, a steal -- could let go of it.
    if (spec.samples) {
      for (const s of spec.samples(params)) {
        const inst = this.sample(s);
        if (inst) {
          Object.assign(inst, { name, sample: s });
          live.push(inst);
          if (spec.duck) this.duck(spec.duck.db, spec.duck.hold);
          return inst;
        }
      }
    }

    const vary = spec.vary || {};
    const r = () => this.rng() * 2 - 1;
    const ratio = vary.cents ? Math.pow(2, (r() * vary.cents) / 1200) : 1;
    const level = spec.level * (vary.db ? Math.pow(10, (r() * vary.db) / 20) : 1);
    const t0 = now + (vary.ms ? (this.rng() * vary.ms) / 1000 : 0);
    // In the key sounding when it sounds: an effect queued for later (the zone's chime on
    // its bar line) takes the key the music will be in by then.
    const voices = spec.make(params, this.keyNow(now));

    const out = this.ctx.createGain();
    out.gain.value = level;
    out.connect(this.sfxGain);
    const srcs = voices.map((v) => this.playVoice(v, t0, out, ratio));
    const inst = { name, start: now, end: t0 + lengthOf(voices), out, srcs, level };
    live.push(inst);
    if (spec.duck) this.duck(spec.duck.db, spec.duck.hold);
    return inst;
  }

  /** One voice of an effect as nodes: source, optional filter, envelope, into `out`. */
  playVoice(v, t0, out, ratio) {
    const ctx = this.ctx;
    let src;
    if (v.type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(v.rate);
      src.loop = true;
    } else {
      src = ctx.createOscillator();
      src.type = v.type;
      automate(src.frequency, v.f, t0, ratio);
      if (v.lfo) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = v.lfo.hz;
        if (typeof v.lfo.depth === 'number') depth.gain.value = v.lfo.depth;
        else automate(depth.gain, v.lfo.depth, t0, 1);
        lfo.connect(depth);
        depth.connect(src.frequency);
        lfo.start(t0 + v.at);
        lfo.stop(t0 + v.stop);
      }
    }
    let node = src;
    if (v.filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = v.filter.type;
      bq.Q.value = v.filter.q;
      if (typeof v.filter.f === 'number') bq.frequency.value = v.filter.f * ratio;
      else automate(bq.frequency, v.filter.f, t0, ratio);
      node.connect(bq);
      node = bq;
    }
    const g = ctx.createGain();
    automate(g.gain, v.g, t0, 1);
    node.connect(g);
    g.connect(out);
    // A noise voice starts somewhere different in its loop each time, so two landings are
    // never the same hiss.
    if (v.type === 'noise') src.start(t0 + v.at, this.rng() * 1.4);
    else src.start(t0 + v.at);
    src.stop(t0 + v.stop);
    return src;
  }

  /** Fade a playing instance out over `secs` and stop its sources: a steal, or a cut. */
  release(inst, now, secs = 0.015) {
    if (!inst || !inst.out) return;
    try {
      const g = inst.out.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(inst.level, now);
      g.linearRampToValueAtTime(0.0001, now + secs);
      for (const s of inst.srcs) s.stop(now + secs + 0.01);
    } catch (e) { /* already stopped */ }
    inst.end = now;
  }

  /** Cut every playing instance of `name`, over `secs`. */
  stopEffect(name, secs = 0.06) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const inst of this.live[name] || []) if (inst.end > now) this.release(inst, now, secs);
    this.live[name] = [];
  }

  /**
   * Load one-shot samples from `assets/sfx/`, if any are present.
   *
   * Nothing in this engine has ever played a recorded sound -- every effect is an
   * oscillator or a JS-filled noise buffer. This is the whole of the path that changes
   * that: drop a file in, name it after the effect, and the effect plays it instead of
   * synthesising. A missing file is not an error, it just means that effect keeps its
   * synthesised version, so the game works identically with an empty assets folder.
   *
   * Fetched rather than bundled so that a build with samples and a build without are
   * the same source. Call it after the context exists; it is safe to call twice.
   */
  async loadSamples(names, base = 'assets/sfx/') {
    if (!this.ctx) return 0;
    let got = 0;
    await Promise.all(names.map(async (name) => {
      if (this.samples[name]) { got++; return; }
      for (const ext of ['ogg', 'wav']) {
        try {
          const res = await fetch(`${base}${name}.${ext}`);
          if (!res.ok) continue;
          const bytes = await res.arrayBuffer();
          this.samples[name] = await this.ctx.decodeAudioData(bytes);
          got++;
          return;
        } catch (e) { /* absent or undecodable: fall through to the next extension */ }
      }
    }));
    return got;
  }

  /**
   * Play a loaded sample. Returns false if there isn't one, which is how sfx() decides
   * whether to fall back to the synthesised version, and otherwise the playing instance
   * in the shape sfx() keeps (release() can fade it), so it can be cut short -- a
   * two-second shout that cannot be will talk over the next one.
   */
  sample(name, gain = 1, rate = 1) {
    if (!this.ctx || this.muted) return false;
    const buf = this.samples[name];
    if (!buf) return false;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + buf.duration + 0.05);
    return { start: t, end: t + buf.duration / rate, out: g, srcs: [src], level: gain };
  }

  // --- the effects, by the names the game calls them ----------------------------
  //
  // Each is one line: what the game knows about the event, handed to its entry in SFX.
  // What each sounds like, and why, is written there (src/render/sfx.js). Which game event
  // fires which is src/render/gamesounds.js, and the menus' are main.js.

  /** A jump off the ground; `power` is how fast he was running, 0..1. */
  sfxJump(power = 0) { return this.sfx('jump', { power }); }
  sfxDouble() { return this.sfx('double'); }
  sfxTriple() { return this.sfx('triple'); }
  /** A landing; `weight` 0..1 is how far he fell (landWeight in sfx.js). */
  sfxLand(weight = 0) { return this.sfx('land', { weight }); }
  /** A wall bounce at `speed` world units a second, driven by the combo's `boost` 0..1. */
  sfxWall(speed = 200, boost = 0) { return this.sfx('wall', { speed, boost }); }
  sfxWallKick() { return this.sfx('wallkick'); }
  /**
   * A hop that carried the chain on; `progress` 0..1 of the way to the chain's next
   * multiplier step (MULT_STEP floors apart), `first` the chain opening, `step` the hop
   * that crossed a step. (It read "the next milestone" while the callouts were the combo's
   * steps; they are the tower's heights now, and the ladder climbs to the step.)
   */
  sfxHop(progress = 0, first = false, step = false) { return this.sfx('hop', { progress, first, step }); }
  /** A chain banked: the break, then the payout sized by its floors. */
  sfxComboEnd(floors = 2) {
    this.sfx('comboEnd');
    return this.sfx('payout', { size: payoutSize(floors) });
  }
  /**
   * The grand callout at one of the tower's seven heights. `x` is the floor within the lap
   * it fires at, 330 to 2300 (MILESTONES in game/milestones.js, via Game.announceMilestone
   * and onAnnounce in gamesounds.js), the same on every lap. A recorded callout wins if one
   * has been dropped in, named by that floor so the SWIFT shout and the GLORY shout can be
   * different files -- 'milestone330', 'milestone2300' -- with a single 'milestone' as the
   * catch-all (SFX.milestone.samples). It was a combo's floor count, 50 to 350, and the
   * files milestone50 to milestone350, until the callouts moved to the tower's heights.
   */
  sfxMilestone(x = MILESTONES[0].x) { return this.sfx('milestone', { x, i: milestoneIndex(x) }); }
  /**
   * A new zone arriving: its chime rings on the bar line the zone lands on in the music
   * (followClimb put it there, with any change of key), in the key sounding from that
   * downbeat. It rang the moment the floor was crossed, anywhere in the bar, and the key
   * then changed on whatever note came next: two changes a few notes apart. The bar line is
   * at most a bar and a lookahead away -- 1.9 s at the slowest tempo -- and the zone's title
   * is up for 2.2 s.
   */
  sfxTheme() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    const bar = this.arrival && this.arrival.at >= now - 1e-9 ? this.arrival : this.nextBar();
    return this.sfx('zone', {}, bar ? Math.max(0, bar.at - now) : 0);
  }
  /** CLIMB!: the rising floor is close. */
  sfxClimb() { return this.sfx('climb'); }
  /** The rising floor catching him. */
  sfxCatch() { return this.sfx('catch'); }
  /** A long descending wail for the drop. Held until the landing or a skip. */
  sfxScream() { this.stopEffect('scream', 0.02); return this.sfx('scream'); }
  stopScream() { this.stopEffect('scream', 0.06); }
  /** The falling body glancing off a wall. */
  sfxFallWall() { return this.sfx('fallWall'); }
  /** The landing at the bottom of the fall: a splat of `severity` 0..1, or dazed. */
  sfxImpact(splat, severity = 0.5) { return this.sfx('impact', { splat: !!splat, severity }); }
  /**
   * The scoreboard coming up: its toll, then a new record's run and an award's sparkle
   * if the run earned them, each a beat after the last so they are heard as three things.
   */
  sfxGameOver({ records = 0, unlocked = 0 } = {}) {
    const inst = this.sfx('gameover');
    if (records) this.sfx('record', {}, 0.55);
    if (unlocked) this.sfx('unlock', {}, records ? 1.1 : 0.55);
    return inst;
  }
  /** A companion joining the climb. */
  sfxJoin() { return this.sfx('join'); }
  /** A companion's line coming up: `voice` their register in semitones, `syllables` its length. */
  sfxSpeak(voice = 0, syllables = 3) {
    return this.sfx('speak', { voice, syllables, seed: Math.floor(this.rng() * 6) });
  }
  /** A companion losing their grip. */
  sfxSlip() { return this.sfx('slip'); }
  /** An award unlocked. */
  sfxUnlock() { return this.sfx('unlock'); }
  /** The menus: 'move', 'select', 'back', or 'erase' (the awards wiped). */
  sfxMenu(kind = 'move') {
    return this.sfx({ select: 'menuSelect', back: 'menuBack', erase: 'menuErase' }[kind] || 'menuMove');
  }
  /** Played BEFORE suspend(), which lets it ring out before the clock stops. */
  sfxPause() { return this.sfx('pause'); }
  /** Played after resumeCtx(). */
  sfxResume() { return this.sfx('resume'); }

  // --- music -----------------------------------------------------------------
  playTrack(name) {
    // What the game wants playing, regardless of whether the context exists yet or
    // music is switched off. This is what lets sound recover later.
    this.pendingTrack = name;
    if (!this.ctx || !TRACKS[name]) return;
    if (this.track === name) return;
    this.stopMusic();
    // Claim the name only if we are actually going to play it. Setting it above the
    // music-off return meant that with music switched off, `track` was left holding a
    // name with no voices behind it -- and since setMusic(true) only flipped a flag and
    // every restart is guarded on `track` being empty, turning music off and on again
    // in OPTIONS produced permanent silence until something else changed track.
    if (!this.musicOn) return;

    // A new track starts at its written tempo; the climb track then accelerates.
    this.tempo = 1;
    this.tempoTarget = 1;
    this.startSet(name, this.ctx.currentTime + 0.08);

    this.timer = setInterval(() => this.pump(), TICK);
    this.pump();
  }

  /**
   * Make `name` the playing theme, its first note at `at` on the audio clock, at `from`
   * of full level and swelling to full over `swell` seconds.
   *
   * Each theme gets its own pair of buses, one for the riff and the bass and one into
   * the choir's filter. That is what lets a handover fade one theme out while the next
   * swells in without touching the shared music level -- the old crossTo ramped
   * musicGain itself, so anything that interrupted it left the whole bus wherever the
   * ramp had got to.
   */
  startSet(name, at, from = 1, swell = 0) {
    const t = TRACKS[name];
    this.track = name;
    this.trackDef = t;
    this.baseSixteenth = 60 / t.bpm / 4;
    this.sixteenth = this.baseSixteenth / this.tempo;
    const bus = this.ctx.createGain();
    const choirBus = this.ctx.createGain();
    bus.connect(this.musicTone);
    choirBus.connect(this.choirFilter || this.musicTone);
    if (from < 1) {
      for (const g of [bus.gain, choirBus.gain]) {
        g.setValueAtTime(from, at);
        g.linearRampToValueAtTime(1, at + swell);
      }
    }
    this.bus = bus;
    this.choirBus = choirBus;
    // The swell, kept so a landing that hands the music to fresh buses mid-swell can carry
    // it on (landLament); and the bar a track with a `landing` jumps to when he lands.
    this.swell = { at, from: Math.min(1, from), until: at + (from < 1 ? swell : 0) };
    // `queued`: the fall's oscillators as the pump starts them, so a landing can stop the
    // ones that have not begun yet (landLament).
    this.landing = t.landing ? { pos: t.landing * 16, done: false, at: null, queued: [] } : null;
    // A track that follows the cut (the lament) is held in the key of the music it cut
    // into, which is the theme being handed over; with none (a first start, or after
    // stopMusic) it plays in its own key. Held, not set as the live key, so that nothing
    // after the cut -- the impact's resetKeys(), in render/gamesounds.js's onImpact (this
    // said main.js, where it was until the effects moved out) -- moves it mid-phrase. The
    // outgoing theme has already taken its own key (crossTo), so this moves only the new one.
    // Its key at the cut: a change of key waiting for a bar line counts if the music got
    // there before it was cut.
    const heard = this.outgoing;
    this.pinned = t.keyFromCut ? keyFromCut(name, heard && heard.track, heard ? keyOfSet(heard, heard.end - 1e-6) : 0) : null;
    this.keyNext = null;
    this.lastKeyPos = 0;
    this.applyKey();
    // One song clock for the theme, its top at `at`; each voice keeps only its place in
    // the music (`pos`, sixteenths from the top) and the time of its next note (`at`).
    this.clock = { pos: 0, at, sixteenth: this.sixteenth };
    this.voices = voicesOf(t).map((v) => ({
      ...v, i: 0, pos: 0, at, starts: startsOf(v.part), loopAt: loopStart(v.part, t.intro),
      dest: v.name === 'choir' ? choirBus : bus,
    }));
  }

  pump() {
    if (!this.ctx || !this.voices) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    const out = this.outgoing;
    if (out) {
      // A theme being handed over plays on in the key AND at the tempo it had when the
      // handover began, and stops being scheduled at the cut. The tempo is frozen because
      // the cut is a bar line worked out at that tempo: it used to follow the live tempo,
      // and a run speeding up during the fade brought the old theme to its bar line
      // early and started the next bar's notes just ahead of the new theme's downbeat.
      advance(out.clock, now, out.clock.sixteenth);
      this.schedule(out.voices, out.clock, horizon, out.end, out.cutPos, out.transpose, out.keyNext);
      // Past the cut its bus is silent; let go of it once the last tails are gone.
      if (now > out.end + 0.5) { this.dropSet(out); this.outgoing = null; }
    }
    // The lament's fall, cut under its stab (landLament): silent from then, and let go the same way.
    if (this.fallen && now > this.fallen.end + 0.5) { this.dropSet(this.fallen); this.fallen = null; }
    advance(this.clock, now, this.sixteenth);
    this.settleKey();
    const fall = this.landing && !this.landing.done ? this.landing : null;
    this.schedule(this.voices, this.clock, horizon, Infinity, Infinity, this.transpose, this.keyNext, fall);
  }

  /**
   * A change of key the music has reached is the live key from then on. The song clock
   * must have been advanced to now. Called wherever the live key is about to be read or
   * replaced, not only by the pump, so nothing reads a key the music has already left.
   */
  settleKey() {
    const next = this.keyNext;
    if (next && this.clock && this.clock.pos >= next.pos - 1e-9) {
      this.key = next.key;
      this.keyNext = null;
      this.applyKey();
    }
  }

  /**
   * Queue every note of `voices` that starts before `horizon`, before the time `end`
   * and before the position `cutPos` (sixteenths from the theme's top), each timed from
   * the theme's song `clock`. A handover's cut is a bar line, so it stops every voice
   * by where it is in the music and not only by the clock; the time gets a microsecond
   * of slack, so the note that falls ON the cut, arriving as T minus a rounding error,
   * is not queued onto a bus that is silent by then.
   *
   * Each note is played in `transpose`, or from `keyNext.pos` on in `keyNext.key`: a change
   * of key belongs to a place in the music, a bar line, so every voice takes it on the same
   * downbeat however far ahead each has been queued.
   *
   * `fall`, for a lament that has not landed, collects the oscillators of the notes before
   * its stab, so the landing can stop the ones queued past it before they start.
   */
  schedule(voices, clock, horizon, end, cutPos, transpose, keyNext = null, fall = null) {
    const last = end - 1e-6;
    const sixteenth = clock.sixteenth;
    for (const v of voices) {
      let guard = 0;
      for (;;) {
        v.at = clock.at + (v.pos - clock.pos) * sixteenth;
        if (!(v.at < horizon && v.at < last && v.pos < cutPos && guard++ < 64)) break;
        const [note, dur] = v.part[v.i];
        const d = dur * sixteenth;
        const key = keyNext && v.pos >= keyNext.pos - 1e-9 ? keyNext.key : transpose;
        // One oscillator per pitch of the note, and per stop of the voice (stopsOf).
        for (const name of pitchesOf(note)) {
          for (const stop of stopsOf(v)) {
            const f = freq(name) * Math.pow(2, (key || 0) / 12) * stopRatio(stop);
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = v.type;
            o.frequency.setValueAtTime(f, v.at);
            const env = envelope(v.env, v.at, d, v.gain * stopGain(stop));
            for (const [kind, value, t] of env.events) {
              if (kind === 'set') g.gain.setValueAtTime(value, t);
              else if (kind === 'exp') g.gain.exponentialRampToValueAtTime(value, t);
              else g.gain.linearRampToValueAtTime(value, t);
            }
            o.connect(g);
            g.connect(v.dest);
            o.start(v.at);
            o.stop(env.stop);
            if (fall && v.pos < fall.pos) fall.queued.push({ o, at: v.at });
          }
        }
        v.pos += dur;
        // Each voice wraps at its own length, to the note after any intro (loopStart).
        v.i = v.i + 1 < v.part.length ? v.i + 1 : v.loopAt;
      }
    }
  }

  /** Disconnect a theme's buses. Only for one that is silent: this cuts it dead. */
  dropSet(set) {
    for (const n of [set.bus, set.choirBus]) {
      try { if (n) n.disconnect(); } catch (e) { /* already gone */ }
    }
  }

  stopMusic() {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    // The buses are released over STOP_RELEASE, not disconnected: a disconnect cuts every
    // note mid-waveform, which clicks. They used to be let go at full level, so every note
    // already sounding rang on to its end -- harmless under the old soundtrack's short
    // notes, but the lament's choir holds a chord for a bar, and when he climbed again it
    // rang up to 3.2 s into the new run's march, in whatever key the lament had taken from
    // the last climb -- 2 to 6 dB under the march for its first half second.
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const set of [this, this.outgoing, this.fallen]) {
        if (!set || !set.bus) continue;
        for (const g of [set.bus.gain, set.choirBus.gain]) {
          g.cancelScheduledValues(now);
          g.setValueAtTime(Math.max(0.0001, g.value), now);
          g.linearRampToValueAtTime(0.0001, now + STOP_RELEASE);
        }
      }
    }
    this.outgoing = null;
    this.fallen = null;
    this.landing = null;
    this.bus = null;
    this.choirBus = null;
    this.voices = null;
    this.track = null;
    // Nothing is held in a key once nothing is playing: the live key is the key again --
    // including a step of the ladder that was waiting for a bar line, so the ladder and the
    // key agree when music starts again (music switched back on mid-climb). Nothing waits
    // for a bar line of music that has stopped.
    if (this.keyNext) this.key = this.keyNext.key;
    this.keyNext = null;
    this.wantTrack = null;
    this.arrival = null;
    this.tempoHold = 0;
    this.pinned = null;
    this.applyKey();
    this.resetTempo();
  }

  /**
   * A theme's first bar line -- or, with `grid` 4, its first beat -- at or after time `t`,
   * off its song clock (the playing theme's unless another is given): when it falls, and
   * where, in sixteenths from the theme's top. The clock must have been advanced to now.
   */
  barLineAfter(t, grid = 16, c = this.clock) {
    const here = c.pos + (t - c.at) / c.sixteenth;
    const bar = Math.max(0, Math.ceil(here / grid - 1e-9) * grid);
    return { at: c.at + (bar - c.pos) * c.sixteenth, pos: bar };
  }

  /**
   * Take a theme's buses down to `from` of full level by `end`, where the next theme comes
   * in at that same level, and then to silence over HANDOVER_TAIL: the two meet on the cut
   * instead of the old one reaching silence first (see HANDOVER_FROM).
   */
  fadeDown(set, now, end, from) {
    const meet = Math.max(0.0001, from);
    for (const g of [set.bus.gain, set.choirBus.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.linearRampToValueAtTime(meet, end);
      if (meet > 0.0001) g.linearRampToValueAtTime(0.0001, end + HANDOVER_TAIL);
    }
  }

  /**
   * Hand the music over to `name`: fade the playing theme down to `from` of full level
   * over `fade` seconds -- to its next bar line after that, with `onBar`, or its next line
   * of any `grid` of sixteenths (4, a beat) -- and start `name` from its first bar at that
   * instant, swelling in from that same `from` over `swell` while the old theme's last
   * tails let go.
   *
   * Everything happens on the AudioContext's clock: the cut is a time, pump() stops the
   * old theme's notes at it and the new theme's are queued from it. The old version
   * waited on a setTimeout instead, which kept running through a pause and outlived a
   * death, and then started the old destination over whatever had replaced it. The
   * outgoing theme keeps the key it had when the handover began, so a key change made
   * straight after this call (a stage's key restarting) applies to the new theme only.
   */
  crossTo(name, fade = 0.35, { swell = fade, from = 0.0001, onBar = false, grid = onBar ? 16 : 0 } = {}) {
    if (!this.ctx || this.track === name) return;
    if (!this.voices) { this.playTrack(name); return; }
    if (!TRACKS[name]) return;
    this.pendingTrack = name;
    const now = this.ctx.currentTime;
    const out = this.outgoing;
    if (out && now < out.end) {
      // Already handing over, and the theme it was handing to has not played yet:
      // re-aim the same cut at the newer track rather than stacking a second fade. If the
      // newer one wants a cut on a finer grid that comes sooner -- the lament, when he
      // falls while a stage handover is waiting for its bar line -- the old theme, still
      // the one being heard, is cut on its own next beat instead of up to 3 s later.
      this.dropSet(this);
      if (grid) {
        advance(out.clock, now, out.clock.sixteenth);
        const cut = this.barLineAfter(now + fade, grid, out.clock);
        if (cut.pos < out.cutPos && cut.at < out.end) {
          out.end = cut.at;
          out.cutPos = cut.pos;
          this.fadeDown(out, now, cut.at, from);
        }
      }
      this.startSet(name, out.end, from, swell);
      return;
    }
    if (out) this.dropSet(out);
    // The cut, from the song clock brought up to this moment. With a grid it is a bar line
    // or a beat, and every old voice stops at that line IN THE MUSIC (cutPos) as well as
    // on the clock: when each voice kept its own clock, a bass or choir running ahead of
    // the lead began the old theme's next bar just before the new downbeat.
    advance(this.clock, now, this.sixteenth);
    this.settleKey();
    let end = now + fade;
    let cutPos = Infinity;
    if (grid) {
      const bar = this.barLineAfter(now + fade, grid);
      end = bar.at;
      cutPos = bar.pos;
    }
    this.fadeDown(this, now, end, from);
    // Its own copy of the clock, frozen at this tempo (see pump), so the bar line lands
    // on `end` however the live tempo moves during the fade. It keeps the key it was
    // sounding in -- and a change of key waiting for a bar line before the cut, which it
    // still makes -- and says which theme it is, so a track that follows the cut can take
    // that key (startSet).
    this.outgoing = {
      voices: this.voices, clock: { ...this.clock }, transpose: this.transpose, keyNext: this.keyNext,
      track: this.track, bus: this.bus, choirBus: this.choirBus, end, cutPos,
    };
    this.startSet(name, end, from, swell);
  }

  /**
   * He has fallen: cut the climb down on its next beat and let the lament in, in the key
   * the climb was sounding (keyFromCut), at LAMENT_FROM swelling over LAMENT_SWELL.
   *
   * main.js used to call stopMusic() here. The climb stopped wherever it was, with nothing
   * after it; the once-a-second safety net in main.js then found no track playing and
   * started the lament 0 to 1 s later, in the climb's key band plus its companion (+12 at
   * floor 850 with the archer); and the impact's resetKeys() dropped it to E partway
   * through a phrase. A skipped fall never reaches the impact, so it stayed at +12.
   *
   * The lament starts at its written tempo: the climb's is the run's, up to TEMPO_MAX
   * (x1.30; it was x1.70 when this was written), and nothing drives the tempo while he
   * falls. The choir bus is taken down to CHOIR_MIN, the level it rests at on the
   * scoreboard, for the same reason: the lament's choir comes in with its fall (a low
   * cluster) and holds the stab's chord, and left at a hard run's swell (0.30) it would come
   * in 14 dB over the level it then sinks to when the scoreboard eases the intensity to zero.
   */
  lament() {
    if (!this.ctx || this.track === 'gameover') return;
    this.tempo = 1;
    this.tempoTarget = 1;
    this.tempoHold = 0;
    this.wantTrack = null;
    const now = this.ctx.currentTime;
    if (this.choirGain) {
      const g = this.choirGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(CHOIR_MIN, now + LAMENT_FADE);
    }
    this.crossTo('gameover', LAMENT_FADE, { swell: LAMENT_SWELL, from: LAMENT_FROM, grid: LAMENT_GRID });
    // A zone's chime waiting for a bar line the climb will not reach now: it was built in
    // the climb's key and would ring over the lament's first notes.
    const cut = this.outgoing ? this.outgoing.end : now;
    for (const inst of this.live.zone || []) if (inst.start >= cut - 1e-9) this.release(inst, now);
  }

  /**
   * He has hit the ground (or the fall was skipped to the scoreboard): the lament leaves its
   * fall wherever it has got to and plays its stab -- the bar its track names as `landing` --
   * LANDING_LEAD from now, with the splat.
   *
   * The fall's length is not the music's to choose. It runs 1.0 s from the ground floor to
   * 2.45 s from floor 654 up, and the lament comes in on the climb's next beat, 0.15 to 0.6 s
   * after the catch; the landing chord used to be written into the fall at a fixed 1.7 s, so
   * it came 0.2 to 1.2 s off the impact. The fall is a bar of tension with no downbeat to
   * keep, and the stab is where the music's pulse starts again, so the jump can be made at
   * any instant rather than on a beat (a beat is 0.83 s at 72 bpm):
   *
   *  - every voice is queued to the lookahead first, so nothing of the fall is still owed;
   *  - the song clock is moved on so the stab's place in the music falls at the landing,
   *    and every voice goes to its note there (compose-music.mjs gives every voice one);
   *  - the fall's notes queued to start at or after that instant are stopped before they
   *    start; the ones still ringing are on the buses the fall was playing on, which are let
   *    go under the stab over LANDING_CUT, and the music from the stab on plays on a fresh
   *    pair -- carrying on the lament's swell in, if it is still swelling.
   *
   * Nothing happens if the fall has already run its course to the stab, if the track has no
   * landing, or if it has landed. If the lament has not reached its first note yet -- a skip
   * before the climb's cut -- the stab is its first note.
   */
  landLament() {
    const L = this.landing;
    if (!this.ctx || !this.voices || !L || L.done) return;
    L.done = true;
    const now = this.ctx.currentTime;
    this.pump();
    const c = this.clock;
    const at = Math.max(now + LANDING_LEAD, c.at);
    const pos = posAt(c, at);
    // Already there, or queued to come within the lead: it plays where the score has it.
    if (pos >= L.pos - 1e-9) { L.at = c.at + (L.pos - c.pos) * c.sixteenth; L.queued = []; return; }
    L.at = at;
    // The fall's notes queued to start at or after the stab never start. Left to the buses
    // alone, a note queued ON the stab -- the lament's own first notes, when it is landed the
    // moment it is asked for (main.js, sound first coming up on the scoreboard) -- sounded
    // for the LANDING_CUT the buses take to go: a blip of the fall under the stab. (A second
    // stop() only moves the stop time; it throws on some old engines, and then the bus below
    // still silences the note.)
    for (const q of L.queued) {
      if (q.at >= at - 1e-9) { try { q.o.stop(at); } catch (e) { /* the bus lets it go */ } }
    }
    L.queued = [];
    // The fall's buses, let go under the stab from where they are: their swell, if the stab
    // comes before it ends, is kept to that instant rather than cancelled (a cancelled ramp
    // is a step), then taken down.
    const s = this.swell;
    const level = s && at < s.until ? s.from + (1 - s.from) * ((at - s.at) / (s.until - s.at)) : 1;
    for (const g of [this.bus.gain, this.choirBus.gain]) {
      g.cancelScheduledValues(at);
      g.linearRampToValueAtTime(Math.max(0.0001, level), at);
      g.linearRampToValueAtTime(0.0001, at + LANDING_CUT);
    }
    if (this.fallen) this.dropSet(this.fallen);   // a last death's, long silent
    this.fallen = { bus: this.bus, choirBus: this.choirBus, end: at + LANDING_CUT };
    // The fresh pair, at the level the fall's had there, and on up to full if it was swelling.
    const bus = this.ctx.createGain();
    const choirBus = this.ctx.createGain();
    bus.connect(this.musicTone);
    choirBus.connect(this.choirFilter || this.musicTone);
    if (level < 1) {
      for (const g of [bus.gain, choirBus.gain]) {
        g.setValueAtTime(Math.max(0.0001, level), at);
        g.linearRampToValueAtTime(1, s.until);
      }
    }
    this.bus = bus;
    this.choirBus = choirBus;
    // The music from the stab on: the song clock moved on by the part of the fall skipped,
    // so everything after keeps the positions it has in the score.
    c.pos += L.pos - pos;
    for (const v of this.voices) {
      const i = v.starts.indexOf(L.pos);
      v.i = i < 0 ? v.loopAt : i;
      v.pos = L.pos;
      v.dest = v.name === 'choir' ? choirBus : bus;
    }
    this.pump();
  }

  // --- the climb: one theme per stage -----------------------------------------
  //
  // The stage map (src/game/stages.js) says which theme a zone plays, by the zone's
  // name. Everything the climb's music does happens when a ZONE arrives, on the music's
  // next bar line, together with the zone's chime (sfxTheme):
  //
  //  - a zone of the playing theme's stage steps the key one rung up the ladder
  //    (keyForStep) -- unless the last change of key, or the theme's first downbeat, is
  //    under KEY_MIN_BARS behind that bar line, when it keeps the key it has;
  //  - a zone of another stage hands the music over to that stage's theme, in its home
  //    key -- once the playing theme has played THEME_MIN_LOOPS whole loops, and
  //    KEY_MIN_BARS since its last change of key. Sooner than that it waits, and the
  //    handover is cut on the bar line where the wait ends: the loop's own end, where the
  //    theme comes round anyway. A zone of the playing theme's stage arriving meanwhile
  //    calls it off.
  //
  // The wait ends on the loop's end rather than at the next zone after it because the
  // player is already in the new stage: past the first lap zones of different stages can
  // follow one another, and a human takes one to three minutes over a zone, so waiting for
  // another arrival could leave the wrong stage's theme on for minutes, or miss that
  // stage's theme altogether. The end of a loop is the one seam every theme already has.
  //
  // In the first lap nothing waits: the stages last 900, 600 and 800 floors, many loops,
  // and each handover is where it was, 1.5-3.2 s after the stage's first zone arrives. Past
  // it every lap is a fresh shuffle of the zones, and the themes used to hand over at
  // nearly every zone -- the attract bot's second lap handed ABOVE back to BELOW five
  // bars after it had begun.
  //
  // The ladder restarts with every theme, so each opens in its own home key (counted from
  // the ground, as it was with one climb track, the heavens would open at +10 to +12
  // semitones on a theme written in the highest register of the three).

  /**
   * Put the climb's music on for a run at `floor` -- a new run at 0, or one picked up
   * mid-climb when the sound first becomes available: that stage's theme, at once, in
   * the key its zones have climbed to (the zone's place in the stage's run of zones).
   */
  startClimb(floor = 0) {
    const v = stageVisit(floor);
    this.stageTrack = v.track;
    this.wantTrack = null;
    this.zoneAt = v.zone;
    this.keyStep = v.place;
    this.setKey(keyForStep(v.place));
    this.crossTo(v.track);
  }

  /**
   * Called every simulation step while climbing, with the highest floor reached -- never
   * the current one: standing on a zone's first floor and hopping down and back would
   * otherwise bring the zone, and the music's change, twice a second.
   */
  followClimb(floor) {
    const v = stageVisit(floor);
    if (v.zone !== this.zoneAt) {
      this.zoneAt = v.zone;
      this.zoneArrives(v.track);
    } else if (this.wantTrack) {
      this.handOverWhenDue();
    }
  }

  /** A zone of `track`'s stage has arrived: its change, and the bar line it lands on. */
  zoneArrives(track) {
    this.arrival = null;
    if (track === this.stageTrack) {
      this.wantTrack = null;
      this.stepKey();
    } else {
      this.wantTrack = track;
      this.handOverWhenDue();
    }
    // The bar line the zone lands on, for its chime: the key change's, or the next one of
    // the music heard now (the outgoing theme's, if a handover has just begun).
    if (!this.arrival) this.arrival = this.nextBar();
    if (this.arrival) this.tempoHold = Math.max(this.tempoHold, this.arrival.at);
  }

  /** The playing theme is making sound and could be moved on a bar line. */
  get climbing() { return !!(this.ctx && this.voices && this.clock); }

  /**
   * One rung up the key ladder for the playing theme, on its next bar line no note has been
   * queued past (freeBar) -- or not at all, when that is under KEY_MIN_BARS after the
   * theme's last change of key or its first downbeat. With no music playing the ladder
   * simply moves (music switched off, or no sound yet).
   */
  stepKey() {
    const next = keyForStep(this.keyStep + 1);
    if (!this.climbing) { this.keyStep++; this.setKey(next); return; }
    const now = this.ctx.currentTime;
    // A theme still waiting for its handover's cut has not begun: too soon by definition.
    if (this.outgoing && now < this.outgoing.end) return;
    advance(this.clock, now, this.sixteenth);
    this.settleKey();
    const bar = freeBar(this, now);
    if (bar.pos - this.lastKeyPos < KEY_MIN_BARS * 16) return;
    this.keyStep++;
    this.keyNext = { pos: bar.pos, at: bar.at, key: next };
    this.lastKeyPos = bar.pos;
    this.arrival = bar;
  }

  /**
   * The next bar line of the music being heard that no note has been queued past, or null
   * with none playing. During a handover that is the outgoing theme's, up to its cut, where
   * the new theme's first downbeat is.
   */
  nextBar() {
    if (!this.climbing) return null;
    const now = this.ctx.currentTime;
    const out = this.outgoing;
    if (out && now < out.end) {
      advance(out.clock, now, out.clock.sixteenth);
      const b = freeBar(out, now);
      return b.at <= out.end ? b : { pos: 0, at: out.end };
    }
    advance(this.clock, now, this.sixteenth);
    return freeBar(this, now);
  }

  /**
   * Hand the music to the stage theme waiting (wantTrack), now if the playing theme has
   * been heard long enough -- THEME_MIN_LOOPS loops from its first downbeat, and
   * KEY_MIN_BARS from its last change of key -- or else as soon as the fade can end on the
   * bar line where it has: called every step while one waits.
   */
  handOverWhenDue() {
    const want = this.wantTrack;
    if (!want) return;
    if (want === this.stageTrack) { this.wantTrack = null; return; }
    if (this.climbing) {
      const now = this.ctx.currentTime;
      if (this.outgoing && now < this.outgoing.end) return;
      const c = this.clock;
      const loop = LOOPS[this.track] ? LOOPS[this.track].lead : 0;
      const due = Math.max(loop * THEME_MIN_LOOPS, this.lastKeyPos + KEY_MIN_BARS * 16);
      const dueAt = c.at + (due - c.pos) * c.sixteenth;
      if (now < dueAt - HANDOVER_FADE - HANDOVER_EARLY) return;
    }
    this.wantTrack = null;
    this.stageTrack = want;
    // The handover BEFORE the key: the outgoing theme keeps the key it was in as it
    // fades, and the new stage's home key applies only to the new theme.
    this.crossTo(want, HANDOVER_FADE, { swell: HANDOVER_SWELL, from: HANDOVER_FROM, onBar: true });
    this.keyStep = 0;
    this.setKey(keyForStep(0));
  }

  setMusic(on) {
    const was = this.musicOn;
    this.musicOn = on;
    if (!on) { this.stopMusic(); return; }
    // Switching it back on has to actually start something again. It used to set the
    // flag and stop there, leaving the player staring at MUSIC: ON in silence.
    if (!was && this.ctx && this.pendingTrack) {
      const want = this.pendingTrack;
      this.track = null;
      this.playTrack(want);
    }
  }
}
