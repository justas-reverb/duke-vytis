// The replay file: bytes, and the text those bytes travel as.
//
// One format, two containers that are the same bytes: the text is what a player pastes
// into a chat, and a .dvreplay file holds exactly that text. `DVR1:` and then the binary
// in base64 -- the standard alphabet, unpadded, on one line. The standard alphabet rather
// than base64url on purpose: `_` is markdown's italics in several chats, and a `--` in
// base64url is what iOS's smart punctuation turns into an em dash. Whitespace and the
// zero-width characters chats insert when they wrap a long word are ignored on the way
// back in; anything else outside the alphabet is refused.
//
// Everything read from outside is UNTRUSTED. The decoder never evals, bounds every length
// and count by the bytes actually present before allocating for it, checks a CRC-32 before
// parsing and every field's range while parsing, runs in time linear in its input, and
// reports a refusal instead of throwing: decodeText returns { ok, replay | error }.
//
// Binary layout, formats 1 to 4 (all integers little-endian; `v` is an unsigned LEB128
// varint under 2^53, `z` a zigzag varint):
//
//   'D' 'V' 'R' format:u8
//   gameVersion: len:u8 (<= 32) + printable ASCII
//   simVersion:v constHash:u32 probeHash:u32          -- the simulation fingerprint
//   seed:u32 flags:u8 (bit 0 demo, bits 1-4 the JUMP SPEED: speedCode, bits 5-7 the DIFFICULTY)
//   companions:u8 (bits 0-1 their movement, bits 2-7 the PLATFORMS: platformsCode)
//   [formats 3 and 4 only] more:u8 (bits 0-4 the GRAVITY: gravityCode; bits 5-7 zero)
//   budget:v date:v
//   steps:v checkEvery:v ghostEvery:v ghostQ:v
//   result: floor:v score:v seconds:f64 zone:v ended:u8   finalCheck:u32
//   records: count:v, then per record  dstep:v  head:u8 (kind << 4 | code)  payload
//   checks: floor(steps / checkEvery) x u32
//   ghost: the pose names it uses: count:v (<= 127), per name  len:u8 (1..32) + [A-Za-z0-9_];
//          floor(steps / ghostEvery) + 1 samples of x and y as second differences (z);
//          then the pose byte in runs: runs:v, per run  length:v  pose:u8, where a pose
//          byte is an index into the names above | 0x80 when he faces left
//   [formats 2 and 4 only] race: flags:u8 (bit 0 the ghost raced, bit 1 the tower it was run on)
//     ghost:  steps:v ghostEvery:v ghostQ:v  result as above (floor:v score:v seconds:f64
//             zone:v ended:u8)  and its track, laid out as the ghost above
//     course: steps:v (the play that laid it out, course.js; at least the ghost's) top:v,
//             then per floor 1..top  head:u8 (its kind: 0 normal, 1 wide, 2 checkpoint;
//             | 0x80 when x and w follow as f64)  x - the last x:z  w:v;
//             open: count:u8 (<= 4) + floors:v and reach: count:u8 + floors:v, the arena's
//             steps (course.js); the generator: rng:u32 pattern:u8 patternLeft:z dir:u8
//             sideRun:v lastHalf+1:u8 flowDir:u8 flowRun:v bits:u8 (1 self-alternating,
//             2 flow, bits 2-7 the ghost's PLATFORMS: platformsCode)
//   crc32:u32 of everything before it
//
// Format 2 is a RACE's replay, and only a race's: the ghost it raced, to draw beside it when
// it is watched, and the tower it was run on -- the ghost run's own (course.js), which no
// seed reproduces -- so it plays back with nothing else at hand, the raced replay deleted or
// one this build refuses as another's. It costs about four bytes a floor of the ghost's tower
// and the ghost's track; every other replay is written as format 1, byte for byte as before,
// and a build that knows only format 1 says a race's replay "needs a newer version".
//
// Formats 3 and 4 are 1 and 2 with one byte more in the header, `more`, for the settings that
// came after every bit of the flags and companions bytes had been taken: the GRAVITY first
// (2026-09-29). It is written only when a setting in it is not what every replay before it was
// played at -- a gravity of 1 (CLASSIC, the game as tuned) writes the bytes a replay always had,
// and every replay kept before reads as 1, the weight it was climbed at -- and a build from
// before it, which knows formats 1 and 2 only, says any other "needs a newer version of the
// game" rather than play it at 1 and desync. Since NORMAL became 0.9 (2026-09-29), that is
// most runs. The same goes for this build and a `more` byte with bits it does not
// know. A decoded replay's `format` is its KIND, 1 or 2 (a race's): the byte is a detail of
// the file.
//
// The ghost names its poses rather than numbering them in the sprite list, because the
// list is the art's (sprites.js's POSE, in sheet order) and moves whenever a frame is
// added: numbered, a replay from an older build would race in the wrong poses, or be
// refused outright if the list had shrunk -- and a ghost is exactly what an old replay is
// kept for. A name this build does not draw falls back to the nearest one it does
// (replay.js, ghostAt).
//
// Per step the recorder writes at most one INPUT, one IDLE, one MOVE, one COSMETIC and
// three BUDGET records, plus ENSURE: that is the whole grammar, and the decoder holds a
// file to it (see Recorder.interlude in replay.js for why no more are ever needed).

