# What the local model actually did

The honest accounting of every job this game sent to the local Qwen model
(`qwen-coder`, via `ask-local.ps1`): what came back, what it cost, what still ships, and
the delegation rules this project measured from it. Read this when deciding whether to
hand the local model a job, or when asking which parts of the game it wrote. See also:
[README.md](README.md), docs/STATUS.md,
[docs/AUDIO.md](docs/AUDIO.md) (the composer that replaced its music, the lament last),
[docs/ART-PIPELINE.md](docs/ART-PIPELINE.md) (the importers that replaced grid art),
../FINDINGS.md (the audit the ratio rule came from).

## The short answer

Short answer, because it is easy to overstate in both directions: **it wrote the game's
narrative spine and its funniest dialogue, and it wrote none of its art, none of its
physics and none of its current flavour text.**

Fifteen jobs, all of them in rounds one to five, about 38 minutes of GPU; rounds six to
eight sent nothing, and round nine has nothing on record. What it still owns is
inventoried in the next section.

Gone: all 55 lines of combo tiers, taunts, death lines and idle nags, rewritten in a
heraldic register once the character became a crowned grand duke. Its accuracy was not
the problem -- the lines had simply aged out with the character they described, which is
a failure mode worth knowing about before generating flavour for something still moving.

Never sent, on rules this project established: 2D grid art of any kind, anything whose
numbers must sum, and review of a file already in context.

## What the local model still owns in the shipped game

Honest inventory, after every round below:

| Still shipping | Scale | Notes |
|---|---|---|
| The twelve-band arc, basement to zenith | 12 names | **Its single best contribution.** The spine of every 2,300-floor cycle, invented unprompted |
| Theme palettes | 11 of 12 | Only four exactly as generated. 5 were corrected at birth for contrast and 8 edited by now: ZENITH keeps none of its colours, FOREST only its accent, and DUNGEON's platforms were recoloured for bone contrast |
| Platform styles | 11 of 12 rows, **read by nothing in the game** | Platforms are drawn tiles now (`platart.js`), so the twelve materials draw nothing, and the last field the renderer read -- `glow`, a translucent accent rectangle round every ledge in the six upper zones -- went in round nine: around drawn art it was a box that matched nothing, a magenta outline in NEBULA. The table is kept, still validated by `test-platstyles` and printed by `tools/shot-platforms.mjs` |
| Speed ramps | 12 | Used as-is, zero corrections |
| Achievements | 28 | Every id and stat is still its own, and 10 of 28 are exactly as generated. 10 were corrected at birth; 18 differ by now, 10 of them in their target. Four of those targets were its own numbers until round nine -- HALFWAY at floor 60, SUMMIT SEEKER at 150, COMBO PIONEER and COMBO LORD at 3- and 10-floor combos -- set for a tower of a few hundred floors and moved to the landmarks of a 2,300-floor one |
| Companion dialogue | 48 lines | Zero edits. Still the best thing it produced |
| The gameover lament | **0 of 1** | Recomposed on 2026-09-24 (`b948c72`): THE CALL turned over, with a bass, a choir and brass like the climb themes beside it. Until then it was the second music job's melody note for note, with the tail of repeated E3s trimmed -- the last of the model's notes in the game. All five tracks are composed now; none of their notes are the model's |
| Combo tiers, taunts, death lines, idle nags | **0 of 55** | Rewritten in round six |
| Announcer callouts | **0 of 31** | Removed with the old five-source callout system. The eight height callouts never fired once: they compared against an uninitialised `lastAnnouncedFloor` |

**The pattern holds and sharpens.** Prose and naming, and it is still carrying the
game's narrative spine two rewrites later. Structured data with units, and it is still
carrying eleven of twelve palettes. Anything two-dimensional, arithmetical, or requiring
it to look at what it just made: it was not asked, and that was right.

## Bottom line: fifteen jobs, about 38 minutes of GPU

The per-round tables are the source of truth, and this is their sum: fourteen logged
jobs in rounds one to four (`logs/timing.tsv`), 37 min 26 s between them, and round
five's strategy job below, about a minute and never logged. Rounds six to eight sent
nothing, and round nine has nothing on record. This heading once said sixteen: the sum
of the table below, whose prose row claimed five jobs and twelve minutes that the logs
never contained.

