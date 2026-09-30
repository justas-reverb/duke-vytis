# The tower

What you climb, and the guarantee that you always can: the reach proof and the suites
that hold it, where the generator, zones, ledges, backgrounds and decor live, the zone
schedule, the lap it makes and what counts it (the callouts and their prestige badge),
what happens at a zone change, the knobs for zones and the squeeze, and the tower-side
bugs. Read this when changing the generator, platform widths or gaps, the physics
constants the proof reads, the zones, their names or the squeeze. See also [BOT.md](BOT.md)
(the demo, on this tower since 2026-09-29), [GAMEPLAY.md](GAMEPLAY.md) (the callouts),
[ARCHITECTURE.md](ARCHITECTURE.md) (the moving-shaft and pruning invariants),
[ART-PIPELINE.md](ART-PIPELINE.md) (the platform tiles and the background layers, and how
art gets into them), STATUS.md (what is wrong with them on screen today) and
[../README.md](../README.md) (the zones and the squeeze as a player meets them).

## The climbability guarantee

The ledges are random, but never so broken that the tower cannot be climbed. That is
enforced, not hoped for.

`src/game/reach.js` computes, from the physics constants, how far a player standing
**dead still with zero momentum** — the weakest jump the game can produce — can travel
horizontally while above the next floor. That is 67.3 px (`ABSOLUTE_REACH`). The
generator is allowed 62% of it (`SAFETY`), **41 px** (`MAX_EDGE_GAP`), and every
platform it emits is clamped to that and then asserted. **If you retune the physics, the
gap cap moves automatically — that is the point.**

Two suites check it:

```bash
node tools/test-reach.mjs 200 5000   # 1,000,000 floor transitions, geometry
node tools/test-sim.mjs 40 90        # 40 seeds x 90s, a bot actually playing
npm run test:deep                    # test-reach at 1000 x 20000: twenty million
```

The first proves the geometry, in both the narrow starting shaft and a fully open one.
The second runs the real simulation with a deliberately incompetent bot that brakes to a
stop before every jump and releases the jump key on landing, so it never builds momentum
and never instajumps — the exact worst case the guarantee is written for, with the rising
floor switched off so the only way to stop is to get stuck. A second pass repeats it with
the floor on (12 seeds), and a third runs a held-jump bot to exercise the chain (12
seeds). Across the 40 seeds of the first pass the weak bot has never been stuck; longest
delay on any single floor is 3.5 s, which is walking the width of the shaft.

The first pass also asserts the invariants the moving walls depend on; those are under
"The invariants that matter" in [ARCHITECTURE.md](ARCHITECTURE.md). Flow towers (the
attract demo's until 2026-09-29; now only the replay fingerprint's probe climbs one) are a
different shape but legal by the same clamp and the same assert.

## Where it lives

- `src/game/reach.js` — the proof above. The generator asks it how far the next platform
  may move, so nothing in it is a tuned magic number.
- `src/game/generator.js` — the `Tower`. Every floor gets exactly one platform; randomness
  lives in x position, width and the pattern currently in play, never in whether the floor
  is climbable. The patterns are below ("The patterns"). Every zone boundary is a wide checkpoint ledge. It also holds the squeeze
  (`squeezeAt`, `squeezeCue`, `Tower.squeezes`) and the `flow` argument: the ramp attract
  mode was built on until 2026-09-29, kept because the replay fingerprint's probe climbs one.
- `src/game/course.js` — a race's tower. A seed does not make a tower on its own: each floor is
  laid out in the shaft as it stands when the floor is generated, and the shaft opens with the
  player's climb, so two climbs of one seed part where the shaft opens (floors 25-75). A race
  therefore serves the ghost run's own floors (a course, surveyed from its replay by
  `race.js`), keeps the shaft at least as wide as the ghost's, and past the ghost's last floor
  generates from the ghost's generator state, through the same clamp and assert as any tower.
  How and why: "The race's tower" in [ARCHITECTURE.md](ARCHITECTURE.md). `test-racetower`
  holds it, and hashes seeded normal runs against pins taken before the race existed
  (2d5c882) and re-taken only when the score or the tower changed on purpose.
- `src/game/themes.js` — the twelve zones' colours, names and schedule (below).
  `tools/test-themes.mjs` fails the build if a zone's palette puts its platform or text
  colours unreadable against its own sky. The ledges on screen are drawn tiles now and the
  backgrounds are painted (`platTop` survives as a particle colour), so that gate no
  longer proves a ledge reads against its background: a shot does. A zone's name is the
  key every per-zone table and module finds it by; VILLAGE was renamed DOWNTOWN, and
  `FORMER_NAMES` is the one place the old name lives on: `artSeed()` hands the art that
  seeds its random stream by the zone's name (the side walls, the HUD skin's grain and
  specks) the name it was painted under, and `tools/diff-platforms.mjs` finds the zone
  under its old key in an older commit's generated modules.