import {
  REPLAY_MAX_STEPS, REPLAY_MAX_TEXT, REPLAY_COSMETIC_CAP, REPLAY_COURSE_RATE, REPLAY_COURSE_FLAT,
  PLAY_L, PLAY_R, CX, ARENA_HALF_MIN, DIFFICULTIES,
} from './constants.js';
import { ARENA_STEPS } from './game.js';
import { PATTERNS } from './generator.js';
import { isReachable } from './reach.js';
import { makeCourse, COURSE_KINDS } from './course.js';
import { JUMP_SPEEDS, PLATFORMS_KNOWN, GRAVITIES_KNOWN } from './settings.js';

/** A replay; FORMAT_RACE, one with a race section (see the header). */
export const FORMAT = 1;
export const FORMAT_RACE = 2;
/** Added to either when the header carries its `more` byte: formats 3 and 4 (see the header). */
export const FORMAT_MORE = 2;
export const PREFIX = 'DVR1:';

/**
 * The run's JUMP SPEED (settings.js) as it sits in the header's flags byte, bits 1-7: its
 * 5% steps over 1 -- 0 for 1, 2 for 1.1, 4 for 1.2, 6 for 1.3 -- and -1 for a speed the menu
 * does not offer, which no file may carry. In the flags byte, not a new field, so no file
 * changed shape: a run at 1 writes the byte it always wrote and every replay kept before the
 * setting reads as 1; and a build from before it, which refuses any flag but the demo's,
 * refuses a faster replay rather than play it at 1 and desync.
 */
export function speedCode(s) {
  const c = Math.round((s - 1) * 20);
  // Bits 1-4 since the DIFFICULTY took bits 5-7 (2026-09-28): speeds to 175%, the menu's to 140%.
  return JUMP_SPEEDS.includes(s) && c >= 0 && c <= 15 ? c : -1;
}
/** The speed a flags byte's code stands for, or null for one this build does not offer. */
export function speedOf(code) {
  const s = JUMP_SPEEDS.find((v) => Math.round((v - 1) * 20) === code);
  return s === undefined ? null : s;
}

/**
 * The run's PLATFORMS (settings.js) as six signed bits over 1, its nearest 5% step: -5 for the
 * old SMALL's 0.75, -2 for NORMAL's 0.875, 0 for the old MEDIUM's 1, 4 for WIDE's 1.175, 7 for
 * the old WIDE's 1.35; null for a width no build has offered (settings.js PLATFORMS_KNOWN). A
 * code is read back by looking the width up in that list, never by computing it, so a width
 * between two steps (0.875, 1.175) reads back as itself -- which holds while no two known
 * widths share a step (tools/test-feel.mjs 8 checks it). It rides in bits 2-7 of the header's
 * companions byte, and of a race course's generator bits, both of which only ever used their
 * low bits: 1 writes the bytes they always were, so every replay and course kept before the
 * setting reads as 1, the tower it was climbed on; and a build from before it, which refuses
 * those bits, refuses any other width rather than play it on the wrong ledges and desync.
 */
export function platformsCode(w) {
  const c = Math.round((w - 1) * 20);
  return PLATFORMS_KNOWN.includes(w) && c >= -32 && c <= 31 ? c : null;
}
/** The width six signed bits stand for, or null for one no build has offered. */
export function platformsOf(bits6) {
  const code = bits6 & 0x20 ? (bits6 & 0x3f) - 64 : bits6 & 0x3f;
  const w = PLATFORMS_KNOWN.find((v) => Math.round((v - 1) * 20) === code);
  return w === undefined ? null : w;
}

/**
 * The run's GRAVITY (settings.js) as five signed bits over 1 in 5% steps: -4 for LOW's 0.8, -2
 * for NORMAL's 0.9, 0 for 1 (CLASSIC, the game as tuned), 2 for HIGH's 1.1, 4 for the old HIGH's
 * 1.2; null for a gravity no build has offered (settings.js GRAVITIES_KNOWN), which no file may
 * carry. It rides in bits 0-4 of the header's `more` byte, which only a replay whose gravity is
 * not 1 has (formats 3 and 4) -- so every NORMAL run since 2026-09-29 writes it: the number's own
 * code, as the speed's and the width's are, not an index into the menu's list, so a list that
 * changes reads every old file the same.
 */
export function gravityCode(g) {
  const c = Math.round((g - 1) * 20);
  return GRAVITIES_KNOWN.includes(g) && c >= -16 && c <= 15 ? c : null;
}
/** The gravity five signed bits stand for, or null for one no build has offered. */
export function gravityFor(bits5) {
  const code = bits5 & 0x10 ? (bits5 & 0x1f) - 32 : bits5 & 0x1f;
  const g = GRAVITIES_KNOWN.find((v) => Math.round((v - 1) * 20) === code);
  return g === undefined ? null : g;
}

