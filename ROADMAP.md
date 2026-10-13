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
| Frontend | Same game, split into modules and built with Vite | Easier to grow than one 1,100-line file |
| Hosting | Render static site | Already in place |

Free-tier notes: Supabase pauses free projects after about a week with no activity; Render free web services sleep after 15 minutes idle (static sites do not). Both are fine for development; plan a paid tier before launch.

## Phase 1 — Code foundation

- [ ] Split `index.html` into `src/` modules (state, eggs, nest, inventory, shop, ui) and add a Vite build
- [ ] Version the save format (`saveVersion`) with a migration step per version
- [ ] Export / import save as a text code (backup before cloud saves exist)
- [ ] Move game balance (timers, prices, rewards) into one config file
- [ ] Basic automated tests for the economy rules (hatching, feeding, stacking, buying)

## Phase 2 — Free accounts and cloud saves

- [ ] Supabase project with Auth (email magic link + Google)
- [ ] Tables: `profiles` (display name, created_at), `saves` (user_id, data jsonb, save_version, updated_at)
- [ ] Row-level security: a player reads and writes only their own rows
- [ ] Guest mode keeps working with localStorage; signing up uploads the guest save
- [ ] Sync rules: load newest save on sign-in, save on every change (debounced), resolve conflicts by `updated_at`
- [ ] Account page: change display name, sign out, delete account and data
- [ ] Privacy policy and terms of use pages (LGPD), cookie/consent notice if analytics is added

## Phase 3 — Server-authoritative economy (required before selling anything)

Today the browser decides everything, so anyone can edit their coins. Before real money is involved:

- [ ] Normalize data: `eggs`, `babies`, `inventory_items`, `wallets` tables instead of one JSON blob
- [ ] Every action goes through a server function: start egg, warm egg, hatch, feed, buy, upgrade backpack
- [ ] Server checks time-based rules with its own clock (hatch time, hunger timers, tap limits)
- [ ] Transaction log for coins and items (audit trail, support and refunds)
- [ ] Rate limits per user

## Phase 4 — Content and retention

- [ ] Art for eggs and items in the same style as the dinosaur sprites
- [ ] Growth stages: baby → juvenile → adult (needs meals over time)
- [ ] Breeding: a male and a female of the same species lay a new egg
- [ ] More species and rarities, seasonal eggs
- [ ] Daily login reward, achievements, collection book (dinopedia with real facts)
- [ ] Sound effects and music with a mute toggle
- [ ] Installable PWA and web push notifications ("Your egg is ready to hatch")

## Phase 5 — Monetization

Principles: no pay-to-win pressure, everything core stays free, purchases save time or add cosmetics.

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
