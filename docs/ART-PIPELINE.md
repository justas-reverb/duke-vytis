# Art pipeline

*How drawn art becomes code: the importers and the generated modules they write,
`import-sprite`'s flags and why each sheet needs the ones it has, the shield, title emblem
and icon, the platform tile sheet and the twelve ledge painters that write it, the shadow
under a ledge, the three-layer backgrounds and the code painters that draw them until the
artist's tiles arrive, the platform furniture -- sprites painted in code, with a PNG
drop-in -- the textures and effects drawn in code around the play (the start floor, the
rising floor, the side walls, the speed streaks, the combo trail, the speed afterimage),
the zone titles, the HUD's per-zone skin, the callouts, the menus and the scoreboard, and
the tests that hold all of it. Read this when re-importing or adding any art, when
repainting a background, a ledge, a wall, a piece of furniture, a zone's title or its HUD,
a callout, a menu or the game over board, or when a sprite looks wrong in a way that might
be the importer's doing. How any of it is scheduled and what it costs a frame is in
[ARCHITECTURE.md](ARCHITECTURE.md). See also [DUKE.md](DUKE.md) (his poses),
[COMPANIONS.md](COMPANIONS.md) (theirs), [ART-BRIEF.md](ART-BRIEF.md) (what the artist is
asked for) and STATUS.md (what is open).*

## Where the art comes from

