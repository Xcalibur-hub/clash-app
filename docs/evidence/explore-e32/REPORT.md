# CLASH — EXPLORE E3.2: MEET SAFETY & SESSION LIFECYCLE

| Field | Value |
|---|---|
| Branch | `arena-ui-review` |
| HEAD | `58c031655a2ba717e371eb860a5fca208f8f449d` — `feat(explore): harden meet lifecycle and add E3.1 evidence` |
| Phase | E3.2 (Section 38 sequence) — server lease + client abuse surfaces |
| Date | 2026-10-22 |
| Mode | Implementation. Migration **authored, never applied**. No DB writes, no `supabase start/reset/seed`, no `rpc` against any project, no rebuild. |
| Deliverable | This report + the E3.2 code listed in §1 |
| Scope | Meet only: session lease (90 s, heartbeat, lazy expiry, 6 h ceiling), reason-based reporting for text **and** video, message-level reporting, block authorization hardening, abuse limits. |
| Non-goals | TURN/relay capacity, age assurance, retention deletion (E3.7), pseudonym rotation, Play surfaces. |

# Verdict (read this first)

**GO to merge the code. CONDITIONAL GO to deploy: the migration must be applied before the app build (§7.1), and a pgTAP suite for it must exist and pass — today there is none (`supabase/tests/` stops at `096`), so the whole server contract is review-only (§5.1, R1).**

Why the condition and not a plain GO: three client paths now depend on objects that exist **only** inside `20261022120000_meet_safety_and_lifecycle.sql` — `touch_meet_session`, `report_meet_message`, and the `child_safety` enum value. An app build released ahead of the migration degrades rather than crashes (the heartbeat treats the missing-RPC error `PGRST202` as transient and backs off; a message report falls back to the generic failure copy), but it silently loses lease renewal and message reporting. Order matters: **migration first, build second**.

The code itself is clean on every gate this machine can run: `tsc --noEmit` exit `0`, `npm run test:unit` `806/806` passing, and the Meet-specific subset `51/51` passing (§0).

---

# 0. Verification performed

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **PASS** — exit `0`, zero diagnostics (`strict`, `noImplicitOverride`, `noFallthroughCasesInSwitch`; `**/*.test.ts` excluded by `tsconfig.json:22`) |
| Unit suite (full) | `npm run test:unit` | **PASS** — exit `0`; `# tests 806 / # suites 194 / # pass 806 / # fail 0` |
| Unit suite (Meet subset) | `node --experimental-strip-types --test utils/meetLifecycle.test.ts utils/meetSafety.test.ts utils/meetVideoSession.test.ts utils/meetModes.test.ts` | **PASS** — exit `0`; `# tests 51 / # suites 15 / # pass 51 / # fail 0` |
| Lint | `npx eslint <9 files>` | **NOT APPLICABLE** — this repo has no ESLint config (`eslint.config.*` absent, no `lint` script in `package.json`). ESLint 9 exits `2` on any file. The gates above are the repo's actual gates. |
| Migration applied | — | **NOT RUN — BLOCKED.** The brief forbids applying migrations or writing to the DB. |
| DB contract suites | `npm run supabase:test` (pgTAP) | **NOT RUN — BLOCKED**, and **no suite exists**: `supabase/tests/` ends at `096_clash_notification_dedup.sql`. pgTAP replays fixtures through RPCs, i.e. DB writes. |
| Device smoke | — | **NOT RUN** — requires a native rebuild (`react-native-webrtc`) plus two signed-in devices. |

Deliberately not done: `supabase start`, `db reset`, seed application, `supabase db push`, any screenshot, any edit outside the files in §1.

---

# 1. Deliverables