/**
 * Record kinds. An INPUT record's code is axis (2 bits: 0, +1, -1, other) | held << 2 |
 * press << 3. ENSURE is floors generated from outside the step (its value is how many).
 */
export const K_INPUT = 0, K_IDLE = 1, K_MOVE = 2, K_BUDGET = 3, K_COSMETIC = 4, K_ENSURE = 5;
/**
 * The most floors one ENSURE record may generate. The attract bot's look-ahead generates up
 * to about thirty floors between two steps since it was rebuilt to fly whole flights
 * (2026-09-29; at most six before, over four runs to their deaths), so 64 is twice what a run
 * needs; a hostile file asking for more is asking for memory. It was 5,000.
 */
export const ENSURE_MAX = 64;
/** Records of one kind a step may carry: see the grammar in the header. */
const PER_STEP = [1, 1, 1, 3, 1, 16];
export const AXIS_OTHER = 3;
export const MOVES = ['hop', 'glide'];
/** How the recording ended: the fire had him, the player quit, or it reached REPLAY_MAX_STEPS. */
export const ENDINGS = ['fire', 'quit', 'cut'];
const NAME_OK = /^[A-Za-z0-9_]{1,32}$/;

/**
 * The most menu steps a replay of `steps` may carry. They are simulated in the playback
 * like any other step, so they are bounded: a visit counts at most REPLAY_COSMETIC_CAP,
 * and a file may not spend more than four times its climb on menus plus ten full visits.
 * Without it a hostile file of the same size could put a full visit on every step and
 * make its playback cost 2,400 times a run's; with it, about five times at most. The
 * recorder stops counting at the same bound (at the steps recorded so far, which only
 * grow), so it never writes a file this refuses.
 */
export function menuStepCap(steps) { return 4 * steps + 10 * REPLAY_COSMETIC_CAP; }

/**
 * The most floors a file of `steps` may generate from outside the step (ENSURE records): a
 * quarter of a floor a step, plus room at the start -- as many as a climb itself may generate
 * (REPLAY_COURSE_RATE). The attract bot's look-ahead, rebuilt on 2026-09-29 to plan whole
 * flights, generates 0.077 floors a step beyond what the step does at 100% and EASY and 0.104
 * at the game's defaults, so a quarter is 2.4 times the most measured; it was a sixteenth,
 * sized on the old bot's 0.011, and a ten-minute run of the new one was refused. Floors cost
 * the playback memory, so the bound is what keeps a hostile file's cost to a climb's.
 */
export function ensureCapFor(steps) { return steps / 4 + 1000; }

/**
 * The most floors a race's course may hold when the play that laid it out ran `steps` (the
 * course's own `steps`, course.js): what a climb that long generates (REPLAY_COURSE_RATE and
 * REPLAY_COURSE_FLAT) and what its file may have generated from outside (ensureCapFor) -- a
 * ghost the decoder accepts is surveyed into a course this holds.
 */
export function courseCap(steps) {
  return Math.floor(steps * REPLAY_COURSE_RATE) + REPLAY_COURSE_FLAT + Math.floor(ensureCapFor(steps));
}

/** A header's simulation fingerprint as text, "1.cd8282a0.87cd6c5d": the store keeps it per replay. */
export function fpText(h) {
  const hex = (x) => (x >>> 0).toString(16).padStart(8, '0');
  return `${h.simVersion}.${hex(h.constHash)}.${hex(h.probeHash)}`;
}

// ---- CRC-32 (IEEE) ----------------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(b, end = b.length) {
  let c = 0xffffffff;
  for (let i = 0; i < end; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- base64, strict ---------------------------------------------------------------
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DEC = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) DEC[ALPHA.charCodeAt(i)] = i;
// Ignorable on the way in: whitespace, and the zero-width characters and no-break space a
// chat may put inside a long word. Anything else unknown is a refusal.
const IGNORE = new Set([0x20, 0x09, 0x0a, 0x0d, 0x0b, 0x0c, 0xa0, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

function toBase64(b) {
  let s = '';
  const parts = [];
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    s += ALPHA[n >> 18] + ALPHA[(n >> 12) & 63] + ALPHA[(n >> 6) & 63] + ALPHA[n & 63];
    if (s.length >= 8192) { parts.push(s); s = ''; }
  }
  const r = b.length - i;
  if (r === 1) {
    const n = b[i] << 16;
    s += ALPHA[n >> 18] + ALPHA[(n >> 12) & 63];
  } else if (r === 2) {
    const n = (b[i] << 16) | (b[i + 1] << 8);
    s += ALPHA[n >> 18] + ALPHA[(n >> 12) & 63] + ALPHA[(n >> 6) & 63];
  }
  parts.push(s);
  return parts.join('');
}

function fromBase64(text, start) {
  // Count the real characters first, so the buffer is sized from what is there. Padding
  // is tolerated at the very end (a tool may add it) and nothing but padding and
  // whitespace may follow it.
  let m = 0, stop = text.length;
  for (let i = start; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 128 && DEC[c] >= 0) {
      if (stop < text.length) throw new Error('the text has something after its end');
      m++;
    } else if (c === 0x3d) {
      if (stop === text.length) stop = i;
    } else if (!IGNORE.has(c)) {
      throw new Error('the text has a character that is not part of a replay');
    }
  }
  if (m % 4 === 1) throw new Error('the text is cut short');
  const out = new Uint8Array(Math.floor((m * 3) / 4));
  let acc = 0, bits = 0, o = 0;
  for (let i = start; i < stop && o < out.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 128 || DEC[c] < 0) continue;
    acc = (acc << 6) | DEC[c];
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xff; }
    acc &= 0xffff;
  }
  return out;
}

