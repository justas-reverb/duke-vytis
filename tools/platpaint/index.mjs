// The ledge painters: one module per zone whose platform cell is painted in code.
//
// THE PAINTER CONTRACT -- everything a painter needs, in one place.
//
// 1. WHAT TO WRITE
//
//    tools/platpaint/<zone>.mjs, the zone's name in lower case (basement.mjs, dungeon.mjs,
//    ...), exporting
//
//        export function paint()   ->  CELL_H (40) rows of CELL_W (64) entries,
//                                      each '#rrggbb' or null (transparent)
//
//    Nothing needs registering: a module in this folder under a zone's name IS that zone's
//    painter, and `--provisional` paints every zone that has one and cuts the rest from the
//    old one-off strips (assets/platform-sheet.png). So five painters working at once each
//    add files of their own and no line anyone else edits. Paint with ./kit.mjs; read
//    ./downtown.mjs and ./storm.mjs for two finished cells built with it.
//
//    COLOURS are yours. Every zone has its own palette in the generated module
//    (ZONES[name].pal in src/render/platart.js), keyed independently, so no colour you pick
//    can move a pixel of another zone. Up to 91 distinct colours per cell, kept exactly;
//    --provisional refuses more. A restrained ramp of clearly distinct colours per material
//    (5-7 tones, shadows toward blue or plum, lights toward yellow) is the style here.
//
// 2. THE CELL
//
//        x  0-15   LEFT CAP    drawn once, at the left end of every ledge
//        x 16-47   TILE        repeated as many times as the width needs
//        x 48-63   RIGHT CAP   drawn once, at the right end
//
//    One art pixel is one backing-store pixel at zoom 1 (1/4 world unit; zoom 2 doubles it).
//    Row 12 is the walking surface: the boots stand on its top edge. Rows 0-11 are headroom
//    for anything proud of the surface; rows 12-39 the body, 28 rows = PLAT_THICK.
//
// 3. THE TILE MUST WRAP -- paint it with period 31
//
//    The renderer butts the tile against itself at every join, for the whole climb. Paint
//    the WHOLE cell from one function of the repeat column (kit.fromStrip / kit.assemble):
//    the texture repeats every 31 columns, so tile column 31 IS column 0 and the wrap is
//    exact by construction (the importer measures it: `wrap: 0.0`). The caps come out of
//    the same function -- the left cap is repeat columns u 15..30, the right cap u 1..16 --
//    so they meet the tile as neighbouring columns of one drawing; only their far ends are
//    drawn as ends (kit.assemble's `end`). Shapes that overlap their neighbours (puffs,
//    stones) are laid with kit.copies so one crossing the repeat's edge is drawn whole on
//    both sides of it.
//
// 4. ANYTHING DISCRETE SITS IN ONE 4-PX SLOT
//
//    A ledge is LEFT CAP, whole tiles, a PART tile cut from the tile's left (0, 4, ... 28
//    px: ledge widths are whole world units), then RIGHT CAP. So a cut can fall between any
//    tile columns 4k-1 and 4k, and the right cap (u 1..16) follows it. A post, a bolt, a
//    skull, a block joint, a vertebra -- anything that looks wrong sliced -- lies inside
//    repeat columns 4k..4k+3, and never on u 0 (tile column 31 repeats it and the right cap
//    starts after it). Slots: 1-3, 4-7, 8-11, ..., 24-27, 28-30. Declare every object's
//    place through kit.slot(u0, width, name), which throws on a bad one; place its copies
//    with kit.repeatAt(u0, width, { margin }) so none crowds or is sliced by an end.
//    Texture (grain, cloud, moss) may cross a cut. Prove it with one ledge per width
//    remainder: node tools/shot-platwidths.mjs --zones=<ZONE> (eight widths in a row,
//    drawn by the real Renderer.drawPlatforms).
//
//    THE LEDGE'S ENDS CUT TOO, and slot() cannot see it. The caps are the strip, so a
//    ledge's first column (cell x 0) is repeat column u 15 and its last (x 63) is u 16.
//    An object painted INTO the strip function that covers u 14-15 or u 16-17 leaves a
//    sliver of itself on every ledge's end, though slots 12-15 and 16-19 are sound
//    everywhere else. The verifier's first painter written from this contract drew a
//    gilt cross in u 13-15 inside the strip, slot() passed it, and every ledge began with
//    one gold pixel of its arm. Either keep strip-drawn objects off those columns, stamp
//    objects with repeatAt's margin over a strip that is only texture (DOWNTOWN's posts),
//    or draw the ends over them with kit.assemble's `end`. shot-platwidths shows both
//    ends of eight ledges: look at them at x3 or more.
//
// 5. ROW 12 IS THE LANDING LINE
//
//    - The brightest clean row of the ledge, unbroken across the tile: a player reads the
//      distance to it at speed.
//    - A dark rim over it (row 11) where the ledge meets the backdrop, as the start floor
//      and most drawn ledges have: kit.outline(c, INK, { where: (x, y) => y === 11 }).
//      The boots' sole covers it exactly.
//    - The body darkens downward and never reads as more floor: nothing lit and level
//      below row 12 -- a lit course, a bright seam, a pale bone lying flat -- or it is a
//      second ledge.
//    - It must read against the zone's backdrop at zoom 1: look at a real frame (below),
//      not only the magnified sheet.
//    --provisional prints each painted cell's numbers: colours, wrap rows (must be 0), cap
//    joins, row 12's luma against the brightest row below it, how many tile columns have a
//    rim, and the underside.
//
// 6. THE UNDERSIDE IS WHAT YOU DRAW
//
//    The body may end above row 39. The shadow under a ledge (LEDGE_SHADOW in
//    src/render/renderer.js) is cast column by column from the underside the tile draws,
//    and hanging furniture hangs from it: decor.js undersideFor takes, per tile column, the
//    solid run down from row 12, and the median ('under' in the printed numbers). After a
//    repaint, check the hanging decor still hangs from the stone: BASEMENT's COBWEB and
//    DRIP, DUNGEON's MANACLED WRIST (src/render/decorpaint/). Keep the body solid from row
//    12 down in each column (a gap ends the run there).
//
//    DUNGEON's painter: end the stone above row 39 in most columns ('under' under 28).
//    test-decor proves hanging furniture follows the DRAWN underside by hanging it under
//    DUNGEON's tile, and refuses to judge when that underside is the physics thickness
//    (28), because the two rules would then put the manacle in the same place. A crypt
//    stone solid to row 39 fails test-decor with "pick a theme whose stone ends higher".
//    See it hang with: node tools/shot-decor.mjs --elements --zone=DUNGEON --out=<png>.
//
// 7. THE COMMANDS, IN ORDER
//
//    node tools/import-platforms.mjs --provisional --emit > src/render/platart.js
//        re-cut, paint every zone that has a module, write assets/platform-tiles.png, and
//        regenerate the module: the one command. Run it from Git Bash (PowerShell 5.1's >
//        writes UTF-16). IF IT THROWS -- a slot, the wrap, too many colours -- the shell
//        has already emptied src/render/platart.js (the > truncates it before node runs),
//        and every test and shot then fails on an empty module. Fix the painter and run it
//        again; it rebuilds everything from scratch. (--emit alone only re-reads the
//        sheet: it does NOT run your painter.)
//    node tools/diff-platforms.mjs --ref=<the commit you started from> --allow=<YOUR ZONES>
//        proof that nothing else moved: every zone decoded from platart.js and from
//        platform-tiles.png, RGBA, against that commit. Exits 1 if a zone not in --allow
//        changed. --ref=HEAD is the same thing only until your first commit; after it,
//        HEAD already holds whatever that commit moved, and the diff cannot see it.
//    node tools/shot-platwidths.mjs --zones=<ZONE> --out=<png>      the slot rule, 8 widths
//    node tools/shot-platforms.mjs --out=<png>                       every zone, with decor
//    node tools/shot-platsheet.mjs --out=<png>                       the sheet, magnified
//    node tools/shot.mjs --floor=N --sec=0.3 --out=<png>             a real frame; N:
//        BASEMENT 40, DUNGEON 150, FOREST 450, SWAMP 560, DOWNTOWN 760, CITADEL 950,
//        STORM 1160, ABYSS 1350, NEBULA 1550, COSMOS 1850, STARFIELD 2050, ZENITH 2250
//        (--crop=x,y,w,h --follow --scale=k for a close-up)
//    node tools/test-platstyles.mjs, test-decor, test-scaling, test-themes, test-walls --
//        one at a time. test-walls belongs on this list because it reads YOUR ledge: it
//        holds each zone's side walls under the ledge's lit top (the p95 luma of rows
//        12-14 through the zone's pal; for a top under 60, the cell's brightest pixels),
//        so a darker landing line can fail the WALL test.
//
//    kit.ascii(cell) prints the cell one character per colour: read it before judging a
//    drawing at 8x, where the eye fills in what it expects.
//
// 8. WHAT NOT TO TOUCH
//
//    Another zone's module; src/render/platart.js and assets/platform-tiles.png by hand (they
//    are generated); assets/platform-palette/ (the pins of the zones still cut, written by
//    --provisional, which deletes a zone's pin the moment the zone has a painter). A change
//    to ./kit.mjs reaches every painter: diff-platforms must still show DOWNTOWN and STORM
//    identical.
//
// 9. WHAT ELSE WAS COLOURED FROM YOUR LEDGE
//
//    The old ledge's colours were copied, by hand, into other zone art, so a repaint can
//    leave them describing a ledge that is gone -- and every test still passes. The HUD
//    skin (src/render/hudpaint.js: "every colour here is taken from the zone's own art --
//    its ledge palette"), the zone title (src/render/titlepaint/<zone>.js) and the
//    furniture (src/render/decorpaint/<zone>.js) name the ledge in their comments; DOWNTOWN
//    and STORM's decor and title follow their painters' colours by name (GALLERIES, CLOUD).
//    Grep those files for your zone and the ledge, read what they say, and list in your
//    report which of them now disagree with your cell -- whether to follow is the
//    coordinator's call, not a side effect of the repaint.

