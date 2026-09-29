// Screenshot the game's TEXT at the moment it appears.
//
//   node tools/shot-text.mjs [scale] [out.png]
//
// Announcements only exist for a second and a half, so a screenshot taken at a fixed
// time almost never catches one. This runs the attract bot and grabs a frame the moment
// each kind of text becomes visible -- the grand milestone callout, a banner, and a
// floater -- then stacks them. Without it, "is the announcement legible" is a question
// nobody can answer.
import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';

installDom();
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { SW, SH, PX } = await import('../src/game/constants.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');
const { TAUNTS, IDLE_LINES } = await import('../src/game/flavour.js');
const WANTED = new Set([...TAUNTS, ...IDLE_LINES]);

const scale = Number(process.argv[2] || 2);
const out = process.argv[3] || 'text.png';

const canvas = new HeadlessCanvas(SW, SH);
const input = new AutoInput();
const game = new Game(input);
const bot = new AutoPlayer(input);
game.demo = true;
game.newRun(DEMO_SEEDS[0]);
const renderer = new Renderer(canvas);
renderer.applySettings({
  scaleMode: 'integer', scanlines: false, particles: 'high',
  streaks: true, shake: true, trails: true, showFps: false, music: false,
});

const all = Stats.BLANK_ALL();
const shots = [];
const seen = new Set();
let t = 0;

for (let i = 0; i < 240 / STEP && shots.length < 5; i++) {
  bot.step(game, STEP);
  game.step(STEP);
  t += STEP;

  // One frame per DISTINCT piece of text, caught on the tick it appears.
  let key = null, label = null;
  if (game.shout && game.shoutT > 1.4) { key = 'shout:' + game.shout; label = 'MILESTONE ' + game.shout; }
  else if (game.banners && game.banners.length) {
    const b = game.banners[game.banners.length - 1];
    // Only the FLAVOUR lines. Theme announcements fire constantly and would fill the
    // sheet before a taunt ever got a look in.
    if (b.life > 1.3 && WANTED.has(b.text)) { key = 'banner:' + b.text; label = 'TAUNT ' + b.text; }
  }
  if (!key || seen.has(key)) continue;
  seen.add(key);

  renderer.draw(game, 1, STEP);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  if (game.state === STATE.PLAYING) drawHud(ctx, game, all, t);
  shots.push({ label, data: Uint8ClampedArray.from(canvas.data) });
  if (game.state !== STATE.PLAYING) break;
}

// And the WORST CASES, forced: the longest line in each list. These are the ones that
// run off the edge if the caps in test-flavour.mjs are ever wrong, and waiting for the
// bot to roll them naturally is not a test.
const { DEATH_LINES } = await import('../src/game/flavour.js');
const longest = (l) => l.reduce((a, b) => (b.length > a.length ? b : a));
for (const [label, text] of [['TAUNT', longest(TAUNTS)], ['IDLE', longest(IDLE_LINES)],
                             ['DEATH', longest(DEATH_LINES)]]) {
  game.banners.length = 0;
  game.shoutT = 0;          // the grand callout owns the band above and would cover it
  game.banner(text, '#ffffff', false, 1.6);
  game.step(STEP);
  renderer.draw(game, 1, STEP);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  drawHud(ctx, game, all, t);
  shots.push({ label: `${label} (worst case, ${text.length} chars) ${text}`,
               data: Uint8ClampedArray.from(canvas.data) });
}

if (!shots.length) { console.log('  no text appeared in 240s of play'); process.exit(1); }

const sheet = new HeadlessCanvas(SW, SH * shots.length);
shots.forEach((s, i) => sheet.data.set(s.data, i * SW * SH * 4));
fs.writeFileSync(out, encodePNG(scale > 1 ? upscale(sheet, scale) : sheet));
console.log('  ' + out);
shots.forEach((s, i) => console.log(`  ${i + 1}. ${s.label}`));
