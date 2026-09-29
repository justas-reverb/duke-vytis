# Companions — who they are, how they move, what each frame is for

The six climbers who wait at milestone floors, **as they are in the game today**: schedule, who
they are and what they say, what they do when he dies, sizes, the ten poses, how they move (and the seven designs before it).
Read this when you touch `src/game/companions.js`, their poses or where their feet go (`compsprites.js`), or a companion looks wrong in play.
See also [ART-BRIEF.md](ART-BRIEF.md) (redrawing them), [ART-PIPELINE.md](ART-PIPELINE.md) (importing), [DUKE.md](DUKE.md), [BOT.md](BOT.md), STATUS.md.

---

## What they are

The art is **IMPORTED** from the reference sheets in `Companions/`, one generated module
each under `src/render/companions/`. The procedural builder that stood here before is
deleted: it got them as far as "recognisable" and no further.

## When they appear

Six companions, one every 350 floors from **350**, each climbing with you for 320 floors
— except the last.

| # | id | joins at floor | leaves at |
|---|---|---|---|
| 1 | pilgrim | 350 | 670 |
| 2 | archer | 700 | 1020 |
| 3 | delver | 1050 | 1370 |
| 4 | ranger | 1400 | 1720 |
| 5 | halfling | 1750 | 2070 |
| 6 | **maiden** | **2100** | **never** |

The sixth joins exactly as the last zone opens and stays until the run ends. She will be
on screen far longer than the other five put together, so if only one of them gets the
extra pass, it is her.

Each one is spawned 40 floors before its floor, so it is standing there waiting rather than
materialising under your feet; it greets you when you are ten floors short, and joins when
you reach it -- your floor reaching its own, or your feet coming within half a floor under
its ledge. It loses its grip standing on a ledge, never in the middle of a
leap: the first time its feet are on a ledge at or past its leaving floor. (Under the
GLIDE option, which stands on no ledge, as the rail reaches that floor.)

## The six companions

One order of blessed climbers. Each was drawn on its own reference sheet, and the
`--idle` value below is the standing height each was imported to — which is how their
relative sizes are preserved.

### 1. THE GREY PILGRIM — `pilgrim`

An old hooded pilgrim in a grey robe, with a long white beard and a tall wooden staff
capped in gold. The first companion you meet, and the most obviously frail of the six.

- Hood, white beard, staff
- Imported at `--idle=130` (its standing height in art pixels)
- **Joins floor 350, falls away at 670**

### 2. THE LONGSHOT — `archer`

A lean archer in green, hood down, blond, carrying a strung longbow in one hand. The bow
makes his the widest drawing of the six (a 128-pixel cell), though he is lean in the body.

- Blond hair, longbow, a quiver on his back
- Imported at `--idle=129` (its standing height in art pixels), and `--open=400`: the bow
  and its string close off a pocket of backdrop that imported as solid navy in every pose
  carrying the bow. The flag clears an enclosed pocket only if every pixel of it passes
  the backdrop test; the module's `OPENED` counts, per frame, the pixels opened on
  purpose, and `tools/test-sprites.mjs` allows exactly those. See [ART-PIPELINE.md](ART-PIPELINE.md)
- **Joins floor 700, falls away at 1020**

### 3. THE STONE-DELVER — `delver`

A broad, short miner in deep red with a steel helm and nasal bar, a brown beard and a
pick over one shoulder. Built like a barrel — the stockiest of the six, and after the
halfling the shortest.

- Helm with nasal, brown beard, pick
- Imported at `--idle=114` (its standing height in art pixels)
- **Joins floor 1050, falls away at 1370**

### 4. THE HOODED KING — `ranger`

A tall figure in near-black, face lost in shadow under a deep hood with a gold circlet
on it. Two points of light where a face would be. The only one whose face you never see,
and the tallest of the six.

- Deep hood, hidden face, gold circlet
- Imported at `--idle=135` (its standing height in art pixels)
- **Joins floor 1400, falls away at 1720**

### 5. THE SMALL ONE — `halfling`

A small barefoot figure in olive green with curly brown hair, about three-quarters the
height of the others (102 px standing against their 114–135). Carries nothing.

- Curly brown hair, bare feet, no gear
- Imported at `--idle=102` (its standing height in art pixels)
- **Joins floor 1750, falls away at 2070**

### 6. THE SHIELD-MAIDEN — `maiden`

A warrior in pale mail with a winged helm and a round, gold-rimmed shield on her near
arm. She joins exactly as the final zone opens and **never lets go** — from there you
climb with her until the tower takes you.

Her shield carries **no device**. The Duke's arms are his; hers stays plain.

- Winged helm, round shield, blond hair
- Imported at `--idle=130` (its standing height in art pixels)
- **Joins floor 2100, never falls away**

Because she is the only one you keep, she is on screen longer than the other five
together. If only one of them gets an extra pass, it should be her.

## What they say

Each has eight lines in `src/game/compdialogue.js` — a greeting, six cheers and a farewell,
48 in all, in Shakespearean English. The local model wrote them and they shipped with zero
edits; see [../DELEGATION.md](../DELEGATION.md). The greeting comes as you approach and
again as they join, a cheer every 6.5 seconds after that (`SPEAK_EVERY`), cycling, and the
farewell as they lose their grip.

A line is **not** a speech bubble over their head. It was one for a long time, and every
version was janky for the same reason: the speaker travels a hop arc while the camera
scrolls underneath, six or seven hops a second at full speed, so the text moved twice a
frame on two axes. It is now a named banner fixed at the bottom middle of the screen
(`Renderer.drawCompanionCalls()`), fading in over 0.25 s and out over its last 0.45 s on
one curve, `callFade()` in `companions.js`, which the renderer and `freeze()` both read; two
speakers during a handover stack upward. `tools/test-companions.mjs` fails any line that
wraps to more than two lines. The banner is one of the menus' plates (`menuskin.js`
`mPanel`, a gold bead round an opaque field) with the name in gold and the words in argent,
in the menus' fine lettering, at the size the old flat box was (2026-09-29);
`tools/test-hudskin.mjs` section 5 measures it over every zone.

**When he dies** they stop where they are, and what they were saying fades out
(`Companions.freeze()` from `die()`, then `hush(dt)` each step of the fall and the
scoreboard; 71977f0). Nothing steps them in the death, and that used to freeze two things
half way. A companion caught mid-hop kept a previous position a step behind its current
one, and the renderer draws the blend of the two at each frame's own interpolation weight,
so it jumped 4-8 px every frame for the whole death; `freeze()` makes the two ends meet.
And a call kept its timer, frozen on screen over the fall and under the scoreboard; it now
runs out its fade from exactly as visible as it was -- a call still fading in, or a
greeting still waiting its turn, never brightens as he dies. `Game.step` no longer steps
them in the step that killed him either, which moved them on again, a step from where they
were drawn. SPACE TO SKIP comes up at the same spot bottom centre, so it waits
`SKIP_PROMPT_AT` (0.5 s) for a call's 0.45 s fade (a43d41e): at the catch it was drawn
through the fading box, two lines of text on top of each other.

