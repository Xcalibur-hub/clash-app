# Phase 2 Step 2: lifecycle audit

Audit completed before inbox implementation against migration definitions and
installed local PostgreSQL objects. Baseline is `9e2ef4e`; dirty Crew work is
outside this step.

`arena_challenges` is the sole challenge table. States are PENDING, ACCEPTED,
PASSED (displayed as Declined), CANCELLED and EXPIRED. The recipient is always
the original Take author; sender and recipient identity and terminal states are
immutable. Only authenticated parties can SELECT through RLS; clients have no
INSERT/UPDATE/DELETE grants. Definer operations use an empty search path and
restricted EXECUTE grants. The payload helper and duel-creation RPC are private.

Creation derives the caller from auth, rejects self challenges, validates text,
source eligibility and relationships, serializes on the Take and returns an
existing pending offer on retry. A pending-pair index prevents duplication.
Expiry is bounded by two hours and the source's remaining duel window; reads and
actions also resolve expired offers on the server. Accept/PASS belongs to the
recipient; CANCEL belongs to the sender. The same action is repeatable on its
matching terminal state; conflicting terminal actions fail or return an already
cancelled/expired state.

Acceptance takes the duel-key advisory lock, then Take and Challenge locks.
`create_arena_duel` creates the canonical Clash, linked Room, topic and two
fighters transactionally. The accepted-challenge guard checks Take, challenger,
duel key and linked Room. Acceptance marks competing pending offers CANCELLED.
Existing independent-connection tests cover duplicate creation, duplicate
acceptance and competing acceptance. Accept versus Cancel needs additional
coverage, retaining the established lock order to avoid a new inversion.

Take-level controls already create/list/resolve offers. Live Clashes discovery
already distinguishes pending offers from accepted canonical duels and legacy
competitions. The account-keyed provider disposes stores and screens on identity
changes; new inbox requests must also guard late focus/action responses.

Notifications already contain deduplicated invitation and acceptance events.
Invitations navigate to the Take, responses to the linked Room. Notification RLS
restricts records to their recipient. There are no decline/cancel/expiry events
or push infrastructure. Existing events can stay intact; inbox focus/foreground
refresh provides canonical response state without duplicate notification writes.

Gaps: no account-wide paginated listing, recipient/source projection or inbox;
the existing client parser rejects accepted results with a missing Room link;
ordinary challenge reads omit runtime-fixture exclusion; terminal resolver
retries return before visibility revalidation. Removed pending sources already
resolve as EXPIRED, a behavior that must remain compatible.

Minimal implementation: one narrow account-scoped keyset inbox RPC and indexes,
safe id/name/handle and source fields, a restrictive fixture read policy and
targeted patches to existing operations. Preserve pending removed-source expiry,
existing lock order, grants and notification behavior. Add one inbox route in
the existing Arena stack with an entry inside Live Clashes. Reuse existing
ACCEPT/PASS/CANCEL, map PASSED to Declined in UI, show accepted-but-unlinked
records as Room not ready, and never route a pending invitation to a Room.

No duplicate system, push infrastructure, Crew mechanics or later-phase work is
authorized by this step. Validation and delivery results follow below.

## Implementation and verification

One additive migration, `20261008151000_arena_challenge_inbox.sql`, adds incoming
and outgoing actor/page indexes, a restrictive fixture exclusion policy, and
`list_my_arena_challenges`. Its owner is derived from the session; its only
selection parameters are direction, keyset cursor and bounded page size. The
client requests 20 rows; the server caps requests at 50 and uses an extra-row
sentinel. Incoming and Outgoing include visible terminal history as well as
pending invitations. Expiry in this read-only RPC is derived by the existing
server payload clock; existing resolution/list operations still persist expiry.

The new RPC returns only safe id/name/handle identities, source id/title/Hood,
existing challenge fields and canonical links. It checks both parties, source
visibility and fixtures without exposing relationship helpers. Only
authenticated callers receive EXECUTE. Existing create and Take-list operations
now exclude runtime fixtures. Existing resolution revalidates visibility after
its established locks and before terminal retries. Removed pending sources still
resolve as EXPIRED; removed terminal content is unavailable. No lock order,
client write grants, official judgement, Crowd, Stage or Crew policy was weakened.

The migration was applied **locally only**, in a single transaction with its
ledger entry. Its installed statements match the file exactly. No hosted
migration command, reset, data replacement or manual deletion of legitimate
records was performed.

The new `/arena/challenges` screen is in the existing Arena stack, reached from
Live Clashes. It uses the existing design system, accessible Incoming/Outgoing
tabs, a virtualized list, genuine source and expiry information, and a confirmed
Cancel action. Pending controls are disabled at the real deadline; local clocks
never invent a terminal server status. Accepted records without canonical links
show an explicit Room-not-ready state. Pending invitations only link to their
Take; linked accepted records can open their canonical Room. Existing legacy
Clash routing is unchanged.

