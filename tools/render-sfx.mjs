// Render every sound effect to WAV, offline, so they can be listened to without launching
// the game -- one file each, a tour of them all in a sensible order, the same tour over
// the music, and a README saying what each is for. Nothing here plays a sound: it writes
// files.
//
//   node tools/render-sfx.mjs --out=<folder>
//   node tools/render-sfx.mjs --calibrate        print each effect's level for its band
//
// The effects go through the game's own bus (tools/sfx-render.mjs mirrors Audio.sfx), and
// every file is written at the SAME gain as the music previews (tools/render-music.mjs:
// the loudest climb theme's peak at -1 dBFS), so an effect in a file is exactly as loud
// against stage1-below.wav as it is against the music in the game. Their loudness is
// printed against the climb themes' (about -14 LUFS at that gain): the maximum
// MOMENTARY loudness, BS.1770's 400 ms window, which is how a short sound is put on the
// scale of a programme's integrated loudness -- and which is why a 50 ms tick reads 8 dB
// under how loud it is while it sounds. Each effect's band (SFX in src/render/sfx.js) is
// on that scale, and tools/test-sfx.mjs holds them there.
//
// --calibrate prints, for each effect, the level that puts its reference variant at the
// middle of its band: how the levels in SFX were set. Nobody here can listen; this is
// the part of mixing that can be done by measurement.

import fs from 'node:fs';
import path from 'node:path';
import { SR, maxLoudness, peak, db, wav } from './dsp.mjs';
import { bedPreview } from './music-render.mjs';
import {
  effectAtMaster, renderEffect, sfxBus, musicReference, measure, VARIANTS, REFERENCE,
} from './sfx-render.mjs';
import { SFX } from '../src/render/sfx.js';
import { LIMITER } from '../src/render/audio.js';
import { MILESTONES } from '../src/game/combo.js';

const arg = (k) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : null;
};
const OUT = arg('out');
const CALIBRATE = process.argv.includes('--calibrate');
if (!OUT && !CALIBRATE) {
  console.log('usage: node tools/render-sfx.mjs --out=<folder>   |   --calibrate');
  process.exit(1);
}

// --- calibrate --------------------------------------------------------------------------
if (CALIBRATE) {
  const ref = musicReference();
  console.log(`  the climb themes: ${ref.each.map((l) => l.toFixed(1)).join(' / ')} LUFS in the game, ` +
    `${ref.lufs.toFixed(1)} together; peak ${db(ref.peak)} dBFS`);
  for (const name of Object.keys(SFX)) {
    const spec = SFX[name];
    const buf = effectAtMaster(name, REFERENCE[name] || {}, { level: 1, track: name.startsWith('menu') ? 'menu' : 'below' });
    const m = maxLoudness(buf);
    const want = ref.lufs + (spec.band[0] + spec.band[1]) / 2;
    const level = Math.pow(10, (want - m) / 20);
    console.log(`  ${name.padEnd(11)} at level 1: ${(m - ref.lufs).toFixed(1).padStart(6)} LU; ` +
      `band ${spec.band.join('..')}, centre wants level ${level.toFixed(3)} (table ${spec.level})`);
  }
  process.exit(0);
}

// --- the tour ---------------------------------------------------------------------------
// Roughly in the order a player meets them: the title screen, a climb, a chain, the
// callouts (laid out when they were a chain's, see below), the places the tower takes
// him, the companions, the scare, a pause, the death and the scoreboard. A short gap
// between each, so each is heard on its own.
const TOUR = [
  ['menu', ['menu-move', 'menu-move', 'menu-select', 'menu-back', 'menu-erase']],
  ['climb', ['jump-walk', 'land-soft', 'jump-run', 'land-drop', 'jump-sprint', 'double', 'triple', 'land-heavy',
    'wallkick', 'wall', 'wall-driven', 'wall-full']],
  ['chain', ['hop-first', 'hop-0', 'hop-2', 'hop-4', 'hop-6', 'hop-7',
    'milestone-1-swift', 'combo-end', 'payout-tiny', 'payout-small', 'payout-mid', 'payout-big']],
  // The chain's step mark last. It was put here because it was heard only past GLORY while
  // the callouts were the combo's steps; it marks every multiplier step of a chain now, and
  // SWIFT is no longer a chain's either (the callouts are the tower's heights). The tour's
  // order has not been changed to match.
  ['callouts', [...MILESTONES.map((m, i) => `milestone-${i + 1}-${m.name.toLowerCase()}`), 'hop-step']],
  ['the tower', ['zone', 'zone-above', 'zone-heavens', 'join', 'speak-archer', 'speak-maiden', 'slip', 'climb',
    'pause', 'resume']],
  ['the death', ['catch', 'scream', 'fall-wall', 'impact-splat', 'impact-splat-far', 'impact-dazed',
    'gameover', 'record', 'unlock']],
];
const GAP = 0.6;           // s of silence after each sound's tail
const SECTION_GAP = 1.5;   // s between sections

