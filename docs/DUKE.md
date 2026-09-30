# Duke Vytis — every pose

*The Duke's sprite in the game: the sheet and its cells, his twenty poses and which one is
drawn when, the somersault's pivot, the idle, the crown glint, the death poses and the
pieces he comes apart into, the shield he carries, and the two rules every new drawing
must satisfy. Read this when changing how he is drawn or animated, or before a new sheet
of him goes in. See also [ART-PIPELINE.md](ART-PIPELINE.md) (how his sheet becomes code),
[ART-BRIEF.md](ART-BRIEF.md) (what the artist is asked for), [GAMEPLAY.md](GAMEPLAY.md)
(the death burst, the blood, and the afterimage laid on his path) and
[COMPANIONS.md](COMPANIONS.md).*

## The sheet

Twenty named poses from **eighteen** cells of `assets/vytis-sheet.png`. Every cell is
used; `dazed` and `splat` share one drawing on purpose, and `backfallHeld` is `backfall`
put back together at load rather than a drawing of its own.

Source of truth: `POSE` in `src/render/sprites.js`. How the sheet is cut and imported, and
why it needs `--boxes` and `--bgchroma`, is in [ART-PIPELINE.md](ART-PIPELINE.md).

**252 × 212 art pixels** per cell, **63 × 53 world units**: `PX = 4`, so at zoom 1 one art
pixel is exactly one pixel of the 1920 × 1080 backing store. A run starts at zoom 2, where
each art pixel is an exact 2 × 2 block; the arena then widens through 1.75, 1.5 and 1.25
to 1, and those three in-between zooms are the only place he is ever resampled. Why `PX`
and the zoom work that way is in [ARCHITECTURE.md](ARCHITECTURE.md).

### He is drawn far bigger than he collides

He stands 177 art pixels in `idle0`, 44.25 world units. His COLLISION box is a separate
constant, `PLAYER_W × PLAYER_H` = 16 × 22, which is why the sprite could change size
without a single jump changing.

HEIGHT used to be the axis with no room. The clear gap between one platform's top and the
next platform's underside is `FLOOR_H - PLAT_THICK` = 23 world units; at 28 tall the
hand-drawn sprite was already five over, so every extra row made the clipping worse and it
grew only in width — 16 to 24 — which is where a face seen head-on and a shield with a
device on it actually live. The imported art gave that rule up, and was made that big on
purpose: the drawing is nearly twice the gap, his cell is 53 units, so he overlaps the
platform above him by up to 30, while the collision box underneath still fits. That is
drawing, not collision, and it is accepted: `tools/test-sprites.mjs` prints it as a note,
not a failure.

### The size was never the real problem

