// The lament: what plays from the moment he falls until he climbs again.
//
// Twice rewritten on complaints. The first lament was the local model's three bars, played
// in whatever key the climb had reached and dropped to E at the impact, mid-phrase. The
// second was THE CALL turned over (2026-09-23), in the key the climb was cut in; the user
// found it poor and asked for something in the manner of The Phantom of the Opera, but 8-bit,
// a spooky death held in suspense (2026-09-28). This is the third: a gothic organ and a
// music box (tools/compose-music.mjs, THE LAMENT) -- a fall that tightens, a stab struck at
// the impact, and a loop of suspensions that comes home only round the seam -- and its
// stab is LANDED on the impact by the engine (Audio.landLament), where the second's landing
// chord was written at a fixed 1.7 s into a fall that takes 1.0 to 2.45 s, and came 0.2 to
// 1.2 s off the splat.
//
// So this checks, each against a broken version of itself that it must fail (MUTANTS):
//
//   1. THE PIECE, as data: every voice the fall, the stab and the loop to the sixteenth,
//      with a note where the stab and the loop start; the fall tightening (the pedal
//      creeping up by semitones as a heartbeat that quickens, the music box falling, a
//      cluster, the organ holding its breath); the stab a diminished seventh over the tonic
//      in the pedal, then the Toccata's mordent and plunge to the leading tone; 4-3, 9-8
//      and 7-6 suspensions, prepared, in the loop; home only round the seam; the music box
//      above the organ, never on one pitch; the organ voiced as one; the call, fallen.
//   2. THE KEY it is played in, through the REAL engine: every note of every voice, fall,
//      stab and loop, in the key the climb was cut in, through the impact's resetKeys() and
//      the landing, and the lead in the order the score gives once it has landed.
//   3. THE STAB ON THE IMPACT: from falls of 1.0 to 2.45 s, and a skipped one, the organ's
//      first chord is the stab, LANDING_LEAD after the impact asked for it; the fall is gone
//      under it; it is heard; it peaks within a decibel of the climb.
//   4. THE HANDOVER at the catch: the climb cut on a beat, no hole, no pile-up.
//   5. CLIMBING AGAIN: nothing of the lament rings into the next run.
//   6. THE HOOKS: the game's fall, impact and scoreboard call what they must.
//   7. THE LEVEL: the loop 1 to 4.5 LU under the climb, its peak no higher.
//
// Sections 2-5 drive the engine as the game does at a death -- lament() at the catch,
// resetKeys() and landLament() at the impact, landLament() at the scoreboard (the hooks
// render/gamesounds.js installs), the scoreboard's intensity 0 (main.js's frame loop) --
// through a recording AudioContext (tools/engine-render.mjs), and check what came out.
//
//   node tools/test-lament.mjs

import {
  installRecorder, renderContext, loudness, peak, rms, dB, SR, playDeath, fallSeconds,
} from './engine-render.mjs';

installRecorder();
const {
  Audio, freq, pitchesOf, stopsOf, stopRatio, voicesOf, KEY_BANDS, TEMPO_MIN, LAMENT_FADE, LAMENT_GRID,
  HANDOVER_TAIL, STOP_RELEASE, LANDING_LEAD, LANDING_CUT,
} = await import('../src/render/audio.js');
const { TRACKS } = await import('../src/render/tracks.js');
const { STAGES, stageEntry, stageAt } = await import('../src/game/stages.js');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const sum = (v) => v.reduce((s, n) => s + n[1], 0);
const midiOf = (n) => Math.round(12 * Math.log2(freq(n) / 440)) + 69;
const pc = (k) => ((k % 12) + 12) % 12;
const names = (n) => pitchesOf(n);
const G = TRACKS.gameover;
const CLIMB = STAGES.map((s) => s.track);
const VOICES = ['lead', 'bass', 'choir', 'brass'];
const F = 1 / 60;

/** A voice as notes with their place in the music: { n, d, at } (at in sixteenths). */
const notesOf = (v) => { let p = 0; return v.map(([n, d]) => { const at = p; p += d; return { n, d, at }; }); };
/** The note of `v` sounding at `pos`, if one starts at or covers it. */
const noteAt = (v, pos) => notesOf(v).find((x) => pos >= x.at && pos < x.at + x.d) || null;

/**
 * Report a check's problems, and then run it on each of its broken versions: every one must
 * be caught, by the check that is there for it, or the check is not doing its job.
 */
function judged(label, problems, mutants, okMessage) {
  const before = bad;
  for (const p of problems) fail(`${label}: ${p}`);
  const caught = [];
  for (const [what, run] of mutants) {
    let got;
    try { got = run(); } catch (e) { got = [`threw ${e.message}`]; }
    if (!got.length) fail(`${label} does not see it when ${what}`);
    else caught.push(what);
  }
  if (bad === before) ok(`${okMessage}${mutants.length ? `; and it fails ${mutants.length} broken version${mutants.length === 1 ? '' : 's'}: ${caught.join('; ')}` : ''}`);
}

