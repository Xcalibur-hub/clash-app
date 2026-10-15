# Arena Phase 3.2D — Native media and interaction sign-off

Date: 2026-10-15. Branch: `feat/arena-v2-editorial-ui`, starting HEAD `a7cc372`. PR #65 stays **DRAFT**; no merge, deployment or production change was performed. This pass reads `docs/ARENA_ANDROID_VISUAL_VERIFICATION_3_2C.md` and attempts to close its residual gaps. It does not redesign Arena or rewrite the Clash engine.

## Isolation and safety

Samsung `SM-A505F` (`RZ8M30DE9NL`), Android 11 (SDK 30), 1080x2340 @ 420 dpi, connected over USB. Existing `com.clash.v2.dev` debug build: **no native rebuild, no app-data wipe, no signing-in change**.

Disposable project `clash_p11bind_arena32d_20261015`: ten task-owned containers including the real Deno Edge Runtime (immutable `edge-runtime@sha256:ad45…`), dedicated volumes/network, PostgreSQL and gateway published on `127.0.0.1:57722/57721` only. **104/104 migrations** applied to that disposable database; accounts A/B/C created through the stack's own admin API. Scratch directory `.expo/arena32d-20261015` (git-ignored).

The quarantined hosted project `zrutlrhhvfcsmssjiijl` was never contacted. The shared local development stack (`supabase_*_clash`, gateway `55321`) was **not** reset, re-configured or used as the app backend. The two pre-existing ADB reverses (`8081`, `55321`) were preserved throughout.

Device baseline captured before and restored after: bundle host `localhost:8081` → task `8083` → **restored `8081`**; `stay_on_while_plugged_in` `0` → `1` → **restored `0`**; `font_scale` 1.1, animation scales 1.0 and `accessibility_enabled=0` were recorded and left unchanged.

## BLOCKER: the device is behind a secure lock screen

Every scenario that needs on-device interaction was blocked by the device's own lock screen. This is a physical-access blocker, and bypassing device security is deliberately out of scope.

| Observation | Evidence (adb) |
|---|---|
| Keyguard engaged | `isKeyguardShowing=true`, `deviceHasKeyguard=true` |
| Secure lock, not swipe | lock-screen node `text="Draw unlock pattern to open"`, plus `Unlock` and `Emergency call` |
| Display off | `Display Power: state=OFF` with `mDreamingLockscreen=true`, `mScreenOn=false` |
| Wake keys ineffective | `input keyevent 224` (WAKEUP) and `26` (POWER) both left `Display Power: state=OFF` |
| Display only lit by HOME | `input keyevent 3` → `Display Power: state=ON`; keyguard still showing |
| Keyguard cannot be dismissed from adb | `wm dismiss-keyguard` no effect; swipe-up no effect; focus stayed `NotificationShade` |
| Proximity not the cause | newest sensor event predates this session (10-13); battery `level 92`, `status 2` (charging), 33.1 °C |

**What this does and does not invalidate.** The app *did* launch and boot on the device against the isolated bundle before the device locked: the Metro log contains the app's own runtime output (`Require cycle…` warnings and `[clash:analytics] disabled (no EXPO_PUBLIC_POSTHOG_API_KEY)`), which proves the device reached the task bundle. Only *interaction* is blocked. No Arena UI screenshot could be captured, so none is presented; **no screenshot from this pass may be read as native-media verification.** Device screenshots are not committed: they showed only the lock screen and are not Arena evidence.

## Scenario matrix