// ---- byte writer / reader ---------------------------------------------------------
class Writer {
  constructor() { this.b = new Uint8Array(1024); this.n = 0; }
  room(k) {
    if (this.n + k <= this.b.length) return;
    let cap = this.b.length * 2;
    while (cap < this.n + k) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.b.subarray(0, this.n));
    this.b = nb;
  }
  u8(v) { this.room(1); this.b[this.n++] = v & 0xff; }
  u32(v) {
    this.room(4);
    this.b[this.n++] = v & 0xff; this.b[this.n++] = (v >>> 8) & 0xff;
    this.b[this.n++] = (v >>> 16) & 0xff; this.b[this.n++] = (v >>> 24) & 0xff;
  }
  v(x) {
    if (!(x >= 0) || x > Number.MAX_SAFE_INTEGER || x !== Math.floor(x)) throw new Error('varint out of range: ' + x);
    this.room(8);
    while (x >= 128) { this.b[this.n++] = (x % 128) | 128; x = Math.floor(x / 128); }
    this.b[this.n++] = x;
  }
  z(x) { this.v(x < 0 ? -2 * x - 1 : 2 * x); }
  f64(x) {
    this.room(8);
    new DataView(this.b.buffer, this.b.byteOffset + this.n, 8).setFloat64(0, x, true);
    this.n += 8;
  }
  bytes() { return this.b.slice(0, this.n); }
}

class Reader {
  constructor(b, end) { this.b = b; this.i = 0; this.end = end; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  get left() { return this.end - this.i; }
  need(k) { if (this.i + k > this.end) throw new Error('the replay is cut short'); }
  u8() { this.need(1); return this.b[this.i++]; }
  u32() { this.need(4); const v = this.dv.getUint32(this.i, true); this.i += 4; return v; }
  v(max = Number.MAX_SAFE_INTEGER) {
    let x = 0, mul = 1;
    for (let k = 0; k < 8; k++) {
      const c = this.u8();
      x += (c & 127) * mul;
      if (!(c & 128)) {
        if (x > max) throw new Error('a number in the replay is out of range');
        return x;
      }
      mul *= 128;
    }
    throw new Error('a number in the replay is too long');
  }
  z(maxAbs) {
    const u = this.v(2 * maxAbs + 1);
    return u % 2 ? -(u + 1) / 2 : u / 2;
  }
  f64() { this.need(8); const v = this.dv.getFloat64(this.i, true); this.i += 8; return v; }
}

// ---- encode -----------------------------------------------------------------------
/** The replay as bytes. Throws only on a replay this build made wrongly (a NaN, say). */
export function encodeBinary(r) {
  const h = r.header;
  const w = new Writer();
  // The GRAVITY, in the `more` byte when it is not 1's code 0, which makes the file format 3 or
  // 4: a run at 1 (CLASSIC) writes the bytes a replay always had.
  const gc = gravityCode(h.gravity === undefined ? 1 : h.gravity);
  if (gc === null) throw new Error('replay: gravity ' + h.gravity + ' is not one any build offered');
  const more = gc & 0x1f;
  w.u8(0x44); w.u8(0x56); w.u8(0x52); w.u8((r.race ? FORMAT_RACE : FORMAT) + (more ? FORMAT_MORE : 0));
  const gv = String(h.gameVersion || '').slice(0, 32);
  w.u8(gv.length);
  for (let i = 0; i < gv.length; i++) w.u8(gv.charCodeAt(i) & 0x7f);
  w.v(h.simVersion); w.u32(h.constHash); w.u32(h.probeHash);
  const sc = speedCode(h.jumpSpeed === undefined ? 1 : h.jumpSpeed);
  if (sc < 0) throw new Error('replay: jump speed ' + h.jumpSpeed + ' is not one the menu offers');
  const pc = platformsCode(h.platforms === undefined ? 1 : h.platforms);
  if (pc === null) throw new Error('replay: platforms ' + h.platforms + ' are not ones any build offered');
  // The DIFFICULTY in bits 5-7 of the flags byte, over the speed: EASY, 0, writes the byte a
  // file always had, so every replay kept before reads as EASY, the fire it was climbed under;
  // a build from before reads the bits as a speed it does not have and refuses the file.
  const dc = h.difficulty === undefined ? 0 : h.difficulty;
  if (!DIFFICULTIES[dc]) throw new Error('replay: difficulty ' + h.difficulty + ' is not one the menu offers');
  w.u32(h.seed); w.u8((h.demo ? 1 : 0) | (sc << 1) | (dc << 5));
  w.u8(Math.max(0, MOVES.indexOf(h.companions)) | ((pc & 0x3f) << 2));
  if (more) w.u8(more);
  w.v(h.budget); w.v(Math.max(0, Math.floor(h.date)));
  w.v(r.steps); w.v(h.checkEvery); w.v(h.ghostEvery); w.v(h.ghostQ);
  const res = r.result;
  w.v(res.floor); w.v(res.score); w.f64(res.seconds); w.v(res.zone); w.u8(Math.max(0, ENDINGS.indexOf(res.ended)));
  w.u32(r.finalCheck);

  const R = r.records;
  w.v(R.n);
  let prev = 0;
  for (let i = 0; i < R.n; i++) {
    const kind = R.kind[i];
    const code = kind === K_INPUT ? R.code[i] & 15 : 0;
    w.v(R.step[i] - prev);
    prev = R.step[i];
    w.u8((kind << 4) | code);
    const v = R.val[i];
    if (kind === K_INPUT) { if ((code & 3) === AXIS_OTHER) w.f64(v); }
    else if (kind === K_IDLE) w.f64(v);
    else w.v(v);
  }

  for (let i = 0; i < r.checks.length; i++) w.u32(r.checks[i]);

  writeTrack(w, r.ghost);
  if (r.race) writeRace(w, r.race);

  const body = w.n;
  w.u32(crc32(w.b, body));
  return w.bytes();
}

/** A ghost track: its pose names, its samples as second differences, its poses in runs. */
function writeTrack(w, g) {
  // The names the ghost uses, in the order it first uses them, and each pose byte
  // renumbered into that list. Encoding a decoded replay gives back the same list in the
  // same order, so export(import(text)) is the text.
  const local = new Map();
  const names = [];
  const pose = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    const name = g.names[g.pose[i] & 0x7f];
    if (typeof name !== 'string' || !NAME_OK.test(name)) throw new Error('the ghost has a pose with no name');
    let k = local.get(name);
    if (k === undefined) { k = names.length; local.set(name, k); names.push(name); }
    pose[i] = k | (g.pose[i] & 0x80);
  }
  w.v(names.length);
  for (const name of names) { w.u8(name.length); for (let i = 0; i < name.length; i++) w.u8(name.charCodeAt(i)); }
  let px = 0, py = 0, dx = 0, dy = 0;
  for (let i = 0; i < g.n; i++) {
    const x = g.x[i], y = g.y[i];
    const ddx = (x - px) - dx, ddy = (y - py) - dy;
    w.z(ddx); w.z(ddy);
    dx = x - px; dy = y - py; px = x; py = y;
  }
  let runs = 0;
  for (let i = 0; i < g.n; i++) if (i === 0 || pose[i] !== pose[i - 1]) runs++;
  w.v(runs);
  for (let i = 0; i < g.n;) {
    let j = i + 1;
    while (j < g.n && pose[j] === pose[i]) j++;
    w.v(j - i); w.u8(pose[i]);
    i = j;
  }
}

