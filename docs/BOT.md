# The attract-mode bot

The title screen's live game and the bot that plays it: what the demo is, the five demo seeds,
how the bot flies, what it measures at, what the demo leaves out, the suites that stage their
play on the bot, and how its `TUNE` numbers were chosen. Read this when touching
`src/game/autoplay.js`, `DEMO_SEEDS`, the demo loop in `src/main.js`, anything keyed on
`Game.demo`, or anything that changes the physics, the fire, the tower or simulated time -- the
bot has to be re-measured after each (`tools/measure-demo.mjs`). See also
[GAMEPLAY.md](GAMEPLAY.md) (the physics it flies), [TOWER.md](TOWER.md) (the tower it climbs),
[TESTING.md](TESTING.md) (the suites) and [../README.md](../README.md).

## The menu plays itself -- the real game

The title screen background is not a picture. It is **a second, live game** running the real
simulation, driven by a bot through a synthetic input (`AutoInput`). Since 2026-09-29 it is
**the game a player gets**: the real tower, the real fire, at the game's default settings.
The user, of the demo before that: the bot behind the menu looked far too fast, free of the
game's rules and buggy; the title screen should show the real game in full, played
flawlessly.

- **The settings are the game's defaults, read, never the player's.** `startDemo` (in
  `autoplay.js`) starts every demo -- `main.js`'s, and every suite's and tool's that stages one
  -- at `demoSettings()`: JUMP SPEED, PLATFORMS, DIFFICULTY and GRAVITY from `settings.js`
  `DEFAULTS`, so a new default is the demo's the moment it lands, and the demo is the same on
  every machine whatever this one has chosen. `test-feel` section 7 holds it (mutants
  `demo-at-setting`, `demo-at-setting-gravity`).
- **The tower is a player's** (`new Tower(seed, false, width)` in `Game.newRun`): squeeze and
  all. It was a flow tower of its own until then -- a ramp at the steepest legal slope, ledges
  1.6 times as wide, no squeeze -- which no player ever climbs (mutant `demo-on-flow-tower`).
- **The fire is a run's at that DIFFICULTY** (`Game.riseRate`). It ran at 0.55 of EASY's
  (`DEMO_RISE_SCALE`, gone) until then (mutant `demo-slow-fire`).
- **The ascension is the one a player gets**: x1.1 of height and clock at floor 2300 and again
  at 4600 ([GAMEPLAY.md](GAMEPLAY.md), *THE ASCENSION*). It was x2 and x1.25 a lap, and the
  demo, which beats ZENITH in every run, showed the doubling more than anyone -- the speed
  that looked like a bug.

Everything a real run has is in it -- the zones and their crossfades, the squeeze from 2100,
the companions from floor 350 by the player's COMPANIONS setting, the combo trail and the speed
afterimages, the ascensions, the death with the fire burning the tower away -- except what the
title screen cannot show (below).

The menu is drawn over it, and since the menu took the Duke's painted skin
(`src/render/menuskin.js`) every word over the demo stands on an opaque plate, so the bot, its
companions' call boxes and its particles can pass behind a word but never show through one.
`tools/test-menu.mjs` proves it by drawing the same menu over a real demo frame and over flat
magenta and finding every word's pixels identical.

## What it measures at

`tools/measure-demo.mjs` plays the demo as the menu does and prints, per tower, everything the
demo is held to (its header lists the columns). Before and after, on the five demo seeds of
each version, ten minutes each:

| | the demo before (its flow tower, 130%, fire 0.55 of EASY) | the old bot on the real tower at the defaults | the demo now (real tower, defaults) |
|---|---|---|---|
| survived ten minutes | 5 of 5 | **0 of 5** (floors 26-990, dead inside 66 s) | **5 of 5** |
| floors a minute to floor 2300 | 1,083-1,110 | 462-970 | **1,506-1,532** |
| floors in ten minutes (ascension x2 / x1.1) | 24,360-24,643 / 13,105-13,262 | -- | **18,666-18,777** |
| floor 2300 / 4600 reached at | 125-128 s / 207-210 s | never | **91-92 s / 169-172 s** |
| landings more than 3 floors under his best | 0 | 1 | **0** (no landing under his best at all) |
| two seconds without a new best floor | 0 | 0 | **0** (the longest gap 1.4-1.5 s) |
| steps with any of him outside the view | 0-18 | 0 | **0** |
| wall bounces / air jumps a minute (x1.1) | 70-72 / 118-123 | 63-71 / 0-70 | **98-99 / 119-121** |
| his facing turned, a minute (x1.1) | **676-740** | -- | **100-101**, about one a wall bounce |
| a turn and a turn back inside 0.15 s, in ten minutes (x1.1) | **5,502-6,196** | -- | **14-23** |
| the bot's cost, ms per second of play | 1.5 | -- | 3.8-4.3: a step 0.37 ms at the 99th percentile once warm, the worst about 2 ms (2.8-4.4 while the JIT warms) |

