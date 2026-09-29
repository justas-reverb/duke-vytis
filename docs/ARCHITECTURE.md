# Architecture

How the code is laid out, how a frame is made and in what order, why it is smooth at
4K/160 Hz and where it is and is not pixel-exact: the loop, the two resolutions, screen
scaling, the stepped zoom, what a frame costs, painting ahead in slices, the input (keys
and the gamepad), the page inside someone else's page, the replay engine, and the
invariants everything else leans on -- the determinism rules among them.
Read this when you are touching `src/main.js`, `src/core/`, `renderer.js`'s transform,
draw order or `fit()`, `settings.js`'s scaling, the backdrop's transform, seeds or zone
crossfade, how the ledge furniture is drawn (`decor.js`), one of the drawn layers (the
walls, the start floor, the rising floor, the speed streaks, the combo trail, the speed
afterimage, the death's burn, the HUD's per-zone skin, the zone titles, the callouts, the
menus' and the scoreboard's skins), a painter that runs under a deadline (`slices.js`),
what the HUD is handed in each state, the particle pool, the gamepad, `src/game/replay*.js`
and `snapshot.js`, anything inside `Game.step` (the determinism rules), or anything that
changes `PX` or the zoom.
See also: [BUILD.md](BUILD.md) (running and packaging, the web zip) ·
[TESTING.md](TESTING.md) (the suites and the headless canvas) · STATUS.md
(what is open) · [../README.md](../README.md).

## Code map

```
src/main.js                boot, the screen state machine, the live demo game behind
                           the menus, the one key handler (onKey) the keyboard and the
                           gamepad both press, the render governor, and the
                           scoreboard's warm-up once a frame (warmBoards). The entry
                           point: it is the only module index.html loads
src/core/     loop.js      fixed 240 Hz step, interpolated render, rAF watchdog, a
                           governor that caps DRAWING when idle, and an onFrame hook
                           run before each frame's steps (the gamepad's poll)
              input.js     jump buffering, coyote time; padDown/padUp, the keydown
                           handler's own work done for a pad
              gamepad.js   the Gamepad API, polled once a frame: in play it presses
                           PadLeft/PadRight/PadA on the Input, in the menus it hands
                           key codes to main.js's onKey (see Input: keys and a pad)
              embed.js     a page inside someone else's page (itch.io's iframe): the
                           focus and SAVES ARE OFF banners, whether F may go fullscreen
              rng.js       mulberry32; Rng, the same numbers with the state in a FIELD
                           so a copy of the game copies it; mix32, which derives the
                           run's cosmetic seeds from its seed
src/game/     constants.js most tuning numbers. The bot's TUNE, the audio ranges, the
                           zoom steps and the pad's thresholds live beside their code
                           (see Tuning knobs)
              reach.js     THE PROOF -- derives the generator's gap cap from physics
              generator.js tower generation, shaft-aware, pattern-based;
                           `flow` mode shapes attract-mode towers for the bot
              player.js    physics, instajump, air jumps, wall bounces
              combo.js     combo tracking; a fixed gain requirement (COMBO_MIN_GAIN,
                           two floors), the meter and its x1.5 steps (MULT_STEP). It no
                           longer shouts a word: the callouts are the tower's now
              milestones.js the seven callouts, SWIFT to GLORY, at k/7 of the 2300-floor
                           lap (330 ... 1970, GLORY on the lap's top floor), once each a
                           lap; from lap 2 each carries an xN badge
              stages.js    the climb's three stages (the music's), keyed by zone NAME
              game.js      simulation driver, camera, rising floor, death sequence (the
                           burn's clock, the streaks' let-go, the fall's camera), the
                           arena/zoom steps (ARENA_STEPS), and the run's seeded
                           cosmetic streams (fx, lineRng)
              autoplay.js  attract-mode planner bot (the demo)
              companions.js six holy climbers: HOP ledge to ledge (the default),
                           or GLIDE on the old rail, kept to compare in play
              stats.js     persistence
              settings.js  graphics options, frame cap, fullscreen, and the
                           COMPANIONS: HOP / GLIDE option
              replay.js    THE REPLAY ENGINE: the recorder, the playback, the
                           simulation fingerprint, the ghost track, and the API at its
                           top, the one part the UI is to call (see The replay
                           engine); ui/replays.js calls it
              race.js      a ghost race: the survey that finds the ghost run's own
                           tower by re-simulating its replay (CourseSurvey), and where
                           the ghost is and how far ahead (Race)
              course.js    that tower as data (a course) and the CourseTower that
                           serves it in a race; see The race's tower
              replaycodec.js the replay file: DVR1: and a checked binary in base64
                           (format 2: a race's, carrying its ghost and its tower);
                           everything read from outside is untrusted
              replaystore.js where replays are kept -- the last run, the ten best, the
                           pinned -- within a character budget, behind a four-method
                           backend (localStorage today)
              snapshot.js  a deep copy of a whole Game, for seeking a replay
              themes.js*   achievements.js*  flavour.js*  platstyles.js*
              compdialogue.js*
                           themes.js also holds FORMER_NAMES: DOWNTOWN was VILLAGE, and
                           art seeded by a zone's name keeps the old one (artSeed).
                           platstyles.js is read only by tools now (test-platstyles,
                           shot-platforms): the per-zone glow round every ledge was
                           the last thing the renderer took from it, and it is gone
src/render/   renderer.js  world rendering, the zoom transform and the draw order (see
                           How a frame is drawn). Platforms are blitted from drawn
                           tiles: the shadow cast from the tile's own art (none in
                           DOWNTOWN), caps, whole tiles, then the ledge's furniture.
                           Owns the burn layer and the afterimage's record
              platart.js   GENERATED by tools/import-platforms.mjs from
                           assets/platform-tiles.png: left cap, tile, right cap and a
                           palette of its own per zone. Every zone's cell is painted in
                           code (tools/platpaint/), written over a cut of the old strips
              platsprites.js rasterises platart.js, once per zone
              decor.js     the ledge furniture's RUNTIME: which ledges carry any
                           (carriesDecor, which shot-platforms asks too), a sprite
                           cache by zone/element/variant/frame, one drawImage per
                           element, frames, the bob hook and an alpha hook no element
                           uses any more (it dims the whole sprite, core and all; see
                           ZENITH's shaft in TESTING.md's decor row), the anchors
                           (a hanging thing hangs from the underside the zone's tile
                           DRAWS, undersideFor), warmDecor, preloadDecor
              decorpaint/  the furniture itself, one module per zone: each element's
                           box, anchor, frames, variants, notes and paint(), and the
                           zone's scene(). index.js is the contract and says what
                           every field means; util.js is the pixel kit paint() draws
                           with; legacy.js is the old world-unit painters, drawn by
                           nothing but shot-decor --legacy
              decorart.js  GENERATED by tools/import-decor.mjs --emit: the artist's
                           furniture PNGs in assets/decor/ that passed its checks.
                           None has been delivered, so it lists nothing and every
                           element is painted in code. Like every --emit here it is
                           a redirect: run it from Git Bash, because Windows
                           PowerShell 5.1's `>` re-encodes it (UTF-16 by default)
              backdrop.js  parallax: sky + FAR/MID/NEAR 256px tiles (a zone may paint
                           them a screen wide and lay them like bricks: SWAMP), from
                           the artist's PNGs (bgart.js lists them) or bgpaint/<zone>.js
                           painters,
                           each layer from its own seeded stream (layerSeed, keyed by
                           the layer's position; test-backgrounds calls the same one),
                           and the whole next zone composited and crossfaded in
              bgart.js     GENERATED by tools/import-backgrounds.mjs: the artist's
                           tiles that exist in assets/backgrounds/. None do yet, so
                           every layer on screen is painted
              bgpaint/     one painter module per zone, all twelve repainted from the
                           user's board; util.js draws shapes that wrap; legacy.js is
                           the old two-layer look, used by no zone now, kept for the
                           reference sheets
              walls.js     the side walls: a zone's WALL tile and FACE laid into one
                           strip, pinned to world heights and to the inner edge, the
                           right wall the left one mirrored, the next zone's drawn
                           over it at the backdrop's blend
              wallpaint/   one wall painter per zone; index.js is the contract (64x128
                           WALL, 8x128 FACE, both opaque), util.js the kit
              ground.js    floor 0, the start floor: flagstones on rubble, painted
                           ONCE across the widest shaft into one strip so nothing
                           repeats, at the Renderer's construction. Also paints the
                           brief's GROUND-TOP/GROUND-FILL pair (groundTiles), the
                           shape an artist's tiles would replace; no tool prints it
              risefloor.js the rising floor: fire over a lava crust, the same in every
                           zone, composed once into strips and warmed a piece a frame
                           before the rise arms. Owns RISE_DEPTH
              streaks.js   the speed streaks: screen space, from a per-zone atlas,
                           each zone's tones chosen against its measured backdrop
              hudskin.js   the HUD's per-zone skin: paints each zone's gauge frames,
                           fills and lettering at art resolution and draws them at
                           1/PX (skinText, skinGauge); hudSkinFor switches it on the
                           zone's arrival and paints the next zone's ahead. Its frame
                           and atlas painters take a character set and have generator
                           forms (paintFrameSteps, keylineAtlasSteps, inkAtlasSteps),
                           which the scoreboard's skin runs under a deadline
              hudpaint.js  the twelve HUD skins, data and frame painters only: each
                           zone's inks and keyline, and its gauges' material, coloured
                           from that zone's own ledge, wall and decor art. Every
                           zone's frame() is a generator (see Painting ahead in slices)
              zonetitles.js a zone's name lettered in its material, shown on arrival:
                           warms the next zone's title a piece per HUD frame and draws
                           it at the top of the HUD's banner stack
              titlepaint/  one title painter per zone; index.js is the contract,
                           util.js the letterforms (the 5x7 font as strokes) and kit,
                           each heavy pass also a generator (layoutSteps, ...Steps).
                           The scoreboard letters GAME OVER with the same painters
              callouts.js  the seven callouts lettered at art resolution, their
                           prestige badge (drawCalloutBadge, drawn by the renderer),
                           and the floaters' inks (BOUNCE, CHASE n, +score), all
                           painted ahead from the renderer's floater pass
              calloutpaint/ one painter per callout word; index.js the contract,
                           kit.js the shared lettering kit (bevelBody, glyphInk --
                           which the menus letter with too), badge.js the xN badge
              menuskin.js  the menus' skin, the Duke's own tinctures (gules, or,
                           argent): plates, lettering, keycaps, painted once and blitted;
                           its lettering is also the scoreboard's, the fall's words',
                           the herald's lines' and the companions' calls'
              gameoverskin.js the scoreboard in the style of the zone the run ended
                           in, and the fall's words: its panels and GAME OVER painted
                           AHEAD in slices under a deadline (warmBoards), never in the
                           fall or on the board; its lettering painted at load
              slices.js    painting cut into slices a frame can afford: overdue(),
                           drain(), steps(), runUntil()
              afterimage.js the speed afterimage's memory: the states he was DRAWN in,
                           frame by frame, and where on that path the copies go
              burn.js      the tower burning away as the fire takes him: noise masks
                           laid over one offscreen layer (see The death's burn layer)
              sparks.js    the combo trail: its sprites (ASCII, one atlas), its steps,
                           rates and motion, and drawSparks, which walks only the
                           trail's slots of the particle pool
              sprites.js   DUKE VYTIS: poses and draws IMPORTED art. No authored
                           pixels and no procedural limbs any more. Every pose has
                           a real drawing behind it. drawSprite and drawGhost (the
                           afterimage's silhouettes) both place a cell through ONE
                           function, placeCell; the tuck turns about SPIN_PIVOT
              vytisart.js  GENERATED by tools/import-sprite.mjs from the sheet
                           in assets/vytis-sheet.png
              eyefix.js    ORPHAN: written for an earlier sheet, imported by nothing,
                           and not checked by test-sprites whatever its header says
              compsprites.js the six companions: rasterises companions/*.js and
                           draws them (drawCompanion), a standing pose lowered onto
                           the boot row read by eye (COMP_BOOT_ROW)
              companions/  GENERATED by tools/import-sprite.mjs, one module each, a
                           164-pixel cell at the character's own width. Each header
                           names its sheet and the exact command that regenerates it
              font.js      5x7 bitmap font; one atlas per colour, warmed at load
              particles.js pooled and culled, one set of arrays in two regions:
                           the RING every burst, mote and ring shares, round-robin,
                           and after it the combo trail's own slots (comboTrail,
                           shedOne); draw() draws only the ring. Its random numbers
                           come from the game's cosmetic stream (`rng`), and letGo()
                           hurries every live piece through its life in the death
              emblem.js    places the title shield. Also the app icon.
              shieldart.js GENERATED by tools/import-shield.mjs from
                           assets/shield-source.png, 96x148
              audio.js     chiptune on WebAudio: the music's lookahead scheduler, the
                           limiter, a tempo that follows the run a little, a key that
                           steps only with a zone's arrival, a theme per stage; plays
                           the effects in sfx.js (AUDIO.md)
              sfx.js       the sound effects as DATA, voices the engine and the
                           offline renderer both evaluate
              gamesounds.js every sound a run makes, wired to a Game from outside the
                           simulation (wireGameAudio); the menus' own stay in main.js
              tracks.js    generated note data
              speedramps.js*
                           read only by test-platstyles now: the streaks take their
                           colours from TONES in streaks.js (946073b)
src/ui/       hud.js       the HUD in the zone's skin: floor, score, the speed bar,
                           the combo meter down the left edge, the callout (lettered
                           by callouts.js; the skin's text is only the fallback for a
                           word with no painter), the banner stack (a zone's title at
                           its top), CLIMB!. The right edge below the score is empty
                           on purpose: the FALL ROOM gauge that ran down it is gone
                           (7467006)
              screens.js   the menus, pause, the game over board, the four stats
                           pages, graphics options, the opening guide, and the fall
                           (drawFalling: the HUD fading out; drawFallWords: SPACE TO
                           SKIP, then SPLAT or OOF, the verdict, the floor, SPACE) --
                           all of it drawn from menuskin.js's and gameoverskin.js's
                           painted pieces
electron/     main.js      the window, and the vytis:// scheme that serves the game
                           without opening a socket
              preload.cjs  the only thing the game knows about the shell
              smoke.js     boots the build offscreen and proves it painted
tools/        serve.mjs    the dev server, http://127.0.0.1:8173/
              test-all.mjs DISCOVERS the suites -- every test-*.mjs; it
                           prints how many ran
              headless.mjs + shot.mjs + test-perf.mjs -- a canvas, in Node
              fakepage.mjs -- just enough window, document, storage and navigator
                to boot the REAL main.js in node (test-gamepad, test-web)
              shot-text (the TEXT at the frame it fires), shot-menu (the title,
                the header or the shield alone), shot-screens (every screen the
                menu reaches), shot-gameover (the board for a death anywhere),
                shot-poses, shot-companions, shot-compfeet, shot-shields,
                shot-platsheet, shot-platforms, shot-platwidths, shot-backdrops,
                shot-decor, shot-walls, shot-trail, shot-stand, shot-death -- one
                sheet each; every one, with its flags, is in TESTING.md.
                menu-layout.json is test-menu's record of where the old screens
                drew every word
              import-sprite, import-shield, import-platforms (+ platpaint/, one
                ledge painter per zone, and diff-platforms, the proof that no other
                zone moved), import-backgrounds, import-decor, pngread, shieldfind
                -- the art pipeline; platform-template, background-template,
                decor-sheet, decor-fix-sheet, brief-sheets (the walls, the two
                floors, the streaks and the trail) -- the sheets for the artist
              compose-music (+ normalize-music, legacy: never run it),
                find-demo-seed, make-icon -- the other generators
              build-web -- `npm run web`, the zip for itch.io (BUILD.md)
              render-music, render-sfx (+ music-render, sfx-render, engine-render,
                dsp) -- the music and the effects rendered offline to WAV and
                measured (AUDIO.md)
              tune-bot (+ tune-worker, one forked per core), tune-companions
                (one process, one core) -- the sweeps
              measure-demo -- the attract demo measured as the menu plays it (BOT.md)
              batch1-7.ps1 -- the local-model content jobs
```

