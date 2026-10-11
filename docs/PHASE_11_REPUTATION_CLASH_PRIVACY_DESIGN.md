# Phase 11 Step 4D — Reputation Privacy & Clash Visibility Design

Date: 2026-10-11. Documentation only; proposed changes below are NOT implemented or deployed.

Base: `main` at `eccd5214e0c6e3ce68f86b9656d972441b53a34a`. Isolated worktree: `C:/p11rep`; branch: `docs/phase-11-reputation-clash-privacy`. This document describes repository definitions, not verified effective privileges on a running deployment.

**Step 4C remains BLOCKED. No retry, migration execution, pgTAP initialization or validation transaction is authorized by this checkpoint. Android Step 2F remains DEFERRED.**

## Findings and decision boundary

- **H3 — High:** the permissive `reputation_events` SELECT policy and client-readable ledger expose named juror events, Clash/Room identifiers, amounts and timestamps. A `clash_win` event joined to the published winning side identifies the juror's majority vote. GROUP winning-side events create a similar inference path despite private ballot policies.
- **M1 — Medium:** raw Clash safe columns and raw verdict rows are governed by permissive public row policies. Their source-aware RPCs filter more narrowly. A known ID or enumeration can therefore reveal hidden-source relationships/outcomes through direct reads. BLIND column restrictions already prevent direct challenger identity selection and must remain intact.
- **Residual privacy limit:** restricting raw events removes the identified reward-event disclosure path. It does not establish ballot non-inference: deterministic rewards and exact public reputation/facet changes can reveal whether a named user voted with the majority. A one-ballot public outcome can also identify a vote when the voter is otherwise known. Do not claim complete judging anonymity under the current public aggregate contract.

The accepted contract makes raw history private to its owner. Public reputation totals and rank remain public; additional aggregate fields require explicit approval. Neither reward amounts nor winner calculation changes in this design.

## Existing contracts and dependency map

### Reputation and judging

| Resource / writer | Current repository behavior | Impact of proposed restriction |
| --- | --- | --- |
| `reputation_events` | `20260926160000_clash_engine.sql`: RLS enabled, public SELECT policy `USING (true)`; client SELECT supplied by grants. Fields include profile, Clash, kind, reputation/coin deltas, timestamp; live Arena adds `arena_room_id`. | Replace public row access with authenticated owner history; preserve trusted writers. |
| `fetchReputationEvents(profileId)` | `services/clashEngineService.ts`: arbitrary profile parameter, `select('*')`, newest 100 events. Comment calls it public. | Retain signature if needed, explicitly select approved owner fields; foreign-profile requests return no rows. Update contract/comment and account-scoped caches. |
| `app/clash/[takeId].tsx` | Reviewed caller loads the current viewer's history and sums events for the displayed legacy Clash. Canonical duels redirect to their Room earlier. | Own rewards remain available; hidden linked content must not become navigable just because an own event references it. Guard late responses against account changes. |
| Legacy `settle_clash` | DRAW migration supplies current juror-centric rewards; terminal return, row locking and verdict transaction prevent repeated settlement effects. | Do not alter reward inserts, profile increments, notifications, transaction or terminal guards. |
| Canonical settlement wrapper | `20261007120000_arena_duel_foundation.sql` delegates to trusted legacy settlement and synchronizes Room terminal state. | Keep delegation and lock ordering; no second settlement engine. |
| GROUP settlement | `20261002150100_live_arena_schema.sql` writes participation, winning-side, best-argument and useful-evidence events with Room IDs. | Ledger becomes private without changing GROUP results, evidence or transcript behavior. |
| Backup / Crowd reward writers | `20261005130200_arena_call_backup.sql`, `20261005130300_arena_reactions_and_entertainment.sql` write trusted events. | Keep access for function owner and necessary service role; do not replay awards. |
| `sync_reputation_facet()` | Definer trigger in `20261005130100_arena_reputation_facets.sql` updates facets on ledger insert. | Keep trusted insert/trigger execution. No trigger rewrite or ledger backfill. |
| `profile_reputation_facets` | Raw rows are authenticated owner-only under `owns_profile(profile_id)`; public facet RPC is separately granted. | No staff exception exists in this facet policy; raw facet access must not be reopened to support public RPCs. |
| `reputation_facet_json(profileId)` | Definer, empty search path; anon/authenticated/service EXECUTE. Returns exact cumulative facets. | Inventory as an explicit public aggregate contract; assess score differencing before approving it under stronger judging privacy. |
| `arena_standing_for(profileId)` | Public helper derives standing from participation/facets. Backup eligibility helpers consume standing. | Preserve current eligibility; assess public output independently of raw event privacy. |
| `get_my_arena_reputation()` | Authenticated caller-scoped RPC; used by `services/arenaGameService.ts`. | Preserve own reputation/facets and existing payload. |
| Profiles / rank | `20261008110000_profile_read_security.sql` public whitelist includes reputation, rank and streak, excludes coins, role and auth identity. | Keep totals/rank; do not expose private coins or auth fields. Streak remains a privacy-review decision. |
| `judgements` | Owner or staff SELECT; anon SELECT revoked. Settlement does not make all individual ballots public. | Preserve. Caller-scoped `myBallot` is allowed; no all-ballots export. |
| GROUP votes | Side/argument ballot reads are owner or staff; results are separate. | Preserve and test against reward-event joins. |

