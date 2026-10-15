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
  // starters: each led by one stat; a new player picks one
  dilo:    S_('Dilophosaurus', 'theropod', 'Starter', ['meat'], { str: 75, agi: 50, vit: 40, res: 35 },
             'Crested Egg', '#e9dccb', '#9a3f2c', 'speckle', '#b5603e', '#e3b53a', 'Crest', 'Dilophosaurus wore two thin bony crests on its head and was one of the biggest hunters of its time.'),
  compy:   S_('Compsognathus', 'theropod', 'Starter', ['meat', 'insect'], { str: 40, agi: 85, vit: 40, res: 35 },
             'Tiny Egg', '#e6e1cf', '#7d8a5a', 'speckle', '#8aa05a', '#d7b847', 'Pip', 'Compsognathus was about the size of a chicken and hunted lizards and insects.'),
  scelido: S_('Scelidosaurus', 'armored', 'Starter', ['leaf'], { str: 30, agi: 30, vit: 55, res: 85 },
             'Knobbly Egg', '#d8d2bf', '#5d6b4a', 'spots', '#7d8a5c', '#c9b27a', 'Knobs', 'Scelidosaurus was one of the first armored dinosaurs, its back studded with rows of bony plates.'),
  psitta:  S_('Psittacosaurus', 'ceratopsian', 'Starter', ['leaf'], { str: 35, agi: 35, vit: 80, res: 50 },
             'Pebble Egg', '#e3dcc4', '#6d6a4a', 'spots', '#b59a5e', '#7a5a33', 'Beaky', 'Psittacosaurus means "parrot lizard": it had a strong beak and a tuft of quills on its tail.'),
  // common
  coelo:   S_('Coelophysis', 'theropod', 'Common', ['meat', 'insect'], { str: 55, agi: 65, vit: 45, res: 35 },
             'Banded Egg', '#efd9c8', '#a4553b', 'stripes', '#c27a52', '#4a4640', 'Dash', 'Coelophysis lived in herds; one quarry in New Mexico holds more than a thousand of their skeletons.'),
  hypsi:   S_('Hypsilophodon', 'hadrosaur', 'Common', ['leaf'], { str: 30, agi: 75, vit: 50, res: 45 },
             'Mossy Egg', '#d9e3c6', '#4f7a4a', 'stripes', '#6f9b6a', '#c9d38a', 'Hop', 'Hypsilophodon was a fast little runner, about 2 m long, that browsed on low plants.'),
  // uncommon
  proto:   S_('Protoceratops', 'ceratopsian', 'Uncommon', ['leaf'], { str: 55, agi: 40, vit: 55, res: 80 },
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

// body size: sets how much equipment a species can carry (CARRY)
const SIZE = {
  compy: 'tiny',
  dilo: 'small', scelido: 'small', psitta: 'small', coelo: 'small', hypsi: 'small',
  proto: 'medium', galli: 'medium', hypa: 'medium', pachy: 'medium', raptor: 'medium',
  stego: 'large', bary: 'large', para: 'large', trike: 'large', ankylo: 'large', allo: 'large',
  spino: 'huge', rex: 'huge', argent: 'huge',
};

// Weapons and hide, fixed for a species whatever its genes, from how the real animal fought:
//   weapon: what it fights with, as the Dinopedia will say
//   bite:   the hardest one blow can land, however strong it is or whatever it carries. Small
//           animals with little teeth or a beak stay weak even with perfect genes.
//   hide:   armor that takes this much off every blow it takes (after damage reduction).
// So some can never hurt others: a Tyrannosaurus' hide (25) stops any bite up to about 33, which
// is every Compsognathus, Gallimimus, Hypsilophodon, Psittacosaurus and Scelidosaurus; a
// Velociraptor or Coelophysis only scratches it. COMBAT.md lists who can hurt whom.
export const BODY = {
  compy:   { weapon: 'Tiny pointed teeth', bite: 30, hide: 0 },
  dilo:    { weapon: 'Long jaws and clawed hands', bite: 120, hide: 2 },
  scelido: { weapon: 'Small beak; rows of bony plates', bite: 30, hide: 10 },
  psitta:  { weapon: 'Parrot-like beak', bite: 30, hide: 3 },
  coelo:   { weapon: 'Slim jaws full of small teeth', bite: 32, hide: 0 },
  hypsi:   { weapon: 'Small beak; it runs rather than fights', bite: 18, hide: 0 },
  proto:   { weapon: 'Hooked beak and a bony frill', bite: 50, hide: 6 },
  galli:   { weapon: 'Toothless beak and kicks', bite: 20, hide: 2 },
  hypa:    { weapon: 'Tail and kicks', bite: 50, hide: 6 },
  pachy:   { weapon: 'Thick bony dome for ramming', bite: 125, hide: 8 },
  raptor:  { weapon: 'Sickle claw on each foot', bite: 40, hide: 0 },
  stego:   { weapon: 'Spiked tail (the thagomizer)', bite: 130, hide: 18 },
  bary:    { weapon: 'Huge thumb claws and fish-catching jaws', bite: 140, hide: 10 },
  para:    { weapon: 'Tail and kicks', bite: 55, hide: 8 },
  trike:   { weapon: 'Three horns and a shield of a frill', bite: 170, hide: 20 },
  ankylo:  { weapon: 'Bony tail club; armored all over', bite: 160, hide: 35 },
  allo:    { weapon: 'Blade-like teeth, slashing bites', bite: 160, hide: 12 },
  spino:   { weapon: 'Long jaws and big claws', bite: 180, hide: 18 },
  rex:     { weapon: 'The strongest bite of any land animal', bite: 260, hide: 25 },
  argent:  { weapon: 'Its sheer weight: stomps and a whip-like tail', bite: 200, hide: 30 },
};
// creatures take theirs from their size unless they say otherwise; nearer the nest they are younger,
// with thinner hide (see creatureFighter)
export const BITE = { tiny: 30, small: 120, medium: 160, large: 220, huge: 300 };
export const HIDE = { tiny: 0, small: 0, medium: 5, large: 12, huge: 25 };
export const SPECIES = Object.fromEntries(Object.entries(SPECIES_LIST).map(([k, sp]) => [k, {
  ...sp, mins: RARITIES[sp.rarity].mins, size: SIZE[k], ...BODY[k],
}]));
export const ORDER = Object.keys(SPECIES_LIST);
export const STARTERS = ['dilo', 'compy', 'scelido', 'psitta'];

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
export const CARRY = { tiny: 4, small: 10, medium: 18, large: 30, huge: 45 };
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
export const PACK_LIMITS = { compy: 10, coelo: 12, raptor: 4, galli: 8 };
export const PACK_MIN = 2;
export const PACK_REACH = 0.3;              // each member after the first adds this share of its damage
export const PACK_BONUS = 0.05;              // +5% damage and dodge for each member after the first
export const JUVENILE_RANGE = 3;             // juveniles explore up to 3 hexes away; adults anywhere
export const DISCOVERY_COINS_PER_HEX = 5;    // first visit to a hex: 5 coins per hex of distance
export const LOOT_PER_HEX = 0.25;            // each hex of distance past the first adds 25% to the loot
// loot: [item, min, max, chance] rolled on every visit (chance defaults to 1)
// creature: the wild animal met there (CREATURES); eggs: the species whose eggs can be found there
// (which of them turn up depends on rarity and distance, see RARITIES)
export const BIOMES = {
  meadow:   { name: 'Fern Meadow', color: '#a8c17c', creature: 'compy_pack', eggs: ['dilo', 'compy', 'scelido', 'psitta', 'galli'], loot: [['leaf', 2, 4], ['insect', 1, 2, 0.5], ['raw_egg', 1, 1, 0.2], ['herb', 1, 1, 0.35]] },
  forest:   { name: 'Conifer Forest', color: '#5f8f4e', creature: 'wild_raptor', eggs: ['coelo', 'hypsi', 'pachy', 'raptor', 'stego', 'allo'], loot: [['leaf', 2, 4], ['feather', 1, 2], ['insect', 1, 3, 0.6], ['amber', 1, 1, 0.15], ['herb', 1, 1, 0.25]] },
  swamp:    { name: 'Swamp', color: '#6f8f7a', creature: 'deinosuchus', eggs: ['psitta', 'hypa', 'bary', 'para', 'spino'], loot: [['fish', 1, 3], ['meat', 1, 2], ['clay', 1, 3], ['leaf', 1, 2], ['insect', 1, 2, 0.4], ['herb', 1, 1, 0.2]] },
  badlands: { name: 'Badlands', color: '#d2b07a', creature: 'angry_protos', eggs: ['compy', 'scelido', 'proto', 'galli', 'trike', 'ankylo'], loot: [['bone', 1, 3], ['meat', 1, 2], ['raw_egg', 1, 2, 0.35], ['amber', 1, 1, 0.1]] },
  volcano:  { name: 'Volcanic Slopes', color: '#8a5a4a', creature: 'old_tyrant', eggs: ['allo', 'rex', 'argent'], loot: [['obsidian', 1, 3], ['bone', 1, 2], ['amber', 1, 1, 0.2]] },
};

// Wild creatures. stats are at full strength; a creature met d hexes from the nest has
// CREATURE_LEVEL(d) of them (more in a lair). look is the sprite drawn for it until it has its own
// art, recoloured with the CSS filter tint. loot is extra, on top of the hex's, when it is beaten.
export const CREATURES = {
  compy_pack:   { name: 'Compsognathus pack', size: 'small', bite: 60, hide: 0, look: 'raptor', tint: 'hue-rotate(70deg) saturate(.8)', stats: { str: 35, agi: 75, vit: 35, res: 25 }, loot: [['meat', 1, 2]] },
  wild_raptor:  { name: 'Wild Raptor', size: 'medium', bite: 45, hide: 0, look: 'raptor', tint: 'grayscale(.7) brightness(.85)', stats: { str: 60, agi: 90, vit: 50, res: 40 }, loot: [['feather', 2, 3], ['meat', 1, 2]] },
  deinosuchus:  { name: 'Deinosuchus', size: 'large', bite: 220, hide: 10, look: 'rex', tint: 'hue-rotate(80deg) saturate(.5) brightness(.75)', stats: { str: 80, agi: 30, vit: 85, res: 75 }, loot: [['clay', 2, 3], ['meat', 2, 3]] },
  angry_protos: { name: 'Angry Protoceratops herd', size: 'medium', bite: 70, hide: 6, look: 'proto', tint: 'sepia(.5) saturate(1.8) hue-rotate(-20deg)', stats: { str: 60, agi: 35, vit: 75, res: 90 }, loot: [['bone', 2, 3]] },
  old_tyrant:   { name: 'Old Tyrant', size: 'huge', bite: 260, hide: 25, look: 'rex', tint: 'grayscale(.5) brightness(.7) contrast(1.2)', stats: { str: 100, agi: 35, vit: 95, res: 85 }, loot: [['obsidian', 2, 3], ['meat', 2, 3]] },
};
export const CREATURE_LEVEL = d => 0.3 + 0.07 * d;  // 0.37 next to the nest, 0.79 at the edge
export const LAIR_SHARE = 0.12;              // share of hexes 3+ away that are lairs: always a fight, a stronger "Alpha"
export const LAIR_MIN_DIST = 3;
export const LAIR_LEVEL = 1.25;
export const ENCOUNTER_CHANCE = d => Math.min(0.8, 0.2 + 0.07 * d);
// size in a fight: each size step bigger than the target hits this much harder, each step smaller
// this much softer, so a Tyrannosaurus brings down a Compsognathus in a bite or two
export const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge'];
export const SIZE_EDGE = 0.8;
export const PLAYER_SIZE = 'medium';
export const FIGHT_MAX_TURNS = 60;           // after this the one with more health left (as a share) wins
export const WIN_COINS_PER_HEX = 4;          // coins for beating a creature (double in a lair)
export const GEAR_DROP = (d, lair) => lair ? 0.3 : 0.04 + 0.01 * d;
export const INJURY_MINS = 20;               // after losing a fight
export const BRUISE_MINS = 10;               // a win that left it under half health: up to this many minutes
export const HEAL_MINS = 10;                 // each Healing Herb heals this much sooner

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
      'Here they are: the four little dinosaurs every new keeper can start with. Two of them eat plants and two eat meat, and each one has a personality of its own.',
      { focus: '[data-type="scelido"], [data-type="psitta"]',
        text: 'These two are our plant eaters. They love ferns and leaves, and most of them are gentle souls. Scelidosaurus wears bony armor on its back, and Psittacosaurus is as sturdy as they come. Still, a scared plant eater can kick or nip, so always handle them with care!' },
      { focus: '[data-type="dilo"], [data-type="compy"]',
        text: 'And these two are the meat eaters. Nothing makes them happier than a good piece of meat. Dilophosaurus hits the hardest, and little Compsognathus is the quickest of them all. Some of them are real loners, so give them space and be careful: those teeth are sharp!' },
      "All four are healthy and ready for a keeper. If you want to explore the world out there, choose one to help you: it's a wild, hostile place, and nobody should face it alone.",
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
// genes scale the base from GENE_FLOOR (genes 0) up to 100% (genes 100): base × (0.5 + genes / 200)
export const GENE_FLOOR = 0.5;

// Combat stats worked out from the final stats. Dodge and damage reduction have diminishing
// returns: they reach 50% when the stat equals the "half at" value and never reach 100%.
export const DERIVED = { hpBase: 50, hpPerVit: 10, damagePerStr: 1.5, dodgeHalfAt: 100, reductionHalfAt: 100 };

// Breeding: a male and a female of the same species lay an egg of that species. Each gene of the
// baby lands between its parents' genes, plus a small random change, so good pairs make better babies.
export const BREED_MINS = Object.fromEntries(Object.entries(SPECIES).map(([k, sp]) => [k, RARITIES[sp.rarity].breed]));
export const BREED_GENE_CHANGE = [-2, 5];
export const EGG_TRAY_SIZE = 10;
