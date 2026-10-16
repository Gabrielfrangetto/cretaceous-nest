// Game content and balance. Change numbers here; the rest of the code reads them.

// Every species, grouped by rarity. One row each:
//   species name, build (body shape for equipment art), rarity, diet (foods it eats, favourite first),
//   base stats at perfect genes, egg look (shell, mark, pattern), baby colours (body, acc), nickname, fact.
// Each baby's real stats are its species' base scaled by its own genes (see SPECIES_BASE below), so
// no two of a species are the same. Rarer species have a higher total: Starter and Common 200,
// Uncommon 230, Rare 260, Epic 285, Legendary 310.
const S_ = (species, build, rarity, diet, base, egg, shell, mark, pattern, body, acc, nick, fact) =>
  ({ species, build, rarity, diet, base, egg, shell, mark, pattern, body, acc, nick, fact });
const SPECIES_LIST = {
  // starters: a new player picks one, a fighter or an explorer (ROLES)
  dilo:    S_('Dilophosaurus', 'theropod', 'Starter', ['meat'], { str: 75, agi: 50, vit: 40, res: 35 },
             'Crested Egg', '#e9dccb', '#9a3f2c', 'speckle', '#b5603e', '#e3b53a', 'Crest', 'Dilophosaurus wore two thin bony crests on its head and was one of the biggest hunters of its time.'),
  compy:   S_('Compsognathus', 'theropod', 'Starter', ['meat', 'insect'], { str: 40, agi: 85, vit: 40, res: 35 },
             'Tiny Egg', '#e6e1cf', '#7d8a5a', 'speckle', '#8aa05a', '#d7b847', 'Pip', 'Compsognathus was about the size of a chicken and hunted lizards and insects.'),
  scelido: S_('Scelidosaurus', 'armored', 'Common', ['leaf'], { str: 30, agi: 30, vit: 55, res: 85 },
             'Knobbly Egg', '#d8d2bf', '#5d6b4a', 'spots', '#7d8a5c', '#c9b27a', 'Knobs', 'Scelidosaurus was one of the first armored dinosaurs, its back studded with rows of bony plates.'),
  psitta:  S_('Psittacosaurus', 'ceratopsian', 'Common', ['leaf'], { str: 35, agi: 35, vit: 80, res: 50 },
             'Pebble Egg', '#e3dcc4', '#6d6a4a', 'spots', '#b59a5e', '#7a5a33', 'Beaky', 'Psittacosaurus means "parrot lizard": it had a strong beak and a tuft of quills on its tail.'),
  // common
  coelo:   S_('Coelophysis', 'theropod', 'Common', ['meat', 'insect'], { str: 55, agi: 65, vit: 45, res: 35 },
             'Banded Egg', '#efd9c8', '#a4553b', 'stripes', '#c27a52', '#4a4640', 'Dash', 'Coelophysis lived in herds; one quarry in New Mexico holds more than a thousand of their skeletons.'),
  hypsi:   S_('Hypsilophodon', 'hadrosaur', 'Starter', ['leaf'], { str: 45, agi: 55, vit: 50, res: 50 },
             'Mossy Egg', '#d9e3c6', '#4f7a4a', 'stripes', '#6f9b6a', '#c9d38a', 'Hop', 'Hypsilophodon was a fast little runner, about 2 m long, that browsed on low plants.'),
  // uncommon
  proto:   S_('Protoceratops', 'ceratopsian', 'Starter', ['leaf'], { str: 45, agi: 30, vit: 50, res: 75 },
             'Spotted Egg', '#eadcbf', '#8b6a44', 'spots', '#c79d63', '#d9662f', 'Popcorn', 'Fossil embryos suggest Protoceratops eggs took about 83 days to hatch.'),
  galli:   S_('Gallimimus', 'theropod', 'Uncommon', ['leaf', 'insect', 'raw_egg', 'meat'], { str: 40, agi: 95, vit: 50, res: 45 },
             'Speedy Egg', '#ece4d2', '#8a7a5a', 'speckle', '#c8a56a', '#6f5a3a', 'Zippy', 'Gallimimus was built like an ostrich and may have run at more than 40 km/h. It ate almost anything.'),
  hypa:    S_('Hypacrosaurus', 'hadrosaur', 'Uncommon', ['leaf'], { str: 45, agi: 50, vit: 85, res: 50 },
             'Striped Egg', '#d6e2cc', '#5c7b4f', 'stripes', '#78a463', '#d8bd3e', 'Sprout', 'Teeth from Hypacrosaurus embryos suggest almost 6 months inside the egg.'),
  pachy:   S_('Pachycephalosaurus', 'hadrosaur', 'Uncommon', ['leaf'], { str: 80, agi: 50, vit: 55, res: 45 },
             'Domed Egg', '#e4d8c4', '#7a5a8a', 'spots', '#9a7fae', '#e3c9a0', 'Bonk', 'Pachycephalosaurus had a skull dome up to 25 cm thick, perhaps for head-butting rivals.'),
  // rare
  raptor:  S_('Velociraptor', 'theropod', 'Rare', ['meat'], { str: 65, agi: 100, vit: 50, res: 45 },
             'Speckled Egg', '#cfd6e4', '#46557a', 'speckle', '#6a7ca8', '#e3ae45', 'Sparky', 'An adult Velociraptor was about 2 m long including the tail, and its body was covered in feathers.'),
  stego:   S_('Stegosaurus', 'armored', 'Rare', ['leaf'], { str: 70, agi: 30, vit: 65, res: 95 },
             'Plated Egg', '#dfe0c8', '#8a5a3a', 'stripes', '#7e9a6a', '#d0663a', 'Spike', 'Stegosaurus swung a tail tipped with four long spikes, and its brain was about the size of a walnut.'),
  bary:    S_('Baryonyx', 'theropod', 'Rare', ['fish', 'meat'], { str: 90, agi: 55, vit: 65, res: 50 },
             'River Egg', '#d4e0de', '#3f6a6a', 'speckle', '#6a8a7a', '#c9b06a', 'Hook', 'Baryonyx had a huge hooked claw on each thumb and a long snout for catching fish.'),
  para:    S_('Parasaurolophus', 'hadrosaur', 'Rare', ['leaf'], { str: 50, agi: 55, vit: 100, res: 55 },
             'Horned Egg', '#e6dccb', '#a0553a', 'stripes', '#c97a4a', '#e8d27a', 'Toot', 'Parasaurolophus had a long hollow head crest that may have worked like a trumpet.'),
  // epic
  trike:   S_('Triceratops', 'ceratopsian', 'Epic', ['leaf'], { str: 90, agi: 35, vit: 70, res: 90 },
             'Shield Egg', '#e2d6bd', '#6a4a2a', 'spots', '#8a6a4a', '#d9c08a', 'Trixie', 'Triceratops had three horns and a bony frill, and lived alongside Tyrannosaurus.'),
  ankylo:  S_('Ankylosaurus', 'armored', 'Epic', ['leaf'], { str: 65, agi: 25, vit: 75, res: 120 },
             'Studded Egg', '#d6d0bc', '#5a4a3a', 'spots', '#8a7a5a', '#c9a96a', 'Tank', 'Ankylosaurus was covered in bony armor and swung a heavy club at the end of its tail.'),
  allo:    S_('Allosaurus', 'theropod', 'Epic', ['meat'], { str: 100, agi: 80, vit: 60, res: 45 },
             'Ridged Egg', '#e8d6c4', '#8a3a2a', 'stripes', '#a85a3a', '#e8c06a', 'Fang', 'Allosaurus was the top hunter of the Late Jurassic, with dozens of serrated teeth.'),
  // legendary: their eggs are only found in lairs far from the nest
  spino:   S_('Spinosaurus', 'theropod', 'Legendary', ['fish', 'meat'], { str: 105, agi: 50, vit: 95, res: 60 },
             'Sail Egg', '#d6e2e6', '#2f5a7a', 'speckle', '#5a7a9a', '#d96a3a', 'Sail', 'Spinosaurus had a tall sail on its back and spent much of its life in rivers, hunting fish.'),
  rex:     S_('Tyrannosaurus', 'theropod', 'Legendary', ['meat'], { str: 110, agi: 45, vit: 90, res: 65 },
             'Golden Egg', '#f0cd68', '#b48114', 'gold', '#a35b40', '#f0cd68', 'Rex', 'A newly hatched tyrannosaur is estimated to have been about 90 cm long.'),
  argent:  S_('Argentinosaurus', 'sauropod', 'Legendary', ['leaf'], { str: 75, agi: 25, vit: 140, res: 70 },
             'Giant Egg', '#e8e2d2', '#7a6a4a', 'spots', '#9a8a6a', '#c9b98a', 'Titan', 'Argentinosaurus may have weighed as much as ten elephants, yet hatched from an egg the size of a melon.'),
};

