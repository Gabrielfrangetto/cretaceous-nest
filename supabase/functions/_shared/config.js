// Game content and balance. Change numbers here; the rest of the code reads them.
// The world's clock (docs/TIME.md): everything in the world (day and night, the seasons, journeys, the
// maglev and the rockets, camping) runs WORLD.speed times as fast as the real clock, one clock for every
// player: a day of the world lasts about 29 real minutes, a year of it about 7 real days. A growth
// capsule lasts a day of the world (CAPSULE). Only the rest of a dinosaur's life keeps the real clock
// (its age, eggs hatching, breeding) and so do wounds healing. Durations of the world are set here in its hours, worldMins turning them into the
// real minutes the game keeps time in.
export const WORLD = { speed: 50 };
export const worldMins = hours => hours * 60 / WORLD.speed;

// Every species, grouped by rarity. One row each:
//   species name, build (body shape for equipment art), rarity, diet (foods it eats, favourite first),
//   base stats at perfect genes, egg look (shell, mark, pattern), baby colours (body, acc), nickname, fact.
// Each baby's real stats are its species' base scaled by its own genes (see SPECIES_BASE below), so
// no two of a species are the same. Rarer species have a higher total: Starter and Common 200,
// Uncommon 230, Rare 260, Epic 285, Legendary 310.
const S_ = (species, build, rarity, diet, base, egg, shell, mark, pattern, body, acc, nick, fact) =>
  ({ species, build, rarity, diet, base, egg, shell, mark, pattern, body, acc, nick, fact });
const SPECIES_LIST = {
  // (starters: STARTERS, a new player picks one)
  dilo:    S_('Dilophosaurus', 'theropod', 'Rare', ['meat'], { str: 98, agi: 65, vit: 52, res: 45 },
             'Crested Egg', '#e9dccb', '#9a3f2c', 'speckle', '#b5603e', '#e3b53a', 'Crest', 'Dilophosaurus wore two thin bony crests on its head and was one of the biggest hunters of its time.'),
  compy:   S_('Compsognathus', 'theropod', 'Rare', ['meat', 'insect'], { str: 52, agi: 110, vit: 52, res: 46 },
             'Tiny Egg', '#e6e1cf', '#7d8a5a', 'speckle', '#8aa05a', '#d7b847', 'Pip', 'Compsognathus was about the size of a chicken and hunted lizards and insects.'),
  scelido: S_('Scelidosaurus', 'armored', 'Common', ['leaf', 'fruit', 'seed'], { str: 30, agi: 30, vit: 55, res: 85 },
             'Knobbly Egg', '#d8d2bf', '#5d6b4a', 'spots', '#7d8a5c', '#c9b27a', 'Knobs', 'Scelidosaurus was one of the first armored dinosaurs, its back studded with rows of bony plates.'),
  psitta:  S_('Psittacosaurus', 'ceratopsian', 'Starter', ['leaf', 'fruit', 'seed'], { str: 35, agi: 35, vit: 80, res: 50 },
             'Pebble Egg', '#e3dcc4', '#6d6a4a', 'spots', '#b59a5e', '#7a5a33', 'Beaky', 'Psittacosaurus means "parrot lizard": it had a strong beak and a tuft of quills on its tail.'),
  // common
  coelo:   S_('Coelophysis', 'theropod', 'Starter', ['meat', 'insect'], { str: 55, agi: 65, vit: 45, res: 35 },
             'Banded Egg', '#efd9c8', '#a4553b', 'stripes', '#c27a52', '#4a4640', 'Dash', 'Coelophysis lived in herds; one quarry in New Mexico holds more than a thousand of their skeletons.'),
  hypsi:   S_('Hypsilophodon', 'ornithopod', 'Common', ['leaf', 'fruit', 'seed'], { str: 45, agi: 55, vit: 50, res: 50 },
             'Mossy Egg', '#d9e3c6', '#4f7a4a', 'stripes', '#6f9b6a', '#c9d38a', 'Hop', 'Hypsilophodon was a fast little runner, about 2 m long, that browsed on low plants.'),
  // uncommon
  proto:   S_('Protoceratops', 'ceratopsian', 'Starter', ['leaf', 'fruit', 'seed'], { str: 45, agi: 30, vit: 50, res: 75 },
             'Spotted Egg', '#eadcbf', '#8b6a44', 'spots', '#c79d63', '#d9662f', 'Popcorn', 'Fossil embryos suggest Protoceratops eggs took about 83 days to hatch.'),
  galli:   S_('Gallimimus', 'theropod', 'Uncommon', ['leaf', 'fruit', 'insect', 'seed', 'raw_egg', 'meat'], { str: 40, agi: 95, vit: 50, res: 45 },
             'Speedy Egg', '#ece4d2', '#8a7a5a', 'speckle', '#c8a56a', '#6f5a3a', 'Zippy', 'Gallimimus was built like an ostrich and may have run at more than 40 km/h. It ate almost anything.'),
  hypa:    S_('Hypacrosaurus', 'ornithopod', 'Uncommon', ['leaf', 'fruit', 'seed'], { str: 45, agi: 50, vit: 85, res: 50 },
             'Striped Egg', '#d6e2cc', '#5c7b4f', 'stripes', '#78a463', '#d8bd3e', 'Sprout', 'Teeth from Hypacrosaurus embryos suggest almost 6 months inside the egg.'),
  pachy:   S_('Pachycephalosaurus', 'pachycephalosaur', 'Uncommon', ['leaf', 'fruit', 'seed'], { str: 80, agi: 50, vit: 55, res: 45 },
             'Domed Egg', '#e4d8c4', '#7a5a8a', 'spots', '#9a7fae', '#e3c9a0', 'Bonk', 'Pachycephalosaurus had a skull dome up to 25 cm thick, perhaps for head-butting rivals.'),
  // rare
  raptor:  S_('Velociraptor', 'theropod', 'Starter', ['meat'], { str: 50, agi: 77, vit: 38, res: 35 },
             'Speckled Egg', '#cfd6e4', '#46557a', 'speckle', '#6a7ca8', '#e3ae45', 'Sparky', 'An adult Velociraptor was about 2 m long including the tail, and its body was covered in feathers.'),
  stego:   S_('Stegosaurus', 'armored', 'Rare', ['leaf', 'fruit', 'seed'], { str: 70, agi: 30, vit: 65, res: 95 },
             'Plated Egg', '#dfe0c8', '#8a5a3a', 'stripes', '#7e9a6a', '#d0663a', 'Spike', 'Stegosaurus swung a tail tipped with four long spikes, and its brain was about the size of a walnut.'),
  bary:    S_('Baryonyx', 'theropod', 'Rare', ['fish', 'meat'], { str: 90, agi: 55, vit: 65, res: 50 },
             'River Egg', '#d4e0de', '#3f6a6a', 'speckle', '#6a8a7a', '#c9b06a', 'Hook', 'Baryonyx had a huge hooked claw on each thumb and a long snout for catching fish.'),
  para:    S_('Parasaurolophus', 'ornithopod', 'Rare', ['leaf', 'fruit', 'seed'], { str: 50, agi: 55, vit: 100, res: 55 },
             'Horned Egg', '#e6dccb', '#a0553a', 'stripes', '#c97a4a', '#e8d27a', 'Toot', 'Parasaurolophus had a long hollow head crest that may have worked like a trumpet.'),
  // epic
  trike:   S_('Triceratops', 'ceratopsian', 'Epic', ['leaf', 'fruit', 'seed'], { str: 90, agi: 35, vit: 70, res: 90 },
             'Shield Egg', '#e2d6bd', '#6a4a2a', 'spots', '#8a6a4a', '#d9c08a', 'Trixie', 'Triceratops had three horns and a bony frill, and lived alongside Tyrannosaurus.'),
  ankylo:  S_('Ankylosaurus', 'armored', 'Epic', ['leaf', 'fruit', 'seed'], { str: 65, agi: 25, vit: 75, res: 120 },
             'Studded Egg', '#d6d0bc', '#5a4a3a', 'spots', '#8a7a5a', '#c9a96a', 'Tank', 'Ankylosaurus was covered in bony armor and swung a heavy club at the end of its tail.'),
  allo:    S_('Allosaurus', 'theropod', 'Epic', ['meat'], { str: 100, agi: 80, vit: 60, res: 45 },
             'Ridged Egg', '#e8d6c4', '#8a3a2a', 'stripes', '#a85a3a', '#e8c06a', 'Fang', 'Allosaurus was the top hunter of the Late Jurassic, with dozens of serrated teeth.'),
  // legendary: their eggs are only found in lairs far from the nest
  spino:   S_('Spinosaurus', 'theropod', 'Legendary', ['fish', 'meat'], { str: 105, agi: 50, vit: 95, res: 60 },
             'Sail Egg', '#d6e2e6', '#2f5a7a', 'speckle', '#5a7a9a', '#d96a3a', 'Sail', 'Spinosaurus had a tall sail on its back and spent much of its life in rivers, hunting fish.'),
  rex:     S_('Tyrannosaurus', 'theropod', 'Legendary', ['meat'], { str: 110, agi: 45, vit: 90, res: 65 },
             'Golden Egg', '#f0cd68', '#b48114', 'gold', '#a35b40', '#f0cd68', 'Rex', 'A newly hatched tyrannosaur is estimated to have been about 90 cm long.'),
  argent:  S_('Argentinosaurus', 'sauropod', 'Legendary', ['leaf', 'fruit', 'seed'], { str: 75, agi: 25, vit: 140, res: 70 },
             'Giant Egg', '#e8e2d2', '#7a6a4a', 'spots', '#9a8a6a', '#c9b98a', 'Titan', 'Argentinosaurus may have weighed as much as ten elephants, yet hatched from an egg the size of a melon.'),
};

// what each rarity means: coins for hatching, and where its
// eggs turn up: from minDist hexes away (a lair counts 2 hexes farther), lairOnly for legendaries;
// weight is how often it is picked against the other eggs of the same biome
export const RARITIES = {
  Starter:   { coins: 8, minDist: 1, weight: 5 },
  Common:    { coins: 10, minDist: 1, weight: 5 },
  Uncommon:  { coins: 25, minDist: 3, weight: 3 },
  Rare:      { coins: 60, minDist: 5, weight: 2 },
  Epic:      { coins: 100, minDist: 6, weight: 1.2 },
  Legendary: { coins: 150, minDist: 5, weight: 1, lairOnly: true },
};

// body size, from the real animal's weight: tiny under 10 kg, small 10–100 kg, medium 100 kg–1 t,
// large 1–5 t, huge 5–20 t, colossal above. Sets how much equipment it can carry (CARRY) and how
// hard blows land between very different sizes (SIZE_EDGE).
const SIZE = {
  compy: 'tiny',                                                   // 0.5–3 kg
  psitta: 'small', coelo: 'small', hypsi: 'small', raptor: 'small', // 15–30 kg
  proto: 'medium', scelido: 'medium', dilo: 'medium', galli: 'medium', pachy: 'medium', // 180–450 kg
  bary: 'large', allo: 'large', para: 'large', hypa: 'large', stego: 'large',             // 1.7–5 t
  ankylo: 'huge', trike: 'huge', spino: 'huge', rex: 'huge',     // 6–9 t
  argent: 'colossal',                                              // 50–75 t
};