`*` = content that originated with the local Qwen model; some of it has since been
rewritten (every line in `flavour.js` has). See **[../DELEGATION.md](../DELEGATION.md)** for
exactly what it produced, what survived and what did not.

Where each part is written up: the physics, combo, death and HUD, and what the combo trail,
the rising floor, the zone titles, the callouts and the death show the player, in
[GAMEPLAY.md](GAMEPLAY.md); the generator, the
reachability proof and the zones in [TOWER.md](TOWER.md); the demo bot in [BOT.md](BOT.md);
the companions in [COMPANIONS.md](COMPANIONS.md); the Duke's poses in [DUKE.md](DUKE.md); the
importers, the generated modules, the ledge painters, the three-layer backgrounds and
everything painted in code -- the textures and effects, the zone titles, the HUD, the
callouts, the menus and the scoreboard -- in [ART-PIPELINE.md](ART-PIPELINE.md); the music
and sound in [AUDIO.md](AUDIO.md); the suites and the `shot*` tools in
[TESTING.md](TESTING.md); the `electron/` shell and the web zip in [BUILD.md](BUILD.md).
The loop, the input, the page in someone else's page and the replay engine are here.

## How a frame is drawn

`Renderer.draw`, back to front. Where a thing sits in this list decides what it may cover,
and the trail, the streaks and the HUD are each where they are for that reason:

1. **The backdrop**: sky and FAR/MID/NEAR, in view units, under neither the zoom nor the
   shake (see "The inner zoom steps in quarters").
2. **The back of the world**, under the world transform and the shake:
   - **the combo trail** (`drawSparks`), FIRST, behind the walls, the ledges and the
     Duke, so however dense it gets it cannot cover him or the lit top rows a player
     tracks at speed. A piece born inside his outline stays hidden until he moves off it,
     which is what makes it read as falling out of him. `shot-trail --measure` counts the
     pixels it changes on each ledge's surface row and the six under it: none, over nine
     zones, when it landed.
   - **the side walls** and the floor ticks every ten floors (`drawWalls`, `walls.js`).
3. **The speed streaks**, in screen space with the shake, then the world transform set
   again: over the walls, UNDER the ledges, the rising floor, the HUD, the companions and
   the Duke. Drawn last, as the bars once were, their glints crossed his face and shield
   at every wall bounce and the HUD's numbers. Drawn over the ledges, as they were until
   946073b spread them across the whole width, each line cut a notch through the lit row
   a player tracks, and a line bright enough to stand off a dim zone's backdrop was
   brighter than that zone's lit row (luma 100 in FOREST and SWAMP). Behind the ledges no
   line can cross one, however bright it has to be. In the death they are retired: the
   intensity falls to none over `STREAK_LET_GO` while the lines keep rising at the pace
   the climb left them (`game.fallPace`), so none slows or vanishes mid-screen.
4. **The front of the world**, under the world transform and the shake:
   - **the ledges** (`drawPlatforms`): per ledge its shadow, caps and tiles, then its
     furniture. Floor 0 is the ground (`ground.js`), stopped at the half-width the walls
     are DRAWN at, not the one the shaft has stepped to. In the death they are drawn
     through the burn layer instead, and not at all once burned (see The death's burn
     layer below);
   - **the rising floor** (`risefloor.js`), and in the death -- FALLING and DEAD alike
     (`dying()` in `renderer.js`) -- the pit, the body as it lies, its pieces and the blood.
5. **The HUD**, screen space, under the characters: they ride high in the view and the
   HUD's left column runs most of its height, so drawn over them it was constantly printed
   across one of them. It is a callback `main.js` hands in, and what it draws depends on
   the state (below).
6. **The companions** (through the burn layer in the death), **then the Duke**: behind
   him the speed afterimage's silhouettes, farthest first, then his sprite, both placed by
   `placeCell` (`drawPlayer`; where the copies go is in GAMEPLAY.md, how they are painted in
   ART-PIPELINE.md); then the particle
   pool's ring -- dust, sparks, confetti, shockwave rings -- over him.
7. **Screen space again**: the companions' calls, the floaters, the danger band, and the
   callout's prestige badge (`drawCalloutBadge`) -- last, so nothing covers the one thing
   a player earned by surviving a lap, where the word itself is the HUD's and sits under
   the characters; then, without the shake, the fall overlay (a darkness closing in; the
   wind lines that were drawn there are gone, see GAMEPLAY.md), the vignette, the flash and
   the scanlines.

`Renderer.draw` ends there. `renderFrame` in `main.js` then draws, in view units, what goes
OVER the world: in the fall its words (`drawFallWords`: SPACE TO SKIP, then SPLAT or OOF,
the verdict, the floor, SPACE), on DEAD the scoreboard (`drawGameOver`), in a pause its
panel. The menus are drawn the same way over the demo's frame (the title and the guide
after a dark wash, `drawMenu`, `drawTutorial`); the options, stats and help screens draw
without a world. Last, whatever the screen, `warmBoards(game)` paints the scoreboard ahead
under its deadline (Painting ahead in slices, below).

### The death's burn layer

From the frame the fire takes him, everything of the tower on screen burns away over
`BURN_T` (0.3 s), so the fall is him alone in the shaft (the user's request; what it
replaced is in GAMEPLAY.md). The ledges, their furniture and the companions are drawn as
usual, but into `burnLayer`, a store-sized canvas the Renderer makes at construction; then
`burn.js` lays three masks over them IN THE WORLD, anchored to the tower so the holes rise
with the ledge they eat -- char (`source-atop`, near-black), embers (`source-atop`, ember
orange on the pixels next in line) and holes (`destination-out`, fading a band of pixels
out over one of `BURN_STAGES` stages) -- and the rows the burn covers are copied back onto
the frame (`drawBurning`). Which pixel goes when is a tileable noise field one floor tall,
ranked to an even spread, so every ledge meets the same rows of it and goes from its
underside up. With no burn yet the layer is the same picture as drawing straight onto the
frame, so the catch itself changes nothing.

Two lines keep anything from uncovering in a frame. The tower under the fire's line
(`fireLine`: the fire less the furthest a ledge's art or furniture reaches up, `HEAD` and
`decorReach()`) is never drawn in the death -- it was behind the crust when the fire took
him, and the crust never ends higher than it reached then (`Game.crustDepth`). And a
companion burns no later than the ledge under his feet: each column of him takes the mask
row just under his feet, so he cannot stand whole on a ledge already gone
(`drawBurnColumns`).

Built once, at construction (`warmBurn`): 2 x `BURN_STAGES` canvases of one 480 x 120 tile,
3.7 MB, 31 ms headless. A frame of the burn clears and copies back only the rows it covers,
draws each mask as a grid of tiles (about five masks of some fifty tiles at zoom 1) and
allocates nothing. The headless canvas learned `source-atop` and `destination-out` for it
([TESTING.md](TESTING.md)).

### What the HUD is handed, per state

`renderFrame` in `main.js` passes `Renderer.draw` a callback, and the callback decides:

