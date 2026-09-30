import { installDom } from './headless.mjs';
import { COMBO_TIERS } from '../src/game/flavour.js';
import { ComboTracker, MULT_STEP, chainScore } from '../src/game/combo.js';

installDom();

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
};

const c = new ComboTracker(COMBO_TIERS);

// A single-floor hop must not start anything.
eq('1-floor hop does not open a combo', c.onLand(1), null);
eq('  tracker idle', c.active, false);

// Three multi-floor hops chain, then a landing that fails to climb closes it.
//
// The requirement is a FLAT two now -- the same gain that opens a chain keeps it. It
// used to escalate to seven with the length of the chain, which meant a long chain was
// ended by clearing a merely respectable gap rather than by failing to chain.
c.onLand(3); c.onLand(4); c.onLand(2);
eq('chained floors accumulate', c.floors, 9);
eq('a 2-floor gain keeps it alive', c.onLand(2), null);
eq('  and it counted', c.floors, 11);
const r = c.onLand(1);
eq('closing returns a result', r !== null, true);
eq('  floors carried', r.floors, 11);
eq('  hop count', r.hops, 4);
eq('  tier', r.tier.name, 'BRAVE');
eq('  score (11 floors, 0 flair, x1)', r.score, 110);
eq('tracker cleared after close', c.floors, 0);

// Flair adds to the payout but cannot open a combo by itself.
c.onAirJump(1); c.onAirJump(2); c.onWallBounce();
eq('flair alone leaves combo closed', c.onLand(1), null);

// Same 9 floors, now with flair.
c.onAirJump(1); c.onWallBounce(); c.onWallBounce();
c.onLand(5); c.onLand(4);
const r2 = c.onLand(1);
eq('flair counted', r2.flair, 3);
eq('  doubles/triples/bounces', [r2.doubles, r2.triples, r2.bounces], [1, 0, 2]);
eq('  each trick adds to the score', r2.score, (9 * 10 + 3 * 25) * 1);

// --- the score is a normal number ---------------------------------------------------------
//
// A chain used to pay floors x 60 x its step x (1 + 0.25 a trick), which grew as the CUBE of
// the chain -- its floors, its step and its tricks all grow with it -- and runs banked
// hundreds of millions, and the user asked for scores of a reasonable size. A trick adds
// now, and the table in ComboTracker.scoreFor is what a chain pays. The bot's 5089-floor
// chain, 957 tricks, banked 3,777,933,653; it is under four million now, and a 400-floor
// chain is about the old SCORE KING award's 25,000.
eq('the payout table in scoreFor', [chainScore(10, 0), chainScore(125, 25), chainScore(400, 80), chainScore(2000, 400)],
  [100, 3750, 30000, 630000]);
eq("the bot's 5089-floor chain pays under four million", chainScore(5089, 957) < 4e6, true);
eq('twice the chain pays about four times as much, not eight', Math.round(chainScore(2000, 400) / chainScore(1000, 200)), 4);

// Tier boundaries, against the SHIPPING ladder in flavour.js.
//
// These used to read NICE / INCREDIBLE / EXTREME and passed, because the tracker
// defaulted to a private copy of the ladder kept inside combo.js. flavour.js was
// rewritten into a heraldic register and that copy was not, so this suite was green
// while asserting names the game had not shown for several commits. The default is
// gone; the tiers are passed in, and these check what a player actually sees.
eq('tier at 2', c.tierFor(2).name, 'FAIR');
eq('tier at 51', c.tierFor(51).name, 'DIVINE');
eq('tier at 55', c.tierFor(55).name, 'ETERNE');
eq('tier below minimum', c.tierFor(1), null);

// --- the multiplier steps every fifty floors ---------------------------------
{
  const m = new ComboTracker(COMBO_TIERS);
  // Opened with a real gain: one floor cannot START a chain (that still needs
  // COMBO_MIN_GAIN), only keep one alive. Climbing with onLand(1) from a standing start
  // loops forever, which is how this test first hung.
  m.onLand(4);
  const climb = (to) => { while (m.floors < to) m.onLand(2); };
  climb(48);  eq('x1 below fifty floors', m.x, 1);
  climb(50);  eq('x1.5 at fifty', m.x, 1.5);
  climb(100); eq('x2 at a hundred', m.x, 2);
  climb(250); eq('x3.5 at 250', m.x, 3.5);
  m.close();
}

