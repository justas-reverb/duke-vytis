// Guard for the generated note data.
//
// The model has now failed the same arithmetic twice: it cannot make two voices sum to
// the same number of sixteenths, even when told the exact totals. compose-music.mjs
// builds every bar and asserts it; this asserts the result held.
//
// It also guards the thing a listener complains about and no schema check would catch:
// a loop that DRAGS. And, since the climb became three themes, one per stage of the
// tower: that the stage map covers every zone, that no theme can be transposed out of
// what its voices can play, and that the three share the call that makes them one
// game's music.

import { TRACKS } from '../src/render/tracks.js';
import {
  freq, keyForStep, KEY_BANDS, VOICE_TYPES, ENVELOPES, VOICE_NAMES, voicesOf, pitchesOf,
  TEMPO_MIN, keyFromCut, stopsOf, stopRatio, stopGain,
} from '../src/render/audio.js';
import { STAGES, stageForZone, stageVisit } from '../src/game/stages.js';
import { THEMES } from '../src/game/themes.js';

const sum = (v) => v.reduce((s, n) => s + n[1], 0);
let bad = 0;
const fail = (m) => { console.log('  ' + m); bad++; };
const midiOf = (n) => Math.round(12 * Math.log2(freq(n) / 440)) + 69;

/**
 * Every note of a voice has to be a real note of a playable length. A chord (the menu's
 * brass, its two-part song, its choir) is two to five different names, lowest first.
 */
