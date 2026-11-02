# CLASH — project and engineering handoff

Prepared 2 November 2026 (Asia/Kolkata). This synthesizes founder decisions and agent reports supplied in the prior ChatGPT conversation; it is not an independent source-code, device or database audit.

## 1. New assistant: read this first

The founder is moving to a different ChatGPT account. That account will not inherit prior chats, memory or connector permissions.

The last task sent to Claude was LIVE-CONNECT-B5D — Recovery CLI Initialization and Failure Journal Correction. Its result was pending at handoff time. Review the actual B5D report before proposing anything else. Grade evidence PASS / PARTIAL / BLOCKED and distinguish offline tests from real Docker/PostgreSQL, physical-device and multi-actor acceptance. Do not assume B5D passed or resend its prompt automatically.

The founder often pastes a detailed Claude/Cursor report without a separate question. Treat the report as the request: review it, decide the next bounded step, and provide one complete copyable prompt. Do not ask the founder to repeat known facts.

## 2. Product identity and intent

CLASH is intended to be a creator- and community-led social participation product. Its conceived surfaces are Arena, Vault, Groups, Interactive Live, Play, World and unified Home/Explore. The founder wants elegant, premium, minimal UX and a compelling reason to return—not a cluttered collection of unrelated features.

- Arena: Takes, topic discussion, 1v1 Clashes, spectators, voting, reactions, accepted assists and authoritative verdicts.
- Vault: creator profiles/storefronts, subscriptions, creator content/drops, creator-hosted experiences and follow-ups, sponsorship/attribution foundations. Do not claim payment-provider capability is operational without fresh evidence; earlier reports noted checkout can return payments_unavailable.
- Groups: persistent creator/community identity, discussion, member coordination, reputation and collective progress. Preferred design direction: hybrid Reddit-like discussion plus Discord-like identity, without clutter.
- Interactive Live: creator-hosted audience sessions with choices/voting and shared outcomes. A read-only audience frontend is frozen; new hosting/admission remains deferred pending server acceptance.
- Play: lightweight games and skill challenges that can become event formats.
- World: optional coarse-location missions/drops; never expose precise user or buyer locations.
- Home/Explore: one discovery surface that helps people find the next creator/community experience.

### Arena decisions already made

- No community-vs-community Clashes. A Clash has exactly two active fighters.
- Fighter A is the Take author; Fighter B is the challenger.
- One canonical Arena room links to a Clash. Spectators are not a third fighter.
- Spectators may vote, chat, react and assist where server-authorized.
- Users select interests and specialize in a community; invitations and future community creation are part of the model.
- Groups can rally around a participant, but the duel stays 1v1.
- Visual direction: polished stadium/stage and crowd energy, clear hierarchy, minimal density; no neon, gradients or glow.

## 3. YC feedback and product unification

A YC contact said Arena and Vault look like two separate apps combined. Treat this as useful product-clarity feedback, not a universal YC rule.

Recommended positioning:

> CLASH lets creators run participatory challenges where fans compete, vote and help shape a shared outcome; participation builds reputation and brings communities back for the next event.

Make a creator/community event the central product object. Arena, Vault, Groups, Live, Play and eventually World become connected roles or formats around that event, not independent mini-products.

Recommended loop:
1. Creator launches an event from the creator studio/Vault: debate, choice round, skill task or other bounded challenge.
2. Home/Explore distributes it to relevant followers and groups.
3. Fans fight, vote, assist, submit, play or watch through the appropriate event format.
4. Groups organize participation and earn collective milestones through distinct meaningful contributions.
5. The server records an authoritative outcome and verifiable participation receipts.
6. Meaningful, policy-compliant actions build reputation/status—not raw views or spam.
7. Vault delivers creator-approved follow-up: reaction, behind-the-scenes content, Q&A, badge, early access or other explicit perk.
8. The next event is suggested using the creator/community relationship and prior event context.

Do not add a universal token just to connect the tabs. Start with non-cash, non-transferable Reputation/XP for status, separate from creator-approved event perks. Reputation must not buy votes or pay-to-win advantage. Group perks can include milestone badges, priority to suggest a future event, a group Q&A or an event-specific Vault follow-up. Use distinct-member thresholds, cooldowns, moderation eligibility and anti-sybil controls.

