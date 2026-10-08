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
