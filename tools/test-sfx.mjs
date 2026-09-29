// The sound effects: that every event a player should hear makes its sound, that each
// sound sits where it was mixed against the music, and that none of them can pile up,
// clip, or lose to a recorded file.
//
//   node tools/test-sfx.mjs
//
// Nobody on this machine listens to the game, so none of this is "sounds right". It is
// what can be measured:
//
//   1. WIRED. A real Game played by the attract bot for minutes, into a death, and a
//      short run left to the rising floor, each through render/gamesounds.js onto a
//      recording audio engine -- and then the real main.js, loaded headless, driven by
//      key presses through its menus, a pause and a quit. Every event in the audit has
//      to have made its sound, with the arguments the event carried (a landing's weight,
//      a bounce's drive); and the scoreboard's sounds stop when it is left.
//   2. IN KEY. Every held pitch of every effect is a note of the key the music is in,
//      including the key a handover is fading out of; and the key each track is filed
//      under (TRACK_KEYS) is the key its notes are in.
//   3. LOUD ENOUGH, NOT TOO LOUD. Every variant rendered through the effects bus
//      (tools/sfx-render.mjs) and measured against the climb themes: inside its band,
//      nothing over +3 LU, and the orderings that carry meaning -- a harder landing
//      louder, a bounce louder the more the combo drives it, each milestone at least as
//      loud as the last.
//   4. NO CLIP. Each effect, and a burst of it at its voice limit, on top of the music's
//      loudest peak, stays under the limiter's threshold.
//   5. VOICE LIMITS, VARIATION, DUCKING, PAUSE. A burst of every effect never has more of
//      it audible than its limit; the frequent sounds are never twice alike and the tuned
//      ones never detune; only the callout ducks the music; the pause's jingle rings out
//      before the clock stops, what was sounding goes with the music, and nothing plays
//      while paused.
//   6. THE SAMPLE OVERRIDE. A recorded milestone callout in assets/sfx/ still beats the
//      fanfare, its own name before the catch-all, found and decoded by the loader.

import { installDom, HeadlessCanvas } from './headless.mjs';

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

// --- a recording WebAudio --------------------------------------------------------------
// Only what audio.js touches. Every source started is kept, with the node it feeds, so a
// test can see what an effect played and when; every automation event on every param.
const started = [];
class Param {
  constructor(v = 0) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); return this; }
  cancelScheduledValues(t) { this.events.push(['cancel', 0, t]); return this; }
}
const node = (extra = {}) => ({ out: null, connect(n) { this.out = n; }, disconnect() { this.out = null; }, ...extra });
class StubContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node(); this.sampleRate = 48000; this.suspends = 0; }
  createGain() { return node({ gain: new Param(1) }); }
  createBiquadFilter() { return node({ type: '', frequency: new Param(1000), Q: new Param(1) }); }
  createDynamicsCompressor() {
    return node({ threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() });
  }
  createOscillator() {
    const o = node({ kind: 'osc', type: '', frequency: new Param(440), start(t) { o.t = t; started.push(o); }, stop(t) { o.stopAt = t; } });
    return o;
  }
  createBuffer(ch, n) { const d = new Float32Array(n); return { duration: n / this.sampleRate, getChannelData: () => d }; }
  createBufferSource() {
    const s = node({ kind: 'buffer', buffer: null, loop: false, playbackRate: new Param(1),
      start(t) { s.t = t; started.push(s); }, stop(t) { s.stopAt = t; } });
    return s;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; this.suspends++; return Promise.resolve(); }
  // What loadSamples decodes a fetched file into: a buffer that says where it came from.
  decodeAudioData(bytes) { return Promise.resolve({ duration: 1.2, name: 'decoded', bytes: bytes.byteLength }); }
}

// Timers are kept, not run: a test fires them when it means to.
const timeouts = [];
globalThis.setTimeout = (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; };
globalThis.clearTimeout = (id) => { if (timeouts[id - 1]) timeouts[id - 1].fn = null; };
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
const flushTimeouts = () => { while (timeouts.length) { const t = timeouts.shift(); if (t.fn) t.fn(); } };

const windowListeners = {};
globalThis.window = {
  AudioContext: StubContext,
  addEventListener(ev, fn) { (windowListeners[ev] = windowListeners[ev] || []).push(fn); },
  innerWidth: 1920, innerHeight: 1080, focus() {}, close() {}, closed: false,
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { Audio, SAMPLE_NAMES, LIMITER, PAUSE_HOLD, PAUSE_FADE, keyFromCut } = await import('../src/render/audio.js');
const { SFX, TRACK_KEYS, MODES, keyOf, lengthOf } = await import('../src/render/sfx.js');
const { wireGameAudio } = await import('../src/render/gamesounds.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const { MILESTONES, MULT_STEP } = await import('../src/game/combo.js');
const { themeIndexFor } = await import('../src/game/themes.js');
const { TRACKS } = await import('../src/render/tracks.js');
const { COMPANION_KEY } = await import('../src/render/compsprites.js');
const { musicReference, measure, VARIANTS } = await import('./sfx-render.mjs');
const { pitchesOf, freq } = await import('../src/render/audio.js');

/** A fresh engine on the stub, its randomness seeded, every sfx() call logged. */
function recordingAudio(seed = 1) {
  const a = new Audio();
  a.init();
  let s = seed >>> 0;
  a.rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  a.log = [];
  const real = a.sfx.bind(a);
  a.sfx = (name, params = {}, delay = 0) => {
    const r = real(name, params, delay);
    a.log.push({ name, params, t: a.ctx.currentTime, played: !!r, inst: r || null });
    return r;
  };
  return a;
}
const names = (log) => new Set(log.filter((e) => e.played).map((e) => e.name));

/**
 * A param's value at time `t` from the automation recorded, as WebAudio computes it: a
 * cancel drops every event at or after its time, a 'set' holds, a ramp runs from the
 * previous event.
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

// ===================================================================================
// 1. WIRED
// ===================================================================================
// The audit: every event a player should hear, the effect it plays, and where it fires.
// Anything listed here that a run did not play is a fail.
const AUDIT = [
  ['a jump off the ground', 'jump'],
  ['the first air jump', 'double'],
  ['a landing', 'land'],
  ['a wall bounce', 'wall'],
  ['the chain opening, and each hop of it', 'hop'],
  ['the chain ending', 'comboEnd'],
  ['the payout', 'payout'],
  ['a milestone callout', 'milestone'],
  ['a zone arriving', 'zone'],
  ['a companion joining', 'join'],
  ['a companion speaking', 'speak'],
  ['a companion slipping away', 'slip'],
  ['CLIMB!', 'climb'],
  ['the floor catching him', 'catch'],
  ['the death fall', 'scream'],
  ['the splat', 'impact'],
  ['the scoreboard', 'gameover'],
  ['a new record', 'record'],
  ['an award', 'unlock'],
];

/**
 * Step a game and its audio clock together. `until` stops it early; returns the steps run.
 */
function play(game, a, seconds, { bot = null, until = null } = {}) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    if (bot && game.state === STATE.PLAYING) bot.step(game, STEP);
    game.step(STEP);
    a.ctx.currentTime += STEP;
    if (until && until()) return i + 1;
  }
  return n;
}

