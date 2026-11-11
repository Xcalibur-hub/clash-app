# Beta Readiness: Staging Integration & Server Authorization Audit

- **Date:** 2026-11-11
- **Workspace / Git Baseline:** `<REPO_ROOT>`, branch `arena-ui-review`, `HEAD` `2b898748a48e317ac5737da62c7a964f50aca2a8`, intentionally dirty working tree, staged index empty.
- **Audit Mode:** Strictly read-only DB metadata inspection on isolated stack `clash-live-b4-20261101` + repository SQL/TypeScript/Edge contract review + offline Node regressions. **Zero live writes, zero credential reads/exports, zero migrations applied, zero duels created.**
- **Preservation:** All `9` historical duels (`6` open, `3` settled; including Duel #9 `cl_f30fafaf12143a92` / `ar_a994878035b35d24`) and all security/device manifests remain completely untouched.

## Evidence Classification Legend

| Tag | Meaning |
|---|---|
| `SOURCE-REVIEWED` | Verified by reading TypeScript services, UI hooks, migrations, or Edge Function source files in this checkout. |
| `LIVE-DB-METADATA` | Queried read-only from live `clash-live-b4-20261101-db` system catalogs (`pg_proc.proacl`, `pg_policies`, `pg_trigger`, `information_schema`, row counts, `cron.job`, `storage.buckets`). |
| `PGTAP-SOURCE` | Assertions present in `supabase/tests/*.sql` (`056`, `070`, `meet_*`); **not** re-executed on PostgreSQL during this audit. |
| `OFFLINE-VERIFIED` | Executed locally in `node --test` against production JS/TS hooks/services with mocked Supabase transport & static SQL/Edge regex checks. |
| `NOT-VERIFIED-LIVE` | End-to-end authenticated HTTP execution against deployed Kong/PostgREST/Edge Functions + A50 hardware — remains blocked pending owner staging authorization & runtime gaps below. |

---

## 1. Backend Contract & Server Authorization Audit

### 1.1 Domain Summary Matrix

| Domain | Guest vs Authenticated | Identity & Authorization Enforcement | Integrity / Recovery / Concurrency | Audit Classification & Evidence |
|---|---|---|---|---|
| **Canonical Challenges & Inbox** (`create_arena_challenge`, `resolve_arena_challenge`, `list_my_arena_challenges`, `list_arena_challenges`) | `anon` **revoked** in `pg_proc.proacl`; only `authenticated` (not `service_role`) holds `EXECUTE`. Zero `INSERT/UPDATE/DELETE` table grants on `arena_challenges`. | Caller derived server-side via `public.my_profile_id()`. Self-challenge rejected (`42501`/`P0004`); only Take author (`challenged_id`) can `ACCEPT`/`PASS`, only `challenger_id` can `CANCEL`. Block/mute checks (`arena_actor_hidden`) and `not t.is_runtime_fixture` enforced in RLS & RPCs. | Locks parent `takes` row `for update` inside `resolve_arena_challenge` and `guard_challenge_active_duel`; `ACCEPT` atomically calls `create_arena_duel` returning canonical `clashId` + `roomId`. Client `ChallengeInbox` verifies `id`, `takeId`, and `linkedRoomAfterAccept` before `router.push('/arena/room/<roomId>')`. | **STRONG CORE + TWO GAPS** (`LIVE-DB-METADATA`, `SOURCE-REVIEWED`, `OFFLINE-VERIFIED`): see **F1** (`takes.text` mutability) & **F3** (legacy `start_clash`). Live multi-actor HTTP resolution is `NOT-VERIFIED-LIVE`. |
| **Onboarding Interests** (`get_my_arena_interests`, `save_my_arena_interests`, `arena_interest_preferences`) | `anon` **revoked**; only `authenticated` holds `EXECUTE`. Table RLS `SELECT` owner-only (`auth_user_id = auth.uid()`); zero client `INSERT/UPDATE/DELETE` privileges. | Derived purely from `auth.uid()`. Unknown/inactive topics rejected (`22023`); must select `3..5` unique active topics unless `p_skip = true` with `{}`. Client `saveMyArenaInterests` re-checks `currentUserId()` before & after RPC (`account_changed`). | Advisory lock `pg_advisory_xact_lock` + `for update`; mismatch against `p_expected_revision` raises `PT409` without mutating row (`20261008135500`). Hook `useArenaInterestEditor` preserves draft, sets `needsReload`, avoids blind replay, and fences unmount/focus/account switch. | **VERIFIED STRONG** (`LIVE-DB-METADATA`, `SOURCE-REVIEWED`, `OFFLINE-VERIFIED`). Live `PT409` & persistence HTTP sequence is `NOT-VERIFIED-LIVE` (`0` rows currently in DB). |
| **Discovery, Explore & Historical Takes** (`get_explore_for_you`, `list_arena_clash_discovery`, `rank_arena_for_you`, `takes`, `VaultProfileTakes`) | `takes` allows `anon` `SELECT` (permissive `true` for `anon`, restrictive `status <> 'removed'` for `{anon,authenticated}`); `get_explore_for_you`, `list_vault_discover_worlds`, `list_vault_discover_offers`, `verdicts`, `arena_rooms` allow `anon` `EXECUTE`/`SELECT`. `list_arena_clash_discovery` & `rank_arena_for_you` revoke `anon` (`authenticated` only). | Curated RPCs exclude `is_runtime_fixture`, removed/expired rows, and mutual `blocks`/`mutes` (`explore_actor_hidden_internal`). `VaultProfileTakes` enforces signed-in gate client-side before calling `fetchProfileTakes` (`SELECT * FROM takes`). | Client discovery refresh uses single-flight guards and account/focus epoch checks, clearing cached cards on `42501` while labeling transport errors on retained items. | **PARTIAL / POLICY REVIEW** (`LIVE-DB-METADATA`, `SOURCE-REVIEWED`): see **F4** (`takes` direct REST exposes expired & `is_runtime_fixture` rows to `anon` and authenticated callers). |
| **Vault Read-Only vs Creation, Commerce, Groups, AI, Play, World & Meet** | Read RPCs (`vault_storefront`, `vault_drop_card`, `list_vault_discover_*`) grant `anon, authenticated`; `vault_drops` RLS checks `owns_profile(creator_id) OR is_staff() OR can_access_vault_drop(my_profile_id(), id)`. **All deferred write RPCs grant `EXECUTE TO authenticated`** (`create_creator_*`/`request_creator_service` also retain `anon` ACL, checking `my_profile_id() is null` -> `42501`). | `can_access_vault_drop` raises `42501` if `p_viewer_profile_id is distinct from my_profile_id()` (unless `service_role`). `vault-media-access` & `arena-assist-media-access` verify bearer JWT as caller via Postgres RPC before `service_role` signs `private-media` (`public = false`). Client `assertReleaseAdmission` blocks deferred write wrappers (`unavailable_in_release`). | **Client `utils/releaseScope.ts` (`{}`) is NOT server enforcement.** Any authenticated REST caller can directly invoke `create_vault`, `create_vault_drop`, `publish_vault_drop`, `create_collection`, `create_vault_community`, `enter_vault_community`, `create_creator_service`, `request_creator_service`, `create_creator_course`, `create_creator_product`, `create_creator_live_session`, `create_creator_world_drop`, `start_creator_ai_conversation`, `create_arena_crew`, `join_arena_crew`, `join_challenge`, `join_treasure_hunt`, `create_world_drop`, `create_sponsor_campaign`, `create_media_upload`, `join_meet_queue`, `poll_meet_queue`, `next_meet`. | **CRITICAL BETA BOUNDARY GAP** (`LIVE-DB-METADATA`, `SOURCE-REVIEWED`, `OFFLINE-VERIFIED`): see **F2**. Even `20261028210000_meet_new_admission_gate.sql` is unapplied on `clash-live-b4-20261101-db`. Edge Functions are absent from `clash-live-b4-20261101` stack (`NOT-VERIFIED-LIVE`). |
| **Arena Room, Official Arguments & Judging** (`get_arena_room`, `watch_arena_room`, `submit_judgement`, `submit_arena_official`) | `get_arena_room` grants `anon, authenticated`; `watch_arena_room`, `submit_judgement`, `submit_arena_official`, `list_arena_official_page` revoke `anon` (`authenticated` only). | `guard_arena_duel_participant` prevents spectators from posting official arguments; `submit_judgement` rejects debaters/self-votes & duplicates; `judgements` RLS hides ballots except juror & staff. | `arena_duel_take_identity` locks `clashes.duel_key/take_id/challenger_id/mode`, `arena_rooms.clash_id/topic_id`, and `takes.author_id`. Dual settlement idempotency verified in Duel #9. | **VERIFIED STRONG (CORE)** except inherited **F1** (`takes.text` mutability during open duel) and unverified duplicate-ballot HTTP probe (`NOT-VERIFIED-LIVE` by prior owner exclusion). |

### 1.2 Detailed Audit Findings

#### `[F1 — HIGH]` Side A Proposition (`takes.text`) Remains Mutable After Challenge Creation and Mid-Duel
- **Verified Fact (`LIVE-DB-METADATA` + `SOURCE-REVIEWED`):**
  - `information_schema.column_privileges` on `clash-live-b4-20261101-db` grants `UPDATE (hood, media_caption, media_colors, media_duration, media_kind, media_url, text)` on `public.takes` to `authenticated` under RLS policy `"takes are edited by their author or a hood moderator"` (`owns_profile(author_id) OR is_hood_moderator(hood)`).
  - Live `pg_trigger` on `public.takes` has ONLY three triggers: `trg_take_create_limits` (`BEFORE INSERT`), `challenged_take_author` (`BEFORE UPDATE OF author_id` -> `guard_challenged_take_author()`), and `arena_duel_take_identity` (`BEFORE UPDATE OF author_id` -> `guard_arena_duel_identity()`).
  - Live `clash_view` / `arena_room_payload` reads live `t.text` dynamically as `'sideAText'` rather than storing an immutable snapshot on `clashes` (`arena_daily_topics.title` copies `left(v_take.text, 140)` at `create_arena_duel` time, leaving full `sideAText` mutable).
- **Risk:** A Take author can issue a direct PostgREST `PATCH /rest/v1/takes?id=eq.<take_id>` after receiving a challenge (or while spectators/jurors are judging) to invert or alter Side A's proposition while Side B's `counter_position` remains locked in `arena_challenges`.
- **Required Remediation Before Public Beta:** Extend `guard_challenged_take_author()` / `guard_arena_duel_identity()` (or replace the update trigger on `takes`) to fire on `BEFORE UPDATE OF author_id, text, hood, media_url, media_kind, media_caption, media_colors, media_duration` whenever an active/accepted `arena_challenges` or canonical `clashes` row exists for `old.id`, OR freeze `side_a_text` snapshot inside `clashes` / `arena_room_payload`.

#### `[F2 — HIGH]` Deferred Beta Features Have Zero Server-Side Admission Enforcement Outside Unapplied Meet Migration
- **Verified Fact (`LIVE-DB-METADATA` + `SOURCE-REVIEWED`):**
  - `config/release-targets.json` is `{}` and `utils/releaseScope.ts` restricts client wrappers for `'creator'`, `'commerce'`, `'groups'`, `'live'`, `'world'`, `'play'`, `'ai'`, `'sponsorship'`, `'media'`, `'meet'` to throwing `unavailable_in_release`.
  - Repository `supabase/migrations/*.sql` contains **zero** references to `assert_release_admission`; ONLY Meet (`20261028210000_meet_new_admission_gate.sql`, currently unapplied on `clash-live-b4-20261101-db`) implements a server gate (`assert_meet_new_admission()`).
  - Live `pg_proc.proacl` confirms `authenticated` can directly invoke `SECURITY DEFINER` RPCs for `create_vault`, `create_vault_drop`, `publish_vault_drop`, `create_collection`, `create_vault_community`, `enter_vault_community` (inserts membership directly into `vault_community_memberships`), `create_creator_service`, `request_creator_service`, `create_creator_course`, `create_creator_product`, `create_creator_live_session`, `create_creator_world_drop`, `start_creator_ai_conversation`, `create_arena_crew`, `join_arena_crew`, `join_challenge`, `join_treasure_hunt`, `create_world_drop`, `create_sponsor_campaign`, `create_media_upload`, `join_meet_queue`, `poll_meet_queue`, and `next_meet`.
- **Risk:** Bypassing the React Native UI (via `curl` or PostgREST using any signed-in user JWT + public `EXPO_PUBLIC_SUPABASE_ANON_KEY`) allows creating Vaults, Drops, Communities, Services, AI conversations, Sponsorships, Crews, and Meet queues despite being "deferred" in beta scope.
- **Required Remediation Before Public Beta:** Apply `PHASE_6E`/`6G5` admission pattern server-side for every feature omitted from beta scope (deny at Postgres RPC + storage upload purpose boundaries while preserving authorized read/exit paths), and apply `20261028120000` + `20261028210000` to target staging/production DBs before public rollout.

#### `[F3 — MEDIUM/HIGH]` Legacy `start_clash` RPC Bypass Remains Active for Authenticated Callers
- **Verified Fact (`LIVE-DB-METADATA` + `SOURCE-REVIEWED`):**
  - MVP1 removed client UI calls to legacy `start_clash`, yet `public.start_clash(text, text, clash_mode)` remains `SECURITY DEFINER` with `authenticated=X/postgres` in `clash-live-b4-20261101-db`.
  - Its body checks self-challenge, `takes.status = 'active' and expires_at > now()`, comment ownership, duplicate `(take_id, challenger_id)` open clash, and hourly rate limit (`3/hour`), **but** does not require Take-author consent, does not check `arena_actor_hidden`, does not exclude `is_runtime_fixture`, and bypasses `guard_challenge_active_duel` (which checks `if new.duel_key is not null`, leaving `duel_key IS NULL` open for concurrent legacy clashes on a Take already in a canonical Challenge/Duel).
- **Required Remediation Before Public Beta:** Revoke `EXECUTE` on `public.start_clash` from `public, anon, authenticated` (or fail closed inside `start_clash` when deprecated) via migration once legacy replay compatibility is confirmed.

#### `[F4 — MEDIUM]` Direct REST `takes` Reads Expose Expired Takes to `anon` and Fail to Filter `is_runtime_fixture`
- **Verified Fact (`LIVE-DB-METADATA` + `SOURCE-REVIEWED`):**
  - Client `VaultProfileTakes` disables loading for guests (`!user`), presenting historical Takes as a signed-in capability.
  - At the Postgres layer, `takes` has permissive `SELECT` policy `"takes are publicly readable"` for `{anon}` (`qual: true`) combined only with restrictive `"removed takes are not public content"` (`status <> 'removed'`). Neither RLS nor column grants prevent `anon` (or `authenticated`) REST queries from reading expired Takes or `is_runtime_fixture = true` rows directly from `/rest/v1/takes`.
- **Guidance:** Confirm explicitly whether expired Takes on profiles are intended public reads; either way, add a `RESTRICTIVE` RLS policy excluding `is_runtime_fixture = true` from client `SELECT` on `takes` (or isolate fixtures) so raw table queries match curated discovery (`list_arena_clash_discovery`, `get_explore_for_you`).

---

## 2. Read-Only Isolated Environment Preflight (`clash-live-b4-20261101`)

| Check | Observed Value / Status | Implications for Staging Plan |
|---|---|---|
| PostgreSQL `system_identifier` | `7703813712308420644` (port `127.0.0.1:55622->5432`) | Matches accepted isolated sandbox identity cleanly. |
| Running Containers (`clash-live-b4-20261101-*`) | `db` (`55622`), `auth` (`55623`), `rest` (`55624`), `realtime` (`55625`); all bound to `127.0.0.1`. | **Missing Edge Runtime / Kong / Storage containers** (`vault-media-access`, `arena-assist-media-access`, `arena-gifs`, `arena-editorial` cannot be executed against `clash-live-b4-20261101` without starting Kong/Edge/Storage services). |
| Applied Migrations Ledger | `112` applied (`max = 20261031161138`) vs `114` files in `supabase/migrations/`. | Missing from DB: `20261028120000_meet_cancel_search.sql` & `20261028210000_meet_new_admission_gate.sql`. |
| Background Scheduler (`pg_cron`) | `jobid=1`, `active=t`, `schedule='* * * * *'`, `command='select public.run_maintenance(500)'` | Auto-transitions expired Takes/Challenges/Clash windows every minute. Any staging run must account for active maintenance transitions when timing Challenge TTLs or open windows. |
| Storage Buckets (`storage.buckets`) | `public-media` (`public=t`), `private-media` (`public=f`) | Private bucket ACL fails closed at bucket config level (`public=false`). |
| Existing Baseline Counts (`9/9/9/7`) | `takes=9` (`0` fixtures; `3` active/unexpired: `take_c1aff10b2d7ffffb`, `take_eadac04c6731e5ad`, `take_f878b22750b963e2`; `6` expired), `clashes=9` (`6 open`, `3 settled`), `arena_rooms=9` (`6 OPEN`, `3 SETTLED`), `arena_challenges=9` (`9 ACCEPTED`), `judgements=7`, `arena_interest_preferences=0`, `arena_interests=7` active, `creator_vaults=0`, `vault_drops=0` | Completely clean and intact prior baseline (Duel #9 preserved untouched). Note active non-settled historical Takes exist; any staging test must create its own clearly tagged Take rather than touching those `9` historical rows. |
| Existing Fictional Test Actors (`auth.users = 4`) | `A`: `u_33afa4d3292c44588ab1af8d205bf330` (`@user_e96d92`)<br>`B`: `u_a51490dc6a2944d482c4c6d0f86b766e` (`@user_e1a62a`)<br>`C`: `u_64ad1836fba14aa299af8d0492178af` (`@user_446000`)<br>`D`: `u_8b5fd32553bb4823925351be3e71bda4` (`@user_3b9149`) | Existing fictional identities suffice cleanly; no user creation or credential export performed. |

---

## 3. Minimal Bounded Multi-Actor Staging Integration Plan (Proposal Only — Not Authorized to Execute)

### 3.1 Actors, Target & Exact Mutation Budget

- **Target Environment:** Isolated sandbox `clash-live-b4-20261101` (`system_identifier = 7703813712308420644`), accessed via localhost endpoints (`55623` Auth / `55624` REST / optional Metro/Gateway or Kong if enabled for Edge checks).
- **Fictional Actors:**
  - `Actor A` (`u_33afa4d3292c44588ab1af8d205bf330`) — Challenger (REST/script session; no credential dump).
  - `Actor B` (`u_a51490dc6a2944d482c4c6d0f86b766e`) — Take Author & Challenge Inbox acceptor (physical Samsung A50 or dedicated Auth session).
  - `Actor C` (`u_64ad1836fba14aa299af8d0492178af`) — Outsider / Unauthorized actor & Onboarding Interest actor (REST/script session).
- **Strict Non-Destructive Write Budget (Exact Table Deltas):**
  - `public.takes`: **+1** row (`author_id = B`, prefix `[STAGE-INT]`, `is_runtime_fixture = false`, natural 24h expiry).
  - `public.arena_challenges`: **+1** row (`challenger_id = A`, `challenged_id = B`, `status: PENDING -> ACCEPTED`; natural 15m/24h challenge expiry).
  - Resulting `ACCEPTED` cascade (created **solely** by `resolve_arena_challenge(ACCEPT)`): `public.clashes` **+1** (remains open/expires naturally; **0 judgements**, **0 verdicts**, **no settlement/voting executed**), `public.arena_daily_topics` **+1**, `public.arena_rooms` **+1**, `public.arena_room_participants` **+2** (`B`, `A`), `public.notifications` **+2**.
  - `public.arena_interest_preferences`: **+1** row (`auth_user_id` of `Actor C`, transitioning `revision 0 -> 1 -> 2` cleanly; stale conflict test leaves count unchanged).
  - **Explicit Zero-Write Guardrails:** **0** modifications/deletions/settlements on the existing `9` historical duels (`takes`, `clashes`, `arena_rooms`, `arena_challenges`, `judgements`, `verdicts`); **0** writes to `creator_vaults`, `vault_drops`, `creator_services`, `meet_*`.

### 3.2 Bounded 8-Step Execution Sequence

| Step | Action & Actors | Expected Server & Client Verification | Budget / Failure Gate |
|---|---|---|---|
| **0. Pre-Check & Snapshot** | Read-only SQL snapshot of all `9` historical `clashes`/`takes`/`rooms`/`challenges`/`judgements` IDs + counts (`9/9/9/9/7`). Verify valid sessions without printing secrets. | Baseline hash/counts recorded before any staging write. | `0` writes. Abort if counts differ. |
| **1. Publish Synthetic Take** | `Actor B` publishes `1` synthetic text Take via `create_take` (`text: "[STAGE-INT] ..."`). | Take returns server-assigned `id` (`t_stage`) with `author_id = B`, visible to `A` and `C`, excluded from `is_runtime_fixture` exclusions. | `takes: +1`. Abort if fails. |
| **2. Canonical Challenge + Negative Probes** | (a) Unauthenticated (`anon`) calls `create_arena_challenge` -> must return `401`/`42501`. (b) `Actor B` calls `create_arena_challenge(t_stage, ...)` (self-challenge) -> must fail `42501`/`P0004`. (c) `Actor A` submits canonical challenge via `create_arena_challenge(t_stage, counterPosition)` -> returns `PENDING` `challenge_id`. (d) `Actor A` immediately sends duplicate challenge on `t_stage` -> must fail (`P0006`/conflict) with `0` extra rows. | Server derives `challenger_id = A`; rejects anon, self-challenge, and duplicate. Challenge count = `+1` (`10` total). | `arena_challenges: +1` total. |
| **3. Author Receives Invitation in Challenge Inbox** | `Actor B` queries `list_my_arena_challenges('INCOMING')` / opens `/arena/challenges` on physical A50. Outsider `Actor C` queries `list_my_arena_challenges('INCOMING')` and REST `GET /rest/v1/arena_challenges?id=eq.<challenge_id>`. | `Actor B` sees `challenge_id` (`status = PENDING`, `source.title`, `counterPosition`). `Actor C` sees `[]` / `0` rows (party-only RLS verified live). | `0` writes. |
| **4. Outsider & Challenger Rejections Before Accept** | (a) `Actor C` calls `resolve_arena_challenge(challenge_id, 'ACCEPT')` -> `42501`. (b) `Actor A` calls `resolve_arena_challenge(challenge_id, 'ACCEPT')` (challenger cannot self-accept!) -> `42501`. (c) `anon` calls `resolve_arena_challenge` -> `401`. | All three unauthorized attempts rejected by server; `arena_challenges` stays `PENDING`, `clashes` stays `9`. | `0` writes. |
| **5. Author Accepts via Canonical API & Server Returns Room** | `Actor B` taps `Accept` in Challenge Inbox (or calls `resolve_arena_challenge(challenge_id, 'ACCEPT')`). `Actor B` re-submits `ACCEPT` once (`idempotent / already resolved` failure or status check) to confirm double-submit safety. | Response contains `status = 'ACCEPTED'`, matching `id = challenge_id`, `takeId = t_stage`, non-null `clashId` and `roomId`. Postgres records `clashes: 10`, `arena_rooms: 10`. | `clashes: +1`, `arena_rooms: +1`, `participants: +2`. |
| **6. Native A50 Room Navigation & Boundary Check** | Physical Samsung A50 (`Actor B`) transitions automatically from `/arena/challenges` -> `/arena/room/<roomId>`. Capture XML/logs showing exact matching `<roomId>` & `<clashId>`, then test outsider `Actor C` attempting `submit_arena_official(roomId, ...)` via API -> must fail (`42501`, non-debater rejected by `guard_arena_duel_participant`). | Client pushes strictly `/arena/room/<confirmedRoomId>`, retaining Inbox stack on Back; server blocks outsider official post. No ballot submitted; room settles/closes via natural TTL without voting. | `0` extra writes. |
| **7. Interests Persistence, Recovery & `PT409` Conflict** | `Actor C` verifies empty state via `get_my_arena_interests` (`revision = 0`). Save 3 topics -> `revision = 1`. Simulated stale retry submitting `p_expected_revision = 0` -> must fail with SQLSTATE `PT409` cleanly without changing `topic_ids` or bumping revision. Authorized update with `p_expected_revision = 1` succeeds (`revision = 2`).Verify `Actor A` cannot read `Actor C`'s `arena_interest_preferences` via REST. | `PT409` optimistic lock & RLS owner isolation verified live against real Postgres. Client hook UI retains selections across failure & succeeds after Retry. | `arena_interest_preferences: +1`. |
| **8. Discovery & Vault Authorization Probe + Post-Check** | (a) Verify `get_explore_for_you` / `list_arena_clash_discovery` include `t_stage`/clash cleanly and exclude removed/hidden items cleanly. (b) Verify `vault_drop_card` returns `null` `publicMedia` & `can_access_vault_drop` raises `42501` if `p_viewer_profile_id` spoofs another actor. (c) Record server enforcement verdict on deferred Vault writes / `start_clash` gap **explicitly** (if test migration for server deferral is applied pre-run, probe `42501`/denial; otherwise do NOT call un-gated `create_vault` to avoid polluting `creator_vaults`, keeping vault write count strictly `0`!). (d) Run final read-only SQL check verifying original `9` historical duels are **bit-for-bit preserved**. | Historical baseline `9` duels verified unchanged (`takes` total `10`, historical `9` untouched; `judgements = 7`, `verdicts = 3`, `vaults = 0`). | `0` Vault writes; `9` historical duels untouched. |

### 3.3 Expiration, Cleanup & Rollback Limits

- **Expiration & Scheduler Awareness:** `pg_cron` runs `select public.run_maintenance(500)` every minute (`* * * * *`) on `clash-live-b4-20261101-db`. The `+1` synthetic Take (`24h`), Challenge (`24h`/default window), and `ACCEPTED` Room (`opens_at`/`closes_at` natural windows from `arena_challenge_duration()` / `create_arena_duel()`) transition naturally without synthetic time mutation or clock hacks.
- **Rollback Limits (Honest Statement):** Committed HTTP/RPC Postgres transactions across Steps 1–7 (`takes`, `arena_challenges`, `clashes`, `arena_rooms`, `arena_interest_preferences`) **cannot auto-rollback** after HTTP `200` commit. Rather than running risky ad-hoc `DELETE` cascades over foreign-keyed rows (which could endanger historical preservation), synthetic rows remain cleanly isolated in `clash-live-b4-20261101-db` identified by `[STAGE-INT]` / recorded baseline snapshot IDs, leaving the prior `9` duels completely separate and verifiable via ID exclusion. If clean reset is later desired, restore or clone a fresh isolated stack rather than manually deleting individual rows alongside historical duels.

### 3.4 Required Owner Authorization Before Any Execution Step

No execution may start without explicit written owner authorization specifying:
1. Approved isolated project (`clash-live-b4-20261101`) & DB `system_identifier` (`7703813712308420644`).
2. Approved session/auth provisioning for fictional actors `A`, `B`, `C` without credential extraction or secret logging.
3. Explicit write budget: **+1 synthetic Take**, **+1 canonical Challenge -> ACCEPTED Duel (open only; 0 ballots/settlements)**, **+1 `arena_interest_preferences` row** (`0` Vault writes; `0` mutations to the `9` historical duels).
4. Explicit decision on **Pre-Beta Gaps (`F1`–`F3`)**: whether to fix `takes.text` mutability (`F1`), add server admission checks for deferred Vault/Creator/Groups/AI writes & apply `20261028210000` (`F2`), retire legacy `start_clash` (`F3`), and enable Kong/Edge container (`vault-media-access`) **before** executing the staging plan, or run core Challenge/Interests staging first and defer full Beta security closure to a follow-up migration batch.

---

## 4. Offline Security & Contract Regressions Added

Added [`scripts/beta-security-audit.test.cjs`](../../../scripts/beta-security-audit.test.cjs) (and wired it into [`package.json`](../../../package.json) `test` script):

1. **Challenge RPC Identity & Integrity:** Proves `createArenaChallenge` / `resolveArenaChallenge` derive the actor strictly from session context (`p_take_id`, `p_counter_position` / `p_challenge_id`, `p_action` only), abort with `account_changed` on session switches, and reject forged `roomId` without `clashId`, pre-accept `clashId`/`roomId`, and self-challenge payloads.
2. **Challenge Inbox Navigation Integrity:** Proves mounted `ChallengeInbox` blocks navigation and surfaces an error alert when a server response carries mismatched `id` or `takeId`, navigating exclusively to `/arena/room/<confirmedRoomId>` on matching `ACCEPTED` outcomes.
3. **Interests Revision Conflict & Validation:** Proves `saveMyArenaInterests` rejects account switches (`account_changed`) and surfaces `PT409`, while mounted `useArenaInterestEditor` fences invalid (`<3`) selections, preserves unsaved picks across `PT409`, sets `needsReload`, and leaves `preferences.version` at `0`.
4. **Deferred Client Release Gate vs Server Gaps:** Proves client `vaultService`, `vaultCommerceService`, `creatorAiService`, and `arenaCrewService` mutators reject with `unavailable_in_release` before hitting Supabase RPC, and pins SQL/Edge invariants (`revoke execute` from `anon` on canonical challenge RPCs, `is_runtime_fixture` exclusion, `PT409`, `can_access_vault_drop` caller check, `vault-media-access`/`arena-assist-media-access` caller JWT verification) alongside explicit tracked server gaps (**F1** `takes.text` mutability, **F2** missing server admission checks for deferred Vault/Creator/Groups/AI RPCs, **F3** active `start_clash` grant).

### Verified Offline Test & Preflight Results (`OFFLINE-VERIFIED` + `LIVE-DB-METADATA`)

| Check | Result |
|---|---|
| `node --test scripts/beta-security-audit.test.cjs` | **PASS** — `5/5` subtests passed (`0` skipped) |
| `npm run typecheck` | **PASS** — `tsc --noEmit` exit `0` |
| `npm test` | **PASS** — `1,536/1,536` (`835` unit + `636` lifecycle/UI/audit + `65` release-scope; `0` failed, `0` skipped) |
| `npm run test:arena-navigation` | **PASS** — `11/11` checks passed *(hook bridge)* |
| `npm run test:arena-acceptance` | **PASS** — `206/206` passed (`0` failed, `0` skipped) |
| `node scripts/eas-archive-check.cjs` | **PASS** — `723` paths, `inventorySha256` `9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f`, `0` network requests, `0` copied files |
| `clash-live-b4-20261101-db` post-audit read-only check | **PASS (UNCHANGED)** — `takes=9`, `clashes=9`, `arena_rooms=9`, `arena_challenges=9`, `judgements=7`, `verdicts=3`, `interests=0`, `vaults=0`, `vault_drops=0` |

---

## 5. Priority Pre-Beta Remediation Order (If Target Scope Is Staging/Beta Closure)

1. **P0 (`F1`):** Lock `takes.text`, `hood`, and `media_*` via `BEFORE UPDATE` trigger once a Take has an active/accepted challenge or canonical duel (or freeze `side_a_text` snapshot on `clashes`/`arena_room_payload`).
2. **P0 (`F2` + Meet `20261028210000`):** Enforce server-side beta admission denial on every deferred Vault/Creator/Commerce/Groups/AI/Play/World/Sponsorship/Media RPC (preserving read/exit paths) and apply `20261028120000` + `20261028210000` to target environments.
3. **P1 (`F3`):** Revoke `EXECUTE` on legacy `public.start_clash(text, text, clash_mode)` from `public, anon, authenticated`.
4. **P1 (`F4`):** Add `RESTRICTIVE` RLS excluding `is_runtime_fixture = true` on raw `public.takes` reads and confirm product policy for `anon` reads on expired profile Takes & `get_arena_room`.
5. **P2 (Staging Infra):** Enable Kong + Storage + Edge Functions runtime (`vault-media-access`, `arena-assist-media-access`, `arena-gifs`) on staging when testing signed URL and Edge access paths live.
