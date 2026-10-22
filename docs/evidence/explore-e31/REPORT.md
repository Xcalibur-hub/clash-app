# CLASH — EXPLORE E3.1: MEET LIFECYCLE HARDENING

| Field | Value |
|---|---|
| Branch | `arena-ui-review` |
| HEAD at start | `f7d385bb45ff8ecf12af662c9d913091425656df` — `feat(explore): rotate the globe only when a country is chosen` |
| Date | 2026-10-22 |
| Mode | Implementation. **Client only**: no migrations, no seeds, no DB writes, no RLS changes, no rebuild. |
| Deliverable | This report + client hardening of the Meet (pseudonymous random chat) lifecycle |
| Phase | E3.1 of the sequence in `docs/evidence/explore-e30/REPORT.md` §7 |
| Gate answered here | **Is E3.2 (minimum safety & moderation) safe to start?** |

---

## Verdict (read this first)

**GO for E3.2. Client-side lifecycle closure is done and verified. Meet GA remains NO-GO.**

The three E3.0 lifecycle defects that made Meet *unusable* after any interruption are closed on the client:

| E3.0 finding | Severity | E3.1 status |
|---|---|---|
| **M-01** stale-session trap (no leave on exit, no expiry) | High | **Client side closed**; server-side expiry still open (see §5.1) |
| **M-02** ghost queue rows when the searching UI unmounts | High | **Closed** |
| **M-03** an active session on the other channel traps video search | Medium–High | **Closed** |
| **M-09** 500 ms signaling / 2.2 s message poll do not scale | Medium | **Partly closed** — no stacked requests, exponential backoff, polling pauses when backgrounded. Realtime transport stays E3.6. |

Everything E3.2 needs (`reports`, `moderation_actions`, `is_staff`, `report_meet_session`, the `meet_message` report target) is independent of the work below, so the next phase is not blocked. What keeps Meet out of production is unchanged and non-client work: server-side session expiry/sweep, TURN, age assurance, moderation operations, retention (§5).

Verification: `npx tsc --noEmit` **PASS** (exit `0`), full unit suite **790/790 PASS**, 26 new assertions for the lifecycle module.

---

## 0. Verification performed

| Check | Command | Result |
|---|---|---|
| TypeScript (whole app) | `npx tsc --noEmit` | **PASS** — exit `0`, no diagnostics |
| Full unit suite | `npm run test:unit` | **PASS** — `# tests 790 / # pass 790 / # fail 0` (764 before E3.1; +26 new) |
| Meet suites only | `node --experimental-strip-types --test utils/meetLifecycle.test.ts utils/meetModes.test.ts utils/meetVideoSession.test.ts` | **PASS** — `# tests 35 / # pass 35 / # fail 0` |
| Reset / DB / seed / device | not run | Out of scope by design: no migration, no `supabase start/reset`, no native build, no live RPC |
| Encodings | byte scan of every edited file | UTF-8 without BOM, LF preserved |

Reproduce locally:

```powershell
npx tsc --noEmit
npm run test:unit
node --experimental-strip-types --test utils/meetLifecycle.test.ts
```

---

## 1. Root causes and what now prevents them

### 1.1 M-01 — the stale-session trap

**Root cause (confirmed against the schema).** A session ends *only* when a participant calls `leave_meet_session` (`20261004140000_meet_text_matching.sql:665`). `meet_sessions` has no expiry column and `run_maintenance` has no Meet branch (`20261004150000_meet_video.sql:684`); the only queue hygiene is a 30-minute blanket cancel inside `cleanup_meet_signals` (`:672–675`). Meanwhile `meet_has_active_session` gates all future matching, and `poll_meet_queue` short-circuits to the live session before it ever looks at the queue (`20261004140000:458–468`).

So any exit that was not the explicit Leave button — hardware back, swipe back, tab switch, app kill — left a session alive that both users were then pinned to.

**Fix (client).**