The Duke, the six companions and the shield are drawn by an artist and **imported**. The
platform tiles come in through an importer too, but what it reads is painted in code: all
twelve zones' cells are painted by `tools/platpaint/` into the sheet the importer turns
into `platart.js`, and an artist's sheet would replace them there (see [Platforms are
tiles](#platforms-are-tiles)). The backgrounds and the platform furniture are painted in
code, and each has a PNG drop-in that replaces the code one piece at a time: a background
layer per zone (see [Backgrounds are three tiled
layers](#backgrounds-are-three-tiled-layers)), a furniture element (see [Platform
furniture is sprites](#platform-furniture-is-sprites)). The textures and effects round the
play -- the start floor, the rising floor, the side walls, the speed streaks, the combo
trail and the speed afterimage -- are painted in code too, at the same art resolution, and
have NO drop-in yet: each paints the tile shapes the artist's brief asked for, and nothing
loads a PNG in their place (see [Textures and effects drawn in
code](#textures-and-effects-drawn-in-code)). So are the name that comes up as the climb
enters a zone and the HUD's gauges and lettering, each in its zone's material (see [The
zone titles and the HUD, drawn in code](#the-zone-titles-and-the-hud-drawn-in-code)), the
seven callouts and the floaters ([The callouts, drawn in
code](#the-callouts-drawn-in-code)), and the menus and the game over board ([The menus and
the scoreboard, drawn in code](#the-menus-and-the-scoreboard-drawn-in-code)), with no
drop-in either. These modules under `src/render/` are generated -- change the source image
and re-run the importer, never the module:

| Generated module | Source | Importer |
|---|---|---|
| `vytisart.js` | `assets/vytis-sheet.png`, cut by `assets/vytis-sheet-boxes.txt` | `tools/import-sprite.mjs` |
| `companions/<id>.js`, one per companion | `Companions/<id>.png` | `tools/import-sprite.mjs` |
| `shieldart.js` | `assets/shield-source.png` | `tools/import-shield.mjs` |
| `platart.js` | `assets/platform-tiles.png`, which `--provisional` writes from the twelve painters in `tools/platpaint/`; a palette per zone | `tools/import-platforms.mjs` |
| `bgart.js`, a manifest of which background tiles exist, not pixels | `assets/backgrounds/<ZONE>-far.png`, `-mid.png`, `-near.png` | `tools/import-backgrounds.mjs` |
| `decorart.js`, a manifest of which furniture PNGs exist and passed, not pixels | `assets/decor/<ZONE>-<ELEMENT>.png` | `tools/import-decor.mjs` |

```bash
node tools/import-sprite.mjs assets/vytis-sheet.png --boxes="$(cat assets/vytis-sheet-boxes.txt)" \
     --height=212 --bgtol=28 --bgchroma=10 --colours=36 --emit > src/render/vytisart.js
node tools/import-shield.mjs assets/shield-source.png --colours=28 --emblem=96x148 \
     --bgtol=20 --emit > src/render/shieldart.js
node tools/import-platforms.mjs --provisional --emit > src/render/platart.js
node tools/import-backgrounds.mjs --emit > src/render/bgart.js
node tools/import-decor.mjs --emit > src/render/decorart.js
```

Run the `--emit ... >` lines from Git Bash. Windows PowerShell 5.1's `>` re-encodes what
it writes (UTF-16 unless configured otherwise), so the module on disk would not be the
text the importer printed.

The six companions come through `import-sprite` too, one module each under
`src/render/companions/`, scaled with `--idle` so their *standing* heights agree rather
than their tallest frames. `npm run icon` bakes the exe's icon from the title emblem.
[DUKE.md](DUKE.md) lists every pose and which cell it draws from.

**The companions' source sheets are not in git.** `.gitignore` drops `*.png` everywhere
except under `assets/` -- the rule is there for the screenshots the shot tools leave at
the repo root -- so `Companions/<id>.png` are on this disk only, and the folder's tracked
files are its JPEGs. Everything under `assets/`, the background tiles and furniture PNGs
included, is tracked.

Every imported sheet was cut for `PX = 4` and takes its world size from its pixel size
over `PX`, so changing `PX` resizes every sprite in the world; see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Regenerating: re-run the importer, never edit the output

All of it comes in through an importer and lands in a GENERATED module. Re-run the
importer rather than editing the output. Each generated module carries the exact command
that produced it in its header, so a re-import never has to be reconstructed from a doc
that has drifted (the row *The generated header lied* below is why).

- **The Duke and the companions:** `tools/import-sprite.mjs`. The Duke's command is above;
  each companion's is in its module's header and tabled under
  [The companions' sheets](#the-companions-sheets). The flags that matter: `--boxes` names
  the cells outright, `--cells=N` cuts by connected pieces rather than by empty columns,
  `--grid=CxR` cuts a fixed grid, `--height=N` resamples onto a cell N pixels tall,
  `--idle=N` scales so the first frame stands N pixels tall, `--colours` sets the palette
  size (default 20) and `--bgtol` the backdrop tolerance (default 18), per sheet.
  `--bgchroma` adds the hue test from the armour-holes row below, off unless given, and
  matters on any dark, coloured backdrop. `--open=N` also clears ENCLOSED backdrop
  pockets of at least N source pixels in which every pixel passes the backdrop test --
  the inside of the archer's bow, which the bow and its string close off from the border,
  so the flood kept it as a solid navy shape in his hand. It counts what it cleared per
  frame into `OPENED` in the module, and `test-sprites` subtracts exactly that from its
  hole count, so a leak still fails. `--palette=FILE` snaps to an existing module's
  `PAL` instead of building one. `--quantize=N` is for a pixel-grid sheet saved LOSSY: it
  collapses each block by its mean and merges down to N colours, a repair no current
  import uses. Without `--emit` the importer only prints a report. The script's usage
  header lists every one of these; it once did not.
- **The shield:** `tools/import-shield.mjs`, command at the top of `shieldart.js`. See
  [The shield, the title emblem and the icon](#the-shield-the-title-emblem-and-the-icon).
- **The platforms:** `tools/import-platforms.mjs --provisional`, which runs every painter
  in `tools/platpaint/` and writes `assets/platform-tiles.png` before it emits. See
  [Platforms are tiles](#platforms-are-tiles).
- **The backgrounds:** `tools/import-backgrounds.mjs`, from `assets/backgrounds/`. See
  [Backgrounds are three tiled layers](#backgrounds-are-three-tiled-layers).
- **The furniture:** `tools/import-decor.mjs`, from `assets/decor/`. See [Platform
  furniture is sprites](#platform-furniture-is-sprites).

The other generated content is not art: `tracks.js` is rebuilt by
`tools/compose-music.mjs` ([AUDIO.md](AUDIO.md)), and `DEMO_SEEDS` is re-picked by
`tools/find-demo-seed.mjs`, the bot's `TUNE` measured with `tools/measure-demo.mjs` ([BOT.md](BOT.md)).

---

## The Duke's sheet

The current sheet was imported with the command above, and the two sections below give
the reason for its two unusual flags. The importer labels connected blobs and gives each
whole blob to one cell, so each frame keeps its own sword and steals none of its
neighbour's, scales everything by ONE factor set by the tallest pose, bottom-aligns each
in its cell, and snaps every colour to a 36-colour palette built from the sheet itself. A
new sheet needs a boxes file measured from its own blobs, or `--grid=CxR` if nothing
crosses a cell.

### Why this sheet needs `--boxes`

Both automatic segmenters in the importer, `--grid` and `--cells`, answer "which lumps of
ink belong together" with the same rule: the largest blobs are the bodies, and every other
blob goes to the nearest body, however far away. Grouping by distance instead, which the
importer does not offer, is no better. Measured: at a merge distance of 6 two poses in the
second row join into one, and at 0 the death row breaks into twelve pieces. **No rule is
right for this sheet.** Limbs cross into the next drawing's box, and the shield dropped by
the falling Duke lies closer to the NEXT pose's body than to the man it fell from.

So the eighteen cells are named outright, in source pixels, in
[`assets/vytis-sheet-boxes.txt`](../assets/vytis-sheet-boxes.txt). The numbers are
**computed from the sheet's own blobs**, not typed: find the connected components, group
them by eye once against a labelled render, take each group's union. A blob goes to the
box that contains its centroid, nearest centre breaking ties, and a blob inside no box goes
to the nearest centre too. Only specks under a thousandth of the largest blob are dropped,
as resampling noise. Nothing bigger is — a silently dropped blob is a limb that simply is
not in the game.

### Why this sheet needs `--bgchroma`

The sheet is on navy, (15,10,39). `--bgtol=28` is what the JPEG noise in that navy
needs, and a per-channel tolerance of 28 around a DARK colour contains every dark colour
there is — including (28,26,25), the deepest steel in the shadow under his pauldrons.
The flood fill from the border came in through the outline, found that shadow, and
followed it down both sides of his tabard. The front-facing idle imported with a hole
through the armour on the left and on the right (181 enclosed transparent pixels; 243 in
`jumpFast`), and the game drew the backdrop through him.

`--bgchroma=10` adds a HUE test, off unless given: a pixel is backdrop only if, with its
own grey removed, it is within 10 of the navy's hue. Shadowed steel is grey and the
backdrop is blue however dark either gets, so the leak stops; every pose now has at most 9
enclosed transparent pixels, and those are real gaps between limbs. **7 is too tight** —
the JPEG's own noise in the true gaps (between his raised sword arm and his head in
`idle4`) stops counting as backdrop and those gaps fill with dark. **14 is too loose** for
the tabard's navy folds in `fall`, which share the backdrop's hue.

---

## The companions' sheets

Each companion is imported with, in outline:

```bash
node tools/import-sprite.mjs Companions/archer.png --cells=10 --height=164 \
     --idle=<standing height> --bgtol=<per sheet> --bgchroma=10 \
     --emit > src/render/companions/archer.js
```

The exact command for each is the one in its module's header. Today they are, all with
`--cells=10 --height=164`:

| Companion | `--idle` | `--bgtol` | `--bgchroma` |
|---|---|---|---|
| `pilgrim` | 130 | 28 | — |
| `archer` | 129 | 28 | 10, and `--open=400` for the bow |
| `delver` | 114 | 34 | — |
| `ranger` (the hooded king) | 135 | 28 | 10 |
| `halfling` | 102 | 28 | — |
| `maiden` | 130 | 28 | — |

The standing heights, and why the six are matched on them, are in
[COMPANIONS.md](COMPANIONS.md); the 164-pixel cell is the artist's number, in
[ART-BRIEF.md §5.1](ART-BRIEF.md#51-the-one-number-that-matters-164-art-pixels).

Without `--emit` it only prints a report. The sheets are laid out diagonally, a run of
poses stepping up and across, so no grid describes them and splitting on empty columns
merges poses that share one. `--cells=10` takes the ten largest connected blobs as the
poses, in reading order, and attaches every loose piece (a pick head clear of the body,
a thrown staff) to the nearest body, so each frame keeps its own bow and steals none of
its neighbour's. It scales every frame by ONE factor, set by `--idle` so that the
standing pose (frame 0) comes out at that companion's own standing height. That is what
keeps the six at their relative sizes; scaling by the tallest frame is right for one
sheet and wrong across six. It bottom-aligns each frame on its feet in the `--height`
cell, forces an even width, and builds each companion its own palette from its art (up
to `--colours`, default 20), which the generated header records along with the sheet's
name and the exact command. `--palette=FILE` borrows the `PAL` of an existing art module
instead, and the companions need none.

`--bgtol` is **per sheet** (default 18). A JPEG backdrop is not one colour: too tight
and the noise bridges two poses into one blob, too loose and it eats the hooded king's
near-black robe, which is exactly what the value that separates the archer's poses does.
A dark backdrop also needs `--bgchroma`. A per-channel tolerance is a box round the
backdrop colour, and round navy that box holds the darkest shadows in the figure, so the
border's flood fill walks in through the outline — the archer once imported with 644
enclosed transparent pixels in one pose. `--bgchroma=N` counts a pixel as backdrop only
if its hue, with its own grey removed, is within N of the backdrop's. The archer and the
hooded king, both on navy, are re-imported at 10, as the Duke is. The delver keeps its
older import at `--bgtol=34` with no hue test: the gate breaks that sheet's segmentation,
and its 17 enclosed pixels are real gaps.

---

## What `test-sprites` holds every import to

`tools/test-sprites.mjs` (part of `npm test`; see [TESTING.md](TESTING.md)) holds the
result to everything that has gone wrong before: the palette must contain a white, or the
argent charge on his shield turns to mush; a shield must be found in every cell that
carries one; no pose but the death plunge and the parts frames may use a drawing in which
he is unarmed; and no frame, his or a companion's, may have more than 20 enclosed
transparent pixels, not counting what `--open` cleared on purpose — the holes that
shipped were 181 and 243. The Duke's own checks (the 1:1 size, feet on the bottom row,
both facings, the crown glint) are listed in [DUKE.md](DUKE.md#where-this-lives).

---

## The shield, the title emblem and the icon

The shield illustration came back from the artist as `assets/shield-source.png` (its prompt
is in [ART-BRIEF.md §3](ART-BRIEF.md#3-the-shield-on-its-own)). It is imported, and the icon rebaked from it, with:

```bash
node tools/import-shield.mjs assets/shield-source.png --colours=28 --emblem=96x148 --bgtol=20 --emit > src/render/shieldart.js
npm run icon      # build/icon.ico and assets/icon.png; npm run dist does this itself
```

`import-shield` writes that command at the top of `shieldart.js`. The title emblem is the
96 × 148 import, placed by `src/render/emblem.js`; `npm run icon` (`tools/make-icon.mjs`)
bakes it into `build/icon.ico`, which electron-builder stamps on the exe, and
`assets/icon.png`, which the Electron main process hands to the window.

Nothing on him comes from it: the shield he carries is the one drawn into each cell of
his sheet ([DUKE.md](DUKE.md#the-shield)).

---

## Platforms are tiles

`assets/platform-tiles.png` is 64 wide and 40 tall per zone, twelve zones stacked, 1:1
with the screen; the importer reads that one path and takes no file argument. Each zone
is a 16-pixel left cap, a 32-pixel tile repeated to the ledge's width and a 16-pixel
right cap, with the standing surface on row 12: twelve rows above it, and 28 below that
must equal `PLAT_THICK × PX`. `node tools/platform-template.mjs` writes the sheet to draw
into, with the cuts marked.

The tiles replaced thirteen procedural material painters and nine cap painters, deleted
rather than switched off, because once the art is drawn the renderer has no business
computing it. There is no fallback: these tiles are what every ledge looks like.
`src/game/platstyles.js`, the table that picked a material, a cap and a glow for each
zone, is still there, but nothing in the game reads it any more: `test-platstyles`
validates it and `tools/shot-platforms.mjs` prints it, and that is all.

The tile has one rule the importer measures — its left edge must meet its own right edge
— per zone, because nothing about a PNG makes it true (the renderer imposes a second, the
4-pixel slot below, which the painters' kit enforces and nothing measures in a PNG). Why
the ask to the artist is shaped around that rule is in [ART-BRIEF.md
§6](ART-BRIEF.md#6-platforms).

```bash
node tools/import-platforms.mjs --provisional --emit > src/render/platart.js
                                                 # THE command: cut the stand-in, run every painter in
                                                 # tools/platpaint/, write platform-tiles.png, emit.
                                                 # Git Bash only; if it throws, the > has already emptied platart.js
node tools/import-platforms.mjs                  # report only: the wrap per zone, YES under 10, roughly, NO from 30
node tools/import-platforms.mjs --emit > src/render/platart.js
                                                 # re-reads the sheet only; the command once real art replaces it
node tools/import-platforms.mjs --repalette[=ZONE,...] --emit > src/render/platart.js
                                                 # for real art: drop those zones' palette pins (all, with no list)
node tools/diff-platforms.mjs --ref=<commit> --allow=<ZONES>
                                                 # every zone decoded, RGBA, against a commit: fails if another moved
node tools/shot-platwidths.mjs --zones=<ZONE> --out=<png>
                                                 # one ledge per width remainder, both ends, through drawPlatforms
node tools/platform-template.mjs --mag=8         # platform-template.png, the cells to draw into
node tools/shot-platsheet.mjs --mag=6 --tiles=5  # platforms.png, every ledge as the game lays it out
```

`shot-platforms.mjs` photographs every zone's ledge through the real renderer, at zoom 2
so an art pixel is exactly two backing pixels. It used to come out as twelve lit
rectangles of sky: it looked for a ledge near the floor the Duke last LANDED on, while the
demo bot is airborne and several floors above it at almost every frame. It now picks a
ledge from the tower (one that would carry the zone's furniture where the eighty floors it
searches have one, asked of `carriesDecor`), puts the camera on it and sizes each cell from that zone's
own furniture (its header says how). `shot-platsheet.mjs` lays out every zone's caps and
tile as the renderer does. Both write `platforms.png` unless given `--out=`, so each
overwrites the other's sheet by default.

`tools/test-platstyles.mjs` fails if the platform body is not `PLAT_THICK × PX` (28 px)
or a zone has no art, and only REPORTS a tile that does not wrap, because art arrives in
stages and a seam is a note for the artist, not a broken game. Run on its own it lists
every tile at 30 or more; under `npm test` a passing suite shows only its summary line.

**Every cell is painted in code.** The first tiles were a stand-in cut from the artist's
old one-off strips (`assets/platform-sheet.png`), mostly the right object and wrong in
everything else:
resampled from another scale into hundreds of colours of blur (1,236 in BASEMENT's cell,
1,700 in FOREST's), tiles that did not wrap -- a seam every eight world units, the
32-pixel tile over `PX`, up the whole zone -- and in two zones the wrong OBJECT outright: a
meadow in front of DOWNTOWN's night street of lit windows, and STORM's cloud puffs set into
a grey stone slab. All twelve are painted now, at one art pixel per screen pixel, one
module per zone in `tools/platpaint/`, and every `wrap:` in `platart.js` is 0.0.
`--provisional` still cuts the stand-in first, then paints every zone that has a painter --
all of them -- over its cut, writes `assets/platform-tiles.png`, and emits. Once an
artist's tiles are in that file, `--provisional` would destroy them: the artist's sheet
replaces the painters, and the command becomes `--emit` alone.

| Zone | The ledge |
|---|---|
| BASEMENT | the cellar's own brick |
| DUNGEON | a slab of crypt stone, ending above the cell's foot so the manacle hangs from the stone |
| FOREST | earth and roots under a mossy grass top |
| SWAMP | peat under a cushion of moss |
| DOWNTOWN | a timber gallery: a plank walk whose lamplit edge is the landing line, a beam, short hanging posts |
| CITADEL | a gilded beam of dressed stone, two courses in running bond, the Vytis double cross on its end stones |
| STORM | cloud all the way through: a flat sunlit top, puffs banked under it, a scalloped underside, rounded ends |
| ABYSS | a spine lying along the ledge: squat vertebrae side by side, a violet disc between each pair |
| NEBULA | cut amethyst: a pink-white landing line over lilac facets darkening to indigo, a jagged underside |
| COSMOS | a slab of pale blue moonstone, lighter than the sky all the way down |
| STARFIELD | carved jade star-stone in blocks, one mark to a block |
| ZENITH | radiant gold in blocks, a dark rim over a bright top, a dark foot |

Each module's header says what the cut was, why it lost and what was tried first; the
comments keep the attempts that read as something else (posts from the deck down read as a
table, small ringed puffs as cobbles).

**The contract is `tools/platpaint/index.mjs`**, the one file a painter needs. A module
named for a zone (`basement.mjs`, `downtown.mjs`, ...) exporting `paint()` -- 40 rows of 64
entries, each `'#rrggbb'` or null -- IS that zone's painter; nothing registers it, so
several painters can work at once on files of their own. It paints with `kit.mjs`, and each
rule in the contract was learned on a ledge:

- **The tile must wrap, so paint it with period 31.** The whole cell is ONE function of a
  repeat column (`kit.fromStrip`, `kit.assemble`) whose texture repeats every 31 columns,
  not 32, so the tile's column 31 IS column 0 and the wrap is exact by construction; in
  play one column shows twice at each join, which in grain or cloud nobody sees. The caps
  come out of the same function -- the left cap is repeat columns 15..30, the right 1..16 --
  so they meet the tile as neighbouring columns of one drawing, and only their far ends are
  drawn as ends. Shapes that overlap their neighbours (puffs, stones) are laid with
  `kit.copies`, so one crossing the repeat's edge is drawn whole on both sides of it.
- **Anything discrete sits in one 4-pixel slot** (below), declared through
  `kit.slot(u0, width, name)`, which throws on a bad one; copies are placed with
  `kit.repeatAt`. The ledge's ENDS cut too, and `slot()` cannot see it (the row *A sliver
  at every ledge's end* below).
- **Row 12 is the landing line**: the brightest clean row of the ledge, unbroken across the
  tile, with a dark rim over it on row 11 where the ledge meets the backdrop; nothing lit
  and level below it, or it reads as a second ledge; and it must read against the zone's
  backdrop at zoom 1, in a real frame.
- **The underside is what you draw.** The shadow and every hanging piece of furniture follow
  it (below), so keep each column solid from row 12 down to where it ends.

`--provisional` prints each painted cell's numbers -- colours, wrap rows, cap joins, row
12's luma against the brightest row below it, the rim, the underside -- and throws on a cell
of the wrong shape, one with more colours than keys, or a tile that does not wrap. If it
throws, the shell's `>` has already emptied `platart.js` and every test and shot then fails
on an empty module: fix the painter and run it again.

**DOWNTOWN's gallery is honey-coloured new wood.** It was weathered brown, painted from the
decor board's lantern post, and its beam sank into the violet street behind it (1.5:1
against the facade in a real frame); the user asked for the ledge to stand out. Five
palettes were painted and measured in real frames, and all five are kept in `GALLERIES` in
`platpaint/downtown.mjs`, so `DOWNTOWN_TIMBER` changes the choice with one word and a
re-run; the file's comment says why each lost. The fence on this ledge is the same timber
and the lantern post the same wood weathered darker (`decorpaint/downtown.js`).

**COSMOS and NEBULA were painted twice.** COSMOS's first painted ledge was a slab of night:
a pale hairline over a body of blue-black (luma 8 to 13) on a navy sky of median luma 20, so
the body was DARKER than the space round it and every ledge read as a black slit, a hole in
the sky -- the user thought the zone was broken. It is moonstone now, the orb's own pale
blue on top and lighter than the sky all the way down, full height like every other zone's;
bridges of orb light and orbs set in a band read as rivets or a film strip, and grey moon
rock as another zone's granite (c9e70ac). NEBULA's was glossy teal crystal blocks on a
backdrop of magenta and violet gas: a complementary clash the user called ugly, and at zoom
1 a row of keycaps rather than crystal. It is the zone's own amethyst, set apart from the
gas by value, not by hue; its wall and its HUD rim lost the same teal, and its theme colours
(the landing dust, the bursts) follow the ledge (b7199b4, cc1dd12). A magenta glint on its
facets came out: at zoom 2 it made a row of pink slashes along every ledge.

**A palette per zone.** The sheet once shared one palette of eighty keys, built from the
colour counts of all twelve zones; the cut sheet holds about fourteen thousand colours, so
that palette belonged to the sheet, not to any zone -- change one zone's pixels, a different
colour won a key, and zones nobody touched re-snapped (the row *The palette that belonged
to the whole sheet* below). Pinning it stopped that and filled it. Now every zone has a
palette of its own, keyed independently and emitted as `ZONES[name].pal` (`A` in BASEMENT
and `A` in DUNGEON are different colours), made from that zone's pixels alone: a cell with
no more colours than there are keys keeps every colour exactly -- every zone today, 7 to 19
colours each, "palette exact" in the module -- and one with more (resampled art) has its
colours merged within `MERGE_D` and the commonest kept, the report saying how many pixels
moved. A zone still cut from the old strips would be snapped to its pin,
`assets/platform-palette/<zone>.json`, the part of the old eighty its pixels used, so it
decoded exactly as before; no zone is cut now, and `--provisional` deletes a zone's pin the
moment it has a painter and ignores, with a warning, a pin whose cell has changed since.
`--repalette[=ZONE,...]` drops pins outright, for the day real art replaces the stand-in.
`tools/diff-platforms.mjs` is the proof a repaint moved nothing else: every zone decoded to
RGBA from `platart.js` and from the sheet, against a commit, failing if a zone outside
`--allow` changed.

**Anything discrete in a tile fits one 4-pixel slot.** `drawPlatforms` in `renderer.js`
ends a run with a part tile cut from the tile's LEFT, then the right cap. Ledge widths are
whole world units and `PX` is 4, so that part tile is 4, 8, ... or 28 art pixels wide: a
cut can fall between any two columns 4k - 1 and 4k. Anything that looks wrong sliced -- a
post, a bolt, a skull, a block joint, a vertebra -- must lie inside columns 4k to 4k + 3 of
the tile; grain, cloud and moss can be cut anywhere. DOWNTOWN's posts are at columns 12-15
for that reason (the row *Half a post* below). `tools/shot-platwidths.mjs` draws one ledge
per width remainder, eight in a row, through the real `drawPlatforms`: look at both ends of
each at x3 or more.

**How the stand-in is cut.** The cut still runs under every painted cell, so it is kept
working. The first cut copied the reference's pixels opaque, navy and all, and every ledge
wore a box of the sheet's backdrop over its surface. So the backdrop is cleared per cell,
by a flood from the cell's top and bottom rows through pixels that match the zone panel's
navy in value AND hue (`--bgtol`, 16; `--bgchroma`, 10) -- a flood from the SHEET's border
changed nothing, because the zone strips sit inside a framed panel; the rows above the
surface are sampled at the body's own scale; nothing above a band's first row is kept (it
carries the sheet's dotted divider); and COSMOS's old slab of starfield, drawn in the
backdrop's own blue-black, had only the rows above its surface cleared (`HEAD_ONLY`).

The renderer's per-zone glow went at the same time. Every ledge in the six upper zones
had a translucent rectangle of the zone's accent drawn round its body (platstyles'
`glow`), made for the procedural slabs, where it lit a rectangle that WAS the platform;
round drawn art it was a box that matched nothing, and in NEBULA a magenta outline round
every ledge. Of that, `drawPlatforms` in `renderer.js` keeps only the checkpoint pulse.

**The shadow under a ledge hugs what the tile draws.** It was one 30% black bar laid at
`PLAT_THICK` below the surface -- the physics thickness, 28 px -- and shifted 2 units right:
right only for a tile solid all the way to row 40. Under DOWNTOWN's gallery (a beam ending
16 px down, posts to 25) it floated below the post tips as a second beam, under the crypt's
stone, STORM's cloud and ABYSS's bones it hung loose, and on every zone it stuck out past
the ledge's right end. Now `LEDGE_SHADOW` in `renderer.js` casts it from the tile art
itself: per column, the transparent pixels just under the drawn body, two rows at 0.3 and
then fading, straight down. It is built once per zone into three pieces the size of the
caps and the tile plus the shadow's depth, and laid out by the same code that lays out the
art, with the same cuts, so a part tile's shadow ends exactly where the part tile does.
DOWNTOWN casts none (`LEDGE_SHADOW_OFF`): shaped from its silhouette the shadow drew a stub
under every post and a band along the beam, and the user asked for the shadows under that
ledge to go; the beam's outlined underside is its contact edge. So a tile no longer has to
fill its body to the bottom of the cell for the shadow's sake -- a new tile's shadow
follows whatever underside it draws.

## Backgrounds are three tiled layers

A zone's background is its SKY gradient and three layers over it -- **FAR** (12% of the
camera), **MID** (22%) and **NEAR** (34%) -- each a **256 x 256 tile** spanning 128 of
the 480 view units, so one art pixel is two screen pixels. It used to be two layers, the
same procedural painter in two colours at 50% and 80% opacity; layers are drawn at full
opacity now and own their transparency. `src/render/backdrop.js` builds and draws them.

Each layer comes from one of two places, per zone and per layer:

- **The artist's PNG**, `assets/backgrounds/<ZONE>-far.png`, `-mid.png`, `-near.png`, if
  `src/render/bgart.js` lists it. The game loads the PNGs as they are. None has arrived:
  `BG_FILES` is empty and the folder holds only its README.
- **Otherwise the zone's code painter**, `src/render/bgpaint/<zone>.js`, which
  default-exports `{ far, mid, near }`, each `(g, T, th, r, i)` painting a T x T tile
  (T = 256) in theme `th`'s colours from the seeded stream `r`. **All twelve zones are
  repainted**, after the user's backgrounds board (`assets/backgrounds-reference.webp`,
  the art direction in [ART-BRIEF.md §7](ART-BRIEF.md#7-backgrounds)); each module's
  header says what its three layers are and why.

So art arrives one tile at a time and the rest of the zone keeps working.

**One zone paints wider, and lays its tiles like bricks.** A painter module may say
`wide: true`, and its painted tiles are then a whole screen wide -- 960 x 256, 480 view
units (`WIDE`, `paintedWidth` in `backdrop.js`) -- so that, since the layers only scroll up
and down, each of their columns shows once across the screen. SWAMP asks for it: at 128
units every moss curtain hung again at the same height 128 units to its right, three or
four copies side by side, and a careful eye found the stamp (the picture matched itself
512 screen pixels across at a correlation of 1.00). Wide but stacked square, a curtain hung
straight above its own twin, so a painter may also RETURN how its tile is laid, `{ period,
shift }`: SWAMP's rows of tiles are laid part of a tile along from the row above, as
bricks are, and NEAR's by a different amount from MID's, because with one bond for all
three layers the whole stack laid onto itself and a quarter of every frame was a copy of
another quarter (ddd4a96; the header of `bgpaint/swamp.js`). It is opt-in because it
paints 3.75 tiles' worth per layer. An artist's PNG stays 256 square whatever the zone
says. `test-backgrounds` holds a wide zone to repeating no more often than the shaft is
wide, and checks its edges on the bond it declares.

What the painters share:

- `bgpaint/util.js` has drawing that wraps by construction (`rectW`, `dotW`, a tileable
  `wrapNoise`) and the colour helpers `shade` and `mix`.
- `starSky()` in `cosmos.js` paints both COSMOS and STARFIELD, which the board draws as
  one sky in two colours. STARFIELD asks it for a veil, a dense field and star clusters
  instead of dust clouds, so the two differ by more than hue. COSMOS's haze is cut into
  bands by `haze()`, and a band's `lo` and `hi` are SHARES OF THE TILE -- the darkest 56%
  is dust, the brightest few percent a glow -- because the noise being cut piles up round
  its middle wherever nine lattice numbers put it: cut at fixed noise values, one seed drew
  0.1% glow and the next 41%. Changing the cut to a quantile without re-deriving the shares
  grew a blue cloud field the zone was never drawn with (the row *Two layers on one stream*
  below).
- `pixTile`, `dither` (a 4 x 4 ordered dither) and `rgba` in `forest.js` are a
  pixel-buffer helper that DOWNTOWN imports too, and SWAMP its `dither` and `rgba`. It
  belongs in `util.js`, and sits in `forest.js` only because the change that wrote it was
  confined to the zone modules.
- `ringTile` in `swamp.js` is a buffer like `pixTile` that wraps with a period one less
  than its size (255 down, 959 across the wide tile) and copies the first column and row
  onto the last, so the tile's edges match EXACTLY whatever crosses them, and on screen one
  column in 256 would show twice (laid wide, not even that). SWAMP needs it because the
  wrap test compares a tile's first column with its last, and two NEIGHBOURING columns of
  moss already differ by more than its limit: a curtain wrapped honestly across the edge
  failed, and curtains kept off the edge left a lane of bare bog at every tile edge (the
  row *Lanes, diagonals and a corner mark (SWAMP)* below). Do not use it for a layer whose
  pattern must stay in phase across the edge -- a 4 x 4 dither shading a smooth field (4
  does not divide 255), bricks, windows, anything regularly spaced -- or for one whose
  neighbouring columns already pass the test. SWAMP's own FAR is both -- its mist is
  shaded with that dither, and its tones are close enough for curtains to cross the edge
  honestly -- so it asks `ringTile` for period 256. It lives in `swamp.js` because only
  SWAMP uses it.
- **Every layer has its own random stream.** `layerSeed()` in `backdrop.js` keys it by the
  zone's index and the layer's POSITION in `LAYERS`, and `tools/test-backgrounds.mjs`
  imports the same function rather than keeping a copy of the formula. It used to key by
  the length of the layer's NAME, and `far` and `mid` are both three letters, so FAR and
  MID of every zone were painted from one stream and the painters carried dodges (the row
  *Two layers on one stream* below); the dodges are gone. SWAMP's `hangers()` still
  shuffles from a stream of its own, for its other reason: the widths and tilts after the
  deal do not move when the search runs longer.
- `bgpaint/legacy.js` is the old two-layer look, `legacyZone()`, which every zone started
  on so that the change of structure changed nothing on screen. No zone uses it now. Its
  old tile painters are still re-exported by `backdrop.js` for
  `tools/background-template.mjs`, which draws them faintly in the FAR and NEAR cells --
  so the faint tile on that sheet is the OLD painting, not today's, as its own caption
  says (it once called it the current tile).

```bash
node tools/background-template.mjs                              # background-template.png, the sheet to draw into
node tools/import-backgrounds.mjs                               # check size and wrap
node tools/import-backgrounds.mjs --emit > src/render/bgart.js  # tell the game
node tools/shot-backdrops.mjs --zone=FOREST                     # backdrop-FOREST.png: every layer 2x2, and the composite
node tools/shot-backdrops.mjs                                   # backdrops.png: all twelve zones
node tools/shot.mjs --floor=1094 --sec=0.3                      # shot.png: CITADEL part-faded into STORM
```

`import-backgrounds` matches file names in any case (the template's font only has
capitals), leaves out anything not 256 x 256, lists a PNG in the folder that matches no
zone and layer as IGNORED, and reports each tile's wrap as the mean difference between
opposite edges, transparency included -- under 10 seamless, over 30 a seam every 128
units. **The manifest lists only files that exist**, because the game requests exactly
what it lists and a 404 fails the desktop build's smoke test.

`test-backgrounds` requires a FAR, MID and NEAR painter for every zone, each painting its
tile (256 x 256, or 960 x 256 for a wide zone) without throwing; every tile the manifest
lists present at 256 x 256; and every
painter layer to WRAP both ways, mean edge difference within 12. A zone still on
`legacyZone()` would only be reported, and so are the artist's seams -- art arrives in
stages. It also proves that the headless canvas every background is judged through CROPS
an image hanging off its edge rather than squashing it, because the top and bottom rows
of tiles always hang off the screen (the row in
[TESTING.md](TESTING.md#where-the-bodies-are-buried)).

**Across a zone change the whole next zone fades in**, composited into one buffer and
drawn once at the blend, so a FAR layer may be opaque -- most repainted ones are, BASEMENT,
DUNGEON, SWAMP, CITADEL and NEBULA fully -- and the fade still shows. How the fade works,
and how it once happened behind exactly those layers, is in
[ARCHITECTURE.md](ARCHITECTURE.md#where-the-bodies-are-buried); when it starts and which
zone comes next are the schedule's, in [TOWER.md](TOWER.md#the-zones). What it means for a
painter: the next zone is painted AHEAD, one layer a frame, from 120 frames into a zone
(`WARM_AFTER` in `backdrop.js`), so a painter's cost lands one layer per frame; the worst
measured, NEBULA's, is in the comment on `Backdrop.warm`. In the frame after the last
layer, `Backdrop.warm` builds the next zone's furniture sprites too (`warmDecor`).

**SWAMP was repainted** after the user parked it as too dull, and it measured dull: its
darks were lifted by an 80% murk over the olive sky, and moss and bog were one olive. It
is now a near-black teal bog in an opaque FAR with a mist glowing in it, MID's moss lit
from the upper left with bright ridges, and NEAR's big curtains darker than MID and lit
only along their crowns, right behind the ledges. The rule it is tuned to is in the
header of `bgpaint/swamp.js`: moss lighter than the mist it hangs in -- the first repaint
had the mist brighter, the board's picture the wrong way round -- and nothing in the
backdrop as bright as a ledge: the brightest pixel, MID's ridge highlight, is luma 82, at
or under the ledges' mossy tops. Its curtains cross the tile edges on `ringTile` and are
dealt round the tile as a ring; how that went wrong twice is the row *Lanes, diagonals and
a corner mark (SWAMP)* below. The 128-unit tile period that every other zone's layers repeat on
across the screen is gone in SWAMP: its tiles are wide and brick-laid (above).

The PNG reader behind all of this (`tools/pngread.mjs`, also the headless `Image`) reads
palette PNGs at 1-8 bits with `tRNS` transparency and grey+alpha as well as the three
8-bit types it always read, because pixel art is usually saved as a palette. Interlaced
and 16-bit files are refused with a message.

## Platform furniture is sprites

The things that stand on, hang from or float over a ledge -- the forest's trees, the
crypt's skeletons, the cellar's cobwebs, 23 elements across the twelve zones -- are
SPRITES at art resolution: one art pixel per backing-store pixel at zoom 1, the Duke's own
scale, each built once and drawn with one `drawImage`. They used to be twelve painter
functions drawing rectangles in WORLD units straight onto the frame every frame, four times
chunkier than the sprites and tiles they stood on, with no way for art to come in. Those
painters are kept in `src/render/decorpaint/legacy.js`, and nothing draws from them now
but `shot-decor --legacy`, for comparison.

**The registry is `src/render/decorpaint/`**, one module per zone, so a zone can be
redrawn without touching another's file. `index.js` collects them in theme order and is
the contract: it says what every field means, and the runtime, the importer, the artist's
sheet, the viewer and the test all read the furniture from it. A zone module exports
`CHANCE` (the share of ledges 22 units and wider that carry anything), `ELEMENTS` and
`scene()`. An element has a `name` as on the artist's sheet (its PNG's name comes from
it); a `box` [w, h] in art pixels, the whole room it has; an `anchor` -- `stand` on the
walking surface, `hang` from the ledge's underside, `float` a `lift` above the surface;
`frames` played at `fps`, each instance at its own phase so a row of them does not pulse
in step; `variants`; `notes` for the artist, printed on the sheet; and `paint(p, variant,
frame, th)`. Optionally a `shadow` cast into the lit lip, `alpha(t, phase)` for a
whole-sprite pulse, and `bob(t, phase)` for a bob (COSMOS's orb). No element uses `alpha`
now: ZENITH's shaft breathed through it, and it dimmed the core with the glow until the
beam was a warm-grey ghost among the backdrop's own pale columns, so the breath is six drawn
frames instead -- the core identical in all six, only the glow, streaks and pool breathing
round it (`decorpaint/zenith.js`). A light must not be pulsed by opacity.
`scene(r, wArt, th)` lists what one ledge carries and where, in art pixels, from the
ledge's own random stream, so a ledge always carries the same things. `util.js` is the
pixel kit `paint()` draws with: a
`Pix`, a box-sized RGBA buffer with y DOWN, with rects, lines, discs, ellipses, ASCII
art, an outline pass, `stamp`, `blend` and a seeded `rng`. It reaches a canvas as
`fillRect` runs, the one path the headless canvas draws exactly, and counts anything
drawn outside the box in `p.spill`, which must be zero.

**Where a sprite comes from**, per element, the first that exists: the artist's PNG, if
`src/render/decorart.js` lists one; else the zone's `paint()`; else `paintCanvas()`, a
placeholder that scales an old world-unit painter into the box. All 23 have a `paint()`,
redrawn from the user's environment sheet (`assets/decor-reference.webp`) -- followed for
design and palette, every pixel placed by the code; each zone module's header says what it
took from the board and why -- and no PNG has been delivered, so today every sprite is
painted. Five were redrawn a second time from the user's second board
(`assets/decor-fixes-reference.webp`), which answered the brief in
`tools/decor-fix-sheet.mjs`: FOREST's TREE, the crypt's SLUMPED SKELETON, CITADEL's BANNER,
SWAMP's REED CLUMP and the LANTERN POST of DOWNTOWN (VILLAGE on that board: the user
renamed the zone on 2026-09-23; the art seeded by a zone's name -- its walls, its HUD
skin's grain -- is seeded by the old one, `artSeed` in `themes.js`, so nothing about how
it looks changed but its title). `import-decor` with no flags prints where
each comes from.

**The runtime is `src/render/decor.js`.** `drawDecor`, called by `drawPlatforms` after
each ledge, puts nothing on a ledge under `DECOR_MIN_W` and on the rest only the zone's
`CHANCE`, decided by the first draw of a stream seeded by the ledge's floor number.
`drawScene` draws a scene: the shadows first, then one `drawImage` per element through
the platform tiles' own flipped world transform, every position on the art grid; its
frame is `frameAt(e, t, phase)`, then the `alpha` and `bob` hooks. The sprite cache is
keyed by zone, element, variant and frame; `warmDecor` fills it for the next zone ahead of
time (from `Backdrop.warm`, the frame after that zone's three background layers), and
`preloadDecor` requests the listed PNGs at startup; a PNG that has not loaded yet is
painted until it has. The lip shadow is stone-coloured, not black -- black would punch a
hole in the landing line -- and only the crypt's standing pieces cast one, two rows deep.
On other zones' tiles it would be lighter than the lip (FOREST, ABYSS), or it would only
cut a landing line the sprite already stands dark on (DOWNTOWN, CITADEL, STORM). There a
standing thing brings its own contact inside its box instead: a tree ends in its own
darkest row, ABYSS's bones and NEBULA's crystals lie on a heap of dark rubble, SWAMP's
reeds rise from a knot of mud.

**A hanging thing hangs from the underside the TILE draws**, not from the ledge's physics
thickness. `undersideFor()` measures it once per zone from the tile art: for each column
of the repeating tile, the solid rows going down from the surface before the first gap,
and the median, so a drip or a notch does not move it. The box's top row laps `HANG_LAP`,
one row, over it, so a ragged edge leaves no slit. It had been `PLAT_THICK x PX` = 28 px
in every zone, which is right only where the tile is solid all the way down (the row
*Hung from nothing* below). The painted crypt stone ends 20 px under the surface (the old
cut's ended at 16), the cellar's brick is solid to 28, and a zone with no tile art keeps
the physics thickness. So a new platform
tile moves every hanging thing in its zone, by design. `tools/decor-sheet.mjs` asks
`undersideFor()` too, so the artist's sheet hangs each box where the game does. (The ledge's
shadow follows the same drawn underside; see [Platforms are
tiles](#platforms-are-tiles).)

**Six boxes changed** from the sheet the user drew the environment board to, because the
drawings needed the room: FENCE 24 x 24 -> 32 x 24 (two posts eight pixels apart with two
bars between them read as a ladder), LIGHTNING ROD 24 x 60 -> 40 x 60 (the board's arcs
spread nearly as wide as the rod is tall), CRYSTAL SHARD 16 x 48 -> 24 x 48 (so the side
shards can splay out) and LIGHT SHAFT 16 x 92 -> 48 x 92 (a broad beam landing in a pool
that runs well past it; at 16 it was a needle) after the first board; REED CLUMP 24 x 40
-> 32 x 40 (the second board's clumps are as wide as they are tall, and in 24 px the only
fan that fitted was a vase of near-upright blades) and LANTERN POST 28 x 44 -> 40 x 56 (so
its halo is not cut flat by the box edge) after the second. The LIGHT SHAFT also went from
one frame to six. The TREE keeps its 60 x 136 box but draws nothing in its top 16 rows:
floors are 120 art px apart, so row 16 is the next
ledge's walking surface, and a crown above it stood ON that ledge as a trunkless green bun.
Its notes tell the artist the same; nothing checks a PNG for it, so a tree drawn to the top
of its box would bring the bun back. Every tool reads
the boxes from the registry; [ART-BRIEF.md §8](ART-BRIEF.md#8-the-furniture-on-the-ledges)
copies them into a table for the artist, and the registry wins if the two ever differ.

```bash
node tools/shot-decor.mjs --elements --zone=DUNGEON   # decor-dungeon.png, THE VIEWER: every variant and frame at 4x (--mag),
                                                      # alone over magenta and in place on the zone's own ledge and sky
node tools/shot-decor.mjs                             # decor.png: every zone on its real tile and sky, four ledges each
                                                      # (--zone=A,B, --mag=N, --t=seconds into the animations, default 1.3)
node tools/shot-decor.mjs --legacy                    # decor-legacy.png: the same ledges drawn by the old world-unit painters
node tools/decor-sheet.mjs                            # decor-elements.png: every element alone beside its gridded box -- the artist's sheet
node tools/decor-fix-sheet.mjs                        # decor-fixes.png: the five a hand still beats the code at, each with a brief
node tools/import-decor.mjs                           # where each of the 23 comes from, and why a PNG was turned away
node tools/import-decor.mjs --emit > src/render/decorart.js
node tools/test-decor.mjs
```

`shot-decor` (but for `--legacy`), `decor-sheet` and `decor-fix-sheet` draw through
`decor.js` itself, so they show the sprites the game draws. In the viewer's in-place cells
a bobbing element is shown at rest. To judge a redraw, look at it in a real frame at zoom 1
as well: every element in the row *Furniture that read as something else* below looked
right alone and magnified.

**PNGs go in `assets/decor/`** as `<ZONE>-<ELEMENT>.png`, frames side by side, variants
stacked, each cell exactly the box, on a transparent background; `assets/decor/README.md`
is the artist's copy of the rules. `import-decor` checks the NAME, the SIZE (exactly box
width x frames by box height x variants), that some pixel is transparent, and that no cell
is blank; a file that fails is left out and its element stays painted. It converts and
copies nothing -- the game loads the PNGs as they are -- and `--emit` lists only files
that passed, because the game requests exactly what `decorart.js` lists and a 404 fails
the desktop build's smoke test.

**`tools/test-decor.mjs`** (in `npm test`) holds: the 23 elements by zone and name, as a
literal list; each spec usable, no box wider than the narrowest ledge and no hanging box
longer than the gap under its ledge; every cell painting something, the same twice, inside
its box, and a redrawn element's frames differing; every zone's scene deterministic and
inside the ledge at every width from 22 units and on the real squeezed ledges; the crypt's
rules (nothing twice, nothing wider than its slot, the torch only in free space at the far
end); the importer, on PNGs it writes to a temp folder; a headless render through the
renderer's own world transform at zoom 1 and 2 putting every art pixel on whole backing
pixels, standing, hanging from the tile's drawn underside (worked out in the test from the
tile art, not asked of `decor.js`) and floating, right way up; the torch's frames, the
orb's bob, and the shaft's breath -- its core the same pixels in every frame and, composited
over ZENITH's own sky, warmer than that sky by a margin, with the glow and the pool swinging
round it and the sprite never dimmed; warming. The 22-unit floor and every zone's chance
are pinned as LITERALS, because a check that read them back from the code followed a
changed rule: `DECOR_MIN_W` lowered to 16, or DUNGEON's chance raised to 0.60, passed it.
The registry, paint, scene and importer checks, and the shaft's breath, are each also run
against something built to fail them -- for the shaft, five mutations of the real element,
among them the old whole-sprite pulse and a cold blue-white repaint of the same drawing,
which passed every other check until the warmth one was added.

## Textures and effects drawn in code

Five things round the play were drawn the old way until 2026-09-23. Four of them -- the
start floor, the rising floor, the side walls and the speed streaks -- were rectangles in
world (or, for the streaks, view) units, every stroke four backing pixels thick or more,
four times chunkier than the Duke, the ledges and the furniture beside them; the fifth,
the trail, was square specks of three or four art pixels in the zone's colour, following
his speed alone. The artist's brief for them went out as
`tools/brief-sheets.mjs` (`brief-textures.png`, `brief-effects.png`; what it asks for is in
[ART-BRIEF.md](ART-BRIEF.md#what-came-back-and-what-is-still-open)), and the user then asked
for them to be drawn in code instead. Each is now painted at one art pixel per
backing-store pixel at zoom 1, in the shapes that brief asked for, and each module's header
says what it replaced, what it is now and why. Four of them paint with the furniture's kit
(`Pix` and `pixToCanvas` from `decorpaint/util.js`), so a drawing reaches its canvas as
`fillRect` runs, the one path the headless canvas draws exactly. Two effects joined them
later, neither in the brief: the speed afterimage (flat silhouettes of the Duke on the path
he took, restored after a halo that replaced it for a day), and the death's burn, which is
a compositing layer more than a picture and is written up in
[ARCHITECTURE.md](ARCHITECTURE.md) ("The death's burn layer").

**None has a PNG drop-in.** Nothing loads an artist's file for any of them: each paints the
brief's tile shapes itself (or, for the effects, the sprites), and delivered art would need
a loader and a manifest written first, as the backgrounds and the furniture have. Where a
file would go in, and what it would have to agree with, is under each below.

| Module | What it draws | Built | A frame draws it with |
|---|---|---|---|
| `ground.js` | Floor 0, the start floor | once, at the Renderer's construction (`warmGround`) | one `drawImage`, one `fillRect` |
| `risefloor.js` | The rising floor | once for the whole game, a piece a frame before the rise arms (`warmRise`) | one `drawImage` per strip on screen, three to five as measured when it landed; the deep crust takes one per 256 rows in view |
| `walls.js`, `wallpaint/<zone>.js` | The side walls, one per zone | per zone, the first time asked; the next zone a while ahead | two or three `drawImage` a wall |
| `streaks.js` | The speed streaks | per zone, an atlas, kept for every zone once painted; the next zone 240 frames into the current one | one `drawImage` a streak, four for the edge bloom |
| `sparks.js` | The combo trail | one atlas, on the first draw | one `drawImage` a piece |
| `afterimage.js`, `drawGhost` in `sprites.js` | The speed afterimage | four silhouette atlases, at the Renderer's construction (`warmGhosts`) | at most four `drawImage`, one a copy |
| `burn.js` | The tower burning away in the death | its masks, at the Renderer's construction (`warmBurn`) | in the death only: the burning rows through one layer, the masks as tiles |

### The start floor (`ground.js`)

A course of flagstones whose top row is THE landing line -- the brightest clean row on the
ground, as row 12 is on every ledge -- with a rim of the deep colour over it on row 11, as
every ledge has a dark row over its lit top. Under the flags, rounded stones of different
sizes packed in dark earth (a weighted Voronoi of Poisson-disc centres, each cell rounded),
lit from the upper left, darkening stone by stone with depth until everything is `DEEP`,
the one colour the view below is filled with. A stone sinks WHOLE, by the depth of its
centre plus its own jitter, through a small hand-set table (`SINK`) that closes its lit rim
onto its body before it goes out; see the row *Scratches on the start floor* below.
`drawPlatforms` hands floor 0 (`pl.kind === 'ground'`) to `drawGround`, which stops at the
half-width the WALLS are drawn at, not the ledge's width: while the shaft widens the walls
glide out and floor 0 steps at once, and the ground painted over both walls to the screen
edges for about a second whenever someone ran along the start floor to build speed.

**Why the game does not tile it.** The brief asked for GROUND-TOP 64 x 40 (surface on
row 12) over GROUND-FILL 64 x 64, and `groundTiles()` paints exactly that pair, wrapping by
construction. But rubble repeated every 64 px read as wallpaper in the first real frame --
bricks repeat and nobody sees it because bricks are regular; rubble is not -- and variants
sharing a border band still repeated the brightest rows. So `warmGround()` paints the
ground ONCE, with the same painters, as one strip across the widest the shaft can open,
cut back to its last row that is not all `DEEP`; a strip is finite, so nothing repeats and
nothing needs to wrap.

**Real art.** A delivered GROUND-TOP and GROUND-FILL would replace `groundTiles()`'s pair,
and the game would then have to lay them out by repetition -- the wallpaper the painted
strip was built to avoid -- or paint them into the strip. Decide that before asking an
artist for them. No tool prints `groundTiles()` yet.

### The rising floor (`risefloor.js`)

A tide of fire, the same in every zone so it is known at a glance: two ranks of flame
tongues licking up off a yellow-hot crest, the kill line on the crest's top row
(`SURFACE_ROW` of the edge), and under it a crust of red-hot plates in molten seams cooling
to a dark body some fifty pixels down, lit from the upper left. The flames are drawn as the
DUNGEON wall torch draws fire -- rows of `[offset, width]`, tip first, toned by how far in
from the row's edge a pixel is, a halo of deep red round them and NO outline, because fire
is light (the row *Fire that read as thorns* below). They flicker through four frames and
crawl sideways, the crust drifts the other way, and the crest beats at `THREAT_HZ` with the
danger band and CLIMB! (it beat with the FALL ROOM gauge too, until that gauge was taken
out of the HUD); the rates are constants at the top of the file, with units. In play the
body reaches the bottom of the view; in the death it ends `RISE_DEPTH` of the view down in
a dripping underside, so he falls out of it into the shaft.

**How it is cached.** Tiles are never blitted one by one. Each frame of each part is
composed ONCE into a strip wider than the widest view plus its own pattern's period plus
a margin for the screen shake, and a frame draws each strip that is on screen once (the deep
crust once per 256 rows of it in view; three to five blits in all when it was measured). The rim's tiles are
mixed so no two neighbours show the same frame, which makes it repeat every 512 px rather
than beat out the 64 px tile across the screen; the hot top of the crust gives every copy
of every plate its own heat, so its glow repeats every 256 px instead of tracing the 64 px
crust tile as a lattice. The strips reach 8 world units past the view: the shake moves the
world by up to 7, and at 4 a full shake uncovered a band of tower under the floor. It is
built once for the whole game -- it does not vary by zone -- one piece a frame by
`warmRise()`, which the renderer calls every frame the rise is not yet armed (the Duke on
the ground floor, or the menu's demo before it climbs).

**Real art.** The brief asked for RISE-EDGE 64 x 16 in four frames (256 x 16) and
RISE-BODY 64 x 64 in two (128 x 64); `edgeTile(f)` and `bodyTile(f)` are exactly those
tiles and `riseSheets()` lays them out as the two PNGs would be (no tool calls it yet). A
delivered edge would take `edgeTile`'s place in the rim strips as it stands. A delivered
body would replace the deep crust only: the heated top of the crust (`paintNear`) is
computed from the crust painter's own plan of plates and seams, which a PNG does not carry.

### The side walls (`walls.js`, `wallpaint/<zone>.js`)

Each zone paints its own wall, one module per zone as `bgpaint/` and `decorpaint/` have,
each default-exporting `{ PAL, wall(r, th), face(r, th) }`: a WALL tile 64 x 128 that repeats
both ways and a FACE 8 x 128, the inner edge the Duke bounces off, with a lit rim down it --
both drawn for the LEFT wall, both fully opaque. `wallpaint/util.js` is their kit: painters
work on a PLAN of palette indices turned into colours at the end, and a plan reads and
writes modulo its own size, so a wall is seamless by construction. Each zone's materials
come from its ledges and its backdrop -- cellar brick, crypt rubble, bark, roots in mud,
half-timbering, ashlar, basalt, a heap of bones, a bed of crystal, black glass, a star
chart, gilded scale -- kept down near the backdrop's own value, under the ledges' lit top,
and with nothing lit and level enough to look standable. Each module's header says what it
is and, for the three that were redrawn, what it read as first (the row *Walls that read
as something else* below).

`walls.js` lays a zone's two pieces into one strip -- two tiles of wall and the face beside
them, four tiles tall -- painted the first time the zone is asked for, and the NEXT zone's
strip `WARM_AFTER` frames after the current zone appears (after the backdrop's own warm-up,
so the two never land in one frame). The texture belongs to the world: its rows are pinned
to world heights, so it scrolls with the climb, and across it is pinned to the inner edge,
so it slides out with the walls as the shaft widens. The right wall is the left one through
a negative x scale. Across a zone change the next zone's wall is drawn over the current one
at the backdrop's blend; both are opaque, so that IS the exact crossfade and needs no
offscreen buffer. `drawWalls` in `renderer.js` still draws the floor ticks over it.

`tools/test-walls.mjs` (in `npm test`) holds every zone to the brief -- its own painter, the
brief's sizes, opaque, seamless, quieter than its ledges' lit top, no lit line across the
tile, a rim brighter than the wall's body, few lone pixels, a cold build under its limit --
and the runtime to the crossfade, the scroll, the mirror, the art grid, a cap on the blits
and painting the next zone ahead.
`node tools/shot-walls.mjs` puts each zone's walls in real frames (`--tiles` shows the two
pieces alone).

**Real art.** The brief asked for `<ZONE>-WALL.png` 64 x 128 and `<ZONE>-WALL-FACE.png`
8 x 128 per zone, and `paintWall(theme)` returns exactly that pair for `wallStrip` to lay
out. A delivered pair would go in there, and must be fully opaque or the crossfade stops
being exact; `test-walls`' limits are the ones to hold it to.

### The speed streaks (`streaks.js`)

Screen-space lines that pour up the screen as the run gets faster. Each is a comet: a head
in the zone's head colour capped by a rim pixel, then a tail one pixel wide (two for a near
line over its first 45%, tapering on its shaded side), with a one-pixel dark rim either
side. Tails are opaque, hold their colour through their first half and step down in six
bands through the second; there is no global alpha, which used to thin every line toward
the backdrop. Length, speed, width and brightness all come from one depth per streak, so
near ones are long, fast and bright. The player's verdict on the version before -- they
should speed up much more as the run gets faster, cover the middle as they used to, and
stand out from the background -- is what shaped each part:

- **Speed that climbs.** A near line rises at `V_A` e^(`V_K` I) backing px/s for intensity
  I: about 1,300 quick (I 0.4), 2,900 fast (0.7) and 6,500 flat out (1.0), each step 2.2
  times the last. It was (0.35 + I) x 2,680, so fast to flat out, the step that should feel
  biggest, was only 1.3 times. A far line runs at a quarter of a near one's speed and up.
  Length is that speed seen through a 0.09 s shutter plus 120 px (`LEN_SHUTTER`,
  `LEN_BASE`): about 230, 380 and 650 px for a near line, snapped to one of 22 painted
  lengths so nothing is drawn stretched. Judged in strips of consecutive 160 Hz frames, a
  line moves a fortieth to a fifteenth of its own length a frame, so it reads as one line
  running up rather than a dash that jumps.
- **The whole width.** They spawn across the full width, crowded toward the sides: the
  inset from the nearer edge is `BAND_POW` (1.6) power of a uniform draw, which puts about
  a quarter in the outer tenth of each half and a sixth in the middle quarter of the
  screen. The version before gathered them into two bands down the sides and left the
  middle three fifths empty at every speed.
- **A tone per zone, measured against its backdrop.** `TONES` in `streaks.js` gives each
  zone a far, near and head colour and a rim, chosen against that zone's backdrop measured
  in real frames (median and 95th-percentile luma, mean hue behind the play): light over
  dark, from the zone's own light materials, in a hue far from the backdrop's -- amber and
  orange over violet, blue and green, gold over blue, ice blue over magenta, lavender over
  deep blue. The comment over `TONES` tables each zone's measurements. They used to be
  tinted from the zone's `speedramps.js` ramp, which in most zones is the backdrop's own
  hue a few steps lighter (cyan on DUNGEON's blue stone, green on SWAMP's green); nothing
  in the game reads `speedramps.js` now, only `test-platstyles`. The dark rim is what
  carries ZENITH's streaks across its pale light shafts.
- **Behind the ledges, and never brighter than them.** `renderer.js` draws them after the
  walls and BEFORE the ledges, the rising floor, the HUD, the companions and the Duke.
  Drawn last, they crossed his face and the HUD's numbers. Drawn over the ledges, a line
  bright enough to stand off a dark backdrop was brighter than a dim zone's lit ledge row:
  glare on a ledge. Behind the ledges no line can cross a lit top row, and no streak pixel is
  brighter than that zone's ledges' own brightest pixels (their 98th-percentile luma) --
  which is why BASEMENT, DUNGEON and FOREST, whose ledges are dim, get saturated oranges:
  at that luma only a saturated colour still stands off the backdrop.

Positions, lengths and speeds are in backing pixels and ignore the zoom -- world-space
streaks would shrink exactly when the run is fastest -- but the GRAIN follows it: a streak
pixel is two backing pixels at zoom 2 and 1.75, where the Duke's art pixel is two (or
nearly), because a one-pixel hairline over the chunky first floors looked like a scratch on
the screen. A line keeps the grain it was born with.

**The pool.** `STREAK_BUDGET` (`src/game/settings.js`) caps the lines by particle setting,
and the intensity squared of that cap is how many are wanted: a trickle when quick, all of
them flat out. The cap is hard, shrinking lines included, and lowering the setting cuts the
pool at once; streaks off draws nothing, not even the edge bloom. Between those, the pool
follows the intensity without a line appearing or vanishing in plain view: a new line
enters from below the screen, somewhere in the half-screen under it (`TOPUP_BAND`) so a
burst does not arrive as a front, and a line no longer wanted shrinks into its head over
`SHRINK_S` (0.2 s) while it goes on rising -- those still below the screen go first, then
those nearest the top. Only a cold pool (a screenshot tool's single frame, the setting
switched on at speed) is filled at random heights. The row *Streaks that popped in and
vanished* below is why. In the death the pool is RETIRED: the intensity falls linearly from
where the climb left it to none over `STREAK_LET_GO` (0.15 s), so each line shrinks into
its head as above, while the lines keep rising at the pace the climb gave them
(`Game.fallPace`, the renderer's `pace`) rather than slowing as they go -- the last gone
inside `FALL_CLEAR` (0.35 s) of the catch. They used to become the plummet's, following
how fast he fell, and flat out that filled the shaft with a hundred thin orange lines all
the way down: rain, over a fall that is meant to be him alone (the row *Streaks that
became rain in the fall* below). The fall's own wind lines, bars that ran DOWN the screen
and flickered like rain, went before them (the comment on `drawFallOverlay` in
`renderer.js`).

**The atlas.** Every shape -- each length, both widths, three tones -- and the edge-bloom
strips are painted into one atlas per zone, one `fillRect` per run, and a frame draws each
streak with one unscaled `drawImage` from it (or an exact double at the coarse grain), so no
row of a head is ever dropped or doubled. Past intensity 0.75 the screen's edges bloom in
stepped bands of the zone's head and near colours, four more `drawImage`s. Every zone's
atlas is kept once painted -- about 1.5 MB each, 18 MB for all twelve -- as the walls'
strips and the backdrop's layers are, and the NEXT zone's is painted once the current one
has been on screen `WARM_AFTER` (240) frames, never on the frame of a change. The row *An
atlas repainted on a run's first frame* below is why nothing is evicted, and *A canvas
width that slowed every frame* why the atlas sizes are forced to integers.

**Real art.** The brief asked for a board of the look at three speeds and, optionally,
`STREAKS.PNG` (four white streaks). The shapes are generated by `plan()` from the table of
lengths and coloured from the zone's `TONES`, so a drawn streak would have to become
`plan()`'s runs, or the atlas be built from the PNG and tinted; neither exists. In play no
suite checks the streaks directly (`test-perf` and `test-font` play with them on);
`test-fallclear` holds them in the death, where no line may vanish mid-screen and none may
be drawn after `FALL_CLEAR`.

### The combo trail (`sparks.js`)

Stars and sparks falling out of the Duke, keyed to the LIVE chain rather than to his
speed: a few sparks in the zone's own colours with no chain, then a palette of its own at
every multiplier step, every `MULT_STEP` (50) floors of the chain (`STEPS`; CRUSADE is the
Lithuanian tricolour), bigger stars as the chain grows, gold and white at GLORY, and past it
sparks cycling through every colour in the set. The rows keep the callout words' names,
SWIFT to GLORY, from when the callouts were the combo's steps; the callouts mark the tower's
heights now, and take their colours from these rows (below). The shapes are drawn by hand as ASCII -- a spark, four-point twinkles at 5 and 7 px,
five-point stars at 7 and 9, an eight-rayed glint -- four twinkle frames each, in four-tone
hue-shifted ramps lit from the upper left; a piece burns out by shrinking a size at a time
(only its last moment is drawn at part alpha), because alpha fading a pale star over a
coloured sky turns it grey. A ramp that a zone's sky would hide is swapped there for one
that shows.

Three rules keep it off the play, each structural: it is drawn FIRST, behind the walls, the
ledges and the Duke (`drawSparks` before `drawWalls` in `renderer.js`), so nothing a player
tracks is ever painted over; every piece leaves him going backward relative to him, under
one of his velocity (`INHERIT`), so it trails along his path and never runs ahead onto the
ledge he is about to land on; and the particle setting caps how many are alive. The pieces
live in `particles.js`'s pool but in slots of their OWN, a region after the ring every burst
shares, written round-robin and sized so that even at the top rate a lap takes as long as
the longest life a piece has (`TWINKLE_ROOM`); the row *A trail that stole the landing
dust's slots* below is why. Every sprite sits in one atlas, built on the first draw -- the
first frame of the title screen -- and never again. In the death the trail stops shedding,
and every live piece -- the trail's, and every burst's -- is hurried through the rest of its
life within `FALL_LET_GO` (0.3 s) by `Particles.letGo`, keeping the fraction of its life it
had left, so it goes through its same stepped fade, faster, and no star goes out in one
frame (the first version gave each the same 0.3 s, and a long chain's stars all went out
together). `tools/test-sparks.mjs` (in `npm test`) checks the sprites, the steps at every
`MULT_STEP`, the caps, the backward launch, the stop and the pool; `tools/shot-trail.mjs`
puts any chain length in front of the camera in any zone, `--measure` counts what the trail
changed on the ledges' top rows (it must be zero), and `--sheet` shows every sprite in every
ramp.

**Real art.** The brief asked for a board of the look at four steps and, optionally,
`SPARKS.PNG` -- the pieces at 3, 5, 7 and 9 px in 9 x 9 cells, four frames across, in white
and pale tints. What that would replace is the ASCII in `sparks.js`, which is painted by
TONE, 0 to 3, into every ramp, so a delivered sheet would have to come in as four tones to
be coloured per step; the atlas cells are 11 px, not 9. There is no loader.

### The speed afterimage (`afterimage.js`, `drawGhost` in `sprites.js`)

Four flat silhouettes of the Duke in one tone -- white over a dark backdrop, black over a
light one, decided from the zone's NEAR colour -- at alphas 0.079 down to 0.025
(`GHOST_ALPHA`), behind him when he is fast and hot: faded in with how fast he moves along
his path (`GHOST_FROM` 78 to `GHOST_FULL` 356 units/s) and with his momentum
(`GHOST_MOMENTUM_FROM` 0.45 to `GHOST_MOMENTUM_FULL` 0.65), so nothing switches on or
thickens in a visible step; with trails off in the graphics options there is none. The
tunables are the `GHOST_` block in `constants.js`, each with its unit.

What matters is where the copies go. Each is a point he was actually DRAWN at: the renderer
records his drawn state every frame -- position, pose, facing, squash, quarter turn -- into
fixed rings (`Afterimage.record`, `GHOST_HISTORY` of them), and copy k is where he was
k x `GHOST_DT` (9 ms) ago, unless that is more than k x `GHOST_GAP` (2 units) of path back,
when it is there instead. So four copies reach at most 8 units behind him, and the chain
bends through his arcs, folds at wall bounces and curls with the roll; the old straight
line back along his velocity hung 28 units under his boots on every launch. A copy between
two recorded frames takes the OLDER frame's drawing -- the one on screen while he crossed
that point -- with its position interpolated, so the spacing is the same at 60 Hz as at 240.
The path starts again on a new run, a switch of game (the menu's demo and the run share one
renderer), the death, the trails switched off, or a frame further from the last than his
speed could have carried him (a teleport in a tool); a copy is never drawn across such a
jump, and the trail grows back over its first 36 ms.

Every copy is drawn by `drawGhost` through `placeCell`, the one function that also places
`drawSprite`'s cell -- the drop onto his boots (`FOOT_DROP`), the squash, the quarter turn
about `SPIN_PIVOT` -- so each copy is exactly the shape he had and where he had it (the row
*A ghost placed by its own copy of the placement* below). The silhouette atlases hold only
the rows the drawing atlas holds, so a standing pose's shield point under the landing line
is left out of both.

For a day it was something else: the user saw the old trail "trailing way behind him when
it should be on top of him", and it became a halo round his outline, placed by the sprite's
own code -- on him, but not the look, and broken in the roll. The user asked for the old
look back, "actually following the duke", and that is what this is (b3e70a1). The roll's
own fault, the tuck turning about its cell's centre, is the row *A roll about the cell's
centre* in DUKE.md (and in ARCHITECTURE.md's bodies table, as a transform).
`tools/test-afterimage.mjs` (in `npm test`) plays the bot, a drop and runs along the ground
at 160 and 60 Hz at every rest zoom and checks every frame: the recorded state redraws his
sprite exactly, every copy lies on his drawn path and is `drawSprite`'s own placement for
that state, bit for bit, the chain overlaps him and itself, the roll's copies keep their own
quarter turns, trails off draws nothing, and nothing survives a teleport, a new run, a switch
of game or a death. `tools/shot.mjs` draws the 50 ms before each shot, or no shot would
have a trail to show.

**Real art.** None needed: the silhouettes are the sprite's own pixels in one tone, so a new
sheet brings its afterimage with it.

## The zone titles and the HUD, drawn in code

Two more things are painted in code at one art pixel per backing-store pixel, and neither
was ever in a brief: the name that comes up as the climb enters a zone, and the HUD. Both
were plain -- the name in the 5x7 font, the HUD flat bars and flat text -- the same in
every zone and four times chunkier than everything beside them, because one pixel of the
HUD's 480 x 270 view is four backing pixels. Both are now drawn per zone in the zone's
own materials, taken from its ledges, decor and wall, and both keep the font's
letterforms, so every word on screen is still one alphabet. Like the textures above,
**neither has a PNG drop-in**; what a file would have to replace is under each. The game
over board is built from the same two -- GAME OVER lettered by the zone's title painter,
its panels the HUD's gauge frames round bigger boxes, its words in the HUD's inks -- which
is why their painters are also generators that can stop at a deadline ([The menus and the
scoreboard](#the-menus-and-the-scoreboard-drawn-in-code), below).

| Module | What it draws | Built | A frame draws it with |
|---|---|---|---|
| `zonetitles.js`, `titlepaint/<zone>.js` | A zone's name, as the climb enters it | per zone, a piece per HUD frame, from 170 HUD frames into the zone before it; kept once built | one `drawImage` settled, one more while an `over` frame or a `sweep` glint crosses it; during the entrance, one per letter or run of letters on one frame |
| `hudskin.js`, `hudpaint.js` | The SPEED bar, the combo meter, every word and number of the HUD | per zone, a piece a frame, from 200 frames into the zone before it; BASEMENT's at load; at most three kept | one `drawImage` per character, three calls per gauge |

The warm-ups are staggered so that no two paint in the same frame: the backdrop starts
120 frames into a zone, the walls 150, the title 170 and the HUD skin 200 (those two
counted in frames the HUD draws, so neither warms on the menus), and the streaks 240,
each its own `WARM_AFTER`. The callouts and the scoreboard warm on schedules of their own
(below, and ARCHITECTURE.md's "What the drawn layers cost a frame").

### The zone titles (`zonetitles.js`, `titlepaint/`)

Entering a zone used to put its name up in the 5x7 font at scale 2 in the accent colour --
the same plain letters for all twelve zones, the one piece of the arrival that did not
belong to where you had arrived. Now each zone letters its own name, one module per zone
under `titlepaint/`, as `bgpaint/`, `decorpaint/` and `wallpaint/` have. Each module's
header says what it took from the zone and how it stands off that zone's backdrop, and,
where a first attempt read as something else, what:

| Zone | Lettered in | Entrance |
|---|---|---|
| BASEMENT | cellar brick in running bond, dust on the tops, cobwebs in inside corners | drops into place |
| DUNGEON | crypt stone, iron straps, the decor's skull in the O | drops into place |
| FOREST | a hedge of leaves on a frame of branches, sprigs, red berries | bare frame, a scatter of leaves, the hedge |
| SWAMP | moss, soaked on its far flank, reeds out of the tops, bog drips below | rises out of the bog |
| DOWNTOWN | lit windows: each square of the font a pane of lamplit glass in a timber frame, the lantern's light round the word | each letter's lights come on, flicker, and hold |
| CITADEL | pale ashlar edged in gilt, the citadel's arms on a shield in the D | set down like a dressed block |
| STORM | cream cumulus, lightning out of the undersides | puffs in; bolts flash over it while it is up |
| ABYSS | bones, a double knuckle at each end of every straight run | drops into place, bone on bone |
| NEBULA | faceted crystal prisms, a glint on a few corners | seed, flash, crystal; a glint runs across |
| COSMOS | a dot-matrix of glowing orbs, one amber planet a letter | the orbs light up |
| STARFIELD | constellations: stars where strokes turn and end, thread between | the stars light, then the thread joins them |
| ZENITH | polished gold with a bevel, a sunburst behind | white-hot, cooling to gold; a glint runs across |

**The letterforms are the font's.** `titlepaint/util.js` makes each lit pixel of a 5x7
glyph a node `K` art pixels from its neighbours and links nodes side by side or one above
the other -- a diagonal pair only where no node sits in the corner between them, because
linking every diagonal filled each L-corner with a triangle and swelled the R's leg and
the S's turns into blobs. A painter asks, per pixel, how far it is from the nearest stroke
and which point of the stroke that is, and grows its material from that: leaves in a band
round the stroke, puffs along it, a gold bevel shaded by the direction away from it. N, M
and W have their strokes drawn by hand (`STROKES`): the font doubles a column to suggest
their diagonals, and as strokes the doubled column became a second stem. The block-built
titles (BASEMENT, DUNGEON, CITADEL), DOWNTOWN's windows and COSMOS's orbs read the glyph
cells instead (`cellMap`), on the same grid -- DOWNTOWN's N and W are the font's own, laid
in squares, where strokes would have needed their diagonals redrawn. Every title has `K` 11, and its letters are 77 to 81 art pixels tall -- six `K`
plus the stroke's width (`inkH` in `layoutWord`: 77 at a stroke half-width `R` of 5.5, 81
at 7) -- where the banner's were 56.

**The contract is `titlepaint/index.js`**: a module exports `paint(word, theme)` and returns
the layout (`plan`: its size, where the ink starts and how tall it is, and `cuts`, where
each letter's slice of the frame begins and ends), `frames` (one function per frame,
`frames[0]` the settled word; a heavy one may be a generator that yields between its
passes), and the entrance -- `seq`, the frames and whole-pixel offsets each letter shows in
turn, `stagger` between letters, and optionally `over` (a whole frame laid over the word
for a moment: STORM's lightning) and `sweep` (a band of a glint frame crossing the word:
NEBULA, ZENITH). The kit's heavy passes each have a generator form that stops at a
deadline (`layoutSteps`, `toPixSteps`, `dropShadowSteps`, `haloSteps`, `distOutSteps`,
`depthInSteps`, `despeckleSteps`); with no deadline set they never yield, so the titles
paint exactly as before, and the scoreboard runs the same painters under its budget.

**Built ahead, a piece at a time.** Painting a title is tens of milliseconds of per-pixel
work, and the frame a zone changes in already carries the flash, a shake and a burst of
particles. So `warmZoneTitles`, called by the HUD every frame, paints the NEXT zone's title
once the current zone has been on screen `WARM_AFTER` (170) HUD frames: the layout in one
step, then each frame painted in one step -- or one pass per step, for a frame written as a
generator -- and put on its canvas in the next. Painted and put on its canvas in one
piece, the heaviest frame, FOREST's leaves, cost 32 ms headless. A title asked for before
it is finished is built on the spot and counted (`titleLateBuilds()`, zero in a warmed
run). Titles are kept once built.

**Drawn one to one.** Each title is one canvas, its frames stacked, drawn at a quarter of
its pixel size from a whole backing pixel, so every pixel lands on one store pixel, with or
without shake. Settled, it is one `drawImage` (two while STORM's bolts or a glint cross
it); during the entrance each letter's slice
comes from the frame its own clock is on, raised or dropped by whole pixels, and neighbours
on the same frame and offset go in one blit. Place and timing are the old banner's: the top
of the centre stack, 2.2 s, and the same stepped fade over the last 0.35 s. What changed is
the height: the stack moves down by the title's own height (`zoneTitleRows`), not the old
20 units, or the next banner would land on its lower half. `hud.js` draws the titles first
and the text banners over them, because a title's glow and rays reach past its letters. A
zone with no painter falls back to the name as text.

**Real art.** Nothing loads a title from a file. A drawn one would replace a painter's
frames at `plan`'s size, and would have to bring the columns where one letter's slice ends
and the next begins. For the five zones whose entrance is only a drop or a rise --
BASEMENT, DUNGEON, SWAMP, CITADEL and ABYSS, whose `seq` shows frame 0 at whole-pixel
offsets -- one image of the settled word and its cuts would keep the entrance as it is. The
other seven make their entrance through frames of their own (FOREST's bare branches,
DOWNTOWN's unlit and flickering panes, STORM's wisps and bolts, NEBULA's seed and glint,
COSMOS's unlit orbs, STARFIELD's stars before their thread, ZENITH's white-hot gold and
glint), which one image does not carry. `tools/test-zonetitles.mjs` (in `npm test`) holds
every zone to a painter of its own, every title finished before its arrival over a bot
climb to floor 2640 (none built late), each announced once, and each legible over its own
backdrop.

### The HUD skin (`hudskin.js`, `hudpaint.js`)

The HUD was flat bars filled with the zone's accent inside a one-unit black edge, and text
with a black drop shadow or outline: the same in every zone, and against several zones'
backdrops a letter barely stood off what lay beside it (the measurements are in the commit
that made the skins, 7467006). The FALL ROOM bar down the right edge went in the same
change, at the user's request; the right edge under the score is left empty on purpose
(the comment at the top of `src/ui/hud.js`). Each zone now has a skin: `hudpaint.js` holds
the twelve (`HUD_ZONES`), and `hudskin.js` paints and draws them. The colours come from the
zone's own art -- its ledge palette, its decor and its wall -- so a gauge reads as a thing
from that zone rather than a theme swatch.

- **The gauges.** The SPEED bar and the combo meter are each a frame in the zone's material
  round a dark, translucent well -- the backdrop dimmed behind the fill, not blanked --
  filled with the zone's own light as a glossy tube lit from the upper left, with a brighter
  hot fill for the moments the old bars flashed white and a two-pixel leading edge where
  the fill stops. Brick and iron in BASEMENT, crypt stone in DUNGEON, bark and leaves in
  FOREST, moss on stone in SWAMP, honey timber and iron in DOWNTOWN, marble and gilt in
  CITADEL, cloud with lightning in the fill in STORM, vertebrae and a skull in ABYSS,
  faceted amethyst in NEBULA (it was teal, and lost it with the ledge), star-steel in
  COSMOS, jade with chevrons in STARFIELD, a gilt crown in ZENITH. A frame is painted on a
  `Plan` of material and tone per pixel, coloured only at the end: a bevel lit on its top
  and left faces, the zone's texture and ornaments (each spec's `frame()`, a GENERATOR --
  `rimEach`, `joints`, `grain`, `chips` and `shadeBlobSteps` yield between rows once a
  deadline has passed, so a scoreboard panel dressed by the same code can be sliced), then
  an outline in the darkest tone of whichever material it wraps. The helpers keep their
  pixel lists as bare numbers, x and y in turn, not an array per pixel: round a scoreboard
  panel that was tens of thousands of short-lived arrays, and the collector's pauses fell
  in the painting frames. The insides are the flat bars' own boxes (`BAR` and `METER` in view units, 296 x 20
  and 28 x 416 art pixels), with the room round each in `GAUGE_ART`, so every element is
  where players have learned to look.
- **The plate.** Round each gauge frame, outside its outline, runs a plate: two pixels of
  the zone's keyline colour and a near-black pixel -- four with the outline, the
  lettering's own keyline at scale 1 -- so the gauges and the words sit on one plate. No
  ledge has one, and it is what stops a gauge made of the zone's ledge material from
  passing for a ledge (the row *Gauges that passed for ledges* below). Lights (`GLOWS`:
  COSMOS's stars, ZENITH's glint) are left unwrapped and reach out over the backdrop. The
  plate is stamped round the silhouette's edge pixels rather than searched for round every
  empty one, because it is painted inside a frame while the next zone warms and the search
  was two million calls for the meter. The bar is drawn before its SPEED label, so the
  label's keyline lies over the bar's plate instead of the plate's near-black edge ruling a
  line through the label.
- **The lettering.** Every word and number is the game's own 5x7 font, glyph for glyph,
  laid out exactly as `drawText` lays it out: numbers are read at speed, and legibility
  beats flourish. Each glyph is banded in one of the zone's hue-shifted inks (the top two
  font rows light, the middle three mid, the bottom two low), lit along its top and left
  edges and shaded along its bottom and right, inside a two-tone keyline -- the zone's dark
  hue, and a near-black outer pixel where it meets the backdrop -- 4 art pixels wide at
  scale 1 and 8 at scales 2 and 3 (`KEY`). At scales 1 and 2 that closes the gap between
  glyphs, so a word sits on one plate; at scale 3, which only the callout's text FALLBACK
  uses (a word with no painter; the seven are lettered by `callouts.js`), for its first
  0.14 s as it pops, the gap is 24 art pixels and 8 of backdrop show between the keylines.
  The atlases take a character set, so the scoreboard letters its `:` `/` `,` `+` `-` in
  the same inks, and each has a generator form (`keylineAtlasSteps`, `inkAtlasSteps`,
  `paintFrameSteps`). The inks by role are built by `inks()` in `hudpaint.js`: labels,
  numbers, the hot and flash of a pinned SPEED meter, the shout, and gold and green, which keep their
  hue in every zone because players have learned them. CLIMB! is the same everywhere --
  the rising floor's red, flat, on its own near-black keyline (`DANGER_KEY`) -- because in
  each zone's shaded ink it measured worse under the danger band than the old flat red on
  black did, and a warning may not read worse than the one it replaced.

**It switches on the arrival.** The skin changes in the frame `game.theme` does -- under
the arrival flash, with the banner and the burst -- not across the backdrop's twelve-floor
crossfade: text crossfaded between two skins would be two keylines at once, a smear.
`hudSkinFor` paints the NEXT zone's skin ahead, one piece a frame, once the current zone
has been on screen `WARM_AFTER` (200) frames; the pieces are each scale's keyline and inks
and each gauge's frame, fill and hot fill. BASEMENT's is painted when the module loads,
because a new run always starts there. On each arrival every skin but BASEMENT's and the
arriving zone's is let go -- a skin is about 6 MB of canvas -- so at most three are held. A
piece painted in the frame that needed it is counted (`hudSkinStats().lateBuilds`, which
must stay 0 in play).

**Real art.** No loader. A drawn skin would replace the pieces `piecesFor()` paints. A
gauge frame is an image the size of its `GAUGE_ART` box with the well at a known offset,
and must bring its plate or have one stamped round it; a fill is the inside box as a tube
lit from the upper left, with its hot twin. The lettering is the font itself, so art for it
would come in as ink ramps -- five tones per role -- not as glyphs. `tools/test-hudskin.mjs`
(in `npm test`) holds every zone to a spec of its own with every piece BASEMENT's has,
the next zone's skin painted before its arrival over a bot climb to floor 2640 at 60 Hz
(none built late), the FALL ROOM column left empty, and every word the HUD prints legible
in every zone.

## The callouts, drawn in code

The seven callouts were the combo step's name in the 5x7 font at scale 2 in the zone's shout
ink: 56 px of 8 x 8 blocks, the same plain word for SWIFT as for GLORY, and a different
colour in every zone, so the word said nothing about how hot the chain was. They mark the
tower's heights now (`game/milestones.js`; when they fire is in GAMEPLAY.md), and each is
lettered at art resolution like a zone title -- the font as a skeleton, a material plan of
tone per pixel, coloured last -- by a painter of its own in `calloutpaint/`, each heavier,
hotter and brighter than the one before, so the step reads from the word's look as well as
its name:

| Word | Lettered as | Entrance |
|---|---|---|
| SWIFT | a thin cyan italic with gold speed streaks | slides in from the right |
| CHARGE | blued steel that strikes white-hot | rams in from the left |
| SOARING | cyan into magenta into violet, glowing | rises out of its own wake |
| RAMPAGE | red-hot, fire along every top edge -- the game's fire idiom, no outline | slammed down; the flames flicker |
| CRUSADE | the Lithuanian tricolour in enamel in a gilt rim, under a crest: the Vytis double cross on a red heater shield | stamped |
| THUNDER | white-crowned violet, struck by slanting bolts | bolts land on its letters; small crackles between |
| GLORY | white-hot over polished gold, radiant | popped in from a bigger painting of itself |

**The contract is `calloutpaint/index.js`**: a module exports `paint(word)` returning
`frames` (one function per frame, each giving a `Pix` and its anchor -- the middle of the
letters, the top row of their ink; a heavy frame may be a generator), `seq` (the entrance:
frames at whole-pixel offsets, never a scale), and optionally `over` (a frame laid over the
word for a moment: THUNDER's strikes), `loop` (frames shown in turn once settled: RAMPAGE's
flicker, THUNDER's crackle) and `sweep` (a glint crossing the word). `kit.js` is what they
share: `ramp7`, `bevelBody`, the italic, the glow, and `glyphInk`, the floaters' painter,
which the menus letter their small words with too.

**The colour is the combo's.** A zone title is made of its zone; a callout is made of the
chain, so its colours are the combo trail's (`sparks.js` `FIXED`), each step's word lettered
in its step's ramps (`STEP_BANDS` in `kit.js`), and the stars falling out of him, the word
over his head and the floaters thrown at that step are one colour language. The bands were
chosen for distance, measured in CIELAB: following the trail's ramps in order put CHAIN and
RAMPAGE 9 apart, the same orange.

**Placed and drawn one to one.** The word's letters start on `CALLOUT_TOP`, view row 80 --
four units over the old shout's row, because at 84 every lettered word, shadow and glow
included, overlapped the Duke longer than the old shout had -- and it leaves in three steps of
alpha over its last 0.4 s. The HUD draws it, under the characters, at 1/`PX` from a whole
backing pixel, so every art pixel lands on one store pixel; a word with no painter falls back
to the skin's text.

**The prestige badge** (`calloutpaint/badge.js`): from the second lap of the tower on, x2,
x3 ... beside the word, for a Duke who has not died. The user asked for "a 2x next to the
next announcement as a prestige", so it is lettered in the same kit and made precious: a
plaque of red enamel in a bevelled gold frame -- gules and or, the Vytis's own arms -- the lap
in polished gold on it, a warm glow round it and a four-point glint on its corner. The x is
the font's X drawn smaller on the digits' baseline, a times sign: at the digits' size "X2"
read as a word. The enamel is the dark ground that keeps the gold readable over every zone
(7.5:1 at worst against the brightest tenth round the digits, beside THUNDER over all twelve
at four heights). One badge serves a lap's seven words, painted ahead the lap before. The
RENDERER draws it, after the Duke, the companions, their calls and the floaters
(`drawCalloutBadge`), because it is the one thing on screen a player earned by staying
alive a whole lap; it stands `BADGE_GAP` clear of the rightmost pixel the word paints, on the
letters' middle row, and comes in `BADGE_AFTER` the word's entrance. Where the word's ink
ends is measured off its `Pix` while the build has it, never off the canvas (the row
"A badge that only drew headless" in ARCHITECTURE.md).

**The floaters** -- BOUNCE, TWICE, THRICE!, CHASE n and the +score of a banked chain -- stay
the game's font, because they are read in a glance at speed, but at 2 backing pixels per font
pixel (3 for the big ones; they were 4 and 8, the chunkiest thing on screen), in a two-pixel
keyline, with a one-size pop as they appear, and coloured by the combo step they were thrown
at: plain steel with no chain, then each step's colour, and past GLORY each letter a
different colour of the rainbow, walking. An ink -- every glyph a floater can hold, at every
size, in one step's bands or one rainbow colour -- is one canvas, and a floater is one
`drawImage` a letter.

**Built ahead, from the title screen.** Painting a callout is tens of milliseconds of
per-pixel work, so they are painted ahead a piece a frame -- the layout, each frame in one or
two pieces, then onto its canvas in the next -- driven by the renderer's floater pass
(`warmComboText`), which runs in every frame the renderer draws, the title screen's attract
run included: the seventeen inks, then the callouts, then the next laps' badges, all of it
about 120 frames after the title screen first appears. They were first warmed from the HUD,
which only play draws, so their pieces fell in the first seventy frames of every session's
first run while the title screen before it sat idle. Anything asked for early is built on the
spot and counted (`calloutStats`).

`tools/test-callouts.mjs` (in `npm test`) holds every milestone to a painter of its own; the
whole warm-up done on the title screen alone and nothing built late through a lap climbed
from a cold start; one `drawImage` for a settled word or badge, and nothing touching its
canvas's edge; every word and floater ink legible over every zone's backdrop at four heights;
the floaters in their step's colour, every step at least `STEP_DE` from every other in
CIELAB; a callout never on screen with a zone title, and over the Duke no longer than the old
shout; the badge over everything, in the shaft at every lap up to 99; and nothing read off a
canvas's pixels.

**Real art.** No loader. A drawn word would replace a painter's `frames` -- the settled word
and every frame its `seq`, `over`, `loop` or `sweep` names, each with its anchor.

## The menus and the scoreboard, drawn in code

The last screens drawn the old way were the menus and the game over board: the 5x7 font
blown up in flat colour inside a two-unit black outline, four backing pixels to a "pixel",
in 1px frames round flat dark panels, and a board the same in every zone, washed 82% black.
Both are painted now at one art pixel per backing pixel, from the kits above, and both keep
one rule: NOTHING COVERS A WORD. Every word sits on an opaque bed, so nothing of the demo
behind a menu or of the death behind the board can show on or round a letter. What they
cost a frame and when they are painted is in ARCHITECTURE.md.

### The menus (`menuskin.js`)

The user: "keep the current layout of the menu but give it the new art style that the whole
game has. make the press space to jump special and all the highlighted elements should feel
premium." The menu is the Duke's, not a zone's -- the attract run behind it climbs through a
dozen zones -- so it takes the Vytis emblem's own tinctures, gules, or and argent (`GULES`,
`OR`, `ARGENT`, seven tones each, opened out from `shieldart.js`'s palette): a crimson velvet
title plaque in a jewelled gold moulding with a breathing halo; PRESS SPACE TO CLIMB
lettered in gold on its own plaque, the SPACE key drawn as a real keycap, a glint crossing it
now and then and a slow breathing glow where the old prompt blinked on and off; the selected
row and the active tab in crimson enamel with a glint across them. The big words -- the
title, the subtitle, the prompt, the screens' headings -- are LETTERED with the titles' and
callouts' kit (`layoutWord`, `bevelBody`) on the font's own grid; the small ones -- rows,
labels, key hints, numbers -- are the font glyph for glyph, inked by `glyphInk`, so every word
is still one alphabet; keys are keycaps, a face, side walls and a front skirt with the legend
cut in. Premium is restraint plus one moment of shine: what is not highlighted is quiet
silver on dark, and ONE thing at a time catches the light, on one shared clock (`shine()`).
Nothing blinks.

Every word over the demo stands on a plate whose field is opaque -- the title's, the
prompt's, the records' and key hints' plaque, the sound notice's tab, the guide's panel --
because a keyline alone covers a letter and nothing between two lines, and a companion's call
box used to print its two lines through the key hints. The layout is the old one: 682 words on
22 screens are within 1.75 view units of where the old font drew them (`tools/menu-layout.json`
records the old places), and the two elements that moved are named in `test-menu`.
`tools/test-menu.mjs` draws the same menu over the real demo and over flat magenta and finds
every pixel of every word, and of its bed, identical; `tools/shot-screens.mjs` photographs
every screen the menu reaches.

### The scoreboard and the fall's words (`gameoverskin.js`)

GAME OVER is lettered by the zone's own title painter -- cumulus in STORM, bone in ABYSS, gilt
at the ZENITH, stone with a skull in the DUNGEON's O -- on a plaque wearing the finial the
combo meter wears; the numbers, records, awards and prompts sit on panels that are the HUD's
gauge frames round bigger boxes, over the zone's scene under a veil of its own dark
(`BOARD_VEIL`, 0.62) instead of the old 82% black. The frame is the zone's and the words are
the Duke's: every word on the board is in the menus' fine lettering (`boardLine` over
`menuskin.js` `mText`) -- the labels in the quiet argent, the numbers in bright argent, the
headings, the verdict, the headline numbers and a new record in gold, the awards in the stats
screen's green, a gold rule under each stat panel's heading -- and SPACE TO CLIMB AGAIN is
made as the title screen's PRESS SPACE TO CLIMB is (`mPromptSpec` / `mPromptOn`): TO CLIMB
AGAIN lettered in gold at scale 2, SPACE the key itself, a glow breathing under it cut to the
key panel's well, the keys under it as keycaps (`mHints`). Nothing on the board blinks. Every
panel's well is opaque and every word lies inside one, so the body, its pieces, the blood, a
frozen companion or a settling burst can only show between them. Where the body lies depends
on the arena, the zoom, the fall and whether SPACE cut it short -- anywhere from 18% to 82% of
the view -- so the guarantee is made by the drawing order, not by steering the layout round
him.

Until 2026-09-29 the words were the HUD's zone inks on its thick keyline: the same 5x7 letters
at the same four backing pixels a font pixel as the menus', but flat, every label as loud as
every number (CITADEL's whole board one yellow), the prompt a slab of white blinking, the
record line flashing -- the one screen after the menus still in the old lettering ("the stats
should use a nicer font"). The menus' keyline is two pixels where the HUD's was four, so the
panel's well shows between the lines, and eleven rows nine units apart read as a block of
type: the rows are ten apart now, and the room came from the news panel, which named up to
three awards on a line each and names them on one (the three longest names in the game take
55 of its 60 letters), two lines deep instead of four (`PANELS`, `KEYS_ROWS`). A board is now
its two title words and four panels -- the thirteen glyph atlases each zone's board painted
are gone, 4.6 MB a board where it was 7 -- and the lettering, the same for every zone, is
painted once at load (`warmBoardLettering`), with everything the herald's lines and the
companions' calls draw.

The fall's words -- SPACE TO SKIP on the way down, then SPLAT or OOF, the verdict, FLOOR n
and SPACE -- are lettered the same way and drawn OVER the world (`drawFallWords`); drawn with
the HUD, under the characters, a splat's pieces flew across them (3,952 pixels of him inside
the words 0.2 s after an impact in the start arena). SPLAT and OOF are LETTERED at scale 3, as
PAUSED is: SPLAT in `ROUGE`, the rising floor's red (#ff4d64) opened out to a ramp, as CLIMB!
is printed in it, and OOF in gold. SPACE is a keycap, and SPACE TO SKIP a keycap and its
words, coming up whole over 0.2 s where it blinked. The impact's words fade in WHOLE over
`IMPACT_FADE` (0.35 s): each word is put together once, letters on their keyline, and that one
picture fades in from nothing (`boardFade`; the row *Words that came up as stencils* below).

**The herald's lines and the companions' calls** are the same lettering. A herald's line
(`hud.js`, the banner stack's text) is `mText` in the Duke's tinctures -- argent for what the
game gave in white, gold for a colour (the zone's accent, the ascension's pale gold) -- where it
was the font stamped eight times in black round a flat colour; its glyphs abut without
overlapping, so the stepped fade out fades each line whole. A call (`drawCompanionCalls`) is
the menus' plate (`mPanel`, the gold bead round an opaque field) at the box's old size, the
name in gold and the words in argent. `tools/test-hudskin.mjs` section 5 measures both over
every zone: 7.8:1 or better against their keyline, and it prints what lies behind a herald's
line -- in ABYSS the scene there can be as bright as the letters, where the keyline alone holds
them.

A zone's board was 60 to 100 ms of painting in Chromium with its glyph atlases (less without
them, not measured there since), and it is painted AHEAD, never in the
fall: every painter here is a generator run under a deadline while he climbs and on the menus
(ARCHITECTURE.md, "Painting ahead in slices"), BASEMENT's is painted whole at load, and a
death wears its zone's board if that is finished and otherwise the last one that was.
`tools/test-gameover.mjs` proves pixel by pixel that nothing lies on a word -- including
anything drawn over a word after it was lettered, which the first version of the test could
not see -- and that the impact's fade is one picture; `tools/test-boardwarm.mjs` holds the
warm-up; `tools/shot-gameover.mjs` photographs the board for a death anywhere.

**Real art.** No loader. A board would come in as the HUD's pieces would -- a panel frame per
box with its plate, ink ramps per role -- and GAME OVER as a title painter's frames.

---

## Where the bodies are buried

Things in the art pipeline that took real debugging. Do not re-discover them. DOWNTOWN was
called VILLAGE until 2026-09-23; the rows below use its name now.

| | |
|---|---|
| **The headless canvas made translucent tiles dark** | Its blend mixed a colour into whatever was there and set the pixel opaque, which is right over an opaque pixel and wrong over a TRANSPARENT one: drawing at 50% onto an empty canvas mixed the colour half with black and made it solid. Nothing noticed while every translucent draw went straight onto the frame; the three-layer backgrounds pre-render translucent tiles, and every headless shot of them came out at two thirds of their real brightness while the browser drew them right. It composites source-over with the destination's alpha now. A headless render is only evidence if the headless canvas agrees with the browser -- compare means when a render looks "a bit dark". |
| **Layers never move sideways** | They scroll up and down only, so where a thing stands in its tile is where it stands against the other layers for good. Placed at random, DOWNTOWN's NEAR house stood squarely in front of MID's and hid it, and a FOREST MID trunk stood behind a NEAR one; trunks and houses have set places that interleave now. Random heights put three moss curtains on one line, which the tile then repeats across the screen: SWAMP staggers them by the golden ratio. |
| **A seam the test invented** | The wrap test compares a tile's opposite edges pixel by pixel, so a layer that wraps exactly still fails it if something speckled lies ON an edge: dithered strands and leaves differ from their neighbours everywhere. NEBULA's grained, ragged gas edge over transparency measured 23 against a limit of 12. Grain the inside of a shape, not its outline. Keeping whole shapes off the side edges passes the test and can cost more than the seam did -- it is what left SWAMP's lanes (the next row); where a layer's neighbouring columns already differ by more than the limit, paint it on `ringTile` instead, which makes the edges identical. |
| **Lanes, diagonals and a corner mark (SWAMP)** | Three faults, each hidden by the one before. (1) The curtains were kept off the tile's side edges so the wrap test would pass, which left a full-height lane of bare bog at every tile edge, MID's and NEAR's at nearly the same x, and between the lanes the same few curtains repeated every 128 units: a lattice of moss columns, seen only once the repaint raised the contrast. Now the layers are painted on `ringTile` and the curtains are a ring across the edge. (2) Dealt round that ring, NEAR's three heights could not help WINDING -- three heights round a ring always do, whatever the order -- so they stepped down across the tile like a staircase, and tiled, a staircase is parallel diagonals across the screen. A deal is kept now only if the ring's winding is 0 and no more than two steps in a row go the same way, and NEAR has four curtains, the fewest that can go down and up again. (3) At period 255, FAR's 4 x 4 dither lost its phase at the tile edges and printed a small hash mark at every tile corner; FAR is back at 256, where its close tones cross the edge honestly. Caught in real frames over a zone's worth of floors, not on one tile, and measured by matching the layer against itself shifted by a curtain's step (the diagonals matched at 0.45; now 0.13). |
| **The palette that belonged to the whole sheet** | Painting DOWNTOWN and STORM over the provisional cut and re-emitting moved 2751 pixels in nine of the OTHER ten zones, 1143 of them in SWAMP, with no change to their art. The importer snapped the whole sheet to one palette of eighty keys built from its colour counts, with thousands of clusters for those keys, so a change in one zone let a different colour win a key and zones nobody touched re-snapped. Caught by comparing the decoded RGBA of every other zone before and after, not the module's text. The first fix pinned the palette and gave DOWNTOWN's honey timber eleven spare keys of its own; with ten more zones about to be painted there were three keys left, so every zone has a palette of its own now, keyed independently and made from its own pixels, and nothing in one zone can move a pixel of another. `tools/diff-platforms.mjs` is the before-and-after RGBA check, run by every repaint. A shared resource makes every change a change to everything that shares it. |
| **Half a post** | DOWNTOWN's first gallery wrapped exactly, and one ledge in eight (12.5%, over 3000 ledges) still ended in a sliver of hanging post a few pixels from the end post. `drawPlatforms` ends a run with a part tile cut from the tile's left, which with whole-unit widths can end at any fourth column, and the 8-px post at columns 12-19 was cut at 16. Anything discrete in a tile lies inside one 4-px-aligned slot now (the posts at 12-15). The verifier found it on the ledge the Duke happened to be photographed on; a tile checked only for its wrap cannot show it. |
| **Hung from nothing** | Every hanging thing hung from `PLAT_THICK x PX`, 28 px under the surface: the ledge's physics thickness, right only where the tile is solid all the way down. The crypt's stone then ended 16 px down, so its manacle hung 12 px below the stone from nothing, in every frame. `undersideFor()` measures the drawn underside from the tile art now, and `test-decor` works it out again from the tile itself and fails at the old depth. An anchor to "the platform" means the platform as drawn. |
| **The shadow at the physics thickness** | The same mistake a second time, in the renderer. The shadow under every ledge was one dark bar at `PLAT_THICK` below the surface and 2 units to the right: it floated under DOWNTOWN's post tips as a second beam, hung loose under the crypt's stone, STORM's cloud and ABYSS's bones, and stuck out past every ledge's right end. The user saw it as "weird shadows" under the gallery. It is cast per column from the tile art now, straight down, cut with the same source rects as the tiles, and DOWNTOWN casts none. Anything placed relative to a ledge -- a hanging thing, a shadow -- is placed relative to what the tile DRAWS. |
| **Furniture that read as something else** | Each redraw looked right alone at 4-16x and read as another object in a real frame. The skeleton's ribs, three straight bars, were a LADDER (again); the manacle a hanging LAMP; the lightning rod's Y-forked arcs ANTLERS or a bare tree, and its 4-px rod a flower stalk; the lantern's one-pixel brace a dotted CHAIN; ZENITH's thin shaft a NEEDLE, or a sword with a hilt; NEBULA's crystal a ROCKET with fins; ABYSS's skull, its sockets merged with the bone between them, wearing a VISOR; COSMOS's orb, flaring four rays, one more of the backdrop's STARS; the swollen drip a LIGHT BULB; reeds walked row by row a bundle of STICKS; a tuft of nested arcs a BUN; the tall tree's crown a trunkless dome on the ledge ABOVE; and a third of neighbouring trees were identical twins, one tree stamped twice. What caught them: the element in a real frame at zoom 1 on its own ledge and sky, squinted at, beside the board's drawing -- asking what object it is, not whether it is well drawn. The second board's redraws found more the same way: the slid-down skeleton a figure CRAWLING (a big skull held up on a straight arm, the chest drawn smaller than the board's), its hand a HOOF where the gap fill closed the fingers, and the seated one's pelvis a pale knob in the lap; the reed fountain a FISH'S BACKBONE (one straight blade up the middle, mirrored pairs either side) and the tuft's spear a POLE; the tree crowns small PUFFS ON STICKS and the fork a SLINGSHOT, because the masses' shaded undersides sat within a few Lab units of the backdrop's own greens and only the lit tops showed (a teal shadow fixed it); the banner a sheared RECTANGLE; the lantern's thin pale glow a grey smudge. And ZENITH's shaft, pulsed whole by the `alpha()` hook, was a warm-grey ghost among the backdrop's pale columns -- while `test-decor` pinned that pulse as "the shaft breathes". A test written from the implementation pins its defect; write it from the complaint. The `pixel-art-in-code` skill has the drawing lessons. |
| **Two zones that were one picture** | COSMOS and STARFIELD come one after the other and were the same star sky in two tints: take the hue away and nothing told them apart, and STARFIELD's two faint clusters could not be found in play. They are built differently now -- dust and sparse points against no clouds, a dense field and readable clusters -- not recoloured. The same pass found the backgrounds' other ways of fighting the play: NEBULA's first gas covered a third of the tile with magenta in two layers and the Duke was lost in it, and ABYSS's voids, filled darker than the sky, read as holes punched through the screen, one making a ledge seem to stop early; they are empty frames now. |
| **Two layers on one stream** | `backdrop.js` seeded a layer by the LENGTH of its name, and `far` and `mid` are both three letters, so FAR and MID of every zone drew the same numbers: two painters drawing the same kind of thing in the same order put it in the same places. SWAMP showed it, its two layers hanging their curtains in one order at the same tilts, and with its dodge taken out STARFIELD's MID stars landed on FAR's exact pixels 25 times out of 119 where chance gives under one. Four zones carried dodges (re-seeding with a salt). `layerSeed()` keys by the layer's position in `LAYERS` now -- an index cannot collide, a hash only makes it unlikely -- and the test imports it instead of keeping a copy. Its offset was picked so MID and NEAR kept their old seeds and only FAR re-rolled. The same work moved COSMOS's haze cut from fixed noise values to the tile's own quantile, and the verifier caught the four band limits left as they were: "0.64 and up" had meant one pixel in a thousand and now meant the brightest 36%, and the zone grew a blue cloud field it was never drawn with. When a number's MEANING changes, re-derive every constant fed through it. |
| **Art that cannot tile** | The first platform art came back as twelve one-off strips, because the reference sheet showed one platform at one width. Only 2 of 12 wrapped edge to edge and only 3 had a repeat an autocorrelator could find even blurred. Fixed by changing the ASK: `tools/platform-template.mjs` prints cells at the exact size with the cuts on them, and `tools/import-platforms.mjs` measures the wrap per zone and says so. |
| **Holes through his armour** | *A dark backdrop's tolerance box holds every dark colour.* The front-facing idle imported with the backdrop showing through both sides of his tabard: 181 enclosed transparent pixels, 243 in `jumpFast` — and two companions shipped the same way, up to 644 pixels in one pose. Not missing art — the importer's background test. The sheet is on dark navy, a per-channel tolerance around a dark colour, wide enough for the JPEG noise, contains every dark colour there is, and the flood fill from the border walked in through the outline and down the shadowed steel under his pauldrons. `--bgchroma=10` in `tools/import-sprite.mjs` adds a HUE test with brightness removed, because shadowed steel is grey and the backdrop is blue however dark either gets. Tuned by looking: 7 filled real gaps between limbs, 14 left the tabard's navy folds open. The Duke, the archer and the ranger were re-imported with it, and `test-sprites.mjs` now fails any Duke or companion drawing with more than 20 enclosed transparent pixels. |
| **The generated header lied** | Every module `import-sprite` wrote began "Duke Vytis ... snapped to the palette exported by null", companions included, so the only record of how a sheet was imported was a doc that had drifted (`--height=110` against 164-pixel cells). The header now names the sheet and carries the exact command, and all seven were regenerated from it with a byte-identical body. |
| **Fire that read as thorns** | The first rising floor rimmed its flame tongues in a dark maroon outline, and at 1x, and at 4x beside the Duke, the rim was a row of crimson THORNS -- a strip of spikes, not fire. The game already had a rule and a flame: lights take no outline, and the DUNGEON torch draws fire as rows of a tongue toned by how far in from the row's edge they are, pale only low down, with a halo. The rim is drawn that way now. The same pass found three more ways a tiled hazard shows its tile: a bare gap at each tile's join beat out 64 px across the whole screen (tongues now stand two columns in from each end, and the strips mix frames per tile), heating the crust by each pixel's depth banded every plate in ruled stripes (one heat per plate now), and the glowing cracks traced the 64 px crust tile as a chain-link lattice (every copy of a plate draws its own heat). And strips 4 units past the view let a full screen shake uncover the tower under the floor; they reach 8. Before drawing an effect the game already has a kind of, find how the game draws it. |
| **Scratches on the start floor** | The ground darkened with depth by subtracting a band from every tone, which put each stone's body out before its lit rims: two or three bands down, all that was left of a stone was a thin lit arc on black, and the lower third of the start frame read as scratches or rain. A stone now sinks whole, by its centre's depth, through a small table set by hand (`SINK`): the rim closes onto the body, then one dim tone, then gone, the paler stones a band after the darker. Darkening a shaded shape tone by tone keeps its lightest pixels longest -- which are its edges. The same verifier found the landing line with no dark rim over it where every ledge has one, and the ground painting over the walls while the shaft widened. |
| **Walls that read as something else** | Three of the twelve painted walls read as other objects in real frames at zoom 1: NEBULA's Voronoi facets with one-pixel seams were a leaded STAINED-GLASS window (and the same structure as COSMOS's black glass, the next zone up); ABYSS's bones stood on end in four straight files were a BEAD CURTAIN of dumbbells, its face a zipper; DOWNTOWN's plaster nearly as dark as its timber, with thin posts and a rail, was SCAFFOLDING. Now a bed of crystal prisms with ridges and points, a charnel heap of bones crossing at slants with the decor's skull among them, and half-timbering with light plaster between thick dark members. The first drawings passed `test-walls`, as the redraws do: a wall's limits say it is quiet and seamless, not what it is. Look at it in a frame, beside its ledges. |
| **Streaks that read as rain, twice** | The streaks were 4- and 8-px bars and read as rain. The first redraw made them one art pixel wide and they still read as rain: 220 short lines spread evenly over the screen with near-white tails. Thinness was never the cue. The second redraw (b963047) took what separates speed lines from rain in a still frame to be WHERE (framing the sides, the middle left clear), HOW LONG (long lines among shorter ones, from one depth per line), WHICH WAY (a comet with a head) and COLOUR (a saturated tail stays a colour; a pale one at low alpha over a blue or grey sky lands on grey, the colour of rain). Judged in flat-out frames, because the attract bot is at full intensity from its fifth second and that is the frame most players see. Drawn last, they also crossed the Duke's face and the HUD's numbers; they go under both now, and under the ledges. The player then asked for the middle back, and they spawn across the whole width again, weighted to the sides: what keeps a full screen of thin lines from being rain is MOTION -- fast, at many speeds at once -- which a still frame cannot show. Judge them in strips of consecutive frames at the display rate. |
| **A trail that stole the landing dust's slots** | The combo trail took only free slots or its own in the shared particle ring, which looked safe, but it probed from the SHARED round-robin cursor and left it where each piece went: at full stream it drove that cursor round the ring two to eight times faster than the rest of the game, and every landing's dust, spawned plainly from the cursor, came round onto confetti still in the air. A cursor of its own fixed that and made two new faults: the dust landed on trail pieces instead, and a cursor that stops when every slot ahead is a live burst sat in front of a milestone's confetti, so the trail went dark for a moment right as it changed palette. The pieces live in a region of their own after the ring now, and nothing in either region touches the other. A pool with several writers needs a region per writer, not politer writers; test the other writers' losses, not only the new one's. |
| **A canvas width that slowed every frame** | The streak atlas's width, summed from a table that held widths and alphas together, came out as a heap double (332.0), and as a HEADLESS canvas's width it slowed `test-perf`'s whole render from 49 to 63 ms a frame, streaks on or off. Forced to an integer (a bitwise OR with 0) it costs nothing. A browser converts a canvas size to an integer itself; the headless canvas keeps what it is given. Bisect a headless perf jump before blaming the new drawing (the `headless-canvas-fidelity` skill). |
| **Streaks that popped in and vanished** | The pool was cut to length and topped up at random heights, as it had been since the bars: every line the intensity stopped paying for vanished where it stood, and every new one appeared whole at a random height. Driven through a player's rhythm -- momentum built and bled at the game's rates, a combo that adds up to 0.45 of the intensity and drops it in one frame when it breaks -- that was about 510 lines a minute vanishing on screen and 460 popping in, each one now a long opaque line across the middle. Every earlier judgment missed it because it was made on the attract bot, which is flat out almost all the time, so its intensity hardly moves. New lines enter from below the screen now and surplus ones shrink into their heads over 0.2 s while still rising: 0 and 0 in the same minute. (The fix for the death's flashes had its own fade-out of the same lines; it was dropped at the merge as a duplicate of this.) A continuous effect is tested by driving its input the way a player does, never only at steady states. |
| **An atlas repainted on a run's first frame** | `streaks.js` kept only the last three zones' atlases, to save memory. One renderer serves the title screen's attract run and the game, and the bot passes four zones in about forty seconds, which evicted BASEMENT; the first frame of the player's run then repainted it (about 4 ms headless) -- and nothing warms BASEMENT ahead of a run, which starts there every time. Every zone's atlas is kept now, 18 MB for twelve, as the walls' strips and the backdrop's layers are. A cache that evicts must know what its NEXT reader asks for first; the HUD skin never lets BASEMENT's go for the same reason. |
| **Gauges that passed for ledges** | The first HUD skins framed each gauge in the materials of that zone's own ledges, with a one-pixel outline as the ledges have, and were only ever looked at full. Wherever the speed bar was near empty, or a ledge of the same material passed behind it, it read as one more ledge: STORM's empty bar a strip of cream cloud among the cloud ledges, ZENITH's a gold bar under a gold ledge, DOWNTOWN's and NEBULA's running on into the gallery and the crystal ledge beside them. Each gauge frame now sits on the plate every word of the HUD sits on -- the zone's keyline colour and a near-black pixel outside the frame's outline -- which no ledge has. Anything drawn in a zone's own material near the play needs a mark the scenery never carries; look at a gauge empty, and with the scenery passing behind it. |
| **Lightning that read as a heartbeat** | STORM's gauges carried a "bolt" in the fill: one even zigzag the whole length of the bar and the meter, a pixel up and a pixel down every other column. At 4x it was a heartbeat monitor's trace; at 1x a wavy white line -- which any even zigzag becomes. What reads as lightning is a SLANT: long legs all leaning the same way, short snaps back, a tip that thins out, a fork now and then. The bar takes four separate strikes across its height, the meter one strike down its whole length with a fork or two; a fork off a leg in the bar's twenty rows made a stick figure running, so the bar has none (`pattern` in `hudpaint.js` STORM). Draw a bolt as strikes; never as a wave. |
| **CITADEL, plain text with a tint** | The brief asked for CITADEL's title in cut stone with gold AND heraldry, and the first cut had the stone and a gilt rim and nothing heraldic: at a glance and at 1x, pale block letters with a gold keyline -- the one title of the twelve that could have been any zone's text with a tint. A gilt cross on a stem, seven stone pixels wide, came out a yellow speck. The heraldry went where there was room, as DUNGEON's skull sits in its O: a 19 x 24 heater shield in the hollow of the D bearing the zone's own device, the black castle on gold of the citadel's banners, so in a real arrival frame it reads as the same arms as the banner on the ledge beside it. Judge each title at 1x in an arrival frame and ask whether it could belong to any other zone. |
| **A sliver at every ledge's end** | The painter contract's slot rule (`kit.slot`) keeps anything discrete off the columns a part tile can be cut at -- and the verifier's first painter written from that contract drew a gilt cross in repeat columns 13-15 INSIDE the strip function, `slot()` passed it, and every ledge began with one gold pixel of its arm. The caps are the strip too: a ledge's first column is repeat column 15 and its last is 16, so an object drawn into the strip across 14-15 or 16-17 leaves a piece of itself at every ledge's end, though those slots are sound everywhere else. Keep strip-drawn objects off those columns, stamp objects over a strip that is only texture (DOWNTOWN's posts), or draw the ends over them (`kit.assemble`'s `end`); `tools/shot-platwidths.mjs` shows both ends of eight ledges, and they are looked at at x3 or more. A rule a tool checks is only the part of the rule the tool can see. |
| **Ledges that read as holes, and as keycaps** | COSMOS's first painted ledge was a slab of night, a pale hairline over a body of luma 8 to 13 on a sky of median 20: darker than the space round it, so every ledge was a black slit in the sky and the user thought the zone was broken. NEBULA's was glossy teal blocks on magenta and violet gas, a complementary clash the user called ugly, reading as a row of keycaps. Both were repainted in the zone's own material, set apart from the backdrop by VALUE (moonstone lighter than the sky all the way down; amethyst paler than the gas), and NEBULA's wall, HUD rim and theme colours lost the teal with it. A magenta glint on the amethyst facets then made a row of pink slashes along every ledge at zoom 2, and came out. A ledge must be lighter or darker than everything behind it, not only another hue; and look at it at zoom 2 as well as 1, where a one-pixel accent doubles. |
| **A ghost placed by its own copy of the placement** | The first silhouette trail placed its copies with code of its own, written beside `drawSprite`'s and never kept in step with it: each copy's cell bottom sat on his feet where `drawSprite` lowers the cell by `FOOT_DROP` onto his boots, and no copy took the landing squash or the tuck's quarter turn, so even the nearest copy was a different shape from him, and on a launch they hung 28 units under his boots -- "trailing way behind him when it should be on top of him". Both are drawn through ONE function now, `placeCell` in `sprites.js`, and `test-afterimage` requires every copy to be `drawSprite`'s own placement for the state he was drawn in there, bit for bit. Anything that must take a sprite's exact shape calls the sprite's own placement; a copy of it drifts the first time either is changed. |
| **Streaks that became rain in the fall** | In the death the streaks were handed the fall's speed as their intensity, so they carried the plummet: flat out, a hundred and more thin orange lines all the way down the shaft (109 by the pit in one death measured) -- rain, over a fall the user asked to be him alone. Easing them to zero at 3 a second never got there: lines were still retiring 0.8 s in. They let go linearly now, over `STREAK_LET_GO`, while rising at the pace the climb left them (`fallPace`), each shrinking into its head, the last gone by `FALL_CLEAR`; `test-fallclear` requires nothing of the climb drawn after it and no line vanishing mid-screen. An effect keyed to "how fast things are going" has to be asked what it should do when the thing going fast is the death. |
| **Words that came up as stencils** | The impact's words -- SPLAT or OOF, the verdict, FLOOR n, SPACE -- faded their letters in over a keyline drawn whole from the first frame, so for the first frames of a splat they were black silhouettes over the white flash (49,000 px darkened past half) and only then turned red and gold: one more thing popping in at the death. Each word is put together once, letters on their keyline, and that one picture faded from nothing (`boardFade`), and `test-gameover` requires the fading word to be one picture at the fade's alpha. Fading an outlined word is fading a picture, not lowering the alpha of its parts. A word drawn a glyph at a time fades whole without a layer only while no two of its pieces overlap: the menus' glyph cell is exactly the font's advance (24 px, keyline included), and SPACE TO SKIP fades that way, which `test-gameover` 4 checks pixel by pixel. |
| **A callout that said the wrong step** | THUNDER's four strikes are a twentieth of a second each, 0.23 s of its 1.6, and between them, in real frames at 1x over eight zones, it was a plain violet word that read as SOARING in another colour: the one step of seven that did not say what it was. It now crackles between the strikes -- small bolts, half a strike's size, landing on the tops of two sets of letters in turn, a `loop` as RAMPAGE's flames flicker -- and never lights a letter. The first crackle, one pixel wide and 10-15 px tall, read at 1x as acute accents over the U and the E. Judge an animated word by what is on screen for most of its life, not by its best frame. |
| **Art cut flat at its canvas's edge** | THUNDER's strikes ran up to the top row of their canvas and were cut flat there -- every one starting on the same ruled line, 8 and 11 px of it on the edge -- the H's strikes ran out through the left edge, and RAMPAGE's tallest flame's halo touched its canvas's top row. Every bolt now ends inside its canvas, thinning to a one-pixel core, a strike's long legs lean in toward the middle of the word, and RAMPAGE has two more rows of pad; `test-callouts` fails any callout frame with a pixel on its canvas's edge. A painting that reaches its box's edge has been cut by it. |
| **A warm-up only play could run** | The callouts' pieces, up to 16 ms each headless, were warmed from the HUD, and the HUD is drawn only in play, so they fell in the first seventy frames of every session's first run while the title screen before it sat idle for as long as the player liked. The renderer's floater pass, which runs on every frame the renderer draws, attract run included, drives the whole warm-up now, and all of it is done about 120 frames after the title screen appears; `test-callouts` warms from the title screen alone. Warm where the idle frames are, not where the thing is first drawn. |
| **A rename that would have been a repaint** | VILLAGE became DOWNTOWN in every table and module keyed by the zone's name -- and the side walls and the HUD skin seed their random streams from that name, so seeded by DOWNTOWN every patch on its walls and every speck on its HUD moved, 31,000 to 36,000 px a frame, for a rename. `themes.js` keeps `FORMER_NAMES` and `artSeed()`, and those painters hash the name the art was drawn under. The verifier found nothing held that table: emptied, the wall moved 2,049 of its 8,192 pixels and every suite passed. `test-walls` now paints DOWNTOWN's wall from the old name written out and requires the shipped one to match, and requires the new name to paint a different wall so the check can bite. A name used as a seed is part of the art. |
| **A plaque centred on a width it was not drawn at** | The menu's first-run key plaque was sized and centred by `keyLine`'s centring width, which counts three units between a key and its words where the line steps five, so a line of three pairs was drawn six units wider than it was centred for: the plaque sat two units left of its rows, 5.5 units of field left of ARROWS and 1 right of TO CHAIN, the N all but on the gold -- on the first screen a new player sees. The plaque is now drawn round where the rows ARE drawn (`keyLineSpan` in `menuskin.js`), and `test-menu` holds six plaques round centred contents within 1.5 units of their middle. Frame what was drawn, measured the way it was drawn. |
| **The collector's pauses in the painting frames** | Painting a scoreboard panel under a deadline in Chromium, the frames over a millisecond were not the painters' own: the HUD kit kept its per-pixel lists as an array per pixel (`[x, y, face]` in `grain`, `[x, y, t]` in `shadeBlob`, the outline's hits), tens of thousands of short-lived arrays round a 400,000-pixel panel, alive to the end of the pass, and the garbage collector's pauses fell in the frames that painted. As bare numbers, x and y in turn, eleven boards painted in 1,500 frames instead of 2,700, and the frames over 1 ms fell from 71 to 10-13. A slice budget counts the collector's time too; allocate nothing per pixel in a painter that runs in play. |
| **A menu's lettering first drawn from in the fall** | When the scoreboard, the fall's words, the herald and the calls took the menus' lettering (2026-09-29), every piece they draw was painted at load -- and still would have cost frames: a canvas is rastered the first time it is drawn FROM, and `menuskin.js` had never brought its pieces up, because they were only ever drawn on the menus, where a first draw costs a frame nobody feels. Drawn in play, in the fall and on the board, six of them would have been first drawn there: a call's ink in a run, SPLAT in the fall, the inks and the prompt on the board (`test-smooth --mutate=nobringup`). Every menu canvas is touched as it is painted now (`canvasOf`). A piece painted for one screen and drawn on another inherits the first screen's tolerance for a stall, not the second's. |
