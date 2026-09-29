// Render the climb themes and the menu to WAV files, offline, so they can be listened to
// without launching the game. Nothing here plays a sound: it writes files.
//
//   node tools/render-music.mjs --out=<folder>                every preview
//   node tools/render-music.mjs --out=<folder> --only=above   one theme (or --only=menu)
//   node tools/render-music.mjs --out=<folder> --gameover     the lament and deaths into it
//
// --gameover is rendered from the engine itself, not mirrored: see the end of this file.
//
// Writes, into <folder>:
//   stage1-below.wav, stage2-above.wav, stage3-heavens.wav
//       one full loop at a steady climb's intensity (0.2: x0.96, a little under the
//       written tempo), then a second pass with the run going hard (0.6, the tempo easing
//       up to x1.09 by the loop's end and the choir swelling), then the tail. (The pass was
//       x1.00 and x1.26 while TEMPO_MAX was x1.70; tempoTargetFor in audio.js says now.)
//   menu.wav
//       the menu as the title screen plays it, at intensity 0: one full loop and the
//       first four bars of the next, so the way back into the fanfare is heard.
//   handover-below-to-above.wav, handover-above-to-heavens.wav
//       the outgoing theme in the key it has reached by the end of its stage in the
//       first cycle (+7 and +3), the zone's arrival with its chime, the handover, and
//       the new stage's theme from its first bar in its home key.
//   with --gameover, instead: lament-twice.wav (the lament from its fall, landing 2.2 s
//       in, round the loop twice), death-*.wav (a climb cut down into it and the stab
//       landed on the impact: every stage, two rungs of the key ladder, a fall during a
//       stage handover, and a fall skipped with Space) and climb-again.wav (the
//       scoreboard, then Space and the next run).
//
// The rendering itself -- the scheduler, the voices, the bus -- is tools/music-render.mjs,
// which mirrors the engine in src/render/audio.js; the oscillators, filters and loudness
// meter are tools/dsp.mjs. The sound effects have their own previews: tools/render-sfx.mjs.
//
// The three theme files and the menu get ONE shared gain, set so the loudest theme peaks
// at -1 dBFS, so they can be compared with each other at the level they have in the game.
// The handover files are normalised on their own (see the end of this file).

import fs from 'node:fs';
import path from 'node:path';
import { loudness, rms, peak, db, wav } from './dsp.mjs';
import { themePreview, menuPreview, handoverPreview } from './music-render.mjs';
import { renderEffect, sfxBus } from './sfx-render.mjs';
import { TRACKS } from '../src/render/tracks.js';

const arg = (k) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : null;
};
const OUT = arg('out');
if (!OUT) { console.log('usage: node tools/render-music.mjs --out=<folder> [--only=below,above,heavens,menu]'); process.exit(1); }
const ONLY = arg('only') ? arg('only').split(',') : null;

/**
 * The zone's chime (SFX.zone) on the bar line the zone lands on, through the effects bus,
 * in the key the OUTGOING theme is playing -- which is the key the game tunes it to, the
 * handover's cut not having come when the chime sounds (Audio.keyNow).
 */
const chimeIn = (track, transpose) => (buf, arrive) => {
  const sfx = new Float32Array(buf.length);
  renderEffect(sfx, 'zone', {}, { at: arrive, track, transpose });
  sfxBus(sfx);
  for (let i = 0; i < buf.length; i++) buf[i] += sfx[i];
};
// --- the lament, and deaths into it -----------------------------------------------------
/**
 * The lament and the handover into it are decided by the engine as it plays -- where the
 * climb is cut, what key the lament takes from it, what the impact's resetKeys() leaves
 * alone -- so these are not mirrored like the themes above. They are the engine's own
 * output: src/render/audio.js driven through the calls the game makes at a death (the hooks
 * render/gamesounds.js installs, and main.js's intensity each frame), into a recording
 * AudioContext, and that recording played back (tools/engine-render.mjs).
 *
 * Written at the climb themes' gain, the one stage1-below.wav and the others get, so they
 * can be set side by side with those at the level they have in the game.
 */
