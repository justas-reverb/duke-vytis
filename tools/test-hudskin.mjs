// The HUD's per-zone skin: every zone has one, it is painted ahead of the zone's arrival,
// the FALL ROOM gauge stays gone, and every word the HUD prints is legible in every zone.
//
//   node tools/test-hudskin.mjs
//
// WHAT IT HOLDS IT TO (src/render/hudskin.js, the zones in src/render/hudpaint.js, drawn by
// src/ui/hud.js)
//
//   1. EVERY ZONE    HUD_ZONES has a spec of its own for every name in THEMES. hudskin.js
//                    falls back to BASEMENT's for a zone without one, silently, so a missing
//                    zone would only ever look like the cellar. Once painted, every zone's
//                    skin has every piece BASEMENT's has -- the keylines and inks at each
//                    scale, the frames and fills of both gauges -- and none of them empty.
//   2. AHEAD         a real climb: the attract bot from the ground to floor 2640, every zone
//                    of the first cycle and then DUNGEON, CITADEL and BASEMENT of the second.
//                    The HUD is drawn every fourth step, 60 frames a second against the
//                    240 Hz simulation -- the slowest display the game runs on, and so the
//                    fewest frames the next zone's skin has to be painted in, a piece per
//                    frame. On every frame the skin drawn must be the zone on screen's (it
//                    switches on the arrival frame, under the flash, never a frame late),
//                    and over the whole climb no piece may be painted inside the frame that
//                    needed it (hudSkinStats().lateBuilds): that would be a hitch in the
//                    arrival frame, which already carries the flash, the shake and a burst.
//   3. NO FALL ROOM  the right edge under the score, where the FALL ROOM gauge and its label
//                    were (view units x 404-466, y 74-197: PLAY_R - 10 to PLAY_R - 3 for
//                    the bar, its label right-aligned at PLAY_R - 3 on row 186), gets
//                    nothing from the HUD. The user asked for the gauge to go; hud.js keeps
//                    that edge empty on purpose. Not one draw call lands there in the whole
//                    climb, and not one pixel in staged frames with the fire anywhere from
//                    far below to at his feet and the old gauge's blink on and off. The
//                    pixel check is run once on the old gauge, redrawn where it was, to
//                    prove it bites.
//   4. LEGIBLE       every word the HUD prints, in a state that prints them all (SPEED
//                    pinned, AIR JUMP READY -- TRIPLE JUMP READY on the third floor of each
//                    zone, and both must be read -- the ascension's BOUNCE X1.1 SPEED X1.1 at
//                    the top on the second, a chain, a 137-floor combo, a record to beat,
//                    RAMPAGE, the fire close and CLIMB! up), in real frames of every zone at
//                    three floors across it -- its backdrop, walls, ledges, the fire, the
//                    danger band over the bottom -- drawn in the game's own order. For each
//                    word: its LETTERS are the font's blocks where the HUD drew them (read
//                    off the HUD's own drawImage calls, not a copy of its layout), and what
//                    SURROUNDS them is every pixel within the keyline's width of a letter
//                    that is not a letter: the keyline where there is one, the scene where
//                    there is not. Measured in the finished frame, WCAG's contrast ratio of
//                    the letters' median luminance against the brightest tenth of their
//                    surround must be 4.5:1 or better (WCAG's floor for normal text), and
//                    of the darkest letter pixel against the same, 3:1. Today the weakest
//                    word is CLIMB! at 5.7:1 (flat red on its own near-black keyline, the
//                    same in every zone) and every other word is 10:1 or better, its
//                    darkest pixel 4.8:1 at worst (MAX in FOREST). With every keyline made
//                    transparent, STORM's AIR JUMP READY measured 1.0:1 against the cloud
//                    behind it, and 34 of the 540 words failed.
//                    The same masks on the frame drawn without the HUD must fail, to prove
//                    the measure reads the HUD.
//   5. THE HERALD AND THE CALLS
//                    the herald's lines (hud.js, the banner stack's text) and a companion's
//                    call (Renderer.drawCompanionCalls), lettered in the menus' fine
//                    lettering since 2026-09-29, in real frames of every zone at three floors:
//                    each line's letters against the brightest tenth of their keyline, 4.5:1
//                    at the median and 3:1 at the darkest pixel, read off their glyph draws; and
//                    for a herald's line, which has no plate, what lies behind it past the
//                    keyline is printed. The same masks with no HUD and no calls must fail.
//
// The frames for 4 leave the Duke, the companions, their call boxes, the floaters and the
// particles out: the measure is of the HUD over the zone, not of whoever passes in front of
// it. Everything is seeded (Math.random per climb and per scene), so a failure reproduces.

