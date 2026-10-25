// A worker drawing tiles of the world map off the page's thread (mapcanvas.js makeTile asks; each
// tile comes back as a picture). It fetches every picture of the ground first, then draws each tile
// asked for, in turn.
import { renderTile, loadPictures } from './mapcanvas.js';

const ready = loadPictures();
// what is revealed, by how much of it there is (sig): the last few kept
const knowns = new Map();
self.onmessage = async e => {
  const m = e.data;
  if (m.known) {
    const set = new Set(m.known);
    knowns.set(m.sig, k => set.has(k));
    while (knowns.size > 3) knowns.delete(knowns.keys().next().value);
    return;
  }
  await ready;
  let bitmap = null;
  try {
    bitmap = renderTile(m.seed, knowns.get(m.sig) || (() => false), m.sig, m.edge, m.k, m.tx, m.ty).transferToImageBitmap();
  } catch (err) { console.error(err); }
  self.postMessage({ id: m.id, bitmap }, bitmap ? [bitmap] : []);
};