1. **Text chat** — `hooks/useMeetChat.ts` owns teardown. Its unmount effect calls `leaveMeetSession(sessionId, 'leave')` exactly once (`:334–341`, guarded by `leftRef`), so `router.back()`, swipe-back, tab switch and screen replacement all end the session. Explicit `leave()`/`markEnded()` set the same flag first, so navigation never double-fires.
2. **Video call** — `app/explore/meet/video/[sessionId].tsx` now carries the same guard (`:56–66`); `onNext`/`onLeave`/`onBlock` mark `leftRef` before navigating so `next_meet`'s own `leave('next')` is not duplicated.
3. **Search surfaces** — `hooks/useMeetSearch.ts` cancels the waiting row on unmount (`:291–295`), covering both `MeetHomePanel` and `video/prep.tsx` without either screen doing its own bookkeeping.
4. **Terminal states are absorbing.** `utils/meetLifecycle.ts` (`meetChatStatus`, `meetStatusIsTerminal`, `meetCanSend`) makes `ended`/`expired` sticky, so a late `status: 'active'` payload can no longer revive a dead chat and re-enable the composer.

### 1.2 M-02 — ghost queue rows

**Root cause.** The panel polled with `setInterval` and cleared only the interval on unmount; switching Explore mode unmounted it while the row stayed `waiting`, so a stranger could be matched to an absent peer.

**Fix.** One queue lifecycle now lives in `hooks/useMeetSearch.ts`:

- `start()` respects `createMeetRequestGuard` — only the newest in-flight poll may commit state.
- `cancel()` cancels the row *and* classifies the response with `meetQueueOutcome` + `meetCancelVsMatch`: a match that lands in the same instant is **ended**, never displayed (`:94–110`).
- Unmount → `leaveMeetQueue()` (best effort, failure ignored).
- `lost` outcomes (swept row, expired wait, dead match) surface `notice` strings instead of an endless "Finding someone…" (`:169`, `:224`, `:267`), and `MeetHomePanel` renders that notice (`MeetHomePanel.tsx:415`).
- The client also gives up at `MEET_QUEUE_TTL_MS` (30 min) — the same boundary the server sweep uses — so a lagging cron cannot leave the UI spinning.

### 1.3 M-03 — cross-channel `alreadyActive`

**Root cause.** `join_meet_queue` returns `alreadyActive` for *any* active session regardless of `p_channel` (`20261004150000:351–362`); video prep only handled it when the session was itself `VIDEO`, and otherwise entered `searching` **with no queue row** — an unrecoverable spinner.

**Fix.** `meetActiveSessionChannel(activeChannel, requestedChannel)` is the single decision point:

- `video/prep.tsx:38–43` — an active **TEXT** session now stops the video flow with "You are already in a text Meet. Leave it before starting a video call." instead of hijacking or silently ending it.
- `MeetHomePanel.tsx:82–88, 145–168` — an `alreadyActive` resume is rendered with its real channel (`Text`/`Video`) and opens the matching screen, instead of being shown as a fresh match.

### 1.4 M-09 — polling that cannot stack

- `meetPollDelay(base, failures, max)` — deterministic exponential backoff (`base, 2×, 4× …`), 250 ms floor, capped at `MEET_MAX_POLL_MS` (20 s). No jitter, so the behaviour is unit-testable.
- `useMeetChat` schedules the *next* poll after each response, so a slow network delays the beat instead of queuing a second request; `pollMeetMessages` in `services/meetService.ts` got the same `inFlight` guard.
- `AppState` pauses both chat loops and clears typing presence when the app leaves the foreground, and resumes on return — no phantom traffic and no "typing…" while backgrounded.
- Two independent strike counters (messages, session) mean one failing stream does not hide the other.

---

## 2. Change map