Reviewed legacy rewards: majority juror 120 reputation / 40 coins; dissent juror 25 reputation / 18 coins; DRAW participation 15 reputation / 0 coins. Zero ballots cancel with no verdict. These reviewed writers do not award a fighter-win bonus. GROUP awards include participation 10, winning side 25, best argument 40, useful evidence 15; backup arrival 8 and Crowd favorite 12 are separate existing writers. These values are evidence for inference analysis, not a proposal to change rewards.

Owner-only history does not require a new API: existing table RLS can enforce it. The 100-event client limit can omit an old Clash's rewards; if confirmed necessary, add a narrowly scoped own-Clash history query using the same owner predicate. Do not replace that limitation with an unrestricted event RPC.

### Clash / verdict visibility

| Resource / API | Actual contract and dependency |
| --- | --- |
| Raw `clashes` | Public row policy remains permissive. BLIND migration revoked table-wide client SELECT and grants only `id, take_id, status, mode, opens_at, closes_at, created_at, settled_at`. Challenger columns remain restricted. |
| Raw `verdicts` | Public row policy and client SELECT expose outcomes independent of source readability. |
| `clash_view` chain | Legacy payload -> foundation wrapper -> challenge wrapper. Legacy filters source/challenger visibility; wrappers add Room/counterposition metadata. Null JSON propagation currently protects a denied legacy payload, but an explicit guard should precede enrichment. |
| `clash_view_for_take` | Resolves a Clash and calls `clash_view`; inaccessible and nonexistent should remain indistinguishable null results. |
| `arena_take_readable` | Definer, empty search path: rejects removed Take and viewer-hidden author. This is not a complete Room/publication predicate. Expired historical Takes are not automatically unreadable. |
| `arena_room_readable` | Definer: checks topic visibility, canonical source and challenger relationship. Membership/staff can affect scheduled topic access. Does not authorize new writes or watching a cancelled Room. |
| Relationship predicates | Internal helper checks blocks in both directions and viewer-to-author mutes. Arbitrary two-person internal helper EXECUTE is revoked; public wrapper binds the viewer to the caller. Preserve directional mute semantics. |
| Topic visibility | `20261008110600_canonical_topic_visibility.sql` depends on canonical Room readability. Helpers must not produce a policy recursion cycle through Room/Clash/topic joins. |
| BLIND | `clash_identities_revealed_for` is internal; STANDARD reveals identities, BLIND reveals under existing participant/judged/settled rules. Profile lists have their own stricter stranger listing rule. Canonical DUEL currently requires STANDARD. |
| Discovery | `20261008121000_arena_discovery_states.sql` excludes runtime fixtures from ordinary discovery. Its comment deliberately allows readable fixtures by ID. Preserve that distinction; do not invent blanket fixture-ID denial. |
| `fetchVerdict` | Direct verdict SELECT in `services/clashEngineService.ts`; absence/denial must be an honest unavailable result, not a manufactured outcome. |
| `fetchClashById` | Uses safe raw columns. Notification navigation in `app/(tabs)/notifications.tsx` depends on its nullable result. |
| `fetchClashForTake` | Uses direct `select('*')`, already incompatible with restricted BLIND challenger columns. No active caller found in inspected main. Latent compatibility issue: use approved projection or caller-scoped RPC if retained; never reopen hidden columns. |
| Profile history | `services/profileService.ts` uses `profile_clash_list`; fighter outcome history is not a juror reward ledger. Apply the shared visibility gate while preserving BLIND list rules. |