// --- a long run: the attract bot on a real tower, then left to the floor -------------
const long = {};
{
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  const a = recordingAudio(7);
  // The scoreboard earned something, so its record and award sounds are asked for.
  wireGameAudio(game, a, { scoreboard: () => ({ records: 2, unlocked: 1 }) });
  // The same towers the bot's own suite climbs, at the attract mode's gentler floor, so
  // the run gets past the first companion and the slip of the first one.
  game.demo = true;
  game.newRun(0x51ed270b);
  a.startClimb(0);
  // Every jump and landing the game saw, to hold the sounds against.
  const seen = { jump: 0, land: 0, drops: [], wall: 0, boosts: [], zones: 0, milestones: [], joins: 0, slips: 0, steps: 0 };
  let announced = false;
  const hj = game.handleEvents;
  game.handleEvents = function () {
    for (const ev of game.player.events) {
      if (ev.type === 'jump') seen.jump++;
      if (ev.type === 'land') seen.land++;
      if (ev.type === 'wallbounce') { seen.wall++; seen.boosts.push(ev.boost || 0); }
    }
    // A hop that takes the chain over a multiplier step. Every step, now: the callouts
    // moved to the tower's heights, so a combo step has no fanfare of its own and its
    // mark is the hop's. (It used to count only steps past GLORY, when the seven callouts
    // WERE the combo's first seven steps.) A landing that also fired a callout is the
    // fanfare's, and plays no hop at all.
    const before = game.combo.active ? game.combo.floors : 0;
    announced = false;
    const r = hj.call(game);
    const c = game.combo;
    if (c.active && !announced
      && Math.floor(c.floors / MULT_STEP) > Math.floor(before / MULT_STEP)) seen.steps++;
    return r;
  };
  const ann = game.onAnnounce;
  game.onAnnounce = (t, x, lap) => { announced = true; seen.milestones.push(x); return ann(t, x, lap); };
  const join = game.onCompanionJoin;
  game.onCompanionJoin = (c) => { seen.joins++; return join(c); };
  const slip = game.onCompanionSlip;
  game.onCompanionSlip = (c) => { seen.slips++; return slip(c); };
  let theme = game.themeIndex;
  const stepped = play(game, a, 900, {
    bot,
    until: () => {
      if (game.themeIndex !== theme) { seen.zones++; theme = game.themeIndex; }
      return game.state !== STATE.PLAYING || seen.slips > 0;
    },
  });
  const floorReached = game.run.maxFloor;
  // Then he stops, and the floor comes for him.
  input.wantAxis = 0; input.wantJump = false; input.jumpHeld = false;
  const beforeDeath = a.log.length;
  // What the climb was sounding where it was cut: the lament takes its key from that. Read
  // off the key sounding just before the cut, not `transpose`: a change of key waits for
  // its bar line now, and this harness never runs the note pump that makes it the live key.
  let cut = null;
  const fall = game.onFallStart;
  game.onFallStart = (...x) => {
    const r = fall(...x);
    const out = a.outgoing;
    const k = out ? a.keyNow(out.end - 1e-6) : a.keyNow();
    cut = { track: k.track, transpose: k.transpose };
    return r;
  };
  play(game, a, 120, { until: () => game.state === STATE.DEAD });
  const deathLog = a.log.slice(beforeDeath);
  play(game, a, 1);
  Object.assign(long, { game, a, seen, floorReached, stepped, deathLog });

  const heard = names(a.log);
  const count = (n) => a.log.filter((e) => e.name === n && e.played).length;
  const asked = (n) => a.log.filter((e) => e.name === n);
  console.log(`  the long run: floor ${floorReached} in ${(stepped * STEP).toFixed(0)}s, best chain ${game.run.bestCombo}, ` +
    `${game.run.combos} chains, ${seen.zones} zones, ${seen.joins} companions, then caught at floor ${game.run.maxFloor}`);

  // Every jump and every landing asked for its sound (the voice limit may drop a few that
  // land on top of each other; the asking is what the wiring owes).
  if (asked('jump').length + asked('double').length + asked('triple').length < seen.jump) {
    fail(`${seen.jump} jumps, ${asked('jump').length + asked('double').length + asked('triple').length} asked for a sound`);
  }
  if (asked('land').length !== seen.land) fail(`${seen.land} landings, ${asked('land').length} asked for a sound`);
  if (asked('wall').length !== seen.wall) fail(`${seen.wall} wall bounces, ${asked('wall').length} asked for a sound`);
  if (asked('zone').length !== seen.zones) fail(`${seen.zones} zones arrived, ${asked('zone').length} chimes asked for`);
  if (asked('join').length !== seen.joins) fail(`${seen.joins} companions joined, ${asked('join').length} calls asked for`);
  const ms = asked('milestone').map((e) => e.params.x);
  if (ms.join() !== seen.milestones.join()) fail(`milestones ${seen.milestones.join('/')} announced, ${ms.join('/')} asked for`);
  // The jump is played with the speed its event carried.
  const powers = asked('jump').map((e) => e.params.power);
  if (!(Math.max(...powers) > 0.6)) fail(`no jump in the run was played at speed (max power ${Math.max(...powers).toFixed(2)})`);
  // The bounce is driven by the combo: the boost the event carried is the boost played.
  const boosts = asked('wall').map((e) => e.params.boost);
  if (boosts.join() !== seen.boosts.join()) fail('the wall bounce is not played with the boost its event carried');
  if (!(Math.max(...boosts) > 0.3)) fail(`no bounce in the run was driven by a combo (max boost ${Math.max(...boosts).toFixed(2)})`);
  // The ladder climbs within a step, and the chain's first hop is marked.
  const hops = asked('hop');
  if (!hops.some((e) => e.params.first)) fail('no hop was played as the chain opening');
  if (hops.some((e) => !(e.params.progress >= 0 && e.params.progress < 1))) fail('a hop was played off the ladder');
  // Every multiplier step is marked, by the hop that crosses it, and no other hop is.
  const stepHops = hops.filter((e) => e.params.step).length;
  if (!seen.steps) fail('the long run never took a chain over a multiplier step -- the test no longer exercises the step mark');
  else if (stepHops !== seen.steps) fail(`the chains crossed ${seen.steps} multiplier steps and ${stepHops} hops were played as one`);
  // A chain the floor ended is banked in silence: no payout from the catch on. (Standing
  // still before it came, he banked his chain: that one is paid, and is before the catch.)
  const fromCatch = deathLog.slice(Math.max(0, deathLog.findIndex((e) => e.name === 'catch')));
  if (fromCatch.some((e) => e.name === 'payout' || e.name === 'comboEnd')) fail('a chain was paid out in sound during the death');
  // The death, in order.
  const order = ['catch', 'scream', 'impact', 'gameover'].map((n) => deathLog.findIndex((e) => e.name === n && e.played));
  if (order.some((i) => i < 0) || order.some((i, k) => k && i < order[k - 1])) {
    fail(`the death played ${deathLog.filter((e) => e.played).map((e) => e.name).join(' ')}; wanted catch, scream, impact, gameover in that order`);
  }
  const impact = deathLog.find((e) => e.name === 'impact');
  if (impact && impact.params.splat !== game.splat) fail(`the impact was played splat=${impact.params.splat} for a ${game.splat ? 'splat' : 'dazed'} death`);
  // The lament's stab struck with the splat (Audio.landLament, from gamesounds.js's
  // onImpact), read off the engine the real game drove. test-lament drives the engine the
  // way the hooks do and reads the hooks' source; neither would see a call that is written
  // and never runs (`if (false) audio.landLament()` passed both), and without it the
  // scoreboard's own landing strikes the stab over a second after the splat (1.15 s here).
  if (impact) {
    const L = a.landing;
    const d = L && L.done && L.at !== null ? L.at - impact.t : NaN;
    if (!(d >= 0 && d <= 0.05)) fail(`the lament's stab came ${Number.isNaN(d) ? 'never' : `${d.toFixed(3)}s after the splat`}, not with it (0.05 s at most)`);
  }
  // The lament holds the key it took from the climb at the catch (keyFromCut), through the
  // impact's resetKeys(). It was the home key, 0, until the lament was cut in from the
  // climb: then a climb at G minor fell into an E minor lament mid-phrase.
  const want = cut ? keyFromCut('gameover', cut.track, cut.transpose) : NaN;
  if (a.track !== 'gameover' || a.transpose !== want) fail(`the scoreboard plays '${a.track}' at ${a.transpose}, not the lament in the key it took from the climb (${cut && cut.track} at ${cut && cut.transpose} -> ${want})`);
  long.heard = heard;
  long.count = count;
}

