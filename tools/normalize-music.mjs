// Balance the generated note data to exact bar totals.
//
// The model was given the required totals in the prompt, in bold, with "add them up"
// as an instruction. It returned `climb` with a 139-sixteenth lead against a
// 100-sixteenth bass. This is the same arithmetic failure as the previous music job:
// stating the constraint more forcefully did not help, because summing a 100-element
// list is not something it can do reliably.
//
// So the melodies are kept and the arithmetic is done here. Repeating a voice from its
// start is musically safe for this material -- the bass is a repeating chug and the
// lead is a riff, so a loop point mid-phrase still lands on the grid.

import fs from 'node:fs';

const TARGET = { menu: 128, climb: 128, gameover: 64 };
const sum = (v) => v.reduce((s, n) => s + n[1], 0);

function fit(voice, target) {
  const out = [];
  let total = 0;
  let i = 0;
  let guard = 0;
  while (total < target && guard++ < 10000) {
    const [name, dur] = voice[i % voice.length];
    const take = Math.min(dur, target - total);
    out.push([name, take]);
    total += take;
    i++;
  }
  return out;
}

const raw = fs.readFileSync('logs/metal.txt', 'utf8').replace(/^﻿/, '');
const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
// eslint-disable-next-line no-eval
const T = eval('(' + body + ')');

const report = [];
for (const [k, t] of Object.entries(T)) {
  const before = { lead: sum(t.lead), bass: sum(t.bass) };
  t.lead = fit(t.lead, TARGET[k]);
  t.bass = fit(t.bass, TARGET[k]);
  t.loop = TARGET[k] / 4;
  report.push({ track: k, before, after: { lead: sum(t.lead), bass: sum(t.bass) }, target: TARGET[k] });
}

const js = `// Chiptune note data: DOOM-flavoured chugging rock, three intensities of one piece.
//
// Melodies written by the local Qwen model. It was given the required bar totals
// explicitly and still returned a climb track whose two voices were 139 and 100
// sixteenths long, so tools/normalize-music.mjs balances them to exact totals by
// repeating or trimming. The notes are its; the arithmetic is not.
//
// Regenerate with:  node tools/normalize-music.mjs

export const TRACKS = ${JSON.stringify(T, null, 2).replace(/"(\w+)":/g, '$1:')};
`;
fs.writeFileSync('src/render/tracks.js', js);

console.log('  track      lead before -> after   bass before -> after   target');
for (const r of report) {
  console.log(`  ${r.track.padEnd(9)} ${String(r.before.lead).padStart(6)} -> ${String(r.after.lead).padStart(4)}   ` +
    `${String(r.before.bass).padStart(10)} -> ${String(r.after.bass).padStart(4)}   ${String(r.target).padStart(4)}`);
}
console.log('\n  wrote src/render/tracks.js');
