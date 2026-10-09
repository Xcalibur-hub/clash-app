# Arena Engagement Step 1 — Casual A/B questions

Baseline: `14f674a`. Scope ends at human-authored casual questions and voting. No automatic publisher, crawling, AI generation, ingestion cron, new competition engine, judging changes or Crew implementation is included.

## Architecture audit and choice

Takes already own authors, Hoods, text, media, moderation, creation/expiry timestamps, reactions, comments, reporting, personalized discovery and challenge eligibility. Question text therefore remains `takes.text`; a question is one Take, not an additional feed entity. Existing `take_stances` implements Mindshift initial/final AGREE/UNSURE/DISAGREE, while `judgements` implements official Clash ballots. Neither represents a changeable casual A/B vote. A separate private vote relation is needed; discussion, media, identities and canonical competition tables are reused.

The audit traced `create_take`, `arena_take_readable`, relationship filtering, `assert_rate_limit`, Take column grants/RLS, `rank_arena_for_you`, general Take reads/selectors, interest/Hood mappings, challenge creation/acceptance, the Take composer, feed item and detail screen. Existing reads already transport complete Take rows, and adding optional metadata preserves ordinary Takes. Existing challenge eligibility needs no modification: another user challenges the question author with their counterargument; acceptance still creates the one canonical Clash/Room graph. Casual option labels do not determine official fighter sides or outcomes.

## Schema and migration

`20261009130000_arena_casual_questions.sql` adds nullable Take columns `question_a`, `question_b`, `question_topic_id`, `question_origin`, `question_source_url`, `question_source_published_at`, and `question_review_status`. Ordinary Takes retain all-null question metadata. Questions require two distinct, meaningful, trimmed labels of 1–60 characters. Text remains 1–180 characters. The existing server-created 24-hour Take expiry controls voting; open/closed is derived from active status and the database clock.

Optional canonical interest associations must be active and mapped to the selected Hood at creation. Existing `author_id` identifies the publisher. Human creation always sets `human`/`not_required`; editorial provenance requires `approved` and an HTTPS attribution URL. Clients cannot write provenance columns. This prepares a trusted future editorial path without implementing one or introducing another publisher/account table.

`arena_question_votes` contains `(take_id, voter_id)` as its primary key, `side` A/B, positive `revision`, and server `updated_at`. Counts are computed from these authoritative rows, with an index on `(take_id, side)`. There are no writable totals or parallel official transcripts. A partial question discovery index uses descending `(created_at, id)`.

## RPC contracts

| RPC | Contract |
| --- | --- |
| `create_arena_question(hood, text, side_a, side_b, topic_id?, media_object_id?, media_url?, media_poster_url?, expected_auth_uid?)` | Returns exactly one Take row. Derives author from authentication, validates labels/topic, delegates to existing `create_take` for media ownership/public readiness, triggers and expiry, then attaches human metadata in the same transaction. |
| `get_arena_question(take_id)` | Authenticated, readable question only. Returns `{takeId, sideA, sideB, status, expiresAt, countA, countB, total, mySide, revision}`. Only the caller's own selection is returned; no voter identities. Empty selection has revision 0. |
| `vote_arena_question(take_id, side, expected_revision?, expected_auth_uid?)` | Locks the source Take, rechecks visibility/expiry, then atomically inserts or changes one caller-derived vote. Same-side retry acknowledges the current selection without another quota charge. A different side with stale revision fails `P0006`. Closed voting fails `P0003`; inaccessible source fails `42501`. |
| `list_arena_questions(topic_id?, cursor_at?, cursor_id?, limit=20)` | Invoker/RLS read of active, unexpired, nonfixture questions. Returns `{items, nextCursor}`. Maximum 40; both cursor components required together; descending timestamp + unique ID ordering. Topic matches explicit association or existing Hood mappings. |

New clients always send the last confirmed revision. Optional revision supports other callers but gives last-write behavior for differing sides when omitted. This is a desired-state/revision contract, not a durable UUID submission ledger: an old same-side retry acknowledges the current side, and an intervening opposite-side change produces a conflict instead of being overwritten. No vote quota is charged for an acknowledgment or failed transaction. Fresh changes use the existing serialized limiter: 30/minute and 120/hour. Question creation also checks 10/hour, while the existing, stricter Take creation trigger still limits total Takes/questions to 5/hour.

