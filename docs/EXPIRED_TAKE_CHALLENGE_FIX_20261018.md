# Expired Take challenge entry — 18 October 2026

Base: PR #74, `eca036a2551e322183ee243ce27f287a64e70d64`. Separate branch: `fix/expired-take-challenge-20261018`. No merge or deployment.

## Reproduction and exact cause

**Reproduced on the physical Samsung A50.** The owner's normal development app used `localhost:8081`, serving the primary checkout (`83211b8`), rather than PR #74's isolated candidate. After normal startup completed, opening `clash-dev://take/devfx_take_settled?challenge=1` displayed the challenge composer. Its counter-position draft was empty (0/500). Entering only this task's nonpersonal text and pressing the real **SEND CHALLENGE** returned **“Take cannot support a duel window”** in the native hierarchy and screenshot. No successful challenge or duel was reported.

Immediately before submission, a bounded, read-only public REST request to the existing loopback backend on 55321 selected only `id,status,expires_at,is_runtime_fixture` for this known development-seed Take. It confirmed:

- ID: `devfx_take_settled` (documented in `supabase/seeds/clash_dev_fixtures.sql`).
- Status: `expired`.
- Expiry: `2026-10-13T17:15:29.601715+00:00`.
- Runtime fixture flag: `false`.
- HTTP server date: `18 October 2026`; expiry had already passed on the server-side date, not just a phone countdown.

The exact rejection is defined in `20261007130100_arena_challenge_lifecycle.sql`, function `create_arena_challenge`, SQLSTATE **P0003**. After locking the Take, it checks `status <> 'active' OR expires_at <= clock_timestamp() + interval '30 minutes'`. The inbox migration `20261008151000_arena_challenge_inbox.sql` additionally includes runtime fixtures in that same veto. The failing guard precedes challenge insertion, rate charging and notification creation. The physical message matches this unique source string; a raw network SQLSTATE was not captured on-device.

For this record, **expiration/inactive status is the confirmed cause**; it is not a fixture-only refusal or a fabricated duel. More generally, a still-active Take with **30 minutes or less remaining is also ineligible** for a new canonical challenge. An existing active canonical duel is a separate P0006 condition; caller safety/auth restrictions use other checks. None were relaxed.

There were two client gaps even on PR #74: its archive check did not represent the separate 30-minute window, and the standalone `ChallengeTakeButton` forwarded an ID without a fresh eligibility read. `TakeChallenges` depended on its parent supplying `readOnly`; its submit path did not recheck before calling the creation service. Take detail preferred cached feed data and skipped a source refresh when that cache contained a Take/author. Finally, the mapper discarded existing server status/fixture metadata. These gaps are fixed independently of the phone's older normal bundle.

## Entry-point trace and corrections

| Entry | Previous path | Final behavior |
|---|---|---|
| Feed `TakeFeedItem` | `ChallengeTakeButton(takeId)` | Passes actual Take metadata; expired cards say Archived, cannot react, and retain detail/history links. |
| Standalone/ID-only `ChallengeTakeButton` | Auth → `challenge=1` route | Vetoes known closed metadata, then awaits fresh caller-scoped source/Clash reads before routing. Failed reads do not open a composer. |
| Take detail | Cached Take could shadow a newer source | Refreshes on navigation focus, prefers that account-scoped result, and applies source updates from challenge checks. An unreadable source becomes unavailable. |
| `challenge=1` deep link | Effect opened the modal using parent `readOnly` | Runs the same fresh eligibility check, even with an otherwise apparently active cached Take. |
| Normal Take challenge action | `setComposer(true)` | Checks current time/status, then fresh source/visible canonical-duel state before opening. |
| Open composer → submit | Creation RPC directly | Checks current timestamps at press time and repeats fresh reads in the shared creation service. Known server vetoes after a successful preflight close the modal with truthful unavailable/closed copy. Network failures remain errors, not success. |
| Deadline/status changes while composing | Parent flag/old closure could lag | Independently computes the canonical window, masks the modal immediately on a closed render, closes its state, and rejects stale submit callbacks. New inactive props cannot be overridden by an older successful preflight. |
| Legacy Clash **View discussion / Make an argument** | Opens Take detail; source route already fixed by PR #74 | Existing route/state restoration preserved. Take focus/deep-link gates prevent an expired composer from being reached through it. |
| Legacy comment **Challenge** → mode sheet | Cached Take, then `start_clash` | Fresh source check before opening and before submit. **Legacy timing remains distinct:** `start_clash` requires a live Take, but does not acquire the canonical 30-minute minimum. |

`fetchEligibleChallengeTake` reuses `fetchTakeById` and `fetchClashViewForTake`. It checks the authenticated account around asynchronous work and rechecks time after network work. An observed open canonical duel vetoes creation; a settled/cancelled result or legacy Clash is not misclassified as an open canonical duel. An explicit recheck is available for a previously observed server veto that may have changed.

Client checks are conservative vetoes, not new authorization grants. Relationship, visibility, rate-limit, duplicate/active-duel and timing decisions remain authoritative in the serialized server RPC. A read cannot guarantee eligibility remains unchanged before a write, or reveal private relationship state. The final RPC still handles those cases; the UI now handles its known eligibility refusal by closing the composer. There is no fallback to cached permission after a failed read and no automatic creation retry.

Accepted/completed duel links, discussion, share/save/moderation, cancellation and existing history retrieval remain. The existing history RPC itself returns no rows for some inactive sources; this checkpoint does not broaden that backend contract or invent history. No deadline, reward, engine, RLS or grant changed.

