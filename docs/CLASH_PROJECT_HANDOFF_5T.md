# CLASH project handoff — Phase 11 Step 5T

12 October 2026. **Frozen integration candidate; hosted deployment and integrated database security BLOCKED.** This document describes repository contracts and prior evidence, not a working hosted release. Start with [the staging readiness plan/checklist](PHASE_11_HOSTED_STAGING_READINESS_5T.md).

## Step 5U progress and next action

[Hosted executor preparation](PHASE_11_HOSTED_EXECUTOR_PREPARATION_5U.md) and [creation checklist](HOSTED_STAGING_CREATION_CHECKLIST.md) now supersede the file-only preparation item below. [Step 5U draft PR #45](https://github.com/Xcalibur-hub/clash-app/pull/45) is stacked on [PR #44](https://github.com/Xcalibur-hub/clash-app/pull/44), open and unmerged. The frozen implementation and artifact lineage are unchanged.

Verified now: 245 frozen hashes, 106 compatibility artifacts, all 89 source suites bundled, ten dblink adapters; 81 prerequisite Node tests and 28 top-level Go tests (23 subtests, 47 leaf cases) pass, plus Go vet. These are mocked/offline results, **zero database connections/migrations/SQL assertions**. Actual CLI 2.40.7 pgx v4 parser regressions confirm TLS settings are dropped during remote URL reconstruction. A separate pinned pgx v5 executor uses explicit verified TLS; no Compose redirection or insecure fallback.

Read-only first-preflight preparation is ready, subject to new staging creation/identity/CA/operator authorization. Direct-host network reachability, hosted owners/extensions/default ACLs, ledger compatibility, all 89 runtime tests, committed fixture cleanup, Storage/Realtime/cron and application behavior remain unverified. The immediate next action is owner selection of organization/region/budget/operator and separate authorization for one new project and read-only preflight. Do not jump directly to migration or fixture execution. Step 4C remains BLOCKED; Step 2F remains DEFERRED.

## Architecture and ownership

CLASH is an Expo / React Native application using Supabase Auth, PostgreSQL/RPCs/RLS, Storage, Realtime and server maintenance. PostgreSQL is authoritative; no second database or alternate competition engine is planned. Expo SDK 54 / React Native 0.81.5 are the recorded app baseline; use package-lock.json rather than upgrading packages during staging preparation.

| Area | Code / database contracts | Invariants to preserve |
|---|---|---|
| Session/backend boundary | `services/supabaseClient.ts`, `utils/backendPolicy.js`, `config/backend-origins.json`, `app.config.ts`, `eas.json` | Origin-scoped sessions; native variant/backend checks. Staging and production allowlists are deliberately empty. No build connects until separately approved origins/configuration exist. |
| Identity / social safety | Auth profile trigger, profile projections, `services/safetyService.ts`, `components/settings/SafetySettingsScreen.tsx` | Server-owned identity/role; private internal profile fields; caller-bound block/mute predicates; account isolation. Keep unrelated Crew discovery work out of candidate changes. |
| Arena Take/challenge/duel | `services/arenaChallengeService.ts`, `services/clashEngineService.ts`, `components/liveArena/DuelRoomExperience.tsx`, `app/arena/challenges.tsx` | Accepted challenge transaction links one canonical Clash/Room and exactly two fighters. Pending goes to Take; canonical goes to linked Room; legacy paths remain supported. Stage transcript is distinct from Crowd. |
| Official transcript and Crowd | `services/arenaCrowdService.ts`, live Arena services/components; `OFFICIAL_RETRY_AND_RECOVERY.md`, `CANONICAL_AUTHORIZATION_REMEDIATION.md` | Fighter-only contributions; stable request keys and payload checks; bounded tuple-cursor recovery; blocks/mutes/source readability; private typing; no fabricated counts/messages. |
| Judging / history | Clash engine RPCs, `HISTORICAL_SETTLEMENT_RECOVERY.md` | Server clock and settlement authority; current zero-ballot cancellation, one-ballot verdict and DRAW semantics unchanged. Settled history read-only; cancelled Crowd denied. Exactly-once rewards/notifications are requirements, not newly verified hosted results. |
| Casual questions/editorial | `ARENA_CASUAL_QUESTIONS.md`, `ARENA_EDITORIAL_PIPELINE.md` | Separate from official judging. Editorial paused/REVIEW_ONLY by default; no autonomous publisher/cron or invented activity. |
| Vault / courses | `services/vaultService.ts`, `services/vaultCommerceService.ts`, lesson/course screens; `supabase/functions/vault-media-access`, `course-lesson-media-access` | Server entitlement-aware reads/signing; H2 keeps raw lesson body/media private. Catalogue metadata/counts remain through approved columns/APIs. No new payment provider/webhook or pricing changes; subscription fixtures are not real billing. |
| World / Explore | `services/worldService.ts`, `services/creatorWorldDropService.ts`, `components/explore/WorldSection.tsx`, World screens; PostGIS/geo RPCs | Explicit location consent, no background tracking, coarse/fuzzed discovery, source/media/block/mute checks, request-order/focus/account isolation. MapLibre probe is separate experimental work; do not change production/native mapping in this phase. |
| Profile / notifications | `services/profileService.ts`, `components/profile/ProfileScreen.tsx`, notification routing and Clash services | H3 owner-only raw reward history/public aggregates; M1 denies hidden known IDs and clears stale account content. Stats additionally check canonical Room visibility. H1 helper cannot be client-invoked. |
| Operations | `run_maintenance`, `clash-maintenance`, bounded operator diagnostics; `tools/isolated-supabase` | No client settlement clock, public service-role operations, duplicate scheduler or silent partial-success claim. Compose harness is local-specific, not hosted provisioning. |

A code contract is not evidence that its deployed RLS behaves correctly. Real hosted ownership, grants, service settings, auth flows and concurrency must be established on the future approved target.

## Candidate and PR dependency map

Frozen implementation `9c71d72a15095047821789386ca9d395961bab4f`; docs/manifest seal `a92a550527f810913b01f6e6411dc78996c71a06`. Manifest lists **245 source blobs = 106 migrations + 89 SQL suites + 50 integrated client/config/harness artifacts**. Any implementation or SQL change invalidates the freeze and needs a new reviewed manifest. Windows checkout line endings are not the Git-blob hash source.

| PRs | Dependency / status meaning |
|---|---|
| #13 / #14 / #18 / #19 | Comment notifications, profile stats, committed Crew core UI, Safety Settings integrated in #26 |
| #15 / #16 / #17 | Portable client checks and historical/local E2E harness; #17 supersedes #16's harness. Local-only SQL must not be repurposed for hosted by defeating guards |
| #20 / #22 | Privacy audit and H3/M1 design references, not extra migrations |
| #21 / #23 / #24 | H1/H2, H3, M1 implementation integrated in #26; direct database security remains unverified |
| #25 / #26 | Earlier staging audit and coherent candidate; #26 renames Safety test to **086**, retains **084** comment replies, **085** stats, **087–089** security; adds `20261011095952_profile_stats_clash_visibility.sql` |
| #27 / #28 / #29 / #30 / #31 | Failed fresh validation, BOM audit/tooling, next failure, extension-hook investigation and reviewed compatibility artifact |
| #32 / #33 / #34 / #35 | Attempt/startup evidence, localhost-binding checker/proposal and Compose harness |
| #36 / #37 / #38 / #39 | Runtime/client-auth failure evidence and fix; Windows plugin-discovery failure evidence and environment fix |
| #40 / #41 / #42 / #43 | Step 5P / 5Q evidence, bootstrap import-order fix and Step 5S TLS failure report |
| #44 / Step 5T | Documentation and offline evidence only; stacked against #43, no merge/deployment authority |

These are provenance relationships, not a claim that all current GitHub heads are merged or unchanged. Exact #13–#24 integrated heads are frozen in `PHASE_11_INTEGRATION_CANDIDATE.md` and its manifest. Before promotion, re-inventory head drift; never integrate draft heads automatically. The active evidence chain is #26 → #31 → #35 → #37 → #39 → #42 → #43; #34's binding checker is an included prerequisite. No source PR is modified by this documentation branch.

## Verified evidence and unresolved blockers

| Evidence | Actual scope |
|---|---|
| PR #26 prior client validation | Typecheck; 539 unit tests; Doctor 18/18; focused Stage/Crowd/World/security static checks. Controlled client/static checks only |
| Step 5S prior validation | 81 offline tests; 245 hashes/106 artifacts; pinned images; nine container bindings; localhost DB listener; three managed jobs; corrected noninteractive bootstrap; extension identity/file-privilege prerequisites passed |
| Step 5S stop | CLI TLS refused before migrations: **0 applied, 106 blocked; 0 SQL suites, 89 blocked; 0 database TAP assertions**. Five runtime services never started. Cleanup inventories/primary hashes matched |
| New Step 5T | 245 hashes, 106 artifacts, four vendor hashes reverified file-only; **27 artifact/encoding tests passed**; full 89-file static test safety inventory; documentation/link/whitespace checks |
| Never established here | Hosted migration compilation, effective H1/H2/H3/M1, complete SQL/concurrency, managed publication behavior, end-to-end hosted OTP/Storage/private Realtime, real app account switching, load/quotas |

Priority blockers: target/region/budget approval; supported hosted extension identities; trusted owner/default ACL checks; reviewed certificate-verifying migration runner; ten local dblink suites requiring hosted adaptation; controlled fixture/cron cleanup; staging origin allowlist; Edge key/JWT compatibility; SMTP and tester controls. H3 leaves aggregate differencing/small-jury vote-inference risk; guaranteed ballot anonymity remains a product decision requiring separate scope. Dedicated hosted staging reduces local harness bootstrap concerns but does not waive any security gate or guarantee historical SQL compatibility.

The old nine concurrency labels omit dblink suites 053/076 and include 048's transaction-contained ranking scenario. The new inventory identifies **ten actual dblink suites**; all have local connection literals and remote commits. Outer ROLLBACK is insufficient cleanup. No unchanged full-suite hosted execution is approved.

## Next checkpoints and ownership

1. **Owner/security reviewer:** accept the plan, staging organization/region/budget and least-privilege access model. Do not give agents production credentials.
2. **Step 5U file-only engineering checkpoint:** executor/TLS contract and ten suite adaptations prepared with offline tests. Review the new draft and its runtime limitations; source migrations/tests are preserved. This completes preparation, not database validation.
3. **Separately authorized target preflight:** create one named new hosted project; inspect managed schema/extension/role identities and supported capabilities; stop on mismatch. No fallback to existing local/hosted databases.
4. **Separately authorized deployment/validation:** use the checklist, one controlled ordered migration run, focused security tests, complete mapped 89 suites, JWT/API/Storage/Realtime/cron checks, actual TAP accounting and scoped cleanup. Obtain acceptance before testers/builds.
5. **Later app/device checkpoint:** approve disjoint backend origin and staging build/OTA configuration, controlled tester access and Android verification. No automatic merge/production promotion follows staging results.

Step 4C remains **BLOCKED against existing local databases**; its consumed authorization is not renewed. Android Step 2F remains **DEFERRED**. No Figma/native/UI redesign, payment work, new judging/gameplay, migration rewrite or database reset is included.

Primary checkout: `C:/Users/91962/Desktop/Clash` retains its six modified tracked Crew/development files and existing untracked Crew directories/migration/test and other artifacts. No stash/discard/overwrite/commit of that work is permitted. Step 5U tooling/documentation is confined to the new `C:/p11exec` worktree. Primary status and all six modified tracked-file hashes match the preservation baseline.