| File | Δ | Purpose |
|---|---|---|
| `supabase/migrations/20261022120000_meet_safety_and_lifecycle.sql` | **new**, 1241 lines | The whole server contract: lease column + default, seat-release trigger, sweep, lease-aware reads, heartbeat with 6 h cap, block/report hardening, message reporting, staff evidence path, signal caps, rate limits, grants. |
| `services/meetService.ts` | modified | `touchMeetSession`, `reportMeetMessage`, `MeetReportReason` union, `expiresAt` on `MeetSession`, signal cap-aware helpers. |
| `supabase/database.types.ts` | modified | Regenerated shape: `child_safety` on `report_reason`, `report_meet_message`, `touch_meet_session`, `meet_moderation_reads`. |
| `utils/meetSafety.ts` | **new**, 47 lines | `MEET_REPORT_REASONS` (ordered), `meetReportReasonLabel`, `meetReportNotice`. Pure, dependency-free. |
| `utils/meetSafety.test.ts` | **new**, 93 lines | Enum-parity pin, ordering, label hygiene, notice copy contract. Added to `test:unit`. |
| `components/meet/MeetReportSheet.tsx` | **new**, 89 lines | Network-free reason picker shared by text and video. |
| `app/explore/meet/[sessionId].tsx` | modified, 446 lines | `openReport` / `submitReport`, long-press a peer bubble to report that message, one "Report stranger" entry, sheet mounted. |
| `app/explore/meet/video/[sessionId].tsx` | modified, 370 lines | Six hardcoded report buttons collapsed into Report → shared sheet; report failures now surfaced instead of swallowed. |
| `hooks/useMeetChat.ts` | modified, 422 lines | Lease heartbeat for text: 15 s cadence, pause on background, resume-with-immediate-beat, terminal-code handling. |
| `hooks/useMeetVideoSession.ts` | modified, 405 lines | Heartbeat split into `stopHeartbeat` / `beat` / `startHeartbeat`; ends the call when the server says the lease is gone. |
| `utils/meetLifecycle.ts` | modified | `MEET_HEARTBEAT_MS = 15_000`, `meetHeartbeatDue`, `meetPollDelay`, `meetIsTerminalError` (`P0002` / `P0003` / `42501`). |
| `utils/meetVideoSession.ts` | modified | New `meetVideoCallIsLive(state)` predicate — one definition of "worth renewing the lease". |

Modularity: every file stays under the 150-line guidance except the four pre-existing screens/hooks (422–446 lines), which were already over it before E3.2 and only gained the report/heartbeat seams; no new monolith was introduced.

---

# 2. Server contract

## 2.1 The lease is a column, not client state

`meet_sessions.expires_at timestamptz not null default (now() + interval '90 seconds')` (`:43–51`). The default is set **twice** on purpose: `add column if not exists` never rewrites an existing default, so a re-run would otherwise keep whatever was there before. Pre-existing active rows are clamped to `min(expires_at, now() + 2 min)` (`:59–61`) so the deploy drains the backlog within one sweep tick instead of trusting a 30-minute default computed at ALTER time.

One client-visible rule: **a client may extend an existing lease, never choose its length.**

| Transition | Who | Effect |
|---|---|---|
| Session created | `join_meet_queue` / match | column default → `expires_at = now() + 90 s` |
| Foreground, attended | `touch_meet_session` every 15 s | lease slides forward (server-side, only when < 60 s remain) |
| Backgrounded / process killed | nothing | lease lapses at `expires_at` |
| Lapsed, still read | every read path | reported as `ended` / `expired` immediately (lazy expiry) |
| Lapsed, swept | `expire_stale_meet_sessions` | row → `ended`, `end_reason='expired'`, both seats released |
| Explicit Leave / Next / Block | `leave_meet_session` | unchanged: immediate end |

Worst case for an abandoned app: **≤ 90 s** until the peer's reads stop trusting the session, plus ≤ 1 cron tick (~60 s) until the row is closed. The E3.0 finding was "forever".

## 2.2 Lazy expiry has one hard consequence — one trigger closes it

`meet_participants_active_one_idx` is `UNIQUE (profile_id) WHERE left_at IS NULL`. Between lapse and sweep the old participant row is still `left_at is null`, so a returning user would hit a **unique violation**, not a graceful rejoin.

`release_stale_meet_participation()` (`:78–104`) is a `BEFORE INSERT` trigger on `meet_participants` that closes that profile's participant rows whose session is `status <> 'active' or expires_at <= now()`. Insert time is the only choke point every path passes through: `join_meet_queue`, `poll_meet_queue`, `next_meet`, **and the peer being matched in** — which no caller-side fix could reach. `security definer`, `search_path = ''`, revoked from `public, anon, authenticated` (`:99`); only the trigger invokes it. Re-run safe (`drop trigger if exists`).

## 2.3 Every read path is lease-aware

