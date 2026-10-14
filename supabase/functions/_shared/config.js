// Game content and balance. Change numbers here; the rest of the code reads them.

export const SPECIES = {
  proto: {
    egg: 'Spotted Egg', species: 'Protoceratops', mins: 1, rarity: 'Common',
    shell: '#eadcbf', mark: '#8b6a44', pattern: 'spots', body: '#c79d63', acc: '#d9662f',
    nick: 'Popcorn', fact: 'Fossil embryos suggest Protoceratops eggs took about 83 days to hatch.',
  },
  hypa: {
    egg: 'Striped Egg', species: 'Hypacrosaurus', mins: 5, rarity: 'Uncommon',
    shell: '#d6e2cc', mark: '#5c7b4f', pattern: 'stripes', body: '#78a463', acc: '#d8bd3e',
    nick: 'Sprout', fact: 'Teeth from Hypacrosaurus embryos suggest almost 6 months inside the egg.',
  },
  raptor: {
    egg: 'Speckled Egg', species: 'Velociraptor', mins: 15, rarity: 'Rare',
    shell: '#cfd6e4', mark: '#46557a', pattern: 'speckle', body: '#6a7ca8', acc: '#e3ae45',
    nick: 'Sparky', fact: 'An adult Velociraptor was about 2 m long including the tail, and its body was covered in feathers.',
  },
  rex: {
    egg: 'Golden Egg', species: 'Tyrannosaurus', mins: 60, rarity: 'Legendary',
    shell: '#f0cd68', mark: '#b48114', pattern: 'gold', body: '#a35b40', acc: '#f0cd68',
    nick: 'Rex', fact: 'A newly hatched tyrannosaur is estimated to have been about 90 cm long.',
  },
};
export const ORDER = ['proto', 'hypa', 'raptor', 'rex'];

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
};
export const STARTER = [['leaf', 20], ['meat', 12], ['amber', 1]];

// Feeding
export const DIET = { proto: 'leaf', hypa: 'leaf', raptor: 'meat', rex: 'meat' };
export const HUNGER_MIN_S = 90;      // each baby gets hungry every 90 to 240 s,
export const HUNGER_SPREAD_S = 150;  // its own rhythm picked from its id

// Rewards and prices (coins)
export const FEED_COINS = 5;
export const HATCH_COINS = { proto: 10, hypa: 25, raptor: 60, rex: 150 };
export const HATCH_LOOT = { proto: 'shell', hypa: 'shell', raptor: 'shell', rex: 'golden_shell' };
// food costs less than a meal pays, so feeding always comes out ahead
export const FOOD_PACKS = [{ id: 'leaf', qty: 5, price: 10 }, { id: 'meat', qty: 5, price: 15 }];
export const ROW_PRICE = 50;         // 1st extra row 50, 2nd 100, 3rd 150 ... 9th 450