/** A race's section (format 2): the ghost it raced, and the tower it was run on. See the header. */
function writeRace(w, race) {
  const g = race.ghost, c = race.course;
  w.u8((g ? 1 : 0) | (c ? 2 : 0));
  if (g) {
    const h = g.header, res = g.result;
    w.v(g.steps); w.v(h.ghostEvery); w.v(h.ghostQ);
    w.v(res.floor); w.v(res.score); w.f64(res.seconds); w.v(res.zone); w.u8(Math.max(0, ENDINGS.indexOf(res.ended)));
    writeTrack(w, g.ghost);
  }
  if (c) {
    w.v(c.steps); w.v(c.top);
    let px = 0;
    for (let n = 1; n <= c.top; n++) {
      const x = c.x[n], wd = c.w[n];
      // Whole units always, as the generator rounds them; the escape keeps a file exact if a
      // fallback ever laid one at a fraction (Tower.generate's `violations` branch).
      const whole = Number.isInteger(x) && Number.isInteger(wd) && wd >= 0;
      w.u8(c.kind[n] | (whole ? 0 : 0x80));
      if (whole) { w.z(x - px); w.v(wd); } else { w.f64(x); w.f64(wd); }
      px = whole ? x : 0;
    }
    w.u8(c.open.length); for (const f of c.open) w.v(f);
    w.u8(c.reach.length); for (const f of c.reach) w.v(f);
    const s = c.gen;
    w.u32(s.rng >>> 0); w.u8(s.pattern); w.z(s.patternLeft); w.u8(s.dir > 0 ? 1 : 0); w.v(s.sideRun);
    w.u8(s.lastHalf + 1); w.u8(s.flowDir > 0 ? 1 : 0); w.v(s.flowRun);
    const gc = platformsCode(s.widthScale === undefined ? 1 : s.widthScale);
    if (gc === null) throw new Error('replay: a course at platforms ' + s.widthScale + ' no build offered');
    w.u8((s.selfAlternating ? 1 : 0) | (s.flow ? 2 : 0) | ((gc & 0x3f) << 2));
  }
}

export function encodeText(r) { return PREFIX + toBase64(encodeBinary(r)); }

