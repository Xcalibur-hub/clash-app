# Phase 11 Step 4E ? H3 Reputation Privacy Implementation

Date: 2026-10-11. Base: latest fetched `main`, `eccd5214e0c6e3ce68f86b9656d972441b53a34a`. Isolated worktree: `C:/p11repfix`; branch: `fix/phase-11-h3-reputation-privacy`.

**Implementation prepared; database security behavior NOT VERIFIED.** No running database was queried or changed. No migration, pgTAP initialization, SQL test, validation transaction, migration-history reconciliation, reset or deployment was executed. The new migration was generated as a file with `supabase migration new h3_reputation_history_privacy` (CLI 2.40.7). This is not migration application.

Step 4C remains **BLOCKED**; no validation retry was attempted. Android Step 2F remains **DEFERRED**. M1 Clash/verdict visibility is not implemented here. Existing draft PRs and security worktrees remain untouched.

## Files changed

- `supabase/migrations/20261011074540_h3_reputation_history_privacy.sql`
- `supabase/tests/088_h3_reputation_privacy.sql`
- `services/clashEngineService.ts`
- `app/clash/[takeId].tsx`
- `scripts/reputation-privacy-check.cjs`
- `package.json` (focused test command and inclusion in the existing unit suite)
- This report.

No previously applied migration, reward writer, facet trigger, public aggregate RPC, native configuration or Stage layout changes.

## Exact authorization changes

The additive migration enables existing ledger RLS and removes `reputation events are readable by everyone`, the only ledger SELECT policy found across main's migration definitions. It adds:

- Permissive authenticated SELECT: `profile_id = (select public.my_profile_id())`.
- Restrictive authenticated SELECT with the same expression. Another permissive SELECT/ALL policy cannot widen authenticated reads around the owner boundary.
- Revocation of table-wide SELECT from PUBLIC, anon and authenticated.
- Revocation of explicit SELECT on every actual ledger column from those same roles, including any columns added beyond the repository schema. Column names are quoted from `pg_attribute`.
- Authenticated column SELECT only on `id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta, created_at`.
- A fail-closed effective-privilege check: anon must have no table/column read grant; authenticated must have no table-wide or unapproved-column read grant; neither client role may have superuser/BYPASSRLS attributes. Unexpected inheritance causes an error rather than changes to shared role memberships.
- A PostgREST schema reload notification for a future authorized application.

No INSERT/UPDATE/DELETE grants, service-role privileges, function ownership or reward operations change. No raw-history definer RPC or staff exception is introduced. The existing caller-bound `my_profile_id()` uses `auth.uid()` and an owner-scoped profile lookup with empty search path; it accepts no caller-provided viewer ID.

| Principal | Before (repository definitions) | Proposed after migration |
| --- | --- | --- |
| Guest / anon | Raw events public | No table or column SELECT |
| Authenticated owner | Any raw events | Only own rows and approved history columns |
| Unrelated authenticated | Any raw events | Another owner's rows absent, including known IDs |
| Staff through authenticated API | Any raw events | Own rows only; no new blanket exception |
| Service role / trusted owners | Internal read/write | Existing necessary privileges preserved |
| Public profile reader | Reputation/rank, approved profile projection | Unchanged |

The current whitelist contains every current ledger column, so direct owner `SELECT *` can still work today under column privileges. There is deliberately no table-wide grant, and a future unapproved column must not become visible implicitly. The client uses its own explicit projection and no longer advertises a public ledger contract.

## Reviewed dependencies and repository privilege evidence

Full `reputation_events` reference searches covered services, app, components, hooks, store, migrations and tests. Main has one runtime query implementation (`fetchReputationEvents`) and one runtime caller (legacy Clash rewards display); its caller requests the current viewer's profile. No legitimate foreign-history UI consumer was found. Profile/Vault reputation components read profile totals/ranks, not the raw event table. `arenaMappers.ts` has a descriptive ledger comment, not another consumer.

Definitions reviewed:

