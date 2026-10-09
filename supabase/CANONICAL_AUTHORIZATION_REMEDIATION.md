# Canonical authorization remediation — Phase 3 Step 2A

Verified October 9, 2026. Scope: audit findings L1–L3 only. Supabase/PostgreSQL
remains authoritative; no client, gameplay, judging quorum or independence rule
was changed. L4–L8 remain outstanding as documented in the lifecycle audit.

## Migration and exact changes

`20261009100000_canonical_authorization.sql` introduces owner-only
`assert_canonical_clash_access(text,boolean)` and patches the installed canonical
guards/watch operation. Exact replacement anchors abort on unexpected definitions.
Phase 0.5's internal relationship helpers and existing function ACLs are retained.
The new helper has no PUBLIC, anonymous, authenticated or service-role EXECUTE.
It does not expose an actor argument or relationship details.

- **L1:** The canonical judgement trigger calls the helper after the existing
  Clash lock. Both `arena_take_readable` and `arena_room_readable` must permit the
  caller. Known-ID and duplicate submissions traverse the trigger. The existing
  authenticated public voting model, fighter exclusion, one-ballot rule, timing,
  settlement and reward behavior remain. No Room-membership judging requirement
  or independent jury was introduced.
- **L2:** The canonical content trigger calls the same helper with fighter-write
  safety enabled. All official message, evidence and reshare inserts traverse
  this guard. Besides caller readability, both existing fighter-to-fighter hidden
  predicates must permit participation; a block or mute in either direction
  denies new official inserts by either fighter. Identity checks and publishing
  deadline remain. Same-identity moderation updates and trusted system notices
  retain their existing exceptions; GROUP content takes its original path.
- **L3:** Canonical watch authorizes and locks Clash before locking Room, then
  revalidates access after the Room/topic reads and before either membership
  write, including after rate-limit lock waits. Existing-member returns also
  require readability. The dedicated canonical topic is read without FOR UPDATE
  to avoid a Clash-to-topic inversion with maintenance's topic-to-Clash order.
  GROUP retains its original locked topic read and membership behavior. Settled
  history and cancelled Stage/Crowd distinctions are unchanged.

The helper uses the existing Clash FOR UPDATE serialization and a source Take
FOR SHARE lock. Removal cannot commit while an admitted operation is in flight;
a queued operation sees a committed removal before admission. Acceptance's
Take/Challenge creation path, settlement's Clash-before-Room order and deferred
canonical graph constraints are preserved. The added source lock does not take
an existing Room or topic lock before Clash. Relationship checks run after waits;
relationship tables were not redesigned or given global mutation locks. Concurrent
safety changes after an authorization check do not retrospectively undo already
admitted work; subsequent requests recheck current safety.

No RLS, table grant, Crowd access predicate, notification, accepted-Challenge
idempotency, verdict or legacy delegate was loosened. No hosted migration was
applied. The local migration's installed definitions and ACLs were compared to a
transactional replay of the migration from original guard/watch definitions; that
replay rolled back and matched. Only then was the local migration ledger entry
recorded, and its stored SQL was verified equal to the exact migration file.

## Tests actually executed

All final commands completed with exit code 0:

| Check | Result |
| --- | --- |
| Complete local pgTAP suite | **2,685 passed across 72 SQL files**, zero failed |
| `070_canonical_authorization.sql` | **50 assertions passed** |
| `071_canonical_authorization_concurrency.sql` | **15 assertions passed**, independent dblink sessions; request session runs as authenticated |
| `npm run typecheck` | Passed |
| `npm run test:unit` | **418 passed**, 112 suites, zero failed/skipped |
| `npm run test:duel:render` | **19/19 passed**; native modules bridged |
| `npm run test:crowd:service` | **7 checks passed** |
| `npx expo-doctor` | **18/18 passed** |

New adversarial tests cover direct known-ID RPC calls, removed sources, text,
evidence, reshares, forward/reverse fighter blocks/mutes, existing/new spectators,
ballot safety, private helper grants, no membership side effects, trusted moderation,
public nonmember voting compatibility, GROUP posting/watch, settled history,
cancelled fighter Stage reading, cancelled Crowd denial and zero-vote cancellation.
Two-session tests hold visibility-changing transactions open and verify queued
official posting/watch reject after source removal, watch rejects after a queued
mute and judgement rejects after a reverse block. Rejected operations leave no
new transcript, membership or ballot. Their owned fixtures are flagged as runtime
tests and cleaned; read-only checks confirmed no race Take/profile remains.

The complete database suite ran using the existing ignored direct local pgTAP
runner at localhost:55322 with `supabase_admin`, transactional extension/search-path
setup and translation of four pre-existing psql directives. `supabase test db` is
not claimed to have run. Existing uncommitted Crew test 052 was included without
editing it; a separate clean tracked-only database replay was not performed.
The first targeted invocation failed because pgTAP was not installed in that
transaction; adding the runner's extension setup resolved the environment issue.
Final targeted/full suites passed. No implementation failure was hidden.

## Physical Android result and limitations

Samsung A50 `RZ8M30DE9NL` was connected over ADB. Reverse forwarding for 8081 and
55321 was active; Metro status and local Supabase Auth health returned HTTP 200.
Opening the retained cancelled canonical Room was attempted through a deep link,
but the foreground remained Android's lock screen/NotificationShade. An unlock
request was sent to the user. No physical Stage/Crowd/navigation interaction or
live authorization-change verification is claimed at this checkpoint. No retained
duel was reopened, no legitimate record was edited, and no public debate/chat
fixture was manufactured for physical verification.

Automated Stage/Crowd checks and existing database concurrency/security/settlement
suites pass, but these do not prove native-device interaction or hosted behavior.
L4–L8, independent judging, quorum changes and future gameplay remain out of scope.
This is not a zero-vulnerability or production-readiness certification.

## Focused files

- `supabase/migrations/20261009100000_canonical_authorization.sql`
- `supabase/tests/070_canonical_authorization.sql`
- `supabase/tests/071_canonical_authorization_concurrency.sql`
- `supabase/CANONICAL_LIFECYCLE_AUDIT.md` — preceding approved audit, previously uncommitted
- `supabase/CANONICAL_AUTHORIZATION_REMEDIATION.md` — this report

Unrelated Crew discovery/UI work, development scripts and other pre-existing
untracked files remain untouched and excluded. Stop after L1–L3.
