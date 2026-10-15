// Game content and balance. Change numbers here; the rest of the code reads them.

export const SPECIES = {
  proto: {
    egg: 'Spotted Egg', species: 'Protoceratops', build: 'ceratopsian', mins: 1, rarity: 'Common',
    shell: '#eadcbf', mark: '#8b6a44', pattern: 'spots', body: '#c79d63', acc: '#d9662f',
    nick: 'Popcorn', fact: 'Fossil embryos suggest Protoceratops eggs took about 83 days to hatch.',
  },
  hypa: {
    egg: 'Striped Egg', species: 'Hypacrosaurus', build: 'hadrosaur', mins: 5, rarity: 'Uncommon',
    shell: '#d6e2cc', mark: '#5c7b4f', pattern: 'stripes', body: '#78a463', acc: '#d8bd3e',
    nick: 'Sprout', fact: 'Teeth from Hypacrosaurus embryos suggest almost 6 months inside the egg.',
  },
  raptor: {
    egg: 'Speckled Egg', species: 'Velociraptor', build: 'theropod', mins: 15, rarity: 'Rare',
    shell: '#cfd6e4', mark: '#46557a', pattern: 'speckle', body: '#6a7ca8', acc: '#e3ae45',
    nick: 'Sparky', fact: 'An adult Velociraptor was about 2 m long including the tail, and its body was covered in feathers.',
  },
  rex: {
    egg: 'Golden Egg', species: 'Tyrannosaurus', build: 'theropod', mins: 60, rarity: 'Legendary',
    shell: '#f0cd68', mark: '#b48114', pattern: 'gold', body: '#a35b40', acc: '#f0cd68',
    nick: 'Rex', fact: 'A newly hatched tyrannosaur is estimated to have been about 90 cm long.',
  },
};
export const ORDER = ['proto', 'hypa', 'raptor', 'rex'];

// Body builds: species of one build share equipment art (each sprite still gets its own anchors).
export const BUILDS = { theropod: 'Theropod', hadrosaur: 'Hadrosaur', ceratopsian: 'Ceratopsian' };

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
  leaf:         { name: 'Leaf', plural: 'leaves', desc: 'Food for Protoceratops and Hypacrosaurus. Each meal uses 1 leaf.' },
  meat:         { name: 'Meat', plural: 'meat', desc: 'Food for Velociraptor and Tyrannosaurus. Each meal uses 1 meat.' },
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
};
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
export const DIET = { proto: 'leaf', hypa: 'leaf', raptor: 'meat', rex: 'meat' };
export const HUNGER_MIN_S = 90;      // each baby gets hungry every 90 to 240 s,
export const HUNGER_SPREAD_S = 150;  // its own rhythm picked from its id

// World map: a hex map around the nest, hidden under fog until expeditions reveal it.
// Each player's map is generated from their own seed. Distance from the nest sets how long a trip
// takes and how much it brings back.
export const WORLD_RADIUS = 7;               // hexes from the nest to the edge
export const TRIP_MINS_PER_HEX = 4;          // there and back: 4 min for the nearest hexes, 28 for the edge
export const EXPEDITION_SLOTS = 2;           // dinosaurs exploring at the same time
export const JUVENILE_RANGE = 3;             // juveniles explore up to 3 hexes away; adults anywhere
export const DISCOVERY_COINS_PER_HEX = 5;    // first visit to a hex: 5 coins per hex of distance
export const LOOT_PER_HEX = 0.25;            // each hex of distance past the first adds 25% to the loot
// loot: [item, min, max, chance] rolled on every visit (chance defaults to 1)
// creature: the wild animal met there (CREATURES)
export const BIOMES = {
  meadow:   { name: 'Fern Meadow', color: '#a8c17c', creature: 'compy_pack', loot: [['leaf', 2, 4], ['herb', 1, 1, 0.35]] },
  forest:   { name: 'Conifer Forest', color: '#5f8f4e', creature: 'wild_raptor', loot: [['leaf', 2, 4], ['feather', 1, 2], ['amber', 1, 1, 0.15], ['herb', 1, 1, 0.25]] },
  swamp:    { name: 'Swamp', color: '#6f8f7a', creature: 'deinosuchus', loot: [['meat', 1, 3], ['clay', 1, 3], ['leaf', 1, 2], ['herb', 1, 1, 0.2]] },
  badlands: { name: 'Badlands', color: '#d2b07a', creature: 'angry_protos', loot: [['bone', 1, 3], ['meat', 1, 2], ['amber', 1, 1, 0.1]] },
  volcano:  { name: 'Volcanic Slopes', color: '#8a5a4a', creature: 'old_tyrant', loot: [['obsidian', 1, 3], ['bone', 1, 2], ['amber', 1, 1, 0.2]] },
};