| File | Change | Finding |
|---|---|---|
| `utils/meetLifecycle.ts` | **New.** Pure decision module: `meetChatStatus`, `meetStatusIsTerminal`, `meetCanSend`, `meetQueueOutcome`, `meetPollDelay`, `createMeetRequestGuard`, `mergeMeetMessages`, `meetIsTerminalError`, `meetCancelVsMatch`, `meetActiveSessionChannel`, `MEET_QUEUE_TTL_MS`. No React, no network imports. | M-01, M-02, M-03, M-09 |
| `utils/meetLifecycle.test.ts` | **New.** 26 assertions across 9 `describe` blocks (see §4). | — |
| `hooks/useMeetChat.ts` | **New/rewritten.** Single owner of chat state: guarded load, self-scheduling message + session polls with backoff, `AppState` pause, typing presence, terminal-error absorption, exactly-once leave on unmount. | M-01, M-09 |
| `hooks/useMeetSearch.ts` | **New.** Single owner of queue state: guarded `start`, safe `cancel`, `notice` reasons, unmount cancel, TTL give-up. | M-02, M-03 |
| `app/explore/meet/[sessionId].tsx` | **Rewritten** against `useMeetChat`: status line, footer, error/notice rows, send, leave, next, block, report, styles. Removed the duplicated polling and the stale `setInterval` state machine. | M-01, M-02, M-09 |
| `app/explore/meet/video/[sessionId].tsx` | Leave on unmount; `leftRef` guard across next/leave/block. | M-01 |
| `app/explore/meet/video/prep.tsx` | Cross-channel `alreadyActive` handled via `meetActiveSessionChannel`; queue owned by `useMeetSearch`; single `busy` guard on Start. | M-03 |
| `components/meet/MeetHomePanel.tsx` | Queue/phase/matched state delegated to `useMeetSearch`; renders `search.notice`; matched card shows the real channel. | M-02, M-03 |
| `services/meetService.ts` | `pollMeetMessages` cannot stack (`inFlight`); `subscribeMeetTyping` ignores events after `unsubscribe`. | M-09 |
| `package.json` | `test:unit` now includes `utils/meetLifecycle.test.ts`. | — |

Explicitly **not** touched: RLS policies, grants, rate limits, any migration, any RPC body, video signaling/ICE, `meet_messages` retention.

---

## 3. Race and failure matrix

Each row is a real interleaving that the old code mishandled; the guard column is the code that now decides, and the test column is the unit test that pins it.

| # | Race / failure | Old behaviour | Guard | Test |
|---|---|---|---|---|
| R1 | Peer leaves; a stale poll returns `status: 'active'` | Chat reopened, composer re-enabled | terminal status is absorbing (`meetStatusIsTerminal`) | `meetStatusIsTerminal / meetCanSend` |
| R2 | `status: 'ended'` with `endReason: 'expired'` | Shown as a normal end | `meetChatStatus` maps to `expired`, distinct footer copy | `meetChatStatus` |
| R3 | Session active but peer dropped (`peerConnected: false`) | Still "Connected", send allowed | `disconnected` state, composer replaced by footer actions | `meetChatStatus`, `meetStatusIsTerminal / meetCanSend` |
| R4 | Two overlapping message polls; slower one lands last | Duplicate/reordered bubbles | `createMeetRequestGuard` + `mergeMeetMessages` (id-keyed, time-sorted, idempotent) | `createMeetRequestGuard`, `mergeMeetMessages` |
| R5 | User taps Cancel at the same instant a match lands | Chat opened after cancel | `meetCancelVsMatch` → `discard`; hook ends the late session | `meetCancelVsMatch`, `meetQueueOutcome` |
| R6 | Poll returns `matched` but the session already ended | Dead chat opened from the panel | `meetQueueOutcome` → `lost`, UI shows a notice | `meetQueueOutcome` |
| R7 | Waiting row swept server-side while polling | Panel spun forever | `queued: false` → `lost` → notice | `meetQueueOutcome` |
| R8 | Wait exceeds 30 min before the sweep runs | Spinner persisted | `MEET_QUEUE_TTL_MS` on `queuedAt` → `lost` | `meetQueueOutcome` |
| R9 | Active TEXT session while starting VIDEO | Infinite "Finding someone…" with no row | `meetActiveSessionChannel` → explicit message, no `searching` | `meetActiveSessionChannel` |
| R10 | RPC fails repeatedly (offline, cold start) | Fixed 2.2 s hammering | `meetPollDelay` exponential backoff, 250 ms floor, 20 s cap | `meetPollDelay` |
| R11 | Send after the server closed the session (`P0003`) | Silent failure, composer still active | `meetIsTerminalError` → status `expired`/`ended`, composer removed | `meetIsTerminalError` |
| R12 | `get_meet_session` returns `P0002`/`42501` (deleted or not a participant) | "Reconnecting…" forever | terminal errors absorb the poll loop and force `ended` | `meetIsTerminalError` |
| R13 | App backgrounded mid-chat | Polling + presence continued | `AppState` pause, presence untracked, resume on return | — (hook-level, covered by tsc + review) |
| R14 | Hardware back / swipe / tab switch mid-chat | Session left alive | unmount `leaveMeetSession` once, `leftRef`-guarded | — (hook-level) |


