# Event pictures

One picture per event, 16:9 (for example 1280×720), as `<name>.webp` (or `.png`). A journey shows it on
the event's card when it stops there. The most fitting picture there is is used: the species met
first, then the event, then the general one in brackets; with none at all the card shows only its words.

Species ids: dilo, compy, scelido, psitta, coelo, hypsi, proto, galli, hypa, pachy, raptor, stego, bary,
para, trike, ankylo, allo, spino, rex, argent, and deinosuchus (the crocodile).

- An animal met: `<event>-<species>`, then `<event>`: `fight-rex`, `chase-raptor`, `scatter-allo`,
  `standoff-trike`, `sighting-galli`, `witness-rex` (the hunter), `backed-off-allo`.
- A nest: `nest-<species>-<state>`, then `nest-<kind>-<state>`, `nest-<state>`, `nest`: for example
  `nest-rex-seen`, `nest-guarded-seen`, `nest-seen`. Kinds: buried, watched, colony, brooded, guarded,
  creche (which species nests how is in config.js, NEST.kind).

| File | When |
|---|---|
| `fight` | something came for you, or you went for it |
| `scatter` (`fight`) | a predator charged and the group scattered |
| `standoff` (`fight`) | an animal stood its ground to drive you off |
| `chase` | a predator was spotted first and everyone ran |
| `sighting` | an animal spotted at a distance, to hunt or not |
| `witness` | a hunt watched: wild against wild |
| `backed-off` | a predator backed off from a Spinosaurus' sail |
| `nest-hatched` (`nest`) | a nest already hatched, the young gone |
| `nest-alone` (`nest`) | a nest left alone (buried eggs, no parent) |
| `nest-empty` (`nest`) | a nest, the parent off to feed |
| `nest-watched` (`nest`) | a nest with a parent close by, or a creche |
| `nest-colony` (`nest`) | a nesting colony |
| `nest-unseen` (`nest`) | a parent on its nest that hadn't seen you |
| `nest-seen` (`nest`) | a parent on its nest, warning you off |
| `hazard-sandstorm` (`hazard`) | a sandstorm in the dunes |
| `hazard-heat` (`hazard`) | heat and thirst in the desert |
| `hazard-fumes` (`hazard`) | fumes from volcanic vents |
| `hazard-flood` (`hazard`) | a river burst its banks |
| `hazard-bog` (`hazard`) | ground giving way to a bog |
| `hazard-cold` (`hazard`) | a bitter night in the forest |
| `hazard-lost` (`hazard`) | lost in a thick forest |
| `collapse` | you collapsed of hunger or thirst |
| `perished` | a dinosaur died of hunger or thirst on the way |
| `lost` | nobody of the team was left |
