# Platform furniture

The artist's furniture goes here: the things that stand on, hang from or float over a
ledge -- 23 elements across the twelve zones, cobweb to light shaft. One PNG per element,
named `<ZONE>-<ELEMENT>.png` with the element's name as on the sheet and hyphens for
spaces: `DUNGEON-SLUMPED-SKELETON.png`, `FOREST-UNDERGROWTH-TUFT.png` (any capitalisation).

Each PNG holds every frame and every variant of its element: **frames side by side, left
to right; variants stacked, top to bottom**; every cell exactly the element's box. So the
file is (box width x frames) by (box height x variants) art pixels -- the WALL TORCH, a
16 x 44 box with 4 frames and 1 variant, is 64 x 44; the TREE, 60 x 136 with 1 frame and
3 variants, is 60 x 408. Transparent background, and no cell left empty. One art pixel is
one screen pixel at the Duke's scale; draw at 1:1, never pre-scaled. The boxes, anchors,
frames and variants of all 23 are on the sheet from `node tools/decor-sheet.mjs`, read
from `src/render/decorpaint/<zone>.js`, where the game reads them too, and tabled in
[docs/ART-BRIEF.md](../../docs/ART-BRIEF.md) section 8. Save as 8-bit PNG -- RGBA,
grey+alpha, or palette with tRNS transparency. The importer cannot read interlaced or
16-bit files, says so, and leaves them out.

Two things that are easy to get wrong:

- **Print the sheet fresh.** Six boxes are bigger than on the sheet the environment
  reference (`assets/decor-reference.webp`) was drawn to: FENCE is 32 x 24, LIGHTNING ROD
  40 x 60, CRYSTAL SHARD 24 x 48, LIGHT SHAFT 48 x 92, REED CLUMP 32 x 40 and LANTERN POST
  40 x 56 (the last two after the second board, `assets/decor-fixes-reference.webp`). The
  LIGHT SHAFT also has six frames now, not one -- its core the same pixels in all six, only
  the glow, its streaks and the pool on the ledge breathing round it; the game no longer
  fades the sprite -- so its file, with two variants, is 288 x 184. A PNG drawn to an old
  box or frame count is turned away for its size.
- **The TREE's top 16 rows stay empty.** Its box is 136 tall and the ledge above is 120
  up, so anything drawn in rows 0-15 stands on the next floor's walking surface.

None has been delivered yet (2026-09-23): every element is painted in code by its zone's
module in `src/render/decorpaint/`, redrawn from the environment reference -- and the tree,
the slumped skeleton, the banner, the reed clumps and the lantern post again from the
second board -- and each element stays painted until a PNG for it passes the importer. A
PNG replaces its own element and nothing else, so they can arrive one at a time.

After adding, changing or removing any (from Git Bash -- Windows PowerShell 5.1's `>`
re-encodes what it writes, and the manifest must stay plain text):

```bash
node tools/import-decor.mjs                                      # check them
node tools/import-decor.mjs --emit > src/render/decorart.js      # tell the game
node tools/shot-decor.mjs --elements --zone=DUNGEON              # look: every frame, 4x, in place
```

The first lists all 23 and where each comes from -- PNG, painted, or placeholder -- and
turns a file away, naming why, if it is not exactly the size above, has no transparent
pixel at all, or has a cell (a frame of a variant) with nothing in it; a turned-away file is
simply not used, and the element stays drawn in code. The second writes the manifest the
game loads from -- it only ever requests a file listed there, so nothing missing is ever a
404 in the desktop build -- and `test-decor` fails if a listed file is gone.

What to draw: [docs/ART-BRIEF.md](../../docs/ART-BRIEF.md) (section 8) and the notes under
each box on the sheet. How it gets into the game: [docs/ART-PIPELINE.md](../../docs/ART-PIPELINE.md).
