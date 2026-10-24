# Land vehicles

Decided with the owner, Oct 2026. A vehicle carries a team from one hex to another: it is transport,
not exploring. Where it parks the team gets out, to explore on foot with the dinosaurs it brought, or
to drive on.

- **Getting one** (`vehicles.js getVehicle`, the `vehicle` action): at a station where the player
  stands (the nest, or a city where the player's team waits), rented for 1, 3 or 7 days of the world
  or bought (`config.js VEHICLES`). A rental that runs out is gone wherever it is; a vehicle bought
  stays where it was left.
- **Kinds**: the Rover (the player and two small dinosaurs, battery 24 hexes) and the Hauler (the
  player, a stall trailer for four up to medium size, a pen trailer for one large; battery 16 hexes).
- **Driving** (`journey.js startDrive`, the `drive` action): the player drives; from the nest any of
  those at home who fit the compartments go (dragged into them, as on the maglev: `ui/board.js`), from
  anywhere else the party waiting where it is parked, all of it. The way is the quickest a vehicle can
  cross (`drivePath`): never swamps, mountains, volcanoes or water. About 45 km/h on open land, 25 in
  woods, hills and floodplains, 12 hours at the wheel a day (`DRIVE`). Nothing happens on the way: no
  encounters, hazards or finds; it parks and the hex is seen.
- **Battery**: so many hexes of open land (rough land takes 1.5); full again at a station, a quarter
  back for a night's camp beside it.
- **On the map**: the player's vehicles where they are parked, or driving along the way with the team
  (`ui/world.js vehicleIcon`, on the trains' layer).

Who doesn't fit stays behind. A party driving can't be called back or flown home.
