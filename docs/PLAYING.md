# Playing Duke Vytis

*The whole game as a player meets it: the controls, how a run plays, the options, the title
screen, the stats and all 28 awards. The short version is in the
[README](../README.md).*

## Controls

| | |
|---|---|
| Move | `←` `→` or `A` `D` |
| Jump | `Space`, `↑`, `W` or `Z` |
| Instajump | **hold** jump — re-fires on every landing |
| Double / triple jump | tap jump in mid-air — **only with the meter at MAX** |
| Wall bounce | hit a side wall while airborne |
| Skip the fall | `Space` while falling |
| Pause | `P` or `Esc` — keeps the run, stops the music; `Q` there quits to the menu |
| Stats | `S` — four pages, `←` `→` between them; `R`, then `R` again, wipes awards and stats |
| Graphics | `O` · Fullscreen `F` · Help `H` · Mute `M` |
| Quit | `Esc` on the menu |

On a **gamepad** (any pad the browser maps as standard — every common pad, the Steam
Deck's included):

| | |
|---|---|
| Move | D-pad or left stick |
| Jump | `A` — hold to chain, tap in mid-air for the air jumps, as with the keys |
| Start a run · Pause | `Start` (or `A` on the title) · `Start` in a run |
| Skip the fall | `A` while falling |
| Menus | D-pad or stick to move (held, it repeats), `A` to choose, `B` to go back |
| Stats · Help · Graphics | `Y` · `X` · `Back` |
| Quit to the menu | `X` on the pause screen |

On a **phone**, held sideways (upright it asks you to turn it), the game fills the screen and
the title screen is buttons: TAP TO CLIMB, and OPTIONS, STATS, REPLAYS and HELP under it. In a
run a JOYSTICK at the bottom left runs him, a big SPACE jumps (hold it to chain) and ESC pauses;
the same joystick moves through lists and changes options; and along the top are whichever keys
the screen you are on names -- S and Q on the pause, R and G on the scoreboard. **MOVE WITH** in
the options swaps the joystick for < and > buttons (slide your thumb between them), and **TOUCH
KEYS** makes the run keys bigger or smaller (80% to start). A phone draws at 60 frames a second
with the eye candy toned down; FRAME CAP and PARTICLES in the options can take it higher.

`B` on the title screen quits, as `Esc` does. Pulling the pad out mid-run pauses it. The
keys and the pad work side by side, and one controller that the system shows twice (as
Steam Input can) plays as one.

## How it plays

**It starts in a box.** The shaft is 208 px wide and the camera sits close. As you climb,
combo and build speed, the walls move outward to 448 px and the camera zooms out from 2.0
to 1.0 — from four and a half visible floors to nine. The shaft only ever opens, never
closes, so nothing you have already committed to can be taken away.

**Run to fly.** Holding a direction fills the SPEED meter. A full meter raises your top
speed *and* your jump height — a standing jump clears 2 floors, a full-speed one clears 9.

**Hold jump to chain.** Keeping the jump key down re-fires the instant you touch down, with
a small bonus. Chained landings keep momentum you would otherwise shed, and every third
link in a chain pays into the combo's style bonus (below). It is a different style from
tapping, not a strictly better one — see air jumps.

**Air jumps are earned.** The double and triple jump only exist while the meter is pinned
at maximum, and they arm at takeoff — the triple only once the current combo has climbed
250 floors. The HUD says AIR JUMP READY when they are available, and TRIPLE JUMP READY
once the combo has earned the third. Tapping in mid-air
spends them; holding jump does not, so the two styles trade off. With none to spend, a tap
up to about a tenth of a second before you land is kept and jumps the moment you touch down.

**The walls answer a combo.** A plain mid-air wall bounce keeps 94% of your speed and
adds a small lift. Inside a combo it does more, growing with the chain's length (a square
root, so the first fifty floors already buy four tenths of it, and all of it by 300): up
to 120% of the speed you arrived with and up to 300 units/s of extra lift. Two caps keep
it sane -- 559 units/s sideways, 1.3x the top speed, and never more upward speed than
the best plain jump -- and the lift is paid in proportion to how HARD you hit, so a tap
against the wall buys a fifth of it and cannot be used as a brake. The extra speed
survives: a combo bounce lifts your speed cap by the overspeed, and that allowance runs
out over about a second, so bouncing wall to wall compounds and stopping lets it go. With
no combo, a bounce is exactly what it always was.

