// Where each piece of equipment sits on each adult sprite (only adults wear equipment), and its pictures.
import { SPECIES } from './config.js';

// ANCHORS[type][sex][key] = { x, y, w, r, m }: the centre of the item as a fraction of the sprite's
// width (x) and height (y), the item's width as a fraction of the sprite's width (w), a rotation
// in degrees (r) and, optionally, m: true to mirror it. The key is an item id (each piece has its
// own fit on each sprite) or a slot name, used as the starting point for pieces not tuned yet.
// Tune them visually with tools/anchors.html, which prints this object.
export const ANCHORS = {
  proto: {
    m: { head: { x: 0.72, y: 0.3, w: 0.34, r: 0 }, neck: { x: 0.56, y: 0.6, w: 0.3, r: 0 }, body: { x: 0.45, y: 0.76, w: 0.46, r: 0 }, back: { x: 0.3, y: 0.62, w: 0.44, r: -10 } },
    f: { head: { x: 0.66, y: 0.16, w: 0.3, r: 0 }, neck: { x: 0.56, y: 0.46, w: 0.26, r: 0 }, body: { x: 0.45, y: 0.66, w: 0.42, r: 0 }, back: { x: 0.33, y: 0.52, w: 0.4, r: -10 } },
  },
  hypa: {
    m: { head: { x: 0.55, y: 0.12, w: 0.42, r: 0 }, neck: { x: 0.52, y: 0.56, w: 0.32, r: 0 }, body: { x: 0.46, y: 0.73, w: 0.5, r: 0 }, back: { x: 0.3, y: 0.62, w: 0.46, r: -10 } },
    f: { head: { x: 0.62, y: 0.1, w: 0.32, r: 0 }, neck: { x: 0.56, y: 0.46, w: 0.28, r: 0 }, body: { x: 0.42, y: 0.7, w: 0.44, r: 0 }, back: { x: 0.3, y: 0.56, w: 0.42, r: -10 } },
  },
  raptor: {
    m: { head: { x: 0.52, y: 0.1, w: 0.44, r: 0 }, neck: { x: 0.46, y: 0.42, w: 0.36, r: 0 }, body: { x: 0.46, y: 0.6, w: 0.5, r: 0 }, back: { x: 0.36, y: 0.52, w: 0.5, r: 0 } },
    f: { head: { x: 0.68, y: 0.1, w: 0.3, r: 0 }, neck: { x: 0.56, y: 0.42, w: 0.28, r: 0 }, body: { x: 0.5, y: 0.6, w: 0.42, r: 0 }, back: { x: 0.36, y: 0.46, w: 0.4, r: -10 } },
  },
  rex: {
    m: { head: { x: 0.62, y: 0.1, w: 0.32, r: 0 }, neck: { x: 0.56, y: 0.42, w: 0.3, r: 0 }, body: { x: 0.5, y: 0.63, w: 0.44, r: 0 }, back: { x: 0.36, y: 0.5, w: 0.42, r: -10 }, bone_helmet: { x: 0.452, y: 0.157, w: 0.78, r: 9 } },
    f: { head: { x: 0.62, y: 0.1, w: 0.3, r: 0 }, neck: { x: 0.52, y: 0.43, w: 0.28, r: 0 }, body: { x: 0.48, y: 0.63, w: 0.42, r: 0 }, back: { x: 0.35, y: 0.5, w: 0.42, r: -10 } },
  },
};

// Hand-drawn pictures of the equipment as worn (transparent PNGs drawn facing right). One picture
// for every build, or one per build: { theropod: '...', hadrosaur: '...', ceratopsian: '...' }.
// A build with no picture of its own uses `all` if given, otherwise the item's icon.
export const GEAR_ART = {
  leaf_crown: 'sprites/gear/leaf_crown.png',
  bone_helmet: { theropod: 'sprites/gear/theropod/bone_helmet.png' },
};

// the picture of a piece for one species, by its build
export function gearArtFor(id, type) {
  const art = GEAR_ART[id];
  if (!art) return null;
  if (typeof art === 'string') return art;
  const build = SPECIES[type] && SPECIES[type].build;
  return art[build] || art.all || null;
}

// where a piece sits on a sprite: its own fit if it has one, otherwise its slot's
export function anchorFor(type, sex, slot, id) {
  const set = (ANCHORS[type] && ANCHORS[type][sex]) || {};
  return set[id] || set[slot] || null;
}

// Accessories drawn for one exact sprite (the best fit): a PNG the same size as that sprite, empty
// except for the piece, made by painting the piece onto the official sprite and keeping only the
// changed pixels (scripts/extract-gear.ps1). FITTED[item][type][sex] = path. These need no anchor.
export const FITTED = {
  // leaf_crown: { rex: { m: 'sprites/fitted/leaf_crown/rex-m.png' } },
};

// pieces worn on the back are drawn behind the body; the rest in front of it
export const BEHIND = new Set(['back']);