// --- a short run: a few jumps, then standing still until the floor has him ----------
// Low in the tower the floor creeps up on someone standing still, so CLIMB! comes up in
// time to be read; and a death under SPLAT_FLOOR is the dazed landing.
const short = {};
{
  const input = new AutoInput();
  const game = new Game(input);
  const a = recordingAudio(11);
  wireGameAudio(game, a);
  game.newRun(12345);
  a.startClimb(0);
  // Two jumps up and to the side, then nothing.
  for (let k = 0; k < 2; k++) {
    input.wantJump = true; input.jumpHeld = true; input.wantAxis = 1;
    play(game, a, 0.9);
  }
  input.wantJump = false; input.jumpHeld = false; input.wantAxis = 0;
  let climbWarned = false;
  play(game, a, 90, { until: () => { climbWarned = climbWarned || game.climbWarning; return game.state === STATE.DEAD; } });
  play(game, a, 1);
  const played = a.log.filter((e) => e.played).map((e) => e.name);
  const impact = a.log.find((e) => e.name === 'impact');
  console.log(`  the short run: caught at floor ${game.run.maxFloor}, ${game.splat ? 'splat' : 'dazed'}; ` +
    `CLIMB! ${climbWarned ? 'came up' : 'never came up'}; played ${[...new Set(played)].join(' ')}`);
  if (climbWarned && !played.includes('climb')) fail('CLIMB! came up and made no sound');
  if (!climbWarned) fail('the short run never raised CLIMB! -- the test no longer exercises it');
  if (!impact || impact.params.splat !== false) fail('a death under the splat floor did not play the dazed landing');
  if (played.includes('record') || played.includes('unlock')) fail('a scoreboard with nothing earned played a record or an award');
  Object.assign(short, { a, game, played });
}

// --- a fall: the landing is weighed by how far he dropped -------------------------------
// The bot never falls far -- it is too good -- so here he is lifted off the ground in a
// real run, over a gap in the ledges, and let go: the landing's weight must be the drop
// from where he was let go to the ledge that caught him, and a long drop must weigh.
{
  const { FLOOR_H, CX } = await import('../src/game/constants.js');
  const { landWeight } = await import('../src/render/sfx.js');
  const input = new AutoInput();
  const game = new Game(input);
  const a = recordingAudio(19);
  wireGameAudio(game, a);
  game.newRun(2024);
  a.startClimb(0);
  play(game, a, 0.5);
  const drops = [];
  for (const floors of [1.5, 4, 9]) {
    // Somewhere across the shaft that no ledge in the floors below covers, so he falls
    // all the way to the ground.
    const p = game.player;
    const lo = CX - game.arenaHalf + 10, hi = CX + game.arenaHalf - 10;
    let x = null;
    for (let tx = lo; tx <= hi && x === null; tx += 2) {
      let clear = true;
      for (let n = 1; n <= Math.ceil(floors) + 1; n++) {
        const pl = game.tower.get(n);
        if (pl && tx + 8 > pl.x && tx - 8 < pl.x + pl.w) { clear = false; break; }
      }
      if (clear) x = tx;
    }
    if (x === null) { fail(`no gap in the ledges to drop ${floors} floors through`); continue; }
    const y0 = floors * FLOOR_H;
    p.x = p.px = x; p.y = p.py = y0; p.vx = 0; p.vy = 0; p.grounded = false;
    const from = a.log.length;
    play(game, a, 3, { until: () => a.log.slice(from).some((e) => e.name === 'land') });
    const land = a.log.slice(from).find((e) => e.name === 'land');
    if (!land) { fail(`a ${floors}-floor drop never landed`); continue; }
    const want = landWeight(y0 - p.y);
    if (Math.abs(land.params.weight - want) > 0.02) fail(`a drop of ${(y0 - p.y).toFixed(0)} units landed at weight ${land.params.weight.toFixed(2)}, not ${want.toFixed(2)}`);
    drops.push([y0 - p.y, land.params.weight]);
    play(game, a, 0.5);
  }
  if (drops.length === 3 && !(drops[0][1] < 0.2 && drops[2][1] > 0.8 && drops[1][1] > drops[0][1])) {
    fail(`landings from ${drops.map((d) => d[0].toFixed(0)).join(', ')} units weighed ${drops.map((d) => d[1].toFixed(2)).join(', ')}: not varied with the fall`);
  } else if (drops.length === 3) {
    ok(`a landing weighs its fall: drops of ${drops.map((d) => d[0].toFixed(0)).join(', ')} units land at ${drops.map((d) => d[1].toFixed(2)).join(', ')}`);
  }
  long.drops = drops;
}

// --- a skipped fall: the scoreboard, and the lament, without a landing ------------------
{
  const input = new AutoInput();
  const game = new Game(input);
  const a = recordingAudio(13);
  wireGameAudio(game, a);
  game.newRun(12345);
  a.startClimb(0);
  input.wantJump = true; input.jumpHeld = true; input.wantAxis = 1;
  play(game, a, 0.9);
  input.wantJump = false; input.jumpHeld = false; input.wantAxis = 0;
  // The climb at +5 (it was a companion's lift of +5 until companions stopped moving the key).
  a.setKey(5);
  let cut = null;
  const fall = game.onFallStart;
  game.onFallStart = (...x) => { cut = { track: a.track, transpose: a.transpose }; return fall(...x); };
  play(game, a, 90, { until: () => game.state === STATE.FALLING });
  play(game, a, 0.2);
  game.skipFall();                     // main.js does this on Space, with stopScream()
  play(game, a, 0.5);
  const played = a.log.filter((e) => e.played).map((e) => e.name);
  if (!played.includes('gameover')) fail('a skipped fall reached the scoreboard without its toll');
  if (played.includes('impact')) fail('a skipped fall played a landing it never had');
  // With the climb at +5, so the key the lament takes is not the home key:
  // a check that passed only at 0 would not see the lament drop back to E on a skip.
  const want = cut ? keyFromCut('gameover', cut.track, cut.transpose) : NaN;
  if (!want) fail(`the skipped fall's climb was cut at ${cut && cut.transpose}, so the lament's key is 0 -- the check no longer tells the held key from the home key`);
  if (a.track !== 'gameover' || a.transpose !== want) fail(`a skipped fall left '${a.track}' at ${a.transpose}, not the lament in the key it took from the climb (${want})`);
  // A skipped fall never lands, so the scoreboard's arrival strikes the stab (landLament).
  if (!a.landing || !a.landing.done) fail('a skipped fall reached the scoreboard with the lament still in its fall: nothing landed its stab');
  const scream = a.live.scream || [];
  if (scream.some((i) => i.end > a.ctx.currentTime)) fail('the wail went on over the scoreboard after a skip');
  if (!played.includes('scream')) fail('the skipped run never fell');
  short.skipPlayed = played;
}