| RPC | Behaviour on a lapsed lease | Line |
|---|---|---|
| `meet_session_is_live(id)` | the single predicate: `status='active' and expires_at > now()` | `:109–125` |
| `meet_has_active_session(profile)` | inlined to the same predicate, so a lapsed session can no longer block a new match | `:257–275` |
| `meet_session_payload(id, viewer)` | `status → 'ended'`, `endReason → 'expired'`, `endedAt → expires_at`; `peerConnected` forced false | `:278–337` |
| `get_meet_session(id)` | returns that payload (so history stays readable) | `:341–366` |
| `poll_meet_queue()` | matched session requires `expires_at > now()`; a `null` session id short-circuits instead of matching `p.session_id = null` | `:370–432` |
| `join_meet_queue(...)` | candidate filter requires a live lease, null-safe | `:435–551` |
| `send_meet_message(id, body)` | missing / ended / lapsed all raise `P0003 'session closed'` — one code, no existence oracle | `:566–582` |
| `list_meet_messages(...)` | participant (past or present) may still read history — deliberately **not** lease-gated, so a person can review what was said after hanging up | `:629–678` |
| `publish_meet_signal(...)` | participation (and `left_at is null`) checked **before** the session lookup; then active lease + `VIDEO`, else `P0003` / `P0004` | `:1091–1118` |
| `list_meet_signals(...)` | returns `{items: [], active: false}` for a lapsed session instead of an error | `:1184–1238` |

The sweep is idempotent and concurrency-safe: `for update skip locked`, ordered by oldest lease, predicate re-checked after locking, `where status = 'active'` on the update (`:159–202`). It rides the existing `cleanup_meet_signals` → `run_maintenance` → `clash-maintenance` cron (`:212–251`): **no new job, no redefinition of `run_maintenance`, no change to its summary keys**.


## 2.4 Heartbeat: extend, but never indefinitely

`touch_meet_session` (`:744–813`):

- `for update of s` on the session row, so two devices cannot interleave extensions;
- refreshes `meet_participants.last_heartbeat_at` (a column added by this migration; nothing reads it yet — it exists so a future "peer went quiet" UI has ground truth);
- extends **only when < 60 s remain**, so a 15 s cadence costs one write per ~minute, not four;
- extension is `least(now() + 90 s, created_at + 6 hours)` — the **6 h ceiling** (`:786–792`);
- if the capped extension lands in the past, it returns `active: false` immediately rather than handing back `active: true` with a dead lease (`:796–802`);
- unknown session and non-participant answer identically (`P0002`);
- ended/lapsed returns `{active: false, endReason, expiresAt}` — a **normal answer, not an error**, so the client can tell "your lease is gone" from "the network is down".

Rate limit `meet_touch`: 120 / 5 min (`:754`) — ~2.5 s of retry headroom around a 15 s cadence.

## 2.5 Reporting: reason-based, for the session *and* for a message

- `alter type public.report_reason add value if not exists 'child_safety'` (`:40`). Appended, never reordered: existing rows keep their value, and the new value sorts **last** server-side — the UI leads with it deliberately (§3.4), so presentation order is not the enum order.
- `report_meet_session(session_id, reason, detail?)` (`:860–899`) — any participation counts, including a participant who already left, so a person can report after hanging up. Detail capped at 500 chars (`P0004`).
- `report_meet_message(session_id, message_id, reason, detail?)` (`:904–958`) — the target the `meet_message` enum value always promised.
  - **Own messages, foreign sessions and unknown ids answer identically** (`P0002 'message not found'`, `:936–945`), so the RPC cannot be used to probe which message ids exist.
  - There is no "report yourself" success path: the sender is excluded by predicate, not by a client-side guard.
- **Reporting never ends the session.** Leaving stays explicit; otherwise reporting becomes a way to eject the other person.
- Both RPCs call `public.submit_report(target_kind, target_id, reason, detail)` — the existing moderation pipeline, unchanged — so Meet reports land in the queue staff already read.
- `meet_session_under_review(session_id)` (`:131–155`) is the retention contract E3.7 must call before deleting anything: true while an `open`/`reviewing` report points at the session **or at one of its messages**. Meet content is not deleted in this phase.

## 2.6 Block: authorization before disclosure

`block_meet_peer` (`:817–858`) now checks **participation before the peer lookup**:

```
participation check → peer lookup → block_profile(peer) → leave_meet_session(id, 'block')
```

Without that ordering, any signed-in caller who guessed a session id could block the stranger sitting in it, and the follow-up `leave_meet_session` would end a session they were never part of. Failure is `P0002 'session not found'`, indistinguishable from a bad id. Rate limit `meet_block`: 20 / 10 min.


## 2.7 Abuse limits introduced here