| State | The HUD slot draws |
|---|---|
| PLAYING, PAUSED | `drawHud` -- in the zone's skin (`hudSkinFor`), zone titles in its banner stack, the callout's word (its badge is the renderer's) |
| FALLING | `drawFalling` (`screens.js`), handed a `drawHud` closure: only the HUD fading out, over `HUD_OUT` (0.35 s) in the banners' three steps (1, 0.7, 0.4). The fall's words are NOT here: `drawFallWords` puts them over the world after the frame -- SPACE TO SKIP from `SKIP_PROMPT_AT`, and after the impact SPLAT or OOF, the death line, the floor and SPACE, each fading in whole over `IMPACT_FADE`. Drawn in this slot, under the characters, a splat's pieces flew across them |
| DEAD | nothing: the scoreboard is drawn after the frame, in the style of the zone the run ended in (`gameoverskin.js`). The HUD used to come back here, faint under the board, FALL ROOM and all, after the whole fall without it |

The fade is a layer, not a lowered alpha: the HUD sets its own alpha per element and its
outlined text is overlapping stamps, which a lowered alpha on the screen shows through
each other. `drawHudExit` draws the HUD once per death into a store-sized canvas (setting
the width clears it; it was written when the headless canvas had no `clearRect`, which it
learned for the burn) and composites it. It
draws through a view of the game, `Object.create(game, {...})`, whose `score`, `combo` and
`climbWarning` are overridden from `Game.hudHeld`, the copy `die()` takes BEFORE the live
chain is banked, so the score does not jump and the meter does not vanish as it goes.
`climbWarning` is a getter, which is why the view overrides it with a property descriptor:
assigning to a getter-only property throws in a module.

`game.climbWarning` is read by the HUD and decided by the simulation. `Game.step` latches
it in `climbOn`, and only while PLAYING: it comes up when `danger` is under 0.3 and the
floor is more than `CLIMB_READ` away at the rate the gap is closing (`floorETA()`), and it
stays up until `danger` is back to `CLIMB_CLEAR`. The getter only reports the latch while
the run is live and the rise armed, so drawing never changes it and a frame drawn twice
reads the same. Why it is latched rather than tested per frame is in
[GAMEPLAY.md](GAMEPLAY.md).

The HUD's skin switches on the zone's ARRIVAL -- the frame `game.theme` changes, under the
arrival flash, the banner and the burst -- not across the backdrop's twelve-floor
crossfade: text crossfaded between two skins would be two keylines at once, a smear, for
twelve floors. Everything else the zone change touches is in
[TOWER.md](TOWER.md).

## Why it is smooth at 4K/160 Hz

Five things, in the order they bite: there are two resolutions and only one is the
simulation; the backing store upscales by whole numbers where it matters; the inner zoom
only ever rests on whole world scales; the simulation runs at a fixed rate the renderer
interpolates; and drawing, never simulation, is throttled when nobody is looking.

### Two resolutions, and only one of them is the simulation

This trips people, so it is first.

| | |
|---|---|
| `VW` x `VH` | **480 x 270 world units.** The physics, the reachability proof, the generator, the bot's tuning and the nine hundred towers searched for the demo seeds all speak in these. Nothing here may move. |
| `PX` | **4.** Screen pixels per world unit. It was 1, then 2; see Tuning knobs for why it is no longer free to move. |
| `SW` x `SH` | **1920 x 1080 backing store.** What is actually drawn. |

The game reads as 16-bit rather than 8-bit because of `PX`, not because of a resolution
number: 480x270 is already bigger than a SNES (256x224) or a Mega Drive (320x224). What
says 8-bit is how few pixels there are on each THING. The character was 16x28 pixels; he is
now drawn in a 252x212 cell occupying 63x53 world units -- one art pixel to one
backing-store pixel -- and stands 177 art pixels (about 44 units) tall in `idle0`. What he
collides with is a separate 16x22 box (`PLAYER_W` x `PLAYER_H`), so the drawing can change
size without a single jump changing. Why he was made nearly twice the clear gap between
floors, and what that does to the ledge above him, is in [DUKE.md](DUKE.md).

Every world-space draw is unchanged by `PX`: it is folded into the world transform. Every
SCREEN-space draw needs it explicitly, and the one that was missed
(`setTransform(1, 0, 0, 1, sx, sy)`, the only one carrying arguments) put the speed
streaks, the floaters, the companion bubbles and the danger band at half size in the
top-left quarter of the screen.

### The upscale: whole numbers where it matters

The page scales the backing store with `image-rendering: pixelated`: by a whole number
whenever that still uses 85% of the screen, fractionally otherwise. That is the `SCALING`
option's AUTO; INTEGER and FILL force one or the other. 1920x1080 is exactly half of
3840x2160, so at 4K every drawn pixel is a clean 2x2 block: no resampling, no shimmer
while scrolling, and the GPU does the upscale as a single composite. 1080p is a clean 1x.
So 1920x1080 still upscales by whole numbers where it matters -- 2x to 3840x2160, 1x to
1920x1080 -- and the integer-blit property that makes 4K cheap survives.

### It has to fill a screen it was not built on

The backing store is 1920x1080 and the canvas is shown at some multiple of it. That
multiple used to always be a WHOLE number, which is pixel-exact at 4K and 1080p and
wasteful to the point of broken anywhere else. Measured while the store was still
960x540 (PX=2), when 4K was 4x and 1080p 2x:

| Screen | Available | Integer took | Of the display |
|---|---|---|---|
| 3840x2160 | 4.00x | 4x | 100% |
| 2560x1440 | 2.67x | 2x | **56%** |
| 1600x900 | 1.67x | 1x | **36%** |
| 1366x768 | 1.42x | 1x | **49%** |
| 3440x1440 | 2.67x | 2x | **42%** |

At today's 1920x1080 the same rule is no kinder: 4K is 2x and 1080p 1x, 1440p and
3440x1440 still get 1x (56% and 42%), and 1600x900 and 1366x768 are now below 1:1
altogether, so every mode gives them a fractional scale.

`scaleFor(w, h, mode)` in `renderer.js` is the whole decision, pulled out of `fit()` so
it can be tested. **AUTO** -- the default now -- takes the whole multiple when it is
within `CRISP_ENOUGH` (0.85) of what the screen could give, and a fractional fill when
it is not. 4K, 1080p and 2560x1080 stay pixel-exact; 1440p, 900p, 768p, 720p and the
ultrawides use the whole display. INTEGER and FILL remain as forced modes.

Two things worth knowing:

- Below 1:1 -- a 640x360 window, which the shell permits, and at today's store a 900p
  or 768p display too -- the old code did
  `Math.max(1, Math.floor(raw))` and returned 1, which drew a full-size canvas into a
  640x360 window and **cropped the play area off the edges**. It returns the fractional
  scale there now.
- The settings key moved to `settings.v2` for one reason: a saved blob still
  saying `integer` was the old DEFAULT rather than a choice, and leaving it would have
  meant the fix reached new players and nobody else. The migration runs once and only
  rewrites that one field, so a deliberate INTEGER survives.

**A screen wider than 16:9 gets wings, not bars** (`wingsFor`, `setWings`, `drawWings` in
`renderer.js`; 2026-09-29, the user's Pixel 10: "the game doesnt actually seem to go fully full
screen"). A phone held sideways is about 20:9, and the 16:9 frame stood in the middle of it with
a black band either side. The canvas is now as wide as the screen's shape asks: `wingsFor(w, h)`
view units a side -- (w/h x 270 - 480) / 2, rounded up so the canvas reaches both edges, none at
16:9 or narrower, at most `WING_MAX` (200) -- 60 on a 20:9 phone, 83 on a 3440x1440 ultrawide.
The frame is drawn into the back buffer as ever, untouched, and `present()` puts it in the
middle of the wider canvas; `drawWings` then fills each wing with the frame's own outer
`WING_STRIP` (12) units, mirrored outward and repeated, so the walls read as thicker walls, and
the vignette's side bands (`edgeTint`) move out to the canvas's edges. Nothing in the frame
changes and the simulation never sees the wings. `tools/test-touch.mjs` J holds the widths and
the mirror, pixel for pixel.

`test-scaling.mjs` checks twelve sizes (ten real displays, the 640x360 minimum window and
an 800x600 one), that nothing is ever drawn larger than its window, that the aspect ratio
never drifts, and that a zero or NaN viewport -- which a window manager will hand you
mid-resize -- cannot produce a garbage scale. It also checks the TRANSFORM, not just the
art: the world scale `zoom x PX` must be a whole number at every arena width, and the
zoom's glide must settle exactly on it. It was fractional across 96.7% of the arena's
range and nothing caught it, because every other test asked about the art.

### The inner zoom steps in quarters, and glides

On top of the outer scale there is an inner zoom of 2.0→1.0 as the shaft opens. It steps
in quarters -- 2, 1.75, 1.5, 1.25, 1 -- so the world scale is always a whole 8, 7, 6, 5 or 4
pixels per unit, and each step admits exactly one shaft width. It used to be continuous,
on the reasoning that snapping would pop several times a run, and that left every sprite
resampled across 96.7% of the arena's range; `tools/test-scaling.mjs` exists because it
shipped. Stepping instantly was wrong the other way -- the whole view jumped 12.5%, four
times a run -- so the view now glides to each step, and the grid is uneven only for the
fraction of a second that takes. The simulation steps; only the view (`zoomView`, and
`arenaHalfView` for the walls) eases, and nothing in the simulation reads the eased
copies. The glide is the one deliberate exception to the whole-world-scale rule; see Open
items.

What a whole world scale does and does not buy: it puts every world unit on whole pixels,
and the camera translate is rounded to a whole pixel on top of it. It keeps the imported
art exact only at the two ends of the range. An art pixel is 1/`PX` of a world unit, so
at world scale `zoom x PX` it covers `zoom` backing-store pixels: a clean 2x2 block at
zoom 2, one pixel at zoom 1, and 1.75, 1.5 or 1.25 pixels at the three steps between,
which nearest-neighbour draws as an uneven mix of one- and two-pixel columns.

The backdrop is outside all of this. It is drawn first, under `setTransform(PX, 0, 0, PX,
0, 0)` in view units, before the world transform and the shake, so it neither zooms nor
shakes. Each layer is a 256-pixel tile spanning 128 view units (`SPAN` in `backdrop.js`),
so one of its art pixels is a clean 2x2 block of the backing store at every zoom, the
three in between included. It scrolls by `camY x zoomView` times its layer's rate (12,
22 and 34%), and each row of tiles lands on a whole view unit (`Math.round(y)`), so a
layer moves in steps of four backing-store pixels. Across a zone change the next zone's
sky and three layers are composited into one 1920x1080 buffer (`fadeCtx()`) and drawn
once at the blend, which climbs to 0.69 over the zone's last 12 floors (`themeBlend` in
`game.js`); the rest arrives at the boundary. That buffer turns smoothing off as the
game's canvas does: a fresh canvas smooths by default and would blur every art pixel of
the incoming zone for the whole fade -- and the headless canvas never smooths, so no shot
would show it. The side walls fade at the same blend with no buffer: both zones' walls are
opaque and cover the same rectangle, so drawing the next one over this one at the blend
IS the crossfade (`walls.js`; `test-walls` holds it within one step of rounding).

The attract run behind the title screen and the guide is shown another way
(`Renderer.zoneFade`, keyed on `game.demo`): its zone holds until the arrival and then
dissolves into the next over `DEMO_DISSOLVE` (1.2 s, eased), and its flash and shake are
not drawn. The demo draws no HUD, so its arrivals had no title to explain them, and at the
bot's pace -- ten floors or more a landing, a zone every ten seconds -- the blend jumped to
0.6 of the next zone in one landing and the arrival's white flash blinked the whole screen
under the menu (`test-menu` 5; see "The title screen blinked" below).

Each layer is painted from its own seeded stream, `layerSeed(themeIndex, layer)` in
`backdrop.js`, keyed by the layer's position in `LAYERS`. It was keyed by the length of the
layer's name, and 'far' and 'mid' are both three letters; see "Two layers painted from one
stream" below.

### A fixed 240 Hz simulation

Simulation runs at a **fixed 240 Hz** with an accumulator, and the renderer interpolates
between the last two states, so motion is smooth at any refresh rate and the physics
behaves identically at 60 Hz and 160 Hz. A watchdog falls back to a timer if
`requestAnimationFrame` never fires (some embedded webviews).

Each frame, in order: `onFrame(dt)` -- the gamepad's poll, so input that has to be asked
for rather than delivered as an event is on the Input before this frame's steps read it --
then as many 240 Hz steps as the accumulator holds (at most twelve), then the draw, if the
governor allows one (below).