| | jobs | GPU time | outcome |
|---|---|---|---|
| Prose, naming, flavour | 4 | ~10m | **Three used, two with zero edits.** Round five's strategy job gave nothing usable |
| Structured data with numbers | 4 | 6m 40s | Used, but 5/12 themes and 10/28 achievements were wrong |
| Music | 3 | 7m 56s | **All three broke the arithmetic. Replaced by a generator.** |
| 2D grid art | 2 | 7m 8s | **Both discarded.** One returned nothing at all |
| Code review | 2 | 6m 43s | 3 findings, **0 real**; one correct `NONE` |

**Roughly 22 of the 38 minutes went on jobs I now know not to send.**

### The rule, refined by this project

The ratio rule from the audit -- *delegate when it will consume more than it produces* --
is necessary but not sufficient. Every music job had a fine ratio and every music job
failed. The missing test is what the output CONTAINS:

- **Prose and naming: send it, every time.** Six companions with distinct Shakespearean
  voices, 31 arena-shooter callouts, a twelve-band narrative arc from basement to
  zenith. The dialogue and the callouts needed no edits at all. This is the thing it is
  genuinely, repeatedly good at.
- **Structured data: send it, with units.** Give every numeric field a unit, a range and
  a typical value, and every string field a closed vocabulary. Doing that took the
  correction rate from 10-of-28 to zero across two jobs.
- **Anything with internal arithmetic: generate it, do not prompt for it.** Three music
  jobs, three different failures -- two unbalanced voice lengths, then flattened note
  pairs in an object that did not even parse. Being more explicit did not help, because
  summing a 100-element list is not something it can do. `tools/compose-music.mjs`
  derives the track from a chord progression and the arithmetic is correct by
  construction.
- **2D or grid-shaped output: never.** Pixel art, sprite grids, ASCII layout. It
  produces syntactically perfect arrays that are not letters.
- **Code review of a file you have read: never.** Zero for three here, 6.7% precision
  over 27k unread lines in the earlier audit. Its value is breadth over code nobody will
  open, never depth over code you already hold.

## Round one: eight jobs, twenty minutes

Eight jobs were sent to the local Qwen 35B (`qwen-coder`) via `ask-local.ps1`. Total GPU
time: **20 minutes 21 seconds**. This is the honest accounting.

| Job | Time | Returned | Verdict |
|---|---|---|---|
| `font-alpha` -- 26 glyphs, 5x7 | 140 s | 1,614 chars | **Discarded.** Perfect syntax, unreadable letters |
| `font-digits` -- 36 glyphs | 288 s | **0 chars** | **Failed.** Returned nothing after ~5 minutes |
| `themes` -- 12 colour palettes | 117 s | 2,359 chars | **Used**, 5 of 12 corrected |
| `flavour` -- combo tiers, taunts, death lines | 73 s | 1,566 chars | **Used**, 43 of 55 lines kept |
| `achievements` -- 28 unlock definitions | 83 s | 3,062 chars | **Used**, 10 of 28 corrected |
| `music` -- 3 chiptune loops | 117 s | 1,366 chars | **Used**, loop arithmetic wrong, worked around |
| `review-physics` -- code review of `player.js` | 211 s | 3 findings | **0 real.** All three describe intended behaviour |
| `review-generator` -- review of the reachability proof | 192 s | `NONE` | **Correct.** Nothing to find, said so |

### Where it was genuinely good

**Structured bulk against a fixed schema.** Every one of the 28 achievements used a
stat name from the allowed list, spelled correctly, with unique ids and correct field
types. Every hex colour in the 12 themes was well-formed. Every note name in three
chiptune tracks parsed. Schema compliance was essentially perfect across ~8,400
characters of generated data.

**Creative naming and narrative shape.** The 12-theme arc it invented unprompted --
basement, dungeon, forest, swamp, village, citadel, storm, abyss, nebula, cosmos,
starfield, zenith -- is better than what I would have written, and it is the spine of
every 2,300-floor cycle of the tower. `COMA WARNING IMMINENT` as an idle nag was funnier
than anything I produced; it went out with the rest of its flavour text in round six.

**Knowing when to say nothing.** Asked to review the reachability proof, it answered
`NONE`. That is the correct answer and the harder one to give.

### Where it failed, and the pattern

