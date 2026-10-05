# Arena Trending + 1K scale path

### Visibility (never hidden while history builds)

The module is visible whenever there is a ranked topic — history is NOT a
precondition.

| State | Ranking list | Graph area |
|--|--|--|
| No live topics | calm plate: "No live battles right now" | not drawn |
| Topics, **0 snapshots** | current Top 10, #1/#2/#3, ENTER BATTLE | `LIVE RANKING` + "Building today's trend history…" + a marker per topic at its current rank |
| 1 snapshot | same | markers only (a single point is not a line) |
| 2 snapshots | same | first real line segments |
| 3+ snapshots | same | the ranking race, crossings included |

Server side, `list_arena_trending_battles` returns:

1. **scored** topics first (recency-weighted attention > 0, unchanged ordering), then
2. **live topics whose history is still building** — attention `0`, `series: []`,
   `historyReady: false`, `rankDeltaKind: INSUFFICIENT`, ranked by live Arena
   presence for the tie-break.

Nothing is invented: a presence row carries zero attention and never gets a
synthetic historical point, and a closed topic with no recent activity still
stays out of the ranking.

### Development preview (DEMO DATA)

Real history only advances every ~10 minutes, so the finished chart cannot be
inspected on-device without waiting hours. `utils/arenaTrendDevFixture.ts`
provides a deterministic sample with genuine overtakes:

| Battle | Ranks (oldest → now) |
|--|--|
| AI vs Jobs | 1 → 1 → 2 → 3 |
| iPhone vs Pixel | 5 → 4 → 2 → 1 |
| College Worth It | 3 → 2 → 1 → 2 |

plus seven subdued topics to fill the Top 10.

Enable it (development only):

1. set `ARENA_TREND_DEMO_ENABLED = true` in `utils/arenaTrendDevFixture.ts`, or
2. `EXPO_PUBLIC_ARENA_TREND_DEMO=1` in `.env.local` and restart Metro.

It is refused unless `__DEV__` is true **and** the app variant is `development`,
so a release build can never show it. While active the section shows a `DEMO
DATA` badge, skips every analytics event, never calls the RPC and never writes to
Supabase. Snapshots keep their real ~10-minute cadence — the fixture only
changes what one development screen draws.

## Ranking race (Phase 4.1)

Home chart Y-axis is **rank** (#1 at top), not raw attention.

### Current Top 10

Recency-weighted sum of snapshot attention:

| Age | Weight |
|--|--|
| 0–30m | 1.00 |
| 30–60m | 0.65 |
| 1–3h | 0.30 |
| 3–6h | 0.10 |

Tie-break: recent unique actors, then `topic_id`.

### Historical ranks

For each snapshot bucket in the last 6h, rank all topics by that bucket's attention.  
`series: [{ t, v }]` where **`v` is rank** (1 = top). Lines cross when topics overtake.

### Rank movement

Compare current rank vs rank at the bucket ≈1 hour ago.

- `↑N` / `↓N` places
- `NEW` when no hour-ago rank but history exists
- `—` when insufficient

### Client refresh

While Arena Home is focused/active: refetch every **45s**.  
Paused when AppState is backgrounded.  
Server snapshots remain ~10 minutes via maintenance.

## Attention formula (server-authoritative)

Per 10-minute bucket, for each `arena_daily_topics` row (all rooms under it):

```
score =
  min(unique_message_authors, 40) * 10
+ min(unique_reaction_actors, 80) * 3
+ min(unique_evidence_authors, 20) * 6
+ min(unique_join_actors, 40) * 5
```

- Hidden messages / evidence excluded.
- Unique actors only — 100 reactions from one account count as **one** reactor.
- Caps prevent a single signal class from dominating.

This is **attention**, not truth, stance, approval, or argument quality.

## Momentum

Compare sum(attention) last 30 minutes vs previous 30 minutes.

- Sample floor: `unique_actors < 3` → `STEADY` (no arrow noise).
- `+25%` → `RISING` (↑)
- `-25%` → `COOLING` (↓)
- else `STEADY` (→)
- Numeric `%` only when `unique_actors >= 5` and prior score `>= 8`.

## Snapshots

| | |
|--|--|
| Table | `arena_trend_snapshots` |
| Interval | 10 minutes (maintenance skips if latest bucket < 9m old) |
| Retention | 36 hours |
| Writer | `refresh_arena_trend_snapshots` via `run_maintenance` (service_role) |
| Reader | `list_arena_trending_battles` (max 10) |

Verified schedule (evidence, not assumption):

```sql
select jobname, schedule, command, active from cron.job where jobname = 'clash-maintenance';
--   clash-maintenance | * * * * * | select public.run_maintenance(500) | true

select pg_get_functiondef('public.run_maintenance(integer)'::regprocedure)
  like '%refresh_arena_trend_snapshots%';
--   true

select status, start_time from cron.job_run_details order by start_time desc limit 3;
--   succeeded every minute

select public.refresh_arena_trend_snapshots(10, 36);
--   {"pruned": 0, "bucketAt": "...", "topicsWritten": 4}
```

`refresh_arena_trend_snapshots`, `arena_attention_score` and `run_maintenance` are
executable only by the owner and `service_role` — never `anon`, `authenticated` or
`PUBLIC` — so a client can neither trigger nor read the sweep.

## Realtime before → after

| Before | After |
|--|--|
| INSERT → debounced **full newest page** (+ gap) for every client | INSERT → **single-message hydrate** (`get_arena_room_message`) |
| Dual list RPC on every post | Periodic reconcile every **30s** + reconnect gap recovery |

## Pulse before → after

| Before | After |
|--|--|
| Every client recomputes every **15s** | Shared `arena_room_pulse_cache` (~12s TTL) + advisory lock |
| Same poll for spectators | Spectators **45s**, debaters **20s** |

## Scale path

| Users | Architecture |
|--|--|
| **1K** | This phase: snapshot trends, pulse cache, targeted hydrate, indexes |
| **10K** | Stronger pagination RPCs for home feed; presence fan-out trim; CDN media |
| **100K** | Partition high-fanout rooms; edge cache for trending; read replicas |
| **1M** | Dedicated realtime / edge workers if demand proves it — **not** a premature leave-Supabase move |

## Load test

```bash
node scripts/arena-load-test.mjs --scenario trending --concurrency 100
```

Reports actual p50/p95/p99. Caps concurrency to `ARENA_LOAD_MAX` (default 120) when the machine cannot honestly run 1,000 clients.

### Measured locally (2026-10-05, local Supabase)

| Sample | n | p50 | p95 | p99 | errors |
|--|--|--|--|--|--|
| `list_arena_trending_battles` | 80 concurrent | 529ms | 602ms | 603ms | 0 |
| `refresh_arena_trend_snapshots` | 1 | 20ms | 20ms | 20ms | 0 |

Notes:
- Requested 80; not capped.
- Full 1,000 concurrent clients were **not** run on this workstation — use `ARENA_LOAD_MAX` / higher hardware to raise.
- Authenticated Pulse/message fan-out still needs member JWTs in the harness (documented as remaining work).
