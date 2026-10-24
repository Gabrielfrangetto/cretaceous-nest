# Transport: the maglev on a timetable, suborbital rockets, and stables in every city

Plan for replacing today's instant maglev (any time, from anywhere, no wait) with two scheduled,
visible ways to travel between the nest and the cities, and letting dinosaurs travel and stay in a
city without the player. Decided with the owner, Oct 2026. Built: `MAGLEV`, `ROCKET`, `LONG_NECK` in `config.js`; `trainTrip`,
`rocketTrip`, `trainsAt`, `joinParty` in `journey.js`; the World tab's ride buttons and "Send dinosaurs
ahead"; `tests/transport.test.js`.

**Speeds as built.** The game's clock runs fast: a flat hex walked in half a real minute is half a day
of the world. 1,000 km/h on that clock would be instant, and 1.3 real minutes a hex would be slower
than walking, so the speeds are set by how they feel against walking. The maglev (`map.js railsOf`):
first one ring through the nest and every city (the cheapest to build that never crosses itself), then
up to three straight links across it where two stations are at least 2.5 times as far apart round the
ring as across (on this map, the nest to Highfen), each cutting its ring in two that share it; so no
line ends at a city. Each line is laid as straight as it goes between its stations, over land, around
mountains where it can (hills cost a little more, a mountain a lot: a tunnel, short, drawn dashed, the
trains unseen in it), and drawn smooth. On every ring trains run round both ways, each keeping its way,
on a beat of 10 min (`journey.js timetableOf`): each line takes a whole number of 5 min from leaving one
station to leaving the next (its run, at about 6 s a hex, set to fit, and 1 min standing), and each ring
a whole number of 10 min round; so each way comes into every station once every 10 min and the two ways
5 min apart, at every station alike: a train every 5 min, steady. Where two rings meet the second
ring's trains come in between the first's, a train every 2.5 min. Trains slow into each station and
speed away. A ride is a wait of up to 10 min, then the quickest way, changing rings where needed.
Rockets 1 to 3 min, a launch every
5 min, a 10 min rest on landing. The sections below keep the first plan's numbers for reference.

## Why

Today a maglev ride is instant in practice: `TRAIN.mins = 0.05` a hex (3 s; a hex is about 22 km, so
about 26,000 km/h) plus 2 min to board. It works, but nothing is seen moving and there is no reason to
plan. The goal is immersion without making anyone sit and wait: trips run in the background like an
expedition, with a notice on arrival.

## The two transports

### Maglev (the slow one, takes anyone)

- 1,000 km/h: about 1.3 min a hex. A stretch between two stations takes 54 min to 2 h 15 (most about
  1 h 15; from the nest 51, 59 and 75 min).
- Runs on today's network (`map.js railsOf`: 11 stations, 14 lines, 756 hexes of track).
- A train leaves every station on every line, both ways, every 30 min; 3 min standing at each
  station. That takes about 77 trains on the network.
- Takes every dinosaur: colossal ones, long-necked ones, babies.
- Cheap (keep today's fare: `TRAIN.fare`, seats by size `TRAIN.seats`).
- A ride between two stations not on the same line changes trains at the stations between (the
  route from `trainRoute`), waiting for the next train of each line.

### Suborbital rocket (the fast one, not for everyone)

- Straight from any station to any other: 5 to 15 min real time by distance (up, an arc above the
  map, down).
- A launch from every station every 15 min.
- Not allowed: babies; colossal ones; long-necked ones (a `LONG_NECK` list in `config.js`, today
  `['argent']`; add each sauropod or long-necked species as it comes). The reason, said in the game:
  3–5 g on the way up and down, a few minutes weightless; fine for a sedated animal strapped in, not
  for a long neck or a baby.
- Dear: priced by the team's mass, with a load limit a flight (about 20 t); a team over it can't
  board.
- Dinosaurs arrive tired: a short rest before they can fight or explore.

## The timetable: worked out, not stored

No train or rocket is kept anywhere. Each line has a fixed timetable that repeats all day, worked out
from the game clock (`clock.js`) and the line's length:

- train k of a line leaves its end A at `t0 + k × 30 min`, runs to B at 1.3 min a hex, stands 3 min,
  comes back; where any train is at any moment comes from the time alone;
- so the server knows the next departure from each station, every player sees the same trains in
  the same places, and nothing needs saving.

The same for rockets (a launch slot every 15 min a station, its arc to any destination).

## Who travels: any dinosaurs, without the player

- The player picks which dinosaurs go (any of theirs at that station), with or without the player.
  This is for getting ready ahead: send a team to a city, then fly there later.
- A party travelling without the player is a kind of expedition: it shows on the map, it can't be
  given orders on the way, it arrives at the station and stays there.
- Today every team must include the player (`world.js`: "Dinosaurs never set out without the
  player"). That stays true for exploring and fighting; only a transport trip between stations may
  go without the player.

## Stables in every city

- Each city gets a place for dinosaurs to stay, the same as the nest: they are fed and watered there,
  they rest and heal there (as at home).
- A dinosaur is always somewhere: the nest, a city's stables, or on a journey/trip. The save keeps
  where each one is (`at`: '0,0' or a city's hex key).
- From a city's stables the player can form a team and explore from there, as from the nest.
- The Nest tab shows the nest; a city's stables are reached from the World map (the city's panel) or
  a picker of places.

## Steps (in order)

1. Config: `MAGLEV` (speed in min a hex, every 30 min, 3 min at stations), `ROCKET` (every 15 min,
   min a trip by distance, price a tonne, load limit, rest after), `LONG_NECK`.
2. Timetable functions in a shared module (browser and server): next departure from a station on a
   line, where each train/rocket is at a time, a trip's legs and times (`trainRoute` for the maglev).
3. The save: each dinosaur's `at`; migrate every existing one to the nest ('0,0'). Bump
   `SAVE_VERSION` with a step in `MIGRATIONS` (`state.js`).
4. Trips: a new action to send chosen dinosaurs (with or without the player) by maglev or rocket,
   checked on the server (`game-server.js`, `scripts/sync-shared.js`): who may fly, load, fare, the
   next departure; the party waits for it, rides, arrives, rests (rocket).
5. Stables: feeding, watering, resting and healing in a city as in the nest; exploring from there.
6. The map: trains on the tracks and rockets' arcs live (`ui/world.js`, `ui/mapcanvas.js`); the
   stations' next departures in the city panel; a party on a trip.
7. Notices on arrival (as an expedition's return).
8. Tests (`node --test`): timetable, who may fly, load limit, fares, the save migration, a trip
   without the player, stables feeding.
9. Remove the old instant train (`journey.js trainTrip`, `TRAIN.mins`/`board`) once the new one works.

## Open points

- Rocket price a tonne and the load limit: to set while balancing.
- Does a party on a trip count against `EXPEDITION_SLOTS`?
- How long the rest after a rocket flight lasts.