Removed content and existing blocks/mutes are checked before counts or votes are returned, including known-ID and same-side retry calls. Source moderation and votes serialize on the same Take row; an overlapping removal is revalidated after the lock wait. Relationship changes use existing readability semantics rather than introducing public relationship probes. Counts include all committed votes, not personalized voter lists.

## Security and compatibility

Creation and voting also accept an optional initiating-account assertion. New clients always send it. The server compares it to `auth.uid()` and rejects mismatches; it never assigns ownership from that value. This closes the interval between a client identity check and acquisition of an HTTP authorization token during account switching. Existing callers that omit it remain compatible and still act only as their authenticated identity.

The vote table enables RLS, has no client policies and grants no table access to PUBLIC, anonymous, authenticated or service roles. Only the authenticated RPC boundary exposes caller-scoped aggregates and writes. Definer functions use an empty search path and qualified application objects; discovery remains invoker/RLS. No caller-supplied profile ID, total, expiry, editorial status or competition identifier is accepted. New RPC EXECUTE grants are authenticated-only. Existing Take RLS and column grants remain intact.

Official judgements, reputation, settlement, notifications, fighter authorization, Stage/Crowd permissions, official request idempotency/recovery and legacy GROUP behavior are unchanged. An eligible challenge follows existing creation/acceptance; no casual vote creates a Clash or becomes a judging ballot. Tests accept and retry a question challenge and verify one canonical Room/Clash with zero inherited ballots.

## UI, discovery and media

The existing composer has Take/A/B question modes, distinct option inputs and validated publishing. Ready uploaded media is retained across a failed submission to avoid another upload of the same picked asset. The existing public media upload and server ownership checks remain in use.

Home Take cards and the existing Take discussion screen render `QuestionVotePanel`. Ordinary Takes retain Mindshift; questions show casual voting instead. Existing comments, reactions, reports, challenge action and media handling remain in place. Image/video attachment controls are reused; existing comment/GIF plumbing was not replaced. New stickers, GIF upload features or physical media verification are not claimed.

Before a selection, the card displays choices without fabricated percentages. Confirmed selections show server counts, percentages, participation and selected side. Closed empty history says zero participants/no votes; positive equal counts say tied. Voting is disabled after a server-confirmed close. No optimistic tally is invented. Network failure keeps the last confirmed selection and a retry with the same side/revision. Conflicts require refresh; revoked access clears results. Requests have a 15-second abort timeout, pre/post account checks and stale-response guards. Focus, foreground, manual refresh and a 30-second focused timer reconcile state. Former-account selection/counts are hidden immediately and late responses are ignored.

Topics & Trends reuses the canonical catalogue, adds per-topic question filters and an honest question section, and preserves existing active discussions. Pages use exact PostgreSQL timestamp strings (including microseconds), bounded calls, explicit More controls and ID deduplication. Account changes/disposal invalidate pending pages. Home continues the existing bounded For You ranking and Following/Popular/New selector semantics; real reactions/Clashes still determine existing engagement ranking. Votes do not bypass visibility or supply a fabricated trending boost. A question exists once in the underlying Take collection. Existing runtime-fixture exclusion remains in ordinary discovery.

## Files changed

- Database: the migration above; tests `077_arena_casual_questions.sql`, `078_arena_question_concurrency.sql`.
- Contracts/services: `utils/arenaQuestions.ts`, `utils/arenaQuestions.test.ts`, `services/arenaQuestionService.ts`, `services/arenaMappers.ts`, `store/types.ts`.
- UI: `components/arena/QuestionVotePanel.tsx`, `components/arena/ArenaQuestions.tsx`, `components/arena/ArenaTopics.tsx`, `components/arena/TakeFeedItem.tsx`, `app/(tabs)/create.tsx`, `app/take/[takeId].tsx`.
- Verification: `scripts/question-client-check.cjs`, `scripts/arena-navigation-check.cjs`, `package.json`; this report.

Unrelated dirty Crew discovery/UI files, migration/test 052 and local development scripts are excluded from the commit.

