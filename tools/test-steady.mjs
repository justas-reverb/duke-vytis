// The climb's music changes slowly, and only on the music's own terms.
//
// The user found that the music changed too much, and at random, at times (2026-09-24).
// Measured over the attract bot's run and a human-paced one, it was: a
// companion joining or slipping moved the whole piece into another key the moment it
// happened, mid-phrase; the key stepped every 200 floors, out of step with the zones, onto
// whatever note came next; the tempo followed every burst and pause of the run, up to 35%
// in one bar; and past the first lap a theme could be handed over five bars after it began.
// What is held here, over real runs through render/gamesounds.js onto the real engine:
//
//   1. COMPANIONS do not move the key: no change of key follows a companion joining or
//      slipping that a zone does not account for.
//   2. The key changes ONLY WITH A ZONE, on a BAR LINE: every change of key comes within a
//      bar of a zone arriving, every voice takes it on the same downbeat (no note before
//      that bar line in the new key, none from it in the old), and the zone's chime rings
//      on that downbeat -- every chime rings on a bar line of the music heard.
//   3. NEVER TWO CHANGES OF KEY IN EIGHT BARS (KEY_MIN_BARS), counting a theme's first
//      downbeat as one and a handover's cut as another.
//   4. The TEMPO stays within TEMPO_MIN..TEMPO_MAX and moves no more than TEMPO_BAR_MAX from
//      one bar to the next -- read off the bar lines as played, not the engine's variable.
//   5. NO HANDOVER within THEME_MIN_LOOPS loops of a theme's first downbeat.
//   6. OFF THE CLIMB the tempo is not steered, only settled: the menu and the lament come
//      to rest at TEMPO_MIN within a couple of bars and stay there. The climb's slow easing
//      was first applied to them too, and each sagged 8% over its first 25 s.
//   7. A zone chime queued ON a handover's cut is tuned to the theme that starts there, not
//      the one that stops -- even a rounding error before the cut.
//   8. A PAUSE holds the tempo: the music resumes at the tempo it stopped at, however long
//      the pause screen was up (main.js drives the intensity to 0 all the while).
//
// Everything is read from the notes the scheduler queued, each traced back to the note of
// the score it plays (and so to the key it is in and its place in the music), through the
// recording AudioContext of tools/engine-render.mjs. Then each check is shown to fail
// against a broken engine -- the old behaviour it guards against, put back -- or the suite
// fails: a check that cannot see what it is for is worse than none.
//
//   node tools/test-steady.mjs

import { installRecorder } from './engine-render.mjs';