---

## 4. Test evidence

`utils/meetLifecycle.test.ts` — 26 assertions, 9 groups, zero React/network dependencies:

| Group (line) | What it pins |
|---|---|
| `meetChatStatus` (35) | ended/expired/active × `peerConnected` matrix; `endReason: 'expired'` wins over `active` |
| `meetStatusIsTerminal / meetCanSend` (52) | `connected` is the only writable state |
| `meetQueueOutcome` (77) | matched / searching / lost, including dead match, swept row, 30-min TTL edge |
| `meetActiveSessionChannel` (123) | same-channel resume vs cross-channel refusal |
| `meetPollDelay` (132) | 250 ms floor, doubling, 20 s cap, non-finite input |
| `createMeetRequestGuard` (156) | only the newest token commits; `invalidate()` drops in-flight responses |
| `mergeMeetMessages` (174) | dedupe by id, ordering by `createdAt` then id, identity return when unchanged |
| `meetIsTerminalError` (192) | `P0002`, `P0003`, `42501` terminal; `P0004`/`P0005`/`P0006`/`null`/`undefined` not |
| `meetCancelVsMatch` (208) | cancel-during-match discards; no session discards |

Observed output:

```
# node --experimental-strip-types --test utils/meetLifecycle.test.ts
# tests 26
# pass 26
# fail 0

# node --experimental-strip-types --test utils/meetLifecycle.test.ts utils/meetModes.test.ts utils/meetVideoSession.test.ts
# tests 35
# pass 35
# fail 0

# npm run test:unit
# tests 790
# pass 790
# fail 0
```

Not covered by unit tests (and why): hook-level effects (unmount leave, `AppState` pause) and screen rendering need a renderer this repository does not have — there is no `@testing-library/react-native` in `package.json`. They are covered by `tsc` plus review; closing that gap is an E3.2 test-infrastructure item.


---

## 5. Residual risk (read before shipping)

### 5.1 Server-side expiry is still missing — the one open E3.1 item

E3.1's plan in the E3.0 report included `meet_sessions.expires_at`, `meet_participants.last_heartbeat_at`, and a sweeper in `run_maintenance`. **None of that was written.** Reasons, in order of weight:

1. It requires a migration plus a `run_maintenance` branch — outside the "no DB writes / no migrations" envelope of this pass.
2. The client cannot make expiry meaningful on its own: a killed app cannot call anything, and the sweeper is what protects the *peer*.

The heartbeat idea was explored and **dropped deliberately**: `heartbeat_meet_session` does not exist anywhere in `supabase/migrations` (verified by exhaustive grep), and inventing a client heartbeat for a non-existent RPC would have produced a silent no-op that *looks* like a fix. There is no client-side substitute for a server sweep.

What the client guarantees today: a session is ended by the app whenever the app is still running — back, swipe, tab switch, screen replacement — and the next launch cannot silently resume into it, because the chat screen only renders what `get_meet_session` returns and terminal states are absorbing.

Residual window: **app killed mid-chat** (process death) → the session stays `active` until the peer leaves. That is the remaining M-01 hole. Proposed migration (for a phase that is allowed to write SQL):

```sql
alter table public.meet_sessions add column expires_at timestamptz;
alter table public.meet_participants add column last_heartbeat_at timestamptz;

-- called from run_maintenance (cron, every minute)
update public.meet_sessions
   set status = 'ended', end_reason = 'expired', ended_at = now()
 where status = 'active' and expires_at < now();
```

plus a `touch_meet_session()` RPC (piggybacked on the existing poll tick, not a new timer) and a `pg_cron` entry — after which `poll_meet_queue`/`get_meet_session` naturally report `ended`, and `meetChatStatus` renders it as `expired` with no further client work.

### 5.2 Unchanged, still blocking GA

