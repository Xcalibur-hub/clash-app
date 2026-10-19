# Arena Engagement V1 — Step 3 return visits

Baseline: `arena-ui-review`, local and remote `43d703bb2b10779ceed1f4bbd3d048d0b36c83ea`; tracked tree clean. Existing untracked Crew/development/evidence files are preserved.

## Capability audit before implementation

| Capability | Classification | Actual contract / source and limitation |
| --- | --- | --- |
| Own fighter history | SUPPORTED | `services/profileService.ts:fetchProfileClashes` → `profile_clash_list`; `supabase/migrations/20260928110000_blind_clash.sql` limits to 30 newest Clashes as author/challenger. This is a meaningful production return path independent of discovery. Revalidate source and Room visibility before presentation/navigation. |
| Current lifecycle and official results | SUPPORTED | `clashEngineService.fetchClashView`, `liveArenaService.fetchRoom`, `utils/duelPresentation.ts`, `DuelRoomOutcome.tsx`. Canonical Clash verdict remains authoritative; closed without verdict is settlement pending, not a fabricated winner. |
| Watched/followed-duel persistence | UNSUPPORTED | Watch establishes authorized Room membership; it is not an outcome subscription or complete watch journal. No subscription/reminder contract is available. No viewed Room will be labeled followed. |
| Complete spectator/juror participation history | PARTIAL | Existing notifications include some juror reputation events, and Room membership exists. Neither establishes a complete, privacy-safe activity journal. Implement fighter history only. |
| Followed fighters | PARTIAL | Step 2 `personalizedLiveDiscoveryService` supplies public authorized identities, phases and candidate-scoped follows. At most 60 mixed discovery records; never label it complete history. |
| Crew identity/membership | SUPPORTED | `arenaCrewService`: get/discover/listMyArenaCrews/listArenaCrewMembers and existing invitation/join RPCs. Preserve existing Groups surface and one-membership constraints. |
| Crew-linked duels / rivalries | UNSUPPORTED | No authorized explicit Crew↔canonical duel activity read contract in the reviewed services. Membership alone cannot establish duel affiliation. Do not infer it. |
| Notification inbox/read state | SUPPORTED | `notificationService.fetchNotifications` reads recipient-owned 50 newest rows; existing read/all-read operations and unread provider. Dock already exposes Activity. |
| Notification event coverage/delivery | PARTIAL | `clash_notify`/settlement writers send fighter result and some juror reputation rows. Challenge migration writes idempotent `challenge_received` (Take ID) and `challenge_accepted` (Room ID). No verified push/reminder delivery or all-cancellation guarantee. Reuse events without generating any. |
| Private-assist recognition for sender | UNSUPPORTED | `list_arena_private_assists` requires fighter/debater and returns no sender attribution; `PrivateAssist` omits sender identity. Publication creates a fighter-authored official contribution. No spectator-owned accepted/published ledger can be truthfully displayed. |
| Fighter assist inbox decision state | SUPPORTED | Existing recipient-only inbox exposes PENDING/ACCEPTED/REJECTED and publishedMessageId; leave this in the authorized Room panel. No rewards or public credit inferred. |
| Existing entry points | SUPPORTED | `app/(tabs)/notifications.tsx` Activity, ProfileScreen/ProfileLists own Clash history, Arena Live Results and Hall of Fame. Improve Activity rather than add a permanent tab. |

The 60-record discovery snapshot cannot establish complete participation, verdict or followed-fighter history. Own fighter history is separately bounded to 30 newest records and has no pagination cursor. Neither read can answer “since last action” because no reliable per-duel last-seen checkpoint exists. Use “recent Clashes”, explicit limits and current server state instead.

The current Activity component has no account-bound snapshot/error guard, and Clash notifications route through a raw detail helper. The minimal integration will isolate its reads by owner/generation, distinguish errors from emptiness and use the same caller-scoped Clash/Room resolution for canonical/legacy destinations. No notification types, trigger writers, push infrastructure, schema, authentication or rewards will change.

## Exact production contracts reused

