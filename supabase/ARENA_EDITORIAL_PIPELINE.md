# Arena Engagement Step 2 — architecture and operating contract

## Audit before implementation

Baseline `422416e` already supplies Takes with human/editorial provenance, private casual votes, authenticated question RPCs, server expiry, interest/Hood discovery, comments, reports and canonical challenge acceptance. Human publishing derives its author from the session and delegates media validation to `create_take`. Automated publishing cannot impersonate a human JWT to call that RPC. It needs a narrow server-only publication operation that writes the same constrained Take, under explicit editorial controls, using an existing consenting staff publisher. No synthetic account will be created.

Existing `is_staff()` checks moderator/admin profiles; role fields cannot be edited by ordinary clients. Edge Functions already keep provider/service credentials server-side and use an OpenAI-compatible provider abstraction. Existing cron drives database maintenance, not internet discovery. No trend source or editorial worker is currently configured. Existing Topics & Trends ranks genuine Arena activity; external story ranking must not manufacture engagement there.

Inspected: question migration and client/service contracts, Take creation and insert triggers, social staff helper, interest catalogue/mappings, Topic/question views, Creator AI provider and Edge authorization, Supabase function/cron configuration, existing security and lifecycle reports, test commands and local migration ledger. The seven existing Hoods have no general-current-affairs or science Hood. Science maps to Technology, internet culture to Film & culture, and current affairs to Business & startups as documented broad fallbacks; these categories always require human review. No new taxonomy or community tables are introduced.

## Planned implementation boundary

1. Private editorial config, authorized source registry, normalized candidates/observations, versioned drafts and bounded decision/failure events. All table grants denied to ordinary clients; staff use a narrow audited RPC. Defaults: REVIEW_ONLY, paused, no publisher and no sources.
2. A leased, bounded server worker with modular opt-in RSS and authorized JSON feeds, source timeouts/size limits, URL restrictions, normalization and explainable grouping/ranking. No default URLs or external calls during tests. Independently configured publisher groups determine confirmation; syndicated/aggregated feeds cannot pretend to be independent publishers.
3. A provider-independent generator with a configured OpenAI-compatible adapter. Missing credentials fail honestly. Strict output/source-reference validation, conservative safety/review gates, immutable generation versions and safe failure codes. No full article storage, source instructions treated as untrusted data.
4. One transactional publication RPC: config lock before candidate/source checks, mode/kill switch, staff approval or restricted low-risk auto eligibility, source freshness/withdrawal, version, global/category caps, overlap prevention and one Take per candidate. Retry returns the original publication without reopening removed content. No votes/comments/Clashes or rewards are generated.
5. Minimal staff RPC controls for source/configuration, inspection, approval/rejection, retries and source withdrawal. No mobile service-role key or broad service-role table grants. Scheduling is documented but not enabled; an authenticated server secret protects worker invocation.
6. Existing question UI receives clear AI/editorial attribution, neutral context and source links. Existing feeds and permissions remain authoritative.

The implementation and final verification results will be appended below. No hosted migration, hosted cron, real provider call or public question publication is authorized by this test process.


## Implemented architecture

Migration: `20261009140000_arena_editorial_pipeline.sql`. Six private RLS tables hold configuration, source registration, normalized candidates, attributable observations, immutable versioned drafts, and decision/failure events. Both private identity sequences and all table privileges are revoked from PUBLIC/anon/authenticated/service_role. Every new function has an empty search_path. Only scoped RPCs receive EXECUTE grants. Existing Take RLS, human publishing, private votes, canonical challenges, Stage, Crowd, judging and rewards are unchanged.

The source adapter, generator and worker modules live in `supabase/functions/arena-editorial/`. No new mobile dependency or second question/transcript system is introduced. Publication writes exactly one existing Take with its ordinary expiry/defaults, Hood, canonical interest, editorial/approved provenance, AI flag, neutral context, and 1?8 source references. Existing question rendering shows AI/editorial attribution, context and accessible HTTPS source links. Human questions retain their previous shape. Votes remain casual; nothing creates ballots, participants, comments, reputation or a Clash.

