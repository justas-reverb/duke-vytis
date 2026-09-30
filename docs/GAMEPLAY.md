# Gameplay

How the play itself is engineered, and what was wrong with it before: the jump and its
buffer, momentum and the wall combo, the rising floor and how close it is (`danger`, CLIMB!), the seven callouts at
the tower's heights and their prestige badge, what a combo step still does, the HUD in each
zone's skin and the zone's title on arrival, the combo trail, the speed trail, the speed
effects, slow motion, and the death — what the screen does as the fire takes him, the
tower burning away, the pieces and the blood. Read this when changing how the game plays
or feels, or anything a player sees while he dies. See also
[TOWER.md](TOWER.md) (what you climb), [BOT.md](BOT.md) (the attract-mode player),
[DUKE.md](DUKE.md) (the poses, including the death), [ARCHITECTURE.md](ARCHITECTURE.md)
(loop, zoom, render) and [../README.md](../README.md) (how it plays, from the player's side).

## How close the floor is: `danger`, and CLIMB!

There is no gauge for it. A readout that said `FLOOR IN 11.3` became a FALL ROOM bar down
the right edge, and the user asked for that bar to go completely (7467006): the floor itself
is on screen whenever it is close enough to matter, and the red band across the bottom of
the screen, the vignette and CLIMB! say when it is urgent. The right edge below the score is
left empty on purpose, and the floaters that were clamped 20 units off it now run to the
3 units the score keeps. Do not bring a number back either: why the readout was wrong is
the `FLOOR IN 11.3` row in the table below.

The quantity behind all of them was broken too, and in the same way: `danger` was
normalised by *viewport height* against a lead of 340 px, so it saturated at 1 and sat
there. The FALL ROOM bar of the time never moved, the vignette almost never fired, and the
three effects reading that one number agreed with none of them. It is now a fraction of
the room the game is currently giving you — so it moves as you fall and recover, and it
tightens by itself as you climb, because the lead shrinks from 340 px to 62 px. The band
comes on under 0.3 of it and the vignette under 0.5.

That lead is `Game.riseLead(mf)`, closing linearly over the first `RISE_LEAD_FADE` floors.
Its optional `mf` asks about a best floor not reached yet: the companions fly the line
forward past his next landing with it ([COMPANIONS.md](COMPANIONS.md)), so a change to the
lead moves them too. The floor never jumps to the lead; it eases up to it at
`RISE_CATCHUP` (720 units/s), because assigning it teleported the red band up to 270 px
in a frame.

**CLIMB!** comes up only when there is time to act on it: `danger` under 0.3 AND the floor
more than `CLIMB_READ` (0.25 s) away at the rate the gap is closing -- the floor's rise plus
his own fall (`Game.floorETA`). The distance test alone fired almost only in the instant
before a death: 0.3 of the lead is 19 units once the lead has closed, a man falling into
the fire covers that in a frame or two, and in the attract bot's deaths at floors 150-1200
every such episode ended in the catch 21-33 ms later. Once up it is LATCHED: it stays until `danger` is back to
`CLIMB_CLEAR` (0.35) or the run ends, because the time test, made every frame, swung with
his own vertical speed (the row in the table below). Someone standing still low in the
tower still gets it for a second or more (1.8 s standing at floor 60); walking off a ledge
into the fire at floor 640 shows none. Where the latch lives and how the HUD reads it is
in [ARCHITECTURE.md](ARCHITECTURE.md).

What the player sees coming up is fire: a burning rim of flame tongues over a yellow-hot
crest, and under it red-hot plates cooling into dark crust (`src/render/risefloor.js`). It
used to be a thin red-and-pink checker over a flat maroon box that ENDED 80 units down, so
when it came up the screen the tower carried on under it -- the most dangerous thing on
screen, looking like a loading bar. It is the same in every zone on purpose, and red
because the danger band, the vignette and CLIMB! are red. The kill line is
the crest's top row: the flames lick about two and a half world units above it, and his
feet can be among the flame tips and he lives -- he dies at the crest (`SURFACE_ROW`). The
crest beats at `THREAT_HZ` with the danger band and CLIMB!. In play the crust reaches
the bottom of the view; once it has him it ends `RISE_DEPTH` of the view down, so the
death falls out of its underside into the shaft. What it costs a frame is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## The callouts: seven heights a lap

The game shouts seven words -- SWIFT, CHARGE, SOARING, RAMPAGE, CRUSADE, THUNDER, GLORY --
and it shouts them at the tower's heights (`src/game/milestones.js`, 1cfebb5). They stand
at k/7 of a lap of the zones, `CYCLE_FLOORS` ([TOWER.md](TOWER.md)), rounded to
`CALLOUT_ROUND` (10): **330, 660, 990, 1310, 1640, 1970**, and GLORY pinned to the lap's
top floor, **2300**, rather than rounded, because GLORY is promised at the top of ZENITH.
They are keyed to the run's best floor, which only rises, so each fires once a lap:
falling back through one never fires it again, and lap L fires the same seven
(L - 1) x 2300 floors higher. From the second lap each word carries a **prestige badge**
beside it, x2, x3 ... (`src/render/calloutpaint/badge.js`): a plaque of red enamel in a
bevelled gold frame with the lap in polished gold, for a Duke who has climbed a whole lap
and not died. Nothing in the table is a literal floor: change the zones and the callouts
move with them. A tool that writes the best floor directly (a staged start) passes the
callouts under it silently rather than firing them all on its first landing.

They used to be the COMBO's: one per multiplier step, SWIFT at 50 floors of a chain up to
GLORY at 350. A player who never held a chain past 50 heard none; one who did heard all
seven in the first few hundred floors and then nothing, however high he went. The combo
keeps everything else -- its meter, its x1.5 step every `MULT_STEP` (50) floors, its
multiplier and scoring, its coloured numbers -- and shouts no word. A step now pays out a
burst of `COMBO_STEP_BURST` (28) particles in the colours the trail turns to at that step
(`Game.comboStep`), and its sound is the hop ladder's mark on the landing that crosses it
(`sfxHop`'s `step`; `onComboStep` is left empty on purpose, see [AUDIO.md](AUDIO.md)); no
flash and no shake, which are the callout's (a flash of 0.8, a shake of 5 then 6, seventy
confetti). The step ladder is the
combo's own (`ComboTracker.nextStep`) and has no top, so past 350 floors the meter goes on
filling toward x5 at 400 and on, where it used to pin full and pulse.

**A callout and a zone title take turns** (`Game.arrive`, `showNext`). GLORY lands on the
very step the next lap's first zone arrives, and RAMPAGE ten floors past ABYSS at 1300: two
words of that size lettered at once over the top of the screen, and neither read.
Whichever arrives second waits until the first has gone -- a callout is up `CALLOUT_LIFE`
(1.6 s), fade included -- and then comes in whole; neither is ever dropped. When one landing
crosses both, the lower floor goes first: ABYSS at 1300 before RAMPAGE at 1310, and GLORY,
on the lap's top floor itself, before the next lap's first title. What waits is the text,
its shake and its burst; the zone's flash stays at the boundary, where the backdrop and the
HUD's skin change under it. Attract mode shouts none -- the title screen draws no HUD, so a
demo callout was a flash and a shake with no word behind it -- though its count advances.

Each word is lettered at art resolution by its own painter in `src/render/calloutpaint/`,
heavier, hotter and brighter from SWIFT to GLORY, banded in the colours of the trail's step
of the same name (`STEP_BANDS` in `calloutpaint/kit.js`), and painted ahead on the title
screen, so none is built in the frame it fires (62bb95e; what that costs is in the header of
`src/render/callouts.js`). The word is drawn by the HUD, under the characters; the badge by
the renderer after the Duke, the companions, their calls and the floaters
(`drawCalloutBadge`), so nothing covers it -- `BADGE_GAP` (10 art px) clear of everything
the word paints, coming in `BADGE_AFTER` (0.06 s) after the word's own entrance. Once the
fire has him the callout's clock stands still and the badge fades with the HUD's exit. The
small words that float off him -- BOUNCE, TWICE, THRICE!, CHASE and a banked chain's
+score -- are the game's font at 2 backing pixels a font pixel (3 for the big ones; they
were 4 and 8) with a keyline, coloured by the combo step they were thrown at.

It used to shout constantly, from five sources arbitrated by a rank system. Two of those
never worked: the height callouts of the time compared against an uninitialised field so
not one of the eight ever fired, and the timer that was meant to expire a callout was never
decremented, so the first one of a run stayed on screen until you died. Both are rows in
the table below (`shoutT` and `lastAnnouncedFloor`). `tools/test-milestones.mjs` holds the
heights, the laps, the turns with the titles and the meter; `tools/test-callouts.mjs` the
lettering, the badge and the warm-up.

## The score: floors, tricks and the chain's step

A floor climbed past the run's best is worth `FLOOR_POINTS` (10) as it is climbed. A chain
is banked when it ends -- by standing still, by landing without climbing, or in the fire --
and pays `CHAIN_FLOOR_POINTS` (10) for each of its floors and `TRICK_POINTS` (25) for each
trick in it (an air jump, a wall bounce, a held-jump chain), all of it times the step
multiplier the meter shows, x1.5 at 50 floors and on with no top (`chainScore` in
`src/game/combo.js`):

| chain | pays |
|---|---|
| 10 floors, no tricks, x1 | 100 |
| 125 floors, 25 tricks, x2 | 3,750 |
| 400 floors, 80 tricks, x5 | 30,000 |
| 2000 floors, 400 tricks, x21 | 630,000 |

The multiplier grows with the chain, so a chain pays as the square of its length, as the
genre's classics do, and the awards' scores read true again: SCORE KING at 25,000 is a run
with a chain of about 400 floors in it. Until 2026-09-28 a trick MULTIPLIED the chain, by
another quarter each with no top, and a chain paid as the cube of its length: hundreds of
millions for a good run, 3.8 billion for the menu's bot. Saves and replays from before are
brought onto the new scale: the stats are re-scored as they load (`stats.js rescore`), and
the replay store ranks runs from before below every new one (`SCORE_SCALE_SINCE`). Why both
were needed is in the table at the end.

## The HUD in each zone's skin, and a zone's title