1. `currentViewerProfileId` resolves the signed-in profile; `fetchProfileClashes(profile)`/`profile_clash_list` supplies at most 30 newest fighter relationships. This does not claim the user actually submitted an argument.
2. A narrow RLS-controlled `takes(id)` read excludes runtime fixtures from ordinary return discovery. Missing/filtered sources are omitted.
3. `fetchClashView(id)` revalidates caller/source visibility, identity reveal rules and actual fighter participation. Canonical entries additionally require matching `fetchRoom(roomId)` DUEL/Clash identity and a current fighter role for own history. Failed or revoked reads expose neither source title nor route.
4. `fetchPersonalizedLiveDiscovery` supplies the separate candidate-scoped followed-fighter snapshot. Its existing authorized payload now carries only the authoritative verdict winner enum needed to distinguish DRAW; no winner or reward is calculated. No raw BLIND relationship probing.
5. Existing recipient-owned notification reads (latest 50), mark-one/all-read operations, unread refresh and existing event types remain. Clash events resolve through the same checked canonical/legacy helper. Accepted-challenge Room IDs are read/checked before navigation. No events are created, scheduled or duplicated.
6. Existing canonical Room navigation retains `DuelRoomOutcome`/verdict/history presentation. Legacy Clashes retain `/clash/{takeId}`. No second outcome component, competition engine or settlement operation is introduced.

## Implemented experience

Activity now begins with **Back to your Clashes**, using local filters **Your Clashes** and **Followed fighters**, not another main navigation tab. The shared list shows three items initially, expands in groups of three within the bounded result, and gives each item one clear action. It distinguishes in progress, final arguments, judging, pending settlement, official result, official draw, cancellation, unavailable and unverified/error cases.

History and followed snapshots are separately labeled with their bounds. There is no “new since last seen” claim or watched-duel subscription. Opening an item performs another visibility check; duplicate taps are guarded. Revoked/unverifiable entries lose cached titles/routes rather than navigating by known ID. Focus, explicit refresh and account changes reload; obsolete generations cannot publish or navigate. Own history requires actual fighter authorization, not a local remembered Room.

The existing notification surface now scopes snapshots to the auth owner and request generation, hides stale rows immediately on account switching, distinguishes load failures from empty results, preserves read state on failed server updates, and guards repeated opens/all-read actions. Existing metadata/actor enrichment failure does not manufacture an actor. The existing unread provider now keys cached counts to the auth owner and rejects stale request generations, including direct signed-in account switches. Focus and successful read acknowledgements preserve its existing refresh semantics. Canonical Clash notifications no longer depend on the raw Clash detail read. Successful read updates refresh the existing unread provider. Notification titles still describe recorded events; current outcome/access comes from the checked destination, not the old event text.

No community-linked duels/rivalries, sender contribution recognition, watched persistence, new notifications, push, reminders, rewards, XP, badges, subscriptions or last-seen tracking were added. Existing Groups/invitation, Profile and private-assist features are unchanged. No backend, schema, RLS, authentication or engine modifications.

## Demo and review evidence

Existing development-only Demo Arena → Live → **Return visits demo** uses `ArenaReturnList`, the same production presentation. Explicit local controls switch fictional fighter history/followed activity and simulate an OPEN→SETTLED result arrival. Opening the item uses the existing scripted canonical-style Room and its shared official-result surface. Draw, cancellation and unavailable entries are included; unsupported watched/community/assist recognition is explained without fictional community relationships. All state/actions are in memory. Production service imports remain blocked by the existing demo renderer/guard; release demo exclusion is preserved.

**No new physical screenshots are available for Step 3.** The SM-A505F is connected/authorized, but the first accessible demo-entry target was absent and a fresh hierarchy contained zero CLASH nodes. A subsequent read-only window check confirmed CLASH was not foreground and the lockscreen was showing. An owner unlock/open request was sent; no response arrived during this verification. Automated tapping stopped without guessed coordinates, unlock attempts, ADB restart, permissions changes or clearing app data. No lockscreen/personal-data screenshot was captured.

Controlled rendering of the actual shared demo return surface passed at **dark/light × 320/360/430** (six renders, not native geometry or screenshot evidence). Actual device navigation, keyboard/safe-area behavior and outcome transition screenshots remain **BLOCKED / NOT TESTED** for this checkpoint. Prior Step 1/2 phone screenshots are historical evidence, not Step 3 verification.