// ===================================================================================
// 1. THE PIECE
// ===================================================================================
/** Every problem with a lament written as `T`, each tagged with the check that found it. */
function pieceProblems(T) {
  const out = [];
  const say = (check, m) => out.push({ check, m });
  const INTRO = (T.intro || 0) * 16, LAND = (T.landing || 0) * 16, LOOP = T.loop * 16;
  const tonic = pc(midiOf(T.tonic + '4'));
  const sixteenth = 60 / (T.bpm * TEMPO_MIN) / 4;
  const loopOf = (v) => notesOf(v).filter((x) => x.at >= INTRO).map((x) => ({ ...x, at: x.at - INTRO }));

  // length: the fall, the stab and the loop, to the sixteenth, in every voice, with a note
  // starting where the stab does (where the engine sends every voice when he lands) and
  // where the loop does (where each comes round to). The loop long enough to sit under a
  // scoreboard and short enough to be one piece; the fall a bar that outlasts the longest
  // fall, so the stab never comes on its own before he lands.
  for (const k of VOICES) {
    if (!T[k]) { say('length', `no ${k}`); continue; }
    if (sum(T[k]) !== INTRO + LOOP) say('length', `${k} is ${sum(T[k])} sixteenths, not the ${INTRO} of the fall and the stab and the ${LOOP} of the loop`);
    const starts = notesOf(T[k]).map((x) => x.at);
    if (!starts.includes(INTRO)) say('length', `${k} has no note where the loop starts (${INTRO})`);
    if (!starts.includes(LAND)) say('length', `${k} has no note where the stab starts (${LAND}), so the landing has nowhere to send it`);
  }
  if (T.loop < 8) say('length', `the loop is ${T.loop} bars; at least 8 were asked for`);
  const loopSecs = LOOP * sixteenth;
  if (loopSecs > 45) say('length', `the loop is ${loopSecs.toFixed(1)}s as heard, too long to be heard as one`);
  if (T.intro !== 2 || T.landing !== 1) say('length', `the intro is ${T.intro} bars with the landing at ${T.landing}: the fall is bar 1 and the stab bar 2`);
  const fallBar = LAND * (60 / T.bpm / 4);
  const longest = fallSeconds(1e9) - LAMENT_FADE;
  if (fallBar < longest) say('length', `the fall bar is ${fallBar.toFixed(2)}s at the written tempo, shorter than the longest fall after the cut (${longest.toFixed(2)}s)`);

  // drone: no pitch held on and on, round the seam as well, as heard at the scoreboard's
  // tempo. The music box never past 2.5 s (the rule since the first lament closed on 4.9 s
  // of one note); a chord of the organ or the choir 4 s; the organ pedal two bars.
  const LIMIT = { lead: 2.5, choir: 4, brass: 4, bass: 8 };
  for (const k of VOICES) {
    if (!T[k]) continue;
    const loop = loopOf(T[k]);
    let best = 0, run = 0, prev = null;
    for (const x of [...loop, ...loop]) {
      const key = x.n === null ? null : names(x.n).join(' ');
      if (key !== null && key === prev) run += x.d; else run = key === null ? 0 : x.d;
      prev = key;
      best = Math.max(best, Math.min(run, LOOP));
    }
    if (best * sixteenth > LIMIT[k]) say('drone', `${k} holds one ${k === 'lead' ? 'pitch' : 'pitch or chord'} for ${(best * sixteenth).toFixed(1)}s as heard, over ${LIMIT[k]}s`);
  }
  const longLead = Math.max(...T.lead.filter(([n]) => n).map(([, d]) => d));
  if (longLead > 8) say('drone', `the lead holds a note of ${longLead} sixteenths, longer than a half note`);

  // fall: tension that tightens until the landing. The pedal creeps up by semitones (at
  // least four steps) as a heartbeat -- rests between the beats -- whose beats come closer
  // together; the music box falls, every note under the last; there is a cluster (two
  // pitches a semitone apart) in the choir; and the organ's manual holds its breath: its
  // first sound is the stab.
  {
    const bassFall = notesOf(T.bass).filter((x) => x.at < LAND);
    const pitched = bassFall.filter((x) => x.n);
    const runs = [];
    for (const x of pitched) {
      const m = midiOf(names(x.n)[0]);
      if (!runs.length || runs[runs.length - 1].m !== m) runs.push({ m, at: x.at });
    }
    const steps = runs.slice(1).map((r, i) => r.m - runs[i].m);
    if (steps.length < 4 || steps.some((s) => s !== 1)) say('fall', `the pedal in the fall moves ${steps.join(' ') || 'nowhere'} semitones, not a creep up by semitones (four or more)`);
    const gaps = runs.slice(1).map((r, i) => r.at - runs[i].at);
    if (gaps.length < 3 || gaps.some((g, i) => i && g > gaps[i - 1]) || !(gaps[gaps.length - 1] < gaps[0])) {
      say('fall', `the heartbeat's beats are ${gaps.join(', ')} sixteenths apart: not quickening`);
    }
    if (bassFall.filter((x) => !x.n).length < 3) say('fall', 'the pedal in the fall has no rests between its beats: a drone, not a heartbeat');
    const leadFall = notesOf(T.lead).filter((x) => x.at < LAND && x.n).map((x) => midiOf(names(x.n)[0]));
    if (leadFall.length < 4 || leadFall.some((m, i) => i && m >= leadFall[i - 1])) say('fall', 'the music box does not fall through the fall, each note under the last');
    const cluster = notesOf(T.choir).some((x) => x.at < LAND && x.n && names(x.n).map(midiOf).some((m, i, a) => a.includes(m + 1)));
    if (!cluster) say('fall', 'no cluster (a semitone) in the choir during the fall');
    if (notesOf(T.brass).some((x) => x.at < LAND && x.n)) say('fall', 'the organ plays during the fall: its first chord should be the stab');
  }

  // stab: at the landing every voice strikes together; the organ's chord is a diminished
  // seventh (or a full minor chord) of four notes or more; the pedal is on the tonic -- the
  // Toccata's diminished chord over the tonic pedal.
  {
    const chord = notesOf(T.brass).find((x) => x.at === LAND && x.n);
    const pcs = chord ? [...new Set(names(chord.n).map((n) => pc(midiOf(n))))] : [];
    const dim7 = pcs.length === 4 && pcs.every((p) => pcs.includes(pc(p + 3)));
    const minor = pcs.some((r) => pcs.includes(pc(r + 3)) && pcs.includes(pc(r + 7)));
    if (!chord || names(chord.n).length < 4 || !(dim7 || minor)) say('stab', `the organ at the landing plays ${chord ? JSON.stringify(chord.n) : 'nothing'}, not a diminished seventh or minor chord of four or more`);
    for (const k of ['lead', 'bass', 'choir']) {
      const x = notesOf(T[k]).find((y) => y.at === LAND);
      if (!x || !x.n) say('stab', `${k} does not strike with the stab`);
    }
    const ped = notesOf(T.bass).find((x) => x.at === LAND && x.n);
    if (!ped || pc(midiOf(names(ped.n)[0])) !== tonic) say('stab', 'the pedal under the stab is not the tonic');
  }

  // toccata: after the stab's chord, the organ alone in single notes -- the mordent (a
  // note, the step under it, the note) and then the plunge, four or more steps down by
  // tones and semitones to the leading tone -- and the loop opens on the tonic.
  {
    const run = notesOf(T.brass).filter((x) => x.at > LAND && x.at < INTRO && x.n && names(x.n).length === 1).map((x) => midiOf(x.n));
    let found = false;
    for (let i = 0; i + 6 < run.length + 1 && !found; i++) {
      const [x, y, z] = run.slice(i, i + 3);
      if (!(z === x && (x - y === 1 || x - y === 2))) continue;
      const tail = [z];
      for (let j = i + 3; j < run.length && tail[tail.length - 1] - run[j] >= 1 && tail[tail.length - 1] - run[j] <= 2; j++) tail.push(run[j]);
      if (tail.length >= 5 && pc(tail[tail.length - 1]) === pc(tonic - 1)) found = true;
    }
    if (!found) say('toccata', 'no mordent and plunge to the leading tone in the organ after the stab');
    const first = notesOf(T.bass).find((x) => x.at === INTRO);
    if (!first || !first.n || pc(midiOf(names(first.n)[0])) !== tonic) say('toccata', 'the plunge does not land on the tonic where the loop opens');
  }

  // suspensions: in the loop's organ, round the seam, a chord tone held while the harmony
  // moves under... strictly, a note of one chord that is dissonant with the bass -- the
  // 4th, the 9th, the 7th -- and in the next chord, over the same bass, has gone down a
  // step to the 3rd, the octave, the 6th. Prepared: the chord before already had it.
  // Each kind at least once prepared.
  {
    const organ = loopOf(T.brass).filter((x) => x.n);
    const bassAt = (at) => { const b = noteAt(loopOf(T.bass).map((x) => [x.n, x.d]), at); return b && b.n ? midiOf(names(b.n)[0]) : null; };
    const found = { '4-3': 0, '9-8': 0, '7-6': 0 };
    for (let i = 0; i < organ.length; i++) {
      const W = organ[(i + organ.length - 1) % organ.length], X = organ[i], Y = organ[(i + 1) % organ.length];
      const b = bassAt(X.at), b2 = bassAt(Y.at);
      if (b === null || b !== b2) continue;
      const xs = names(X.n).map(midiOf), ys = names(Y.n).map(midiOf), ws = names(W.n).map(midiOf);
      for (const n of xs) {
        if (ys.includes(n) || !ws.includes(n)) continue;
        const to = ys.find((m) => n - m === 1 || n - m === 2);
        if (to === undefined) continue;
        const iv = pc(n - b), iv2 = pc(to - b);
        if (iv === 5 && (iv2 === 3 || iv2 === 4)) found['4-3']++;
        if (iv === 2 && iv2 === 0) found['9-8']++;
        if ((iv === 10 || iv === 11) && (iv2 === 8 || iv2 === 9)) found['7-6']++;
      }
    }
    const missing = Object.keys(found).filter((k) => !found[k]);
    if (missing.length) say('suspensions', `no prepared ${missing.join(', ')} suspension in the loop's organ`);
  }

  // home: the cadence is held off until the seam. In the loop the pedal is on the tonic
  // only in its first bar; the loop's last bar stands on the dominant with the leading tone
  // in the organ; and the music box ends on the leading tone or the dominant and comes round
  // on the tonic.
  {
    const bassLoop = loopOf(T.bass).filter((x) => x.n);
    const early = bassLoop.filter((x) => pc(midiOf(names(x.n)[0])) === tonic && x.at >= 16);
    if (early.length) say('home', `the pedal comes home to the tonic at ${early[0].at / 16 + 1} bars into the loop, before the seam`);
    const lastBass = bassLoop[bassLoop.length - 1];
    if (!lastBass || pc(midiOf(names(lastBass.n)[0])) !== pc(tonic + 7)) say('home', 'the loop does not end on the dominant in the pedal');
    const lastOrgan = loopOf(T.brass).filter((x) => x.n).pop();
    if (!lastOrgan || !names(lastOrgan.n).some((n) => pc(midiOf(n)) === pc(tonic - 1))) say('home', 'the organ\'s last chord has no leading tone');
    const leadLoop = loopOf(T.lead).filter((x) => x.n);
    const l = pc(midiOf(names(leadLoop[leadLoop.length - 1].n)[0]));
    if (l !== pc(tonic - 1) && l !== pc(tonic + 7)) say('home', 'the music box ends the loop off the leading tone and the dominant');
    if (pc(midiOf(names(leadLoop[0].n)[0])) !== tonic) say('home', 'the music box does not come round on the tonic');
  }

  // musicbox: the lead is the high line: struck and left to ring (pluck), and every note of
  // it in the loop over the top of the organ chord sounding under it.
  {
    const v = voicesOf(T).find((x) => x.name === 'lead');
    if (!v || v.env !== 'pluck') say('musicbox', `the lead is played ${v ? v.env : 'not at all'}, not struck and left to ring`);
    const organ = loopOf(T.brass).map((x) => [x.n, x.d]);
    const under = loopOf(T.lead).filter((x) => x.n).filter((x) => {
      const o = noteAt(organ, x.at);
      return o && o.n && midiOf(names(x.n)[0]) <= Math.max(...names(o.n).map(midiOf));
    });
    if (under.length) say('musicbox', `${under.length} notes of the music box sound under the organ's top, the first ${under[0].n} at ${under[0].at}`);
  }

  // organ: the manual (brass) a square on the organ envelope with a second rank an octave
  // up, detuned, for the chorus between them; the pedal (bass) on the organ envelope with
  // its octave.
  {
    const vs = Object.fromEntries(voicesOf(T).map((v) => [v.name, v]));
    const up = (v) => stopsOf(v).find((s) => s.semi === 12);
    const m = vs.brass;
    if (!m || m.env !== 'organ' || m.type !== 'square' || !up(m) || !up(m).cents) say('organ', 'the manual is not a square organ with a detuned octave rank');
    const p = vs.bass;
    if (!p || p.env !== 'organ' || !up(p)) say('organ', 'the pedal is not on the organ envelope with its octave');
  }

  // call: the Duke's call turned over -- a note, down a fourth, the semitone or tone above
  // and back, down to the octave below where it began, in the call's 3:1:2:2 -- at least once
  // a loop, played by the music box: the thread from the climb's music into this one.
  {
    const loop = loopOf(T.lead).filter((x) => x.n);
    let fallen = 0;
    for (let i = 0; i + 4 < loop.length; i++) {
      const [a, b, c, d, e] = loop.slice(i, i + 5);
      const u = a.d / 3;
      if (!(u === 1 || u === 2) || b.d !== u || c.d !== 2 * u || d.d !== 2 * u) continue;
      const [p0, p1, p2, p3, p4] = [a, b, c, d, e].map((x) => midiOf(names(x.n)[0]));
      if (p0 - p1 === 5 && (p2 - p1 === 1 || p2 - p1 === 2) && p3 === p1 && p0 - p4 === 12) fallen++;
    }
    if (!fallen) say('call', 'the call turned over is not in the loop');
  }
  return out;
}