The HUD shows what it always did, where it always did -- FLOOR and SCORE at the top, SPEED
and its bar, AIR JUMP READY, the held-jump CHAIN, the combo meter down the left edge with
its count riding the fill, the callout, the banner stack, CLIMB! -- and each zone draws it
in its own material (7467006, 025eabf). It used to be flat bars and plain text in the same
colours everywhere, the one thing on screen not drawn at one art pixel per backing pixel.
The speed bar and the combo meter are framed in what that zone is built of -- brick and
iron in BASEMENT, crypt stone with a grave cross in DUNGEON, bark and leaves in FOREST,
mossy stone in SWAMP, honey timber and iron with a shingled roof over the meter in
DOWNTOWN, marble and gilt in CITADEL, cloud with lightning strikes in the fill in STORM,
vertebrae and a skull in ABYSS, crystal in NEBULA, star-steel in COSMOS, jade in
STARFIELD, a gilt crown in ZENITH -- each
on a dark plate so it cannot pass for a ledge, round a dark well, filled with the zone's
light, and with a brighter hot fill where the bars used to flash white. Every word and
number stays in the game's 5x7 font, because numbers are read at speed; each glyph is
banded in one of the zone's inks inside a two-tone keyline. Three inks keep one hue in
every zone because the player has learned them: gold for the multiplier and a record,
green for a held-jump chain, and CLIMB!'s red, which is flat and on the same near-black
keyline everywhere, so the warning never reads worse than the one it replaced. The skin
changes the moment the zone arrives. Measured when it landed (025eabf, a scratch check, not
a suite): every letter's body at least 5.5:1 against its keyline and 4.99:1 against the
backdrop behind it in all twelve zones, calm, hot and near empty, where the old
drop-shadowed labels fell under 2:1 in four zones.

**The herald's lines** -- a nudge when he stands still for three seconds (THE TOWER AWAITS
THEE), a taunt when a big combo closes, the squeeze's warnings past floor 2100 -- stand in a
band of their own from row 178, under the Duke's feet, and under a zone's title when both
are up. They used to open the banner stack at row 150, which is where the camera holds his
feet: in bot play he covered them 22% of the time, and at the start of a run, waiting on
the ground, every time -- the HUD is drawn under the characters, so the line came up
behind his shield and boots. From row 170 down his drawn outline covers a centred line
0.11% of the time, and nothing from 180 (`hud.js` TEXT_TOP). They are lettered in the
menus' fine lettering (`menuskin.js` `mText`), argent for what the game gives in white and
gold for a colour, where they were the font stamped in a black outline round a flat colour
(2026-09-29); `tools/test-hudskin.mjs` section 5 measures them, and the companions' calls,
over every zone.

**Crossing into a zone** -- the flash, the shake, the burst in its colours -- puts its name
at the top of the banner stack for 2.2 s, lettered in the zone's material rather than in
the plain font (edaf07d, ac821d2): cellar brick with cobwebs, crypt stone strapped in iron
with a skull in the O, a hedge of leaves on a frame of branches, moss with reeds and bog
drips, the name spelled in lit windows (DOWNTOWN, VILLAGE until the user renamed it; its
honey planks read as a frontier town's gate), cut stone edged in gold with the citadel's arms --
the black castle on gold of its banners -- on a shield in the hollow of the D, cloud with
lightning out of its underside, bones knuckled at both ends, faceted crystal, a dot-matrix
of glowing orbs, constellations, polished gold under a sunburst. The letterforms are the
font's own, so it is still the game's alphabet, legible first. Each makes a short entrance
in its zone's manner (grows, puffs in, drops into place, rises from the bog, lights up,
cools from white-hot) and leaves in the banners' stepped fade over its last 0.35 s. Its
letters are 77 to 81 art px tall, by the stroke's width (`inkH` in `titlepaint/util.js`),
where the old ones were 56, so the rest of the stack moves down by the title's own
height. A zone with no painter would get its name as text. The painters and what they
cost are in [ARCHITECTURE.md](ARCHITECTURE.md).

## What the combo sheds: the trail

The meter marks a step; the trail shows the chain the whole time it runs. Stars and
sparks fall out of the Duke, more and brighter the longer the chain, where the old trail
followed his speed alone: a square speck in the zone's colour every 22 ms while he was
fast, so a 300-floor chain looked exactly like one quick jump. `game.js` hands
`Particles.comboTrail` the LIVE chain's floors every step, and `src/render/sparks.js`
decides the rest:

- **How much grows with the chain, not with speed.** With no chain it is still the speed
  trail, sparks in the zone's own colour while his momentum is over 0.35. A chain sheds
  from its first floor, more with every floor, to its ceiling at about 500 floors; speed
  only decides whether he sheds at all (in the air, or faster than 120 units/s along a
  ledge) and thins it while he builds momentum. The rates, with their units, are in
  `sparks.js`'s "how many, how fast" block (`SPEED_RATE`, `CHAIN_RATE`, `RATE_PER_FLOOR`,
  `RATE_MAX`).
- **What changes with each multiplier step** (`STEPS`, one row per step): its palette,
  at the same moment the meter ticks over and the step's burst goes off. The rows keep the
  names of the words the steps used to shout, SWIFT at 50 floors of a chain to GLORY at
  350 (the callouts are the tower's now, above, lettered in these same colours). The
  shapes arrive in order of size -- sparks and small twinkles from the first floors, bigger
  stars through the steps, the eight-rayed glint only from GLORY on. CRUSADE is the Lithuanian
  tricolour; past GLORY the stars stay gold and white and the sparks walk through every
  colour in the set, so the tail streams out in bands. A colour whose hue AND value match a zone's
  sky is swapped there for one that shows.
- **When the chain ends** the source stops, and what has already fallen out of him
  finishes its fall.

Three rules keep it off the play, and each is structural rather than tuned: it is drawn
BEHIND the walls, the ledges and the Duke, so it can never cover him or the lit top rows a
player tracks at speed; each piece leaves his back going backward relative to him, on top
of under one of his own velocity (`INHERIT`), so it falls behind along his path and never
runs ahead onto the ledge he is about to land on; and the particle setting caps it -- a
share of the pool (`TWINKLE_SHARE`), a lower setting thinning the stream in proportion,
none at all at a budget of zero. A piece burns out by shrinking a size at a time, with
only its last moments drawn at reduced alpha, because a pale star faded over a coloured
sky goes grey. How the pool is split so the trail cannot starve a milestone's confetti is
in [ARCHITECTURE.md](ARCHITECTURE.md); `tools/test-sparks.mjs` checks the rules and
`tools/shot-trail.mjs --combo=N` puts any chain length in front of the camera.

## What his speed sheds: the afterimage

Fast, he leaves four flat silhouettes of himself behind (`GHOST_N`), in one tone -- white
over a zone whose near backdrop is dark, black over a light one -- at alphas 0.079 down to
0.025, which overlap and stack to about 19% (the row *Alphas that look low and are not*).
It fades in with how fast he has moved along his path over the trail's span (`GHOST_FROM`
78 to `GHOST_FULL` 356 units/s) and with his momentum (0.45 to 0.65); neither switches it.
The OPTIONS row AFTERIMAGES turns it off.