| Action | Budget | Window | Line |
|---|---|---|---|
| `meet_join` | 20 | 10 min | `:460` |
| `meet_poll` | 240 | 5 min | `:386` |
| `meet_session_read` | 300 | 5 min | `:354` |
| `meet_message` (send) | 40 | 10 min | `:570` |
| `meet_message_read` | 240 | 5 min | `:646` |
| `meet_leave` | 60 | 10 min | `:698` |
| `meet_touch` | 120 | 5 min | `:754` |
| `meet_block` | 20 | 10 min | `:830` |
| `meet_report` (session **and** message, shared budget) | 10 | 10 min | `:878`, `:923` |
| `meet_signal` (publish) | 120 | 10 min | `:1098` |
| `meet_signal_read` | 900 | 5 min | `:1200` |
| `meet_moderate_read` | 60 | 10 min | `:1002` |

`assert_rate_limit` raises **`P0001`**, which is deliberately **not** in `meetIsTerminalError` — clients back off instead of declaring a healthy session dead. Sharing one `meet_report` budget between both report RPCs means a user cannot double their reporting rate by switching target kind.

Signal payloads (M-11, `:1120–1171`): whole payload ≤ **16 KiB**, `sdp` ≤ 12 000 chars for `offer`/`answer`, non-empty `candidate` for `ice`, plus one-offer/one-answer and seat enforcement.

## 2.8 Grants and RLS — nothing new is reachable

| Class | Functions | Grants |
|---|---|---|
| Client-callable | `get_meet_session`, `poll_meet_queue`, `join_meet_queue`, `send_meet_message`, `list_meet_messages`, `leave_meet_session`, `touch_meet_session`, `block_meet_peer`, `report_meet_session`, `report_meet_message`, `moderate_meet_session`, `publish_meet_signal`, `list_meet_signals` | `revoke ... from public` → `grant ... to authenticated` |
| Internal only | `release_stale_meet_participation`, `meet_session_is_live`, `meet_session_under_review`, `meet_has_active_session`, `meet_session_payload` | `revoke ... from public, anon, authenticated` — **zero** client surface |
| Maintenance only | `expire_stale_meet_sessions`, `cleanup_meet_signals` | `service_role` |

`meet_moderation_reads` (`:964–980`): one row per staff read of a Meet transcript, no FK on `session_id` so the audit trail survives any future retention deletion. RLS enabled, `revoke all from public, anon`, `grant select to authenticated`, single policy `using (public.is_staff())` — a moderator sees reads, but only through RLS, and no client role can insert. `moderate_meet_session` (`:986–1075`) is staff-gated, rate-limited, writes its audit row **before** returning content (a failed read leaves no row, a successful one always does), and excludes signals (SDP/ICE, i.e. network addresses) from the evidence bundle.

No pre-existing policy, grant or table is weakened: every earlier `REVOKE`/`GRANT` is reproduced verbatim, tables stay RPC-only, nothing new is exposed to `anon`, and the migration ends with `notify pgrst, 'reload schema'` (`:1240`) so the new RPCs appear without a restart.


---

# 3. Client contract

## 3.1 Text: the lease is renewed only while the screen is attended

`hooks/useMeetChat.ts:245–298` — one `useEffect` owns the whole heartbeat, keyed on `[commitStatus, paused, ready, sessionGuard, sessionId, terminal]`, so every state that ends interest also tears the timer down.

| Behaviour | Implementation |
|---|---|
| Cadence | `MEET_HEARTBEAT_MS = 15_000` (`utils/meetLifecycle.ts:30`) |
| Stops when | not `ready`, `terminal`, `paused` (AppState), or no `sessionId` |
| Server says gone | `result.active === false` → `sessionGuard.invalidate()` + `commitStatus('expired' \| 'ended')`, no retry |
| Terminal codes | `meetIsTerminalError` (`P0002`/`P0003`/`42501`) → `ended`, no retry |
| Transient failure | strikes++ → `meetPollDelay(15 s, strikes, 20 s cap)` — backs off, never gives up silently |
| Pause | AppState non-`active` sets `paused`; effect cleanup clears the timer, `lastBeatRef` survives |
| Resume | `meetHeartbeatDue(lastBeat, now)` → beat at once if ≥ 15 s elapsed, else wait out the cadence |

Why the heartbeat stops in the background: that is exactly what makes an abandoned session **expire for the peer** instead of pinning them to the 6 h ceiling. The trade-off is accepted and stated: a user backgrounded for > 90 s returns to an ended session, not a resurrected one. There is no client-side path that extends a lease the server already dropped — `commitStatus` is absorbing on terminal states (`hooks/useMeetChat.ts:87–93`), so a late "active" payload cannot reopen the chat.