{
  // Broken versions of the piece, each with what it breaks. The piece is copied and one
  // thing changed.
  const LOOP0 = G.intro * 16;
  const at = (v, pos) => { let p = 0; for (let i = 0; i < v.length; i++) { if (p === pos) return i; p += v[i][1]; } return -1; };
  const mut = (check, what, change) => [`${what} (${check})`, () => {
    const T = structuredClone(G);
    change(T);
    return pieceProblems(T).filter((p) => p.check === check).map((p) => p.m);
  }];
  const loopBar = (v, bar) => at(v, LOOP0 + bar * 16);
  const MUTANTS = [
    mut('length', 'a bass note a sixteenth long', (T) => { T.bass[T.bass.length - 1][1] += 1; }),
    mut('length', 'the choir held across the stab', (T) => { T.choir.splice(0, 3, [T.choir[1][0], 12], [T.choir[2][0], 20]); }),
    mut('drone', 'the call held on one pitch', (T) => { const i = loopBar(T.lead, 0); for (let k = i; k < i + 5; k++) T.lead[k][0] = 'E6'; }),
    mut('fall', 'the pedal on E through the fall', (T) => { for (const x of T.bass) if (x[0] && sum(T.bass.slice(0, T.bass.indexOf(x))) < 16) x[0] = 'E2'; }),
    mut('fall', 'the organ playing in the fall', (T) => { T.brass[0] = [['B3', 'C4'], 16]; }),
    mut('stab', 'the stab one note', (T) => { T.brass[at(T.brass, 16)][0] = 'D#3'; }),
    mut('toccata', 'the plunge climbing', (T) => { const i = at(T.brass, 16); for (let k = i + 4; k < i + 9; k++) T.brass[k][0] = ['E4', 'F#4', 'G4', 'A4', 'B4'][k - i - 4]; }),
    mut('suspensions', 'every suspension resolved before it sounds', (T) => {
      for (const v of [T.brass, T.choir]) {
        for (const [bar, from, to] of [[0, 'F#4', 'E4'], [3, 'B3', 'A#3'], [5, 'E4', 'D#4']]) {
          const i = loopBar(v, bar);
          if (i >= 0 && Array.isArray(v[i][0])) v[i][0] = v[i][0].map((n) => (n === from ? to : n)).sort((x, y) => midiOf(x) - midiOf(y));
        }
      }
    }),
    mut('home', 'the pedal home in the fifth bar', (T) => { T.bass[loopBar(T.bass, 4)][0] = 'E2'; }),
    mut('musicbox', 'the music box two octaves down', (T) => { T.lead = T.lead.map(([n, d]) => [n && n.replace(/\d$/, (o) => String(Number(o) - 2)), d]); }),
    mut('organ', 'the organ a plain sawtooth', (T) => { T.mix.brass = { type: 'sawtooth', env: 'gate', gain: T.mix.brass.gain }; }),
    mut('call', 'the call bent out of shape', (T) => { T.lead[loopBar(T.lead, 0) + 2][0] = 'D6'; }),
  ];
  const problems = pieceProblems(G).map((p) => `[${p.check}] ${p.m}`);
  const heard = G.loop * 16 * (60 / (G.bpm * TEMPO_MIN) / 4);
  judged('the piece', problems, MUTANTS,
    `the piece: a fall bar and a stab that play once and a loop of ${G.loop} bars (${heard.toFixed(1)}s as heard); the fall tightens, the stab a ` +
    `diminished seventh over the tonic pedal and the Toccata's plunge, prepared 4-3, 9-8 and 7-6 suspensions, home only round the seam, the music box over the organ, the call fallen`);
}

// ===================================================================================
// The engine, watched: every oscillator it starts is tagged with the track, the voice, the
// written note and the stop (rank) that asked for it, by walking each voice's part from
// where it was to where it got to in each schedule() call. Nothing is moved between the
// two inside one call; the landing moves voices between calls.
// ===================================================================================
function tagged(a) {
  const schedule = a.schedule.bind(a);
  a.schedule = (voices, clock, ...rest) => {
    const was = voices.map((v) => [v.i, v.pos]);
    const n0 = a.ctx.oscs.length;
    const r = schedule(voices, clock, ...rest);
    const oscs = a.ctx.oscs.slice(n0);
    const track = voices === a.voices ? a.track : a.outgoing && voices === a.outgoing.voices ? a.outgoing.track : '?';
    let j = 0;
    voices.forEach((v, vi) => {
      let [i, pos] = was[vi];
      while (pos < v.pos - 1e-9) {
        const [note, dur] = v.part[i];
        for (const name of pitchesOf(note)) {
          for (const s of stopsOf(v)) { if (oscs[j]) Object.assign(oscs[j], { track, voice: v.name, written: name, rank: s }); j++; }
        }
        pos += dur;
        i = i + 1 < v.part.length ? i + 1 : v.loopAt;
      }
    });
    if (j !== oscs.length) throw new Error(`the tagger followed ${j} oscillators of ${oscs.length}`);
    return r;
  };
  return a;
}
/** An Audio for playDeath, tagged, and broken by `mutate` if given. */
const engineWith = (mutate) => function () { const a = tagged(new Audio()); if (mutate) mutate(a); return a; };
const hz = (o) => o.frequency.events[0][1];
// The lament's oscillators that sound, in the order they start: one stopped at or before its
// start (a fall note the landing stopped before it began) plays nothing.
const lamentOscs = (ctx) => ctx.oscs.filter((o) => o.track === 'gameover' && o.t0 !== undefined && o.t1 > o.t0 + 1e-9).sort((x, y) => x.t0 - y.t0 || 0);

