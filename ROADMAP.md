# Cretaceous Nest — Roadmap

Goal: grow the current single-page prototype into a game with free accounts, per-user cloud saves and, later, monetization that players see as fair.

## Where we are (Phase 0 — done)

- Static game in one `index.html`, hosted on Render, code on GitHub
- Eggs with idle hatch timers, male/female babies with hand-made sprites
- Nest with walking babies that get hungry and eat from the inventory
- Inventory (10 slots, upgradable to 100, stacks of 99), coins and a shop
- Progress saved only in the player's browser (localStorage)

## Recommended stack

| Need | Choice | Why |
|---|---|---|
| Accounts | Supabase Auth | Free tier, email magic link and Google sign-in, no password storage on our side |
| Database | Supabase Postgres | Relational data, row-level security so each player only reaches their own rows |
| Game server logic | Supabase Edge Functions (or a small Node service on Render) | Validates every action that changes coins or items |
| Payments | Stripe Checkout + webhooks | Hosted checkout, cards and Pix in Brazil, webhooks credit purchases on the server |
| Frontend | Same game, split into native JavaScript modules | Easier to grow than one 1,100-line file; no build step until a bundler is really needed (then Vite) |
| Hosting | Render static site | Already in place |

Free-tier notes: Supabase pauses free projects after about a week with no activity; Render free web services sleep after 15 minutes idle (static sites do not). Both are fine for development; plan a paid tier before launch.

## Phase 1 — Code foundation (done)