The flicker is what made it look buggy: the old bot re-chose its stick every frame, and a
flight of a second with combo-lifted wall bounces lands chaotically, so the choice changed from
frame to frame and the sprite turned left and right hundreds of times a minute (the row *A plan
remade every frame flickers* below). On the old demo's own five towers at the same settings, the
towers the old bot died on, the rebuilt one survives all five for ten minutes too: 1,484-1,515
floors a minute to 2300, 18,673-18,782 floors, no miss, no stall, nothing wholly out of view
(three have 5 to 7 steps with part of him past the edge). Every run is one unbroken combo -- the best combo is every
floor climbed -- as the old demo's were.

**At 120%, the default since 2026-09-29** (NORMAL 0.875, MEDIUM, 0.9; `tools/measure-demo.mjs`,
the five demo towers, ten minutes each): no death, ZENITH at 105 s and 4600 at 194-197 s, no
landing under its best, no two seconds without a new best, 1,304-1,324 floors a minute before
ZENITH and 1,680-1,700 after, 83 wall bounces and 110 air jumps a minute. One tower had 5 steps
with part of him past the edge of the view in its ten minutes, none wholly out -- the shaft
widening under a view still catching up, as below.

The settings the menu offers were measured too, eight fresh towers for four minutes at each:
the defaults (140%, NORMAL 0.875, MEDIUM, 0.9), the ones before them (0.75 ledges, gravity 1),
100% with the old MEDIUM ledges under EASY, HARD, gravity 1.1, and the worst of them together
(100%, 0.75, HARD, 1.1): **no death, no miss, no stall anywhere**, 1,157-1,711 floors a minute.
Over 200 fresh towers at the defaults every one passed 4600 alive in ten minutes; 82 of them had
a step with part of him past the edge of the view (the shaft widening under a view still
gliding out to it), none with all of him, and the demo seeds have none.

## The five towers it plays

`DEMO_SEEDS` in `autoplay.js`, picked by `tools/find-demo-seed.mjs` from 200 fresh towers at the
defaults. Every one of the 200 passed floor 4600 alive, so survival no longer tells towers apart:
they were picked on the view (no step of him past its edge) and then on what a viewer sees
(misses, stalls, twitches, edge landings, bounces, air jumps, the first half minute counted
twice). The table beside `DEMO_SEEDS` records each one's ten minutes. `tools/test-autoplay.mjs`
plays every demo seed and three other towers for 3.5 minutes and fails on a death, a floor 2300
not reached, a miss, a stall or a step wholly out of view, with rates guarded under what was
measured.

They rotate, and the rotation starts at a random index on every page load; it used not to,
which is the row *The demo rotation never rotated* below.

## How it flies: round five

The bot was rebuilt on 2026-09-29 (the header of `autoplay.js` has the whole account). The
planner of rounds one to four -- every frame, the highest floor the closed-form jump arc of the
reach proof could reach, steered by flying three stick positions forward -- went from 205
floors a minute to 826 over 400 towers, on a flow tower built for it. On the real tower at the
defaults it could not live: it died on every demo seed inside 66 seconds and on thirty fresh
towers out of thirty (mean floor 680), 29 of the 30 caught by the fire above their best floor.
Past floor 450 MEDIUM's fire trails the best floor by 43 units and climbs 7 to 10 floors a
second; the old planner took short hops, and a jump at speed rises to its full apex whatever it
is aimed at, so a two-floor hop is a 0.85-second flight in which the fire gains seven floors.

Round five flies every option it considers by his own rules:

1. **The model is `Player.step`.** `fly()` is his step in the air, the same sums in the same
   order -- the stick, the overdrive's bleed, the cap, the meter, the air jump, gravity, the
   walls through the game's own `wallBounceOut`, the one-way ledges landed on as he lands on
   them (the first his feet cross going down, any overlap) -- at his clock (`Player.rate`:
   JUMP SPEED and the ascension). `takeoff()` is the step he jumps in. Landing for landing it
   is the game: 139 of 139 over three minutes on the ledge planned.