The camera is the exception to interpolation in play: `camY` is drawn as the last step left
it. In the fall that showed as judder -- at 160 Hz against 240 the frames alternate one and
two steps, so at terminal velocity the world moved 19, then 38, then 19 device pixels a
frame against a Duke who is interpolated -- so in FALLING the renderer interpolates it too
(`cameraY`, from the `pcamY` the fall's step keeps), eased in over `FALL_CAM_BLEND` from the
catch so switching it on moves nothing at once.

### The simulation is free

Measured headlessly by `tools/test-perf.mjs`, which runs the real game loop (20 s of play,
re-taken at af26c27 on 2026-09-28 on this machine):

| | |
|---|---|
| simulation, game alone | 0.15 ms per **second** of play |
| simulation, game + attract bot | 2.52 ms per second of play |
| a frame at 160 Hz | 6.25 ms |
| …of which simulation costs, in a run | **0.001 ms** |
| …on the menu (the real game, the demo and its bot) | 0.017 ms |

That is with the attract bot running 27 forward simulations per frame -- 130,000
integrations a second -- to decide where to put its feet; the bot is most of the menu's
figure (2.37 of its 2.67 ms a second). The first figures here, from 2026-09-19 (909dc1c),
were 0.10 and 1.02; since then the companions, who run inside `game.step`, fly his physics
forward to his landing to choose a hop (1e39576, d0940db), and the combo trail's emitter
(`Particles.comboTrail`, up to 600 pieces a second on HIGH) runs in the step too. The same
run's headless RENDER figures -- 57 ms a frame for the world, 53 for world and HUD, lower
because the callouts' warm-up falls in the first measurement -- are an upper bound from a
canvas that rasterises in JavaScript; read them as ratios between parts, never as browser
frame times. The draw count once written beside the simulation figures -- 460 `fillRect`
and 266 `drawImage` a frame -- was taken at `PX` 2, before the Duke was imported art
(859afe7) and before the drawn platform tiles and the three-layer backdrop; it describes
no frame the game draws today.

### What the ledge furniture costs a frame

The things that stand on, hang under or float over a ledge -- trees, bones, webs, the
light shaft -- are drawn inside `Renderer.drawPlatforms`, each ledge's right after its own
tiles and in the same flipped world transform, so all of them are over the speed streaks
and under the rising floor, the HUD, the companions and the Duke. Each element is a
SPRITE at art resolution: painted once into a canvas the size of its box (or cut from the
artist's PNG), cached by zone,
element, variant and frame, and drawn with ONE `drawImage` on the art grid -- one art
pixel per backing pixel at zoom 1, a 2x2 block at zoom 2, resampled at the three steps
between exactly as the tile under it is. The only other drawing call is a `fillRect` for
an element that declares a contact `shadow` into the lit lip (only the crypt's standing
pieces do). A ledge under `DECOR_MIN_W` carries
nothing; on the rest, the first draw of a stream seeded from the ledge's floor number
decides by the zone's `CHANCE`, and the rest of that stream is the zone's `scene()`, so a
ledge always carries the same things and nothing reshuffles as it scrolls.

It used to be twelve painter functions drawing rectangles in world units every frame,
four times chunkier than the art round them, a dozen canvas calls a furnished ledge on
average and about fifty in the crypt. Building the sprites is the expensive part and is
kept out of the frames that matter: `Backdrop.warm` calls `warmDecor` for the NEXT zone
in the frame after its last background layer, so the first ledge of a new zone draws
from the cache. The zone a run starts in is not warmed; its sprites are built the first
time each is drawn. `test-decor` prints every zone's build time, headless. An artist's
PNG is requested at startup (`preloadDecor`), and only if `decorart.js` lists it -- a
request for a missing file is a 404, which fails the desktop smoke test -- and the
element is painted until the PNG has loaded, then rebuilt from it.

### What the drawn layers cost a frame, and when they are built

The walls, the start floor, the rising floor and the speed streaks were world- or
view-unit rectangles drawn every frame, four times chunkier than the art round them, the
trail was square specks in the zone's colour, and the HUD, the callouts, the menus and the
scoreboard were flat bars and plain font text, the same in every zone, their "one pixel"
edges four backing pixels wide. Each is art at one art pixel per backing pixel now, and
each follows the furniture's rule: paint once into a canvas, blit it, and never paint in a
frame that matters. The ones whose painting is heavy are painted AHEAD, a piece a frame
or, for the scoreboard, a slice of a frame under a deadline (see Painting ahead in slices).

| Layer | A frame draws | Built |
|---|---|---|
| Side walls, `walls.js` | two or three `drawImage` a wall: at most 6 a frame for both, 12 in a zone fade (`test-walls` fails over either; it was about fifty `fillRect`) | A zone's strip the first time it is asked for, so the first zone's is built on the first frame that draws it. The NEXT zone's once the current one has been on screen 150 frames (`WARM_AFTER` in `walls.js`), after the backdrop's own warm-up, so the two never land on one frame. `test-walls` prints each zone's build and fails one over 25 ms |
| Start floor, `ground.js` | one `drawImage` and one `fillRect` for the deep colour below it | Once, at the Renderer's construction (`warmGround`): about 50 ms headless when it landed (b394a67), which the first frame of a run must not pay |
| Rising floor, `risefloor.js` | one `drawImage` per strip on screen: the flames, the crest's pulse, the hot top of the crust, the deep crust (one per 256 art rows of it showing, so more when more of it is in view) and, in the death, the underside -- three to five in the frames measured when it landed (8f9b50a) | Once for the whole game, ten pieces, one a frame by `warmRise()` while the rise is not yet armed -- he is on floor 0, or the menu's demo is; `riseArt()` builds what is missing if it is drawn first. About 41 ms cold over the ten, headless (8f9b50a) |
| Speed streaks, `streaks.js` | one `drawImage` per line, at its own size or an exact double, never resampled -- one line per `STREAK_BUDGET` unit at full intensity, 110 on HIGH, a line shrinking out still counted against that cap -- and four more for the edge bloom once the intensity is over 0.75 | One atlas per zone, 3-4 ms headless (946073b, 9c2c6fc). The next zone's once the current one has been on screen 240 frames (`WARM_AFTER` in `streaks.js`), after the backdrop's and the walls' warm-ups. Every zone's is KEPT once painted (18 MB for twelve): keeping only the last three let the attract run on the title screen, which shares the renderer and passes four zones in about forty seconds, evict BASEMENT, and the first frame of the player's run repainted it |
| HUD skin, `hudskin.js` (zones in `hudpaint.js`) | one `drawImage` per character, and per gauge one for the frame, one for the fill and a `fillRect` for its leading edge: 1.3 ms a frame headless against 1.7-3.7 for the flat HUD it replaced (7467006) | BASEMENT's at module load, since a run always starts there. The next zone's in slices under `SKIN_WARM_MS` a frame (0.75 ms since 2026-09-29, when the rebuilt attract bot's climb outran it at 0.5) once the current zone has been drawn 30 HUD frames (`WARM_AFTER` in `hudskin.js`; 200 until 2026-09-29), about twenty pieces, the heaviest ~1,400 canvas calls. Only BASEMENT's, the current and the next are kept, ~6 MB each. A piece still unpainted at the arrival is painted in that frame and counted (`hudSkinStats().lateBuilds`): 0 through 14 arrivals at 60 Hz and 8 at 160 Hz when it landed (025eabf); `test-hudskin` now climbs the bot to floor 2640 drawing the HUD at 60 Hz and requires it to stay 0 |
| Zone titles, `zonetitles.js` (painters in `titlepaint/`) | one to three `drawImage` once the title has settled; one per letter, or per run of letters on the same frame, during its entrance | Painted ahead a piece per HUD frame once the zone before has been drawn 170 HUD frames (`WARM_AFTER` in `zonetitles.js`): the layout, then each frame painted in one step and put on its canvas in the next, a heavy frame as a generator yielding between passes (FOREST's leaves, painted and put on the canvas as one piece, were 32 ms headless). 0 built late over twelve arrivals of a 170 s scratch bot run, the largest piece 17.5 ms headless, cold (edaf07d). Every title built is kept. `titleLateBuilds()` counts late builds; `test-zonetitles` requires none over the same climb to floor 2640, all twelve arrivals |
| Combo trail, `sparks.js` | one `drawImage` per live piece in view, in two passes (one per alpha) | One atlas for the game, on the first draw -- the first frame of the title screen. Nothing is built at import: the simulation imports the file for its tables, in tools with no DOM |
| Speed afterimage, `afterimage.js` (silhouettes by `drawGhost` in `sprites.js`) | at most four `drawImage`, one a copy, plus about 139 ns of bookkeeping over fixed rings of numbers: no allocation (3e73807) | The four silhouette atlases (two facings, a light and a dark tone) at the Renderer's construction (`warmGhosts`), 18 ms headless: the trail fades in on crossing into high momentum, a moment that must not hitch |
| The death's burn, `burn.js` | in the death only, for `BURN_T`: the ledges and the companions drawn into the burn layer instead of the frame, the masks over them as tiles (about five masks of some fifty tiles at zoom 1), and the rows it covers copied back -- see The death's burn layer | Once, at the Renderer's construction (`warmBurn`), 31 ms headless, 3.7 MB, and the store-sized layer with it: the frame the fire takes him allocates nothing |
| Callouts and floaters, `callouts.js` (painters in `calloutpaint/`) | a callout: one `drawImage` settled, one more while an `over` frame or a glint crosses it, the same again for its badge; a floater: one `drawImage` a letter | Ahead, one piece a frame, from the renderer's floater pass (`warmComboText`), which runs in every frame the renderer draws, the title screen's attract run included: the seventeen floater inks from its second frame, then the seven callouts' seventy-odd pieces, then the next two laps' badges. All of it about 120 frames after the title screen first draws (89 when it landed, 836ae0f), before anyone can start a run; the heaviest piece 15 to 21 ms headless cold, under 8 warm. A piece asked for early is built on the spot and counted (`calloutStats`); `test-callouts` holds the count at zero through a whole combo run |
| Menus, `menuskin.js` | a quiet title-screen frame is 13 blits -- the lower plaque, its records and nine key hints, drawn once into a composite of its own (`mCompose`) -- where the old screen made 484 canvas calls; a line of small text one `drawImage` a character | The main menu's pieces when the module loads; every other screen's one piece per title-screen frame after that (`warmMenu`), so opening OPTIONS or STATISTICS paints nothing. A piece asked for first is painted on the spot and counted (`menuStats().late`): the records' composite, once, on the first title frame after a new best, since it holds the save file's numbers |
| Scoreboard and the fall's words, `gameoverskin.js` | one `drawImage` a panel, one per word of GAME OVER, one a character (the menus' lettering, `menuskin.js`), one for a lettered word (SPLAT, OOF, SPACE TO CLIMB AGAIN and its glow); a word fading in is composed once into a layer and drawn as one picture | A board's title and panels AHEAD, in slices under a deadline (`warmBoards`, below): `BOARD_WARM_MS` (0.5 ms) a frame in a run on the zone he is in and then the next, `BOARD_IDLE_MS` (2 ms) on the menus on the zone after BASEMENT, and nothing in the fall or on the board. BASEMENT's whole at load, since every run starts there and any death can fall back on it. About 4.6 MB a board (7 while each board painted thirteen glyph atlases of its own); kept: BASEMENT's, the zone's, the next's and the last one finished. The lettering, the same for every zone and with the herald's and the calls' inks, once at load (`warmBoardLettering`, about 60 ms headless), every canvas brought up as it is painted |

The ledge shadow (see "A physics thickness used as a drawn one") draws each ledge a second
time, from three small canvases per zone. They are not warmed ahead: a zone's are built on
the first frame that draws its ledges, which at a zone change is the frame of the change.
The warm-ups that are ahead are staggered on purpose -- the backdrop's layers one a frame
from frame 120 and then its furniture, the walls at 150, the zone title a piece a frame
from 170 (5 to 15 pieces), the HUD skin in slices from 30 (about twenty pieces; from 200
until 2026-09-29, when the backdrop and the walls had moved to the load and the ascended
climb had begun to outrun it), the streaks at 240 -- so no one frame paints two things for
the next zone. The title and the
skin count HUD frames, which in play is every frame; on the menus no HUD is drawn, so
neither warms behind the title screen's attract run. Two warm-ups run beside that
schedule rather than in it: the callouts', finished on the title screen before a run
starts, and the scoreboard's, which is not a piece a frame but a slice of time a frame,
every frame of a run.

### Painting ahead in slices

A warm-up that paints a PIECE a frame is only as smooth as its biggest piece, and a piece is
whatever a painter does between two of its steps. For the scoreboard that was a panel or a
word of its title: 60 to 100 ms of painting per zone in Chromium, painted a piece a frame
while he FELL, up to 22-46 ms a piece at 160 Hz where a frame is 6.25 ms -- dropped frames in
the one stretch of the game the player only watches, and SPACE in the fall's first frames
left the rest to the board's first frame, a 100 ms stall. A step boundary that falls
wherever the painter happens to have one is not a budget.

So a painter that may run under a budget is a GENERATOR that asks `overdue()` as it goes --
after each row of a pass over the pixels, each glyph of an atlas, each blit of a keyline --
and yields when it is true (`slices.js`). `runUntil(gen, until)` sets the deadline, resumes
the painter and hands the frame back the moment the deadline has passed, so a frame spends
its budget and at most one row's work more. Painters are composed with `yield*`: the board's
`paintBoard` yields through `paintFrameSteps`, which runs the zone's `frame()` dressing from
`hudpaint.js` through `yield* steps(spec.frame(P, geo))` -- every zone's `frame()` is a
generator, and `steps()` takes a painter's result whether it is a generator or a finished
value -- and through the keyline and ink atlases (`keylineAtlasSteps`, `inkAtlasSteps`) and
the title kit's `layoutSteps`, `toPixSteps`, `dropShadowSteps`, `haloSteps` and the rest
(`titlepaint/util.js`).

Nothing changes for anything that runs the same painters WITHOUT a deadline -- the HUD
skin's own warm-up, the zone titles, the callouts, the tools. `overdue()` is false while no
deadline is set, so those painters never yield anywhere they did not before, and their plain
entry points (`drain()`, `paintFrame`, `keylineAtlas`, `inkAtlas`) paint what they painted,
pixel for pixel (354 pictures and twelve boards compared when it landed, b1d0dd4).

The budgets are in `constants.js`: `BOARD_WARM_MS` 0.5 ms a frame in a run (8% of a 160 Hz
frame), `BOARD_IDLE_MS` 2 ms on the menus, which draw at 60 Hz, each stopped
`BOARD_SLICE_MS` (0.2 ms) short, because a painter only stops at its next check and so every
busy frame ends one slice PAST its deadline (the row "A budget overrun by one slice"). In a
run a board takes 190 to 450 frames in Chromium, one to three seconds at 160 Hz; a zone is
100 or 200 floors, so only a zone passed through in a few seconds is left unfinished, and a
death there wears the last finished board rather than painting in the fall
(`boardStats().fallbacks` counts them). `tools/test-boardwarm.mjs` stages 192 deaths in
every zone and requires no clock read, slice, finished piece or canvas made in any FALLING
or DEAD frame, and p99 of a frame's warm-up inside the budget.

### Drawing is governed

**The attract demo is stepped only while it is on screen** (2026-09-29): the title and the
guide draw it, the options, the statistics, the help and the replays' list are opaque, and it
used to climb on behind them unseen -- "make sure the bot restarts everytime from the very start
whenever we enter the main menu so he doesnt keep going when we dont see him". `update` in
`main.js` steps it on those two screens alone and starts its tower again from the first floor
(`restartDemo`) in the step it comes back into view, from any of the others or from a run; on
the title it goes on. **And idle on the title** for `ATTRACT_IDLE` (10 s, `screens.js`) -- no key,
button or click, and not while the quit's question is up -- the wash and the menu fade out over
`ATTRACT_FADE` (drawn at `1 - k` alpha, then not at all) and the demo is the whole screen, a
prompt flashing over it (`drawAttractPrompt`, the one thing on the title that flashes: the user
asked for it); any key or click brings the menu back and does nothing else, so a SPACE that
wakes it does not start a run, and starts the count again. `tools/test-attract.mjs` holds both.

The title screen and the guide sit over a *live* attract-mode game,
and it was being drawn at the full display rate indefinitely -- and kept going with the
window in the background, because the blur handler only ever paused an actual run. The
loop now caps the **draw** rate and never the simulation (capping physics would change it,
and a capped menu would run the bot in slow motion). `applyRenderCap()` in `main.js`
decides:

| | |
|---|---|
| in a run, focused | uncapped, or the `FRAME CAP` setting (60 on a phone until chosen otherwise: `Settings.phoneDefaults`) |
| on a menu, focused | 60 -- skips **63%** of draws on a 160 Hz panel |
| window not focused, on a menu | 5 -- skips **97%** |
| window not focused, mid-run or mid-fall | 10 -- unless the pad is playing (below) |
| window not focused, a run or fall played on the pad | as in a run: uncapped, or `FRAME CAP` |
| tab hidden | 4 |

**A cap that is a whole number of display frames is paced by whole display frames**
(`Loop._due`, 2026-09-29): 60 on a phone's 120 Hz panel draws every second frame exactly, so
every drawn frame is on screen as long as the last. The averaging below drew it one, two or
three frames apart as the callbacks jittered -- a steady judder, the user's Pixel 10's
"steadily choppy". The display's interval (`Loop.vsync`) is the median of the last 15 frames'
intervals, so a late frame, a stall or a start moves it not at all, and a panel that drops to
60 Hz to save power is followed within eight frames; `tools/test-loop.mjs` holds both. Any
other cap carries its remainder from frame to frame rather than resetting; see "A render
cap that reset to zero" below for why that matters. A window without the keyboard still
reads the pad -- a click on another monitor, on itch.io's page round the frame -- so a run
resumed there with Start is being played, and at 10 fps it was a slide show; the pad's
exception keys on `input.lastDevice` (the row "A pad-resumed run at 10 fps").

### LOW LATENCY: the hint, on a new canvas

The screen's 2D context is made without Chromium's `desynchronized` hint (`screenContext` in
`renderer.js`; why, and what the offscreen rig measured, is its comment and 9c478d3). The
OPTIONS row **LOW LATENCY** (default ON since 2026-09-28, the user's "no input lag"; the
offscreen rig's missed vsyncs did not survive a visible window) puts it back: up to one frame
less between a key and the screen, if the path honours it. A context's options are fixed when
it is made -- a second `getContext` hands back the first context, options ignored -- so the row
takes effect AT ONCE on a new canvas: `Renderer.setLowLatency` makes one with the old one's
size, id and focus, makes its context with the hint or without, and puts it where the old one
stood; `main.js` reads `renderer.ctx` and `renderer.canvas` each time it draws or focuses, and
every other surface the game paints is a canvas of its own, so nothing else holds the old one.
At boot the page's own canvas is made with the saved setting (`new Renderer(canvas, {
lowLatency })`), so no canvas is thrown away there. `tools/test-feel.mjs` records the options
every context is made with.

**Never in Android's WebView** (`lowLatencyWorks`, 2026-09-29): the Android build's WebView
never puts a desynchronized canvas on the screen. On the emulator the page booted, ran at 52 fps
and drew every frame into the canvas while the screen stayed black; with the hint off the same
frame showed at once. The WebView names itself with `; wv)` in its user agent (Chrome for
Android, which the hint was made for, does not), and there the renderer makes the screen's
context without the hint whatever the setting says. `tools/test-touch.mjs` H boots the page as
the WebView.

**With the hint, every frame goes through a back buffer** (`Renderer.backBuffer`, `present`;
2026-09-29). A desynchronized canvas can reach the screen before its frame is finished, and the
title screen draws the attract run, then the wash, then the menu: a frame caught between shows
the run bright and bare, the whole menu blinking out -- the user's "the ui in the mainenu still
glitches out sometimes visually it starts to stutter and flickers". Everything is drawn into
the back buffer (`renderer.ctx`) and `main.js`'s `renderFrame` ends with `renderer.present()`,
one blit onto the screen's canvas (`renderer.screenCtx`); without the hint `ctx` is the screen's
own and `present` does nothing. The blit costs about 0.5 ms of a frame (the title screen's median
frame 1.33 ms against 0.81 without, in the offscreen rig). The same report had two more causes,
both measured: the title screen painted every other screen's plaques and the callouts' letters a
whole piece a frame for its first 2.3 s after launch (frames of 5 to 28 ms, now painted at load:
the title screen comes up 0.45 s later and its first seconds have one frame over 5 ms instead of
sixty), and a window in view but without the focus drew the menus at 5 fps (now 30,
`applyRenderCap`). After the first seconds, five minutes of the title screen -- 49 zone changes,
both ascensions -- had no frame over 5 ms and every interval exactly one vsync.

**Measured in a VISIBLE window on this machine** (2026-09-28: Electron 44 from `node_modules`,
the game served from the worktree, shown inactive and on top, muted, a 160 Hz 3840x2160 panel
reported by Electron, the attract bot's brain playing a run and then the fire taking him; two
off/on pairs, an empty full-screen-fill page first; the scratch rig is described in the
`chromium-frame-timing` skill):

| window | page | hint off | hint on |
|---|---|---|---|
| 1920x1080 | empty | 0 of 539 frames over 1.5x the median (7.34 ms) | 0 of 540 |
| 1920x1080 | play / fall | 0 of 1,064 + 1,048 / 0 of 464 + 468 | 0 of 1,052 + 1,041 / 0 of 465 + 446 |
| 3840x2160 | empty | 63 of 576 two vsyncs long (median 6.25 ms) | 65 of 578 |
| 3840x2160 | play / fall | 128 of 1,151, 126 of 1,153 / 56 of 501, 55 of 500 | 127 of 1,152, 127 of 1,152 / 55 of 502, 55 of 495 |

The hint was honoured (`getContextAttributes().desynchronized` true) and changed nothing in
the pacing, in either window or state. The offscreen rig's "one frame in nine missed with the
hint, none without" did not happen here: the window the size of the panel misses one vsync in
nine with the hint OR without, an empty page too (a mean of 144 fps on a 160 Hz vsync, which is
what a 144 fps cap somewhere on the path would do -- not found), and the smaller window free-ran
at about 133 fps without locking to the panel at all. So the pattern is the window's
presentation path on this machine, not the game and not the hint. NOT measured: the latency
itself, key to photons, which is the hint's whole point (it needs a camera or a photodiode),
and the packaged app in true fullscreen (the rules of this round forbid running it). The game's
own tick was 0.3-0.5 ms (p50) and under 2 ms (p99) a frame in every session.

## Input: keys, a pad and a phone's touch

The simulation reads ONE surface, `Input` (`src/core/input.js`): `axis` (-1, 0 or 1),
`jumpHeld`, and `consumeJump()`, which empties the jump buffer (`JUMP_BUFFER`, 0.12 s) that
a press refills. `Player.step` calls it only where a jump can be taken -- on the ground, in
coyote time, or with an air jump to spend -- so a press made in the air with nothing to spend
waits in the buffer for the landing ([GAMEPLAY.md](GAMEPLAY.md) *The jump*), and
`Game.newRun` drops one still waiting from the last run (`dropStaleJump`). Keys land
there from the keydown and keyup listeners; the attract bot's `AutoInput` and a replay's
`ReplayInput` offer the same three; and the gamepad writes into the keyboard's own Input
rather than beside it.

`src/core/gamepad.js` polls `navigator.getGamepads()` once a frame from the Loop's `onFrame`,
before that frame's steps, since the Gamepad API has no button events. The driving pad's
D-pad and left stick hold `'PadLeft'` / `'PadRight'` and A presses `'PadA'` through
`Input.padDown` / `padUp` -- the keydown handler's own work -- so `axis`, `jumpHeld` and the
buffer come out exactly as keys leave them, and whatever reads the Input, a replay's
recorder included, cannot tell the two apart. The stick is digital, as the keys are, with
hysteresis: it engages past `STICK_ENGAGE` (0.5 of full deflection) and lets go under
`STICK_RELEASE` (0.3). The jump is an EDGE, one refill per press; a held direction is
written every frame, so a blur that emptied the Input's `down` set does not strand it.

In the menus the pad hands key CODES to main.js's `onKey`, the function the keydown listener
runs, so the menus are written once: D-pad and stick flicks as the arrows (a held direction
repeats after `REPEAT_DELAY` 0.4 s, then every `REPEAT_RATE` 0.1 s, at most once a frame), A
as Space, B as Escape, Back as O; Start is Escape in a run and Enter outside one (Escape on
the title quits), Y is S (the stats), X is H (the help) or, from the pause, Q. In a run only
Start gets through. Button numbers are the W3C standard mapping, which Chromium reports for
every common pad and Steam Input presents on a Steam Deck.

With several pads the last one touched drives, and the one it takes over from lets go of what
it held. A touch is a press, or the stick engaging or turning -- but not one the driving pad
is making at the same moment, because one controller can reach the page as two pads (the
row "One controller, two pads"). Unplugging the driving pad mid-run pauses, as losing focus
does (`onLost`). `input.lastDevice` says 'keys' or 'pad', whichever was touched last, for
the screens and the render cap; nothing in the simulation reads it. `tools/test-gamepad.mjs`
drives a fake `getGamepads` and boots the real `main.js` in node (`tools/fakepage.mjs`).

**A phone plays on on-screen keys** (`src/ui/touch.js`, 2026-09-29, for the Android build):
made when the address has `?touch` (the Android app loads it so) or the device's only pointer
is coarse, never on a desktop. Each button is a KEY -- a keydown and keyup dispatched on the
window, as a keyboard's -- so Input, `onKey` and a replay's recorder cannot tell a thumb from a
key, and nothing above knows touch exists. Each screen has the fixed keys its own keys are for
(`touchKeys` in `main.js`): a run and the guide < > SPACE ESC -- < and > held, a thumb sliding
from one to the other and keeping the one it had when it drifts off both, SPACE held as long as
the finger is down, so HOLD TO CHAIN works; the options and a replay add ^ and v, which repeat
outside a run as a held key does (the pad's `REPEAT_DELAY` and `REPEAT_RATE`); the pause, the
fall and the scoreboard SPACE and ESC; the title none (the user: "up and down arrows appear on
the main menu when they do nothing there"). Along the top, the keys the last frame drew as
KEYCAPS: `menuskin.js` `watchCaps` collects every legend `mCap` draws while `main.js`'s
`renderFrame` watches (a composite's caps each time it is blitted, none while one is built or
painted ahead), so the pause offers S Q and the scoreboard S R G -- what a screen offers is what
its hints say, with no list of every screen's keys to go stale. A key stays `STRIP_HOLD`
(0.25 s) after its hint goes, so a fading hint does not blink its button.

**TOUCH KEYS** (OPTIONS, only on a phone and first there; 60-130%, 80% by default: the user's
"the left / right / space buttons should be smaller and adjustable") sizes the play keys, as far
as the width has room for them side by side; ESC and the top row keep the first cut's size.
The phone's options drop LOW LATENCY where the WebView cannot use it (`Settings.optionsFor`).

**The title draws its own buttons on a phone** (`screens.js`, `drawMenu`'s `touch`): TAP TO
CLIMB where PRESS SPACE TO CLIMB stands, and OPTIONS STATS REPLAYS HELP where the key hints
were, on the same plaque -- "can we rebuild a nice menu screen for the mobile version". They are
TARGETS, not keys: `menuTargets()` gives their rectangles in view units, `Renderer.toView` turns
a finger's CSS pixels into view units (the canvas centred at its CSS size, the wings off its
left), and a finger that lands on one and LIFTS on it presses its key -- one that slides off
first presses nothing -- while `pressedCode` lights it in the frame. Not while the attract view
is up: that tap only wakes the title. The help says TAP TO GO BACK, and the whole page is its
target.

Every button is laid out in CSS pixels from the viewport alone (`touchLayout`), and the same
numbers place the elements and hit-test the fingers. The page runs under the camera's cut-out,
and a key stands clear of the HOLE only when it is beside one: the Android app says where the
holes are (`gameShell.cutouts()` at the start, an `app:cutouts` event when the phone turns
over). The page's safe-area insets, all a browser says, are a band down the whole side -- a
punch hole's is the status bar's height -- and pushed off it ESC stood over the HUD's floor
counter and < > ^ v over the options' words; a browser still keeps to the band. The Android
app's background and foreground arrive as
`app:background` / `app:foreground` events: a run pauses and the sound goes with the app.
`tools/test-touch.mjs` boots the real `main.js` with `?touch`.

## A page inside someone else's page

itch.io serves the web build (`npm run web`, [BUILD.md](BUILD.md)) from a subpath of its own
domain, inside an iframe. Three things that just work in a tab or the desktop shell fail
quietly there, and `src/core/embed.js` has the page say so, through two banners that are
HTML over the canvas in `index.html` (the screens draw nothing about the page they are in):

- **Keyboard focus** lands on itch's page, so the first Space scrolls it and the game looks
  dead. `#focus-hint` says to click the game while the document lacks focus (not in the
  shell, and not for a player on a pad, who needs none); the click lands on the canvas and
  `main.js`'s `grabFocus` gives it the keyboard. The Input also takes ArrowDown, which only
  the menus use, or the options cursor scrolled itch's page.
