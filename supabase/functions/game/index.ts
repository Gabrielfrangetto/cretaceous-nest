// The game server. Signed-in players send actions here; the rules in ../_shared (copied from js/ by
// scripts/sync-shared.js) decide what happens, using the server's clock and dice.
// Deploy with --no-verify-jwt: the function checks the player's token itself.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handleGame } from '../_shared/game-server.js';
import { SAVE_VERSION } from '../_shared/state.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

const store = {
  async load(userId: string) {
    const { data, error } = await admin.from('saves').select('data, revision').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async write(userId: string, revision: number | null, data: unknown, action: string, change: { coins: number; items: Record<string, number> }) {
    const { data: next, error } = await admin.rpc('write_save', {
      p_user: userId, p_revision: revision, p_data: data, p_version: SAVE_VERSION,
      p_action: action, p_coins: change.coins, p_items: change.items,
    });
    if (error) throw error;
    return next;
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return json({ error: 'Sign in again.' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  try {
    const { status, body: out } = await handleGame(store, auth.user.id, body, { rand });
    return json(out, status);
  } catch (e) {
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
});