// --- leaving the scoreboard lets go of its sounds -----------------------------------------
// The record and the award are queued half a second and a second after the scoreboard
// comes up, and the toll rings for two. One key there starts the next run, or goes back to
// the title (main.js startRun and toMenu, done here as they do it): none of the three may
// sound over what comes next.
const beforeLeave = bad;
for (const exit of ['a new run', 'the title']) {
  const input = new AutoInput();
  const game = new Game(input);
  const a = recordingAudio(23);
  wireGameAudio(game, a, { scoreboard: () => ({ records: 1, unlocked: 1 }) });
  game.newRun(12345);
  a.startClimb(0);
  for (let k = 0; k < 2; k++) { input.wantJump = true; input.jumpHeld = true; input.wantAxis = 1; play(game, a, 0.9); }
  input.wantJump = false; input.jumpHeld = false; input.wantAxis = 0;
  play(game, a, 90, { until: () => game.state === STATE.DEAD });
  const t = a.ctx.currentTime;
  if (exit === 'a new run') { a.resumeCtx(); game.newRun(); a.stopMusic(); a.startClimb(game.run.maxFloor); }
  else { game.state = STATE.MENU; a.resumeCtx(); a.stopMusic(); a.resetKeys(); a.crossTo('menu'); }
  play(game, a, 0.3);
  const quiet = t + 0.2;
  for (const n of ['gameover', 'record', 'unlock']) {
    const e = a.log.find((x) => x.name === n && x.played);
    if (!e) { fail(`the scoreboard never asked for its ${n} sound`); continue; }
    const i = e.inst;
    if (levelAt(i.out.gain, quiet) > i.level * 0.01 || i.srcs.some((s) => !(s.stopAt <= quiet))) {
      fail(`${n} was still sounding ${(quiet - t).toFixed(1)} s after the scoreboard was left for ${exit}`);
    }
  }
}
if (bad === beforeLeave) ok('the scoreboard\'s toll, record and award stop when it is left for a new run or the title, the two not yet begun included');

// --- the events a run cannot be relied on to reach, through the real code that fires them --
// Every milestone past the ones the bot's chains reached, and a companion's farewell, are
// fired through the Game's own methods (announceMilestone, Companion.slip) so the hook and
// the wiring are what is tested.
{
  const { game, a } = long;
  const g2 = new Game(new AutoInput());
  const a2 = recordingAudio(17);
  wireGameAudio(g2, a2);
  g2.newRun(4242);
  a2.startClimb(0);
  for (const m of MILESTONES) { g2.announceMilestone(m); a2.ctx.currentTime += 2; }
  const xs = a2.log.filter((e) => e.name === 'milestone' && e.played).map((e) => e.params.x);
  if (xs.join() !== MILESTONES.map((m) => m.x).join()) fail(`the seven callouts played ${xs.join('/')}`);
  // A kick off a wall from the ground: the player's own event, drained by the game's step.
  play(g2, a2, 0.2);
  g2.player.emit('wallkick', { speed: 120, dir: 1 });
  play(g2, a2, 0.1);
  // The falling body glancing off a wall, through the game's own onWallHit.
  g2.onWallHit(g2.player);
  const got = names(a2.log);
  for (const n of ['wallkick', 'fallWall']) if (!got.has(n)) fail(`${n} made no sound when its event fired`);
  long.forced = got;
  void game; void a;
}

// Everything in the audit, heard in a run; the three a run cannot be counted on to reach
// (the third air jump needs a 250-floor chain; a kick off a wall and a body glancing off
// one during the fall are chance), heard in a run or through their events above.
{
  const heard = new Set([...long.heard, ...short.played]);
  // The seven callouts fire off the tower's height, and the long run is the attract bot's
  // (game.demo), which fires none: the title screen draws no HUD for a word to be in.
  // That they fire at their floors in real play is test-milestones.mjs's; here it is
  // the wiring, announce to fanfare, heard through announceMilestone above.
  const byAnnounce = new Set(['milestone'].filter((n) => long.forced.has(n)));
  const missing = AUDIT.filter(([, n]) => !heard.has(n) && !byAnnounce.has(n));
  for (const [what, n] of missing) fail(`${what} (${n}) never made a sound in the runs`);
  const chance = ['triple', 'wallkick', 'fallWall'];
  const inRun = chance.filter((n) => heard.has(n));
  const byEvent = chance.filter((n) => !heard.has(n) && long.forced.has(n));
  for (const n of chance) if (!heard.has(n) && !long.forced.has(n)) fail(`${n} never made a sound`);
  if (!missing.length) {
    ok(`every event in the audit made its sound in play: ${AUDIT.map(([, n]) => `${n} ${long.count(n) || short.played.filter((x) => x === n).length}`).join(', ')}` +
      `${inRun.length ? `; ${inRun.join(', ')} in play too` : ''}${byEvent.length ? `; ${byEvent.join(', ')} from their events` : ''}`);
  }
}