function checkNotes(label, voice) {
  for (const [n, d] of voice) {
    if (Array.isArray(n)) {
      const m = n.map(midiOf);
      if (n.length < 2 || n.length > 5) fail(`${label}: a chord of ${n.length} notes ${JSON.stringify(n)}`);
      if (m.some((k, i) => i && k <= m[i - 1])) fail(`${label}: chord ${JSON.stringify(n)} is not lowest first without repeats`);
    }
    for (const p of pitchesOf(n)) {
      if (!/^[A-G]#?[1-6]$/.test(p)) fail(`${label}: bad note name ${JSON.stringify(p)}`);
      else if (!(freq(p) > 20 && freq(p) < 4200)) fail(`${label}: ${p} is outside audible range`);
    }
    if (!Number.isInteger(d) || d < 1 || d > 16) fail(`${label}: bad duration ${d}`);
  }
}

/**
 * The longest unbroken run of ONE pitch, as a fraction of the loop.
 *
 * This is "it drags on too long before it loops back", made mechanical. The gameover
 * lament used to close on four consecutive E3s totalling 28 of its 64 sixteenths --
 * nearly five seconds of one note, 44% of the loop, every time round. Every individual
 * note passed every check above; the problem only exists at the scale of the phrase.
 */
function longestHeld(voice) {
  let best = 0, run = 0, prev = Symbol('none');
  for (const [note, d] of voice) {
    const n = note === null ? null : String(note);   // a chord repeats if all its names do
    if (n !== null && n === prev) run += d;
    else { run = n === null ? 0 : d; prev = n; }
    if (run > best) best = run;
  }
  return best;
}

const DRAG = 0.35;
const CLIMB = STAGES.map((s) => s.track);

for (const name of ['menu', ...CLIMB, 'gameover']) {
  const t = TRACKS[name];
  if (!t) { fail(`missing track ${name}`); continue; }
  const l = sum(t.lead);
  const b = sum(t.bass);
  if (l !== b) fail(`${name}: voices unbalanced, lead ${l} vs bass ${b}`);
  // The choir and the brass are optional -- only the menu and the lament have brass (the
  // lament's is its organ) -- but if present each must be exactly as long as the others,
  // or it drifts out of phase with the riff.
  for (const k of ['choir', 'brass']) {
    if (t[k] && t[k].length && sum(t[k]) !== l) fail(`${name}: ${k} ${sum(t[k])} against lead ${l}`);
  }
  // A choir on the pad envelope swells in over 0.35 s and fades from three quarters of a
  // note, so a note under a beat never reaches its level. The lament's choir is a rank of
  // its organ (the `organ` envelope, which speaks in 30 ms and holds), whose cluster in the
  // fall grows a note every two or three sixteenths: the rule is the pad's, not the choir's.
  const choirEnv = (voicesOf(t).find((v) => v.name === 'choir') || {}).env;
  if (t.choir && t.choir.length && choirEnv === 'pad') {
    for (const [, d] of t.choir) {
      if (d < 4) fail(`${name}: choir note of ${d} sixteenths is too short to be a pad`);
    }
  }
  if (l % 16 !== 0) fail(`${name}: ${l} sixteenths is not a whole number of bars`);
  if (!(t.bpm >= 50 && t.bpm <= 220)) fail(`${name}: bpm ${t.bpm} out of range`);
  checkNotes(name, VOICE_NAMES.flatMap((k) => t[k] || []));

  // A track may choose its voices' timbres, but only from what the engine plays. Its stops
  // (the lament's organ ranks) are whole semitones within two octaves of the written pitch,
  // a detune a chorus can hide (under a quarter tone, or it is another note), and a level
  // no louder than the voice.
  for (const v of voicesOf(t)) {
    if (!VOICE_TYPES.includes(v.type)) fail(`${name}.${v.name}: oscillator '${v.type}' is not one the engine has`);
    if (!ENVELOPES.includes(v.env)) fail(`${name}.${v.name}: envelope '${v.env}' is not one the engine has`);
    if (!(v.gain > 0 && v.gain <= 1)) fail(`${name}.${v.name}: gain ${v.gain} out of range`);
    for (const s of stopsOf(v)) {
      if (!Number.isInteger(s.semi || 0) || Math.abs(s.semi || 0) > 24) fail(`${name}.${v.name}: a stop ${s.semi} semitones off its pitch`);
      if (Math.abs(s.cents || 0) >= 50) fail(`${name}.${v.name}: a stop detuned ${s.cents} cents, a quarter tone or more`);
      if (!(stopGain(s) > 0 && stopGain(s) <= 1)) fail(`${name}.${v.name}: a stop at level ${stopGain(s)}`);
    }
  }
  if (t.mix) {
    for (const k of Object.keys(t.mix)) {
      if (!VOICE_NAMES.includes(k) || !t[k]) fail(`${name}: mix names a voice '${k}' it does not have`);
    }
  }

  const held = longestHeld(t.lead);
  if (held / l > DRAG) {
    fail(`${name}: lead holds one pitch for ${held}/${l} sixteenths ` +
      `(${Math.round((held / l) * 100)}% of the loop) -- it will read as dragging`);
  }

  const secs = l * (60 / t.bpm / 4);
  console.log(`  ${name.padEnd(9)} ${l / 16} bars, ${t.lead.length} lead / ${t.bass.length} bass / ` +
    `${(t.choir || []).length} choir${t.brass ? ` / ${t.brass.length} brass` : ''}, ${t.bpm} bpm, ${secs.toFixed(1)}s`);
}

// The lament is the slowest thing on the soundtrack: it is what comes after.
//
// The menu used to be slower than every climb theme as well, on the reasoning that the
// menu is waiting for the climb and the climb is the thing being done. The user asked for
// the opposite on 2026-09-23 -- a menu that "starts fast and is just in your face with it"
// -- so it is now the fastest thing WRITTEN. It is heard at TEMPO_MIN of that (main.js
// drives the intensity to 0 off the climb), 160-180 bpm as asked, while a climb theme at
// full tilt runs at up to TEMPO_MAX, x1.30, of its own (x1.70 until the climb's music was
// steadied, 4fbe0f9).
for (const name of CLIMB) {
  const t = TRACKS[name];
  if (!t) continue;
  if (!(TRACKS.gameover.bpm < t.bpm)) fail(`the lament is not slower than ${name}`);
  // Long enough not to grate. A stage lasts several minutes -- BELOW is 900 floors in
  // the first cycle -- and the old single climb track came round every 24 seconds.
  const secs = sum(t.lead) * (60 / t.bpm / 4);
  if (secs < 40) fail(`${name}: a ${secs.toFixed(1)}s loop comes round too often for a stage that lasts minutes`);
  if (secs > 90) fail(`${name}: a ${secs.toFixed(1)}s loop is too long to be heard as one`);
}

// The death music plays while the player reads their stats and decides. It had a window
// here of 8 to 11 seconds, calibrated on the model's three-bar lament: at 12.97 s its
// trailing whole notes dragged, at 6.49 s it was no longer the same piece. The lament is
// a fall that plays once and an eight-bar loop now, and what makes a loop drag is not its
// length but what is in it -- tools/test-lament.mjs checks that: the loop's bars, the
// longest note, the longest single pitch as heard, the fallen call in it, its key and its
// level.

// --- the menu: a fanfare that opens into a song --------------------------------------
//
// What was asked for on 2026-09-23, made mechanical: "something that starts fast and is
// just in your face with it. big brazen chords into a lovely harmony." Fast as heard on
// the title screen; a chord on the first beat with the bass under it and nothing before
// it; the brass in real chords; a song in thirds and sixths where the brass steps aside;
// and a loop that comes back round on the brass rather than out of a quiet bar.
const triadRoot = (names) => {
  const pcs = [...new Set(names.map((n) => midiOf(n) % 12))];
  if (pcs.length !== 3) return null;
  for (const r of pcs) {
    const has = (k) => pcs.includes((r + k) % 12);
    if (has(7) && (has(4) || has(3))) return { root: r, major: has(4) };
  }
  return null;
};
const notesOf = (v) => { let p = 0; return v.map(([n, d]) => { const at = p; p += d; return { n, d, at }; }); };
{
  const t = TRACKS.menu;
  const before = bad;
  const heard = t.bpm * TEMPO_MIN;
  // The bounds are the ones the message names. They were 155-185, so a menu heard at
  // 157 bpm passed while the check claimed 160-180; the menu's heard tempo moves with
  // TEMPO_MIN, which is tuned for the climb, and this is where that should show.
  if (!(heard >= 160 && heard <= 180)) fail(`menu: ${heard.toFixed(0)} bpm as heard on the title screen, not the 160-180 asked for`);
  const loop = sum(t.lead);
  const loopSecs = loop * (60 / heard / 4);
  if (loopSecs < 24 || loopSecs > 40) fail(`menu: a ${loopSecs.toFixed(1)}s loop as heard -- under 24 s it grates, over 40 s it is not heard as one`);

  const brass = notesOf(t.brass || []).filter((x) => x.n);
  const bass = notesOf(t.bass).filter((x) => x.n);
  const lead = notesOf(t.lead).filter((x) => x.n);
  const choir = notesOf(t.choir).filter((x) => x.n);
  if (!brass.length) fail('menu: no brass');

  // Real chords, stacked: every brass note is four or five notes of one major or minor
  // triad, voiced close -- no gap wider than a fourth -- so it reads as a section.
  for (const x of brass) {
    const m = x.n.map(midiOf);
    if (!(x.n.length >= 4 && triadRoot(x.n) && m.every((k, i) => !i || k - m[i - 1] <= 5))) {
      fail(`menu: brass ${JSON.stringify(x.n)} at ${x.at} is not a close four- or five-note triad`);
    }
  }
  // In your face from the first beat: the brass's first chord, the bass and the choir all
  // at position 0, and that chord the home chord, the bass on its root.
  const hit = brass[0];
  const home = hit && triadRoot(hit.n);
  if (!hit || hit.at !== 0 || !bass.length || bass[0].at !== 0 || !choir.length || choir[0].at !== 0) {
    fail('menu: bar 1 beat 1 is not the brass, the bass and the choir together -- something comes before the hit');
  } else if (!home || !home.major || midiOf(bass[0].n) % 12 !== home.root) {
    fail(`menu: the first chord ${JSON.stringify(hit.n)} over ${bass[0].n} is not a major chord on the bass`);
  }

  // The song: the lead in two parts, every pair a third or a sixth, some of each, and it
  // sings where the brass has stepped aside -- the harmony the fanfare opens into.
  let thirds = 0, sixths = 0;
  const other = [];
  for (const x of lead) {
    const iv = Array.isArray(x.n) && x.n.length === 2 ? midiOf(x.n[1]) - midiOf(x.n[0]) : -1;
    if (iv === 3 || iv === 4) thirds++;
    else if (iv === 8 || iv === 9) sixths++;
    else other.push(x);
  }
  if (other.length) {
    fail(`menu: ${other.length} notes of the lead are not a third or a sixth, the first ${JSON.stringify(other[0].n)} at ${other[0].at}`);
  }
  if (!thirds || !sixths) fail(`menu: the song has ${thirds} thirds and ${sixths} sixths; it wants both`);
  const overlap = lead.filter((x) => brass.some((y) => y.at < x.at + x.d && x.at < y.at + y.d));
  if (overlap.length) fail(`menu: ${overlap.length} notes of the song sound under the brass -- it should open into the song, not over it`);
  if (lead.length && brass.length && !(lead[0].at > brass[0].at)) fail('menu: the song comes before the fanfare');

  // The loop point. The last bar is the brass on its way back -- a chord starting in its
  // last beat, with the bass -- and not on the home chord, so bar 1 arrives rather than
  // repeats. A loop that ended in the song and restarted on the hit would jump; one with
  // a silent last beat would leave a hole before it.
  const last = brass[brass.length - 1];
  const inLastBeat = (v) => v.some((x) => x.at >= loop - 4);
  if (!last || last.at < loop - 16) fail('menu: the brass is silent in the last bar -- the loop does not come back on the fanfare');
  else if (!inLastBeat(brass) || !inLastBeat(bass)) fail('menu: the brass and the bass do not both play into the loop point');
  else if (home && triadRoot(last.n) && triadRoot(last.n).root === home.root) fail('menu: the loop ends on the chord it starts on, so bar 1 is not an arrival');

  if (bad === before) {
    console.log(`  menu      ${heard.toFixed(0)} bpm and a ${loopSecs.toFixed(1)}s loop as heard; opens on ${hit.n.join(' ')} over ${bass[0].n}; ` +
      `${brass.length} brass chords, a song of ${thirds} thirds and ${sixths} sixths; the loop comes round on ${last.n.join(' ')}`);
  }
}

// --- the stage map ----------------------------------------------------------
//
// ONE table, keyed by zone name (src/game/stages.js). Every zone in THEMES must be in
// exactly one stage -- a zone left out would fall back to the first stage's theme
// without a word -- and every stage must name a theme that exists.
{
  const before = bad;
  const seen = new Map();
  for (const s of STAGES) {
    if (!TRACKS[s.track]) fail(`stage ${s.name} plays '${s.track}', which is not a track`);
    for (const z of s.zones) {
      if (seen.has(z)) fail(`zone ${z} is in both ${seen.get(z)} and ${s.name}`);
      seen.set(z, s.name);
      if (!THEMES.some((t) => t.name === z)) fail(`stage ${s.name} lists ${z}, which is not a zone`);
    }
  }
  for (const t of THEMES) {
    if (!seen.has(t.name)) fail(`zone ${t.name} is in no stage, so it would play ${STAGES[0].track} by default`);
    else if (stageForZone(t.name).name !== seen.get(t.name)) fail(`stageForZone(${t.name}) disagrees with the table`);
  }
  if (new Set(CLIMB).size !== CLIMB.length) fail('two stages play the same theme');
  if (CLIMB.length !== 3) fail(`${CLIMB.length} stages, not three`);
  // The user's call, and the one easiest to undo by accident.
  if (stageForZone('DOWNTOWN').track !== STAGES[0].track) fail('DOWNTOWN is not in the first stage, BELOW');
  if (bad === before) {
    console.log(`  stages    ${STAGES.map((s) => `${s.track} (${s.zones.length} zones)`).join(', ')}`);
  }
}

// --- the call the three themes share -----------------------------------------
//
// THE CALL in compose-music.mjs: the tonic, up a fifth, the step below it and back, then
// the octave, in a 3:1:2:2 rhythm (or twice as long, spread over two bars). It is what
// makes three themes one game's music, and it is the first thing a later edit to one
// theme would quietly lose.
function calls(lead) {
  const notes = lead.filter(([n]) => n);
  const m = (n) => Math.round(12 * Math.log2(freq(n) / 440)) + 69;
  let found = 0;
  for (let i = 0; i + 4 < notes.length; i++) {
    const [a, b, c, d, e] = notes.slice(i, i + 5);
    const u = a[1] / 3;
    if (!(u === 1 || u === 2) || b[1] !== u || c[1] !== 2 * u || d[1] !== 2 * u) continue;
    const [p0, p1, p2, p3, p4] = [a, b, c, d, e].map(([n]) => m(n));
    if (p1 - p0 === 7 && (p1 - p2 === 1 || p1 - p2 === 2) && p3 === p1 && p4 - p0 === 12) found++;
  }
  return found;
}
for (const name of CLIMB) {
  if (!TRACKS[name]) continue;
  const n = calls(TRACKS[name].lead);
  if (n < 2) fail(`${name}: the shared call is heard ${n} time(s) a loop, not the two or more that tie it to the others`);
  else console.log(`  ${name.padEnd(9)} states the call ${n} times a loop`);
}
// The menu's fanfare IS the call, played in block chords: the tune is the chords' top
// note. Its song states it again, twice as slow, on top of the pairs.
{
  const tops = (v) => v.map(([n, d]) => [n && pitchesOf(n).reduce((a, b) => (freq(b) > freq(a) ? b : a)), d]);
  const inBrass = calls(tops(TRACKS.menu.brass || []));
  const inSong = calls(tops(TRACKS.menu.lead));
  if (inBrass < 2) fail(`menu: the brass states the call ${inBrass} time(s) a loop; the fanfare is meant to be the call`);
  else console.log(`  menu      states the call ${inBrass} times a loop in the brass and ${inSong} in the song`);
}

// --- the key ladder ---------------------------------------------------------
// One rung per zone of a stage (Audio.followClimb). It was one every 200 floors of a stage
// (keyForFloor), which in BELOW fell between the zones rather than on them.
let keyBad = 0;
for (let n = 0; n < KEY_BANDS.length * 3; n++) {
  const k = keyForStep(n);
  if (!Number.isInteger(k)) { fail(`keyForStep(${n}) is not a whole number of semitones`); keyBad++; break; }
  if (Math.abs(k) > 12) { fail(`keyForStep(${n}) = ${k} is more than an octave`); keyBad++; break; }
  // A step is a step: a small move, so a zone's change of key is heard as the climb
  // going on, not as a different piece.
  const d = Math.abs(keyForStep(n + 1) - k);
  if (d > 2) { fail(`the ladder moves ${d} semitones from rung ${n} to the next -- more than a whole tone`); keyBad++; break; }
}
if (keyForStep(0) !== 0) fail('a stage does not open in its home key');
// Every step has to be an audible change, or the zone's change is one nobody hears --
// including the one where the ladder comes round.
for (let b = 0; b < KEY_BANDS.length; b++) {
  const next = KEY_BANDS[(b + 1) % KEY_BANDS.length];
  if (KEY_BANDS[b] === next) fail(`key rung ${b} is the same key as the rung after it`);
}
// In the first lap each zone's rung is its place in its stage: BELOW's five zones climb to
// the fifth, and no stage comes round the ladder (stageVisit's place, from the tower).
{
  const seen = [];
  for (let f = 0; f < 2300; f += 100) {
    const v = stageVisit(f);
    if (v.zone === f || f === 0) seen.push(`${v.track[0]}${keyForStep(v.place)}`);
  }
  if (!keyBad) console.log(`  keys      a rung per zone of a stage, ${KEY_BANDS.join(' ')} semitones; the first lap's zones: ${seen.join(' ')}`);
}

// --- what the voices can play, at every key they can be asked for --------------------
//
// A climb theme is played transposed by the stage's key ladder (KEY_BANDS, restarting at
// every theme). A companion's lift (COMPANION_KEY, -5 to +7) used to add to it, and the
// worst case was the top of both; companions no longer move the key, so the ladder's top
// is the ceiling, and a theme written in the highest register is exactly the one that
// would go shrill. The menu is always played in its home key: resetKeys() runs before it.
// The lament is played in the key the climb was cut in, folded to within -6..+5
// semitones of its own (keyFromCut in audio.js), so it is checked across that whole fold.
//
//  - Nothing over 2.4 kHz. Above that even a square has only its fundamental left under
//    the music bus's 5.2 kHz roll-off -- its third harmonic is past it -- and a lead up
//    there is a thin whistle, not an instrument. It is also the choir filter's corner.
//  - Nothing under 30 Hz, about B0: a triangle bass there has almost nothing to hear.
//
// A voice's stops count: the lament's organ sounds every pitch an octave up as well, and
// its pedal an octave up, so what it can reach is its notes times its ranks.
{
  const TOP_HZ = 2400;
  const BOTTOM_HZ = 30;
  const up = Math.max(...KEY_BANDS);
  const down = Math.min(0, ...KEY_BANDS);
  // Every key the lament can be asked for: any theme, any rung of the ladder.
  const lamentKeys = CLIMB.flatMap((s) => KEY_BANDS.map((b) => keyFromCut('gameover', s, b)));
  const ranges = (tracks) => {
    const out = [];
    const report = [];
    for (const name of ['menu', ...CLIMB, 'gameover']) {
      const t = tracks[name];
      if (!t) continue;
      const climb = CLIMB.includes(name);
      const hi = climb ? up : name === 'gameover' ? Math.max(...lamentKeys) : 0;
      const lo = climb ? down : name === 'gameover' ? Math.min(...lamentKeys) : 0;
      for (const v of voicesOf(t)) {
        const hz = v.part.flatMap(([n]) => pitchesOf(n)).map(freq).flatMap((f) => stopsOf(v).map((s) => f * stopRatio(s)));
        const top = Math.max(...hz) * Math.pow(2, hi / 12);
        const bottom = Math.min(...hz) * Math.pow(2, lo / 12);
        if (top > TOP_HZ) out.push(`${name}.${v.name} reaches ${top.toFixed(0)} Hz at +${hi} semitones, over ${TOP_HZ}`);
        if (bottom < BOTTOM_HZ) out.push(`${name}.${v.name} reaches ${bottom.toFixed(1)} Hz at ${lo} semitones, under ${BOTTOM_HZ}`);
        if ((climb || name === 'gameover') && v.name === 'lead') {
          report.push(`${name} ${bottom.toFixed(0)}-${top.toFixed(0)} Hz${climb ? '' : ` (${lo} to +${hi})`}`);
        }
      }
    }
    return { out, report };
  };
  const r = ranges(TRACKS);
  for (const m of r.out) fail(m);
  // And the ranks are counted: an organ given a rank two octaves up, or a pedal one two
  // octaves down, must be caught, though every written note is where it was.
  const ranked = (voice, stop) => {
    const T = structuredClone(TRACKS);
    const mix = T.gameover.mix[voice];
    mix.stops = [...stopsOf(mix), stop];
    return ranges(T).out.length;
  };
  const missed = [['brass', { semi: 24 }], ['bass', { semi: -24 }]].filter(([v, s]) => !ranked(v, s));
  if (missed.length) fail(`ranges: an extra rank on the lament's ${missed.map(([v, s]) => `${v} (${s.semi})`).join(' and ')} goes unseen`);
  if (!r.out.length && !missed.length) {
    console.log(`  ranges    every voice and rank in ${BOTTOM_HZ}-${TOP_HZ} Hz from ${down} to +${up} semitones; ` +
      `leads ${r.report.join(', ')}; a rank two octaves off the lament's organ or pedal is caught`);
  }
}

console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