// ---- decode -----------------------------------------------------------------------
/**
 * Parse and validate. Returns the replay, or throws an Error whose message a player can
 * read.
 */
export function decodeBinary(b) {
  if (b.length < 8) throw new Error('this is not a replay');
  if (b[0] !== 0x44 || b[1] !== 0x56 || b[2] !== 0x52) throw new Error('this is not a replay');
  const format = b[3];
  if (format < FORMAT || format > FORMAT_RACE + FORMAT_MORE) {
    throw new Error(format > FORMAT_RACE + FORMAT_MORE ? 'this replay needs a newer version of the game' : 'this replay format is not supported');
  }
  // 3 and 4 are 1 and 2 with the header's `more` byte (see the header).
  const extended = format > FORMAT_RACE;
  const base = extended ? format - FORMAT_MORE : format;
  const end = b.length - 4;
  const want = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(end, true);
  if (crc32(b, end) !== want) throw new Error('the replay is damaged (its checksum does not match)');

  const rd = new Reader(b, end);
  rd.i = 4;
  const gl = rd.u8();
  if (gl > 32) throw new Error('the replay header is damaged');
  let gameVersion = '';
  for (let i = 0; i < gl; i++) {
    const c = rd.u8();
    if (c < 0x20 || c > 0x7e) throw new Error('the replay header is damaged');
    gameVersion += String.fromCharCode(c);
  }
  const header = {
    gameVersion,
    simVersion: rd.v(1e6),
    constHash: rd.u32(),
    probeHash: rd.u32(),
    seed: rd.u32(),
    demo: false, jumpSpeed: 1, platforms: 1, difficulty: 0, gravity: 1, companions: 'hop', budget: 0, date: 0,
    checkEvery: 0, ghostEvery: 0, ghostQ: 0,
  };
  const flags = rd.u8();
  const speed = speedOf((flags >> 1) & 15);
  if (speed === null) throw new Error('the replay was climbed at a jump speed this version does not have');
  const diff = flags >> 5;
  if (!DIFFICULTIES[diff]) throw new Error('the replay was climbed at a difficulty this version does not have');
  header.demo = (flags & 1) === 1;
  header.jumpSpeed = speed;
  header.difficulty = diff;
  const mv = rd.u8();
  if ((mv & 3) >= MOVES.length) throw new Error('the replay header is damaged');
  header.companions = MOVES[mv & 3];
  const plat = platformsOf(mv >> 2);
  if (plat === null) throw new Error('the replay was climbed on platforms this version does not have');
  header.platforms = plat;
  if (extended) {
    const more = rd.u8();
    // Bits a later build gave its own settings: this one cannot play them as they were.
    if (more >> 5) throw new Error('this replay needs a newer version of the game');
    const grav = gravityFor(more);
    if (grav === null) throw new Error('the replay was climbed at a gravity this version does not have');
    // The byte is written only when something in it is not its default, so one that says
    // NORMAL and nothing else is not a file this game wrote.
    if (grav === 1) throw new Error('the replay header is damaged');
    header.gravity = grav;
  }
  header.budget = rd.v(100000);
  header.date = rd.v(8.64e15);
  const steps = rd.v(REPLAY_MAX_STEPS);
  header.checkEvery = rd.v(100000);
  header.ghostEvery = rd.v(100000);
  header.ghostQ = rd.v(1024);
  if (header.checkEvery < 1 || header.ghostEvery < 1 || header.ghostQ < 1) throw new Error('the replay header is damaged');
  const result = { floor: rd.v(1e7), score: rd.v(), seconds: rd.f64(), zone: rd.v(255), ended: 'fire' };
  if (!Number.isFinite(result.seconds) || result.seconds < 0 || result.seconds > 1e7) throw new Error('the replay header is damaged');
  const en = rd.u8();
  if (en >= ENDINGS.length) throw new Error('the replay header is damaged');
  result.ended = ENDINGS[en];
  const finalCheck = rd.u32();

  // Records. Each takes at least two bytes, so a count the bytes cannot hold is refused
  // before anything is allocated for it.
  const perStepMax = PER_STEP.reduce((a, b) => a + b, 0);
  const n = rd.v(perStepMax * steps);
  if (n > rd.left / 2) throw new Error('the replay is cut short');
  const R = { n, step: new Int32Array(n), kind: new Uint8Array(n), code: new Uint8Array(n), val: new Float64Array(n) };
  let at = 0;
  const onStep = new Uint8Array(PER_STEP.length);
  // Floors generated from outside cost memory and time in the playback, so a file may not
  // ask for many more than a climb could (ensureCapFor).
  let ensured = 0;
  const ensureCap = ensureCapFor(steps);
  let menuSteps = 0;
  const menuCap = menuStepCap(steps);
  for (let i = 0; i < n; i++) {
    const d = rd.v(REPLAY_MAX_STEPS);
    if (d > 0 || i === 0) onStep.fill(0);
    at += d;
    if (at >= steps) throw new Error('the replay has input past its own end');
    const head = rd.u8();
    const kind = head >> 4, code = head & 15;
    if (kind >= PER_STEP.length) throw new Error('the replay has a record this version does not know');
    if (++onStep[kind] > PER_STEP[kind]) {
      throw new Error(kind === K_INPUT ? 'the replay has two inputs on one step' : 'the replay has too many records on one step');
    }
    R.step[i] = at; R.kind[i] = kind; R.code[i] = code;
    if (kind === K_INPUT) {
      const a = code & 3;
      if (a === AXIS_OTHER) {
        const v = rd.f64();
        if (!Number.isFinite(v) || Math.abs(v) > 8) throw new Error('the replay has an impossible input');
        R.val[i] = v;
      } else R.val[i] = a === 0 ? 0 : a === 1 ? 1 : -1;
    } else if (code !== 0) {
      throw new Error('the replay has a damaged record');
    } else if (kind === K_IDLE) {
      const v = rd.f64();
      if (!Number.isFinite(v) || v < 0 || v > 1e6) throw new Error('the replay has an impossible record');
      R.val[i] = v;
    } else if (kind === K_MOVE) {
      R.val[i] = rd.v(MOVES.length - 1);
    } else if (kind === K_BUDGET) {
      R.val[i] = rd.v(100000);
    } else if (kind === K_COSMETIC) {
      const v = rd.v(REPLAY_COSMETIC_CAP);
      if (v < 1) throw new Error('the replay has a damaged record');
      menuSteps += v;
      if (menuSteps > menuCap) throw new Error('the replay spends longer on menus than a run could');
      R.val[i] = v;
    } else {
      const v = rd.v(ENSURE_MAX);
      ensured += v;
      if (v < 1 || ensured > ensureCap) throw new Error('the replay asks for more tower than a run could climb');
      R.val[i] = v;
    }
  }

  const nc = Math.floor(steps / header.checkEvery);
  if (nc * 4 > rd.left) throw new Error('the replay is cut short');
  const checks = new Uint32Array(nc);
  for (let i = 0; i < nc; i++) checks[i] = rd.u32();

  const ghost = readTrack(rd, Math.floor(steps / header.ghostEvery) + 1);
  const race = base === FORMAT_RACE ? readRace(rd, header) : null;
  if (rd.i !== end) throw new Error('the replay has bytes after its end');

  return { format: base, header, steps, result, finalCheck, records: R, checks, ghost, race };
}

