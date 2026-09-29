// Build src/render/tracks.js.
//
//  menu      a fanfare that opens into a song: brass block chords playing THE CALL, then
//            a melody in thirds and sixths over warm chords, and back. See THE MENU below.
//  below     \
//  above      > the three climb themes, one per stage of the tower (src/game/stages.js).
//  heavens   /
//  gameover  the lament: a gothic organ and a music box -- a fall, a stab struck at the
//            impact, and a loop for the scoreboard, in the key the climb was cut in. See
//            THE LAMENT below.
//
// None of the climb music is delegated. Three attempts produced voices whose durations
// did not sum to the same length (twice), and then a run that flattened every note pair
// while dropping one of the two voices entirely. A riff over a bass over sustained
// chords is a structure with exact arithmetic in it; here every bar of every voice is
// generated and asserted to be exactly sixteen sixteenths, so a voice that does not add
// up stops the build instead of drifting against the others twenty minutes into a run.
//
// Regenerate with:  node tools/compose-music.mjs

import fs from 'node:fs';

const sum = (v) => v.reduce((s, n) => s + n[1], 0);

// === THE CLIMB: THREE THEMES, ONE PER STAGE ==================================
//
// The tower's twelve zones fall into three stages (src/game/stages.js), and each has its
// own theme. They are one game's music as it climbs, not three games', because they
// share THE CALL below and all three are built the same way: a 32-bar loop in four
// eight-bar sections, a lead over a bass over a sustained choir.
//
//   below    E minor (Aeolian, with the harmonic minor's D# on the dominant and a
//            Phrygian F in the crypt section), 144 bpm. A sneaking march: staccato
//            root-and-fifth bass, the call low in the square lead, a heartbeat under
//            the crypt.
//   above    D minor, 168 bpm. Heroic and driving: a galloping bass, a sawtooth lead
//            (brass), the call as a fanfare, a storm section of 3-3-2 syncopations over
//            a straight chug and a rising sequence, the most tension of the three.
//   heavens  E Lydian, 150 bpm. The home note of the cellar, transfigured into the
//            brightest mode: a soft triangle lead in the highest register, the call
//            spread over two bars, and the "bass" voice turned into a plucked harp
//            arpeggio that rings into itself.
//
// Each loop is 32 bars -- 46 to 53 seconds at the written tempo, 35 to 41 at full tilt
// (TEMPO_MAX, x1.30, in audio.js) -- because the first stage alone lasts 900 floors,
// several minutes of play, and the old 16-bar climb came round every 24 seconds.
//
// WRITTEN IN SCALE STEPS. A melody is a string of step/sixteenths: 0 is the theme's
// tonic, 7 its octave, negative below; '#' or 'b' after a step raises or lowers it a
// semitone; '-' is a rest; '|' is a bar line. The bass and choir are generated from a
// chord chart, one chord per bar, as patterns of chord tones. Every bar of every voice
// is checked to be exactly 16 sixteenths as it is built.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BAR = 16;
const THEME_BARS = 32;

function midi(n) {
  const m = /^([A-G])(#?)(\d)$/.exec(n);
  if (!m) throw new Error(`not a note: ${n}`);
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] ? 1 : 0);
}
function nameOf(k) {
  const o = Math.floor(k / 12) - 1;
  if (o < 0 || o > 9) throw new Error(`MIDI ${k} is outside the octaves a note name can carry`);
  return NAMES[((k % 12) + 12) % 12] + o;
}

const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],       // the menu's song
  mixolydian: [0, 2, 4, 5, 7, 9, 10],   // the menu's fanfare: major, with the flat seventh
};