// Weapons and hide, fixed for a species whatever its genes, from how the real animal fought:
//   role:   how it fights (see ROLE_TARGET): attacker, defender or noncombatant
//   charge: a defender's chance a turn to charge instead of holding its ground
//   fragile: a share of the health its body would have (Coelophysis: hollow, bird-like bones)
//   crush: the share of the target's hide and damage reduction its bite goes through
//   boneBreaker: its bites land on a body part (BONE_BREAKER)
//   frill: a solid bony frill that shields its head (FRILL)
//   armor: bony plates, blow by blow: 'heavy' over most of the body, 'light' rows of scutes (ARMOR)
//   collar: bony scutes over the neck: it is never bitten through there
//   crouch: an armored one that hunkers down before a bigger predator (CROUCH)
//   club: a tail club that can break a foe's shin (CLUB)
//   grab: clings to a bigger foe's body to slash it (GRAB)
//   tough: shrugs off one deadly blow a fight and heals fast (TOUGH)
//   claw: a sickle claw that latches on and goes for the neck (LATCH, CLAW)
//   beak: a hooked beak that clamps on to what it strikes back at (BEAK)
//   spikes: a spiked tail that pierces when it strikes back or charges (SPIKES)
//   guard: a fighting stance that may turn a blow aside and strike back at once (SPIKES)
//   throat: small bones covering the throat (THROAT)
//   dome: a thick bony skull dome: it goes for the flanks and takes blows to the head lightly (DOME)
//   giant: a giant sauropod: it only strikes back, with a stomp or its tail (GIANT)
//   alert: a deep call through its hollow crest that warns its group of a predator (ALERT)
//   escape: may get away from a blow that would bring it down (ESCAPE)
//   nurse:  cares for the nest's eggs and hatchlings (NURSE)
//   camo:   the biome it blends into (VISIBILITY, CAMO)
//   digest: gets hungry this many times more slowly on a journey (gizzard stones)
//   crack:  a nut-cracking beak that may break a small foe's limb when it strikes back (CRACK)
//   creche: an adult in the nest raises its hatchlings with a strong stomach (CRECHE)
//   runner: a fast runner with wide-set eyes (RUNNER)
//   fisher: at home in the water: { water, land } its blows' times, landAgi its agility kept on land
//   hook:   a thumb claw that may hook what it strikes (HOOK)
//   fishing: [min, max] fish it brings home from a water hex
//   zigzag: runs in zigzags: harder to hit for anything bigger than it (ZIGZAG), and to run down
//   forage: self-sharpening teeth: brings home plants from any trip, [item, min, max, chance] each
//   selfFeed: hunts small prey (lizards, insects) on a trip and comes home fed, a meal it ate
//   eyes:   lived in groups: each one in a team may see a predator first, and the team scatters (EYES)
//   sail:   a sail that intimidates: smaller wild predators keep away from its team, and one as big may
//           back off after sizing it up (SAIL)
//   kick:   its blows back land this many times as hard (a long-legged kick)
//   haul:   brings home this many times the loot an expedition finds (a team takes its best hauler)
//   slow:   an expedition with it takes this many times as long
//   active: when it is awake, from the rings of bone in its eyes (Schmitz & Motani 2011): 'night' for a
//           night hunter (Velociraptor), 'both' for one awake by day and night (Protoceratops; the
//           giant plant eaters, which must eat almost all the time); by day otherwise
//   fear:   what makes it run, before the fight starts (combat.js afraidOf). A predator's comes from
//           its size: it runs from a bigger predator (one its size doesn't scare it), and from a plant
//           eater more than one size bigger (one size up it still takes on). A plant eater runs from a
//           predator bigger than this, the biggest it stands up to. Nothing short of a giant sauropod
//           stands up to one: colossal is theirs alone. A wild one doesn't even show itself to a team
//           with something it is afraid of: it can only be spotted at a distance and hunted (hunt)
//   hunts:  a predator's diet, from fossil evidence (bite marks, stomach contents, fossils locked in
//           combat): the body plans (SPECIES build, 'human' for the player) or single species it hunts,
//           'any' for all;
//           preyMax the biggest it takes on (no bigger than itself; a size more for a pack hunter).
//           Compsognathus: a lizard in its stomach. Coelophysis: crocodile-line reptiles and lizards.
//           Dilophosaurus: small ornithischians such as Scutellosaurus (a small armored one), and fish.
//           Velociraptor: Protoceratops (the Fighting Dinosaurs, tooth marks). Baryonyx: fish and a young
//           Iguanodon in its stomach. Spinosaurus: mostly fish. Allosaurus: Stegosaurus (a vertebra
//           pierced by a thagomizer, bitten plates), ornithopods, its own kind (Allosaurus tooth marks
//           on Allosaurus bones, Mygatt-Moore Quarry). Tyrannosaurus: Triceratops (bones
//           covered in bites), hadrosaurs (a healed bite on an Edmontosaurus tail), its own kind. The
//           player is prey to anything big enough: no animal has ever been seen to pass a person by.
//   biped:  walks on two legs, with two arms (otherwise on four legs)
//   hunt:   a carnivore's hunting skill, added to its agility when it hunts what it spotted (HUNT)
//   weapon: what it fights with, as the Dinopedia will say
//   bite:   the hardest one blow can land, however strong it is or whatever it carries. Small
//           animals with little teeth or a beak stay weak even with perfect genes.
//   hide:   armor that takes this much off every blow it takes (after damage reduction).
// So some can never hurt others: a Tyrannosaurus' hide (25) stops any bite up to about 33, which
// is every Compsognathus, Gallimimus, Hypsilophodon, Psittacosaurus and Scelidosaurus; a
// Velociraptor or Coelophysis only scratches it. COMBAT.md lists who can hurt whom.
export const BODY = {
  compy:   { biped: true, weapon: 'Tiny pointed teeth', bite: 30, hide: 0, selfFeed: true, forage: [['insect', 1, 2, 0.5]], hunts: [], preyMax: 'tiny', role: 'noncombatant', hunt: 10, fear: 'tiny' },
  dilo:    { biped: true, weapon: 'Long jaws and clawed hands', bite: 120, hide: 2, grab: true, tough: true, hunts: ['theropod', 'ornithopod', 'ceratopsian', 'armored', 'human'], preyMax: 'medium', role: 'attacker', hunt: 15, fear: 'large' },
  scelido: { weapon: 'Small beak; rows of bony plates', bite: 30, hide: 10, armor: 'light', collar: true, crouch: true, role: 'defender', charge: 0.15, fear: 'huge' },
  psitta:  { biped: true, weapon: 'Parrot-like beak', bite: 30, hide: 3, camo: 'forest', digest: 1.5, crack: true, creche: true, role: 'noncombatant', fear: 'small' },
  coelo:   { biped: true, weapon: 'Slim jaws full of small teeth', bite: 32, hide: 0, fullPack: 0.1, fragile: 0.8, hunts: ['theropod', 'ornithopod', 'ceratopsian', 'human'], preyMax: 'small', role: 'attacker', hunt: 15, fear: 'small' },
  hypsi:   { biped: true, weapon: 'Small beak; it runs rather than fights', bite: 30, hide: 0, zigzag: true, forage: [['leaf', 1, 2], ['herb', 1, 1, 0.25]], eyes: true, role: 'noncombatant', fear: 'small' },
  proto:   { weapon: 'Hooked beak and a bony frill', bite: 50, hide: 6, beak: true, role: 'defender', charge: 0.3, fear: 'large', active: 'both' },
  galli:   { biped: true, weapon: 'Toothless beak and kicks', bite: 20, hide: 2, runner: true, kick: 1.5, role: 'noncombatant', fear: 'medium' },
  hypa:    { weapon: 'Tail and kicks', bite: 50, hide: 6, nurse: true, role: 'noncombatant', fear: 'large' },
  pachy:   { biped: true, weapon: 'Thick bony dome for ramming', bite: 125, hide: 8, dome: true, role: 'defender', charge: 0.35, fear: 'large' },
  raptor:  { biped: true, weapon: 'Sickle claw on each foot', bite: 32, hide: 0, claw: true, hunts: ['ceratopsian', 'ornithopod', 'human'], preyMax: 'medium', role: 'attacker', hunt: 25, fear: 'small', active: 'night' },
  stego:   { weapon: 'Spiked tail (the thagomizer)', bite: 130, hide: 18, spikes: true, guard: true, throat: true, role: 'defender', charge: 0.2, fear: 'huge' },
  bary:    { biped: true, weapon: 'Huge thumb claws and fish-catching jaws', bite: 140, hide: 10, fisher: { water: 1.3, land: 1 }, hook: true, fishing: [2, 4], hunts: ['ornithopod', 'human'], preyMax: 'medium', role: 'attacker', hunt: 5, fear: 'large' },
  para:    { weapon: 'Tail and kicks', bite: 55, hide: 8, alert: true, escape: true, role: 'noncombatant', fear: 'large' },
  trike:   { weapon: 'Three horns and a shield of a frill', bite: 170, hide: 20, frill: true, role: 'defender', charge: 0.35, fear: 'huge' },
  ankylo:  { weapon: 'Bony tail club; armored all over', bite: 160, hide: 35, armor: 'heavy', crouch: true, club: true, role: 'defender', charge: 0.15, fear: 'huge' },
  allo:    { biped: true, weapon: 'Blade-like teeth, slashing bites', bite: 160, hide: 12, rival: true, hunts: ['armored', 'ornithopod', 'pachycephalosaur', 'allo', 'human'], preyMax: 'large', role: 'attacker', hunt: 15, fear: 'huge' },
  spino:   { biped: true, weapon: 'Long jaws and big claws', bite: 180, hide: 18, fisher: { water: 1.5, land: 1, landAgi: 0.6 }, sail: true, hunts: ['ornithopod', 'human'], preyMax: 'medium', role: 'attacker', hunt: 5, fear: 'huge' },
  rex:     { biped: true, weapon: 'The strongest bite of any land animal', bite: 260, hide: 25, crush: 0.3, boneBreaker: true, hunts: ['ceratopsian', 'ornithopod', 'pachycephalosaur', 'theropod', 'human'], preyMax: 'huge', role: 'attacker', hunt: 10, fear: 'huge' },
  argent:  { weapon: 'Its sheer weight: stomps and a heavy tail', bite: 200, hide: 30, giant: true, haul: 2.5, slow: 2, role: 'defender', charge: 0, fear: 'colossal', active: 'both' },
};
// How each role fights:
//   attacker: the hunters. Strikes the foe every turn.
//   defender: plant eaters that protect themselves. The foe goes for it ROLE_TARGET times as often.
//             Each turn it either charges (its charge chance: CHARGE_DAMAGE times its blow, but
//             CHARGE_EXPOSED more damage from the next blow it takes), or holds its ground and
//             strikes back at whatever attacks it.
//   noncombatant: prey animals (as ostriches, horses or zebras today): the urge to run wins out, trained
//             or not, so it never fights. It runs before any fight; with nobody left to fight, the
//             whole team runs (and a predator gives chase, CHASE). A wild one runs from any team: it can
//             only be spotted and hunted. (Its rules for lashing back and openings stay for a cornered
//             one: OPENING.)
// fishers (Baryonyx, Spinosaurus) are attackers at home in the water (BODY fisher).
export const ROLE_TARGET = { attacker: 1, defender: 3, noncombatant: 0.3 };
export const CHARGE_DAMAGE = 2;
export const CHARGE_EXPOSED = 1.25;
export const OPENING = 0.35;
// (fishers: BODY fisher { water, land, landAgi } – their blows times water in the water, times land on
// land; landAgi: on land it keeps only that share of its agility and dodge)
export const WATER_BIOMES = ['swamp', 'floodplain', 'coast'];
// creatures take theirs from their size unless they say otherwise; nearer the nest they are younger,
// with thinner hide (see creatureFighter)
export const BITE = { tiny: 30, small: 120, medium: 160, large: 220, huge: 300, colossal: 300 };
export const HIDE = { tiny: 0, small: 0, medium: 5, large: 12, huge: 25, colossal: 30 };
// Life in the wild (estimates from growth lines: in embryos' teeth for incubation, Erickson et al. 2017,
// Protoceratops 83 days and Hypacrosaurus 171; in bones for growth, a Tyrannosaurus full grown at about
// 20): incubation in days, years to full size. The sanctuary's incubators and growth capsules make
// both PACE times as fast; a year of its age is still a year.
export const LIFE = {
  coelo: [70, 3], raptor: [70, 3], compy: [60, 2], psitta: [75, 9], proto: [83, 8], hypsi: [70, 4],
  scelido: [100, 8], dilo: [100, 8], galli: [100, 7], hypa: [171, 11], pachy: [110, 10],
  stego: [150, 12], bary: [150, 12], para: [170, 10], trike: [180, 16], ankylo: [170, 15],
  allo: [150, 15], spino: [180, 18], rex: [180, 20], argent: [120, 30],
};
export const PACE = 240;
const DAY_MINS = 24 * 60;
export const SPECIES = Object.fromEntries(Object.entries(SPECIES_LIST).map(([k, sp]) => [k, {
  ...sp, mins: Math.round(LIFE[k][0] * DAY_MINS / PACE), size: SIZE[k], ...BODY[k],
}]));
export const ORDER = Object.keys(SPECIES_LIST);
// the first dinosaurs, common in the fossil record and small: two meat eaters and two plant eaters
export const STARTERS = ['coelo', 'raptor', 'psitta', 'proto'];

// What a species is best at outside its stats. Every activity will have species that are good at it
// (fighting, exploring, foraging, hunting and fishing, carrying, nest care, guarding, scouting,
// digging); for now the starters: a fighter and an explorer, a meat eater and a plant eater each,
// for the two activities the game has so far.
export const ROLES = {
  dilo: { role: 'Fighter', text: 'Hits hard rather than takes hits: strong jaws and clawed hands, but a thin hide.' },
  proto: { role: 'Defender', text: 'Never goes looking for a fight, but stands its ground: a tough body, a bony frill and a hooked beak that strikes back and can clamp on. One was found locked in battle with a Velociraptor.' },
  coelo: { role: 'Fighter', text: 'A slim, quick hunter of small prey, found by the hundreds: light on its feet, fragile bones, and better in a pack.' },
  raptor: { role: 'Fighter', text: 'Small and very quick, with a sickle claw on each foot that latches onto prey. One was found locked in battle with a Protoceratops.' },
  compy: { role: 'Explorer', ability: 'scout', text: 'The quickest of them all. Too small to fight big animals (or to ride), but a team it leads sneaks past danger and sniffs out more eggs. It hunts lizards and insects along the way, so it comes home fed.' },
  // foragers: on a journey they find their kind of food (FORAGE), and in camp the whole team eats better
  psitta: { role: 'Forager', text: 'Its parrot beak cracks seeds, and it swallows smooth stones to grind them. A team it walks with finds seeds and gizzard stones more easily, and eats better in camp.' },
  galli: { role: 'Forager', text: 'Eats almost anything and misses nothing on the ground: a team it walks with finds insects, leaves and herbs more easily, and eats better in camp.' },
  hypa: { role: 'Forager', text: 'A browser that reaches high into the trees, knocking down fruit and leaves for the team as it goes. A team it walks with eats better in camp.' },
  hypsi: { role: 'Explorer', ability: 'scout', text: 'Good at a bit of everything. It would rather run than fight, darting in zigzags that bigger animals struggle to follow. A team it leads keeps clear of danger and finds more eggs; it browses on the way and brings plants home, and in a herd its many eyes often spot a predator in time for everyone to scatter.' },
};
// a team with a scout in it: it leads the team around danger and sniffs out eggs. It doesn't make the
// trip any shorter: the player goes along, and a scout is far too small to ride.
export const SCOUT = { encounter: 0.5, egg: 1.5 };

// Body builds: species of one build share equipment art (each sprite still gets its own anchors).
export const BUILDS = { theropod: 'Theropod', ornithopod: 'Ornithopod', pachycephalosaur: 'Pachycephalosaur', ceratopsian: 'Ceratopsian', armored: 'Armored', sauropod: 'Sauropod' };

export const SEX = { m: { word: 'Male', sym: '♂' }, f: { word: 'Female', sym: '♀' } };

// Warming the egg
export const TAP_MS = 1000;   // each tap saves 1 s
export const TAP_CAP = 0.5;   // taps can cut at most half of the hatch time

// Inventory
export const SLOTS = 100;     // hard maximum
export const BASE_SLOTS = 10; // every player starts with one row
export const ROW = 10;
export const MAX_STACK = 99;

