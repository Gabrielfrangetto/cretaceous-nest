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