// ===================================================================================
// 2. THE KEY IT IS PLAYED IN
// ===================================================================================
//
// THE RULE: the lament's tonic is the tonic the climb was sounding when it was cut -- the
// theme's own, plus the rung of the key ladder its zones had reached -- in the octave within
// -6..+5 semitones of where it is written. Every stage, every rung; the fall 1.3 s into the
// theme, the impact 2.45 s later. What is checked is what the engine PLAYED: every
// oscillator of the lament, of every voice and every organ rank, from the cut to five
// seconds past the landing, must be its written note times its rank moved by exactly that
// much; and the music box, from the stab on, must play the score's notes in the score's
// order -- the stab bar, then the loop, round and round -- which a landing sent to the
// wrong place, or a loop come round to the fall, would not. The theme's tonic is read off
// its own first bass note, not off the table the engine uses.
function keyFromCutRule(soundingPc, home) {
  const k = pc(soundingPc - home);
  return k > 5 ? k - 12 : k;
}
function keyProblems(mutate = null, short = false) {
  const out = [];
  const home = pc(midiOf(G.tonic + '4'));
  const LAND = G.landing * 16, INTRO = G.intro * 16;
  const leadNotes = notesOf(G.lead).filter((x) => x.n);
  const fromStab = leadNotes.filter((x) => x.at >= LAND);
  const loopNotes = leadNotes.filter((x) => x.at >= INTRO);
  /**
   * The music box from the stab on, `count` pitches: the stab bar, then the loop over and
   * over, a chord's pitches lowest first (the order the engine starts them in).
   */
  const expectAfter = (count) => {
    const e = [];
    for (let i = 0; e.length < count; i++) {
      const x = i < fromStab.length ? fromStab[i] : loopNotes[(i - fromStab.length) % loopNotes.length];
      e.push(...names(x.n).map(freq));
    }
    return e;
  };
  const death = (entry, b, after, skip = false) => {
    const a = tagged(new Audio());
    if (mutate) mutate(a);
    a.init();
    a.startClimb(entry);
    a.setKey(KEY_BANDS[b]);
    const ctx = a.ctx;
    let t = 0;
    const step = (until, fn) => { while (t < until - 1e-9) { t += F; ctx.currentTime = t; if (fn) fn(); a.pump(); } };
    step(1.3, () => a.setIntensity(0.35, F));
    a.lament();                          // game.onFallStart
    if (skip) {
      step(1.3 + 0.9);
      a.landLament();                    // the scoreboard, reached by Space during the fall
    } else {
      step(1.3 + 2.45);
      a.resetKeys();                     // game.onImpact
      a.landLament();
    }
    const stab = a.landing && a.landing.at;
    const bus = a.bus;                   // the music from the stab on; the fall's are let go
    step(t + after, () => a.setIntensity(0, F));
    const said = a.transpose;
    a.stopMusic();
    return { oscs: lamentOscs(ctx), said, stopped: a.transpose, stab, bus };
  };
  const check = (label, r, want, least, liveAfter) => {
    if (r.said !== want) out.push(`${label}: the engine says the music is at ${r.said} while the lament plays at ${want}`);
    if (r.stopped !== liveAfter) out.push(`${label}: once the music stops the engine says ${r.stopped}, not the live key (${liveAfter})`);
    const ratio = Math.pow(2, want / 12);
    const off = r.oscs.find((o) => Math.abs(hz(o) / (freq(o.written) * stopRatio(o.rank) * ratio) - 1) > 1e-6);
    if (off) {
      const got = 12 * Math.log2(hz(off) / (freq(off.written) * stopRatio(off.rank)));
      out.push(`${label}: the ${off.voice}'s ${off.written} played ${hz(off).toFixed(1)} Hz, ${got.toFixed(2)} semitones from the score, not ${want}`);
      return;
    }
    // From the stab on, on the buses the stab plays on: the fall's notes queued just past the
    // landing are on the fall's, let go under it, and are not heard.
    const lead = r.oscs.filter((o) => o.voice === 'lead' && o.t0 >= r.stab - 1e-6 && o.out && o.out.out === r.bus).map(hz);
    if (lead.length < least) { out.push(`${label}: only ${lead.length} music box notes after the stab`); return; }
    const exp = expectAfter(lead.length);
    const wrong = lead.findIndex((f, i) => Math.abs(f / (exp[i] * ratio) - 1) > 1e-6);
    if (wrong >= 0) {
      out.push(`${label}: music box note ${wrong + 1} after the stab played ${lead[wrong].toFixed(1)} Hz where the score has ` +
        `${(exp[wrong] * ratio).toFixed(1)} -- the landing or the loop went to the wrong place`);
    }
  };
  let cases = 0, notes = 0;
  const seen = new Set();
  for (const stage of STAGES) {
    const theme = TRACKS[stage.track];
    const themeTonic = pc(midiOf(names(theme.bass.find(([n]) => n)[0])[0]));
    let entry = 0;
    while (stageAt(entry) !== stage) entry += 50;
    entry = stageEntry(entry);
    const rungs = short ? [KEY_BANDS.indexOf(Math.max(...KEY_BANDS))] : KEY_BANDS.map((_, i) => i);
    for (const b of rungs) {
      const want = keyFromCutRule(themeTonic + KEY_BANDS[b], home);
      const r = death(entry, b, 5);
      check(`${stage.track} at rung ${b} (+${KEY_BANDS[b]})`, r, want, 8, 0);
      cases++; notes += r.oscs.length; seen.add(want);
    }
    if (short) continue;
    // Round the loop and into it again: the stab plays once, the loop comes back to its own
    // first bar, and the key never moves.
    const r = death(entry, 4, 36);
    check(`${stage.track} at rung 4, round the loop`, r, keyFromCutRule(themeTonic + KEY_BANDS[4], home), fromStab.length + 3, 0);
    notes += r.oscs.length;
  }
  // A skipped fall, which never lands: the scoreboard lands the stab, in the same key, held.
  // Nothing reset the live key (no impact), so once the music stops it is the rung's again.
  {
    const want = keyFromCutRule(pc(midiOf(TRACKS.below.tonic + '4')) + KEY_BANDS[4], home);
    let entry = 0;
    const r = death(entry, 4, 8, true);
    check('a skipped fall in below at +7', r, want, 6, KEY_BANDS[4]);
  }
  return { out, cases, notes, seen };
}
{
  const r = keyProblems();
  const MUTANTS = [
    ['the landing drops the lament into the live key', () => keyProblems((a) => {
      const land = a.landLament.bind(a);
      a.landLament = function () { land(); this.pinned = null; this.applyKey(); };
    }, true).out],
    ['the landing sends the voices to the loop instead of the stab', () => keyProblems((a) => {
      const land = a.landLament.bind(a);
      a.landLament = function () {
        const L = this.landing;
        if (L) L.pos = (TRACKS.gameover.intro) * 16;
        land();
      };
    }, true).out],
    ['the lament fixed in E minor', () => keyProblems((a) => {
      const start = a.startSet.bind(a);
      a.startSet = function (...args) { start(...args); if (this.track === 'gameover') { this.pinned = 0; this.applyKey(); } };
    }, true).out],
  ];
  judged('the key', r.out, MUTANTS,
    `${r.cases} deaths (3 stages x ${KEY_BANDS.length} rungs of the key ladder) and a skipped fall, ${r.notes} lament oscillators, every voice and rank: ` +
    `each in the key the climb was cut in, through the impact's resetKeys() and the landing, played at ${[...r.seen].sort((x, y) => x - y).join(' ')} semitones; ` +
    'the music box in the score\'s order from the stab on, round the loop')
}

