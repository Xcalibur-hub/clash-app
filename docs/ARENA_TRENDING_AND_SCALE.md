# Arena Trending + 1K scale path

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