## Access-control matrix

`Own` means `profile_id = my_profile_id()` for the authenticated caller. `Readable` means source and applicable canonical Room visibility pass, including relationship rules. Role labels confer no automatic source-read bypass.

| Actor | Current raw reputation | Proposed reputation history | Public totals/rank | Current raw Clash/verdict | Proposed Clash/verdict |
| --- | --- | --- | --- | --- | --- |
| Anonymous | Public ledger SELECT | No history privilege | Yes, approved projection | Broad rows; Clash identity columns restricted | Only readable rows, safe fields; BLIND unchanged |
| Unrelated authenticated | Public ledger SELECT | Own only; no other history | Yes | Broad rows | Readable only |
| Source author | Public ledger SELECT | Own only | Yes | Broad rows | Readable only; authorship does not override removal/block |
| Fighter | Public ledger SELECT | Own only | Yes | Broad rows | Readable only, existing identity rules; no reopened Room |
| Juror | Public ledger SELECT | Own history and own ballot only | Yes | Broad rows | Readable only; judging gives no source-removal bypass |
| Authorized staff | Public ledger; existing moderation capabilities | Own plus explicitly authorized audit mechanism, if separately approved | Yes | Broad rows | Normal caller view remains gated; separately scoped audit access only |
| Service role | Trusted privileged access | Necessary trusted access retained | Yes | Trusted privileged access | Retain necessary internal access; never expose service credentials |

Owners may retain their own event metadata after its source becomes unreadable, consistent with the private-history contract. This does not authorize reading the source or someone else's events. Staff audit is an explicit capability decision, not a new blanket `is_staff()` exception on public reads.

## Proposed least-privilege migrations (design only)

### H3: owner ledger

1. Inventory effective table/column grants, role memberships, policy combinations and definer callers on the authorized target before deployment. Check PUBLIC, anon, authenticated, service role and any custom/inherited API roles. Repository history alone is insufficient deployment evidence.
2. Revoke client/PUBLIC table-wide and prior column SELECT grants on `reputation_events`; revoke anon access entirely. Replace the permissive public SELECT policy with a caller-owner authenticated policy. Other permissive SELECT policies must not OR around it; use a restrictive owner gate if retaining compatible policies is necessary.
3. Grant authenticated SELECT only on approved owner-history fields: current identifiers, owner, Clash/Room reference, kind, deltas and timestamp. RLS supplies row ownership. Do not grant INSERT/UPDATE/DELETE. Keep necessary service-role access and trusted function ownership unchanged.
4. Preserve current internal settlement/trigger callers. Do not add `auth.uid()` requirements to trusted background reward writers. Do not grant a new public definer event-list function or broaden an existing profile RPC.
5. Move client reads to an explicit field list, keep signature compatibility, treat foreign-owner requests as empty, and clear prior-account results on switch. Bind async responses to initiating account/session. Never cache raw history under profile-agnostic keys.
6. Recheck aggregates and joins: no event IDs, timestamps, Clash/Room IDs, juror IDs or per-Clash reward-kind breakdown in public profile/standing/facet APIs. Public GROUP results cannot be joined to identified private winning-side events.

No row deletion, ledger replay, reputation recomputation or reward change is needed. Existing owners retain history and trusted background processing retains write privileges.