- **Storage** can be refused outright in a third-party frame, the property access itself
  throwing. `stats.js` and `settings.js` already carried on with defaults; `#saves-off` now
  says SAVES ARE OFF on every screen but a climb and its fall (`storageWorks()` probes it
  once).
- **Fullscreen** needs the parent's permission; without it `requestFullscreen` rejects a
  promise on every press of F. `fullscreenAllowed()` says whether to ask at all.

`watchEmbed` keeps the banners true on focus, blur and twice a second. The shell
(`window.gameShell`) has none of these problems and shows neither banner.

## The replay engine

`src/game/replay.js` and the three modules beside it are the ENGINE under the four replay
features the user asked for: an instant replay of the run just lost, the best runs from the
menu, a ghost of the best run to race, and a replay to share. **The replay screens are not
merged yet** -- nothing in `main.js` calls the engine; they are coming next. The API they
will call is the comment at the top of `replay.js`, and nothing else there is meant to be
called from outside.

**What a replay is**: the run's seed and the input the SIMULATION saw at every 240 Hz step --
the axis, whether jump was held, whether a jump press reached it -- recorded AT the Input
surface `Game.step` reads, so keys, the bot and the pad record alike, and only changes are
stored. A press is recorded where the simulation TAKES it (the step whose `consumeJump()`
returned true), not when the key went down: recording the arrival would bake the keyboard's
buffer into the player, and the bot's presses, which it holds until taken, would replay
through a buffer they never had. Whatever else changes the simulation from outside the step
is recorded between two steps as it happens: a resume zeroing the idle clock, the
COMPANIONS option (their movement decides which floors they peek at), the PARTICLES option
(the pool the cosmetic stream feeds), steps taken on a menu mid-run, and floors generated
from outside the step -- the bot looks ahead with `Tower.peek` between steps, at the
shaft's width OF THAT MOMENT, and the same floors generated later, wider, are different
floors (the first bot replays desynced on exactly that, some 1,500 steps in). All of it is
written in one fixed grammar per step (`Recorder.interlude`), which the decoder holds a
file to.

**The run's JUMP SPEED is in the header** (`header.jumpSpeed`; see [GAMEPLAY.md](GAMEPLAY.md)),
a simulation setting like the seed: `Playback.restart` runs `newRun(seed, course, jumpSpeed)`. In the
file it rides in bits 1-7 of the flags byte as 5% steps over 100% (`speedCode` in
`replaycodec.js`), so no file changed shape: a 100% run writes the byte it always wrote, every
replay kept before the setting reads as 100%, a build from before it refuses a faster replay
(it refused any flag but the demo's) rather than play it at 100%, and a speed this build does
not offer is refused with a sentence. The store keeps each replay's `speed` for the REPLAYS
list's SPEED column. **PLATFORMS is in the header the same way** (`header.platforms`), in bits
2-7 of the companions byte, whose bits 0-1 are the companions' movement (`platformsCode`,
the nearest signed 5% step over 1: -5 the old SMALL, -2 NORMAL 0.875, 0 the old MEDIUM, 4 WIDE
1.175, 7 the old WIDE; read back by looking the width up in `PLATFORMS_KNOWN`, never computed,
so the two between steps read back as themselves): a run at 1 writes the byte it always did,
every replay kept before reads as 1, and a build from before refuses any other file as damaged
rather than play it on the wrong ledges. A race's course carries its ghost's
width in the upper bits of its generator byte, so the tower goes on past the course's top at
the ghost's width (`CourseTower`), and a course from before reads as MEDIUM. **And the
DIFFICULTY** rides in bits 5-7 of the flags byte, the speed narrowed to bits 1-4 (to 175%): an
index into `constants.js DIFFICULTIES` (0 EASY, the fire before it; so every file kept before
reads as EASY, and a build from before reads the bits as a speed it lacks and refuses).

**Two cosmetic streams, and the simulation's own.** No `Math.random`, `performance.now` or
`Date.now` is reached by the step any more. The simulation's randomness is the tower's `Rng`
and the death's `rngFloat`, both from the seed; what the step throws that nothing simulated
reads -- particles, the shake, the fall's debris, the companions' bob -- draws from
`game.fx`, and the herald's lines from `game.lineRng`, both seeded from the run's seed
through `mix32` in `newRun`. So a replay throws the same sparks and says the same lines as
the run, and a cosmetic change (more dust, another death line) cannot desync it. A playback
may use the viewer's PARTICLES setting instead of the recorded one: the climb is the same,
the sparks are not.

**The fingerprint.** A file's header carries the seed, the settings, the date, the result and
a simulation fingerprint of three parts, all compared: `SIM_VERSION` (`constants.js`), a
number a person bumps when a CODE change alters the simulation without moving any number;
`constHash`, every number the simulation reads -- the `constants.js` numbers a module of the
step imports (`FINGERPRINT_CONSTANTS` in `replay.js`; the renderer's, the HUD's and the
screens' are listed `DRAWN_ONLY`, and the one the step hands only to the sparks
`COSMETIC_ONLY`), the companions', reach proof's, combo's and zones' tables, `COYOTE`, the
arena's widths and the combo tiers (a constant nobody classified is IN: refusing an old
replay for a number that did not matter costs less than playing one that desyncs, and
`test-replay` 4a then fails until it is decided); and `probeHash`, the real code run -- the
generator's first 1,800 floors at two arena widths and on a flow tower, and ten simulated
seconds of a frozen scripted climber,
hashed every step. A build whose fingerprint differs REFUSES the replay rather than playing
something else; its ghost still races. A checksum of the state every `REPLAY_CHECK_EVERY`
steps (once a simulated second) names the first second that disagrees when the fingerprint
missed something. The probe stays below the squeeze, where the generator calls `Math.cos`;
that and `Math.hypot` in the death's pieces are the only transcendental calls in the step.
V8 computes them the same everywhere; Safari's engine may not, and a replay crossing between
the two past floor 2100 would show as a desync that only the checksums can see.

