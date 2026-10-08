# Phase 1 ? Personalized Arena onboarding

Implemented locally against baseline 4a8a45d. Supabase/PostgreSQL remains authoritative. No native rebuild, hosted migration, reset, or ordinary-feed test activity was performed. Unrelated Crew and existing launch-script changes were preserved.

## Database and compatibility

Five additive migrations:

- 20261008133000_arena_interest_catalogue: seven curated interests and one-to-one compatibility mappings for the existing seven Hood enum values. Takes and daily execution topics retain their existing Hood/event IDs. No separate authoritative topic-tag catalogue exists in this repository; no speculative tag aliases were added.
- 20261008134000_arena_interest_preferences: private auth-account preference rows, versioned completion, revision numbers, returning-account compatibility backfill and atomic replacement RPC.
- 20261008135000_arena_personalized_feed: catalogue projection and caller-RLS personalized ranking/snapshot-page RPC.
- 20261008135500_arena_interest_conflict_http: optimistic revision conflicts use PT409/HTTP409 rather than retryable serialization error 40001.
- 20261008140000_arena_interest_feed_index: partial recency index supporting the bounded active candidate pool.

RPCs: get_arena_interest_catalogue(), get_my_arena_interests(), save_my_arena_interests(text[],boolean,bigint), rank_arena_for_you(text[]).

All are authenticated-only; private preference reads use auth.uid() RLS. Clients have no preference/catalogue mutation grants. The sole definer writer uses empty search_path, derives its owner from auth.uid(), validates active IDs and 3?5 unique selections or explicit zero-selection skip, serializes by account advisory lock and checks the expected revision before replacement. Returning accounts existing at migration time receive completed general-feed state without losing historical data or being forced through onboarding. New accounts remain incomplete until explicit Save/Skip.

Exact installed ledger SQL matched each of the five migration files on localhost:55322. No hosted database operation was performed.

## Screens and client integration

app/interests.tsx is the interest-editing route, accessible from the existing self-profile Settings/Appearance area. TopicSelection is shared by ArenaInterestEditor for editing and initial onboarding. InterestOnboardingGate reads durable account completion while keeping the navigation stack mounted, avoiding auth/deep-link navigation loops. Signed-in returning accounts bypass the old first-launch intro. Guest behavior remains unchanged.

The selection UI uses existing neutral theme/type/spacing tokens, 48dp actions, checkbox accessibility states, live selection count, best-effort haptics, and a short Reanimated fade respecting reduced motion. No new native dependency was introduced. Errors stay next to the save actions; failed saves retain the draft. Conflicts disable further saves until explicit Reload. Requests have bounded abort timers; disposed account scopes cannot apply old private responses or navigate from stale saves.

## Personalization

The initial server snapshot ranks at most 240 eligible recent candidates and returns at most 60 Takes. Caller RLS plus explicit active/lifetime/publication-time/fixture predicates preserve block, mute, removed-content and runtime-fixture exclusions. Within each relevance lane, score is:

12 / (1 + age in hours) + 2 * ln(1 + reactions + 3 * Clash count) + 4 when a real open Clash is within its live window.

Preferred-Hood Takes are interleaved two-to-one with general Takes when both exist; neither lane is excluded. Stable created-at/ID tie-breakers are explicit. No interests means a general recency/engagement feed. Snapshot pagination uses slices of the initial server-ranked IDs (20 by default), preserving order despite engagement changes while rechecking current visibility on every fetch. The existing UI remains one bounded 60-item batch; no infinite feed or new feed architecture was introduced.

Hydration keeps the original general batch separate from the For You ranking, so Following, Popular and New use their original dataset/order. Successful preference saves refresh Arena. Active daily discussions are prioritized using only server-provided Hood mappings, retaining all topics and their existing relative order within each relevance group. Focus/request guards discard stale discussion refreshes.

## Executed verification

- Step 1 verified before Step 2: nine catalogue/compatibility checks passed.
- Complete local database suite: 69 files, 2,571 pgTAP assertions, zero failures. Includes the existing Arena, canonical duel, Crowd, Phase 0.5 and concurrency suites, plus 55 interest assertions across tests 065?068. Existing uncommitted Crew tests were executed but are not committed here.
- Real parallel sessions verified both first inserts and replacements of existing preferences: the loser waits, receives PT409 and cannot partially replace or advance revision.
- Unit suite: 418/418; interest service/actual selection component/selector checks: 12/12.
- Existing Crowd service checks: 7/7; duel render scenarios: 19/19.
- Typecheck passed after the final UI/focus guard changes. Expo Doctor: 18/18.
- Real local Auth/PostgREST sessions verified new-account incomplete state, durable own saves, HTTP409 stale-revision conflicts, cross-account read denial, denied direct writes, and anonymous RPC denial.

Docker/Supabase CLI commands were previously unresponsive. The full SQL suite actually ran through explicit local PostgreSQL using existing supabase_admin credentials, pgTAP setup and translation of four existing psql gset commands. This is not a claim that the Supabase CLI test command passed.

Failures investigated and resolved: ranking fixtures initially violated existing expiry-window, duplicate-publication and rate-limit rules; the fixtures were corrected inside rolled-back transactions without relaxing production protections. A real REST conflict initially timed out with 40001, motivating the additive HTTP409 migration; the corrected REST request and entire SQL suite were rerun successfully. Native test bridges initially needed correction; the final 12 checks passed.

## Physical Samsung A50

ADB RZ8M30DE9NL and reverse ports 8081/55321 were active; the current Metro bundle and local Supabase were used. Actual physical checks included:

- Returning Local Dev opened Interests without forced onboarding; zero selections disabled Save, three selections enabled it, and explicit Save persisted the chosen IDs.
- A genuinely new isolated local account reached first-time onboarding with zero selected, Android Back did not bypass completion, and Continue persisted three interests.
- Reopening the editor displayed the durable choices.
- A second authenticated session updated that test account. The phone's stale save showed the visible conflict, retained the three-card draft, disabled Save, and offered explicit Reload.
- Explicit Reload and a full JavaScript reload subsequently showed the saved zero-interest general-feed state on the editing screen, without returning to first-time onboarding.
- Account switching was exercised. The original Local Dev preference was restored to its pre-test general-feed state using its own authenticated RPC, and the original account was restored on the phone.

Removing ADB forwarding did not reliably sever an established native HTTP connection. No physical offline-save failure is claimed; network failure propagation was checked by the client test, and actual failed-save UI was verified through HTTP409. Two isolated Auth accounts were created for verification and retained privately in ignored local fixture metadata; no Takes, live competitions or chat messages were created for the physical tests. Transactional feed fixtures rolled back, and committed concurrency test accounts cleaned up.

## Limits and deployment

No eligible ordinary live Takes or active daily discussion records existed for a populated physical ranking comparison. Positive ranking/diversity/pagination behavior was verified in transactional SQL and client tests instead of inventing feed activity. Cross-session persistence was verified on the A50 and a second real authenticated API session, not a second physical phone.

The pre-existing missing ExpoCamera native module remains; this task neither rebuilds the app nor fixes unrelated camera functionality. Loading preferences/saving requires a reachable backend; no offline preference queue is implemented. Generated schema refresh remains blocked by the local Docker CLI, so new RPCs use a narrowly typed additive extension rather than editing generated schema by hand. Apply the migrations in timestamp order before distributing this JavaScript bundle to hosted environments.

Git checkpoints: 6b2d25a (catalogue), 876f6db (preferences), ad1a1c1 (HTTP409 fix); the final client/feed integration and verification report are recorded in the subsequent focused commit. No claim of production readiness or zero vulnerabilities is made.