## 3.2 Video: one lease keeper, three call sites

`hooks/useMeetVideoSession.ts` was refactored from an inline `setInterval` into three callbacks (`:84–166`):

- `stopHeartbeat()` — clears the interval, idempotent; also called from `stopPoll()` (`:100`), so every existing teardown path stops the lease without a second copy of the logic;
- `beat()` — one `touch_meet_session`. `active: false` → stop beating, mark the session `ended`, `peerConnected: false`, transition `peer_left` (`:142–154`). Transient errors are swallowed **on purpose**: the server sweep is the backstop, and a flaky network must not hang up a working call;
- `startHeartbeat()` — no-ops when already running, when cleaned up, or when `meetVideoCallIsLive(stateRef.current)` is false (`:160–166`).

`meetVideoCallIsLive` (`utils/meetVideoSession.ts:66–74`) is the single definition of "worth renewing": `preparing | signaling | connecting | connected | reconnecting`. Excluded: `idle` (no session yet), `failed` and `ended` (must not hold a stranger's seat).

Three call sites, each with a reason:

| Site | Line | Why |
|---|---|---|
| After the session is fetched, **before** `getUserMedia` | `:238` | a 90 s lease must not lapse while the camera permission sheet is open |
| After the signaling/`connected` transition | `:331` | renews only once the call is real |
| AppState → `active` | `:373–376` | `startHeartbeat()` **and** an immediate `beat()`, so returning from background does not wait a cadence on a lease that may already be gone |

Backgrounding (`:361–380`) stops the heartbeat and disables local tracks; returning re-enables audio/video per the user's `micOn`/`cameraOn` and beats immediately, guarded by `meetVideoCallIsLive` so a call that already ended does not resurrect.


## 3.3 Reporting UI: one sheet, two surfaces

`components/meet/MeetReportSheet.tsx` is **presentation only** — a `Modal`, a scrolled list of reasons from `utils/meetSafety`, and Cancel. It never imports the service layer, which is what lets text and video share it without a second copy of the reason list.

**Text** (`app/explore/meet/[sessionId].tsx`): reporting is two steps and the reason is never pre-selected (`:130–156`).

| Entry | Target | Line |
|---|---|---|
| Long-press a **peer** bubble (400 ms, with `accessibilityHint`) | that message | `:237–242` |
| Own bubbles | gesture disabled — the server answers `P0002` anyway, so the affordance is not offered | `:240` |
| Menu → "Report stranger" | the session | `:224` |
| Sheet title | `Report this message` / `Report <peerAlias>` | `:338` |

Success shows `meetReportNotice(reason, 'message' | 'session')` in the existing notice slot (`:152`, `:270–274`); failure puts the RPC message in the error slot **and leaves the chat running** (`:153–155`).

**Video** (`app/explore/meet/video/[sessionId].tsx`): six hardcoded reason buttons in the "More" menu collapsed into one `Report` (`:246–254`) that opens the same sheet (`:260–266`). Reasons such as `child_safety` were previously unreachable on video — the six were hardcoded, so everything else folded into "other".

Report failure is now **surfaced** (`:142–158`, rendered at `:278`). The previous `catch { /* keep call up */ }` made a dropped safety report look sent. Copy stays vague on purpose (`Report not sent. Check your connection and try again.`) because server text can name internals, with one specific case: `P0001` (rate limit) → `Too many reports. Try again later.` The call is still never interrupted by a failed report.

## 3.4 Copy rules (enforced by test, not by review)

`utils/meetSafety.ts` holds the ordered list; `utils/meetSafety.test.ts` pins it:

1. **`child_safety` first** — it has to escalate fastest, so it is the first row a thumb reaches, even though the server enum sorts it last (appended at `:40`).
2. **`other` last**, labelled `Something else`, so nothing is unreportable.
3. Labels ≤ 40 chars, trimmed, no trailing period, all distinct — a 320 pt sheet cannot overflow or repeat.
4. `meetReportNotice` names the reason ("Report sent: Harassment or threats.") and distinguishes a message report from a session report, but **never** promises an outcome (`deleted|removed|banned|suspended|blocked|will be`) and never names the stranger (`peer|alias`), asserted per reason.
5. The subtitle states scope truthfully: *"Only the reason is sent. Moderators can read this conversation; the stranger is not told."*

`meetReportReasonLabel` falls back to `Something else` for `null`, `undefined` and unknown values, so a server-side enum addition can never render an empty row.

## 3.5 What the client deliberately does not do

- **No optimistic "ended".** A transient heartbeat failure backs off; only `active: false` or a terminal code ends the UI.
- **No client-chosen lease length.** `expiresAt` is parse-only (`services/meetService.ts:105–111` handles the ISO string); nothing sends it back.
- **No auto-report.** Two deliberate gestures: pick a reason, then confirm by choosing it — never a single tap.
- **No session end on report.** Both surfaces keep the call/chat alive after a successful report.


---

# 4. Tests

Runner is Node's built-in `node --test --experimental-strip-types` (`package.json → test:unit`), not Jest — there is no Jest config in this repo. All test files live under `utils/`; `tsconfig.json` excludes `**/*.test.ts` from `tsc`, so a type error in a test file is a test-run failure, not a typecheck failure.

## 4.1 Gates, re-run after the video-screen edit

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **exit 0**, no output |
| Full unit suite | `npm run test:unit` | **exit 0** — `tests 806`, `pass 806`, `fail 0`, `suites 194`, 16.0 s |
| Meet subset | `node --experimental-strip-types --test utils/meetLifecycle.test.ts utils/meetSafety.test.ts utils/meetVideoSession.test.ts utils/meetModes.test.ts` | **exit 0** — `tests 51`, `pass 51`, `fail 0`, `suites 15`, 0.7 s |
| Lint | — | **not applicable**: no `eslint.config.*` and no `lint` script; ESLint 9 exits 2 on any file |

`package.json` gains exactly one token (`utils/meetSafety.test.ts`); `utils/meetLifecycle.test.ts` was already listed. Both figures above were captured **after** the final video-screen edit in this phase, in the same working tree described in §1.

## 4.2 What the 51 Meet assertions actually lock down

`utils/meetLifecycle.test.ts` (31 tests / 10 suites):

| Suite | Covers |
|---|---|
| `meetChatStatus` | connected only while active **and** peer present; an ended session is terminal even if the payload still says connected; server `expired` maps to its own status |
| `meetStatusIsTerminal / meetCanSend` | only connected accepts writes; ended/expired terminal, live states not; **a stale "active" payload cannot revive a terminal chat** — this is the anti-resurrection guarantee §3.1 depends on |
| `meetQueueOutcome`, `meetActiveSessionChannel`, `meetPollDelay`, `createMeetRequestGuard`, `mergeMeetMessages`, `meetIsTerminalError`, `meetHeartbeatDue`, `meetCancelVsMatch` | backoff, guard, merge and heartbeat-due behaviour |

`utils/meetSafety.test.ts` (10 tests / 3 suites): enum-exact coverage; `child_safety` first; `other` last; labels ≤ 40 chars and distinct; label fallback; notice names the reason, distinguishes message vs session, and asserts per-reason that it never promises an outcome and never names the stranger.

`utils/meetVideoSession.test.ts` (6 tests / 1 suite): full state path `idle → preparing → signaling → connecting → connected`; cleanup idempotent from any terminal path; peer leave ends; signal id dedupe; ICE-disconnect reconnect; **"renews the lease only while a call is live"** — the `meetVideoCallIsLive` contract.

`utils/meetModes.test.ts` (4 tests / 1 suite): four product modes, interest vocabulary, deterministic seat A, TEXT/VIDEO separation.

## 4.3 Coverage that does **not** exist (stated, not implied)

| Surface | Unit tests | Why |
|---|---|---|
| `hooks/useMeetChat.ts` heartbeat effect | none | no React hook test harness in this repo (`react-test-renderer` absent); logic was factored into `utils/meetLifecycle` precisely so the decidable parts are testable, but the timer wiring is review-only |
| `hooks/useMeetVideoSession.ts` `beat`/`startHeartbeat` | none | same reason; state-machine parts are covered, the call sites are not |
| `components/meet/MeetReportSheet.tsx` | none | presentation only, no branching beyond `visible` |
| `app/explore/meet/*` screens | none | no screen tests exist anywhere in the repo |
| **Server migration** | **none** | there is no `supabase/tests/097_*.sql` for this migration; the newest is `096_clash_notification_dedup.sql`. §5 |

That last row is the honest gap in this deliverable: the client contract is tested, the server contract is **reviewed** and not executed.


---

# 5. What was not executed, and what was checked instead

## 5.1 Not executed

| Item | Status | Why |
|---|---|---|
| Apply the migration (`supabase db reset` / `db push`) | **BLOCKED** | out of scope for this phase — no DB writes, migrations are not applied here |
| pgTAP (`npm run supabase:test`) | **BLOCKED, and the file does not exist** | `supabase/tests/` stops at `096_clash_notification_dedup.sql`; there is no `097_*` for Meet safety. The 375-line `036_meet_text_matching.sql` and `037_meet_video.sql` cover the earlier phases only |
| Contract/concurrency tests for the new RPCs | BLOCKED | same dependency |
| Two-device smoke (matching, expiry, report, block) | **BLOCKED** | needs a native rebuild (`react-native-webrtc`) and two signed-in devices |
| Observing a `clash-maintenance` tick | BLOCKED | needs a running database |

## 5.2 Static checks actually performed, and the failure each rules out

| Check | Result |
|---|---|
| Enum change inside the migration transaction | `'child_safety'` appears **only** at `:40`; no other statement in the file uses the literal, so PG ≥ 12's "unsafe use of new value" (`55P04`) cannot fire |
| Signatures of replaced RPCs vs. earlier migrations | identical arg lists (`get_meet_session(text)`, `list_meet_messages(text,int,timestamptz)`, `leave_meet_session(text,text)`, `block_meet_peer(text)`, `report_meet_session(text,report_reason,text)`) → true replacement, no silent overload that would make PostgREST ambiguous |
| Return types of replaced functions | unchanged (`jsonb`, plus `meet_session_payload` and `cleanup_meet_signals` still `integer`) → no `42P13` |
| Idempotency | `add column if not exists`×2, `drop trigger if exists`, `create or replace`, `add value if not exists`, and the sweep's `where status = 'active'` |
| `meet_message` target kind | pre-exists at `20261004140000:22`; this migration does not invent it |
| Cron reachability | `run_maintenance` is defined at `20261004150000:711` and redefined at `20261005130300:255` and `20261005140000:743` — all three call `cleanup_meet_signals(p_limit)`, so replacing the callee reaches the newest definition without touching it |
| Client type surface | `database.types.ts` updated for the three new RPCs + `expires_at`; `tsc --noEmit` exit 0 proves every call site matches |

## 5.3 Assumptions only a DB run can settle

1. The `BEFORE INSERT` trigger fires before the partial unique index is enforced (it must — row triggers precede index insertion — but this is reasoned, not observed).
2. `for update skip locked` + `limit` inside the `doomed` CTE drains a backlog rather than skipping rows under contention.
3. `meet_moderation_reads`' FK-less `session_id` genuinely survives a future session delete (by construction, unverified against E3.7's actual delete).
4. Nothing in the app relied on `get_meet_session` reporting `status:'active'` for a lapsed session; the only reader is `toSession` → `Meeting` status.