// --- main.js: the menus, a pause, a quit ----------------------------------------------
// Loaded as the page loads it, on the headless canvas, with every key the player presses
// dispatched to its own listeners. Its game is wired as the page's is, so a jump in a run
// started from the menu must make its sound too.
{
  installDom();
  document.getElementById = () => new HeadlessCanvas(1920, 1080);
  document.hidden = false;
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.location = { search: '' };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.fetch = () => Promise.resolve({ ok: false });
  // The loop's watchdog says so when its timer fires and requestAnimationFrame has not.
  const warn = console.warn;
  console.warn = () => {};
  await import('../src/main.js');
  const V = window.VYTIS;
  const a = V.audio;
  const log = [];
  const real = a.sfx.bind(a);
  a.sfx = (name, params = {}, delay = 0) => { const r = real(name, params, delay); log.push({ name, played: !!r }); return r; };
  const key = (code) => {
    for (const fn of windowListeners.keydown || []) fn({ code, key: code, repeat: false, preventDefault() {} });
    for (const fn of windowListeners.keyup || []) fn({ code, key: code, repeat: false, preventDefault() {} });
    a.ctx.currentTime += 0.4;
  };
  const expect = (label, codes, want, state) => {
    const from = log.length;
    for (const c of codes) key(c);
    const got = log.slice(from).filter((e) => e.played).map((e) => e.name);
    if (got.join() !== want.join()) fail(`${label}: played ${got.join(' ') || 'nothing'}, wanted ${want.join(' ')}`);
    if (state && V.game.state !== state) fail(`${label}: ended on ${V.game.state}, not ${state}`);
    return got;
  };
  if (V.game.state !== STATE.MENU) fail(`main.js starts on ${V.game.state}`);
  // A first run shows the guide first; its last page starts the climb. (First, because
  // opening HELP counts as having read it.)
  const pages = (await import('../src/ui/screens.js')).TUTORIAL_PAGES.length;
  expect('the guide, paged through, then the climb', ['Space', ...new Array(pages - 1).fill('ArrowRight'), 'Space'],
    ['menuSelect', ...new Array(pages - 1).fill('menuMove'), 'menuSelect'], STATE.PLAYING);
  // Pause: the jingle first, and the clock stops only after it has rung out.
  const suspends = a.ctx.suspends;
  expect('pause', ['Escape'], ['pause'], STATE.PAUSED);
  if (a.ctx.suspends !== suspends) fail('the pause stopped the audio clock before its jingle could play');
  flushTimeouts();
  if (a.ctx.suspends !== suspends + 1) fail('the pause never stopped the audio clock');
  if (a.sfx('jump', {})) fail('an effect played while the game was paused');
  expect('resume', ['Escape'], ['resume'], STATE.PLAYING);
  // A run started from the menu is wired: a jump makes its sound.
  const from = log.length;
  key('Space');
  V.advance(0.3);
  if (!log.slice(from).some((e) => e.name === 'jump' && e.played)) fail('a jump in a run started from main.js made no sound');
  // Quit from a pause to the menu: the pause must let go, or every effect stays held.
  expect('pause, then quit to the menu', ['KeyP', 'KeyQ'], ['pause', 'menuBack'], STATE.MENU);
  flushTimeouts();
  if (a.paused) fail('quitting a paused run left the effects held');
  expect('stats from the menu', ['KeyS'], ['menuSelect'], STATE.STATS);
  expect('paging the stats', ['ArrowRight', 'ArrowLeft'], ['menuMove', 'menuMove'], STATE.STATS);
  expect('back out of the stats', ['Escape'], ['menuBack'], STATE.MENU);
  expect('the options', ['KeyO', 'ArrowDown', 'ArrowUp', 'KeyO'], ['menuSelect', 'menuMove', 'menuMove', 'menuBack'], STATE.MENU);
  expect('help, and any key out of it', ['KeyH', 'KeyX'], ['menuSelect', 'menuBack'], STATE.MENU);
  expect('the awards wiped', ['KeyS', 'KeyR', 'KeyR', 'Escape'], ['menuSelect', 'menuSelect', 'menuErase', 'menuBack'], STATE.MENU);
  expect('a new run from the menu', ['Space'], ['menuSelect'], STATE.PLAYING);
  // The scoreboard's sounds are its arrival, once a run: a look at the stats or the options
  // from it, and back, is not a second death.
  V.game.die();
  V.advance(10);
  if (V.game.state !== STATE.DEAD) fail(`a death in main.js's game had not reached the scoreboard in 10 s (${V.game.state})`);
  const tolls = () => log.filter((e) => e.name === 'gameover').length;
  const first = tolls();
  // A few frames on each screen, as a player spends there, so the game sees every state.
  for (const [code, want, state] of [['KeyS', 'menuSelect', STATE.STATS], ['Escape', 'menuBack', STATE.DEAD],
    ['KeyO', 'menuSelect', STATE.OPTIONS], ['KeyO', 'menuBack', STATE.DEAD]]) {
    expect(`${code} at the scoreboard's screens`, [code], [want], state);
    V.advance(0.1);
  }
  if (first !== 1 || tolls() !== 1) fail(`one death rang the scoreboard's toll ${tolls()} times (${first} as it came up)`);
  // The lament's stab is main.js's to land only once he HAS landed. O opens the options
  // from anywhere, the fall included, and applySettings landed the lament on any setting
  // changed there: the stab struck with him frozen in mid-air. From the scoreboard's
  // options, though, music switched off and on again restarts the lament, and that must
  // come back on its stab, not replay a fall that is over.
  const Settings = await import('../src/game/settings.js');
  const row = (k) => Settings.OPTIONS.findIndex((o) => o.key === k);
  const setRow = (k, presses) => { for (let i = 0; i < row(k); i++) key('ArrowDown'); for (let i = 0; i < presses; i++) key('ArrowRight'); };
  key('Space');
  V.advance(0.5);
  V.game.die();
  V.advance(0.2);
  if (V.game.state !== STATE.FALLING || a.track !== 'gameover' || !a.landing) fail(`the options mid-fall: no lament falling to test (${V.game.state}, ${a.track})`);
  key('KeyO');
  setRow('shake', 2);                  // screen shake off and on: two calls of applySettings
  if (a.landing && a.landing.done) fail('a setting changed in the options opened mid-fall struck the lament\'s stab with him still in the air');
  key('KeyO');
  V.advance(10);
  if (V.game.state !== STATE.DEAD || !a.landing || !a.landing.done) fail(`after the options mid-fall the impact did not land the stab (${V.game.state})`);
  key('KeyO');
  setRow('music', 2);                  // music off, and on again
  if (a.track !== 'gameover' || !a.landing || !a.landing.done) fail('music switched back on in the scoreboard\'s options restarted the lament in its fall, not on its stab');
  key('KeyO');
  console.warn = warn;
  if (bad === 0) ok(`main.js: the menus move, choose and go back, the guide pages, a pause rings out before the clock stops, ` +
    `quitting from it lets go, a run started from the menu is wired, and the scoreboard rings once however often its stats and options are visited (${log.filter((e) => e.played).length} sounds)`);
}

