# Local physical Android ↔ local Supabase

Connect a USB Android device to this repo's **local** Supabase Docker stack
(API port **55321**, not the default 54321).

Hosted Supabase is never modified by this workflow.

## Prereqs

- Docker Desktop running
- Local stack: `npm run supabase:start`
- Android device with USB debugging
- A **development** native build (`APP_VARIANT=development` / `com.clash.v2.dev`)
  so cleartext HTTP to `127.0.0.1` is allowed

## Exact Windows commands

```powershell
# 1) Local stack + fixtures + local developer account
npm run supabase:start
npm run supabase:seed:clash-dev

# 2) USB device
adb devices

# 3) Point the phone at the PC's local API (only port needed)
adb reverse tcp:55321 tcp:55321
# or: npm run adb:reverse-supabase

# 4) Run the JS bundler against LOCAL Supabase
npm run dev:local
```

Then open the **CLASH (Dev)** app on the phone (dev client). You should see a
subtle **LOCAL** badge and Takes from `@clash_test`.

### Sign in (local auth)

Hosted session tokens are **not** valid against local Auth (different JWT secret
+ isolated AsyncStorage key).

Use the seeded local developer:

| Field | Value |
|-------|--------|
| Email | `dev@clash.local` |
| Password | `clash-local-dev` |

On the auth screen (local mode) enter those credentials → **Sign in (local)**.

You can then reply to `@clash_test`, create Standard/Blind Clashes, and judge
open fixture Clashes.

OTP still works on local via Inbucket (`http://127.0.0.1:55324` on the PC) if
you prefer a different email — the phone does not need Inbucket port-forwarded.

## Switch back to hosted Supabase

```powershell
npm run dev:hosted
```

This renames `.env.local` → `.env.local.off` so Expo uses hosted values from
`.env` again. Sign out / sign in if you were on the local session.

## What `dev:local` does

1. Writes gitignored `.env.local` with:
   - `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321`
   - local demo anon key from `supabase status`
2. Runs `adb reverse tcp:55321 tcp:55321`
3. Starts Expo with `APP_VARIANT=development`

## Ports

| Port | Service | Forward to phone? |
|------|---------|-------------------|
| **55321** | Kong API (Auth, REST, Realtime, Storage) | **Yes** |
| 55322 | Postgres | No |
| 55323 | Studio | No |
| 55324 | Inbucket (OTP inbox on PC) | No |

## Native rebuild required?

**Yes, once**, if your current Android install was built **without**
`APP_VARIANT=development` / cleartext:

```powershell
$env:APP_VARIANT="development"
npx expo run:android
```

Preview/production APKs must **not** use local HTTP — they stay on hosted HTTPS.

## Safety

- `.env.local` is gitignored
- Seeds are not migrations — never applied by hosted `db push`
- `npm run supabase:seed:clash-dev` only targets Docker `supabase_db_clash`
- Password sign-in UI/RPC path refuses non-local URLs
- No service-role keys in the React Native app
- EAS builds that somehow see a localhost URL with non-dev variant fail fast

## Related

- `supabase/CLASH_DEV_FIXTURES.md` — fixture Takes / Clashes
- `supabase/config.toml` — `[api] port = 55321`