**It cannot do 2D spatial layout.** The font was the clearest failure in the project.
It produced syntactically flawless arrays of `#` and `.` that were not letters: `C` and
`D` rendered identically, `O` had no bowl, `T` was an `F`, `U` was an `L`. Pixel art is
a two-dimensional problem and the model reasons about it as a one-dimensional token
stream. I wrote every glyph by hand -- 66 of them -- and it took less time than reviewing
66 wrong ones would have.

**It agrees with a constraint in prose and then violates it.** The theme prompt said,
in those words, that platforms must be clearly readable against the sky. It returned
`ZENITH` with white platforms on a near-white sky (contrast 1.63 where 2.0 is the
floor), `STORM` with near-black text on a near-black sky (1.51 against a 3.2 floor),
and three more. **5 of 12 failed a mechanical contrast check.** The combo tiers it
wrote actually *de-escalate* -- `GOOD` at 5 floors, then `FINE` at 8.

**It has no sense of physical scale.** Given stat names but not their units, it wrote
`topSpeed >= 8` for a quantity that then ranged 0-330 (0-430 today), and
`totalDistance >= 500` for one that passes 500 in the first two seconds of play. Four
achievements were free unlocks on a brand-new save. This one is partly my fault: the
prompt named the stats but never said what they measure or what a big value looks like.

**Its code review was 0 for 3.** All three findings on `player.js` described deliberate
design as defects -- the speed-cap clamp "leaves vx above the cap", which it does, for a
few milliseconds, because the cap moves when momentum decays and snapping to it would
stutter the player. I wrote `tools/test-physics.mjs` to pin the intended behaviour
rather than argue with it.

### The measurement that matters

The model found **zero** of the seven real bugs found in the project by then. Every one
was caught by a test I wrote or by looking at the screen:

| Bug | Found by |
|---|---|
| Momentum deadlock -- running raised neither speed nor jump height | `test-physics.mjs` |
| Camera chased the jump apex, so a missed big jump was fatal | Playing it |
| Camera outran the ground, killing the player at floor 4 | Playing it |
| `zigzag` self-flip cancelled by my turnaround -- 33 floors up one wall | Screenshot |
| `Particles.spawn` O(n) scan -> quadratic on a full pool, wedged the page | Stress test |
| 90 scanline `fillRect`s + a `globalAlpha` write per particle | Profiling |
| Records line overflowed the screen by 3x on a first run | Screenshot |

The momentum deadlock is the one worth dwelling on. It broke the single mechanic the
brief asked for by name -- *the more you run the higher your speed and jump height* --
and it was invisible: no crash, no error, the meter simply never moved. The model had
`player.js` in full context and reported three false positives instead.

## Round two: the rework

Two more jobs, **3 min 20 s** of GPU time, for the arena/camera/theme rework.

| Job | Time | Returned | Verdict |
|---|---|---|---|
| `platstyles` -- 12 platform materials | 80 s | 1,116 chars | **Used as-is. 0 corrections.** |
| `speedramps` -- 12 five-colour ramps | 120 s | 907 chars | **Used as-is. 0 corrections.** |

Both passed their validator on the first attempt -- the first time that has happened.
The difference was the prompt. Every numeric field was given a **unit, a range and a
typical value** (`glow is an integer 0, 1 or 2`, `speckle is 0.0 to 0.4, typical 0.15`),
and every string field was given a **closed vocabulary** to choose from rather than free
text. That is the exact lesson from the achievements job, where unlabelled numbers came
back orders of magnitude wrong, and it worked.

The validator checked 12 entries in fixed order, closed vocabularies, numeric ranges,
uniqueness of style, glow restricted to upper bands, and for the ramps: monotonically
increasing luminance across all five stops, a dark index 0, a blazing index 4, and
minimum saturation on the midtone. Nothing fired.

Worth stating plainly: this is **generation**, sent 4,297 chars and got 8,353 back across
both rounds -- a ratio of 0.51:1. It saved no context at all. What it bought was
wall-clock, because both jobs ran in the background while the camera and zoom work was
being written, and a set of material/colour pairings better than the ones I would have
reached for.

## Round three: where delegation stopped paying