export const ITEMS = {
  leaf:         { name: 'Leaf', plural: 'leaves', kg: 1, desc: 'Food for plant eaters: a bundle of leafy branches and fronds, about 1 kg, for a journey.' },
  meat:         { name: 'Meat', plural: 'meat', kg: 1, desc: 'Food for meat eaters: a cut of about 1 kg, for a journey.' },
  insect:       { name: 'Insects', plural: 'insects', food: true, kg: 0.1, desc: 'A crunchy handful, about 100 g. Small hunters and omnivores like them.' },
  fish:         { name: 'Fish', plural: 'fish', food: true, kg: 1, desc: 'Fresh from the swamp, about 1 kg. Fish eaters like Baryonyx and Spinosaurus love it.' },
  raw_egg:      { name: 'Unfertilized egg', plural: 'unfertilized eggs', food: true, kg: 0.5, desc: 'An egg that will never hatch, found only in nests, about 500 g. Omnivores like Gallimimus eat it.' },
  shell:        { name: 'Eggshell', plural: 'eggshells', desc: 'Left over from an egg that hatched in the nest.' },
  golden_shell: { name: 'Golden eggshell', plural: 'golden eggshells', desc: 'A piece of the rare Golden Egg, where the Tyrannosaurus hatches from.' },
  amber:        { name: 'Amber', plural: 'amber', desc: "Fossilized resin from the planet's own ancient forests. Some pieces hold insects millions of years old." },
  // materials brought back from expeditions (for crafting, later)
  feather:      { name: 'Feather', plural: 'feathers', desc: 'Shed by the small feathered dinosaurs of the conifer forests.' },
  clay:         { name: 'Clay', plural: 'clay', desc: 'Soft river clay from the swamps.' },
  bone:         { name: 'Old bone', plural: 'old bones', desc: 'Bones bleached by the sun in the dry lands.' },
  seashell:     { name: 'Seashell', plural: 'seashells', desc: 'A shell from the lagoons, washed up on the beach.' },
  obsidian:     { name: 'Obsidian', plural: 'obsidian', desc: 'Sharp volcanic glass from the slopes of the volcano.' },
  // only from an Allosaurus frenzy (FRENZY_DROPS)
  allo_tooth:   { name: 'Serrated Allosaurus Tooth', plural: 'serrated Allosaurus teeth', desc: 'Lost in a frenzy, when Allosaurus turned on each other. Serrated like a steak knife: they shed and regrew teeth all their lives.' },
  allo_blood:   { name: 'Allosaurus Blood', plural: 'Allosaurus blood', desc: 'Spilled when Allosaurus turned on each other in a frenzy. Used in the Forge for blood transfusions.' },
  transfusion:  { name: 'Blood Transfusion', plural: 'blood transfusions', desc: 'Allosaurus blood and healing herbs. Heals a critically injured dinosaur on the spot.' },
  ration:       { name: 'Trail Ration', plural: 'trail rations', kg: 2, desc: 'Dried meat, nuts and hard bread, wrapped for the road. Your own food on a journey: packed when you set out.' },
  water_skin:   { name: 'Water Flask', plural: 'water flasks', desc: 'A clay flask stoppered with resin. Holds a few drinks for the dry stretches; packed when a team sets out, refilled wherever there is fresh water.' },
  seed:         { name: 'Seeds', plural: 'seeds', kg: 0.2, food: true, desc: 'A handful of cycad and conifer seeds. Plant eaters crack them, and so can you.' },
  fruit:        { name: 'Fruit', plural: 'fruit', kg: 0.5, food: true, desc: 'Fruit from high branches, knocked down by browsers that reach up into the trees. Plant eaters and you can eat it.' },
  stone:        { name: 'Gizzard Stone', plural: 'gizzard stones', desc: 'A smooth, rounded pebble. Plant eaters swallow them to grind tough food in the gizzard: Psittacosaurus skeletons are found with dozens inside.' },
  capsule:      { name: 'Growth Capsule', plural: 'growth capsules', desc: "The sanctuary's growth formula. The keepers give the young ones theirs every day; the Scientists buy any spare." },
  herb:         { name: 'Healing Herb', plural: 'healing herbs', desc: 'Chewing one heals an injured dinosaur 10 minutes sooner.' },

  // Equipment: one per slot on each baby. Bought with coins earned in the game, never with real money.
  // mods use the stat engine's stages: flat, increased (0.10 = +10%), more (1.10 = ×1.10).
  leaf_crown:    { name: 'Leaf Crown', plural: 'leaf crowns', kind: 'gear', slot: 'head', stack: 1, price: 80,
                   desc: 'A ring of fresh fern leaves.', mods: [{ stat: 'vit', type: 'flat', value: 4 }] },
  bone_helmet:   { name: 'Bone Helmet', plural: 'bone helmets', kind: 'gear', slot: 'head', stack: 1, price: 150,
                   desc: 'Hard and a little heavy.', mods: [{ stat: 'str', type: 'flat', value: 5 }, { stat: 'res', type: 'flat', value: 8 }, { stat: 'agi', type: 'increased', value: -0.05 }] },
  spiked_collar: { name: 'Spiked Collar', plural: 'spiked collars', kind: 'gear', slot: 'neck', stack: 1, price: 120,
                   desc: 'Makes every bite count.', mods: [{ stat: 'str', type: 'increased', value: 0.10 }] },
  feather_scarf: { name: 'Feather Scarf', plural: 'feather scarves', kind: 'gear', slot: 'neck', stack: 1, price: 120,
                   desc: 'Light as air, thin as paper.', mods: [{ stat: 'agi', type: 'increased', value: 0.12 }, { stat: 'res', type: 'flat', value: -3 }] },
  leather_vest:  { name: 'Leather Vest', plural: 'leather vests', kind: 'gear', slot: 'body', stack: 1, price: 100,
                   desc: 'Simple, sturdy protection.', mods: [{ stat: 'res', type: 'flat', value: 10 }, { stat: 'vit', type: 'flat', value: 5 }] },
  heavy_armor:   { name: 'Heavy Armor', plural: 'heavy armors', kind: 'gear', slot: 'body', stack: 1, price: 220,
                   desc: 'Very tough, very slow.', mods: [{ stat: 'res', type: 'flat', value: 30 }, { stat: 'agi', type: 'increased', value: -0.25 }] },
  swift_cape:    { name: 'Swift Cape', plural: 'swift capes', kind: 'gear', slot: 'back', stack: 1, price: 160,
                   desc: 'Catches the wind on every step.', mods: [{ stat: 'agi', type: 'increased', value: 0.15 }] },
  turtle_shell:  { name: 'Turtle Shell', plural: 'turtle shells', kind: 'gear', slot: 'back', stack: 1, price: 200,
                   desc: 'Borrowed from an ancient turtle.', mods: [{ stat: 'res', type: 'increased', value: 0.20 }, { stat: 'agi', type: 'increased', value: -0.10 }] },
  // the player's own weapons and armor (kind 'arms', a slot from PLAYER_SLOTS); color tints the drawing
  wooden_club:   { name: 'Wooden Club', plural: 'wooden clubs', kind: 'arms', slot: 'weapon', stack: 1, price: 60, color: '#8a5a32',
                   desc: 'A heavy branch. Better than bare hands.', mods: [{ stat: 'str', type: 'flat', value: 8 }] },
  hide_cap:      { name: 'Hide Cap', plural: 'hide caps', kind: 'arms', slot: 'head', stack: 1, price: 50, color: '#a77b4f',
                   desc: 'Keeps the sun and the small bites off.', mods: [{ stat: 'res', type: 'flat', value: 5 }] },
  hide_tunic:    { name: 'Hide Tunic', plural: 'hide tunics', kind: 'arms', slot: 'body', stack: 1, price: 80, color: '#9c6b3f',
                   desc: 'Tough leather, sewn with sinew.', mods: [{ stat: 'res', type: 'flat', value: 8 }, { stat: 'vit', type: 'flat', value: 4 }] },
  wooden_shield: { name: 'Wooden Shield', plural: 'wooden shields', kind: 'arms', slot: 'shield', stack: 1, price: 70, color: '#9a6a3a',
                   desc: 'Planks lashed together.', mods: [{ stat: 'res', type: 'flat', value: 7 }, { stat: 'agi', type: 'increased', value: -0.04 }] },
  sandals:       { name: 'Sandals', plural: 'sandals', kind: 'arms', slot: 'feet', stack: 1, price: 40, color: '#7a5a3a',
                   desc: 'Light and quiet on the forest floor.', mods: [{ stat: 'agi', type: 'increased', value: 0.06 }] },
  bone_sword:    { name: 'Bone Sword', plural: 'bone swords', kind: 'arms', slot: 'weapon', stack: 1, color: '#efe6cf',
                   desc: 'A long bone ground to an edge.', mods: [{ stat: 'str', type: 'flat', value: 12 }, { stat: 'str', type: 'increased', value: 0.08 }] },
  obsidian_blade:{ name: 'Obsidian Blade', plural: 'obsidian blades', kind: 'arms', slot: 'weapon', stack: 1, color: '#2c2733',
                   desc: 'Volcanic glass, sharper than anything.', mods: [{ stat: 'str', type: 'flat', value: 16 }, { stat: 'str', type: 'increased', value: 0.15 }] },
  bone_shield:   { name: 'Bone Shield', plural: 'bone shields', kind: 'arms', slot: 'shield', stack: 1, color: '#e6dcc0',
                   desc: 'Ribs and hide, light but strong.', mods: [{ stat: 'res', type: 'flat', value: 14 }] },
  clay_armor:    { name: 'Clay Armor', plural: 'clay armors', kind: 'arms', slot: 'body', stack: 1, color: '#b5694a',
                   desc: 'Fired plates over a hide tunic.', mods: [{ stat: 'res', type: 'flat', value: 20 }, { stat: 'vit', type: 'flat', value: 8 }, { stat: 'agi', type: 'increased', value: -0.06 }] },
  feather_boots: { name: 'Feather Boots', plural: 'feather boots', kind: 'arms', slot: 'feet', stack: 1, color: '#6a9fb5',
                   desc: 'Run like a raptor.', mods: [{ stat: 'agi', type: 'increased', value: 0.16 }] },
  obsidian_helm: { name: 'Obsidian Helm', plural: 'obsidian helms', kind: 'arms', slot: 'head', stack: 1, color: '#3a3342',
                   desc: 'Glass-studded and fearsome.', mods: [{ stat: 'res', type: 'flat', value: 10 }, { stat: 'str', type: 'flat', value: 4 }] },

  // forged only (no price): made in the Forge from materials found on expeditions
  obsidian_fang: { name: 'Obsidian Fang', plural: 'obsidian fangs', kind: 'gear', slot: 'neck', stack: 1,
                   desc: 'A shard of volcanic glass on a cord.', mods: [{ stat: 'str', type: 'increased', value: 0.15 }, { stat: 'str', type: 'flat', value: 4 }] },
  feather_cloak: { name: 'Feather Cloak', plural: 'feather cloaks', kind: 'gear', slot: 'back', stack: 1,
                   desc: 'Woven from forest feathers.', mods: [{ stat: 'agi', type: 'increased', value: 0.2 }, { stat: 'res', type: 'flat', value: 3 }] },
  clay_plate:    { name: 'Clay Plate', plural: 'clay plates', kind: 'gear', slot: 'body', stack: 1,
                   desc: 'Fired swamp clay, hard as stone.', mods: [{ stat: 'res', type: 'flat', value: 18 }, { stat: 'vit', type: 'flat', value: 6 }] },
  amber_charm:   { name: 'Amber Charm', plural: 'amber charms', kind: 'gear', slot: 'neck', stack: 1,
                   desc: 'Warm to the touch. A little of everything.', mods: ['str', 'agi', 'vit', 'res'].map(stat => ({ stat, type: 'flat', value: 5 })) },
  golden_crown:  { name: 'Golden Crown', plural: 'golden crowns', kind: 'gear', slot: 'head', stack: 1,
                   desc: 'Made from the shell of a Golden Egg.', mods: [{ stat: 'str', type: 'increased', value: 0.08 }, { stat: 'vit', type: 'increased', value: 0.08 }, { stat: 'res', type: 'more', value: 1.05 }] },
};
// Equipment weight. Every piece weighs something; a dinosaur (or the player) can carry up to its
// capacity: its size's CARRY plus a little for its strength from genes (CARRY_PER_STR per point).
// Nothing past capacity can be worn, and a load over LOAD_FREE of capacity costs agility, up to
// LOAD_AGI_LOSS at a full load: small, quick species are best kept light.
export const CARRY = { tiny: 4, small: 10, medium: 18, large: 30, huge: 45, colossal: 70 };
export const CARRY_PER_STR = 0.1;
export const PLAYER_CARRY = 20;
export const LOAD_FREE = 0.5;
export const LOAD_AGI_LOSS = 0.2;
const WEIGHT = {
  // dinosaur equipment
  leaf_crown: 1, feather_scarf: 1, amber_charm: 1, obsidian_fang: 2, swift_cape: 2, feather_cloak: 2, spiked_collar: 3,
  golden_crown: 4, bone_helmet: 5, leather_vest: 6, clay_plate: 12, turtle_shell: 14, heavy_armor: 20,
  // the player's weapons and armor
  hide_cap: 1, sandals: 1, feather_boots: 1, wooden_club: 4, obsidian_blade: 4, hide_tunic: 4, obsidian_helm: 4,
  bone_sword: 5, wooden_shield: 5, bone_shield: 6, clay_armor: 12,
};
for (const [id, w] of Object.entries(WEIGHT)) ITEMS[id].weight = w;

export const GEAR_SLOTS = [
  { id: 'head', name: 'Head' },
  { id: 'neck', name: 'Neck' },
  { id: 'body', name: 'Body' },
  { id: 'back', name: 'Back' },
];
// Only small accessories are drawn on the baby; body and back pieces give their stats without
// changing how it looks (its look comes from its outfit).
export const DRAWN_SLOTS = ['head', 'neck'];

// Outfits: a whole new look for a baby, drawn as a complete sprite per sex. Cosmetic only: no stats.
// Players keep the outfits they own in a wardrobe; later they come from events, achievements and the
// cosmetic shop. Example:
//   knight_rex: { name: 'Knight', species: 'rex', sprites: { m: 'sprites/outfits/knight_rex-m.png', f: 'sprites/outfits/knight_rex-f.png' } },
export const OUTFITS = {};
export const STARTER = [['leaf', 20], ['meat', 12], ['amber', 1], ['water_skin', 1]];

// Feeding
// How much one eats (food kg: each food item's kg; a trail ration, dried and dense, counts as a day of a
// person's food): a day's food grows with mass^0.75 (Kleiber), plant per kg^0.75 for plant food,
// animal for meat, fish, insects and eggs (richer food; the player too), from today's mammals (an
// elephant's 150 kg of plants, a lion's 7 kg of meat) at 60% (a dinosaur's metabolism between a
// reptile's and a mammal's). A meal in the nest is meal of a day's food (at least one item). On a
// journey days pass for real (CLOCK), and a meal from what the team carries fills one up as far as its
// kilos go. A carcass gives edible of its weight in meat, as
// much as the team can carry: haul of each one's weight (the player playerHaul kg).
export const FOOD = { plant: 0.15, animal: 0.08, meal: 0.25, edible: 0.5, haul: 0.15, playerHaul: 20 };
// what each species eats, favourite first; a meal uses the first of these in the inventory
export const DIET = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, sp.diet]));
// the player's meals (a quarter of a day's food each: FOOD.meal) come from the first of these in the
// inventory; at home the player never goes hungry (only on a journey: SURVIVAL)
export const PLAYER_HUNGER_MIN = 6 * 60;
export const PLAYER_DIET = ['ration', 'fish', 'meat', 'fruit', 'seed', 'raw_egg'];
// Hunger and thirst on a journey (at home the nest's trough, built by the colonists, waters everyone).
// Both go from 0 (fed, watered) to 1, rising with every step of the way (a hex's travel cost): thirst
// and hunger a unit of cost, times dry in the thirstier lands. Fresh water (a river, a lake beside, a
// swamp or a floodplain; not the salt sea) waters everyone and fills the flasks. A plant eater grazes
// graze off its hunger on green land; a meat eater eats its fill of what the team brings down; a fisher
// fishes its fill at fresh water; a small hunter (selfFeed) feeds itself as it goes. Past at, one eats a
// meal of what the team carries (the player its rations first), taking eat off, and drinks from the
// flasks (drinks by size a drink, a flask holding skin), taking drink off. Past weak one is worn (keeps
// worn[0] of its strength and agility), past faint worn[1], and loses drain (by what wears it down most) of
// its health a unit of cost: a dinosaur at the end of it dies, the player collapses. A team packs up to pack of these from
// the inventory when it sets out (what is left comes home). words: what each level is called.
export const SURVIVAL = {
  thirst: 0.19, hunger: 0.025, dry: { desert: 2, volcano: 1.5, scrub: 1.25 },
  green: ['meadow', 'forest', 'scrub', 'floodplain', 'subtropical', 'swamp', 'coast'], graze: 0.04,
  at: 0.5, eat: 0.5, drink: 0.5, weak: 0.35, faint: 0.75, worn: [0.9, 0.75], drain: { thirst: 0.15, hunger: 0.04 },
  drinks: { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, colossal: 4 }, skin: 4,
  pack: { water_skin: 3, ration: 3, herb: 3, transfusion: 1 },
  words: { hunger: [[0.2, 'Fed'], [0.35, 'Peckish'], [0.75, 'Hungry'], [Infinity, 'Starving']], thirst: [[0.2, 'Watered'], [0.35, 'Thirsty'], [0.75, 'Parched'], [Infinity, 'Dehydrated']] },
};