/** A ghost track of `gn` samples, as writeTrack wrote it. */
function readTrack(rd, gn) {
  const nn = rd.v(127);
  if (nn < 1) throw new Error('the replay ghost is damaged');
  const names = [];
  for (let i = 0; i < nn; i++) {
    const len = rd.u8();
    if (len < 1 || len > 32) throw new Error('the replay ghost is damaged');
    let s = '';
    for (let k = 0; k < len; k++) s += String.fromCharCode(rd.u8());
    if (!NAME_OK.test(s) || names.includes(s)) throw new Error('the replay ghost is damaged');
    names.push(s);
  }
  if (gn * 2 > rd.left) throw new Error('the replay is cut short');
  const ghost = { n: gn, x: new Int32Array(gn), y: new Int32Array(gn), pose: new Uint8Array(gn), names };
  const LIM = 2147483647;
  let px = 0, py = 0, dx = 0, dy = 0;
  for (let i = 0; i < gn; i++) {
    dx += rd.z(2 * LIM); dy += rd.z(2 * LIM);
    px += dx; py += dy;
    if (Math.abs(px) > LIM || Math.abs(py) > LIM || Math.abs(dx) > LIM || Math.abs(dy) > LIM) {
      throw new Error('the replay ghost is damaged');
    }
    ghost.x[i] = px; ghost.y[i] = py;
  }
  const runs = rd.v(gn);
  let filled = 0;
  for (let r = 0; r < runs; r++) {
    const len = rd.v(gn);
    const p = rd.u8();
    if (len < 1 || filled + len > gn || (p & 0x7f) >= nn) throw new Error('the replay ghost is damaged');
    ghost.pose.fill(p, filled, filled + len);
    filled += len;
  }
  if (filled !== gn) throw new Error('the replay ghost is damaged');
  return ghost;
}

const RACE_BAD = 'the race in the replay is damaged';

/** A race's section, as writeRace wrote it: { ghost, course }, either of them null. */
function readRace(rd, header) {
  const flags = rd.u8();
  if (flags < 1 || flags > 3) throw new Error(RACE_BAD);
  let ghost = null, course = null;
  if (flags & 1) {
    const steps = rd.v(REPLAY_MAX_STEPS);
    const ghostEvery = rd.v(100000), ghostQ = rd.v(1024);
    if (ghostEvery < 1 || ghostQ < 1) throw new Error(RACE_BAD);
    const result = { floor: rd.v(1e7), score: rd.v(), seconds: rd.f64(), zone: rd.v(255), ended: 'fire' };
    if (!Number.isFinite(result.seconds) || result.seconds < 0 || result.seconds > 1e7) throw new Error(RACE_BAD);
    const en = rd.u8();
    if (en >= ENDINGS.length) throw new Error(RACE_BAD);
    result.ended = ENDINGS[en];
    const track = readTrack(rd, Math.floor(steps / ghostEvery) + 1);
    ghost = { header: { seed: header.seed, ghostEvery, ghostQ }, steps, result, ghost: track };
  }
  if (flags & 2) course = readCourse(rd, ghost ? ghost.steps : 0);
  return { ghost, course };
}

