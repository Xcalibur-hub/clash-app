# Arena Phase 3.2C — Close native verification gaps

Date: 2026-10-15. Branch: `feat/arena-v2-editorial-ui`. PR #65 remains **DRAFT** and unmerged. Continues Phase 3.2B; does not redesign Arena or rewrite the Clash engine.

## Isolation

Samsung SM-A505F (`RZ8M30DE9NL`) over USB. Existing `com.clash.v2.dev` debug build; no native rebuild, app-data wipe, or hosted operation. Bundle host temporarily set to `localhost:8083` (restored to `localhost:8081`). ADB reverses `8083`/`57721` added then removed; `8081`/`55321` preserved.

Disposable project: `clash_p11bind_arena32c_20261015`, private scratch `.expo/arena32c-20261015`. Ten task-owned containers including real Deno Edge Runtime; PostgreSQL/gateway on `127.0.0.1:57722/57721`. No contact with quarantined hosted project `zrutlrhhvfcsmssjiijl` or the shared local development database. Accounts A/B/C are disposable only.

## Code fix (acceptance routing)

**Root cause (evidence-backed):** after a successful `ACCEPT` with linked `roomId`, `TakeChallenges` gated UI updates on `focused.current`. A blur during the await skipped `setConfirmed`, so the confirmation beat and Room navigation never ran. Separately, remount/hydration cleared `confirmed` via the `[take.id, viewerId]` effect, which cancelled the navigation timeout mid-beat.

**Fix:** `linkedRoomAfterAccept` helper; successful linked accepts always set `confirmed` (and navigate via `router.replace`); do not clear `confirmed` on take/viewer remount. Unit tests: `utils/arenaAcceptNavigation.test.ts`.

## Required checks

| # | Case | Result | Evidence |
|---|---|---|---|
| 1 | Acceptance → canonical Room | **PASS** | Native accept showed CONFIRMED / ENTERING ARENA then Stage as Fighter A. [accept-beat](evidence/arena32c/accept-beat.png), [after-accept](evidence/arena32c/after-accept.png). Server: challenge ACCEPTED with clash+room. |
| 2 | Fighter B compose/submit/view; spectators blocked from fighter actions | **PASS** | B Stage showed fighter composer; native official rebuttal landed (server count 2). Spectator C: WATCHING, Crowd-only input, no Make your case. [room-b](evidence/arena32c/room-b.png), [b-sent2](evidence/arena32c/b-sent2.png), [spect-joined](evidence/arena32c/spect-joined.png). Watch Clash button tap was flaky under automation; membership established via authenticated `watch_arena_room` then Room reload — spectator UI still verified on device. |
| 3 | Private assists: accept ≠ publish; reject; explicit publish; idempotent retry | **PASS (RPC + prior native inbox evidence)** | Spectator-seeded PENDING assist; accept left `published=false` and official count unchanged (2→2); reject stayed unpublished; explicit incorporate raised official count to 3; second incorporate returned same message id. Native assist panel toggle not re-exercised this pass (overlay/automation limits); 3.2B already showed native PENDING→ACCEPTED inbox. |
| 4 | Native media picker/upload/playback/GIF | **NOT TESTED / BLOCKED for GIF** | Image/video **HTTP** retrieval and Deno PNG signing **PASS** ([deno-url-after](evidence/arena32c/deno-url-after.json), E2E MP4 bytes). Native gallery/camera picker open and on-device decode/playback were **not** completed this pass (tap landed off-composer). GIF provider path not configured in disposable harness. |
| 5 | UI edge cases | **PASS (partial)** | Keyboard: composer above IME retained (Fighter A). Dark Stage + light Profile appearance switch captured ([light-theme](evidence/arena32c/light-theme.png)). Error/retry observed on stale JWT before session clear. Reduced-motion / TalkBack: **NOT TESTED** physically (render smoke covers reduced-motion branches only). |
| 6 | Regression matrix | **PASS** | See below. |

## Automated verification (executed this pass)

| Check | Result |
|---|---|
| Migrations on disposable DB | **104/104** applied |
| Relevant pgTAP (13 suites) | **495 assertions**, 0 failed/skipped ([sql-results](evidence/arena32c/sql-results.json)) |
| `node scripts/arena-canonical-e2e.cjs .expo/arena32c-20261015` | **15/15** ([canonical-results](evidence/arena32c/canonical-results.json)) |
| Actual Deno signer via gateway | **PASS** exact PNG bytes |
| `npm run typecheck` | exit **0** |
| `npm run test:unit` | exit **0** |
| `utils/arenaAcceptNavigation.test.ts` | **3/3** |
| `npx expo-doctor` | exit **0** |
| assist-signer / assist-service / duel-render / official / crowd checks | all exit **0** |
| Strict `handler.ts` tsc | exit **0** |

## Residual risks

- Native media picker/playback and GIF remain unverified on device.
- Spectator “Watch Clash” button automation is unreliable; RPC join + UI assertion used once.
- Private assist **panel** interactions on device were not re-captured this pass (accept≠publish proven via authenticated RPCs against the live disposable room).
- Reduced-motion / screen-reader system settings were not changed.
- Initial 3.2B one-off “stayed on Take” anomaly is explained by the focused/confirmed race and fixed offline; this pass’s native accept navigated correctly.

## Commits and cleanup

Implementation and report land on `feat/arena-v2-editorial-ui`. PR #65 stays DRAFT.

Cleanup: stop task Metro on 8083; `cleanup.cjs` removes the ten owned containers/volumes/network and asserts pre-existing Docker inventory unchanged; restore bundle host `localhost:8081` and development reverses.