| Gap | E3.0 ref | Why it still blocks |
|---|---|---|
| TURN / ICE restart | M-07, M-08 | Video fails on carrier NAT; no recovery path. E3.3, NO-GO until TURN exists. |
| Age assurance for 1:1 video | M-06 | `can_use_video_meet` is an auth check, not an age gate. Product/legal decision. |
| Moderation operations | M-05 | Reports are session-level with no reason sheet, no message target, no staff read path. **That is E3.2 itself.** |
| Retention / deletion | M-10 | Transcripts are permanent; "pseudonymous" overclaims. E3.7. |
| Signaling cost | M-09 | The 500 ms signal poll is unchanged; backoff only shields failures. E3.6. |
| Static aliases | M-12 | The alias is still constant per profile across sessions. |

### 5.3 Behaviour changes worth calling out

- **"Find someone else" no longer strands a queue row.** `next_meet` leaves the user `waiting` when nobody is available; the text chat now drops that row before returning to Explore (`app/explore/meet/[sessionId].tsx:94–101`), so the next visit starts clean instead of inheriting a phantom search. Video keeps its prep-screen search.
- **Video prep refuses a TEXT session** instead of pretending to search (M-03). The user is told to leave the text chat first.
- **Leave is idempotent.** A `leftRef` in the chat hook, the search hook and the video screen means exactly one `leave_meet_session` per screen instance, whichever path triggered it.


---

## 6. GO / NO-GO for E3.2

| Question | Decision |
|---|---|
| Is E3.1's client scope complete and verified? | **YES** — with the server-expiry item explicitly carried into a migration-bearing phase (§5.1). |
| Can E3.2 (minimum safety & moderation) start? | **GO** |
| Does E3.1 unblock Meet GA? | **NO** — expiry/sweeper, TURN, age assurance, moderation ops and retention remain outstanding. |
| Any change to RLS, grants, rate limits or DB state in E3.1? | **None.** Policies and limits are untouched; nothing was weakened to make the client pass. |

**Conditions attached to the GO:**

1. E3.2 needs a migration anyway (report-reason values for underage/CSAM), so **fold `meet_sessions.expires_at` and the `run_maintenance` sweep into that same batch** — it is the cheapest moment to close §5.1, and it is the last item between "lifecycle hardening" and "lifecycle closure".
2. E3.2's evidence must include a staff read path. A message-level report with no reader is the M-05 failure repeating.
3. Keep the client guards authoritative for *display*; the server stays authoritative for *existence*. No screen may infer a live session from local state.

---

## Appendix A — symbol index

| File | Key symbols (line) |
|---|---|
| `utils/meetLifecycle.ts` | `MEET_QUEUE_TTL_MS:23`, `meetChatStatus:48`, `meetStatusIsTerminal:56`, `meetCanSend:61`, `meetQueueOutcome:72`, `meetActiveSessionChannel:94`, `meetPollDelay:102`, `createMeetRequestGuard:121`, `mergeMeetMessages:140`, `meetIsTerminalError:159`, `meetCancelVsMatch:167` |
| `hooks/useMeetChat.ts` | `useMeetChat:60`, guarded initial load `:108`, poll loop `:161`, terminal-error absorption `:140` and `:217`, `send:259`, `leave:293`, `markEnded:306`, unmount leave `:334–341`, returned API `:343` |
| `hooks/useMeetSearch.ts` | `useMeetSearch:64`, `cancel:94`, `release:114`, `start:133`, notices `:169/:224/:267`, unmount cancel `:291–298` |
| `app/explore/meet/[sessionId].tsx` | `MeetChatScreen:34`, `statusLine:48`, `onSend:65`, `onLeave:74`, `onNext:80`, `onBlock:107`, `onReport:123` |
| `app/explore/meet/video/[sessionId].tsx` | unmount leave `:56–66`, `onNext:83`, `onLeave:111`, `onBlock:124` |
| `app/explore/meet/video/prep.tsx` | cross-channel guard `:38–43`, `onStart:70`, Start disabled by `busy || search.busy` |
| `components/meet/MeetHomePanel.tsx` | `search.phase` pulse `:69`, matched tracking `:82`, matched card `:145`, notice `:415` |
| `services/meetService.ts` | `pollMeetMessages` in-flight guard `:392`, `subscribeMeetTyping` closed guard `:427` |
| `utils/meetLifecycle.test.ts` | 9 `describe` blocks, 26 assertions `:35–223` |

