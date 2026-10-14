# Supabase setup

Accounts and cloud saves stay off until `js/cloud-config.js` has a Supabase URL and key. These steps turn them on.

## 1. Create the project

1. Sign up at https://supabase.com (free plan) and create a new project.
2. Pick the region closest to most players (for Brazil: South America, São Paulo).
3. Save the database password somewhere safe. The game does not need it.

## 2. Create the tables

1. Open **SQL Editor → New query**.
2. Paste the whole file `supabase/migrations/20261014000000_accounts_and_saves.sql` and click **Run**.
3. Check **Table Editor**: `profiles` and `saves` should exist, both with RLS enabled.

## 3. Configure sign-in

In **Authentication → URL Configuration**:

- **Site URL**: the Render address, for example `https://cretaceous-nest.onrender.com`
- **Redirect URLs**: add the same address, plus `http://localhost:5173` for local testing

Email sign-in links work out of the box. Supabase's built-in email sender only allows a few emails per hour, which is fine for testing; before launch, set up a custom SMTP sender in **Authentication → Emails → SMTP Settings**.

### Optional: Google sign-in

1. In Google Cloud Console, create an OAuth client (type: Web application).
2. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
3. In Supabase **Authentication → Providers → Google**, paste the client ID and secret and enable it.
4. Set `GOOGLE_SIGN_IN = true` in `js/cloud-config.js`.

## 4. Connect the game

In **Project Settings → API** (or **API Keys**), copy:

- the **Project URL** into `SUPABASE_URL`
- the **anon / publishable** key into `SUPABASE_ANON_KEY`

Both values are public by design: row-level security decides what each signed-in player can reach. Never put the `service_role` / secret key in the game.

## How saves sync

- Playing signed out keeps the save in the browser, as before.
- On the first sign-in, the browser's game moves to the new account.
- If both the browser and the account already have progress, the game asks which one to keep.
- While signed in, every change is uploaded about 2 seconds later.
- Signing out leaves the progress in the account and starts a new guest game in the browser.
- Deleting the account removes the profile and the save (the database cascades from `auth.users`).

## Free plan limits

- Projects on the free plan pause after about a week without activity. Open the dashboard and restore the project if that happens.
- Upgrade to a paid plan before launch.
