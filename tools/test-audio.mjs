// Drive the real music scheduler against a stub AudioContext.
//
// test-music.mjs checks the note DATA. This checks the engine that plays it, because
// the failure that matters here is silent: the three voices loop INDEPENDENTLY, each at
// its own length, so if one were ever a different number of sixteenths from the others
// they would drift apart by a fraction of a bar every time round. Not a crash, not an
// exception, and not audible for the first minute -- just a track that is subtly wrong
// twenty minutes into a run.
//
// It was written when the climb track briefly carried pools of alternate arrangements
// that swapped in at each loop point, which made the drift much easier to cause. The
// pools are gone; the check is not, because the property it guards never depended on
// them. It now runs over each of the three climb themes, and then over the thing the
// themes brought with them: the handover from one to the next when the zone changes
// stage, which runs on the audio clock and is only right if it is right to the sample.
//
// The stub implements only what audio.js touches, and records what it is asked to do:
// every oscillator's start time, pitch and the bus it ends up on, and every automation
// event on every gain. Timers are faked too: nothing here waits on the real clock, and
// a timer left behind by the engine is caught rather than fired at random.

const scheduled = [];
let recording = true;

class Param {
  constructor(v = 0) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); return this; }
  cancelScheduledValues(t) { this.events.push(['cancel', 0, t]); return this; }
}
const node = (extra = {}) => ({
  out: null, connect(n) { this.out = n; }, disconnect() { this.out = null; }, ...extra,
});

class StubContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node(); this.sampleRate = 48000; }
  createGain() { return node({ gain: new Param(1) }); }
  createBiquadFilter() { return node({ type: '', frequency: new Param(1000), Q: new Param(1) }); }
  createDynamicsCompressor() {
    return node({
      threshold: new Param(), knee: new Param(), ratio: new Param(),
      attack: new Param(), release: new Param(),
    });
  }
  createOscillator() {
    const o = node({
      type: '', frequency: new Param(440),
      start(t) { if (recording) scheduled.push({ t, osc: o }); }, stop() {},
    });
    return o;
  }
  // The effects' noise: a buffer, and a source that plays it.
  createBuffer(ch, n) { const d = new Float32Array(n); return { duration: n / this.sampleRate, getChannelData: () => d }; }
  createBufferSource() { return node({ buffer: null, loop: false, playbackRate: new Param(1), start() {}, stop() {} }); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

globalThis.window = { AudioContext: StubContext };

// Fake timers. The scheduler's interval is driven by hand below; a setTimeout is kept in
// a queue so a test can fire everything the engine left behind and see what it does.
const pendingTimeouts = [];
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
globalThis.setTimeout = (fn) => { pendingTimeouts.push(fn); return pendingTimeouts.length; };
const flushTimeouts = () => { while (pendingTimeouts.length) pendingTimeouts.shift()(); };

const {
  Audio, freq, keyForStep, pitchesOf, VOICE_NAMES, HANDOVER_FADE, HANDOVER_SWELL, HANDOVER_FROM, HANDOVER_TAIL,
  LAMENT_FADE, LOOPS, KEY_MIN_BARS, THEME_MIN_LOOPS,
} = await import('../src/render/audio.js');
const { TRACKS } = await import('../src/render/tracks.js');
const { STAGES, stageEntry } = await import('../src/game/stages.js');
const { THEMES, themeIndexFor, CYCLE_FLOORS } = await import('../src/game/themes.js');
const { KEY_BANDS } = await import('../src/render/audio.js');
const KEYS = [...new Set(KEY_BANDS)];

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

const sum = (v) => v.reduce((s, n) => s + n[1], 0);

/** A fresh engine with a running context and no timer of its own. */
function engine() {
  const a = new Audio();
  a.init();
  return a;
}
/** Advance the stub clock to `t`, pumping every 20 ms the way the real interval does. */
function runTo(a, t) {
  while (a.ctx.currentTime < t - 1e-9) {
    a.ctx.currentTime = Math.min(t, a.ctx.currentTime + 0.02);
    a.pump();
  }
}

/**
 * Run a track forward for `seconds` of the context's clock, pumping as the real
 * scheduler does, and report what happened to each voice.
 */
function run(name, seconds) {
  scheduled.length = 0;
  const a = engine();
  a.playTrack(name);

  const wraps = a.voices.map(() => 0);
  // WHEN each voice came round, on the audio clock: the tempo is constant here, so the
  // top of the loop is the voice's next note time less the sixteenths it is into it.
  const wrapAt = a.voices.map(() => []);

  const STEP = 0.02;
  for (let t = 0; t < seconds; t += STEP) {
    a.ctx.currentTime = t;
    const before = a.voices.map((v) => v.i);
    a.pump();
    a.voices.forEach((v, i) => {
      if (v.i < before[i]) { wraps[i]++; wrapAt[i].push(v.at - v.starts[v.i] * a.sixteenth); }
    });
  }
  const at = a.voices.map((v) => v.at);
  const longest = a.voices.map((v) => Math.max(...v.part.map((n) => n[1])));
  const voices = a.voices.length;
  const sixteenth = a.sixteenth;
  a.stopMusic();   // clears a.voices, so read everything off it first
  return { voices, wraps, wrapAt, at, longest, sixteenth, notes: scheduled.length };
}

// --- every climb theme, and the menu, over several loops -----------------------------
// The menu has four voices since it gained its brass, and its loop point is the one a
// player sits through: the song handing back to the fanfare, every voice at once.
const CLIMB = STAGES.map((s) => s.track);
for (const name of ['menu', ...CLIMB]) {
  const t = TRACKS[name];
  const loopSecs = sum(t.lead) * (60 / t.bpm / 4);
  const LOOPS = 4;
  const r = run(name, loopSecs * LOOPS + 1);

  if (r.notes < 100) fail(`${name}: only ${r.notes} notes scheduled over ${LOOPS} loops -- the scheduler stalled`);

  // THE ONE THAT MATTERS. Every voice is the same number of sixteenths, so over the same
  // stretch of the clock every one must come round the same number of times. A voice that
  // wrapped more or fewer times than its neighbours is a voice of the wrong length, and
  // from then on the riff, the chug and the pad are playing different bars.
  if (new Set(r.wraps).size !== 1) {
    fail(`${name}: voices wrapped ${r.wraps.join('/')} times over the same ${LOOPS} loops -- they have drifted apart`);
  }

  // Comparing each voice's `at` directly would NOT be this check, which is worth writing
  // down because it looks like it would. The scheduler runs each voice until it passes
  // the lookahead horizon, so a voice overshoots by up to ONE NOTE -- and the choir's
  // notes are sixteen sixteenths where the bass's are one. A spread of several sixteenths
  // at an arbitrary sample point is the lookahead being granular, not the music drifting.
  const spread = (Math.max(...r.at) - Math.min(...r.at)) / r.sixteenth;
  const allowed = Math.max(...r.longest);
  if (spread > allowed + 1e-6) {
    fail(`${name}: voices are ${spread.toFixed(2)} sixteenths apart, more than the longest note (${allowed})`);
  }
  // The two checks above only see a voice that is out by more than a note or so a loop:
  // a bass ONE sixteenth long still comes round four times in four loops and a second,
  // and sits 4 sixteenths off the lead, well inside a choir note. So the real one is
  // when each voice came round, which must be the same instant for every voice, loop
  // after loop.
  let worst = 0;
  for (let k = 0; k < Math.min(...r.wrapAt.map((w) => w.length)); k++) {
    const times = r.wrapAt.map((w) => w[k]);
    worst = Math.max(worst, (Math.max(...times) - Math.min(...times)) / r.sixteenth);
  }
  if (worst > 1e-6) {
    fail(`${name}: the voices come round up to ${worst.toFixed(2)} sixteenths apart -- one is a different length`);
  }
  if (new Set(r.wraps).size === 1 && spread <= allowed + 1e-6 && worst <= 1e-6 && r.notes >= 100) {
    ok(`${name.padEnd(8)} ${r.notes} notes over ${LOOPS} loops, every voice came round ${r.wraps[0]} times ` +
      `at the same instant, lookahead spread ${spread.toFixed(1)}/${allowed} sixteenths`);
  }
}

// --- the voices keep together while the tempo wanders -------------------------------
//
// The check above runs at a steady tempo, and a steady tempo hid this: each voice used
// to keep its own clock, a running sum of its note lengths at the tempo of the moment
// each note was queued. With the tempo moving, a sixteen-sixteenth pad kept one tempo
// for its whole bar while the lead's sixteenths followed the live one, and the
// difference did not come back -- it walked. Ten minutes of the heavens with the
// intensity wandering put its lead 0.96 s off the harp and its choir 1.2 s off. The
// voices now read one song clock, so notes that fall at the same place in the music
// must start at the same instant, however long the theme plays and however the tempo
// goes. Five minutes of each theme, the intensity set to a new random level every 2-6 s
// and eased per frame as the game eases it; every note tagged with its voice and its
// place in the music as it is queued.
{
  const before = bad;
  recording = false;
  const report = [];
  for (const name of [...CLIMB, 'menu']) {
    let seed = 20260923;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const a = engine();
    a.playTrack(name);
    let tag = null;
    const heard = a.voices.map(() => new Map());   // place in the music -> start time
    a.voices.forEach((v, vi) => {
      const len = sum(v.part);
      let loop = 0, last = -1;
      v.part = new Proxy(v.part, {
        get(target, k) {
          if (typeof k === 'string' && /^\d+$/.test(k)) {
            const i = Number(k);
            if (i < last) loop++;
            last = i;
            tag = { vi, pos: loop * len + v.starts[i], queued: a.ctx.currentTime };
          }
          return target[k];
        },
      });
    });
    const make = a.ctx.createOscillator.bind(a.ctx);
    let early = 0, backwards = 0;
    const lastStart = a.voices.map(() => -Infinity);
    const lastTag = a.voices.map(() => null);
    a.ctx.createOscillator = () => {
      const o = make();
      const start = o.start;
      o.start = (t) => {
        if (tag) {
          heard[tag.vi].set(tag.pos, t);
          if (t < tag.queued - 1e-9) early++;
          // The pitches of one chord are one note: only a NEW note must start later.
          if (tag !== lastTag[tag.vi]) {
            if (t <= lastStart[tag.vi]) backwards++;
            lastStart[tag.vi] = t;
            lastTag[tag.vi] = tag;
          } else if (t !== lastStart[tag.vi]) backwards++;
        }
        start.call(o, t);
      };
      return o;
    };
    let target = 0.3, next = 0, lo = Infinity, hi = 0;
    while (a.ctx.currentTime < 300) {
      if (a.ctx.currentTime >= next) { target = rnd(); next = a.ctx.currentTime + 2 + 4 * rnd(); }
      a.ctx.currentTime += 1 / 60;
      a.setIntensity(target, 1 / 60);
      lo = Math.min(lo, a.tempo); hi = Math.max(hi, a.tempo);
      a.pump();
    }
    // Every place in the music where two or more voices start a note.
    const places = new Map();
    heard.forEach((m) => m.forEach((t, pos) => { if (!places.has(pos)) places.set(pos, []); places.get(pos).push(t); }));
    let worst = 0, shared = 0;
    for (const ts of places.values()) {
      if (ts.length < 2) continue;
      shared++;
      worst = Math.max(worst, Math.max(...ts) - Math.min(...ts));
    }
    if (worst > 1e-9) fail(`${name}: with the tempo wandering x${lo.toFixed(2)}-x${hi.toFixed(2)}, notes that fall together start up to ${(worst * 1000).toFixed(0)} ms apart`);
    if (early) fail(`${name}: ${early} notes were queued to start before the moment they were queued`);
    if (backwards) fail(`${name}: ${backwards} notes start no later than the note before them in their voice`);
    if (shared < 500) fail(`${name}: only ${shared} places where voices meet in five minutes -- the check saw too little`);
    report.push(`${name} ${shared}`);
    a.stopMusic();
  }
  recording = true;
  if (bad === before) {
    ok(`five minutes of each theme with the tempo wandering: every note that falls with another starts with it (${report.join(', ')} places)`);
  }
}

// The written frequencies of a track, so a scheduled note can be traced back to the
// theme it came from and the key it was played in.
const written = (name) => new Set(VOICE_NAMES.flatMap((k) => (TRACKS[name][k] || []))
  .flatMap(([n]) => pitchesOf(n)).map((n) => freq(n).toFixed(4)));
const inKey = (hz, name, semis) => written(name).has((hz / Math.pow(2, semis / 12)).toFixed(4));
const oscHz = (s) => s.osc.frequency.events[0][1];
const oscBus = (s) => s.osc.out && s.osc.out.out;

// --- a chord is one note ---------------------------------------------------------
//
// The menu's brass plays block chords, and its song and its choir two and three notes at
// once: a note that is an array of names. Every name has to sound, each its own
// oscillator on its voice's bus, all from the same instant on the same envelope -- a
// chord whose pitches were queued a lookahead tick apart would be an arpeggio, and one
// that dropped a name would be a different chord. One whole loop of the menu at its
// written tempo, every oscillator traced back to the note that asked for it.
{
  const before = bad;
  scheduled.length = 0;
  const a = engine();
  a.playTrack('menu');
  const t = TRACKS.menu;
  const top = a.voices[0].at - a.voices[0].starts[a.voices[0].i] * a.sixteenth;
  const loopSecs = sum(t.lead) * a.sixteenth;
  runTo(a, top + loopSecs + 0.5);
  const inLoop = scheduled.filter((s) => s.t < top + loopSecs - 1e-6);
  const envOf = (s) => JSON.stringify(s.osc.out.gain.events.map(([k, v, at]) => [k, v, +(at - s.t).toFixed(9)]));
  let chords = 0, wrong = 0;
  for (const v of a.voices) {
    let pos = 0;
    for (const [n, d] of v.part) {
      const at = top + pos * a.sixteenth;
      pos += d;
      const want = pitchesOf(n);
      if (!want.length) continue;
      const got = inLoop.filter((s) => Math.abs(s.t - at) < 1e-9 && oscBus(s) === v.dest && s.osc.type === v.type);
      const hz = got.map(oscHz).sort((x, y) => x - y).map((f) => f.toFixed(3));
      const same = hz.join() === want.map((p) => freq(p)).sort((x, y) => x - y).map((f) => f.toFixed(3)).join();
      const oneEnvelope = new Set(got.map(envOf)).size === 1;
      if (!same || !oneEnvelope) {
        if (!wrong++) fail(`menu.${v.name} at ${at.toFixed(3)}s: asked for ${want.join(' ')}, sounded ${hz.join(' ')} Hz${oneEnvelope ? '' : ' on different envelopes'}`);
      }
      if (want.length > 1) chords++;
    }
  }
  const pitches = VOICE_NAMES.flatMap((k) => t[k] || []).reduce((s, [n]) => s + pitchesOf(n).length, 0);
  if (inLoop.length !== pitches) fail(`one loop of the menu started ${inLoop.length} oscillators for ${pitches} written pitches`);
  const first = inLoop.filter((s) => Math.abs(s.t - top) < 1e-9);
  const onRiff = first.filter((s) => oscBus(s) === a.bus).length;
  const onChoir = first.filter((s) => oscBus(s) === a.choirBus).length;
  a.stopMusic();
  if (bad === before) {
    ok(`menu: ${chords} chords in a loop, every pitch its own oscillator on one envelope from one instant ` +
      `(${pitches} in all); the first beat starts ${onRiff} on the riff bus (brass and bass) and ${onChoir} on the choir's`);
  }
}

/**
 * A gain's value at time `t` from the automation the stub recorded, as WebAudio computes
 * it: a cancel drops every event at or after its time, a 'set' holds from its time, and
 * a ramp runs from the previous event's value and time to its own.
 */
function levelAt(param, t) {
  let ev = [];
  for (const e of param.events) {
    if (e[0] === 'cancel') ev = ev.filter((x) => x[2] < e[2]);
    else ev.push(e);
  }
  ev.sort((x, y) => x[2] - y[2]);
  let k = -1;
  while (k + 1 < ev.length && ev[k + 1][2] <= t) k++;
  const v0 = k >= 0 ? ev[k][1] : param.value;
  const t0 = k >= 0 ? ev[k][2] : 0;
  const nx = ev[k + 1];
  if (!nx || nx[0] === 'set') return v0;
  const x = (t - t0) / (nx[2] - t0);
  return nx[0] === 'lin' ? v0 + (nx[1] - v0) * x : v0 * Math.pow(nx[1] / v0, x);
}

// --- the handover at a stage change ------------------------------------------
//
// BELOW at floor 850 is DOWNTOWN, its fifth zone, at +7 (the fifth rung of its ladder).
// Floor 900 is CITADEL, the first zone of THE WORLD ABOVE: the handover starts there, the
// old theme fades for at least HANDOVER_FADE and is cut on its own next bar line, and the
// new one starts from its first bar at exactly that instant, in its own home key, swelling
// in. BELOW has played more than its loop by then, as it always has in the first lap (the
// stage is 900 floors); it used to be handed over ten seconds in here, which a theme is
// no longer allowed (THEME_MIN_LOOPS, tools/test-steady.mjs).
{
  const before = bad;
  scheduled.length = 0;
  const a = engine();
  a.startClimb(850);
  if (a.track !== STAGES[0].track) fail(`a run at floor 850 started on '${a.track}', not '${STAGES[0].track}'`);
  if (a.key !== 7) fail(`floor 850 of BELOW is key ${a.key}, not +7`);
  // When the theme's first bar began. playTrack pumps once on the spot, so the lead is
  // already a note or two in; step back to its top.
  const lead0 = a.voices[0];
  const start = lead0.at - lead0.starts[lead0.i] * a.sixteenth;
  const barSecs = 16 * a.sixteenth;
  runTo(a, 60.3);
  a.followClimb(860);
  if (a.outgoing || a.keyNext) fail('a floor inside the zone the run was already in changed the music');
  runTo(a, 61.13);

  const oldBus = a.bus;
  const oldChoirBus = a.choirBus;
  const called = a.ctx.currentTime;
  a.followClimb(900);
  const T = a.outgoing && a.outgoing.end;
  if (a.track !== STAGES[1].track) fail(`floor 900 plays '${a.track}', not '${STAGES[1].track}'`);
  if (!a.outgoing) fail('no handover at the stage change');
  if (a.key !== 0) fail(`the new stage opened at key ${a.key}, not its home key`);
  if (a.outgoing && a.outgoing.transpose !== 7) fail(`the outgoing theme was frozen at ${a.outgoing.transpose}, not the +7 it was playing in`);

  if (T) {
    const fade = T - called;
    if (fade < HANDOVER_FADE - 1e-9) fail(`the old theme faded for ${fade.toFixed(3)}s, under HANDOVER_FADE`);
    if (fade > HANDOVER_FADE + barSecs + 1e-9) fail(`the old theme faded for ${fade.toFixed(3)}s, more than a bar past HANDOVER_FADE`);
    const bars = (T - start) / barSecs;
    if (Math.abs(bars - Math.round(bars)) > 1e-6) fail(`the cut is ${bars.toFixed(4)} bars into BELOW, not on a bar line`);

    // The old theme's buses ramp down to HANDOVER_FROM AT the cut and to silence
    // HANDOVER_TAIL after it; the new theme's rise from HANDOVER_FROM at the cut to full
    // HANDOVER_SWELL later. They used to ramp to silence at the cut itself, which
    // rendered as a gap before every new theme: 0.2 s at -57 to -65 dB against -34.
    for (const [label, g] of [['riff', oldBus && oldBus.gain], ['choir', oldChoirBus && oldChoirBus.gain]]) {
      const [meet, gone] = g ? g.events.slice(-2) : [];
      if (!(meet && meet[0] === 'lin' && meet[1] === HANDOVER_FROM && Math.abs(meet[2] - T) < 1e-9
        && gone && gone[0] === 'lin' && gone[1] <= 0.001 && Math.abs(gone[2] - (T + HANDOVER_TAIL)) < 1e-9)) {
        fail(`the old ${label} bus does not meet the new one at ${HANDOVER_FROM} on the cut: ${JSON.stringify([meet, gone])}`);
      }
    }
    // No gap: from the zone's arrival to the end of the swell, the bus of whichever theme
    // is playing notes -- the old one before the cut, the new one from it -- never drops
    // under the level the two meet at. (The new bus is read only from the cut: before
    // it no note is on it, and its gain there is just the node's default.)
    const pairs = [[oldBus, a.bus], [oldChoirBus, a.choirBus]];
    let lowest = Infinity, lowAt = 0;
    for (let t = called; t <= T + HANDOVER_SWELL; t += 0.005) {
      for (const [o, n] of pairs) {
        const bus = t < T ? o : n;
        const v = bus ? levelAt(bus.gain, t) : 0;
        if (v < lowest) { lowest = v; lowAt = t; }
      }
    }
    if (lowest < HANDOVER_FROM - 1e-6) {
      fail(`the music drops to ${lowest.toFixed(4)} of full level ${(lowAt - T).toFixed(3)}s from the cut -- a gap, not a handover`);
    }
    for (const [label, g] of [['riff', a.bus && a.bus.gain], ['choir', a.choirBus && a.choirBus.gain]]) {
      const [s0, s1] = g ? g.events : [];
      if (!(s0 && s0[0] === 'set' && s0[1] === HANDOVER_FROM && Math.abs(s0[2] - T) < 1e-9
        && s1 && s1[0] === 'lin' && s1[1] === 1 && Math.abs(s1[2] - (T + HANDOVER_SWELL)) < 1e-9)) {
        fail(`the new ${label} bus does not swell from ${HANDOVER_FROM} at the cut: ${JSON.stringify(g && g.events)}`);
      }
    }
  }
  const newBus = a.bus;
  const newChoirBus = a.choirBus;
  runTo(a, (T || called) + 3);
  if (a.outgoing) fail('the outgoing theme was never let go of');

  // What actually played, note by note.
  const after = scheduled.filter((s) => s.t >= called - 1e-9);
  const olds = after.filter((s) => oscBus(s) === oldBus || oscBus(s) === oldChoirBus);
  const news = after.filter((s) => oscBus(s) === newBus || oscBus(s) === newChoirBus);
  if (!olds.length) fail('the old theme stopped dead at the handover instead of fading');
  if (olds.some((s) => s.t >= T - 1e-9)) fail('the old theme was still being scheduled at or after the cut');
  if (olds.some((s) => !inKey(oscHz(s), STAGES[0].track, 7))) fail('the old theme changed key while it faded');
  if (!news.length) fail('the new theme never started');
  if (news.some((s) => s.t < T - 1e-9)) fail('the new theme started before the cut');
  if (news.some((s) => !inKey(oscHz(s), STAGES[1].track, 0))) fail('the new theme did not open in its home key');
  const firsts = news.filter((s) => Math.abs(s.t - T) < 1e-9).length;
  if (firsts !== a.voices.length) fail(`${firsts} voices of the new theme start on the cut, not all ${a.voices.length}`);
  if (after.length !== olds.length + news.length) fail('notes were scheduled on neither theme\'s bus');
  a.stopMusic();

  if (bad === before) {
    ok(`BELOW -> ABOVE at floor 900: ${(T - called).toFixed(2)}s fade to a bar line ` +
      `(${Math.round((T - start) / barSecs)} bars in), ${olds.length} old notes at +7 all before it, ` +
      `${news.length} new notes from it in the home key, all ${firsts} voices on the downbeat`);
  }
}

// --- a handover while the tempo is moving ---------------------------------------------
//
// The cut is the old theme's bar line, worked out at the tempo of the moment the zone
// arrives. The run's intensity keeps driving the tempo through the fade, so the old
// theme has to hold the tempo it had, or it reaches that bar line early (speeding up)
// and starts its next bar just ahead of the new theme's downbeat, or late (slowing
// down) and has its last bar cut short.
//
// And every voice has to stop at that bar line in the MUSIC. The voices' own clocks
// disagree whenever the tempo moves -- each note is timed at the tempo of the moment it
// is queued, so a pad queued at the top of its bar keeps that tempo for the whole bar
// while the lead's sixteenths follow the live one -- and a bass or choir running ahead
// of the lead used to begin the old theme's next bar just before the new downbeat. So
// the tempo is swung first, the way a run swings it, to put the clocks out of step.
// Driven at the game's frame rate through setIntensity, both ways, at both stage changes,
// after the theme has played its loop (it cannot be handed over sooner). The tempo moves
// at most TEMPO_BAR_MAX a bar now, so the swing is a long one.
for (const [from, to, floorFrom, floorTo] of [[0.1, 1, 0, 900], [1, 0, 0, 900], [0.1, 1, 900, 1500], [1, 0, 900, 1500]]) {
  const before = bad;
  scheduled.length = 0;
  const a = engine();
  a.startClimb(floorFrom);
  const drive = (until, i) => {
    while (a.ctx.currentTime < until - 1e-9) {
      a.ctx.currentTime = Math.min(until, a.ctx.currentTime + 1 / 60);
      a.setIntensity(i, 1 / 60);
      a.pump();
    }
  };
  drive(40, to);
  drive(66, from);
  a.followClimb(floorTo);
  const out = a.outgoing;
  if (!out) { fail(`floor ${floorTo}: no handover after 66 s of the theme`); continue; }
  const T = out.end;
  const called = a.ctx.currentTime;
  const tempoThen = a.tempo;
  drive(T + 0.3, to);
  const moved = a.tempo / tempoThen;
  const label = `floor ${floorTo}, tempo x${moved.toFixed(2)} during the fade`;
  // The lead, which the cut was read off: on its bar line, to the sample.
  const lead = out.voices[0];
  const bar = lead.starts[lead.i];
  if (Math.abs(lead.at - T) > 1e-6 || bar % 16 !== 0) {
    fail(`${label}: the old lead stopped ${(lead.at - T).toFixed(3)}s from the cut, ${bar % 16} sixteenths off its bar line`);
  }
  // Every other voice: at that bar line or short of it (one whose clock is behind is cut
  // by time), never past it.
  for (const v of out.voices.slice(1)) {
    const len = v.part.reduce((s, n) => s + n[1], 0);
    let past = (((v.starts[v.i] - bar) % len) + len) % len;
    if (past > len / 2) past -= len;
    if (past > 0) fail(`${label}: the old ${v.name} went ${past} sixteenths into the bar after the cut`);
  }
  const olds = scheduled.filter((s) => s.t >= called - 1e-9 && (oscBus(s) === out.bus || oscBus(s) === out.choirBus));
  if (olds.some((s) => s.t >= T - 1e-9)) fail(`${label}: the old theme played past the cut`);
  a.stopMusic();
  if (bad === before) {
    ok(`${label} (${(T - called).toFixed(2)}s): the old lead ends on its bar line at the cut, and no voice goes past it`);
  }
}

// --- a death in the middle of a handover ------------------------------------------
//
// The old crossTo started the next track from a setTimeout. A death inside that window
// stopped the music and started the lament -- and then the timer fired and put the climb
// back on over the game-over screen. Here the fall starts half a second before the stage
// handover's cut, and then a second and a half before it, and main.js is followed as it
// is now: lament() when he falls (it used to be stopMusic()), then resetKeys() and
// crossTo('gameover') at the impact. The lament comes in on the old theme's first beat at
// least LAMENT_FADE after the fall -- not on the bar line the stage handover was waiting
// for, up to three seconds off -- the next stage's theme, cued for that bar line, never
// sounds, and nothing is left behind.
for (const early of [0.5, 1.5]) {
  const before = bad;
  scheduled.length = 0;
  const a = engine();
  a.startClimb(0);
  runTo(a, 58.2);                    // past BELOW's loop, so the stage handover is not held
  a.followClimb(900);
  const T = a.outgoing ? a.outgoing.end : a.ctx.currentTime + HANDOVER_FADE;
  runTo(a, T - early);
  const fell = a.ctx.currentTime;
  const climb = a.outgoing;          // BELOW, still the theme being heard
  const cued = [a.bus, a.choirBus];  // ABOVE, waiting for T
  const beat = 4 * climb.clock.sixteenth;
  a.lament();                        // game.onFallStart
  const cut = a.outgoing ? a.outgoing.end : Infinity;
  const lament = [a.bus, a.choirBus];
  flushTimeouts();                   // anything the engine left behind fires now
  runTo(a, fell + 1.5);
  a.resetKeys();                     // game.onImpact
  a.crossTo('gameover');
  runTo(a, T + 4);
  if (a.track !== 'gameover') fail(`a death mid-handover ended on '${a.track}', not the lament`);
  if (a.outgoing) fail('the handover survived the death');
  if (!(cut >= fell + LAMENT_FADE - 1e-9 && cut <= fell + LAMENT_FADE + beat + 1e-9)) {
    fail(`a fall ${early}s before a stage handover's cut: the lament came in ${(cut - fell).toFixed(2)}s after it, ` +
      `not on the first beat at least ${LAMENT_FADE}s on (a beat is ${beat.toFixed(2)}s)`);
  }
  const after = scheduled.filter((s) => s.t >= fell - 1e-9);
  if (after.some((s) => cued.includes(oscBus(s)))) fail('the next stage\'s theme played after he fell');
  if (after.some((s) => (oscBus(s) === climb.bus || oscBus(s) === climb.choirBus) && s.t >= cut - 1e-9)) {
    fail('the climb played on past the cut, over the lament');
  }
  const late = after.filter((s) => s.t >= cut - 1e-9);
  if (late.some((s) => !lament.includes(oscBus(s)))) fail('something other than the lament played after the cut');
  if (!late.length) fail('the lament never played');
  a.stopMusic();
  if (bad === before) {
    ok(`a death ${early}s before a stage handover's cut: the lament cuts in ${(cut - fell).toFixed(2)}s after the fall` +
      `${cut < T - 1e-9 ? `, ${(T - cut).toFixed(2)}s before that cut` : ', on that same bar line'}, ` +
      'the next stage never sounds, nothing left behind');
  }
}

// --- a run started or resumed at any floor --------------------------------------
//
// The stage is asked of the zone's NAME at that floor, and the key of the zones since
// the run entered the stage. Both are recomputed here the slow way -- walking back one
// floor at a time instead of one zone at a time, and counting the zone boundaries passed
// -- so this is not the code checking itself.
const trackOfFloor = (f) => {
  const zone = THEMES[themeIndexFor(f)].name;
  return STAGES.find((s) => s.zones.includes(zone)).track;
};
{
  const before = bad;
  const floors = [0, 57, 99, 100, 850, 899, 900, 1234, 1499, 1500, 2299, 2300, 2301, 2499,
    3333, 4700, 6900, 8123, 12000, 20001, 46000];
  for (const f of floors) {
    let entry = f, place = 0;
    while (entry > 0 && trackOfFloor(entry - 1) === trackOfFloor(f)) {
      if (themeIndexFor(entry - 1) !== themeIndexFor(entry)) place++;
      entry--;
    }
    if (stageEntry(f) !== entry) fail(`stageEntry(${f}) is ${stageEntry(f)}, walking back says ${entry}`);
    const a = engine();
    a.startClimb(f);
    if (a.track !== trackOfFloor(f)) fail(`a run at floor ${f} starts on '${a.track}', not '${trackOfFloor(f)}'`);
    if (a.key !== keyForStep(place)) fail(`a run at floor ${f}, zone ${place} of its stage, starts at key ${a.key}, not ${keyForStep(place)}`);
    if (a.outgoing) fail(`a run at floor ${f} started with a handover instead of its theme`);
    a.stopMusic();
  }
  if (bad === before) ok(`a run at any of ${floors.length} floors from 0 to ${floors[floors.length - 1]} starts on its stage's theme and key`);
}

// --- the whole climb, floor by floor --------------------------------------------
//
// Three full cycles -- the ordered one and two shuffled -- a floor every quarter second
// (a zone every 50 s, about a loop). This used to hold the theme to the stage map at every
// floor, with a handover exactly where the stage changed. A theme now plays a whole loop
// before the next can take over (THEME_MIN_LOOPS), so in the shuffled cycles the music
// may stay a while with the stage it is in. What still has to hold: every handover goes to
// the theme of the stage the run is in; the first cycle's handovers are exactly where they
// were; and the music is never left on another stage's theme past what the wait allows --
// the theme's loop, KEY_MIN_BARS after a change of key, the fade and a bar to the cut.
{
  const before = bad;
  recording = false;
  const a = engine();
  a.startClimb(0);
  const handed = [];
  const cross = a.crossTo.bind(a);
  let floorNow = 0;
  a.crossTo = (name, ...rest) => { handed.push([floorNow, name]); return cross(name, ...rest); };
  const expectedFirst = [];
  let wrongTo = 0, stale = 0, offLadder = 0, worstBars = 0;
  for (let f = 1; f <= 3 * CYCLE_FLOORS; f++) {
    floorNow = f;
    if (f < CYCLE_FLOORS && trackOfFloor(f) !== trackOfFloor(f - 1)) expectedFirst.push([f, trackOfFloor(f)]);
    runTo(a, a.ctx.currentTime + 0.25);
    const n = handed.length;
    a.followClimb(f);
    if (handed.length > n && handed[n][1] !== trackOfFloor(f) && !wrongTo++) {
      fail(`floor ${f}: handed over to '${handed[n][1]}' in a zone of '${trackOfFloor(f)}'`);
    }
    if (!KEYS.includes(a.key) && !offLadder++) fail(`floor ${f} is at key ${a.key}, not a rung of the ladder`);
    // How long the music has been on a theme the zone does not name, in its own bars.
    const now = a.ctx.currentTime;
    if (a.track !== trackOfFloor(f) && !(a.outgoing && now < a.outgoing.end)) {
      const pos = a.clock.pos + (now - a.clock.at) / a.clock.sixteenth;
      const allowed = LOOPS[a.track].lead * THEME_MIN_LOOPS + 16 * KEY_MIN_BARS + 16 + HANDOVER_FADE / a.clock.sixteenth;
      worstBars = Math.max(worstBars, pos / 16);
      if (pos > allowed && !stale++) fail(`floor ${f}: '${a.track}' still playing ${(pos / 16).toFixed(1)} bars in, in a zone of '${trackOfFloor(f)}'`);
    }
  }
  const first = handed.filter(([f]) => f < CYCLE_FLOORS);
  const same = first.length === expectedFirst.length && first.every(([f, nm], i) => f === expectedFirst[i][0] && nm === expectedFirst[i][1]);
  if (!same) {
    fail(`first cycle: handovers at ${first.map(([f, nm]) => `${f}:${nm}`).join(' ')}; the stage map changes at ` +
      `${expectedFirst.map(([f, nm]) => `${f}:${nm}`).join(' ')}`);
  }
  a.stopMusic();
  recording = true;
  if (bad === before) {
    ok(`${3 * CYCLE_FLOORS} floors: ${handed.length} handovers, each to the stage the run is in, the first cycle's exactly ` +
      `where the stage changes (${first.map(([f, nm]) => `${f} ${nm}`).join(', ')}); on another stage's theme at most ${worstBars.toFixed(1)} bars in`);
  }
}

// --- the live key ------------------------------------------------------------------
// It had two layers that added, the ladder and a companion's lift, and this checked that
// neither cleared the other. A companion no longer moves the key (tools/test-steady.mjs
// holds a real run to that); what is left is one key, set at once by setKey, reset to the
// home key by resetKeys along with any change still waiting for its bar line, and a stage
// change that opens the new theme in its home key.
{
  const before = bad;
  const a = engine();
  a.setKey(5);
  if (a.transpose !== 5) fail(`setKey(5) gave ${a.transpose}`);
  a.resetKeys();
  if (a.transpose !== 0 || a.keyNext) fail(`resetKeys left the key at ${a.transpose}${a.keyNext ? ', with a change waiting' : ''}`);
  a.startClimb(850);
  if (a.transpose !== 7) fail(`DOWNTOWN, BELOW's fifth zone, starts at ${a.transpose}, not +7`);
  runTo(a, 60);
  a.followClimb(900);
  if (a.transpose !== 0) fail(`at the stage change the new theme is at ${a.transpose}, not its home key`);
  if (!a.outgoing || a.outgoing.transpose !== 7) fail('the outgoing theme did not keep its +7');
  a.stopMusic();
  if (bad === before) ok('one live key: setKey, resetKeys (with nothing left waiting), and a stage change opening in the home key while the old theme keeps its own');
}

// --- the milestone fanfare, and the files it asks for ---------------------------
//
// Both went quietly wrong when the callouts moved from hop counts (x5, x10, x20) to
// combo floors (50 to 350). The old rank formula still expected 5 to 20, so every callout
// reached its cap and played the same full stack; and main.js loaded milestone5 to
// milestone100 while the game asked for milestone50 to milestone350. Neither is an
// error anywhere -- one fanfare is as good as another to a crash log -- so this plays
// every real milestone through the engine and records what it would have played. (How
// LOUD each is, and that a recorded sample beats the fanfare, is tools/test-sfx.mjs.)
{
  const { MILESTONES } = await import('../src/game/combo.js');
  const { SAMPLE_NAMES } = await import('../src/render/audio.js');
  const before = bad;
  const m = engine();
  const asked = new Set();
  m.sample = (name) => { asked.add(name); return false; };
  const played = MILESTONES.map((ms) => {
    // Past the effect's shortest gap, or the second is dropped as a repeat.
    m.ctx.currentTime += 3;
    scheduled.length = 0;
    const inst = m.sfxMilestone(ms.x);
    const hz = scheduled.filter((s) => s.osc.type === 'square').map((s) => s.osc.frequency.events[0][1]);
    return { x: ms.x, voices: inst ? inst.srcs.length : 0, root: hz[0], top: Math.max(...hz) };
  });

  // Every milestone its own fanfare: a bigger one than the one before, starting no lower,
  // its first note on or above the last one's -- and the last the biggest of all.
  for (let i = 1; i < played.length; i++) {
    const a = played[i - 1], b = played[i];
    if (!(b.voices > a.voices)) fail(`milestone ${b.x} plays ${b.voices} voices, no more than ${a.x}'s ${a.voices} -- the fanfare has stopped growing`);
    if (!(b.root >= a.root - 1e-6)) fail(`milestone ${b.x} starts on ${b.root.toFixed(1)} Hz, under ${a.x}'s ${a.root.toFixed(1)}`);
  }
  const first = played[0], last = played[played.length - 1];
  if (!(last.root > first.root)) fail(`the last milestone starts no higher than the first (${first.root.toFixed(1)} Hz)`);

  // The files: everything the fanfare asks for is loaded, and nothing loaded is never asked for.
  const listed = new Set(SAMPLE_NAMES);
  for (const n of asked) if (!listed.has(n)) fail(`sfxMilestone asks for '${n}', which is never loaded`);
  for (const n of listed) if (!asked.has(n)) fail(`'${n}' is loaded but no milestone ever asks for it`);

  // And main.js loads THAT list rather than a second one written out by hand, which is
  // how the old names outlived the old milestones.
  const fs = await import('node:fs');
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const imported = main.split('\n').some((l) => l.startsWith('import ')
    && l.includes("'./render/audio.js'") && l.includes('SAMPLE_NAMES'));
  if (!imported || main.includes('const SAMPLE_NAMES') || !main.includes('loadSamples(SAMPLE_NAMES)')) {
    fail('main.js must load SAMPLE_NAMES imported from audio.js, not a list of its own');
  }

  // The game asks the stage map for the climb's theme; a track named where the game is
  // wired to the audio -- main.js, or render/gamesounds.js since the effects moved there --
  // is a track the stage map cannot move.
  const wiring = fs.readFileSync(new URL('../src/render/gamesounds.js', import.meta.url), 'utf8');
  if (/crossTo\('(below|above|heavens|climb)'\)/.test(main + wiring)) {
    fail('main.js or gamesounds.js names a climb theme itself instead of asking startClimb/followClimb');
  }

  if (bad === before) {
    ok(`milestones ${played.map((p) => p.x).join('/')} grow from ${first.voices} voices on ${first.root.toFixed(0)} Hz ` +
      `to ${last.voices} on ${last.root.toFixed(0)} Hz (top ${last.top.toFixed(0)} Hz); all ${listed.size} sample names asked for`);
  }
}

console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