**Combos end when you stop.** Land two or more floors above your last landing and a combo
opens; every hop after that must clear two or more as well, and standing on a platform for
more than 0.4 s ends it. The requirement used to escalate — every five links, 2, then 3,
up to 7 — because at full momentum nothing short of falling could break a chain. That was
the fix in the wrong place: it ended long chains for clearing a merely respectable gap,
which is not failing to chain but chaining slightly less well. Standing still was the
break the game was missing, and it is something the player *did*.

**Beat ZENITH and ascend.** Reach the top of the tower, floor 2300, and every jump goes a
tenth higher and he moves a tenth quicker, for the rest of the run -- THOU ART ASCENDED,
HIGHER AND SWIFTER; reach 4600 and it happens again (x1.21). The HUD keeps what you have at
the top of the screen.

**Style multiplies.** Air jumps, wall bounces and held chains each add a quarter to a style
bonus on the combo's payout (x1.25, x1.50, …), on top of the multiplier on the meter. It is
not shown while you climb, only paid when the combo ends, and style cannot open a combo on
its own.

**The camera never leaves you.** It follows in both directions, so falling is survivable:
you land lower, lose the combo, and carry on. What kills you is the rising floor below,
which arms the moment you leave the ground (`RISE_START_FLOOR` = 1), accelerates as you
climb, and never trails more than ~11 floors behind your best. It used to stop
accelerating at floor 453, a fifth of the way up the tower; it now carries on past that
on a slope about a tenth as steep, to the top of the cycle at 2300. Dithering costs too:
stand still for 0.7 s and it starts to hurry, reaching 3.2× its speed two seconds later.

**Losing is not a cut to a scoreboard.** When the rising floor catches you — at your
feet, exactly — you fall the length of the shaft on your back, screaming, tumbling, and
**bouncing off the walls** the whole way down, in one piece: crown on, shield and sword
still in his hands. If the run reached floor 200 you SPLAT — he comes apart where he
hits, each piece flying from where it was on his body (an arm from each shoulder), bouncing
on a light gravity, and settling lying down at a spot and a
rotation planned the moment he burst, so nothing snaps or sinks into the floor. The
further you fell, the more blood: a pool that spreads to a width set by the depth, marks
wherever a piece strikes, spatter. Short of floor 200 you are dazed, with stars going
round your head.

As the fire takes you it takes the tower too: the ledges on screen, their furniture and
any companion standing on them char, glow at the edges and burn away in a third of a
second, the speed lines and the sparks of the climb let go, the HUD fades, and you fall
alone down an empty shaft, the camera easing onto you — nothing vanishes in a single
frame. SPACE TO SKIP comes up on the way down; SPLAT or OOF, the verdict and the floor
fade in over the landing. The scoreboard appears only after you land and everything is
still, or after `Space`.

**The scoreboard is the zone's.** It is dressed in the zone the run ended in: GAME OVER
lettered the way that zone letters its own name — cloud in the storm, bone in the abyss,
gilt at the zenith, stone with a skull in the dungeon's O — and your numbers, records and
awards on panels framed in the zone's own HUD material, over the scene where you fell
under a veil of its dark. Every word stands on an opaque panel, so nothing of the death
— the body, the pieces, the blood, a companion — can ever lie across one.

**Every 200 floors everything changes** — sky, backdrop, and what the platforms are made
of. The first zone is half that, so the first change arrives early; the twelfth opens at
floor 2100 and the cycle ends at 2300. Twelve bands from BASEMENT to ZENITH, each with its
own platform art and its own furniture: cobwebs in the cellar, **skeletons and crossed
femurs in the dungeon** against a catacomb wall of burial niches, **trees growing out of
the planks** in the forest, reeds, lanterns, banners, lightning rods, bones, crystal,
drifting orbs, constellations, light. Each backdrop is three layers of parallax over its
sky, and over a zone's last twelve floors the whole of the next one fades in, so you see
the change coming. Past the twelfth band the tower does not stop — each further
cycle is a fresh deterministic shuffle, so it goes on forever without ever repeating a
band back to back.