- [x] Split `index.html` into `js/` modules (config, economy, state, art, ui/*) using native ES modules, no build step
- [x] Version the save format (`saveVersion`) with a migration step per version
- [x] Export / import save as a text code (backup before cloud saves exist)
- [x] Move game balance (timers, prices, rewards) into one config file (`js/config.js`)
- [x] Automated tests for the economy rules and the save format (`node --test`)

## Phase 2 — Free accounts and cloud saves (done)

- [x] Supabase project created and configured (see `docs/supabase-setup.md`)
- [x] Auth in the game: email sign-in link, optional Google (`js/cloud.js`, `js/ui/account.js`)
- [x] Tables: `profiles` (display name, created_at), `saves` (user_id, data jsonb, save_version, updated_at) in `supabase/migrations/`
- [x] Row-level security: a player reads and writes only their own rows
- [x] Guest mode keeps working with localStorage; signing up uploads the guest save
- [x] Sync rules (`js/sync.js`): newest save wins for the same account, the player chooses when a guest game and an account save both have progress, uploads 2 s after each change
- [x] Account panel: change display name, sign out, delete account and data
- [x] Privacy policy and terms of use pages (first draft, to be reviewed before launch)
- [ ] Custom SMTP sender for sign-in emails (the built-in one is rate limited)

## Phase 3 — Server-authoritative economy (done)

Signed-in players can no longer change their own coins or items: the server decides.

- [x] Every action goes through the `game` Edge Function (start egg, warm, hatch, feed, move, buy, ...)
- [x] The server runs the same rules file as the browser (`js/economy.js`, copied by `scripts/sync-shared.js`)
- [x] The server's clock decides hatch and hunger timers; the server rolls the baby's sex
- [x] Players cannot write their save directly; `write_save` stores it with a revision check
- [x] Ledger of every coin and item gained or spent (audit trail, support and refunds)
- [x] Guest saves brought into an account are capped to plausible limits; save codes load only when signed out
- [ ] Rate limits per user
- [ ] Split the JSON save into tables (`eggs`, `babies`, `inventory_items`, `wallets`) if queries across players are needed

## Phase 4 — Content and retention

- [ ] Art for eggs and items in the same style as the dinosaur sprites
- [x] Growth stages: baby → juvenile (10 meals) → adult (30 meals); placeholder art scales the baby sprite until each adult sprite exists
- [x] Stats (STR, AGI, VIT, RES) and breeding: a pair of the same species lays an egg whose baby inherits their genes
- [x] Stat engine: species base × genes (50–100%), then equipment in stages (flat, increased %, more ×); derived combat stats (health, damage, dodge and damage reduction with diminishing returns); gene grades S–D
- [x] Equipment: items in slots (head, neck, body, back) with fixed bonuses, bought with coins; only adults wear it (pieces for babies and juveniles may come later)
- [x] Equipment drawn over the sprite (layers, anchors per sprite, anchor editor); [ ] hand-drawn art for each piece
- [ ] Equipment rarities (Normal, Magic, Rare, Legendary) with rolled bonuses, and where items drop

### Horizontal-ish progression (decided): big species stay stronger, but numbers, preparation and the right match-up can win
- [x] Equipment weight: every piece weighs something, each species carries by size (tiny to huge) plus strength; nothing past capacity, and a load over half of it costs up to 20% agility
- [ ] Teams on expeditions (up to 5 dinosaurs, maybe with the player) and pack bonuses (e.g. 3+ Compsognathus)
- [ ] Body parts: each species and creature has regions to attack and defend (Triceratops: head armored and reflects, body normal, neck weak for double damage); training improves aim
- [ ] One ability per species, added one by one
- [ ] Dinopedia: species and creature pages; learning a creature's weak spots helps your dinosaurs aim
- [x] Combat system using the derived stats (expedition fights; see World map)

### World map (open world, idle first)

Plan: a hex map under fog explored by idle expeditions (now), later small walkable areas inside special hexes (caves, boss lairs).

- [x] Step 1: hex map per player (seeded), five biomes, fog, expeditions by real time (juveniles near, adults anywhere, 2 at once), loot by biome and distance, discovery coins, explorers come home hungry
- [x] Step 2: wild creatures per biome (stronger farther out), lairs with Alpha creatures, auto-combat replayed when a trip is collected, danger shown before sending, injuries that heal with time or Healing Herbs, gear drops
- [x] Step 3: eggs are found on expeditions (by biome, better genes farther out and in lairs) and laid by adult pairs; the incubator has no free eggs; new games pick one of four starter babies, each led by one stat (Dilophosaurus STR, Compsognathus AGI, Scelidosaurus RES, Psittacosaurus VIT); the Forge turns amber, shells, feathers, clay, bone and obsidian into equipment the Shop does not sell
- [x] Player character: explores alone (any distance, never hungry, can be injured) with its own stats and five slots of weapons and armor, sold in the Shop and made in the Forge; drawn in code for now
- [x] The sanctuary's climate is Earth's own today: the continent lies where the United States would (20°N to 55°N), hot and dry in the south-west, wet in the south-east, cold winters in the north; Subtropical Forest on the warm wet shores, where predators ambush; the land runs on past the top of the map to the edge of the screen (the uncharted north, generated as Boreal Forest, Tundra and lake country for one day), with the view stopping at the map's edge
- [x] The colonists' maglev: stations at the nest and every city, a network of elevated lines; a ride costs coins by distance and seats, is safe, and feeds and waters everyone; cities are stops where a team is fed, watered and can explore from
- [x] Survival on foot: one water flask in the starter kit; making camp to look for water and food and rest; the way shown hex by hex, numbered, before setting off, each point draggable to change it (to follow a river); walking along a river bank takes no crossing
- [x] Hunger and thirst at a realistic scale (a hex is about 22 km: danger after about 3 hexes without fresh water)
- [x] Hunger and thirst for everyone, the player too: the nest's trough waters all at home; on a journey fresh water, grazing, kills, carried food, water flasks and rations; worn down, then dying of it (the player collapses)
- [x] Dinosaurs never set out without the player: every team has the player in it; out with a team, any hex picked on the map is explored from where it waits, no need to come home first
- [x] Starters common in the fossil record and small: Coelophysis and Velociraptor (meat), Psittacosaurus and Protoceratops (plants); Dilophosaurus and Compsognathus now Rare, Hypsilophodon Common
- [x] Health and bite by body mass: each species' real weight (and the player's), health from vitality × (mass / 350 kg)^0.6, a growing one weighing less (juveniles half) and biting weaker (mass^⅔); a predator's bite that lands on something an eighth its weight or less kills it outright
- [x] Appetite by body mass: food items weigh what they are (a leaf bundle or a cut of meat 1 kg); a day's food is 0.15 kg^0.75 of plants or 0.08 kg^0.75 of meat (Kleiber, at 60% of a mammal's); a nest meal is a quarter of a day, one item at least; on a journey days pass for real (a unit of the way 3.5 h) and a meal from the bags fills one as far as its kilos go; a carcass gives half its weight in meat, as much as the team can carry (15% of each one's weight, the player 20 kg); bigger packs in the Shop
- [x] Event codes (Rewards tab): each redeemed once per game for its reward, kept in the game only as hashes; the first gives a Tyrannosaurus egg
- [x] Events told as what you did (You…), each on a card that comes up over the map with its picture (images/events, 16:9: see its README for the names), the words and the choices
- [ ] Event pictures: one per event in images/events (names in its README); done: fight-dilo
- [x] Team tab: up to 5 named teams of 4 places (the player always goes besides), each place filled from a picker of dinosaur and pack cards; on the World map the player picks which team goes with them, or no one
- [x] Biome hazards on journeys: sandstorms and heat, volcanic fumes, floods, bogs, cold nights in the north, losing the way in thick forest (they cost time or wear someone down, never kill)
- [x] Relief on the map: each hex keeps its height (map.js upAt), the ground is lit from the north-west by its slope, hills, mountains and volcanoes stand up out of their hexes (drawn north to south, with shadows)
- [x] The map seen at a slant (2.5D, hexdraw.js TILT = 0.75): the ground at three quarters of its depth, what stands on it upright
- [ ] Map textures per biome (a few variants each, turned and tinted per hex, soft edges between biomes), then painted art for mountains, hills and volcanoes cut out like the sprites
- [ ] Walls where the ground drops (cliffs, the coast), shown on a hex's south edge now that the map is seen at a slant
- [ ] Later, a true 3D map (WebGL, three.js): the same heights as a terrain mesh (hex columns or one smooth surface), mountains, trees and the nest as simple models or upright pictures, a perspective camera that turns; picking by ray, the map in chunks for phones, the journey map and the landing page's map with it. A working example of a real patch was made to compare (Oct 2026); the 2.5D map stays until then
- [ ] Transport (docs/TRANSPORT.md): the maglev on a timetable at 1,000 km/h for anyone, suborbital rockets for those who can fly, dinosaurs travelling without the player, stables in every city
- [ ] Step 4: outposts that shorten trips and produce resources, bosses, seasonal events
- [ ] Step 5: walkable areas inside special hexes
- [x] 20 species in six rarities (Starter, Common, Uncommon, Rare, Epic, Legendary) with base stats by rarity; eggs by biome, rarity and distance (legendaries only in lairs)
- [x] Diets per species, favourite first, with new foods: insects, fish, unfertilized eggs (Gallimimus is an omnivore, Baryonyx and Spinosaurus eat fish)
- [ ] Seasonal eggs
- [ ] Personality traits and rare colours (ideas for later)
- [x] Daily login reward (7-day streak) and achievements
- [ ] Collection book (dinopedia with real facts)
- [ ] Sound effects and music with a mute toggle
- [ ] Installable PWA and web push notifications ("Your egg is ready to hatch")

## Activities (species roles)

Each species will be good at an activity beyond its stats (ROLES in config.js). The four starters cover
the activities the game has, a meat eater and a plant eater each: Dilophosaurus and Protoceratops fight,
Compsognathus and Hypsilophodon explore (scout: faster trips, fewer
fights, more eggs). The rest belong to species found as eggs:

- [x] Fighting — Dilophosaurus and Protoceratops (starters)
- [x] Exploring — Compsognathus and Hypsilophodon (starters)
- [x] Foraging: the land gives seeds, gizzard stones, leaves, fruit, insects and herbs along the way; foragers (Psittacosaurus: seeds and stones; Gallimimus: insects, leaves, herbs, and nests once there are nest events; Hypacrosaurus: leaves and fruit) find their kinds twice as often, and the whole team eats and finds water better in camp
- [x] Nest events on journeys: the only way eggs are found; each species nests where it would (buried and left, buried and watched, colonies, brooded, guarded, creches), the parent there or not; which species: how its nest shows, its rarity and its land (legendaries at most 2%); at most one nest every 10 hexes; take, creep up, wait, send one that would run from the parent as bait (outrun or killed), or fight for an egg (a Gallimimus notices nests twice as often, a scout half as often again)
- [x] Clutches: each species lays as many eggs as it would (theropods in pairs), about 1 in 10 never hatching, and unfertilized eggs come only from nests; hatched nests leave the eggs that never hatched, free; with time and calm (a nest left alone, or won) every egg is held to the light, the fertile taken (as many as fit) and the rest kept as food if wanted; from an empty nest an egg is snatched unseen, or held to the light one by one, the parent likelier back at each (no waiting a parent out: it smells the team); whose a nest with no parent about is, or an egg, the player only knows for a species they have hatched (starters known from the start), an unknown egg's card showing nothing but the egg; an egg's sex and genes are settled the moment it is taken or laid; in a rush (creeping up, bait, a colony) one egg is grabbed unseen, shown for what it is once home
- [ ] Hunting and fishing: brings food home (Baryonyx and Spinosaurus fish, Coelophysis hunts)
- [ ] Carrying: the whole team carries more (Argentinosaurus, Parasaurolophus)
- [ ] Nest care: eggs hatch sooner, babies grow on fewer meals (Psittacosaurus, hadrosaurs)
- [ ] Guarding the nest from raids while the team is away (Scelidosaurus, Ankylosaurus, Stegosaurus); needs nest raids
- [ ] Scouting: see a hex's creature before going, avoid ambushes (Hypsilophodon, Velociraptor)
- [ ] Digging: bones, amber and obsidian in badlands and volcanoes (Protoceratops, Pachycephalosaurus)
- [ ] Training: an experienced adult trains the young

### Combat roles (done) and what comes next

Every species has a combat role (attacker, defender, noncombatant, fisher) and a fear: it runs, before
the fight, from anything bigger. Wild encounters are the game's own species (packs for pack hunters).

- [ ] Mounts: the player riding a fast species (Gallimimus) runs off with it instead of being left alone
- [ ] Training: a trained noncombatant attacks foes up to its fear size (never its predators)
- [ ] Other encounters: a herd passing by, a storm
- [ ] Body parts: blows aimed at the head, body or neck (a Triceratops' frill, a neck critical)

## Phase 5 — Monetization

Principles (decided): **never pay-to-win**. Anything bought with real money is cosmetic only. Equipment with stats is earned by playing (drops, breeding, coin shop); money buys looks, including skins that change how equipment looks without changing its stats.

- [ ] Premium currency (bought with real money) separate from coins earned in play
- [ ] Products: cosmetic nests and backgrounds, extra incubator slots, instant hatch, starter pack, supporter badge
- [ ] Stripe Checkout; the webhook credits the purchase on the server, never the browser
- [ ] Purchase history in the account page, refund handling
- [ ] Optional: rewarded ads ("watch to hatch faster"), only if they do not hurt the experience
- [ ] If the game later ships to the App Store / Google Play, their in-app purchase rules and fees (15–30%) apply to digital goods

## Phase 6 — Launch and operations

- [ ] Custom domain
- [ ] Error tracking (Sentry) and privacy-friendly analytics (Plausible or PostHog)
- [ ] Database backups and a staging environment
- [ ] Support email and a simple FAQ
- [ ] Load test the save/action endpoints

## Open decisions

1. Supabase or Firebase for accounts and data (recommendation: Supabase)
2. Payment provider: Stripe or Mercado Pago (Pix is important for Brazilian players)
3. Target audience age: a game for children brings extra rules (COPPA in the US, LGPD rules for minors in Brazil)
4. Web only, or also mobile apps later (affects how purchases work)
5. Name and look of the premium currency