**Each copy is where he was drawn, as he was drawn there.** The renderer records the state
it drew him in every frame -- position, pose, facing, squash, quarter turn -- into a ring
of `GHOST_HISTORY` (32) states (`src/render/afterimage.js`). Copy k is where he was
k x `GHOST_DT` (9 ms) ago, but never more than k x `GHOST_GAP` (2 world units) of path back,
interpolated between two recorded frames in the older frame's drawing, and drawn by
`drawGhost` through the sprite's own placement ([DUKE.md](DUKE.md)). So the trail bends
through every arc, folds at a wall bounce and curls with the roll, and stays on him: 8
units behind him at most, where the line before it hung 28 under him on every launch. Over
6 s of the bot, a drop and runs both ways, the nearest copy covers at least 45% of him (a
pose change) and 89% typically, the farthest at least 31% -- which needed the somersault
turned about the ball of him rather than its cell's centre (`SPIN_PIVOT`, DUKE.md). The
path starts again on a new run, a switch of game (the menu's demo shares the renderer), the
death, trails off, or a frame further from the last than his speed could carry him
(`GHOST_JUMP_K`, `GHOST_JUMP_SLACK`), so no copy is drawn across a jump. It allocates
nothing after construction and costs at most four `drawImage` a frame.

It was a halo round his outline for a round (1f57f1d), which the user called ugly and
broken when he rolls; before that the same silhouettes on a straight line along -v. Both
are the row *A trail that hung under him, then a halo that broke in the roll*.
`tools/test-afterimage.mjs` plays the bot, a drop and ground runs at 160 and 60 Hz at every
rest zoom and checks every frame against that. A frame drawn cold has no path behind it,
so `tools/shot.mjs` draws the 50 ms before each shot, or no shot would show the trail.

## The death: what the screen does, where the pieces land, and the blood

Below floor 200 (`SPLAT_FLOOR`) he lands dazed. At or above it he falls in one piece and
comes apart on impact; which pieces there are, how they are cut from the art and where
each bursts from are in [DUKE.md](DUKE.md). What happens to them after the burst is here.

**What the screen does as the fire takes him.** The user saw things flash, appear and
disappear the moment he fell into the fire; rendered frame by frame they were the ones
below, each fixed at its cause (71977f0, a43d41e). Then the user asked for the fire to
clear everything as it takes him, so the fall is smooth, and the fall became him alone in
the shaft (ccbf551, 9b0a326). What is MEANT to happen at the catch, and does: a splash of
red and white out of the fire and a shake; the tower on screen burning away; then the
fall, him alone, with a darkness closing in; at the impact a flash (0.8 for a splat, 0.3
dazed), a shake and, in a splat, the pieces; then the scoreboard. Everything else lets go
rather than switching, and nothing of the climb is drawn after `FALL_CLEAR` (0.35 s):

- **The red band and the vignette** peak as he is caught and die away. `danger` climbs back
  to clear over `DANGER_RELEASE` (1 s) from wherever it stood, so the band is gone at most
  0.3 s in and the vignette 0.5 s. It used to be set to 1 in the frame he died -- both
  off at full strength, one to six frames after the band had come on, since the floor is
  crossed in the last instant.
- **The HUD fades out** over `HUD_OUT` (0.35 s) in the banners' three steps, from a copy
  taken before the chain is banked (`Game.hudHeld`: the score, the chain's meter, CLIMB!),
  so the score does not jump and the meter does not vanish as it goes. It used to switch
  off in the catch's frame, score, meters and a banner half read. On the scoreboard it
  stays gone; it used to come back there, faint under the board. A callout on screen goes
  with it -- its clock stands still -- and its prestige badge fades from the same moment.
- **A chain the floor ended is banked quietly** (`scoreCombo(r, true)`): the same points,
  shown on the scoreboard, but no white flash, no confetti, no "+24000" rising off the top
  of the screen after the camera and no taunt -- the landing's celebration, which `die()`
  used to fire.
- **The tower burns away.** From the catch the ledges on screen, their furniture and the
  companions standing on them char, glow at the edges of the holes that open in them and
  dissolve over `BURN_T` (0.3 s; `src/render/burn.js`). They are drawn as usual into one
  offscreen layer and the masks are laid over it IN THE WORLD, anchored to the tower, so
  each hole rises up the screen with its ledge while the camera plunges. Which pixel goes
  when is a tileable noise field one floor tall, ranked to an even spread, in blobs of 12
  to 40 art px so it eats a ledge in patches rather than lacing it, a little sooner low in
  each floor so a ledge goes from its underside up; a band of pixels fades over one of eight
  stages (`BURN_STAGES`), embers ramping through it first, so nothing goes in one frame, and
  at the catch itself the layer IS the ledges as they were. The tower UNDER the fire, which
  the crust hid the whole run, is not drawn in the death at all (`Renderer.fireLine`), and
  the crust never ends higher than it reached as it took him (`Game.crustDepth`), so a
  catch high on the screen cannot uncover the shaft in a frame. It used to show the tower
  as it stood: the ledges above him, then -- once he dropped out of the crust's underside --
  the tower below the fire scrolling up past him to the pit. 0.3 s because at 0.4 the last
  ledge had left the top of the screen before it finished burning. The masks are built
  once in the Renderer's constructor (31 ms headless, 3.7 MB); a frame of the burn
  allocates nothing.
- **The speed streaks let go.** `Game.intensity` in the death falls in a straight line
  from where the climb left it to none over `STREAK_LET_GO` (0.15 s), and each line the
  pool retires shrinks into its head over the pool's own 0.2 s, none vanishing mid-screen
  (`streaks.js`). The lines keep rising at the pace the climb gave them (`Game.fallPace`,
  the `pace` argument of `drawStreaks`) while the pool thins: lines that slowed as they went
  would be one more thing changing at once. For a round they became the plummet's, following his fall
  speed -- flat out a hundred thin orange lines all the way down the shaft, rain over a
  fall that is him alone. Before that the fall had wind lines of its own: 34 bars switched
  on at the catch, hopping sideways forty times a second and running DOWN the screen 23
  units a frame at 60 Hz, so no bar overlapped where it had been -- flickering rain,
  falling the wrong way. Both are gone.
- **What the climb left in the air runs out.** Every spark, dust mote, confetti and floater
  alive at the catch runs its own stepped fade within `FALL_LET_GO` (0.3 s), each keeping
  how far through its life it was (`Particles.letGo`; a floater keeps its age, which its
  pop is keyed on), so nothing blinks out. The mote the fall used to shed round him every
  30 ms all the way down, as wind and debris rushing past, is gone; the splash out of the
  fire is the death's own and is thrown after `die()` lets go of the rest.
- **The camera rides with him and its speed never jumps.** A critically damped spring on
  where he should be, fed his own speed and acceleration (`Game.stepFalling`): it takes up
  the speed the climb's camera had at the catch, eases him onto `FALL_CAM_AT` (0.2 of the
  view up) and holds him there at terminal velocity; after the impact it runs on past him
  (he rises to 0.47 of the view) and settles with him on `CAM_ANCHOR` (0.42), as the camera
  frames a man standing in play. Its rate, `FALL_CAM_RATE` (8/s), scales with the zoom. It
  was a lerp with a hard clamp keeping him above 18% of the view: at terminal velocity the
  lerp lagged 0.47 of a view, the clamp caught him about half a second in, and he slid down
  the screen at 800 px/s and stopped dead inside two frames while the world jumped from 22
  to 29 px a frame. The fall's camera is also drawn INTERPOLATED between its last two steps,
  like the Duke (`Renderer.cameraY`), eased in over `FALL_CAM_BLEND` (0.12 s): drawn raw, a
  160 Hz display against the 240 Hz simulation moved the world 19 then 38 device pixels on
  alternate frames at terminal velocity. The camera in play is not interpolated, as before.
- **CLIMB!** does not blink up in a death any more (the time test above), and as the HUD
  goes it keeps whatever it showed.
- **The companions stand still** where they were, a call they were making fades out
  (`Companions.freeze`, `hush`), and they burn with the ledge under their feet, never
  later than it (see [COMPANIONS.md](COMPANIONS.md)).
- **SPACE TO SKIP** waits `SKIP_PROMPT_AT` (0.5 s), until a companion's call at the same
  spot bottom centre has faded, and it and the impact's SPACE blink on clocks that start
  with them (`deathT`, `impactT`), not the screen's, which could show either for a frame
  and then hide it.

Found only by rendering every frame at the display rate and diffing with the camera lined
up; how is in [TESTING.md](TESTING.md). Live play -- 40 s of the seeded demo, streaks off
-- was unchanged frame for frame. `tools/test-fallclear.mjs` holds the clearing: four real
deaths drawn at 160 Hz (falling in with a companion on screen, with a 350-floor chain
forced live, standing still low in the tower, and early in a run while the zoom glides),
nothing of the climb drawn after `FALL_CLEAR`, the ledges and companions isolated and
diffed with the camera lined up so neither pops, no streak vanishing, no particle or
floater going out from above its last fade step, no companion left on ledge already burned
away, and the camera's step changing by no more than `CAM_JERK` (2.5 px times the zoom)
from one frame to the next, where the four deaths measure 0.5 at most; broken eleven ways
(`--mutate=`), it fails each.

**The impact's words and the scoreboard.** SPLAT or OOF, the verdict, FLOOR n and SPACE
are each put together once and faded in as ONE picture (`boardFade` in
`src/render/gameoverskin.js`); they used to fade their letters over a keyline drawn whole
from the first frame, and came up as black stencils over the white flash. They and SPACE
TO SKIP are drawn over the world, because a splat's pieces covered them in 12 of 80 impact
frames. They and the scoreboard's words are in the menus' lettering -- SPLAT and OOF lettered
at scale 3, SPACE a keycap, nothing blinking -- where they were the HUD's zone inks (see
ART-PIPELINE.md, "The scoreboard and the fall's words"). The scoreboard, in the style of the zone the run ended in, is painted ahead in
slices -- `warmBoards`, `BOARD_WARM_MS` (0.5 ms) a frame in a run, `BOARD_IDLE_MS` (2 ms)
on the menus -- and nothing is painted in the fall or on the board's first frame: it was
painted a piece a frame while he fell, 22 to 46 ms at worst in Chromium where a frame at
160 Hz is 6.25. A death whose zone's board is not finished wears the last finished one,
else BASEMENT's, which is painted at load. `tools/test-boardwarm.mjs` and
`tools/test-gameover.mjs` hold both.

**Where each piece ends up is decided at the burst.** Every piece is given a resting
place on the floor — side by side, lying with its long side down, none on another, all
between the walls, spread wider the deeper the fall, seeded off the run — and its bounces
are steered onto that spot and its spin onto that quarter turn, so it arrives already
lying the way it will stay. Nothing snaps as it stops. Collision and rest use the piece's
ROTATED half-height, so a resting piece's lowest pixel is exactly on the floor's contact
line. They are light and springy (`GIB_GRAVITY` 500, `GIB_BOUNCE` 0.6): four or five
strikes each, and all of them still about 2.2 s after the impact at the latest, a second
before the scoreboard (`IMPACT_HOLD`, 3.2 s).

**The blood scales with how far he fell**, not how hard he hit: terminal velocity caps the
strike speed, so a 2600-unit fall used to land exactly as wet as a 1420-unit one. The fall
depth maps onto a severity between `PIT_BASE` and `PIT_MAX`, and that sizes the pool that
spreads under the impact over 1.5 s, the stains every strike leaves, the droplets thrown
past the pool and the red burst at impact. All of it lies on the floor's receding surface,
above the contact line. The debris chunks take their colours by ROLE (`SPLAT_INKS`: the
commonest steel, gold, blue and red in the parts drawings), never by palette letter, since
the letters move on every import.

Tuning lives in `src/game/constants.js` (`GIB_*`, `BLOOD_*`, `SPATTER_*`, `IMPACT_HOLD`;
the full list is under Tuning knobs below). The simulation is `Game.burstGibs`,
`planLandings`, `planGib` and `stepGibs`; the drawing is `bloodStains` and `drawSplatter`
in `src/render/renderer.js`. `node tools/test-death.mjs` checks all of the above over 48
staged deaths; `tools/shot-death.mjs` renders one (`--floor=N` for the depth, `--before=S`
for mid-fall, `--open`, `--left`, `--band`).

## The jump: a press, the buffer, coyote time, air jumps

A jump key's press (or pad A's: `Input.padDown`) fills the **jump buffer**, `JUMP_BUFFER`
(0.12 s, `src/core/input.js`), and `Input.step` counts it down on the world's clock -- the step
`Game.step` hands it, slow motion included, the same seconds at every JUMP SPEED. `jumpHeld` is
the key's level. `Player.step` reads both once a step:

- **On the ground, or in coyote time** (`COYOTE`, 0.09 s after walking off a ledge, the world's
  clock too), a press in the buffer is taken and he jumps. So does a HELD key with no press: the
  instajump, `INSTAJUMP_BONUS` and the chain, re-firing on the step after every landing. (The
  bonus goes on any jump from the ground made with the key down in its step -- `insta` is `held`
  on the ground -- so an ordinary press on the ground, even a 4 ms flick, gets it too.)
- **In the air with an air jump to spend** -- banked, and unlocked by a meter pinned at takeoff
  (`AIR_JUMP_UNLOCK`; the third only inside a long combo) -- a press is taken at once: the tap in
  the air IS the double jump.
- **Anywhere else** -- in the air with nothing to spend: none earned, the last one spent, or one
  banked by a hot landing but not unlocked by the cold takeoff before it -- the press is NOT
  taken. It stays in the buffer, counting down, and fires on the step after he lands if he lands
  inside the window. A tap that goes down up to 26 steps (108 ms) before the step his feet reach
  the ledge jumps on landing: it is counted down once before each read, the step that first sees
  it included, and read the step after the landing step, so d + 2 steps must stay under 0.12 s.
  A tap 27 steps or more before does not.