// ===================================================================================
// 3. THE STAB ON THE IMPACT
// ===================================================================================
//
// Deaths from the ground floor to the pit's cap -- falls of 1.0 to 2.45 s -- and one cut
// short by Space. The organ is silent through the fall, so its first chord IS the stab,
// read off the notes the engine played rather than off anything it says: it must be the
// stab bar's chord, in the lament's key, starting LANDING_LEAD after the frame the impact
// asked for it (a skip: the frame the scoreboard came up), which is at most a frame and
// LANDING_LEAD after the impact itself, and never more than STAB_LATE_MAX. The fall must be
// gone under it: its buses silent FALL_GONE_MAX after the stab (LANDING_CUT is inside
// it), and what the fall's notes add to the render from then on
// more than 60 dB under the music. It must be HEARD -- the 0.3 s after it at least 3 LU
// over the 0.3 s before -- and peak within a decibel of the climb themes.
/**
 * A track played by the engine from its top at a steady `intensity`, measured between two
 * places in its music (sixteenths from the top): loudness, peak and rms.
 */
function measureTrack(name, intensity, fromPos, toPos) {
  const a = new Audio();
  a.init();
  a.playTrack(name);
  let t = 0, t0 = null, t1 = null;
  while (t1 === null && t < 300) {
    t += F; a.ctx.currentTime = t;
    a.setIntensity(intensity, F);
    a.pump();
    const c = a.clock;
    const pos = c.pos + (t - c.at) / c.sixteenth;
    if (t0 === null && pos >= fromPos) t0 = t - (pos - fromPos) * c.sixteenth;
    if (pos >= toPos) t1 = t - (pos - toPos) * c.sixteenth;
  }
  const buf = renderContext(a.ctx, t1 + 0.3);
  const i0 = Math.round(t0 * SR), i1 = Math.round(t1 * SR);
  a.stopMusic();
  return { lufs: loudness(buf, i0, i1), peak: dB(peak(buf, i0, i1)), rms: dB(rms(buf, i0, i1)) };
}
// The climb themes, a loop each at a steady climb's intensity 0.2, as tools/render-music.mjs
// balances them: what the stab's peak and the lament's level are held against. They do not
// change with the lament, so they are measured once for every check and broken version.
const THEMES = CLIMB.map((n) => ({ name: n, ...measureTrack(n, 0.2, 0, sum(TRACKS[n].lead)) }));
const climbPeak = Math.max(...THEMES.map((x) => x.peak));
// And in absolute terms, not only against the engine's own constants: every check below
// measured the stab against LANDING_LEAD and the fall's release against LANDING_CUT, so
// either constant set to a quarter of a second -- a stab heard well after the splat, or the
// fall ringing on under it -- passed every death. (Found by editing them: LANDING_LEAD 0.25
// passed all five impacts.)
const STAB_LATE_MAX = 0.05;   // s, the stab after the impact at most (LANDING_LEAD 0.03 and a 60 Hz frame)
const FALL_GONE_MAX = 0.05;   // s, the fall's buses silent after the stab at most (LANDING_CUT 0.02)
const DEATHS = [
  // [label, floor, fall starts at (s into the climb), skip after (s) or null]. Early in
  // each theme, at odd places in its bar, because the render runs from the climb's top.
  // The ground floor's fall is the shortest, 0.97 s, and the lament comes in up to 0.57 s
  // of it after the catch: the stab lands 0.4 s into the fall bar (it was not tested
  // before; the shortest here was floor 120's 1.24 s).
  ['below, floor 0 (dazed)', 0, 4.77, null],
  ['below, floor 120 (dazed)', 120, 3.93, null],
  ['below, floor 450', 450, 5.37, null],
  ['below, floor 850', 850, 4.31, null],
  ['above, floor 1250', 1250, 6.05, null],
  ['heavens, floor 2050', 2050, 4.61, null],
  ['below, floor 450, skipped', 450, 5.37, 0.8],
];
function stabProblems(mutate = null, report = null) {
  const out = [];
  const firstChord = notesOf(G.brass).find((x) => x.at === G.landing * 16).n;
  for (const [label, floor, fallAt, skip] of DEATHS) {
    const r = playDeath(engineWith(mutate), { floor, fallAt, until: fallAt + 7, intensity: 0.45, skip });
    const asked = skip === null ? Math.ceil(r.impact / F - 1e-9) * F : Math.ceil(r.dead / F - 1e-9) * F;
    const organ = lamentOscs(r.ctx).filter((o) => o.voice === 'brass');
    if (!organ.length) { out.push(`${label}: the organ never played`); continue; }
    const stab = organ[0].t0;
    const late = stab - asked;
    if (Math.abs(late - LANDING_LEAD) > 1e-6) {
      out.push(`${label}: the stab came ${late.toFixed(3)}s after the ${skip === null ? 'impact' : 'scoreboard'} asked for it, not ${LANDING_LEAD}s`);
    }
    const after = stab - (skip === null ? r.impact : r.dead);
    if (after > STAB_LATE_MAX) out.push(`${label}: the stab came ${after.toFixed(3)}s after the ${skip === null ? 'impact' : 'scoreboard'}, over ${STAB_LATE_MAX}s -- off the splat`);
    const struck = organ.filter((o) => Math.abs(o.t0 - stab) < 1e-9 && o.rank.semi === 0).map((o) => o.written).sort((x, y) => midiOf(x) - midiOf(y));
    if (struck.join() !== names(firstChord).join()) out.push(`${label}: the organ's first chord is ${struck.join(' ')}, not the stab's ${names(firstChord).join(' ')}`);
    // The fall let go: its buses' gain from FALL_GONE_MAX after the stab, and a render
    // without the fall's notes against one with them.
    const fallBuses = [r.lament.bus, r.lament.choirBus];
    for (const g of fallBuses.map((x) => x.gain)) {
      const ev = g.list().filter((e) => e[2] <= stab + FALL_GONE_MAX + 1e-9);
      const last = ev[ev.length - 1];
      if (!last || last[1] > 0.001) { out.push(`${label}: the fall's bus is at ${last ? last[1].toFixed(3) : 'full level'} ${FALL_GONE_MAX}s after the stab`); break; }
    }
    const T = fallAt + 7;
    const full = renderContext(r.ctx, T);
    const every = r.ctx.oscs;
    r.ctx.oscs = every.filter((o) => !(o.out && fallBuses.includes(o.out.out)));
    const clean = renderContext(r.ctx, T);
    r.ctx.oscs = every;
    const i0 = Math.round((stab + FALL_GONE_MAX + 0.01) * SR);
    const residue = dB(rms(full.subarray(i0).map((v, i) => v - clean[i0 + i])));
    const level = dB(rms(clean, i0, full.length));
    if (residue > level - 60) out.push(`${label}: the fall is still sounding ${(level - residue).toFixed(1)} dB under the stab and the loop after it`);
    const n = (s) => Math.round(s * SR);
    const jump = loudness(full, n(stab), n(stab + 0.3)) - loudness(full, n(stab - 0.3), n(stab));
    if (jump < 3) out.push(`${label}: the stab is ${jump.toFixed(1)} LU over the fall just before it -- not heard as a hit`);
    // A hit may reach the climb's own loudest instant, and no more than a decibel past it:
    // the limiter is at -6 dBFS and the music peaks some 17 dB under it.
    const stabPeak = dB(peak(full, n(stab), n(stab + 3.4)));
    if (stabPeak > climbPeak + 1) out.push(`${label}: the stab bar peaks at ${stabPeak.toFixed(1)} dBFS, more than 1 dB over the climb themes' ${climbPeak.toFixed(1)}`);
    if (report) {
      report.push(`${label.split(',')[1].trim()}${skip === null ? `, a ${r.fallSecs.toFixed(2)}s fall` : ''}: +${(stab - (skip === null ? r.impact : r.dead)).toFixed(3)}s, ` +
        `+${jump.toFixed(1)} LU, peak ${stabPeak.toFixed(1)}`);
    }
  }
  return out;
}
{
  const report = [];
  const problems = stabProblems(null, report);
  const MUTANTS = [
    ['nothing lands the stab: the fall plays out to it, as the landing chord used to', () => stabProblems((a) => { a.landLament = () => {}; })],
    ['the stab waits for the lament\'s next beat', () => stabProblems((a) => {
      const land = a.landLament.bind(a);
      let due = null;
      a.landLament = function () {
        const c = this.clock;
        if (!c || !this.landing || this.landing.done) return land();
        const pos = c.pos + (this.ctx.currentTime + LANDING_LEAD - c.at) / c.sixteenth;
        due = c.at + (Math.ceil(pos / 4 - 1e-9) * 4 - c.pos) * c.sixteenth - LANDING_LEAD;
      };
      const pump = a.pump.bind(a);
      a.pump = function () { if (due !== null && this.ctx.currentTime >= due - 1e-9) { due = null; land(); } return pump(); };
    })],
    ['the fall is not let go under the stab', () => stabProblems((a) => {
      const land = a.landLament.bind(a);
      a.landLament = function () {
        land();
        if (this.fallen) for (const g of [this.fallen.bus.gain, this.fallen.choirBus.gain]) { g.cancelScheduledValues(0); g.setValueAtTime(1, 0); }
      };
    })],
    ['the stab struck with the organ 12 dB down', () => {
      const keep = G.mix.brass.gain;
      G.mix.brass.gain = keep / 4;
      try { return stabProblems(); } finally { G.mix.brass.gain = keep; }
    }],
  ];
  judged('the stab', problems, MUTANTS,
    `the stab on the impact, the organ's first chord, ${LANDING_LEAD}s after the call and the fall gone under it: ${report.join('; ')} (the climb peaks at ${climbPeak.toFixed(1)})`);
}

