# Cretaceous Nest

An idle browser game. Pick a dinosaur egg and wait for it to hatch (time keeps running even when the page is closed), raise the babies in your nest, feed them from your inventory and buy upgrades in the shop.

## Features

- Four species, each with a male and a female sprite: Protoceratops, Hypacrosaurus, Velociraptor and Tyrannosaurus
- Eggs from Common (1 min) to Legendary (1 h); tap the egg to warm it and hatch it sooner
- A nest where the babies walk around and ask for food every few minutes
- Leaves feed the herbivores and meat feeds the carnivores; every meal uses 1 item from the inventory
- An inventory that starts with one row of 10 slots (up to 99 items per slot) and grows in the shop, up to 100 slots
- Coins from hatching eggs and feeding babies, spent on food and bigger backpacks

## Run locally

Open `index.html` in a browser. Progress is saved in that browser (localStorage).

## Deploy on Render

1. New > Static Site, then connect this repository.
2. Build command: leave empty.
3. Publish directory: `.`

## Project layout

```
index.html    the whole game (HTML, CSS and JavaScript)
sprites/      baby dinosaur images, <species>-m.png and <species>-f.png
```

Sprites are 240 px tall PNGs with a transparent background, facing right.