If a reviewer considers any of these security-critical rather than cosmetic, §8's GO does not cover it.


---

# 6. Risks, accepted trade-offs, nits

## 6.1 Risks carried into merge

| # | Risk | Severity | Assessment |
|---|---|---|---|
| R1 | New server contract has **no executable test** | medium | The client cannot enforce any of it. Mitigation is a pgTAP file before deploy (§8). This is the single largest item in this report |
| R2 | Session-expiry counts are invisible to monitoring | low | `cleanup_meet_signals` returns the **signal** count; expired sessions only appear in a `raise notice` (`:245–247`), so `run_maintenance`'s summary does not show them. Deliberate — changing the return would alter an existing summary contract |
| R3 | A genuinely attended 6 h call is ended mid-sentence | low | `touch_meet_session` caps at `created_at + 6 h` (`:786–792`). Accepted: an unbounded cap is the bug this phase exists to fix |
| R4 | Backgrounding > 90 s ends the session | low, by design | The peer must not be pinned by an app that is not on screen. Copy exists: `Conversation expired` / `This conversation expired. Nothing else can be sent.` (`app/explore/meet/[sessionId].tsx:56,64`) |
| R5 | A report can arrive after the session lapsed | low | Allowed on purpose: participation, not liveness, authorises reporting — otherwise the only moment you can report is while still trapped with the person |

