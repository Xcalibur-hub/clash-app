# Phase 11 Step 4F — M1 Clash and verdict visibility

Status: implementation prepared on `fix/phase-11-m1-clash-visibility`, based on main `eccd5214e0c6e3ce68f86b9656d972441b53a34a`. **No migration applied and no database security behavior verified.** Step 4C remains **BLOCKED**; Android Step 2F remains **DEFERRED**. This checkpoint does not authorize either validation attempt.

## Changes

- `supabase/migrations/20261011081531_m1_clash_verdict_visibility.sql`: shared caller gate, restrictive raw SELECT policies, guarded definer readers and deployment prerequisites.
- `supabase/tests/089_m1_clash_visibility.sql`: prepared real-role pgTAP regression suite; NOT EXECUTED.
- `services/clashEngineService.ts`: explicit safe projections; null/42501 becomes unavailable; other failures propagate. Raw Clash helpers never request BLIND challenger columns; identity reads remain through the existing redacting RPC.
- `services/profileService.ts`: unavailable history returns an empty list without fabricating outcomes.
- `app/clash/[takeId].tsx`: account/Take-scoped responses, latest-request ordering, focus revalidation, rejection of late responses, clearing of previously readable content on denial/error.
- `components/profile/ProfileScreen.tsx`: account/profile-scoped history and opponents, focus/refresh revalidation, atomic history updates and rejection of obsolete responses.
- `app/(tabs)/notifications.tsx`: account-keyed inbox and scoped loads/navigation; unavailable Clash destinations use the existing profile fallback instead of a remembered Take ID.
- `scripts/clash-visibility-check.cjs`: 26 controlled checks exercising actual service/screen code with mocked network, router and native children.
- `package.json`: register the focused check and include it in the full unit command.
- This report.

No settlement, reward, judgement eligibility, official submission, Crowd write, pricing, native configuration or layout rules changed. The primary checkout's existing modified/untracked Crew and development files were preserved; no other feature/security branch was edited or merged.

## Existing contracts and dependency graph

The engine creates public `clashes`/`verdicts` read policies. BLIND subsequently revokes client table-wide Clash SELECT and grants only `id, take_id, status, mode, opens_at, closes_at, created_at, settled_at`. Those grants remain unchanged. Verdict fields are publicly readable only when their linked Clash passes the new gate; no new terminal-state constraint is invented for legacy records.

Phase 0.5 provides `arena_take_readable`, caller-bound relationship checks and an owner-only `arena_actor_hidden_internal`. Removed sources deny everyone in the normal read contract; expired sources can retain readable history. Blocks apply in both directions; mutes apply from the caller toward the author/challenger. An author's mute of a viewer alone does not hide content from that viewer.

The gate takes **only a Clash ID**, derives the caller through `my_profile_id()`, returns false for denied/missing IDs and reveals no denial reason or relationship metadata. It requires:

1. Readable source Take and visible challenger relationship.
2. For legacy Clashes, no canonical Room association.
3. For canonical Clashes, a linked Room with the existing two-fighter capacity/count invariants and `arena_room_readable(room_id)`.

Unique Room-to-Clash association and fighter assignments remain protected by existing canonical constraints. A missing/inconsistent link fails closed; this migration does not repair data. Runtime fixtures retain existing by-ID access when otherwise readable; ordinary discovery exclusions stay unchanged.

Read graph:

`client clashes/verdicts policy -> clash_readable -> owner-scoped Clash lookup -> arena_take_readable / arena_actor_hidden_internal / arena_room_readable -> trusted source, relationship and membership lookups`

The Room predicate itself reads Clashes. There is **no call to clash_view from the policy helper**, and it does not read verdicts. SECURITY DEFINER prevents SQL-function inlining; trusted owner bypass is required to keep the nested Clash lookup from re-entering its client policy.

