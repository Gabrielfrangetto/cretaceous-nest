import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, anchorFor } from '../js/gear-art.js';

test("each piece uses its own fit on a sprite, or its slot's until it is tuned", () => {
  const set = ANCHORS.rex.m;
  const saved = set.bone_helmet;
  set.bone_helmet = { x: 0.1, y: 0.2, w: 0.5, r: 12 };
  try {
    assert.deepEqual(anchorFor('rex', 'm', 'head', 'bone_helmet'), { x: 0.1, y: 0.2, w: 0.5, r: 12 });
    assert.deepEqual(anchorFor('rex', 'm', 'head', 'leaf_crown'), set.head);   // untouched by the helmet
    assert.equal(anchorFor('dragon', 'm', 'head', 'leaf_crown'), null);
  } finally {
    if (saved) set.bone_helmet = saved; else delete set.bone_helmet;
  }
});

test('equipment art is shared by species of one build', async () => {
  const { GEAR_ART, gearArtFor } = await import('../js/gear-art.js');
  GEAR_ART.test_hat = { theropod: 'theropod.png', all: 'any.png' };
  try {
    assert.equal(gearArtFor('test_hat', 'rex'), 'theropod.png');
    assert.equal(gearArtFor('test_hat', 'raptor'), 'theropod.png');
    assert.equal(gearArtFor('test_hat', 'proto'), 'any.png');
    assert.equal(gearArtFor('leaf_crown', 'hypa'), GEAR_ART.leaf_crown);
    assert.equal(gearArtFor('nothing', 'rex'), null);
  } finally {
    delete GEAR_ART.test_hat;
  }
});

test('every item has an icon to show it by', async () => {
  const { ITEMS } = await import('../js/config.js');
  const { ITEM_ICONS } = await import('../js/art.js');
  for (const id of Object.keys(ITEMS)) assert.ok(ITEM_ICONS[id], id);
});
