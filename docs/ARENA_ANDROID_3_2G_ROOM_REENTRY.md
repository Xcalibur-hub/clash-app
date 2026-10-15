# Arena Phase 3.2G — Room re-entry and native-verification unblocking

Date: 2026-10-15. Branch `feat/arena-v2-editorial-ui` from `313f946`. **PR #65 stays DRAFT**; nothing pushed, merged or deployed. No hosted Supabase contact; the shared local stack was never reset or migrated; no Android security control was bypassed.

## 1. `arena_room_capacity_reached` is not a room-entry rejection

3.2F read that event as "a previously joined spectator was refused entry". That reading was wrong:

- The event fires from `app/arena/room/[roomId].tsx:279-283` when **`backup.load?.saturated`** is true, with the comment *"Capacity is a real, server-reported fact worth measuring."*
- `saturated` is produced by `services/arenaGameService.ts:93/316` (`record.saturated === true`) — the **call-for-backup** layer, not room seating. The room renders its own saturated state at `[roomId].tsx:936`.
- Seating is a different, deliberate model: `20261007120000_arena_duel_foundation.sql:15-18` constrains clash rooms to `capacity = 2 and participant_count = 2` (a canonical clash room is *designed* to sit at 2/2); group rooms are 20–50.
- `20261002160000_live_arena_spectator.sql:66+` documents `join_arena_topic` as the "**spectator path (no stance, no capacity slot)**", and its body hands back the existing membership for anyone already in ("Already in: hand back the existing membership; never change role/stance").
- An independent guard: `join_arena_topic(..., 'debater')` **refuses** clash-linked topics — *"duel fighters are assigned by the Clash"* (hit while building the fixture below).

**Conclusion: no product defect.** The fixture was not under-capacity; the event was backup telemetry. No product code was changed.

## 2. Focused regression — `supabase/tests/092_arena_room_reentry.sql`

New pgTAP suite (19 assertions, `no_plan()`, isolated fixtures, rolled back) run against a **db-only** instance of the reviewed 3.2F project (104 migrations applied; only db + the three init jobs ever started):

| # | Case | Result |
|---|---|---|
| 1 | First spectator join creates one membership, consumes **no** slot | PASS |
| 2 | Same spectator re-entry succeeds — no duplicate row, no count inflation | PASS |
| 3 | Re-entry while the room sits **at capacity** | PASS |
| 4 | **New** spectator at capacity (slot-free path) | PASS |
| 5 | Repeat/duplicate joins → exactly one membership, count unchanged | PASS |
| 6 | Fighter re-entry keeps role **and** recorded stance, adds no slot | PASS |
| 7 | Spectator joins a fully seated clash room (2/2) — the exact 3.2F state | PASS |

Capacity protection is intact: a debater cannot exceed a full room (shed into another room, exactly one membership).

**Related suites re-run green (no regression):** `026_live_arena_spectator.sql` 20/20 · `054_arena_duel_foundation.sql` 78/78 · `025_live_arena.sql` 233/233.

**Fixture correction (harness, not product):** the first draft placed a group room and a clash room under one topic, which tripped the intended *"duel fighters are assigned by the Clash"* guard. The suite now uses one topic per room mode.

## 3. Why `uiautomator dump` cannot reach idle inside the live room

- `uiautomator` waits for window-content idle. The room's own polling cadence is *not* the main cause: the pulse poller is **skipped for DUEL rooms** (`[roomId].tsx:381-388`, `if (!room || room.roomMode === 'DUEL') return;`) and presence polls every 20 s (`[roomId].tsx:313`).
- The residual cause is the **continuous decorative animation**: ~40 `withRepeat`/`withTiming` sites across the liveArena layers (`LivePulse.tsx:39`, `RoomPulseSheet.tsx:144`, plus `ArenaAtmosphere`, `ReactionBurst`, `BattleEventBurst`, `VerdictReveal`, `ArenaTopicDeck`).

Test-side attempts and their outcomes:

| Attempt | Outcome |
|---|---|
| Platform animation scales (`animator_duration_scale`, transition/window) | Do not stop Reanimated UI-thread loops |
| `adb shell kill -STOP <pid>` | **Denied** (`Operation not permitted`); bypassing is out of scope |
| Same-UID `run-as com.clash.v2.dev kill -STOP <pid>` | Freezes the app (state `T`) but the accessibility bridge then returns **`null root node`** — no tree. App resumed to `R`, no lasting effect |
| Static screens | Reliable (onboarding, auth form) — used for label-based taps this phase |

**No production behaviour was changed** and nothing was disabled to make the harness pass. Recommended next step is harness-side first: retry `ui.cjs dump` in a loop (~5 attempts × 5 s) to land in the quiet window between presence polls; only if that fails should a **dev-gated** freeze of decorative loops (env flag, absent from production builds) be considered — a product-code change that needs an explicit owner decision.

## 4. Repeatable native method for the next run

1. Isolated env: reuse `.expo/arena32f-20261015` (`prepare` → `prepare-edge` → `lifecycle create|db|bootstrap` → migrate → `lifecycle runtime` → `edge-configure|edge-start`), then `accounts.cjs` + `route-fixture.cjs` (or the canonical E2E, which built the 2/2 room with A/B fighters and spectator C).
2. Device: `adb reverse tcp:8083` + `tcp:57721`, back up and swap `debug_http_host` to `localhost:8083`, start `metro.cjs`, restart the app; confirm the isolated gateway serves it (Kong logs + `arena_viewed`).
3. Sign in per role with `device-login.cjs 0|1|2` (the form's fields sit at `(540,946)` and `(540,1204)`, button at `(540,1401)`); verify with `auth.users.last_sign_in_at` in the isolated DB.
4. Open the room: `android.cjs link clash-dev://arena/room/<roomId>`.
5. Spectator: `ui.cjs tapDesc "Toggle private assist composer"` → `tapDesc "Assist Fighter A"` → `tapDesc "Private assist text"` → `type` → `tapDesc "Send privately"` (media: `tapDesc "Attach photo"` / `"Attach video"`).
6. Fighter: `tapDesc "Toggle private assist inbox"` → `tapDesc "Accept"` → confirm **no** room message appears → `tapDesc "Publish as my argument"` → confirm one published message and `published_message_id` set exactly once; `"Reject"` must never publish; `"View private attachment"` covers the signed-media path. Other in-panel labels: `Report and hide`, `Load older assists`, `Assist Fighter B`.
7. Assert each step at the DB/API layer (recipient-only reads, no auto-publish, idempotent publication, private original untouched).
8. Restore the device (pref → `localhost:8081`, remove the task reverses, stop the task Metro) and run `cleanup.cjs`.

## Isolation and cleanup (this phase)

- Instance recreated from the reviewed `compose.json`: db-only startup (1 running container; the three init jobs ran to completion), 104 migrations applied, then the new suite plus three existing suites.
- `cleanup.cjs` → "PASS scoped disposable cleanup; pre-existing container/volume/network IDs unchanged"; project containers/volumes/networks = **0/0/0**; inventory back to **45 / 26 / 9**.
- Device state: pref restored to `localhost:8081`, only the original reverses (`8081`, `55321`) remain, app restarted on the shared stack, `font_scale` untouched.