async function gameoverPreviews(out, gain) {
  const R = await import('./engine-render.mjs');
  R.installRecorder();
  const { Audio, keyFromCut, LOOPS, STOP_RELEASE } = await import('../src/render/audio.js');
  const { IMPACT_HOLD } = await import('../src/game/constants.js');
  const G = TRACKS.gameover;
  const FR = 1 / 60;
  const lines = [];
  const write = (file, buf, from, to) => {
    const b = buf.subarray(Math.max(0, Math.round(from * R.SR)), Math.min(buf.length, Math.round(to * R.SR)));
    R.wav(path.join(out, file), b, gain);
    return b;
  };
  const sign = (k) => (k > 0 ? `+${k}` : `${k}`);

  // The lament on its own, twice round: as a death plays it -- the fall landing 2.2 s in
  // (a 2.45 s fall, the lament cut in 0.25 s after the catch), the tempo held at the
  // written 72 through it and the 3.2 s the body lies there, then eased to the
  // scoreboard's -- from its first note to the end of its loop's second time round.
  {
    const a = new Audio();
    a.init();
    a.playTrack('gameover');
    const LAND_AT = 2.2;
    const intro = G.intro * 16, loop = LOOPS.gameover.lead - intro;
    const marks = [intro, intro + loop, intro + 2 * loop];
    const at = [];
    let t = 0, stab = null;
    while (at.length < marks.length && t < 200) {
      t += FR; a.ctx.currentTime = t;
      if (stab === null && t >= LAND_AT) { a.landLament(); stab = a.landing.at; }
      if (t >= LAND_AT + IMPACT_HOLD) a.setIntensity(0, FR);
      a.pump();
      const c = a.clock;
      const pos = c.pos + (t - c.at) / c.sixteenth;
      while (stab !== null && at.length < marks.length && pos >= marks[at.length]) at.push(t - (pos - marks[at.length]) * c.sixteenth);
    }
    const end = at[2] + 3;
    // Round the loop a third time, so the second pass's last notes ring into the next
    // bar as they do in the game, then trimmed to three seconds past the second pass.
    while (t < end) { t += FR; a.ctx.currentTime = t; a.setIntensity(0, FR); a.pump(); }
    const buf = R.renderContext(a.ctx, end);
    write('lament-twice.wav', buf, 0, end);
    const [i1, i2] = [Math.round(at[1] * R.SR), Math.round(at[2] * R.SR)];
    lines.push(`  lament-twice.wav  ${end.toFixed(1)}s: the fall ${(0.08).toFixed(2)}-${stab.toFixed(2)}s, the stab at ${stab.toFixed(2)}s, the loop from ${at[0].toFixed(2)}s, ` +
      `round again (the seam) at ${at[1].toFixed(2)}s, the second pass ends ${at[2].toFixed(2)}s; second pass ${R.loudness(buf, i1, i2).toFixed(1)} LUFS, ` +
      `rms ${R.dB(R.rms(buf, i1, i2)).toFixed(1)} dBFS, peak ${R.dB(R.peak(buf, i1, i2)).toFixed(1)} dBFS in game, ${R.dB(R.peak(buf, i1, i2) * gain).toFixed(1)} in the file`);
  }

  // Deaths: each stage's theme cut at two places, at two rungs of the key ladder, and one
  // during a stage handover. From four seconds before the fall to fourteen after: the cut,
  // the fall, the landing, the impact and the loop's first bars. (Three of them had a
  // companion's lift on top, up to +12 in all; companions no longer move the key.)
  const deaths = [
    ['death-below-band0.wav', { floor: 120, key: 0, fallAt: 7.93 }, 'below, floor 120 in its home key; a dazed fall'],
    ['death-below-band4.wav', { floor: 850, fallAt: 27.31 },
      'below, floor 850 (DOWNTOWN, the fifth rung, +7): the death that used to start at +12 with the archer and drop to E at the impact'],
    ['death-above-band0.wav', { floor: 950, fallAt: 9.62 }, 'above, floor 950 (CITADEL, home key)'],
    ['death-above-band2.wav', { floor: 1350, fallAt: 24.18 }, 'above, floor 1350 (ABYSS, the third rung, +3)'],
    ['death-heavens-band0.wav', { floor: 1600, fallAt: 12.44 }, 'heavens, floor 1600 (NEBULA, home key)'],
    ['death-heavens-band3.wav', { floor: 2150, fallAt: 31.66 }, 'heavens, floor 2150 (ZENITH, the fourth rung, +5)'],
    // Past BELOW's first loop: a theme is not handed over sooner (THEME_MIN_LOOPS).
    ['death-during-stage-handover.wav', { floor: 850, climbTo: [56.2, 900], fallAt: 57.4 },
      'below at floor 850 (+7) reaching CITADEL at 56.2 s, falling 1.2 s later, before the stage handover\'s bar line'],
    // Space during the fall: no impact, and the stab comes with the scoreboard.
    ['death-below-skipped.wav', { floor: 450, fallAt: 13.37, skip: 0.8 }, 'below, floor 450, the fall skipped 0.8 s in'],
  ];
  for (const [file, opt, what] of deaths) {
    const until = opt.fallAt + 14;
    const r = R.playDeath(Audio, { ...opt, until, intensity: 0.45 });
    const buf = R.renderContext(r.ctx, until);
    write(file, buf, opt.fallAt - 4, until);
    const key = keyFromCut('gameover', r.heard.track, r.heard.transpose);
    const n = (s) => Math.round(s * R.SR);
    const before = R.loudness(buf, n(opt.fallAt - 4), n(opt.fallAt));
    const fall = R.loudness(buf, n(r.cut), n(r.stab.at));
    const stab = R.loudness(buf, n(r.stab.at), n(r.stab.at + 0.4));
    const after = R.loudness(buf, n(r.stab.at + 3.4), n(until));
    const landed = opt.skip ? `skipped at ${(4 + opt.skip).toFixed(2)}s, the stab with the scoreboard at ${(4 + r.stab.at - r.fall).toFixed(2)}s`
      : `impact at ${(4 + r.impact - r.fall).toFixed(2)}s, the stab at ${(4 + r.stab.at - r.fall).toFixed(2)}s (${Math.round((r.stab.at - r.impact) * 1000)} ms after it), scoreboard at ${(4 + r.dead - r.fall).toFixed(2)}s`;
    lines.push(`  ${file.padEnd(34)} ${what}. The fall at 4.00s in the file; the climb (${r.heard.track}, ${sign(r.heard.transpose)}) ` +
      `cut on its beat ${(r.cut - r.fall).toFixed(2)}s later; the lament at ${sign(key)} (${['E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#'][((key % 12) + 12) % 12]} minor); ` +
      `${landed}; climb ${before.toFixed(1)} LUFS before, the fall ${fall.toFixed(1)}, the stab's first 0.4 s ${stab.toFixed(1)}, ` +
      `the loop ${after.toFixed(1)}`);
  }

  // Climbing again: the scoreboard's loop, then Space -- startRun() resets the keys, stops
  // the music and starts the climb -- and the next run's first bars. A lament in F minor
  // (out of THE WORLD ABOVE at +3) into the march in E, a semitone apart, so a lament note
  // left ringing would be heard as one.
  {
    const opt = { floor: 1350, fallAt: 24.18 };
    const T = opt.fallAt + 15.1;
    const r = R.playDeath(Audio, { ...opt, until: T, intensity: 0.45 });
    const a = r.audio;
    a.resetKeys();
    a.stopMusic();
    a.startClimb(0);
    let t = T;
    while (t < T + 6) { t += FR; r.ctx.currentTime = t; a.setIntensity(0.1, FR); a.pump(); }
    const buf = R.renderContext(r.ctx, T + 6);
    write('climb-again.wav', buf, T - 6, T + 6);
    lines.push(`  climb-again.wav                    the scoreboard's lament (${sign(keyFromCut('gameover', r.heard.track, r.heard.transpose))}), ` +
      `then Space at 6.00s in the file: the lament released over ${STOP_RELEASE}s, the march from floor 0 in E`);
  }
  for (const l of lines) console.log(l);
}