| # | Scenario | Status | Evidence / boundary |
|---|---|---|---|
| 3.2C-1 | Acceptance routing → canonical Room | **PARTIAL** | Fix verified in `components/arena/TakeChallenges.tsx`: `linkedRoomAfterAccept` imported (10) and used (157); `setConfirmed` (160) is **no longer behind** the `focused.current` guard, which now only gates local optimistic cleanup (159, 174, 178); navigation is `router.replace(/arena/room/…)` (128); the remount path no longer clears `confirmed` (comment at 111). Unit tests 3/3. Native reproduction of the original "stayed on Take" symptom **BLOCKED**. |
| 3.2C-2 | Fighter B compose/submit/view; spectators blocked from fighter actions | **BLOCKED** (native) / PARTIAL (API) | Canonical E2E drives A and B official submission and spectator authorization through the real gateway (15/15). On-device composer interaction not performed. |
| 3.2C-3 | Private assists: accept ≠ publish, reject, explicit publish, idempotent retry | **PARTIAL** | **PASS at authenticated API/E2E level**: pgTAP `090_canonical_private_assists` 47/47, `091_private_assist_media_target` 15/15; canonical E2E asserts accept leaves the assist unpublished, recipient-only signing, block revokes signing, and that explicit publication creates a fighter-owned public copy leaving the private original unchanged. Native assist panel **BLOCKED** (3.2B's native PENDING→ACCEPTED inbox capture remains the only on-device assist evidence). |
| 3.2C-4 | Native media picker/upload/playback/GIF | **BLOCKED** (native) / PASS (HTTP + signer) | Real Deno signer authorized the selected fighter (`actual_deno: true`); real MP4 upload, completion, official submission and **byte-identical HTTP retrieval** asserted by the canonical E2E, which itself states "native playback not asserted". Gallery/camera picker, on-device decode/playback and GIF insertion **not verified**. |
| 3.2C-5 | UI edge cases (keyboard, scrolling, error/retry, themes, small screens, a11y announcements, reduced motion) | **BLOCKED** | Nothing interactive could be exercised. Baselines recorded only (font scale 1.1, animation scales 1.0, TalkBack off, reduced-motion never set). |
| 3.2C-6 | Regression matrix | **PASS** | See the executed table below. |
| 3.2D-1 | Native media end-to-end (gallery image, camera, video, GIF, assist attachment, cancellation, permission denial, upload failure, retry) | **BLOCKED** | Cannot open a picker, deny a permission or observe playback while the device is locked. |
| 3.2D-2 | Private assist panel physical interactions | **BLOCKED** | Same blocker. |
| 3.2D-3 | Watch Clash flaky button | **NOT TESTED / BLOCKED** | The automation-timing-versus-navigation question cannot be answered without tapping on the device. 3.2C's workaround (authenticated `watch_arena_room` RPC plus a UI assertion) remains the only evidence for spectator membership. |
| 3.2D-4 | Accessibility (TalkBack labels, focus order, touch targets, font scaling, reduced motion) | **BLOCKED** | TalkBack was left off and no focus-order walk was possible. Static label coverage exists in the checks below, but that is not native verification. |
| 3.2D-5 | Validation suite after changes | **PASS** | See below. |

## Executed verification (this pass)

| Check | Result |
|---|---|
| Migrations against the disposable database | **104/104** applied |
| `npm run typecheck` | exit **0** |
| `npm run test:unit` | **477 passed**, 0 failed, exit **0** |
| `utils/arenaAcceptNavigation.test.ts` | **3/3** |
| `npx expo-doctor` | **18/18 checks passed**, exit **0** |
| Relevant pgTAP (13 suites) | **495 assertions**, 0 failed, 0 skipped, exit **0** |
| `node scripts/arena-canonical-e2e.cjs .expo/arena32d-20261015` | **15 checks, 0 non-PASS**, exit **0** |
| Actual Deno signer (`deno-proof.cjs`) | exit **0** — `actual_deno: true`, `selected_fighter_authorized: true`, `url_origin: http://kong:8000`, `external_client_can_resolve: false` |
| `assist-signer-check` / `assist-service-check` | **14/14** / **10/10**, exit **0** |
| `test:arena-navigation` / `test:challenge-inbox` / `test:duel:render` / `test:official:service` / `test:crowd:service` | **11/11**, **18/18**, **22/22**, **14/14**, PASS — all exit **0** |
| Scoped disposable cleanup | **PASS** — pre-existing container/volume/network IDs unchanged |

Two run-time notes, recorded so the numbers are read correctly:

- The canonical E2E first failed with `P0001: rate limit … private_assist` after repeated attempts; `public.rate_limit_events` in the **disposable** database was cleared (`DELETE 38` → 0) and the run then passed 15/15. The rate limiter behaving as designed is a product observation, not a defect.
- The Deno signer still returns an internal `http://kong:8000` origin for the absolute field (`external_client_can_resolve: false`), which is exactly why 3.2B added the relative capability that the client resolves against its configured backend.

## Code change in this pass

`scripts/arena-canonical-e2e.cjs` (lines 6–8): the new task directory was added to the script's **reviewed-disposable-directory allowlist** and to its project-name mapping. The script deliberately refuses unreviewed scratch directories; 3.2B added its own directory the same way. Test-only script — no Arena, engine, migration or security behaviour changed.

## Residual risks and what remains unverified

- **Native media is not verified**: gallery/camera picker, on-device upload, decode/playback, GIF insertion, assist-attachment preview and retrieval, plus cancellation, permission denial and upload-failure retry. HTTP retrieval and signature authorization are verified; native rendering is not.
- **Native private-assist panel interactions are not verified**: open/close, repeated tapping, fighter selection, keyboard interaction and panel scrolling.
- **Watch Clash flakiness is unresolved**; automation timing and a real navigation failure could not be distinguished.
- **Accessibility is not verified on device**: TalkBack announcements, focus order, touch targets, dynamic font scaling, reduced-motion behaviour.
- **Acceptance routing**: the fix is present and unit-tested, but the original symptom was not reproduced on a device in this pass.
- **PR #65 draft state was not re-verified**: `gh` is installed but unauthenticated in this environment. No merge and no deployment was performed by this pass.

## To close the remaining gaps (human-in-the-loop)

1. Unlock the `SM-A505F` (pattern) and keep it unlocked on USB for the session (`stay_on_while_plugged_in=1`).
2. Re-run the same scripted environment — `prepare` → `prepare-edge` → `lifecycle create|db|bootstrap` → `migrate` → `lifecycle runtime` → `edge-configure` → `edge-start`, then Metro on `8083` with `adb reverse tcp:8083`/`tcp:57721` — drive the matrix above with real pickers, capture screenshots into `.expo/arena32d-…/screens/`, then run `cleanup.cjs`.
3. Keep `.expo/` scratch, account files and screenshots out of commits.

## Cleanup record

- Task Metro (pid 42820) identity-checked (`arena32d-20261015\metro.cjs`) and stopped; the pre-existing Metro process was left running.
- Reverses `8083` and `57721` removed; `8081` and `55321` preserved.
- Device bundle host restored to `localhost:8081`; `stay_on_while_plugged_in` restored to `0`; no app data was cleared.
- Ten task containers plus their volumes and network removed via `cleanup.cjs` (**PASS**, pre-existing inventory unchanged); zero task containers remain.