### M1: shared caller-bound read gate

1. Introduce a small, STABLE caller-bound predicate, conceptually `clash_readable(clash_id)`. It takes no viewer ID and returns only a boolean; nonexistent and denied IDs return false.
2. Under a trusted, verified owner, look up the Clash and require current `arena_take_readable(take_id)` plus caller/challenger relationship visibility. For canonical links, also require the appropriate existing `arena_room_readable(room_id)` and valid unique canonical link. Legacy Clashes use the source/challenger predicate without invented Room membership requirements. Resolve missing or inconsistent canonical links conservatively and document any existing data requiring repair before deployment.
3. Add a restrictive SELECT policy for client roles on raw `clashes`, composed with existing policies, or replace the old permissive policy after complete inventory. Add the same source gate on `verdicts` via its `clash_id`. An additional terminal-verdict consistency guard must be checked against legitimate legacy history before inclusion; do not hide valid historical results by assumption.
4. Preserve BLIND column ACLs. Never regrant table-wide client SELECT on `clashes`. Consider explicit verdict column grants (`clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label, created_at`) after verifying the final deployed schema and consumer projections.
5. Apply the same boolean gate before definer `clash_view` enrichment and profile-list output; RLS does not constrain a bypassing definer automatically. Preserve each API's stronger BLIND redaction/listing rules. No inaccessible-source Room/counterposition metadata may survive through fallback/coalescing JSON.
6. SELECT-policy helper EXECUTE must be explicitly granted to the roles that evaluate it. Revoke PUBLIC defaults, grant only anon/authenticated as required, keep its arbitrary-relationship dependencies owner-only. A boolean read gate discloses no more than the gated table already does; it must not return hidden IDs or reasons. Service execution is granted only if a verified dependency needs it.

### Recursion, ownership and concurrency

The planned dependency direction is verdict policy -> caller read predicate -> trusted Clash lookup -> existing source/Room predicates -> owner-scoped underlying lookups. Never call `clash_view` from an RLS policy; never make the helper read `verdicts`. A Room helper may itself look up `clashes`, so trusted owner bypass must be verified for every involved table. Confirm function owner, `rolbypassrls`, table ownership and FORCE RLS state before choosing the exact graph. Do not disable RLS or rely on `row_security = off` to manufacture access. Use an empty search path and schema-qualified objects. If owner bypass is unavailable, redesign the minimal helper graph before deployment rather than shipping recursion.

Read authorization follows the statement's PostgreSQL snapshot. A new READ COMMITTED statement after source removal/block commit must deny access. Already-running reads and downloaded data cannot be revoked retroactively; long-lived repeatable-read snapshots and client caches are limitations. No row locks belong in ordinary read policies. Existing mutation serialization and lock order (parent Clash, source validation, Room/member validation) stay unchanged. No new settlement eligibility, deadline, membership or reward rules are introduced.

Settled readable history remains available and read-only. Cancelled canonical Room entry, Crowd denial and existing-member historical Stage access remain governed by existing watch/Room contracts; source-readable raw outcome metadata does not grant membership. Zero-ballot cancellation still has no verdict, DRAW stays a valid verdict. No cancelled competition is reopened.

## Impact and compatibility analysis

- Other users' raw ledger views intentionally stop working. Reviewed main has an own-history caller; pending branches and external consumers need inventory before release.
- Public totals/ranks remain; exact facet/streak exposure is not automatically approved by calling it aggregate. Restricting those public APIs would need a separate compatibility/product decision.
- Denied raw Clash/verdict reads return absent rows; client detail screens, notification navigation and profile history must handle unavailable sources without leaking cached challenger metadata.
- Own reward history can reference hidden content; show an unavailable link instead of loading hidden source through a privileged fallback.
- RLS applies to direct REST queries, embedded joins and known IDs, but definer API chains need explicit checks. Audit any view for invoker/owner semantics and any public RPC returning raw rows.
- Realtime/cache invalidation must stop showing prior-account or revoked content. These proposed read policies do not retroactively purge delivered websocket payloads or local caches.
- GROUP reward generation, facet triggers, ordinary public GROUP discovery and private Room/Crowd access remain independent. Do not merge official transcript and Crowd permissions.

