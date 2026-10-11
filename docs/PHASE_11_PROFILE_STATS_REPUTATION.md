# Phase 11 Step 2B — Profile Clash stats & facet reputation

## Authoritative definitions

| Term | Definition |
| --- | --- |
| **Clash participation (list)** | Rows from `profile_clash_list`: the profile is take author or challenger. Open Blind matches are omitted for non-participants. |
| **Settled clash (stats `clashes`)** | `clashes.status = 'settled'` **and** a `verdicts` row exists. Open, cancelled, and settled-without-verdict are excluded. |
| **Win** | Settled verdict where the profile’s side won: author + `winner_side = 'A'`, or challenger + `winner_side = 'B'`. |
| **Loss** | Settled verdict that is not a draw and not a win for that profile. |
| **Draw** | Settled verdict with `winner_side = 'DRAW'`. Draws are **not** wins. |
| **Facet reputation** | Per-facet scores in `profile_reputation_facets`, derived from `reputation_events`. Exposed own-only via `get_my_arena_reputation`. |
| **Reputation total** | `profiles.reputation` (global Clash ladder). Unchanged by this step. |

A participated clash is **not** automatically a win. Counts use verdict semantics identical to `profile_clash_list.outcome`.

## RPC

`profile_clash_stats(p_profile_id text) → jsonb`

Returns `{ clashes, wins, losses, draws }`.

Visibility mirrors the list RPC:

- `arena_take_readable(take_id)`
- `not arena_actor_hidden_internal(viewer, challenger_id)`

No opponent identities or take text are returned (aggregate only).

## Client contract

- `toUser` sets `wins` / `clashes` to `null` (not loaded).
- `fetchProfileById` / `fetchViewerProfile` hydrate via the RPC when possible.
- On RPC failure, fields stay `null`. UI shows `—` / omits the social chips — never a fake verified zero.
- Verified zero is only shown after a successful RPC payload with zeros.

## Reputation integration

- Own-only facets + standing from `fetchMyArenaReputation` render as a single meta line under `ReputationBar` on self profile (Arena + Vault).
- No public facet UI (backend is own-only by design).
- No new scoring rules or settlement changes.

## Ambiguities / privacy notes

1. **`reputation_events` SELECT is public** (`using (true)`). Facet table RLS is own-only. Ledger rows may expose more than facet aggregates; left unchanged in this step (report-only).
2. **Stats are viewer-scoped** when blocks/mutes hide a challenger: two viewers can see different aggregates for the same profile. Matches list RPC behavior.
3. **`profile_clash_list` is capped at 30**; stats count all matching settled rows (no client aggregation of the list).
4. **Public facet / standing cards** for other profiles would need a new authorized read contract — not built here.

## Validation

See the PR description for exact `typecheck`, `test:unit`, `expo-doctor`, and pgTAP results.
