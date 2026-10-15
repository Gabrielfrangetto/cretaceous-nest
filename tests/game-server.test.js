import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleGame, changeBetween } from '../js/game-server.js';
import { freshState } from '../js/state.js';
import { countItem } from '../js/economy.js';
import { HATCH_COINS, FEED_COINS, SPECIES } from '../js/config.js';

const MIN = 60000;
const PROTO = SPECIES.proto.mins * MIN;   // how long a Protoceratops egg takes

// eggs only come from expeditions and breeding, so the saved game gets a Protoceratops egg in its
// tray first, then the incubator is started with it
async function startProtoEgg(store, c) {
  const s = freshState();
  s.starter = true;
  s.eggs = [{ id: 'e1', type: 'proto', genes: { str: 30, agi: 30, vit: 30, res: 30 }, gen: 1, parents: [], laidAt: 0 }];
  store.rows.set('u1', { data: s, revision: 1 });
  const res = await call(store, { action: 'startEgg', args: { eggId: 'e1' } }, c);
  assert.equal(res.ok, true, res.reason);
}

// an in-memory stand-in for the saves table and the write_save database function
function memoryStore() {
  const rows = new Map(), ledger = [];
  return {
    rows, ledger,
    async load(id) {
      const r = rows.get(id);
      return r ? { data: JSON.parse(JSON.stringify(r.data)), revision: r.revision } : null;
    },
    async write(id, revision, data, action, change) {
      const r = rows.get(id);
      if (revision == null ? r : !r || r.revision !== revision) return null;
      const next = (r ? r.revision : 0) + 1;
      rows.set(id, { data: JSON.parse(JSON.stringify(data)), revision: next });
      if (change.coins || Object.keys(change.items).length) ledger.push({ action, ...change });
      return next;
    },
  };
}

function clock(start) {
  let t = start;
  return { now: () => t, advance: ms => { t += ms; } };
}

const call = (store, body, c, rand) => handleGame(store, 'u1', body, { now: c.now, rand }).then(r => r.body);

test('a new player has no save until they claim one', async () => {
  const store = memoryStore(), c = clock(0);
  assert.equal((await call(store, { action: 'load' }, c)).state, null);
  const res = await call(store, { action: 'claim', args: { fresh: true } }, c);
  assert.equal(res.state.owner, 'u1');
  assert.equal(countItem(res.state, 'leaf'), 20);
});

test('claiming a guest save applies the limits, and a second claim does not overwrite', async () => {
  const store = memoryStore(), c = clock(0);
  const guest = freshState();
  guest.coins = 5_000_000;
  await call(store, { action: 'claim', args: { save: guest } }, c);
  assert.equal(store.rows.get('u1').data.coins, 1000);

  guest.coins = 900;
  const again = await call(store, { action: 'claim', args: { save: guest } }, c);
  assert.equal(again.state.coins, 1000);
  const replaced = await call(store, { action: 'claim', args: { save: guest, replace: true } }, c);
  assert.equal(replaced.state.coins, 900);
});

test("the server's clock decides when an egg hatches, not the browser's", async () => {
  const store = memoryStore(), c = clock(1000);
  await startProtoEgg(store, c);
  c.advance(PROTO - 30 * 1000);
  const early = await call(store, { action: 'hatch' }, c);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'not-ready');

  c.advance(30 * 1000);
  const res = await call(store, { action: 'hatch' }, c, () => 0.9);
  assert.equal(res.ok, true);
  assert.equal(res.result.baby.sex, 'f');
  assert.equal(res.state.coins, HATCH_COINS.proto);
  assert.deepEqual(store.ledger.at(-1), { action: 'hatch', coins: HATCH_COINS.proto, items: { shell: 1 } });
});

test('a rejected action changes nothing and returns the real state', async () => {
  const store = memoryStore(), c = clock(0);
  await call(store, { action: 'claim', args: { fresh: true } }, c);
  const res = await call(store, { action: 'buyRow' }, c);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'coins');
  assert.equal(res.state.invSize, 10);
  assert.equal(store.rows.get('u1').revision, 1);
});

test('feeding is logged as food spent and coins earned', async () => {
  const store = memoryStore(), c = clock(0);
  await startProtoEgg(store, c);
  c.advance(PROTO);
  const { result } = await call(store, { action: 'hatch' }, c);
  c.advance(10 * MIN);
  const fed = await call(store, { action: 'feed', args: { id: result.baby.id } }, c);
  assert.equal(fed.ok, true);
  assert.deepEqual(store.ledger.at(-1), { action: 'feed', coins: FEED_COINS, items: { leaf: -1 } });
});

test('taps on the egg arrive in batches and still stop at half the hatch time', async () => {
  const store = memoryStore(), c = clock(0);
  await startProtoEgg(store, c);
  const res = await call(store, { action: 'warmEgg', args: { taps: 500 } }, c);
  assert.equal(res.result.saved, PROTO / 2 / 1000);
  assert.equal(res.state.current.bonus, PROTO / 2);
});

test('unknown actions and bad slot numbers are refused', async () => {
  const store = memoryStore(), c = clock(0);
  assert.equal((await call(store, { action: 'giveMeCoins' }, c)).reason, 'unknown-action');
  assert.equal((await call(store, { action: '__proto__' }, c)).reason, 'unknown-action');
  assert.equal((await call(store, { action: 'move', args: { a: 0, b: 55 } }, c)).reason, 'bad-slot');
});

test('when another request writes first, the server reads again and retries', async () => {
  const store = memoryStore(), c = clock(0);
  await call(store, { action: 'claim', args: { fresh: true } }, c);
  const realWrite = store.write;
  let collisions = 1;
  store.write = async (...a) => {
    if (collisions-- > 0) { store.rows.get('u1').revision++; return null; }   // someone else wrote first
    return realWrite(...a);
  };
  const res = await call(store, { action: 'discard', args: { i: 0 } }, c);
  assert.equal(res.ok, true);
  assert.equal(countItem(store.rows.get('u1').data, 'leaf'), 19);
});

test('changeBetween reports coins and items gained or spent', () => {
  const a = freshState(), b = freshState();
  b.coins = 15; b.inv[0].n = 18;
  assert.deepEqual(changeBetween(a, b), { coins: 15, items: { leaf: -2 } });
});

test('the Edge Function runs exactly the same rules as the browser', () => {
  for (const f of ['config.js', 'util.js', 'economy.js', 'state.js', 'sync.js', 'game-server.js']) {
    const same = readFileSync(`supabase/functions/_shared/${f}`, 'utf8') === readFileSync(`js/${f}`, 'utf8');
    assert.ok(same, `supabase/functions/_shared/${f} is out of date: run node scripts/sync-shared.js`);
  }
});
