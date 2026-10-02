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

### Live Daily Arena (`devfx_arena_*`)

| Id | Purpose |
|----|---------|
| `devfx_arena_topic_live` | **Live** topic — "AI will replace most software developers within 10 years." (`techtakes`, opened 2h ago, closes in 4h) |
| `devfx_arena_room_open` | OPEN room on that topic: 6 debaters, 8 arguments, 2 link citations, reactions |
| `devfx_arena_topic_settled` | **Closed** topic — "Remote-first startups ship slower than in-person ones." |
| `devfx_arena_room_settled` | SETTLED room + result: AGREE 3–2, best argument, 50% Mindshift |

Three extra synthetic debaters come with it: `@dev_arena_maya`, `@dev_arena_rohit`,
`@dev_arena_sana`.

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

This also (re)creates the local developer auth user:

| Email | Password |
|-------|----------|
| `dev@clash.local` | `clash-local-dev` |

Physical Android + local stack: see `docs/LOCAL_DEVICE_SUPABASE.md`.

## How to test in the app

1. Sign in with **your normal** account (not `@clash_test` — that profile has no auth login).
2. Open Arena / search and find Takes from **`@clash_test`**.
3. **Create flow:** open `devfx_take_fresh_*` → write a reply → tap **CLASH** on your reply → Standard or Blind → immersive Clash screen.
4. **Judge flow:** open `devfx_take_open_std` or `devfx_take_open_blind` → enter Clash → judge (you are not a participant).
5. **Result flow:** open `devfx_take_settled` → verdict / share UI.

### Live Daily Arena

6. **Join flow:** Arena home shows **TODAY'S ARENA** above Fresh Takes → tap **Agree** or
   **Disagree**. `join_arena_topic` places you in the oldest non-full OPEN room, which is
   `devfx_arena_room_open`, so you land in a room that already has six people arguing.
7. **Room flow:** post arguments, reply, react, **Add Proof** (a public `https` link, or a
   photo/video upload), and mark someone else's citation useful.
8. **Verdict flow:** deep-link to `/arena/room/devfx_arena_room_settled`. The result, best
   argument and Mindshift percent are public, so they render for anyone — the **transcript
   does not**, because room messages are members-only and you never joined that room. The
   screen says so instead of erroring. There is no in-app link to a settled room you were
   not in; this is a deep link for testing.

Phase transitions (`OPEN → FINAL_ARGUMENTS → JUDGING → SETTLED`) are driven by
`run_maintenance`, which is service-role only. To see the judging panel locally, move
`devfx_arena_topic_live`'s `judging_at` into the past and run
`select public.run_maintenance(500);` as `postgres`.

## Safety guarantees

- **Not a migration** — `supabase db push` / production migrate paths never run this file.
- **Local seed path only** — listed under `[db.seed]` for `supabase db reset`.
- **Runner guard** — `npm run supabase:seed:clash-dev` only talks to `supabase_db_clash`.
- **SQL soft guard** — refuses non-local/non-Docker server addresses.
- Does **not** weaken RLS, own-Take Clash bans, or app auth gates.
- Writes **no** `reputation_events` for the settled Arena room — settlement pays
  reputation, and a seed must not move a real ledger or the pgTAP counters.
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