// World map: a hex map around the nest, hidden under fog until expeditions reveal it.
// Each player's map is generated from their own seed. Distance from the nest sets how long a trip
// takes and how much it brings back.
export const WORLD_RADIUS = 7;               // hexes from the nest to the edge
// The world: a supercontinent on a rectangle of hexes (cols x rows, pointy-top), north at the top,
// the nest north rows below the top and west columns from the left. land: the share of it that is
// land; uplands, mountains: the share of the land above those heights (the uplands, higher ground,
// crossed as flat ground, their rise shown by the light); volcanoes: hot spots; rivers:
// springs high in the wet uplands. Near the nest (calm, in hexes) the land is a lowland of ferns.
// scale: how broad the land's shapes are (mountain ranges, wet and dry lands). cities: the other colonists'
// settlements, at least cityFromNest hexes from the nest and citySpacing from each other. floodplain,
// shore: how wide (in hexes) the flat strips along rivers and along the sea are. lakeMax: the most hexes a
// lake filling a pit drowns; greatLake: a hollow inland below the sea this big is a great lake (smaller,
// low ground). MAP_VERSION bumps when the map changes.
// MAP_VERSION: the map a world is played on; a world made for an older one starts over on this one
export const MAP_VERSION = 8;
export const MAP = {
  cols: 300, rows: 200, lat: [55, 20], lonSpan: 49, wilds: 60, north: 55, west: 150, land: 0.58, uplands: 0.16, mountains: 0.07, volcanoes: 10, rivers: 150, lakeMax: 10, greatLake: 8, calm: 3,
  scale: 1.6, cities: 10, cityFromNest: 30, citySpacing: 40, floodplain: 2, shore: 4,
};
// One world for everyone: every player explores the same continent (what each has found is their own)
export const WORLD_SEED = 1802;
// The sanctuary's climate was chosen for being Earth's own: the continent lies where the United States
// would (MAP.lat, north to south), with today's climate. cooling: how much colder the north is than the
// south; fetch: how far upwind (hexes) the sea is looked for, reach: how far the sea's rain gets inland;
// shadow: how far (hexes) a range's rain shadow falls; humid: the extra rain the warm sea brings to the
// subtropics' eastern shores (south of humidTo degrees); subtropical: how hot and wet the land must be
// for Subtropical Forest. northFall: how slowly the land falls away to the north (it runs on into the
// uncharted north, MAP.wilds rows past the map); wilds: how cold for Tundra and Boreal Forest there, and
// its many lakes on cold flat ground.
export const CLIMATE = { cooling: 0.75, base: 0.65, near: 25, fetch: 80, reach: 30, shadow: 15, humid: 0.4, humidTo: 33, gulf: 0.3, blur: 6, lapse: 0.3, desert: { wet: 0.24, heat: 0.5 }, subtropical: { heat: 0.68, wet: 0.42 },
  prairie: 0.4, northFall: 2.2, wilds: { tundra: 0.06, taiga: 0.3, lakes: 0.3, lakeNoise: 0.66 } };
// the other colonists' settlements, named in the order they are placed
export const CITY_NAMES = ['Ambergate', 'Fernhollow', 'Cinderford', 'Stonewater', 'Mossbank', 'Redcliff', 'Thornfield', 'Greywillow', 'Highfen', 'Duskmere', 'Saltmarsh', 'Ironroot'];
// The colonists' maglev: stations at the nest and every city (map.js railsOf), on one ring. A ride is
// safe (on elevated, fenced lines) and feeds and waters everyone aboard; the fare is base coins plus perHex a hex for every place taken
// (seats: a person one, a dinosaur by its size).
export const TRAIN = { fare: { base: 5, perHex: 0.1 }, seats: { tiny: 0.5, small: 1, medium: 1.5, large: 2.5, huge: 4, colossal: 6 } };
// The maglev on a timetable (docs/TRANSPORT.md), worked out from the clock alone: nothing is stored.
// The lines make rings through every station (map.js railsOf); trains run round them both ways, keeping
// their way: each way, one passes each station about every `every` minutes (4 hours of the world),
// standing `stand` minutes there (5 of the world), at `minsPerHex` (about 300 km/h: a 14 km hex in under
// 3 minutes of the world). Trains keep to it only roughly: each comes in up to `late` minutes early or
// late (10 of the world), and stands a little more or less. Its doors close `board` real seconds before
// it leaves: who has boarded by then rides it, the same train for every player; after that, only the next.
export const MAGLEV = { every: worldMins(4), stand: worldMins(5 / 60), minsPerHex: worldMins(14 / 300), late: worldMins(10 / 60), board: 10 };
// Suborbital rockets between any two stations: a launch from each every `every` minutes (an hour of the
// world), the flight `mins` from the nearest to the farthest (by hexes, up to `far`; half an hour to an
// hour of the world); the fare by the party's weight (`base` + `perTonne`), up to `load` kg a flight.
// Babies, colossal and long-necked dinosaurs can't fly (3-5 g up and down, a few minutes weightless);
// those who fly need `rest` minutes on landing (6 hours of the world) before they can set out again.
export const ROCKET = { every: worldMins(1), mins: [worldMins(0.5), worldMins(1)], far: 100, base: 20, perTonne: 15, load: 20000, rest: worldMins(6) };
export const LONG_NECK = ['argent'];
// Land vehicles (docs/VEHICLES.md): bought at a station (the nest or a city's), they carry a team from
// one hex to another, never exploring on the way: the team gets out where it parks, to explore on foot
// or drive on. The player drives. Each has its compartments (as the maglev's: a seat for the player,
// stalls for the smaller dinosaurs, a pen for a large one), a battery for `range` hexes of open land
// (full again at a station, a quarter back for a night's camp beside it), and a price. Who doesn't fit
// stays behind.
export const VEHICLES = {
  rover: { name: 'Rover', price: 400, range: 24, cars: [{ name: 'Cab', kind: 'seat', places: 1 }, { name: 'Back seat', kind: 'small', places: 2 }] },
  hauler: { name: 'Hauler', price: 1500, range: 16, cars: [{ name: 'Cab', kind: 'seat', places: 1 }, { name: 'Stall trailer', kind: 'stall', places: 4 }, { name: 'Pen trailer', kind: 'pen', places: 1 }] },
};
// The colony's science teams, there to study the dinosaurs where they live: from every station a truck
// sets out every `every` minutes (6 hours of the world) for a hex `near` to `radius` hexes off, picked for
// the team (the same for every player), studies there `stay` (12 hours of the world) and drives back.
// The player rides along for free, out or back, with whoever fits its compartments (`cars`); its doors
// close MAGLEV.board seconds before it leaves.
export const SCIENCE = {
  every: worldMins(6), near: 2, radius: 8, stay: worldMins(12),
  cars: [{ name: 'Crew cab', kind: 'seat', places: 1 }, { name: 'Stall trailer', kind: 'stall', places: 4 }, { name: 'Pen trailer', kind: 'pen', places: 1 }],
};
// what fits each kind of compartment, by size (the player only in a seat)
export const COMPARTMENTS = { seat: ['player'], small: ['tiny', 'small'], stall: ['tiny', 'small', 'medium'], pen: ['large', 'huge'], flat: ['colossal'] };
// Driving: hours of the world a hex takes at the wheel (open land about 45 km/h off any road; woods
// and floodplains about 25; a river forded), `day` hours at the wheel a day (the rest resting); a
// hex of rough land uses `rough` hexes of battery. No vehicle crosses swamps, mountains, volcanoes or
// water.
export const DRIVE = {
  hours: { open: 0.3, rough: 0.6, river: 0.3 }, day: 12, rough: 1.5,
  open: ['meadow', 'scrub', 'coast', 'desert'], never: { terrain: ['mountain', 'volcano', 'ocean', 'lake'], biome: ['swamp', 'volcano'] },
  camp: 0.25,
};
export const EXPEDITION_SLOTS = 2;           // expeditions out at the same time
export const TEAM_SLOTS = 5;                 // places in one expedition's team: a dinosaur, the player, or a pack
export const TEAM_PRESETS = 5;               // teams that can be set up ahead in the Team tab

// Packs: species that hunted or lived in groups can be formed into a pack, which takes one place in a
// team however many it holds, up to the species' limit. Each member still fights as itself, with its
// own stats: a pack's turn is all of them striking at once (as many on one foe as can reach it), each
// PACK_BONUS harder for every other one striking with it.
export const PACK_LIMITS = { coelo: 15, raptor: 4, galli: 8, para: 6, hypa: 10, hypsi: 6 };
// species whose groups are herds rather than packs (only the name changes)
export const HERDS = ['para', 'hypa', 'hypsi'];
// a species with fullPack: a pack of it at its limit gives every member this much more of every stat
// (Coelophysis: hundreds were found together at Ghost Ranch)

// Rivals (BODY rival: Allosaurus): every one for itself. With two or more of a rival species in a
// team, each of them may turn on another one when it attacks (RIVAL_CLASH a time). Then all of them
// go into a frenzy for the rest of the fight and hit FRENZY_DAMAGE times as hard, each striking the
// foe or another frenzied one, picked at random. The last one standing stays in its frenzy and
// strikes the foe or anyone left in the team. A frenzy wins less often and hurts more of the team,
// but a won fight that went into one can drop what no other fight gives (FRENZY_DROPS), more of it
// and more often the more Allosaurus took part. High risk, high reward.
export const RIVAL_CLASH = 0.025;
export const FRENZY_DAMAGE = 2;
// each drop for a team with n of them (n ≥ 2): chance(n), and how many (from min(n) to max(n))
export const FRENZY_DROPS = [
  { id: 'allo_tooth', chance: n => Math.min(0.9, 0.2 * (n - 1)), min: () => 1, max: n => n - 1 },
  { id: 'allo_blood', chance: n => Math.min(1, 0.5 * (n - 1)), min: n => n - 1, max: n => 2 * (n - 1) },
];
export const PACK_MIN = 2;
export const PACK_BONUS = 0.05;              // +5% damage for each other member striking with it, +5% dodge for each other one standing
// how many can get at a foe at once, by its size: the rest wait their turn (and step in when one falls)
export const REACH_SLOTS = { tiny: 2, small: 3, medium: 4, large: 6, huge: 8, colossal: 10 };
// Travel: a trip takes mins (real minutes) per unit of the easiest way there (there and back). Each hex
// costs its terrain's or its biome's, whichever is more, plus river to cross one; open water can't be
// crossed. A unit of a way's cost is walk hours on foot (a flat hex, about 14 km, at about 4 km/h); a
// team walks day hours a day and spends the rest eating, drinking and sleeping, so a unit is UNIT_HOURS
// of the world (a flat hex about half a day, a day's march about 2.3 flat hexes): about 12.5 real minutes.
export const CLOCK = { walk: 3.5, day: 8 };
export const UNIT_HOURS = CLOCK.walk * 24 / CLOCK.day;
export const TRAVEL = { mins: worldMins(UNIT_HOURS), terrain: { flat: 1, mountain: 3, volcano: 3 }, biome: { meadow: 1, scrub: 1, desert: 1.5, floodplain: 1.5, coast: 1, forest: 1.5, subtropical: 1.5, swamp: 2, volcano: 1.5 }, river: 1 };
// On the way: each hex crossed (past the nest's calm), a predator living there that would come for the
// team may notice it, share times as likely as meeting it there (a lair's: lair); one at most a trip,
// and the team meets it instead of what waits at the end.
export const INTERCEPT = { share: 0.12, lair: 0.3 };
export const LOOT_PER_HEX = 0.25;            // each hex of distance past the first adds 25% to the loot
// loot: [item, min, max, chance] rolled on every visit (chance defaults to 1)
// What lives in each biome: one of these waits in each hex, picked by its weight (a lair holds a
// stronger one, at home there). species are the game's own (wild, at CREATURE_LEVEL of their base stats; packs of
// pack[0] next to the nest up to pack[1] at the edge); creature is an animal that isn't a dinosaur
// (CREATURES). loot is extra, on top of the hex's, when it is beaten.
export const WILD = {
  // the Fern Meadow: small and middling animals; the Dilophosaurus hunts them (and the small armored
  // Scelidosaurus, as its relative Scutellosaurus was hunted)
  meadow: [
    { species: 'compy', weight: 2, loot: [['meat', 1, 1]] },
    { species: 'psitta', pack: [2, 5], herd: true, weight: 2, loot: [['meat', 1, 2], ['feather', 1, 1, 0.3]] },
    { species: 'galli', pack: [3, 6], herd: true, weight: 1.5, loot: [['meat', 1, 2], ['feather', 1, 2]] },
    { species: 'scelido', weight: 1.5, loot: [['bone', 1, 2], ['meat', 1, 2]] },
    { species: 'dilo', weight: 1, loot: [['meat', 1, 3]] },
  ],
  // the Conifer Forest: Allosaurus and Stegosaurus, raptor and Coelophysis packs after Hypsilophodon
  forest: [
    { species: 'hypsi', pack: [2, 6], herd: true, weight: 2, loot: [['meat', 1, 2]] },
    { species: 'stego', weight: 1.5, loot: [['meat', 2, 4], ['bone', 2, 3]] },
    { species: 'pachy', weight: 1, loot: [['bone', 1, 3], ['meat', 1, 2]] },
    { species: 'raptor', pack: [2, 4], weight: 1.5, loot: [['feather', 2, 3], ['meat', 1, 2]] },
    { species: 'coelo', pack: [3, 8], weight: 1, loot: [['meat', 1, 2], ['feather', 1, 1, 0.5]] },
    { species: 'allo', weight: 1, loot: [['meat', 2, 3], ['bone', 1, 2]] },
  ],
  // the Swamp (hot marshes and mangroves): the Deinosuchus waits, the fishers fish, now and then a
  // hadrosaur herd (they live mostly on the floodplains)
  swamp: [
    { species: 'para', pack: [3, 6], herd: true, weight: 1, loot: [['meat', 2, 4]] },
    { species: 'hypa', pack: [3, 8], herd: true, weight: 1, loot: [['meat', 2, 4]] },
    { creature: 'deinosuchus', weight: 2, loot: [['clay', 2, 3], ['meat', 2, 3]] },
    { species: 'bary', weight: 1, loot: [['fish', 2, 3], ['bone', 1, 2]] },
    { species: 'spino', weight: 0.7, loot: [['fish', 2, 4], ['bone', 1, 2]] },
  ],
  // the Desert Dunes (the Djadokhta of Mongolia): Protoceratops herds and Velociraptor packs (the
  // Fighting Dinosaurs), an armored Pinacosaurus-like Ankylosaurus, small hunters of lizards and insects
  desert: [
    { species: 'proto', pack: [2, 5], herd: true, weight: 2.5, loot: [['bone', 2, 3]] },
    { species: 'raptor', pack: [2, 4], weight: 1.5, loot: [['feather', 2, 3], ['meat', 1, 2]] },
    { species: 'ankylo', weight: 1, loot: [['bone', 2, 4], ['meat', 2, 3]] },
    { species: 'compy', weight: 1, loot: [['meat', 1, 1]] },
  ],
  // the Dry Scrubland: open ground of cycads and low ferns, for runners and grazers; a horned
  // Triceratops now and then, far from its rivers
  scrub: [
    { species: 'galli', pack: [3, 6], herd: true, weight: 2, loot: [['meat', 1, 2], ['feather', 1, 2]] },
    { species: 'psitta', pack: [2, 5], herd: true, weight: 1.5, loot: [['meat', 1, 2], ['feather', 1, 1, 0.3]] },
    { species: 'pachy', weight: 1, loot: [['bone', 1, 3], ['meat', 1, 2]] },
    { species: 'scelido', weight: 1, loot: [['bone', 1, 2], ['meat', 1, 2]] },
    { species: 'dilo', weight: 1, loot: [['meat', 1, 3]] },
    { species: 'trike', weight: 0.4, loot: [['meat', 3, 4], ['bone', 2, 3]] },
  ],
  // the River Floodplain (Hell Creek, Dinosaur Park): hadrosaur herds on the banks, Triceratops and
  // Tyrannosaurus side by side, small dromaeosaurs, and Deinosuchus waiting in the water
  floodplain: [
    { species: 'hypa', pack: [3, 8], herd: true, weight: 2, loot: [['meat', 2, 4]] },
    { species: 'para', pack: [3, 6], herd: true, weight: 1.5, loot: [['meat', 2, 4]] },
    { species: 'trike', weight: 1.2, loot: [['meat', 3, 4], ['bone', 2, 3]] },
    { species: 'pachy', weight: 1, loot: [['bone', 1, 3], ['meat', 1, 2]] },
    { species: 'raptor', pack: [2, 4], weight: 1, loot: [['feather', 2, 3], ['meat', 1, 2]] },
    { creature: 'deinosuchus', weight: 1, loot: [['clay', 2, 3], ['meat', 2, 3]] },
    { species: 'rex', weight: 0.6, loot: [['meat', 2, 4], ['bone', 2, 3]] },
  ],
  // Coast & Lagoons: Compsognathus on the lagoon islands (Solnhofen), the fishers of the deltas (Kem
  // Kem), Deinosuchus in the estuaries, Psittacosaurus herds on the dunes behind the beach
  coast: [
    { species: 'compy', weight: 1.5, loot: [['meat', 1, 1]] },
    { species: 'psitta', pack: [2, 5], herd: true, weight: 1.5, loot: [['meat', 1, 2], ['feather', 1, 1, 0.3]] },
    { species: 'bary', weight: 1.2, loot: [['fish', 2, 3], ['bone', 1, 2]] },
    { creature: 'deinosuchus', weight: 1, loot: [['clay', 2, 3], ['meat', 2, 3]] },
    { species: 'spino', weight: 0.6, loot: [['fish', 2, 4], ['bone', 1, 2]] },
  ],
  // the Subtropical Forest (warm, wet southeastern shores, like the Gulf's): broadleaf trees, palms and
  // replanted cycads; hadrosaur herds browse (as Kritosaurus did in Texas' Aguja), small hunters work
  // the roots, Deinosuchus waits at the flooded edges, and now and then a great hunter passes
  subtropical: [
    { species: 'para', pack: [3, 6], herd: true, weight: 1.5, loot: [['meat', 2, 4]] },
    { species: 'hypa', pack: [3, 8], herd: true, weight: 1.2, loot: [['meat', 2, 4]] },
    { species: 'compy', weight: 1.5, loot: [['meat', 1, 1]] },
    { species: 'coelo', pack: [3, 8], weight: 1.2, loot: [['meat', 1, 2], ['feather', 1, 1, 0.5]] },
    { species: 'raptor', pack: [2, 4], weight: 1.2, loot: [['feather', 2, 3], ['meat', 1, 2]] },
    { creature: 'deinosuchus', weight: 0.8, loot: [['clay', 2, 3], ['meat', 2, 3]] },
    { species: 'allo', weight: 0.5, loot: [['meat', 2, 3], ['bone', 1, 2]] },
  ],
  // the Volcanic Slopes: Tyrannosaurus and Allosaurus; herds of giant sauropods nothing hunts
  volcano: [
    { species: 'argent', pack: [2, 4], herd: true, weight: 1.5, loot: [['meat', 4, 6], ['bone', 3, 5]] },
    { species: 'rex', weight: 1, loot: [['obsidian', 2, 3], ['meat', 2, 3]] },
    { species: 'allo', weight: 1, loot: [['meat', 2, 3], ['bone', 1, 2]] },
  ],
};