// And sound that first comes up after he has landed -- the first key pressed on the
// scoreboard, or music switched back on in the options opened from it -- starts the lament
// at its stab: main.js asks for the lament and lands it at once, before its first note.
// Every voice's first note is then the stab bar's, all struck together; none of the fall.
function lateProblems(mutate = null) {
  const out = [];
  const a = tagged(new Audio());
  if (mutate) mutate(a);
  a.init();
  a.crossTo('gameover');               // startTrackForState, with nothing playing
  a.landLament();
  for (let t = 0; t < 4;) { t += F; a.ctx.currentTime = t; a.setIntensity(0, F); a.pump(); }
  const oscs = lamentOscs(a.ctx);
  a.stopMusic();
  const t0 = oscs.length ? oscs[0].t0 : NaN;
  for (const k of VOICES) {
    const want = notesOf(G[k]).find((x) => x.at === G.landing * 16).n;
    const first = oscs.filter((o) => o.voice === k);
    const struck = first.filter((o) => Math.abs(o.t0 - first[0].t0) < 1e-9 && o.rank.semi === (stopsOf(voicesOf(G).find((v) => v.name === k))[0].semi || 0)).map((o) => o.written);
    if (!first.length || Math.abs(first[0].t0 - t0) > 1e-9 || struck.join() !== names(want).join()) {
      out.push(`a lament started after the landing opens its ${k} on ${struck.join(' ') || 'nothing'}, not the stab's ${names(want).join(' ')} with the rest`);
    }
  }
  return out;
}
judged('a late start', lateProblems(), [
  ['nothing lands it', () => lateProblems((a) => { a.landLament = () => {}; })],
  // The fall's notes queued for the lament's first instant, let go only through the buses.
  ['the landing leaves the fall\'s queued notes to start', () => lateProblems((a) => {
    const land = a.landLament.bind(a);
    a.landLament = function () { if (this.landing) this.landing.queued = []; land(); };
  })],
],
  'a lament that starts after the landing (the first key on the scoreboard, music switched back on there) opens on its stab, every voice together');

// ===================================================================================
// 3b. THE FALL AS HEARD
// ===================================================================================
//
// Section 1 reads the fall's notes; this listens to them. The fall is heard from the
// lament's first note until the impact lands the stab: 0.4 s of it from the ground floor, up
// to the longest fall less the shortest cut (2.3 s) from floor 654 up. Over that span, from
// FALL_SETTLE on (the lament's swell in, the climb's last tails), through the engine at a
// death with the landing held off: no hole -- no 100 ms more than FALL_HOLE dB under the
// span's own loudness -- and no sag: the second half at least FALL_RISE LU over the first.
//
// The first organ lament passed every check in section 1 and had both. The choir's pad
// envelope let each chord of its cluster die away from three quarters of its length while
// the next swelled in from silence, and that fell in a rest of the heartbeat: 1.3 to 1.6 s
// in, half a second before the impact of every fall from floor 654 up, the music dropped
// 12 dB for 0.3 s and came back 19 LU up 0.3 s before the stab -- a false hit ahead of the
// real one. And its halves measured -41.9 and -42.1 LUFS: the tension that was to tighten
// was flat.
const FALL_SETTLE = 0.25;   // s after the lament's first note before the fall is judged (LAMENT_SWELL)
const FALL_HOLE = 8;        // dB, the deepest 100 ms dip allowed under the span (typ. 4.5 measured)
const FALL_RISE = 0.5;      // LU, the second half's least rise over the first (typ. 1.3 measured)
/** Problems with the fall as heard, for a lament written as `T` (the engine plays TRACKS.gameover). */
function fallProblems(T = G, report = null) {
  const out = [];
  const keep = TRACKS.gameover;
  TRACKS.gameover = T;
  try {
    const heard = fallSeconds(1e9) - LAMENT_FADE;
    for (const [label, floor, fallAt] of [['below, floor 1200', 1200, 4.31], ['heavens, floor 2050', 2050, 4.61]]) {
      const unlanded = engineWith((a) => { a.landLament = () => {}; });
      const r = playDeath(unlanded, { floor, fallAt, until: fallAt + 3, intensity: 0.45 });
      const buf = renderContext(r.ctx, fallAt + 3);
      r.audio.stopMusic();
      const n = (s) => Math.round(s * SR);
      const from = r.cut + FALL_SETTLE, end = r.cut + heard, mid = (from + end) / 2;
      const whole = loudness(buf, n(from), n(end));
      const rise = loudness(buf, n(mid), n(end)) - loudness(buf, n(from), n(mid));
      let low = { v: Infinity, t: 0 };
      for (let t = from; t + 0.1 <= end + 1e-9; t += 0.05) {
        const v = loudness(buf, n(t), n(t + 0.1));
        if (v < low.v) low = { v, t: t - r.cut };
      }
      if (whole - low.v > FALL_HOLE) out.push(`${label}: the fall drops to ${low.v.toFixed(1)} LUFS for 100 ms ${low.t.toFixed(2)}s in, ${(whole - low.v).toFixed(1)} dB under its ${whole.toFixed(1)} -- a hole, not a tightening`);
      if (rise < FALL_RISE) out.push(`${label}: the fall's second half is ${rise >= 0 ? '+' : ''}${rise.toFixed(1)} LU on its first -- it does not build`);
      if (report) report.push(`${label}: ${whole.toFixed(1)} LUFS, the second half ${rise >= 0 ? '+' : ''}${rise.toFixed(1)} LU on the first, the deepest 100 ms ${(whole - low.v).toFixed(1)} dB under, ${low.t.toFixed(2)}s in`);
    }
  } finally {
    TRACKS.gameover = keep;
  }
  return out;
}
{
  const LAND = G.landing * 16;
  // The fall's notes of a voice replaced by `notes` (which fill the same bar).
  const fallOf = (T, k, notes) => { let p = 0, i = 0; while (p < LAND) p += T[k][i++][1]; T[k].splice(0, i, ...notes); };
  const report = [];
  const problems = fallProblems(G, report);
  const MUTANTS = [
    // The first organ lament's fall, note for note: the cluster on the pad envelope in two
    // chords of half a bar, and the heartbeat resting where the pad died away.
    ['the fall as it was first written (the pad\'s hole)', () => {
      const T = structuredClone(G);
      T.mix.choir.env = 'pad';
      fallOf(T, 'choir', [[['E3', 'F3'], 8], [['E3', 'F3', 'A#3'], 8]]);
      fallOf(T, 'bass', [['E2', 1], ['E2', 1], [null, 2], ['F2', 1], ['F2', 1], [null, 2], ['F#2', 1], ['F#2', 1], [null, 1],
        ['G2', 1], ['G2', 1], [null, 1], ['G#2', 1], ['A2', 1]]);
      return fallProblems(T);
    }],
    ['the choir\'s cluster on the pad envelope', () => { const T = structuredClone(G); T.mix.choir.env = 'pad'; return fallProblems(T); }],
    ['the cluster held whole from the first note, not growing', () => {
      const T = structuredClone(G);
      fallOf(T, 'choir', [[['E3', 'F3', 'A#3', 'B3'], 16]]);
      return fallProblems(T);
    }],
  ];
  judged('the fall', problems, MUTANTS, `the fall as heard, from ${FALL_SETTLE}s after the cut to the longest fall's impact: ${report.join('; ')}`);
}