MVP recommendation: prove one repeatable creator-hosted challenge with audience participation and a shared outcome. Keep formats limited at first. Treat paid commerce, advanced hardware interaction, digital clones, anonymous chat, complex games and location missions as later extensions unless user evidence shows otherwise.

Candidate north star: weekly unique users who meaningfully participate in a creator/community event and return for the creator's next event. Measure invite-to-join, meaningful contribution, 7-day next-event return, creator repeat-host rate and moderation cost. Proposed cohort targets are not traction.

## 4. Stack and security invariants

- Expo SDK 54, React Native 0.81, Expo Router 6, strict TypeScript, Supabase/PostgreSQL.
- Sensitive state changes must be server-authoritative, normally through carefully scoped RPCs with RLS/grants. A client route flag or releaseScope is not a server authorization boundary.
- Canonical actor identity comes from server-side auth/profile mapping, not user-editable metadata.
- Recheck visibility, block/mute, entitlement and authorization server-side.
- Never weaken server authorization to make a demo or test pass.
- Preserve the founder's huge dirty local checkout. No reset/stash/clean/broad staging, broad deletion or worktree sprawl without explicit review and authorization.

## 5. Latest reported local frontend freeze

The latest reported local frontend source freeze is:
- Branch: arena-ui-review
- Local HEAD: 2b898748a48e317ac5737da62c7a964f50aca2a8
- Parent: 8aac69772a7e9d227b63e89a5d36db7441217d15
- Commit message: feat(live): connect audience reads and harden session recovery
- Scope: 18 reviewed frontend/source/test/config paths combining X1 and X2.
- Reported checks: TypeScript PASS; npm test 1,216/1,216; EAS archive 715 paths, inventory hash 268b52568c64d5655ba756837363cc4397ae8fb0b27296e6f98f1fa7ae64e5ff.

These are source/unit/mounted tests, not physical Samsung A50 acceptance or real multi-actor delivery.

**Remote mismatch:** at handoff, GitHub's remote arena-ui-review was 0cd6c36aa4831cda115c293b74ba2bf98c6d22df (October 24). GitHub could not find the reported local 2b898... or parent 8aac697... commit. The local frontend freeze has not been verified as pushed. This docs branch does not contain it. Reconcile/push actual application code only from the original checkout after reviewing the dirty tree and explicit path scope.

## 6. Creator Live backend chronology and current truth

### B1–B3: audit and proposal

B1 identified source-level concerns: server-side admission gaps, ballot replay privacy, lock ordering/deadline races, timestamp-only event recovery, stale client account state and tie handling. B2 prepared a source-only correction. B3 refined the migration and test suites.

Proposed migration: supabase/migrations/20261031161138_creator_live_correctness.sql  
SHA-256: e84d4758a5d9a0afc0e3cd53f40302ecb033663085f79c14cbd90dde9d49f127

Planned SQL acceptance:
- 53 historical Creator Live pgTAP assertions.
- 72 correctness pgTAP assertions.
- 10 native PostgreSQL isolationtester permutations with independent connections.
- A frozen 111-migration baseline, then the one B3 correction, expected application ledger 112.

**None of the 125 SQL assertions or 10 concurrency permutations has executed as of B5C.** The migration is a proposal, not a deployed or database-compiled fix.

### B4–B4C: disposable harness and native tool

A dedicated disposable PostgreSQL 17.11 harness was prepared. B4A/B4B materialized guarded Docker, managed-init and SQL tooling. B4C built and verified a genuine static Linux amd64 PostgreSQL 17.11 isolationtester. Its reported SHA-256 is d11eada9a7b4230c791cbb73126218a07d5984a0d3404ef4710346d0b979cbef.

These are offline tooling results, not PostgreSQL migration or concurrency acceptance.

### B5 / B5A: absence guard

The initial preflight rejected Docker's legitimate network-not-found wording. B5A made a narrow exact-name network absence correction; 54 actual-function harness tests and 15 backend source checks passed. Read-only preflight showed the proposed resources absent at that time.