## 6.2 Nits found during review (not fixed — out of phase scope)

| # | Where | Issue | Suggested fix |
|---|---|---|---|
| N1 | `app/explore/meet/video/[sessionId].tsx:272` | Sheet subtitle says *"Moderators can read this conversation"* — a video call has no messages | `"Moderators can review this call; the stranger is not told."` |
| N2 | `app/explore/meet/video/[sessionId].tsx:277–278` | `video.error` and `reportError` share `styles.err` and can stack as two lines | Clear `reportError` when a new call-level error appears |
| N3 | `hooks/useMeetChat.ts` heartbeat | The 15 s cadence is asserted only through `meetHeartbeatDue`, never through the timer itself | Accept, or add a hook harness in a later phase |
| N4 | Report-reason ordering | UI order (`child_safety` first) differs from server enum order (`child_safety` last) | Intentional; documented in §3.4 so a future reader does not "fix" it |
| N5 | `supabase/migrations/20261022120000_…:966` | `meet_moderation_reads.moderator_id … on delete cascade` — deleting a staff profile also deletes their read-audit rows | Acceptable while staff accounts are never hard-deleted; revisit if offboarding ever deletes profiles |

## 6.3 Manual review still owed before merge

Judgement calls no command can settle:

- [ ] Long-press a **peer** bubble → sheet titled `Report this message`; long-press an **own** bubble → nothing happens.
- [ ] Pick a reason → `Report sent: <reason>.` and the chat keeps working.
- [ ] Force a failure (airplane mode) → *"Report not sent…"* appears; the chat keeps working.
- [ ] Report 11× → *"Too many reports. Try again later."* (P0001 path), not the generic copy.
- [ ] Video **More → Report** opens the same sheet; the call keeps running afterwards.
- [ ] No screen, notice or error reveals the peer's pseudonym, id, or raw server text.
- [ ] `child_safety` is the first row on a 320 pt device and reachable without scrolling.


