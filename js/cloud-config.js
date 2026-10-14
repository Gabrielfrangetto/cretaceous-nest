// Values from Supabase > Project Settings > API. Leave them empty to run the game without accounts.
// The anon (publishable) key is meant to be public: row-level security in the database decides
// what each signed-in player can read and write.
export const SUPABASE_URL = 'https://mhilrzspnbncfaixkzqc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_d6u9B1RESQjRVyioDv7ZkA_wp06NWfV';

// Turn on after enabling the Google provider in Supabase > Authentication > Providers.
export const GOOGLE_SIGN_IN = false;