- `20260926120000_initial_arena_schema.sql`: default client SELECT / trusted service grants; no custom API role inheritance introduced by repository migrations.
- `20260926140000_social_foundation.sql`, `20260926150000_media_storage.sql`: caller profile helper/ownership and notifications.
- `20260926160000_clash_engine.sql`: public ledger policy, schema and trusted legacy writers.
- `20260927010000_clash_draw.sql`: current juror reward and DRAW/cancellation contract.
- `20260928110000_blind_clash.sql`: individual judgement/identity constraints and existing reward regressions.
- `20261002150100_live_arena_schema.sql`: GROUP settlement, results, ballot privacy and Room-linked ledger column.
- `20261005130100_arena_reputation_facets.sql`: trusted ledger trigger, public facet/standing helpers and own Arena reputation RPC.
- `20261005130200_arena_call_backup.sql`, `20261005130300_arena_reactions_and_entertainment.sql`: additional trusted award writers.
- `20261007120000_arena_duel_foundation.sql`: canonical settlement wrapper, owner-only legacy delegate, service settlement and GROUP wrapper.
- `20261008110000_profile_read_security.sql`: public profile whitelist; coins/auth identity/role excluded.
- Existing canonical authorization, historical recovery and settlement tests remain unchanged.
- Step 4B audit and Step 4D design are reference documents on separate draft branches, not assumed merged definitions.

All ledger-returning references found in migration bodies are reward writers/facet processing, not an additional public raw-history response. Public aggregates do not include ledger IDs, event timestamps, coin deltas or per-Clash juror reward rows. This inspection does not establish effective deployed ACLs, custom roles, function ownership or downstream external client behavior.

## Client compatibility and account lifecycle

`fetchReputationEvents(profileId)` retains its signature and return shape. It requests only `id, profile_id, clash_id, kind, reputation_delta, coins_delta, created_at`, retains newest-first ordering and the existing 100-event bound, and works under owner RLS. Room-linked history is authorized at the database level; the existing client shape remains unchanged.

Guests and foreign-profile requests return `[]` before SELECT. The request subscribes to auth changes before asynchronous identity resolution, captures the initial auth account, resolves the caller profile, checks the final session, and discards invalidated responses. Sign-out/sign-in invalidates a request even for A -> logout -> A; any auth event with a different identity also invalidates it. Same-identity token refresh remains compatible. The subscription is always released. Current-account server errors still propagate; stale-session responses return no data.

The legacy Clash screen reuses `useOperationScope` for account/Take/unmount protection, adds request ordering and focus-cleanup invalidation, and tags reward state with its initiating scope. It masks previous-owner values during render before effects run, including A -> B -> A. It rejects late responses and clears old rewards when a new authoritative Clash response arrives. Existing own-history reward display and canonical Room redirect remain intact. No fallback to public rank/stats substitutes for an unavailable private response.

The retained newest-100 query can omit rewards for older Clashes; that pre-existing pagination limitation is not expanded into a new history feature here. The service conservatively discards an in-flight read on SIGNED_IN even if the identity is unchanged; the existing poll/refocus can refresh it.

## Security tests prepared, NOT RUN

`088_h3_reputation_privacy.sql` contains **63 pgTAP assertions** (static count). It uses existing transaction/role/JWT fixture conventions, real anon/authenticated/service contexts and rollback. No extension setup or migration execution is embedded in it.

Coverage includes effective table/column/inherited privileges, RLS/policy composition, guest direct known-ID denial, owner columns and precise timestamps, foreign owner/known-ID/coin metadata denial, absent caller identity, no staff exception, public totals/rank, trusted ledger inserts and facet synchronization. It invokes actual legacy creation/judging/settlement and GROUP settlement wrappers to check unchanged juror/GROUP rewards and repeated verdict/event/profile/notification effects; it checks private settled ballots and unchanged public GROUP results/aggregate helpers.

Legacy reward expectations stay 120 reputation / 40 coins for majority and 25 / 18 for dissent. GROUP fixture expectations stay 10 participation + 25 winning side + 40 best argument + 15 useful evidence for its qualifying owner, participation-only for dissent, and zero coins. Fixture inputs are transaction-only in the unexecuted test file; no ordinary public activity was created.

Existing DRAW, zero-ballot cancellation, canonical settlement/concurrency, backup, Crowd reward and historical suites must also run in later authorized validation. No existing SQL assertion was weakened. Static inspection checked references, role resets and privilege predicates, but is not PostgreSQL parsing or execution evidence.

Test-number inventory checked latest fetched relevant pending branches: PR #13 uses 084 comment-reply tests; #14 uses 085 profile statistics; Step 4A currently also uses 084 (existing collision, untouched; 086 was suggested); #21 uses 087 critical authorization. #17 adds no SQL suite. This branch uses 088. Recheck the union inventory if those branches change before integration.

## Executed non-database verification