// what each rarity means: hatch time (minutes), coins for hatching, breeding time, and where its
// eggs turn up: from minDist hexes away (a lair counts 2 hexes farther), lairOnly for legendaries;
// weight is how often it is picked against the other eggs of the same biome
export const RARITIES = {
  Starter:   { mins: 3,  coins: 8,   breed: 4,  minDist: 1, weight: 5 },
  Common:    { mins: 3,  coins: 10,  breed: 5,  minDist: 1, weight: 5 },
  Uncommon:  { mins: 8,  coins: 25,  breed: 15, minDist: 3, weight: 3 },
  Rare:      { mins: 20, coins: 60,  breed: 30, minDist: 5, weight: 2 },
  Epic:      { mins: 40, coins: 100, breed: 60, minDist: 6, weight: 1.2 },
  Legendary: { mins: 60, coins: 150, breed: 90, minDist: 5, weight: 1, lairOnly: true },
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
//   fisher: at home in the water (FISHER)
//   fragile: a share of the health its body would have (Coelophysis: hollow, bird-like bones)
//   crush: the share of the target's hide and damage reduction its bite goes through
//   boneBreaker: its bites land on a body part (BONE_BREAKER)
//   frill: a solid bony frill that shields its head (FRILL)
//   armor: bony plates over most of the body, blow by blow (ARMOR)
//   club: a tail club that can break a foe's shin (CLUB)
//   grab: clings to a bigger foe's body to slash it (GRAB)
//   tough: shrugs off one deadly blow a fight and heals fast (TOUGH)
//   claw: a sickle claw that latches on and goes for the neck (LATCH, CLAW)
//   fear:   the biggest foe it stands up to; it runs from anything bigger, before the fight starts
//   weapon: what it fights with, as the Dinopedia will say
//   bite:   the hardest one blow can land, however strong it is or whatever it carries. Small
//           animals with little teeth or a beak stay weak even with perfect genes.
//   hide:   armor that takes this much off every blow it takes (after damage reduction).
// So some can never hurt others: a Tyrannosaurus' hide (25) stops any bite up to about 33, which
// is every Compsognathus, Gallimimus, Hypsilophodon, Psittacosaurus and Scelidosaurus; a
// Velociraptor or Coelophysis only scratches it. COMBAT.md lists who can hurt whom.
export const BODY = {
  compy:   { weapon: 'Tiny pointed teeth', bite: 30, hide: 0, role: 'noncombatant', fear: 'tiny' },
  dilo:    { weapon: 'Long jaws and clawed hands', bite: 120, hide: 2, grab: true, tough: true, role: 'attacker', fear: 'large' },
  scelido: { weapon: 'Small beak; rows of bony plates', bite: 30, hide: 10, role: 'defender', charge: 0.15, fear: 'huge' },
  psitta:  { weapon: 'Parrot-like beak', bite: 30, hide: 3, role: 'noncombatant', fear: 'small' },
  coelo:   { weapon: 'Slim jaws full of small teeth', bite: 32, hide: 0, fullPack: 0.1, fragile: 0.8, role: 'attacker', fear: 'medium' },
  hypsi:   { weapon: 'Small beak; it runs rather than fights', bite: 30, hide: 0, role: 'noncombatant', fear: 'small' },
  proto:   { weapon: 'Hooked beak and a bony frill', bite: 50, hide: 6, role: 'defender', charge: 0.3, fear: 'large' },
  galli:   { weapon: 'Toothless beak and kicks', bite: 20, hide: 2, role: 'noncombatant', fear: 'medium' },
  hypa:    { weapon: 'Tail and kicks', bite: 50, hide: 6, role: 'noncombatant', fear: 'large' },
  pachy:   { weapon: 'Thick bony dome for ramming', bite: 125, hide: 8, role: 'defender', charge: 0.35, fear: 'large' },
  raptor:  { weapon: 'Sickle claw on each foot', bite: 32, hide: 0, claw: true, role: 'attacker', fear: 'medium' },
  stego:   { weapon: 'Spiked tail (the thagomizer)', bite: 130, hide: 18, role: 'defender', charge: 0.2, fear: 'huge' },
  bary:    { weapon: 'Huge thumb claws and fish-catching jaws', bite: 140, hide: 10, fisher: true, role: 'attacker', fear: 'large' },
  para:    { weapon: 'Tail and kicks', bite: 55, hide: 8, role: 'noncombatant', fear: 'large' },
  trike:   { weapon: 'Three horns and a shield of a frill', bite: 170, hide: 20, frill: true, role: 'defender', charge: 0.35, fear: 'colossal' },
  ankylo:  { weapon: 'Bony tail club; armored all over', bite: 160, hide: 35, armor: true, club: true, role: 'defender', charge: 0.15, fear: 'colossal' },
  allo:    { weapon: 'Blade-like teeth, slashing bites', bite: 160, hide: 12, rival: true, role: 'attacker', fear: 'huge' },
  spino:   { weapon: 'Long jaws and big claws', bite: 180, hide: 18, fisher: true, role: 'attacker', fear: 'huge' },
  rex:     { weapon: 'The strongest bite of any land animal', bite: 260, hide: 25, crush: 0.3, boneBreaker: true, role: 'attacker', fear: 'colossal' },
  argent:  { weapon: 'Its sheer weight: stomps and a whip-like tail', bite: 200, hide: 30, role: 'defender', charge: 0.25, fear: 'colossal' },
};
// How each role fights:
//   attacker: the hunters. Strikes the foe every turn.
//   defender: plant eaters that protect themselves. The foe goes for it ROLE_TARGET times as often.
//             Each turn it either charges (its charge chance: CHARGE_DAMAGE times its blow, but
//             CHARGE_EXPOSED more damage from the next blow it takes), or holds its ground and
//             strikes back at whatever attacks it.
//   noncombatant: never attacks. Struck, it lashes back; and when the foe goes for someone else it
//             may land a blow through the opening (OPENING a time). Only when it stays: anything
//             bigger than its fear and it has run. A team of only noncombatants runs off.
// fishers (Baryonyx, Spinosaurus) are attackers at home in the water: FISHER.swamp of their damage
// in a swamp, FISHER.land elsewhere.
export const ROLE_TARGET = { attacker: 1, defender: 3, noncombatant: 0.3 };
export const CHARGE_DAMAGE = 2;
export const CHARGE_EXPOSED = 1.25;
export const OPENING = 0.35;
export const FISHER = { swamp: 1.3, land: 0.85 };
// creatures take theirs from their size unless they say otherwise; nearer the nest they are younger,
// with thinner hide (see creatureFighter)
export const BITE = { tiny: 30, small: 120, medium: 160, large: 220, huge: 300, colossal: 300 };
export const HIDE = { tiny: 0, small: 0, medium: 5, large: 12, huge: 25, colossal: 30 };
export const SPECIES = Object.fromEntries(Object.entries(SPECIES_LIST).map(([k, sp]) => [k, {
  ...sp, mins: RARITIES[sp.rarity].mins, size: SIZE[k], ...BODY[k],
}]));
export const ORDER = Object.keys(SPECIES_LIST);
export const STARTERS = ['dilo', 'proto', 'compy', 'hypsi'];

// What a species is best at outside its stats. Every activity will have species that are good at it
// (fighting, exploring, foraging, hunting and fishing, carrying, nest care, guarding, scouting,
// digging); for now the starters: a fighter and an explorer, a meat eater and a plant eater each,
// for the two activities the game has so far.
export const ROLES = {
  dilo: { role: 'Fighter', text: 'Hits hard rather than takes hits: strong jaws and clawed hands, but a thin hide.' },
  proto: { role: 'Fighter', text: 'Takes hits rather than hits hard: a tough body, a bony frill and a hooked beak. One was found locked in battle with a Velociraptor.' },
  compy: { role: 'Explorer', ability: 'scout', text: 'The quickest of them all. Too small to fight big animals, but a team it leads travels faster, sneaks past danger and sniffs out more eggs.' },
  hypsi: { role: 'Explorer', ability: 'scout', text: 'Good at a bit of everything. It would rather run than fight, but a team it leads travels faster, keeps clear of danger and finds more eggs.' },
};
// a team with a scout in it
export const SCOUT = { trip: 0.75, encounter: 0.5, egg: 1.5 };

// Body builds: species of one build share equipment art (each sprite still gets its own anchors).
export const BUILDS = { theropod: 'Theropod', hadrosaur: 'Hadrosaur', ceratopsian: 'Ceratopsian', armored: 'Armored', sauropod: 'Sauropod' };

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
  leaf:         { name: 'Leaf', plural: 'leaves', desc: 'Food for plant eaters. Each meal uses 1 leaf.' },
  meat:         { name: 'Meat', plural: 'meat', desc: 'Food for meat eaters. Each meal uses 1 meat.' },
  insect:       { name: 'Insects', plural: 'insects', food: true, desc: 'A crunchy handful. Small hunters and omnivores like them. Each meal uses 1.' },
  fish:         { name: 'Fish', plural: 'fish', food: true, desc: 'Fresh from the swamp. Fish eaters like Baryonyx and Spinosaurus love it. Each meal uses 1.' },
  raw_egg:      { name: 'Unfertilized egg', plural: 'unfertilized eggs', food: true, desc: 'An egg that will never hatch. Omnivores like Gallimimus eat it. Each meal uses 1.' },
  shell:        { name: 'Eggshell', plural: 'eggshells', desc: 'Left over from an egg that hatched in the nest.' },
  golden_shell: { name: 'Golden eggshell', plural: 'golden eggshells', desc: 'A piece of the rare Golden Egg, where the Tyrannosaurus hatches from.' },
  amber:        { name: 'Amber', plural: 'amber', desc: 'Fossilized tree resin. Some pieces hold insects from the Cretaceous.' },
  // materials brought back from expeditions (for crafting, later)
  feather:      { name: 'Feather', plural: 'feathers', desc: 'Shed by the small feathered dinosaurs of the conifer forests.' },
  clay:         { name: 'Clay', plural: 'clay', desc: 'Soft river clay from the swamps.' },
  bone:         { name: 'Old bone', plural: 'old bones', desc: 'Sun-bleached bones found in the badlands.' },
  obsidian:     { name: 'Obsidian', plural: 'obsidian', desc: 'Sharp volcanic glass from the slopes of the volcano.' },
  // only from an Allosaurus frenzy (FRENZY_DROPS)
  allo_tooth:   { name: 'Serrated Allosaurus Tooth', plural: 'serrated Allosaurus teeth', desc: 'Lost in a frenzy, when Allosaurus turned on each other. Serrated like a steak knife: they shed and regrew teeth all their lives.' },
  allo_blood:   { name: 'Allosaurus Blood', plural: 'Allosaurus blood', desc: 'Spilled when Allosaurus turned on each other in a frenzy. Used in the Forge for blood transfusions.' },
  transfusion:  { name: 'Blood Transfusion', plural: 'blood transfusions', desc: 'Allosaurus blood and healing herbs. Heals a critically injured dinosaur on the spot.' },
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
export const STARTER = [['leaf', 20], ['meat', 12], ['amber', 1]];

// Feeding
// what each species eats, favourite first; a meal uses the first of these in the inventory
export const DIET = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, sp.diet]));
export const HUNGER_MIN_S = 90;      // each baby gets hungry every 90 to 240 s,
export const HUNGER_SPREAD_S = 150;  // its own rhythm picked from its id