| Category | Existing Hood / interest | Automatic eligibility |
| --- | --- | --- |
| technology | techtakes / technology | Restricted release template only |
| gaming | gaming / gaming | Restricted release template only |
| entertainment | movies / film | Restricted release template only |
| sports | football / sport | Restricted schedule template only |
| internet_culture | movies / film | Human review; broad mapping |
| science | techtakes / technology | Human review; broad mapping |
| current_affairs | startups / business | Human review; broad mapping |

### Discovery, identity and ranking

Adapters support an intentionally small RSS 2.0 subset and an authorized JSON feed contract. A JSON feed supplies `{items:[{title,summary,url,publishedAt,language?,region?}]}`; timestamps and matching configured publisher hosts are required. RSS reads channel language when provided. Missing geography/language stays absent. Google Trends, Reddit OAuth, Atom and aggregator-specific URL resolution are not implemented; use an authorized provider/feed compatible with these contracts, rather than assuming unrestricted access.

Sources have operator-defined credibility and publisher groups. Summaries are capped at 400 characters and titles at 200; full articles are never fetched. URL normalization drops fragments/tracking parameters and sorts query parameters. Database identity is category plus sorted headline tokens; a seven-day token-overlap comparison groups closely matching headlines while distinguishing numeric subjects. URL uniqueness and the config lock serialize ingestion. Observations are limited to 32 per candidate. This is explainable lexical deduplication, not semantic proof that every paraphrase is the same story.

Rank = credibility ? 35 + min(independent publishers, 3) ? 10 + min(source domains, 3) ? 2 + min(actual matching interest preferences, 10) + discussion heuristic ? 5 + max(0, 25 ? age hours) ? 100 for existing question overlap. Independent confirmation is bounded by both distinct publisher groups and distinct domains. Discussion potential is explicitly a release/schedule keyword heuristic (1 or 0.5), not measured engagement. Interest matches are private aggregate counts of existing preferences, never sent to the provider or public UI. Rank details expose each feature to staff; overlap candidates are excluded from generation and publication rechecks overlap transactionally. Ranking is refreshed on new observations, not continuously recomputed between runs.

### RPC contracts and operator workflow

- `arena_editorial_worker(p_action, p_run?, p_data?)`: service_role EXECUTE only and an internal role check. claim returns disabled/busy or a ten-minute lease, bounded sources and settings. Ingest/work/generation/failure/publication-deferred/release actions require that lease. No SQL transaction stays open across an external request.
- `arena_editorial_admin(p_action, p_data={}, p_expected_auth_uid?)`: authenticated staff only. Always pass the expected staff auth UID from an established session. A mismatched UID is rejected. inspect returns config, up to 32 sources, 30 candidate histories, drafts/observations and latest 100 events. Pagination requires both the exact discovered timestamp and candidate UUID via before/beforeId. Secret environment-variable names and worker run IDs are excluded. configure/source additionally require admin, rather than moderator.
- review uses `{id,version,decision:'approve'|'reject'}`; only the current immutable draft version is actionable. Blocked drafts cannot be approved. retry uses `{id}` for a failed, non-exhausted candidate and advances its retry time without resetting attempts. publish uses `{id,version}`. withdraw_source uses a precise `{observationId}`, records moderation, invalidates approval, and removes an already-published Take without deleting it.
- `publish_arena_editorial(p_id,p_version,p_auto=false,p_run?)`: manual calls require staff approval of the current version; automatic calls require service_role plus a valid lease and LIMITED_AUTO. Config, candidate and attribution checks run under config-first locking. The deterministic Take ID and unique candidate link make retries return the original Take and its actual status. A removed Take stays removed even if publication is retried. A changed payload cannot reuse a generation version.

Use the existing authenticated Supabase client in an operator tool; never ship the service key to mobile. For example:

```ts
const {data:{user}} = await supabase.auth.getUser();
if (!user) throw new Error('Staff session required');
const editorial = (action: string, data = {}) => supabase.rpc('arena_editorial_admin', {
  p_action: action, p_data: data, p_expected_auth_uid: user.id,
});
await editorial('inspect');
// Replace these placeholders with a permitted feed and an existing consenting staff publisher.
await editorial('source', {
  id: 'chosen-publisher', adapter: 'rss', feedUrl: 'https://PUBLISHER/feed.xml',
  linkHost: 'PUBLISHER', publisherGroup: 'independent-owner', category: 'technology',
  credibility: 0.9, enabled: true, autoAllowed: false,
});
await editorial('configure', {
  mode: 'REVIEW_ONLY', paused: false, publisherId: 'EXISTING_STAFF_PROFILE_ID',
  dailyCap: 6, categoryCap: 2, generationCap: 10, maxAgeHours: 48,
});
// After inspecting sources, context, options and the generation version:
await editorial('review', {id: 'CANDIDATE_UUID', version: 1, decision: 'approve'});
await editorial('publish', {id: 'CANDIDATE_UUID', version: 1});
// Kill switch (also disables manual new publication):
await editorial('configure', {mode: 'REVIEW_ONLY', paused: true});
```

No staff mobile screen was added. This narrow, authenticated RPC interface supplies inspection, preview, review, publication history, pause and failure controls.

### Review, safety and automatic publication

The events record discovered ? normalized ? verified ? generated ? reviewed ? approved/rejected ? published. Here verified means attributable to a configured trusted source, not independently proven true. Approval and generation versions are explicit. Automatic publication records an approved decision under server policy; manual approval records the staff actor.

Default state is REVIEW_ONLY + paused, with no publisher or sources. OFF prevents discovery/generation and all new publication. REVIEW_ONLY allows drafts and staff-approved publication. LIMITED_AUTO must be explicitly selected by an admin and unpaused. Both modes still enforce daily global/category limits, live staff publisher eligibility, attribution, freshness, current generation, moderation and overlap checks.

Automatic publication is deliberately limited to the four fixed neutral templates in core.ts: release tradeoffs for technology/games/films, and schedule tradeoffs for sports. It requires exact options/question, source-exact context, a matching release/schedule headline, known English language, ASCII source text, confidence ?0.95, no human-review flag, no risk keywords, and at least two fresh enabled, credible (?0.8), auto-authorized publisher groups AND domains. Science/current affairs/internet culture, arbitrary wording, unknown language, uncertain claims and flagged topics require human review. These gates are heuristic defense in depth, not a universal harmful-content classifier or an independent fact-checker. Operators must review source ownership/quality, category and terms; source confirmations are never invented.

Sources/provider text is untrusted prompt data. Provider output has strict limits, distinct options, exact observed references and explicit review/confidence flags. Unsafe or meaningless binary framing is instructed to reject and remains subject to validation/review. All arbitrary provider-written questions require manual approval. Public attribution does not reveal private drafts, preference counts or editorial errors. Withdrawal removes the underlying Take so existing visibility/vote/reporting protections apply. Existing block/mute filtering, account isolation, runtime fixture exclusions and human question permissions continue through the original feed/RPC paths.

### Bounds, failure recovery and scheduling

At most eight enabled sources (32 registry entries), 20 fetched items per source, 40 processed observations, 12 selected candidates, and two generation attempts per run. Sources have an eight-second timeout and 256 KiB response limit; provider calls have a 20-second timeout, 32 KiB response limit and 700 completion-token ceiling. Database requests have a 15-second timeout and 512 KiB response limit. Redirects are rejected; endpoint validation rejects literal IP, credentials, custom ports and obvious private/local hostnames. Only administrators register endpoints. DNS rebinding/private DNS resolution is not independently pinned; use trusted endpoints and an egress policy before broadening administration.

