# Phase 11 Step 5A — Hosted Supabase staging readiness audit

2026-10-11. Repository `Xcalibur-hub/clash-app`. Isolated worktree `C:/p11stage`, branch `docs/phase-11-hosted-staging-readiness`, fetched main `eccd5214e0c6e3ce68f86b9656d972441b53a34a`.

**Planning-ready, NOT deployment-ready.** This document is the only change. No database connection/query, validation transaction, migration, pgTAP installation, project creation/linking, deployment, secret upload, environment edit or Docker operation occurred. Step 4C remains **BLOCKED**, its consumed validation authorization is not renewed; Android Step 2F remains **DEFERRED**.

## Evidence boundaries and blockers

Repository files, fetched branch contents, current GitHub metadata and prior committed reports are evidence. All PRs #12–#24 were confirmed open, draft and unmerged. Prior local results are not new hosted validation. No hosted settings, credentials, ledger or deployed objects were queried.

1. H1/H2 (#21), H3 (#23) and M1 (#24) remain unmerged and database-unverified; client/static passes are insufficient. Step 4C needs explicit fresh authorization.
2. Resolve the 084 test-number collision, overlapping profile/client/harness changes and PR #14's canonical Room visibility omission before any release candidate.
3. Local installed objects diverge from Git. Do not copy the local database or import its migration ledger.
4. Preview shares production app identity; hosted projects share an auth-storage key. Current guards do not bind production to a specific backend.
5. Hosted SMTP/templates, Storage bootstrap, effective grants/default ACLs, extensions/cron, Edge JWT formats and Realtime settings require target verification.
6. Payments have no provider/webhook. Standard capped Pro cannot accommodate 1,000 Realtime connections without a separately approved quota/budget change.

## Architecture inventory

| Layer | Actual repository contract / implication |
| --- | --- |
| Expo/client | services/supabaseClient.ts creates one typed supabase-js client from EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. AsyncStorage persists sessions; foreground/background controls refresh. Never ship service-role secrets. |
| URL types only | Primary .env has hosted HTTPS; .env.local has loopback HTTP; template URL is empty. Values/references/keys were neither printed nor copied. Phone's loaded bundle/backend was not inspected. |
| CLI/config | PATH/Scoop CLI **2.40.7** verified by --version. Prior recorded npx/cache CLI **2.120.0** differs: pin one later. config.toml project_id=clash, PG major 17; API/DB/shadow/Studio/Inbucket ports 55321/55322/55320/55323/55324; pooler disabled; API public/graphql_public, search_path public/extensions, max_rows 1000. Local config is not hosted provisioning. |
| Schema | **100 main migrations**, 83 SQL test files. Main includes Auth/social/media, Clash/DRAW/BLIND, Vault, World/PostGIS, live Arena, Crews, canonical lifecycle, Crowd, Phase 0.5, interests/inbox/recovery/editorial and World security. Full ascending manifest below. schema.sql does not replace this chain. |
| Auth | authService.ts signInWithOtp(shouldCreateUser=true), verifyOtp(type=email). Password helper is local-only. Auth insert trigger assigns opaque profile ID/random handle/server-owned viewer defaults; editable user_metadata must not authorize roles. |
| Local Auth | Anonymous/SMS/unused external OAuth disabled; OTP 6 digits/3600s, JWT 3600s, refresh rotation on. Local localhost redirects, Inbucket, enable_confirmations=false and max_frequency=1s are not recommended hosted settings. |
| Storage | 20260926150000_media_storage creates public-media(public), private-media(private); 100 MiB bucket ceilings, approved image/video MIME list. Local global 50 MiB limit differs: verify global/bucket/per-kind effective limits. Caller profile path controls upload, owner controls private read/update/delete; media RPCs add completion/access checks. |
| Private media | vault-media-access and course-lesson-media-access authorize with caller RPCs, service-sign for 120s. Revoked source discovery does not revoke already-public object URLs/CDN caches. Test metadata visibility and private URL expiry separately. |
| Realtime | Final main publishes Room messages, Crowd messages and creator live sessions/interactions/events. Spectator migration removes evidence/results publication; recovery uses authorized RPCs. Meet private text deliberately avoids public Postgres Changes. Inspect final publication, not all historical ADDs. |
| Typing | 20261008110300 uses server identity, membership/readability/rate-limited RPCs and private arena-typing broadcasts; RLS SELECT on realtime.messages. Client Presence metadata is not authoritative; counts must be server-derived. |
| Cron/background | 20260927030000 schedules clash-maintenance each minute, run_maintenance(500); later migrations fold Vault expiry, Room transitions and trend work into that seam. pg_cron failure is NOTICE-only: migration success does not prove job execution. No duplicate scheduler/engine. |
| Diagnostics | 20261009120000 provides operator-only safe SQLSTATE categories, pending/resolved failures, seven-day/1,000-row bounds and advisory batch serialization. Validate actual cron/settlement recovery; ordinary clients cannot read diagnostics. |
| Extensions | Main explicitly creates pg_cron, PostGIS and pgcrypto (latter two in extensions). Managed Auth/Storage/Realtime objects are prerequisites. pgTAP is test infrastructure; graphql_public in config alone does not require enabling pg_graphql. |
| Editorial | 20261009140000 defaults paused/REVIEW_ONLY, no sources/publisher/cron. Preserve these defaults; do not fabricate live debates, Crowd or trends. |
| Seeds | seed.sql truncates Arena/profile data and inserts demos. config references local Auth/Clash/creator-world fixtures and storage bootstrap. Exclude **all local seeds/reset wrappers** from hosted provisioning. Review catalogue rows inside migrations as dependencies, not blanket-deletable fixture data. |

### Edge Functions and environment names

No values copied. Existing runtime dependencies SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY require target key-format compatibility review.

| Function | Authorization and additional names | Plan |
| --- | --- | --- |
| vault-media-access | verify_jwt=true; caller entitlement RPC; SUPABASE_* | Core private-media gate |
| course-lesson-media-access | bearer getUser + course_lesson_media_target; SUPABASE_* | File exists but no explicit config.toml stanza: pin intended deployment/JWT settings |
| arena-gifs | verify_jwt=true; authenticated quota proxy; SUPABASE_*, TENOR_API_KEY | Optional; EXPO_PUBLIC_ARENA_GIFS_ENABLED remains false until approved |
| arena-editorial | verify_jwt=false; mandatory 32+ character x-editorial-secret; SUPABASE_URL/SERVICE_ROLE_KEY, ARENA_EDITORIAL_RUN_SECRET, ARENA_AI_API_KEY/MODEL/BASE_URL; per-source secret_name | Remain paused with no scheduled caller; runner secret never in client |
| creator-ai | verify_jwt=true and caller checks; SUPABASE_*, CREATOR_AI_API_KEY/BASE_URL/MODEL | Optional provider disabled initially |
| digital-creator | verify_jwt=true, authorized render; SUPABASE_*, DIGITAL_CREATOR_API_KEY/BASE_URL | Optional; no fabricated rendered output |

External integrations: SMTP/domain; optional AI/render providers and licensed RSS/JSON sources; Tenor; map provider key EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in current Expo config; Sentry EXPO_PUBLIC_SENTRY_DSN and build-only SENTRY_AUTH_TOKEN/ORG/PROJECT; PostHog EXPO_PUBLIC_POSTHOG_API_KEY/HOST. Meet video has STUN fallback; TURN reliability remains a separate provisioning decision. Payment webhook, merchant conversion ingestion, push delivery and media-scanner functions are absent. No new integration is implemented here.

### Recorded local history — not rechecked

- SECURITY_REMEDIATION.md records object-equivalence verification before recording Crowd versions 20261008100000/20261008100100 and seven remediation versions. Later alignment checks were historical/local only.
- PR #21 investigation recorded PG 17.6/image 17.6.1.155, ledger latest **20261011120000**, main tail 20261009190000, absent installed pgTAP with package 1.3.3 available. CLI installs/removes pgTAP around tests; direct no_plan failure was not fixed by search_path.
- PR #16 recorded profile_clash_stats installed but **20261010120000 absent from ledger**. PR #18 recorded **20261006140000_arena_crews_discovery** installed/ledgered locally, but uncommitted and excluded from main/that PR.
- Do not infer current alignment or hosted equivalence. Do not run verify-crowd-ledger, migration-list, db-pull/diff, test-db or copy/repair this ledger under this audit.

## Pending PR dependency/conflict matrix

Current status: every row **open DRAFT, unmerged**. Hashes identify inspected heads. Static diffs/SQL were inspected, not integrated.

| PR / head | Content | Integration requirement |
| --- | --- | --- |
| #12 b4a665a | Backend audit | Historical full 2,897-test run failed concurrency credentials; not a full pass |
| #13 03429fe | 20261011120000_comment_reply_notifications; 084_comment_reply_notifications | Trusted trigger/helper, non-client EXECUTE, existing Take notification routing; test against H1 |
| #14 ac7639e | 20261010120000_profile_clash_stats; 085_profile_clash_stats; profile/hydration/types | Definer stats checks source/challenger but omits canonical Room readability; add M1 gate before integration |
| #15 b4f77ee | Engagement harness/package | Reconcile portable harness with #19/#21 while preserving assertions |
| #16 ecac218 | E2E docs/validation SQL | Superseded harness safety by #17; device multi-account proof historically blocked |
| #17 401b4b4 | Reward audit, same E2E script + cleanup | Preserve rollback default/allow-GUC; do not run cleanup as hosted provisioning |
| #18 5aa256b | Crew UI/payload/tests | Uses committed list_arena_crews/core RPCs; no new migration or dirty discovery dependency |
| #19 547fdc4 | Safety UI/services/harness; 084_safety_settings | Rename to **086_safety_settings.sql** in authorized integration; 086 unused in inspected inventory |
| #20 2458013 | Privacy/RLS audit | Evidence only, no schema |
| #21 c6ab766 | 20261011053717_critical_authorization_hardening;087 | **BLOCKED**; H1 revokes clash_notify client/service EXECUTE, trusted owner remains; H2 revokes table+column SELECT then safe catalogue grants |
| #22 6b0ac7d | H3/M1 design | Contract/reference only |
| #23 d715ded | 20261011074540_h3_reputation_history_privacy;088; owner-history clients | Combine with #24 without losing owner/session guards |
| #24 57ceb1b | 20261011081531_m1_clash_verdict_visibility;089 | Shared caller predicate, raw policies, RPC/history guards; owner/anchor preconditions; SQL NOT VERIFIED |

Shared-file overlaps: ProfileScreen (#14/#19/#24), profileService (#14/#24), package.json (#14/#15/#19/#23/#24), arena-engagement-check (#15/#19/#21), phase11_arena_e2e_validation.sql (#16/#17), Clash screen and clashEngineService (#23/#24). Preserve the union of protections/tests; #24 notification routing must handle #13's existing Take payloads. Shared edits require semantic review, not necessarily textual Git conflicts.

The five requested pending SQL additions have no duplicate migration timestamps. Two different **084** filenames coexist in Git but collide in sequence/cross-references: reserve086 for safety. No pending file/branch was modified. Re-inventory after any new commit.

## Recommended hosted staging setup — future authorization required

Create a **new dedicated clash-staging project**, never repurpose the existing .env endpoint or copy the local database. Recommend specific Mumbai ap-south-1 for the India-based tester cohort; confirm geography/residency/availability before approval. Singapore is an alternative requiring a latency/residency decision. [Region guidance](https://supabase.com/docs/guides/platform/regions).

Use separate project reference, operator access, secrets, SMTP sender, telemetry and budget. No production users/credentials/private data dump. Operator MFA/minimum permissions, accountable owner and retention decisions are prerequisites. No project inventory was queried in this audit.

### Auth, accounts and synthetic data

Custom SMTP with a verified staging sender/domain is needed for controlled testers. Default hosted SMTP is team-address-only and currently 2 emails/hour. Use a template containing the **numeric OTP token**, not only a magic link, for verifyOtp. [SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp), [Free template restrictions](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

Disable anonymous sign-ins/unused OAuth/SMS; review confirmation, expiry/rate limits, refresh rotation. Do not copy localhost redirects or 1-second local email frequency. Approve staging site/exact deep-link redirects for any future link flow; detectSessionInUrl=false is not a completed OAuth callback handler.

Create controlled test identities: author, Fighter B, unrelated viewer/jurors, blocked/muted pair, creator, active/expired/revoked subscriber and authorized moderator. Assign role/entitlement fixtures through reviewed trusted operations, never user_metadata. No local seeded passwords, JWTs or auth hashes copied. Keep ID/ownership manifest; runtime fixtures excluded from discovery. Ordinary-feed E2E may use explicitly labelled tester-authored staging records, never fake production activity. Test empty screens with genuinely empty data. Editorial/AI and billing stay disabled initially.

### Expo isolation proposal — not implemented

app.config.ts development identity is com.clash.v2.dev / clash-dev; **preview and production both use com.clash.v2 / clash**. All hosted backends share sb-clash-hosted-auth-token in supabaseClient.ts. The CI/EAS guard only rejects localhost/loopback for non-development; it cannot prevent production-to-staging or staging-to-production. dev:hosted renames .env.local and uses existing .env: do not execute it here.

A separately approved code checkpoint should add explicit staging variant/package/bundle/scheme/name, dedicated EAS environment/update channel, fail-closed backend-project allowlists, and project-scoped auth/cache/storage namespaces. Inspect .env.local precedence and build/OTA JS inlining; invalid staging variants must not default silently to production. CI should reject staging URLs in production artifacts and production URLs in staging artifacts. Record build SHA/backend identity without secrets. No current env edits, app-data clearing or native changes occur in this task.

### Storage, Realtime and Edge prerequisites

Ensure managed Storage exists before media bootstrap: migration NOTICE-skips missing storage tables; local seeds are excluded. Verify final bucket settings/policies. If skipped, author a reviewed minimal hosted-compatible additive migration later, not run local seed.sql/bootstrap wholesale. Test caller namespaces, MIME/size limits, completion forgery, deletion, private entitlement and URL expiry. Public CDN URLs cannot promise retroactive revocation. Database backups omit object bytes: [backup limitations](https://supabase.com/docs/guides/platform/backups).

Verify final publication, private channel policies, known-ID subscription denial, account cleanup, reconnect pagination and genuine counts. Current platform prevents Realtime-owned schema modifications except permitted RLS changes on realtime.messages; CLASH's typing uses that permitted path. Do not create/alter/drop managed Realtime objects to resolve failures. [Realtime schema notice](https://supabase.com/changelog/realtime-schema-locked-down-against-modification).

Deploy only selected functions after SQL/security gates, explicitly review course function config and target signing/public key formats. Preserve per-handler caller getUser/RPC authorization; never disable JWT globally to fix incompatible keys. Editorial is a deliberate non-JWT exception with its own secret, still paused/no cron. Record function SHA/config, secret **names** and rotation owner; no secrets in app/logs. [Edge authorization](https://supabase.com/docs/guides/functions/auth).

### Costs and operations

Checked 2026-10-11: Free $0 has 500 MB database/1 GB Storage and inactivity pausing; suitable only for a small limited trial. Recommend Pro for repeatable staging: starts **$25/month**, $10 compute credit covers one Micro; another Micro in an existing paid organization can add about $10/month. Confirm organization billing, taxes/credits and incremental versus total cost. SMTP, media/egress, optional AI/maps/telemetry and load overruns are additional. Do not purchase PITR/custom domain/log drains without need/budget approval. [Current pricing](https://supabase.com/pricing).

Pro includes 500 peak Realtime connections/5 million monthly messages; capped Pro limit 500 and Free 200 block a 1,000-connected-user test. Obtain approved increased limits or no-spend-cap configuration with a usage ceiling; never disable the cap automatically. Users may open multiple connections and fan-out multiplies traffic. [Realtime limits](https://supabase.com/docs/guides/realtime/limits).

Monitor API/DB/Auth/Edge/Realtime errors, pool queues, locks, cron, pending maintenance failures, Storage/egress and spend. Redact OTPs/tokens/signed URLs/private bodies/relationship metadata. Pro currently has seven-day daily DB backups/log retention; approve restore drill and separate media backup or fixture reproducibility. No restore is authorized now.

## Migration dependency graph and integration order

Start from the 100-file main manifest below. On a **future authorized fresh target**, preserve timestamps/files and normal ascending migration order. Never import local ledger/object state, migration-repair to claim equivalence, use local seeds/reset wrappers, or concatenate everything into one transaction: enum additions/dependent DDL can require separate migration boundaries.

1. 2026092612–2026092703: initial Arena/profiles -> Auth identity/social -> media -> Clash/verdict/reputation -> hardening/DRAW -> cron. Managed Auth/Storage and trusted migration owner prerequisite.
2. 20260928: Vault schema -> RPCs -> entitlements -> notifications/maintenance/storefront; BLIND extends Clash; World/PostGIS -> Drop view.
3. 20260930: sponsor attribution -> hardening -> studio/earnings; comment media extends prior media/comments.
4. 20261002–03: enums before live schema -> spectator/watch/presence/pulse -> Explore discovery.
5. 20261004–05: Meet/World/Vault commerce/creator live-AI -> reputation/backup/reactions/trends. Later function definitions supersede old readers/maintenance.
6. 20261006–07: Crew enums -> core/hardening; correctness -> canonical Room/Clash integrity -> challenge notifications/lifecycle. Exclude dirty Crew discovery.
7. 20261008: Crowd report enum -> Crowd; profile security -> private relationship substitution -> visibility -> private typing/legacy/viewer/topic gates -> discovery -> interests/personalization -> inbox.
8. 20261009: canonical authorization -> official retry/recovery -> historical/maintenance recovery -> casual/editorial/GIF -> Explore/World security.
9. Pending additions, physical timestamp order: **#14 20261010120000; H1/H2 20261011053717; H3 20261011074540; M1 20261011081531; #13 20261011120000**. Total105 candidates before integration addenda, **not** an approved deploy manifest. Security review/validation order H1/H2 -> H3 -> M1; do not reorder applied versions to match PR numbers.
10. Separately reviewed post-M1 additive migration(s): PR #14 stats gate and any confirmed hosted default-ACL/Storage compatibility gaps. Generate filenames with pinned CLI migration-new later. No editing applied migrations or another PR to hide drift. Integrate086 safety tests and union084/085/087/088/089 plus existing suites.

### Preconditions and fail-fast strategy

- Freeze integration commit, manifest hashes, selected PR SHAs, target identity and PG17 compatibility; independently approve owner/credential scope. New target must contain no imported legitimate data.
- Hosted Data API now requires explicit opt-in grants. **CLASH initial migration restores broad future-table SELECT to anon/authenticated and ALL to service_role for the creating role**, so new platform defaults alone do not fix historical grants. Inspect final table/column/default ACLs and creator-role inheritance; propose least-privilege follow-up as needed. Preserve H1/H2/H3 and BLIND revokes. Never GRANT ALL/blanket SELECT to silence 42501. [Data API change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- Verify trusted migration/function owner, empty search_path/schema qualification and required privileges. Interactive roles must not be superuser/BYPASSRLS or inherit/SET ROLE to owner. Caller APIs/views must not bypass RLS accidentally.
- M1 requires trusted owner alignment/table FORCE RLS assumptions to avoid recursion through Room helpers; exact profile history patch anchor must match once. H1/H2/H3 effective privilege assertions must succeed without weakening tests or grants.
- Verify extension versions/schema placement, managed Auth/Storage/Realtime, final publication and cron owner/job. NOTICE-only pg_cron failures require explicit evidence of exactly one maintenance job and successful runs. Authorize maintenance quiescence for time-shift/global fixture suites; never sweep retained user data.
- Separate gates: **SQL compilation/migration order -> effective privilege/RLS/security tests -> stable-build E2E -> load**. Migration success is not security proof; SQL exit 0 is not TAP pass.
- Any migration/ownership/privilege error, unauthorized success, recursion, duplicate award/notice or fixture leak stops promotion. Preserve evidence; keep testers out until resolved. No automatic reset/retry, ledger marking, blanket grants or restore. Fix-forward/rollback/restore require their own reviewed authorization.

## Proposed security and integration tests — NOT EXECUTED

Use a separately authorized isolated test database/rollback session, not interactive staging data. CLI test-db may create/remove pgTAP and spawn a client container: it is not read-only. Do not rerun Step 4C's wrapper. Future authorization must name target, extension permissions, exact SQL/suites, attempt count, timeouts/TAP parsing and restoration evidence.

| Area | Required pass/fail contract |
| --- | --- |
| OTP/profile | Delivery to approved inbox, token expiry/reuse/rate-limit denials, one profile, server viewer role; no metadata escalation |
| Arena/social | Tester Take -> comments/replies/reactions -> correct private notifications; no self/duplicate notices or blocked leaks; honest discovery/empty states |
| Challenges/Stage | Concurrent accept yields one Clash/Room and two fighters; Pending never Live; legacy routing; spectator argument denial; request idempotency/payload conflicts/deadlines/recovery |
| Judging/settlement | Existing eligibility, one-ballot/DRAW/zero-ballot cancellation unchanged; concurrent/repeated settlement awards/notifies once; observable failed maintenance and recovery |
| BLIND/history | Column denial/existing reveal rules; removed/blocked/muted source known-ID/direct joins/RPC/history denied; settled read-only; cancelled new-watch/Crowd denied |
| H1 | Guest/auth clash_notify forgery denied; trusted creation/settlement notifications and retry idempotency preserved |
| H2 | Guest/unrelated direct body_text/media_object_id denied; catalogue counts/navigation preserved; entitled/creator RPC allowed; expired/revoked entitlement/media denied |
| H3 | Owner-only raw ledger, guest/unrelated/export/join denial; public approved totals and GROUP/reward idempotency preserved. Record exact-total differencing risk, not anonymity proof |
| M1 | Raw SELECT/joins and definer APIs: removed source, both block directions, directional mutes, Room gates, BLIND, DRAW, cancelled/missing-link cases; owner/grant/recursion checks. Next READ COMMITTED read after committed revocation denies; in-flight snapshots documented |
| Crews/safety | Core create/join/request/invite/follow/leave, sole-owner/cooldown, list pagination/unblock/unmute, account isolation/no relationship oracle; no dirty discovery dependency |
| Vault/payment | Real entitlement/card/private media access tests. Checkout currently must return payments_unavailable. Sandbox charge/webhook/signature/replay/refund tests **BLOCKED** until provider implementation separately approved; manual entitlements are not billing verification |
| World | Recent/Map/Missions, pan-during-fetch, focus/account lifecycle, blocked author/revoked media, previews/mission auth gate; no automatic location prompt or permission modification |
| Media | Upload namespace/ownership, type/size denial, incomplete/deleted/revoked records, private URL expiry/deletion; public cache limits acknowledged; no scanner pass claim |
| Accounts/realtime | Two real authenticated sessions, private typing denial, Stage/Crowd separation, equal-time pagination/deduplication/reconnect gaps, background/logout/account switch, no stale foreign content |

Future integrated candidate: TypeScript/full unit/Expo Doctor, focused question/navigation/challenge/reputation/visibility/safety/Stage/Crowd/official/history checks; full authorized pgTAP/concurrency suites with real role credentials, TAP assertions/plans and isolated rolled-back fixtures. Resolve prior concurrency credential errors at runner/target boundary; do not skip/count failures as pass. Exercise direct REST/RPC with guest/unrelated/owner/fighter/juror/staff/service contexts, without app-bundled privileged credentials.

Samsung A50 plan: record build SHA/backend type and permission state, controlled OTP accounts, canonical two-fighter Stage and second-session Crowd delivery, legacy/pending/cancelled/history routes, Crew safety, private Vault and World lifecycle; background/reconnect/logout/account switch. Report physical/simulated/blocked per case, no credential-bearing screenshots. Step 2F remains deferred; this plan is not device-test authorization.

### Load plan and measurable gates

Thresholds below are proposals, not measurements or supported-capacity claims. Approve account/data creation and target workload first. Precreate controlled identities/sessions without flooding SMTP. Respect actual server quotas; separate normal traffic from intentional denial tests. Never expose a test-bypass RPC or send traffic to production.

- **100 users:** gradual 10-minute ramp + 15-minute hold, authenticated connected users; start around 10 REST/RPC requests/sec, distributed discovery/Room reads, limited writes, reconnect/background mix. Capture actual mix/fan-out.
- **1,000 users:** only after security/100-user pass and explicit Realtime quota/budget approval. 15-minute ramp + 30-minute hold, start around 100 REST/RPC requests/sec, one hot Room plus distributed Rooms. Limit writes/fan-out to approved server/plan ceilings; reduce message rate or approve capacity when necessary. Multiple connections/user can exceed nominal user count.
- Require **zero unauthorized successes, private/secret leaks, duplicate verdict/reward/notice effects, crashes/ANRs or stale-account content** in tested journeys. Any security violation fails immediately.
- Intended-authorized API unexpected errors <1%,5xx<0.1%. Report expected401/403/42501/rate limits separately, excluding only intentional negative cases from happy-path denominator; unexpected denials are failures.
- Suggested same-region read p95<750ms/p99<2s; mutation p95<1s/p99<3s; second-client delivery p95<2s; bounded-gap recovery<10s. Record network/device/sample size/warm-cold/provider latency separately.
- Track CPU/memory/pool queue/locks/deadlocks, cron settlement lag, Realtime limits, storage/egress/spend. Stop on persistent CPU>80%, connection occupancy>80%, two minutes over error thresholds or approaching approved spend ceiling. No automatic scaling, spend-cap removal or permission widening to force a pass.

## Explicit authorization checkpoints and next action

None of these operations is authorized by this audit. Approve concrete reviewed proposals in order:

1. **Integration code:** selected PR/version manifest,084->086 rename, combined client/harness protections, post-M1 stats gate, confirmed default-ACL/Storage gaps and staging app/session isolation. No existing PR merged/modified now.
2. **Security validation:** fresh explicit H1/H2 scope and isolated schema/pgTAP setup plus reviewed H1/H2/H3/M1 suites, target/owner, attempt count and restoration requirements. Existing local consumed attempt remains BLOCKED; no implicit retry or extension install.
3. **Provisioning/billing:** organization owner approves only clash-staging creation, region/PG version, plan/compute/monthly budget/operator access. Later linking names staging reference and separate deployment directory; never infer target from existing .env.
4. **Schema/bootstrap:** exact integration SHA/hashes, migrations/prerequisite extensions, minimal buckets/policies and maintenance settings. No local seed/reset/real-data copy or ledger repair.
5. **Services/secrets:** SMTP/domain/template/redirects, new staging secret names/rotation, selected Edge deploy/JWT settings and optional provider budgets. No production secret copy/current app environment edits.
6. **Fixtures/device:** controlled accounts/roles/entitlements and isolated staging build/Metro/OTA/device journey. No CLASH app-data clear/location-permission changes. Resume Step 2F only with separate approval.
7. **Load/operations:** approve 100-user test, then separately 1,000-user quota/spend/traffic schedule; monitoring/backups/object policy and restore/fixture cleanup separately. No blanket destructive cleanup.

**Recommended next action:** approve focused integration-candidate preparation first (numbering, stats gate, shared guards, app/default-grant prerequisites), then authorize isolated security validation. Project creation alone does not resolve these blockers; current drafts are not a validated deployment.

Unresolved: cohort/region, organization/budget, key/JWT formats, SMTP/domain/template, staging identity/update channel, optional providers, owner/extension support, public media retention, tester lifecycle,1,000-user quotas, payment provider and moderation/scanning operations. Public totals can permit reward differencing; MVCC/downloaded data cannot be revoked retroactively. No zero-vulnerability or production-readiness claim.

## Actual audit validation and inspected sources

Performed: primary Git status; fetch latest origin; new worktree; GitHub PR status/heads; branch changed-file and SQL/test inventories; migration ordering/function/grant/shared-file inspection; prior report review; URL-type-only classification; PATH CLI version; current official docs/changelog. Project-local supabase.cmd path did not exist; PATH version succeeded. Changelog markdown fetch unsupported, so HTML and relevant linked notices inspected.

**Not run:** TypeScript/unit/Expo Doctor reruns (documentation-only), DB queries/tests/migrations/security transactions, extension setup, Docker operations, hosted project reads/writes, deployments, secret uploads, app env changes, Android or load tests. Earlier PR test results are prior evidence only. Documentation scope/whitespace/manifest checks are run before commit.

Sources: config.toml;100 migration filenames and relevant schema/Auth/media/engine/scheduler/World/live/Crew/canonical/Phase0.5/recovery/editorial/security definitions;seed.sql/seeds; six Edge handlers/editorial worker/adapters;supabaseClient/authService/vaultService/meetService;app.config.ts/eas.json/.env.example and existing URL types only;dev-hosted/local-supabase-env scripts;package.json; SECURITY_REMEDIATION.md;pending PR files/reports. No AGENTS.md found in isolated worktree. No original secret value reproduced. Primary dirty Crew files/all branches preserved.

## Appendix — main migration manifest (100 files, ascending)

Git inventory only, **not installed versions**. Revalidate hashes/dependencies on the eventual integrated candidate.

```text
20260926120000_initial_arena_schema.sql
20260926130000_auth_profile_trigger.sql
20260926140000_social_foundation.sql
20260926150000_media_storage.sql
20260926160000_clash_engine.sql
20260926170000_production_hardening.sql
20260926180000_take_reactions.sql
20260926190000_hoods_and_threads.sql
20260926200000_take_creation_rpc.sql
20260927000000_feed_visibility.sql
20260927010000_clash_draw.sql
20260927020000_take_insert_lockdown.sql
20260927030000_clash_scheduler.sql
20260928000000_vault_foundation.sql
20260928010000_vault_rpcs.sql
20260928020000_vault_entitlement.sql
20260928030000_vault_notifications.sql
20260928040000_vault_maintenance.sql
20260928050000_vault_storefront.sql
20260928100000_mindshift.sql
20260928110000_blind_clash.sql
20260928120000_hood_prediction.sql
20260928130000_world_missions.sql
20260928140000_world_drop_view.sql
20260930100000_sponsor_attribution.sql
20260930110000_sponsor_attribution_hardening.sql
20260930120000_sponsor_studio_rpcs.sql
20260930130000_creator_earnings.sql
20260930140000_comment_media.sql
20261002140000_comment_gifs_enum.sql
20261002140100_comment_gifs.sql
20261002150000_live_arena_enums.sql
20261002150100_live_arena_schema.sql
20261002160000_live_arena_spectator.sql
20261002170000_arena_spectator_upgrade.sql
20261002180000_arena_feel_alive.sql
20261003120000_list_arena_topic_rooms.sql
20261003140000_watch_arena_room.sql
20261003150000_list_arena_room_presence.sql
20261003160000_room_pulse_and_scale.sql
20261003180000_explore_global.sql
20261003190000_explore_vault_preview.sql
20261003200000_explore_for_you_ia.sql
20261004120000_explore_play_system.sql
20261004120100_explore_treasure_gameplay.sql
20261004140000_meet_text_matching.sql
20261004150000_meet_video.sql
20261004160000_vault_storefront_preview.sql
20261004170000_vault_commerce.sql
20261004170100_vault_commerce_rpcs.sql
20261004181000_vault_discover_worlds.sql
20261004190000_vault_communities.sql
20261004190100_vault_community_rpcs.sql
20261004200000_creator_world_drops.sql
20261004200100_creator_world_drop_rpcs.sql
20261005100000_creator_live.sql
20261005100100_creator_live_rpcs.sql
20261005110000_creator_ai.sql
20261005110100_creator_ai_rpcs.sql
20261005120000_digital_creator.sql
20261005120100_digital_creator_rpcs.sql
20261005130000_arena_game_enums.sql
20261005130100_arena_reputation_facets.sql
20261005130200_arena_call_backup.sql
20261005130300_arena_reactions_and_entertainment.sql
20261005140000_arena_trending_and_scale.sql
20261005150000_arena_trending_rank_race.sql
20261005160000_arena_trending_visibility.sql
20261005210000_arena_expressive_media.sql
20261006120000_arena_crews_enums.sql
20261006120100_arena_crews_foundation.sql
20261006130000_arena_crews_hardening.sql
20261006150000_arena_correctness_foundation.sql
20261007120000_arena_duel_foundation.sql
20261007130000_arena_challenge_notifications.sql
20261007130100_arena_challenge_lifecycle.sql
20261008100000_arena_crowd_report_target.sql
20261008100100_arena_crowd_chat.sql
20261008110000_profile_read_security.sql
20261008110100_relationship_and_crew_security.sql
20261008110200_arena_content_visibility.sql
20261008110300_private_room_typing.sql
20261008110400_legacy_visibility_helpers.sql
20261008110500_private_viewer_helpers.sql
20261008110600_canonical_topic_visibility.sql
20261008121000_arena_discovery_states.sql
20261008133000_arena_interest_catalogue.sql
20261008134000_arena_interest_preferences.sql
20261008135000_arena_personalized_feed.sql
20261008135500_arena_interest_conflict_http.sql
20261008140000_arena_interest_feed_index.sql
20261008151000_arena_challenge_inbox.sql
20261009100000_canonical_authorization.sql
20261009110000_official_retry_and_recovery.sql
20261009120000_historical_settlement_recovery.sql
20261009130000_arena_casual_questions.sql
20261009140000_arena_editorial_pipeline.sql
20261009170000_arena_gif_proxy_budget.sql
20261009180000_explore_security_contract.sql
20261009190000_world_read_security.sql
```