// World map: a hex map around the nest, hidden under fog until expeditions reveal it.
// Each player's map is generated from their own seed. Distance from the nest sets how long a trip
// takes and how much it brings back.
export const WORLD_RADIUS = 7;               // hexes from the nest to the edge
export const TRIP_MINS_PER_HEX = 4;          // there and back: 4 min for the nearest hexes, 28 for the edge
export const EXPEDITION_SLOTS = 2;           // expeditions out at the same time
export const TEAM_SLOTS = 5;                 // places in one expedition's team: a dinosaur, the player, or a pack

// Packs: species that hunted or lived in groups can be formed into a pack, which takes one place in a
// team however many it holds, up to the species' limit. In a fight a pack hits with all its members
// (not all reach at once: PACK_REACH per extra member, plus PACK_BONUS each for working together),
// and every blow it takes can bring down at most one member.
export const PACK_LIMITS = { compy: 10, coelo: 15, raptor: 4, galli: 8 };
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
export const PACK_REACH = 0.3;              // each member after the first adds this share of its damage
export const PACK_BONUS = 0.05;              // +5% damage and dodge for each member after the first that can reach
// how many can get at a foe at once, by its size: the rest wait their turn (and step in when one falls)
export const REACH_SLOTS = { tiny: 2, small: 3, medium: 4, large: 6, huge: 8, colossal: 10 };
export const JUVENILE_RANGE = 3;             // juveniles explore up to 3 hexes away; adults anywhere
export const DISCOVERY_COINS_PER_HEX = 5;    // first visit to a hex: 5 coins per hex of distance
export const LOOT_PER_HEX = 0.25;            // each hex of distance past the first adds 25% to the loot
// loot: [item, min, max, chance] rolled on every visit (chance defaults to 1)
// What lives in each biome: one of these waits in each hex, picked by its weight (a lair holds an
// "Alpha"). species are the game's own (wild, at CREATURE_LEVEL of their base stats; packs of
// pack[0] next to the nest up to pack[1] at the edge); creature is an animal that isn't a dinosaur
// (CREATURES). loot is extra, on top of the hex's, when it is beaten.
export const WILD = {
  meadow:   [{ species: 'compy', pack: [2, 5], weight: 2, loot: [['meat', 1, 2]] }, { species: 'dilo', weight: 1, loot: [['meat', 1, 3]] }],
  forest:   [{ species: 'raptor', pack: [2, 4], weight: 2, loot: [['feather', 2, 3], ['meat', 1, 2]] }, { species: 'allo', weight: 1, loot: [['meat', 2, 3], ['bone', 1, 2]] }],
  swamp:    [{ creature: 'deinosuchus', weight: 2, loot: [['clay', 2, 3], ['meat', 2, 3]] }, { species: 'bary', weight: 1, loot: [['fish', 2, 3], ['bone', 1, 2]] }],
  badlands: [{ species: 'proto', pack: [2, 3], herd: true, weight: 2, loot: [['bone', 2, 3]] }, { species: 'pachy', weight: 1, loot: [['bone', 1, 3], ['meat', 1, 2]] }],
  volcano:  [{ species: 'rex', weight: 1, loot: [['obsidian', 2, 3], ['meat', 2, 3]] }],
};

