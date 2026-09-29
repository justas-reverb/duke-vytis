// The sound effects, rendered offline exactly as Audio.sfx plays them: the same voices
// from src/render/sfx.js, the same automation, filters and noise, through the same bus
// (SFX_BUS, then the master). tools/render-sfx.mjs writes them to WAV; tools/test-sfx.mjs
// measures them against the music; tools/render-music.mjs puts the zone chime into its
// handover previews.
//
// What it adds is what WebAudio does inside the browser, as tools/dsp.mjs does for the
// music: band-limited oscillators, the BiquadFilter responses, a sine LFO summed into the
// frequency, and a looped noise buffer. One difference is deliberate: the game starts a
// noise voice at a random point in its loop and gives each playing a random detune, delay
// and level (the effect's `vary`); here nothing is random unless asked, so a render is the
// same twice and a measurement is repeatable.

import { SFX, keyOf, noiseSamples, holdFor } from '../src/render/sfx.js';
import { SFX_BUS, MUSIC_BUS } from '../src/render/audio.js';
import { SR, NORM, wave, automation, biquad, lowpass, loudness, maxLoudness, peak } from './dsp.mjs';
import { themePreview } from './music-render.mjs';
import { landWeight, payoutSize } from '../src/render/sfx.js';
import { MILESTONES } from '../src/game/combo.js';
import { COMPANION_KEY } from '../src/render/compsprites.js';

const NOISE_LEN = Math.floor(SR * 1.5);   // the engine's noise buffer: 1.5 s, looped
const noiseCache = new Map();
function noiseLoop(rate) {
  const hold = holdFor(rate, SR);
  if (!noiseCache.has(hold)) noiseCache.set(hold, noiseSamples(NOISE_LEN, hold));
  return noiseCache.get(hold);
}

/**
 * Add one voice into `buf`, triggered at `t0` seconds: its source, its filter, its
 * envelope. `ratio` detunes every frequency in it, as the engine's `vary.cents` does;
 * `offset` is where in its loop a noise voice starts, in seconds.
 */
export function renderVoice(buf, v, t0, { ratio = 1, gain = 1, offset = 0 } = {}) {
  const n0 = Math.max(0, Math.ceil((t0 + v.at) * SR));
  const n1 = Math.min(buf.length, Math.ceil((t0 + v.stop) * SR));
  if (n1 <= n0) return;
  const len = n1 - n0;
  const x = new Float32Array(len);
  if (v.type === 'noise') {
    const src = noiseLoop(v.rate);
    const o = Math.floor(offset * SR);
    for (let i = 0; i < len; i++) x[i] = src[(o + i) % src.length];
  } else {
    const shift = (ev) => ev.map(([k, val, t]) => [k, val, t + t0]);
    const f = automation(shift(v.f), 440);
    const depth = v.lfo ? (typeof v.lfo.depth === 'number' ? () => v.lfo.depth : automation(shift(v.lfo.depth), 0)) : null;
    const norm = NORM[v.type];
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = (n0 + i) / SR;
      let hz = f(t) * ratio;
      if (depth) hz += depth(t) * Math.sin(2 * Math.PI * v.lfo.hz * (t - (t0 + v.at)));
      const dt = Math.max(0, hz) / SR;
      x[i] = wave(v.type, ph, dt) * norm;
      ph += dt;
      if (ph >= 1) ph -= 1;
    }
  }
  if (v.filter) {
    const ff = v.filter.f;
    const hzAt = typeof ff === 'number'
      ? () => ff * ratio
      : (() => { const a = automation(ff.map(([k, val, t]) => [k, val, t + t0]), 350); return (t) => a(t) * ratio; })();
    // The filter runs on the voice's own samples, whose first is at n0.
    const shifted = (t) => hzAt(t + n0 / SR);
    biquad(x, v.filter.type, shifted, v.filter.q);
  }
  const g = automation(v.g.map(([k, val, t]) => [k, val, t + t0]), 0);
  for (let i = 0; i < len; i++) buf[n0 + i] += x[i] * g((n0 + i) / SR) * gain;
}

/**
 * Effect `name` with `params`, in the key of `track` at `transpose`, into a buffer of
 * `seconds` at `at` -- at the effect's own level and before the bus. `level` overrides
 * the table's (the calibration in render-sfx uses 1).
 */
export function renderEffect(buf, name, params = {}, { at = 0, track = 'below', transpose = 0, level = null, ratio = 1 } = {}) {
  const spec = SFX[name];
  const voices = spec.make(params, keyOf(track, transpose));
  const lvl = level === null ? spec.level : level;
  voices.forEach((v, i) => renderVoice(buf, v, at, { ratio, gain: lvl, offset: (i * 0.37) % 1.4 }));
  return voices;
}