import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const { mulberry32 } = await import('../src/core/rng.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const C = await import('../src/game/constants.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');
const HS = await import('../src/render/hudskin.js');
const { HUD_ZONES } = await import('../src/render/hudpaint.js');
const { THEMES, themeIndexFor } = await import('../src/game/themes.js');
const { GLYPHS, GW, GH, drawText } = await import('../src/render/font.js');

const PX = C.PX, SW = C.SW, SH = C.SH;

let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; return cond; };

// Where the FALL ROOM gauge and its label were, in view units, with a margin of a unit or
// two all round: [x0, y0, x1, y1), x1 and y1 exclusive.
const GONE = [C.PLAY_R - 60, 74, C.PLAY_R + 3, 198];
const inGone = (x, y, w, h) => x < GONE[2] && x + w > GONE[0] && y < GONE[3] && y + h > GONE[1];

// --- 1. every zone has a spec -----------------------------------------------------------
// Asked of the table only: nothing is painted before the climb, or the climb would find
// skins already painted and could not see one painted late.
{
  const own = (n) => Object.prototype.hasOwnProperty.call(HUD_ZONES, n) && HUD_ZONES[n] && HUD_ZONES[n].text;
  const missing = THEMES.filter((t) => !own(t.name)).map((t) => t.name);
  const extra = Object.keys(HUD_ZONES).filter((n) => !THEMES.some((t) => t.name === n));
  ok(!missing.length && !extra.length, `every zone has a HUD skin of its own (${THEMES.length} zones` +
    (missing.length ? `; missing: ${missing.join(', ')}` : '') +
    (extra.length ? `; skins for no zone: ${extra.join(', ')}` : '') + ')');
}

// --- 2 and 3a. a real climb -----------------------------------------------------------------

// BASEMENT's second-cycle band starts at 2600; the climb goes 40 floors past it so the HUD
// draws frames after that last arrival too (it ended in the arrival's own step at 2601).
const TO = 2640;
const FRAME = 4;            // simulation steps per HUD frame: 60 Hz against 240 Hz
let run = null;
const deaths = [];
for (let si = 0; si < DEMO_SEEDS.length && !run; si++) {
  HS.resetHudSkinStats();
  Math.random = mulberry32(99 + si);
  // A 1 x 1 canvas: every line of the HUD runs and almost no pixel is filled, so the climb
  // costs about a second and a half. What it draws is recorded instead, for 3. No Renderer
  // here, so nothing resizes the canvas under its context.
  const ctx = new HeadlessCanvas(1, 1).getContext('2d');
  const gone = [];
  const di = ctx.drawImage, fr = ctx.fillRect;
  ctx.drawImage = function (img, ...a) {
    const [x, y, w, h] = a.length >= 8 ? a.slice(4, 8) : a.length >= 4 ? a : [a[0], a[1], img.width, img.height];
    if (inGone(x, y, w, h)) gone.push(`drawImage at ${x.toFixed(1)},${y.toFixed(1)}`);
    return di.call(this, img, ...a);
  };
  ctx.fillRect = function (x, y, w, h) {
    if (inGone(x, y, w, h)) gone.push(`fillRect at ${x.toFixed(1)},${y.toFixed(1)}`);
    return fr.call(this, x, y, w, h);
  };
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  // The attract run as the menu starts it (the real tower at the game's defaults): it climbs
  // about 25 floors a second, well ahead of the fire, so it gets this far in under two minutes;
  // a player's game paints skins ahead the same way.
  startDemo(game, DEMO_SEEDS[si]);
  const all = Stats.BLANK_ALL();
  let frames = 0, arrivals = 0, zoneFrames = 0, shortest = Infinity, last = game.themeIndex;
  const wrong = [];
  for (let i = 0; i < 240 * 400 && game.state === STATE.PLAYING && game.run.maxFloor < TO; i++) {
    bot.step(game, STEP);
    game.step(STEP);
    if (game.themeIndex !== last) {
      arrivals++;
      shortest = Math.min(shortest, zoneFrames);
      zoneFrames = 0;
      last = game.themeIndex;
    }
    if (i % FRAME === FRAME - 1) {
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      drawHud(ctx, game, all, i * STEP);
      frames++;
      zoneFrames++;
      const cur = HS.hudSkinStats().current;
      if (cur !== game.theme.name && wrong.length < 5) wrong.push(`${cur} drawn in ${game.theme.name} at floor ${game.run.maxFloor}`);
    }
  }
  if (game.run.maxFloor >= TO) {
    run = { frames, arrivals, shortest, wrong, gone, late: HS.hudSkinStats().lateBuilds, secs: frames / 60 };
  } else deaths.push(`demo tower ${si} ended at floor ${game.run.maxFloor} (${game.state})`);
}