**And they burn with the ledge they stand on.** From the catch the ledges on screen and
their furniture char and dissolve over `BURN_T` (0.3 s; [GAMEPLAY.md](GAMEPLAY.md),
`src/render/burn.js`), and the companions go with them, in the same pattern and time, and
are not drawn once it is over. A companion burns in its own pattern AND no later than the
ledge under its feet (`drawBurnColumns`, 9b0a326): each column of it takes the ledge's mask
row two art pixels under its feet, stretched up its height, laid over its own holes, so a
pixel goes at whichever comes first; a column hanging past the ledge's end takes the
end's. The tie adds no embers -- a band of ember colour stretched up a figure was a flat
orange slab across it -- since the embers of its own pattern already say it is burning.
One frozen mid-hop has no ledge under it and burns in its own pattern only.
`Renderer.drawBurning` draws them through the burn's layer.

A line becomes a sound too: the moment it shows (`callFade` above zero), the companion
babbles it in its own register (`COMPANION_KEY` in `src/render/compsprites.js`, wired in
`src/render/gamesounds.js`; see [AUDIO.md](AUDIO.md)). That table used to be a key each of
them lifted the whole music into while they climbed with you, dropping back when they fell
away; joining and slipping at their own moments, they moved the key mid-phrase -- 10 of 19
key changes in four minutes of the bot's run -- so since 4fbe0f9 they leave the music's key
alone.

## Their size

**Each companion has its own size.** The cell is **164 art pixels tall** for all six, but
the width is whatever the character is, forced even; the cell is what the biggest leap
needs, so the standing figure inside it is shorter.

That is not a style choice, it is arithmetic. `PX = 4` screen pixels per world unit, and
a companion's world size is derived from its art, never declared: `compSize(id)` is
`SPR_W / PX` by `SPR_H / PX`. One art pixel is one screen pixel, so the world size is the
art size over `PX` and there is nothing left to choose. For the shield-maiden:

```
world units = art pixels / PX
   width  = 108 / 4 = 27
   height = 164 / 4 = 41
```

| id | art | world | stands (idle0) |
|---|---|---|---|
| `pilgrim` | 108 × 164 | 27 × 41 | 130 |
| `archer` | 128 × 164 | 32 × 41 | 129 |
| `delver` | 114 × 164 | 28.5 × 41 | 114 |
| `ranger` | 94 × 164 | 23.5 × 41 | 135 |
| `halfling` | 74 × 164 | 18.5 × 41 | 102 |
| `maiden` | 108 × 164 | 27 × 41 | 130 |

Declare a size instead of deriving it and the art is resampled on its way to the
screen — the difference between the reference and a blurry impression of it.
`tools/test-companions.mjs` asserts the identity for all six. It also requires ten
distinct frames each, every one with its feet on the bottom rows of the cell.

### The Duke trumps them

He stands **177** art pixels in `idle0`; they stand **102 to 135**, which is 58% to 76% of
him, the ranger tallest at 76%. That is asserted, not hoped for, on both sides and against
the TALLEST of them: `tools/test-companions.mjs` fails if the tallest reaches him, and also
if it drops below 55% of him, because at that size the detail they were redrawn for stops
reading. His sizes are in [DUKE.md](DUKE.md).

### Matched by standing height

They were imported by matching their **idle** heights rather than their tallest frames.
Scaling by the tallest is right for one sheet and wrong across six drawn at six
different scales: it made the halfling exactly as tall as the shield-maiden, which is
the one thing their separate sheets were drawn to avoid. They stand 102–135 px, and a test
fails if that spread ever collapses — if the gap between the shortest and tallest standing
heights drops below 10 px. The import command, and why `--bgtol` is set per sheet, are in
[ART-PIPELINE.md](ART-PIPELINE.md).

### Standing on their boots

The importer bottom-aligns every cell on its lowest ink. For five of the six that is a
boot; for the Grey Pilgrim in `idle0`, `idle1` and `land` it is the tip of his staff,
planted one art pixel below his soles. So a standing pose is LOWERED onto its boots:
`COMP_BOOT_ROW` in `compsprites.js` gives, per companion and standing pose, the row its
lowest boot pixel is on, `COMP_FOOT_DROP` is derived from it (the rows under it, over
`PX`), and `drawCompanion` in the same file applies it -- where a companion's feet are is a
fact about the drawing, so the blit lives beside the art, and the renderer's
`drawCompanions` only picks the pose and the place. The four poses in the air (`jump`,
`fall`, `tumble`, `slip`) are not dropped: there is no ledge under them to be level with,
and a tumble pivots on the cell's centre.

