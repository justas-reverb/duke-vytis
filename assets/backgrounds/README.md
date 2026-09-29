# Background tiles

The artist's background art goes here: one PNG per zone and layer, 256 x 256, named
`<ZONE>-far.png`, `<ZONE>-mid.png`, `<ZONE>-near.png` (any capitalisation), with
transparency where the layer behind should show. The zones are BASEMENT, DUNGEON, FOREST,
SWAMP, DOWNTOWN, CITADEL, STORM, ABYSS, NEBULA, COSMOS, STARFIELD and ZENITH. Every tile
must wrap both ways: it repeats across the screen and up the tower forever.

On screen a tile spans 128 of the 480 view units, so one art pixel is two screen pixels,
and the layers scroll at 12% (FAR), 22% (MID) and 34% (NEAR) of the camera over the
zone's sky gradient. Save as 8-bit PNG -- RGB, RGBA, grey, grey+alpha, or palette at 1-8
bits with tRNS transparency. The importer cannot read interlaced or 16-bit files, says
so, and leaves them out.

None has been delivered yet (2026-09-22): every layer of every zone is painted by
`src/render/bgpaint/`, and anything still missing when art does arrive stays painted.

After adding, changing or removing any:

```bash
node tools/import-backgrounds.mjs                                  # check size and wrap
node tools/import-backgrounds.mjs --emit > src/render/bgart.js     # tell the game
node tools/shot-backdrops.mjs --zone=FOREST                        # look: each layer 2x2
```

The first reports each tile's edge difference, left/right and top/bottom: under 10 is
seamless, over 30 is a seam on screen every 128 units. A seam is reported, never fatal;
a tile that is not 256 x 256 is left out and painted. The second writes the manifest the
game loads from -- it only ever requests a file listed there, so nothing missing is ever
a 404 in the desktop build -- and `test-backgrounds` fails if a listed file is gone or is
not 256 x 256.

The sheet to draw into is `node tools/background-template.mjs`. What to draw:
[docs/ART-BRIEF.md](../../docs/ART-BRIEF.md) (section 7). How it gets into the game:
[docs/ART-PIPELINE.md](../../docs/ART-PIPELINE.md).