if (ok(!!run, `the attract bot climbed to floor ${TO}` + (deaths.length ? ` (${deaths.join('; ')})` : ''))) {
  ok(run.arrivals === 14, `the climb crossed all twelve zones: ${run.arrivals} arrivals over ${run.secs.toFixed(0)} s of HUD frames at 60 Hz, the shortest stay ${run.shortest} frames`);
  ok(!run.wrong.length, `every frame drew the skin of the zone on screen` + (run.wrong.length ? `; not: ${run.wrong.join('; ')}` : ''));
  ok(run.late === 0, `no piece of a skin painted in the frame that needed it (late pieces: ${run.late})`);
  ok(!run.gone.length, `nothing drawn where the FALL ROOM gauge was, in ${run.frames} HUD frames` +
    (run.gone.length ? `; ${run.gone.length} calls, first ${run.gone.slice(0, 3).join(', ')}` : ''));
}

// Every zone's skin, painted whole now, against BASEMENT's pieces.
{
  const bad = [];
  const ref = Object.keys(HS.warmHudSkin('BASEMENT').parts).sort();
  for (const th of THEMES) {
    const s = HS.warmHudSkin(th.name);
    if (s.spec !== HUD_ZONES[th.name]) bad.push(`${th.name} is drawn from another zone's spec`);
    const keys = Object.keys(s.parts).sort();
    if (keys.join() !== ref.join()) bad.push(`${th.name} has pieces [${keys}] where BASEMENT has [${ref}]`);
    for (const k of keys) {
      const c = s.parts[k] && (s.parts[k].c || s.parts[k]);
      let n = 0;
      const d = c && c.width && c.height ? c.data : [];
      for (let i = 3; i < d.length; i += 4) if (d[i]) { n++; break; }
      if (!n) bad.push(`${th.name} ${k} is empty`);
    }
  }
  ok(!bad.length, `every zone's skin has all ${ref.length} pieces, none empty` + (bad.length ? `: ${bad.slice(0, 5).join('; ')}` : ''));
}

// --- 3b. nothing where the FALL ROOM gauge was, pixel by pixel ------------------------------
const { Renderer, THREAT_HZ } = await import('../src/render/renderer.js');