**Seeking.** Playback re-simulates. Simulating from floor 0 to the last ten seconds of a
ten-minute run is 0.45 s headless, so the playback keeps a copy of the whole game every
`REPLAY_KEYFRAME_EVERY` steps (10 s; about 80 KB each, mostly the particle pool), and a seek
restores the nearest and simulates at most ten seconds forward. The recorder keeps
`REPLAY_LIVE_KEYFRAMES` (3) copies of the LIVE game, so a seek into the last 20 s of the run
just played starts within about 20 ms. (The instant replay itself opens at the run's first
step: it opened ten seconds before the catch until the user asked for the beginning,
2026-09-28.) A seek takes a budget in ms and says whether it
got there; the UI must always pass one, since an imported file's length is whatever its
author made it. The copies are `snapshot.js`'s: a generic deep copy of the object graph from
the Game down rather than a method per class, because the simulation is spread over a dozen
classes other work changes all the time, and a hand-written snapshot that missed one new
field would restore a game that is almost the same. Its rules: functions are never copied (a
UI hook on a Game is replaced by the class's own method where there is one, and any other
function in the state throws); the modules' constant tables are shared, not copied; the
input is left out; identity inside the state is kept.

**The ghost.** A ghost track -- the Duke every `REPLAY_GHOST_EVERY` steps (30 Hz), quantised
to 1/`REPLAY_GHOST_Q` of a unit, his pose by NAME -- lets a ghost race without a second
simulation (`ghostAt`), and survives a build change that the input does not: a pose this
build no longer draws falls back to its family, or to a fall. Race it against the
recorder's `time`, not `game.elapsed`, which slow motion stretches.

**The race's tower.** A race is run on the ghost run's OWN tower, not on its seed: the seed
is not the tower, because each floor is laid out in the shaft as it stands when the floor is
generated, and the shaft opens with the player's climb (openness from floors, combo and
momentum, stepped to a whole zoom and ratcheted). A racer who climbed differently got ledges
of other places and widths from about floor 25 to 75, where the shaft opens -- 12 to 156
floors of a race, measured -- and the ghost stood on ledges his tower did not have. So when
this build plays the replay, `race.js`'s `CourseSurvey` re-simulates it headlessly (a
`Playback` with its copies off and no particles, ~0.7 M steps a second: ~40 ms for a 90 s run,
~0.2 s for ten minutes) and keeps every floor its run generated -- place, width, kind -- with the
arena step each was laid out in (logged by the tower itself as it generates: within a step a
floor may be generated before the arena update or after it), the arena's steps against the
ghost's best floor, and the generator's state at the end. That is a COURSE (`course.js`),
frozen, and `snapshot.js` shares frozen objects rather than copying them, so the ten-second
copies of a game do not each carry ~10,000 floors. `Game.newRun(seed, course, speed)` builds a
`CourseTower`, which serves floor n as the ghost's up to the course's top and from there
generates from the ghost's generator state, in the racer's shaft. The shaft is the WIDER of
the racer's own and the ghost's -- at least the arena the ghost had when it generated the
highest floor served (so no served ledge is outside the walls) and when it first stood as high
as the racer's best floor -- applied at the arena update and again right after the look ahead
above the view serves floors (`widenForCourse`), ratcheted as ever. Not the ghost's alone:
the racer's openness is how the game pays his momentum, and a racer faster than the ghost
would climb in the box a slower run left. "When it first stood as high" is exact: the survey
keeps each step's threshold as the best floor it came in at if it came in on the step that
floor was reached, and the floor above if it came later (`CourseSurvey.take`), since the
ghost first stood there in the old arena. Kept as the best floor alone, every race opened each
step one floor early -- three steps before the ghost did, on 777 -- and a racer who climbed
exactly as the ghost parted from it; the old tower happened to hide it on the seeds the test
used, the tower's new patterns (2026-09-28) did not (`test-racetower` 4, mutant
`reach-at-best`). Normal runs never build a course, and seeded bot runs
are byte for byte what they were (`test-racetower` 1: hashes taken at 2d5c882, before the
race, and re-taken only when the score or the tower changed on purpose). The survey runs a slice a
frame on `REPLAY_SEEK_BUDGET` after the key (`ui/replays.js` `runPrep`), and the race starts
in the frame after the last slice. A replay this build cannot play -- another build's
fingerprint, or one whose survey found it does not play back as recorded -- is GHOST ONLY:
raced on its seed, the readout saying LEDGES MAY DIFFER. A race's own replay is format 2: it
carries the course (about four bytes a floor) and the ghost's track, so it plays back, the
ghost drawn beside it, with the raced replay deleted or refused by the build as another's;
the decoder holds a course to what the generator promises of any tower (every floor
reachable, inside its arena's shaft, no more floors than the play that laid it out could have
generated: `REPLAY_COURSE_RATE`, `REPLAY_COURSE_FLAT` and what its ghost's file may generate from
outside, `courseCap` over the course's own `steps`). A race on a race's replay surveys that
race's tower: the floors its run generated and the rest of its course above them -- so a
course's `steps` is the longer of that race's run and its own course's, not the ghost's run
alone: bounded by the ghost's run, the race on the replay of a race that ended early on a long
ghost wrote a file of more tower than its 8 s could make, and the store refused to keep it.
After its run the ghost stands on its last floor for the rest of the race; on its own tower
its feet go on that ledge (`Race` takes the course), since the 30 Hz track often never caught it
standing there and a sample from the air beside it stood it on nothing (4 of 16 runs).

**The race's question** (2026-09-29; the user: "make sure it lists all the options that replay
used and ask if you want to use the same options so it would match"). G on the scoreboard and
R on the REPLAYS screen no longer start the survey: `ReplayUI.raceId` puts up the question
(`this.ask`), a modal over the board or the list (`replayskin.js` `drawRaceAsk`), and every key
goes to `askKey` until it is answered -- M and F still mute and go full screen. Its rows are
`replays.js` `raceOptions`: each option in `RACE_OPTIONS` that changes how a run plays, the
header's value beside the player's, in the words the OPTIONS rows show, SAME or DIFFERS by
those words (a header from before an option existed reads as what every run had then). Y, Enter
or Space answer `match = true`, N `false`, ESC and Backspace go back; on a pad A is Space, B is
Escape and X is N -- on the scoreboard too, where no replay screen is up, so main.js's pad
routes to `padCode` while `replays.asking`. The answer rides on the race object through the
survey (`prep.match`) and the guide (`tutRace`) to `startRun`: `true` is the header's JUMP SPEED,
DIFFICULTY and GRAVITY, `false` the player's, and PLATFORMS are the ghost's either way (a CourseTower
goes by its course, and GHOST ONLY is laid out at the header's width). A race started without
the question (`match` unset: `tools/test-feel.mjs` 7) is as races were before it: the player's
JUMP SPEED, the ghost's DIFFICULTY and GRAVITY. The player's saved settings are never touched.

**The file and the store.** `replaycodec.js`: `DVR1:` and a binary in standard base64 on one
line, the same text pasted into a chat or saved as a `.dvreplay` file. Everything read from
outside is untrusted: a text over `REPLAY_MAX_TEXT` is refused unread, and the decoder never
evals, bounds every length by the bytes actually present before allocating, checks a CRC-32
before parsing, holds each step to the grammar and the whole file to totals of menu steps and
generated floors, and refuses rather than throws -- 925 fuzzed, truncated and hostile files
all refused cleanly in under a millisecond when it landed. `replaystore.js` keeps the last
run, the `REPLAY_BEST_KEPT` (10) best by score and whatever is pinned, within
`REPLAY_STORE_BUDGET` characters (1.5 M; a minute of human play is about 9 k, a ten-minute
bot run 125 k), in localStorage behind a four-method backend a shell can swap for files. It
never loses the best run to a quota error, and decodes what it is about to keep before it
keeps it.

`tools/test-replay.mjs` (about 22 s) holds all of it against the real simulation: the
original and the playback run side by side and compared value by value at every step to the
last step of the fall; a human-like session through the real Input, the options screen
mid-run included; the fingerprint against patched copies of `src/`; the cosmetic streams
with `Math.random`, `performance.now` and `Date.now` made to throw; the store's quota cases;
the instant replay of a game wearing main.js's hooks. `--mutants` runs every deliberately
broken build, and each must fail. What it asks of anyone changing the simulation is the last
invariant below.

## The invariants that matter

The first of them -- every floor is reachable from the one below it -- is the
climbability guarantee and has its own write-up in [TOWER.md](TOWER.md). These are the
ones the moving walls and the camera depend on:

**The shaft only ever opens.** Platforms committed inside a narrow arena must stay legal.

**Pruning is against the rising floor, never the camera.** The camera descends now; if
you prune below it, a falling player drops through deleted floors. `pruneMisses` fails
the suite if it ever happens again.

The first pass of `tools/test-sim.mjs` asserts the invariants the moving walls depend on:
the shaft never narrows, the player is never outside it, no platform is ever outside it,
and no floor is ever pruned while it can still be landed on.

Two more hold the picture together, and both are asserted rather than trusted: one art
pixel is exactly one backing-store pixel at zoom 1 (`SPR_W == BODY_W * PX`, in
`test-sprites.mjs`; see "The invariant lived in a comment" below -- and for the ledge
furniture, a test sprite whose every art pixel is a distinct colour, drawn through
`drawScene` with the camera between pixels and checked pixel by pixel at zoom 1 and 2 in
`test-decor.mjs`), and
the world scale `zoom x PX` is whole at every arena step (`test-scaling.mjs`).

Where the picture meets a ledge is asserted too. The Duke's boots, not his lowest pixel,
are on the walking surface in every pose he stands in (`FOOT_DROP` from `bootDrop`,
checked against boot rows read by eye and on screen at every rest zoom, in
`test-sprites.mjs`; see [DUKE.md](DUKE.md)), and so are the companions' (`COMP_BOOT_ROW`
in `compsprites.js`, rows read by eye, in `test-companions.mjs`; see
[COMPANIONS.md](COMPANIONS.md)). And `PLAT_THICK` is the ledge's thickness
to the PHYSICS only: what hangs under a ledge hangs from the underside its tile DRAWS
(`undersideFor` in `decor.js`), which in the crypt is 20 art pixels down (16 on the old cut), not 28
(`test-decor.mjs`; the row "A physics thickness used as a drawn one" below).

And two that nothing asserts but everything assumes:

**World y points up.** The world transform flips it (`setTransform(k, 0, 0, -k, ...)`),
so a larger `y` is higher up the tower, and `camY` is the bottom of the view.

**Anything that moves keeps its previous-step position.** The renderer draws the player,
the death pieces and the companions at `px + (x - px) * alpha` (and the same for `py`),
so code that moves one outside the normal step -- a respawn, a snap, a teleport -- must
set `px`/`py` as well, or for a frame it is drawn part-way between where it was and where
it went. It is also why a pause has to force the alpha; see "A pause that kept moving"
below.

**Game code never reads a canvas's pixels.** The headless canvas (`tools/headless.mjs`)
keeps its pixels in a `data` array on the canvas itself; a browser's canvas has no such
field, and nothing in `src/` calls `getImageData`. So what a painting holds -- where its ink
is, its rightmost painted column, which rows are letter -- is measured off the `Pix` it was
painted from, while the build still has it. The callouts' prestige badge read `F.c.data`:
in a browser it threw in the renderer every frame it was up, while every suite, all run on
the headless canvas, passed (the row "A badge that only drew headless").
`test-callouts` now makes `data` throw for anyone but the headless canvas's own code.

**The simulation is deterministic, and stays so only by these rules.** A replay is the seed
and the input, and it plays back as the run only while the step computes the same numbers
from them. For anyone adding to the simulation:

- No `Math.random`, `performance.now` or `Date.now` anywhere `Game.step` reaches. Simulated
  randomness comes from the seed (the tower's `Rng`, the death's `rngFloat`); cosmetic
  randomness from `game.fx`, lines from `game.lineRng`. A clock inside the step is a clock
  a replay cannot reproduce. `test-replay` 6 makes all three throw while it steps.
- New state is reset in `newRun`. One Game plays many runs -- the demo's, the player's --
  and a replay plays on a fresh one; `test-replay` compares the two value by value. The
  death's `fallPace`, carried over from the last fall, was the first field it found
  different (the row "A death carried into the next run").
- Random state lives in a field, never a closure (`Rng`, not `mulberry32`), and nothing in
  the state is a function but the UI's hooks: `snapshot.js` copies the game to seek, cannot
  copy a closure's state, and throws on one.
- A number the step reads lives where the fingerprint hashes it (`constants.js` or one of
  the tables `replay.js` lists), and a code change that alters the simulation without
  moving a number bumps `SIM_VERSION`. The probe catches most such changes, not all.
- A `constants.js` number only the renderer, the HUD or a screen reads is listed in
  `replay.js` `DRAWN_ONLY`, or tweaking it refuses every saved replay. `test-replay` 4a reads
  the imports of every module `game.js` reaches and fails on a number in the wrong list or
  in none. The cosmetic stream's modules (`particles.js`, `sparks.js`) are not walked. A
  DRAWING module the step reaches counts only for the numbers 4a's
  `STEP_READS_FROM_RENDER` names it giving the step (`sprites.js`: the splat's cut and `PX`;
  `compsprites.js`: `PX`); a new number one of them imports for its drawing fails 4a until
  it is named there or listed `DRAWN_ONLY`.
- Anything that generates floors from outside the step (`Tower.peek` generates what it is
  asked for) is part of the input, and the recorder must see it. That holds for a race's
  `CourseTower`, which serves what it is asked for: a floor served between steps can widen
  the race's shaft, so it is recorded as any look ahead is.
- A seed is a tower only for the same climb: the shaft a floor is laid out in is the
  player's. Anything that needs another run's tower (a race) takes the tower, not the seed.
- Keep new arithmetic in the step to `+ - * /`, `sqrt`, `floor` and `round`, which every
  engine computes to the same bit; the squeeze's `Math.cos` and the death's `Math.hypot`
  are the only exceptions.

The demo's invariants (it can die, and runs until it does) are in [BOT.md](BOT.md); the
companions' (ledge to ledge, speed caps, pose against motion, in view, never under the
rising floor) in [COMPANIONS.md](COMPANIONS.md).

## Open items