**Each zone signs its name.** As you cross into a zone, its name comes up just below the
middle of the screen, lettered in what the zone is made of: cellar brick hung with
cobwebs, crypt stone with a skull in the O, a hedge of leaves with red berries, moss with
reeds and dripping bog water, a street's windows lit in the shape of the name, cut stone edged in
gold with the citadel's arms in the hollow of the D, white cloud with lightning cracking
out of it, bones, crystal, a sign of glowing orbs, constellations, and polished gold under
a sunburst. Each makes its entrance in its own zone's manner — dropped into place, grown,
puffed in, risen from the bog, lit up, cooled from white-hot — and is gone after a couple
of seconds.

**From floor 2100 the tower breathes.** As the last zone opens, the ledges start to
narrow, over seventy-five floors, until they are 24 units wide — the Duke's feet are 16 —
and then widen again over the next seventy-five, and do it again, every 150 floors, for
as long as you last. It is a function of the FLOOR, not of time, so no ledge changes size
while you look at it and every floor still passes the same
[reachability proof](TOWER.md). The checkpoints at each zone boundary stay full
width; the rare wide ledges shrink with the rest. A line of scripture tells you when it
starts to close and when it relents. The menu demo is exempt, so the title screen still
shows a flawless run.

**Companions.** From floor 350, and every 350 after, one of six blessed climbers is
waiting for you. They greet you with a call in the music's own key, climb alongside for
320 floors shouting encouragement in Shakespearean English (each voice babbling in its
own register), and then lose their grip and fall away before the next one — all but the
sixth, who joins at floor 2100 as the last zone opens and stays until the tower takes you. They climb the way
you do, hopping from one ledge to the next, and stay in the view with you. (The OPTIONS
screen, `O`, can switch them to GLIDE, the older rail they rode before, to compare.) Who
the six are: [docs/COMPANIONS.md](COMPANIONS.md).

**Combos, on a meter.** The counter up the left edge is floors climbed in the chain,
riding the top of the fill, and the multiplier beside it steps every 50 of them — x1.5 at
50, x2 at 100, and on for as long as the chain lasts, x5 at 400 — with the next step
printed under the bar (`x2 AT 100`), the meter emptying at each step and filling toward
the next. It used to count `hops`, one per landing, because floors lurch by two to nine a
landing; but a player watches how far the chain has carried them, not how often they
touched down. A step pays out without a word: a burst of sparks in the chain's colours, a
mark in the sound, the meter ticking over. The small words a combo throws — BOUNCE,
TWICE, THRICE!, CHASE and a banked chain's +score — are coloured by how far the chain has
got, from the same palette as the trail of stars it sheds. A chain is banked when it ends:
ten points a floor and twenty-five a trick (a double or triple jump, a wall bounce), times
the multiplier, so a 400-floor chain is worth about 30,000 — and every new floor is ten
more on its own.

**Seven milestones up the tower.** The game shouts seven words, and they mark how high
you are, not how long your chain is: SWIFT at floor 330, CHARGE at 660, SOARING at 990,
RAMPAGE at 1310, CRUSADE at 1640, THUNDER at 1970 and GLORY at 2300, the top of the
zenith and of the tower's first lap. Each is lettered in its own style, heavier, hotter
and brighter than the one before — a cyan italic sliding in, blue steel rammed in, a
glowing rise, red-hot letters on fire, the tricolour in gold under the Vytis shield,
violet struck by bolts, white-hot gold with rays — and each has its own fanfare, bigger
than the last. A zone's name and a callout never talk over each other: whichever arrives
second waits its turn. Survive a whole lap and the seven come round again 2300 floors higher, each with a
**prestige badge** beside it — a plaque of red enamel in a gold frame, x2 on the second
lap, x3 on the third — for a Duke who has not died yet.