const ref = musicReference();
fs.mkdirSync(OUT, { recursive: true });
const byId = new Map(VARIANTS.map((v) => [v.id, v]));
const results = new Map();
for (const v of VARIANTS) results.set(v.id, measure(v, ref));

// The tour: every sound in order, with its start time for the README.
const timeline = [];
let t = 0.5;
for (const [section, ids] of TOUR) {
  for (const id of ids) {
    const v = byId.get(id);
    const len = results.get(id).buf.length / SR - 0.25;   // effectAtMaster pads 0.25 s
    timeline.push({ section, id, at: t, len, v });
    t += len + GAP;
  }
  t += SECTION_GAP - GAP;
}
// Every variant is in the tour: two added to VARIANTS once were written as files and left
// out of it, and the tour is what the listener is pointed at first.
const untoured = VARIANTS.filter((v) => !timeline.some((e) => e.id === v.id)).map((v) => v.id);
if (untoured.length) { console.log(`  not in the tour: ${untoured.join(', ')} -- add them to TOUR`); process.exit(1); }
const tourLen = t + 0.5;
const tour = new Float32Array(Math.ceil(tourLen * SR));
for (const e of timeline) {
  const b = new Float32Array(tour.length);
  renderEffect(b, e.v.name, e.v.params, { at: e.at, track: e.v.track, transpose: e.v.transpose });
  for (let i = 0; i < tour.length; i++) tour[i] += b[i];
}
sfxBus(tour);

// ONE gain for every effect file and the tour, so they can be compared with each other:
// the music previews' gain, or less if the loudest effect would clip at it -- several
// peak over the music's own peak (a splat, a full-drive bounce), and the music previews
// set that at -1 dBFS. tour-over-music.wav is the file to judge the balance by.
const fxGain = Math.min(ref.gain, Math.pow(10, -1 / 20) / Math.max(peak(tour), ...VARIANTS.map((v) => results.get(v.id).pk)));
for (const v of VARIANTS) wav(path.join(OUT, `${v.id}.wav`), results.get(v.id).buf, fxGain);
wav(path.join(OUT, 'tour.wav'), tour, fxGain);
const under = db(ref.gain / fxGain);

// The same tour over the music: the menu's sounds over the menu, the climb's over BELOW,
// the death's over nothing and the scoreboard's over the lament. The death's bed is not
// the game's any more. It was silence while the climb's music stopped when the fire had
// him; now the catch cuts the climb down into the lament on its next beat (Audio.lament),
// so in the game the catch and the wail land on the climb sagging and the lament's fall.
// That cut is rendered through the engine itself by render-music.mjs --gameover.
const bedFor = (section) => (section === 'menu' ? 'menu' : section === 'the death' ? null : 'below');
const withMusic = Float32Array.from(tour);
const spans = [];
for (const e of timeline) {
  const bed = e.id === 'gameover' || e.id === 'record' || e.id === 'unlock' ? 'gameover' : bedFor(e.section);
  const last = spans[spans.length - 1];
  if (last && last.bed === bed) last.to = e.at + e.len + GAP;
  else spans.push({ bed, from: Math.max(0, e.at - 0.4), to: e.at + e.len + GAP });
}
// The music ducks under an effect that asks for it (only the milestone callout), as
// Audio.duck does: down over 30 ms, held, back over 450 ms.
const ducks = timeline.filter((e) => SFX[e.v.name].duck).map((e) => ({ at: e.at, ...SFX[e.v.name].duck }));
const duckAt = (t) => {
  let g = 1;
  for (const d of ducks) {
    const low = Math.pow(10, d.db / 20);
    const x = t - d.at;
    if (x < 0 || x > d.hold + 0.45) continue;
    const v = x < 0.03 ? 1 + (low - 1) * (x / 0.03) : x < d.hold ? low : low + (1 - low) * ((x - d.hold) / 0.45);
    g = Math.min(g, v);
  }
  return g;
};
for (const s of spans) {
  if (!s.bed) continue;
  const secs = s.to - s.from;
  const b = bedPreview(s.bed, secs, { i: s.bed === 'below' ? 0.2 : 0 });
  const n0 = Math.floor(s.from * SR);
  for (let i = 0; i < b.length && n0 + i < withMusic.length; i++) withMusic[n0 + i] += b[i] * duckAt((n0 + i) / SR);
}
const musicGain = Math.min(ref.gain, Math.pow(10, -1 / 20) / peak(withMusic));
wav(path.join(OUT, 'tour-over-music.wav'), withMusic, musicGain);