// ===================================================================================
// 2. IN KEY
// ===================================================================================
{
  const before = bad;
  // The key each track is filed under is the key its notes are in: its tonic is the loop's
  // first bass note, and no other key's scale holds more of its notes.
  const pc = (n) => (((Math.round(12 * Math.log2(freq(n) / 440)) + 69) % 12) + 12) % 12;
  for (const [name, k] of Object.entries(TRACK_KEYS)) {
    const t = TRACKS[name];
    if (!t) { fail(`TRACK_KEYS names '${name}', which is not a track`); continue; }
    const w = new Array(12).fill(0);
    for (const v of ['lead', 'bass', 'choir', 'brass']) for (const [n, d] of t[v] || []) for (const p of pitchesOf(n)) w[pc(p)] += d;
    const total = w.reduce((s, x) => s + x, 0);
    const fit = (tonic, mode) => MODES[mode].reduce((s, st) => s + w[(tonic + st) % 12], 0) / total;
    let best = 0;
    for (const mode of Object.keys(MODES)) for (let t0 = 0; t0 < 12; t0++) best = Math.max(best, fit(t0, mode));
    const mine = fit(k.tonic % 12, k.mode);
    const firstBass = t.bass.find((n) => n[0] !== null);
    if (pc(pitchesOf(firstBass[0])[0]) !== k.tonic % 12) fail(`${name} is filed in a key on ${k.tonic % 12}, but its bass opens on ${firstBass[0]}`);
    if (mine < best - 0.005) fail(`${name}: ${(mine * 100).toFixed(0)}% of its notes are in ${k.mode} on ${k.tonic % 12}, and another key holds ${(best * 100).toFixed(0)}%`);
  }
  // Every held pitch of every effect, in every key it can be played in, is a note of it --
  // within 3 cents, because a bell's upper partials are the harmonics of a note of the key
  // (the scoreboard's toll rings a true twelfth, two cents off the tempered one).
  let checked = 0;
  for (const track of Object.keys(TRACK_KEYS)) {
    for (const transpose of [0, 3, 7, -5]) {
      const k = keyOf(track, transpose);
      const scale = new Set(k.steps.map((s) => (((k.tonic + s) % 12) + 12) % 12));
      for (const v of VARIANTS) {
        const voices = SFX[v.name].make(v.params, k);
        for (const vo of voices) {
          if (vo.type === 'noise' || !vo.f.every((e) => e[0] === 'set')) continue;
          for (const [, hz] of vo.f) {
            const m = 12 * Math.log2(hz / 440) + 69;
            checked++;
            if (Math.abs(m - Math.round(m)) > 0.03 || !scale.has(((Math.round(m) % 12) + 12) % 12)) {
              fail(`${v.id} in ${track} +${transpose} holds ${hz.toFixed(1)} Hz, not a note of the key`);
            }
          }
        }
      }
    }
  }
  // Played by the engine, the key is the one the music is SOUNDING in: during a handover,
  // the theme fading out; after its cut, the new one.
  const a = recordingAudio(3);
  a.startClimb(850);
  const was = a.transpose;
  a.ctx.currentTime = 60;            // past BELOW's loop: a theme is not handed over sooner
  a.followClimb(900);
  const out = a.keyNow();
  a.ctx.currentTime = a.outgoing.end + 0.01;
  const after = a.keyNow();
  if (out.track !== 'below' || out.transpose !== was) fail(`during the handover the effects are tuned to ${out.track} +${out.transpose}, not the theme still playing`);
  if (after.track !== 'above') fail(`after the cut the effects are tuned to ${after.track}, not the new theme`);
  // In a real game, where a zone of a stage arrives and the key steps up with it -- every
  // zone of a stage after its first -- the chime rings on the bar line where the key
  // changes, and in the new key: the key the music's own notes on that downbeat are in.
  // It used to ring at once, a tone under a key that changed a note later; then, with the
  // key applied on the step that crossed the floor, at once in a key the music had not
  // reached. Here every note the scheduler queues is traced back to the note of the score
  // it plays, so the check reads the music rather than the engine's own account of its key.
  // Stood still for 16 s first: a zone under KEY_MIN_BARS into a theme keeps its key.
  const offKey = [];
  const steps = [];
  for (const target of [1101, 1701, 2101]) {
    const g = new Game(new AutoInput());
    const a3 = recordingAudio(29);
    const chimes = [];
    const logged = a3.sfx;
    a3.sfx = (n, p, d = 0) => {
      const r = logged(n, p, d);
      if (n === 'zone' && r) chimes.push({ at: r.start, freqs: r.srcs.map((s) => s.frequency.events[0][1]) });
      return r;
    };
    // Every note queued: where it is in the music, when it starts, and how far its pitch is
    // from the score's note there -- the key it was played in.
    const played3 = [];
    const sched = a3.schedule.bind(a3);
    a3.schedule = (voices, ...rest) => {
      const was = voices.map((v) => [v.i, v.pos]);
      const n0 = started.length;
      const r = sched(voices, ...rest);
      const oscs = started.slice(n0).filter((o) => o.kind === 'osc');
      let j = 0;
      voices.forEach((v, vi) => {
        let [i, pos] = was[vi];
        while (pos < v.pos - 1e-9) {
          const [note, dur] = v.part[i];
          for (const name of pitchesOf(note)) {
            const o = oscs[j++];
            played3.push({ pos, t: o.t, key: Math.round(12 * Math.log2(o.frequency.events[0][1] / freq(name))) });
          }
          pos += dur;
          i = i + 1 < v.part.length ? i + 1 : v.loopAt;
        }
      });
      return r;
    };
    wireGameAudio(g, a3);
    g.newRun(777);
    g.riseActive = false;
    g.tower.ensure(target + 8);
    g.run.maxFloor = g.player.floor = target - 3;
    g.themeIndex = themeIndexFor(target - 3);
    a3.startClimb(target - 3);
    const before3 = a3.transpose;
    // As main.js runs it: the note pump every frame, which play() does not. The rising floor
    // is held well under him: he stands on a ledge below the zone for 16 s first.
    const p = g.player;
    const run3 = (secs, until) => {
      for (let i = 0; i < Math.round(secs / STEP); i++) {
        g.step(STEP);
        g.riseY = Math.min(g.riseY, p.y - 600);
        a3.ctx.currentTime += STEP;
        if (i % 4 === 3) a3.pump();
        if (until && until()) return;
      }
    };
    const stand = g.tower.get(target - 3);
    p.x = p.px = stand.x + stand.w / 2; p.y = p.py = stand.y + 6; p.vx = 0; p.vy = -60; p.grounded = false;
    run3(16);
    const ledge = g.tower.get(target);
    p.x = p.px = ledge.x + ledge.w / 2; p.y = p.py = ledge.y + 6; p.vx = 0; p.vy = -60; p.grounded = false;
    run3(1, () => chimes.length > 0);
    run3(3);
    const c = chimes[0];
    if (!c) { offKey.push(`floor ${target}: no chime`); continue; }
    // The chime is on a downbeat of the music -- notes there are at a bar line -- every
    // note before it is in the old key and every note from it in the new.
    const onBeat = played3.filter((n) => Math.abs(n.t - c.at) < 1e-6);
    const early = played3.filter((n) => n.t < c.at - 1e-6);
    const late = played3.filter((n) => n.t >= c.at - 1e-6);
    const k = keyOf(a3.track, a3.transpose);
    const chimeKey = c.freqs.every((hz) => {
      const m = 12 * Math.log2(hz / 440) + 69;
      return Math.abs(m - Math.round(m)) < 0.03 && k.steps.some((s) => (((Math.round(m) - k.tonic - s) % 12) + 12) % 12 === 0);
    });
    if (!onBeat.length || onBeat.some((n) => n.pos % 16 !== 0)) offKey.push(`floor ${target}: the chime at ${c.at.toFixed(3)}s is not on a bar line of the music`);
    if (early.some((n) => n.key !== before3)) offKey.push(`floor ${target}: the key changed before the chime's downbeat`);
    if (!late.length || late.some((n) => n.key !== a3.transpose)) offKey.push(`floor ${target}: the music from the chime's downbeat is not all at +${a3.transpose}`);
    if (!chimeKey) offKey.push(`floor ${target}: the chime is not in ${a3.track} +${a3.transpose}, the key the music goes on in`);
    if (a3.transpose === before3) offKey.push(`floor ${target}: the key did not step with the zone (+${before3})`);
    steps.push(`${target - 1} +${before3}->+${a3.transpose}`);
  }
  if (offKey.length) fail(`a zone chime out of the key the music goes on in: ${offKey.join('; ')}`);
  if (bad === before) ok(`every track is filed in its own key; ${checked} held pitches of ${VARIANTS.length} effects in 5 keys x 4 transpositions are all in key; a handover keeps the old key until its cut; a chime where the key steps rings on that downbeat in the new key (${steps.join(', ')})`);
}

