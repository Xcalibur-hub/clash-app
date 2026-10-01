# CLASH development fixtures (local only)

Synthetic Take author **`@clash_test`** plus open/settled Clashes so you can
test multi-user Clash flows with **one real OTP account**.

## What you get

| ID / handle | Role |
|-------------|------|
| `@clash_test` (`devfx_clash_test`) | Other-user Take author |
| `@dev_challenger` | Side B on pre-seeded Clashes |
| `@dev_juror_a` / `@dev_juror_b` / `@dev_arguer` | Ballots + argument comments |

**Takes (all authored by `@clash_test`):**

| Take id | Purpose |
|---------|---------|
| `devfx_take_fresh_a` | No Clash yet — reply → CLASH → Standard/Blind |
| `devfx_take_fresh_b` | Same, with square media fixture |
| `devfx_take_open_std` | OPEN **Standard** Clash ready to judge |
| `devfx_take_open_blind` | OPEN **Blind** Clash ready to judge |
| `devfx_take_settled` | Already **settled** Clash (verdict UI) |

## How to run

### Full local reset (demo seed + these fixtures)

```bash
npm run supabase:reset
```

`supabase/config.toml` `[db.seed]` loads `seed.sql` then `seeds/clash_dev_fixtures.sql`.
This only affects the **local** Docker stack. It is not part of hosted deploy.

### Re-apply fixtures only (idempotent)

With the local stack already running:

```bash
npm run supabase:seed:clash-dev
```

This script:

1. Requires Docker container `supabase_db_clash` (project `clash`)
2. Refuses any other target
3. Re-deletes the `devfx_*` namespace and re-inserts

## How to test in the app

1. Sign in with **your normal** account (not `@clash_test` — that profile has no auth login).
2. Open Arena / search and find Takes from **`@clash_test`**.
3. **Create flow:** open `devfx_take_fresh_*` → write a reply → tap **CLASH** on your reply → Standard or Blind → immersive Clash screen.
4. **Judge flow:** open `devfx_take_open_std` or `devfx_take_open_blind` → enter Clash → judge (you are not a participant).
5. **Result flow:** open `devfx_take_settled` → verdict / share UI.

## Safety guarantees

- **Not a migration** — `supabase db push` / production migrate paths never run this file.
- **Local seed path only** — listed under `[db.seed]` for `supabase db reset`.
- **Runner guard** — `npm run supabase:seed:clash-dev` only talks to `supabase_db_clash`.
- **SQL soft guard** — refuses non-local/non-Docker server addresses.
- Does **not** weaken RLS, own-Take Clash bans, or app auth gates.
- Does **not** put service-role keys in the React Native app.
- Fixture profiles have **`auth_user_id` null** — they cannot be signed into.

## Reset / remove

```bash
npm run supabase:seed:clash-dev   # wipe+reload fixtures only
# or
npm run supabase:reset            # full local DB reset
```

To permanently stop loading them on reset, remove
`./seeds/clash_dev_fixtures.sql` from `[db.seed] sql_paths` in `supabase/config.toml`.