Claim serialization allows four runs/hour. Generation defaults to ten/hour (maximum 20), with four attempts/candidate and exponential 2/4/8/16 minute backoff. Missing provider credentials do not consume generation quota. Publication defaults to six/day and two/category/day (maximum 20 and five), UTC, including removed publications. Global config-first locks serialize quotas, kill switch, moderation, deduplication and publication. A failed/aborted invocation cannot reopen a Take; a stale lease expires after ten minutes. Next eligible runs recover candidates. The worker is bounded but a very slow sequence of database calls may exceed an Edge deployment's wall-clock limit; leases/idempotency recover, rather than claiming every run completes.

Failures use safe reason codes; no raw provider/database diagnostics or secrets are logged/stored. Source failures identify the configured source ID. Generation failures/backoff, deferred publication and staff decisions are visible via inspection. A run with failed items reports partial_failure; a fatal database/worker failure returns HTTP 503. The HTTP scheduler must monitor non-2xx responses as well as staff event history. Events retain the newest 10,000 entries; configuration/ingestion serialization bounds pruning. Candidate/observation/draft retention needs an operational archive policy as volume grows; this checkpoint does not delete editorial history.

The Edge endpoint accepts POST only and requires a server-only x-editorial-secret of at least 32 characters. verify_jwt=false is intentional: this mandatory application secret is the invocation credential, and unset/short secrets deny all calls. No public CORS workflow or mobile invocation is supplied. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY stay inside the Edge runtime.

Before real discovery:

1. Review/apply the migration to the intended environment with explicit approval; this checkpoint changed local Supabase only. Deploy the arena-editorial function only with separate authorization for hosted changes.
2. Configure server secrets: ARENA_EDITORIAL_RUN_SECRET (high entropy, ?32 chars), ARENA_AI_API_KEY, ARENA_AI_MODEL, optionally ARENA_AI_BASE_URL (default https://api.openai.com/v1). The selected model/provider must support Chat Completions JSON mode and max_completion_tokens. No default model or paid call is assumed. Provider interface is replaceable; only an OpenAI-compatible adapter is supplied. See the [official Chat Completions contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
3. Register permitted RSS/JSON sources with accurate independent ownership groups, publisher host, category and credibility. Optional source credentials use named ARENA_SOURCE_* secrets, sent as Bearer authorization only to that configured feed. No source URL is shipped/enabled by default; obtain provider permissions and quotas first.
4. Select an existing, consenting linked staff profile as publisher; no account is generated. Leave REVIEW_ONLY while manually inspecting initial drafts and attribution.
5. Invoke POST /functions/v1/arena-editorial from a protected server scheduler with x-editorial-secret. Never place the run secret or service key in EXPO_PUBLIC_* variables. Inspect response counters/events, source freshness and costs.
6. After separate authorization, use existing pg_cron + pg_net/Vault patterns or an external authorized scheduler every 15 minutes (four/hour). Store URL/run secret in Vault or scheduler secrets; send POST body {} and the secret header, monitor HTTP results, and do not commit secret literals into cron SQL. No cron entry was created or changed here. The function supports periodic execution, but no hosted schedule is enabled.
7. Enable LIMITED_AUTO only through an explicit admin configure call, after separately authorizing any paid usage, and explicitly mark each vetted independent source autoAllowed. Keep the caps and pause control available. Pause/unregister a source immediately if rights, credibility or attribution change.

Costs are deployment-dependent: permitted feed/API subscriptions, AI input/output tokens, Edge invocations/runtime, Postgres storage and outbound requests. Two calls/run at four runs/hour is an upper bound of eight generation attempts/hour before other caps; retries can still incur provider charges. No price, free access entitlement, or spending guarantee is assumed. No provider/feed request or paid credit was consumed by verification.

## Verification and limitations

Automated checks executed for this checkpoint:

| Check | Actual result |
| --- | --- |
| Full unit suite | 461 tests, 118 suites; zero failures/skips |
| Application TypeScript | npm run typecheck, exit 0 |
| Edge entry TypeScript | npm run typecheck:editorial, exit 0 |
| Question service/render | 24/24 |
| Interests | 12/12 |
| Arena navigation | 11/11 |
| Challenge inbox | 18/18 |
| Stage rendering | 22/22 |
| Official service/recovery | 14/14 |
| Crowd service/recovery | All seven checks passed |
| Settlement/history | 11/11 |
| Expo Doctor | 18/18 |
| Full local pgTAP | 81 files; 2,976 assertions passed; zero failures |

The local SQL runner executes all sorted supabase/tests/*.sql using the installed pgTAP extension, preserves transaction/rollback semantics and translates existing psql gset fixtures. It is not a claim that the Supabase CLI test command ran. New 079 tests cover private tables/sequences/RPCs, anonymous and ordinary access, moderators versus administrators, stale account assertions, trusted/expired/duplicate sources, missing/hallucinated references, version conflicts, human voting, source moderation, kill switch, caps, restricted auto gates, risky/loaded content, retries and safe diagnostics. New 080 uses genuinely overlapping authenticated dblink sessions for publication, concurrent source withdrawal and kill switch. Explicitly marked fixture Takes are excluded from ordinary discovery; their owned graph is cleaned and the original config restored. No legitimate user record was altered for testing.

Edge handler tests execute the actual handler with a Deno test bridge and mocked fetch, including unauthenticated/method denial, disabled state and sanitized fatal errors. This is not a Deno deployment or live provider integration test. The local Edge runtime container is absent, so a deployed Edge HTTP invocation is unverified. The Samsung A50 is ADB-connected; no physical UI interaction or AI question publication was performed in this checkpoint. Attribution/link behavior was tested by component rendering; no physical-device or live-source claim is made.

Initial targeted runs caught SQL record/variable ambiguities and a Node strip-types incompatibility; these were fixed before the passing checks. Final grant review found inherited private sequence privileges; explicit revocation and an adversarial assertion were added. Final verification is recorded below after that correction. Docker's existing vector containers repeatedly restart; database/API/Realtime containers are healthy and the pgTAP suite is responsive. This task did not change Docker services.

Only the focused editorial migration, worker, attribution/parser changes, tests, package scripts/config and this report belong in the commit. Existing dirty Crew discovery/UI files, development scripts and the uncommitted Crew migration/test remain untouched and excluded. No hosted migration/cron, destructive reset, synthetic publisher, public demonstration activity, competition/judging change or later engagement feature is included.


Final local verification: all required automated commands exited 0 after the corrections. The final database rerun includes 83 editorial assertions and 13 genuine overlapping-session assertions. Seven installed function bodies were compared exactly with the migration; empty search_path, RLS, effective EXECUTE/table/sequence privileges and metadata constraints were checked. Local ledger matches all 98 repository migration versions, including the pre-existing uncommitted Crew migration already installed locally; only the new editorial version was recorded/updated after object equivalence verification. Hosted migrations and scheduling were not applied. Defaults and fixture cleanup were reconfirmed: REVIEW_ONLY, paused, null publisher/lease, zero registered sources, zero trend candidates and zero AI Take publications.

Changed files in this checkpoint:

- supabase/migrations/20261009140000_arena_editorial_pipeline.sql
- supabase/functions/arena-editorial/{core,adapters,provider,worker,index}.ts
- supabase/config.toml
- supabase/tests/079_arena_editorial_pipeline.sql
- supabase/tests/080_arena_editorial_concurrency.sql
- utils/arenaEditorial.test.ts
- utils/arenaEditorialEndpoint.test.ts
- utils/arenaQuestions.ts
- utils/arenaQuestions.test.ts
- components/arena/QuestionVotePanel.tsx
- scripts/question-client-check.cjs
- package.json
- supabase/ARENA_EDITORIAL_PIPELINE.md
