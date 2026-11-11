# CURRENT_STATE — Latest Verified Snapshot

## 2026-11-11 — Pre-beta server remediation + F2 Storage closure: CANDIDATES VERIFIED, not deployed

F1 (`take` identity), **F2 (`57` deferred RPC signatures, `6` participant write fences, AND Storage upload/signed-upload/UPSERT/overwrite/TUS admission)**, and F3 (`start_clash` retirement) are **FIXED in tested disposable candidates** (`20261111120000`–`20261111130000`), not deployed to any target database. **F4 remains PARTIAL**: fixtures are excluded from raw/RPC reads; public expired-history visibility stays deliberately unresolved by owner decision.

Verified in fresh disposable PostgreSQL 17.11 (`7706820486069211172`) + `storage-api:v1.79.36` (subsequently torn down cleanly): **14/14 strict pgTAP suites (`601/601` assertions incl. `beta_storage_admission.pgtap.sql` `33/33`)**, **39/39 genuine Storage HTTP checks**, **3/3 PostgreSQL multi-session lock races**, `npm run typecheck` **PASS**, `npm test` **`1,542/1,542`**, `test:duel` **`29/29`**, `test:duel:render` **`22+28`**, `test:arena-navigation` **`11/11`**, `test:arena-acceptance` **`206/206`**, and EAS archive **`723` files** (`9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f`). Accepted `clash-live-b4-20261101-db` (`7703813712308420644`: `9/9/9/9/7/3`, `0` media/storage rows, `5` original Storage policies untouched) and Codex's `clash-beta-security-20261111` remain preserved. Report: [BETA_STORAGE_ADMISSION_20261111.md](../evidence/release-readiness/BETA_STORAGE_ADMISSION_20261111.md). Live Edge Runtime containers & staging/prod deployment remain **NOT TESTED / NOT AUTHORIZED**; managed deployment requires `supabase_admin` ownership over `storage.objects`.

**Prior pass (historical snapshot retained below):**

## 2026-11-11 — Pre-beta server remediation: PARTIAL, not deployed

F1 Take identity and F3 legacy start_clash are **FIXED in a tested disposable candidate**, not on the accepted database. F2 is **PARTIAL**: 57 exact RPC signatures and implicit membership writes are gated, but Storage's own-namespace upload policy still requires a narrow existing-upload admission correction. F4 is **PARTIAL**: fixtures are excluded from raw/RPC reads; the owner explicitly left public expired-history semantics undecided. Do not silently make expired public history private.

Executed: **568/568 SQL assertions**, **4/4 independent-session lock races**, **1,542/1,542 npm tests**, TypeScript PASS, navigation 11/11, offline Arena harness 206/206, Duel payload 29/29 and render 22+28. EAS **723 paths**, unchanged digest `9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f`. Logs: `.expo/beta-security-remediation-20261111/`; report: [BETA_SECURITY_REMEDIATION_20261111.md](../evidence/release-readiness/BETA_SECURITY_REMEDIATION_20261111.md).

Accepted nine-duel target was read-only for schema/catalogue inspection: 479 function definitions/ACLs, 118 public policies, three Take triggers and 112 ledger rows unchanged. No live service, credential, device, settlement or deployment operation. Historical rows were not rewritten. Fresh disposable `clash-beta-security-20261111` uses network none, no ports/volumes and tmpfs; retain it and failure evidence, do not automatically stop/reset it.

**Next engineering task:** reconcile effective Storage INSERT/UPDATE/UPSERT and signed-upload admission with existing authorized upload continuation, add real-role/Storage regressions, then review the four migration candidates. **Owner decisions/approval:** historical visibility; separately identified deployment/staging E2E and exact disposable disposal. No public beta approval is implied. Existing native Duel #9 PASS and optional duplicate API probe NOT TESTED remain unchanged.


**Snapshot updated:** `2026-11-11T05:56:17.3072134Z` (UTC).

---

## 1. Repository baseline

| Fact | Value | How to re-check |
|---|---|---|
| Repository root | `<REPO_ROOT>` | `git rev-parse --show-toplevel` |
| Branch | `arena-ui-review` | `git rev-parse --abbrev-ref HEAD` |
| HEAD | `2b898748a48e317ac5737da62c7a964f50aca2a8` (`feat(live): connect audience reads and harden session recovery`) | `git rev-parse HEAD` |
| Working tree | **Dirty, intentionally** (`.clinerules` / pre-existing UI & backend changes + A50 automation fixes) | `git status --short` |
| Index | Empty (`git diff --cached --name-only` is empty) | `git diff --cached --stat` |