/** HUD pixels in the gauge's old place, on a canvas the HUD alone was drawn on. */
function goneCount(cv) {
  let n = 0;
  const d = cv.data;
  for (let y = GONE[1] * PX; y < GONE[3] * PX; y++) {
    for (let x = GONE[0] * PX; x < Math.min(SW, GONE[2] * PX); x++) if (d[(y * SW + x) * 4 + 3]) n++;
  }
  return n;
}
/** A game standing on `floor`, the camera settled where the game puts it. */
function scene(floor) {
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(0x2f6f1b21);
  // The arena fully open at zoom 1, as it is for most of a run past the first floors.
  game.openness = 1; game.arenaEase = C.ARENA_HALF_MAX; game.arenaHalfView = C.ARENA_HALF_MAX;
  game.zoom = game.zoomView = 1; game.viewH = C.VH;
  game.tower.setBounds(C.PLAY_L, C.PLAY_R); game.player.setBounds(C.PLAY_L, C.PLAY_R);
  game.tower.ensure(floor + 12);
  const pl = game.tower.get(floor), p = game.player;
  p.x = p.px = pl.x + pl.w / 2; p.y = p.py = pl.y; p.floor = floor;
  game.run.maxFloor = floor; game.camY = p.y - game.viewH * C.CAM_ANCHOR;
  game.themeIndex = themeIndexFor(floor);
  for (let i = 0; i < Math.round(0.3 / STEP); i++) { bot.step(game, STEP); game.step(STEP); }
  game.particles.draw = () => {};
  game.banners = []; game.flash = 0; game.floaters = [];
  return game;
}
/** Everything the HUD can print at once: see 4. `near` is how far the fire is, 0..1 of its lead. */
function hot(game, near) {
  const p = game.player;
  p.momentum = 1; p.instaChain = 4; p.grounded = false;
  game.combo.active = true; game.combo.floors = 137; game.score = 123456;
  game.riseActive = true;
  game.riseY = p.y - Math.max(1, game.riseLead()) * near;
  game.climbOn = true;
  game.shout = 'RAMPAGE'; game.shoutT = 1.0;
  return game;
}
{
  Math.random = mulberry32(7);
  const all = Stats.BLANK_ALL(); all.bestScore = 200000;
  const game = scene(640);
  let worst = 0, frames = 0;
  const cv = new HeadlessCanvas(SW, SH);
  const g = cv.getContext('2d');
  // The fire from far below to at his feet (the old gauge filled with it), and times across
  // a whole blink of the danger rate (the old gauge flashed white at that rate when urgent).
  for (const near of [0.95, 0.6, 0.33, 0.15, 0.02]) {
    for (let k = 0; k < 8; k++) {
      hot(game, near);
      game.climbOn = near < 0.3;
      cv.data.fill(0);
      g.setTransform(PX, 0, 0, PX, 0, 0);
      drawHud(g, game, all, (k / 8) * (2 * Math.PI / THREAT_HZ));
      worst = Math.max(worst, goneCount(cv));
      frames++;
    }
  }
  ok(worst === 0, `no HUD pixel where the FALL ROOM gauge was, in ${frames} frames from a far fire to one at his feet (most: ${worst})`);
  // The check itself, against the old gauge drawn where it was: its bar and its label.
  cv.data.fill(0);
  g.setTransform(PX, 0, 0, PX, 0, 0);
  g.fillStyle = '#00000066'; g.fillRect(C.PLAY_R - 10, 78, 7, 104);
  g.fillStyle = '#b8365a'; g.fillRect(C.PLAY_R - 10, 150, 7, 32);
  drawText(g, 'FALL ROOM', C.PLAY_R - 3, 186, '#ff3355', 1, 'right');
  ok(goneCount(cv) > 0, `the check sees the old gauge drawn where it was (${goneCount(cv)} px)`);
}

// --- 4. every word legible in every zone ----------------------------------------------------

/** The HUD's charset, in its atlases' order (hudskin.js CHARSET): a cell's index is its letter. */
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!';
const INKS = /^(ink|num|hot|flash|chain|gold|danger|shout)(\d)$/;
const BODY_MIN = 4.5;       // letters' median against the surround's brightest tenth [WCAG ratio]
const DARK_MIN = 3;         // the darkest letter pixel against the same [WCAG ratio]

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const pct = (arr, q) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/**
 * The words of one HUD draw, from its glyph blits: [{ role, text, body: [pixel index],
 * blocks: [[x, y, size]], o }], in backing pixels. A word is a run of blits from one atlas
 * on one row; a blit's source cell says the letter, its size the scale and keyline width.
 */
function wordsOf(calls, problems) {
  const words = [];
  for (const c of calls) {
    const w = words[words.length - 1];
    if (w && w.key === c.key && w.dy === c.dy) w.calls.push(c); else words.push({ key: c.key, dy: c.dy, calls: [c] });
  }
  for (const w of words) {
    w.role = w.key;
    w.body = []; w.blocks = []; w.text = '';
    for (const c of w.calls) {
      const scale = Number(INKS.exec(c.key)[2]);
      const b = scale * PX, o = (c.sw - GW * b) / 2;
      if (Math.round(c.aw / c.sw) !== CHARSET.length && problems.length < 3) {
        problems.push(`the ${c.key} atlas has ${Math.round(c.aw / c.sw)} cells, not ${CHARSET.length}: hudskin.js's CHARSET changed`);
      }
      const ch = CHARSET[Math.round(c.sx / c.sw)];
      // skinText draws nothing for a space, so a gap of more than a cell is one.
      const prev = w.calls[w.calls.indexOf(c) - 1];
      if (prev && c.dx - prev.dx > 1.4 * c.sw / PX) w.text += ' ';
      w.text += ch;
      w.o = o;
      const X = Math.round(c.dx * PX) + o, Y = Math.round(c.dy * PX) + o;
      const rows = GLYPHS[ch];
      for (let r = 0; r < GH; r++) {
        for (let q = 0; q < GW; q++) {
          if (rows[r][q] !== '#') continue;
          w.blocks.push([X + q * b, Y + r * b, b]);
          for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) w.body.push((Y + r * b + j) * SW + X + q * b + i);
        }
      }
    }
  }
  return words;
}