| Check | Actual result |
| --- | --- |
| Full `npm run test:unit`, final implementation | **483 passed, 118 suites; 0 failures, 0 skipped**. Includes 19 H3 service/screen cases. |
| Focused client check | First run: 12 passed / 6 harness failures (wrong child props inspected). Harness corrected to actual VerdictReveal, all assertions retained; 18/18 then passed. Added a further identity-event test; final full suite passes all **19** focused cases. |
| `npm run typecheck` | PASS, exit 0 on final code. |
| `node scripts/settlement-history-check.cjs` | **11/11 passed**, controlled service/Room dependencies; no database or native verification. |
| `npx --no-install expo-doctor` | **18/18 passed**, exit 0. |
| Git diff/static inspection | PASS whitespace check; new migration/test manually inspected, no SQL executed. |
| pgTAP, migration application, live RLS/REST | **NOT RUN / NOT VERIFIED**, expressly prohibited in this checkpoint. |
| Physical Android | **NOT RUN**; Step 2F remains DEFERRED. |

Initial sandbox TypeScript invocation failed EPERM while resolving Node under the user directory; the authorized command outside that restriction passed. An initial unit-log redirection to the drive root was denied before tests executed; rerunning with the temporary directory produced the actual unit totals above. Neither failure was counted as a passing test. Final diff review also caught and restored Windows-decoded Unicode text in the edited source files; a comparison confirmed all original Unicode lines were preserved, followed by another final typecheck/unit run.

## Public inference and pending PR compatibility

Public reputation totals/rank/streak, `reputation_facet_json`, `arena_standing_for`, `get_my_arena_reputation` and public GROUP result fields remain unchanged. GROUP results identify the best argument author by existing contract; they do not publish each private side ballot. Exact totals/facets and deterministic reward deltas still permit vote inference by before/after differencing; known juror identity plus a small public jury can also reveal a vote. **Guaranteed ballot anonymity is not claimed.** Restricting, batching, delaying or coarsening public totals/facets/streak/standing/results needs separate product approval.

- **PR #13:** notification helpers/hooks remain untouched; no regrant to bypass H1. Reward notifications keep existing trusted calls.
- **PR #14:** inspected its `profile_clash_stats` migration, profile service and ReputationBar. It counts source-filtered settled fighter outcomes, not juror reward events; own facets use `get_my_arena_reputation`. No raw-event dependency was found. Its client/service/package changes need normal merge reconciliation. Public aggregate inference remains; M1 policy alignment is separate.
- **PR #17:** settlement reward audit/harness must keep existing amounts and idempotency expectations. This patch does not award fighters or rewrite their calculations.
- **PR #21:** H1/H2 migration is separate, unapplied here and BLOCKED for validation. Keep its table/helper ACL changes independent; do not infer a successful security check from this unit suite.
- Step 4A relationship controls and test numbering remain pending; no other branch/PR was modified.

## Deployment prerequisites and rollback considerations

Deployment is NOT authorized by this PR. Before a separately authorized validation/application, inventory actual table/column ACLs and grantors, role memberships/SET ROLE capability, all SELECT/ALL policies, views/definer APIs, function owners/BYPASSRLS, FORCE RLS state and default privileges. Confirm the migration runner can revoke the relevant grants and execute the trusted helper. Custom API roles or unexpected inherited grants need explicit review; the migration deliberately does not revoke shared memberships globally.

Use a transaction-capable migration runner so a failed effective-privilege guard rolls back the entire migration. Verify trusted settlement/facet owners and service privileges on the target; there are no owner changes in this patch. Run all prepared security and reward suites only after fresh explicit environment/pgTAP authorization. Do not reuse Step 4C's consumed attempt.

Capture ACL/policy definitions before approved deployment. If validation fails in a transaction, roll back it. After committed deployment, prefer a reviewed forward correction retaining owner-only privacy. Restoring the old public policy/table grant would deliberately reopen H3 and requires explicit security approval, not an automatic rollback. No data deletion, ledger recomputation or reward replay is needed.

Effective deployed privileges, prepared SQL runtime correctness and end-to-end REST behavior remain outstanding blockers to security verification. Implementation-only acceptance is satisfied by the proposed patch/tests and safe checks; it is not evidence that H3 is fixed in any running database.

Reference: [Supabase RLS grants and policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL REVOKE](https://www.postgresql.org/docs/current/sql-revoke.html). These explain the separate table/column privilege checks; they do not validate this deployment.