/** A key: step(d) is the MIDI number of scale step d above (or below) the tonic. */
function scale(tonic, mode) {
  const t = midi(tonic);
  const m = MODES[mode];
  return (d) => t + m[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
}

// The key a track is written in, as the note name of its tonic ('E', 'D'), taken from the
// scale it was written with so the two cannot disagree. The engine reads it when the
// lament cuts in: the lament takes the tonic that was sounding (Audio.keyFromCut).
const tonicOf = (step) => NAMES[step(0) % 12];

// THE CALL, the motif the three themes share: the tonic, up a fifth, the step below that
// and back, then the octave. A horn call that climbs, which is what the game is about.
// In the minor themes the step below the fifth is a whole tone; in Lydian it is the
// raised fourth, a semitone, and the call brightens without changing shape.
const CALL = [[0, 3], [4, 1], [3, 2], [4, 2], [7, 8]];

/** The call's first four notes on step `s`, `x` times as long: 8x sixteenths. */
function head(s, x = 1) {
  return CALL.slice(0, 4).map(([d, n]) => `${s + d}/${n * x}`).join(' ');
}
/** The whole call on step `s` as one bar: the head, then the octave held 8. */
function call(s) {
  return `${head(s)} ${s + 7}/8`;
}

/** Parse a melody written in scale steps; every bar must be exactly 16 sixteenths. */
function melody(step, text, label, count = THEME_BARS) {
  const out = [];
  const bars = text.split('|').map((b) => b.trim()).filter(Boolean);
  bars.forEach((bar, i) => {
    let len = 0;
    for (const tok of bar.split(/\s+/)) {
      const m = /^(-|-?\d+)([#b]?)\/(\d+)$/.exec(tok);
      if (!m) throw new Error(`${label}, bar ${i + 1}: cannot read "${tok}"`);
      const dur = Number(m[3]);
      let pitch = null;
      if (m[1] !== '-') {
        pitch = nameOf(step(Number(m[1])) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
      }
      out.push([pitch, dur]);
      len += dur;
    }
    if (len !== BAR) throw new Error(`${label}, bar ${i + 1} is ${len} sixteenths, not ${BAR}: ${bar}`);
  });
  if (bars.length !== count) throw new Error(`${label} has ${bars.length} bars, not ${count}`);
  return out;
}

/** A chord symbol -- 'E', 'C#m', 'A#' -- as a root pitch class and a third. */
function chord(sym) {
  const m = /^([A-G]#?)(m?)$/.exec(sym);
  if (!m) throw new Error(`not a chord: ${sym}`);
  return { root: (PC[m[1][0]] + (m[1][1] ? 1 : 0)) % 12, third: m[2] ? 3 : 4 };
}

// A chord tone, in semitones above the chord's placed root. '5v' is the fifth BELOW, the
// march bass's other foot; '9' is the added ninth; '10', '12' and '15' are the third,
// fifth and third again an octave or two up, for the harp.
function tone(tok, ch) {
  switch (tok) {
    case 'R': return 0;
    case 'Rv': return -12;
    case '3': return ch.third;
    case '5': return 7;
    case '5v': return -5;
    case '8': return 12;
    case '9': return 14;
    case '10': return 12 + ch.third;
    case '12': return 19;
    case '15': return 24 + ch.third;
    default: throw new Error(`not a chord tone: ${tok}`);
  }
}

// Nothing in a bass line goes under E1 (41 Hz). A triangle has almost nothing above its
// fundamental, and below that the note is felt on good speakers and simply absent on
// most; anything a pattern would put lower is folded up an octave.
const BASS_FLOOR = midi('E1');

/**
 * A voice generated from a chord chart: one bar per chord, each bar a pattern of chord
 * tones such as "R/2 -/2 5v/2 -/2". The root is placed in the octave [lo, lo+12); with
 * `each`, every tone is placed in that octave on its own instead (a pad, which should
 * move as little as it can). 'N-' is a semitone under the NEXT bar's root: the walking
 * bass's approach note.
 */
function accomp(chart, patternFor, lo, label, each = false) {
  const place = (pc) => lo + ((((pc - lo) % 12) + 12) % 12);
  const out = [];
  chart.forEach((sym, i) => {
    const ch = chord(sym);
    const next = chord(chart[(i + 1) % chart.length]);
    const root = place(ch.root);
    let len = 0;
    for (const tok of patternFor(i).trim().split(/\s+/)) {
      const m = /^([^/]+)\/(\d+)$/.exec(tok);
      if (!m) throw new Error(`${label}, bar ${i + 1}: cannot read "${tok}"`);
      const dur = Number(m[2]);
      let pitch = null;
      if (m[1] === 'N-') pitch = place(next.root) - 1;
      else if (m[1] !== '-') {
        pitch = each ? place((ch.root + tone(m[1], ch)) % 12) : root + tone(m[1], ch);
      }
      while (pitch !== null && pitch < BASS_FLOOR) pitch += 12;
      out.push([pitch === null ? null : nameOf(pitch), dur]);
      len += dur;
    }
    if (len !== BAR) throw new Error(`${label}, bar ${i + 1} (${sym}) is ${len} sixteenths, not ${BAR}`);
  });
  if (chart.length !== THEME_BARS) throw new Error(`${label}: the chart has ${chart.length} bars, not ${THEME_BARS}`);
  return out;
}

/** Which of the four eight-bar sections bar i (0-based) is in, and where in it. */
const section = (i) => ({ s: Math.floor(i / 8), at: i % 8 });

// --- below: BASEMENT, DUNGEON, FOREST, SWAMP, DOWNTOWN ------------------------
// The cellar, the crypt, the forest, the bog, the town at night. A march that is
// sneaking somewhere: staccato feet, the call stated low, and in the third section a
// crypt -- the Phrygian F over the E, a heartbeat for a bass, the call glimmering once
// through the dark -- before it comes back an octave up, climbing out.
function below() {
  const step = scale('E3', 'aeolian');  // 0 E3 . 4 B3 . 7 E4 . 11 B4 . 14 E5; 6# = D#
  const lead = melody(step, `
    ${call(0)}                 | 6/2 7/2 6/2 5/2 4/6 -/2   | 5/3 4/1 2/2 4/2 5/4 7/4    | 6#/2 7/2 8/2 7/2 6#/4 4/4 |
    ${call(0)}                 | 9/2 8/2 7/2 5/2 3/6 -/2   | 4/2 6#/2 8/2 11/2 10/2 8/2 6#/2 4/2 | 7/6 -/2 -/4 4/2 -1#/2 |

    ${head(0)} 7/4 9/4         | 8/2 7/2 6/2 7/2 4/4 -/4   | ${call(3)}                 | 9/2 8/2 6/2 8/2 10/4 8/4  |
    9/4 11/2 9/2 8/4 7/4       | 5/2 7/2 9/2 12/2 11/4 9/4 | 10/3 9/1 7/2 5/2 3/4 5/4   | 4/4 6#/4 8/4 6#/2 4/2     |

    0/6 1b/2 0/8               | -/4 5/4 3/2 1b/2 0/4      | 4/6 5/2 4/4 2/4            | 3/4 1b/4 3/2 5/2 3/4      |
    ${call(3)}                 | 12/4 10/4 8b/4 7/4        | 6#/2 4/2 6#/2 8/2 11/4 10/4 | 8/2 6#/2 4/2 3/2 6#/4 4/4 |

    ${call(7)}                 | 13/2 14/2 13/2 12/2 11/6 -/2 | 12/3 11/1 9/2 11/2 12/4 14/4 | 13/2 12/2 11/2 10/2 9/4 8/4 |
    10/3 12/1 14/4 12/2 10/2 9/4 | 9/2 11/2 14/4 11/2 9/2 7/4 | 8/2 11/2 13#/4 11/2 8/2 6#/4 | 4/4 -/2 4/1 4/1 3/2 1/2 -1#/4 |
  `, 'below lead');
  const chart = [
    'Em', 'Em', 'C', 'B', 'Em', 'Am', 'B', 'Em',
    'Em', 'Em', 'Am', 'D', 'G', 'C', 'Am', 'B',
    'Em', 'F', 'Em', 'F', 'Am', 'F', 'B', 'B',
    'Em', 'Em', 'C', 'D', 'Am', 'Em', 'B', 'B',
  ];
  const MARCH = 'R/2 -/2 5v/2 -/2 R/2 -/2 5v/2 -/2';
  const WALK = 'R/2 -/2 5v/2 -/2 R/2 R/1 R/1 5v/2 N-/2';   // into the next phrase
  const HEART = 'R/1 -/1 R/1 -/5 R/1 -/1 R/1 -/5';          // the crypt
  const bass = accomp(chart, (i) => {
    const { s, at } = section(i);
    if (s === 2 && at < 6) return HEART;
    return at % 4 === 3 ? WALK : MARCH;
  }, midi('F#1'), 'below bass');
  const choir = accomp(chart, (i) => (section(i).s === 2 ? 'R/16' : '3/8 5/8'),
    midi('D3'), 'below choir', true);
  return { bpm: 144, tonic: tonicOf(step), loop: THEME_BARS, lead, bass, choir };
}

// --- above: CITADEL, STORM, ABYSS ----------------------------------------------
// The castle, the storm, the drop into bone. Heroic and driving, and the most tension:
// the call as a brass fanfare over a gallop; then the call on the major IV, the Dorian
// brightening; then the storm, 3-3-2 syncopations climbing a chord at a time over a
// straight chug to the dominant of the dominant; then the call once more, overshooting.
function above() {
  const step = scale('D4', 'aeolian');  // 0 D4 . 4 A4 . 7 D5 . 11 A5; 6# = C#, 5# = B
  const lead = melody(step, `
    ${call(0)}                 | 7/2 6/2 7/2 9/2 8/4 7/2 6/2 | 5/3 2/1 5/2 7/2 9/8     | 8/2 9/2 8/2 7/2 6/4 4/4 |
    ${call(0)}                 | 9/2 8/2 7/2 6/2 7/4 4/4     | 5/2 7/2 9/2 7/2 5/2 3/2 2/2 3/2 | 4/4 6#/2 8/2 11/4 -/4 |

    ${head(0)} 7/4 9/4         | 10/2 9/2 8/2 9/2 7/8        | ${call(3)}              | 3/2 5#/2 7/4 5#/2 3/2 1/4 |
    5/3 7/1 9/4 10/2 9/2 7/4   | 6/3 8/1 10/4 9/2 8/2 6/4    | 4/2 6#/2 8/2 6#/2 4/2 6#/2 8/2 11/2 | 10/2 8/2 6#/2 4/2 1/2 -1#/2 -3/4 |

    2/3 2/3 2/2 3/3 5/3 3/2    | 3/3 3/3 3/2 4/3 6/3 4/2     | 4/3 4/3 4/2 5/3 7/3 5/2 | 7/2 8/2 9/2 10/2 11/4 9/4 |
    7/3 7/3 7/2 9/3 7/3 5/2    | 8/3 8/3 8/2 10/3 8/3 6/2    | 1/2 3#/2 5#/2 8/2 5#/2 3#/2 1/2 3#/2 | 4/2 6#/2 8/2 11/2 8/2 6#/2 4/2 -/2 |

    ${head(0)} 7/2 9/2 11/4    | 10/2 9/2 10/2 11/2 7/8      | 9/3 7/1 5/2 7/2 9/4 12/4 | 11/4 10/2 9/2 8/4 6/4 |
    3/3 5/1 7/4 10/4 9/2 7/2   | 8/3 6#/1 4/2 6#/2 8/4 11/4  | 7/3 4/1 3/2 4/2 0/8     | 4/2 4/1 4/1 6#/2 4/2 8/2 6#/2 4/4 |
  `, 'above lead');
  const chart = [
    'Dm', 'Dm', 'A#', 'C', 'Dm', 'Dm', 'A#', 'A',
    'Dm', 'Dm', 'G', 'G', 'A#', 'C', 'A', 'A',
    'A#', 'C', 'Dm', 'Dm', 'A#', 'C', 'E', 'A',
    'Dm', 'Dm', 'A#', 'C', 'Gm', 'A', 'Dm', 'A',
  ];
  const GALLOP = 'R/2 R/1 R/1 R/2 R/1 R/1 R/2 R/1 R/1 R/2 R/1 R/1';
  const GALLOP8 = 'R/2 R/1 R/1 8/2 R/1 R/1 R/2 R/1 R/1 8/2 R/1 R/1';
  const CHUG = 'R/1 R/1 R/1 -/1 R/1 R/1 8/1 -/1 R/1 R/1 R/1 -/1 R/1 R/1 8/1 -/1';
  const TURN = 'R/2 R/1 R/1 R/2 R/1 R/1 8/2 5/2 3/2 R/2';   // the end of every section
  const bass = accomp(chart, (i) => {
    const { s, at } = section(i);
    if (at === 7) return TURN;
    if (s === 0) return GALLOP;
    if (s === 2) return CHUG;
    return GALLOP8;
  }, midi('G1'), 'above bass');
  const choir = accomp(chart, (i) => (section(i).s === 2 ? '5/16' : 'R/8 5/8'),
    midi('A3'), 'above choir', true);
  return {
    bpm: 168, tonic: tonicOf(step), loop: THEME_BARS, lead, bass, choir,
    // A sawtooth lead is brass: a fanfare, not a chip. The old warning about sawtooth is
    // about the BASS at 41 Hz; this lead sits at 290-930 Hz under the 5.2 kHz roll-off.
    // Its gain is raised over the square's 0.13 because a sawtooth of the same peak
    // carries about a third of the square's power.
    mix: { lead: { type: 'sawtooth', gain: 0.16 } },
  };
}

// --- heavens: NEBULA, COSMOS, STARFIELD, ZENITH ----------------------------------
// Gas, deep space, stars, the gold summit. Ethereal and soaring: the call spread over two
// bars and floated on the Lydian I-II, the raised fourth left hanging; a starfield
// section where the call comes back at speed on other chords, twinkling; and the
// summit, the call an octave up. The lead is the highest of the three themes and the
// softest -- a triangle -- and the bass voice is a harp: a low root on the beat and a
// plucked arpeggio above it, each note ringing into the next.
function heavens() {
  const step = scale('E4', 'lydian');   // 0 E4 . 3 A# . 4 B4 . 7 E5 . 11 B5
  const lead = melody(step, `
    ${head(0, 2)}              | 7/12 8/2 7/2              | 6/4 4/4 2/4 4/4            | 3/8 5/4 1/4              |
    5/6 9/2 8/4 7/4            | 4/8 6/4 9/4               | 8/6 10/2 8/4 5/4           | 3/12 -/4                 |

    ${head(0, 2)}              | 7/4 8/4 10/8              | 11/6 9/2 6/4 4/4           | 5/6 7/2 9/8              |
    8/4 11/4 10/4 8/4          | 9/8 7/4 4/4               | 5/4 8/4 10/8               | 11/8 10/8                |

    ${call(-2)}                | 9/2 8/2 6/2 4/2 6/8       | ${call(1)}                 | 10/2 9/2 7/2 6/2 7/8     |
    ${head(5)} 11/8            | 11/4 10/4 8/4 6/4         | 5/2 8/2 10/2 8/2 5/2 8/2 10/2 11/2 | 11/4 10/4 8/8    |

    ${head(7, 2)}              | 9/8 11/8                  | 11/6 9/2 6/8               | 8/6 10/2 11/8            |
    10/4 9/4 7/8               | 5/6 4/2 5/4 7/4           | 8/12 5/4                   | 3/8 -/4 -1/2 1/2         |
  `, 'heavens lead');
  const chart = [
    'E', 'F#', 'E', 'F#', 'C#m', 'G#m', 'F#', 'F#',
    'E', 'F#', 'G#m', 'C#m', 'B', 'E', 'F#', 'F#',
    'C#m', 'G#m', 'F#', 'E', 'C#m', 'G#m', 'F#', 'F#',
    'E', 'C#m', 'G#m', 'F#', 'E', 'C#m', 'F#', 'F#',
  ];
  const HARP = 'Rv/2 5/1 8/1 9/1 10/1 9/1 8/1 Rv/2 5/1 8/1 10/1 12/1 10/1 9/1';
  const STARS = 'Rv/2 8/1 10/1 12/1 10/1 8/1 10/1 Rv/2 8/1 10/1 12/1 15/1 12/1 10/1';
  const bass = accomp(chart, (i) => (section(i).s === 2 ? STARS : HARP),
    midi('C#3'), 'heavens harp');
  const choir = accomp(chart, (i) => (section(i).s === 2 ? '5/8 3/8' : '3/16'),
    midi('E4'), 'heavens choir', true);
  return {
    bpm: 150, tonic: tonicOf(step), loop: THEME_BARS, lead, bass, choir,
    // Levels set by measurement, since nobody here can listen: tools/render-music.mjs
    // prints each theme's K-weighted loudness, and these put the heavens within a dB
    // of the menu and the other two (-13.7 LUFS against -14.2 to -14.7). A triangle has
    // a third of a square's power at the same peak, but this lead is legato where the
    // others rest, so at 0.26 it measured 2.5 LU over them; 0.2 is level. The harp
    // keeps the bass's gain: plucked, each note dies away inside its ring, and at 0.15
    // it was 11 dB under the lead, a shimmer nobody would hear. The choir, the heavenly
    // one, gets a little more of the bus than the others.
    mix: {
      lead: { type: 'triangle', gain: 0.2 },
      bass: { env: 'pluck' },
      choir: { gain: 0.6 },
    },
  };
}

// === THE MENU: A FANFARE THAT OPENS INTO A SONG =================================
//
// Asked for on 2026-09-23: "something that starts fast and is just in your face with it.
// big brazen chords into a lovely harmony." The menu before this was the old climb hook in
// E Dorian at 138 bpm, one square note at a time over an eighth-note bass: the slowest
// thing on the soundtrack after the lament, and nothing in it hit. (The one before THAT
// opened on eight bars of sparse calm, a fine shape for a track you sit and listen to and
// a bad one for a screen a player is on for twelve seconds. This one opens on a hit.)
//
// Then, of the build that had it (2026-09-28): "the main menu music should start going in
// to the nice melody sooner the in your face part a tad overdone there". The fanfare was
// eight bars -- the call four times, on E, E, A and B -- twelve seconds of brass before the
// song, and 1.8 LU louder than it, every stab a five-note chord. It is four bars now, the
// call on the tonic and then on the dominant, and after each call's first chord the brass
// plays four notes, not five: the song starts about six seconds in, and the fanfare sits
// nearer its level. The first hit is still on bar 1 beat 1 -- the user asked for less of
// it, not none.
//
// E major, 176 bpm -- about 162 as heard, because off the climb the tempo eases to
// TEMPO_MIN (x0.92) -- and 20 bars: 27.3 s written, 29.6 s as heard.
//
//   bars 1-4    THE FANFARE, E mixolydian. A brass section -- a fourth voice, sawtooth
//               block chords of four notes, five on each call's first chord -- plays THE
//               CALL twice, and major chords climbing a step at a time answer each: the
//               call on E, answered C D E (the flat sixth and seventh, the brass
//               cadence); then on B, answered G A B, which lands on the dominant so the
//               song arrives. Bar 1 beat 1 is the call's first chord, five sawtooths and
//               the bass at once: no intro. The bass pumps octaves in eighths; the choir
//               swells under each call and leaves the answers dry, so the stabs punch.
//   bars 5-18   THE SONG, E major. The brass stops and the lead sings -- a square, two
//               notes at a time, the melody with a second voice a third or a sixth below
//               it (duet) -- over warm three-note chords in the choir and a bass rolling
//               root, fifth, octave, fifth. It opens on the call again, twice as slow and
//               on the fifth, B F# E F# and then the octave.
//   bars 19-20  THE WAY BACK. The brass returns on C and D, the flat sixth and seventh
//               again, and drives eighths on D into bar 1's E: the loop comes round on the
//               fanfare, so the menu does not settle into its quiet half and stay there.
//
// The call is the fanfare's top line, which is what ties the menu to the three climb
// themes; test-music finds it in the brass twice a loop and in the song twice.
//
// For this the engine gained two things, both inert for every other track: a note may
// be a CHORD (an array of names, one oscillator each), and a track may have a fourth
// voice, `brass`. The chords are voiced here, where they can be checked, not at runtime.

const FANFARE_BARS = 4;
const SONG_BARS = 14;
const BACK_BARS = 2;
const MENU_BARS = FANFARE_BARS + SONG_BARS + BACK_BARS;

/** A chord symbol's pitch classes: root, third, fifth. */
function triad(sym) {
  const ch = chord(sym);
  return [ch.root, (ch.root + ch.third) % 12, (ch.root + 7) % 12];
}

/**
 * The harmony, one string per bar: 'E' is a bar of E, 'C:6 D:6 E:4' three chords of 6, 6
 * and 4 sixteenths. Every bar must add up. Returns each chord with where it starts.
 */
function harmony(bars, label, count = MENU_BARS) {
  const segs = [];
  bars.forEach((bar, i) => {
    let len = 0;
    for (const tok of bar.trim().split(/\s+/)) {
      const [sym, d = '16'] = tok.split(':');
      triad(sym);
      segs.push({ sym, at: i * BAR + len, dur: Number(d) });
      len += Number(d);
    }
    if (len !== BAR) throw new Error(`${label}, bar ${i + 1} is ${len} sixteenths, not ${BAR}: ${bar}`);
  });
  if (bars.length !== count) throw new Error(`${label} has ${bars.length} bars, not ${count}`);
  return segs;
}
const chordAt = (segs, pos) => segs.find((s) => pos >= s.at && pos < s.at + s.dur);

/** Split a voice written bar by bar, and refuse it unless it is `count` bars. */
function menuBars(text, label, count = MENU_BARS) {
  const bars = text.split('|').map((b) => b.trim()).filter(Boolean);
  if (bars.length !== count) throw new Error(`${label} has ${bars.length} bars, not ${count}`);
  return bars;
}

/**
 * Brass block chords under a top line. A token is `step:CHORD/sixteenths` -- the top
 * note in scale steps and the chord it is voiced from -- or `step:CHORD*5/...` for five
 * notes instead of four, or `-/n`, a rest. The top note must be a tone of its chord; the
 * rest of the voicing is the chord's tones straight down from it, close, the way a brass
 * section voices a fanfare so the whole block moves with the tune. Five notes is the
 * accent: this engine has no velocity, so a chord is made louder by making it bigger.
 */
function blocks(step, text, label, count = MENU_BARS) {
  const out = [];
  menuBars(text, label, count).forEach((bar, i) => {
    let len = 0;
    for (const tok of bar.split(/\s+/)) {
      const m = /^(?:(-?\d+)([#b]?):([A-G]#?m?)(?:\*(\d))?|-)\/(\d+)$/.exec(tok);
      if (!m) throw new Error(`${label}, bar ${i + 1}: cannot read "${tok}"`);
      const dur = Number(m[5]);
      if (m[1] === undefined) out.push([null, dur]);
      else {
        const top = step(Number(m[1])) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        const pcs = triad(m[3]);
        if (!pcs.includes(top % 12)) throw new Error(`${label}, bar ${i + 1}: ${nameOf(top)} is not in ${m[3]}`);
        const notes = [top];
        for (let k = top - 1; notes.length < Number(m[4] || 4); k--) if (pcs.includes(k % 12)) notes.unshift(k);
        out.push([notes.map(nameOf), dur]);
      }
      len += dur;
    }
    if (len !== BAR) throw new Error(`${label}, bar ${i + 1} is ${len} sixteenths, not ${BAR}: ${bar}`);
  });
  return out;
}

/** THE CALL on step `s` as block chords, one chord symbol for each of its five notes. */
function calledOn(s, chords) {
  if (chords.length !== CALL.length) throw new Error(`the call has ${CALL.length} notes, not ${chords.length}`);
  return call(s).split(' ').map((tok, i) => tok.replace('/', `:${chords[i]}/`)).join(' ');
}

/**
 * The song, sung in two parts. The melody is in scale steps, as melody() reads them
 * (without accidentals), and every note gets a second voice a diatonic third below it --
 * or a sixth below, where the note is marked `^`, or where it is held a half note or more
 * and its third is not in the chord while its sixth is. Parallel thirds are what makes a
 * tune sound harmonised rather than doubled; a HELD third that is not in the chord is a
 * wrong note against the choir, while a short one is a passing note, so only the long
 * notes are moved. Each note comes out as a two-note chord, lower note first.
 */
function duet(step, text, segs, label) {
  const out = [];
  menuBars(text, label).forEach((bar, i) => {
    let len = 0;
    for (const tok of bar.split(/\s+/)) {
      const m = /^(-|-?\d+)(\^?)\/(\d+)$/.exec(tok);
      if (!m) throw new Error(`${label}, bar ${i + 1}: cannot read "${tok}"`);
      const dur = Number(m[3]);
      if (m[1] === '-') out.push([null, dur]);
      else {
        const s = Number(m[1]);
        const pcs = triad(chordAt(segs, i * BAR + len).sym);
        const inChord = (d) => pcs.includes(step(d) % 12);
        const sixth = m[2] === '^' || (dur >= 8 && !inChord(s - 2) && inChord(s - 5));
        out.push([[nameOf(step(sixth ? s - 5 : s - 2)), nameOf(step(s))], dur]);
      }
      len += dur;
    }
    if (len !== BAR) throw new Error(`${label}, bar ${i + 1} is ${len} sixteenths, not ${BAR}: ${bar}`);
  });
  return out;
}

/**
 * The bass, an eighth at a time: `pattern(bar)` names a chord tone for each of the bar's
 * eight eighths -- 'R' the root, '5', '8' the octave -- of whatever chord is sounding on
 * that eighth, so a bar of three chords gets three roots. Roots sit in [lo, lo + 12).
 */
function menuBass(segs, pattern, lo) {
  const place = (pc) => lo + ((((pc - lo) % 12) + 12) % 12);
  const out = [];
  for (let b = 0; b < MENU_BARS; b++) {
    const toks = pattern(b).trim().split(/\s+/);
    if (toks.length !== 8) throw new Error(`menu bass, bar ${b + 1}: ${toks.length} eighths, not 8`);
    toks.forEach((tok, e) => {
      const ch = chord(chordAt(segs, b * BAR + e * 2).sym);
      out.push([nameOf(place(ch.root) + tone(tok, ch)), 2]);
    });
  }
  return out;
}

/**
 * The choir: every chord of the harmony held as a close three-note chord in [lo, lo + 12)
 * -- the pad moves as little as it can -- or a rest in the bars where `sings(bar)` is false.
 */
function menuChoir(segs, sings, lo) {
  const place = (pc) => lo + ((((pc - lo) % 12) + 12) % 12);
  return segs.map((s) => [
    sings(Math.floor(s.at / BAR)) ? triad(s.sym).map(place).sort((a, b) => a - b).map(nameOf) : null,
    s.dur,
  ]);
}

function menu() {
  const segs = harmony([
    'E', 'C:6 D:6 E:4', 'B', 'G:6 A:6 B:4',                                       // the fanfare
    'E', 'G#m', 'A', 'B', 'E', 'C#m', 'A', 'B',                                   // the song
    'C#m', 'G#m', 'A', 'E', 'F#m', 'B',
    'C', 'D',                                                                     // the way back
  ], 'menu harmony');
  const fanfare = scale('E4', 'mixolydian');   // 0 E4 . 4 B4 . 6 D5 . 7 E5 . 9 G#5 . 11 B5
  const song = scale('E4', 'ionian');          // 0 E4 . 4 B4 . 6 D#5 . 7 E5 . 11 B5
  const REST = '-/16 |';
  const brass = blocks(fanfare, `
    ${calledOn(0, ['E*5', 'E', 'D', 'E', 'E'])} | 7:C/4 -/2 8:D/4 -/2 9:E/4 |
    ${calledOn(4, ['B*5', 'B', 'A', 'B', 'B'])} | 6:G/4 -/2 7:A/4 -/2 8:B/4 |
    ${REST.repeat(SONG_BARS)}
    7:C*5/6 -/2 7:C/2 -/2 7:C/2 -/2 | 8:D*5/6 -/2 8:D/2 8:D/2 8:D/2 8:D/2 |
  `, 'menu brass');
  const lead = duet(song, `
    ${REST.repeat(FANFARE_BARS)}
    ${head(4, 2)}      | 11/12 9/2 8/2    | 10/6 9/2 7/4 5/4 | 6/4 8/4 11/8     |
    ${head(4, 2)}      | 11/8 9/4 7/4     | 5/4 7/4 10/4 9/4 | 8/6 6/2 4/8      |
    2/4 4/4 7/4 9/4    | 6/6 4/2 2/8      | 3/4 5/4 7/4 10/4 | 9/6 8/2 7/8      |
    5^/4 8^/4 10^/4 8^/4 | 6/4 8/4 11/8   |
    ${REST.repeat(BACK_BARS)}
  `, segs, 'menu lead');
  const PUMP = 'R 8 R 8 R 8 R 8';   // octaves in eighths: the fanfare and the way back
  const ROLL = 'R 5 8 5 R 5 8 5';   // the song
  const bass = menuBass(segs, (b) => (b >= FANFARE_BARS && b < FANFARE_BARS + SONG_BARS ? ROLL : PUMP), midi('C2'));
  // Under each call of the fanfare and everywhere after it; the fanfare's answers are dry.
  const choir = menuChoir(segs, (b) => b >= FANFARE_BARS || b % 2 === 0, midi('G3'));
  return {
    bpm: 176, tonic: tonicOf(song), loop: MENU_BARS, lead, bass, choir, brass,
    // Levels set by measurement (tools/render-music.mjs), since nobody here can listen,
    // and at the level the title screen plays it: intensity 0, the choir bus at
    // CHOIR_MIN. Over the loop -14.8 LUFS against the climb themes' -13.8 to -14.9; the
    // fanfare -14.1 and the song -15.2, so the brass is the loud part and the song opens
    // out below it -- by 0.9 LU since the fanfare was halved and its stabs went to four
    // notes; the eight-bar one of five-note stabs was 1.8 over (-13.4), "a tad overdone".
    // The way back, still five-note chords into the hit, is -14.0. The first levels (lead 0.09, bass 0.22, choir 0.9, brass 0.07) had it
    // the wrong way round -- the song 1.4 LU OVER the fanfare, the brass 4 dB under the
    // bass. The answers' stabs are five-note chords for the same reason: at four, with
    // rests and no choir, they measured 1.4 LU under the calls. The choir has all the gain
    // it may (1); under CHOIR_MIN that is still about 3 dB under the song's lead.
    mix: {
      lead: { gain: 0.055 },
      bass: { gain: 0.17 },
      choir: { gain: 1 },
      brass: { gain: 0.09 },
    },
  };
}

// === THE LAMENT: A GOTHIC ORGAN, AND A MUSIC BOX =====================================
//
// What plays from the moment he falls until he climbs again: the fall, the landing, and
// the scoreboard for as long as the player reads it.
//
// Asked for (2026-09-28): "redo the game over music its bad something like phantom of the
// opera but 8bit like a spooky scary death with suspension." The STYLE, then: a gothic pipe
// organ, minor, dread that builds, chords that hang. Nothing here is taken from that
// musical, which is under copyright. The one quotation is older and free: the opening
// gesture of J. S. Bach's Toccata and Fugue in D minor, BWV 565 -- the mordent on the
// dominant, held, and the plunge down to the leading tone -- which is where that whole
// idiom of the horror organ comes from. It is played at the impact, in E minor.
//
// It replaces THE CALL turned over (a square lead, a triangle bass, a choir and a little
// brass, 2026-09-23): a lament in the soundtrack's idiom, which was the brief then and
// read as nothing like a death now. And its landing chord was written into the fall at a
// fixed 1.7 s while the fall takes 1.0 to 2.45 s, so it came 0.2 to 1.2 s off the splat.
//
// E minor, 72 bpm (about 66 as heard: on the scoreboard the tempo rests at TEMPO_MIN).
// Two bars that play once and eight that loop:
//
//   THE FALL     bar 1, once, and cut short by the landing wherever it has got to -- which
//                is 0.4 s in from the ground floor and at most 2.3 s in from high up, so
//                the tightening is written into its first eleven sixteenths. The organ
//                pedal throbbing like a heartbeat that quickens -- a beat of four
//                sixteenths, then three, three, two, two -- and creeping up by semitones,
//                E F F# G G# A; a cluster growing in the choir from one note to four, E,
//                then F against it, then the tritone A#, then B (by 1.7 s in), each of them
//                a semitone from a note of the stab's chord, which it falls or rises into;
//                and high above, the music box falling chromatically from B. The pedal
//                climbs while the music box falls: a wedge, closing. The organ's manual is
//                silent, holding its breath, so its first chord is the stab. (A minor-second
//                cluster trembling in the manual through the fall was tried first, and it
//                cost the stab its contrast: the 0.3 s after the impact measured only 2.4 LU
//                over the 0.3 s before. Without it the stab comes 4 to 9 LU up.)
//                The first fall written this way passed every check on its notes and sagged
//                as heard: the choir's two cluster chords were on the pad envelope, which
//                lets a chord die away from three quarters of its length while the next
//                swells in from silence, and that fell in a rest of the heartbeat -- 1.3 to
//                1.6 s in, half a second before the impact from floor 654 up, the music
//                dropped 12-15 dB for 0.3 s and came back 19 LU up 0.3 s before the stab, a
//                false hit ahead of the real one; its second half measured 1 LU UNDER its
//                first. The choir is a rank of the organ now (its envelope below), the
//                cluster grows a note at a time, and the heartbeat's last beats come without
//                rests: the second half 1.2 to 1.4 LU over the first, no 100 ms more than
//                5 dB under the fall's level (test-lament, THE FALL AS HEARD).
//   THE STAB     bar 2, once: THE IMPACT. The engine jumps here when he lands
//                (Audio.landLament) -- the track's `landing` -- so it is struck with the
//                splat, however long the fall was. A diminished seventh, D# F# A C, over
//                the tonic pedal E, full organ (five notes on both ranks, ten squares), the
//                choir holding it, the music box striking it and running up to D# and F#;
//                then the Toccata's gesture on the organ in octaves: the mordent B A B,
//                held, and the plunge A G F# E to the leading tone, over the dominant in the
//                pedal -- the diminished chord over B is the dominant's minor ninth -- into
//                the loop's tonic.
//   THE LOOP     bars 3-10, the scoreboard. The bass sinks by semitones a bar at a time, E
//                D# D C# C B, the Baroque lament, then the Neapolitan's A and the
//                dominant's B. Over it the organ holds the E minor triad as the bass moves
//                under it -- Em, Em over D# (the major seventh), C# half-diminished (Em6),
//                C major seventh, Em over B -- turning through the diminished sevenths on
//                D# and C#, and the suspensions hang on the half bar: the 7th over D and
//                over C# (7-6: C to B over D, B to A# over C#), the 4th over B twice (4-3:
//                E to D#, the second time unprepared, pressing), and the 9th over E ACROSS
//                THE SEAM (9-8: F# to E), so even arriving home it hangs for two beats. The only
//                tonic in the bass is the loop's first bar: from D# on the cadence is held
//                off -- a half cadence on B in bar 6, then the Neapolitan F over A, darker,
//                then the dominant again -- and it comes home only round the seam. Above
//                it all the music box: a slow lullaby of broken chords in the high octave,
//                spelling each colour out -- the augmented triad in Em over D#, the
//                diminished sevenths, the Neapolitan -- and at the top of every loop THE
//                CALL turned over, the Duke's own call falling, played by a toy.
//                In bars 7-10 the choir doubles the organ: a rank drawn for the second half,
//                the dread building to the dominant; the loop's first half is the organ
//                alone.
//
// The voices are the soundtrack's own, set as an organ (`mix`, below): the brass is the
// manual, square with a second rank an octave up and 7 cents sharp (the stops in audio.js)
// on the organ envelope, which speaks over 30 ms and holds; the bass is the pedal, triangle
// with its octave; the choir, a triangle on the organ envelope through its own low-pass,
// is the soft flue (it was on the pad envelope, and sagged: see THE FALL);
// and the lead is the music box, a triangle struck and left to ring (pluck). No lead note
// is longer than a half note, and the music box never holds one pitch; the organ pedal
// holds a bar at most.
//
// Its key is not its own. The engine plays it with its tonic on the tonic that was
// sounding when it cut in -- the parallel minor: E minor out of the march in E, D minor out
// of the gallop, E minor where the heavens were in E Lydian -- each plus the rung of the
// key ladder the climb had reached, folded to within a tritone of E so it keeps its
// register. See keyFromCut in src/render/audio.js.
const LAMENT_INTRO = 2;   // bars that play once: the fall and the stab
const LAMENT_LANDING = 1; // the bar the engine jumps to when he lands: the stab
const LAMENT_LOOP = 8;    // bars that loop: the scoreboard
const LAMENT_BARS = LAMENT_INTRO + LAMENT_LOOP;

/**
 * A voice written in note names, bar by bar: `E2/4` a note of four sixteenths, `-/2` a
 * rest, `D#3.F#3.A3.C4/4` a chord (lowest first), `x4` after a token to repeat it. The
 * lament's harmony is chromatic -- diminished sevenths, a Neapolitan, a bass sinking by
 * semitones -- which scale steps would spell with an accidental on every other note, so it
 * is written as it sounds. Every bar must be sixteen sixteenths and every chord lowest first.
 */
function score(text, label, count) {
  const out = [];
  const bars = text.split('|').map((b) => b.trim()).filter(Boolean);
  bars.forEach((bar, i) => {
    let len = 0;
    for (const tok of bar.split(/\s+/)) {
      const m = /^(-|[A-G]#?\d(?:\.[A-G]#?\d)*)\/(\d+)(?:x(\d+))?$/.exec(tok);
      if (!m) throw new Error(`${label}, bar ${i + 1}: cannot read "${tok}"`);
      const dur = Number(m[2]);
      const names = m[1] === '-' ? null : m[1].split('.');
      if (names) {
        const ks = names.map(midi);
        if (ks.some((k, j) => j && k <= ks[j - 1])) throw new Error(`${label}, bar ${i + 1}: ${m[1]} is not lowest first`);
      }
      for (let r = 0; r < Number(m[3] || 1); r++) {
        out.push([names === null ? null : names.length === 1 ? names[0] : names, dur]);
        len += dur;
      }
    }
    if (len !== BAR) throw new Error(`${label}, bar ${i + 1} is ${len} sixteenths, not ${BAR}: ${bar}`);
  });
  if (bars.length !== count) throw new Error(`${label} has ${bars.length} bars, not ${count}`);
  return out;
}

function gameover() {
  // The loop's organ chords, two to a bar, shared by the manual and -- from bar 7 -- the choir.
  const LOOP_ORGAN = [
    'G3.B3.F#4/8 G3.B3.E4/8',        // E:  Em, the 9th hanging over from the dominant (9-8)
    'G3.B3.E4/8  F#3.A3.C4/8',       // D#: Em over its major seventh; D# diminished seventh
    'F#3.A3.C4/8 G3.B3.D4/8',        // D:  D7, its 7th held over; G over D
    'G3.B3.E4/8  G3.A#3.E4/8',       // C#: C# half-diminished (Em6), B held over -- 7-6 to A#
    'G3.B3.E4/8  A3.C4.E4/8',        // C:  C major seventh; A minor over C
    'G3.B3.E4/8  F#3.A3.D#4/8',      // B:  Em over B, E held over -- 4-3 -- to B7
    'A3.C4.F4/8  A3.C4.F#4/8',       // A:  the Neapolitan F over A; F# diminished over A
    'A3.B3.E4.F#4/8 A3.B3.D#4.F#4/8', // B: B7 with the 4th, pressing -- 4-3 -- and B7
  ];
  const lead = score(`
    B5/2 A#5/2 A5/2 G#5/2 G5/2 F#5/2 F5/2 E5/2 |
    F#5.A5.C6/2 D#6/2 F#6/4 -/8 |
    E6/3 B5/1 C6/2 B5/2 E5/8 |
    D#6/4 B5/2 G5/2 F#5/2 A5/2 C6/4 |
    D6/4 C6/2 A5/2 B5/2 G5/2 D5/4 |
    E6/4 G5/2 B5/2 A#5/4 G5/2 E5/2 |
    B5/4 G5/2 E5/2 C6/4 A5/2 E5/2 |
    E6/4 B5/2 G5/2 D#6/4 A5/2 F#5/2 |
    F5/4 C6/2 A5/2 F#6/4 C6/2 A5/2 |
    F#6/4 E6/2 B5/2 D#6/6 -/2 |
  `, 'gameover lead', LAMENT_BARS);
  const bass = score(`
    E2/1 E2/1 -/2 F2/1 F2/1 -/1 F#2/1 F#2/1 -/1 G2/1 G2/1 G#2/1 G#2/1 A2/1 A2/1 |
    E2/4 B1/12 |
    E2/16 | D#2/16 | D2/16 | C#2/16 | C2/16 | B1/16 | A1/16 | B1/16 |
  `, 'gameover bass', LAMENT_BARS);
  const choir = score(`
    E3/2 E3.F3/3 E3.F3.A#3/3 E3.F3.A#3.B3/8 |
    D#3.F#3.A3.C4/16 |
    -/16 | -/16 | -/16 | -/16 |
    ${LOOP_ORGAN.slice(4).join(' | ')} |
  `, 'gameover choir', LAMENT_BARS);
  // Bar 2 after the stab's chord is the piece's one quotation: the opening gesture of
  // J. S. Bach's Toccata in D minor, BWV 565 (public domain), moved to E minor -- the
  // mordent B A B held, then the run A G F# E to the leading tone D#. Nothing else here is
  // quoted, and nothing at all is taken from The Phantom of the Opera.
  const brass = score(`
    -/16 |
    D#3.F#3.A3.C4.D#4/4 B4/1 A4/1 B4/4 A4/1 G4/1 F#4/1 E4/1 D#4/2 |
    ${LOOP_ORGAN.join(' | ')} |
  `, 'gameover brass', LAMENT_BARS);

  return {
    bpm: 72, tonic: 'E', loop: LAMENT_LOOP, intro: LAMENT_INTRO, landing: LAMENT_LANDING, keyFromCut: true,
    lead, bass, choir, brass,
    // The organ (see above), and its levels, set by measurement through the engine itself
    // (tools/engine-render.mjs, test-lament) at the level the scoreboard plays it --
    // intensity 0, the choir bus at CHOIR_MIN -- against the climb themes at a steady
    // climb's 0.2 (their mean -35.3 LUFS, the quietest -35.8, peaks to -22.9 dBFS). The loop
    // is -37.9 LUFS, 2.6 LU under the mean, peaking at -23.8; voice by voice the organ
    // -41.0, the pedal -43.9, the music box -46.4, the choir (half the loop) -46.3 -- it was
    // -48.6 on the pad envelope, which swells into each chord and fades from three quarters
    // of it; as a rank of the organ it holds, and the second half's build is 2.3 dB more
    // of it. First
    // set with the pedal louder than the organ (-41.4 against -42.9) and the music box
    // about a decibel under it, the organ was an accompaniment; the pedal came down 2.5 dB
    // and the music box 2.4, the organ up 1.9. The music box's chord struck with the stab
    // peaked up to 0.4 dB over the climb's peak as four notes; it is three, and the box came
    // down its last decibel.
    mix: {
      lead: { type: 'triangle', env: 'pluck', gain: 0.12 },
      bass: { type: 'triangle', env: 'organ', gain: 0.09, stops: [{ semi: 0, gain: 1 }, { semi: 12, gain: 0.5 }] },
      choir: { type: 'triangle', env: 'organ', gain: 0.8 },
      brass: { type: 'square', env: 'organ', gain: 0.0375, stops: [{ semi: 0, gain: 1 }, { semi: 12, cents: 7, gain: 0.5 }] },
    },
  };
}

/**
 * Recover the model's flattened note data.
 *
 * It emitted ["E3",2,"E3",2,[null,4],...] -- pairs flattened into one stream, except
 * rests, which it kept as pairs. Walk the stream and re-pair it.
 */
function recoverPairs(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i++) {
    const v = flat[i];
    if (Array.isArray(v)) { out.push([v[0] ?? null, v[1]]); continue; }
    if (typeof v === 'string' && typeof flat[i + 1] === 'number') {
      out.push([v, flat[i + 1]]);
      i++;
    }
  }
  return out;
}

// The model's recovered melody is no longer wired in: the menu stopped using it when it
// opened on the climb's hook, and is a fanfare now. Kept as a diagnostic so the recovery
// path stays exercised.
let menuPhrase = [['E3', 2], ['F#3', 2], ['G3', 4], ['A3', 4], ['B3', 4]];
try {
  const raw = fs.readFileSync('logs/music2.txt', 'utf8').replace(/^﻿/, '');
  const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  // eslint-disable-next-line no-eval
  const M = eval('(' + body + ')');
  const flat = M.menu && M.menu.lead && M.menu.lead[0];
  if (Array.isArray(flat)) {
    const rec = recoverPairs(flat);
    if (rec.length > 8) menuPhrase = rec;
    console.log(`  recovered ${rec.length} notes of the model's menu melody`);
  }
} catch (e) {
  console.log('  could not read the generated menu melody, using the built-in phrase');
}
void menuPhrase;

// --- assemble ---------------------------------------------------------------
//
// The climb track once carried POOLS of alternate arrangements that the engine swapped
// between at every loop point. It was asked for and then it was heard, and it is gone:
// the riff is the piece, and a riff that quietly becomes a different riff every
// twenty-four seconds is not variety, it is the track losing its nerve. What changes
// over a run is the tempo, which leans with how hard you are climbing, the key, which
// takes a rung up the ladder with each zone of a stage, on that zone's bar line, and the
// theme, which changes with the stage (Audio.followClimb). The key used to step every 200
// floors of a stage, out of step with the zones.
const TRACKS = {
  menu: menu(),
  below: below(),
  above: above(),
  heavens: heavens(),
  gameover: gameover(),
};

// Belt and braces for the themes: every voice exactly THEME_BARS bars. accomp() and
// melody() already refuse a bar that does not add up; this refuses a voice that lost or
// gained one.
for (const name of ['below', 'above', 'heavens']) {
  for (const k of ['lead', 'bass', 'choir']) {
    const n = sum(TRACKS[name][k]);
    if (n !== THEME_BARS * BAR) throw new Error(`${name}.${k} is ${n} sixteenths, not ${THEME_BARS * BAR}`);
  }
}
for (const k of ['lead', 'bass', 'choir', 'brass']) {
  const n = sum(TRACKS.menu[k]);
  if (n !== MENU_BARS * BAR) throw new Error(`menu.${k} is ${n} sixteenths, not ${MENU_BARS * BAR}`);
}
// The lament's voices come round to the first note AFTER the fall and the stab, so each
// one needs a note that starts exactly there: a note held across it would leave that voice
// with no loop point, and it would come round to its top -- the fall -- instead. And each
// needs one where the stab starts, because that is where the engine sends every voice when
// he lands (Audio.landLament): a voice with a note held across it would have nowhere to go.
for (const k of ['lead', 'bass', 'choir', 'brass']) {
  const v = TRACKS.gameover[k];
  const n = sum(v);
  if (n !== LAMENT_BARS * BAR) throw new Error(`gameover.${k} is ${n} sixteenths, not ${LAMENT_BARS * BAR}`);
  let at = 0;
  const starts = v.map(([, d]) => { const s = at; at += d; return s; });
  if (!starts.includes(LAMENT_INTRO * BAR)) throw new Error(`gameover.${k} has no note starting where the loop does`);
  if (!starts.includes(LAMENT_LANDING * BAR)) throw new Error(`gameover.${k} has no note starting where the stab does`);
}

// --- serialise --------------------------------------------------------------
//
// One note pair per LINE is what JSON.stringify(_, null, 2) does, and it turned three
// tracks into 2,499 lines of which 2,400 were a bracket. With the variant pools that
// shape would have been about ten thousand. Pairs are packed onto shared lines here;
// the file is data either way, and this one can be scrolled.
function voice(v, indent) {
  const pad = ' '.repeat(indent);
  const name = (n) => (n === null ? 'null' : Array.isArray(n) ? `[${n.map(name).join(',')}]` : `"${n}"`);
  const parts = v.map(([n, d]) => `[${name(n)},${d}]`);
  const lines = [];
  let line = '';
  for (const p of parts) {
    if (line.length + p.length + 1 > 92) { lines.push(pad + line); line = ''; }
    line += (line ? ' ' : '') + p + ',';
  }
  if (line) lines.push(pad + line);
  return '[\n' + lines.join('\n').replace(/,$/, '') + '\n' + ' '.repeat(indent - 2) + ']';
}

function serialise(tracks) {
  const out = [];
  for (const [name, t] of Object.entries(tracks)) {
    const fields = [`    bpm: ${t.bpm},`, `    tonic: '${t.tonic}',`, `    loop: ${t.loop},`];
    if (t.intro) fields.push(`    intro: ${t.intro},`);
    if (t.landing) fields.push(`    landing: ${t.landing},`);
    if (t.keyFromCut) fields.push('    keyFromCut: true,');
    if (t.mix) {
      fields.push(`    mix: ${JSON.stringify(t.mix).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')},`);
    }
    for (const k of ['lead', 'bass', 'choir', 'brass']) {
      if (t[k]) fields.push(`    ${k}: ${voice(t[k], 6)},`);
    }
    out.push(`  ${name}: {\n${fields.join('\n')}\n  },`);
  }
  return '{\n' + out.join('\n') + '\n}';
}

const js = `// Chiptune note data. Three voices, and four for the menu and the lament, whose brass
// plays block chords; a note is a name, null for a rest, or an array of names for a chord.
// A track's optional \`mix\` sets a voice's oscillator, gain or envelope (defaults:
// VOICE_MIX in audio.js).
//
//   menu      a brass fanfare on the call, then a song in thirds and sixths: E major,
//             176 bpm, 24 bars.
//   below     climb theme, stage one: E minor march, 144 bpm, 32 bars.
//   above     climb theme, stage two: D minor, galloping, 168 bpm, 32 bars.
//   heavens   climb theme, stage three: E Lydian, 150 bpm, 32 bars.
//   gameover  the lament, a gothic organ and a music box: E minor, 72 bpm, two bars that
//             play once (the fall, and the stab at the impact) and eight that loop; played
//             in the key the climb was cut in.
//
// \`tonic\` is the note a track is written on; \`intro\` is how many bars play once before
// the loop; \`landing\` is the bar the engine jumps to when he lands (Audio.landLament);
// \`keyFromCut\` makes the engine play a track in the key of the music it cuts into
// (Audio.keyFromCut). A \`mix\` voice's \`stops\` are the ranks each of its pitches sounds on
// (stopsOf in audio.js).
//
// Which zone plays which climb theme: src/game/stages.js.
//
// GENERATED. Edit tools/compose-music.mjs and re-run it; edits here are overwritten.
//
// Regenerate with:  node tools/compose-music.mjs

export const TRACKS = ${serialise(TRACKS)};
`;
fs.writeFileSync('src/render/tracks.js', js);

const range = (v) => {
  const m = v.filter(([n]) => n).flatMap(([n]) => [].concat(n)).map(midi);
  return `${nameOf(Math.min(...m))}-${nameOf(Math.max(...m))}`;
};
console.log('  track     lead   bass  choir   bpm   seconds   lead      bass      choir     brass');
for (const [k, t] of Object.entries(TRACKS)) {
  const secs = (sum(t.lead) * (60 / t.bpm / 4)).toFixed(2);
  console.log(`  ${k.padEnd(9)} ${String(sum(t.lead)).padStart(4)}  ${String(sum(t.bass)).padStart(5)}  ` +
    `${String(t.choir ? sum(t.choir) : 0).padStart(5)}  ${String(t.bpm).padStart(4)}   ${secs.padStart(7)}   ` +
    `${range(t.lead).padEnd(9)} ${range(t.bass).padEnd(9)} ${(t.choir ? range(t.choir) : '').padEnd(9)} ` +
    `${t.brass ? range(t.brass) : ''}`);
}
console.log(`\n  wrote src/render/tracks.js (${js.split('\n').length} lines)`);