/**
 * The tower a race was run on. Untrusted like everything else, and more than a desync is at
 * stake: a racer of this replay's run climbs this tower (race.js surveys a replay by playing
 * it, on this course), so it is held to what the generator promises of any tower -- every
 * floor reachable from the one below (reach.js), inside the play area and inside the shaft
 * the ghost's arena had when it was laid out -- as well as to the bytes present and to what
 * play of the course's own `steps` could have generated (courseCap). Those steps are at least
 * the ghost's (`ghostSteps`), whose run laid the course out or was served it.
 */
function readCourse(rd, ghostSteps) {
  const steps = rd.v(REPLAY_MAX_STEPS);
  if (steps < ghostSteps) throw new Error(RACE_BAD);
  const top = rd.v(courseCap(steps));
  if (top < 1) throw new Error(RACE_BAD);
  // Three bytes a floor at the least, checked before anything is allocated for them.
  if (top * 3 > rd.left) throw new Error('the replay is cut short');
  const x = new Float64Array(top + 1), w = new Float64Array(top + 1), kind = new Uint8Array(top + 1);
  const SPAN = PLAY_R - PLAY_L;
  let px = 0;
  for (let n = 1; n <= top; n++) {
    const head = rd.u8(), k = head & 0x7f;
    if (k >= COURSE_KINDS.length) throw new Error(RACE_BAD);
    kind[n] = k;
    if (head & 0x80) { x[n] = rd.f64(); w[n] = rd.f64(); px = 0; }
    else { x[n] = px + rd.z(SPAN); w[n] = rd.v(SPAN); px = x[n]; }
  }
  const steps4 = ARENA_STEPS.length - 1;
  const thresholds = (min, max) => {
    const c = rd.u8();
    if (c > steps4) throw new Error(RACE_BAD);
    const out = [];
    for (let i = 0; i < c; i++) {
      const f = rd.v(max);
      if (f < min || (i && f < out[i - 1])) throw new Error(RACE_BAD);
      out.push(f);
    }
    return out;
  };
  const open = thresholds(1, top);
  const reach = thresholds(0, 1e7);
  const gen = {
    rng: rd.u32(), pattern: rd.u8(), patternLeft: rd.z(64), dir: rd.u8(), sideRun: rd.v(1e7),
    lastHalf: rd.u8(), flowDir: rd.u8(), flowRun: rd.v(1e7), selfAlternating: false, flow: false, widthScale: 1,
  };
  const bits = rd.u8();
  const width = platformsOf(bits >> 2);
  if (gen.pattern >= PATTERNS.length || gen.dir > 1 || gen.lastHalf > 2 || gen.flowDir > 1 || width === null) throw new Error(RACE_BAD);
  gen.widthScale = width;
  gen.dir = gen.dir ? 1 : -1;
  gen.lastHalf -= 1;
  gen.flowDir = gen.flowDir ? 1 : -1;
  gen.selfAlternating = (bits & 1) !== 0;
  gen.flow = (bits & 2) !== 0;
  // The geometry, floor by floor, in the shaft its arena step had when it was laid out.
  let prev = { x: CX - ARENA_HALF_MIN, w: 2 * ARENA_HALF_MIN };   // the ground, as a race begins
  let s = 0;
  for (let n = 1; n <= top; n++) {
    while (s < open.length && open[s] <= n) s++;
    const half = ARENA_STEPS[s].half;
    const lo = Math.max(PLAY_L, CX - half), hi = Math.min(PLAY_R, CX + half);
    const cur = { x: x[n], w: w[n] };
    if (!Number.isFinite(cur.x) || !Number.isFinite(cur.w) || cur.x < lo - 1e-9 || cur.x + cur.w > hi + 1e-9) {
      throw new Error('the race in the replay has a ledge outside the shaft');
    }
    if (!isReachable(prev, cur)) throw new Error('the race in the replay has a ledge no one could reach');
    prev = cur;
  }
  return makeCourse({ top, steps, x, w, kind, open, reach, gen });
}

/**
 * Text in, replay out -- or a refusal. Never throws, whatever it is handed.
 */
export function decodeText(text) {
  try {
    if (typeof text !== 'string') return { ok: false, error: 'this is not a replay' };
    if (text.length > REPLAY_MAX_TEXT) return { ok: false, error: 'this is too long to be a replay' };
    let s = 0;
    while (s < text.length && IGNORE.has(text.charCodeAt(s))) s++;
    if (text.slice(s, s + PREFIX.length) !== PREFIX) {
      return { ok: false, error: /^DVR\d+:/.test(text.slice(s, s + 8)) ? 'this replay needs a newer version of the game' : 'this is not a replay' };
    }
    const bytes = fromBase64(text, s + PREFIX.length);
    return { ok: true, replay: decodeBinary(bytes) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'this is not a replay' };
  }
}
