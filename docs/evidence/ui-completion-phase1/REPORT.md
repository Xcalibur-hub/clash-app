# UI completion — Phase 1

25 October 2026. Branch **arena-ui-review**. Verified starting HEAD **d8d5e752fa353a2b74420920c1251db00dc25a61**; tracked/staged working tree initially clean. Read `.clinerules`, the spec and the UI completion audit. This phase implements only the five requested UI fixes.

**Code/offline validation: PASS. Native acceptance: NOT TESTED.** One scoped local implementation commit contains this report; its exact SHA is supplied in the completion message. No push, merge or deployment.

## Implemented

| Area | Result | Actual change |
|---|---|---|
| Settings | PASS, code/tests | Sidebar closes and navigates to `/settings` with an active state. Minimal themed hub offers the existing profile/sign-in destination, persisted AppearanceRow, World privacy information destination and expandable local usage help. Back has an Arena/Vault fallback. No invented preference, help endpoint, legal policy or destructive account action. |
| Products | PASS, code/tests | Removed enabled no-op Included/Unavailable actions. Listings without delivery links show noninteractive availability text. Existing external store links remain real actions, with duplicate protection, busy state and a safe retry message when opening fails. Product loading failures are handled rather than becoming unhandled rejections. |
| Shared Vault button | PASS, code/tests | Backward-compatible optional `disabled`/`busy`, matching accessibility state, spinner, guarded callback/haptic, 44dp minimum height and scalable label. Missing callbacks are disabled automatically. Existing callers retain their normal press behavior. |
| Vault Profile | PASS, code/tests | Wins uses existing `fetchProfileClashes` / `profile_clash_list` data; only settled rows with a verdict and `outcome === 'won'` render. A failed request does not claim zero wins. Guest/loading/account changes have explicit scoped states. Take cards open `/take/[id]`; historical win rows preserve `/clash/[takeId]`. |
| Explore Live | PASS, code/tests | Live has its own bounded 20-item read and explicit loading, successful empty, error/retry, denied and configuration-unavailable states. World/For You requests no longer control Live success. For You's existing Live shelf still consumes the same independent Live result. Live retry does not refetch the other feeds or change the active mode. |
| Play | PASS, code/tests | Inline error retry uses the same existing fetch operation, retaining the selected Challenges/Treasure tab. No automatic retry or substitute data. |
| Collections | PASS, code/tests | Retry on fetch failure without route replacement. Loading, null/unavailable record, explicit permission denial and transport failure are distinct. Collection/account changes discard old results. Existing episode navigation/subscription information remains intact. |

There is **no product downloadable-file field or delivery operation** in the existing product contract. A cover is not a downloadable entitlement. No free-product download, checkout, purchase or access grant was invented. An external URL remains the only supported product open action.

The shared `useRetryableRead` is a small UI read lifecycle: one latest result, explicit retry, cancellation of late state writes, and scope/load/attempt identity checks. It does not add a cache, scheduler, RPC, transport retry, or mutation. Error feedback uses safe copy rather than raw server/OS errors. Null records may mean missing **or not visible** under existing access rules; the UI deliberately does not claim to distinguish those cases. Explicit permission errors are labeled separately.

## Verification actually executed

| Command | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0 |
| `node --test scripts/ui-completion-phase1.test.cjs scripts/ui-completion-products.test.cjs` | PASS, **28/28**, zero failed/skipped, exit 0 |
| Final `npm.cmd test` | PASS, **806 unit + 201 follow-up = 1,007 tests**, zero failed/skipped, exit 0 |
| `git diff --check` | PASS |

The new suites are included in the standard `npm test` command. The 28 focused tests are included in the 1,007 total, not an additional 28.

Tests execute production hooks/components/callbacks with the real React effect/state reconciler and mocked service/native boundaries. They cover deferred account/unmount results, explicit retry, failure classification, successful-empty gating, actual card destinations, retained Play filters, Collection errors/identity changes, authorized Wins selection, historical versus Take destinations, Settings/appearance/Back, product status/open failure/duplicate presses, and button disabled/busy/haptic/scaling behavior.

Initial development checks found one TypeScript reference to the old Live state in the For You shelf; it now uses the independent Live read. The first focused test run also exposed missing theme/notice mocks and a test selector mismatch. A subsequent run was stopped because the mock service proxy returned a new function on every access, unlike actual module exports; stabilizing that mock removed the test-only effect loop. Final checks above passed without weakening production behavior or assertions.

Local test outputs remain ignored under `.expo/ui-completion-phase1-20261025/` (`typecheck.log`, `focused-final.log`, `npm-test-final.log`). No raw runtime evidence or private device files are committed.

## Scope

Existing source/config paths changed:

- `app/(tabs)/explore.tsx`
- `app/(vault)/profile.tsx`
- `components/navigation/AppSidebar.tsx`
- `components/play/PlayHomePanel.tsx`
- `components/vault/CollectionWorld.tsx`
- `components/vault/ProductDetail.tsx`
- `components/vault/VaultActionButton.tsx`
- `package.json` — test command only; no dependency changes.

New source/test paths:

- `app/settings.tsx`
- `components/explore/ExploreLivePanel.tsx`
- `components/shared/ReadFeedback.tsx`
- `components/vault/ProductAction.tsx`
- `components/vault/VaultBackButton.tsx`
- `components/vault/VaultWins.tsx`
- `hooks/useRetryableRead.ts`
- `scripts/ui-completion-harness.cjs`
- `scripts/ui-completion-phase1.test.cjs`
- `scripts/ui-completion-products.test.cjs`

The shared 44dp Vault Back button replaces identical local Back controls in the two touched detail screens. New presentation components are each below 150 lines; existing larger screens receive scoped changes rather than an unrelated rewrite.

## Native and remaining limits

- **No new device acceptance or screenshots.** Theme-token, touch-target-property and callback tests are controlled checks, not native Yoga geometry, TalkBack, pixel contrast, keyboard or screenshot evidence.
- No phone, Metro or backend configuration was changed. No new Metro/Expo server was started: source/offline checks were kept separate from existing runtime infrastructure. No native rebuild was performed.
- A50 follow-up should verify Settings/appearance/Back, Product status versus external open, authenticated Wins/Take navigation, Live failure/retry and selected Play/Collection context. It needs a safely verified bundle/backend route before real-data interactions.
- Existing authorized profile history defines what Wins can display; this UI does not claim a complete lifetime record. Live remains the existing bounded feed, not a new global ranking service.
- Settings links to existing account and safety surfaces; it does not implement notification preferences, blocked-account management, account deletion, a support service or a new privacy policy.
- Accepted Meet TEXT, authentication, services, billing, database/schema/migrations, fixtures and infrastructure are unchanged. Broader UI completion and production readiness are not claimed.

## Preservation

All **1,682 original untracked files** (including the earlier audit report) are preserved. Baseline ordered status SHA-256: `ca6386bdfab4bf3f20fb98d697b4e9c2820d3b4fb06df36d3124dbb5fd1e8cb4`; content-manifest SHA-256: `906909025230db037ecdd68ac71681370c6cc1b7c6e4ca08a0c6622b07dc290c`. Only explicitly listed implementation/test paths and this report are staged for the single local commit. No private screenshots, credentials, device logs or unrelated files belong to that commit.

**GO for this scoped local UI checkpoint. Native visual acceptance remains open. Stop after the local commit; no next phase is initiated.**
