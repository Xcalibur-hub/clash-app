# Phase 11 Step 5B - Integration candidate

2026-10-11. Repository Xcalibur-hub/clash-app. Isolated worktree `C:/p11int`; branch `integration/phase-11-staging-candidate`. Reference: [staging readiness PR #25](https://github.com/Xcalibur-hub/clash-app/pull/25).

**Candidate prepared; NOT database-validated or deployment-ready.** Step 4C remains **BLOCKED**; Android Step 2F remains **DEFERRED**. No database queries, SQL execution/compilation, pgTAP, validation transactions, migrations, project operations, Docker operations, environment-file/secret changes, Android operations or merges into main/other branches occurred. `supabase migration new` created a file only. No running backend was touched.

## Frozen candidate and provenance

Base: `eccd5214e0c6e3ce68f86b9656d972441b53a34a` (latest main fetched for this checkpoint). Tested implementation commit: `9c71d72a15095047821789386ca9d395961bab4f`. The JSON manifest records this commit/tree, every migration and SQL-suite hash, integrated client/config/harness artifact hashes, PR provenance, dependencies, actual results and validation order.

[PHASE_11_INTEGRATION_CANDIDATE_MANIFEST.json](./PHASE_11_INTEGRATION_CANDIDATE_MANIFEST.json) uses SHA-256 over exact **Git blob bytes**; Windows checkout line endings may differ. The final delivery commit is a documentation/manifest seal directly after the implementation commit. This avoids a self-referential commit hash: its only changes are this report and the manifest, and its SHA is reported with the draft PR. Validate that relationship and all recorded hashes before any future use. Any implementation, migration, test or backend-origin change invalidates this freeze and requires a new reviewed manifest.

Fetched GitHub pull refs, not stale worktree tips, supplied these heads. All were integrated into this new candidate only; original branch refs/PRs were not edited or merged. Existing primary-checkout modifications and untracked Crew files were rechecked unchanged.

| PR | Inspected head | Classification |
| --- | --- | --- |
| #13 | `03429fe63628064a48486c16e346ff8330200bcb` | implementation |
| #14 | `ac7639ed070a2d59c65534f1c1dde66dd96b034e` | implementation |
| #15 | `b4f77eeb6314b8e0d542f2b50a086baa4d06cd76` | non-database harness |
| #16 | `ecac2183d7b53b0d6dc2b1ce50ed2c55b7b90088` | historical documentation and superseded harness |
| #17 | `401b4b424bf7c9240047d802d889c9d8adb78b61` | documentation and superseding rollback-default SQL harness |
| #18 | `5aa256b2c784bd3d08bab3959ed7e460fd819bd1` | implementation using committed Crew core |
| #19 | `547fdc43f3df6c518c2af23590215badeed32d40` | implementation and safety tests |
| #20 | `245801378a7b94479df01bcf22f9c8db6a918526` | documentation only |
| #21 | `c6ab76677068120458c88dce54da10f26a66cda3` | H1/H2 implementation and blocked validation evidence |
| #22 | `6b0ac7dbaa2b35640e2650964fc9608b1ed7a949` | documentation only |
| #23 | `d715ded83368b8c6a413f4b9f82018a5ecc0fd31` | H3 implementation |
| #24 | `57ceb1b9c71a63845a88e4abc33a67a678dafb69` | M1 implementation |

Implementation: #13, #14, #18, #19, #21, #23, #24. #15 is the portable controlled harness. #16/#17 retain historical evidence, with #17 replacing #16's SQL harness. #20/#22 are reference documentation, not extra schema. Historical results in imported reports are not fresh validation.

Integration/review order: profile stats and notifications -> portable harness -> #16/#17 evidence/safe harness -> committed Crew implementation -> Safety Settings -> privacy audit -> H1/H2 -> privacy design -> H3 -> M1 -> integration fixes. Physical SQL order remains timestamp order, independently of Git integration order.

## Conflict resolution and security preservation

- **SQL suite collision:** retained `084_comment_reply_notifications.sql`, renamed Safety Settings to **086_safety_settings.sql**, updated active references and historical audit/design notes. 085 stats, 087 H1/H2, 088 H3 and 089 M1 remain distinct. Final directory has **89 uniquely numbered SQL suites**.
- **ProfileScreen:** combined authoritative counts/optional own facets (#14), focus safety refresh (#19), and caller-scoped history/opponent masking (#24). Shell/tab/soft-refresh generations remain independent. Blur invalidates requests; every history focus revalidates permissions rather than trusting cached rows. Optional facets are masked during account/profile transitions. Failed optional facets do not fail the profile shell.
- **profileService:** retains stats parsing/unknown-on-error behavior and M1 empty-list handling for denied history. No fabricated verified zeros after transport errors.
- **Clash screen/service:** keeps H3 owner-only event retrieval, session subscription/late-response rejection and reward masking, plus M1 render-time result masking, read-denial handling and generation guards. Missing/denied verdicts never manufacture outcomes. Tests accept a completely masked VerdictReveal on identity change and additionally assert its absence.
- **Notifications:** #13 writes existing Take/comment/reply payloads; #24's comment/reply paths retain Take routing, while Clash-related notifications re-fetch the readable Clash and fall back safely if denied. H1 revocation remains; no direct interactive notification helper is reopened.
- **Package scripts:** union of profile tests, portable engagement, safety, H3, M1 and staging checks; no prior unit files removed. No dependency/version/native-module additions.
- **Harnesses:** #15's root-relative portable harness supersedes #19/#21's smaller path-only patch. #17's allow-GUC, temporary-report, rollback-default harness supersedes #16's durable default. SQL harnesses, cleanup and the Step 4C wrapper were **not run**. Its optional durable mode is not authorized by this candidate.
- **Crew boundary:** integrates only PR #18's committed core-RPC implementation. Dirty primary Crew discovery/UI/scripts and its uncommitted migration/test are excluded.
- H1/H2/H3/M1 migrations preserve their imported Git blobs. No blanket grants, owner changes, RLS relaxation, reward, timing, payment, judging or settlement-engine modifications were added.

## Additive profile statistics correction

New file: **20261011095952_profile_stats_clash_visibility.sql** (CLI-generated filename, not applied). Dependencies: profile stats `20261010120000` and M1 `20261011081531`.

The SECURITY DEFINER aggregate retains settled-with-verdict selection, DRAW/win/loss calculation, readable source and challenger relationship filters, and adds **public.clash_readable(c.id)**. That predicate includes the canonical Room visibility gate. The migration fails if stats and M1 do not share the expected trusted definer owner/empty search_path; it does not repair owner/grants by widening access. Existing public aggregate EXECUTE contract is preserved; raw history remains H3 owner-only.

Extended **089_m1_clash_visibility.sql**: denied-source/block/mute helper scenarios also compare aggregates to caller-readable results; readable legacy and canonical DRAW totals remain represented. A focused rolled-back fixture case keeps the source readable while hiding the settled canonical Room from a nonmember, expecting one legacy DRAW rather than two; an existing fighter retains both. This distinguishes the new gate from the older Take-only filters. These SQL assertions are prepared, **not executed**.

Final migration chain: **100 main + five imported additions + one additive correction = 106**. Ascending imported/additive tail:

1. `20261010120000_profile_clash_stats.sql`
2. `20261011053717_critical_authorization_hardening.sql`
3. `20261011074540_h3_reputation_history_privacy.sql`
4. `20261011081531_m1_clash_verdict_visibility.sql`
5. `20261011095952_profile_stats_clash_visibility.sql`
6. `20261011120000_comment_reply_notifications.sql`

The manifest enumerates all 106 files in exact order. Local installed objects and migration ledger are not an input, and their current alignment is not claimed.

## Staging identity and backend isolation

Prepared in app.config.ts/eas.json, config/backend-origins.json, utils/backendPolicy.js/.d.ts and services/supabaseClient.ts:

| Variant | Native package / iOS bundle | Scheme | Behavior |
| --- | --- | --- | --- |
| Development | com.clash.v2.dev | clash-dev | Existing identity and local/hosted development flexibility retained |
| Preview / production | com.clash.v2 | clash | Existing identities retained; hosted CI/runtime guards require production-approved origin |
| Staging | **com.clash.v2.staging** | **clash-staging** | CLASH (Staging), dedicated EAS `clash-staging` channel, explicit staging variant |

Unknown variants fail instead of silently falling back to production. Staging always requires its native app identity and approved HTTPS backend, even in development JS. Production native identity rejects development/staging variant substitution; staging native identity rejects another variant. Both allowlists reject ambiguous overlap, credentials, alternate schemes, suffix-host tricks, paths/query/fragment and wrong backend origin before client creation. Empty configuration creates no client.

**Both committed approved-origin lists are intentionally empty.** No project reference was invented, and no existing endpoint/secret/environment was copied. Staging and hosted release builds/connections remain blocked until an operator separately approves disjoint exact origins in a reviewed change and supplies configuration through the authorized build environment. This is an explicit release prerequisite, not a deployable default. Non-CI config inspection remains possible without a backend. No EAS build/update/environment was created or changed remotely.

Auth session storage is now scoped to the exact backend origin (including local port). Old generic keys are not migrated automatically; users must reauthenticate after adopting this candidate. Existing app data is not cleared or deleted. Separate staging native identity also isolates AsyncStorage, persisted official-request keys and in-memory caches from the production app sandbox. No live cross-project sessions, OTP, native install or OTA behavior was tested. Channel configuration alone does not provision an OTA service/runtime policy; review that separately if enabled later. EAS staging uses the existing preview environment name, so its supplied endpoint must pass the new staging allowlist rather than relying on that label.

The shared policy is CommonJS with a TypeScript declaration because Expo's config evaluator cannot import uncompiled sibling TypeScript here. The same implementation is used by config and runtime; no new dependency is needed.

## Hosted prerequisites still unresolved

- **Default/effective grants:** initial migration explicitly establishes broad future-table SELECT defaults for anon/authenticated and service-role privileges for its creator. New hosted opt-in defaults cannot be assumed to override that chain. Review final table, column, sequence, function and default ACLs plus inherited roles under the exact migration owner. Preserve public projections, H2 column restrictions, H3 owner boundary and BLIND revokes. No blanket grant or speculative global revoke was added.
- **SECURITY DEFINER / recursion:** confirm trusted owner alignment, empty search_path, no interactive BYPASSRLS/owner inheritance, FORCE RLS assumptions and helper call chains. M1's fail-closed ownership/anchor assertions and the new stats owner check must succeed naturally. Do not disable RLS or change owners to silence failure.
- **Storage bootstrap:** managed storage.buckets/objects must exist before the media migration; it NOTICE-skips absent schemas. Verify final buckets/policies and global-versus-bucket size limits. Never substitute destructive seed.sql/storage bootstrap wrappers. If the authorized target lacks required objects, prepare a separately reviewed minimal fix-forward migration. Public CDN URLs do not become private when a row is hidden; signed private URLs have an expiry window.
- Managed Auth/Realtime/Storage, PG17/PostGIS/pgcrypto/pg_cron versions, final publication/private typing policies, cron execution, maintenance ownership/diagnostics, Edge JWT/key format and course-media config need real target evidence. No such target was queried.
- SMTP/OTP templates, safe tester ownership, budgets, external provider configuration, media backups, concurrency capacity and eventual staging origin remain undecided. Payment test mode is blocked by the missing payment-provider/webhook implementation; no payment work is included.
- Source PRs remain independent drafts. Later head changes must be reinventoried; this candidate is a frozen snapshot, not permission to merge any source PR. Integration-specific corrections should be reviewed here before promotion.

## Tests actually executed

Node **22.11.0**, npm **11.6.0**. Installed the existing lockfile in this isolated worktree with `npm ci --ignore-scripts --no-audit --no-fund` (813 packages; no dependency edits). npm warned that expo-doctor 1.20.4 expects Node >=22.13.0 on the Node 22 line, plus existing transitive deprecations. Doctor nevertheless ran successfully. Use an approved supported/pinned Node version for later CI; no global toolchain was changed.

| Command / scope | Final actual result |
| --- | --- |
| npm run typecheck | Exit 0; no diagnostics |
| npm run test:unit | Exit 0; **539/539 tests**, 124 suites, 0 failed/skipped |
| node --test scripts/staging-isolation-check.cjs | Exit 0; **16/16**, also included in unit suite |
| npx --no-install expo-doctor | Exit 0; **18/18** |
| node scripts/arena-engagement-check.cjs | Exit 0; 12/12 |
| node scripts/safety-settings-check.cjs | Exit 0; 24/24 |
| node scripts/official-service-check.cjs | Exit 0; 14/14 |
| node scripts/crowd-service-check.cjs | Exit 0; 7 PASS labels |
| node scripts/duel-render-smoke.cjs | Exit 0; 22/22 |
| node scripts/settlement-history-check.cjs | Exit 0; 11/11 |
| node scripts/typing-service-check.cjs | Exit 0; one combined PASS contract |
| node scripts/account-isolation-check.cjs | Exit 0; two PASS contracts |
| node scripts/arena-navigation-check.cjs | Exit 0; 11/11 |
| node scripts/challenge-inbox-check.cjs | Exit 0; 18/18 |
| node scripts/interest-client-check.cjs | Exit 0; 12/12 |
| node scripts/question-client-check.cjs | Exit 0; 25/25 |
| node scripts/explore-security-check.cjs | Exit 0; 8/8 |
| node scripts/world-consent-check.cjs | Exit 0; 8 assertions |
| node scripts/world-request-order-check.cjs | Exit 0; 21 assertions |
| node scripts/world-empty-discovery-check.cjs | Exit 0; 13 assertions |
| node scripts/world-pan-request-check.cjs | Exit 0; 8 assertions |
| node scripts/world-discovery-runtime-check.cjs | Exit 0; 35/35 controlled scenarios |
| node scripts/integration-static-check.cjs | Exit 0; 9/9 repository checks; 106 migrations / 89 SQL suites |
| git diff --check | Passed |
| Database / pgTAP / live Auth/Realtimes / load / Android | **NOT RUN** under this checkpoint's restrictions |

The combined H3/M1 controlled checks are included in the unit total; standalone runs are not added again. All component/service checks use controlled dependencies, not physical rendering or backend authorization proof. Existing pointerEvents and experimental TypeScript/module warnings are not new device validation.

Initial failures are retained as findings rather than presented as passes: first unit run **532/535, three failures** because M1's profile harness lacked the new optional reputation import/focus callbacks; Safety harness failed after its first 23 checks because it did not support the scope hook; Explore harness still assumed a /Clash/ directory. Fixed mocks/lifecycle/path detection while retaining assertions. H3 reward assertions additionally verify masked verdict absence. First Doctor printed a config-resolution error (despite exit 0); direct Expo config inspection confirmed a sibling TypeScript import failure. Switched the shared helper to typed CommonJS, confirmed config resolution and reran Doctor to 18/18. Static checker initially compared Windows CRLF bytes and omitted the earlier function-definition patch; corrected its repository model rather than changing migrations. An attempted result-aggregation command was rejected by automatic approval review; no effects occurred, and a new full focused run recorded actual subprocess exit codes directly.

Static checks verify unique versions/prefixes, unchanged main and imported migration Git blobs, existing M1 patch anchor after its preceding source-visibility patch, new gate/dependency/owner markers, H1/H2/H3/M1 controls, rollback-default harness, and balanced SQL dollar blocks. **This is not PostgreSQL or PL/pgSQL compilation and proves no database policy.**

## Separately authorized isolated security-validation plan

No validation attempt is started or authorized by this document. Step 4C's consumed authorization is not renewed.

1. Obtain explicit written approval naming a **fresh disposable test environment**, its owner/identity/ports, exact frozen commit/hash manifest, permitted project/container/database creation, PG/managed-schema versions, pgTAP extension initialization/schema, scheduler quiescence, fixture scope, one controlled attempt, timeout, TAP reporting and cleanup/rollback evidence. Do not repurpose/query running local or hosted databases. No environment credentials in reports.
2. Verify all frozen hashes and the docs-only seal; inspect owners/default/inherited ACL preconditions. Prepare exact invocation/suite list for approval. No ledger import, migration repair, seeds, reset or production dump. CLI test-db may initialize pgTAP; its infrastructure effects must be explicitly approved instead of treated as read-only.
3. On that approved target only, compile/apply the **106** migrations in manifest filename order, retaining migration transaction boundaries. Stop on any dependency, owner/anchor, role, Storage/extension or publication failure. Never add blanket grants or silently mark an unapplied version applied.
4. Inspect effective API table/column/function/default ACLs and role inheritance, owner/FORCE RLS recursion assumptions, managed Storage and private Realtime. Verify no API role can directly invoke clash_notify or read locked lesson fields, raw foreign reputation or hidden-source outcomes. Do not weaken assertions to pass.
5. Execute focused 087 H1/H2 -> 088 H3 -> 089 M1/new profile gate, alongside 084 notifications, 085 stats and 086 safety. Cover guest, unrelated/entitled/creator/fighter/juror/staff/service roles, expired/revoked access, BLIND, known-ID joins, directional mutes/blocks, hidden canonical Rooms, settled/cancelled history, trusted notifications and exactly-once settlement/reputation. All fixtures must be controlled and rollback where supported.
6. Run all **89** SQL suites and reviewed concurrency runners on the disposable target; inspect their setup/clock/maintenance/cleanup effects first. Parse actual TAP totals, failures and exits. Any unauthorized success, recursion, duplicate reward/notice, unbounded diagnostics or fixture leak blocks promotion. Preserve failed evidence; no automatic retry/reset/ledger repair. Report skipped suites individually.
7. Only after separate acceptance authorize a dedicated hosted staging project, approved origin configuration, Auth/Storage/Edge/Realtime/cron setup, secrets and safe fixture provisioning. Native staging build/install, Android Step 2F and 100/1,000-user load tests require their own scope/permissions and quota/budget approvals. They remain deferred here.

## Completion boundary

No unresolved textual Git conflicts remain. Semantic target-dependent risks above remain **blockers**, not waived checks. The candidate is for code review and separately authorized isolated security validation only. No deployments, merges, app installations or database retries follow opening the draft PR.