// Wild creatures. stats are at full strength; a creature met d hexes from the nest has
// CREATURE_LEVEL(d) of them (more in a lair). look is the sprite drawn for it until it has its own
// art, recoloured with the CSS filter tint. loot is extra, on top of the hex's, when it is beaten.
export const CREATURES = {
  compy_pack:   { name: 'Compsognathus pack', look: 'raptor', tint: 'hue-rotate(70deg) saturate(.8)', stats: { str: 35, agi: 75, vit: 35, res: 25 }, loot: [['meat', 1, 2]] },
  wild_raptor:  { name: 'Wild Raptor', look: 'raptor', tint: 'grayscale(.7) brightness(.85)', stats: { str: 60, agi: 90, vit: 50, res: 40 }, loot: [['feather', 2, 3], ['meat', 1, 2]] },
  deinosuchus:  { name: 'Deinosuchus', look: 'rex', tint: 'hue-rotate(80deg) saturate(.5) brightness(.75)', stats: { str: 80, agi: 30, vit: 85, res: 75 }, loot: [['clay', 2, 3], ['meat', 2, 3]] },
  angry_protos: { name: 'Angry Protoceratops herd', look: 'proto', tint: 'sepia(.5) saturate(1.8) hue-rotate(-20deg)', stats: { str: 60, agi: 35, vit: 75, res: 90 }, loot: [['bone', 2, 3]] },
  old_tyrant:   { name: 'Old Tyrant', look: 'rex', tint: 'grayscale(.5) brightness(.7) contrast(1.2)', stats: { str: 100, agi: 35, vit: 95, res: 85 }, loot: [['obsidian', 2, 3], ['meat', 2, 3]] },
};
export const CREATURE_LEVEL = d => 0.3 + 0.07 * d;  // 0.37 next to the nest, 0.79 at the edge
export const LAIR_SHARE = 0.12;              // share of hexes 3+ away that are lairs: always a fight, a stronger "Alpha"
export const LAIR_MIN_DIST = 3;
export const LAIR_LEVEL = 1.25;
export const ENCOUNTER_CHANCE = d => Math.min(0.8, 0.2 + 0.07 * d);
export const FIGHT_MAX_TURNS = 60;           // after this the one with more health left (as a share) wins
export const WIN_COINS_PER_HEX = 4;          // coins for beating a creature (double in a lair)
export const GEAR_DROP = (d, lair) => lair ? 0.3 : 0.04 + 0.01 * d;
export const INJURY_MINS = 20;               // after losing a fight
export const BRUISE_MINS = 10;               // a win that left it under half health: up to this many minutes
export const HEAL_MINS = 10;                 // each Healing Herb heals this much sooner

// Growth: a baby moves up a stage after this many meals in total. Only adults wear equipment.
// scale draws juveniles (and adults without an adult sprite yet) larger than babies.
export const STAGES = [
  { id: 'baby', name: 'Baby', meals: 0, scale: 1 },
  { id: 'juvenile', name: 'Juvenile', meals: 10, scale: 1.25 },
  { id: 'adult', name: 'Adult', meals: 30, scale: 1.5 },
];

// Rewards and prices (coins)
export const FEED_COINS = 5;
export const HATCH_COINS = { proto: 10, hypa: 25, raptor: 60, rex: 150 };
export const HATCH_LOOT = { proto: 'shell', hypa: 'shell', raptor: 'shell', rex: 'golden_shell' };
// food costs less than a meal pays, so feeding always comes out ahead
export const FOOD_PACKS = [{ id: 'leaf', qty: 5, price: 10 }, { id: 'meat', qty: 5, price: 15 }, { id: 'herb', qty: 3, price: 20 }];
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
export const WILD_GENES = [10, 50];           // babies from the incubator's free eggs
export const GENE_GRADES = [[90, 'S'], [75, 'A'], [55, 'B'], [35, 'C'], [0, 'D']];

// Each species' stats with perfect genes. Rarer species have a higher total.
export const SPECIES_BASE = {
  proto:  { str: 50, agi: 40, vit: 60, res: 85 },   // 235
  hypa:   { str: 45, agi: 50, vit: 85, res: 65 },   // 245
  raptor: { str: 60, agi: 95, vit: 55, res: 50 },   // 260
  rex:    { str: 90, agi: 40, vit: 85, res: 75 },   // 290
};
// genes scale the base from GENE_FLOOR (genes 0) up to 100% (genes 100): base × (0.5 + genes / 200)
export const GENE_FLOOR = 0.5;

// Combat stats worked out from the final stats. Dodge and damage reduction have diminishing
// returns: they reach 50% when the stat equals the "half at" value and never reach 100%.
export const DERIVED = { hpBase: 50, hpPerVit: 10, damagePerStr: 1.5, dodgeHalfAt: 100, reductionHalfAt: 100 };

// Breeding: a male and a female of the same species lay an egg of that species. Each gene of the
// baby lands between its parents' genes, plus a small random change, so good pairs make better babies.
export const BREED_MINS = { proto: 5, hypa: 15, raptor: 30, rex: 90 };
export const BREED_GENE_CHANGE = [-2, 5];
export const EGG_TRAY_SIZE = 10;