// ===================================================================================
// 3. LOUD ENOUGH, NOT TOO LOUD  and  4. NO CLIP
// ===================================================================================
const ref = musicReference();
const measured = new Map(VARIANTS.map((v) => [v.id, measure(v, ref)]));
{
  const before = bad;
  const lim = Math.pow(10, LIMITER.threshold / 20);
  for (const v of VARIANTS) {
    const r = measured.get(v.id);
    if (!(r.lu >= r.band[0] && r.lu <= r.band[1])) fail(`${v.id} is ${r.lu.toFixed(1)} LU against the music, outside its band ${r.band.join('..')}`);
    if (r.lu > 3) fail(`${v.id} is ${r.lu.toFixed(1)} LU over the music: loud enough to make someone jump`);
    if (r.pk + ref.peak >= lim) fail(`${v.id} peaks at ${(20 * Math.log10(r.pk)).toFixed(1)} dBFS; on the music's peak that reaches the limiter`);
    // Its whole voice limit at once, all at the same instant: the worst a burst can do.
    const burst = r.pk * (SFX[v.name].limit || 1) + ref.peak;
    if (burst >= lim) fail(`${SFX[v.name].limit} of ${v.id} at once on the music's peak reach ${(20 * Math.log10(burst)).toFixed(1)} dBFS, over the limiter's ${LIMITER.threshold}`);
  }
  // The orderings that carry meaning.
  const lu = (id) => measured.get(id).lu;
  const rising = (label, ids, step = 0) => {
    for (let i = 1; i < ids.length; i++) {
      if (!(lu(ids[i]) >= lu(ids[i - 1]) + step - 0.3)) fail(`${label}: ${ids[i]} (${lu(ids[i]).toFixed(1)}) is not louder than ${ids[i - 1]} (${lu(ids[i - 1]).toFixed(1)})`);
    }
  };
  rising('a longer fall lands harder', ['land-soft', 'land-drop', 'land-heavy'], 1.5);
  rising('the combo drives the bounce', ['wall', 'wall-driven', 'wall-full'], 1.5);
  rising('the jump rises with his speed', ['jump-walk', 'jump-run', 'jump-sprint']);
  rising('a bigger chain pays more', ['payout-tiny', 'payout-small', 'payout-mid', 'payout-big']);
  const fan = VARIANTS.filter((v) => v.name === 'milestone').map((v) => v.id);
  rising('SWIFT to GLORY', fan);
  // ...and longer, as well as louder: the call speeds up a little each milestone, and its
  // last note rang on by less than that saved, so the bigger fanfares were the SHORTER.
  const lens = MILESTONES.map((m, i) => lengthOf(SFX.milestone.make({ x: m.x, i }, keyOf('below'))));
  if (lens.some((l, i) => i && !(l > lens[i - 1]))) fail(`the fanfares do not get longer from SWIFT to GLORY: ${lens.map((l) => l.toFixed(2)).join(' ')} s`);
  if (!(lu(fan[fan.length - 1]) - lu(fan[0]) >= 5)) fail(`GLORY is only ${(lu(fan[fan.length - 1]) - lu(fan[0])).toFixed(1)} LU over SWIFT`);
  if (!(lu('impact-dazed') < lu('impact-splat'))) fail('the dazed landing is louder than the splat');
  const top = VARIANTS.reduce((x, y) => (lu(y.id) > lu(x.id) ? y : x));
  const worst = Math.max(...VARIANTS.map((v) => measured.get(v.id).stacked));
  if (bad === before) {
    ok(`${VARIANTS.length} effects inside their bands against the climb themes (${ref.lufs.toFixed(1)} LUFS in the game): ` +
      `the loudest ${top.id} at ${lu(top.id) >= 0 ? '+' : ''}${lu(top.id).toFixed(1)} LU; landings ${lu('land-soft').toFixed(0)} to ${lu('land-heavy').toFixed(0)}, ` +
      `bounces ${lu('wall').toFixed(0)} to ${lu('wall-full').toFixed(0)}, fanfares ${lu(fan[0]).toFixed(0)} to +${lu(fan[fan.length - 1]).toFixed(0)}; ` +
      `the worst peak on the music's is ${worst.toFixed(1)} dBFS against the limiter's ${LIMITER.threshold}`);
  }
}

// ===================================================================================
// 5. VOICE LIMITS, VARIATION, DUCKING, PAUSE
// ===================================================================================
{
  const before = bad;
  // A burst of every effect: thirty triggers, each just past its shortest gap. At no
  // instant may more of it be sounding than its limit -- counting each playing from its
  // start to the end of its envelope, or to the moment a newer one stole it -- and a
  // stolen one must be silent (under 1% of its level) within 20 ms of being stolen, its
  // sources stopped: a steal is a 15 ms fade, not a cut that clicks and not a pile-up.
  const report = [];
  for (const [name, spec] of Object.entries(SFX)) {
    const a = recordingAudio(5);
    a.track = 'below';
    const spacing = Math.max(0.004, (spec.gap || 0) * 1.05);
    const insts = [];
    for (let i = 0; i < 30; i++) {
      const r = a.sfx(name, name === 'milestone' ? { x: 50, i: 0 } : {});
      if (r && r.out) insts.push({ inst: r, natural: r.end });
      a.ctx.currentTime += spacing;
    }
    let most = 0;
    const end = a.ctx.currentTime + 4;
    for (let t = 0; t < end; t += 0.001) {
      let n = 0;
      for (const { inst } of insts) if (t >= inst.start && t < inst.end) n++;
      most = Math.max(most, n);
    }
    let loud = 0, running = 0;
    for (const { inst, natural } of insts) {
      if (inst.end >= natural) continue;          // it ran its course
      if (levelAt(inst.out.gain, inst.end + 0.02) > inst.level * 0.01) loud++;
      if (inst.srcs.some((s) => !(s.stopAt <= inst.end + 0.03))) running++;
    }
    if (most > (spec.limit || 1)) fail(`a burst of ${name} had ${most} sounding at once; its limit is ${spec.limit}`);
    if (loud) fail(`${loud} stolen ${name} were still sounding 20 ms after the steal`);
    if (running) fail(`${running} stolen ${name} left sources running`);
    if (insts.length < 2 && name !== 'milestone') fail(`a burst of ${name} played only ${insts.length}: the gap is swallowing everything`);
    report.push(`${name} ${most}/${spec.limit}`);
  }
  // The frequent sounds are never twice alike: twenty jumps, twenty different pitches; the
  // tuned ones are never detuned: twenty hops, one pitch.
  const pitches = (name, params) => {
    const a = recordingAudio(21);
    a.track = 'below';
    const out = [];
    for (let i = 0; i < 20; i++) {
      started.length = 0;
      a.sfx(name, params);
      const o = started.find((s) => s.kind === 'osc');
      out.push(o ? o.frequency.events[0][1] : null);
      a.ctx.currentTime += 1;
    }
    return out;
  };
  const jumps = pitches('jump', { power: 0.5 });
  const cents = (x) => 1200 * Math.log2(x / Math.min(...jumps));
  if (new Set(jumps.map((x) => x.toFixed(3))).size < 18) fail(`twenty jumps played only ${new Set(jumps.map((x) => x.toFixed(3))).size} different pitches`);
  if (Math.max(...jumps.map(cents)) > 2 * SFX.jump.vary.cents + 0.5) fail('the jump varies by more than its cents');
  const hops = pitches('hop', { progress: 0.5 });
  if (new Set(hops.map((x) => x.toFixed(3))).size !== 1) fail('the hop, a note of the ladder, is detuned between playings');
  // Only the callout ducks the music.
  for (const name of Object.keys(SFX)) {
    const a = recordingAudio(9);
    a.duckGain.gain.events.length = 0;
    a.sfx(name, name === 'milestone' ? { x: 200, i: 3 } : {});
    const low = a.duckGain.gain.events.filter((e) => e[0] !== 'cancel').reduce((m, e) => Math.min(m, e[1]), 1);
    if (name === 'milestone') {
      if (!SFX.milestone.duck || !(SFX.milestone.duck.db <= -3)) fail('the callout no longer asks the music to make room for it');
      else if (!(Math.abs(20 * Math.log10(low) - SFX.milestone.duck.db) < 0.1)) fail(`the callout ducks the music to ${(20 * Math.log10(low)).toFixed(1)} dB, not ${SFX.milestone.duck.db}`);
      if (levelAt(a.duckGain.gain, 5) !== 1) fail('the music does not come back after the callout');
    } else if (low < 1) fail(`${name} ducks the music`);
  }
  // The pause: its jingle is short enough to ring out before the clock stops; nothing is
  // played while paused; everything plays again after the resume.
  if (lengthOf(SFX.pause.make({}, keyOf('below'))) > PAUSE_HOLD) fail(`the pause jingle is longer than PAUSE_HOLD (${PAUSE_HOLD}s)`);
  {
    const a = recordingAudio(2);
    a.sfxPause();
    a.suspend();
    if (a.sfxJump(0.5)) fail('a jump played while paused');
    a.resumeCtx();
    if (!a.sfxResume() || !a.sfxJump(0.5)) fail('nothing plays after a resume');
  }
  // What is still sounding at the pause goes with the music, before the clock stops under
  // it -- or it is cut mid-waveform and plays on at the resume -- and the pause's own
  // jingle is left to ring.
  {
    const a = recordingAudio(2);
    a.track = 'below';
    a.sfxTheme();
    a.sfxMilestone(MILESTONES[0].x);
    a.ctx.currentTime += 0.3;
    const flying = Object.values(a.live).flat().filter((i) => i.end > a.ctx.currentTime + PAUSE_HOLD);
    const jingle = a.sfxPause();
    a.suspend();
    const stopsAt = a.ctx.currentTime + PAUSE_HOLD;
    const loud = flying.filter((i) => levelAt(i.out.gain, stopsAt) > i.level * 0.01 || i.srcs.some((s) => !(s.stopAt <= stopsAt)));
    if (flying.length < 2) fail('the pause test has nothing in flight to let go of');
    if (loud.length) fail(`${loud.map((i) => i.name).join(' and ')} still sounding when the pause stops the clock`);
    if (!jingle || levelAt(jingle.out.gain, stopsAt) < jingle.level * 0.99) fail('the pause cut its own jingle');
  }
  if (bad === before) ok(`voice limits hold under a burst (${report.join(', ')}); jumps vary by up to ${Math.max(...jumps.map(cents)).toFixed(0)} cents, hops never; only the callout ducks the music (${SFX.milestone.duck.db} dB); the pause rings out and holds everything`);
}