**The HUD belongs to the zone.** The speed bar and the combo meter are framed in whatever
the zone is made of — brick and iron in the cellar, bark and leaves in the forest, marble
and gilt in the citadel, cloud with lightning through the fill in the storm, bone and a
skull in the abyss, crystal in the nebula, a gilt crown at the zenith — and the words and
numbers take that zone's colours, still in the game's own pixel font, on a dark outline
that holds them off that zone's sky. Three colours stay the same everywhere, because you
have learned them: gold for a multiplier and a record, green for a held-jump chain, and
CLIMB!'s red. The whole of it changes the moment you arrive in a zone, under the flash,
and nothing moves: the numbers are where they always were.

**When the floor gets close, the screen tells you.** There is no gauge for it. As the
floor closes in, the edges of the screen darken; once you have used up most of the room
it allows you, a red band pulses along the bottom; and CLIMB! comes up there while there
is still time to read it and get moving, and stays up until you are clear again rather
than coming and going with every hop. There used to be a bar down the right edge,
FALL ROOM, filling as the floor closed in, and before it a readout that said `FLOOR IN
11.3` — a distance in floor-heights wearing a temporal preposition, which never counted
down anyway, because the floor is held to trail your best by a lead set by how high you
are, not by the clock. Both are gone, and the right edge under the score is left clear
for the climb. (What was broken underneath the old meters:
[docs/GAMEPLAY.md](GAMEPLAY.md).)

**You can see how fast you are going.** As the run speeds up, lines pour up the screen
past you — a trickle when you are quick, a torrent flat out, and each step up in speed
sends them up more than twice as fast. They run across the whole width, thickest at the
sides, in each zone's own colours a step lighter than its sky (mauve in the cellar,
steel on the dungeon's stone, green in the forest and the swamp, neon pink over the city),
each with a dark rim to set it off, and always behind
the ledges, the Duke and the HUD, so they never cut through anything you are reading or
landing on. SPEED STREAKS on the OPTIONS screen (`O`) turns them off, and the PARTICLES
setting there sets how many. And the Duke leaves a faint afterimage as he speeds up: four
flat silhouettes of him on the path he actually took, each in the pose he had there, so
it bends through every arc, folds at a wall bounce and curls with a somersault without
ever coming away from him. AFTERIMAGES on the same screen turns it off.

**If it feels slow.** JUMP SPEED on the OPTIONS screen (`O`) — 100% to 140%, 120% the
default —
runs the Duke himself faster: the same jumps, the same heights and the same reaches, over
sooner, while the fire keeps its pace. It applies from your next climb, the scoreboard and
the REPLAYS list say which speed a run was played at, and the records are shared. LOW
LATENCY on the same screen hands the frame to the display by Chromium's low-latency path,
up to one frame less between a key and the screen; turn it off again if the picture
stutters.

**PLATFORMS** on the same screen sets how wide the ledges are: NORMAL (the default) or WIDE.
The gaps between them stay the same, so every tower is always climbable; only how much ledge
there is to land on changes. It applies from your next climb, and a race is run
on the width its ghost was.

**DIFFICULTY** sets the fire: EASY is how it always rose, MEDIUM (the default) rises faster
and follows closer, HARD faster and closer still. It applies from your next climb.

**GRAVITY** sets how heavy the Duke is: NORMAL (the default) is a little lighter than the
game was first tuned, LOW lighter still -- every jump higher and longer -- and HIGH a little
heavier, every jump lower and quicker, every ledge still in reach. It applies from your next
climb.

**Racing a replay** -- G on the scoreboard races your best run, R on the REPLAYS screen the
one you pick -- first lists the options that run was played at beside yours, each marked SAME
or DIFFERS, and asks whether to race at the run's own so the race matches: Y (A on a pad)
races at the run's JUMP SPEED, DIFFICULTY and GRAVITY, N (X) at yours, ESC (B) goes back. Only that
race changes; your settings are kept. The ledges are always the run's: a race is run on its
tower.