/** The SFX bus, in place: sfxGain, the low-pass, the master. What reaches the limiter. */
export function sfxBus(buf) {
  for (let i = 0; i < buf.length; i++) buf[i] *= SFX_BUS.gain;
  lowpass(buf, SFX_BUS.tone.hz, SFX_BUS.tone.q);
  for (let i = 0; i < buf.length; i++) buf[i] *= MUSIC_BUS.master;
  return buf;
}

/** One effect alone, through the bus, at the level it reaches the limiter in the game. */
export function effectAtMaster(name, params = {}, opts = {}) {
  const spec = SFX[name];
  const voices = spec.make(params, keyOf(opts.track || 'below', opts.transpose || 0));
  const seconds = voices.reduce((m, v) => Math.max(m, v.stop), 0) + 0.25 + (opts.at || 0);
  const buf = new Float32Array(Math.ceil(seconds * SR));
  renderEffect(buf, name, params, opts);
  return sfxBus(buf);
}

// --- the music they are measured against ----------------------------------------------
/**
 * The climb themes' loudness in the game, and the loudest of their peaks: the reference
 * every effect is measured against, and the gain the music previews are written at. The
 * same previews tools/render-music.mjs writes -- a loop at a steady climb, a loop with
 * the run going hard -- so the numbers are the ones it prints (-13.8 to -14.9 LUFS at
 * its +21 dB).
 */
export function musicReference() {
  const themes = ['below', 'above', 'heavens'].map((n) => themePreview(n));
  const lufs = themes.map((t) => loudness(t.out));
  // The mean of the three in power, which is what "the music's loudness" means across a run.
  const mean = 10 * Math.log10(lufs.reduce((s, l) => s + Math.pow(10, l / 10), 0) / lufs.length);
  const top = Math.max(...themes.map((t) => peak(t.out)));
  return { lufs: mean, each: lufs, peak: top, gain: Math.pow(10, -1 / 20) / top };
}

