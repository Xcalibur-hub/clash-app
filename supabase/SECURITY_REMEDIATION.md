# Phase 0.5 security remediation

Supabase/PostgreSQL remains authoritative. Existing data is preserved; no database reset is used.

## Group 1: public profile access

Migration `20261008110000_profile_read_security.sql` replaces broad profile SELECT
grants with the explicit public identity columns. It also removes any pre-existing
column SELECT grants before applying that whitelist. `get_my_profile()` derives the
caller from `auth.uid()` and returns public fields plus that caller's balance;
account linkage and authority fields are absent. Existing editable-column grants
and RLS ownership checks remain intact.

Public profile, search and hydration consumers use the shared explicit projection.
Identity lookup uses `my_profile_id()` rather than querying the auth linkage field.
Public profile cards do not receive balances; the existing domain mapper defaults
that unavailable field to zero, while own-profile hydration receives the real balance.

Executed verification:

- Typecheck passed.
- Unit suite: 409 tests passed, no failures or skipped tests.
- Expo Doctor: 18/18 checks passed.
- Database suite: 61 files / 2,443 assertions passed, including 17 new profile checks.
- `node scripts/security-remediation-check.cjs`: real local Auth/PostgREST checks
  passed for public projections, anonymous internal-field denial, caller isolation,
  denied privilege escalation, and preserved profile editing. Disposable accounts
  were cleaned up.

## Group 2: helper privileges and content visibility

Migrations `20261008110100`, `20261008110200`, `20261008110400`,
`20261008110500` and `20261008110600`:

- Keep owner-only relationship/entitlement implementations for internal RPCs;
  public helpers enforce caller identity. This covers Arena, Explore, Vault,
  courses, creator live/AI and community entitlement predicates.
- Revoke explicit anonymous Crew EXECUTE grants and authenticated access to
  payload/eligibility builders. Installed discovery functions are handled
  conditionally without changing the uncommitted Crew files.
- Scope private message/evidence room lookups to authorized, visible content.
- Apply restrictive removed-source and author visibility rules to Takes, replies,
  official messages/evidence and canonical topic copies. Legacy Clash/profile,
  Room, topic, discovery, trending and Explore reads enforce these filters.
- Preserve existing scheduled-topic error behavior, expired-content archives,
  private stances, canonical fighter authorization, judging and verdict rules.

Legacy owner-level Vault/community predicate tests now call private implementations
when testing multiple identities. Separate adversarial API-role tests verify the
public helper refuses those same arbitrary-identity requests. Existing publication,
expiry and private media/entitlement regression tests remain enabled.

Executed verification: full database suite passed (64 files / 2,501 assertions),
including existing rate-limit, settlement, duel/challenge/Crowd concurrency and
Crew discovery coverage. Expanded real Auth/PostgREST checks passed for helper
probing denial, privilege escalation, same-client account switching and removed
content through REST and legacy/current RPCs.

## Group 3: account and Room isolation

`AccountScope` keys the shared store and screen tree by Supabase Auth user ID.
Sign-in, account switching and sign-out dispose the previous screen state,
subscriptions, private content, viewer permissions and drafts. Room route changes
also create a fresh Room screen scope. Late auth restoration cannot overwrite a
newer auth event; callbacks from disposed providers are ignored. Room authorization
refusals clear the private thread and stale Room permissions.

Executed checks: `node scripts/account-isolation-check.cjs` passed the actual
scope-key and stale/disposed auth callback contracts. Real same-client sign-out /
sign-in checks confirmed the new identity cannot read the old Room's Crowd or
typing state. These are component/service/API checks, not physical UI verification.

## Group 4: private server-derived typing

Migration `20261008110300_private_room_typing.sql` adds one expiring record per
Room/author. Only caller-derived RPCs can write it. The server enforces membership,
fighter role, argument-stage timing, visible reply targets and rate limits.
Private Realtime broadcasts contain only an empty invalidation hint. Members
hydrate filtered, server-derived author cards; clients cannot publish broadcast
or Presence metadata into the topic. Six-second expiry and client reconciliation
remove stale typing, including after disconnects. No draft text is transmitted.