A tap that is up again by the landing makes a plain jump (not an instajump: the key is not
held), and since the key is up the jump cut takes it at once -- the lowest jump in the game,
LOWER than any tap on the ground: a ground tap is down in its first step, so it gets
`INSTAJUMP_BONUS` and one step before the cut. Measured from a standstill at 100% (at 130% within 4
units of these): the held-over tap rises 34.9 units (1.16 floors); a 4 ms flick on the ground 39.5
(1.32); a 50 ms tap 50.7 (1.69); a 100 ms tap 59.9 (2.00); held to the top 71.3 (2.38). A
tap still DOWN at the landing is the held jump, with the bonus, and rises by how long it is
held after takeoff. So pressing earlier inside the window buys a lower jump, and the one
released before touchdown is a hop onto the next floor at best. Holding is what buys height,
in the air or on the ground. (A design choice left as it was -- the jump is still cut on
release -- flagged for play-testing: giving the held-over tap a flick's first step and bonus would be
a rule change, and a SIM_VERSION bump.)

Until 2026-09-28 `Player.step` called `consumeJump()` every step, unconditionally: a press in the
air with no air jump to spend was taken there and thrown away, the buffer was empty when he
landed, and a tap 4 to 100 ms before touchdown did nothing, at every JUMP SPEED and in every
build before it. Only a held key jumped on landing. The user's complaint was that the game felt
slow; a well-timed tap being ignored reads as input lag. `tools/test-tapjump.mjs` sweeps the
tap's timing through the real Input and `Game.step` -- four flights with nothing to spend
(a standing hop onto floor 1, a running jump onto floor 2, a banked-but-locked jump, a spent
double jump), every JUMP SPEED, a 4 ms flick and a 50 ms tap, 0 to 37 steps before touchdown --
and runs the same sweep on a copy of `src/` with the old call put back: **864 of 864 taps inside
the buffer eaten before, 0 of 864 after**; none of the 352 taps past it jumps, before or after.

What did not change: a press with an air jump available still takes it at once, the held key
still chains, the jump cut on release, wall kicks, coyote time. The attract bot presses only
where a jump can be taken, so it never leaves a press waiting (0 of 6,219 presses over 21 bot
and demo runs) and plays bit for bit as before: `test-botskill`, `test-autoplay` and `test-sim`
print the same numbers. The buffer counts down only in PLAYING steps, so a press waits through a
pause or a menu with what it had left. When a NEW run starts, `Game.newRun` drops a press that
was already waiting in a step of the last run (`Input.dropStaleJump`): without it, a tap in the
last 0.12 s before the fire took him sat frozen through the fall and the scoreboard and made him
jump on the next run's first step when that run was started with Enter, the pad's Start or from
the menu -- 3 of 3 staged catches, where the build before never did (it had dropped the press in
the air). A press made after the last step -- the SPACE that starts the run, a jump key on the
pause screen -- is kept, as it always was. `test-tapjump` section 7.

**Replays.** A press is recorded at the step the simulation took it (`consumeJump()` returned
true), so a press held over from the air is recorded on the landing jump's step and plays back
there; `test-tapjump` checks the recorded presses are exactly the steps the simulation took one
and plays the file back step for step, and fails a recorder that notes the press when it arrives
(the playback offers it in the air, nothing takes it, and the landing jump is lost). The rule
changed without moving a number and the fingerprint's probe does not see it (its climber taps
for one step and the next step overwrites the tap), so `SIM_VERSION` went to 2: every replay
saved before is refused as "made by a different version of the game" -- its ghost still races.

## JUMP SPEED: his clock, not the world's

The user found the game slow to play after the smooth-play round, with the jump physics
untouched (what changed under him was the music's tempo ceiling and the screen's low-latency
hint -- LOW LATENCY in [ARCHITECTURE.md](ARCHITECTURE.md)). The OPTIONS row **JUMP SPEED**,
100% to 140% in tens (`JUMP_SPEEDS` in `settings.js`; the default 100%, then 120% on the
user's word, then 140% the same evening, when the user asked for more speed -- a saved 120%,
the old default, moved to 140% once, `SPEED_V` 2 -- and 120% again on 2026-09-29, when the user
set the defaults to 120% jump speed with the lighter NORMAL gravity and the NORMAL ledges, a
140% saved since the first move moved back once, `SPEED_V` 3),
runs the Duke's own
physics clock s times as fast: `Player.step` integrates him over `h = dt x rate`
(`Player.rate`, set by `Game.newRun(seed, course, speed)`), so gravity, the jump and its cut, running,
friction, the air, the walls, momentum and the overdrive's bleed all advance s times as far a
step. He flies the same arcs through space -- the same heights and reaches, the same bounces --
in 1/s of the time, so every tower stays reachable and the generator and the reach proof need
nothing. "The same" is to the integrator's resolution: a step of his is s times as long, and a
wall or a ledge met inside a step is met at another instant of it, so a flat-out jump with
three wall bounces lies within 2.7 units of the 100% path at 130% and a plain jump within 0.3
(`tools/test-feel.mjs`); the weakest jump there is covers 80.9 units one floor up at 100% and
81.5 at 130%, against the 41 the generator allows a gap.

What else runs on his clock, and why:

- **His body.** The squash, the landing pose, the tuck's timer and the run cycle are in
  `Player.step` on `h`: a run cycle on the world's clock would skate his feet at 130%. The
  tuck's quarter turns (`Renderer.drawPlayer`, `this.t x 14 x rate`) keep as many turns in an
  arc.
- **The camera's follow** (`CAM_LERP x dt x rate` in `Game.step`, and `camPath` in
  `companions.js`, which flies the same camera forward): a follower on the world's clock lags a
  man moving s times as fast s times as far, so a launch at 130% carried him that much nearer
  the top edge. On his rate it frames him in space as at 100% (its lag at every height of a
  jump within 0.5 units at 130%). The lookahead reads his `vy`, so it is his too.
- **The trails.** The combo trail sheds per second of his clock and each piece leaves with a
  share of his REAL speed (`Particles.comboTrail`), so the stream lies as thick along his path
  and still falls behind him. The afterimage keeps his time (`Afterimage.record` is handed
  `this.t x rate`): copies `GHOST_DT` of his time apart, speeds in his units, and its teleport
  test -- his speed times the frame's time, x1.5 -- no longer sits within 15% of calling every
  frame a jump at 130%.
- **Whatever reads his future in seconds.** The companions' forecast of his landing
  (`hisLanding`, `predictor`) is flown on his clock and handed back in the world's seconds,
  since their hops and the fire's path are timed on the world's; CLIMB!'s time to the fire
  (`Game.floorETA`) takes his fall in the world's units; and the catch hands the fall his real
  speed (`die()`), since the plunge is theatre on the world's clock. The fire's grab is the
  world's too: `caughtByFloor` holds his vy under `FLOOR_GRAB / rate`, which `die()` turns into
  `FLOOR_GRAB` in the world's units. It held it under plain `FLOOR_GRAB` in HIS units at
  first, so a man caught standing or rising at 130% went under at 312 units/s where 100% goes
  at 240 and fell 8% further in the fall's first half second (verifier, 2026-09-28; the
  suite's handover check called `die()` with a fast fall, where the grab does not bind).

What stays on the world's clock, and why: the **rising fire** and the idle clock (the setting
is his speed, not the game's difficulty curve -- which is why a faster Duke gains on the fire);
the **companions' own motion** and the **music** -- measured, the companions fall behind a
faster Duke: 7.2% of frames off screen at 120% and 8.5% at 130% against 4.6% at 100%, and 43
and 68 crossings a minute against 18 ([COMPANIONS.md](COMPANIONS.md) Honest gaps has the fix to
try); the **windows for a player's hands** --
coyote time (0.09 s), the jump buffer (0.12 s) and the combo's ground grace (0.4 s) -- the same
seconds at every speed, because they are reaction times, and shortening them would punish the
player for choosing the faster feel; the **death** (the fall, the pieces, the holds); the
**shaft's opening** (`arenaEase` chases its target at `ARENA_OPEN_RATE` per second of the
world's clock, so at 130% the walls step out after 30% more of his climb, and a flight that
crosses a step meets the old wall at 130% where 100% flew on to the new one -- one of the few
places a faster flight is NOT the same arc: verifier, 2026-09-28, a flat-out jump from floor 0
bounced off x 344 at 130% and landed on floor 6 where 100% reached 361 and landed on 3; the
generator lays floors inside whatever shaft there is, so reach is untouched, but one seed
climbed the same way lays out other ledges from about floor 25-36 on at 130% than at 100% --
as it already did with another player's momentum, which is why a race is run on the ghost's own
tower);
and the stats that are seconds on a clock (run time, air time, hang time, and TOP SPEED, which is
floors a minute). His **momentum meter** is unitless and his speeds (`vx`, `vy`, the sideways
top speed two awards read) stay in his units, so a full meter means the same run-up at every
speed -- the same distance run, in 1/s of the time.

**It is a simulation setting.** A run keeps the speed it started with (the row's note says
FROM YOUR NEXT CLIMB): it is written into the replay's header and a replay plays at its own
speed, a race at the racer's or its ghost's, as the player answers the question before it
(below, "Racing at the run's options"), and the attract demo and the guide behind it run at the
game's default (`autoplay.js startDemo`, since 2026-09-29; until then their own `DEMO_JUMP_SPEED`,
130% from 2026-09-28, when the user found the bot behind the menu climbing slower than it
could, and 100% before that). **Records are shared** across speeds -- a 130% Duke outruns the same fire, so it is an
easier climb, and the setting is shown instead: the scoreboard's THIS RUN panel names a speed
other than a player's default (120% since 2026-09-28, which the user chose after playing at
it; nothing at 120%, JUMP SPEED 100% at 100%), the REPLAYS list has a SPEED column, and the stats' run history keeps
each run's `speed` (not shown on the stats pages yet).

At 100% `h` is `dt` to the bit, so the game and every saved replay are exactly what they were:
the replay fingerprint did not change (`1.4bfb2a1d.87cd6c5d` before and after). A change to
what the rate scales is a rule change the fingerprint's probe does not see (it climbs at 100%):
the playback's checksums would report a desync in a faster replay. Bump `SIM_VERSION` with it.

## PLATFORMS: NORMAL and WIDE ledges

