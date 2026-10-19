// Copies the game rules into the Edge Function's _shared folder, so the server runs exactly the
// browser's rules. Run before deploying: node scripts/sync-shared.js
import { copyFileSync } from 'node:fs';

export const SHARED = ['config.js', 'util.js', 'map.js', 'economy.js', 'world.js', 'journey.js', 'combat.js', 'packs.js', 'teams.js', 'state.js', 'sync.js', 'game-server.js'];

for (const file of SHARED) copyFileSync(`js/${file}`, `supabase/functions/_shared/${file}`);
console.log(`Copied ${SHARED.length} files to supabase/functions/_shared`);