Executed checks: 15 typing database assertions; typing service tests for private
channel configuration, ignored forged metadata and disposed-response isolation;
real two-session Auth/PostgREST/WebSocket delivery, outsider and anonymous channel
rejection, isolation from a public channel using the same topic name, spectator
write denial and spoofed broadcast rejection. Existing Crowd two-way
delivery, official fighter arguments, reconnect recovery, mute filtering and
server-derived spectator counts passed in the same disposable local fixture.

## Group 5: verified ledger and honest counts

`node scripts/verify-crowd-ledger.cjs` compares installed Crowd columns/defaults,
constraints, indexes, eight function signatures/defaults/return types/bodies,
search paths, volatility, EXECUTE grants, RLS, SELECT projection, publication and
report delegation against the two migration files. Expected tables/functions are
created only in an isolated schema inside rolled-back transactions. The known
security substitution of the private relationship helper is normalized explicitly.
Only after equivalence passed were `20261008100000` and `20261008100100` recorded.
The seven applied remediation versions were recorded after comparing explicit
installed function bodies and security metadata. `supabase migration list --local`
confirmed alignment. No installed Crowd migration was replayed and no data reset
was run.

Hood membership counts no longer fall back to bundled fabricated values. Unknown
counts are labeled unavailable. Stored Room/topic membership counts say joined;
they do not claim current online presence or active watching.

## Final executed verification and limits

- Typecheck passed.
- Unit suite: 409 tests / 111 suites passed; zero failures or skipped tests.
- Expo Doctor: 18/18 checks passed.
- Database suite: 64 files / 2,501 assertions passed (75 additional assertions).
- Crowd service checks: 7 passed; duel/component render checks: 19/19 passed.
- Account isolation, typing service, direct REST/RPC and real two-session local
  Auth/WebSocket runtime checks passed. Disposable accounts/content were removed.
- Migration definition checks and local ledger alignment passed.

All database changes and runtime verification were local. Hosted migration
deployment and physical Android account-switch/typing verification were not run.
Account switching intentionally remounts screens and clears local drafts. Typing
records expire logically; at most one stored row per author/Room remains until
the Room is deleted. Deploy the matching client changes with profile grant changes
because older clients using full profile projections will receive access errors.
Realtime authorization can be cached by the transport; empty hints carry no
identity metadata, and every typing hydration rechecks server authorization.

Unrelated Crew discovery/UI work remains unmodified and excluded from these
commits. No topic onboarding, Step Up, public guest viewing, community judging,
Convex migration or second general-purpose database was introduced. This report
does not assert zero vulnerabilities or production readiness.

## Phase 0.5 finalization checkpoint — 2026-10-08

The verification below supplements the earlier report; no Phase 1 work was
started. The existing branch is `main`. Its remote tip before this checkpoint
was `42be14c977e392e6289cbd07a73599cd4e59193a`. The six remediation commits,
in order, are:

- `921dcf322e2fd820c6edfea0765da7997862d9d0` — public profile projections and caller balance.
- `1e380ce2e8ddbade7fc3305bc370498865997093` — scoped helpers and legacy content visibility.
- `5952c6328f8bf180c631dd2b97444d7c419c9314` — account/Room isolation and honest counts.
- `a6766aad89360da06c4174c60c2b24c20c978ad0` — private server-derived typing.
- `fde917c5ce73e8a01741fc5bfc93609f5f392b94` — verified local ledger and remediation report.
- `9c9d026e2ec0164ef7e3b27d57f26f7360ab8765` — scheduled-topic guard ordering.

No uncommitted remediation implementation remained. A separate focused report
commit records this checkpoint. The dirty Crew service, utilities, tests,
discovery migration and UI directories remain excluded, together with the
pre-existing `Microsoft/` and `shot.png` artifacts.

### Automated verification rerun

- `npm run typecheck`: passed.
- `npm run test:unit`: 409 tests / 111 suites passed; zero failures or skips.
- `npx expo-doctor`: 18/18 checks passed.
- `supabase test db --db-url postgresql://supabase_admin:postgres@127.0.0.1:55322/postgres`:
  64 files / 2,501 assertions passed, including concurrency and security tests.