// wild: the animals met there (WILD); eggs: the species whose eggs can be found there
// (which of them turn up depends on rarity and distance, see RARITIES)
export const BIOMES = {
  meadow:   { name: 'Fern Meadow', color: '#a8c17c', density: 0.35, wild: WILD.meadow, eggs: ['dilo', 'compy', 'scelido', 'psitta', 'galli'], loot: [['leaf', 2, 4], ['seed', 1, 2, 0.3], ['insect', 1, 2, 0.5], ['herb', 1, 1, 0.35]] },
  forest:   { name: 'Conifer Forest', color: '#5f8f4e', density: 0.5, wild: WILD.forest, eggs: ['coelo', 'hypsi', 'pachy', 'raptor', 'stego', 'allo'], loot: [['leaf', 2, 4], ['seed', 1, 2, 0.2], ['fruit', 1, 2, 0.1], ['feather', 1, 2], ['insect', 1, 3, 0.6], ['amber', 1, 1, 0.15], ['herb', 1, 1, 0.25]] },
  swamp:    { name: 'Swamp', color: '#5e7a55', density: 0.45, wild: WILD.swamp, eggs: ['psitta', 'hypa', 'bary', 'para', 'spino'], loot: [['fish', 1, 3], ['meat', 1, 2], ['clay', 1, 3], ['leaf', 1, 2], ['insect', 1, 2, 0.4], ['herb', 1, 1, 0.2]] },
  desert:   { name: 'Desert Dunes', color: '#e2c78c', density: 0.2, wild: WILD.desert, eggs: ['proto', 'raptor', 'ankylo'], loot: [['bone', 2, 4], ['stone', 1, 2, 0.25], ['insect', 1, 2, 0.4], ['amber', 1, 1, 0.05]] },
  scrub:    { name: 'Dry Scrubland', color: '#bdb27a', density: 0.3, wild: WILD.scrub, eggs: ['galli', 'psitta', 'pachy', 'scelido', 'dilo'], loot: [['leaf', 1, 3], ['seed', 1, 3, 0.35], ['stone', 1, 2, 0.15], ['bone', 1, 2], ['insect', 1, 2, 0.5], ['herb', 1, 1, 0.15]] },
  floodplain: { name: 'River Floodplain', color: '#7fb062', density: 0.55, wild: WILD.floodplain, eggs: ['hypa', 'para', 'trike', 'pachy'], loot: [['fish', 1, 3], ['clay', 1, 2], ['meat', 1, 2], ['leaf', 2, 3], ['fruit', 1, 2, 0.2], ['stone', 1, 2, 0.15], ['herb', 1, 1, 0.4], ['insect', 1, 2, 0.4]] },
  coast:    { name: 'Coast & Lagoons', color: '#d8cfa4', density: 0.35, wild: WILD.coast, eggs: ['compy', 'bary', 'psitta'], loot: [['fish', 2, 4], ['seashell', 1, 3], ['amber', 1, 1, 0.12], ['feather', 1, 1, 0.3]] },
  subtropical: { name: 'Subtropical Forest', color: '#4e8a5c', density: 0.55, ambush: true, wild: WILD.subtropical, eggs: ['compy', 'coelo', 'para', 'hypa', 'raptor', 'allo'], loot: [['amber', 1, 2, 0.4], ['insect', 2, 3], ['leaf', 2, 4], ['fruit', 1, 3, 0.4], ['herb', 1, 2, 0.4], ['feather', 1, 1, 0.3]] },
  volcano:  { name: 'Volcanic Slopes', color: '#8a5a4a', density: 0.45, wild: WILD.volcano, eggs: ['allo', 'rex', 'argent'], loot: [['obsidian', 1, 3], ['bone', 1, 2], ['amber', 1, 1, 0.2]] },
};

// the land of the uncharted north (map.js wildsOf), drawn but not yet part of the sanctuary
export const WILDS_BIOMES = { taiga: { name: 'Boreal Forest', color: '#5d806a' }, tundra: { name: 'Tundra', color: '#bcc0a8' } };

