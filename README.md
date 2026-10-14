# Cretaceous Nest

An idle browser game. Pick a dinosaur egg and wait for it to hatch (time keeps running even when the page is closed), raise the babies in your nest, feed them from your inventory and buy upgrades in the shop.

## Features

- Four species, each with a male and a female sprite: Protoceratops, Hypacrosaurus, Velociraptor and Tyrannosaurus
- Eggs from Common (1 min) to Legendary (1 h); tap the egg to warm it and hatch it sooner
- A nest where the babies walk around and ask for food every few minutes
- Leaves feed the herbivores and meat feeds the carnivores; every meal uses 1 item from the inventory
- An inventory that starts with one row of 10 slots (up to 99 items per slot) and grows in the shop, up to 100 slots
- Coins from hatching eggs and feeding babies, spent on food and bigger backpacks
- Water reminder: pick a baby and an interval, and it pops up in the corner to remind you to drink water
- Save codes to back up progress or move it to another browser
- Optional free accounts with cloud saves (Supabase), see `docs/supabase-setup.md`

## Run locally

Requires Node 20 or newer. The game uses JavaScript modules, which browsers block when `index.html` is opened straight from disk, so serve the folder:

```
node scripts/serve.js
```

Then open http://localhost:5173. Progress is saved in that browser (localStorage).

`npm start` does the same thing.

## Tests

```
node --test
```

The tests cover the game rules in `js/economy.js` and the save format in `js/state.js`.

## Deploy on Render

1. New > Static Site, then connect this repository.
2. Build command: leave empty.
3. Publish directory: `.`

There is no build step: Render serves the files as they are.

## Project layout

```
index.html          page markup
css/style.css       styles, with light and dark themes
js/main.js          starts the game
js/config.js        content and balance: species, items, timers, prices, rewards
js/economy.js       game rules as pure functions (no DOM, no storage)
js/state.js         save format, versioned migrations, local save, save codes
js/sync.js          which save wins when a player signs in
js/cloud.js         Supabase sign-in and cloud saves (off until js/cloud-config.js is filled in)
js/art.js           eggs, nest, item icons and baby sprites
js/util.js          small helpers
js/reminder.js      water reminder timing
js/ui/              one module per part of the screen (tabs, incubator, nest, inventory, shop, backup, account, water)
sprites/            baby dinosaur images, <species>-m.png and <species>-f.png
scripts/serve.js    local static server
tests/              node:test suites
supabase/           database migrations (tables, row-level security)
docs/               setup guides
privacy.html, terms.html
```

Sprites are 240 px tall PNGs with a transparent background, facing right.

## Changing the save format

Bump `SAVE_VERSION` in `js/state.js` and add a step to `MIGRATIONS` that turns the previous version into the new one. Old saves and save codes are upgraded when they load.