Actions use the existing ACCEPT/PASS/CANCEL RPC. Request timeouts, duplicate-tap
guards, safe error messages, section-change invalidation, account checks before
and after network requests, focus/foreground refresh and refresh after actions
protect the client flow. Pagination deduplicates results; refresh replaces the
page and resets its cursor. Existing invitation/acceptance notifications remain
integrated with Take/Room routes. Decline/cancel/expiry notification events are
still absent; canonical inbox polling/refresh exposes those outcomes. No push
infrastructure or duplicate notification writes were added.

### Files

- `app/arena/challenges.tsx`, `app/arena/_layout.tsx`: Inbox route and registration.
- `components/arena/ChallengeInbox.tsx`, `components/arena/ArenaClashes.tsx`: management UI and entry point.
- `services/arenaChallengeService.ts`: inbox reads, bounded requests and action/account isolation.
- `utils/challengeInbox.ts`: validated page ownership, status/error copy and canonical navigation.
- `utils/arenaChallengePayload.ts`, `utils/arenaChallengePayload.test.ts`: explicit accepted-but-unlinked state.
- `supabase/migrations/20261008151000_arena_challenge_inbox.sql`: additive read/security changes.
- `supabase/tests/069_arena_challenge_inbox.sql`: inbox actor scoping, grants, visibility, pagination and terminal outcomes.
- `supabase/tests/057_arena_challenge_concurrency.sql`: actual Accept/Cancel races in both orders.
- `scripts/challenge-inbox-check.cjs`, `package.json`: focused component/service verification command.
- `supabase/CHALLENGE_INBOX.md`: audit and delivery report.

### Executed checks

| Check | Actual result |
| --- | --- |
| TypeScript | Passed, exit 0. |
| Complete unit suite | 418 passed; zero failed/skipped. |
| `test:challenge-inbox` | 18/18 component/service checks passed. |
| Existing onboarding checks | 12/12 passed. |
| Existing Crowd service checks | 7/7 passed. |
| Existing Stage/component checks | 19/19 passed. |
| Existing Arena navigation checks | 11/11 passed. |
| Complete local pgTAP suite | 70 files; 2,620 assertions passed; zero failures. |
| Expo Doctor | 18/18 passed. |
| Authenticated local Inbox HTTP | Incoming and Outgoing returned HTTP 200, zero rows, `hasMore=false` for the current account. |
| Anonymous Inbox RPC and direct challenge REST read | Both returned HTTP 401 / SQLSTATE 42501. |

The SQL suite used the existing ignored PG-wire runner against local PostgreSQL,
with the same Supabase admin test role and psql-variable translations as earlier
verification. This is not a claim that the previously unresponsive Supabase CLI
test runner executed. The new inbox file passed 39 assertions; the extended
independent-connection concurrency file passed 36. All 82 existing challenge
lifecycle assertions also passed, including removed-source expiry compatibility.
The full suite retains the Phase 0.5 RLS/grant/privacy checks and canonical
duel/Crowd/legacy compatibility tests. Its existing uncommitted Crew test was run
but is excluded from this commit.

The new races hold an uncommitted cancellation/acceptance on one connection and
verify blocking on another. Cancel-first returns CANCELLED without a duel.
Accept-first preserves ACCEPTED with exactly one linked Room, while conflicting
Cancel reports a terminal conflict. Retry and competing-acceptance tests remain
in place. Test-owned race Takes and profiles were confirmed absent after the
suite; the new transaction-scoped inbox fixtures roll back. No test competitions
were used for device screenshots.

Initial verification caught an import-extension typing issue and dollar-quote
generation in the added concurrency test. Both were fixed before successful
final checks. Existing React Native Web render checks emit a `pointerEvents`
deprecation warning; they do not verify native media/animations. There are no
remaining failed checks among those listed above.

### Physical Android and limits

The Samsung A50 (`RZ8M30DE9NL`) was accessible. Metro and local Supabase responded
on 8081/55321, with both ADB reverse forwards active. The current JavaScript
bundle displayed the Live Clashes Inbox entry, opened the Inbox, switched between
Incoming/Outgoing, refreshed, displayed genuine empty states and returned to
Live Clashes. No native rebuild was performed.

The current account has no visible ordinary incoming/outgoing invitations. Its
retained local runtime records are fixture-filtered. Physical pending cards,
Accept/Decline/Cancel, pagination, accepted Room entry, account switching and
notification taps were not verified in this step. These are material physical
verification limitations; the relevant service/component and server paths were
tested as described above. No new live competitions or messages were fabricated
to produce screenshots, and legitimate existing invitations were not changed.

Inbox history follows existing challenge visibility: its source Take must remain
active and visible. Removed, inactive, blocked/muted and runtime-fixture sources
are excluded. Decline/cancel/expiry notification events remain a documented gap;
the Inbox refreshes every 30 seconds while focused and active.

Screenshots and logs remain under ignored `.expo/android-startup-check/`.
Pre-existing Crew service/payload/specialty/test edits, Crew routes/components,
Crew discovery migration/test, local development scripts and other unrelated
files remain untouched and uncommitted. Work stops at Step 2; later phases are
not implemented. This report does not claim production readiness or absence of
all vulnerabilities.