// --- what to render ---------------------------------------------------------------------
// Every variant a player can meet that sounds different: the jump at three speeds, the
// landing at three heights, the bounce at three drives, the seven fanfares... Each with the
// key it is heard in (`track`, `transpose`) and a line on what it is for.
const V = (id, name, params, purpose, opts = {}) => ({ id, name, params, purpose, track: 'below', transpose: 0, ...opts });
const MS = MILESTONES;
export const VARIANTS = [
  V('menu-move', 'menuMove', {}, 'the menus: moving between options, pages, values', { track: 'menu' }),
  V('menu-select', 'menuSelect', {}, 'the menus: choosing (a screen, a new run)', { track: 'menu' }),
  V('menu-back', 'menuBack', {}, 'the menus: going back', { track: 'menu' }),
  V('menu-erase', 'menuErase', {}, 'the awards wiped (R, R on the stats screen)', { track: 'menu' }),
  V('jump-walk', 'jump', { power: 0 }, 'a jump from a standstill or a walk'),
  V('jump-run', 'jump', { power: 0.5 }, 'a jump at half speed'),
  V('jump-sprint', 'jump', { power: 1 }, 'a jump at full speed'),
  V('land-soft', 'land', { weight: landWeight(40) }, 'landing from an ordinary hop (a 40-unit drop)'),
  V('land-drop', 'land', { weight: landWeight(160) }, 'landing from a longer drop (160 units, five floors)'),
  V('land-heavy', 'land', { weight: 1 }, 'landing from a fall of ten floors or more'),
  V('double', 'double', {}, 'the first air jump (TWICE)'),
  V('triple', 'triple', {}, 'the third air jump (THRICE!), unlocked by a sustained combo'),
  V('wall', 'wall', { speed: 220, boost: 0 }, 'a wall bounce with no combo driving it'),
  V('wall-driven', 'wall', { speed: 280, boost: 0.5 }, 'a wall bounce half-driven by the combo (BOUNCE!)'),
  V('wall-full', 'wall', { speed: 330, boost: 1 }, 'a wall bounce at full combo drive (the white BOUNCE!)'),
  V('wallkick', 'wallkick', {}, 'running into a wall on the ground'),
  V('hop-first', 'hop', { progress: 0.04, first: true }, 'the chain opening: the first hop that clears two floors'),
  ...[0, 2, 4, 6, 7].map((d) => V(`hop-${d}`, 'hop', { progress: (d + 0.5) / 8 },
    `a hop in the chain, step ${d} of the ladder to the next multiplier step`)),
  V('hop-step', 'hop', { progress: 0.1, step: true }, 'the hop that crosses a multiplier step (x1.5 at 50 floors of chain, x2 at 100, ...): the step claimed at the top of the ladder'),
  V('combo-end', 'comboEnd', {}, 'the chain ending (it is banked)'),
  V('payout-tiny', 'payout', { size: payoutSize(2) }, 'the payout of the shortest chain, one hop of two floors'),
  V('payout-small', 'payout', { size: payoutSize(6) }, 'the payout of a 6-floor chain'),
  V('payout-mid', 'payout', { size: payoutSize(60) }, 'the payout of a 60-floor chain'),
  V('payout-big', 'payout', { size: payoutSize(320) }, 'the payout of a 320-floor chain'),
  ...MS.map((m, i) => V(`milestone-${i + 1}-${m.name.toLowerCase()}`, 'milestone', { x: m.x, i },
    `the callout at floor ${m.x} of each lap of the tower: ${m.name}`)),
  V('zone', 'zone', {}, 'a new zone arriving (its title comes up)'),
  V('zone-above', 'zone', {}, 'the same chime in THE WORLD ABOVE (D minor)', { track: 'above' }),
  V('zone-heavens', 'zone', {}, 'the same chime in THE HEAVENS (E Lydian)', { track: 'heavens' }),
  V('join', 'join', {}, 'a companion joining, here with the music a fourth up (+5, where BELOW is in SWAMP)', { transpose: 5 }),
  // The two speak variants are rendered with the music lifted by the speaker's own
  // COMPANION_KEY, from when a companion lifted the whole piece into their key while they
  // climbed with you. Since 4fbe0f9 they do not: in the game a companion speaks over
  // whatever rung the zones have reached, 0 to +7 over the theme's home key. The archer's
  // +5 is still a rung (SWAMP's in BELOW); the maiden's -5 is a transpose the climb's music
  // never takes now. The transposes are left as they were measured.
  V('speak-archer', 'speak', { voice: COMPANION_KEY.archer, syllables: 3 }, 'a companion starting a line: the archer', { transpose: COMPANION_KEY.archer }),
  V('speak-maiden', 'speak', { voice: COMPANION_KEY.maiden, syllables: 4, seed: 2 }, 'a companion starting a line: the maiden, lower', { transpose: COMPANION_KEY.maiden }),
  V('slip', 'slip', {}, 'a companion losing their grip and falling away'),
  V('climb', 'climb', {}, 'CLIMB!: the rising floor is close'),
  V('pause', 'pause', {}, 'the game paused'),
  V('resume', 'resume', {}, 'the game resumed'),
  V('catch', 'catch', {}, 'the rising floor catching him'),
  V('scream', 'scream', {}, 'the death fall: the wail, until he lands or the fall is skipped', { track: 'gameover' }),
  V('fall-wall', 'fallWall', {}, 'his body glancing off a wall on the way down'),
  V('impact-splat', 'impact', { splat: true, severity: 0.25 }, 'the splat, from a death around floor 300', { track: 'gameover' }),
  V('impact-splat-far', 'impact', { splat: true, severity: 1 }, 'the splat, from a death at floor 650 or higher', { track: 'gameover' }),
  V('impact-dazed', 'impact', { splat: false }, 'the dazed landing, a death under floor 200', { track: 'gameover' }),
  V('gameover', 'gameover', {}, 'the scoreboard coming up', { track: 'gameover' }),
  V('record', 'record', {}, 'a new record on the scoreboard', { track: 'gameover' }),
  V('unlock', 'unlock', {}, 'an award unlocked', { track: 'gameover' }),
];

/** The variant each effect's level is calibrated on: an ordinary one. */
export const REFERENCE = {
  jump: { power: 0.5 }, land: { weight: 0.3 }, wall: { speed: 280, boost: 0.5 }, hop: { progress: 0.5 },
  payout: { size: 0.4 }, milestone: { x: MS[3].x, i: 3 }, impact: { splat: true, severity: 0.5 },
  speak: { syllables: 3 },
};

/** One variant through the bus, and what it measures against the music. */
export function measure(v, ref) {
  const buf = effectAtMaster(v.name, v.params, { track: v.track, transpose: v.transpose });
  const m = maxLoudness(buf);
  const s = maxLoudness(buf, 1, 0.1);
  const pk = peak(buf);
  return {
    buf, m, s, pk,
    lu: m - ref.lufs,
    // The worst case: the effect's peak landing on the music's, both at full scale.
    stacked: 20 * Math.log10(pk + ref.peak),
    band: SFX[v.name].band,
  };
}