// --- the step ladder is the combo's own, and it has no top ----------------------------
//
// The meter and "x.. AT .." under it read the callout table until the callouts became the
// tower's (milestones.js); past its last row, GLORY at 350, the meter pinned full while the
// multiplier went on stepping. Now it is progress to the next multiple of MULT_STEP, for
// ever, and a landing reports the step it reached.
{
  const m = new ComboTracker(COMBO_TIERS);
  m.onLand(4);
  const steps = [];
  while (m.floors < 460) { m.onLand(3); if (m.stepped) steps.push([m.stepped, m.floors, m.x]); }
  eq('a landing reports each step it reaches, 1 to 9, and only those', steps.map((s) => s[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  eq('  at the first landing past each multiple of MULT_STEP', steps.every(([s, f]) => f >= s * MULT_STEP && f - 3 < s * MULT_STEP), true);
  eq('  and the multiplier it reports is that step\'s', steps.map((s) => s[2]), [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
  const n = new ComboTracker(COMBO_TIERS);
  n.active = true;
  n.floors = 10;  eq('the next step from 10 floors is x1.5 at 50', n.nextStep(), { x: 50, mult: 1.5 });
  n.floors = 100; eq('from 100 (just claimed x2) it is x2.5 at 150', n.nextStep(), { x: 150, mult: 2.5 });
  n.floors = 360; eq('past 350 it goes on: x5 at 400', n.nextStep(), { x: 400, mult: 5 });
  eq('  and the meter fills toward it instead of pinning full', n.meterFrac(), 0.2);
  n.floors = 1234; eq('  at 1234 floors, x13.5 at 1250 and the meter at 0.68', [n.nextStep().mult, n.meterFrac()], [13.5, 0.68]);
}

// --- a combo step shouts nothing -------------------------------------------------------
//
// Through the game's own landing handler: a chain crossing 50 and 100 floors. It used to fire
// the callout (word, flash 0.8, shake 5 to 6); it keeps a burst and a hook for its sound.
{
  const { Game } = await import('../src/game/game.js');
  const { AutoInput } = await import('../src/game/autoplay.js');
  const { COMBO_STEP_BURST } = await import('../src/game/constants.js');
  const game = new Game(new AutoInput());
  game.newRun(7);
  const heard = [];
  game.onComboStep = (x, s) => heard.push([x, s]);
  const shouted = [];
  game.onAnnounce = (name) => shouted.push(name);
  const { STEPS, FIXED, stepFor } = await import('../src/render/sparks.js');
  const p = game.player;
  const bursts = [];
  const real = game.particles.burst.bind(game.particles);
  game.particles.burst = (x, y, n, cols, pw) => { bursts.push({ n, cols }); real(x, y, n, cols, pw); };
  let floor = 0;
  const worst = { flash: 0, shake: 0 };
  const onStep = [], offStep = [];
  for (let k = 0; k < 40; k++) {
    game.flash = 0; game.shake = 0;
    bursts.length = 0;
    p.emit('land', { floor: floor + 3, prevFloor: floor });
    floor += 3;
    game.handleEvents();
    worst.flash = Math.max(worst.flash, game.flash);
    worst.shake = Math.max(worst.shake, game.shake);
    (game.combo.stepped ? onStep : offStep).push({ floors: game.combo.floors, bursts: bursts.slice() });
  }
  eq('a chain past 50 and 100 floors reaches two steps', heard, [[1.5, 1], [2, 2]]);
  eq('  and shouts no word', [game.shout, game.shoutT, shouted.length], [null, 0, 0]);
  eq('  no screen flash', worst.flash, 0);
  eq('  no shake past a landing\'s own (3 at most)', worst.shake <= 3, true);
  // Each step lands one burst of COMBO_STEP_BURST in the light tones of the trail's new
  // palette (plus white); no other landing throws one.
  const want = (f) => [...STEPS[stepFor(f)].ramps.map((r) => FIXED[r][2]), '#ffffff'];
  eq(`  each step throws one burst of ${COMBO_STEP_BURST} in the trail's colours for that step`,
    onStep.map((s) => s.bursts.map((b) => [b.n, b.cols])), onStep.map((s) => [[COMBO_STEP_BURST, want(s.floors)]]));
  eq('  and no other landing of the chain throws one', offStep.every((s) => !s.bursts.length), true);
}

// --- a seeded run scores what it scored before the callouts moved -----------------------
//
// The callouts moving off the combo must not touch scoring. The numbers are 62bb95e's, from
// the same runs (the attract bot on a human tower, Math.random seeded): one held under the
// rising floor for three minutes, banking a 1686-floor chain; one where the floor is real
// and catches him. Both cross height callouts and dozens of combo steps. The scores were
// re-taken for the new scale (2026-09-28), where they were 148,724,860 and 50,297,423, and
// then the runs for the tower's new patterns (generator.js SHAPES), which gave the bot other
// ledges: held, it now climbs 2016 floors nearly all in one chain still going at 180 s, so
// most of its score is the floors' (20,160 of 23,960); caught, 1083 floors, chains banked.
//
// Re-taken again 2026-09-29 for the bot, which was rebuilt to fly the real game (autoplay.js,
// round five); nothing in the scoring moved. Held, it climbs 3528 floors in one chain still
// going at 180 s (35,280 is all the floors'). Caught: the new bot outruns this fire for good --
// 8823 floors in 400 s, never caught -- so to keep a run the fire takes, with its chain banked
// when he stops, the bot plays the first 60 s and then lets go of the stick and the jump, and
// the fire comes up under him where he stands.
{
  const { Game, STATE } = await import('../src/game/game.js');
  const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
  const { STEP } = await import('../src/core/loop.js');
  const { mulberry32 } = await import('../src/core/rng.js');
  const run = (pin, secs, quit = Infinity) => {
    Math.random = mulberry32(7);
    const input = new AutoInput();
    const game = new Game(input);
    const bot = new AutoPlayer(input);
    game.newRun(0x2f6f1b21);
    let i = 0;
    for (; i < Math.round(secs / STEP) && game.state === STATE.PLAYING; i++) {
      if (pin) game.riseY = Math.min(game.riseY, game.player.y - 300);
      if (i * STEP < quit) bot.step(game, STEP);
      else { input.wantAxis = 0; input.wantJump = false; input.jumpHeld = false; }
      game.step(STEP);
    }
    return [game.score, game.run.maxFloor, i];
  };
  eq('held for 180 s: the score and floor', run(true, 180).slice(0, 2), [35280, 3528]);
  const CAUGHT = [197300, 1100, 14697];
  eq('caught by the floor after 60 s of play: the score, floor and step', run(false, 400, 60), CAUGHT);
}

// --- standing still ends the chain -------------------------------------------
//
// The break the system did not have. Before it, a chain at full momentum could only be
// ended by falling: you could stand on a platform indefinitely with the multiplier still
// climbing on screen.
{
  const g = new ComboTracker(COMBO_TIERS);
  g.onLand(4); g.onLand(4);
  eq('chain is running', g.active, true);
  eq('a moment on the ground is fine', g.onGrounded(0.2, 0.4), null);
  eq('  still running', g.active, true);
  g.onAirborne();
  eq('leaving the ground resets the clock', g.groundT, 0);
  eq('another moment is still fine', g.onGrounded(0.3, 0.4), null);
  const ended = g.onGrounded(0.2, 0.4);
  eq('loitering past the grace ends it', ended !== null, true);
  eq('  and it carried the floors', ended.floors, 8);
  eq('  tracker cleared', g.active, false);
}

// Monotonic scoring: more floors always beats fewer, at equal flair.
let mono = true;
for (let i = 2; i < 200; i++) if (c.scoreFor(i, 0) <= c.scoreFor(i - 1, 0)) mono = false;
eq('score strictly increases with floors', mono, true);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
