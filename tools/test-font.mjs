import { GLYPHS, GW, GH } from '../src/render/font.js';
let bad = 0, n = 0;
for (const [k, v] of Object.entries(GLYPHS)) {
  n++;
  if (v.length !== GH) { console.log('BAD row count', JSON.stringify(k), v.length); bad++; }
  v.forEach((r, i) => {
    if (r.length !== GW) { console.log('BAD width', JSON.stringify(k), 'row', i, r.length); bad++; }
    if (/[^#.]/.test(r)) { console.log('BAD char', JSON.stringify(k), r); bad++; }
  });
}
// Every visible glyph must have ink, and no two glyphs may be identical (the failure
// mode the local model hit: C and D rendering the same shape).
const seen = new Map();
for (const [k, v] of Object.entries(GLYPHS)) {
  const key = v.join('|');
  if (k !== ' ' && !/#/.test(key)) { console.log('EMPTY glyph', JSON.stringify(k)); bad++; }
  if (seen.has(key) && k !== ' ') { console.log('DUPLICATE', JSON.stringify(k), '==', JSON.stringify(seen.get(key))); bad++; }
  seen.set(key, k);
}
console.log(`${n} glyphs, ${bad} problems`);

// --- no atlas may be built mid-game -----------------------------------------
//
// Text is drawn from a per-colour atlas, and building one allocates a canvas and
// rasterises the whole character set. Built lazily, the FIRST use of any colour cost
// milliseconds inside a frame -- and the moments that fired were the worst available:
// crossing into a new theme brings a new accent AND a new text colour, and a big combo
// throws a white taunt up alongside a flash and a slow-motion effect. It read as the
// game stuttering whenever certain text appeared, which is exactly what it was.
//
// main.js warms every colour at load. This checks the warm list is actually complete,
// by playing through several theme boundaries and drawing the HUD, and failing if a
// single atlas gets built after warming.
{
  const { installDom, HeadlessCanvas } = await import('./headless.mjs');
  installDom();

  const { warmAtlases, fontStats } = await import('../src/render/font.js');
  const { THEMES } = await import('../src/game/themes.js');
  const { Game, STATE } = await import('../src/game/game.js');
  const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
  const { Renderer } = await import('../src/render/renderer.js');
  const { STEP } = await import('../src/core/loop.js');
  const { SW, SH, PX } = await import('../src/game/constants.js');
  const { drawHud } = await import('../src/ui/hud.js');
  const Stats = await import('../src/game/stats.js');

  // The same list main.js uses. Kept in step by this test failing if it drifts.
  const UI = ['#000000', '#00000066', '#00000077', '#000000aa', '#000000cc', '#000000d0',
    '#001824', '#05010a', '#05030ad0', '#05030ad8', '#05030ae0', '#080310', '#08324a',
    '#0b0810', '#0d0a16', '#0e0a16', '#12000a', '#1a1428', '#1b1226', '#220008', '#241c38',
    '#2a2138', '#2a2a3a', '#2e2038', '#2e2444', '#3a3f58', '#4a4f68', '#4f7fd8', '#5a5f78',
    '#5ce1ff', '#6a6f8a', '#7a80a0', '#7dff5a', '#7dff8a', '#7fdcff', '#8a6a3a', '#8a8fa8',
    '#8c1230', '#8cff8c', '#9aa0bb', '#b8365a', '#ff2244', '#ff3355', '#ff6688', '#ff8844',
    '#ff9f45', '#ffe23d', '#ffe9a0', '#fff8c0', '#ffffff'];
  const warmed = warmAtlases([
    ...THEMES.flatMap((t) => [t.text, t.accent, t.particle, t.platTop]), ...UI,
  ]);

  const canvas = new HeadlessCanvas(SW, SH);
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(0x2f6f1b21);
  const renderer = new Renderer(canvas);
  renderer.applySettings({ scaleMode: 'integer', scanlines: true, particles: 'high',
    streaks: true, shake: true, trails: true, showFps: false, music: false });
  const ctx = canvas.getContext('2d');
  const all = Stats.BLANK_ALL();

  // Long enough for the bot to cross several theme boundaries and land big combos.
  let frames = 0;
  for (let i = 0; i < 240 * 90 && game.state === STATE.PLAYING; i++) {
    bot.step(game, STEP);
    game.step(STEP);
    if (i % 4 === 0) {
      renderer.draw(game, 1, 1 / 160);
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      drawHud(ctx, game, all, i / 240);
      frames++;
    }
  }

  const st = fontStats();
  if (st.lateBuilds > 0) {
    console.log(`FAIL ${st.lateBuilds} font atlas(es) built mid-game -- each one is a hitch`);
    bad++;
  } else {
    console.log(`ok   ${warmed} atlases warmed; 0 built during ${frames} frames ` +
      `to floor ${game.run.maxFloor} across ${game.run.themesSeen} themes`);
  }
}

process.exit(bad ? 1 : 0);
