# Supabase setup

Accounts and cloud saves stay off until `js/cloud-config.js` has a Supabase URL and key. These steps turn them on.

## 1. Create the project

1. Sign up at https://supabase.com (free plan) and create a new project.
2. Pick the region closest to most players (for Brazil: South America, São Paulo).
3. Save the database password somewhere safe. The game does not need it.

## 2. Create the tables

1. Open **SQL Editor → New query**.
2. Paste each file in `supabase/migrations/`, oldest first, and click **Run** for each one.
3. Check **Table Editor**: `profiles` (with a `username` column), `saves` and `ledger` should exist, all with RLS enabled.

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

Players create an account with a username, an email and a password, and log in with the email and password. In **Authentication → Sign In / Providers → Email**:

- **Enable Email provider**: on
- **Confirm email**: on. A new account can't log in until its email is confirmed, which keeps out bots and typos.
- **Minimum password length**: 8 (the game asks for at least 8 too)

Usernames live in `profiles.username` (migration `20261029000000_usernames.sql`): 3 to 20 letters, digits or `_`, unique regardless of case. The game checks a name is free before signing up (`username_available`), and an account made before usernames picks one once from the account panel (`claim_username`).

The game uses the implicit flow, so an emailed link works in any browser (for example, requested on a computer and opened on a phone), and the player is signed in wherever the link is opened.

### Confirmation code in the email

The game also accepts the code printed in the confirmation email, so a player can read the email on a phone and activate the account on the computer. Put the code in the **Confirm signup** template in **Authentication → Emails**, for example:

```html
<h2>Welcome to Cretaceous Nest</h2>
<p>Type this code in the game to activate your account:</p>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Or open this link on the device you want to play on: <a href="{{ .ConfirmationURL }}">Activate my account</a></p>
```

### Forgotten passwords

**Log in → Forgot password?** emails a link (the **Reset Password** template). Opening it signs the player in and the game asks for a new password straight away. Players who signed up before passwords existed (with an emailed code) use the same link to give their account a password.

The codes and links expire after 1 hour by default. Supabase's built-in email sender only allows a few emails per hour, which is fine for testing; before launch, set up a custom SMTP sender in **Authentication → Emails → SMTP Settings**.

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