- Account scope/stale auth callbacks, private typing service, direct anonymous
  and authenticated PostgREST/RPC adversarial checks: passed.
- Crowd service: seven checks passed. Duel/component render: 19/19 scenarios
  passed; these render checks bridge native media/animation.
- Real local Auth/WebSocket checks: private typing delivery, outsider/anonymous
  denial, public/private topic isolation, spoofed broadcast rejection, two-way
  Crowd delivery, spectator Stage write denial, reconnect gap recovery, mute
  filtering and genuine joined-spectator counts passed.
- Crowd migration object equivalence and `supabase migration list --local`:
  passed again after runtime testing. No ledger repair/write was needed.

The initial plain `supabase test db` rerun failed in four concurrency files
(`053`, `055`, `057`, `059`) because the CLI's non-superuser connection cannot
use `dblink` when local trust authentication supplies no password credentials.
The successful full rerun used the existing local test administrator; database
privileges and server authentication settings were not changed.

### Physical Android results

Executed through ADB on a connected Samsung Galaxy A50 (`SM-A505F`), running
`com.clash.v2` against current local Metro and local Supabase through port
forwarding. The independent authenticated peer was a Node Supabase client, not
a second physical phone.

- Account switching: signed out Local Dev, signed in the disposable Fighter A,
  then signed out and signed in a disposable spectator. Profile identity changed
  from LOCAL Crowd Test 0 to LOCAL Crowd Test 2. The same duel changed from
  `YOU'RE FIGHTING · FIGHTER A` with its official composer to `WATCHING` without
  that composer. The spectator retained its separate Crowd composer.
  Restored the original Local Dev account afterwards. Opening the same Room
  as that nonmember showed only the `Watch this Clash` entry gate: previously
  loaded Crowd rows and spectator access did not carry over.
- Private typing: an Android fighter draft was observed by the authenticated
  peer through server-derived typing hydration. Authorized Fighter B typing
  appeared as `People are typing…` on Android. The peer explicitly cleared it.
  Outsider/anonymous denial and spoofing protections were verified by the real
  WebSocket/API security checks, rather than by a second physical device.
- Canonical Stage: exactly two fighters were displayed, the official argument
  appeared above Crowd, and a physical fighter submission became the latest
  Stage argument. Spectator backing controls remained separate from judging.
- Crowd: `[LOCAL TEST] Authenticated client to Android` appeared on the phone
  while the Room was open. The phone sent `Physical Android Crowd check`; the
  second authenticated client received the Realtime event and verified the
  persisted message. No production activity was fabricated.

The first device attempt used an old bundle and received profile permission
errors. Loading the current Metro bundle restored the intended public profile
projection. UIAutomator hierarchy capture failed with `could not get idle
state`; device interaction was verified with ADB input and screenshots instead.

The installed development binary also reported missing native `ExpoCamera`
from the existing Meet video route. Dismissing that error allowed the above
Arena checks. An offline native rebuild failed because `org.jitsi:webrtc:124.+`
was not cached; the online retry reached compilation but failed with Windows
error 1455, `The paging file is too small`, during Java/Kotlin memory allocation.
No successful fresh Android build is claimed. A matching native development
binary remains necessary for complete app-wide device verification.

### Deployment and remaining limits

All database operations targeted local Docker or explicit localhost endpoints.
No hosted migration apply, `db push`, reset or hosted ledger repair was executed.
The CLI's `Remote` column under `--local` refers to the installed local database;
the hosted ledger was not independently queried, so changes by other operators
are outside this verification. GitHub push does not apply these migrations.

Existing data was not reset or removed by this checkpoint. Disposable runtime
fixtures created for the Android check are retained locally; credentials and
screenshots are excluded from commits. Account-isolation regression checks also
cover stale asynchronous callbacks, beyond the physical identity/role checks.
Transport authorization caching, logical typing-row expiry, coordinated profile
grant/client deployment and the native binary limitation remain as described
above. No zero-vulnerability or production-readiness assertion is made.