## Verification results — 2026-10-09

| Check | Actual result |
| --- | --- |
| Complete local pgTAP suite | 79 files, 2,880 assertions, zero failures. Includes unchanged dirty Crew test 052. |
| New question database/security tests | 61 assertions plus 15 real dblink concurrency assertions, all passed. |
| Full `npm run test:unit` | 436 tests, 113 suites, zero failed/skipped. Includes five question contract tests. |
| `npm run test:questions` | 23 actual service/component interaction checks passed with controlled dependencies. |
| `npm run test:arena-navigation` | 11 checks passed. |
| `npm run test:interests` | 12 checks passed. |
| `npm run test:challenge-inbox` | 18 checks passed. |
| `npm run test:duel:render` | 22 Stage/Crowd render scenarios passed with native bridges. |
| `npm run test:official:service` | 14 checks passed. |
| `npm run test:crowd:service` | 7 checks passed. |
| `npm run test:settlement:history` | 11 checks passed. |
| TypeScript | `npm run typecheck` passed. |
| Expo Doctor | 18/18 checks passed. |

Coverage includes anonymous/direct-table/provenance escalation denial, empty counts, vote changes, duplicate/lost-response retry, stale revisions, genuine ties, removed/blocked/muted questions, known-ID calls, minute/hour quota rollback, expiry, precise equal-timestamp pagination, fixtures, canonical acceptance separation, offline recovery, foreground reconciliation, duplicate page IDs, account switching and late responses.

The dblink tests genuinely overlap uncommitted votes, retries, conflicting revisions and moderation. They assert lock waiting, deterministic conflict handling, one active vote, truthful totals and no duplicate quota charges. Only explicitly owned fixture identities are temporarily committed for these races; cleanup removed them. All other new fixtures roll back. Final inventory contained zero questions and zero new fixture profiles, so no sample public activity remains.

pgTAP ran through the existing ignored direct PostgreSQL runner on localhost:55322 with transaction-scoped extension/search_path setup and the existing psql-variable adapter. A successful `supabase test db` CLI run is not claimed. No reset or hosted migration was run. Installed RPC bodies were compared exactly to migration text; schema, constraints, indexes, RLS, absence of policies, and ACLs were checked before recording local ledger version `20261009130000`. All 97 local files and ledger versions match. A clean tracked-only replay was not performed.

Initial test harness failures were corrected for the privileged dblink connection, pgTAP assertion name, text-node whitespace, new topic button lookup and native animation bridge. The interrupted owned dblink fixture was identified by exact IDs, author, text and fixture flag before cleanup. Final reruns passed; no failed attempt is represented as a pass.

## Device verification and limitations

Samsung A50 `RZ8M30DE9NL` was unlocked with CLASH active. ADB forwarding for 8081/55321 was present, Metro reported running, and local Auth health returned HTTP 200. The phone initially retained earlier JavaScript; an explicit native developer-menu Reload loaded the current bundle. The current Android bundle contained the new composer and topic controls. The existing native build emitted its known missing `ExpoCamera` warning during reload, then opened Arena; no native rebuild or camera fix is claimed.

The new Take/A/B mode switch, choice fields, question text entry, disabled incomplete publishing and enabled publishing after two distinct choices were checked physically. The draft was discarded without publishing. Topics & Trends displayed the new question controls and the truthful “No open questions here yet” state. No question was published to populate the feed. Actual physical casting/changing votes, populated question discussion/media and multi-device count updates therefore remain unverified; database and controlled client tests cover those paths. Screenshots remain ignored local artifacts.

Vote updates refresh on focus/foreground/manual action and every 30 seconds while focused, not through a new realtime vote subscription. There is no background/durable offline voting queue; an unconfirmed intent survives network errors in the focused panel but is cleared when leaving it. Creation retains the existing Take duplicate-text guard rather than a new idempotent creation key; a lost creation response may require refreshing Home to locate the already-created Take. Topic selection at creation is currently optional API support; the composer uses the chosen Hood and its existing interest mapping. Editorial publishing/review UI and production rollout are deferred. This checkpoint does not certify zero vulnerabilities or production readiness.

Stop after Arena Engagement Step 1.