The existing scoped restoration helper ran and reported original development preferences **byte-equal**, ADB reverses **exact** to the saved 8081/55321 baseline. Normal Metro PID 25432 remains on 8081; no duplicate Metro or backend was created. App authentication data was not cleared or changed explicitly.

## Executed tests

| Command/check | Actual result |
| --- | --- |
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run test:unit` | PASS: 500 tests / 126 suites, 0 failed/skipped, exit 0 |
| `node --test scripts/arena-return-visits.test.cjs scripts/personalized-live-discovery.test.cjs scripts/arena-spectator-check.test.cjs scripts/arena-demo-check.test.cjs scripts/arena-live-v2-check.test.cjs components/arena/ArenaVisualCompletion.test.cjs scripts/take-challenge-check.test.cjs` | PASS: 112 tests, 0 failed/skipped, exit 0 |
| Shared actual demo return render, dark/light at 320/360/430 | PASS: six controlled renders; no production service imports |
| `git diff --check` | PASS after removing one trailing blank line |
| Physical A50 return loop | BLOCKED: lockscreen, CLASH not foreground, empty app hierarchy |

Eighteen new tests cover all authoritative outcome states, duplicate/conflicting versions, independent history bounds and fixture projection, own fighter authorization, known-ID mismatches, canonical/legacy routes, revoked/error metadata suppression, account/focus races, candidate-scoped BLIND-safe followed activity, actual return UI loading/error/empty states, duplicate opens, access revocation on press, bounded-coverage disclosure, notification account isolation, checked routing/read-update failure, out-of-order focus refresh denied notification acknowledgement and previous-account unread-badge races. Demo production-import separation is explicitly checked. A new asynchronous test initially asserted before its mocked guard chain had completed; using one event-loop turn to settle promises resolved the harness timing failure without changing assertions or production code.

These are **client and mocked transport contracts**, not proof of deployed SQL/RLS, installed migration state, notification delivery or real-account lifecycle. No SQL/pgTAP, Supabase CLI, database connections/changes, Docker, hosted project access, native rebuild, Expo Doctor or deployment occurred. No dependency/native configuration changed.

## Remaining limitations

- Own fighter history is the 30 newest source relationships by creation; it has no cursor and is not an exhaustive journal. Legacy transports may remain pending on slow networks; focus/generation/account guards suppress stale results, but no new cancellation protocol is introduced.
- Followed activity shares Step 2's 60-record mixed discovery window and enrichment cost; no complete followed-user archive is implied.
- Results update on focus/refresh, not a new subscription or push channel. There is no reliable last-seen timestamp to infer unseen changes.
- Removed/fixture-filtered source rows can be absent altogether; denied later details show generic unavailable/error entries without title/identity. Server destination permissions remain authoritative on every operation.
- True watched history, outcome subscriptions, community duel attribution and spectator-owned assist acceptance/publication credit require separately approved backend/product contracts.
- Real account/RLS/notification runtime checks and physical Android screenshots remain unverified. No production-readiness claim.

## Changed files / delivery

- `app/(tabs)/notifications.tsx`
- `store/NotificationUnreadProvider.tsx` (existing badge account isolation)
- `components/arena/ArenaReturnVisits.tsx` (new connected entry)
- `components/arena/ArenaReturnList.tsx` (new shared presentation)
- `services/arenaReturnVisitService.ts` (new read adapter/navigation resolver)
- `utils/arenaReturnVisits.ts` (new pure states/deduplication)
- `services/personalizedLiveDiscoveryService.ts` / `utils/personalizedLiveDiscovery.ts` (authorized verdict summary only)
- `components/dev/arenaDemo/DemoReturnVisits.tsx` (new local demo)
- `components/dev/arenaDemo/DemoLiveDiscovery.tsx` (existing local entry)
- `scripts/arena-return-visits.test.cjs` (new regressions)
- This report.

Commit intended files locally on `arena-ui-review` only. No push, merge, additional branch, worktree, project copy or database. Preserve all unrelated untracked files and local settings. Wait for review before publication.