## Proposed regression plan — NOT EXECUTED

Use a separately authorized isolated test environment or explicitly approved rollback-only procedure. This document provides no authorization to initialize pgTAP or execute migrations. Use real anon/authenticated/service contexts and transaction fixtures; check both SQL privileges and returned rows. Test direct REST-equivalent SELECT and caller RPCs, not solely helper return values.

1. Owner can read only their history and approved fields; unrelated authenticated receives no other-owner rows; anon has no raw history privilege. Check table-wide and inherited grants, explicit columns, `select('*')`, joins, aggregates and known-ID filters.
2. Public profile totals/rank still resolve; private coins/auth IDs remain inaccessible. Facet/standing outputs contain no identifiable event metadata. Document an aggregate-differencing demonstration as a residual inference test, not a passing anonymity assertion.
3. Settle a fixture and prove named juror reward rows cannot be queried by another user/guest or reconstructed by public event joins. Own ballot remains visible only to its owner/authorized staff; GROUP winning-side votes and reward events remain separated.
4. Repeated settlement preserves verdict/event/profile/notification counts and exact reward values. Test legacy, canonical, GROUP, DRAW and zero-ballot cancellation; preserve existing terminal and idempotency assertions.
5. Remove a fixture source and assert raw safe Clash columns, verdict rows, `clash_view`, `clash_view_for_take`, profile lists and discovery all deny new unauthorized reads. Author/fighter/juror status alone does not bypass source denial.
6. Exercise both block directions and viewer-to-author mute against source author and challenger; unmute/revoke block in fixtures only. Confirm directional mute behavior is unchanged. Test known IDs, existing members and unrelated users.
7. BLIND challenger column reads fail; public APIs redact open identities according to their existing rules. Participant/judged/settled reveal behavior and profile-list exclusions remain unchanged. No new canonical BLIND mode.
8. Readable settled legacy/canonical history and valid verdicts remain available. Cancelled new watching/Crowd remain denied; existing authorized historical Stage stays read-only. Runtime fixture remains absent from ordinary discovery but permitted by ID where otherwise readable.
9. Test concurrent committed source removal/relationship change across separate connections: next READ COMMITTED read denies; explicitly record in-flight snapshot behavior. Do not assert impossible retroactive revocation.
10. Test owner change/FORCE RLS assumptions, helper search paths/EXECUTE grants, policy recursion, service writer paths and arbitrary-viewer oracle attempts. Check every role that can inherit API grants.
11. Client tests cover own-history account switch, late async responses, unavailable notification destinations, null verdicts and profile history. Run existing reward, Crowd, Stage and settlement suites in the later implementation checkpoint.

Use descriptive uniquely numbered pgTAP filenames after checking all pending branches. Safety Settings and PR #13 originally collided at sequence 084; the Step 5B integration candidate assigns `086_safety_settings.sql`, retaining `084_comment_reply_notifications.sql`. Step 4C uses `087_critical_authorization.sql`, H3 uses 088 and M1 uses 089. These are prepared files, not newly executed SQL validation.

## Pending PR integration risks

- PRs #7–#11: World/MapLibre work is outside scope; no native or screen changes.
- #12: backend readiness documentation should reflect the eventual approved privacy contract.
- #13: notification writers must remain trusted; no regrant of `clash_notify` to interactive clients to accommodate tests. Coordinate test numbering.
- #14: profile Clash statistics/reputation facets are the highest contract risk: inspect its final projections and aggregates before implementation. No identified jury/event export or hidden-source stats count should circumvent the selected policy. Its detailed patch was not verified in this checkpoint; follow-up API retrieval failed, so this dependency remains an explicit review prerequisite.
- #15–#17: engagement/settlement harnesses and reward audit must retain genuine reward/idempotency expectations; prior reports are not new security validation.
- #18: Crew integration must not gain access to private event rows through memberships or helper grants. No new Crew-based judging rules.
- #19 (Step 4A): block/mute management and account invalidation must agree with caller-scoped visibility. Do not alter its branch; resolve the SQL filename collision in its own authorized review.
- #20 is the reference privacy audit; this design resolves its product-contract question for raw events.
- #21 (Step 4C): H1/H2 remain separate, BLOCKED pending authorization. Do not modify its migration, rerun its wrapper, or imply those fixes have passed live security checks.