| Job | Time | Verdict |
|---|---|---|
| `metal` -- three two-voice tracks, run between rounds two and three | 164 s | **Arithmetic broke again.** Its `gameover` lament shipped until 2026-09-24, the last of its music to go |
| `companions` -- 48 lines of Shakespearean dialogue | 283 s | **Its best work in the project.** Used as-is |
| `music2` -- rewrite menu + climb, three voices | 195 s | **Structural failure. Discarded** |

**The dialogue is the high point.** Six companions with genuinely distinct voices -- the
delver bellows *"HA! THE ROCKS DO YIELD TO US!"*, the pilgrim is cryptic, the halfling
thinks about lunch. Schema exact, 48 lines, zero edits. It even overran the
28-character limit I set, on eleven of the lines, and that turned out to be my
over-caution rather than its mistake: the longest line is 30 characters, and the speech
banner wraps at 298 px, about 49 characters, with room for two lines.

**The music failed three times running, and I stopped asking.** The failures escalated:

1. First attempt: two voices whose durations did not sum to the same length.
2. Second attempt, `metal` (with the totals stated in bold, plus "add them up"): same
   failure -- a climb lead of 139 sixteenths over a 100-sixteenth bass.
3. Third attempt: **flattened every note pair** -- emitted `["E3",2,"E3",2,...]` instead
   of `[["E3",2],["E3",2],...]` -- and left a bracket unclosed in `menu.lead`, so the
   object did not even parse.

The climb track was then generated by `tools/compose-music.mjs` from a chord progression
in E Dorian; it is three climb themes now, one per stage, composed the same way. A
chugging bass under a riff under sustained choir chords is a structure with exact
arithmetic in it, and deriving it guarantees what could not be prompted for.
The `gameover` lament survived because it was good. It came from the second attempt,
whose climb was the broken part, and it stayed the model's melody note for note --
carried in `compose-music.mjs`, with only its tail of repeated E3s cut, one to fit the
loop and two more in round seven -- until 2026-09-24, when it was recomposed as THE CALL
turned over, the motif the climb themes share (`b948c72`): beside themes with a call, a
choir and harmony it had none of them, and it was the last of the model's notes to go.
The `menu` melody was meant to be recovered from
the flattened pairs and re-arranged, and this file said it had been. It never was: the
object does not parse, so the recovery's `catch` quietly substituted a five-note
built-in phrase every time. The menu is a composed brass fanfare now, and none of it is
the model's. (How the tracks are built now: [docs/AUDIO.md](docs/AUDIO.md).)

This is the clearest case yet of the ratio rule being necessary but not sufficient.
Music generation looked like an ideal delegation -- bulky, creative, schema'd -- and the
schema was exactly the part it could not hold. **When the output has internal arithmetic
that must balance, generate it, do not prompt for it.**

## Round four: the announcer

| Job | Time | Verdict |
|---|---|---|
| `announcer` -- 31 arena-shooter callouts | 183 s | **Used as-is. 0 corrections.** |

Asked for Quake-register shouts that escalate, in five categories with ascending
thresholds, under a hard character limit, and explicitly *not* copying the actual Quake
and Unreal words. It returned RISING, SWIFT, VELOCITY, BLITZ, ONSLAUGHT, RAMPANT,
OBLITERATE, ANNIHILATE for combos and ASCENDING through GODLEVEL for height. Schema
exact, thresholds correct, no duplicates, nothing borrowed. Second job in a row needing
no edits.

The pattern across four rounds is now unambiguous. **Prose and naming: excellent, first
time, every time.** Structured data with internal arithmetic: it cannot hold the
constraint no matter how the prompt is worded. Those are two different tasks that both
look like "generate some content", and the ratio rule does not distinguish them -- only
the presence of arithmetic does.

## Round five: asked for strategy, got confident arithmetic

One job, run in parallel while real work continued, because the brief said to try it.

It was given every movement constant with its unit, the exact air-jump rule, the meter
maths and the wall behaviour, and asked for tool-assisted speedrun strategies. Prose and
ideas -- the thing it is best at. 4.9 KB back in about a minute, fluent and numbered.

Its headline recommendation was to spend the double jump **on the first frame after
takeoff**, argued with worked arithmetic and a claim of "~13.05 additional floors of peak
height". The rule is `vy_new = max(vy,0)*0.35 + impulse*0.82`, which REPLACES the current
vertical velocity. The model read its own result as *additional*, so it recommended
throwing away the 945 px/s already banked. Checked by brute force over every release
velocity:

