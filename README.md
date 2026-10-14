# Cretaceous Nest

An idle browser game. Pick a dinosaur egg and wait for it to hatch (time keeps running even when the page is closed), raise the babies in your nest, feed them from your inventory and buy upgrades in the shop.

## Features

- Four species, each with a male and a female sprite: Protoceratops, Hypacrosaurus, Velociraptor and Tyrannosaurus
- Eggs from Common (1 min) to Legendary (1 h); tap the egg to warm it and hatch it sooner
- A nest where the babies walk around and ask for food every few minutes
- Leaves feed the herbivores and meat feeds the carnivores; every meal uses 1 item from the inventory
- An inventory that starts with one row of 10 slots (up to 99 items per slot) and grows in the shop, up to 100 slots
- Coins from hatching eggs and feeding babies, spent on food and bigger backpacks
- Water reminder: pick a baby and an interval; when it is time, an alarm-clock sound plays and the baby pops up in the corner to remind you to drink water (optional system notifications too)
- Stats (Strength, Agility, Vitality, Resistance) from each species' base scaled by the baby's genes, with combat numbers (health, damage, dodge, damage reduction)
- Breeding: a male and a female of the same species lay an egg, and the baby inherits their genes
- Daily reward with a 7-day streak, and achievements that pay coins (checked by the server for signed-in players)
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
js/alarm.js         alarm-clock sound made with the Web Audio API
js/ui/              one module per part of the screen (tabs, incubator, nest, inventory, shop, backup, account, water)
sprites/            baby dinosaur images, <species>-m.png and <species>-f.png
scripts/serve.js    local static server
scripts/version.js  stamps asset addresses with content hashes (run before committing)
scripts/cutout.ps1  turns a generated image into a sprite (Windows PowerShell)
scripts/cutout.py   the same on any system (Python + Pillow); any plain background colour
js/gear-art.js      where equipment sits on each sprite (anchors) and its pictures
tools/anchors.html  visual editor for those anchors (open it from the local server or the site)
tests/              node:test suites
supabase/           database migrations (tables, row-level security)
docs/               setup guides
privacy.html, terms.html
```

Sprites are 240 px tall PNGs with a transparent background, facing right. To add one from a generated image (plain light background, or already transparent):

```
powershell -STA -File scripts/cutout.ps1 -In image.png -Out sprites/rex-f.png
```

Add `-Flip` when the image faces left.

On Linux or macOS, or for a dark grey or green background, use the Python version (`pip install pillow`):

```
python scripts/cutout.py image.png sprites/rex-f.png [--flip]
```

Adult sprites go in `sprites/adult/` with the same names (`rex-m.png`); the game does not use them yet.

## Before each commit

```
node scripts/version.js
node --test
```

`version.js` stamps every script and stylesheet address in the pages with a hash of its contents, so right after a deploy no browser or CDN cache can mix an old file with new ones. A test fails if you forget.

## Changing the save format

Bump `SAVE_VERSION` in `js/state.js` and add a step to `MIGRATIONS` that turns the previous version into the new one. Old saves and save codes are upgraded when they load.