### B5R: first creation attempt

A fresh disposable DB container, bridge and two volumes were created. The container was never started. A validator incorrectly required runtime NetworkID immediately after Compose create. That failure must remain historical evidence.

### B5B: lifecycle validator/recovery preparation

The harness was corrected to distinguish created/never-started from running containers. Created state requires exact identity/configuration and empty runtime endpoints. Running state continues to require exact populated network membership, effective loopback publication and health. Offline reports: 95/95 lifecycle tests, 17/17 recovery tests, 15/15 backend source tests. No PostgreSQL start.

### B5C: recovery accepted; start failed before Docker

The authorized recovery entrypoint accepted the retained created-state and privately validated the existing encrypted bootstrap credentials. The next start invocation failed before any Docker start command. The diagnosis: recovery.cjs directly executes async main() before assigning module.exports; runtime.enterRecovery() synchronously requires recovery.cjs and sees an incomplete context export.

No PostgreSQL process started. No database connection, managed initialization, migration, SQL, fixture or cleanup ran. The earlier B5R create failure and B5C failed start are immutable history. Do not reuse B5C attempt IDs or rerun start because an internal progress file lacks a failure marker.

### B5D is the active task; output pending

The exact prompt is in LAST_CLAUDE_PROMPT_B5D.md. It requests a source-only CommonJS initialization fix, real child-process tests of the direct CLI entrypoint, honest stage/failure journaling, a separately bound future recovery attempt and offline validation. It forbids Docker lifecycle, credentials, DB, SQL and migrations.

Do not assume B5D passed. Review its actual report first.

## 7. Safe sequence after B5D

1. Review the B5D report. Require direct CLI child-process regression proving the circular export warning is gone, and confirm no Docker/DB stage ran.
2. Verify B5R/B5C failure evidence and exact retained disposable resource identity remain intact. Revalidate credentials only under fresh authorization.
3. If B5D passes, prepare a new B5E authorization using the identity-bound recovery entrypoint against only the exact retained resources; use a new attempt UUID. Do not recreate resources, reuse failed attempt IDs, clear failure markers, rotate credentials or delete volumes.
4. Execute separate gated stages: accept-created → start/verify DB identity, health, cron and loopback → Storage/Auth/Realtime managed initialization → 111 baseline + B3 migration → function/ACL/RLS/grant inspection → 53+72 pgTAP → 10 concurrency tests → scoped residual verification.
5. After DB acceptance, separately review deployment compatibility. Then separately authorize real multi-actor Auth/Realtime/device testing with reconnect, revocation and terminal result delivery.
6. Do not enable public Creator Live hosting/admission merely because offline or disposable-DB tests pass.

First failure means retain evidence and stop. No auto retry, broad reset, manual migration-ledger repair, privilege expansion or fallback to existing QA/Meet/shared/staging/production databases.

Exact local container/network/volume IDs, owner context, encrypted credentials, attempt IDs and raw .expo evidence are intentionally excluded from this public handoff. Claude/Cursor with original local checkout access must inspect the preserved B5R/B5C records read-only when exact identities are required. Never reconstruct IDs from memory.

## 8. How to report progress

Always distinguish:
- Source/offline PASS — code/local checks only.
- Native device PASS — physical-device behavior only.
- PostgreSQL PASS — real migration, roles, grants/RLS and SQL on exact disposable DB.
- Concurrency PASS — actual independent sessions and observed lock waits.
- Multi-actor PASS — genuine independent users receive the same authoritative event/result.
- Release GO — separate security, operational, privacy, moderation, entitlement, rollback and deployment review.

Never collapse these into a generic done or production-ready claim.

## 9. Founder working preferences

- Drive the next step; avoid broad menus and repetitive questions.
- Give complete copyable Claude/Cursor prompts when useful.
- Prioritize real multi-user behavior over demo-only polish.
- UX should be elegant, premium, minimal and scannable; avoid neon, glow, gradients and clutter.
- Keep implementation bounded and preserve unrelated dirty work.
- Distinguish implemented, tested, prototype and planned features honestly.
- Focus on one repeatable product loop before adding more feature breadth.