| release point | apex |
|---|---|
| frame 0 -- the model's answer | 12.13 floors |
| at the apex -- the naive answer | 14.82 floors |
| `vy* = 0.35J/(1-0.35^2)` -- correct | **15.65 floors** |

Its advice is 22% worse than optimal and worse than the obvious answer it was trying to
improve on. The correct result is one derivative of an expression it had in front of it.

Of its four numbered strategies: one inverted (above), one arithmetically fine but
trivial ("keep your speed up"), one an unfalsifiable heuristic, and one "non-obvious
exploit" that is real but lasts 50 ms, alongside a second that describes behaviour the
bot already had and a third that invented a collision state the game does not have.

**Usable ideas: zero.** Cost: nothing, since it ran in parallel. The lesson is not that
it is useless -- rounds one to four show where it earns its place -- but that
**"brainstorm ideas" is not automatically a prose task.** If the ideas have to be *true*
about a system with numbers in it, that is physics wearing prose clothing, and it cannot
do physics. Recorded in `local-model-blind-spots` memory.

### What it never touched

The engine, the physics, the reachability proof, the renderer, the camera, the audio
graph, the planner bot, the character art, the headless canvas, the backgrounds, the
companions' movement, and every one of the twenty-four test suites. Of roughly 25,000
lines of hand-written source (`src`, `tools` and `electron`), plus about 16,000 of
generated art and note data, what it wrote and still ships is a few dozen lines of data.

Every bug found in this project -- the momentum deadlocks, the camera inversions, the
quadratic particle spawn, the audio crackle, the pruning hole, the bot flying at
unreachable targets, the stale plan, the coyote misfire, danger measured in floors, the
reach window centred on the player, a controller that would not fly its own plan, a
killline that teleported, an unclamped camera lookahead, a font atlas built inside a
frame, an un-ramped slow-motion effect, and a character drawn permanently squatting --
was found by a test, by a trace, by a measurement or by looking at the screen. None by
the model. It was asked directly about one class of them and got it backwards.

The single most useful thing built here for finding them was not a model at all. It was
`tools/headless.mjs`: a canvas implemented in Node, so a frame can be rendered and
looked at in a fraction of a second -- 0.15 s when it was built
([docs/TESTING.md](docs/TESTING.md)). The first frame it produced exposed a transform
bug that a browser screenshot had been hiding behind a downscale.

That is not a complaint. It is the shape of the tool: **it writes content, it does not
build things.** Used for content, with a validator behind it, it earned its place.

## Round six: the long art session, where it was not used at all

The session that produced the 16-bit rework, the bot tuning, Duke Vytis himself, the
crypt band and the heraldic rewrite sent the local model **zero jobs**. Not one. That is
worth recording as carefully as the rounds where it was used, because the reason is not
that it was forgotten.

Every piece of work in that session fell on the wrong side of a line this file had
already drawn:

| The work | Why it was not sent |
|---|---|
| The character sprite -- crown, coif, face, beard, shield, sword | **2D grid output.** The rule from round one, unchanged and unchallenged |
| The Vytis on the shield, the skeletons, the tomb platforms | Same. Grid art, every one |
| Proportion research, heraldry, c.1420 kit, crypt vocabulary | Needs the WEB and needs sources it can be held to |
| Reviewing the sprite sheet I had just written | **Code review of a file I have read.** 0 for 3 here, 6.7% precision over 27k lines in the audit |
| The pose angles, the leg rescale, the draw order | Arithmetic that must balance. Generate, do not prompt |

What was used instead: **three Claude subagent workflows, thirty agents, about 4.5
million subagent tokens.** They did the things the local model cannot -- web research
with sources, rendering a candidate and LOOKING at it, and adversarial review of work
already on disk. The emblem panel's winning artist iterated fourteen times, rendering
and re-reading its own PNG each round. That loop is the whole difference.

### And its flavour text is gone

The one contribution from round one that was still shipping in the player-facing game --
43 of 55 lines of combo tiers, taunts, death lines and idle nags -- was **entirely
rewritten** this session. Not because the lines were bad; they were fine. Because the
character changed underneath them. They were written for a generic bouncing man, and
POGO STICK SIMULATION does not belong on a crowned Lithuanian grand duke carrying his
own coat of arms.