installRecorder();
const {
  Audio, freq, pitchesOf, stopsOf, stopRatio, keyForStep, LOOPS, TEMPO_MIN, TEMPO_MAX, TEMPO_BAR_MAX, KEY_MIN_BARS,
  THEME_MIN_LOOPS, HANDOVER_FADE, HANDOVER_SWELL, HANDOVER_FROM, easeTempo, tempoTargetFor,
} = await import('../src/render/audio.js');
const { keyOf } = await import('../src/render/sfx.js');
const { TRACKS } = await import('../src/render/tracks.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS } = await import('../src/game/autoplay.js');
const { wireGameAudio } = await import('../src/render/gamesounds.js');
const { STEP } = await import('../src/core/loop.js');
const { stageVisit } = await import('../src/game/stages.js');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const CLIMB = ['below', 'above', 'heavens'];
const PHRASE = KEY_MIN_BARS * 16;          // sixteenths
const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// --- recording what the engine plays --------------------------------------------------------
/**
 * Watch an engine: every note it queues ({ set, voice, pos, t, key }), every handover from
 * one climb theme to another (the outgoing theme's place in the music at the cut), every
 * zone chime. Effects other than the chime are not played: the recording context has no
 * noise, and the music is what is being measured.
 */
function watch(a) {
  const rec = { a, notes: [], handovers: [], chimes: [], zones: [], companions: [], sets: new Map(), end: 0 };
  const setOf = (voices) => {
    let s = rec.sets.get(voices);
    if (!s) {
      const track = voices === a.voices ? a.track : (a.outgoing && voices === a.outgoing.voices ? a.outgoing.track : '?');
      s = { id: rec.sets.size, track, voices: voices.map((v) => v.name) };
      rec.sets.set(voices, s);
    }
    return s;
  };
  const schedule = a.schedule.bind(a);
  a.schedule = (voices, clock, ...rest) => {
    const was = voices.map((v) => [v.i, v.pos]);
    const n0 = a.ctx.oscs.length;
    const r = schedule(voices, clock, ...rest);
    const oscs = a.ctx.oscs.slice(n0);
    const set = setOf(voices);
    let j = 0;
    voices.forEach((v, vi) => {
      let [i, pos] = was[vi];
      while (pos < v.pos - 1e-9) {
        const [note, dur] = v.part[i];
        // A pitch is one oscillator per stop of its voice (the lament's organ ranks sound
        // each pitch twice, an octave apart): one note of the score, keyed off its first rank.
        for (const name of pitchesOf(note)) {
          const stops = stopsOf(v);
          const o = oscs[j];
          j += stops.length;
          rec.notes.push({ set: set.id, track: set.track, voice: v.name, pos, t: o.t0,
            key: Math.round(12 * Math.log2(o.frequency.events[0][1] / (freq(name) * stopRatio(stops[0])))) });
        }
        pos += dur;
        i = i + 1 < v.part.length ? i + 1 : v.loopAt;
      }
    });
    return r;
  };
  const crossTo = a.crossTo.bind(a);
  a.crossTo = (name, ...rest) => {
    const from = a.track;
    const voices = a.voices;
    const r = crossTo(name, ...rest);
    if (CLIMB.includes(from) && CLIMB.includes(name) && name !== from && a.outgoing) {
      rec.handovers.push({ t: a.ctx.currentTime, from, to: name, set: rec.sets.get(voices), cutPos: a.outgoing.cutPos, cut: a.outgoing.end });
    }
    return r;
  };
  const sfx = a.sfx.bind(a);
  a.sfx = (name, params, delay = 0) => {
    if (name !== 'zone') return false;
    const r = sfx(name, params, delay);
    if (r) rec.chimes.push({ asked: a.ctx.currentTime, t: r.start });
    return r;
  };
  return rec;
}

// --- the runs ---------------------------------------------------------------------------------
/**
 * A real Game through the real wiring, as main.js steps it: the simulation at 240 Hz, the
 * intensity and the note pump once a 60 Hz frame. `human` plays the bot in bursts on an
 * ordinary tower, standing still between them, with the rising floor held under him.
 */
function gameRun({ human = false, secs, mutate = null }) {
  Math.random = seeded(0x5eed1234);
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.demo = !human;
  game.newRun(human ? 0x2b0c1d : DEMO_SEEDS[0]);
  const a = new Audio();
  a.init();
  a.rng = seeded(99);
  wireGameAudio(game, a);
  const rec = watch(a);
  const join = game.onCompanionJoin, slip = game.onCompanionSlip;
  game.onCompanionJoin = (c) => { rec.companions.push({ t: a.ctx.currentTime, what: 'join' }); return join(c); };
  game.onCompanionSlip = (c) => { rec.companions.push({ t: a.ctx.currentTime, what: 'slip' }); return slip(c); };
  if (mutate) mutate(a, game);
  a.startClimb(0);
  const hrnd = seeded(777);
  let active = true, left = 4, theme = game.themeIndex, steps = 0;
  while (steps * STEP < secs && game.state === STATE.PLAYING) {
    if (!human) bot.step(game, STEP);
    else {
      left -= STEP;
      if (left <= 0) {
        active = !active;
        left = active ? 2 + 5 * hrnd() : 1.5 + 4 * hrnd();
        if (!active) { input.wantAxis = 0; input.wantJump = false; input.jumpHeld = false; bot.plan = null; }
      }
      if (active) bot.step(game, STEP);
    }
    game.step(STEP);
    if (human) game.riseY = Math.min(game.riseY, game.player.y - 600);
    steps++;
    a.ctx.currentTime = steps * STEP;
    if (game.themeIndex !== theme) { theme = game.themeIndex; rec.zones.push({ t: a.ctx.currentTime, floor: game.run.maxFloor }); }
    if (steps % 4 === 0) {
      if (game.state === STATE.PLAYING) a.setIntensity(game.intensity, 4 * STEP);
      a.pump();
    }
  }
  rec.end = a.ctx.currentTime;
  rec.floor = game.run.maxFloor;
  return rec;
}

/**
 * The engine alone on a climb far faster than anyone climbs -- bursts of 10 to 40 floors a
 * second, a zone every five to fifteen seconds -- through two laps: zones arriving well
 * inside eight bars of each other, and zones of other stages inside a loop, which a real
 * run meets only now and then. The zone's chime is asked for as gamesounds does.
 */
function fastClimb({ secs = 300, mutate = null } = {}) {
  const a = new Audio();
  a.init();
  const rec = watch(a);
  if (mutate) mutate(a, null);
  a.startClimb(0);
  const rnd = seeded(4242);
  let floor = 0, rate = 20, next = 0, zone = 0, t = 0;
  const F = 1 / 60;
  while (t < secs) {
    t += F;
    a.ctx.currentTime = t;
    if (t >= next) { rate = 10 + 30 * rnd(); next = t + 2 + 4 * rnd(); }
    floor += rate * F;
    a.followClimb(Math.floor(floor));
    const z = stageVisit(Math.floor(floor)).zone;
    if (z !== zone) { zone = z; rec.zones.push({ t, floor: Math.floor(floor) }); a.sfxTheme(); }
    a.setIntensity(Math.min(1, rate / 40), F);
    a.pump();
  }
  rec.end = t;
  rec.floor = Math.floor(floor);
  return rec;
}

// --- reading the recording ------------------------------------------------------------------
/** Everything the checks need, derived from the notes alone. */
function analyse(rec) {
  const bySet = new Map();
  for (const n of rec.notes) if (n.t < rec.end) { if (!bySet.has(n.set)) bySet.set(n.set, []); bySet.get(n.set).push(n); }
  const sets = [...bySet.entries()].map(([id, ns]) => ({ id, track: ns[0].track, notes: ns.sort((x, y) => x.pos - y.pos || x.t - y.t) }));
  const out = { sets, changes: [], bars: [], barTempo: [] };
  for (const s of sets) {
    // The theme's bar lines as played: the start time of each pos 16k that has a note.
    const at = new Map();
    for (const n of s.notes) if (n.pos % 16 === 0 && !at.has(n.pos)) at.set(n.pos, n.t);
    const ps = [...at.keys()].sort((x, y) => x - y);
    s.bars = ps.map((p) => ({ pos: p, t: at.get(p) }));
    for (const b of s.bars) out.bars.push({ ...b, set: s.id, track: s.track });
    const bpm = TRACKS[s.track].bpm;
    for (let i = 0; i + 1 < s.bars.length; i++) {
      if (s.bars[i + 1].pos - s.bars[i].pos !== 16) continue;
      out.barTempo.push({ set: s.id, track: s.track, t: s.bars[i].t, pos: s.bars[i].pos,
        tempo: (16 * 60 / bpm / 4) / (s.bars[i + 1].t - s.bars[i].t) });
    }
    // Changes of key, voice by voice, then gathered: a change is the first note of each
    // voice in a new key after the last one; the voices' first notes may differ where one
    // rests on the downbeat, so the change is placed at the earliest of them.
    const voices = [...new Set(s.notes.map((n) => n.voice))];
    const perVoice = voices.map((v) => {
      const ns = s.notes.filter((n) => n.voice === v);
      const ch = [];
      for (let i = 1; i < ns.length; i++) if (ns[i].key !== ns[i - 1].key) ch.push({ voice: v, pos: ns[i].pos, t: ns[i].t, from: ns[i - 1].key, to: ns[i].key, prevPos: ns[i - 1].pos });
      return ch;
    }).flat().sort((x, y) => x.pos - y.pos);
    const groups = [];
    for (const c of perVoice) {
      const g = groups.find((x) => x.to === c.to && x.from === c.from && Math.abs(x.pos - c.pos) < 64);
      if (g) { g.voices.push(c); g.pos = Math.min(g.pos, c.pos); g.t = Math.min(g.t, c.t); } else groups.push({ set: s.id, track: s.track, from: c.from, to: c.to, pos: c.pos, t: c.t, voices: [c] });
    }
    for (const g of groups) {
      // Clean: on a bar line, and no voice still in the old key from it, nor any voice in the
      // new key before it (a voice may reach it late only by resting in between).
      g.onBar = g.pos % 16 === 0 && g.voices.every((c) => c.prevPos < g.pos);
      out.changes.push(g);
    }
  }
  out.changes.sort((x, y) => x.t - y.t);
  return out;
}

const barAround = (an, set, t) => {
  const bs = an.sets.find((s) => s.id === set).bars;
  for (let i = 0; i + 1 < bs.length; i++) if (bs[i + 1].t >= t) return bs[i + 1].t - bs[i].t;
  return 2;
};

/** Each check, as a list of what broke it (empty when it holds). */
const CHECKS = {
  companion(rec, an) {
    const out = [];
    for (const c of rec.companions) {
      for (const ch of an.changes) {
        if (ch.t < c.t || ch.t > c.t + 2 * barAround(an, ch.set, ch.t)) continue;
        const zone = rec.zones.some((z) => z.t <= ch.t && ch.t - z.t <= barAround(an, ch.set, ch.t) + 0.15);
        if (!zone) out.push(`a companion's ${c.what} at ${c.t.toFixed(1)}s, then ${ch.track} ${ch.from}->${ch.to} at ${ch.t.toFixed(1)}s with no zone`);
      }
    }
    return out;
  },
  zoneAndBar(rec, an) {
    const out = [];
    for (const ch of an.changes) {
      const z = rec.zones.filter((x) => x.t <= ch.t + 1e-9).pop();
      if (!z || ch.t - z.t > barAround(an, ch.set, ch.t) + 0.15) out.push(`${ch.track} ${ch.from}->${ch.to} at ${ch.t.toFixed(2)}s, ${z ? (ch.t - z.t).toFixed(2) + 's after the last zone' : 'before any zone'}`);
      if (!ch.onBar) out.push(`${ch.track} ${ch.from}->${ch.to} at ${ch.t.toFixed(2)}s off the bar line (voices at ${ch.voices.map((c) => c.pos % 16).join('/')} sixteenths into their bars)`);
    }
    return out;
  },
  chime(rec, an) {
    const out = [];
    for (const c of rec.chimes) {
      if (c.t > rec.end - 0.5) continue;
      const bar = an.bars.find((b) => Math.abs(b.t - c.t) < 1e-6);
      if (!bar) out.push(`a chime at ${c.t.toFixed(3)}s (asked ${c.asked.toFixed(3)}s) on no bar line of the music`);
      const ch = an.changes.find((x) => x.t >= c.asked - 1e-9 && x.t - c.asked <= 2.2);
      if (ch && Math.abs(ch.t - c.t) > 1e-6) out.push(`a chime at ${c.t.toFixed(3)}s and its zone's change of key at ${ch.t.toFixed(3)}s: two events`);
    }
    return out;
  },
  phrase(rec, an) {
    const out = [];
    for (const s of an.sets) {
      const ch = an.changes.filter((c) => c.set === s.id);
      let last = 0;
      for (const c of ch) {
        if (c.pos - last < PHRASE) out.push(`${s.track} changed key at bar ${c.pos / 16}, ${(c.pos - last) / 16} bars after ${last ? 'its last change' : 'its first downbeat'}`);
        last = c.pos;
      }
      const h = rec.handovers.find((x) => x.set && x.set.id === s.id);
      if (h && h.cutPos - last < PHRASE) out.push(`${s.track} was handed over at bar ${h.cutPos / 16}, ${(h.cutPos - last) / 16} bars after its last change of key`);
    }
    return out;
  },
  tempo(rec, an) {
    const out = [];
    let prev = null;
    for (const b of an.barTempo) {
      if (b.tempo < TEMPO_MIN - 1e-3 || b.tempo > TEMPO_MAX + 1e-3) out.push(`${b.track} bar ${b.pos / 16} at x${b.tempo.toFixed(3)}, outside x${TEMPO_MIN}-x${TEMPO_MAX}`);
      if (prev && prev.set === b.set && b.pos - prev.pos === 16 && Math.abs(b.tempo / prev.tempo - 1) > TEMPO_BAR_MAX + 1e-3) {
        out.push(`${b.track} bar ${b.pos / 16} at x${b.tempo.toFixed(3)} after x${prev.tempo.toFixed(3)}: ${(100 * (b.tempo / prev.tempo - 1)).toFixed(1)}% in one bar`);
      }
      prev = b;
    }
    return out;
  },
  loop(rec) {
    const out = [];
    for (const h of rec.handovers) {
      const need = THEME_MIN_LOOPS * LOOPS[h.from].lead;
      if (!(h.cutPos >= need)) out.push(`${h.from} handed to ${h.to} at ${h.t.toFixed(1)}s, ${(h.cutPos / 16).toFixed(1)} bars into it, under its ${need / 16}-bar loop`);
    }
    return out;
  },
};
const ALL = Object.keys(CHECKS);
const judge = (rec, only = ALL) => {
  const an = analyse(rec);
  return { an, broke: Object.fromEntries(only.map((k) => [k, CHECKS[k](rec, an)])) };
};

// --- 1-5 over three runs ----------------------------------------------------------------------
const runs = [
  ['the attract bot through the first lap into the second', gameRun({ secs: 420 })],
  ['a human-paced climb, in bursts', gameRun({ human: true, secs: 300 })],
  ['the engine alone on a climb far faster than anyone climbs', fastClimb()],
];
for (const [label, rec] of runs) {
  const before = bad;
  const { an, broke } = judge(rec);
  for (const k of ALL) for (const m of broke[k].slice(0, 3)) fail(`${label}: [${k}] ${m}${broke[k].length > 3 ? ` (and ${broke[k].length - 3} more)` : ''}`);
  const tempos = an.barTempo.map((b) => b.tempo);
  const steps = [];
  for (let i = 1; i < an.barTempo.length; i++) {
    const b = an.barTempo[i], p = an.barTempo[i - 1];
    if (b.set === p.set && b.pos - p.pos === 16) steps.push(Math.abs(b.tempo / p.tempo - 1));
  }
  // Enough happened for the checks to mean something.
  if (an.changes.length < 3) fail(`${label}: only ${an.changes.length} changes of key -- the run no longer exercises the key`);
  if (rec.chimes.length < 3) fail(`${label}: only ${rec.chimes.length} zone chimes`);
  if (bad === before) {
    ok(`${label}: ${(rec.end / 60).toFixed(1)} min to floor ${rec.floor}, ${rec.zones.length} zones, ${an.changes.length} changes of key ` +
      `(all with a zone, on its bar line with its chime), ${rec.handovers.length} handovers (the soonest ${Math.min(...rec.handovers.map((h) => h.cutPos / 16), Infinity).toFixed(0)} bars in), ` +
      `${rec.companions.length} companion joins and slips moving nothing; tempo x${Math.min(...tempos).toFixed(2)}-x${Math.max(...tempos).toFixed(2)}, ` +
      `at most ${(100 * Math.max(0, ...steps)).toFixed(1)}% a bar`);
  }
}

// --- and each check fails against the engine it guards against -------------------------------
// The old behaviours, put back one at a time on a fresh engine (the instance patched, not
// the module): each must break its check on a run that meets it.
const MUTANTS = [
  ['a companion lifts the key when they join and drops it when they slip', 'companion', () => gameRun({
    secs: 420,
    mutate: (a, game) => {
      const join = game.onCompanionJoin, slip = game.onCompanionSlip;
      game.onCompanionJoin = (c) => { a.setKey(a.key + 5); return join(c); };
      game.onCompanionSlip = (c) => { a.setKey(a.key - 5); return slip(c); };
    },
  })],
  ['the key changes at once, on the next note queued', 'zoneAndBar', () => fastClimb({
    mutate: (a) => { a.stepKey = function () { this.keyStep++; this.setKey(keyForStep(this.keyStep)); }; },
  })],
  ['the key steps every 200 floors, not with the zones', 'zoneAndBar', () => {
    let last = -1;
    return fastClimb({
      mutate: (a) => {
        a.stepKey = function () {};
        const follow = a.followClimb.bind(a);
        a.followClimb = (floor) => {
          follow(floor);
          const band = Math.floor((floor - stageVisit(floor).entry) / 200);
          if (band !== last) { last = band; a.setKey(keyForStep(band)); }
        };
      },
    });
  }],
  ['the zone chime rings when the floor is crossed', 'chime', () => fastClimb({
    mutate: (a) => { a.sfxTheme = function () { return this.sfx('zone'); }; },
  })],
  ['a zone steps the key however soon after the last change', 'phrase', () => fastClimb({
    mutate: (a) => {
      const follow = a.followClimb.bind(a);
      a.followClimb = (floor) => { a.lastKeyPos = -1e9; return follow(floor); };
    },
  })],
  ['the tempo follows the run as it did: x0.92-x1.70 at 2.8/s', 'tempo', () => gameRun({
    human: true, secs: 120,
    mutate: (a) => {
      a.setIntensity = function (k, dt) {
        const i = Math.max(0, Math.min(1, k));
        this.intensity = i;
        this.tempo += (0.92 + 0.78 * (i * i * 0.65 + i * 0.35) - this.tempo) * Math.min(1, dt * 2.8);
        this.sixteenth = this.baseSixteenth / this.tempo;
      };
    },
  })],
  ['a zone of another stage hands the music over at once', 'loop', () => fastClimb({
    mutate: (a) => {
      a.handOverWhenDue = function () {
        const want = this.wantTrack;
        this.wantTrack = null;
        if (!want || want === this.stageTrack) return;
        this.stageTrack = want;
        this.crossTo(want, HANDOVER_FADE, { swell: HANDOVER_SWELL, from: HANDOVER_FROM, onBar: true });
        this.keyStep = 0;
        this.setKey(0);
      };
    },
  })],
];
{
  const before = bad;
  const caught = [];
  for (const [what, check, run] of MUTANTS) {
    const { broke } = judge(run(), [check]);
    if (!broke[check].length) fail(`[${check}] does not see it when ${what}`);
    else caught.push(`${check} x${broke[check].length}`);
  }
  if (bad === before) ok(`each check fails on the engine it guards against: ${MUTANTS.map(([w], i) => `${w} (${caught[i]})`).join('; ')}`);
}

// --- 6. off the climb the tempo settles and holds ---------------------------------------------
/**
 * The menu from its first note, and a lament cut in from a climb (the fall's 2 s with nothing
 * driving the tempo, then the scoreboard's intensity of 0), frame by frame as main.js drives
 * them. Returns each one's tempo bar by bar, from the notes.
 */
function offClimb(mutate = null) {
  const out = {};
  {
    const a = new Audio();
    a.init();
    if (mutate) mutate(a);
    const rec = watch(a);
    a.playTrack('menu');
    for (let t = 0; t < 40; t += 1 / 60) { a.ctx.currentTime = t; a.setIntensity(0, 1 / 60); a.pump(); }
    rec.end = a.ctx.currentTime;
    out.menu = barTempos(rec, 'menu', 0);
  }
  {
    const a = new Audio();
    a.init();
    if (mutate) mutate(a);
    const rec = watch(a);
    a.startClimb(0);
    let t = 0;
    const run = (secs, drive) => { for (const end = t + secs; t < end; t += 1 / 60) { a.ctx.currentTime = t; if (drive !== null) a.setIntensity(drive, 1 / 60); a.pump(); } };
    run(20, 0.5);
    a.lament();
    run(2, null);                  // FALLING: main.js leaves the tempo alone
    const dead = t;
    run(40, 0);                    // the scoreboard
    rec.end = a.ctx.currentTime;
    out.lament = barTempos(rec, 'gameover', dead);
  }
  return out;
}
/** A track's bars as played ({ t, tempo }), those starting after `from`, from its notes. */
function barTempos(rec, track, from) {
  const s = analyse(rec).sets.find((x) => x.track === track);
  const bpm = TRACKS[track].bpm;
  const out = [];
  for (let i = 0; i + 1 < s.bars.length; i++) {
    if (s.bars[i + 1].pos - s.bars[i].pos !== 16 || s.bars[i].t < from) continue;
    out.push({ t: s.bars[i].t, tempo: (16 * 60 / bpm / 4) / (s.bars[i + 1].t - s.bars[i].t) });
  }
  return out;
}
/** Bars, from the third on, off TEMPO_MIN by more than half a percent. */
const unsettled = (bars) => bars.slice(2).filter((b) => Math.abs(b.tempo / TEMPO_MIN - 1) > 0.005);
{
  const before = bad;
  const r = offClimb();
  for (const k of ['menu', 'lament']) {
    const u = unsettled(r[k]);
    if (r[k].length < 8) fail(`${k}: only ${r[k].length} bars heard -- the check no longer sees it`);
    if (u.length) fail(`${k}: ${u.length} of its bars from the third on are off its rest tempo x${TEMPO_MIN} (bar at ${u[0].t.toFixed(1)}s at x${u[0].tempo.toFixed(3)})`);
  }
  // The climb's easing on them, as it was first built: each sags for 25 s.
  const m = offClimb((a) => {
    a.setIntensity = function (k, dt) {
      this.tempoTarget = tempoTargetFor(Math.max(0, Math.min(1, k)));
      this.tempo = easeTempo(this.tempo, this.tempoTarget, dt, 16 * this.baseSixteenth);
      this.sixteenth = this.baseSixteenth / this.tempo;
    };
  });
  const caught = ['menu', 'lament'].map((k) => unsettled(m[k]).length);
  if (caught.some((n) => !n)) fail(`[offClimb] does not see the climb's slow easing on the menu (${caught[0]} bars) and the lament (${caught[1]})`);
  if (bad === before) {
    ok(`off the climb the tempo settles: the menu at x${r.menu[2].tempo.toFixed(3)} from its third bar (${r.menu.length} bars), the lament at x${r.lament[2].tempo.toFixed(3)} from its third on the scoreboard; ` +
      `with the climb's easing they drift (menu x${m.menu[2].tempo.toFixed(3)}, ${caught[0]} bars off; lament ${caught[1]} bars off)`);
  }
}

// --- 7. a chime on the cut is in the new theme's key ------------------------------------------
/**
 * BELOW handed over to THE WORLD ABOVE on a bar line; just before the cut a zone of a third
 * stage arrives (it waits: a theme is not handed over inside its first loop) and its chime is
 * queued for the next bar line of the music heard -- the cut itself. Returns what keyNow says
 * a rounding error before the cut and a hundredth of a second before it, and the chime.
 */
function chimeOnCut(mutate = null) {
  const a = new Audio();
  a.init();
  if (mutate) mutate(a);
  const tuned = [];
  const sfx = a.sfx.bind(a);
  a.sfx = (name, params, delay = 0) => {
    const at = a.ctx.currentTime + Math.max(0, delay);
    const k = a.keyNow(at);
    const r = sfx(name, params, delay);
    if (r && name === 'zone') tuned.push({ start: r.start, track: k.track, transpose: k.transpose });
    return r;
  };
  a.startClimb(0);
  let t = 0;
  const run = (until) => { for (; t < until; t += 1 / 60) { a.ctx.currentTime = t; a.setIntensity(0.4, 1 / 60); a.pump(); } };
  run(60);                                     // past BELOW's loop
  a.followClimb(900);                          // CITADEL: the handover to THE WORLD ABOVE
  const out = a.outgoing;
  if (!out) return { none: true };
  run(out.end - 0.06);                         // the old theme is queued up to its cut
  a.followClimb(1500);                         // NEBULA, of THE HEAVENS: it waits
  a.sfxTheme();
  return { cut: out.end, hair: a.keyNow(out.end - 1e-9), early: a.keyNow(out.end - 0.01), chime: tuned[0] };
}
{
  const before = bad;
  const r = chimeOnCut();
  if (r.none) fail('no handover at floor 900 after BELOW\'s loop -- the check no longer sees a cut');
  else {
    if (r.early.track !== 'below') fail(`a hundredth of a second before the cut the effects are tuned to ${r.early.track}, not the theme still playing`);
    if (r.hair.track !== 'above') fail(`a rounding error before the cut the effects are tuned to ${r.hair.track}, not the theme whose downbeat it is`);
    if (!r.chime) fail('the zone arriving before the cut rang no chime');
    else {
      if (Math.abs(r.chime.start - r.cut) > 1e-6) fail(`the chime rang at ${r.chime.start.toFixed(4)}s, not on the cut at ${r.cut.toFixed(4)}s`);
      if (r.chime.track !== 'above') fail(`the chime on the cut is tuned to ${r.chime.track} +${r.chime.transpose}, not the theme starting there`);
    }
  }
  // The strict comparison it had: a rounding error before the cut counted as the old theme.
  const m = chimeOnCut((a) => {
    const own = a.keyNow.bind(a);
    a.keyNow = (t = a.ctx.currentTime) => (a.outgoing && t < a.outgoing.end ? keyOf(a.outgoing.track, a.outgoing.transpose) : own(t));
  });
  if (!m.none && m.hair.track === 'above') fail('[chimeOnCut] does not see effects tuned to the old theme a rounding error before the cut');
  if (bad === before) ok(`a zone chime queued onto a handover's cut (${r.cut.toFixed(2)}s) rings there in ${r.chime.track} +${r.chime.transpose}, the theme starting on it; a hundredth of a second earlier the effects are still in ${r.early.track}; with a strict comparison the edge goes to ${m.hair.track}`);
}

// --- 8. a pause holds the tempo -----------------------------------------------------------------
/**
 * 45 s of a hard climb, then pauseGame() as main.js does it -- suspend(), the clock running
 * on for PAUSE_HOLD and then stopped -- with the page calling setIntensity(0) every frame for
 * `secs` of pause screen, then resumeGame() and 30 s more. The bars either side, from the notes.
 */
function pauseRun(secs, mutate = null) {
  const a = new Audio();
  a.init();
  if (mutate) mutate(a);
  const rec = watch(a);
  a.startClimb(0);
  let t = 0;
  for (; t < 45; t += 1 / 60) { a.ctx.currentTime = t; a.setIntensity(0.7, 1 / 60); a.pump(); }
  a.suspend();
  for (const end = t + 0.2; t < end; t += 1 / 60) { a.ctx.currentTime = t; a.setIntensity(0, 1 / 60); a.pump(); }
  const stopped = t;
  for (let w = 0; w < secs; w += 1 / 60) a.setIntensity(0, 1 / 60);
  a.resumeCtx();
  for (const end = t + 30; t < end; t += 1 / 60) { a.ctx.currentTime = t; a.setIntensity(0.7, 1 / 60); a.pump(); }
  rec.end = t;
  const bars = barTempos(rec, 'below', 0);
  let worst = 0, at = 0;
  for (let i = 1; i < bars.length; i++) {
    const d = Math.abs(bars[i].tempo / bars[i - 1].tempo - 1);
    if (d > worst) { worst = d; at = bars[i].t; }
  }
  return { worst, at, stopped, before: bars.filter((b) => b.t < stopped - 2).pop(), after: bars.find((b) => b.t > stopped + 2) };
}
{
  const before = bad;
  const r = pauseRun(20);
  if (r.worst > TEMPO_BAR_MAX + 1e-3) fail(`a 20 s pause: the tempo moves ${(100 * r.worst).toFixed(1)}% in one bar at ${r.at.toFixed(1)}s`);
  if (Math.abs(r.after.tempo / r.before.tempo - 1) > 0.005) fail(`a 20 s pause: the music stopped at x${r.before.tempo.toFixed(3)} and came back at x${r.after.tempo.toFixed(3)}`);
  // The tempo left to ease on the pause screen, as it first was: it comes back slower.
  const m = pauseRun(20, (a) => {
    a.setIntensity = function (k, dt) {
      this.tempoTarget = tempoTargetFor(Math.max(0, Math.min(1, k)));
      this.tempo = easeTempo(this.tempo, this.tempoTarget, dt, 16 * this.baseSixteenth);
      this.sixteenth = this.baseSixteenth / this.tempo;
    };
  });
  if (m.worst <= TEMPO_BAR_MAX + 1e-3) fail(`[pause] does not see the tempo easing on the pause screen (${(100 * m.worst).toFixed(1)}% at most in a bar)`);
  if (bad === before) ok(`a 20 s pause: the march stops at x${r.before.tempo.toFixed(3)} and comes back at x${r.after.tempo.toFixed(3)}, at most ${(100 * r.worst).toFixed(1)}% a bar; with the tempo easing on the pause screen it came back at x${m.after.tempo.toFixed(3)}, ${(100 * m.worst).toFixed(1)}% in one bar`);
}

console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