// --- the report -----------------------------------------------------------------------
const fmt = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const rows = VARIANTS.map((v) => ({ v, r: results.get(v.id) }));
const loudest = rows.reduce((a, b) => (b.r.lu > a.r.lu ? b : a));
const stacked = rows.reduce((a, b) => (b.r.stacked > a.r.stacked ? b : a));
const KEY_NAMES = { menu: 'E major', below: 'E minor', above: 'D minor', heavens: 'E Lydian', gameover: 'E minor' };
const keyName = (v) => `${KEY_NAMES[v.track]}${v.transpose ? ` +${v.transpose}` : ''}`;
console.log(`  the climb themes: ${ref.each.map((l) => l.toFixed(1)).join(' / ')} LUFS in the game ` +
  `(${(ref.lufs + 20 * Math.log10(ref.gain)).toFixed(1)} LUFS at the previews' gain +${db(ref.gain)} dB); music peak ${db(ref.peak)} dBFS`);
for (const { v, r } of rows) {
  const inBand = r.lu >= r.band[0] && r.lu <= r.band[1];
  console.log(`  ${v.id.padEnd(26)} ${(r.buf.length / SR - 0.25).toFixed(2)}s  M ${fmt(r.lu).padStart(6)} LU ` +
    `(band ${r.band[0]}..${r.band[1]}${inBand ? '' : ' OUT'})  100ms ${fmt(r.s - ref.lufs).padStart(6)} LU  ` +
    `peak ${db(r.pk)} dBFS, on the music's ${r.stacked.toFixed(1)} (limiter ${LIMITER.threshold})`);
}
console.log(`  the effect files and tour.wav (${tourLen.toFixed(1)}s, ${timeline.length} sounds) written ${under} dB under ` +
  `the music previews' gain so none clips; tour-over-music.wav ${db(ref.gain / musicGain)} dB under it`);