// ===================================================================================
// 4. THE HANDOVER WHEN HE FALLS
// ===================================================================================
//
// Cut down, not two songs on top of each other and not a hole: the climb sags and is cut
// on its own next beat at least LAMENT_FADE after the fall; nothing of it starts after
// that; its buses are silent HANDOVER_TAIL later; and the lament's first note is on the
// cut. Rendered, the music's level through the cut -- 50 ms windows -- never rises over
// the climb's loudest window, and never drops more than 20 dB under the climb's mean
// before the fall. It does drop, by design: past the cut the fall is a heartbeat, a music
// box and a low cluster, coming in at LAMENT_FROM. A hole is what the stage handover used
// to leave, 0.2 s at 23 to 31 dB under.
{
  const before = bad;
  const report = [];
  for (const [track, floor, fallAt] of [['below', 450, 13.37], ['above', 1250, 21.05], ['heavens', 2050, 30.61]]) {
    const r = playDeath(engineWith(null), { floor, fallAt, until: fallAt + 6, intensity: 0.45 });
    const out = r.climb;
    if (!out) { fail(`${track}: no handover when he fell`); continue; }
    const beat = LAMENT_GRID * out.clock.sixteenth;
    if (!(r.cut >= fallAt + LAMENT_FADE - 1e-9 && r.cut <= fallAt + LAMENT_FADE + beat + 1e-9)) {
      fail(`${track}: cut ${(r.cut - fallAt).toFixed(3)}s after the fall, not on the first beat at least ${LAMENT_FADE}s on`);
    }
    if (!Number.isFinite(out.cutPos)) fail(`${track}: the climb was cut by the clock alone, not on a beat of its music`);
    else if (out.cutPos % LAMENT_GRID !== 0) fail(`${track}: the climb was cut ${out.cutPos % LAMENT_GRID} sixteenths off its beat`);
    const climbBus = [out.bus, out.choirBus];
    const late = r.ctx.oscs.filter((o) => o.out && climbBus.includes(o.out.out) && o.t0 >= r.cut - 1e-9);
    if (late.length) fail(`${track}: ${late.length} climb notes start at or after the cut`);
    const first = Math.min(...lamentOscs(r.ctx).map((o) => o.t0));
    if (Math.abs(first - r.cut) > 1e-6) fail(`${track}: the lament's first note is ${(first - r.cut).toFixed(3)}s from the cut`);
    const buf = renderContext(r.ctx, fallAt + 3);
    const win = Math.round(0.05 * SR);
    const level = (t) => dB(rms(buf, Math.round(t * SR), Math.round(t * SR) + win));
    let climbMax = -Infinity, climbMean = 0, n = 0;
    for (let t = fallAt - 3; t < fallAt - 0.05; t += 0.05) { const l = level(t); climbMax = Math.max(climbMax, l); climbMean += Math.pow(10, l / 10); n++; }
    climbMean = 10 * Math.log10(climbMean / n);
    let low = Infinity, high = -Infinity;
    for (let t = fallAt; t < r.cut + 0.6; t += 0.01) { const l = level(t); low = Math.min(low, l); high = Math.max(high, l); }
    if (low < climbMean - 20) fail(`${track}: the music drops to ${(low - climbMean).toFixed(1)} dB under the climb through the cut -- a hole`);
    if (high > climbMax + 0.5) fail(`${track}: the music rises ${(high - climbMax).toFixed(1)} dB over the climb's loudest through the cut -- two songs at once`);
    for (const g of [out.bus.gain, out.choirBus.gain]) {
      const ev = g.list().filter((e) => e[2] <= r.cut + HANDOVER_TAIL + 1e-9);
      const lastEv = ev[ev.length - 1];
      if (!lastEv || lastEv[1] > 0.001) fail(`${track}: the climb's bus is still at ${lastEv && lastEv[1]} after its tail`);
    }
    const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
    report.push(`${track} cut ${(r.cut - fallAt).toFixed(2)}s after the fall, ${sgn(low - climbMean)} to ${sgn(high - climbMean)} dB of the climb's mean`);
  }
  if (bad === before) ok(`the handover at the catch: ${report.join('; ')}`);
}

// ===================================================================================
// 5. WHEN HE CLIMBS AGAIN
// ===================================================================================
//
// Space on the scoreboard: startRun() resets the keys, stops the music and starts the
// climb. stopMusic() used to let the buses go at full level, so every lament note already
// sounding rang on to its end -- the choir's chord up to 3.2 s into the new march, in the
// key the lament had taken from the last climb. Rendered with and without the lament's
// notes (the fall's and the stab's and the loop's), what the lament adds once STOP_RELEASE
// is over must be silence: 60 dB or more under the march.
{
  const before = bad;
  const report = [];
  // Floor 1350 is ABYSS at +3: the lament in F minor, a semitone off the march it gives way to.
  for (const [floor, fallAt, after] of [[450, 13.37, 9.0], [1350, 24.18, 15.1]]) {
    const r = playDeath(engineWith(null), { floor, fallAt, until: fallAt + after, intensity: 0.45 });
    const a = r.audio, ctx = r.ctx, T = fallAt + after;
    const mine = (o) => o.track === 'gameover';
    a.resetKeys();                       // startRun()
    a.stopMusic();
    a.startClimb(0);
    for (let t = T; t < T + 3;) { t += F; ctx.currentTime = t; a.setIntensity(0.1, F); a.pump(); }
    const ringing = ctx.oscs.filter((o) => mine(o) && o.t0 !== undefined && o.t1 > T);
    const tail = Math.max(0, ...ringing.map((o) => o.t1 - T));
    const full = renderContext(ctx, T + 3);
    const every = ctx.oscs;
    ctx.oscs = every.filter((o) => !mine(o));
    const march = renderContext(ctx, T + 3);
    ctx.oscs = every;
    a.stopMusic();
    const i0 = Math.round((T + STOP_RELEASE + 0.01) * SR);
    const residue = dB(rms(full.subarray(i0).map((v, i) => v - march[i0 + i])));
    const level = dB(rms(march, Math.round((T + 0.5) * SR), march.length));
    if (residue > level - 60) {
      fail(`floor ${floor}: the lament is still sounding ${(level - residue).toFixed(1)} dB under the new climb ` +
        `${(STOP_RELEASE + 0.01).toFixed(2)}s after he climbs again (notes ringing up to ${tail.toFixed(1)}s on)`);
    }
    report.push(`floor ${floor}, ${ringing.length} notes that would ring up to ${tail.toFixed(1)}s, ${(level - residue).toFixed(0)} dB under the march`);
  }
  if (bad === before) ok(`when he climbs again the lament is gone in ${STOP_RELEASE}s: ${report.join('; ')}`);
}

