# Supabase setup

Accounts and cloud saves stay off until `js/cloud-config.js` has a Supabase URL and key. These steps turn them on.

## 1. Create the project

1. Sign up at https://supabase.com (free plan) and create a new project.
2. Pick the region closest to most players (for Brazil: South America, São Paulo).
3. Save the database password somewhere safe. The game does not need it.

## 2. Create the tables

1. Open **SQL Editor → New query**.
2. Paste each file in `supabase/migrations/`, oldest first, and click **Run** for each one.
3. Check **Table Editor**: `profiles`, `saves` and `ledger` should exist, all with RLS enabled.

## 2b. Deploy the game server

Signed-in players play through the `game` Edge Function. After any change to `js/config.js`, `js/economy.js`, `js/state.js`, `js/sync.js`, `js/util.js` or `js/game-server.js`, deploy it again:

```
npx supabase login
node scripts/sync-shared.js
npx supabase functions deploy game --project-ref <project-ref> --no-verify-jwt --use-api
```

`--no-verify-jwt` is needed because the function checks the player's token itself. Deploy the function before pushing a website change that depends on it.

## 3. Configure sign-in

In **Authentication → URL Configuration**:

- **Site URL**: the Render address, for example `https://cretaceous-nest.onrender.com`
- **Redirect URLs**: add the same address, plus `http://localhost:5173` for local testing

Email sign-in links work out of the box. The game uses the implicit flow, so a link works in any browser (for example, requested on a computer and opened on a phone), and the player is signed in wherever the link is opened.

### Sign-in code in the email

The game also accepts the code printed in the email, so a player can read the email on a phone and sign in on the computer. Add the code to both email templates in **Authentication → Emails** (`Magic Link` and `Confirm signup`), for example:

```html
<h2>Your Cretaceous Nest sign-in</h2>
<p>Type this code in the game:</p>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Or open this link on the device you want to play on: <a href="{{ .ConfirmationURL }}">Sign in</a></p>
```

The code expires with the link (1 hour by default). Supabase's built-in email sender only allows a few emails per hour, which is fine for testing; before launch, set up a custom SMTP sender in **Authentication → Emails → SMTP Settings**.

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
- While signed in, every action is sent to the game server, which applies the rules with its own clock and stores the result. The browser shows the action at once and takes the server's answer when it arrives.
- Signing out leaves the progress in the account and starts a new guest game in the browser.
- Deleting the account removes the profile and the save (the database cascades from `auth.users`).

## Free plan limits

- Projects on the free plan pause after about a week without activity. Open the dashboard and restore the project if that happens.
- Upgrade to a paid plan before launch.