// ===================================================================================
// 6. THE SAMPLE OVERRIDE
// ===================================================================================
{
  const before = bad;
  const buf = (n) => ({ duration: 1.2, name: n });
  const run = (samples, x) => {
    const a = recordingAudio(4);
    a.samples = Object.create(null);
    for (const s of samples) a.samples[s] = buf(s);
    started.length = 0;
    const r = a.sfxMilestone(x);
    const played = started.filter((s) => s.kind === 'buffer' && s.buffer && s.buffer.name).map((s) => s.buffer.name);
    const oscs = started.filter((s) => s.kind === 'osc').length;
    const ducked = a.duckGain.gain.events.some((e) => e[0] === 'lin' && e[1] < 0.9);
    return { r, played, oscs, ducked };
  };
  // By the callouts' own floors (MILESTONES[i].x), never a literal: they were combo counts
  // (100, 150) until the callouts moved to the tower's heights, and literals went stale.
  const [, X1, X2, X3] = MILESTONES.map((m) => m.x);
  const own = run([`milestone${X1}`, 'milestone'], X1);
  if (own.played.join() !== `milestone${X1}` || own.oscs) fail(`with milestone${X1}.ogg on disk the ${X1} callout played ${own.played.join() || 'no sample'} and ${own.oscs} oscillators`);
  if (!own.ducked) fail('a recorded callout does not duck the music');
  const catchAll = run(['milestone'], X2);
  if (catchAll.played.join() !== 'milestone' || catchAll.oscs) fail(`with only milestone.ogg the ${X2} callout played ${catchAll.played.join() || 'no sample'} and ${catchAll.oscs} oscillators`);
  const none = run([], X2);
  if (none.played.length || !none.oscs) fail('with no samples the callout did not play its fanfare');
  // And the names asked for are the names loaded (test-audio.mjs checks main.js loads them).
  const asked = new Set(MILESTONES.flatMap((m) => (SFX.milestone.samples ? SFX.milestone.samples({ x: m.x }) : [])));
  if ([...asked].sort().join() !== [...SAMPLE_NAMES].sort().join()) fail(`the callout asks for ${[...asked].join(' ')}; SAMPLE_NAMES loads ${SAMPLE_NAMES.join(' ')}`);
  // Through the loader, as the page does it: a file dropped into a folder is fetched by
  // loadSamples (.ogg first, then .wav) and decoded, and that callout plays it; the others
  // keep their fanfare. And it is one voice like the fanfare: the next callout lets go of it.
  {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { wav } = await import('./dsp.mjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vytis-sfx-'));
    wav(path.join(dir, `milestone${X2}.wav`), new Float32Array(4410), 1);
    const fetched = [];
    const pageFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      fetched.push(url);
      const f = path.join(dir, path.basename(String(url)));
      return fs.existsSync(f) ? { ok: true, arrayBuffer: async () => fs.readFileSync(f).buffer } : { ok: false };
    };
    try {
      const a = recordingAudio(4);
      const got = await a.loadSamples(SAMPLE_NAMES);
      if (got !== 1) fail(`with milestone${X2}.wav in the folder, loadSamples loaded ${got} samples`);
      if (!fetched.includes(`assets/sfx/milestone${X2}.ogg`) || !fetched.includes(`assets/sfx/milestone${X2}.wav`)) fail(`loadSamples fetched ${fetched.filter((u) => u.includes(String(X2))).join(' ')}, not the .ogg then the .wav`);
      started.length = 0;
      const shout = a.sfxMilestone(X2);
      const bufs = started.filter((s) => s.kind === 'buffer' && s.buffer && s.buffer.name === 'decoded');
      if (bufs.length !== 1 || started.some((s) => s.kind === 'osc')) fail(`the dropped-in file did not replace the ${X2} fanfare (${bufs.length} samples, ${started.filter((s) => s.kind === 'osc').length} oscillators)`);
      a.ctx.currentTime += 0.5;
      started.length = 0;
      a.sfxMilestone(X3);
      if (!started.some((s) => s.kind === 'osc')) fail('a callout with no file of its own did not play its fanfare');
      const t = a.ctx.currentTime + 0.03;
      if (!shout || !shout.out || levelAt(shout.out.gain, t) > shout.level * 0.01 || !(shout.srcs[0].stopAt <= t)) fail('the next callout played over a recorded one instead of taking its voice');
    } finally {
      globalThis.fetch = pageFetch;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (bad === before) ok(`a recorded callout beats the fanfare (its own file first, then milestone.ogg) and still ducks the music; with none, the fanfare plays; ` +
    `a file dropped in a folder is found, loaded and played by loadSamples, and gives up its voice to the next callout`);
}

void COMPANION_KEY;
console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