That is a failure mode the ratio rule does not predict and this file had not named:
**generated flavour is coupled to a character that may not hold still.** The cost was not
the model's accuracy, which was good. It was that its output aged out when the thing it
described was redesigned.

## Round seven: the rename, the emblem, the music and the exe -- zero jobs, and the rules said so in advance

A full session of feature work: a rename across the source and docs, a new heraldic
emblem for the title screen, a glowing frame around the header, a shortened game-over
lament, a key ladder tied to the floor count, display scaling that works on screens
other than the one it was built on, and packaging the whole thing as a Windows
application.

(Ten alternate voices for the climb track were also built, and then removed the moment
they were heard. The arithmetic was right and the idea was wrong -- worth recording
because "the model could not have done this" and "this should not have been done" are
different verdicts and only the first one is about the model.)

**The local model was sent nothing.** Not as an oversight -- every piece of it lands on
the wrong side of a rule this project had already measured:

| The work | The rule it hits |
|---|---|
| The shield, the swords, the icon | 2D or grid-shaped output. **Never.** |
| The glowing frame, the header layout | Arithmetic against the font's own metrics |
| The music variants | "Anything whose parts must sum or balance: generate it, do not prompt for it" -- ten voices that had to each total exactly 256 sixteenths. They were generated correctly, and then cut for being a bad idea, which is a separate failure and mine |
| The key ladder | Numbers with a unit and a musical meaning |
| Electron vs Tauri vs a bundled server | Architecture, a decision, explicitly on the do-not-offload list |
| Every doc edit | The file was already in context. Re-sending it is pure loss |

That is the point worth recording. This is the second consecutive session where the
answer was zero, and in both cases the rule set predicted it **before** any GPU time was
spent rather than after. A rule that tells you not to try is worth as much as one that
tells you to, and cheaper.

The music is the interesting case, because it looks delegable and is not. Asking for
"four alternate lead melodies in E Dorian, each exactly 256 sixteenths" is precisely the
prompt that failed three times before: it returned voices that did not sum to their
declared length twice, and then flattened every note pair in an object that did not
parse. `tools/compose-music.mjs` derived the variants from the chord progression
instead, and `fit()`, which built every climb and menu voice then, guaranteed the total
by construction. (The three climb themes stopped using it in d1e071f and the menu in
e7047f5, written out bar by bar instead -- `melody()` and `accomp()` refuse any bar that
is not sixteen sixteenths -- and it went altogether with the lament's rewrite, 5eb439f,
the last thing it built.) What could not be prompted for is impossible to get wrong.

Where its work still showed then: the game-over lament's SHAPE was still the model's -- the
descending E-minor phrase from its second music job, four sessions ago. What changed this
round is timing, not melody. It opened on two half notes and closed on four
consecutive E3s totalling 44% of the loop, which is the drag the user heard. The
model wrote a good tune with no sense of how long thirteen seconds is on a death screen
-- which is the same missing sense of scale that had it writing `topSpeed >= 8` for what
was then a 0-330 range. Two of those E3s went then: the lament became three bars, 48
sixteenths at 74 bpm, about 9.7 seconds, with the closing E3s a quarter of it. It has
since been recomposed whole (2026-09-24; round three above), and none of the model's
notes are left in the game.

## Round eight: the drawn art -- zero jobs, and grid art stops being typed

The sessions after round seven replaced the Duke, the six companions, the shield he
carries, the title emblem and the platforms -- hand-typed grids and procedural painters,
all of them -- with drawn art. The local model was sent nothing, the third round
running, and there was no decision to make: every piece of it is two-dimensional.

What is worth recording is what did the work instead, because round one's answer to grid
art has run out. Round one said to type it by hand, since that was faster than reviewing
the model's wrong glyphs, and for sixty-six 5x7 letters it was. A character is thousands
of cells a frame, and typed by hand it failed the way the model's font did: a beard came
out as chainmail, an outline as floating dots, a nose as a finger. Grid art is not
something anyone should be typing, model or not.

So nobody types it. An image generator draws reference sheets and mechanical importers
read the pixels off them: `tools/import-sprite.mjs` for the Duke (`vytisart.js`) and the
companions (`src/render/companions/`), `tools/import-shield.mjs` for the emblem, and
`tools/import-platforms.mjs --emit` for the platform tiles in `platart.js`, which are
still provisional. That is nearly all of the 16,000 generated lines counted in round five.