// ===================================================================================
// 6. THE HOOKS
// ===================================================================================
//
// Everything above drives the engine the way the game does, so it would all go on passing
// if the game stopped doing it. Read the handlers, wherever they are under src/, and hold
// them to it: the fall calls lament() with no stopMusic() and no resetKeys() ahead of it
// (a reset before the cut drops the climb's last notes, and the key the lament takes, to
// the home key); the impact calls landLament() -- after resetKeys(), which the held key
// ignores -- so the stab lands with the body; and the scoreboard's arrival calls it too, so
// a skipped fall lands its stab when the scores come up instead of playing on under them.
function hookProblems(files) {
  const out = [];
  const bodies = (re) => {
    const found = [];
    for (const { file, text } of files) {
      for (const m of text.matchAll(re)) found.push({ file, body: text.slice(m.index, text.indexOf('};', m.index)) });
    }
    return found;
  };
  const falls = bodies(/\.onFallStart\s*=\s*\(/g);
  if (!falls.length) out.push('nothing under src/ assigns game.onFallStart, so nothing hands the music over when he falls');
  for (const { file, body } of falls) {
    const lamentAt = body.search(/audio\.lament\(\)/);
    const resetAt = body.search(/resetKeys\(\)/);
    if (lamentAt < 0) out.push(`${file}: the fall's handler does not call audio.lament()`);
    if (/stopMusic\(\)/.test(body)) out.push(`${file}: the fall's handler stops the music`);
    if (lamentAt >= 0 && resetAt >= 0 && resetAt < lamentAt) out.push(`${file}: the fall's handler resets the keys before lament()`);
  }
  const impacts = bodies(/\.onImpact\s*=\s*\(/g);
  if (!impacts.length) out.push('nothing under src/ assigns game.onImpact');
  for (const { file, body } of impacts) {
    if (!/audio\.landLament\(\)/.test(body)) out.push(`${file}: the impact does not land the lament's stab (audio.landLament())`);
  }
  // The scoreboard: the block that plays its toll, once a run.
  let board = 0;
  for (const { file, text } of files) {
    const i = text.indexOf('audio.sfxGameOver(');
    const from = text.lastIndexOf('STATE.DEAD', i);
    if (i < 0 || from < 0) continue;
    board++;
    const block = text.slice(from, i);
    if (!/audio\.landLament\(\)/.test(block)) out.push(`${file}: the scoreboard's arrival does not land the stab, so a skipped fall plays on under the scores`);
  }
  if (!board) out.push('nothing under src/ plays the scoreboard\'s toll');
  // main.js starting the lament late -- the first key on the scoreboard, or music switched
  // back on in the options opened from it -- lands it at once, so it opens on the stab.
  const main = files.find((f) => f.file === 'src/main.js');
  const fn = (name) => {
    const i = main ? main.text.indexOf(`function ${name}(`) : -1;
    return i < 0 ? '' : main.text.slice(i, main.text.indexOf('\n}', i));
  };
  if (!/crossTo\('gameover'\)[\s\S]*landLament\(\)/.test(fn('startTrackForState'))) out.push('src/main.js: a lament started after the landing (startTrackForState) is not landed, so it plays a fall that is over');
  if (!/setMusic\([\s\S]*landLament\(\)/.test(fn('applySettings'))) out.push('src/main.js: music switched back on over the scoreboard (applySettings) restarts the lament from its fall');
  return out;
}
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push({ file: path.relative(root, p).split(path.sep).join('/'), text: fs.readFileSync(p, 'utf8') });
    }
  };
  walk(path.join(root, 'src'));
  const edit = (from, to) => files.map((f) => ({ ...f, text: f.text.split(from).join(to) }));
  const MUTANTS = [
    ['the fall stops the music', () => hookProblems(edit('audio.lament();', 'audio.stopMusic(); audio.lament();'))],
    ['nothing lands the stab', () => hookProblems(edit('audio.landLament();', ''))],
    ['only the impact lands it', () => hookProblems(files.map((f) => ({ ...f, text: f.text.replace(/(STATE\.DEAD[\s\S]*?)audio\.landLament\(\);/, '$1') })))],
    ['main.js starts a late lament from its fall', () => hookProblems(files.map((f) => (f.file === 'src/main.js' ? { ...f, text: f.text.split('audio.landLament()').join('audio.pump()') } : f)))],
  ];
  const where = files.filter((f) => /\.onImpact\s*=/.test(f.text)).map((f) => f.file).join(', ');
  judged('the hooks', hookProblems(files), MUTANTS,
    `${where} hands the music over at the catch (lament(), no stop, no reset ahead of it) and lands the stab at the impact and at the scoreboard`);
}

// ===================================================================================
// 7. HOW LOUD IT IS
// ===================================================================================
//
// At the soundtrack's level, a little under the climb and never over it: the lament's
// loop, at the scoreboard's intensity 0, between 1 and 4.5 LU under the climb themes --
// under the quietest of them by at least 1, under their mean by no more than 4.5 -- and
// its peak no higher than theirs. The themes at a steady climb's intensity 0.2, as
// tools/render-music.mjs balances them; all four through the engine itself. The lament
// first composed at the soundtrack's default gains measured 1.5 LU OVER the climb's mean,
// and the first lament 1.1 LU over.
function levelProblems(report = null) {
  const out = [];
  const themes = THEMES;
  // The loop's second time round: the tempo settled at the scoreboard's, the choir at rest.
  const INTRO = G.intro * 16, LOOP = G.loop * 16;
  const lament = measureTrack('gameover', 0, INTRO + LOOP, INTRO + 2 * LOOP);
  const mean = 10 * Math.log10(themes.reduce((s, x) => s + Math.pow(10, x.lufs / 10), 0) / themes.length);
  const quietest = Math.min(...themes.map((x) => x.lufs));
  const loudestPeak = Math.max(...themes.map((x) => x.peak));
  if (lament.lufs > quietest - 1) out.push(`the lament is ${lament.lufs.toFixed(1)} LUFS, less than 1 LU under the quietest climb theme (${quietest.toFixed(1)})`);
  if (lament.lufs < mean - 4.5) out.push(`the lament is ${lament.lufs.toFixed(1)} LUFS, more than 4.5 LU under the climb's ${mean.toFixed(1)}`);
  if (lament.peak > loudestPeak) out.push(`the lament peaks at ${lament.peak.toFixed(1)} dBFS, over the climb's ${loudestPeak.toFixed(1)}`);
  if (report) {
    report.push(`the lament ${lament.lufs.toFixed(1)} LUFS (rms ${lament.rms.toFixed(1)}, peak ${lament.peak.toFixed(1)} dBFS), ` +
      `${(mean - lament.lufs).toFixed(1)} LU under the climb's ${mean.toFixed(1)} ` +
      `(${themes.map((x) => `${x.name} ${x.lufs.toFixed(1)}`).join(', ')}; peaks to ${loudestPeak.toFixed(1)})`);
  }
  return out;
}
{
  const report = [];
  const problems = levelProblems(report);
  const scaled = (what, k) => [what, () => {
    const keep = Object.fromEntries(VOICES.map((v) => [v, G.mix[v].gain]));
    for (const v of VOICES) G.mix[v].gain = Math.min(1, keep[v] * k);
    try { return levelProblems(); } finally { for (const v of VOICES) G.mix[v].gain = keep[v]; }
  }];
  const MUTANTS = [
    scaled('every voice 3 dB up', Math.pow(10, 3 / 20)),
    scaled('every voice 3 dB down', Math.pow(10, -3 / 20)),
    ['the organ twice as loud', () => {
      const keep = G.mix.brass.gain;
      G.mix.brass.gain = keep * 2;
      try { return levelProblems(); } finally { G.mix.brass.gain = keep; }
    }],
  ];
  judged('the level', problems, MUTANTS, `level: ${report.join('')}`);
}

console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