// The README: what the tour plays when, and what every sound is for.
const L = [];
L.push('# Sound effects: previews');
L.push('');
L.push('Rendered offline by `node tools/render-sfx.mjs --out=<this folder>`, through the game\'s own effects');
L.push('bus: the sounds are data in `src/render/sfx.js`, played in the game by `Audio.sfx` in');
L.push('`src/render/audio.js` and rendered here from the same data by `tools/sfx-render.mjs`. Nothing was');
L.push('played to make them.');
L.push('');
L.push('## Start here');
L.push('');
L.push(`- \`tour-over-music.wav\` -- every sound once, over the music as the game plays it: the menu's sounds over the menu theme, the climb's over BELOW, the death's over silence and the scoreboard's over the lament. The death's silence is this tour's, not the game's: at the catch the game cuts the climb down into the lament on its next beat, which \`node tools/render-music.mjs --gameover\` renders. **This is the file to judge the balance by.** Written ${db(ref.gain / musicGain)} dB under the music previews' gain so the sum does not clip.`);
L.push(`- \`tour.wav\` -- the same ${timeline.length} sounds with nothing under them, ${GAP} s apart and ${SECTION_GAP} s between sections.`);
L.push(`- one file per sound, below. These and \`tour.wav\` all share ONE gain, ${under} dB under the music previews' (\`tools/render-music.mjs\`), so they can be compared with each other; the loudest of them would clip at the music's.`);
L.push('- the zone chime where it matters most, at a stage change as the music hands over: `handover-below-to-above.wav` and `handover-above-to-heavens.wav` from `node tools/render-music.mjs`, whose handovers carry the real chime (the zone arrives at 18 s).');
L.push('');
L.push('## The tour');
L.push('');
L.push('The same order and times in both tour files. Loudness is against the music (0 LU = as loud as the climb themes; see below).');
L.push('');
L.push('| at (s) | section | sound | file | what it is for | key | loudness |');
L.push('|---:|---|---|---|---|---|---:|');
let lastSection = '';
for (const e of timeline) {
  const r = results.get(e.id);
  const sec = e.section !== lastSection ? e.section : '';
  lastSection = e.section;
  L.push(`| ${e.at.toFixed(2)} | ${sec} | ${e.v.name} | \`${e.id}.wav\` | ${e.v.purpose} | ${keyName(e.v)} | ${fmt(r.lu)} LU |`);
}
L.push('');
L.push('## How loud, and why');
L.push('');
L.push(`Loudness is each sound's maximum MOMENTARY loudness (ITU BS.1770, a 400 ms window), in LU against the climb themes' integrated loudness: ${ref.each.map((l) => (l + 20 * Math.log10(ref.gain)).toFixed(1)).join(', ')} LUFS for BELOW, THE WORLD ABOVE and THE HEAVENS at the music previews' gain (${ref.lufs.toFixed(1)} LUFS together in the game). 0 LU is as loud as the music. A sound shorter than 400 ms reads lower than it sounds while it plays -- a 50 ms tick about 8 dB lower -- and that is the point of the measure: a short sound intrudes less. The 100 ms column is the loudest tenth of a second, closer to how loud each is while it sounds.`);
L.push('');
L.push(`- The loudest thing is ${loudest.v.id} at ${fmt(loudest.r.lu)} LU; nothing is over +3.`);
const byName = {};
for (const { v, r } of rows) (byName[v.name] = byName[v.name] || []).push(r.lu);
const range = (n) => {
  const a = byName[n];
  const lo = Math.min(...a), hi = Math.max(...a);
  return hi - lo >= 0.5 ? `${fmt(lo, 0)} to ${fmt(hi, 0)}` : fmt(lo, 0);
};
L.push(`- Frequent sounds sit well under the music (a landing ${range('land')} LU as the fall grows, a hop of the chain ${range('hop')}, a menu tick ${range('menuMove')}), the moves in the middle (a jump ${range('jump')}, the air jumps ${range('double')} and ${range('triple')}, a wall bounce ${range('wall')} as the combo drives it), and the moments nearer it (the zone chime ${range('zone')}, a companion joining ${range('join')}, the seven fanfares ${range('milestone')}, the landing at the bottom of the fall ${range('impact')}, dazed to splat).`);
L.push(`- The music peaks at ${db(ref.peak)} dBFS in the game and the limiter's threshold is ${LIMITER.threshold} dBFS. The worst case -- ${stacked.v.id}'s peak landing on the music's loudest -- reaches ${stacked.r.stacked.toFixed(1)} dBFS, so the limiter never has to catch an effect, and never pumps the music down under one.`);
L.push('- The music ducks 5 dB under a milestone callout (held 0.9 s, back over 0.45 s) and nowhere else. Not at the death: there the catch already cuts the climb down into the lament on its next beat.');
L.push('- Each effect has a voice limit (a new one steals the oldest), a shortest gap between two, and small random differences in pitch, level and timing on the frequent ones; see `SFX` in `src/render/sfx.js`. The files here are the effects without that variation.');
L.push('');
L.push('| file | sound | length | loudness | 100 ms | band | peak in game |');
L.push('|---|---|---:|---:|---:|---|---:|');
for (const { v, r } of rows) {
  L.push(`| \`${v.id}.wav\` | ${v.name} | ${(r.buf.length / SR - 0.25).toFixed(2)} s | ${fmt(r.lu)} LU | ${fmt(r.s - ref.lufs)} LU | ${r.band[0]}..${r.band[1]} | ${db(r.pk)} dBFS |`);
}
L.push('');
fs.writeFileSync(path.join(OUT, 'README.md'), L.join('\n'));
console.log(`  wrote ${VARIANTS.length} effects, tour.wav, tour-over-music.wav and README.md to ${OUT}`);