The size was never the real problem with the hand-drawn sprite. At 56 px tall he already
had more pixels than Owlboy's Otus (39) or Castlevania IV's Simon Belmont (48), and sat at
exactly Owlboy's 10.4% of screen height. What made his features indistinct was **the
palette**, and it was measurable: his cap and his robe were the same red, so his head and
his body were one red mass (the numbers are in the row *Two colours that were the same
colour* under [Where the bodies are buried](#where-the-bodies-are-buried)).

That sprite is gone. The art is the artist's now, drawn as an anti-aliased illustration,
and `tools/import-sprite.mjs` resamples each cell and snaps it to 36 colours — the snap is
what turns the gradients back into pixel edges. Red, white, blue and gold happens to be
the coat of arms' own palette.

---

## The poses

| Pose | Cell | What it represents |
|---|---|---|
| `idle0` | 2 | Standing square on, shield up, sword low. The frame he returns to |
| `idle1` | 1 | Sword swung down to his left |
| `idle2` | 0 | …and up |
| `idle3` | 3 | Down to his right |
| `idle4` | 4 | …and up |
| `run0` | 5 | Running, first stride |
| `run1` | 6 | Running, second stride |
| `run2` | 7 | Running, third stride |
| `jump` | 9 | Rising off a platform, sword up |
| `jumpFast` | 8 | A fast jump — committed, blade thrown back |
| `fall` | 10 | Descending, thrown flat, legs trailing |
| `land` | 11 | Absorbing the hit, compact over his knees |
| `fallFast` | 12 | Falling fast, braced forward into the drop |
| `tuck` | 13 | Spinning somersault. **Drawn rotated in quarter turns**, about the ball he curls into |
| `backfall` | 14 | The death plunge — screaming, crown, sword and shield coming off. Never drawn as it is: the fall draws `backfallHeld`, and the splat cuts its flying crown from this cell |
| `backfallHeld` | 14 | The same plunge held together — crown on, shield and sword against him. **Derived**, and the pose the fall actually draws; see below |
| `dazed` | 15 | Knocked out, lying where he landed. Below floor 200 |
| `splat` | 15 | The same drawing, unused at or above floor 200, where he comes apart instead — see below |
| `parts0` | 16 | Him in pieces: torso, head, arms |
| `parts1` | 17 | Him in pieces: legs, sword, shield |

**11 and 12 swap** relative to the sheet before this one. Poses are assigned by what is
drawn, never by where the cell sits: the compact crouch is the landing and the long dive
is the fast fall, whichever order they were drawn in.

### When each is drawn

`frameFor` in `src/render/renderer.js` decides every frame. In a death it is the fall
pose until he hits, then `dazed` — or `splat`, which `drawPlayer` never draws, because he
comes apart instead. Otherwise, in this order: in the air he is `tuck` while the
somersault timer `spinT` runs (an air jump starts one, and so does a wall bounce), drawn a
quarter turn further round 14 times a second; otherwise `jump` while rising faster than 30
units a second and `fall` after that. Each swaps for its `Fast` drawing once the momentum
meter (0 to 1) passes 0.6, so speed reads off the character and not only off how far the
jump carries. On the ground he is `land` for 0.12 s after touching down, runs through the
three strides (quicker the faster he goes) above 12 units a second, and idles below it.

`land` is a timer, not the squash value, on purpose: squash used to be re-assigned on
every grounded frame, so testing it meant the landing pose never ended (the row *The
character stood permanently squashed* below).

### The somersault turns about the ball of him

A quarter turn is drawn about a point, and for `tuck` that point is the middle of the ball
he curls into -- the ink box of the drawing, per facing, rounded DOWN to a whole art pixel
so the turned drawing stays on the art-pixel grid (`SPIN_POSES` and `SPIN_PIVOT` in
`sprites.js`, applied in `placeCell`). It used to be the middle of the CELL, which is
63 x 53 units, sized for a sword arm and a shield, with the ball in the bottom of it 12.4
units under that point: every quarter turn swung the ball 17.5 units, 14 times a second,
and at the half turn it floated 25 units over his feet. Now it moves 0.18 units from turn
to turn and never leaves his feet. Only the somersault: the death's tumble turns the fall
pose, which fills its cell, about the cell's centre, byte for byte as it always did. The
row *A roll about the cell's centre* below has how it was found.

The speed trail's silhouettes of him (`drawGhost`) are placed by the same function as the
sprite, `placeCell` -- boot drop, squash and quarter turn included -- so a copy is exactly
the shape he was drawn as where he was; where they go is in [GAMEPLAY.md](GAMEPLAY.md).

### The idle

Nine steps at 0.9 Hz, a ten-second loop, out and back:

```
idle0 · idle1 · idle2 · idle1 · idle0 · idle3 · idle4 · idle3 · idle0
```

A sword flourish. The blade is in frame in all five drawings, and so is the shield.

### The crown glint

The cap of estate went first: a crimson dome with a white fur brim reads as a Santa hat,
and no quantity of ermine spots was going to fix it. He wears a tall gold **crown** with
lit points now, over an enormous forked auburn beard, and the renderer lights one point at
a time on top of the sprite, because a baked glint would sit in the same place forever.

The stones of his crown catch the light one at a time, and the glint is measured per pose
(`CROWN_GEMS`). It was once measured off `idle0` and used for all nineteen, and it floated
off his head wherever he was pitched forward or crouched. The measurement asks for a HUE:
the topmost row with three or more gold pixels, then the densest gold row in the twelve
from there down. Brightness found a highlight on his pauldron and the top of the ink found
his raised sword. It works where the crown is the highest gold on him: belt, tabard
cross and shield rim are gold too, and below his head in every standing drawing on this
sheet. Not in `fall` (cell 10, descending and reaching): there his pauldrons come up level
with the crown, pixels on them pass the gold test, and three of the four gem columns found
are on his armour (see [Open](#open)).
`test-sprites` checks only that the glint lands on ink, not that the ink is his crown.

The glint is placed from the bottom of the CELL, which is `FOOT_DROP` below his feet
(`drawPlayer` in `renderer.js`): the sprite is lowered by that much so he stands on his
boots, and world y points up, so the cell's bottom is `py - FOOT_DROP`. It was
`py + FOOT_DROP` until 2026-09-22, which put the glint twice the drop ABOVE its stone: two
art pixels over the crown in every pose with a quarter-unit drop, which nobody could see,
and four and six once the idles were anchored on their boots, which put it in the air
(the row *The glint's sign* below).

### The death

If the best floor of the run is below 200 (`SPLAT_FLOOR`), he lands `dazed` — one
drawing, lying where he fell, shield and crown beside him.

**He falls in one piece**, whichever way it ends. The plunge drawing, `backfall`, has his
crown, shield and sword already flying off him — a fine single frame, and wrong for a
fall that tumbles for two seconds: he read as coming apart before anything had hit him,
and then came apart again at the bottom. The fall draws `backfallHeld` instead, cell 14
reassembled at load by `assembleHeld()` in `sprites.js`: the crown seated back on his
head, the shield and sword pulled in until they overlap him. The loose pieces are told
apart by colour — the goldest is the crown, the reddest the shield — never by coordinate,
so a re-import does not break it. It is flagged `derived`, and `test-sprites` lists it as
a placeholder until the sheet has a drawing of it.

At or above floor 200 he comes apart on impact, into ONE BODY's worth of the connected
pieces of `parts0` and `parts1` plus his crown (`SPLAT_BITS`): a head, a torso, two arms, two
legs, his shield, sword and crown -- nine on this sheet. The drawing holds more than a body:
**four arms** (three near-copies of one, their silhouettes overlapping 0.79 to 0.85, and one
of the other side), and one of those arms is not a connected piece of the drawing at all.
Every piece it is cut into is `PARTS_BITS`; the burst throws the two arms most nearly each
other's mirror image, a left and a right (`oneBody`, `mirrorShare`: here the arm cut off the
torso and a loose one, 0.86 of their silhouettes shared with one flipped), and not the plate
below -- each arm wears its own pauldron. Until 2026-09-29 it threw all four, and the plate,
and the user saw four arms fly out at a death. Each piece has a
role — head, torso, arm, leg, shield, sword, crown, and the plate cut off the torso — found by which drawing it is in, by
hue, and for the sword by how little of its box it fills, and bursts from where that part
of him was on the fall pose, turned with whatever quarter turn the tumble was on.

**The arm drawn on his torso is cut free at load** (`cutLimbs`, `cutLimb`, `minCut` in
`sprites.js`). The parts bin draws three arms loose and the fourth -- pauldron, vambrace
and gauntlet -- against the tabard's side, its outline and the armhole's one shared dark
band, so torso and arm were one 3394 px piece that flew, bounced and lay as a tabard with
a hand dangling off it while the other three arms flew free. The cut is read from the
drawing, never from a coordinate: the torso is its TABARD, the biggest 4-connected patch
of blue; the cut is the cheapest line of pixels between the tabard and the far end of what
hangs off it, outline ink costing 1 and lit ink up to 9 (a minimum vertex cut); and it is
an ARM only if it takes about as much ink as the loose arms (`LIMB_MATCH`, against their
median). Here the line runs down the armhole, 41 px, all outline, and the arm is 1579 px
against loose arms of 1503 to 1545. Both pieces keep the line, so each has an outline where
the other was; it then tries again, and stops at the torso's own right pauldron, which is
nowhere near an arm. That comes off last, as a PLATE of its own (`PLATE_MIN`, `PLATE_STEEL`:
at least 12% of an arm and mostly steel; it is 378 px, a quarter of one): left on, the
tabard lay wearing a steel shoulder, and the user still saw an arm that had not come off --
twelve pieces in `PARTS_BITS` (the plate is not thrown). Each cut piece keeps where it HUNG
(`hang`, its box's centre from the torso's) and bursts from there, beside wherever the torso
starts, holding the slot on its own side, so the other arm takes the other side; roles are
asked again after the cut, since what
comes off is only arm-SIZED. A re-import that draws the arm loose cuts nothing. The cut costs
about 25 ms once, at load.

Where each piece comes to rest, how it bounces, the blood that scales with the depth of
the fall, and the tuning and tests for all of it are in [GAMEPLAY.md](GAMEPLAY.md).

---

## The shield

Standing still, he turns and faces you, carrying a heater shield charged with the
**Vytis** — the arms of Lithuania as they stood around 1420: an argent knight on a
galloping horse facing heraldic dexter, sword raised, bearing on his own arm an azure
shield with a gold double cross, all on a field gules. The title emblem is the same arms,
imported at 96 × 148 from `assets/shield-source.png` (see
[ART-PIPELINE.md](ART-PIPELINE.md#the-shield-the-title-emblem-and-the-icon)).

**It is drawn, not painted on.** Sixteen of the eighteen cells carry the arms of the Grand
Duchy on the shield in his hand, at the angle that pose holds it. The two that do not are
the drawing, not a fault: curled into the somersault he has it tucked behind him, and the
upper half of the parts bin is a torso with an arm drawn against it, a head and three
loose arms.

That retired a whole machine. `src/render/shieldstamp.js` used to find the red field in
every cell, measure its box and draw a computed heater into it — rim, field and a rider —
because no sheet before this one had the right device on it. Finding a shape by its colour
and painting over it is what you do when you have no other choice, and it cost what that
costs: **his beard is the same family of reds**, so three poses shipped with a coat of arms
stamped neatly over his face. What survives is the measuring half, in
`tools/shieldfind.mjs`, which no longer paints anything and is used only by tools and by
the test that asserts the shield is where a shield is.

```bash
node tools/shot-shields.mjs     # the shield cropped out of all 18 cells, and the logo
```

### Heraldry that small

The shields before the drawn one were tiny, and the panel that drew them found thresholds
that still hold for heraldry that small: two values of argent, or the rider dissolves into
his mount; a double cross needs its shield to be 5 × 7, because at 5 × 6 the bars merge
into a gold blob; a blade over a white horse must be a cooler steel or it vanishes; and
below roughly 9 × 12 the gallop dies, with three rows left for legs.

### One thing it costs: the arms mirror

The sheet has one facing. Running left, the whole sprite is mirrored — so the shield
changes hands, and the horse gallops the other way. The first is the ordinary
side-scroller compromise; the second is a coat of arms drawn backwards.

Un-mirroring just the shield was considered and is **worse**. Mirroring the whole frame
mirrors his arm along with the shield it holds, so the two agree; putting the shield back
the other way leaves a shield leaning against the lean of the arm carrying it, which reads
as broken in every pose where the shield is drawn at an angle. The fix, if this ever
matters enough, is a left-facing sheet, not code.

The five idles are in `FRONT_FRAMES` and never flip, so standing still the arms are always
the right way round (the row *The coat of arms came out backwards* below).

---

## Two rules any new drawing must satisfy

1. **He keeps his sword and his shield.** Only the death plunge and the parts frames may
   disarm him. `UNARMED_ART` lists those cells and `tools/test-sprites.mjs` (part of
   `npm test`) fails if any other pose reaches for one. This has been got wrong twice by
   picking a pose for its shape without checking his hands.
2. **His BOOTS decide where he stands**, not his lowest pixel. The importer bottom-aligns
   every cell on its own lowest ink, and that is seldom a boot: on an earlier sheet it
   was the tip of his sword, hanging past his heel in the running cells (his boots
   floated 1.25 world units); on this one, in the idles, it is the point of the heater
   shield he holds low beside him. `FOOT_DROP` in `sprites.js` is how far each pose is
   lowered to put the right row on the ledge, and it is measured three ways:

   - **Standing poses** -- the idle cycle, the run cycle and `land` (`GROUND_POSES`) --
     by `bootDrop()`, by COLOUR: per column of the drawing's bottom edge, the lit pixels in
     the few rows above its lowest ink vote, gold or crimson for the shield, steel for a
     sabaton; a column dark all the way up takes the verdict of the nearest column it is
     joined to. The lowest row a boot column reaches stands on the ledge. The shield's
     point, nearer the viewer than his feet, used to hang two or three art rows over the
     lip in front of it, notching the ledge's lit top row; the sprite atlas now leaves out
     a standing pose's rows under its boot row (`atlasRows`, f9bc315), so the point ends on
     the deck as if resting on it behind the front edge. Cut in the atlas, not by a clip,
     so nothing above the line moves at the zooms between 2 and 1; `FRAMES`, which the
     tools read, keep the point, and `test-sprites` fails any ink on or under the landing
     line from a standing pose.
     `test-sprites` pins the result to the rows his boots end on, read by eye off x8 crops
     (`BOOT_ROW`), so a re-import that moves his feet fails there and gets looked at.
   - **Airborne poses** by `FOOT_INK`: the lowest row with eight or more pixels of ink,
     the rule that took the sword tip off the anchor. It is left alone on purpose: there
     is no ledge under him to measure against, and the fall's anchor is where the splat
     throws his pieces from (`posePoint`).
   - **Scene poses** -- `dazed` and `splat` (`SCENE_POSES`) -- by `FOOT_INK` over the
     largest connected piece of the drawing, meant to be his body, so gear lying beside
     him cannot decide where he lies. The list is deliberately short: the death plunge
     has loose gear in it too, but he is airborne there, and re-anchoring on his body
     alone would drop him ten world units the moment the pose changed. **On this sheet it
     does not do its job**; see [Open](#open).

   The drop follows the landing squash. `drawSprite` squashes the drawing about his boots,
   so a standing pose is lowered by the drop times the squash's vertical scale, not the
   whole drop: lowered by the whole drop, the idle or stride that follows a landing,
   still a quarter squashed, put his soles a screen pixel into the ledge at the zooms
   between 2 and 1.

Delivery rules — layout, background, scale, closed hands — are in the character-sheet
prompt, [ART-BRIEF.md §2](ART-BRIEF.md#2-the-character-sheet), and checked again before
sending in [§4](ART-BRIEF.md#4-before-you-send-them).

---

## Open

- **The knockout lies on the point of its shield again.** In cell 15 the dropped shield's
  rim touches his sabaton, outline to outline (rows 160-166 of the cell in `vytisart.js`),
  so the largest connected piece is him AND the shield, and `FOOT_INK` finds the shield's
  second-lowest row, 210. His body lies in the air over the ledge, its lowest ink (a
  hand, row 188) about twenty art pixels -- five world units -- up, as a render of the
  knockout showed on 2026-09-22. `SCENE_POSES` and `largestPiece()` are still in the
  code and still right for a drawing whose gear lies apart; this one needs the shield
  told apart by colour, as `bootDrop` and `assembleHeld()` do. Nothing tests where he
  lies.
- **The glint in `fall` is mostly on his pauldrons**: three of the four gem columns
  `CROWN_GEMS.fall` finds, because in that drawing they come up level with the crown and
  pixels on them pass the gold test (seen in a crop of the cell with the four columns
  marked, 2026-09-22).
- **The glint does not follow the squash.** `drawSprite` draws him 1.26 times his height
  on the frame he jumps and 0.74 on the frame he lands, scaled about his feet and easing
  back with a time constant of about a twelfth of a second (`player.js`); the glint is
  placed from the unsquashed cell, so for that moment it sits several world units off the
  crown. Read from the code, not yet seen in a frame.

---

## Where this lives

| | |
|---|---|
| Pose → cell, cycles, foot anchoring (`FOOT_DROP`: `bootDrop`, `FOOT_INK`, `SCENE_POSES`; `atlasRows`), where the crown's gems are, splat pieces (`SPLAT_BITS`, the arm cut off the torso by `cutLimbs`), the somersault's pivot (`SPIN_PIVOT`), one placement for the sprite and its silhouettes (`placeCell`, `drawSprite`, `drawGhost`) | `src/render/sprites.js` |
| Where the speed trail's silhouettes of him go ([GAMEPLAY.md](GAMEPLAY.md)) | `src/render/afterimage.js`; `node tools/test-afterimage.mjs` |
| Which pose is drawn when; the glint drawn on the crown | `frameFor` and `drawPlayer` in `src/render/renderer.js` |
| What every new sheet must pass: the 1:1 size, feet on the bottom row, the standing poses anchored on the boot rows read by eye (`BOOT_ROW`) and landing on the ledge at every rest zoom, both facings, the crown glint, the shields, `UNARMED_ART`, the holes | `node tools/test-sprites.mjs` |
| The generated art (do not hand-edit; re-import, see [ART-PIPELINE.md](ART-PIPELINE.md)) | `src/render/vytisart.js` |
| The source sheet | `assets/vytis-sheet.png` (v1 and v2 kept beside it) |
| The cell boxes | `assets/vytis-sheet-boxes.txt` |
| The logo, imported from the shield illustration by `tools/import-shield.mjs` (command in the generated file's header), placed by `src/render/emblem.js`, baked into the app icon by `npm run icon` | `src/render/shieldart.js`, `assets/shield-source.png` |
| Finding a shield in a drawing (tools only) | `tools/shieldfind.mjs` |
| Limb physics and blood ([GAMEPLAY.md](GAMEPLAY.md)) | `Game.burstGibs` / `Game.stepGibs` |
| What the pieces must be: a torso carrying no limb, no arm or leg in two or cut short, every cut outlined on both sides, every piece one piece, the cut arm bursting from where it hung -- also over two re-imports of the parts drawing | `node tools/test-death.mjs` |
| Repairing crossed-out eyes | `src/render/eyefix.js` — **unused**, kept for the next sheet |
| Look at every pose, by NAME | `node tools/shot-poses.mjs` → `poses.png` (`--left` for the flipped atlas, `poses-left.png`) |
| Look at one pose | `node tools/shot.mjs --sprite=idle0 --scale=5` → `shot.png` |
| Look at a death | `node tools/shot-death.mjs --crop --scale=2 --after=2.2` |
| Look at him standing in game | `node tools/shot-stand.mjs` → `grounded.png` in a hard-coded temp folder, not the repo |
| Look at every shield he carries | `node tools/shot-shields.mjs` → `shield-poses.png` |

---

## Where the bodies are buried

Things about the Duke's sprite that took real debugging. Do not re-discover them.

Rows marked *(retired sprite)* are about the hand-authored Duke with procedural limbs,
which the imported art replaced. The code they describe is gone; the lessons are not.

| | |
|---|---|
| **A roll about the cell's centre** | Nobody reported the Duke. What was reported was the trail -- first a halo, then the silhouettes -- breaking whenever he rolled, and the cause was under both: the tuck turned in quarter turns about the middle of its 63 x 53 cell, 12.4 units above the ball of him, so the ball hopped 17.5 units at every turn, 14 times a second, and anything laid on him showed it as a second ball beside him. On its own the roll read as a man jittering about the screen rather than turning over, and nobody had named it. `SPIN_PIVOT` turns it about the ball's own middle; `test-afterimage` checks the tuck turns in place in both facings and fails the old pivot. A quarter turn is only right about a point that is on the drawing. |
| **Four arms at the burst** | The user saw extra parts appear as the Duke hit the ground: four arms flew out at a death (2026-09-29). The pieces were every connected piece of the parts drawing, and the drawing has four arms -- three near-copies of one and one of the other side -- so all four flew, with a fifth steel shoulder (the plate). Every check passed: each piece was one piece, each cut outlined, the arms split evenly either side of him. Nothing asked how many of each part ONE body has. The burst now throws one body (`oneBody`: the best mirrored pair of arms, no plate), and `test-death` counts each role against a literal body -- a head, a torso, two arms, two legs, shield, sword, crown -- whatever the drawing holds, and checks the pair kept is the drawing's best mirrored pair. Check first, for any art cut from a sheet into parts: count the parts against the thing they are parts of. |
| **An arm drawn on the torso** | Reported: one of the Duke's arms did not come off properly when he died. The pieces were each connected area of the parts drawings, and the fourth arm is drawn against the tabard, sharing its outline, so torso and arm were one piece. `cutLimbs` cuts it along the cheapest line of outline ink and keeps the cut only if it is arm-sized. Its first version took the far end of what hangs off the tabard as every pixel that far out, which at 30% and 40% of the way took in ends of the torso's own right side too; the clean cut won on this sheet by 0.3% of an arm (1579 px against 1583), one re-import away from an arm flying with a speck of pauldron beside it. Then the same report again, of the build with the arm cut free (2026-09-28): the settled pieces showed the tabard still wearing its steel right pauldron, 378 px the cut had rightly left as not an arm, and a steel shoulder on the torso read as the arm that stayed. It is cut off last as a `plate` (`PLATE_MIN`, `PLATE_STEEL`); `test-death` counts twelve pieces and fails a torso carrying anything more than a few pixels past its tabard. The far end is now only the pixels joined to the farthest one through pixels as far out, and `test-death` re-loads the sprite over two re-imports of the parts drawing (the arm drawn clear, and the armhole painted lit). A rule found by connectivity breaks the day two things touch (the other half of *A body anchored on its own dropped shield*, below). |
| **A silhouette placed by its own copy of the placement** | The first silhouette trail's `drawGhost` placed each copy with a `drawImage` of its own that knew nothing of `FOOT_DROP`, the landing squash or the tuck's spin, all of which `drawSprite` applies: its cell bottom sat on his feet where `drawSprite` lowers the cell by the drop, and no copy took his squash or quarter turn, so even the nearest copy was a different shape from him (this doc listed it under Open). `drawGhost` and `drawSprite` both call `placeCell` now. Two functions that must put a thing in the same place must be one function. |
| **A body anchored on its own dropped shield** | The knockout cell is a SCENE — him, a shield and a crown, drawn at three depths. Its lowest ink is the shield's point, eighteen art pixels below his torso, so he lay flat four and a half world units in the air. Scene poses anchor on the largest connected piece; airborne poses must not, or the death plunge drops ten units the moment it starts. That fix rests on the pieces being apart, and in this sheet's knockout the shield's rim touches his sabaton, so it floats again ([Open](#open)). A rule that finds a thing by connectivity breaks the day two things touch. |
| **Anchored on the point of his own shield** | He stood up to half a world unit over every ledge in his idles -- two screen pixels of sky under his soles at zoom 1, four at zoom 2, in every zone -- and nothing failed, because nothing compared the anchor with where his boots were. `FOOT_INK`, "the lowest row with eight pixels of ink", was tuned on a sheet whose lowest pixel was a sword tip; three imports later the lowest pixel of every idle was the point of his heater shield, as blunt as a boot, so it stood him on the shield (`idle0`) or its second row (the other four). The same count skipped the thin toe rows of `run1` and `run2`, which sank a pixel into the ledge. The grass tufts on the old ledges hid it; the flat timber deck of VILLAGE (now DOWNTOWN) showed it. Fixed by asking what the lowest pixels ARE -- `bootDrop`, by colour -- and pinning the answer to rows a person read off the art. A threshold tuned on one drawing is a fact about that drawing. |
| **The glint's sign** | The crown glint was placed from the cell's bottom at `py + FOOT_DROP`; world y points up, so the cell's bottom is `py - FOOT_DROP`. With a quarter-unit drop that put it two art pixels over the crown, which nobody could see; once the idles' drops became half and three quarters of a unit it was four and six pixels up, in the air. A sign error hides as long as the number it multiplies is small. |
| **A shield found by its colour** | His BEARD is the same family of reds, so three poses shipped with the arms of the Grand Duchy stamped over his face. Fixed by the share of a blob that is true crimson (0.78-0.92 on shields, 0.28-0.36 on heads) — and then deleted outright when the artist drew the shield on every pose. |
| **The coat of arms came out backwards** | The renderer flips by `p.facing < 0` on every frame, which is right for a profile and wrong for a pose that faces the viewer. Head on there is no left or right to flip, and flipping anyway did not merely waste work: the shield jumped from one arm to the other, the Vytis galloped to SINISTER and the double cross on the rider's shield came out reversed — roughly half the time, including on the menus, where `screens.js` flips the duke on a timer. A coat of arms drawn backwards is not a coat of arms. `FRONT_FRAMES` — the five idle drawings — is refused the flip inside `drawSprite` and `drawGhost` rather than at the call sites, so no future caller has to remember. The suite checks only that the set names real poses; the refusal itself is untested. |
| **`tuck` used the front-facing sheet** | `frameFor` returned the front-view `tuck` for every somersault, so the character turned to face the camera for 0.42 s on every double jump and wall bounce. There was a profile `tuckSide` frame sitting right next to it, defined and never referenced. |
| **`land` was never drawn** | The landing pose existed in the frame table from the first sprite sheet and no code path ever selected it. |
| **The character stood permanently squashed** | `this.squash = -1` was assigned unconditionally inside the platform-collision block, which runs every frame the player is RESTING on a platform — not just on the frame they land. Squash drives a 22%-wider, 26%-shorter draw, so anyone standing still was drawn squatting, and had been since the first sprite sheet. Guarded on `!wasGrounded`. The landing POSE moved to its own timer for the same reason: testing the squash value meant the pose never ended. |
| **The art file described a character from three redesigns ago** | `sprites.js` opened with a fur-banded ducal cap, a crimson robe and 32x56 / 1792 pixels, 115 lines above the constants saying 48x56 / 2688. The cap had become a crown over a mail coif and the robe an azure war coat. The first thing anyone opening the art file read was wrong. |
| **The character had no limbs** | *(retired sprite)* An arm was a literal `KSK` triplet — one pixel of skin between two outline pixels — on exactly one of five torso rows, with about two pixels of reach and three hand-drawn positions in total. Every pose cost a whole authored block, which is why the "four frame" run cycle contained two byte-identical frames and really pogoed between three. The fix kept the body hand-authored and rasterised the limbs from joint angles at bake time, so a pose cost two numbers — until an artist drew every pose and imported art replaced the whole procedure. |
| **His head was wider than his shoulders** | *(retired sprite)* Measured, and not the number anyone reaches for first. 30px of head against 26 of shoulder head-on, 25 against 17 in profile; adult canon is 0.5, i.e. shoulders are two head-widths. That ratio is a stronger chibi cue than the head-to-body fraction, and unlike height it is FREE, because the clear gap between platforms (`FLOOR_H - PLAT_THICK` = 23 units) was already five units shorter than he was. Pauldrons and a wider torso took head-on to 0.83 and the profile to 1.19. |
| **A profile with no lit plane** | *(retired sprite)* The complaint that the face read as a shapeless mash had three causes and the third survived fixing the other two. Measured on the shipped art: ONE lit skin pixel out of 140. The brow ridge, the nose bridge, the tip and the upper lip — the planes actually turned toward the light in a profile — were all painted in base or shadow skin. A form whose forward-projecting plane is its darkest value has no forward-projecting plane, so a head with a correct nose in its SILHOUETTE still read flat. 19 of 140 after the fix. |
| **Two naked forearms, and then a hidden pauldron** | *(retired sprite)* Both were draw-order bugs and both were found by rendering and looking, never by reading. The head-on pose drew limbs before the body art (correct in profile, where the far arm is behind the chest) so the torso erased one sleeve and the shield erased the other. Then the pauldrons, added to widen him, were stamped before the shield and buried. Then stamped after it and they clipped the charge — which showed up as `PAL.p` appearing in no frame at all. The order it ended on: arms, pauldrons, shield, sword, fist. Each step of that is a physical fact about what is strapped to what. |
| **A figure with a face, a robe and no arms** | *(retired sprite)* On the one pose the whole brief was about. In profile the far arm belongs BEHIND the chest, so limbs draw before the body art — but head on there is no behind, and the opaque torso erased the far sleeve while the shield, stamped last, erased the near one. All that escaped were two 3x5 forearm stubs below the hem. The fix drew both arms AFTER the body on head-on poses, with the near arm still under the shield, which is correct: a shield is strapped over the forearm. |
| **Two naked forearms** | *(retired sprite)* The sleeve was the shoulder-to-elbow segment and the skin was elbow-to-hand — but the upper arm is drawn BEHIND the torso, so everything you could actually see of an arm was bare. He ran up the tower waving two naked forearms and had done since limbs became procedural. A ducal robe has long sleeves: the fix ran cloth to 62% of the forearm and left only the hand as skin. |
| **The beard was split by its own mouth** | *(retired sprite)* The mouth is a six-pixel dark slot and it had SKIN either side of it, so between the moustache above and the beard below there ran a row of bare cheek left and right of the mouth. It read as a crack splitting the beard in half. Its flanks are beard now: a slot set INTO the beard rather than a gap between two pieces of one. One character in one row. |
| **The profile head was mostly helmet** | *(retired sprite)* Four passes at the profile face failed while the mail coif was still on it, because the coif WAS the head: a grey mass over the whole skull and neck with the face a strip beside it. It came off every view, swapped character for character so nothing else moved. |
| **Rewriting instead of fixing** | *(retired sprite)* Given a reference sprite to take inspiration from, the profile head and the entire limb rasteriser were rewritten in one go. It shipped a leg that read as coming out of the torso, a shield that became an unrecognisable shape in profile, and a face that stopped being a face — and it had to be reverted whole. The four defects were then fixed as four edits against the reverted sprite, each one rendered and looked at before the next. The reference was still the right input; the wholesale rewrite was not. |
| **A nose that was a finger** | *(retired sprite)* It projected three columns past the row beneath it, which cut straight back, so it hung off the cheek supported by nothing — and it was drawn in `L`, the lightest colour on the sprite. A profile silhouette has to STEP: 33, 34, 35, 34 through brow, bridge, tip and nostril. Nothing about the nose's own shape was wrong; the rows around it were. |
| **Nudging features instead of fixing proportions** | *(retired sprite)* Three passes at the profile face failed because I kept adjusting the eye, the nose and the beard rather than the space they sat in. Measured, the face was fifteen columns wide against nine rows tall — a 2:1 letterbox with every feature crammed into the front third — and the beard's back edge started at the very back of the skull so it hung behind his head. Putting the beard's back edge on the JAW fixed more in one edit than the three passes before it. Measure the box before moving what is in it. |
| **The eye that could not be fixed by fixing the eye** | *(retired sprite)* It kept reading as a smear whatever I did to it, because the problem was not the eye. The silhouette outline for the nose's forward step lands at columns 32-33 on the eye's OWN rows, so the brow, the iris and that outline merged into one dark block. Moving the eye two columns back solved it instantly. |
| **The face had nowhere to be** | *(retired sprite)* Of the head's 28 rows, 19 were cap, gold band, fur and beard — leaving a **9-row face**, against a published threshold of 11-12 rows for a brow, eyes with whites, a nose and a mouth. That is why the idle frame contained no nose and no mouth pixels at all: there was no room for them. Cap 9 rows to 7, ermine 4 to 2, and the face got what it needed. |
| **Two colours that were the same colour** | *(retired sprite)* The complaint was that his features did not read apart. It was not the resolution — at 56 px tall he already beat Owlboy's Otus (39) and Castlevania IV's Simon (48), and sat at exactly Owlboy's 10.4% of screen height. It was the palette, and it is measurable: the cap `#c22743` and the robe `#b8253f` differed by **5 luma and 0.2 degrees of hue**, so his head and his body were one red mass at a glance; lit skin and the ermine band differed by **2 luma**, so his cheek was exactly as bright as the fur under it; and eleven of the twenty-two entries sat inside a single 25-degree hue band. Rebuilt as three-step ramps that hue-shift cool into shadow and warm into light, and the robe moved from crimson to azure so it stops competing with the cap. Red, white, blue and gold is also the coat of arms' own palette, which is convenient rather than coincidental. |
| **A sword tinctured in lit skin** | *(retired sprite)* The charge's blade was mapped to `L`, which in this palette is `#ffe0bd`, the brow highlight. It rendered cream-tan and read as a wooden staff rather than a sword. The artist who drew the charge had specified a cool pale steel deliberately — a white blade over a white horse vanishes — and the distinction was lost transcribing their palette onto ours. It got its own entry (`l`). |
| **He had been standing on a one-pixel smear** | *(retired sprite)* The boot was drawn downward from the ankle — a three-row slab at `ankle - 1`, sole below it — and a standing leg puts the ankle at row 55.99 of a 56-row cell. Three of the four boot rows and every sole fell off the bottom and were dropped silently by `plot()`'s bounds guard. The comment on `LEG` asserting that `40 + 15` puts the sole on row 55 was wrong and had always been wrong: it lands at `y2 + 2`, which is 58. The fix anchored the boot on its SOLE and clamped it to the last row. The imported art has had the same problem in two new shapes — his sword tip below the heel on one sheet, his shield's point in the idles on this one — and `FOOT_DROP` in `sprites.js` answers it by measuring where the boots actually are (`bootDrop`, for every pose he stands in). |
| **He was never centred in his own cell** | *(retired sprite)* `row` pads on the RIGHT only (`s.padEnd(SPR_W, '.')`), so art authored for a narrower cell silently sits left of centre when the cell grows. Every frame was drawn 1.5 world units left of the collision box and `splat` was 6 pixels out, since the first sheet. It looks like a physics bug and it is not one. `test-sprites.mjs` then measured the head's centre against the cell's — rows 0-16 only, because below that a raised arm and the shield legitimately pull the ink to one side — and separately failed any frame that reached a cell edge, which draws amputated. Both fired on the first run. Both checks went with the sprite; today a pose that reaches the top of its cell is only reported. |