// wild: the animals met there (WILD); eggs: the species whose eggs can be found there
// (which of them turn up depends on rarity and distance, see RARITIES)
export const BIOMES = {
  meadow:   { name: 'Fern Meadow', color: '#a8c17c', wild: WILD.meadow, eggs: ['dilo', 'compy', 'scelido', 'psitta', 'galli'], loot: [['leaf', 2, 4], ['insect', 1, 2, 0.5], ['raw_egg', 1, 1, 0.2], ['herb', 1, 1, 0.35]] },
  forest:   { name: 'Conifer Forest', color: '#5f8f4e', wild: WILD.forest, eggs: ['coelo', 'hypsi', 'pachy', 'raptor', 'stego', 'allo'], loot: [['leaf', 2, 4], ['feather', 1, 2], ['insect', 1, 3, 0.6], ['amber', 1, 1, 0.15], ['herb', 1, 1, 0.25]] },
  swamp:    { name: 'Swamp', color: '#6f8f7a', wild: WILD.swamp, eggs: ['psitta', 'hypa', 'bary', 'para', 'spino'], loot: [['fish', 1, 3], ['meat', 1, 2], ['clay', 1, 3], ['leaf', 1, 2], ['insect', 1, 2, 0.4], ['herb', 1, 1, 0.2]] },
  badlands: { name: 'Badlands', color: '#d2b07a', wild: WILD.badlands, eggs: ['compy', 'scelido', 'proto', 'galli', 'trike', 'ankylo'], loot: [['bone', 1, 3], ['meat', 1, 2], ['raw_egg', 1, 2, 0.35], ['amber', 1, 1, 0.1]] },
  volcano:  { name: 'Volcanic Slopes', color: '#8a5a4a', wild: WILD.volcano, eggs: ['allo', 'rex', 'argent'], loot: [['obsidian', 1, 3], ['bone', 1, 2], ['amber', 1, 1, 0.2]] },
};