The rows are written down, not computed. The Duke's are found by colour (`bootDrop`, see
[DUKE.md](DUKE.md)), but six sheets share no palette to vote with, and no count of ink
works: the staff's foot is 1 px wide in `idle0` and `land` and 5 in `idle1`, while a real
toe is 2 (the archer's `idle1`, the maiden's `run1` and `land`, the pilgrim's own `run1`),
so any threshold that drops the staff drops those toes. They were read by eye off x8 crops
(`node tools/shot-compfeet.mjs --art`), and `test-companions` pins them to the ink under
the boots, so a re-import that moves anyone's feet fails there on purpose: re-read the
crops, never paste the failure back into the table. Today only the pilgrim's three poses
move, one art pixel each; every other standing pose stands on its cell's bottom row. The
lone pixels a first look flagged under the archer's and the delver's `idle1` were read as
boot -- the archer's is that two-pixel toe -- and both stand on their bottom row.

## The ten poses

| # | Name | What it represents | Used in game |
|---|---|---|---|
| 1 | `idle0` | Standing at rest, waiting on their platform for you to climb up to them. | ✅ waiting, and standing between hops |
| 2 | `idle1` | A second standing drawing — weight shifted, hands a little lower — so the wait breathes instead of freezing. | ✅ alternates with `idle0` |
| 3 | `run0` | Running, one stride: leaning forward, legs split, hem swung back. | ✅ walking along a ledge |
| 4 | `run1` | The opposite stride, hem swung the other way. | ✅ walking, one frame per 8 world units walked |
| 5 | `run2` | A third stride, both legs closer, body at full lean. | ✅ walking |
| 6 | `jump` | Rising off a platform — knees up, arms driving, hem lifted clear of the legs. | ✅ every hop, while the ARC is rising |
| 7 | `fall` | Descending toward the next platform, legs reaching down, body tipped back. | ✅ every hop, from its apex down |
| 8 | `land` | The landing crouch, drawn at 61% to 78% of standing height and noticeably wider — the squash that sells the impact. The shield-maiden's is the exception (see [Honest gaps](#honest-gaps)). | ✅ on the ledge after touchdown |
| 9 | `tumble` | Curled tight, falling away after losing their grip. **Drawn rotated in quarter turns**, so it has to read upside down, and it should sit centred in the cell so it turns over rather than being flung. Today it does not: the importer bottom-aligns it like every other frame, so all six tumbles rest on the bottom row and turn about the cell's centre — see [ART-BRIEF.md](ART-BRIEF.md). | ✅ once they are spinning |
| 10 | `slip` | The instant they lose their grip — arms thrown up, body tipped back, wide eyes and an open mouth. The only pose with an alarmed face. | ✅ the moment before the tumble |

All ten are reachable. `node tools/shot-companions.mjs --play` renders real frames of them
in play on the attract tower -- three crops each of `idle`, `run`, `jump`, `fall` and
`land`, only while the companion is in view, each labelled with the pose, the state it was
chosen from and the gap to him in floors (into `companions-play.png`). `slip` and
`tumble` come only at a leaving floor, which it does not wait for; the pose sheet shows
those drawings.

### How the game chooses a pose

From the state, never from a guess:

```
standing          idle0 / idle1, alternating every 1.25 s
walking           run0 -> run1 -> run2, one frame per 8 world units walked
in the air        jump while the ARC's own vertical velocity is positive, fall after
just landed       land, 0.1 s at a walking pace, 0.02 s while he climbs (see dwellFast)
losing grip       slip, then tumble in quarter turns
```

They face the way they are moving, or toward him when they are not. The test checks the
pose against what they visibly did each step — not against the fields the pose is computed
from — and fails if more than 0.1% of frames disagree.

## How they move: stepping stones, aimed at where he will land

**Platform to platform, and nothing else.** A companion is always in one of two states:

- **standing** (or walking) on a real platform, feet exactly on its surface, 5 world
  units in from its ends -- or its middle 4 units, on a ledge too narrow for that;
- **flying** a parabola solved at takeoff from a point on one platform to a point on
  another. The position in the air is written as a closed form of the time since takeoff,
  so it IS the arc: no clamp, no ease, no re-aim.

**Where they aim.** Their **station** is 2.0 floors over where he will be while they lead,
2.4 under it while they trail, and never less than half a floor over the rising floor.
"Where he will be" is his own physics flown forward (`hisLanding()` in `companions.js`):
his arc against the real ledges, down to the first one he comes down on, and that ledge
from then on. Once he is falling it names the ledge he really lands on for every
prediction made 0.1 s out and 94% of those made 0.2-0.4 s out.
What it cannot know is an air jump he has not spent: rising with one in hand and more than
0.4 s from landing, it is right 47% of the time.

**Which ledge.** Every floor in the station's direction is a candidate, each flown at the
first legal flight time from the preferred one up, and each scored at **its own arrival**:
how far it lands from station at that moment, 225 world units for every second of flight
past the preferred one, and any part of the arc the camera will not show — the camera
flown forward along the same prediction (`camPath()`), and counted only beyond what
standing still would leave out of view. The best is taken if it beats standing where they
are. Within a floor of station, they stand.

**How long a hop is.** 0.3 s at his standing pace and 0.1 s at a thousand floors a minute
— and 0.1 s whenever he is rising with an air jump still to spend, because his arc is only
good until he spends it. **Gravity is the speed hack**: 1× his own standing about, up to 6×
at full speed and 10× when a hop needs it. Sideways speed is capped at **540 world units a
second** (the Duke's is 430); a hop the cap cannot make is not made — a nearer floor, a
longer flight (up to 0.45 s, `hopMax`), or they walk to the ledge first.

**Following him down**, only when they must and only when it is safe. A leader goes down
only if it would otherwise be over the top of the view as he lands, and only by a hop that
is over before he lands — he jumps again within hundredths of a second, and a leader still
coming down then is one he flies straight past. A trailer goes down only if he would
otherwise come down past it, and only to a ledge under where he will land. A hop down may
step off either end of the ledge they stand on, because one that starts over the ledges
below would land on them. No landing, up or down, is in the rising floor's path — its
catch-up after he lands on a new best floor included, and that means the landing he has
not made yet: the line is flown forward past his predicted landing (`risePath()`), and a
hop down must leave its ledge clear of it for 0.15 s after touching down.

**Joining.** They join when he reaches them: his floor reaching theirs, as before, or his
feet coming within half a floor under their ledge. He flies past a waiting companion in
one jump and lands ten floors on; joining only then set every climb off from under the
bottom of the view.

A **lead/trail switch is done by moving**, on a timer: each companion changes sides every
13 s (`roleTime`), up to 5 s later for some so two never swap together, and one crossing
per switch -- 4.6 a minute -- is the design. To drop behind, they stand and let him climb
past: ahead of station they hop down only while he is falling or climbing slower than 1.5
floors a second (`waitRate`), and then only as the rules above allow. To get ahead, they
hop past him.

**On foot**, at up to 110 world units a second (`walkMax`): along their ledge toward a
landing too far sideways for one hop, to its end before a hop down, and out of his column
when he is level with them.

**The GLIDE option.** The OPTIONS screen has a **COMPANIONS: HOP / GLIDE** row, applied to
the game and to the menu demo alike. GLIDE is design 6, the rail, as it shipped
(`stepGlide()`, its numbers in `GLIDE`) but for one change: its `vy` is the bounce's own,
not the rail's added in, so the pose follows the bounce you can see. It is there so the two
can be compared in play; everything but the movement — waiting, joining, the side they are
on, slipping, what they say — is shared, and switching mid-climb moves nobody further in a
step than the hops' own caps. A switch to HOP hands over only onto a ledge — already
standing on one, or by a solved arc inside every cap (`handOver()`) — and until such an arc
exists they keep gliding; the longest wait measured is 25 steps, a tenth of a second. HOP is the default and
the only one the test holds to the rules below.

### Eight designs

The assertion that mattered changed with each one. That is the reason
to write them down: the metric the previous test measured was never the one that was wrong.

| Design | What it bought | What it cost |
|---|---|---|
| **1.** Fixed 0.32 s parabola + clamps | Always on screen | A clamp on a position is a **teleport** |
| **2.** A real bot playing a real character, clock as the only cheat | Per-frame continuity; the run cycle appeared for the first time | **100 crossings a minute**, 30% off screen |
| **3.** Steering that bot harder | — | Fourteen-point sweep; every lever traded one number for another, one for one |
| **4.** Committing to a side; jumping when he jumps | The commitment is kept | 86 crossings a minute |
| **5.** Solved arcs to chosen platforms, at his gravity | Zero rescues, arcs always arrive | 74 crossings a minute, 49% off screen |
| **6.** The rail: height an eased function of his, a bounce on top | 4.9 crossings a minute, 0.4% off screen | **"Jumping from nothing"**: 0% of hops touched a platform. **"Teleporting"**: a role switch in 0.04 s, 2569 world units a second sideways. Poses contradicting the motion on 29% of frames. Kept as the GLIDE option |
| **7.** Stepping stones, aimed at his average climb | Every hop ledge to ledge, speed caps a person could run at, poses from the state | 26.1 crossings a minute and 13.1% off screen on the attract tower; **52.6 and 23.1% on the human tower** |
| **8.** Stepping stones, aimed at where he will land | All of 7 — and **4.4% off screen and 15.7 crossings a minute on the human tower**, 2.5% and 10.4 on the attract one (over fourteen runs, with the rising-floor fix: 4.3% and 16.8, and never in the rising floor) | Still three times the rail's crossings, most of them him air-jumping past a leader in the middle of its hop; more walking to a ledge's end to get down |

### Why 7 missed: a straight line through a staircase

Traced frame by frame on the human tower, the leader was over the top of the view at the
same moment of every jump. He climbs a staircase: a rise of about fifteen floors in half a
second, then a pause — top out, drop a floor or two onto a ledge, stand, jump again. The
view follows the staircase. Design 7 predicted his arc only while he rose faster than his
average climb, and his **average** after that — eleven floors a second — so at every pause
a leader hopped to where a steady climber would be, while he stood a floor below where he
had topped out. A line through a staircase fifteen floors a step is seven or eight floors
from it at either end of every step, in a view nine floors tall.

It was never the hopping. The same hops, aimed at where he will land, are in view 95% of the
time.

### What each direction bought

Every row measured the same way: the human tower over three seeds of 150,000 frames each,
the run restarted on the next seed when the bot dies, and the attract tower over two seeds
of 60,000, one process at a time. The harness was a scratch one and is not in the repo;
`tools/tune-companions.mjs --frames=150000 --seeds=3` counts both numbers by the test's
rules (see [Tuning knobs](#tuning-knobs)). Each row adds to the kept rows above
it. Off screen / crossings a minute.

| Change | Human tower | Attract tower | |
|---|---|---|---|
| Design 7, as it was at `5f96899` | 23.1% / 52.6 | 13.1% / 26.1 | |
| His **landing** as the prediction, flat after it | 14.4% / 36.5 | 8.5% / 18.0 | kept |
| — his average climb added after the landing | 15.3% / 47.9 | 11.8% / 63.2 | no |
| Every ledge judged at its **own arrival** time | 12.5% / 19.8 | 10.8% / 7.9 | kept |
| (a) Station = the middle of the view's free band on his side | 16.1% / 24.8 | 12.1% / 11.2 | no |
| (a) The same, the leader a fifth of its band from him | 7.9% / 34.2 | 5.2% / 16.0 | no: a trade |
| A cost search over the whole flight against the view and his side | 14.7% / 24.6 | 15.4% / 8.2 | no |
| (b) Hop down whenever he is falling | 10.2-10.6% / 31 | 10.0-10.4% / 15-16 | no, and 29-186 frames in the rising floor a run |
| (b) Hop down only if it is over before he lands, clear of him and of the rising floor | 11.5% / 19.4 | 10.7% / 8.2 | kept |
| (d) One long hop shadowing his arc once he has no air jump left | 11.4% / 20.5 | 9.1% / 8.5 | kept, then taken out: see the end |
| Trailer 2.4 floors under him, not 3.1 | 8.7% / 23.0 | 5.4% / 8.5 | kept |
| A hop down may step off either end of its ledge | 8.1% / 22.1 | 5.5% / 8.5 | kept |
| Hop short while he can air-jump; 150 a second of flight charged | 5.6% / 20.8 | 3.9% / 14.0 | kept |
| Join when he **reaches** them | 4.3% / 20.7 | 2.0% / 15.4 | kept |
| (c) A rescue hop after 0.3 s out of view | unchanged | unchanged | no: it changed no decision — the long absences were already gone |
| Flight out of the predicted view charged | 4.0% / 21.3 | 1.8% / 15.7 | kept |
| Hop down only when it is **needed** | 3.6% / 19.8 | 1.6% / 14.9 | kept |
| Allow for an air jump he has not spent (a third / half of one) | 5.5% / 15.0, 7.3% / 14.5 | 3.0% / 14.3, 4.4% / 13.2 | no: the same trade as a higher leader |
| Leader 2.0 floors over him, not 1.7 | 5.4% / 16.2 | 2.7% / 11.1 | kept |
| Cap a leader landing after his apex to the view as he lands | 4.3% / 18.0 | 2.3% / 13.4 | kept, then taken out: a trade |
| Flight charge 300 a second | 3.2% / 19.1 | 1.4% / 14.6 | |
| — without the shadow hop (d) | 3.0% / 18.9 | 1.6% / 12.6 | shadow hop out |
| — without the apex cap | 3.9% / 17.4 | 1.6% / 11.4 | apex cap out, for the crossings |
| Flight charge 225 | 4.4% / 15.7 | 2.5% / 10.4 | kept |
| The rising floor flown past his landing; riseHold 0.4 s → 0.15 s | see below | see below | **what ships** |

**The rising floor, found by the adversarial verifier.** "No companion under the rising
floor" held on the test's seed and on the implementer's five, and not in general: on 7 of
14 human-tower runs (eight starting seeds, 150,000 frames each) a trailer landed in it,
1-25 frames a run. Traced frame by frame, all three cases looked at were a trailer hopping
down while he fell onto a NEW best floor: the landing guard read the line's catch-up from the best floor
he had already reached, and his landing moved it. Flying the line past his predicted
landing fixed it — and made the 0.4 s it had to stay clear after landing, which had been
padding over that error, cost crossings (four seeds: 21.1 a minute). riseHold, same four
seeds: 0.4 — 3.95% / 21.1; 0.25 — 4.15% / 18.1; 0.15 — 4.35% / 16.5; 0.08 — 4.39% / 16.4,
all with no frame in the rising floor. Over all fourteen runs, before and after:
**4.5% / 16.5 with the rising floor entered on 7 runs, against 4.3% / 16.8 and never**;
eight attract runs, 2.4% / 10.6 both ways. Reading the new line into the station as well
was measured again and is still worse (5.1% / 16.9 at half a floor over it, 5.6% / 17.1 at
a whole one).

Every rule that ships was taken out once more at the end, to check it still pays (human
tower): the air-jump rule 7.7% / 18.8 without it; following him down 6.5% / 16.8; the view
charge 5.3% / 14.5; joining when he reaches them 5.4% / 15.2; stepping off the end 5.2% /
17.8; hopping down only when needed 4.9% / 15.7; the leader at 1.7 floors 2.5% / 21.5; the
trailer at 3.1, 7.3% / 14.6. The flight charge: 0 — 7.9% / 20.0; 150 — 5.1% / 15.3; 225 —
4.4% / 15.7; 300 — 3.9% / 17.4; 350 — 3.8% / 21.9; 450 — 3.6% / 32.1. Past 300 the crossings
climb steeply, so 225 sits back from that edge for half a point of view.

(a) became the view charge rather than the station: a station defined as a band of the
view was a trade along one line at every setting, but charging a hop for leaving the view
the camera will have pays on both towers. (b) and (d) are as described. (c) was measured
and changed nothing.

### It is measured

**The companions hop from a ledge to a ledge, and it is measured.** Every hop takes off
from a platform surface and lands on one, every arc is an exact parabola, every standing
frame is on a surface, sideways speed never passes 540 world units a second, no frame has
a companion under the rising floor, and the pose matches the motion on all but 0.004% of
frames — all asserted by `test-companions.mjs` over real play on BOTH towers: 60,000 frames
of the attract tower and 150,000 on each of two seeds of the human one (the second because
it is one on which the old rising-floor guard failed; the first never tripped it). And
where HE goes: on the human tower **4.6% off screen and 18.0 crossings a minute** on the
test's seed and 4.5% and 17.3 on the second (bars 6% and 20), on the attract tower 2.2% and
11.1 (bars 4% and 18). The same test fails design 7 on all four of those bars.

Those are the figures of the bot and the attract tower before 2026-09-29. That day the demo
left its ramp for a player's tower at the game's default settings, and the bot was rebuilt to
fly it ([BOT.md](BOT.md)); nothing in `companions.js` moved. On the attract tower -- the demo's
run now, 1,500 floors a minute with jumps of fifteen to thirty-five floors -- they measure
**5.9% off screen and 77.4 crossings a minute**: he goes past them on nearly every jump, as the
ascended bars already allowed of jumps that size (bars 8% and 90). Ascended, 11.7% and 75.4
(bars 17% and 85, unchanged). The rebuilt bot climbs the human tower faster too, without a
miss: 3.2% and 31.2, and 4.0% and 26.6 on the second seed (bars 6% and 40). Design 7 has not
been measured against the rebuilt bot, and the crossing bars would no longer tell the two apart.

### Before and after

The test's own seed, both towers. Same measurement code for every column. The attract tower
here is the ramp the demo climbed until 2026-09-29, and the bot is the one before its rebuild.

**Attract tower**, 60,000 frames, a thousand floors a minute:

| | Rail | Design 7 | Design 8 |
|---|---|---|---|
| Hops that take off from AND land on a platform | **0%** of 457 | 100% of 901 | **100%** of 751 |
| Standing frames on a platform surface | 3.9% | 100% | **100%** |
| Arcs that are an exact parabola | 0% | 100% | **100%** |
| Fastest sideways, world units a second | **2569** | 540 (the cap) | 540 (the cap) |
| Fastest vertically | 1792 | 2185 | 2186 (cap 2200) |
| Worst single frame | 7.5 | 9.2 | 9.2 |
| Frames whose pose the motion contradicts (the test's rule) | **29%** | 0.017% | **0.004%** |
| Crossings a minute (4.6 role switches) | **4.9** | 26.6 | 11.1 |
| Off screen | **0.42%** | 13.2% | 2.24% |
| Overlapping his body (before the rising-floor fix) | 0.79% | 0.52% | 0.25% |

**Human tower**, 150,000 frames, the bot restarted on the next seed each time it dies
(7 runs, about 700 floors a minute):

| | Rail | Design 7 | Design 8 |
|---|---|---|---|
| Hops that take off from AND land on a platform | 0% | 100% of 1,098 | **100%** of 1,132 |
| Standing frames on a platform surface | 2.5% | 100% | **100%** |
| Fastest sideways, world units a second | **2981** | 540 (the cap) | 540 (the cap) |
| Fastest vertically | 1792 | 2182 | 2184 (cap 2200) |
| Furthest across the SCREEN in 0.1 s, p99 / max (before the rising-floor fix) | 164 / 210 | 120 / 166 | 86 / 192 |
| Frames below the rising floor | 186 | 0 | **0** (and on every other run measured) |
| Crossings a minute (4.6 role switches) | **5.9** | 55.6 | 18.0 |
| Off screen | **0.63%** | 22.4% | 4.61% |

Over fourteen runs from eight starting seeds the human tower measures 3.6-5.2% off screen
and 13.7-19.2 crossings a minute (design 7, four of those seeds: 22.0-23.6% and 48.5-54.0);
over eight, the attract tower 1.8-2.8% and 8.0-13.2 (design 7, four: 11.5-13.2% and
19.2-26.6). Measured with an independent harness written by the verifier, not the one the
numbers above the rising-floor paragraph came from; on the same code the two agree to the
figure on the test's seeds.

An earlier figure — "2.7% off screen, 7.3 crossings a minute at a human pace" — came
from a scripted climber at **86 floors a minute**. Nobody climbs that slowly where a
companion is: past floor 350 the rising floor comes up at 260 floors a minute (450 by floor
2300) with two to four floors of slack, so that climber is dead within seconds. The bot's
~700 is the right order.

### Why the rail's numbers are still out of reach

The rail held 0.4% off screen and one crossing per switch because its height was a
function of his, updated every frame. A companion that commits to an arc and lands on a
ledge commits to where he will be for the length of a hop, and his air jumps are his own
business: of the crossings left, about half are a leader he flies past on an air jump it
could not see coming, and the leader passing back; about a quarter a trailer he falls past
on a miss and then climbs past again. Allowing for the jump in advance buys those crossings
with time off screen (the rows above).
For design 7 an oracle replay — the same hopper handed his exact future on the attract
tower — bounded it at 11.5 crossings a minute and 4.5% off screen with frantic 0.13 s hops,
and 59 a minute with natural ones. Design 8's arrival rule is not a planner for a known
future: handed his exact future on the human tower, an earlier stage of it did worse
(10.8% off screen and 31-33 crossings a minute, against 5-6% and 22-24 on its own
prediction), because it hopped up to meet jumps he had not made yet. Both bars the change
was asked to meet were met without one, so no new bound was taken.

### The numbers, and the ones that were fought for

`vyMax` is **2200**. Capped at 1600 a companion fell 290 floors behind in 40,000 frames
and never came back; at 2000 the cap bit on most hops and crossings rose from 25 to 30 a
minute. The cap is scaled — 1200 standing about, more with his pace and with every floor
they are behind — so against a slow scripted climber the fastest launch was 1582. At the
paces the game actually allows past floor 350, it reaches 2186.

`lead` is **2.0** floors and `trail` **2.4**, measured with the landing as the aim: the view
reaches about 3.1 floors over his feet while he rises (the camera trails him) and 3.8
under them, so the leader has the narrower band. A leader at 1.7 is in view more (2.5%) and
flown past far more often (21.5 a minute); a trailer at 3.1 — design 7's, with its aim — is
off the bottom 7.3% of the time.

`tPenalty` is **225** world units a second of extra flight: see the sweep above; past 300
the crossings climb steeply.

`hopFast` (**0.1 s**) is used whenever he is rising with an air jump still to spend. Without
that rule: 7.7% off screen against 4.4%.

`dwellFast` is **0.02 s**. At 0.05 s — the crouch visible for three frames at 60 Hz —
crossings went from 26 to 97 a minute under design 7. So at full speed the landing crouch
is a frame or two; only at a walking pace is it the full 0.1 s.

`joinReach` is **0.5** floors: they join as his feet come that close under their ledge.

A search that scored every candidate hop by its tracking error over the whole flight was
built for design 7 and measured 115 crossings a minute against 32 for the simple rule; one
built again for design 8, against the view and his side, measured 14.7% off screen and 24.6
a minute against 12.5% and 19.8 for scoring the arrival alone. Given the freedom, both
chose long arcs that fit a prediction nobody could make.

## Honest gaps

What is still wrong, measured. The open items that need a decision are also listed in
STATUS.md.

- **At a JUMP SPEED over 100% they fell behind him -- moved onto his clock on 2026-09-28**,
  when the default became 140% (the item as it stood follows). Their speed caps -- vertical,
  sideways, the glide's rail -- scale with his rate (`boostOf`), and so does their rhythm: a
  hop's preferred flight, the stand after it and the ceiling on the climb rate they read are
  divided by it (`paceOf`); the longest a flight may stretch stays in the world's seconds,
  because cutting it too cost the long catch-up hops (26% off screen at 160% against 19%). At
  100% nothing moved, to the bit. Measured as below (the human tower, 150,000 steps, off
  screen and crossings a minute), before and after: 120% 5.4% and 54 -> 5.5% and 26; 140%
  9.9% and 80 -> 6.1% and 41; 160% (not offered) 19.1% and 94 -> 15.4% and 64. SIM_VERSION 4.

  The item as it stood: **At a JUMP SPEED over 100% they fall behind him** ([GAMEPLAY.md](GAMEPLAY.md)). His
  physics runs s times as fast and theirs keeps the world's clock, as the brief for the
  setting asked; what reads HIM in seconds was converted -- `hisLanding` and `predictor` fly
  his arc on his clock and hand back the world's seconds, and `camPath` follows at his rate as
  the camera does -- so their plans stay true. Measured with this suite's own measures (the
  bot at the keys, the human tower, 150,000 steps each, 2026-09-28): at 100% 4.61% off screen
  and 18.0 crossings a minute (the suite's figures); at 120% 7.20% and 43.1; at 130% 8.54% and
  67.8 -- over the bars of 6% and 20 -- with none below the fire and every one of 1,121-1,252
  hops ledge to ledge at every speed. He simply outclimbs a hopper capped at 540 units a
  second. If the setting stays, their MOVEMENT on his clock too (their speech, their role
  timer and anything read by a player on the world's) is the fix to try, with the forecasts
  then left in his seconds.

- **At the attract bot's speed they scramble.** A hop every 0.3 s, up to 10 g, launches up
  to 2200 world units a second. It reads as sprinting, and it is still the fastest thing on
  screen: across the screen their median vertical speed is about 320 world units a second
  to his 53, because the camera follows him and not them.
- **Off screen 4.3% of the time on the human tower and 2.4% on the attract one** (the
  ramp's figure; on the demo's run since 2026-09-29, 5.9%), about
  85% of it a leader over the top edge: in the tenth of a second after he jumps again,
  while the camera trails him and the view's top edge drops to three floors over his feet,
  and after a miss of three floors or more, when no hop down can be over before he lands.
- **16.8 crossings a minute on the human tower, 10.6 on the attract one** (fourteen and
  eight runs; the worst run 19.2, a whisker under the bar of 20; the attract figure is the
  ramp's, and on the demo's run since 2026-09-29 it is 77.4: he passes them on nearly every
  jump), against the rail's 5.9 and 4.9. About half are a leader he flies past on an air jump it could not
  see coming, and the leader passing back; about a quarter a trailer he falls past on a
  miss and climbs past again. Allowing in advance for an air jump he has not spent buys
  them back with time off screen, and was left out.
- **Held at zoom 1.5, 40% off screen and 30 crossings a minute; at 1.25, 20% and 27** (the
  hops aimed at his average: 64% at 1.5). The stations are in floors, and at 1.5 the view is
  six floors tall. Stations scaled with the view traded it rather than fixed it (measured
  with the flight charge at 300: 22% and 65 at 1.5 against 38% and 39). The shaft ratchets open with floors (0.45 of the way by floor
  60), combos and momentum, so 1.5 at floor 350 means never having built either --
  unlikely, not impossible.
- **Walking is still not common**: about 2,300 run frames of 84,000 on the human tower (260
  under design 7), 300 of 50,000 on the attract one.
- **Joining under the rising floor** no longer happens that anyone has measured: they join
  as he reaches them, the test asserts no frame under the rising floor on either tower, and
  fourteen human-tower runs and eight attract ones measured none. (Five seeds had measured
  none before, while trailers were landing in it on half of the runs above; see [the rising
  floor](#what-each-direction-bought).)
- **The shield-maiden's `land` drawing is an arm-up leap, not a crouch** — taller than her
  standing pose — so her landings read as a second jump. The art, not the code; see the
  pose sheet (`companions.png`, from `tools/shot-companions.mjs`) and
  [ART-BRIEF.md](ART-BRIEF.md).
- **The shield-maiden never slips**, so her `slip` and `tumble` are unused. She joins at
  the last zone and stays until the run ends.
- **The halfling carries nothing**, and nor does the hooded king, whose hands are lost in
  his robe. The other four carry a staff, a bow, a pick and a shield.

## Where it lives in code

| | |
|---|---|
| The imported art, one module each | `src/render/companions/*.js` |
| Sizes, poses, canvas per pose, names, the register each one's call is voiced in (`COMPANION_KEY`); the boot rows (`COMP_BOOT_ROW`), the drop and the blit (`drawCompanion`) | `src/render/compsprites.js` |
| The reference sheets | `Companions/*.png` (converted from the artist's `.jpg`) |
| Which pose the game picks, and where it is drawn | `Renderer.companionPose()` and `drawCompanions()` in `src/render/renderer.js` |
| Where their boots end, blown up to read the rows from | `node tools/shot-compfeet.mjs --art`; `--ledge` for the real blit on a deck (flags in [TESTING.md](TESTING.md)) |
| What they say, and where it is drawn | `src/game/compdialogue.js`; `Renderer.drawCompanionCalls()`; a call's fade, `callFade()` in `companions.js` |
| What they do when he dies | `freeze()` (called from `Game.die()`) and `hush()` (from the death's `decayFx`) in `companions.js`; SPACE TO SKIP waits for a call's fade, `SKIP_PROMPT_AT` in `constants.js`; burning with their ledge, `drawBurnColumns` in `src/render/burn.js`, drawn by `Renderer.drawBurning`; held to it by `tools/test-fallclear.mjs` |
| When each joins and leaves, and how they move | `src/game/companions.js` |
| Their one random number, the bob's phase: from the run's cosmetic stream (`Game.fx`, handed to `new Companion`), never `Math.random`, so a replay's state matches the run's value for value (the `deterministic-replay` skill) | `Companion` constructor in `companions.js` |
| Where he will land, the camera and the rising floor flown forward | `hisLanding()`, `camPath()`, `risePath()` in `companions.js` |
| The GLIDE option | `stepGlide()` in `companions.js`, and `handOver()` for the switch back to HOP; the row in `src/game/settings.js`; applied to both games in `applySettings()` in `src/main.js` |
| The tests | `tools/test-companions.mjs` |
| The redraw brief | [ART-BRIEF.md](ART-BRIEF.md) |
| The import command | [ART-PIPELINE.md](ART-PIPELINE.md) |
| Pose sheet, baked from the live art | `node tools/shot-companions.mjs` (`--scale=N`, default 2: 2980 x 3008) -> `companions.png`; `--play` -> `companions-play.png` |
| The sweep | `tools/tune-companions.mjs`, see [Tuning knobs](#tuning-knobs) |

Nothing structural changed in code when the drawn art landed — the Duke had already proved
the path. The shared `COMP_W` and `COMP_H` are gone: `compSize(id)` in
`src/render/compsprites.js` returns each companion's own `SPR_W / PX` by `SPR_H / PX`, the
six generated modules replaced the hand-authored grids, and `canvasFor(id, pose)`
rasterises one canvas per companion per pose and keeps it. `tools/shot-companions.mjs`
re-bakes the reference sheet from whatever is actually on screen, into `companions.png` at
the repo root: every pose by name, and all six standing beside the Duke with each one's
height and share of his.

The one thing to watch: `COMP_W` doubling as both an art dimension and a world dimension
was exactly the confusion that made them chunky in the first place. `drawCompanion` now
draws each companion at an explicit destination size, `compSize(id)`, derived from its
art, and the identity asserted is the same one the Duke has (`BODY_W = SPR_W / PX`):

```
compArt(id).SPR_W === compSize(id).w * PX     (and SPR_H === compSize(id).h * PX)
```

## Tuning knobs

- **A lighter Duke gets a nearer leader** (2026-09-29): `lead`, 2 floors over where he will
  land, is scaled by his GRAVITY when it is under 1 -- 1.8 at NORMAL's 0.9, 1.6 at LOW -- since
  the same impulse carries him 1/g as high, the camera trails him further on the way up and
  the view over his feet shrinks with it. With the lead at 2, the attract demo at the new
  defaults had a companion off screen on 8.6% of frames, every one of them a leader's head
  over the top edge in its hop while he rose (a heavier `wView` bought only 8.3%, at more
  crossings); at 1.8, 6.6% and 79.5 crossings a minute, and 10.2% ascended (11.9). At 1 and
  heavier nothing changes, so every test at newRun's gravity measures what it did.
- Companions: `TUNE` at the top of `companions.js` -- stations, hop time and gravity by
  his pace, the flight and view charges, the speed caps. `node tools/tune-companions.mjs`
  runs twelve settings on one core -- the current ones and eleven one-lever changes to
  `lead`, `trail`, `tPenalty`, `wView`, `holdBand`, `hopFast`/`gFast` and `sideMargin` --
  on the human tower by default, restarting on the next seed when the bot dies
  (`--tower=attract` for a game with `demo` set -- the ramp until 2026-09-29, a player's tower
  at newRun's defaults since, where the bot does not die; `--frames=N`, default
  40000, and `--seeds=N`, default 1). It prints off screen, crossings a minute, the gap to
  him (p5 / p50 / p95), hops a second, the ledge-to-ledge share, the fastest frame each way
  and stranded frames, and ranks by off-screen percent plus crossings a minute. It does NOT
  check the rising floor, the arcs or the poses: a winner still has to pass
  `test-companions.mjs`. One 40,000-frame seed is noisy: take any winner to three seeds of
  150,000 before believing it. `GLIDE` holds the rail's own numbers and is left alone.

The values that were fought for, and what each cost, are in
[The numbers, and the ones that were fought for](#the-numbers-and-the-ones-that-were-fought-for).

## Where the bodies are buried

Things that took real debugging. Do not re-discover them.

| | |
|---|---|
| **An ease is not a speed limit** | The companion rail (design 6) eased toward a target, and an ease has no ceiling of its own: give it a target far enough away and it crosses the screen in one frame. Left unseeded it moved 600 world units -- twenty floors -- on the frame a companion joined. The same bug in another place: its sideways lane ease peaked at 2569 world units a second. Every motion in designs 7 and 8 is either a solved arc or a walk with an explicit cap (the rail survives only as the GLIDE option). |
| **The numbers were fine and the player hated it** | The rail passed every companion assertion -- 4.9 crossings a minute, 0.4% off screen, per-frame continuity -- and the report was "they jump from nothing and teleport". 0% of its hops touched a platform, it switched sides in 0.04 s, and 29% of frames showed a pose the motion contradicted. None of that was measured, so none of it failed. The test now measures what the player described: ledge to ledge, speed caps, pose against visible motion. |
| **A predictor that predicted the bot** | The best companion predictor on paper modelled his air jump at the instant the attract bot spends one. Against the bot it was near perfect; against the same bot held to short hops it put companions five floors over station, off screen two frames in three. A human spends an air jump when he likes. Predict the physics, not the player. |
| **A number measured on the wrong tower** | Every companion number was taken against the attract bot on the attract tower -- a ramp with ledges 1.6x wide, which no player ever climbs -- and the "human pace" figure against a scripted 86-floors-a-minute climber the rising floor would kill within seconds past floor 350. On the human tower the same design was 23.6% off screen and 50 crossings a minute, over the test's own bars for the other tower. `test-companions.mjs` now runs both. Measure on the thing the player will actually be doing. |
| **When no tuning can hit the number** | Against the thousand-floor-a-minute bot, companions that must land on ledges never got near the rail's crossing rate. Before tuning further, a replay run gave them his EXACT future: even then the best was 11.5 crossings a minute, and natural hops 59. That settles it in one run. An oracle bound is cheap -- record one run, replay it -- and it is the difference between a tuning problem and a design limit. |
| **A follower placed by `player.floor`** | His floor is the last floor he TOUCHED and trails his real height by three or four while climbing. Measured: a companion on floor 392 sitting 46 world units BELOW a player whose floor read 390. Anything spatial uses `player.y`. |
| **Tracking lag is the update period** | A hop is planned once and left alone for its whole arc, and at full momentum the camera climbs nearly three screens a second. A fixed 0.32 s arc landed most of a screen below where it aimed. The flight now scales with his pace instead -- `hopSlow` to `hopFast`, gravity rising with it, in `plan()` in `companions.js`. |
| **Re-planning mid-arc to catch up** | Made it worse and hid it. Aborting an interpolation strands the object BETWEEN its endpoints, lower than it started; a fast player triggers it constantly, so they sink through the view while every planned target still logs as correct. |
| **An aim at his average** | Design 7 predicted his arc while he rose faster than his average climb, and his average after that. He climbs a staircase -- fifteen floors in half a second, then a pause on a ledge -- and the view follows the staircase, so a leader aimed at the straight line through it was over the top of the view at every pause: 23% off screen on the human tower, while every hop was ledge to ledge and every test passed on the attract ramp. Predict to his next landing, which his physics settles, not to a rate. |
| **A flight stretched after its ledge was chosen** | The floor was picked for a 0.15 s flight, then the flight stretched to 0.3 s because that ledge was far sideways -- and the companion arrived where he had been. Judge every candidate at its own arrival time: 36.5 crossings a minute to 19.8. |
| **A charge that made standing free** | The first charge for leaving the view was absolute. A companion already out of view found every hop worse than staying, stayed, and stood on one ledge while the rising floor went past and the tower was pruned from under it: 6564 stranded frames on one seed. Charge a hop only for what it adds over standing still. |
| **The rising floor's catch-up** | It climbs at `riseRate()`, and while more than `riseLead()` under his best floor at 720 world units a second more. A landing guard that read only the rate let a trailer land on a ledge the catch-up covered two hundredths of a second later. Read into the station as well, the catch-up held every trailer high and cost two points of view; it belongs in the landing guard only. |
| **The catch-up his landing sets off** | The guard above read the line's target from the best floor he had ALREADY reached. A trailer hops down while he is falling onto a new best floor -- exactly when the target is about to jump -- so on 7 of 14 human-tower runs a trailer landed in the rising floor, while the test's own seed and the five the design was tuned on never showed it. `risePath()` now flies the line past his predicted landing. One seed is not a proof of "never": the test runs a second human seed that tripped it. |
| **A mode switch that snapped** | Switching GLIDE to HOP mid-climb tried the ledge under them and, with no legal arc to it, set them standing on it anyway; the next frame put their feet on it: 315 world units sideways in one step. The test switched twice and missed it; 374 switches found it. `handOver()` takes only a legal arc and otherwise keeps gliding; the test now switches seventy times each way on the human tower and judges the step each companion's own movement changes. |
| **A pilgrim who stood on his staff** | The Grey Pilgrim hovered over every ledge he ever waited on, from the day his sheet was imported: one screen pixel of sky under his boots at zoom 1 and 1.25, two at 1.5 and above, in both facings. Grass hid it; the flat deck of VILLAGE (now DOWNTOWN) and STORM's cloud did not, and it was found by eye off x8 crops. The importer bottom-aligns a cell on its lowest ink, `drawCompanions` hung every cell from its bottom edge, and nothing in that path asked where the FEET were, only where the ink stopped -- in `idle0`, `idle1` and `land` his lowest ink is the tip of his staff. The Duke had the same fault on his shield's point. Standing poses are lowered onto boot rows a person read off the crops (`COMP_BOOT_ROW`; see [Standing on their boots](#standing-on-their-boots)), in a blit that moved into `compsprites.js` beside the art. Of the two pins in `test-companions`, only the ink under the boots (`BELOW`) can catch a wrong row: the screen check derives its drop and its sole columns from the same table entry, so a wrong row moves both and they still agree -- see "A pin that could not fail" in [TESTING.md](TESTING.md). |
| **Frozen with the interpolation ends apart** | At a death nothing steps the companions, and "stand still" was taken to mean "do nothing". A companion caught mid-hop kept `px`/`py` one simulation step behind `x`/`y`; the renderer draws the blend at each frame's own weight, so it jumped between the two, 4-8 px every frame, for the whole fall -- one of the things that flashed as he died. Its call kept its timer and hung on screen, frozen, over the fall and the scoreboard. `freeze()` syncs the previous position (the ARCHITECTURE invariant: anything moved or stopped outside the normal step must set `px`/`py`) and puts each call into its fade-out from its current visibility; `hush()` runs it out. Found only by drawing every frame at the display rate: at 60 Hz against the 240 Hz simulation the weight is always 0, which hides it (see "Hunting something that flashes" in [TESTING.md](TESTING.md)). |
| **A prompt where a call was still fading** | SPACE TO SKIP came up bottom centre in the catch's frame, where a companion's call box sits and goes on fading for 0.45 s: the two were drawn through each other. For every element a new state adds, list what occupies that spot during the old state's fade-outs; the prompt now waits `SKIP_PROMPT_AT`. |
| **Standing on a ledge that had burned away** | The fire's burn laid one noise field over the ledges and the companions alike, and the brief said nothing may float on nothing -- but a companion and the ledge under him fall in different floor bands of the noise (each band's row 0 is a floor's surface, each at its own offset), so their timings were independent. In the seeded bot's death at floor 420 the pilgrim, at a ledge's end, stood 0.84 whole on 0.33 of the ledge under him 0.15 s in, for 17 frames at 160 Hz; read off the masks over 7,800 placements, 23% of companions stood more than half whole on a ledge under a quarter there, for about 50 ms. The adversarial verifier's frames of real deaths found it. `drawBurnColumns` ties each column of him to the ledge two art pixels under his feet, and `test-fallclear` allows at most 3% of him over ledge already gone (0.0% now; untied, 29% and 11%). Two things that must go together must read one mask, not two bands of the same noise. |
| **A companion that moved the music** | Each companion lifted the whole piece into its own key while it climbed with you. They join and slip at their own moments, so the key jumped -5 to +7 mid-phrase: 10 of the 19 key changes in four minutes of the bot's run were a companion. Nothing measured it as a problem until the user said the music changed "too randomly and too much"; counting the notes the engine queued did. Their table is now only the register their calls are voiced in (4fbe0f9; [AUDIO.md](AUDIO.md)). |
| **A measurement that sampled a dead game** | "Companions on screen 13% of the time" -- the run had continued past the bot's death, so the camera kept easing while the companions correctly froze. 87% of the samples were of a corpse. Gate the sample on the state under test and print the counts. |
