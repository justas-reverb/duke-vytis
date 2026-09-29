# Sound effect samples

Drop files here and the game plays them instead of synthesising. Nothing here is
required: with this folder empty every effect falls back to its oscillator version and
the game sounds exactly as it did before.

## Naming

One file per effect, `<name>.ogg` or `<name>.wav`. The loader tries `.ogg` first.
Currently wired: the seven milestone callouts, which mark the tower's heights -- one
each at the same floor of every 2300-floor lap of the zones.

| file | plays when |
|---|---|
| `milestone330.ogg` | the climb reaches floor 330 of a lap (SWIFT) |
| `milestone660.ogg` | floor 660 (CHARGE) |
| `milestone990.ogg` / `1310` / `1640` / `1970` / `2300` | SOARING, RAMPAGE, CRUSADE and THUNDER, up to GLORY on the lap's top floor, 2300 |
| `milestone.ogg` | any milestone with no file of its own |

A missing file is not an error. `milestone.ogg` alone is enough to replace the whole
set. A lap's prestige badge (x2, x3 ...) does not change which file plays.

The names are the ones the game asks for (`SAMPLE_NAMES` in `src/render/audio.js`, built
from `MILESTONES` in `src/game/milestones.js`), and only those are ever fetched. They used
to be `milestone50` to `milestone350`, when the callouts fired at a combo's floor count; a
file under one of those names is never played now.

## Processing

Samples are played through `sfxGain` into a 5.2 kHz low-pass -- the same filter the
music goes through -- so they sit in the same tonal world rather than sounding like
they arrived from a different game. That filter does not do the rest of the work for
you. To match the 8-bit register, process before exporting:

| step | setting | why |
|---|---|---|
| high-pass | 200 Hz | removes rumble that would eat headroom |
| compress | ~6:1, fast attack | arcade callouts are flat and loud, not dynamic |
| downsample | 11.025 kHz | the aliasing is a large part of the sound |
| requantise | 8-bit | this is the bitcrush |
| loudness match | per file | so no callout jumps out when it fires |
| export | mono OGG | smallest, and the loader prefers it |

## Headroom

A sample peaking at 1.0 arrives at the limiter at `1.0 * 0.85 (sfxGain) * 0.5 (master)`
= 0.425, against a limiter threshold of -6 dBFS. One sample is comfortable; effects
layer, so leave a few dB of headroom in the file rather than normalising to full scale.

## Licensing

Only put files here that you have the right to use. Game audio ripped from a commercial
title is that publisher's copyright, and this folder is inside a git repository -- it
would be committed and distributed along with everything else. If you want a commercial
game's callouts for your own private build, keep them out of version control.