2. **A plan is a whole flight**: a stick held one way, or changed once (after 0.05 to 0.36 of
   his seconds, or at the first wall bounce), and an air jump spent early, late, at once, or
   kept -- `PLANS` by `AIR_MODES`, up to 124 flights a look.
3. **It flies what it chose.** The flight chosen is flown open loop and checked every step: does
   it still land where it said, flown on from where he is? It looks again when it does not, and
   every `TUNE.replanEvery` steps (0.05 s) for a flight better by `TUNE.switchMargin`.
4. **Value**: the floors a flight gains, less its time (`timeWeight` floors a second), plus what
   the landing leaves for the next jump (`nextProxy`: the apex a jump off it reaches at that
   speed and meter, and whether it outruns the fire), less a landing the fire reaches first,
   and less what looks wrong: a landing on the last units of a ledge, a turn and a turn back
   (a twitch), steps beyond the edge of the view while it glides out after the shaft.
5. **On the ground** it waits for a gain only while the fire leaves it time, builds the meter
   while it can, and turns at the wall; a watchdog (`stallLimit`, `safeStep`) is still there
   and all but never runs on the demo (0.10 s of `safeStep` in ten minutes).

## It runs until the fire takes it

**Demo games can die.** The fire is live and the bot is mortal; do not add a "never lose" hack.
It is good enough that it does not die: every demo seed and 200 fresh towers survived ten
minutes at the defaults. The menu restarts a demo when it dies, holding four seconds on the
death first (`DEMO_LINGER` in `src/main.js`), so the fall, the impact and the pieces coming to
rest play -- then the next of the five towers (`stepDemo` and `restartDemo`, `startDemo` then
`demoBot.reset()`). There is no timer on a run: the zones change as you climb, so a long run is
what shows the tower. (There was a two-minute cap once; it meant nobody saw past the opening
zones.)

## What the demo leaves out

- **The HUD, and with it every banner.** The title screen draws no HUD over the demo, so the
  herald's words -- the zone titles' banners, the squeeze's, the ascension's -- are never shown
  there, though a demo game says them as a run does (`test-squeeze`: its tower breathes, so it
  announces the squeeze).
- **The height callouts.** The seven words (SWIFT at floor 330 up to GLORY at 2300, once a lap)
  are counted in a demo but never shouted: `Game.step` sets the callout only when `!this.demo`,
  because a callout on a screen with no HUD was a white flash and a shake with no word behind
  it. `tools/test-milestones.mjs` holds attract mode silent.
- **The flash and the shake**, and a zone's backdrop dissolves in rather than snapping
  (`test-menu` section 5).
- **Sound.** `main.js` wires only the player's game to the audio (`wireGameAudio(game, ...)` in
  `src/render/gamesounds.js`); the demo's landings, hops and death make none, and the menu
  music plays over it.