import fs from 'node:fs';

/** The zones in climbing order: the order of the cells in assets/platform-tiles.png. */
export const ZONES = ['BASEMENT', 'DUNGEON', 'FOREST', 'SWAMP', 'DOWNTOWN', 'CITADEL',
  'STORM', 'ABYSS', 'NEBULA', 'COSMOS', 'STARFIELD', 'ZENITH'];

/** Where a zone's painter lives, whether or not it exists yet. */
export const moduleFor = (name) => new URL(`./${name.toLowerCase()}.mjs`, import.meta.url);

/**
 * The zones that are painted, in climbing order: those with a module here.
 *
 * Found on disk rather than listed. A list here was the one line every painter would
 * edit, and five painters working in parallel would each have added two entries to it --
 * five merge conflicts in a file whose only content is "which files exist".
 */
export function paintedZones() {
  return ZONES.filter((name) => fs.existsSync(moduleFor(name)));
}

/** Zone name -> its painter, for every painted zone. Throws if a module has no paint(). */
export async function painters() {
  const out = {};
  for (const name of paintedZones()) {
    const m = await import(moduleFor(name).href);
    if (typeof m.paint !== 'function') {
      throw new Error(`tools/platpaint/${name.toLowerCase()}.mjs exports no paint(); see the contract in tools/platpaint/index.mjs`);
    }
    out[name] = m.paint;
  }
  return out;
}