if (process.argv.includes('--gameover')) {
  // The climb themes are rendered only for their peak, which sets the gain every preview
  // shares; they are not written.
  const climbPeak = Math.max(...['below', 'above', 'heavens'].map((n) => peak(themePreview(n).out)));
  const g = Math.pow(10, -1 / 20) / climbPeak;
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`  the climb themes' gain, +${db(g)} dB: these files sit at the level of stage1-below.wav and the others`);
  await gameoverPreviews(OUT, g);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const THEMES = [['below', 'stage1-below.wav'], ['above', 'stage2-above.wav'], ['heavens', 'stage3-heavens.wav']]
  .filter(([n]) => !ONLY || ONLY.includes(n));
const previews = THEMES.map(([name, file]) => ({ ...themePreview(name), file }));
const handovers = ONLY ? [] : [
  { ...handoverPreview('below', 'above', 7, chimeIn('below', 7)), file: 'handover-below-to-above.wav' },
  { ...handoverPreview('above', 'heavens', 3, chimeIn('above', 3)), file: 'handover-above-to-heavens.wav' },
];
const menu = !ONLY || ONLY.includes('menu') ? { ...menuPreview(), file: 'menu.wav' } : null;

// One gain for every file, from the loudest climb theme -- or from the menu, rendered alone.
const loudest = Math.max(...(previews.length ? previews : [menu]).map((p) => peak(p.out)));
const gain = Math.pow(10, -1 / 20) / loudest;
console.log(`  shared gain +${db(gain)} dB (the game's music bus peaks at ${db(loudest)} dBFS before the limiter, ` +
  `whose threshold is -6: it is never reached by the music alone)`);
