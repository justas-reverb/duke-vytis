# Art brief

What to ask an image generator (or an artist) for, and what to check before sending it
back: the Duke's character sheet, the shield emblem, the six companions, the platform
tiles, the three background layers per zone and the furniture on the ledges -- and what
became of the brief for the textures and effects round the play, and the two things drawn
in code that no brief asked for (the zone titles and the HUD). Read this
when commissioning, redrawing or topping up any art. See also
[DUKE.md](DUKE.md) (every pose on the current sheet), [COMPANIONS.md](COMPANIONS.md) (the
companions in play), [ART-PIPELINE.md](ART-PIPELINE.md) (importers, flags and the tests an
import must pass) and STATUS.md (open items).

---

## What came back, and what is still open

Two things were generated from the Duke's brief: **the character sheet** (§2) and **the
shield on its own** (§3). Both came back and are in the game — the third sheet is
`assets/vytis-sheet.png`, the shield is `assets/shield-source.png` — and each prompt is
kept as one paste-able block for a redraw. The six companions were drawn to their own
brief (§5), are in the game too, and any redraw of them has to meet it.

Three sheets went out to the artist: the platform template (§6), the background template
(§7) and the furniture sheets (§8). **The furniture came back twice** and both times it is
**implemented in code**. First the user's environment sheet,
`assets/decor-reference.webp`, a reference picture of all 23 elements rather than art the
game can load: every element is redrawn from it at one art pixel per screen pixel, the
Duke's scale. Then the short list of five worth drawing by hand (`decor-fixes.png`) came
back as a second board, `assets/decor-fixes-reference.webp`, and the tree, the slumped
skeleton, the banner, the reed clumps and the lantern post are redrawn from it (§8).
**The platform and background tiles have not come back.** Until they do, the game draws
ten platform tiles cut from the old one-off strips and two (VILLAGE, STORM) painted in
code, and every background layer painted in code from the user's backgrounds board.

A fourth brief went out after those: **the textures and effects** round the play, printed
by `node tools/brief-sheets.mjs` as `brief-textures.png` (the start floor, the rising floor,
the side walls) and `brief-effects.png` (the speed streaks, the combo trail), each a real
frame of the game beside what was wrong, what to draw and what to deliver. The user then
asked for them to be drawn in code instead, and **they are**, in the shapes the brief asked
for, at the art's own scale. The sheets still print the brief as it went out, so their
"now" text describes the drawing each replaced (world-unit rectangles, and for the trail
square specks that followed his speed alone), not the new drawing in the frame beside it. What an
artist's files would replace, if they came:

| Brief's file | Would replace | Can the game load it? |
|---|---|---|
| `GROUND-TOP.png` 64 x 40, `GROUND-FILL.png` 64 x 64 | the pair `groundTiles()` in `src/render/ground.js` paints. The game paints the ground once as a strip instead of tiling it, because repeated rubble read as wallpaper, so a delivered pair also needs a decision on how it is laid | No loader |
| `RISE-EDGE.png` 256 x 16 (4 frames), `RISE-BODY.png` 128 x 64 (2 frames) | `edgeTile` and `bodyTile` in `src/render/risefloor.js`. The body would replace the deep crust only: the glowing top of the crust is computed from the painter's own plan of plates | No loader |
| `<ZONE>-WALL.png` 64 x 128, `<ZONE>-WALL-FACE.png` 8 x 128 | the pair `src/render/wallpaint/<zone>.js` paints for that zone. Must be fully opaque: a zone change crossfades by drawing one wall over the other | No loader |
| `STREAKS.PNG`, and a board of the look | the shapes `plan()` in `src/render/streaks.js` generates, coloured from each zone's own tones (`TONES` there) | No loader |
| `SPARKS.PNG`, and a board of the look | the ASCII sprites in `src/render/sparks.js`, painted by tone into a ramp per combo step, so a sheet would have to come in as four tones | No loader |