- **A recording.** The attract demo never reaches the replay UI (`ui/replays.js`;
  `test-replayui`'s `demo-recorded` mutant).

## The bot as the suites' player

Most suites that need real play get it from `AutoPlayer` rather than from a script, so a change
to the bot changes their staging. Those that stage **the demo** do it through `startDemo`, so
they play the run the menu shows: `test-autoplay`, `test-botskill`, `test-hudskin`,
`test-zonetitles` (from the ground to floor 2640 at the demo's pace, the fastest the zones go by
anywhere), `test-companions` (the "attract tower" is the demo's now), `test-ascension`,
`test-perf`, `test-optimal` and `test-menu` (the demo behind the menu). Others play a player's
tower at `newRun`'s own defaults with the bot as the climber: `test-callouts`, `test-combo`,
`test-afterimage`, `test-fallclear`, `test-sfx`, `test-steady`, `test-racetower`, `test-replay`,
`test-smooth` and more.

**The bot does not die any more, and several suites need a run that ends.** Where a suite needs
the fire to take him it now says so: `test-replay` (`mortal` in `botGame`: he climbs 60 s, then
hops in place, jump held, through the same `AutoInput`, until the fire takes him), `test-combo`
(the bot lets go of the stick after 60 s), `test-racetower` (DRIVE `mortal`, and a `pauser` for
its stop-start ghosts). A recorded run is still a real run of real input.

Re-taken on 2026-09-29 for the bot, each with the reason in the suite: `test-combo`'s two pins
(held for 180 s: 35,280 and 3,528; caught after 60 s of play: 197,300, 1,100, step 14,697),
`test-racetower`'s three pinned course hashes, `test-companions`' crossing bars (the demo's, and
the human tower's: he goes past them more often at his new pace; the off-screen bars stand),
`test-callouts`' worst-firing comparison (within three frames of the old shout's, the mean still
strictly under it -- see that suite), `test-afterimage`'s drop (on the tower after `SEED`'s),
`test-squeeze`'s demo check (it announces now), and `test-replay`'s bot runs (mortal, above).

**Its look-ahead generates tower between steps**, which a replay records (`K_ENSURE`, the row
*The bot's look-ahead built the tower* below). The rebuilt bot reaches 15 to 35 floors ahead and
generates 0.077 floors a step that way at 100% and 0.104 at the defaults -- over the 0.0625 a
step (`steps / 16 + 1000`) that `replaycodec.js ensureCapFor` allows a file, sized on the old
bot's 0.011. A ten-minute bot replay is refused on import until that cap is raised
(`test-replay`'s ten-minute run); a player's runs generate none that way.

## Is it done? The evidence

For what the demo promises, `tools/test-autoplay.mjs` and the table above. For whether the bot
leaves speed on the table, `tools/test-optimal.mjs` (slow; `npm run test:all`, not `npm test`)
asks three questions. Its last run, 2026-09-29, at the defaults of the time (140%, 0.75, MEDIUM,
gravity 1), 40 towers of two minutes and 60 of 1.5:

| | |
|---|---|
| abstract ceiling at 100% (a platform always where you want one) | 1,140 floors/min |
| mean floors the tower OFFERED at takeoff (no wall bounces, a pessimistic air control) | 11.13 |
| mean floors the bot took | **19.94** |
| jumps taking the best floor on offer | 99.5% |
| single nudges of +-20-25% that raised floors a minute by more than 4 | **five**: `timeWeight` 25 (+31 on 1,497), `relLo` 0.5 (+9), `relHi` 0.88 (+9), `switchMargin` 0.8 (+7), `stick` 1.2 (+5) |

So it FAILS, as it did before the rebuild (two nudges, then nine). The nudges are 0.3 to 2% of
floors a minute, and floors a minute is not what `TUNE` was chosen on: it was chosen on
survival at every setting the menu offers and on the look, with speed third. `timeWeight` is
the one that matters, and it is the one with a cliff: at 45 it took short, quick hops and five
towers in twelve died. Re-measure with `measure-demo.mjs` across the settings before taking any
of them.

## Its numbers are measured, not guessed

`TUNE` at the top of `autoplay.js`, every number with its unit. Chosen by
`tools/measure-demo.mjs` sweeps over fresh towers at the defaults and at the harshest settings
the menu offers, one or two knobs at a time; a sweep sets `globalThis.__BOTTUNE` before importing
the module. The two that matter most go together (the comment above `TUNE`): `timeWeight` 20
climbs fastest without dying, and `nextWeight` 1 is what keeps him alive at the harsh settings
(at 0.35, 23 towers in 24 died there: it bought time with landings that killed his speed).

`tools/tune-bot.mjs` knows the new `TUNE` but has not been run on it; it forks a worker per core
and saturates the machine, so say so before running it.

## Regenerating the seeds and measuring

```bash
node tools/measure-demo.mjs                        # the DEMO_SEEDS at the settings.js DEFAULTS, 10 min
node tools/measure-demo.mjs --count=40 --minutes=4 # 40 fresh towers instead
node tools/measure-demo.mjs --speed=1.4 --platforms=0.875 --difficulty=1 --gravity=0.9
node tools/find-demo-seed.mjs 200 10               # re-picks DEMO_SEEDS (same settings flags)
```

A change of a default in `settings.js` is the demo's at once; re-run `measure-demo.mjs` (and,
if the numbers move, `find-demo-seed.mjs`) after one.

## Tuning knobs

- Demo: `DEMO_SEEDS` and `demoSettings` in `autoplay.js` (the settings.js `DEFAULTS`),
  `DEMO_LINGER` (4 s on the death) in `src/main.js`, `DEMO_DISSOLVE` in `constants.js`.
- Bot: everything in `TUNE` at the top of `autoplay.js`.

## Where the bodies are buried

Things in the bot that took real debugging. Do not re-discover them. The first rows are the
planner of rounds one to four; the rest are round five's.

| | |
|---|---|
| **Bot flying at nothing** | It chased an unreachable target while falling past every platform below. It must always retarget to a landing it can reach. |
| **Stale plan** | The retarget guard only fired when the player was BELOW the plan, so once the bot sailed above its target the plan never expired -- and `safeStep` took jumps without setting one at all. It steered at a platform below its own launch floor, forever. |
| **Coyote misfire** | `jumpHeld` is how the instajump chains, but during coyote time it means "launch now, uncommitted": the frame it walked off a ledge the bot fired a full-speed jump with no target. Round five holds the jump only while `p.coyote <= 0`. |
| **Danger measured in floors** | `slack` counted floors above the rising line. At the foot of the tower that line climbs at 0.2 floors/s, so three floors is fifteen seconds; at floor 900 the same three floors is under two. Danger is a TIME, not a distance. |
| **The controller did not fly the plan** | The old planner committed to a jump because the ballistic arc landed on a platform, and the controller then chased the platform's CENTRE every frame. Any point on a platform is a landing, and landing speed is takeoff speed. Flying the stick positions forward through the real wall physics was worth 398 -> 485 floors/min then; round five flies whole flights. |
| **Air jump spent at the apex** | Intuitive and wrong. `vy_new = max(vy,0)*0.35 + impulse*0.82` keeps 35% of the rise you already have, and height goes as velocity squared, so the height-optimal release is `vy* = 0.35*J/(1-0.35^2)`, and the RATE-optimal release is earlier still. Round five flies both (`relHi` 1.1, early; `relLo` 0.4, late) and at once, and keeps the one that is worth most. Past 1/0.82 = 1.22 the early release point is above v0 itself. |
| **The demo rotation never rotated** | `demoSeedIndex` reset to 0 on every page load and the menu restarted the demo before the first tower finished, so every visit played `DEMO_SEEDS[0]` and nothing else. Start the index at random. |
| **The bot's look-ahead built the tower** | Found by the replay engine: the planner looks ahead with `Tower.peek` BETWEEN simulation steps, and `peek` generates any floor it is asked for -- at the shaft's width of that moment. Played back without the bot, the same floors were generated later and came out different. The recorder writes the floors generated between two steps (`K_ENSURE`) and playback generates them at the same moment. Anything that peeks ahead is building the tower, not reading it -- and a file's cap on them (`ensureCapFor`) was sized on the old bot's 0.011 floors a step; the rebuilt one generates 0.08-0.10. |
| **A callout on a screen with no HUD** | The title screen draws no HUD, so a demo callout was a white flash and a shake with no word. A demo counts the callouts without firing them. Before an effect fires in attract mode, check the menu draws the thing it announces. |
| **A tower shaped for the wrong climber** | The flow tower made the old bot look flawless (579 -> 826 floors/min) and hid everything it could not do: on a player's tower at the defaults it died on 30 towers of 30. A demo on a tower nobody plays is not a showcase of the game. The flow tower stays in `generator.js` only because the replay fingerprint's probe climbs one. |
| **Short hops against a fast fire** | The old planner's deaths came in the air after planned hops of one to six floors (19 of 30): a jump at speed rises to its full apex whatever it is aimed at, so a short hop is a long flight, and MEDIUM's fire gains seven floors in 0.85 s. Value a flight by its time as well as its floors, and a landing by the jump it leaves (`timeWeight`, `nextProxy`). |
| **A plan remade every frame flickers** | Flights of a second with combo-lifted wall bounces land chaotically -- one step of difference in the stick moved a landing 177 units -- so a best choice remade every frame changed from frame to frame, and his facing turned 700-800 times a minute, the sprite flickering left and right: what looked buggy. Commit to the flight, verify it each step, switch only for a clearly better one (`switchMargin`), and charge a turn and a turn back (`twitchCost`). 676-740 turns a minute became 100. |
| **Verify what was promised, not what was hoped** | The first verify compared the flight's whole outcome each step, overlap included; a flight chosen with a small overlap failed it every frame and was re-planned forever. Verify the landing floor only (`check`: does it still land on `target`?). |
| **The model must be the step, bit for bit** | An approximate forward model (closed-form arcs, the walls folded in) chose flights the game then flew elsewhere. `fly()` repeats `Player.step`'s sums in its order at his clock; if `Player.step` changes, `fly()` must change with it. No suite compares the two landing for landing: a drift shows first as misses, stalls and edge landings in `measure-demo.mjs`, so re-measure after any change to the physics. |
| **The view glides; he does not wait for it** | On a tower that widens, the camera eases out to the new shaft; a flight to the new far wall leaves part of him past the edge of the view for a few steps (82 towers of 200 had one). Charge each step beyond the view (`hiddenCost`); the demo seeds have none. |