/** Each word's letters against their surround, in frame `d`: [{ text, role, body, dark }]. */
function legibility(words, d) {
  const letters = new Set();
  for (const w of words) for (const k of w.body) letters.add(k);
  return words.map((w) => {
    const ring = new Set();
    for (const [bx, by, b] of w.blocks) {
      for (let y = by - w.o; y < by + b + w.o; y++) {
        for (let x = bx - w.o; x < bx + b + w.o; x++) {
          const k = y * SW + x;
          if (x >= 0 && y >= 0 && x < SW && y < SH && !letters.has(k)) ring.add(k);
        }
      }
    }
    const bl = w.body.map((k) => lum(d, k * 4));
    const around = pct([...ring].map((k) => lum(d, k * 4)), 0.9);
    return { text: w.text, role: w.role, body: contrast(pct(bl, 0.5), around), dark: contrast(pct(bl, 0), around) };
  });
}

{
  const canvas = new HeadlessCanvas(SW, SH);
  const renderer = new Renderer(canvas);
  renderer.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'high',
    streaks: false, shake: false, trails: true, showFps: false, music: false });
  for (const k of ['drawPlayer', 'drawCompanions', 'drawCompanionCalls', 'drawFloaters']) renderer[k] = () => {};
  // The renderer's own context, taken AFTER it sized the canvas: a context taken before
  // draws into a buffer the resize threw away (headless-canvas-fidelity).
  const ctx = renderer.ctx;
  const all = Stats.BLANK_ALL(); all.bestScore = 200000;
  const problems = [];

  // Two moments: the pinned SPEED words in their flash tone and in their hot tone, both with
  // CLIMB! up. Found by asking the HUD, not by copying its rates.
  const probe = (t, game, skin) => {
    const roles = new Set();
    const tiny = new HeadlessCanvas(1, 1).getContext('2d');
    const di = tiny.drawImage;
    const inv = new Map(Object.entries(skin.parts).map(([k, v]) => [v, k]));
    tiny.drawImage = function (img) { const k = inv.get(img); if (k) roles.add(k); };
    tiny.setTransform(PX, 0, 0, PX, 0, 0);
    drawHud(tiny, game, all, t);
    tiny.drawImage = di;
    return roles;
  };
  let tFlash = null, tHot = null;
  {
    Math.random = mulberry32(3);
    const g0 = hot(scene(50), 0.2);
    const s0 = HS.warmHudSkin(g0.theme.name);
    for (let k = 0; k < 400 && (tFlash === null || tHot === null); k++) {
      const t = 0.1 + k * 0.0037;
      const r = probe(t, g0, s0);
      if (!r.has('danger2')) continue;
      if (tFlash === null && r.has('flash1')) tFlash = t;
      if (tHot === null && r.has('hot1')) tHot = t;
    }
  }
  const at = (v) => (v === null ? 'never' : `${v.toFixed(3)} s`);
  if (!ok(tFlash !== null && tHot !== null, `the HUD prints every ink at some moment (the flash tone at ${at(tFlash)}, the hot one at ${at(tHot)})`)) tFlash = tHot = 0.2;

  const results = [];
  const seenRoles = new Set();
  let control = null;
  for (const th of THEMES) {
    const zi = THEMES.indexOf(th);
    // Three floors across the zone's first-cycle band, clear of the crossfade into the next.
    const base = zi === 0 ? 0 : C.FIRST_THEME_FLOORS + (zi - 1) * C.FLOORS_PER_THEME;
    const floors = zi === 0 ? [10, 50, 85] : [base + 20, base + 100, base + 180];
    floors.forEach((floor, fi) => {
      Math.random = mulberry32(12345 + floor);
      const game = hot(scene(floor), 0.2);
      // The third jump banked on one floor in three (flavour.js airJumpWords), and ZENITH
      // beaten on another (Game.ascend, the HUD's top line).
      game.player.tripleUnlocked = fi === 2;
      game.ascent = fi === 1 ? 1 : 0;
      const skin = HS.warmHudSkin(th.name);
      const inv = new Map(Object.entries(skin.parts).filter(([k]) => INKS.test(k)).map(([k, v]) => [v, k]));
      const t = fi % 2 ? tHot : tFlash;
      const calls = [];
      const di = ctx.drawImage;
      // Passed through exactly as called: the canvas reads the call's form off its length.
      ctx.drawImage = function (img, ...a) {
        const key = inv.get(img);
        if (key) calls.push({ key, sx: a[0], sw: a[2], aw: img.width, dx: a[4], dy: a[5] });
        return di.call(this, img, ...a);
      };
      renderer.draw(game, 1, 0, () => drawHud(ctx, game, all, t));
      ctx.drawImage = di;
      const words = wordsOf(calls, problems);
      for (const w of words) seenRoles.add(w.role);
      for (const r of legibility(words, canvas.data)) results.push({ zone: th.name, floor, ...r });
      if (!control) {
        // The same words' masks on the same scene drawn WITHOUT the HUD.
        renderer.draw(game, 1, 0);
        control = legibility(words, canvas.data);
      }
    });
  }
  ok(!problems.length, `the HUD's glyphs were read off its draw calls` + (problems.length ? `: ${problems.join('; ')}` : ''));
  // Not 'shout2': the milestone callout is lettered now (render/callouts.js), not printed in
  // the skin's shout ink, which is left only as the fallback for a word with no painter.
  // tools/test-callouts.mjs measures the callouts over every zone.
  const said = new Set(results.map((r) => r.text));
  // A tenth a lap since 2026-09-29 (constants.js ASCENSION); it said BOUNCE X2 SPEED X1.25.
  ok(said.has('BOUNCE X1.1 SPEED X1.1'), `the ascended HUD says BOUNCE X1.1 SPEED X1.1 at the top (${said.has('BOUNCE X1.1 SPEED X1.1') ? 'read' : 'never read'})`);
  ok(said.has('AIR JUMP READY') && said.has('TRIPLE JUMP READY'),
    `the pinned meter says AIR JUMP READY, and TRIPLE JUMP READY with the third jump earned (read: ${['AIR JUMP READY', 'TRIPLE JUMP READY'].filter((w) => said.has(w)).join(', ') || 'neither'})`);
  const want = ['ink1', 'num2', 'gold1', 'chain1', 'hot1', 'flash1', 'danger2'];
  const unseen = want.filter((r) => !seenRoles.has(r));
  ok(!unseen.length, `every ink was measured: ${[...seenRoles].sort().join(', ')}` + (unseen.length ? `; never: ${unseen.join(', ')}` : ''));
  const worst = (f) => results.reduce((m, r) => (r[f] < m[f] ? r : m), { [f]: Infinity });
  const wb = worst('body'), wd = worst('dark');
  const lowB = results.filter((r) => !(r.body >= BODY_MIN));
  const lowD = results.filter((r) => !(r.dark >= DARK_MIN));
  const list = (rs, f) => rs.slice(0, 4).map((r) => `${r.text} (${r.role}) in ${r.zone} at ${r.floor} ${r[f].toFixed(1)}`).join(', ');
  ok(!lowB.length, `every word's letters stand ${BODY_MIN}:1 off what surrounds them, in ${results.length} words across ${THEMES.length} zones ` +
    `(weakest: ${wb.text} in ${wb.zone} ${wb.body.toFixed(1)}:1)` + (lowB.length ? `; ${lowB.length} do not, among them ${list(lowB, 'body')}` : ''));
  ok(!lowD.length, `and every word's darkest letter pixel ${DARK_MIN}:1 (weakest: ${wd.text} in ${wd.zone} ${wd.dark.toFixed(1)}:1)` +
    (lowD.length ? `; ${lowD.length} do not, among them ${list(lowD, 'dark')}` : ''));
  const passed = control ? control.filter((r) => r.body >= BODY_MIN) : [];
  ok(control && !passed.length, `the measure fails the same words' places with no HUD drawn` +
    (passed.length ? `; it passed: ${passed.map((r) => r.text).join(', ')}` : ''));
}