- The ledges: a left cap, a repeating tile and a right cap per zone, laid end to end by
  `Renderer.drawPlatforms` from `src/render/platsprites.js`, which rasterises the
  generated `src/render/platart.js`. All twelve zones' cells are painted in code, one
  painter module per zone in `tools/platpaint/<zone>.mjs` (its contract in the header of
  `tools/platpaint/index.mjs`), each with a palette of its own, and every tile wraps
  exactly (`wrap: 0.0` in the generated module; `test-platstyles` reports any that does
  not). `node tools/import-platforms.mjs --provisional --emit` paints them into the
  stand-in sheet and writes the module; `--emit` alone re-reads
  `assets/platform-tiles.png`, the command once an artist's sheet replaces it. The
  per-zone glow rectangle the renderer drew round every ledge in the six upper zones is
  gone, and only a checkpoint pulses.
  `src/game/platstyles.js`, the material and cap names the old procedural painters drew,
  is no longer read by the game -- only `tools/shot-platforms.mjs` labels with it and
  `tools/test-platstyles.mjs` validates it (that suite also holds the tile body to
  `PLAT_THICK`).
- `src/render/backdrop.js` — each zone's background: its sky and three 256x256 tiled
  layers, FAR, MID and NEAR at 12%, 22% and 34% parallax. A layer is the artist's PNG
  where `src/render/bgart.js` lists one and otherwise the zone's painter in
  `src/render/bgpaint/<zone>.js`; today all twelve zones are painted in code, from the
  user's board.