// Wild animals that aren't dinosaurs. stats are at full strength; one met d hexes from the nest has
// CREATURE_LEVEL(d) of them (more in a lair). look is the sprite drawn for it until it has its own
// art, recoloured with the CSS filter tint.
export const CREATURES = {
  deinosuchus:  { name: 'Deinosuchus', size: 'huge', bite: 220, hide: 10, look: 'rex', tint: 'hue-rotate(80deg) saturate(.5) brightness(.75)', stats: { str: 80, agi: 30, vit: 85, res: 75 } },
};
// (× 1.13 since genes moved to 70–100%: a creature keeps up with a dinosaur of middling genes)
export const CREATURE_LEVEL = d => (0.3 + 0.07 * d) * 1.13;  // 0.42 next to the nest, 0.89 at the edge
export const LAIR_SHARE = 0.12;              // share of hexes 3+ away that are lairs: always a fight, a stronger "Alpha"
export const LAIR_MIN_DIST = 3;
export const LAIR_LEVEL = 1.25;
export const ENCOUNTER_CHANCE = d => Math.min(0.8, 0.2 + 0.07 * d);
// size in a fight: each size step bigger than the target hits this much harder, each step smaller
// this much softer, so a Tyrannosaurus brings down a Compsognathus in a bite or two
export const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge', 'colossal'];
export const SIZE_EDGE = 0.3;
// Ankylosaurus' armor: every blow lands on a part. The back, the head (fused skull plates, even bony
// eyelids) and the neck (rings of bone) take cut less damage; a blow on the back also hurts the
// attacker (thorns, of the blow's full damage). The legs have little armor; the belly none (belly times).
export const ARMOR = { parts: [['back', 0.5], ['head', 0.15], ['neck', 0.1], ['legs', 0.2], ['belly', 0.05]], armored: ['back', 'head', 'neck'], cut: 0.6, thorns: 0.1, belly: 1.5 };
// a tail club's counter or charge may break the foe's shin: lamed, as a Tyrannosaurus' bite lames a leg
// (its relative Zuul is named crurivastator, "destroyer of shins"); and it lands damage times as hard
export const CLUB = { lame: 0.35, damage: 1.2 };
// Dilophosaurus' grasping hands, settled by contests (one value against another: a / (a + b) to win).
// When a blow lands on a foe with no armor on its body, it tries to get hold of it tries of the time. A bigger foe: agility against agility to
// climb on to it. Clinging, nothing can reach it; each of its turns, its strength against the foe's
// agility to hold on and slash (a wound that bleeds bleed of the foe's health a turn for the rest of
// the fight), or it falls off, and agility against agility decides whether it lands on its feet or
// misses its next turn. A foe its size or smaller: agility and strength against agility and strength
// to seize it; a smaller one dies in its grip, one its size dies unless it wrenches free (strength
// against strength), and the fight goes on.
export const GRAB = { tries: 0.3, bleed: 0.005 };
// Dilophosaurus is tough (one known skeleton healed from eight injuries): once a fight, a blow that
// would bring it down, from something no bigger than itself, leaves it standing at 1; and its
// injuries heal in heal of the time (not a critical one, which takes as long as anyone's).
export const TOUGH = { heal: 0.5 };
// Velociraptor's sickle claw. A blow that lands on a foe with no armor on its body may latch on
// (chance): on a bigger foe it clings to it, out of its reach; a foe its size or smaller it pins to
// the ground, and a pinned foe can neither strike nor dodge. Latched, every turn it drives the claw in:
// a piercing blow (through hide and armor) and a wound that bleeds bleed more of the foe's health a
// turn (up to maxStacks wounds), until the foe shakes it off: each of the foe's turns, a chance of
// shake times agility against agility (clinging) or strength against strength (pinned).
export const LATCH = { chance: 0.2, bleed: 0.005, maxStacks: 5, shake: 1.3 };
// it drives the claw in from below, so a share of its blows land on the neck, through any armor
export const CLAW = { neck: 0.3 };
// Triceratops' frill, solid bone, has its own health (hp points). Facing its foe, a blow lands on its
// head head of the time (headPack against a pack, which gets at it from the sides). While the frill
// holds, a blow on the head does the dinosaur no harm: it costs the frill a point (crushed points for a
// crushing bite) and the Triceratops gores back with its horns, leaving the foe bleeding bleed of its
// health a turn per wound, up to maxBleed wounds, for the rest of the fight. A broken frill (0) lets
// half a head blow through. The frill does not grow back by itself: a Healing Herb mends a point.
export const FRILL = { hp: 5, head: 0.35, headPack: 0.2, crushed: 2, broken: 0.75, bleed: 0.007, maxBleed: 5 };
// Where a bone-breaking bite lands (Tyrannosaurus: it crushed and swallowed bone). A leg may be
// lamed: half its dodge and agility for the rest of the fight, and it comes home injured. A neck kills
// outright, if the target is no bigger than neckMax: bigger necks are too thick to close the jaws on.
// Anything no bigger than oneBite (up to about 100 kg) dies from any bite that lands.
export const BONE_BREAKER = { parts: [['body', 0.65], ['leg', 0.27], ['neck', 0.08]], lame: 0.35, lameCut: 0.5, neckMax: 'large', oneBite: 'small' };
// health grows with the body: a size's share of the health its stats give (medium as it is)
export const SIZE_HP = { tiny: 0.45, small: 0.7, medium: 1, large: 1.35, huge: 1.75, colossal: 2.3 };
export const PLAYER_SIZE = 'small';            // a person, 70–80 kg
export const FIGHT_MAX_TURNS = 60;           // after this the one with more health left (as a share) wins
export const WIN_COINS_PER_HEX = 4;          // coins for beating a creature (double in a lair)
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