Repository migrations create these objects with the migration owner and contain no subsequent owner transfer or FORCE RLS change affecting this graph. That is repository evidence, not proof of deployed ownership. The additive migration aborts if API roles have superuser/BYPASSRLS, competition RLS is disabled, trusted functions have different owners/non-definer/unsafe search_path settings, or the helper owner cannot bypass underlying RLS. It changes no owner, FORCE setting or RLS enablement to make these checks pass. Before deployment, also inspect effective role memberships and owner-role inheritance: interactive roles must not inherit ownership privileges, SET ROLE access or trusted internal execution.

`clash_view` checks the gate before calling the private phase-1/legacy implementation or enriching Room/counterposition metadata. `clash_view_for_take` keeps latest-open/latest-history selection and returns null if that selected record is denied. `profile_clash_list` applies the gate in the query **before LIMIT**, retaining its existing BLIND listing/redaction and outcome mapping. Its exact migration anchor must match once or deployment aborts. Internal compatibility bodies remain non-executable by PUBLIC/anon/authenticated/service_role.

## Before/after access matrix

| Actor/path | Before | Prepared behavior |
| --- | --- | --- |
| Anonymous raw safe Clash columns / verdict | Public rows could outlive readable source | Only caller-readable source/Room rows; BLIND column restrictions remain |
| Unrelated authenticated known ID / direct join | Same raw exposure | Same source, block/mute and canonical Room gate on both tables |
| Source author / fighter | Broad raw reads | No authorship/membership override for removed source or caller relationship denial |
| Juror | Broad raw reads | Judging does not bypass source denial; existing own-ballot/reveal rules unchanged |
| Staff using ordinary API | Broad raw reads | Same source gate; existing Room scheduled-topic staff rule retained, no new removal override |
| Service role / trusted owner writer | Trusted privileged access | Retained; no caller requirement added to settlement/reward writers |
| clash_view / Take RPC | Partial source checks; canonical Room read could differ | Shared gate before JSON enrichment; null on denial |
| Profile Clash history | Source/challenger checks | Also canonical Room gate; readable DRAW/settled history retained |

`clash_readable(text)` EXECUTE is explicitly revoked from PUBLIC/anon/authenticated/service_role, then granted only to anon/authenticated for policy evaluation. Owner execution is implicit. The existing service `clash_view` dependency executes the helper under its trusted function owner; no direct service helper grant is needed.

## Historical and client behavior

Readable settled legacy/canonical results, including DRAW, remain available. Source-readable cancellation metadata can remain visible under the existing Room predicate; this does **not** grant membership. Cancelled new watching and Crowd access stay denied; existing authorized historical Stage access remains read-only. No winner or verdict is created for cancellation.

Service methods keep their signatures. Empty RLS results and SQLSTATE 42501 resolve to null (or empty profile history). Other failures remain errors. Notifications resolve the current record before navigation and ignore responses from an obsolete account. The Clash screen clears denied/error content and masks previous-scope state immediately. Profile history clears while refetching; outdated rows and opponent identities cannot be restored by a late request.

These are controlled client guarantees, not proof of instant revocation on devices. Existing screen polling/focus/refresh drives revalidation; downloaded data cannot be erased retroactively. This change does not claim all Take/reply caches are redesigned or all notification content is source-redacted.

## Regression suite prepared, NOT RUN

`089_m1_clash_visibility.sql` contains transaction-rolled-back fixtures and real anon/authenticated role switches. An invoker-only temporary assertion helper checks denied predicate, raw Clash, verdict, direct join, view RPC, Take RPC and profile history for each denied case. It covers missing/known IDs, anonymous and authenticated removed sources, source-author/fighter denial, both block directions against both fighters, directional/reverse mutes, scheduled canonical Room outsiders versus members, BLIND columns/redaction/participant reveal, legacy expired-source DRAW, canonical DRAW settlement/retry, removed settled results, historical watching, cancelled no-verdict behavior and denied cancelled Crowd/new watching. It includes function grants/search_path checks and executable recursion/terminal-graph checks for the future authorized test run.

Test numbering was checked against main and pending branch inventories: main ends at 083; PR #13 uses 084, #14 uses 085, Step 4A has a known 084 collision with 086 recommended, Step 4C uses 087 and H3 uses 088. **089 is unused in the inspected inventory.** No pending file was renamed or modified.