// Wild animals that aren't dinosaurs (fear: the biggest it takes on, as BODY). stats are at full strength; one met d hexes from the nest has
// CREATURE_LEVEL(d) of them (more in a lair). look is the sprite drawn for it until it has its own
// art, recoloured with the CSS filter tint.
export const CREATURES = {
  deinosuchus:  { name: 'Deinosuchus', active: 'both', size: 'huge', fear: 'huge', hunts: 'any', preyMax: 'huge', bite: 220, hide: 10, look: 'rex', tint: 'hue-rotate(80deg) saturate(.5) brightness(.75)', stats: { str: 80, agi: 30, vit: 85, res: 75 } },
};
// (× 1.13 since genes moved to 70–100%: a creature keeps up with a dinosaur of middling genes)
export const CREATURE_LEVEL = d => (0.3 + 0.07 * d) * 1.13;  // 0.42 next to the nest, 0.89 at the edge
export const LAIR_SHARE = 0.12;              // share of hexes 3+ away that are lairs: always a fight, a stronger one
export const LAIR_MIN_DIST = 3;
export const LAIR_LEVEL = 1.25;
export const ENCOUNTER_CHANCE = d => Math.min(0.8, 0.2 + 0.07 * d);
// How old the animal living in a hex is (fixed for the hex): its strength step (as CREATURE_LEVEL takes
// it: young ones, step 3 or less, are a size smaller) and how often. What holds a lair is at its prime and
// stronger still (LAIR_LEVEL). Its loot and the coins and equipment it brings scale with the step.
export const AGES = {
  young: { step: 2, weight: 25, name: 'Young' },
  old:   { step: 4, weight: 15, name: 'Old' },
  adult: { step: 6, weight: 45, name: '' },
  prime: { step: 8, weight: 15, name: 'Prime' },
};
export const LAIR_STEP = 7;
// Wild animals differ: each stat of each one lands within spread of its kind's, at random (the same
// animal every time a hex is met). A pack or herd has an alpha: its strongest, by the average of its
// stats (the player's own packs too).
export const WILD_SPREAD = 0.15;
// eggs are found at this step's genes and chance (no longer by distance: rarer kinds are just rarer)
export const EGG_STEP = 5;
// near the nest (hexes): no predators live there, and no big ones (large or bigger) nearer than far
export const NEST_CALM = 4;
export const NEST_FAR = 10;
// size in a fight: each size step bigger than the target hits this much harder, each step smaller
// this much softer, so a Tyrannosaurus brings down a Compsognathus in a bite or two
export const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge', 'colossal'];
export const SIZE_EDGE = 0.3;
// something smaller is harder to hit: a dodge bonus for each size step the target is smaller than
// its attacker. Dodge never goes past DODGE_MAX against a foe its size, SIZE_DODGE_MAX against a bigger one.
export const SIZE_DODGE = 0.12;
// even between two equally quick fighters a blow misses this often (a glancing blow, a slip, a feint)
export const MISS_FLOOR = 0.1;
export const DODGE_MAX = 0.75;
export const SIZE_DODGE_MAX = 0.85;
// a wound's bleeding follows size too: each size step the attacker is bigger than its target bleeds
// BLEED_BIGGER more (a bite that tears a piece off), each step smaller BLEED_SMALLER less (small cuts
// on a big body; a pack adds them up), never under BLEED_MIN of the wound's bleeding
export const BLEED_BIGGER = 0.3;
export const BLEED_SMALLER = 0.25;
export const BLEED_MIN = 0.25;
// The parts of a body a blow can land on, the same for every animal: abilities (and, later, armor that
// covers parts) all name these. A biped (BODY biped, and the player) has two arms and two legs; anything
// else four legs, front and hind. A tail may come later.
export const ARMS = ['armL', 'armR'];
export const BIPED_LEGS = ['legL', 'legR'];
export const QUAD_LEGS = ['legFL', 'legFR', 'legHL', 'legHR'];
export const PARTS = ['head', 'neck', 'back', 'belly', ...ARMS, ...BIPED_LEGS, ...QUAD_LEGS];
export const isLeg = part => BIPED_LEGS.includes(part) || QUAD_LEGS.includes(part);
export const isArm = part => ARMS.includes(part);
// a blow on the limbs ('limbs' in the lists of where blows land) of a biped finds an arm arm of the
// time (smaller, and held up out of the way), otherwise a leg
export const LIMBS = { arm: 0.3 };
// Armor, blow by blow: every blow on an armored animal lands on a part (parts: 'limbs' a leg, or a biped's
// arm). The armored parts take cut less damage, and a blow on them also hurts the attacker (thorns, of
// the blow's full damage, on the parts in thornsOn). The bare belly takes belly times as much.
//   heavy (Ankylosaurus): the back (bony plates), the head (fused skull plates, even bony eyelids) and the
//     neck (rings of bone); its back's plates hurt.
//   light (Scelidosaurus, an early relative): rows of scutes along the back and over the neck.
// ignores: nothing this size or smaller can hurt an armored one (BODY build armored) at all.
export const ARMOR = {
  ignores: 'small',
  parts: [['back', 0.5], ['belly', 0.05], ['head', 0.15], ['neck', 0.1], ['limbs', 0.2]], belly: 1.5,
  heavy: { armored: ['back', 'head', 'neck'], cut: 0.6, thorns: 0.1, thornsOn: ['back'] },
  light: { armored: ['back', 'neck'], cut: 0.35, thorns: 0.01, thornsOn: ['back', 'neck'] },
};
// An armored one (BODY crouch) facing a bigger predator hunkers down on its turn: legs tucked under, belly
// on the ground, only its armored top showing. Till its next turn its belly and legs can't be hit, and it
// neither strikes back nor charges.
// A wild predator badly hurt (under below of its health) tries to run on its turn: (agility +
// resistance) / (that + base), less the less health it has left. With nobody on the other side to chase
// it (no predator, no player) it always gets away; caught, it loses its turn. One that got away leaves no
// carcass: a win without its loot.
export const FLIGHT = { below: 0.25, base: 100 };
// Hunkering down works because the predator gives up: a wild predator whose every blow of a turn went
// on hunkered-down armor and did less than perTurn of that one's health in all is frustrated; after
// turns such turns in a row it gives up on them and goes for the rest of the group, or, with nobody
// else left, leaves (no carcass, as one that fled). A turn that hurts resets it.
export const GIVE_UP = { perTurn: 0.08, turns: 3 };
// A tail club's counter or charge (a blunt blow) lands damage times as hard and may break the foe's
// shin: lamed, as a Tyrannosaurus' bite lames a leg (its relative Zuul is named crurivastator,
// "destroyer of shins"). The chance: lame, plus up to bonus for its strength against the foe's
// resistance (bonus x str / (str + res)). Anything no bigger than crushes that it lands on dies outright.
export const CLUB = { lame: 0.15, bonus: 0.35, damage: 1.2, crushes: 'small' };
// Dilophosaurus' grasping hands, settled by contests (one value against another: a / (a + b) to win).
// When a blow lands on a foe with no armor on its body, it tries to get hold of it tries of the time. A bigger foe: agility against agility to
// climb on to it. Clinging, nothing can reach it; each of its turns, its strength against the foe's
// agility to hold on and slash (a wound that bleeds bleed of the foe's health a turn for the rest of
// the fight), or it falls off, and agility against agility decides whether it lands on its feet or
// misses its next turn. A foe its size or smaller: agility and strength against agility and strength
// to seize it. A smaller one dies in its grip. One its size it holds unless it wrenches free at once
// (strength against strength); held, every turn it takes a blow and a light slash, and it tries again
// to wrench free each of its own turns. Its slash leaves one bleeding wound on a foe, however long it
// holds on.
export const GRAB = { tries: 0.3, bleed: 0.005 };
// Dilophosaurus is tough (one known skeleton healed from eight injuries): once a fight, a blow that
// would bring it down, from something no bigger than itself, leaves it standing at 1; and its
// injuries heal in heal of the time (not a critical one, which takes as long as anyone's). A wild one
// saved that way tries to run there and then, as a badly hurt predator does (FLIGHT), its 1 health left
// not holding it back.
export const TOUGH = { heal: 0.5 };
// Velociraptor's sickle claw, settled by contests like Dilophosaurus' hands. When a blow lands on a
// foe with no armor on its body, it tries to latch on tries of the time: on a bigger foe it clings to
// it, out of its reach (agility against agility); a foe its size or smaller it pins to the ground,
// where it can neither strike nor dodge (agility and strength against agility and strength).
// Latched, every turn it drives the claw in: a piercing blow (through hide and armor) and a wound that
// bleeds bleed more of the foe's health a turn (up to maxStacks wounds), until the foe shakes it off:
// each of the foe's turns, agility against agility (clinging) or strength against strength (pinned).
export const LATCH = { tries: 0.2, bleed: 0.005, maxStacks: 5 };
// Protoceratops' beak (the "Fighting Dinosaurs" fossil: one locked on a Velociraptor's arm). When it
// strikes back at something no bigger than itself, it may clamp on (agility against agility; nothing
// bigger). Each of its turns the grip crushes the held one for hold of a bite (a blunt blow that can't
// be dodged; small times that on anything smaller). One its size can only strike the head of the one
// holding it; a smaller one can't strike at all. It lets go once it has taken release of its own
// health since it clamped on, from the held one or anyone else.
export const BEAK = { hold: 0.5, small: 1.5, release: 0.2 };
// Stegosaurus' thagomizer (an Allosaurus tail bone was found with a hole a spike fits, and many spikes
// have broken, healed tips). Its counters and charges pierce: they go through pierce of hide and damage
// reduction, leave a wound that bleeds bleed of the health a turn (up to maxBleed wounds), and may
// impale a leg (impale, plus bonus times its strength against the target's resistance), laming it.
// The tail is a slow, wide swing that a quick animal sees coming: against it a target dodges slow times
// its lead in speed more (2 × its share of the two agilities − 1), up to SIZE_DODGE_MAX.
export const SPIKES = { pierce: 0.5, bleed: 0.008, maxBleed: 3, impale: 0.1, bonus: 0.2, slow: 1.1 };
// Its fighting stance, side on with the tail swinging (guard): a blow about to land on it may be turned
// aside, as often as its dodge against that attacker's speed alone (quickDodge in combat.js: only
// MISS_FLOOR against one as quick, all of its dodge against one half as quick), and answered at once
// with the tail, a blow the attacker may still dodge.
// Bony disks covered its throat: a blow on the neck from something smaller does nothing, from one its
// size half (same), from something bigger kills nothing outright and is cut a little (bigger).
export const THROAT = { same: 0.5, bigger: 0.9 };
// Pachycephalosaurus' dome, up to 25 cm of bone (about a fifth of the domes found carry healed combat
// wounds; its rounded shape suits butting an opponent's flank more than head-on clashes). Its charge
// goes for the flank rather than the front: every blow of its lands on the flank (the back back of the
// time, else the belly), and its charge may knock the target down: it loses its next action (strength
// against strength; nothing more than maxStep sizes bigger falls). Blows land all over it (HIT_PARTS),
// and one on the head from anything no bigger than itself does head of its damage.
export const DOME = { back: 0.7, maxStep: 1, head: 0.3 };
// Knocked down (a butt to the flank, a fall), an animal gets straight back up on its own agility alone:
// its agility as a percentage (26 agility, 26% of the time), never more than max; otherwise it loses
// its next action. The slow stay down.
export const RISE = { max: 0.95 };
// A giant sauropod (Argentinosaurus) never starts a fight; it strikes back. Each blow back is a stomp
// (stomp of the time) or a swing of its heavy tail. A stomp comes down right a flat hit[1] of the time
// on something as slow as itself, down to hit[0] on something twice as quick or more; then the target
// still gets its dodge. One that lands crushes anything short of colossal outright. The tail is slow, dodged slow times the target's lead in
// speed more (as a spiked tail), and lands tail times as hard, on that one target alone. Nothing
// smaller can reach its neck, break its legs, or knock it down. Against anything tinyStep or more sizes
// smaller (small and tiny ones) its blows hardly find their target: dodged up to tinyDodge.
// Parasaurolophus' crest, a hollow tube that made deep calls carry far: when its group meets a predator
// (an attacker) it may warn them. One alone notices chance of the time, each more of them in the team
// perEye more (many eyes), up to always. The whole group is then readied (every stat bonus higher for
// the fight, perCall more for each more of them: louder calls) and strikes first, every unit of it
// before the predator.
export const ALERT = { chance: 0.6, perEye: 0.08, bonus: 0.05, perCall: 0.01, maxBonus: 0.1 };
// Hadrosaurs turn up with healed tyrannosaur bites on their tails: they got away. A blow that would bring
// one down may instead see it break away and run, its agility as a percentage of the time (never more
// than max), unless it is pinned or held: it leaves the fight and comes home hurt, not critically. Its
// whole herd runs with it.
export const ESCAPE = { max: 0.95 };
// Hypacrosaurus nested in colonies (eggs, embryos and hatchlings were found together) and grew up fast.
// With an adult one in the nest when an egg goes into the incubator, the egg hatches hatch faster. Every
// Hypacrosaurus in the nest (not out exploring) when a baby hatches gives it perOne more of every stat
// for life, up to max.
// How much a team stands out: every member adds its size's share (a camouflaged one in its own biome
// nothing). A predator's chance to notice the team is its usual chance times that total over base
// (a player and a medium dinosaur: as usual), between min and max times. Lairs are always met.
// Day and night (sun.js): a wild animal asleep (SPECIES and CREATURES active: by day unless 'night' or
// 'both') is met asleep times as often; a night hunter about at night prowl times as often; in the dark
// a team stands out unseen times as much to anything but a night animal. In the twilight all are about.
export const NIGHT = { asleep: 0.35, prowl: 1.5, unseen: 0.6 };
export const VISIBILITY = { size: { tiny: 0.3, small: 0.6, medium: 1, large: 1.6, huge: 2.5, colossal: 4 }, base: 1.6, min: 0.25, max: 2 };
// Psittacosaurus was countershaded, dark above and pale below, for the soft light under a forest
// canopy: there it doesn't add to how much its team stands out, and a predator goes for it target
// times as often.
export const CAMO = { target: 0.4 };
// In a thick forest (a biome with ambush) a predator gets close unseen: those who watch for it (RUNNER,
// EYES) see it in time spot times as often, and one that gives chase starts with lead instead of
// CHASE.lead.
export const AMBUSH = { spot: 0.5, lead: 1.25 };
// The land's own dangers on a journey, by biome: each hex crossed (past the calm around a settlement)
// may bring one, chance of the time, at most HAZARD_MAX on one leg. delay: minutes lost (rolled in
// that range), added to the leg when it sets out; wound: someone worn down, losing HAZARD_WOUND of
// their health (never below HAZARD_FLOOR: the land wears a team down, it doesn't kill): 'any' one of
// the team, 'heavy' a large one or bigger (a leg wrenched in a bog), 'cold' a small dinosaur (small
// bodies lose their warmth fastest); river: only where a river runs; cold: only where the land is
// colder than this (the north's winters); lava: this many times as likely on a lava flow.
// (delay: the hours of the world it costs, from the first to the second)
export const HAZARDS = {
  desert: [{ kind: 'sandstorm', chance: 0.03, delay: [6, 16] }, { kind: 'heat', chance: 0.03, wound: 'any' }],
  volcano: [{ kind: 'fumes', chance: 0.05, wound: 'any', lava: 2 }],
  floodplain: [{ kind: 'flood', chance: 0.15, delay: [4, 12], river: true }],
  swamp: [{ kind: 'bog', chance: 0.03, delay: [4, 10], wound: 'heavy' }],
  forest: [{ kind: 'cold', chance: 0.025, wound: 'cold', cold: 0.35 }],
  subtropical: [{ kind: 'lost', chance: 0.04, delay: [6, 14] }],
};
export const HAZARD_MAX = 2;
// Making camp: a team waiting out in the wild settles down for the night, mins minutes (8 hours of the
// world), to look for water and food
// and to rest. Fresh water at the hex or beside it is found for sure; otherwise water of the time by the
// land (a spring, rain caught in hollows, a soak dug in a dry bed). Plant eaters graze their fill on green
// land; meat eaters catch small game hunt × the land's density of the time; the player forages (roots,
// berries, eggs, small game) forage of the time by the land; fishers fish at fresh water. Everyone on
// their feet gets back rest of their health. Without water found, the camp costs thirst (and hunger)
// as much as this many units of travel.
export const CAMP = {
  mins: worldMins(8), rest: 0.15, cost: 1, hunt: 1.4,
  water: { meadow: 0.6, forest: 0.7, subtropical: 0.85, swamp: 1, floodplain: 1, coast: 0.5, scrub: 0.35, desert: 0.1, volcano: 0.15 },
  forage: { meadow: 0.6, forest: 0.6, subtropical: 0.7, swamp: 0.5, floodplain: 0.7, coast: 0.6, scrub: 0.4, desert: 0.15, volcano: 0.1 },
};
// Foraging on the way: each hex walked (past the calm around a settlement) the team may find a handful
// (min to max) of each of these, way[item][land] of the time ('river': where a river runs). A forager
// along (ROLES) finds its own kinds (by) more times as often, nests too, once there are nests to find
// (and where a kind is found every time, more times as much); in camp the whole team finds food
// camp.food and water camp.water times as often (CAMP). common: kinds found so often they are only
// told once a leg ends, as a tally ('gathered').
export const FORAGE = {
  way: {
    seed: { meadow: 0.06, scrub: 0.07, forest: 0.04, floodplain: 0.04, coast: 0.02, subtropical: 0.04 },
    stone: { river: 0.08, scrub: 0.03, desert: 0.04, volcano: 0.03 },
    leaf: { meadow: 1, forest: 1, subtropical: 1, floodplain: 1, swamp: 1, scrub: 0.5, coast: 0.3 },
    fruit: { subtropical: 0.06, forest: 0.03, floodplain: 0.04, meadow: 0.015 },
    insect: { meadow: 0.04, forest: 0.05, subtropical: 0.07, floodplain: 0.04, swamp: 0.05, scrub: 0.03, desert: 0.015 },
    herb: { meadow: 0.02, forest: 0.02, subtropical: 0.03, floodplain: 0.03 },
  },
  min: 1, max: 2, more: 2, common: ['leaf'],
  by: { psitta: ['seed', 'stone'], galli: ['insect', 'leaf', 'herb', 'nest'], hypa: ['leaf', 'fruit'] },
  camp: { food: 1.5, water: 1.3 },
};

// Nests: how eggs are found, as an event on a journey (on foot, past the calm around a settlement).
// Each hex walked, a nest may be noticed there: the chance that a nest of any of the kinds nesting in that
// land is, find[kind] each (twice as often with a Gallimimus along: FORAGE.by; half as often again with a
// scout), and at most one nest in every gap hexes of a journey. Which species it is: each nesting there
// weighs how easily its kind of nest is noticed (sees), how rare it is (rarity) and how much that land is
// its home (where[land], against its best land); a legendary is never more than legendary of them.
// What the team finds depends on how the species nests (kind):
//   buried: eggs buried and left (titanosaurs, like sea turtles): rarely noticed, always alone
//   watched: eggs buried, a parent nearby watched of the time (else alone)
//   colony: a nesting colony (hadrosaurs): adults always about, colony adults defend it together
//   brooded: a parent sits on the eggs; the nest is empty empty.brooded of the time (gone to feed),
//     else the parent has seen the team at once (seen × how much the team stands out: VISIBILITY) and
//     warns it off, or hasn't
//   guarded: a big predator stays close: empty empty.guarded of the time, else as brooded
//   creche: a parent always with its young
// Each nest holds a clutch of its species (clutch: how many eggs, the fewest and the most; theropods laid
// them in pairs, one from each oviduct, so theirs is even), fertile of them fertile: a parent can't tell
// one that will never hatch, and broods and defends the whole clutch. hatched of the nests found have
// already hatched: the young gone, only the eggs that never hatched left, free to take.
// Taking eggs from a nest left alone takes a while (cost: hunger and thirst as that many units of
// travel; a hot-spring nest's fumes may wear someone down, fumes of the time), and with time the team
// holds each egg to the light (candling): the fertile ones are taken, those that won't hatch only if the
// player wants them, as food. From an empty one, an egg can be snatched unseen and the team gone, or
// held to the light one by one, the parent coming back candle[kind][0] of the time at the first and
// candle[kind][1] more at each one after (a big predator is quicker back). One with a parent on it unseen can be crept up on (seen again as
// above) or lured away by one of the team that would run from the parent (its fear, BODY) as bait (its
// agility against the parent's; caught, it is killed): one egg grabbed, unseen. Waiting for it to leave
// is no use: it smells the team. Whose a nest with no parent about is, and whose an egg is, the player
// only knows for a species they have hatched (the starters known from the start). Taking it by force is a fight with a parent
// (a prime adult, or colony adults) that never runs: won, the nest is the team's to look over, but at a
// colony the other adults close in, so one egg is grabbed, unseen. An egg taken unseen shows what it is
// once home. A team carries carry eggs at most.
export const NEST = {
  find: { buried: 0.005, watched: 0.012, colony: 0.012, brooded: 0.01, guarded: 0.006, creche: 0.008 },
  kind: {
    argent: 'buried', proto: 'watched', trike: 'watched', ankylo: 'watched', stego: 'watched', pachy: 'watched', scelido: 'watched',
    hypa: 'colony', para: 'colony', raptor: 'brooded', galli: 'brooded', compy: 'brooded', coelo: 'brooded', dilo: 'brooded',
    rex: 'guarded', allo: 'guarded', spino: 'guarded', bary: 'guarded', psitta: 'creche', hypsi: 'creche',
  },
  where: {
    meadow: { hypa: 3, psitta: 3, para: 2, hypsi: 2, pachy: 1 },
    forest: { hypsi: 3, pachy: 2, scelido: 2, psitta: 1.5, stego: 1, allo: 0.5 },
    subtropical: { hypsi: 2, compy: 2, allo: 0.4 },
    scrub: { galli: 3, dilo: 2, coelo: 2, stego: 1, raptor: 1, ankylo: 0.6, trike: 0.6 },
    desert: { proto: 5, raptor: 1.5, ankylo: 1 },
    floodplain: { hypa: 3, para: 2, trike: 1.5, galli: 1.5, coelo: 1, bary: 1, rex: 0.4, argent: 0.4 },
    swamp: { bary: 2, spino: 0.5 },
    coast: { compy: 2, scelido: 1, spino: 0.4 },
    volcano: { argent: 1 },
  },
  clutch: {
    argent: [15, 40], proto: [12, 20], hypa: [15, 25], para: [20, 30], hypsi: [10, 20], psitta: [8, 16],
    rex: [16, 30], allo: [16, 24], spino: [10, 20], bary: [10, 20], raptor: [10, 20], galli: [10, 20],
    dilo: [10, 20], coelo: [10, 20], compy: [6, 12], trike: [10, 20], ankylo: [10, 20], stego: [10, 20],
    pachy: [6, 15], scelido: [6, 15],
  },
  fertile: 0.9, hatched: 0.2,
  watched: 0.75, empty: { brooded: 0.15, guarded: 0.07 }, seen: 0.35, candle: { brooded: [0.1, 0.1], guarded: [0.15, 0.15] },
  cost: 1, colony: [3, 4], fumes: 0.35, carry: 3, gap: 10,
  sees: { colony: 0.04, creche: 0.02, watched: 0.015, brooded: 0.015, guarded: 0.01, buried: 0.005 },
  rarity: { Starter: 1, Common: 1, Uncommon: 0.75, Rare: 0.5, Epic: 0.3, Legendary: 0.15 }, legendary: 0.02,
};