The image generator turned out to share the local model's signature failure: **it agrees
with a constraint in prose and then violates it in the data.** Told to use a magenta
background as a key colour, it treated magenta as part of the palette and scattered it
through the armour, and the importer read every one of those pixels as a hole. Told to
draw on a pixel grid, it drew smooth illustrations in a pixel-art style. The fix was the
one this file keeps arriving at: stop prompting for what it cannot honour, and put a
mechanical check behind it. The importer finds the backdrop by flood fill from the
border, with a hue test for dark sheets (`--bgchroma`, see
[docs/ART-PIPELINE.md](docs/ART-PIPELINE.md)), and `tools/test-sprites.mjs` fails any
pose, the Duke's or a companion's, with more than 20 enclosed transparent pixels that
the importer was not told to open (round nine).
`import-platforms.mjs` measures whether each tile wraps, because the first platform art
tiled on two zones of twelve and looked fine on the sheet.

The rule for Qwen is unchanged: 2D output, never. What changed is that "never" no longer
means "by hand".

## Round nine: menus, backgrounds and companions -- nothing on record

The work of the night of 2026-09-21 into the 22nd (`a2e1e25` to `8f1ca6e`) corrected the
menus and stats, moved four award targets, cut the stand-in platform tiles and the
archer's bow out of their sheets properly, rebuilt the backgrounds as three tiled layers
and repainted all twelve zones in code, crossfaded the whole next zone in, and
redesigned how the companions move. The local model has no job on record for any of it:
nothing in `logs/timing.tsv`, and no commit credits it. Every piece sits on the wrong side of a rule this file already had:

| The work | The rule it hits |
|---|---|
| Twelve zones x FAR, MID, NEAR, painted in code from the user's board | 2D output. Four Claude subagents painted them in parallel worktrees, and each zone was judged by LOOKING -- its board crop, its 2 x 2 seam sheet, an in-game frame beside the old one -- with `test-backgrounds` failing any layer that does not wrap |
| Companions kept in view | A design with decisions in it, tuned by measuring off-screen frames and crossings over 150,000-frame simulated runs |
| The stats pages, the help text, the award targets | Decisions about the game's own landmarks, in files already in context |
| Cutting platforms and the bow out of their sheets | 2D, and arithmetic on pixels |

Two things are worth keeping from it.

**Generated numbers age out the way generated flavour did.** Four of the model's award
targets -- HALFWAY at floor 60, SUMMIT SEEKER at 150, COMBO PIONEER and COMBO LORD at 3-
and 10-floor combos -- were sensible for the tower they were written for and trivial on a
2,300-floor one. They now sit on its landmarks: half the cycle (1150), the ZENITH (2100),
the first multiplier step (50 combo floors) and the combo that earns the third air jump
(250). Round six lost the flavour text because the character changed under it; this is
the same coupling, with the tower as the thing that did not hold still.

**The mechanical check keeps being the fix.** The stand-in platform tiles had copied the
reference sheet's dark navy as solid pixels -- a black box over the walking surface in
every zone. The cut now clears backdrop by a flood from each cell's top and bottom rows
through pixels that match the panel's navy in value AND hue. The archer's bow imported
with solid navy between bow and string, because a flood from the border cannot reach a
pocket the string closes off; `import-sprite.mjs --open=N` clears an enclosed pocket only
if every pixel passes the backdrop test and it is at least N source pixels, the module
records how many it opened per frame, and `test-sprites` subtracts exactly those, so a
hole nobody meant still fails. And the user's two boards, backgrounds and environment
(`assets/backgrounds-reference.webp`, 447 x 2000, and `assets/decor-reference.webp`,
448 x 2000), are pictures, not tiles -- lossy WebP, about 45 to 90 pixels an element, and
no background tile on the board repeats. They are art direction, not art: the
backgrounds were painted in code from the board, and what an artist is asked to deliver
is drawn into a template that fixes the size and the rule (`tools/background-template.mjs`,
`tools/decor-sheet.mjs`) rather than asked for in prose. The environment sheet was drawn
to `decor-sheet.mjs`'s boxes; it is filed and parked for the next session
(docs/STATUS.md).