// The Forge: equipment made from materials. needs: { item: count }.
export const RECIPES = [
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

// The player's explorer: explores alone like a dinosaur (any distance), never gets hungry, can be
// injured, and wears its own weapons and armor.
export const PLAYER_ID = 'player';
export const PLAYER_BASE = { str: 40, agi: 45, vit: 45, res: 35 };   // 165
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
        text: "And these two are explorers. They're too small to fight anything big, but with one in your team you travel faster, slip past danger and find more eggs. Compsognathus is the quickest of them all; Hypsilophodon is good at a bit of everything." },
      "Whichever you choose, the world out there is wild and hostile, and nobody should face it alone. Later you'll find eggs of many more species, each good at something of its own.",
    ],
    done: "I'll choose!",
  },
};

// Growth: a baby moves up a stage after this many meals in total. Only adults wear equipment.
// scale draws juveniles (and adults without an adult sprite yet) larger than babies.
export const STAGES = [
  { id: 'baby', name: 'Baby', meals: 0, scale: 1 },
  { id: 'juvenile', name: 'Juvenile', meals: 10, scale: 1.25 },
  { id: 'adult', name: 'Adult', meals: 30, scale: 1.5 },
];

// Rewards and prices (coins)
export const FEED_COINS = 5;
export const HATCH_COINS = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, RARITIES[sp.rarity].coins]));
export const HATCH_LOOT = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, sp.rarity === 'Legendary' ? 'golden_shell' : 'shell']));
// food costs less than a meal pays, so feeding always comes out ahead
export const FOOD_PACKS = [
  { id: 'leaf', qty: 5, price: 10 }, { id: 'meat', qty: 5, price: 15 }, { id: 'insect', qty: 5, price: 10 },
  { id: 'fish', qty: 5, price: 15 }, { id: 'raw_egg', qty: 3, price: 12 }, { id: 'herb', qty: 3, price: 20 },
];
export const ROW_PRICE = 50;         // 1st extra row 50, 2nd 100, 3rd 150 ... 9th 450

// Daily reward. The game day starts at midnight in this UTC offset (Brasília, which has no daylight
// saving), the same for every player so the server can check it.
export const DAY_OFFSET_HOURS = -3;
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
  { id: 'meals_25', title: 'Good Keeper', desc: 'Feed your babies 25 times.', metric: 'meals', target: 25, coins: 75 },
  { id: 'meals_100', title: 'Master Keeper', desc: 'Feed your babies 100 times.', metric: 'meals', target: 100, coins: 250 },
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
export const BREED_MINS = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, RARITIES[sp.rarity].breed]));
export const BREED_GENE_CHANGE = [-2, 5];
export const EGG_TRAY_SIZE = 10;
