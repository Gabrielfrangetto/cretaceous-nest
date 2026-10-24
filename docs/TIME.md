# Time: the world's clock and the real one

Decided with the owner, Oct 2026. One rule, so every feature knows which clock it is on.

## The world's clock (×50: a day of the world in about 29 real minutes)

Everything in the world runs on one clock, the same for every player, `WORLD.speed` (50) times as fast
as the real one (`config.js WORLD`, `sun.js toWorld` / `toReal`):

| World | Real |
|---|---|
| 1 minute | 1.2 s |
| 1 hour | 1.2 min |
| 1 day | 28.8 min |
| 1 week | ~3 h 20 min |
| 1 month | ~14 h |
| 1 year | ~7.3 days |

On it: day and night, the moon, the seasons (the nest's sky, the night over the map, who is awake),
journeys on foot, the maglev, rockets, aircraft, camping, hazards on the way. The map keeps its size:
a hex is about 14 km, the continent about the size of the United States.

- On foot: 4 km/h, 8 hours of marching a day (`CLOCK`): a flat hex is half a day of the world (about
  12.5 real minutes), a day's march about 2.3 flat hexes. Hunger and thirst only fall on a journey, by
  the way walked (`SURVIVAL`, per unit of a way's cost, half a day of the world each).
- Maglev: about 300 km/h, a train each way about every 4 hours of the world (`MAGLEV`); its doors
  close `MAGLEV.board` real seconds before it leaves.
- Rockets: half an hour to an hour of the world; a launch every hour (`ROCKET`).
- Camping: a night, 8 hours of the world (`CAMP`).

Durations of the world are set in `config.js` in its hours, through `worldMins(hours)` (the real
minutes the game keeps time in). Everything is stored as real instants (`clock.js now()`).

## The real clock

Only a dinosaur's life, and healing:

- a dinosaur's age and growth, its growth capsules (every `CAPSULE.every` real hours), eggs hatching,
  breeding;
- wounds and injuries healing (`INJURY_MINS`, `HEAL_MINS`, …).

At home no one goes hungry or thirsty, the player neither: the keepers feed everyone.

## On screen

What happens in the world is told in the world's time: "there in 14 h", "leaves in 2 h 24 min",
"29 days to get there", never real minutes (`util.js worldSpan` / `worldSpanMins`, from real ms or
minutes). A dinosaur's age, hatching and healing are told in real time.

## Adding something new

Decide which clock it is on: in the world (most things) → set it in world hours with `worldMins`, show
it with `worldSpan`; part of a dinosaur's life or healing → real time.