if (menu) {
  // Measured at the gain a FULL run gives the three climb themes, whatever --only asked
  // for, because the menu's loudness means something only next to theirs (-13.8 to
  // -14.9 LUFS). It was measured at `gain` above, which with --only=menu is the menu's
  // own -- its hotter peak set to -1 dBFS -- and read -16.8 LUFS for a menu that measures
  // -14.2 in a full run: 2.6 LU of apparent shortfall that a level pass would have
  // "fixed" by making it too loud. The missing themes are rendered to find their peak
  // (about a second each) and not written.
  const climbPeak = Math.max(...['below', 'above', 'heavens'].map((n) =>
    peak((previews.find((p) => p.name === n) || themePreview(n)).out)));
  const ref = Math.pow(10, -1 / 20) / climbPeak;
  // At the themes' gain, unless that would clip the file; the in-game peak is printed as well.
  const g = Math.min(ref, Math.pow(10, -1 / 20) / peak(menu.out));
  wav(path.join(OUT, menu.file), menu.out, g);
  const part = (from, to) => loudness(menu.out.subarray(from, to), ref).toFixed(1);
  const l = menu.levels;
  console.log(`  ${menu.file.padEnd(30)} ${menu.seconds.toFixed(1)}s: one loop to ${menu.turn.toFixed(1)}s ` +
    `(${menu.loopSecs.toFixed(1)}s at ${menu.heard.toFixed(0)} bpm as heard, ${menu.bpm} written), then four bars of the next; ` +
    `in game it peaks at ${db(peak(menu.out))} dBFS before the limiter; at the climb themes' gain peak ` +
    `${db(peak(menu.out) * ref)} dBFS, loudness ${part(menu.sections[0][1], menu.sections[2][2])} LUFS over the loop -- ` +
    `${menu.sections.map(([label, from, to]) => `${label} ${part(from, to)}`).join(', ')}` +
    `${g < ref ? `; written ${db(ref / g)} dB under the themes' gain so it does not clip` : ''}; ` +
    `voice rms lead ${db(l.lead)} bass ${db(l.bass)} choir ${db(l.choir)} brass ${db(l.brass)} dB`);
}
for (const p of previews) {
  wav(path.join(OUT, p.file), p.out, gain);
  const l = p.levels;
  console.log(`  ${p.file.padEnd(30)} ${p.seconds.toFixed(1)}s: loop 1 to ${p.turn.toFixed(1)}s at ${p.bpm} bpm, ` +
    `loop 2 to ${p.end.toFixed(1)}s at ${(p.bpm * p.secondTempo).toFixed(0)} bpm; peak ${db(peak(p.out) * gain)} dBFS, ` +
    `rms ${db(rms(p.out) * gain)} dBFS, loudness ${loudness(p.out, gain).toFixed(1)} LUFS; ` +
    `voice rms lead ${db(l.lead)} bass ${db(l.bass)} choir ${db(l.choir)} dB`);
}
// The handovers carry the zone chime. It used to peak three dB over the music and would
// have clipped at the themes' gain, so each file is set to peak at -1 dBFS on its own if
// it has to -- which keeps the chime and the music at their true relative levels.
for (const h of handovers) {
  const g = Math.min(gain, Math.pow(10, -1 / 20) / peak(h.out));
  wav(path.join(OUT, h.file), h.out, g);
  console.log(`  ${h.file.padEnd(30)} ${h.seconds.toFixed(1)}s: the zone arrives at ${h.arrive.toFixed(1)}s, ` +
    `the new theme's downbeat at ${h.T.toFixed(2)}s (a ${(h.T - h.arrive).toFixed(2)}s fade); ` +
    `own gain +${db(g)} dB, ${db(gain / g)} dB under the themes' level`);
}