// Dinosaurs never set out on a journey without the player: every team has the player in it
export const EXPEDITION = { needsPlayer: true };

// waypoints a route may be traced through, at most
export const VIA_MAX = 20;
export const HAZARD_WOUND = [0.2, 0.35];
export const HAZARD_FLOOR = 0.15;
// Its strong beak cracked seeds and nuts: striking back at something no bigger than itself, a blow
// that lands may break a limb chance of the time.
export const CRACK = { chance: 0.2 };
// A group of 34 young Psittacosaurus was found together with an older one: a creche. A baby that
// hatches with an adult Psittacosaurus in the nest (not out exploring) grows a strong stomach: it gets
// hungry stomach times more slowly, for life.
export const CRECHE = { stomach: 1.25 };
// Gallimimus: long legs (an ostrich of 450 kg) and wide-set eyes. An expedition of nothing but
// Gallimimus takes trip of the time. When a predator would fall on a team, each Gallimimus in it may
// see it first (eye of the time, each on its own): then the team runs instead of fighting, keeping
// what the hex gave. The predator may still catch one of them: its agility against twice the slowest
// one's; the one caught comes home critically injured.
export const RUNNER = { trip: 0.5, eye: 0.25 };
// Baryonyx' huge thumb claw, a gaff for fish: a blow that lands may hook (chance of the time): it goes
// through pierce of hide and damage reduction and leaves a wound that bleeds bleed of the health a turn
// (up to maxBleed wounds).
// a sail (Spinosaurus) against a wild predator as big as its owner: the rival sizes it up and may back
// off, likelier in the water (where its owner is at home) and the stronger its owner is next to it
// (power ratio, clamped); what holds a lair defends its ground and never backs off
export const SAIL = { land: 0.35, water: 0.55, ratio: [0.5, 1.5], max: 0.85 };
// zigzag running (Hypsilophodon): this much more dodge a size step the attacker is bigger (within the
// usual cap), and a hunter needs this much more to run one down
export const ZIGZAG = { perStep: 0.06, hunt: 1.3, flee: 1.5 };
// a predator everyone ran from gives chase to the slowest: it runs it down hunter agility /
// (hunter agility + lead × its agility) of the time (a zigzag runner counts ZIGZAG.flee as quick),
// and the one caught may not survive (DEATH.caught). It doesn't bother with prey more than
// maxSteps sizes smaller than itself (a Tyrannosaurus won't run after a Compsognathus).
export const CHASE = { lead: 2, maxSteps: 3 };
// many eyes (Hypsilophodon): each one in a team sees a predator first this often (up to max); the
// group scatters in zigzags and nobody is caught
export const EYES = { perOne: 0.05, max: 0.3 };
// Wild against wild: now and then (chance at a journey's end, way at each hex on the way) a second animal of the hex's biome turns up beside
// the one that lives there, and the team watches from a distance instead of meeting either. If one of
// them hunts the other (BODY hunts) it goes for it, and the team may step in with one of its hunters:
// run the prey down (the hunter may come for the kill; missed, it may turn on the team) or go after the
// hunter (the prey runs; one that fears the team's hunter runs too, and is chased, otherwise a fight).
export const WITNESS = { chance: 0.15, way: 0.03 };
export const HOOK = { chance: 0.3, pierce: 0.5, bleed: 0.006, maxBleed: 3 };
// Death. A dinosaur (never the player) killed outright in a fight (swallowed in one bite, a bitten
// neck, crushed by a club or a stomp, killed in a grip) is dead. One brought down by blows survives,
// critically injured, resistance / (resistance + resBase) of the time (between min and max), and dies
// otherwise. A runner caught in the escape dies as often as caught says by how much bigger the predator
// is ([size steps or more, chance]). The dead are gone from the nest; what they wore comes back.
export const DEATH = { resBase: 30, min: 0.3, max: 0.95, caught: [[2, 0.85], [1, 0.65], [-Infinity, 0.25]] };
export const NURSE = { hatch: 0.25, perOne: 0.01, max: 0.1 };
export const GIANT = { stomp: 0.5, hit: [0.05, 0.1], tail: 3, slow: 1.1, tinyStep: 3, tinyDodge: 0.95 };
// Four feet on the ground and a low body: in a contest to knock it down, an animal that isn't a biped
// stands with its strength times stable.
export const STANCE = { stable: 4 };
// where a blow lands on an animal when it matters and nothing else decided it
export const HIT_PARTS = [['head', 0.15], ['neck', 0.1], ['back', 0.4], ['belly', 0.1], ['limbs', 0.25]];
// it drives the claw in from below, so a share of its blows land on the neck, through any armor.
// The claw was made to grip and pin prey no bigger than itself: on those a blow can land up to bite
// (its own bite stays the limit on anything bigger, where the claw only cuts shallow)
export const CLAW = { neck: 0.3, bite: 70 };
// Triceratops' frill, solid bone, has its own health (hp points). Facing its foe, a blow lands on its
// head head of the time (headPack against a pack, which gets at it from the sides). While the frill
// holds, a blow on the head does the dinosaur no harm: it costs the frill a point (crushed points for a
// crushing bite) and the Triceratops gores back with its horns, leaving the foe bleeding bleed of its
// health a turn per wound, up to maxBleed wounds, for the rest of the fight. A broken frill (0) lets
// half a head blow through. The frill does not grow back by itself: a Healing Herb mends a point.
export const FRILL = { hp: 5, head: 0.35, headPack: 0.2, crushed: 2, broken: 0.75, bleed: 0.007, maxBleed: 5 };
// Where a bone-breaking bite lands (Tyrannosaurus: it crushed and swallowed bone). A leg may be
// lamed: half its dodge and agility for the rest of the fight, and it comes home injured. An arm may be
// broken (the same chance): it can't grab with that hand any more, and it comes home injured. A neck kills
// outright, if the target is no bigger than neckMax: bigger necks are too thick to close the jaws on.
// Anything no bigger than oneBite (up to about 100 kg) dies from any bite that lands.
export const BONE_BREAKER = { parts: [['back', 0.45], ['belly', 0.2], ['neck', 0.08], ['limbs', 0.27]], lame: 0.35, lameCut: 0.5, neckMax: 'large', oneBite: 'small' };
// Body mass (kg) of a grown animal, from fossil estimates, and the player's. Health and the bite grow
// with it (MASS).
export const KG = {
  compy: 3, raptor: 15, coelo: 20, hypsi: 20, psitta: 25, proto: 150, scelido: 270, dilo: 350, galli: 440, pachy: 450,
  bary: 1700, allo: 2000, para: 2600, hypa: 4000, stego: 4500, ankylo: 6000, spino: 7500, rex: 8000, trike: 8000, argent: 60000,
  deinosuchus: 3500,
};
export const PLAYER_KG = 75;
// Health grows with the body: the health its vitality gives, × (mass / ref)^hp (a 350 kg body as it
// is; strength and toughness grow slower than weight). The bite grows with the skull: a young one's is
// the grown one's × (its mass / the grown mass)^bite (a 13-year-old Tyrannosaurus bit with about a
// sixth of an adult's force). A growing one weighs stage of a grown one (babies, juveniles); a wild
// young one, near the nest, weighs young. A predator's bite that lands on something oneBite of its
// weight or less kills it outright, whatever its health (a 175 kg young Dilophosaurus on a 20 kg
// Coelophysis; not a 2 t Allosaurus on a 350 kg Dilophosaurus).
export const MASS = { ref: 350, hp: 0.6, bite: 2 / 3, stage: { baby: 0.1, juvenile: 0.5, adult: 1 }, young: 0.5, oneBite: 0.12 };
export const PLAYER_SIZE = 'small';            // a person, 70–80 kg
// a fight has no turn limit: it goes on until one side is down. This only stops a fight that can't
// end because of a bug (no real fight comes near it); it then counts as lost.
export const FIGHT_SAFETY = 10000;
// a pack or herd's morale: once it has lost this share of its members (one of two, two of three, half
// of a bigger one), the rest run off and the fight is over for them. A predator pack's alpha down is
// one loss like any other; a herd whose alpha is down breaks up and runs (as an elephant herd that
// loses its matriarch)
export const ROUT = 0.5;
// Hunting what keeps away from the team: the team's best hunter (a carnivore with BODY hunt, no
// smaller than its prey) against the prey's agility: (agility + hunt) / (that + the prey's agility),
// PACK_BONUS more for each other member of a pack hunting with it. A catch brings home what beating
// one in a fight would. A team keeps at most HUNT_SIGHTINGS waiting to be decided.
export const HUNT_SIGHTINGS = 5;
export const GEAR_DROP = (d, lair) => lair ? 0.3 : 0.04 + 0.01 * d;
export const INJURY_MINS = 20;               // after losing a fight
export const BRUISE_MINS = 10;               // a win that left it under half health: up to this many minutes
export const HEAL_MINS = 10;                 // each Healing Herb heals this much sooner
// a dinosaur brought down in a fight is critically injured: much longer, and herbs don't help it.
// A Blood Transfusion (forged from Allosaurus blood) heals it on the spot. Not for the player.
export const CRITICAL_MINS = 60;

// Eggs: a trip that comes home (no fight, or a won fight) may find an egg of one of the biome's
// species. It goes to the egg tray; its genes are better the farther from the nest, best in a lair.
export const EGG_CHANCE = (d, lair) => lair ? 0.35 : 0.1 + 0.02 * d;
export const EGG_GENES = (d, lair) => {      // [min, max] genes
  const lo = 10 + d * 4 + (lair ? 10 : 0);
  return [Math.min(75, lo), Math.min(95, lo + 35)];
};

// Event codes, given out for events and promotions: each redeemed once per game for its reward
// (egg: an egg of that species, as one found in a nest). Only each code's SHA-256 is kept here (of
// 'cretaceous-nest:' and the code in capitals, spaces and hyphens left out), so the codes can't be read from the
// game's own files. until: the last moment it can be redeemed (ms), or none.
export const PROMO_SALT = 'cretaceous-nest:';
export const PROMO_CODES = {
  // (off: no longer redeemed)
  'rex-egg': { hash: 'a90ac73eab92cfb63aa2365772291af3071d523f428a357294f104f7695b0696', reward: { egg: 'rex' }, off: true },
  // for testing: an adult Tyrannosaurus straight in the nest
  'rex-adult': { hash: '36a20069a587270c258c1715ee6bf9fa23b2e9756645211e61c6f0734503090b', reward: { dino: 'rex', stage: 'adult' } },
};

// The Forge: equipment made from materials. needs: { item: count }.
export const RECIPES = [
  { id: 'water_skin', needs: { clay: 4, amber: 1 } },
  { id: 'bone_sword', needs: { bone: 8, feather: 2 } },
  { id: 'bone_shield', needs: { bone: 6, clay: 2 } },
  { id: 'clay_armor', needs: { clay: 10, bone: 3 } },
  { id: 'feather_boots', needs: { feather: 8, clay: 1 } },
  { id: 'obsidian_helm', needs: { obsidian: 5, bone: 2 } },
  { id: 'obsidian_blade', needs: { obsidian: 8, bone: 4, amber: 1 } },
  { id: 'bone_helmet', needs: { bone: 6, shell: 2 } },
  { id: 'clay_plate', needs: { clay: 8, bone: 2 } },
  { id: 'feather_cloak', needs: { feather: 10, clay: 2 } },
  { id: 'obsidian_fang', needs: { obsidian: 6, bone: 3 } },
  { id: 'amber_charm', needs: { amber: 3, shell: 3 } },
  { id: 'golden_crown', needs: { golden_shell: 3, amber: 2, obsidian: 2 } },
  { id: 'transfusion', needs: { allo_blood: 2, herb: 2 } },
];

// The player's explorer: explores alone like a dinosaur (any distance), eats before setting out, can be
// injured, and wears its own weapons and armor.
export const PLAYER_ID = 'player';
export const PLAYER_BASE = { str: 40, agi: 45, vit: 45, res: 35 };   // 165
// How the player's explorer looks, chosen when the game begins (and changed later): a body (sprites/
// player/<sex>-<build>[-<tone>].webp, scripts/bodies.py) in the skin tone chosen, each painted. A build gives a little of
// one stat for a little of another (as gear's 'increased' bonuses).
export const LOOK = {
  sexes: { male: 'Man', female: 'Woman' },
  builds: {
    average: { name: 'Average', mods: [] },
    slim: { name: 'Slim', mods: [{ stat: 'agi', type: 'increased', value: 0.08 }, { stat: 'str', type: 'increased', value: -0.04 }] },
    muscular: { name: 'Muscular', mods: [{ stat: 'str', type: 'increased', value: 0.08 }, { stat: 'agi', type: 'increased', value: -0.04 }] },
    heavy: { name: 'Heavy', mods: [{ stat: 'res', type: 'increased', value: 0.08 }, { stat: 'agi', type: 'increased', value: -0.04 }] },
  },
  // (each tone painted on every body, sprites/player/<sex>-<build>-<tone>.webp; light: no suffix)
  skins: { light: '#f1c1a4', tan: '#e0996f', medium: '#c17b59', brown: '#9a5d46', dark: '#704137' },
  // (the bodies drawn so far: one not drawn yet borrows these)
  drawn: { male: true, female: true },
  // (the skin tones painted so far for each: the others shown in the light one until they are)
  toned: { male: [], female: [] },
};
export const DEFAULT_LOOK = { sex: 'male', build: 'average', skin: 'light' };
export const PLAYER_SLOTS = [
  { id: 'weapon', name: 'Weapon' },
  { id: 'shield', name: 'Shield' },
  { id: 'head', name: 'Head' },
  { id: 'body', name: 'Body' },
  { id: 'feet', name: 'Feet' },
];