No pending PR is merged or modified by this design. Rebase and re-inventory effective definitions after intervening main changes before implementing.

## Remaining product decisions and implementation order

1. Approve owner-only raw history as specified; decide whether any staff event audit capability is necessary and its role/scope/audit requirements. Prefer no additional staff bypass until authorized.
2. Decide the strength of judging privacy. Exact public totals and deterministic rewards permit differencing. Delayed/batched/coarsened public displays or small-sample aggregate controls need separate approval; they cannot be promised alongside unchanged immediate exact totals. Do not change rewards/quorum to solve this in the authorization patch.
3. Explicitly approve or narrow public facets, streak, standing and PR #14 statistics. Public rank/total is approved; metadata-rich aggregates are not automatically approved.
4. Confirm author/fighter/juror historical access after removal: proposed default is no normal-source bypass, with owners retaining only their private ledger. Approve any separate moderated audit path explicitly.
5. Implement H3 first in its own additive migration with owner client compatibility and reward regressions. Then implement M1 using one reviewed caller-bound predicate across raw policies and definer readers, preserving BLIND and historical rules. Independently unblock Step 4C only through fresh explicit authorization; this design does not grant it.
6. Validate both on an authorized environment, then review/deploy separately. No production-readiness or zero-vulnerability claim is warranted.

## Inspection and validation record

This checkpoint performed read-only code inspection and documentation authoring. **No SQL, migration, security-validation transaction, pgTAP installation, app test suite, Android test or deployment was run.** Earlier Step 4B/4C results are not evidence that this proposed design passes; none are counted as new validation. Step 4C's failed pgTAP attempt is not a passing authorization test.

Repository sources inspected for this design:

- `supabase/migrations/20260926160000_clash_engine.sql`
- `supabase/migrations/20260927010000_clash_draw.sql`
- `supabase/migrations/20260928110000_blind_clash.sql`
- `supabase/migrations/20260930140000_comment_media.sql`
- `supabase/migrations/20261002150100_live_arena_schema.sql`
- `supabase/migrations/20261005130100_arena_reputation_facets.sql`
- `supabase/migrations/20261005130200_arena_call_backup.sql`
- `supabase/migrations/20261005130300_arena_reactions_and_entertainment.sql`
- `supabase/migrations/20261007120000_arena_duel_foundation.sql`
- `supabase/migrations/20261007130100_arena_challenge_lifecycle.sql` and existing canonical authorization/recovery migrations, including `20261009100000_canonical_authorization.sql`, `20261009110000_official_retry_and_recovery.sql`, `20261009120000_historical_settlement_recovery.sql`
- `supabase/migrations/20261008110000_profile_read_security.sql`
- `supabase/migrations/20261008110100_relationship_and_crew_security.sql`
- `supabase/migrations/20261008110200_arena_content_visibility.sql`
- `supabase/migrations/20261008110600_canonical_topic_visibility.sql`
- `supabase/migrations/20261008121000_arena_discovery_states.sql`
- `services/clashEngineService.ts`, `services/profileService.ts`, `services/arenaGameService.ts`
- `app/clash/[takeId].tsx`, `app/(tabs)/notifications.tsx`
- Existing test filenames and relevant reputation/Clash policy assertions located by repository searches.
- Step 4B reference: `docs/PHASE_11_PRIVACY_RLS_AUDIT.md` from audit commit `2458013` (not merged into this main base).

Only this document belongs in the new draft PR. Final delivery reports documentation whitespace/scope checks and Git status separately from unexecuted security validation. The primary checkout and unrelated Crew modifications must remain intact.