How each is drawn and cached now is in
[ART-PIPELINE.md](ART-PIPELINE.md#textures-and-effects-drawn-in-code).

Two more things are drawn in code, per zone, and were never in a brief: **the zone's name**
as the climb enters it, lettered in the zone's own material with an entrance in its manner,
and **the HUD** -- the SPEED bar and the combo meter framed in the zone's material, and
every word and number in the game's 5x7 font in the zone's inks. Nothing is asked of an
artist for either; if art were ever wanted, this is what it would have to replace:

| Drawn in code | Would replace | Can the game load it? |
|---|---|---|
| The zone titles, one per zone | the frames `src/render/titlepaint/<zone>.js` paints, at the size its layout gives, with the columns where each letter's slice ends -- the entrance is drawn slice by slice. In six zones each letter simply drops or rises into place, which one image of the settled word would keep; the other six enter through frames of their own | No loader |
| The HUD skin, one per zone | a gauge's frame, fill and hot fill as `src/render/hudskin.js` paints them from `hudpaint.js`, at the boxes in `GAUGE_ART`, with the dark plate that keeps a gauge from passing for a ledge. The lettering is the font itself, banded in five-tone inks; art for it would be ink colours, not glyphs | No loader |

How both are built, warmed and drawn is in
[ART-PIPELINE.md](ART-PIPELINE.md#the-zone-titles-and-the-hud-drawn-in-code).

What is still open is one Duke drawing (§4b), every platform tile (§6) and every
background tile (§7). Furniture PNGs are still welcome but no longer needed: one that
arrives replaces the painted element it names and nothing else (§8). Texture, effect,
title and HUD files would each need a loader written first.

Everything in §1 applies to the Duke and the companions alike, and §4 is what to check
before sending.

---

## 1. Why this brief looks the way it does

Do not ask the generator for a pixel grid, an exact palette, or an absence of
anti-aliasing. **It cannot honour any of them** — it makes smooth high-resolution
pictures in a pixel-art *style*, and every constraint added to the prompt becomes
something it scatters through the art instead.

Worse, a chroma-key background actively breaks things: asked for `#ff00ff`, it put
magenta glints on the armour, and the importer read every one as a hole. That is what
put holes all over the Duke.

So: ask for the character, the poses and a clean layout. `tools/import-sprite.mjs`
resamples each frame and snaps every colour to a small palette — built from the sheet
itself (`--colours=N`), or borrowed from the game with `--palette=FILE` — which is what
turns a gradient back into a hard edge. **It is a better pixel artist than the prompt is.**

The backdrop still matters, and what matters is its **hue**. The importer takes the
backdrop colour from pixel (2,2), so the top-left corner must be plain backdrop, and calls
backdrop whatever a flood fill from the border can reach. The third sheet's navy carried
JPEG noise, so the tolerance had to be wide, and a wide box around a dark colour contains
his darkest steel: the fill came in through the outline and down both sides of his
tabard, and he imported with holes through his armour. `--bgchroma` stopped it by testing
hue, because shadowed steel is grey and navy is blue however dark either gets
([ART-PIPELINE.md](ART-PIPELINE.md)). A grey or black backdrop would give that test
nothing to separate.

---

## 2. The character sheet

This is the prompt as sent. The sheet that came back follows its pose list only loosely —
read §4b before reusing it.

> A sprite sheet of a single fantasy character, drawn in a detailed 2D pixel-art style.
>
> **THE CHARACTER — identical in every frame:**
> A stocky medieval Lithuanian grand duke. A tall gold crown with pointed fleurons and
> small blue and red gems. An enormous forked auburn beard covering his chest to the
> sternum — it is his most recognisable feature. Full steel plate armour: pauldrons,
> vambraces, cuisses, greaves. Over it a deep blue tabard bearing a gold double cross,
> belted at the waist with brown leather. A straight longsword with a gold crossguard and
> pommel. Heroic but slightly stocky proportions, a large head, a serious face.
>
> **HIS SHIELD — this is important and specific.** A red heater shield with a gold rim,
> bearing the medieval arms of Lithuania: a **silver-white knight in full armour riding a
> galloping white horse, facing left, his sword raised above his head**, and on his own
> left arm a small **blue shield charged with a gold double cross**. The horse is at full
> gallop with its forelegs raised. This device — not a plain cross — appears on his
> shield in every frame where the shield face is visible.
>
> **HIS HANDS ARE CLOSED.** His fingers grip the sword's grip and the shield's strap in
> every frame. Never draw open, relaxed or splayed hands on the weapon hand or the shield
> arm — he is holding them, not presenting them. Open hands are only correct in the
> death poses (14 to 16); the ordinary jump and fall keep their grip.
>
> **LAYOUT:** a 4 wide by 4 tall grid, 16 cells. One pose per cell, each fully inside its
> own cell with clear space around it — nothing may cross into a neighbouring cell,
> including swords, shields and thrown crowns.
>
> **SCALE:** the character must be drawn at the SAME scale in every cell. Do not zoom in
> or out between poses. A crouching pose should genuinely be shorter than a standing one
> and a fallen one shorter still — that difference is the point.
>
> **BACKGROUND:** one flat dark colour, identical in every cell. No gradient, no
> vignette, no ground shadow, no ground line, no border, no text, no labels.
>
> **THE 16 POSES, in this order:**
> 1. Standing still, facing the viewer, shield forward, sword lowered at his side.
> 2. Standing still, facing the viewer, shield forward, **sword raised and clearly
>    visible in front of him** — the blade must not be hidden behind his leg or body.
> 3. Standing calmly, head and shoulders turned to his right as if listening, shield
>    still up, **sword lowered** — he is looking around, not attacking.
> 4. The same calm look, turned to his left instead.
> 5. Walking right, mid-stride, one leg forward.
> 6. Walking right, the opposite stride.
> 7. Running right, leaning forward, both feet off the ground.
> 8. Running right, arms driving, the other stride.
> 9. Running right, a third stride, sword arm back.
> 10. Standing right in profile, sword raised ready.
> 11. Jumping upward, knees rising, sword arm out for balance.
> 12. Falling, legs reaching down, braced to land.
> 13. Landing hard — a deep crouch, knees bent, body compressed, noticeably shorter and
>     wider than standing.
> 14. Falling backwards through the air, screaming, mouth wide open, eyes wide, arms
>     flailing upward, crown flying off his head.
> 15. Dead, lying face down on the ground where he fell, crown on the floor beside him,
>     sword fallen from his hand.
> 16. Flattened on the ground, comically squashed to about a third of his height, limbs
>     splayed out sideways, beard fanned out, crown lying on the floor beside him.
>
> All profile poses face RIGHT. Output as PNG.

### What changed from the last sheet, and why

| | |
|---|---|
| **The shield device** | It came back as a plain gold cross. It has to be the mounted knight — that is the whole identity of the character. |
| **Pose 2** | Every front drawing kept the blade tucked behind his leg, so standing still he looked unarmed. |
| **Poses 3 and 4** | The only profile drawing had his sword raised, so an idle that glanced left and right meant snapping into a fighting stance twice a second. A calm look needs a calm drawing. |
| **Closed hands** | The running frames show open, splayed fingers beside the grip — he reads as having dropped his sword and shield and kept running. |
| **16 cells, not 12** | Room for the two new front poses and the two calm looks. |

---

## 3. The shield on its own

Generated separately so it can be drawn large and carefully — it is the title emblem and
the application icon, so it has to survive being shrunk to sixteen pixels.

> A single heraldic shield, drawn in a detailed 2D pixel-art style, filling the frame.
>
> A red heater shield — flat-topped, curving to a point at the bottom — with a thick gold
> rim. On the red field: the medieval arms of Lithuania, a **silver-white knight in full
> plate armour riding a galloping white horse, facing left**, his sword raised above his
> head in his right hand. On his left arm a small **blue shield bearing a gold double
> cross** (a cross with two horizontal bars, the upper shorter than the lower). The horse
> is at full gallop, forelegs raised off the ground, tail streaming.
>
> Bold, clear shapes — the rider must still be recognisable when the whole shield is
> shrunk to a small icon. Strong dark outlines. No text, no banner, no ornament outside
> the shield.
>
> **BACKGROUND:** one flat dark colour. No gradient, no vignette, no drop shadow.
>
> Output as PNG.

It came back as `assets/shield-source.png`. The command that imports it and rebakes the
application icon from it is in [ART-PIPELINE.md](ART-PIPELINE.md).

---

## 4. Before you send them

1. **PNG, not WebP.** Both previous sheets arrived as lossy WebP — the last one had
   41,795 distinct colours where a clean sheet has about 24. Recoverable, but it costs
   quality.
2. **Nothing crossing a cell boundary.** A thrown crown and a swung sword reached into
   the next cell on an earlier sheet, which merged five frames into one blob until I cut
   a fixed grid. On the third, limbs and a dropped shield still crossed and no automatic
   rule could split it, so its eighteen cells are named one by one in
   `assets/vytis-sheet-boxes.txt`.
3. **The same character in every cell.** Check the crown, the beard and the shield
   device especially — those are what make him recognisable, and generators drift.
4. **Consistent scale.** If he is zoomed differently between cells I cannot fix it
   without flattening every pose to the same height.
5. **Closed hands on the sword and shield.** This is the one that was wrong everywhere
   last time.
6. **A backdrop with a hue, plain in the top-left corner.** See §1.

Then send them. The command the current sheet was imported with, the reason for every
flag, and what `tools/test-sprites.mjs` then holds the result to are all in
[ART-PIPELINE.md](ART-PIPELINE.md).

---

## 4b. What the delivered sheet actually had, and what is still missing

The sheet in `assets/vytis-sheet.png` is the third (v1 and v2 are kept beside it), and it
is good: consistent character, consistent scale, the arms drawn on his shield. It is
**18 cells**, not the 16 asked for, and not the §2 list — a five-drawing front sword
flourish instead of poses 1 to 4, no walk, a fast jump, a fast fall, a somersault, and
death drawings of its own. [DUKE.md](DUKE.md) maps every cell to the pose the game uses
it for. A sheet drawn to §2 as written would need `POSE` in `src/render/sprites.js`
remapped, so ask for anything short of a redraw by the pose names there.

The sheet before it (12 cells, 6x2) left three gaps. Two are closed:

| Gap | Where it stands |
|---|---|
| ~~No calm profile glance~~ **NO LONGER NEEDED** | The old idle alternated front / look / front / look, and the only turned drawing had the blade raised, so he raised the sword every couple of seconds. The third sheet has five armed front drawings, so the idle is a sword flourish out and back (`idle0` to `idle4`) and never turns to profile. |
| **Only three run frames** | `RUN_CYCLE` is `run0` to `run2` (art 5, 6, 7), the three side-on strides the sheet has. A fourth, with the sword gripped, would smooth the cycle. |
| ~~The handheld shield is the double cross~~ **DRAWN CORRECTLY** | The third sheet carries the arms of the Grand Duchy -- the rider -- on the shield in his hand in every pose, at the angle that pose holds it, and that is now the only place the carried shield comes from. The code no longer stamps anything: `src/render/shieldstamp.js` is gone. **Draw the arms on the shield.** A shield left blank, or given some other device, now ships exactly as drawn. |

Nothing here blocks the game. The one open request is that fourth stride: ask for it as a
small top-up sheet rather than a regeneration -- the character is right and redrawing it
risks drift.

---

## 5. The companions

Six climbers who wait at milestone floors and climb alongside the Duke. This is the brief
they were drawn to, and the one any redraw has to meet. What exists today, companion by
companion — sizes, poses, how they move — is in [COMPANIONS.md](COMPANIONS.md).

They were the last placeholder characters in the game: hand-typed 16 × 22 grids sharing
one bell-shaped body, with a head, no arms, no legs and none of the gear their names promise.
The archer had no bow and the shield-maiden had no shield. A procedural figure builder
replaced the grids and got them to "recognisable", but no further. Both are gone. Each
companion is now drawn art with ten poses, imported from its sheet in `Companions/` into
one generated module under `src/render/companions/`.

This is the same job the Duke went through, with the same pipeline and the same brief —
so read **§1 and §4 above first**, because every rule there applies here unchanged and
they were all learned the expensive way.

Same importer, same delivery rules, two differences: each sheet gets its own 20-colour
palette built from its own art, and each is scaled by its standing (`--idle`) height
rather than its tallest frame, which would make the halfling as tall as the
shield-maiden (§5.1). The archer's and the hooded king's (`ranger`) sheets are on navy
too, and needed `--bgchroma=10` for the same holes the Duke had. The archer also needed
`--open=400`: the bow and its string close off a pocket of backdrop that the importer's
flood from the border cannot reach, and it imported as a solid navy shape in his hand.

### 5.1 The one number that matters: 164 art pixels

**164 art pixels tall, for all six.** The width is whatever the character needs, forced
even. The cell is what the biggest leap needs, so the standing figure inside it is
shorter.

Why it is a fixed number and not a style choice — the arithmetic from art pixels to world
units, and each companion's art, world and standing size — is in
[COMPANIONS.md](COMPANIONS.md).

For scale: the Duke's cell is **252 × 212** art pixels (63 × 53 world units), and he
stands **177** of them in idle0. The companions stand **102 to 135**, which is 58% to 76%
of his height. Draw them next to a 177-pixel figure and they should come up to his
shoulder, not his knee and not his crown. The test holds the tallest below him and at no
less than 55% of him, because smaller than that the detail stops reading.

They are matched by **standing** height, not by their tallest frames. Each sheet was
drawn at its own scale, and scaling by the tallest pose made the halfling exactly as
tall as the shield-maiden (the importer's `--idle` flag, in
[ART-PIPELINE.md](ART-PIPELINE.md), is the fix). The test fails if the gap between the
shortest and tallest standing heights ever drops below 10 px.

The sprites before these were 16 × 22 *art* pixels used as 16 × 22 *world* units — one
art pixel stretched over four screen pixels. That is why they looked four times chunkier
than he did, and it was the whole problem. No constant is both sizes any more.

### 5.2 The six

Keep the silhouette readable at a glance: at 74 to 128 px wide, a companion is
recognised by **one shape and one colour**, not by detail. The palette after each name
is what they use today and is worth keeping — it is what makes them distinguishable at
speed.

| id | name | what they must read as | keep |
|---|---|---|---|
| `pilgrim` | **THE GREY PILGRIM** | An old hooded pilgrim, long grey robe, white beard, leaning on a tall wooden staff. The first one you meet, and the most obviously frail. | grey robe, white beard, staff |
| `archer` | **THE LONGSHOT** | A lean archer in green, hood down, **a longbow carried in one hand** and a quiver on the back. | green, the longbow |
| `delver` | **THE STONE-DELVER** | A broad, short, red-clad miner with a steel helm and **a pick over one shoulder**. Built like a barrel. | deep red, helm, pick |
| `ranger` | **THE HOODED KING** | A tall figure in a dark blue-grey cloak, face in shadow under a deep hood, **a thin circlet just visible on the hood**. The only one whose face you never see. | near-black cloak, hidden face, circlet |
| `halfling` | **THE SMALL ONE** | A small, cheerful, barefoot figure in olive green with curly brown hair. **Noticeably the shortest** — about three quarters the height of the others. | olive, bare feet, small |
| `maiden` | **THE SHIELD-MAIDEN** | A warrior in pale mail with a winged helm and **a round shield on her arm**. The one who never lets go — she joins at floor 2100 and stays until the run ends, so she is on screen longer than any of the others and must hold up best. | pale steel, winged helm, round shield |

**The shield-maiden's shield gets no device.** The Duke's carries the arms of the Grand
Duchy, drawn on his sheet in every pose (nothing stamps it in code any more); hers is
plain, so the arms stay his.

### 5.3 The poses

One sheet per companion, because the importer turns one sheet into one module, and
**every figure on it drawn at the same scale**.

| # | pose | in game | why it exists |
|---|---|---|---|
| 1 | Standing, facing the viewer, at rest | `idle0` | waiting on the platform for you |
| 2 | Standing, second drawing — weight shifted, cloak settled | `idle1` | so the wait breathes instead of freezing |
| 3 | Running right, mid-stride | `run0` | |
| 4 | Running right, opposite stride | `run1` | |
| 5 | Running right, third stride | `run2` | three is the minimum that does not read as a limp |
| 6 | Jumping — rising, knees up, arms driving | `jump` | |
| 7 | Falling — descending, legs reaching for the ground | `fall` | |
| 8 | **Landing — a deep crouch**, noticeably shorter and wider than standing | `land` | |
| 9 | **Tumbling — curled into a ball**, balanced about the centre of the cell | `tumble` | drawn ROTATED in quarter turns, so it must read upside down |
| 10 | **Slipping — arms up, grabbing at nothing, face alarmed** | `slip` | the moment they lose their grip and fall away |

All ten exist now for all six; poses 8, 9 and 10 did not exist in any form before the
drawn art. Pose 9 is the one with a hard constraint: it is drawn at 90°, 180° and 270°,
so **centre it in the cell**. A tumble drawn resting on the bottom row spins around a
point outside itself.

Centring it on the sheet is not enough today. The importer cuts each pose out by its
own outline and bottom-aligns every frame on its feet, the tumble included, so all six
imported tumbles rest on the bottom row of the cell. `tools/test-companions.mjs` also
fails any pose whose lowest pixel is off the bottom rows. A centred tumble needs both
of those changed, not a better drawing.

All profile poses face **RIGHT**. The engine mirrors for the other direction.

### 5.4 Delivery

Same as the Duke (§4), and these are the rules that cost the most to learn:

1. **PNG. Not WebP.** A lossy sheet destroys the grid — one came back with 41,795
   distinct colours where a clean one has about 24.
2. **One flat dark background colour**, identical in every cell. **Do not specify a
   background colour and never a chroma key** — asking for `#ff00ff` put magenta glints
   through the armour and the importer read every one as a hole. It still needs a hue
   and a plain top-left corner (§1).
3. **Nothing crossing a cell boundary** — no staff, bow, pick or shield reaching into a
   neighbour.
4. **One scale across every cell.** A crouch must genuinely be shorter than a stand.
5. **Closed hands on anything held.** Open, splayed fingers beside a bow reads as having
   dropped it. Open hands are correct only in the falling and slipping poses.
6. **The slipping and tumbling poses are not standing poses.** A character who has lost
   their grip is not upright.

Then import each sheet. The per-companion command, and why `--bgtol` is set per sheet and
`--bgchroma` on the navy ones, are in [ART-PIPELINE.md](ART-PIPELINE.md).

---

## 6. Platforms

Three pieces per zone, in one cell: **left cap 16px, tile 32px, right cap 16px, 40px
tall**, with the standing surface on **row 12** — 28px of body below it, 12px of headroom
above for anything that stands proud. Draw at 1:1 and never pre-scale: one art pixel is
1/PX = 0.25 world units, one backing-store pixel at the full-arena zoom, and the camera's
zoom (2.0 easing to 1.0 as the shaft opens) magnifies it from there.

What comes back goes in `assets/platform-tiles.png`: **64 wide, 40 tall per zone, the
twelve zones stacked** in climbing order, BASEMENT at the top and ZENITH at the bottom.
The importer reads that one path and takes no file argument. The sheet to draw into is
`platform-template.png`, which `node tools/platform-template.mjs` prints at 8x (`--mag`)
with the cuts marked; the import and preview commands are in
[ART-PIPELINE.md](ART-PIPELINE.md). All twelve zones share ONE palette, built from the
whole sheet (a fixed number of keys, `KEYS` in `tools/import-platforms.mjs`); colours past
that are snapped to the nearest one, and colours nearly identical to a commoner one are
merged into it first (`MERGE_D`), so a sheet drawn with a restrained palette of clearly
distinct colours comes through as drawn. Today's palette is pinned to the stand-in's, and
is rebuilt from the drawn sheet when it arrives (`--repalette`). The one exception today is
VILLAGE's painted gallery, whose honey timber needed colours the stand-in never had: they
sit on keys of their own that only VILLAGE is snapped to, so they move nothing in the other
eleven zones, and `--repalette` drops them along with the stand-in.

### The tile must wrap

**The tile must wrap, and that is the only rule the importer can check.** Its left edge
column is butted straight against its own right edge column, over and over, so a tile that
fails it repeats a seam every 8 world units all the way up a tower that never stops
scrolling. The caps are drawn once at each end and have no such rule.

One more rule comes from how the renderer lays a ledge out, and nothing checks it:

- **Anything discrete fits one 4-pixel slot of the tile.** A run of tiles ends in a part
  tile cut from the tile's left, and it can be 4, 8, ... or 28 pixels wide, so a cut can
  fall between any two columns 4k - 1 and 4k. A post, a bolt, a window -- anything that
  looks wrong sliced in half -- must lie inside columns 4k to 4k + 3. Grain, cloud and
  moss can be cut anywhere. The first VILLAGE tile had an 8-pixel post, and one ledge in
  eight ended in half of it.

**The body can end where the drawing ends.** The shadow under a ledge is cast from the
tile's own drawn underside, column by column, and hanging furniture hangs from that same
underside, so a body need not reach the bottom of the cell. (It used to: the shadow was a
bar at the cell's bottom row, and a body that stopped short of it left the bar hanging
below the ledge.) A tile whose shadow would read wrong -- VILLAGE's hanging posts drew a
stub under each post -- can be given none, as VILLAGE is.

### The tiles in the game now are provisional

Asking for it the other way round is what produced twelve beautiful strips that could not
be used: the reference showed one platform at one width, so that is what came back. **The
twelve tiles in the game now are PROVISIONAL**: ten cut from those strips
(`assets/platform-sheet.png`) and two painted in code, all by
`node tools/import-platforms.mjs --provisional`, so the pipeline could be built and seen
working. That flag overwrites `assets/platform-tiles.png`; never run it once real tiles
are in. The procedural platform painters these replaced are deleted, so there is no
fallback: these tiles are what every ledge looks like.

The cut clears the sheet's navy backdrop to transparent -- all but COSMOS's body, a
starfield drawn in that same navy -- so each ledge sits on its zone's own background.
Apart from the furniture on top (§8), the renderer adds only a faint shadow under what
each tile draws (none under VILLAGE) and, on a checkpoint, an accent pulse round it and a
dashed accent row across it.
The per-zone glow rectangle that used to go round every ledge in the six upper zones is
gone, so **the tile carries its own outline**.

None of the ten cut tiles is seamless. A mean edge difference under 10 is seamless and 30
or more is a join you can see: COSMOS (26.0) is in between, and the other nine are over
30, with ABYSS, STARFIELD and DUNGEON worst at 120 to 137 (each zone's number is the
`wrap:` field in `src/render/platart.js`). The measure counts a row that is transparent
at one edge and solid at the other as the biggest difference there is, so a tile must
agree with itself about where it is see-through as well as about its colours.

VILLAGE and STORM were the wrong object as well as not wrapping -- VILLAGE's grass and
water over soil read as a meadow in front of a night facade of lit windows, and STORM set
its cloud puffs into a grey stone slab -- so those two are painted in code
(`tools/platform-painters.mjs`) and wrap exactly. VILLAGE is a timber gallery like the
ones hung off the house fronts behind it: a plank walk whose lamplit edge is the landing
line, a beam, short hanging posts, in honey-coloured new wood -- the weathered brown it
was first painted in sank into the violet street, and the user asked for a ledge that
stands out -- with the fence on it in the same timber and the lantern post the same wood
weathered darker. STORM is cloud all the way through: a flat sunlit top, puffs banked
under it, a scalloped underside, rounded ends. They show what those two ledges are; a
drawn tile still replaces them. All twelve still need drawing into the template.

How `tools/test-platstyles.mjs` reports a seam, and what it does fail on, is in
[ART-PIPELINE.md](ART-PIPELINE.md).

---

## 7. Backgrounds

The board the user sent (`assets/backgrounds-reference.webp`) is the art direction: each
zone's motif, palette and layering. It is 447 x 2000 and its tiles are about 45 pixels
and none of them repeats, so it cannot be imported. The art to draw is
`background-template.png`, which `node tools/background-template.mjs` prints: each zone's
three cells at size, its colours, what the board says it should be, faintly in FAR and
NEAR an old painted tile for scale (the one from before the repaint, not what the game
draws today), and wrap ticks on every edge.

The game does not wait for it. **All twelve zones are already painted in code from the
board**, one module per zone in `src/render/bgpaint/`, and nothing from the artist is in
yet (`src/render/bgart.js` lists no files). An artist's tile replaces the painter for
that one zone and layer, so tiles can arrive one at a time.

- **Three layers per zone -- FAR, MID, NEAR -- each one 256 x 256 PNG tile**, with the
  zone's sky gradient (from `src/game/themes.js`) behind all three. FAR is deepest
  (smallest shapes, lowest contrast, may fill the tile); NEAR is closest (biggest shapes,
  usually transparent between them). An opaque FAR hides the sky entirely, and that is
  allowed: across a zone change the whole next zone, sky and layers, fades in over the
  zone's last 12 floors.
- **Every tile wraps both ways**: its left edge continues into its right edge and its top
  into its bottom, because it repeats across the screen and up the tower forever. A board
  picture that cannot repeat -- a whole building with a roof, a beam that fades out at the
  top -- has to become one that does: storeys that repeat, beams that run the full height.
- **Dark and quiet behind the play**, and nothing that looks like something to stand on:
  a bright horizontal line in a background is read as a ledge. That includes lines made
  by accident: things placed at random heights put three on one line, and the tile
  repeats that line across the screen. The painted VILLAGE has no string course across
  its houses for this reason, and the painted moss hangs at heights staggered by the
  golden ratio. Diagonals come the same way: shapes that each hang a little lower than
  the one to their left, all the way across the tile, tile into parallel diagonals across
  the whole screen. Heights should go down AND back up across a tile.
- **The layers scroll up and down, never sideways**, so where a thing stands in its tile
  is where it stands against the other layers for good. Place NEAR's shapes between MID's,
  not over them: placed at random, NEAR's house once stood squarely in front of MID's and
  hid it.
- **Let shapes cross the tile's edges.** A tile whose shapes all stop short of its sides
  shows a lane of empty backdrop at every tile edge, repeated across the screen: the
  painted SWAMP did exactly that until its moss was made to cross them. The wrap is
  measured by comparing the left column with the right and the top row with the bottom,
  so fine, busy texture lying across an edge -- speckle, dither, strands of moss -- can be
  reported as a seam even when it wraps; that report is a note, not a rejection, and a
  lane is worse than it.
- **Deliver** as `assets/backgrounds/<ZONE>-far.png`, `-mid.png`, `-near.png`, any
  capitalisation, with transparency where the layer behind should show. Until a layer is
  delivered the game's own painter draws it, so send them as they are done.

SWAMP was repainted in code after the user found it too dull: a near-black teal bog, moss
lit from the upper left, a mist under it (`src/render/bgpaint/swamp.js`). An artist's
SWAMP should keep the order that fixed it -- lit moss hanging in a dark, misty bog, the
mist darker than the moss, and nothing in the backdrop as bright as the ledges' mossy
tops.

How they get into the game is in [ART-PIPELINE.md](ART-PIPELINE.md).

---

## 8. The furniture on the ledges

The eye candy that stands on, hangs from or floats over a ledge -- the forest's trees,
the crypt's skeletons, the cellar's cobwebs: 23 elements across the twelve zones. **It is
done, in code.** Every element is a sprite at one art pixel per screen pixel, the Duke's
own scale, painted by its zone's module in `src/render/decorpaint/` after the user's
environment sheet, and five of them again after the user's second board. Before that it
was code painters drawing in world units, four times chunkier than the sprites and tiles
it stood beside. An artist's PNG of any one element replaces its painted sprite, and only
that one, whenever it arrives.

**What came back was a reference, not art.** `assets/decor-reference.webp` (448 x 2000)
is the user's redraw of all 23, cobweb to light shaft, drawn to the first
`decor-elements.png`. Like the backgrounds board it is one compressed picture: one drawing
per element, each in a framed and labelled box on the sheet's navy, at whatever size the
layout gave it rather than its box, some with scenery round it (a wall behind the slumped
skeleton and the torch, a mound of earth under several), and none of the animation frames
or variants. The code follows it for design and palette; every pixel is placed by the
code, and each zone module's header says what it took from the board.

**The second board came back too, and is implemented.** `decor-fixes.png` asked for the
five elements a hand still beats the code at -- FOREST's TREE, DUNGEON's SLUMPED SKELETON,
CITADEL's BANNER, VILLAGE's LANTERN POST and SWAMP's REED CLUMP -- and the user answered it
with `assets/decor-fixes-reference.webp`, again a picture rather than loadable art. All
five are redrawn from it in code: three trees of a few big leaf masses with sky between
them, two different dead men proportioned like people, a banner whose cloth really swings
over four frames, a lantern post with iron bands and a stepped halo, and reed clumps of
leaves that sway as a whole. Two needed bigger boxes (below). The sheet still prints, with
each element's text rewritten to say what the code draws now and where a hand could still
do better.

### The elements

The zone modules are the source of truth -- the game, the importer, the viewer and the
artist's sheet all read these numbers from them -- and `node tools/decor-sheet.mjs` prints
them fresh on `decor-elements.png`, every element as the game draws it now beside its
empty box gridded at one art pixel per screen pixel, with its notes. `node
tools/decor-fix-sheet.mjs` prints the short list instead -- `decor-fixes.png`, the five
elements where a hand still beats an algorithm (organic mass, a figure, cloth that folds,
light), each with what the code draws today and where it still falls short, what to draw,
and the exact file to deliver. (`node tools/brief-sheets.mjs` prints the textures and
effects brief; see [What came back](#what-came-back-and-what-is-still-open).) If this
table and the sheet ever disagree about a box, frames or variants, the sheet is right. As
of 2026-09-23:

| Zone | Element | Box, art px (w x h) | Anchor | Frames | Variants |
|---|---|---|---|---|---|
| BASEMENT | COBWEB | 28 x 48 | hangs | 1 | 3 |
| | DRIP | 8 x 12 | hangs | 3 | 1 |
| DUNGEON | SLUMPED SKELETON | 56 x 52 | stands | 1 | 2 |
| | SKULL | 20 x 20 | stands | 1 | 2 |
| | CROSSED FEMURS | 36 x 28 | stands | 1 | 1 |
| | OSSUARY STACK | 60 x 32 | stands | 1 | 1 |
| | REACHING HAND | 28 x 24 | stands | 1 | 1 |
| | MANACLED WRIST | 24 x 36 | hangs | 1 | 1 |
| | WALL TORCH | 16 x 44 | stands | 4 | 1 |
| FOREST | TREE | 60 x 136, top 16 rows empty | stands | 1 | 3 |
| | UNDERGROWTH TUFT | 12 x 12 | stands | 1 | 3 |
| SWAMP | REED CLUMP | 32 x 40 | stands | 2 | 3 |
| | CATTAIL | 12 x 28 | stands | 1 | 1 |
| VILLAGE | LANTERN POST | 40 x 56 | stands | 2 | 1 |
| | FENCE | 32 x 24 | stands | 1 | 1 |
| CITADEL | BANNER | 32 x 48 | stands | 4 | 1 |
| STORM | LIGHTNING ROD | 40 x 60 | stands | 3 | 1 |
| ABYSS | SKULL | 16 x 16 | stands | 1 | 1 |
| | BONE | 32 x 12 | stands | 1 | 2 |
| NEBULA | CRYSTAL SHARD | 24 x 48 | stands | 2 | 3 |
| COSMOS | ORB | 16 x 16 | floats 40 px up | 2 | 1 |
| STARFIELD | CONSTELLATION | 40 x 48 | floats 36 px up | 2 | 3 |
| ZENITH | LIGHT SHAFT | 48 x 92 | stands | 6 | 2 |

**Six boxes are bigger than on the sheet the first board was drawn to**, because the
drawings needed the room: FENCE (24 x 24 then), LIGHTNING ROD (24 x 60), CRYSTAL SHARD
(16 x 48) and LIGHT SHAFT (16 x 92) after the first board, and REED CLUMP (24 x 40) and
LANTERN POST (28 x 44) after the second. The LIGHT SHAFT also has six frames now where it
had one. A PNG drawn to an old box or frame count is turned away for its size, so print
the sheet fresh before drawing.

**The anchors.** *Stands*: the box's bottom row sits on the walking surface -- the
landing line the player tracks, so nothing bright along that row. *Hangs*: the box's top
row laps one row over the underside the ledge's TILE draws, measured from the tile art --
16 px under the surface in the crypt, 28 in the cellar -- so a new platform tile moves
it. The sheet draws its blue underside line, and hangs every box, from that same measured
underside. *Floats*: the box's bottom row is its lift above the surface. Ledges are 120
art px apart, so the clear gap under a ledge is at least 92 px; nothing hangs longer than
that. No box is wider than 96 px, the narrowest ledge.

**The TREE's top 16 rows stay empty.** On a 136-px box, with the next ledge 120 px up,
row 16 is that ledge's walking surface. Below it the crown rises behind the ledge's body
and vanishes, as it should; above it the crown stands ON the next floor's landing line.
The first tall tree reached row 4, and wherever a ledge was over it the top of its crown
-- pale rim and all, the brightest colour in the zone -- sat on that ledge as a trunkless
green bun.

**What the game does for you, so do not draw it.** Each instance of an animated element
runs at its own phase, so a row of torches does not flicker in step. COSMOS's ORB is
bobbed up and down by the game; draw it at rest. The crypt's standing pieces get a two-row
contact shadow in the ledge's lip from the game. Elsewhere the game adds none, and a
standing element carries its own contact inside its box -- a tree ends in its own darkest
row, a bone or a crystal lies on a heap of dark rubble, a reed rises from a knot of mud --
or, like the lantern post and the banner's staff, stands dark on the lit landing line
already. A light (the shaft) leaves its bottom row empty.

**ZENITH's LIGHT SHAFT breathes in its own frames, so DO draw the breath.** The game used
to pulse the whole sprite's opacity, and that dimmed the white-gold core with the glow: at
the bottom of each breath the beam was a warm-grey column, one more of the backdrop's own
pale light columns. It no longer touches the shaft's opacity. Deliver six frames, played in
a loop of about three seconds, in which the core is the SAME pixels in every frame and only
the glow, its streaks and the pool of light along the ledge swell and fade round it; keep
the core warm, because warmth is what tells it from the backdrop's cold columns. With two
variants the file is 288 x 184.

**Match the Duke and the companions**: a 1-px dark outline round solid things, forms
shaded from the upper left in ramps that shift hue rather than going grey, and the zone's
own palette. Lights and threads take no outline -- the orb, the flames and the shaft are
light, and a black outline round a one-pixel cobweb made it a black net.

### What the redraw learned, for anyone drawing these again

Every element was checked in a real game frame at zoom 1, on its own ledge and sky, beside
the board's drawing, and many read as some other object there although each looked right
alone and magnified. Draw each as its OWN object, and look at it at 1x on its ledge before
calling it done:

- ribs drawn as three straight bars are a LADDER -- they are curved slits in an egg of bone;
- a chain drawn as a rod with a slot over a wide dish of a cuff is a hanging LAMP --
  links facing us are whole rings, the cuff a ring wider than tall;
- lightning drawn as long straight legs ending in Y-forks is ANTLERS or a bare tree, and
  a rod four pixels wide is a flower stalk;
- a one-pixel diagonal brace is a dotted CHAIN;
- a thin bright beam is a NEEDLE or a sword with a hilt -- the board's is broad and lands
  in a wide pool;
- a long crystal with small upright shards at its foot is a ROCKET with fins;
- two eye sockets that merge with the bone between them are a VISOR;
- an orb that flares four rays is one more of the backdrop's STARS;
- a round bead on a neck is a LIGHT BULB -- a drop is a pear;
- reed blades that stand straight and kink only at the tip are a bundle of STICKS -- a
  blade is one arc from root to tip;
- nested arching blades close into a smooth BUN;
- two identical drawings side by side read as one thing stamped twice, so the game keeps
  neighbouring trees different.

The second board's redraws added more:

- a big skull held up above both shoulders on a straight arm is a skeleton CRAWLING -- a
  slumped man's chest is taller than his skull and the head hangs beside the shoulders;
- fingers run together at the floor are a HOOF -- a gap beside every finger;
- a pelvis drawn as a V, with the last vertebra hanging in the gap, is a pale knob in the
  lap -- it is a basin;
- a reed fan with one straight blade up the middle and the rest in mirrored pairs is a
  FISH'S BACKBONE, and a spear that barely turns is a POLE;
- leaf masses whose shaded sides are the backdrop's own greens vanish, leaving PUFFS ON
  STICKS -- the shadow goes teal, away from the backdrop's hue;
- two crowns that touch close a fork's V into an arch -- keep sky between them;
- cloth swayed by shifting whole rows sideways is a sheared RECTANGLE;
- a thin pale glow over a coloured wall is a grey smudge, and a light dimmed as a whole is a
  grey column -- a light keeps its core and breathes round it.

### Delivery

The same rules are in `assets/decor/README.md`, in the folder the files go in.

1. **One PNG per element**, `assets/decor/<ZONE>-<ELEMENT>.png`: the element's name as in
   the table, hyphens for spaces, any capitalisation -- `DUNGEON-SLUMPED-SKELETON.png`,
   `FOREST-UNDERGROWTH-TUFT.png`.
2. **Frames side by side, left to right; variants stacked, top to bottom**, every cell
   exactly the box. So the file is (box width x frames) by (box height x variants): the
   WALL TORCH is 64 x 44, the TREE 60 x 408, the LIGHT SHAFT 288 x 184.
3. **Transparent background, and no empty cell** -- a blank frame would make the element
   blink out.
4. **Drawn at 1:1, never pre-scaled**, saved as an 8-bit PNG: RGBA, grey+alpha, or a
   palette with tRNS transparency. Not interlaced, not 16-bit.

`node tools/import-decor.mjs` then says, for each file, whether it is taken and why not; a
file it turns away is simply not used, and the element stays painted. How it gets into the
game is in [ART-PIPELINE.md](ART-PIPELINE.md#platform-furniture-is-sprites).