## Exact files

- `app/take/[takeId].tsx`
- `components/arena/TakeChallenges.tsx`
- `components/arena/TakeFeedItem.tsx`
- `services/arenaChallengeService.ts`
- `services/arenaMappers.ts`
- `store/types.ts` — optional existing server status/fixture metadata; old cached records remain compatible.
- `utils/takeChallengeEligibility.ts`
- `utils/takeChallengeEligibility.test.ts`
- `scripts/take-challenge-check.test.cjs`
- `scripts/take-detail-check.test.cjs` — controlled focus refresh bridge.
- `components/arena/ArenaVisualCompletion.test.cjs` — strict dependency bridge plus a real future expiry for its active-Take fixture; assertions retained.
- This report and sanitized evidence under `docs/evidence/expired-take-challenge-20261018/`.

No Supabase files, migrations, policies, grants, authentication implementation, Clash engine, Groups, Discover, Live Room, global theme/navigation, native configuration, dependencies or unrelated primary-checkout files are changed.

## Automated results actually executed

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | PASS, exit 0 on final application code |
| `npm.cmd run test:unit` | PASS, 500 tests / 126 suites, 0 failed/skipped, exit 0 |
| `node --test scripts/take-challenge-check.test.cjs` | PASS, 23 controlled component/service tests, exit 0 |
| `node --experimental-strip-types --test utils/takeDetail.test.ts utils/takeChallengeEligibility.test.ts` | PASS, 9 tests (5 existing navigation + 4 new eligibility), exit 0 |
| `node --test scripts/take-detail-check.test.cjs` | PASS, 6 tests, exit 0, including successful rerun after scoped cache cleanup |
| `node --test components/arena/ArenaVisualCompletion.test.cjs` | PASS, 16 tests, exit 0 |
| `node scripts/challenge-inbox-check.cjs` | PASS, 18 controlled checks, exit 0 |
| `node scripts/arena-engagement-check.cjs` | PASS, 8 controlled checks, exit 0 |
| Android JavaScript export | INTERRUPTED / NOT PASS: C: reached 0 free bytes during export; task-owned process stopped and partial output removed |

New regressions cover exact 30-minute boundaries, expiry, future timestamps with inactive status, fixture exclusion, stale feed/ID-only callers, deep links, ordinary composer entry, expiry/status changes while open, stale submit callbacks, denied source reads, observed canonical duels, account switching, server-veto races, positive RPC contract, historical Room entry, legacy open/submit and source-mapper/focus refresh.

Initial validation found the handwritten legacy row type omitted `is_runtime_fixture`; the mapper now accepts that already-existing additive field without changing generated schema files. Initial controlled tests needed module/memo/focus/clock bridge updates; all assertions were preserved. Existing UI test failures were missing allowed hook/helper dependencies, not waived product failures. The active feed test fixture now supplies the required future expiry rather than weakening its action assertions.

Windows disk exhaustion interrupted export and initially prevented an extra test process from starting. Read-only inspection confirmed C: had zero free bytes. Only this attempt's generated `.expo/challenge-validation/metro-temp` and partial `android-export` were removed after stopping their identified process trees; approximately 99 MiB was recovered. No older worktree, personal file, Docker resource, database or migration ledger was cleaned. The small test rerun then passed. Export was not rerun or reported as successful. No pgTAP, new database security validation or Expo Doctor run is claimed.

## Physical A50 results and limits

- **PASS — original reported failure reproduced:** warm normal 8081 bundle → known expired Take challenge link → empty composer → task-only counter-position → real SEND → exact native server error. The earlier cold normal launch/deep link returned Home and had unavailable accessibility; no controls were guessed. The successful warm attempt is recorded separately.
- **PASS — candidate 8083 bundle:** actual phone-originated Android bundle served HTTP 200, then real Take UI rendered. The `challenge=1` link showed Archived discussion, disabled expired reply/reaction actions and no editable challenge/reply composer.
- **PASS — preserved history:** actual History → settled Clash → View discussion returned to the archive and retained New sort, asserted from native XML.
- **CONTROLLED TEST ONLY:** near-30-minute cutoff, actual expiry while a composer is already open, server state changing mid-request, account switching, active-duel races and stale feed callbacks. No legitimate record's clock/status was modified to stage those screenshots.
- No new public Take or fake activity was created. The failed submission was made only after the server-expired known development record was reverified. Test text was typed only into an empty verified counter-position field; cleanup checks remove that exact text, not an owner's draft.

Native PNGs/raw hierarchy remain in the private ignored `.expo/challenge-validation/screens/` directory because status bars contain personal notification indicators. Committed evidence contains sanitized assertions and filename/size/SHA-256 manifests, not raw screenshots, account tokens or configuration.

Final read-only comparison verified phone preferences byte-for-byte and the exact original ADB reverse list. The task counter-position was cleared and its original 0/500 draft verified. A duplicate restoration helper stopped when removing an already-absent 8083 reverse; final state verification passed independently. Task-owned process cleanup is recorded in evidence. Normal Metro 8081 is preserved. The normal bundle is still the primary checkout, **not this unmerged feature branch**; this fix was reviewed through isolated 8083 and is not permanently installed into normal development by this PR. No app-data clearing, native rebuild, explicit sign-in/out, hosted connection, database reset, schema deployment or merge occurred.

Keep the PR DRAFT. Remaining work is physical near-deadline/active composer coverage on separately controlled records and sufficient free disk space before another Android export. This report does not claim full Arena end-to-end or production readiness.