The dirty tree is prior work and prior evidence. See [`SAFETY.md`](SAFETY.md) §7 — do not clean it.

## 2. Latest verified state — Active Arena on Samsung A50

Source: Duel #9 run `afbeea8e-0a94-40a9-8106-657fbdf94315` (`cl_f30fafaf12143a92`, `ar_a994878035b35d24`, `take_f878b22750b963e2`, challenge `5575117a-a9b4-4764-9d29-798591d86277`), [DUEL9_A50_COMPLETE_ACCEPTANCE.md](../evidence/ui-completion/DUEL9_A50_COMPLETE_ACCEPTANCE.md), and latest [HANDOFF.md](HANDOFF.md).

**Decision: PASS — Native Samsung A50 active-Arena acceptance milestone COMPLETE on bounded Duel #9 (optional duplicate-ballot API probe NOT TESTED / NOT AUTHORIZED).**

| Area | Result |
|---|---|
| Owner auth & Broadcast clarification receipts | PASS (`0917208e...` valid `11:31:24Z`–`15:31:24Z`; supplementary `76c3a82f...` observed `12:00:00.370Z`, `broadcastBudgetAuthorized: { D_to_A: 1 }`) |
| Manifest rebind, session refresh, preview & preflight | PASS (manifest `fa1368e8...`, `72` sources; Actor C SM-A505F refreshed; Hermes `{ dev: true, frozen: true, countdownPaused: true, envVal: '1' }`; on-device `JUDGING` & `SETTLED` previews passed; `execution-preflight.cjs` exit `0`) |
| Ephemeral Broadcast, Duel #9 create, gateway `55626`, Watch D & native A50 Watch C | PASS (`broadcast.result.json` `PASS`; Actors C & D admitted spectators; Hermes verified `OPEN` / `spectator`) |
| Natural `OPEN` & `FINAL` arguments + bounded Crowd | PASS (`4` official messages, `4` bounded Crowd messages across C native + D API) |
| Natural `JUDGING` ballots + locked-in UI proof | PASS (Actor D API Side B `204`; Actor C single genuine A50 Side A tap; `device-06-judging-voted.xml` `Your ballot is recorded` / `controlState: "absent"`; `2` `public.judgements` rows by `juror_id`, `actorCRowCount: 1`) |
| Duplicate-ballot API probe | NOT TESTED (explicitly not authorized for Duel #9 §5) |
| Natural `CLOSED` settlement, idempotency & positive A50 `SETTLED` PNG/XML | PASS (`settle-first` / `settle-idempotency` HTTP `200`/`200`; `DRAW` `jury_size: 2`; rewards `+15` rep; `device-07-closed-settled.png` `198044` B `1080x2340` + `XML7` IDs verified) |
| Post-run automated suites & `typecheck` | PASS (`npm run typecheck` exit `0`; 7 Arena guard/contract suites `35/35`; `npm run test:arena-acceptance` `206/206`; `npm test` `1,456/1,456` [`835`+`556`+`65`]) |

## 3. Historical fixtures & Duel #9 state (`9` DB duels total; `8` prior preserved bit-for-bit)

| Fixture Group | State | Note |
|---|---|---|
| Prior 8 duels (Runs #1–#8, through `cl_c9d0d18afb844cf7`) | Verified bit-for-bit identical (`sha256: 2e1b3b161a56592d5564fb81a6dc472a0aa1180ce64b9b806e262434c5d48b96`, `exactMatch: true`) | Verified both inline in runner and via standalone post-run read-only PostgreSQL check against `historical-baseline.json`. Never modify. |
| Duel #9 (`cl_f30fafaf12143a92`, `ar_a994878035b35d24`, `take_f878b22750b963e2`) | Stored `settled` / `SETTLED`, verdict `DRAW`, `4` participants, `4` official msgs, `4` crowd msgs, `2` ballots, `1` verdict, `2` reward rows | Completed canonical A50 acceptance duel (`totals: { takes: 9, challenges: 9, clashes: 9, rooms: 9, judgements: 7, verdicts: 3 }`). |

## 4. Remaining caveats (non-blocking for Duel #9)

1. **Duplicate-ballot API probe:** Left `NOT TESTED` by explicit owner exclusion (§5) after verifying `actorCRowCount: 1` and locked-in UI `controlState: "absent"`.
2. **Legacy diagnostic script outside live runner:** `scripts/verify-device-route-navigation.cjs` (not invoked by `run-live-arena-acceptance.cjs`) retains hardcoded `adbTap(100, 141)`.

## 5. Environment state recorded at acceptance close (not rechecked here)

Docker isolation backend (`26192`: ports `55622..55625`) remains running (`system: 7703813712308420644`); host Metro (`8081`), Router (`55621`), and Gateway (`55626`) are stopped cleanly (`0` `LISTENING` sockets).

## 6. Owner closure and product handoff - 2026-11-10

The owner explicitly closed Arena native acceptance and directed product planning. Preserve all nine duels, including earlier partial fixtures; preserve the accepted runner, security receipts and evidence. **No further acceptance duel is authorized or needed for this handoff.** Optional duplicate-ballot API probe stays NOT TESTED.

This closure read the retained two-ballot snapshot, locked-in XML, completion log and final A50 screenshot; verified unchanged verdict/reward arrays across recorded idempotency snapshots; and verified all **72** then-current manifest-bound source hashes against accepted manifest `fa1368e857dbfc054a638e81a817a7b46734dddaa21a4c52b9dc7b8489800ad1`. Final PNG SHA-256 remains `32b275fdb0b33cfd898c0d676933e21c518e230d50f28fea3853e11a413e9d82`.

An additive private preservation inventory at `.expo/arena-product-closure-20261110/accepted-baseline.json` pins 143 accepted evidence/configuration/source files. This is a documentary freeze, not a Git commit or a runtime/database lock. No database, Auth, gateway, service or device operation was performed during closure; earlier live preservation results are inherited from the accepted run, not newly re-executed.

## 7. Canonical challenge entry implemented locally - 2026-11-10

The owner authorized MVP1 source implementation. Take and own-comment entry now share the canonical composer/API; recipient decisions use Challenge Inbox, with server-confirmed matching invitation/Room navigation. The legacy comment mode-sheet/start_clash creation path is no longer reachable from app/components. Existing comments and legacy history navigation remain. Account/focus epochs, duplicate-action guards (including confirmed navigation and reentry), pending/failure copy and fresh full-window eligibility are covered by focused tests. Backend admission and releaseScope are unchanged.

**PASS offline:** TypeScript; npm test 1,468/1,468 (835 + 568 + 65); focused 64/64; navigation 11/11; Inbox 18/18; Arena acceptance harness 206/206; Duel payload 29/29, renders 22 + 28. Evidence: .expo/canonical-challenge-mvp1-20261110/verification-summary.json and command logs. Initial new-test mock/copy-assertion failures were corrected and retained. A queued ACCEPT callback reproduced a real duplicate-navigation race; navigation reservation/focus epochs corrected it, and the final full rerun passed. No production assertion was bypassed. No C3 R5 timeout recurred.

**Preservation:** Original manifest fa1368e8... and accepted run artifacts were not edited. Two manifest-bound working sources (app/take/[takeId].tsx and services/arenaChallengeService.ts) intentionally evolved; their accepted original bytes are saved under .expo/canonical-challenge-mvp1-20261110/originals/. The historical manifest is not a current-source acceptance claim. All nine database fixtures remain untouched; no live DB/device/service operation was performed or reverified. Optional duplicate-ballot API probe stays NOT TESTED.

EAS inventory remains 720 paths, SHA-256 09a6f777932211f95a2fc112ae679afc4ab51c6e49f539451b9f737a99468504; runtime path delta zero and archive rules unchanged. New challenge routing on A50 and deployed legacy-RPC retirement are NOT TESTED. Legacy server RPC remains outside this frontend-only change. Production readiness remains separate. MVP2 was subsequently authorized and implemented below; its results are separate from the historical native acceptance.

## 8. Recoverable onboarding implemented locally - 2026-11-10

**PASS offline:** Existing preferences editor/gate now supports read/save Retry, account-scoped Continue without saving, Android Back dismissal and reentry through Profile -> Edit your interests. Local drafts survive failures and retries; saved/general-feed/unsaved states are distinct. Retry checks the latest server revision, confirms an already committed save without another write, and preserves general-feed intent. Account changes, Exit/unmount and completed submissions invalidate stale callbacks. A blurred Interests route cannot pop another foreground screen; editing remains usable after a confirmed background save. No redirect or preference-read loop is introduced for completed users.

Successful initial completion presents a real caller-scoped public Take, or honest empty/error alternatives (Inbox and prior context). app/interests.tsx reuses this handoff only when finishing incomplete preferences; ordinary edits return normally. Error and save controls scroll while onboarding Exit remains reachable. Existing Auth, interest SQL/revision contracts and admission policy are unchanged.

**Executed:** TypeScript PASS; npm test 1,487/1,487 (835 + 587 + 65); onboarding 19/19; combined onboarding/challenge regressions 41/41; interest client 12/12; navigation 11/11; offline Arena harness 206/206; Duel 29/29 and renders 22 + 28. Evidence: .expo/recoverable-onboarding-mvp2-20261110/verification-summary.json and command logs. Retained failing reproductions cover queued completion, completed-account route refetch, general-feed Retry intent and background navigation/editability; corrected tests and final full suite pass. No C3 R5 timeout observed.

**Packaging:** EAS dependency/private-path checks PASS, 722 files, SHA-256 8a183cadd11e775cd6b5879f5c3a535830d5cad8935b784f6e986169d33be4af. Exactly two new runtime modules: components/onboarding/useArenaInterestEditor.ts and components/onboarding/OnboardingNextStep.tsx. No dependency installation.

**Preservation / limits:** Canonical challenge-entry production/test sources, accepted manifests and run evidence remain unchanged from the task start; prior MVP1 accepted-source backups remain intact. No database, Auth, gateway, Metro, device or live fixture operation occurred. All nine duels are untouched, not freshly queried. New native behavior and real persistence remain NOT TESTED; A50 Back/scrolling/enlarged-text/reentry smoke is needed separately. Drafts are not persisted after Exit/restart; an in-flight save may still complete, and the UI does not claim cancellation or false completion. Native Arena milestone remains COMPLETE/PASS; optional duplicate-ballot probe remains NOT TESTED.

**Next at that point:** MVP3 was subsequently authorized and implemented below. No additional acceptance duel is needed.

## 9. Capability-aware discovery implemented locally - 2026-11-10

Vault Create/publish/new creator launchers now reflect existing deferred policy before a tap; existing readers, history, metadata management and terminal operations remain. Service discovery reads View details, Profile Vault navigation preserves its stack/creator identity, and local demos remain gated/explicit. Vault discovery rejects stale account/focus requests, deduplicates read refresh, clears cached cards on recognized permission errors and supplies real Takes/Inbox alternatives. Full classifications and exact 27-path inventory: [TASKS MVP3](TASKS.md).

**Offline PASS:** TypeScript; npm test 1,514/1,514, including 27 new behavior tests; navigation 11, Arena harness 206, Duel payload 29 and renders 22 + 28. Logs .expo/capability-discovery-mvp3-20261110/. Archive 722 files, unchanged SHA-256 8a183cadd11e775cd6b5879f5c3a535830d5cad8935b784f6e986169d33be4af, runtime path delta zero.

**Preservation / limits:** No releaseScope, canonical challenge/onboarding source, SQL, accepted manifest/evidence, service, device or live data change. No new duel or commit. Client guards are not backend enforcement. Native UI/Back/TalkBack/large-text and live entitlement changes NOT TESTED; server deployment remains UNVERIFIED. Inherited Duel #9 COMPLETE remains separate. Next: separately approved read-only connected-product smoke, no new fixture.

---

## Consolidated A50 MVP Smoke (`2026-11-10`) — Partial Hardware Baseline

- **Evidence:** [`docs/evidence/mvp-a50-smoke-20261110/REPORT.md`](../evidence/mvp-a50-smoke-20261110/REPORT.md) (`00`–`29b` PNG/XML, [`mock-rpc-audit.ndjson`](../evidence/mvp-a50-smoke-20261110/mock-rpc-audit.ndjson)).
- **Coverage split:** Live read-only `55321` (`@local_dev`, 22 expired takes, 0 active, 0 vaults) covered Profile/Interests/Archived Take/Vault empty & unavailable routes (one accidental keep-alive `save_my_arena_interests` incremented `@local_dev` revision `1 -> 2` during `adb reverse --remove`); local HTTP mock `55699` covered active Challenge composer/Inbox/double-tap dedupe/error retry and populated Vault/Explore discovery (`start_clash = 0`).
- **Preservation:** Isolated `clash-live-b4-20261101` remained completely untouched (`clashes=9`, `rooms=9`, `takes=9`, `judgements=7`); offline regressions re-verified green (`typecheck` 0 errors, `npm test` 1,514/1,514, MVP focused 55/55, navigation 11/11, Arena acceptance 206/206).
- **Opened A50 UI/accessibility defects (no source edits made):**
  1. `InterestOnboardingGate.tsx` uses iOS-only `accessibilityViewIsModal`, leaking Home/tab dock focus behind onboarding on Android (`22-mock-onboarding-gate.xml`).
  2. Vault bottom dock obscures `Open Arena` on `app/(vault)/profile.tsx` (`08c`) and bottom empty/featured Vault lines at scroll `0` (`07`, `26`); `app/(vault)/profile.tsx` uses `selectViewerTakes` and omits expired local takes shown on Arena Profile.
  3. `ServiceDetail.tsx` renders `"online ? Request"` (`26b`); `TakeChallenges.tsx` duplicates `P0006` error copy on composer error (`24c`); Explore right-edge mode rail overlaps right mosaic card text (`27`); unlabeled thumbnail/product card buttons (`26b3`, `26d1`); mid-session `font_scale 1.5` clips RN `<Text>` until cold Activity restart (`15c` vs clean `16b`–`16d`, `29b`).

## A50 MVP smoke corrections implemented locally - 2026-11-10

Source-only fixes: native onboarding Modal/focus/Back, Vault scene dock clearance and scrollable status states, one challenge eligibility error, Service separator, reserved/clamped Explore rail, named Vault thumbnails, and authorized historical Take reads in Vault Profile. Exact 31-path manifest and per-defect grades in [TASKS](TASKS.md). No changes to releaseScope, backend contracts, native files or accepted Arena evidence.

**PASS offline:** npm run typecheck; full npm test 1,529 (835 + 629 + 65), new behavioral regressions 15, combined focused 121, navigation 11, Arena harness 206. Logs .expo/mvp-a50-fixes-20261110/; initial failures preserved. Archive 723, SHA-256 9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f; only components/vault/VaultProfileTakes.tsx newly admitted.

**PARTIAL native / font scale:** No after-device run or screenshot. Node tests do not establish TalkBack focus trapping/return or physical geometry. Existing smoke reports cold 1.5-scale launch works, mid-session scale change clips; source-only cause/fix not proven. No automatic restart/remount or font-scaling suppression. Next: separately bounded synthetic A50 accessibility/layout check, no preferences/challenge writes and no additional duel. Duel #9 COMPLETE remains inherited.

## A50 MVP native verification ? 2026-11-11

**PARTIAL** ([report and fresh device evidence](../evidence/mvp-a50-native-20261111/REPORT.md)). Latest working source loaded in existing debug client with private in-memory SDK/storage substitutions and loopback-only mock; no real account, backend, DB or Arena execution. PASS observed dock/scroll/history, collapsed/fallback rail geometry, mocked single P0006, composer Back and Service separator. Full TalkBack focus containment/return and exact spoken labels remain unverified. Heading overlaps status bar; mid-session 1?1.5 clipping reproduced, cold 1.5 restores complete text. No production fix was attempted in this verification phase.

Offline PASS: full 1,529; focused 70 and Vault/accessibility 29; navigation 11; offline Arena 206; typecheck 0; archive 723 unchanged SHA 9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f. Original font 1.0, TalkBack-off/display settings and empty reverse list restored; owned test services stopped. All 4,390 baseline files unchanged before documentation updates. Duel #9 remains inherited COMPLETE; no additional duel or database recount. Automatic approval review blocked the last combined TalkBack/cold-launch retest; cleanup succeeded.

## A50 accessibility & layout closure — 2026-11-11

**PASS (loopback mock) / PARTIAL (TalkBack manual TTS/swipe, mid-session font clipping OPEN)** ([closure report](../evidence/mvp-a50-closure-20261111/REPORT.md)):
- Fixed onboarding `<Modal>` Android status-bar overlap via `statusBarTranslucent` + `useSafeAreaInsets()` container insets (`InterestOnboardingGate.tsx`), `safeArea={false}` prop (`ArenaInterestEditor.tsx`, `OnboardingNextStep.tsx`), and scrollable status fallback (`Arena preferences` now `[0,114]` below `83px` status bar at `1.0x` and `1.5x`).
- Physical SM-A505F loopback-mock PASS (`1.0x` and cold `1.5x`): Onboarding error/Retry/NextStep/Back, Vault dock clearance & scrolled empty-profile `Open Arena` tap back to Arena Home, Studio/Collections/History/Creator Vault bottom, and Explore collapsed/expanded `128dp` rail + `India` `WorldCountryPanel` with clamped `52dp` rail.
- TalkBack (`TalkBackService` bound): modal window isolation (`0` background leaks), `TYPE_VIEW_ACCESSIBILITY_FOCUSED` / `TYPE_VIEW_FOCUSED` on `onShow`, full DPAD wrap traversal, error Retry, Back restoration, and Creator Vault contextual labels verified live; spoken TTS audio and physical 1-finger Touch Exploration swipe gestures remain **manual** (`PARTIAL`).
- Mid-session `1.0x -> 1.5x` font-scale change reproduces horizontal/vertical text clipping (`12-mid-session-font15-repro.png`); kept **OPEN** without Activity auto-restart.
- Offline PASS after edits: `typecheck` `0`; `npm test` `1,531/1,531` (`835+631+65`); focused `72/72`; accessibility/products `29/29`; navigation `11/11` (hook bridge); offline Arena `206/206`; archive `723` files (`9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f`). Read-only `clash-live-b4-20261101-db` counts `9/9/9/7`; device restored and owned ports `8081`/`55699` closed.

---

## Beta Readiness: Staging Integration & Server Authorization Audit (`2026-11-11`)

- **Report & Bounded Staging Plan:** [`docs/evidence/release-readiness/BETA_STAGING_AUTHORIZATION_AUDIT_20261111.md`](../evidence/release-readiness/BETA_STAGING_AUTHORIZATION_AUDIT_20261111.md).
- **Isolated Preflight (`clash-live-b4-20261101`):** `system_identifier = 7703813712308420644` (`55622` DB, `55623` Auth, `55624` REST, `55625` Realtime; no Kong/Storage/Edge container); `112/114` migrations applied (`20261028120000_meet_cancel_search.sql` & `20261028210000_meet_new_admission_gate.sql` unapplied); active `pg_cron` `* * * * * select public.run_maintenance(500)`; `storage.buckets` (`public-media public=t`, `private-media public=f`); baseline preserved untouched (`takes=9`, `clashes=9`, `arena_rooms=9`, `arena_challenges=9`, `judgements=7`, `verdicts=3`, `arena_interest_preferences=0`, `creator_vaults=0`, `vault_drops=0`).
- **Confirmed Server Findings:** Canonical challenge lifecycle/Inbox, `PT409` interests, Room role/judgement checks, and `can_access_vault_drop`/Edge JWT gating are strongly enforced server-side. Pre-beta blockers identified in source + live DB metadata: **F1 [HIGH]** `takes.text` lacks post-challenge/duel `UPDATE` immutability trigger (`author_id` only); **F2 [HIGH]** deferred Vault/Creator/Commerce/Groups/AI/Play/World/Media RPCs grant `EXECUTE TO authenticated` (`utils/releaseScope.ts` is client-only); **F3 [MED/HIGH]** legacy `start_clash` remains executable by `authenticated`; **F4 [MED]** raw `takes` `SELECT` allows `anon` and `is_runtime_fixture` rows.
- **Offline Regressions & Checks (`PASS`):** Added [`scripts/beta-security-audit.test.cjs`](../../scripts/beta-security-audit.test.cjs) (`5/5` in `package.json`); `npm run typecheck` `0`; `npm test` `1,536/1,536` (`835+636+65`, `0` skipped); `npm run test:arena-navigation` `11/11`; `npm run test:arena-acceptance` `206/206`; `node scripts/eas-archive-check.cjs` `723` files (`9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f`). Live staging integration & Edge signing remain `NOT TESTED` pending owner authorization.
