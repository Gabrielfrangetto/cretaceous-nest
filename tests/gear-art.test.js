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