Asked for on 2026-09-28: narrower ledges by default, and a choice of small, medium and wide,
and it came as SMALL 0.75 (the default), MEDIUM 1 and WIDE 1.35; then on 2026-09-29, two
sizes only: a NORMAL between the old default and SMALL, and a WIDE between the old default and
the old WIDE, SMALL gone. So the OPTIONS row **PLATFORMS**, under JUMP
SPEED, multiplies every ledge's width -- and its minimum -- by one of `PLATFORM_WIDTHS`
(`src/game/settings.js`): NORMAL 0.875, the default, halfway from the old MEDIUM to SMALL, and
WIDE 1.175, halfway from MEDIUM to the old WIDE. The minimum is 28 at NORMAL, 37 at WIDE and 32
at a width of 1 (the squeeze's floor is 24, four units over the 20 a landing needs). The gaps
are the reach proof's whatever the width, so every tower is as climbable as it was: `test-reach`
holds both. The median ledge of a tower is 0.916 and 1.189 of a width-1 tower's (`test-feel` 8).
Checkpoints are the same width at every size; the wide ledge's bonus scales with it.

A width saved by an older build loads as the one of its name now (SMALL and MEDIUM as NORMAL,
the old WIDE as WIDE), and every width a run has ever been climbed on still reads in a replay
-- the old ones by their own names, SMALL, MEDIUM and X-WIDE (`PLATFORMS_KNOWN`,
`PLATFORM_WORDS`), so a race on an old ghost's tower says what it is on.

How much harder, measured at the first three widths with the rising floor on (12 seeds, 120 s,
average best floor; NORMAL and WIDE lie between them):

| a player who... | SMALL | MEDIUM | WIDE |
|---|---|---|---|
| stops dead before every jump (`test-sim`'s weak bot) | 164 | 163 | 179 |
| holds jump and keeps moving (its held-jump bot) | 154 | 260 | 320 |

A careful climber hardly notices; one who keeps moving, the way the game is played at speed,
loses about 40% of his height on SMALL.

**A simulation setting, like JUMP SPEED**: a run keeps the width it started with (FROM YOUR
NEXT CLIMB); the replay's header carries it and a replay plays on it; a race is on its GHOST's
width -- on the ghost's own tower its course carries it, and raced on the seed alone (GHOST
ONLY) it is the ghost's header's. The scoreboard's THIS RUN panel says `WIDE PLATFORMS`
(nothing on NORMAL, the default; an old ghost's width by its old name), or with a speed too
`120% WIDE`; the stats' run history keeps each run's `plat`. Records are shared across widths,
as across speeds.

**A width of 1 (the old MEDIUM) is the old tower, byte for byte**, and the sim's default when a width is not said
(`Game.newRun`'s fourth argument, `Tower`'s third): every seeded test, pin and hash was taken
on it and still holds, and the replay fingerprint did not move -- the widths are not
`constants.js` numbers, and the header carries the run's own. A code change that scales the
width differently is a rule change the fingerprint's probe (on MEDIUM) does not see: bump
`SIM_VERSION` with it.

## DIFFICULTY: EASY, MEDIUM and HARD fire

Asked for on 2026-09-28: the fire rose far too slowly and forgave far too much, so the user
asked for it to become EASY, beside a faster MEDIUM and HARD chosen in the options. The OPTIONS
row **DIFFICULTY** picks one of
`DIFFICULTIES` (`src/game/constants.js`), each a `rise` (x the fire's speed, the curve in "How
close the floor is" and the idle urgency on top) and a `lead` (x how far it may trail the best
floor, `RISE_LEAD` 340 down to `RISE_LEAD_MIN` 62): EASY 1 and 1, the fire as it always was;
MEDIUM 1.35 and 0.7, the default; HARD 1.75 and 0.5. Measured at the other defaults (SMALL,
120%), the median best floor in 180 s over 12 seeds:

| climber | EASY | MEDIUM | HARD |
|---|---|---|---|
| stops dead before every jump (`test-sim`'s weak bot) | 190 | 140 | 84 |
| holds jump and keeps moving | 120 | 67 | 30 |
| the attract bot (`autoplay.js`), rebuilt 2026-09-29: it outruns all three, so the fire does not move it | 4,160 | 4,160 | 4,160 |
| the attract bot before it | 814 | 481 | 423 |

A simulation setting like JUMP SPEED and PLATFORMS: fixed for a run, in the replay's header (the
flags byte's bits 5-7 over the speed's 1-4), a replay played at it, a race at its GHOST's (the
same fire it outran) or the player's, as the player answers before it; the attract demo runs the game's default (it had a slowed fire of its own, `DEMO_RISE_SCALE`, 0.55 of EASY's, until 2026-09-29). EASY is
the sim's default when a run does not say, so every pin holds; unlike the other two, the table
IS in `constants.js` and so in the replay fingerprint -- the header carries an index into it,
not the factors -- which refused the replays saved before it. The scoreboard names a difficulty
other than MEDIUM ('HARD MODE', or short with others: '100% WIDE HARD').

## GRAVITY: LOW, NORMAL and HIGH

Asked for on 2026-09-29: gravity as an option, and it came as LOW 0.8, NORMAL 1 (the game as
tuned) and HIGH 1.2; then, the same day, a lighter NORMAL, between the old one and LOW, and a
gentler HIGH, since 1.2 was too rough. So the OPTIONS row **GRAVITY**, under
DIFFICULTY, multiplies `GRAVITY` (1680) for HIM by one of `GRAVITIES` (`src/game/settings.js`):
LOW 0.8, NORMAL 0.9 (the default, halfway from 1 to LOW) and HIGH 1.1 (halfway from 1 to the old
HIGH). A gravity an older build saved loads as the one of its name (1 as NORMAL, 1.2 as HIGH).
A run that says none (`Game.newRun`, every test's pin) is at 1, CLASSIC, the game as tuned; a
replay climbed at 1 or 1.2 still reads, by those names (`GRAVITIES_KNOWN`, `GRAVITY_WORDS`).
His jump impulses do not change, so at g every jump rises 1/g as high and is up 1/g as long (the
same impulse spent against g times the pull). Measured in `test-feel` 11:

| | LOW 0.8 | NORMAL 0.9 | 1 (CLASSIC) | HIGH 1.1 |
|---|---|---|---|---|
| a standing jump, held (height, steps up and down at 240 Hz) | 89.4 units, 176 | 79.3, 156 | 71.3 (2.38 floors), 140 | 64.7, 128 |
| his fall's cap, `terminalOf` | 1252 units/s | 1328 | 1400 | 1468 |
| the weakest jump's reach one floor up (needs 57) | 114.6 units | 95.7 | 80.9 | 69.0 |

and, measured at the first three weights, a flat-out jump held rises 371 units (12.4 floors) at
0.8, 297 (9.9) at 1 and 247 (8.2) at 1.2, and the lowest jump there is (a tap released before
the landing) 39.7, 34.9 and 31.2 -- still a floor; every height goes as 1/g.

**Where it lives.** `Player.gravity`, set by `Game.newRun`'s last argument (after the
difficulty, so every call written before it is a NORMAL run), and read through two functions in
`player.js`: `gravityOf` (GRAVITY x the setting) and `terminalOf`. **TERMINAL goes with the
ROOT of g**: `constants.js` says it is "scaled with gravity, or falls feel weightless", and when
GRAVITY went from 700 to 1680 (x2.4) it went from 900 to 1400 -- the root of 2.4, as the
impulses did -- which keeps a fall's shape in space: from rest he reaches the cap after the same
drop (583 units, 586-589 measured at every gravity) and a fall of any height takes 1/root(g) of
the time. Left at 1400, HIGH would pin every long fall at its cap after 486 units (the floaty
fall the comment warns of) and LOW after 729.

**What falls by his gravity**, because it forecasts his flight: `Player.step`; the attract bot's
jump model (`autoplay.js`: every apex, airtime and arc takes `G = gravityOf(p)`); the
companions' forecasts, `hisLanding` (his gravity and his cap) and `predictor` (and through it
`camPath`). A bot planning on the world's gravity at HIGH made 48% of its planned landings and
was caught at floor 3 on three towers of six; on his, 94% (96.7% LOW, 94.0% NORMAL, 93.8% HIGH,
twelve 180 s runs each). **What stays on the world's**: the companions' own hops, the death's
fall after the fire catches him (theatre, `GRAVITY x FALL_GRAVITY`, from the speed he had), the
pieces (`GIB_GRAVITY`), and the generator and its proof (`reach.js`, below). The camera reads
only his height and his vy, so it follows whatever he does: at LOW, on the attract bot's runs
(two demo towers to floor 8,000+, through both ascensions -- when an ascension still doubled his
jumps' height, x1.1 a lap since -- and two player towers), his head was
never off the top of the view in any step, the least room over it 27.5 units before the
ascension (NORMAL 34.5), 86.8 at level 1 and 57.0 at level 2 (NORMAL 78.0 and 59.1); the biggest
jumps 28, 31 and 55 floors (NORMAL 20, 32, 42). The companions keep up, their limits (`boostOf`)
not scaled with it: over four minutes of the bot's play at each gravity (100%, as
`test-companions` measures), off screen 5.5% of their climbing frames at LOW, 4.3% at NORMAL and
4.6% at HIGH on the tower a person plays (3.2, 2.7 and 1.5% on the demo's), crossing him 21.7,
15.9 and 22.2 times a minute.

**How heavy the tower allows.** The generator lays its gaps for 1: `MAX_EDGE_GAP` 41, from
`ABSOLUTE_REACH` 67.3 x `SAFETY` 0.62 (`reach.js`, [TOWER.md](TOWER.md)). The weakest jump there
is -- standing, no momentum, held, steering flat out (`test-feel` 4) -- must still cover that gap
plus his width, 57, one floor up. It covers 80.9 at 1, 69.0 at 1.1, 63.9 at 1.15, 59.3 at 1.2
(59.3-59.9 at every JUMP SPEED) and 55.0 at 1.25: 1.2, the first HIGH, was the largest 5% step
that holds, with 2.3 units to spare, and on the proof's own closed form its 41-unit gaps used
0.83 of the analytic reach where 1 uses 0.61. HIGH at 1.1 has 12 units to spare; `test-feel` 11
holds both that it reaches and that 1.2 is still the heaviest that would. In
practice `test-sim`'s weak bot (stops dead, weakest jump) never stuck at any gravity -- 40 seeds x
90 s with the fire off, the longest stall 2.47 s at HIGH on MEDIUM ledges and 2.70 on SMALL (3.03
and 2.87 at LOW). LOW only makes every jump higher and longer, so it reaches all NORMAL does.

How much harder, measured at the first three weights (0.8, 1, 1.2 -- NORMAL and HIGH now lie
between them) and the defaults of the day (SMALL, 140%, MEDIUM fire), the median best floor in
180 s over 12 seeds:

| climber | LOW | NORMAL | HIGH |
|---|---|---|---|
| stops dead before every jump (`test-sim`'s weak bot) | 143 | 160 | 148 |
| holds jump and keeps moving | 136 | 46 | 50 |
| the attract bot (`autoplay.js`) | 558 | 756 | 504 |
| ...its floors a minute while alive | 827 | 869 | 769 |

LOW is kind to a held jump (every one is a quarter higher) and slow for a careful climber (every
hop hangs a quarter longer); the attract bot's numbers were tuned at 1 and it was best there. The
camera, companion and bot measurements above were taken at the first three weights too.

**A simulation setting like the three above**: fixed for a run when it starts (FROM YOUR NEXT
CLIMB), a race at its GHOST's gravity or the player's, as the player answers before it (below,
"Racing at the run's options"; one begun without the question at the ghost's, as it takes its
DIFFICULTY), a replay played at its header's. In the replay's file every bit of the flags and
companions bytes was taken, so a gravity other than 1 makes the file **format 3** (a race's, 4):
formats 1 and 2 with one byte more after the companions byte (`replaycodec.js` `more`: bits 0-4
the gravity's own code in 5% steps, -4 for LOW, -2 for NORMAL, 2 for HIGH, 4 for the old HIGH;
bits 5-7 zero, refused as "needs a newer version" when set). A run at 1 writes the bytes a replay
always had, so every replay kept before the row reads as 1, and a build from before it says any
other "needs a newer version of the game" instead of playing it at 1 and desyncing -- since
NORMAL is 0.9, that is most runs. A gravity no build offered is refused with a sentence. The list and the
constants are unchanged, so **the replay fingerprint did not move**: `4.1a4ce0dc.2e7f74e3` before
and after, and six bot runs (194,856 steps, two of them five minutes on the demo's towers through
the squeeze and both ascensions) hash the same step for step against the commit before, with the
gravity not said and with 1 said. The probe climbs at NORMAL, so a change to what the setting
scales is a rule change the fingerprint cannot see: bump `SIM_VERSION` with it. Records are shared
across gravities; the scoreboard's THIS RUN line names one other than NORMAL ('HIGH GRAVITY', or
short with others: '100% LOW-G'; an old ghost's by its old name, 'CLASSIC GRAVITY'), the replay
store's entries and the stats' run history keep it
(`gravity`, `grav`). The REPLAYS list does not show it: its row has no room left for a readable
word (every column's widest value already stands a character from the next).

`tools/test-feel.mjs` 11 holds all of this, and 7 the run at the saved gravity and a race begun without
the question at its ghost's (test-replayui: asked, at the ghost's or the player's); 22 mutants, each caught. The row made sixteen OPTIONS, so they are 10 units apart now
(`screens.js OPTION_ROW`): at 11 the second measured line under the panel lay across the key hints.

## Racing at the run's options

A race is only a race if both climbs were made on the same terms, and a ghost carries the
terms it was made on: its replay's header has the JUMP SPEED, PLATFORMS, DIFFICULTY and
GRAVITY it was played at. So before a race starts -- G on the scoreboard (RACE YOUR BEST RUN), R on the
REPLAYS screen (RACE THIS RUN) -- the game lists them beside the player's own, each row SAME or
DIFFERS, and asks: "RACE AT THE RUN'S OPTIONS, SO IT MATCHES?" (the user asked for a race to
list every option its replay was played at, and to offer to race at the same ones,
2026-09-29). Y (A) races at the run's JUMP SPEED, DIFFICULTY and GRAVITY, N (X) at the
player's own, ESC (B) goes back; the choice is for that race only and the saved settings are never
changed. When every row is SAME there is nothing to choose, and the panel says YOUR OPTIONS
MATCH THE RUN'S over SPACE RACE and ESC BACK.

PLATFORMS are listed but are the run's whichever way: a race is on its ghost's own tower, whose
ledges are the width its run had, and a line under the rows says so when the player's differ.
The cosmetic settings a header also carries -- the companions' movement, the particles -- are
not listed: they change nothing in a race. A replay from another build (GHOST ONLY) is asked
about the same way, its result line saying GHOST ONLY.

## THE ASCENSION: beating ZENITH

Asked for on 2026-09-28: a doubled bounce and a speed boost for beating ZENITH, doubled again
each time he beats it -- and cut to a tenth the next day, when the doubling had the attract
demo looking far too fast, and the user asked for a 1.1x boost instead. Reaching the top of a
lap -- floor 2300, `CYCLE_FLOORS`, the top of ZENITH where GLORY is
called -- is level 1 (`Game.ascend`): every jump he makes, from the ground, in the air or held,
goes `ASCENT_BOUNCE` (1.1) times as HIGH -- the impulse by its root, in `Player.jumpImpulse`
through `Player.bounce` -- and his clock, JUMP SPEED's `Player.rate`, runs `ASCENT_SPEED` (1.1)
times as fast, so everything he does is quicker and the camera, the companions and the trail
follow as they follow JUMP SPEED. Floor 4600 is level 2, both again (x1.21 each); `ASCENT_LAPS`
(2) count, so floor 6900 changes nothing. His speed changes in the step it happens, in the air
or not. The herald says it under GLORY in words, with no number in them (THOU ART ASCENDED over
HIGHER AND SWIFTER, then ASCENDED ONCE MORE over HIGHER STILL, SWIFTER: `ASCENT_LINES` in
`flavour.js`), and the HUD keeps the numbers at the top centre (BOUNCE X1.1  SPEED X1.1, then
BOUNCE X1.21  SPEED X1.21: `ascentWords`). `game.jumpSpeed` -- the scoreboard's THIS RUN, a
replay's header -- stays the setting the run started at.

What the doubling was (x2 of height and x1.25 of clock a lap), on the attract demo of the day at
130%: 1,100 floors a minute before it, 1,640 at level 1 and 3,040 at level 2, the biggest jump
20, 32 and 43 floors -- 24,000 floors in ten minutes. At x1.1, on the demo of 2026-09-29 (a
player's tower at the game's defaults, [BOT.md](BOT.md)), its five towers climb 1,506-1,532
floors a minute before it, 1,735-1,769 at level 1 and 1,963-1,980 at level 2; the biggest jump
36, 38 and 41 floors (a mean of 24, 29 and 32); his head never off the top of the view (not a
step of him outside it in ten minutes: the camera follows his clock). The tower's reach proof is
untouched: it is made for the weakest jump there is, and a stronger one reaches more. The
companions' limits scale with him (`companions.js boostOf`), or the last of them, who never
slips, is left behind; on the demo, ascended, she is off screen 11.7% of the time and crossed 75
times a minute, against 5.9% and 77 before it (13.4% and 65 against 2.3% and 12.8 under the
doubling, on the old demo's ramp) -- `test-companions` judges those frames on bars of their own.
And the climb gets faster than the HUD's zone skins used to be painted ahead: see `hudskin.js`
WARM_AFTER, cut from 200 frames to 30 for it. The constants are in the replay fingerprint, so the
replays saved before each change are refused. `tools/test-ascension.mjs` 1-4.

## The aura: PARKED on the branch `park/aura`

Built on 2026-09-28 and taken out the same evening, when the user asked for the aura glow to
be removed and parked. The
whole of it -- `render/aura.js`, its hooks in the renderer, its constants, `test-ascension`'s
sections 5 and 6 and their six mutants -- is on `park/aura` (`805844b`); the ascension, which
came with it, stayed. What it was, for whoever brings it back: the stages were the
combo's own, its multiplier steps (`sparks.js stepFor`): from SWIFT, 50 floors of unbroken chain,
a flame of light stands up round him (`render/aura.js`) in the colour of that step's trail, its
floaters and the callout named for it -- cyan, azure, magenta, red, the flag's three at CRUSADE,
violet, GLORY's Saiyan gold, and past 400 floors every colour in turn -- taller, wider, brighter
and licking higher every 50 floors; motes rise through it from RAMPAGE and lightning crackles in
it from THUNDER. A step up flares it (`AURA_FLARE`); a broken chain lets it go over `AURA_OUT`,
and so does the fire's catch. Once he has ascended, a gold glow stays with him whenever no chain
burns.

The flames are drawn with the combo trail, behind the walls, the ledges and him, so however big
it burns it never covers a ledge's lit top rows or the HUD; only its rim, his outline in white an
art pixel out to either side and above, is drawn with him. About 1,300 fillRects a frame at the
top stage, 1,740 while a step's flare is on it. Purely drawn: nothing in the simulation reads it.
`tools/test-ascension.mjs` 5-6 on that branch. Bringing it back means one more thing to
weigh: the user parked it in the same message as finding the Duke too slow, and at a flare it
drew 1,740 fillRects a frame, never timed in a real Chromium window.

## Tuning knobs

In `src/game/constants.js`.

- Feel: `GRAVITY`, `JUMP_V0_MIN/MAX` — scale together by `k` and `sqrt(k)` to change
  airtime without changing jump height. Any physics change moves the reach cap by itself
  ([TOWER.md](TOWER.md)) and means re-measuring the bot ([BOT.md](BOT.md)). The player's
  own lever is JUMP SPEED (`JUMP_SPEEDS` in `src/game/settings.js`, x his physics clock,
  typical 1): the same heights in 1/s of the time, reach proof and bot untouched (above).
- Difficulty: `RISE_BASE`, `RISE_PER_FLOOR`, `RISE_LEAD`/`_MIN`/`_FADE` (how far you may
  fall — 11 floors at the start, 2.1 past floor 450), `RISE_CATCHUP` (how fast it closes
  that gap when you sprint ahead), `IDLE_RISE_MULT`. The rise speed itself is capped by
  `RISE_MAX`, which the first ramp reaches at floor 453, and by
  `RISE_LATE_FROM`/`_TO`/`_MAX`, a second ramp about a tenth as steep (165 to 226 over
  floors 453 to 2300, against `RISE_PER_FLOOR` 0.34) that carries on to floor 2300.
- Arena: `ARENA_HALF_MIN/MAX`, `ARENA_OPEN_RATE`.
- Walls: `WALL_COMBO_FULL` (300 combo floors for the full boost), `WALL_COMBO_KICK`
  (restitution 0.94 -> 1.20), `WALL_COMBO_LIFT` (300, scaled by impact speed),
  `WALL_VX_MAX` (559) and `WALL_LIFT_CAP` (the best plain jump), `OVERDRIVE_DECAY` (110/s
  -- how long a combo bounce's extra speed survives). All drop out with no combo.
- Death: `PIT_BASE`, `SPLAT_FLOOR`, `FALL_GRAVITY`; the pieces `GIB_GRAVITY` (500),
  `GIB_BOUNCE` (0.6), `GIB_REST`, `GIB_MAX_STRIKES`, `GIB_APEX_MIN/MAX`, `GIB_GAP`,
  `GIB_SPREAD`; the blood `BLOOD_POOL_MIN/MAX/T`, `BLOOD_MARKS_MAX`, `SPATTER_MIN/MAX`,
  all scaled by the fall's depth; `IMPACT_HOLD` (3.2 s, so every piece settles first) and
  `IMPACT_HOLD_DAZED` (2.4). What the screen lets go of at the catch: `DANGER_RELEASE`
  (1 s for `danger` to climb back to clear), `HUD_OUT` (0.35 s), `SKIP_PROMPT_AT` (0.5 s,
  after a companion's 0.45 s call fade); what the fire clears: `BURN_T` (0.3 s, the ledges,
  their furniture and the companions on them), `FALL_LET_GO` (0.3 s, the longest anything
  the climb left in the air lives on), `STREAK_LET_GO` (0.15 s, the streaks' intensity to
  none) and `FALL_CLEAR` (0.35 s, the last of all three, which the test holds everything
  to); the fall's camera: `FALL_CAM_AT` (0.2), `FALL_CAM_RATE` (8/s), `FALL_CAM_BLEND`
  (0.12 s). The burn's own look -- `BURN_STAGES`, the embers' lead and strength, the char,
  how much a ledge goes from its underside up -- is at the top of `src/render/burn.js`.
- The callouts: `CALLOUT_ROUND` (10 floors), `CALLOUT_LIFE` (1.6 s), `BADGE_AFTER` (0.06 s),
  `BADGE_GAP` (10 art px); the heights themselves come from `CYCLE_FLOORS` and the words'
  count in `src/game/milestones.js`, never a literal. A combo step's payoff:
  `COMBO_STEP_BURST` (28 particles); the step itself is `MULT_STEP` in `src/game/combo.js`.
- The afterimage: `GHOST_N` (4 copies), `GHOST_DT` (9 ms a copy), `GHOST_GAP` (2 units of
  path a copy at most), `GHOST_ALPHA`, `GHOST_FROM`/`_FULL` (78 to 356 units/s),
  `GHOST_MOMENTUM_FROM`/`_FULL` (0.45 to 0.65), `GHOST_HISTORY` (32 drawn states),
  `GHOST_JUMP_K`/`_SLACK` (what counts as a teleport).
- The warning: `CLIMB_READ` (0.25 s: CLIMB! comes up only if the floor is at least this
  far off at the closing rate) and `CLIMB_CLEAR` (0.35 of the lead: where a CLIMB! that is
  up goes; it comes up under 0.3). The band's 0.3 and the vignette's 0.5 are literals in
  `drawDangerBand` and `drawVignette` in `renderer.js`.
- Slow motion: `SLOWMO_SCALE` (0.55), `SLOWMO_EASE` (26/s). Eased, never switched — the
  stutter row in [ARCHITECTURE.md](ARCHITECTURE.md) is why.
- The combo trail, NOT in `constants.js`: its steps (`STEPS`), rates, shapes' motion
  (`MOTION`) and `INHERIT` in `src/render/sparks.js`, after its colour ramps and ASCII
  shapes, the numbers each with a unit; its share
  of the particle pool (`TWINKLE_SHARE`) and its air drag in `src/render/particles.js`.
- The rising floor's look and motion (flicker, crawl, `RISE_DEPTH`, `SURFACE_ROW`) at the
  top of `src/render/risefloor.js`; how fast it rises is Difficulty, above.
- The speed streaks, NOT in `constants.js`: in `src/render/streaks.js`, each zone's tones
  (`TONES`, with the backdrop measurements they were chosen against), the speed curve
  (`V_A`, `V_K`), length (`LEN_BASE`, `LEN_SHUTTER`), how hard they crowd the sides
  (`BAND_POW`), the share of near lines (`NEAR_SHARE`), and how the pool follows the
  intensity (`TOPUP_BAND`, `SHRINK_S`); how many by particle setting is `STREAK_BUDGET` in
  `src/game/settings.js`.
  What drives them is `Game.intensity`.
- The HUD's skin per zone: `HUD_ZONES` in `src/render/hudpaint.js`; a zone's title: its
  painter in `src/render/titlepaint/`; a callout's word and the prestige badge: their
  painters in `src/render/calloutpaint/` (`badge.js` for the badge).

## Where the bodies are buried

Things in the play itself that took real debugging. Do not re-discover them.

| | |
|---|---|
| **Scores in the hundreds of millions** | The user asked for scores of a reasonable size rather than hundreds of millions. A chain paid floors x 60 x its step x (1 + 0.25 a trick): the last factor was on nothing the player saw and had no top, and a long chain is long in all three factors at once, so the payout grew as the CUBE of the chain. A chain at full momentum lasts as long as the player climbs; the bot's 5089-floor chain banked 3,777,933,653. A trick adds now, and the payout grows as the square (The score, above). Changing a score's scale leaves two stores holding the old one. The stats would have kept a HIGH SCORE no run could beat (`rescore`, on load). The replay store ranks the ten best by score and never evicts the best: ranked as they were, runs from before would have kept every new run out of the bests for good -- measured, a new run did not even rank among the ten (`SCORE_SCALE_SINCE`, read from the SIM_VERSION in each entry's fingerprint). `test-combo`, `test-achievements` RESCORE and `test-replay` 8, each seen to fail without its fix. |
| **Momentum deadlock** | Twice. The meter's threshold must be against the CURRENT speed cap, not the absolute one, or you cannot build speed without speed. |
| **Overdrive filled the momentum meter** | The combo bounce's allowance lets vx exceed the earned cap, and the meter's run fraction was `\|vx\| / vxMax` with no ceiling -- so at 559 against a cap of 190 it charged at twice `MOM_UP`. Capped at 1: overdrive is a bonus on top of flat out, not a second way to earn the meter. |
| **A wall tap was a brake** | The combo lift was paid in full on any wall contact over 80 units/s, so at full boost flicking into the wall bought 345 units/s of lift per tap and held a two-second fall to a third of its distance. It is paid in proportion to impact speed now, and `test-physics` fails if a tap earns the full kick. |
| **The held chain never ended** | `instaChain` reset only inside the jump branch, on a jump taken without the key held -- so releasing the key and walking away left the count standing forever. It also counted landings that went nowhere, so holding jump while pinned against a wall farmed CHAIN x10 on one platform. It now breaks on touching down unheld, or on landing without gaining a floor. `test-physics` used to assert the farming behaviour as correct. |
| **`FLOOR IN 11.3`** | A distance in floor-heights labelled with a temporal preposition, so it read as seconds -- and it never counted down either. `riseY` was clamped every tick to trail `run.maxFloor` by `riseLead()` (it eases there now, at `RISE_CATCHUP`), and maxFloor updates earlier in the same `step()` than the clamp, so standing on your best floor it was pinned at exactly `riseLead()/30`. Past floor ~405 the lead has closed under 90px and it sat locked red on `2.1` for the rest of the run. Replaced by a bar, which had no units to get wrong -- and the bar has since gone too, at the user's request: the floor on screen, the red band, the vignette and CLIMB! say it. |
| **`danger` saturated** | Normalised by VIEWPORT height (~115 px) against a killline lead of 340 px, so it pinned at 1 and stayed there. The FALL ROOM bar driven by it (since removed) never moved, the vignette almost never fired, and the three effects reading it disagreed with each other. Normalise by `riseLead()` -- the room the game is actually giving you -- and it means something, moves, and tightens by itself as the lead shrinks. The vignette and band thresholds were retuned to match (0.7 to 0.5, 0.45 to 0.30). |
| **`shoutT` never decremented** | Assigned in three places, decremented in none, so the first callout of a run stayed on screen until the player died. |
| **`lastAnnouncedFloor` never initialised** | `p.floor > undefined` is always false, so the eight height callouts were dead code from the day they were written and nobody noticed, because four other callout sources were firing over the top of them. |
| **A test that was green because it tested a copy** | `ComboTracker`'s constructor defaulted to `DEFAULT_TIERS`, a private copy of the combo ladder kept inside `combo.js`. `flavour.js` was rewritten into a heraldic register and that copy was not, so `test-combo.mjs` -- which constructed the tracker with no argument -- spent several commits asserting NICE, SUPER and INCREDIBLE, names the game had stopped showing. It passed the whole time. The default is deleted and tiers are now required, because a default that can silently disagree with the real thing is worse than no default. |
| **Clearing awards does not clear awards** | Every award is gated on a lifetime stat, so emptying `all.achievements` and saving re-stamps every one of them on the next death -- the board clears and refills itself inside one run. Clearing the gating stats too fixes that but leaves the rest of the page covered in numbers, which reads as the reset having failed. `Stats.reset()` and nothing else. |
| **The speed trail read as reflections** | Reported as strange reflections. It redrew the CHARACTER four times, so every copy brought a hat, a face and a robe with it -- and the offsets were four world units against a sixteen-unit-wide sprite, so four copies spanned less than one body and stacked into a striped slab. Worse, it offset along X only, by `sign(vx)`, while most of his speed is VERTICAL (899 units/s against a horizontal cap of 430): on a launch the copies sat shoulder to shoulder at the same height, the one arrangement that cannot read as a smear. It is now a flat SILHOUETTE (`ghostAtlas` in `sprites.js`, baked at load like the font) laid on the path he was actually drawn along (the row *A trail that hung under him* below). Silhouettes overlap into a smear instead of into detail, so tight packing is fine and the trail curves through the arc on its own. |
| **Alphas that look low and are not** | The first silhouette version used the old trail's 0.07 rising to 0.205. Four copies that tightly packed overlap almost completely and COMPOSITE: 1 - prod(1 - a) = 45% white, a solid grey wedge about as heavy as the character. Stacked alpha is the number to reason about, not the per-copy one. 0.025 rising to 0.079 stacks to 19%. |
| **Speed streaks drawn as glass** | The other half of the strange reflections. Each streak was ONE solid bar, up to two world units wide with hard ends, at up to 0.80 alpha -- and drawn AFTER the platforms, so a bright translucent rectangle sat on top of solid stone and read as glare on the ledge. The fix then was two bands, a long faint tail and a bright head at the leading edge; they have since been redrawn as thin lines at art resolution (`streaks.js`, the next row). For a while they still passed over the ledges, each line a notch one or two pixels wide across the lit top rather than a patch of glare; once they had to stand out from every backdrop across the whole width, a line was brighter than a dim zone's lit ledge row, and they went BEHIND the ledges (946073b; the draw order is in [ARCHITECTURE.md](ARCHITECTURE.md)). They still travel UP the screen, because the camera is climbing. |
| **Speed lines that read as rain** | Bars 4 or 8 px wide, short, alike and spread evenly read as rain in a still frame -- and the first redraw, one art pixel wide, read as FINE rain: 220 lines of 16 to 256 px over the whole screen with near-white tails at full tilt, judged in a DUNGEON frame flat out, which is the frame most players see (the attract bot is at full intensity from its fifth second). Thinness was never the cue. The second redraw (b963047) FRAMED the scene: two bands down the sides, the middle of the shaft left clear, long comets with length, speed, width and brightness from one depth per line, and a tail in the zone's colour, since a pale colour at low alpha over a coloured backdrop lands on grey, which is the colour of rain. The player's verdict on that: they should cover the middle as they used to, speed up much more with speed, and stand out from the background -- flat out was only 1.3 times faster than fast, and each zone's tint was its backdrop's own hue a few steps lighter. Now (946073b, 9c2c6fc) they spawn across the whole width, weighted to the sides; rise at 445 e^(2.68 I) px/s, about 1,300 quick, 2,900 fast and 6,500 flat out, each step more than twice the last; lengthen with speed; and take per-zone tones chosen against that zone's backdrop measured in real frames, with a one-pixel dark rim, opaque, and never brighter than the zone's ledges. What keeps a screen of thin lines from being rain now is that they rise, fast, at many speeds at once -- judged in strips of consecutive frames at 160 Hz, not in stills -- and they sit behind the ledges ([ARCHITECTURE.md](ARCHITECTURE.md)). Judge an effect at the moment most people will see it, and in motion. |
| **A flat line under a sprite with depth** | The bottom of the shaft was one lit pixel over a dark band. These sprites are illustrations with perspective in them -- he lies at an angle, his shield is nearer the viewer than his boots -- and a one-pixel rule is a wall edge seen straight on, so the eye decides the figure is hovering however precisely it is anchored. The floor is a receding SURFACE now, and it recedes UP the screen: drawn downward, those bands are the front of a step and he is standing on the nose of it. |
| **What flashed as he fell into the fire** | Reported as things flashing, or appearing and disappearing, at the catch, and invisible in every screenshot tool: they draw one frame a shot, and the death is a camera plunging at terminal velocity. Every cause was a state change handled in one frame: `danger` returned 1 the moment he died, so the band and vignette switched off at full strength one to six frames after coming on; `die()` fired the landing's celebration (white flash, confetti, a "+24000" floater, a taunt nothing drew); the fall's wind lines switched on and hopped per frame; the streak pool was cut to length (65 of 110 lines gone in one frame); frozen companions jittered between stale interpolation ends; the prompts blinked on the screen's clock; the HUD switched off mid-read and came back under the scoreboard. Each lets go over time now (the death section above). For every element a state change adds, removes or re-keys, ask what it does in the first frame of the new state. |
| **A warning that flickered with his own speed** | The first fix for CLIMB! blinking up in a death tested time-to-contact every frame -- and that time includes his own fall, so hopping near the fire switched the word on at every landing and off on every drop: 7 returns within 0.2 s in 400 s of play near the floor at floor 60 (none before), 15 of 34 showings under 0.1 s. The death flash was gone and live play flashed instead; the fix's own check had only looked at deaths. Latched: the time test decides only whether it comes up, and it stays until `danger` is back to `CLIMB_CLEAR`, a little past where it came up -- no returns, 5 short showings of 24, each a landing in the danger and a jump straight out. Measure a warning's episodes in play near the hazard, not only at the moment it was reported. |
| **A fade that showed the numbers jump** | Fading the live HUD out after the catch would have shown the score leap and the chain's meter vanish, because `die()` banks the chain in the same frame. `die()` takes `Game.hudHeld` first -- the score, a copy of the combo, CLIMB! -- and the HUD's exit is drawn once from that into a layer. A fade has to start from what the player was looking at, not from the state the change has already moved to. |
| **A no-snap test that could not see a snap** | The death test compared the QUADRANT a piece was drawn in before and after it stopped. Pieces draw in whole quarter turns, so any jerk under 45 degrees drew the same and passed; a deliberate +3 rad/s mutation sailed through. It measures the angle itself now, and fails on that mutation for all 528 pieces. Mutation-test the test. |
| **A trail that hung under him, then a halo that broke in the roll** | The silhouettes went on a straight line back along -v, 9 ms a copy of his CURRENT drawing: on every launch they hung 28 units -- his height -- under his boots, a straight line where his path curves, trailing far behind him where the user expected it on top of him. A halo round his own outline replaced it (1f57f1d): on him, but not the look, and in the roll it broke -- drawn only where he is, it jumped with the ball of him at every quarter turn and left nothing where he had been, its trailing side up to 153 degrees off where he had come from. The copies now lie on a record of where he was DRAWN, each in the pose, facing, squash and quarter turn he had there, capped at `GHOST_GAP` of path a copy (`afterimage.js`). What made the roll look broken under both was the tuck's pivot (*A roll about the cell's centre* in [DUKE.md](DUKE.md)), and the suite had passed that too: its bar was that the farthest copy overlapped him at all, and it kept 2% of him. It asks for 35% and 20% now. A bar of "at all" is no bar. |
| **The fall that showed the tower** | Rendered every frame at 160 Hz through real deaths, the plunge after the catch showed the ledges over him with their furniture, a companion frozen on one, the combo trail, the streaks turned into the plummet's -- 109 thin orange lines by the pit -- and, once he dropped out of the crust's underside, the tower BELOW the fire, hidden the whole run, scrolling up past him. Cutting it all at the catch would have been one more thing that switched in one frame (*What flashed as he fell into the fire*, above); it burns over `BURN_T` instead, and what the crust covered is simply not drawn. The crust's end had to be held as well: caught high on the screen, it would have ended `RISE_DEPTH` of the view down and come up from under the screen in that frame, so it keeps the depth it had at the catch (`Game.crustDepth`). |
| **A let-go that never let go, and one that let go at once** | The first version of the clear fall eased the streaks' intensity toward zero at 3 a second: an easing never arrives, and the last lines were still retiring 0.8 s into the fall. It put the particles out together, a whole chain's stars in one frame. The streaks now go to none in a straight line over `STREAK_LET_GO`, and each particle keeps how far through its life it is and runs the rest inside `FALL_LET_GO`. To finish inside a window, go linearly or keep each thing's own progress; an exponential never finishes and a shared deadline is a pop. |
| **A camera that stopped him dead** | The fall's camera was a lerp toward him with a hard clamp keeping him above 18% of the view. At terminal velocity the lerp lagged 0.47 of a view, so the clamp was what held him, and it took over about half a second in: he slid down the screen at 800 px/s and stopped dead inside two frames, the world jumping from 22 to 29 px a frame, in every death. It is a critically damped spring fed his speed and acceleration now, so only its acceleration changes at once, and it is drawn interpolated like the Duke. A clamp under a lagging follower is the follower, and it is a wall. |
| **A new run that carried the last fall** | The clear fall's fields (`fallPace`, the fall camera's speed) were set in `die()` and not reset by `newRun`, so a Game that had died before began its next run carrying the last fall's pace, and the camera speed was left `undefined`, which a snapshot copy does not keep as a field. Invisible in play; found at the merge by the replay suite, which plays a replay on a fresh Game and compares the two value by value. `newRun` starts the death's own state level now. Every field a new state sets must be reset where the run is, not only where the state begins. |
| **A badge that only drew headless** | The prestige badge never drew in the game. Its placement read the word's frames off their canvases' `data`, which only the headless canvas keeps; in Chromium, staged into the second lap, `renderer.draw` threw a TypeError in all 192 frames SWIFT x2 was up -- no badge, and the vignette and flash after it skipped in each -- while every suite passed, because every suite runs on the headless canvas. What the placement needs is measured off the painting while the build still has it; `test-callouts` makes every stored canvas throw on `data` and places every badge. Anything read back off a canvas must be something a browser's canvas has. |
| **A zone and a callout on one landing** | A hop from 1299 to 1315 crosses ABYSS at 1300 and RAMPAGE at 1310, and at speed most hops over that boundary do. The best floor is raised before the zone is looked at, so the callout always went first -- RAMPAGE shouted over a backdrop already changed, ABYSS's name 1.6 s after its flash -- and the other way round when the hop happened to land on 1300 to 1309 first: the order depended on how long the hop was. They arrive in height order now, GLORY on the lap's top floor still first; `test-milestones` pins both one-landing cases. |
| **The meter's multiplier printed across its label** | The meter's clamp kept the chain's count off the FLOORS label but not the multiplier line under it, which sits 16 units down under a three-digit count, not 9: at a nearly empty meter "x11.5" was printed across "FLOORS". Rare while the meter pinned full past 350; once it filled toward every next step, it happened on every step of every long chain. Scale 2 stops four units higher, and `test-milestones` draws the HUD with and without the line at nine chain lengths. |
| **A tap before landing was eaten** | Reported as the game feeling too slow, with a request for jumps that feel faster, after JUMP SPEED had already made his physics faster; two reviewers found a tap 4 to 100 ms before touchdown doing nothing at every speed, in every build. `Player.step` called `consumeJump()` every step, so a press in the air with no air jump to spend was taken there and dropped, and the jump buffer -- whose whole purpose is a press a few milliseconds before touching down -- was empty on landing. Only a held key jumped. Every suite passed: the bot presses only where it can jump, and the human-like replay session only checked that a replay equals its run. A press is taken now only where it makes a jump (the section *The jump* above); 864 of 864 taps inside the buffer were eaten before, 0 after (`test-tapjump`, which puts the old call back as a mutant). A buffer is only as good as the rule that empties it: test the press THROUGH the buffer, timed against the landing, not the buffer alone. |
| **A death-tap jumped at the next run's start** | Found by the verifier of the tap fix, which left it as "nothing clears the buffer when a run starts, by reading the code, not measured". Measured: a tap in the air 1, 5 or 20 steps before the fire took him (nothing to spend, so it now WAITS) sat frozen in the buffer -- only PLAYING steps count it down -- through the fall and the scoreboard, and he jumped on the next run's first step, 3 of 3, when that run was started with Enter, the pad's Start or from the menu. The build before never did: it had taken and dropped the press in the air. A panicking player mashes jump as he falls into the fire. `Game.newRun` now drops a press that already waited through a step of the last run (`Input.dropStaleJump`, passed through a recorder still in front); a press made after the last step -- the SPACE that starts the run, a key on the pause screen -- is kept as before. When a rule makes an input WAIT, list every way its wait can end other than the event it waits for: a run's end, a quit, a menu. `test-tapjump` section 7, with three mutants. |