- **Not re-measured in a browser since `PX` went to 4.** The frame costs quoted in earlier
  versions of the README (4.45 ms worst case) were taken at the old 480x270 backing store
  and no longer apply. The simulation figures above are exact for the code they were
  taken on (see "The simulation is free"), but the browser's own draw cost at 1920x1080
  has not been measured, only bounded.
- **The zoom glide resamples.** At rest the world scale `zoom x PX` is a whole 8, 7, 6,
  5 or 4; in the moment it eases between two steps it is not, and every sprite is
  resampled. The one place the world grid is bent, on purpose -- see the two zoom rows
  in the table below.
- **The imported art is off its grid at three of the five rest zooms.** At 1.75, 1.5
  and 1.25 an art pixel is that many backing-store pixels (see "The inner zoom steps in
  quarters" above), so the Duke and his afterimage, the companions, the platform tiles and
  their furniture, the walls, the start floor, the rising floor and the combo trail are
  drawn with uneven pixel columns there, glide or no glide. The speed streaks, the HUD's
  skin, the zone titles, the callouts and their badge, the floaters, the menus and the
  scoreboard are not: they are in screen space, the streaks drawn at their own size or an
  exact double and the rest at 1/`PX` from a whole backing pixel, one art pixel to one
  backing-store pixel at every zoom. The header of `renderer.js` says so
  since 6e9fa80 (naming only the Duke, the companions and the tiles); the "zoom had no
  transition" row below still says no sprite is resampled at rest, which is true of the
  world grid, not of art drawn at `PX` pixels per world unit.
- **A race's own rules are outside the fingerprint's probe.** The probe runs normal towers
  and a normal climber, so a later change to `CourseTower` or the race's shaft rule would not
  refuse a race's replay recorded before it; its checksums would name the second it went
  wrong. Bump `SIM_VERSION` for such a change, or give the probe a short race.
- **G waits for the survey.** Racing a ten-minute run spends ~0.2 s surveying it (~35
  frames of 6 ms), a two-hour one some seconds before the race starts; the board and the list stay up meanwhile, the list
  saying PREPARING THE RACE. The best run's course could be surveyed ahead, on the board's
  idle frames, if that wait is ever felt.

## Tuning knobs

Mostly in `src/game/constants.js`; the ones that live beside their code say where. Each
component's knobs are in its own doc: feel, difficulty, arena, walls, death and slow
motion in [GAMEPLAY.md](GAMEPLAY.md); zones and the squeeze in [TOWER.md](TOWER.md); the
demo and the bot in [BOT.md](BOT.md); companions in [COMPANIONS.md](COMPANIONS.md); audio
in [AUDIO.md](AUDIO.md). The ones that belong here:

- Zoom: `ARENA_STEPS` at the top of `game.js` -- 2, 1.75, 1.5, 1.25, 1, which at PX 4
  are world scales of 8 down to 4. A new step must keep `zoom x PX` whole, and
  `test-scaling` fails if it does not. `ZOOM_EASE`/`ZOOM_SNAP` (in `constants.js`) shape
  the glide between.
- Resolution: `PX`. 4 is shipped (1920x1080). It was a free knob while the art was
  computed -- 1 gave the old 8-bit look at 480x270 -- and is not one now: every imported
  sheet (the Duke, the companions, the platform tiles, the shield) was cut for PX=4, and
  the ledge furniture, the walls, the two floors and the trail's sprites are painted in
  art pixels at the same scale; each takes
  its world size from its pixel size over `PX`, so changing it resizes every sprite in
  the world, and `test-platstyles` fails on the platform body. The background tiles
  keep their size -- 128 view units each -- but one of their art pixels is `PX / 2`
  backing-store pixels, whole only at an even `PX`.
- Painting ahead: `BOARD_WARM_MS` (0.5 ms a frame in a run), `BOARD_IDLE_MS` (2 ms on the
  menus) and `BOARD_SLICE_MS` (0.2 ms kept back for the slice that ends past the deadline),
  in `constants.js`. `test-boardwarm` holds a frame's p99 to the budget itself. The piece-
  a-frame warm-ups' `WARM_AFTER` frame counts are at the top of `backdrop.js` (120),
  `walls.js` (150), `zonetitles.js` (170), `hudskin.js` (30, with its own budget
  `SKIN_WARM_MS`, 0.75 ms) and `streaks.js` (240).
- Replays: `SIM_VERSION` (bump it for a code change that alters the simulation without
  moving a number) and the `REPLAY_` numbers, which shape the file and the store and never
  the play, in `constants.js`. The ones a file depends on are written into its header, so
  changing one never breaks a replay already saved; none is part of the fingerprint. Nor is
  any number listed `DRAWN_ONLY` or `COSMETIC_ONLY` in `replay.js`; every other one is.
  `REPLAY_COURSE_RATE` (0.25 floors a step) and `REPLAY_COURSE_FLAT` (200 floors), with the
  ENSURE allowance (`replaycodec.js` `courseCap`), bound how much tower a race's file may claim
  for the play that laid it out.
- The pad: `STICK_ENGAGE` 0.5 and `STICK_RELEASE` 0.3 (fractions of full deflection; a worn
  stick rests at 0.05-0.2), `REPEAT_DELAY` 0.4 s and `REPEAT_RATE` 0.1 s, at the top of
  `gamepad.js`.

## Where the bodies are buried

Things in the engine, the loop and the renderer's transform that took real debugging. Do
not re-discover them. The rest of the list is split across the component docs; see
STATUS.md.

| | |
|---|---|
| **`Particles.spawn` was O(n)** | Quadratic on a full pool; wedged the page. Round-robin only. |
| **The trail lapped the bursts' ring** | The combo trail took free slots in the one ring every burst shares, probing from the SHARED round-robin cursor and leaving it where each piece went. At full stream that drove the cursor round the ring two to eight times faster than the rest of the game did, and every landing's dust, spawned plainly from that cursor, came round onto a milestone's confetti still in the air -- over a 60 s attract run 22 cut short on MEDIUM where there had been none, 102 on LOW against 74. A cursor of its own walking the same ring traded that for two faults: the landings' dust popped a fifth of the trail's pieces mid-fall on LOW, and when every probe met a live burst the cursor stood still, so the trail went dark behind a milestone's seventy confetti at the moment it changes palette. The pool is now one set of arrays in two regions: the ring, moving exactly as before the trail existed, and after it the trail's own slots, 1.5 times its cap so round-robin only reuses a piece that has died (`TWINKLE_ROOM`). Nothing in either touches the other; `test-sparks` checks both ways, and the stall case fails on the ring-walking emitter. |
| **A stepped wall inside a gliding view** | The zoom glides; `arenaHalf` steps, because it is gameplay. Drawing the walls at the stepped value made the whole zoom-out read as a jolt even after the zoom itself was smooth. `arenaHalfView` is the eased copy, and nothing in the simulation reads it. The start floor met the same thing from the other side: floor 0 steps to the new width at once, the walls glide out to it, and the ground, drawn after them across the ledge's full width, painted flags and rubble over both walls to the screen's edges for about a second -- whenever a player runs along the start floor to build speed. `drawGround` stops at the half-width the walls are drawn at. |
| **The zoom glide froze mid-transition** | It eased inside the arena update, which only runs while PLAYING, so a glide interrupted by a death stayed put. The whole death then rendered at a world scale of 7.03, every pixel resampled, for as long as the body lay there -- and that, not the anchor, was why he still looked wrong on the floor after the anchor was fixed. |
| **The zoom had no transition at all** | `zoom` steps between whole world scales so sprites are never resampled -- and stepped INSTANTLY, snapping the whole view by 12.5% four times a run. The renderer now eases to the step and snaps within a hundredth of a pixel: fractional on 1.8% of frames instead of 0%, against a visible jump on the frames that matter. |
| **A pause that kept moving** | `game.step()` returns immediately when paused, but `p.x` and `p.px` stop APART, and the render alpha is the live accumulator -- so it sweeps 0..1 forever between two frozen positions and the player vibrates behind the pause panel. `Renderer.draw` forces alpha 1 and dt 0 itself; leaving it to the caller is a bug nobody can see in a screenshot. |
| **A crossfade that happened behind a wall** | Over a zone's last 12 floors only the SKY faded toward the next zone, under the current zone's layers at full opacity. That worked while the layers were 50% and 80% washes; the repainted zones made FAR opaque or nearly so, so the fade was painted and then covered and the whole background snapped at the boundary (floor 1099 showed none of STORM). Fading the next zone's layers in one by one at the blend is not the fix either: its sky shows through its own opaque FAR, and the current zone drops out faster than the blend says. It is composited into one buffer and drawn once (see "The inner zoom steps in quarters"). Two more came out with it. "Next" was `themeIndex + 1`, which past floor 2300, where every cycle is reshuffled, named the wrong zone at 35 of the 48 boundaries up to 9200 -- a fade into one zone and a snap to another -- so `game.nextTheme` asks the schedule now. And the next zone was painted on the fade's first frame, up to 35 ms for NEBULA headless, so it is warmed one layer a frame (14 ms at worst) once the current zone has been drawn 120 times (`WARM_AFTER`). |
| **A render cap that reset to zero** | Quantises to whole display frames: a 60 cap on a 160 Hz panel drew every third frame, which is 53 fps. Subtract the interval instead and let the remainder carry. |
| **The stutter that looked like text** | Reported as "a stutter when we have text like PHYSICS HAS LEFT". The text was a co-symptom, not the cause -- twice over. (a) Text is drawn from a per-colour atlas and one is built on FIRST use of a colour: a canvas allocation plus the whole character set rasterised, inside a frame. `drawTextOutline` draws in two colours, and a theme boundary brings a new accent AND a new text colour, so crossing one could build several. Warmed at load now, and `test-font.mjs` fails if anything is built mid-game. (b) A 17-floor combo set `slowmo = 0.2` and `dt *= 0.35` -- an abrupt three-times change in the rate of time, un-ramped at both ends -- and pushed the white taunt banner in the same block. On a 160 Hz display an instant discontinuity in time does not read as drama, it reads as a dropped frame. Eased over ~80 ms, and 0.55 rather than 0.35 -- which is where `SLOWMO_SCALE` and `SLOWMO_EASE` come from ([GAMEPLAY.md](GAMEPLAY.md)). |
| **Four files describing a resolution the game left behind** | `renderer.js`, `index.html`, `play.bat` and `constants.js`'s own header all explained that the backing store is 480x270 and upscales 8x at 4K. That stopped being true the day `PX` became 2 -- 960x540 and 4x -- and `constants.js` contradicted itself, since the PX block twenty lines below said so correctly. `constants.js` and the header of `renderer.js` were brought into line and survived `PX` becoming 4 (1920x1080, 2x at 4K). `play.bat`, the `settings.js` header and the `fit()` comment inside `renderer.js` had explained it again in their own words, and went on saying 960x540 -- the same failure, one `PX` later. The `settings.js` header and `play.bat`'s buffer line were corrected in f09ee6d. The rest -- the `fit()` comment and the `CRISP_ENOUGH` table in `renderer.js`, `index.html`'s 4x4 blocks, `play.bat`'s "from 8 to 7" and the `hud.js` header's "480x270 buffer" -- went on being wrong until 6e9fa80, when a docs pass listed every stale comment and one agent corrected them all at once. |
| **The invariant lived in a comment** | One atlas pixel has to be exactly one backing-store pixel or every frame is resampled on the way to the screen, which mushes precisely the detail the pixels were spent on. That requires `SPR_W == BODY_W * PX` and `SPR_H == BODY_H * PX`, and nothing checked it -- so a plausible-looking pairing such as a 40x64 atlas at 16x28 world would have shipped looking soft with a green suite. Asserted now. |
| **A physics thickness used as a drawn one** | Hanging furniture was placed with its top row `PLAT_THICK x PX` = 28 art pixels under the walking surface in every zone, which is right only where the tile is solid all the way down. The crypt's stone then ended 16 pixels under the surface (the painted crypt stone ends at 20), so its manacle hung 12 pixels below the stone from nothing, in every frame -- found by the verifier of the crypt's redraw, who could not fix it from the zone's own file. `undersideFor` measures each zone's drawn underside once from the tile art (per column of the repeating tile, the solid run down from the surface; the median, so a drip or a notch does not move it), and the box laps `HANG_LAP`, one row, over it so a ragged edge leaves no slit of sky. `PLAT_THICK` describes what the Duke collides with; where the drawing ends is a question for the drawing. The shadow under every ledge had the same fault: one 30% black bar at `PLAT_THICK` under the surface, shifted 2 units right, so it floated loose as a second dark beam under DOWNTOWN's (then VILLAGE's) gallery posts and hung below DUNGEON's stone, STORM's cloud and ABYSS's spine, and stuck 8 px past every ledge's right end. It is cast from the tile art now -- per column, the transparent pixels just under what the tile draws, fading down -- cut with the same source rects as the tiles, so it ends where the ledge does; DOWNTOWN casts none, at the user's request. |
| **Two layers painted from one stream** | `backdrop.js` seeded a layer's random stream from the LENGTH of its name, and 'far' and 'mid' are both three letters, so FAR and MID of all twelve zones drew the same numbers: two painters drawing the same kind of thing in the same order put it in the same places (25 of STARFIELD MID's 119 star pixels on the very pixel a FAR star was on, where chance gives 0.42). ABYSS, NEBULA and STORM had re-seeded every layer from a private salt, and STARFIELD its FAR, to dodge it; those dodges are gone. `layerSeed()` keys by the layer's position -- which cannot collide at all, where a hash only makes a collision unlikely -- with an offset that left MID and NEAR byte for byte as they were, and `test-backgrounds` calls the same function rather than keeping the formula twice. A change of seed re-rolls a painter's constants too: COSMOS's haze cut, moved from a raw noise value to a quantile, grew a blue cloud field the zone was never drawn with until its shares were re-derived. |
| **An effect drawn over what it frames** | The speed streaks were drawn last, over everything: at a wall bounce their white glints crossed the Duke's face, chest and shield, and gathered at the screen's sides -- which is what stopped them reading as rain -- they sat exactly on the HUD's columns too. They went in under the HUD and the characters. When the player asked for them across the middle again and in colours that stand out (946073b), over the ledges was the next thing wrong: every line a notch through the lit row he tracks, and in the dim-ledged zones brighter than that row. They go in behind the ledges now, and no streak pixel is brighter than the zone's own ledges. The combo trail is the same rule taken further: it goes in FIRST, so no amount of it can cover the Duke or a ledge's lit top rows. Decide what an effect may cover before tuning how much of it there is. |
| **The title screen blinked** | Reported as "the menu screen sometimes visually glitches ... when the bot is about to enter a new area my whole menu starts blinking". Filmed headless as `main.js` draws the menu (the demo, the wash, the menu), 60 frames a second through eleven of the demo's zone changes: one white flash each, the whole frame's mean luma +20 to +24 in one frame and back over 0.2 s, 28 in five minutes and nothing else -- the demo fires no callouts and its combos no flash. In play the same flash lands with the zone's title and reads as arrival; behind the menu there is no HUD, so no title, and it read as the screen glitching. Half a second before it the backdrop had jumped to 0.6 of the next zone in one landing, the blend being a function of the floor and the bot climbing ten or more a landing. The demo now dissolves after the arrival and draws neither flash nor shake (the crossfade section above). When a feedback effect is drawn somewhere its explanation is not, ask what it says there. |
| **A cache the title screen emptied** | The streaks kept the atlases of the last three zones painted, to save memory. One renderer serves the title screen's attract run and the game; the attract bot is flat out and passes four zones in about forty seconds, which evicted BASEMENT, and the first frame of the player's run repainted it (4.0 ms headless) -- a frame the warm-ups exist to keep empty. Every zone's atlas is kept now, 18 MB for twelve, as the walls' strips and the backdrop's layers are. Before bounding a cache, ask what else draws through the same renderer. |
| **A gauge that passed for a ledge** | The HUD's skin first framed the speed bar and the combo meter in each zone's own ledge materials with the ledges' one-pixel outline, and was only ever looked at full. Near empty, or with a ledge of the same material passing behind it, the bar read as one more ledge: STORM's a strip of cream cloud among the cloud ledges, ZENITH's a gold bar under a gold ledge, DOWNTOWN's and NEBULA's running on into the gallery and the crystal beside them. Each frame now sits on a dark plate, the same keyline every word of the HUD sits on (`PLATE` in `hudskin.js`), which no ledge has. Judge a HUD element empty and with the world moving behind it, not only full over a quiet backdrop. |
| **A badge that only drew headless** | The callouts' prestige badge placed itself by reading the word's frames off their canvases, `F.c.data`, at its first showing. Only the headless canvas keeps its pixels in a `data` array; a browser's canvas has none. In Chromium, with a real Game staged into the second lap, SWIFT x2 fired and `renderer.draw` threw a TypeError in all 192 frames it was up: no badge, and the vignette and flash after it skipped every frame -- while every suite passed, because every suite runs on the headless canvas. What the placement needs is measured off the `Pix` while the build still has it (`extentOf` in `callouts.js`), and `test-callouts` makes `data` throw for any reader but the headless canvas's own code (4246569). A field the headless canvas has and a browser's does not is a test-only API; game code reads the painting's source, never the canvas. |
| **A death carried into the next run** | The fall's new fields -- `fallPace`, the speed the streaks keep rising at while they are retired, and the fall camera's step -- were set in `die()` and never reset by `newRun`, so a Game that had died before began its next run carrying the last fall's pace, and the camera's speed was left `undefined`, which a snapshot copy does not keep as a field. Nothing on screen showed it. The replay suite did, the moment the burn merged: it plays a run on a fresh Game beside the same run on a used one, and `fallPace` was the first value that differed. `newRun` resets the death's own state now, with a comment saying why. Anything a run sets belongs in `newRun`, not only in the method that first sets it. |
| **The roll turned about the cell's centre** | The tuck, a somersault in quarter turns, turned about the middle of its 63 x 53-unit cell -- sized for a sword arm and a shield -- while the ball of him sits in the bottom of it, 12.4 units lower. Every quarter turn swung the ball round a circle 25 units across: 17.5 units at each turn, 14 times a second, and on the half turn 25 units over his feet. It read as the Duke jittering about the screen, and anything laid on him -- the speed halo, then the afterimage's copies from before a turn -- showed the hop as a second ball beside him ("broken when he rolls"). The suite had passed it: its bar was that the copies overlap him at all. The tuck now turns about the middle of the ball's own ink box, rounded down to the art-pixel grid, per facing (`SPIN_PIVOT` in `sprites.js`, 1976f4a): 0.18 units from turn to turn. The death's tumble, whose pose fills its cell, still turns about the cell's centre. Rotating a cell turns its drawing about the cell's centre; if the drawing is not centred in it, pick the pivot. |
| **One controller, two pads** | Steam Input can show one PlayStation pad as a virtual Xbox pad beside the real one, and a browser that reads both sees two pads, whose copies of a press need not land in the same poll. Under "the last pad touched drives", the late copy took the driving across: the handover let go of the jump, cutting every jump to a hop in mid-air, and the copy refilled the jump buffer and pressed the menu key a second time. A press, a stick push or a menu direction that the driving pad is making at the same moment is not a touch now, and a handover keeps a jump both pads hold and carries on a direction's repeat (f7097ea; three duplicate-pad schedules in `test-gamepad`). A held button past the standard seventeen (a DualSense's touchpad) had the same shape: counted every frame it was held, it took `lastDevice` back from the keyboard each frame; only its press counts. |
| **A pad-resumed run at 10 fps** | The render cap drew an unfocused window at 10 fps in a run, on the reasoning that nobody is playing a window without the keyboard. A pad still works there -- a click on another monitor, on itch.io's page round the frame -- so a run resumed with Start was played as a slide show. A run or fall played on the pad (`input.lastDevice === 'pad'`) is drawn at the full rate now. Anything keyed on window focus assumed the keyboard was the only input. |
| **A copy of the game that shadowed its own method** | The instant replay threw "this.handleEvents is not a function" on its first step in the real game. It seeks by restoring a copy of the LIVE game, and the copy dropped the UI's hooks by writing `undefined` over them -- but the wrapper round `handleEvents` that the sound wiring installs is an OWN property standing in for the class's method, and `undefined` there shadows the method. No test's game wore those hooks. A hook is replaced by the class's own method where there is one (`snapshot.js`), and `test-replay` 9 plays the instant replay of a game wearing all of them and checks no live hook fires (7831d61). |
| **A replay that saved and never loaded** | Holding an arrow key on the options screen mid-run -- key repeats change the setting every few frames -- wrote two records per change onto one step, and past sixteen on a step the decoder refused the file: the player's own run would have saved, then failed to load, and the store, trusting its encoder, would have kept it as a best it could never let go. Everything between two steps is written in one fixed grammar now (`Recorder.interlude`: the lowest particle setting before the menu steps, the steps, the lowest and the final one after), the decoder holds a file to exactly that, and a save decodes what it is about to keep. A recording that reaches two hours stops there ('cut') for the same reason: the game never writes a file it would refuse. |
| **A fingerprint blind to numbers outside `constants.js`** | The first fingerprint hashed `constants.js`, and three things that move the simulation live elsewhere: `COYOTE` in `input.js`, the arena's widths in `game.js`, and the companions' tuning -- they peek at floors inside the step, `Tower.peek` generates what it is asked for, and over four bot runs they generated 103 to 829 of the tower's floors, so a changed companion rule is a different tower. Each is hashed now, the probe runs the real generator and physics as well, and `test-replay` 4 changes each in a patched copy of `src/` and requires the replay refused. A list of constants cannot see a changed rule; run the code. |
| **A fingerprint that hashed the renderer's numbers** | The fingerprint took every number in `constants.js` but the `REPLAY_` ones and two UI timings, and the merges then brought the renderer's numbers into that file: the afterimage's `GHOST_*`, the scoreboard's painting budgets, the impact's word fade, the burn's time; with the backing store's size, 24 numbers no module of the step reads, and one (`COMBO_STEP_BURST`) it reads only to throw sparks. Tweaking any of them after release would have refused every replay a player had saved, "made by a different version", with nothing a replay plays changed. Found by reading, not by a failure: no test changed a render number and asked whether an old replay still played. The fingerprint now hashes the numbers a module of the step imports, and `test-replay` 4a reads those imports from the source, so a render number cannot go in, nor a simulation number out, without the suite saying so; 4 changes the three named and all 27 at once and plays an old replay beside this build step by step. The verifier's list had `CUT_OUTLINE_V` and `LIMB_MATCH` as render-only too: they are not -- they cut the Duke's drawing into the pieces the fall SIMULATES (`Game.burstGibs` reads their sizes), so they stay in. Read who imports a number before calling it cosmetic. The first 4a still counted every import of a module the step reaches as the step's, and the step reaches `sprites.js` for the splat's pieces: its verifier added a glint alpha imported by `sprites.js` alone, and 4a passed and fingerprinted it -- the same bug, through the module the Duke's drawing tunables go into. 4a now names what the step takes from each drawing module it reaches (`STEP_READS_FROM_RENDER`) and fails on any other import there. |
| **Floors the bot generated between steps** | The first bot replays desynced some 1,500 steps in. The attract bot looks ahead with `Tower.peek` between two steps, at the shaft's width of that moment; the same floors generated later, inside the replay's step, after the shaft had widened, were different floors. Floors generated outside the step are part of the input and recorded (`ENSURE` records). Anything that can change the simulation from outside `Game.step` has to be recorded where it happens. |
| **A seek that kept its budget 39 times over** | A budgeted seek read the clock every 128 PLAYBACK steps, and one playback step can replay a whole menu visit of 2,400 game steps: a file the decoder rightly accepts, with a visit on each of its first steps, held a 4 ms seek for 155 ms a call. The clock counts the work now, menu steps included (fd01ad0). A budget checked every N units of work only holds if a unit of work is bounded. |
| **A refused save that deleted what it made room with** | Each replay the store evicted for room went the moment it was chosen, so a run too big to fit took them one at a time and was then refused anyway: 7 of 10 replays gone for a new best that did not fit, while the store's own header promised every replay would still be there. Evicted texts are now held until the save succeeds and written back if it does not (fd01ad0). |
| **A race on the seed was not the ghost's tower** | Races were run on the replay's seed, on the promise that a seed is a tower. The replay screens' second verifier saw the ghost floating where the racer's tower had no ledge: each floor is laid out in the shaft as it stands when it is generated, and the shaft opens with the player's own climb, so a racer who opened it at other moments got other ledges -- from floor 25 to 75, 12 to 156 floors of a race, measured with a stop-start bot. The floors' heights agreed, which is why the readout, counted in heights, never showed it. A race now runs on the ghost run's own tower, surveyed from its replay (The race's tower, above), and `test-racetower` races the ghost with climbers who open the shaft differently. A seed reproduces a tower only for a player who opens the shaft exactly as the recorded one did. |
| **A race's course that put ledges in the wall** | The survey logged each floor's arena step in the moment the tower generated it. A race SERVES floors, and a floor served by the look ahead above the view, or between two steps, is served before the race's walls come up to it (`widenForCourse` follows); so the course of a race's replay said some ledges stood in a shaft narrower than themselves, and a race run on it -- a race of a race -- was saved as "not kept: it would not load back": the decoder, holding every floor to its shaft, refused it. Found by `test-replayui`'s keyboard walk, which races the best run, a race. A served floor now carries at least the arena its own course laid it out in, and `test-racetower` 8 races a race whose racer looks thirty floors ahead. The store decoding what it is about to keep is what turned this into a message instead of a best run nothing could load. |
| **Painting in the one stretch nobody plays** | The scoreboard in the zone's style was painted a piece a frame while he fell -- 1.5 ms a frame at the median in Chromium and 22 to 46 ms at worst, a panel or a word of the title, at 160 Hz where a frame is 6.25 ms -- so the fall, the one stretch of the game a player only watches, dropped frames, and SPACE in its first frames left the rest to the board's first frame, a 100 ms stall. It is painted ahead now, in slices under a deadline, while he climbs and on the menus, and never in FALLING or DEAD; a death whose zone is not finished wears the last finished board (see Painting ahead in slices; b1d0dd4). |
| **A budget overrun by one slice** | The scoreboard's warm-up stopped its painters AT the 0.5 ms deadline. A painter only stops at its next check, so every frame that painted ended one slice past the deadline: p99 0.57 ms against the 0.5 stated, and the test let it be the budget plus a whole slice. The deadline is the budget less `BOARD_SLICE_MS` now, the room for that last slice (p99 0.36 headless, 0.45 in Chromium), and the test holds p99 to the budget itself (d4a322d). A deadline you check is a deadline you overrun by one step; stop short by the longest step. |
| **A scoreboard that stood him back up** | The death's scene -- the pit, the body as it lies, its pieces and the blood -- was drawn only while FALLING, so the frame the scoreboard came up the pit floor and every piece vanished, and the Duke stood whole again in a running pose where the floor had been. The old board's 82% black wash hid it; the board drawn over a veil of the zone's own dark showed the zone behind it, and him with it. It is drawn in DEAD too (`dying()` in `renderer.js`). A state that stops drawing something only works while something else covers the gap. |
| **A companion standing on a burned ledge** | The burn gives every floor its own band of the noise, so a companion and the ledge under his feet burned on independent clocks: in the seeded bot's death at floor 420 the pilgrim stood 84% whole on a third of his ledge 0.15 s in, and read off the masks over 7,800 placements, 23% of companions stood more than half whole on a ledge under a quarter there, for about 50 ms. Each column of him now takes the mask row just under his feet, stretched up his height and multiplied with his own pattern, so no column of him outlives the ledge beneath it (`drawBurnColumns`, 9b0a326); `test-fallclear` allows 3% and finds 0. Two things drawn as one object must share one clock, whatever their own patterns do. |
| **A camera drawn from its last step in the plunge** | The renderer interpolates the Duke between steps, never the camera in play. At terminal velocity that was judder: at 160 Hz against 240 the frames alternate one and two steps, so the world moved 19, 38, 19 device pixels a frame against a smoothly drawn Duke. In the fall the camera is interpolated too (`Renderer.cameraY` from `Game.pcamY`), eased in over `FALL_CAM_BLEND` so switching it on moves nothing in the frame of the catch; interpolated, the steps are 28 or 29. |
| **Python `replace('', x)`** | Inserts between every character. Destroyed `game.js` once (29 MB). The project is under git now. |