// --- 5. the herald's lines and the companions' calls, legible over every zone ------------------
// Lettered in the menus' fine lettering (menuskin.js mText: the font at four backing pixels
// a font pixel on a two-pixel keyline), the herald's lines over the scene under his feet and
// the calls on their plate at the bottom. Measured as 4 measures the HUD's words: in real
// frames of every zone at three floors, the letters (the font's blocks, read off the glyph
// draws) against the brightest tenth of their keyline ring, the median 4.5:1 and the darkest
// letter pixel 3:1. A herald's line has no plate, so what lies behind it is printed too: the
// scene's median beyond the keyline, the brightest tenth of it, and the letters against that.
// The same masks on the frame drawn without the HUD and the calls must fail.
{
  await import('../src/render/gameoverskin.js');          // paints the lettering at load, as the game does
  const MS = await import('../src/render/menuskin.js');
  const inkOf = new Map();
  for (const [key] of MS.menuStats().pieces) if (key.startsWith('ink:')) inkOf.set(MS.menuPiece(key), key.slice(4));
  const MCHARS = Object.keys(GLYPHS).filter((c) => c !== ' ');
  const canvas = new HeadlessCanvas(SW, SH);
  const renderer = new Renderer(canvas);
  renderer.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'high',
    streaks: false, shake: false, trails: true, showFps: false, music: false });
  for (const k of ['drawPlayer', 'drawCompanions', 'drawFloaters']) renderer[k] = () => {};
  const ctx = renderer.ctx;
  const all = Stats.BLANK_ALL();
  /** Words from menu glyph draws: a run of cells of one ink on one row. */
  const wordsFrom = (calls) => {
    const words = [];
    for (const c of calls) {
      const w = words[words.length - 1];
      if (w && w.role === c.role && w.y === c.y && c.x - w.end <= c.w + 1) { w.calls.push(c); w.end = c.x + c.w; }
      else words.push({ role: c.role, y: c.y, end: c.x + c.w, calls: [c] });
    }
    for (const w of words) {
      w.text = ''; w.body = []; w.ring = new Set();
      const body = new Set();
      let end = null;
      for (const c of w.calls) {
        const b = (c.h - c.w) / 2, k = (c.w - GW * b) / 2;
        const ch = MCHARS[Math.round(c.sx / c.w)];
        // mText draws nothing for a space: a cell's gap before it is one.
        if (end !== null && c.x > end) w.text += ' ';
        end = c.x + c.w;
        w.text += ch;
        for (let r = 0; r < GH; r++) for (let q = 0; q < GW; q++) {
          if (GLYPHS[ch][r][q] !== '#') continue;
          for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) body.add((c.y + k + r * b + j) * SW + c.x + k + q * b + i);
        }
        w.k = k;
      }
      w.body = [...body];
      // The ring is the menus' keyline's width, two pixels, whatever the cells were drawn with:
      // a line lettered without a keyline is measured against the scene round it, not passed.
      const K = Math.max(2, w.k);
      for (const p of w.body) {
        const x = p % SW, y = (p / SW) | 0;
        for (let v = -K; v <= K; v++) for (let u = -K; u <= K; u++) {
          const q = (y + v) * SW + x + u;
          if (!body.has(q)) w.ring.add(q);
        }
      }
      // What lies behind the word past its keyline: two more pixels out.
      w.beyond = new Set();
      for (const q of w.ring) {
        const x = q % SW, y = (q / SW) | 0;
        for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) {
          const s = (y + v) * SW + x + u;
          if (!body.has(s) && !w.ring.has(s)) w.beyond.add(s);
        }
      }
    }
    return words;
  };
  const measure = (w, d) => {
    const L = w.body.map((p) => lum(d, p * 4));
    const around = pct([...w.ring].map((p) => lum(d, p * 4)), 0.9);
    const back = [...w.beyond].map((p) => lum(d, p * 4));
    return { text: w.text, role: w.role, body: contrast(pct(L, 0.5), around), dark: contrast(pct(L, 0), around),
      backMed: pct(back, 0.5), backHi: pct(back, 0.9), overBack: contrast(pct(L, 0.5), pct(back, 0.9)) };
  };
  const results = [];
  let control = null;
  const LINES = [['THE TOWER AWAITS THEE', 'accent'], ['GRAVITY KEEPS NO LORD', '#ffffff']];
  for (const th of THEMES) {
    const zi = THEMES.indexOf(th);
    const base = zi === 0 ? 0 : C.FIRST_THEME_FLOORS + (zi - 1) * C.FLOORS_PER_THEME;
    const floors = zi === 0 ? [10, 50, 85] : [base + 20, base + 100, base + 180];
    for (const floor of floors) {
      Math.random = mulberry32(777 + floor);
      const game = scene(floor);
      game.banners = [];
      // Pushed newest last: the stack draws the newest at its top.
      for (const [text, colour] of LINES) game.banner(text, colour === 'accent' ? game.theme.accent : colour, false, 1.5);
      game.companions.active = [{ bubble: 'THE STONES DO REMEMBER THEE.', bubbleT: 2, name: 'THE GREY PILGRIM' }];
      const calls = [];
      const di = ctx.drawImage;
      ctx.drawImage = function (img, ...a) {
        const role = inkOf.get(img);
        if (role !== undefined && a.length >= 8 && this.globalAlpha >= 1) {
          calls.push({ role, sx: a[0], x: Math.round(a[4] * PX), y: Math.round(a[5] * PX), w: Math.round(a[6] * PX), h: Math.round(a[7] * PX) });
        }
        return di.call(this, img, ...a);
      };
      renderer.draw(game, 1, 0, () => drawHud(ctx, game, all, 0.2));
      ctx.drawImage = di;
      const words = wordsFrom(calls).filter((w) => w.y >= 170 * PX);
      for (const w of words) results.push({ zone: th.name, floor, call: w.y >= 215 * PX, ...measure(w, canvas.data) });
      if (!control) {
        const keep = renderer.drawCompanionCalls;
        renderer.drawCompanionCalls = () => {};
        renderer.draw(game, 1, 0);
        renderer.drawCompanionCalls = keep;
        control = words.map((w) => measure(w, canvas.data));
      }
    }
  }
  const herald = results.filter((r) => !r.call), said = results.filter((r) => r.call);
  const want = [...LINES.map(([t]) => t), 'THE GREY PILGRIM', 'THE STONES DO REMEMBER THEE.'];
  const unread = want.filter((t) => !results.some((r) => r.text === t));
  ok(!unread.length && herald.length === THEMES.length * 3 * LINES.length && said.length === THEMES.length * 3 * 2,
    `the herald's lines and a companion's call were read off their glyph draws in every zone: ${herald.length} herald lines, ` +
    `${said.length} of the calls'` + (unread.length ? `; never read: ${unread.join(', ')}` : ''));
  const lowB = results.filter((r) => !(r.body >= BODY_MIN)), lowD = results.filter((r) => !(r.dark >= DARK_MIN));
  const worst = (list, f) => list.reduce((m, r) => (r[f] < m[f] ? r : m), { [f]: Infinity });
  const wh = worst(herald, 'body'), wc = worst(said, 'body'), wd = worst(results, 'dark'), wo = worst(herald, 'overBack');
  const list = (rs, f) => rs.slice(0, 4).map((r) => `${r.text} in ${r.zone} at ${r.floor} ${r[f].toFixed(1)}`).join(', ');
  ok(!lowB.length, `every herald's and call's word stands ${BODY_MIN}:1 off its keyline (weakest: herald ${wh.text} in ${wh.zone} ` +
    `${wh.body.toFixed(1)}:1, call ${wc.text} in ${wc.zone} ${wc.body.toFixed(1)}:1)` + (lowB.length ? `; ${lowB.length} do not: ${list(lowB, 'body')}` : ''));
  ok(!lowD.length, `and every one's darkest letter pixel ${DARK_MIN}:1 (weakest: ${wd.text} in ${wd.zone} ${wd.dark.toFixed(1)}:1)` +
    (lowD.length ? `; ${lowD.length} do not: ${list(lowD, 'dark')}` : ''));
  const byZone = new Map();
  for (const r of herald) {
    const z = byZone.get(r.zone) || { hi: 0, over: Infinity };
    z.hi = Math.max(z.hi, r.backHi); z.over = Math.min(z.over, r.overBack);
    byZone.set(r.zone, z);
  }
  console.log(`         behind the herald's lines, past the keyline -- the brightest tenth of the scene, and the letters against it:`);
  console.log(`         ${[...byZone].map(([z, v]) => `${z} ${v.hi.toFixed(2)} ${v.over.toFixed(1)}:1`).join(', ')}` +
    ` (weakest ${wo.text} in ${wo.zone}; the keyline holds them wherever the scene is as bright as they are)`);
  const passed = control ? control.filter((r) => r.body >= BODY_MIN) : [];
  ok(control && control.length && !passed.length, `the measure fails the same words' places with no HUD and no calls drawn` +
    (passed.length ? `; it passed: ${passed.map((r) => r.text).join(', ')}` : ''));
}

console.log(fails ? `\n  ${fails} check(s) FAILED` : `\n  HUD skin: all ${THEMES.length} zones painted ahead, no FALL ROOM, every word legible`);
process.exit(fails ? 1 : 0);