**What you hear.** The title opens on a brass fanfare — the game's call, the five-note
motif the climb's themes share — that turns into a song in thirds. The climb has three
themes, one for each stage of the tower (BELOW, THE WORLD ABOVE, THE HEAVENS), and the
music moves only with the tower: as each zone of a stage arrives the key moves a rung on
the next bar line, with the zone's chime on that downbeat, and never twice in eight bars;
the tempo follows the run's pace gently, never more than 2% a bar; and a theme plays
through at least once before the next takes over. When the fire takes you the climb is
cut down on its own next beat into the lament — a gothic organ and a music box, in the
key the climb was playing: a heartbeat quickening as you fall, an organ chord struck the
instant you hit the ground, and a slow, hanging loop over the scoreboard — which lets go
the moment you climb again. Everything you do is
heard, and anything with a pitch is in the key of the music: the jump, the air jumps, the
wall bounce ringing brighter the harder the combo drives it, a landing weighed by how far
you dropped, the chain's hops climbing a ladder up the scale, its payout, a fanfare for
each milestone, CLIMB!, the fire's roar and the Duke's scream, the body striking the walls
on the way down, the scoreboard's toll with a new record and an award after it, the
companions' calls and babble, and the menus. `M` mutes; MUSIC on the OPTIONS screen turns
the music alone off.

## The title screen and the opening guide

The title screen is not a picture: it is a second, live game, played by a bot
([docs/BOT.md](BOT.md)) — the zones, the companions, the death and all, though it
shouts no milestones and makes no sound of its own. The menu over it is painted in the
Duke's own colours, the crimson, gold and silver of the Vytis arms: the title on a crimson
plaque in a jewelled gold frame, **PRESS SPACE TO CLIMB** lettered in gold on a plaque of
its own with the Space key drawn as a real keycap, breathing rather than blinking, and the
selected row and tab in crimson enamel. Every word over the live game stands on a plate,
so nothing the bot or its companions do ever shows through a letter.

The first time you set off, six pages — the climb, speed is height, use the walls, the
double jump, combos, the floor — are drawn *over that live attract-mode game*, so each
page points at a mechanic and you watch the bot do it a second later. The gauges on those pages are the bot's real ones. Arrows to page, space to start.

It fires on your first **climb**, not at the menu: at the menu it was a wall of text
between the player and the game before they had asked for anything. If you go and read
the instructions yourself first, it never appears at all. Replayable from the OPTIONS
screen (`O`), under HOW TO PLAY.

## Stats

Everything is persisted to `localStorage` and shown across four pages: personal bests
and lifetime totals; per-run averages, style mix and a combo-tier histogram that counts
every combo; tower progress zone by zone on the real schedule (100 floors, then 200 each)
with best and recent run tables; and 28 awards. TOP SPEED is how fast you CLIMB, in
floors a minute over your best ten seconds -- it used to be a sideways speed labelled
px/s, which was neither the right quantity nor the right unit. Nothing is counted in the
renderer — the screen reads the same record that gets saved, so the two cannot drift.

A corrupt or blocked store degrades to a fresh record rather than breaking the game.

## The 28 awards

Under STATISTICS (`S`), on the AWARDS page. An award you have won shows DONE where its
requirement was; a new one is announced on the scoreboard of the run that won it.

| Award | What it takes |
|---|---|
| FIRST STEPS | Reach floor 10 |
| HOP TO IT | Perform 50 jumps |
| DOUBLE UP | Land 10 double jumps |
| START LINE | Total runs reach 5 |
| POCKET CHANGE | Score 1000 |
| BOUNCE BACK | 5 wall bounces |
| SECOND WIND | Reach theme two |
| WARM UP | Climb 250 floors |
| HALFWAY | Reach floor 1150 |
| COMBO PIONEER | 50 floor combo |
| TRIPLE THREAT | 10 triple jumps |
| VELOCITY | Hit 200 speed |
| TIME SURFER | Play 300 seconds |
| PACEMAKER | Run 2000 m |
| HIGH ROLLER | Achieve 5000 score |
| JUMP MANIA | Land 50 double jumps |
| STYLE POINT | 8 style in a combo |
| SPEED RUN | Survive 10 seconds |
| CENTURION | Climb to floor 100 |
| FREQUENCY | Complete 25 runs |
| SUMMIT SEEKER | Reach the zenith |
| COMBO LORD | 250 floor combo |
| MAX THRUST | Hit maximum speed |
| TRIPLE KING | 100 triple jumps |
| SCORE KING | Achieve 25000 score |
| OLD TIMER | Play for 3600 seconds |
| ENDURANCE | Survive 45 seconds |
| CORNER CASE | Use 75 wall bounces |