- `src/render/decor.js` and `src/render/decorpaint/` — things that grow from the
  platforms, on ledges at least 22 units wide (`DECOR_MIN_W`), at a chance per zone (each
  zone module's `CHANCE`). What a ledge carries is its zone's `scene()`, drawn from a
  random stream seeded by the platform's own floor number, so a ledge always carries the
  same furniture and nothing flickers as it scrolls. Every one of the 23 elements is a
  sprite at the Duke's scale, painted in code by its zone's module after the user's
  environment sheet (`assets/decor-reference.webp`) -- or, for the pieces redrawn since,
  after the fixes board (`assets/decor-fixes-reference.webp`; each module's comments say
  which); an artist's PNG in `assets/decor/` would replace it. How they are drawn is in
  [ARCHITECTURE.md](ARCHITECTURE.md), how art gets in in [ART-PIPELINE.md](ART-PIPELINE.md); `node tools/shot-decor.mjs --elements
  --zone=<ZONE>` shows one zone's, every variant and frame.

## The patterns

A human tower is laid out in stretches, each a PATTERN run for a few floors, and each pattern
is its own shape of climb (`SHAPES` in `generator.js`: weight, length, width range, and the
floor it is first picked from). A pattern never follows itself, and the choice is by weight
among those open at that height:

| pattern | from | floors | ledge width x | the shape |
|---|---|---|---|---|
| zigzag | 0 | 4-8 | 0.70-1.30 | alternate sides at near the gap cap: wall-bounce chains |
| drift | 0 | 4-10 | 0.70-1.30 | a meander, a small overlap or gap each floor |
| cluster | 0 | 3-7 | 0.70-1.30 | heavy overlap: somewhere to breathe |
| scatter | 0 | 4-9 | 0.70-1.30 | anywhere in the shaft the reach clamp allows |
| stair | 0 | 4-9 | 0.70-1.30 | a steady march one way; also what the one-side breaker forces |
| slalom | 100 | 8-16 | 0.80-1.20 | an S-curve: the ledges' middles on an eight-floor wave (`WAVE`, literals, no `Math.sin`) |
| terrace | 100 | 4-8 | 1.50-2.00 | broad ledges a long leap apart: somewhere to run |
| switchback | 100 | 6-12 | 0.70-1.30 | three floors one way, three back: a Z |
| leapfrog | 300 | 6-10 | 0.75-1.25 | a long hop, then a short one back over the last ledge's edge |
| chimney | 300 | 4-7 | 0.45-0.65 | narrow ledges straight up, drifting off the walls: held jumps |
| gauntlet | 500 | 5-9 | 0.40-0.60 | narrow ledges wandering, turning on a coin: care |

Asked for on 2026-09-28: more variety in how the ledges are laid out, which had become far
too predictable. The tower had the first five, picked evenly, every ledge within 30%
of one width. Measured on floors 100-700 of three bot runs (a probe that asks, of each next
ledge, how far off the eye's best guess is: the last step again, or the last step reversed):

| | before | after |
|---|---|---|
| the eye's best guess, off by (share of a step) | 0.38 | 0.67 |
| turns that are a plain zigzag | 53% | 26% |
| spread of widths (sd, against the median of the ten below) | 0.22 | 0.41 |
| the commonest pattern's share of floors | stair, forced by the breaker | terrace 18% |

`node tools/shot-layout.mjs` draws the map (each ledge in its pattern's colour) and prints
these numbers and each pattern's share.

They arrive with the zones (`from`) because everywhere at once they made the opening deadly:
see the table at the end. Chimney and slalom steer themselves, so the one-side breaker in
`generate()` leaves them alone; it used to turn them into a floor or two and then a forced
stair. And the breaker crosses by any of `CROSSINGS` open at the height -- stair, terrace,
leapfrog -- where it always forced a stair, which had come to 31% of the tower. A flow tower uses none of it -- its draws are what they were, byte for
byte (`test-squeeze` 6). A race's course carries the pattern as an index into `PATTERNS`, so
new patterns go on the end of that list, and nothing new is carried: a slalom's phase is the
floors left in it.

## The zones

Twelve, BASEMENT to ZENITH. The first is 100 floors and every one after it 200, so ZENITH
starts at 2100 and one cycle is 2300 floors (`CYCLE_FLOORS`). The tower does not end
there: each further cycle is the twelve in a fresh shuffle (`orderForCycle`), never
opening on the zone that closed the cycle before. The shuffle is seeded by the cycle
number alone, so every run meets the same order (DUNGEON at 2300, CITADEL at 2400, ...).

Ask the schedule for anything about zones: `bandFor(floor)` gives the cycle, the band,
the floors into it and its length, and `themeIndexFor(floor)` the zone. A modulo by
`FLOORS_PER_THEME` is wrong after the first boundary and a `themeIndex + 1` after the
first cycle; both have shipped, and the table below has what they cost.

**A cycle is the lap the game counts.** The seven callouts, SWIFT to GLORY, stand at k/7
of `CYCLE_FLOORS` (`src/game/milestones.js`): 330, 660, 990, 1310, 1640, 1970, and GLORY on
the lap's top floor, 2300 -- which is the next cycle's first floor, so GLORY and the next
lap's first zone arrive on the same step. Lap L fires the same seven (L - 1) x 2300 floors
higher, and from the second lap each carries a prestige badge, x2, x3 ...; how they fire and
take turns with the zone titles is in [GAMEPLAY.md](GAMEPLAY.md). They read the lap from
`themes.js`, so they move by themselves if the schedule does.

At a change `Game.step` flashes at the boundary, where the backdrop and the HUD's skin
change under the flash, and puts the new zone's title up with a shake and a burst of its
colours -- unless a callout is on screen, in which case the title waits its turn
(`Game.arrive`; a landing that crosses both shows the lower floor first). A zone's arrival
is also when the climb music may step its key -- on its next bar line, never twice in 8
bars, with the zone's chime on that downbeat; the rules are in [AUDIO.md](AUDIO.md).

Over a zone's last 12 floors `themeBlend` rises to about 0.7 and the backdrop fades the
WHOLE next zone in: its sky and three layers composited into one buffer and drawn once at
the blend, which is an exact crossfade where fading each layer in separately is not. The next zone is
`Game.nextTheme`, asked of the schedule at the first floor past the current band. Its
layers are painted ahead, one a frame, once the current zone has been on screen 120
frames (`WARM_AFTER` in `backdrop.js`), because a zone costs up to 35 ms to paint and the
first frame of a fade must not pay it.

## Tuning knobs

In `src/game/constants.js`.

- Zones: `FIRST_THEME_FLOORS` (100) and `FLOORS_PER_THEME` (200) -- twelve zones, the
  last from floor 2100, a cycle of 2300, each later cycle reshuffled. The per-zone record
  in `stats.js` and TOWER PROGRESS in `screens.js` work out the first cycle's bounds from
  these two. Two awards in `achievements.js` sit on the tower's landmarks as literals --
  HALFWAY at 1150, half a cycle, and SUMMIT SEEKER at 2100, "REACH THE ZENITH" -- and
  must be moved by hand if the schedule changes. The callouts' heights do not: they are
  derived from `CYCLE_FLOORS` and `CALLOUT_ROUND` (10), and so are the names of the
  recorded callout samples the game looks for, `milestone330` to `milestone2300`
  (`milestoneSample` in `src/render/audio.js`) -- after a schedule change a file recorded
  under an old name is simply not asked for, and a missing file is not an error, so
  nothing says so. The crossfade's 12 floors and 0.75 are
  literals in `Game.step`.
- Widths: `PLAT_W_MIN`, `PLAT_FRAC_MIN`/`_MAX` (a fraction of the shaft), `PLAT_W_JITTER`,
  `NARROW_RATE` (extra narrowing by floor 800) and `NARROW_LATE` (800 to 2300). None of
  them moves the gap cap, which is reach.js's alone.
- The squeeze: `SQUEEZE_FROM` (2100), `SQUEEZE_PERIOD` (150), `SQUEEZE_DEPTH` (0.72),
  `SQUEEZE_W_MIN` (24; never below `PLAYER_W + 4`), `SQUEEZE_CUE_LAG` (when the banner
  fires, as a fraction of the period; open at both ends). Human towers only --
  `Tower.squeezes` is false for a flow tower. The demo's tower is a human one since
  2026-09-29, and breathes.

## Where the bodies are buried

Things in the tower that took real debugging. Do not re-discover them.

| | |
|---|---|
| **`Math.round` after clamping** | Pushed platforms a fraction outside the wall they were just clamped to. Clamp, round, clamp again to integer bounds. |
| **Variety in the opening shaft** | The six new patterns were first open from floor 1, and the tower got far harder for anyone who stops: a racer standing still 200 steps of every 480 reached floor 26 on the median of five seeds, against 218 on the old tower, and the bot itself fell at floor 10 on seed 31337, which opened with a 15-floor slalom in the 208-wide starting shaft, its ledges already at `PLAT_W_MIN`. The weak bot of `test-sim` did not show it (it passed, 157 against 151): a stop-start player does. The new shapes arrive with the zones now (100, 300, 500). A change to the tower wants a stop-start racer as well as the bots, on more than one seed. |
| **The one-side breaker ate the new patterns** | `generate()` forces a stair across the shaft after four ledges on one side. A chimney or a slalom off-centre tripped it within a floor or two, and the forced stair became the commonest pattern in the tower. Measured by tagging each floor with the pattern that laid it (`tools/shot-layout.mjs`, which colours the map by pattern), not by reading the code. The patterns that steer themselves are exempt (`STEERED`), and the breaker's own stair became a choice (`CROSSINGS`): it was 31% of floors above 100. |
| **The checkpoint marker landed on the tomb carving** | Found by an adversarial review of the crypt work, and reported by none of the four artists. The checkpoint dashes were drawn at `y - 6`; `MATERIAL.tomb` carved its emblem into rows `y-6..y-4`. They collided exactly, and both turned to mush -- on the one ledge a player most needs to read. The dashes moved to `y - 3`, the dark row `CAP.tomblid` laid down, which was both clear of every carving and the highest-contrast pairing available. Both painters are gone now -- the ledge is a drawn tile -- and the dashes are still at `y - 3`, so check them against the DUNGEON tile whenever it is redrawn. |
| **A difficulty that reached the title screen** | The squeeze was first applied to the attract towers too. The menu bot then died in a trough on every seed, a few seconds after 2100 -- and `test-autoplay` still printed PASS, because it only fails on a stall. The squeeze is for the player; `Tower.squeezes` is false for flow towers, and `test-squeeze` hashes floors 1-4000 of sixteen flow towers against the pre-squeeze generator. (Since 2026-09-29 the demo climbs a player's tower, squeeze and all, with a bot rebuilt to live on it: [BOT.md](BOT.md).) |
| **A rename that would have repainted the zone** | VILLAGE became DOWNTOWN in every table and module keyed by the name -- and the side walls and the HUD skin seed their random streams from that name, so seeded by DOWNTOWN every patch and speck moved, 31,000-36,000 px a frame. `artSeed()` keeps them on the name they were painted under (`FORMER_NAMES`). Then nothing held that table: emptied, the wall moved 2,049 of its 8,192 pixels and every suite still passed. `test-walls` now paints DOWNTOWN's wall from `wallRng('VILLAGE')` written out, and requires the new name's stream to paint a different one, so the check can bite. A name that seeds a random stream is part of the art; a rename is not a repaint. |
| **Zone arithmetic done outside the schedule** | Three times. A modulo by `FLOORS_PER_THEME` put every boundary after the short first zone in the wrong place; `bandFor` exists because of it. TOWER PROGRESS then drew twelve zones of 100 floors, so a best of 1200 showed ZENITH complete, 900 floors short of it; `test-achievements` now fails on the 100-floor bands. And `Game.nextTheme` was `THEMES[themeIndex + 1]`, true of the first cycle only: from 2300 every cycle is reshuffled, so 35 of the 48 boundaries up to floor 9200 named the wrong zone, and ZENITH, clamped, named itself. While only the sky faded that barely showed; once whole layers crossfaded, 2400 faded toward FOREST and became CITADEL. No suite checks `nextTheme` -- the check in 7bdc6d3 was a one-off over every floor to 9200 -- so re-run one like it after touching the schedule. |
