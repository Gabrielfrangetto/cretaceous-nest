# Land vehicles

Decided with the owner, Oct 2026 (the science expeditions instead of renting, the same month). A vehicle carries a team from one hex to another: it is transport,
not exploring. Where it parks the team gets out, to explore on foot with the dinosaurs it brought, or
to drive on.

- **Science expeditions** (`vehicles.js scienceTrip`, the `science` action; `config.js SCIENCE`): the
  colony is there to study the dinosaurs where they live, so its science teams drive out all the time.
  From every station a truck sets out every 6 hours of the world for a hex 2 to 8 hexes off (picked for
  the team, the same for every player, one a truck can reach and come back from), studies there 12
  hours and drives back. The player rides along for free, out or back, with whoever fits its
  compartments (a seat, four stalls, a pen); its doors close 10 real seconds before it leaves, and one
  may get off until then. The trucks show on the map, out, studying and back. This replaced renting.
- **Buying one** (`vehicles.js getVehicle`, the `vehicle` action): at a station where the player stands
  (the nest, or a city where the player's team waits; `config.js VEHICLES`). It stays where it was left.
- **Kinds**: the Rover (the player and two small dinosaurs, battery 24 hexes) and the Hauler (the
  player, a stall trailer for four up to medium size, a pen trailer for one large; battery 16 hexes).
- **Driving** (`journey.js startDrive`, the `drive` action): the player drives; from the nest any of
  those at home who fit the compartments go (dragged into them, as on the maglev: `ui/board.js`), from
  anywhere else the party waiting where it is parked, all of it. The way is the quickest a vehicle can
  cross (`drivePath`): never swamps, mountains, volcanoes or water. About 45 km/h on open land, 25 in
  woods and floodplains, 12 hours at the wheel a day (`DRIVE`). Nothing happens on the way: no
  encounters, hazards or finds; it parks and the hex is seen.
- **Battery**: so many hexes of open land (rough land takes 1.5); full again at a station, a quarter
  back for a night's camp beside it.
- **On the map**: the player's vehicles where they are parked, or driving along the way with the team
  (`ui/world.js vehicleIcon`, on the trains' layer).

Who doesn't fit stays behind. A party driving can't be called back or flown home.