---

# 7. Rollout

## 7.1 Order is not optional

`database.types.ts` and three service wrappers (`touchMeetSession`, `reportMeetMessage`, `MeetReportReason`) already assume the new RPCs exist. Therefore:

1. **Migration first** — `supabase/migrations/20261022120000_meet_safety_and_lifecycle.sql`.
2. **Then the app build.**

Shipping the build first is survivable but degraded: `beat()` swallows transient errors (`hooks/useMeetVideoSession.ts:151–153`) and the text heartbeat backs off (`meetPollDelay`), but `reportMeetMessage` would fail visibly on **every** message report. Hence the order.

## 7.2 Applying it

```powershell
# local, full replay — this is what would settle §5.3
npm run supabase:start
npm run supabase:reset        # node scripts/supabase-reset.mjs
npm run supabase:types        # only if database.types.ts drifts

# hosted
npx supabase db push --dry-run
npx supabase db push
```

Verify by query, not by eye:

```sql
select proname, pronargs
  from pg_proc
 where proname in ('touch_meet_session', 'expire_stale_meet_sessions',
                   'report_meet_message', 'meet_session_under_review',
                   'release_stale_meet_participation');

select public.expire_stale_meet_sessions(10);  -- sweep is reachable + callable
```

## 7.3 What the migration does to live data

- Adds `expires_at` **not null default `now()+90s`** to every row, then clamps pre-existing **active** rows to at most 2 minutes out (`:59–61`). Any Meet session open at deploy time is swept within ~2 ticks. That drain is intended — but it means **deploy during low traffic**.
- Adds `last_heartbeat_at` (nullable); nothing reads it yet.
- No row is deleted, no column dropped, no policy relaxed.

## 7.4 Rollback

| Layer | Rollback | Cost |
|---|---|---|
| App | revert the commit | free — the old build stops heartbeating, every session then expires at 90 s (worse UX, still safe) |
| Server | **not** a plain revert | `expires_at` is `not null` with a default; old code never extends it, so restoring the old *functions* alone leaves every session ending after 90 s |

If the server must be rolled back: drop the sweep from the maintenance path, restore the previous function bodies, and only then `alter table public.meet_sessions alter column expires_at drop not null;`. Do **not** drop `meet_moderation_reads` — it is audit evidence.

---

# 8. Verdict

**Merge: GO.** Typecheck and the full unit suite pass after the final edit (`tsc` 0, 806/806); the client contract is pinned by 51 Meet assertions; the failure paths added in this phase are visible instead of silent.

**Deploy: CONDITIONAL GO.** Two conditions, in order:

1. Migration applied before the build (§7.1).
2. A `supabase/tests/097_meet_safety_and_lifecycle.sql` covering lease lapse, re-join after lapse, `P0002` symmetry on both report paths, and block-before-peer-lookup — because the entire server contract of this phase is currently review-only (§5.1, R1).

**Explicitly not claimed:** this report does not assert that the migration has ever been executed, that any database assertion passed, or that the two-device smoke was performed. Those are BLOCKED in §0 and §5 and remain owed.