Static review found and corrected fixture timing before any SQL execution: canonical ballots must be inserted while the genuine judging window is open, then only the rollback fixture's clock is advanced before settlement. This is not evidence that the suite executes successfully. SQL parsing, installed ownership, effective grants, recursion, RLS behavior, settlement effects and concurrency remain unverified.

## Actual verification

All commands below ran in the isolated worktree using reused dependencies, without database connections:

| Command | Actual result |
| --- | --- |
| `node --test scripts/clash-visibility-check.cjs` | Exit 0; 26 passed, 0 failed |
| `npm run test:unit` | Exit 0; 490 tests, 118 suites, 490 passed, 0 failed/skipped; includes the 26 focused checks |
| `npm run typecheck` | Exit 0; no TypeScript diagnostics |
| `npx expo-doctor` | Exit 0; 18/18 checks passed |
| `npm run test:settlement:history` | Exit 0; 11/11 controlled checks passed |
| `npm run test:duel:render` | Exit 0; 22/22 controlled render scenarios passed; pointerEvents deprecation warning |
| `npm run test:crowd:service` | Exit 0; 7 checks passed |
| `npm run test:official:service` | Exit 0; 14/14 controlled service/store checks passed |
| Migration / SQL inspection | Static source, ownership graph, grant, policy, anchor and fixture review only; no database compilation or execution |
| pgTAP / REST / migration deployment | **NOT RUN / NOT APPLIED**, prohibited in this checkpoint |
| Physical Android | **NOT RUN**; Step 2F remains DEFERRED |

Initial focused runs exposed harness issues: a relative native-child import escaped the mock boundary, and an account-change assertion assumed the history child remained mounted while its containing profile was loading. The harness now stubs that child and checks that history is absent or cleared; service/source-denial assertions were retained. Final focused and full unit runs pass. No passing database-security claim follows from those client results.

## Integration risks and deployment prerequisites

- PR #14's `20261010120000_profile_clash_stats.sql` is absent from main. Its inspected SECURITY DEFINER `profile_clash_stats` uses source/challenger checks but lacks the canonical Room predicate. Before integrating it with M1, add the shared gate to that aggregate and regression-test hidden Room counts. This branch does not modify that PR.
- H3 PR #23 is independent and unmerged. Resolve overlapping service, Clash/profile screen and package-script edits by preserving both its owner-history protections and M1's scoped view/history guards. Do not drop either test harness. Main still has H3's raw event exposure until its separate fix is reviewed/deployed; exact public totals can also permit reward differencing.
- PR #13 notification edits and Step 4A account/relationship invalidation must retain the new scoped destination checks. Re-inventory SQL numbering and final function definitions after any rebase. The history patch intentionally aborts on incompatible definition drift.
- Recursion prevention relies on trusted ownership remaining intact after deployment. Recheck owner/FORCE RLS, function ACLs/search_path, table/column grants, custom API roles and role inheritance against the actual target. Never disable RLS or grant clients trusted-owner access to accommodate the migration.
- Standard MVCC applies: a new READ COMMITTED statement after committed removal/block must deny; an already-running or repeatable-read snapshot can retain earlier visibility. No read locks, settlement timing changes or retroactive revocation are introduced. Concurrent multi-session revocation and performance/query plans require later authorized validation.
- Before any deployment, obtain explicit authorization for a prepared disposable/isolated test DB with pgTAP already available in its configured search_path. Apply the migration only there under the verified trusted migration owner, run 089 plus existing BLIND/canonical authorization/history/settlement/GROUP suites, exercise direct PostgREST reads and RPCs with real role tokens, and validate effective grants/recursion and multi-session removal/block behavior. Then separately review and authorize deployment. This report supplies no authorization to initialize extensions or reuse the consumed Step 4C transaction attempt.

Draft implementation only: not deployed, no production-readiness or zero-vulnerability claim. Stop after the draft PR; no next phase begins.