// The guide: Professor Ivy Fern pops up to teach the game, one tip at a time, in this order. Each tip
// is shown once per account (s.tutorial.seen).
//   pages: what she says, one bubble each; a page can be { text, focus } to single out some parts of
//          the lit-up area (a CSS selector) while the rest of it dims   done: the last button's label
//   tab: the tab opened while she talks        side: 'left' puts her on the left of the screen
//   spot: a part of the page lit up above the faded game while she talks about it
//   next: the tip that follows straight after this one
export const GUIDE = {
  welcome: {
    pages: [
      "Oh, hello! I'm Professor Ivy Fern. I study the dinosaurs of the Cretaceous, and you've just arrived at your very own nest.",
      "Here you'll hatch dinosaurs, raise them, and explore the wild land around us. But every keeper starts the same way: with one baby to look after.",
    ],
    done: 'Show me!',
    next: 'starters',
  },
  starters: {
    tab: 'incubator', side: 'left', spot: '#stage',
    pages: [
      'Here they are: the four little dinosaurs every new keeper can start with. Two of them are fighters and two are explorers, and in each pair one eats meat and the other eats plants.',
      { focus: '[data-type="dilo"], [data-type="proto"]',
        text: "These two are fighters, the ones to have beside you when something wild jumps out of the ferns. Dilophosaurus hits hard but can't take much in return; Protoceratops is the other way round, tough as an old log. It eats plants, but don't let that fool you: we found one locked in battle with a Velociraptor!" },
      { focus: '[data-type="compy"], [data-type="hypsi"]',
        text: "And these two are explorers. They're too small to fight anything big, but with one in your team you slip past danger and find more eggs. Compsognathus is the quickest of them all; Hypsilophodon is good at a bit of everything." },
      "Whichever you choose, the world out there is wild and hostile, and nobody should face it alone. Later you'll find eggs of many more species, each good at something of its own.",
    ],
    done: "I'll choose!",
  },
};

// Growth: at home the keepers feed everyone; what makes a young one grow is a growth capsule, each
// one working for a day of the world (every, in real hours), and nothing grows without one.
// A stage begins at share of the growing (LIFE, at PACE). Only adults wear equipment. scale draws
// juveniles (and adults without an adult sprite yet) larger than babies.
export const STAGES = [
  { id: 'baby', name: 'Baby', share: 0, scale: 1 },
  { id: 'juvenile', name: 'Juvenile', share: 0.2, scale: 1.25 },
  { id: 'adult', name: 'Adult', share: 1, scale: 1.5 },
];
// every: real hours a capsule works for, a day of the world each (WORLD); grows: the hours of a
// species' growing (LIFE, at PACE) each stands for, which sets how many each species takes
// since: when the keepers began giving them (before, the player did): nothing grows for days before it
export const CAPSULE = { item: 'capsule', every: { baby: worldMins(24) / 60, juvenile: worldMins(24) / 60 }, grows: { baby: 4, juvenile: 6 }, since: Date.UTC(2026, 9, 25, 18) };
// the growth capsules each species takes to reach each stage
export const CAPSULES = Object.fromEntries(Object.keys(SPECIES_LIST).map(k => {
  const hours = LIFE[k][1] * 365 * 24 / PACE, juvenile = Math.ceil(hours * STAGES[1].share / CAPSULE.grows.baby);
  return [k, { baby: 0, juvenile, adult: juvenile + Math.ceil(hours * (1 - STAGES[1].share) / CAPSULE.grows.juvenile) }];
}));

// Rewards and prices (coins)
export const HATCH_COINS = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, RARITIES[sp.rarity].coins]));
export const HATCH_LOOT = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, sp.rarity === 'Legendary' ? 'golden_shell' : 'shell']));
// a small one's meal pays more than its food costs; a big one's costs more than it pays
export const FOOD_PACKS = [
  { id: 'leaf', qty: 5, price: 2 }, { id: 'meat', qty: 5, price: 4 }, { id: 'insect', qty: 5, price: 2 },
  { id: 'fish', qty: 5, price: 4 }, { id: 'herb', qty: 3, price: 15 },
  { id: 'ration', qty: 3, price: 6 }, { id: 'water_skin', qty: 2, price: 40 },
  { id: 'leaf', qty: 50, price: 15 }, { id: 'meat', qty: 50, price: 30 },
];
// Air transport home, by the colonists' aircraft, flying straight to the nest a quarter faster than the
// maglev (pace of its time), nothing happening on the way. The player can call one in for the whole team
// at any time on a journey, paid then and there (no coins, no flight); for one gravely injured (down: it
// survived at nothing left) or badly hurt (bad of its health or less) its share of the flight and its
// care are billed instead. For a dinosaur of theirs down on a journey, the player can call in an air
// rescue; the player down, the whole team is flown home with all it carries, and the journey is over.
// An aircraft carries load kg: small ones share one, a giant takes many (a heavy-lift helicopter's
// sorties); each costs perHex coins a hex from the nest. At the nest, care costs lost coins for all of
// one's health lost, grave more for one down (gravely injured), who is kept in the sanctuary's hospital
// hospital hours by its size, fewer the tougher it is (ref over its vitality and resistance, from half
// to twice as long); the player's own care costs RESCUE.coins. Everything billed (Debt) is paid when
// the player chooses; until then, every coin that comes in goes to the bill.
export const RESCUE = { coins: 50 };
// Scars (only seen, never felt): the health a dinosaur of the player's loses in fights is counted on
// the part of the body the blows fell on, as the foe fights (tyrannosaurs bit at faces, as healed bites
// on their skulls show; a Velociraptor slashed flanks with its claw; a horned one gored the body and
// legs; a club or a tail swung low at the legs...). So much lost on one part, over however many fights,
// leaves a scar there (marked), and far more a deep one (deep). Lamed legs count on the legs.
// A fresh wound, only seen: the parts struck in a journey's fights show it, red, while the dinosaur is
// hurt, and it closes as it heals (at home, as long as its injury lasts, and at least mins for the
// worst of wounds, less for a lighter one); then only its scar is left, if it left one
// deep: a wound is deep where one fight took this share of its health from that part at once (or lamed
// it there): it gapes, and heals into a deep scar; a lighter one stays a scratch all through
export const WOUNDS = { mins: 360, deep: 0.15 };
// A horn (or a Stegosaurus' tail spike) driven into the flank or the neck (GORE.parts): half the time it goes deep (deep), whatever the
// harm; then it may kill outright (more the less tough it is and the more hurt it was already: kill of
// what its toughness, DEATH, and its health leave), and if not it is down, and dies unless flown to the
// hospital there and then.
// How grave it is goes by how far the weapon reaches into the body against how thick the body is
// (severity: reach, metres, over the trunk's thickness, torso × the cube root of its weight; bony plates
// keep the weapon out by armor): half the time deep for one just as thick, deep always for one it
// passes through, rarely for one far thicker; and then killing it outright the likelier the graver and
// the less tough and more hurt it was (kill), certainly when it passes through; and even flown to the
// hospital it may die of it there (flown), the team hearing only after walking on news hexes, or on
// reaching a city or home.
export const GORE = {
  parts: ['body', 'neck'], deep: 0.5, reach: { trike: 0.5, stego: 0.3 }, torso: 0.075, armor: { heavy: 0.3, light: 0.7 },
  kill: 0.5, flown: 0.3, flownMin: 0.01, flownMax: 0.5, news: 2,
};
export const SCARS = {
  parts: ['head', 'neck', 'body', 'legs', 'tail'], marked: 1, deep: 2.5, lame: 0.5,
  // blunt blows: one that goes no deeper than a bruise leaves no wound or scar to see
  crush: ['club', 'stomp'],
  style: {
    bigBite: { head: 3, neck: 2, body: 1 }, bite: { neck: 2, body: 2, head: 1, legs: 1 }, claw: { body: 3, legs: 2, neck: 1 },
    horns: { legs: 3, head: 2, neck: 1, tail: 1, body: 1 }, spikes: { legs: 3, body: 2, tail: 2 }, club: { legs: 3, body: 1, tail: 1 }, stomp: { body: 2, legs: 2, tail: 1 },
    butt: { body: 2, head: 1, legs: 1 }, croc: { legs: 3, neck: 1, head: 1, tail: 1 }, any: { body: 2, legs: 1, head: 1 },
  },
};
// Tending to the team at a stop on a journey (journey.js tripCare): a Healing Herb gives back herb of
// one's health; a Blood Transfusion puts one down back on its feet at revive of its health.
export const TRIP_CARE = { herb: 0.25, revive: 0.25 };
export const AIRLIFT = { bad: 0.25, pace: 0.75, load: 500, perHex: 1, lost: 30, grave: 40, hospital: { tiny: 2, small: 3, medium: 5, large: 8, huge: 12, colossal: 18 }, ref: 100 };
// Factions: the sanctuary's peoples, each paying for what it lacks and little for what it has plenty
// of, and asking more than it pays. The nest belongs to the Scientists: they grow food for the dinosaurs
// in plenty (it sells for little, and the Shop's is cheap) and are after specimens for their research
// (teeth, blood, shells, amber). value: the coins they pay for one; equipment with a price is worth gear
// of it, the rest its makings (RECIPES) and work more for the making.
export const FACTIONS = {
  scientists: {
    name: 'Scientists', gear: 0.5, work: 1.25,
    value: {
      leaf: 0.2, meat: 0.4, insect: 0.1, fish: 0.4, raw_egg: 0.5, seed: 0.1, fruit: 0.3, ration: 1, herb: 2, capsule: 1, water_skin: 10,
      shell: 4, golden_shell: 40, amber: 30, feather: 3, clay: 2, bone: 3, seashell: 2, obsidian: 6, stone: 0.5, allo_tooth: 25, allo_blood: 20,
    },
  },
};
export const HOME_FACTION = 'scientists';
export const ROW_PRICE = 50;         // 1st extra row 50, 2nd 100, 3rd 150 ... 9th 450

// Daily reward. The game day starts at midnight in this UTC offset (UTC itself, the nest's own time),
// the same for every player so the server can check it.
export const DAY_OFFSET_HOURS = 0;
// one entry per day of the streak; after day 7 it starts again from day 1, and missing a day resets it
export const DAILY_REWARDS = [
  { coins: 10 },
  { coins: 15, items: { leaf: 3 } },
  { coins: 20 },
  { coins: 25, items: { meat: 3 } },
  { coins: 30 },
  { coins: 40, items: { leaf: 5, meat: 2 } },
  { coins: 60, items: { amber: 1 } },
];

// Achievements. metric names are computed in economy.js (achievementProgress).
export const ACHIEVEMENTS = [
  { id: 'first_hatch', title: 'First Hatch', desc: 'Hatch your first egg.', metric: 'hatched', target: 1, coins: 20 },
  { id: 'hatch_10', title: 'Egg Expert', desc: 'Hatch 10 eggs.', metric: 'hatched', target: 10, coins: 100 },
  { id: 'rare_find', title: 'Rare Find', desc: 'Hatch a Velociraptor from a Speckled Egg.', metric: 'hatched_raptor', target: 1, coins: 50 },
  { id: 'king', title: 'King of the Nest', desc: 'Hatch a Tyrannosaurus from a Golden Egg.', metric: 'hatched_rex', target: 1, coins: 150 },
  { id: 'all_species', title: 'Full Collection', desc: 'Hatch every species at least once.', metric: 'species', target: 4, coins: 200 },
  { id: 'pair', title: 'Perfect Pair', desc: 'Have a male and a female of the same species.', metric: 'pair', target: 1, coins: 75 },
  { id: 'meals_25', title: 'Good Keeper', desc: 'Raise your young dinosaurs through 25 days of growing.', metric: 'meals', target: 25, coins: 75 },
  { id: 'meals_100', title: 'Master Keeper', desc: 'Raise your young dinosaurs through 100 days of growing.', metric: 'meals', target: 100, coins: 250 },
  { id: 'streak_7', title: 'Week Streak', desc: 'Claim the daily reward 7 days in a row.', metric: 'best_streak', target: 7, coins: 150 },
  { id: 'big_backpack', title: 'Big Backpack', desc: 'Unlock 30 inventory slots.', metric: 'slots', target: 30, coins: 100 },
  { id: 'coins_1000', title: 'Treasure Hunter', desc: 'Earn 1,000 coins in total.', metric: 'coins_earned', target: 1000, coins: 200 },
  { id: 'proud_parents', title: 'Proud Parents', desc: 'Breed a pair and collect their egg.', metric: 'eggs_laid', target: 1, coins: 100 },
];

// ---------- stats ----------
// Every baby has genes from 1 to GENES_MAX for each stat: its quality, inherited when breeding.
// Its actual stats come from its species' base and those genes, then equipment (statSheet in economy.js).
export const STATS = [
  { id: 'str', name: 'Strength', short: 'STR' },
  { id: 'agi', name: 'Agility', short: 'AGI' },
  { id: 'vit', name: 'Vitality', short: 'VIT' },
  { id: 'res', name: 'Resistance', short: 'RES' },
];
export const GENES_MAX = 100;
export const WILD_GENES = [10, 50];           // starter babies (and eggs found next to the nest)
export const GENE_GRADES = [[90, 'S'], [75, 'A'], [55, 'B'], [35, 'C'], [0, 'D']];

// Each species' stats with perfect genes. Rarer species have a higher total.
export const SPECIES_BASE = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, sp.base]));
// genes scale the base from GENE_FLOOR (genes 0) up to 100% (genes 100): base × (0.7 + 0.3 × genes / 100).
// Like real animals of one species, the best is only about 40% stronger than the weakest.
export const GENE_FLOOR = 0.7;

// Combat stats worked out from the final stats. Dodge and damage reduction have diminishing
// returns: they reach 50% when the stat equals the "half at" value and never reach 100%.
export const DERIVED = { hpBase: 50, hpPerVit: 10, damagePerStr: 1.5, dodgeHalfAt: 100, reductionHalfAt: 100 };

// Breeding: a male and a female of the same species lay an egg of that species. Each gene of the
// baby lands between its parents' genes, plus a small random change, so good pairs make better babies.
// From mating to laying: about a month, as in crocodiles (at PACE).
export const BREED_DAYS = 30;
export const BREED_MINS = Object.fromEntries(Object.keys(SPECIES).map(k => [k, Math.round(BREED_DAYS * DAY_MINS / PACE)]));
export const BREED_GENE_CHANGE = [-2, 5];
export const EGG_TRAY_SIZE = 10;
