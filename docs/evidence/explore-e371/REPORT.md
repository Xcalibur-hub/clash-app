# E3.7.1 — Meet typing indicator root-cause investigation

24 October 2026. Branch `arena-ui-review`; HEAD at investigation start **d5426593d1cc0666ce9e5219fb2ad88e684c19b9**.

**Overall: PASS (offline root-cause + client fix).** Confirmed why A50 never showed `Typing...` despite healthy `set_meet_typing` / `get_meet_typing` RPCs in E3.7.0. Applied the smallest justified client-side fix. Offline TypeScript and focused typing tests **PASS**. **Native A50 re-acceptance remains outstanding** (no new sessions, no device writes in this task).

Read `.clinerules`, [E3.7.0](../explore-e370/REPORT.md), `CLASH_SPEC.md`, and E3.1 lifecycle notes in [explore-e31](../explore-e31/REPORT.md).

## Confirmed root cause

Failure boundary is **client-side**, after successful backend typing RPCs and before UI `peerTyping` rendering.

| Layer | E3.7.0 observation | Boundary |
|---|---|---|
| Composer → `notifyTyping` → `broadcast()` | A→B: B `get_meet_typing.typing===false` after A50 `adb input text` | Writes were no-ops unless Realtime status was `SUBSCRIBED` |
| `set_meet_typing` / `get_meet_typing` | Isolated SDK probe **PASS** with dual heartbeat (`validForMs≈5987`) | Backend + lease OK when exercised directly |
| Private Realtime `meet-typing:` hint | Host B subscribe **timed out once**; A50 never showed `Typing...` | Hint path flaky; was incorrectly treated as required for all I/O |
| `get_meet_typing` → `onPeer` → status `Typing...` | A50 UI `typingVisible:false` while status stayed `Connected` | Authoritative poll also required `connected===true`, so no fallback |
| Hook subscription lifetime | Session poll every 4s + heartbeat extends `expiresAt` | `typingLease` was an effect dependency → full channel teardown/resubscribe on each lease extension |

**Precise defect (two cooperating bugs):**

1. **`utils/meetTyping.ts` gated both writes and authoritative reads on Realtime `SUBSCRIBED`.** Broadcast is only a hint (`realtime.send` empty payload). When the private channel was slow, errored, or not yet subscribed, `broadcast()` returned without calling `set_meet_typing`, and `refresh()`/4s poll never called `get_meet_typing`. That matches E3.7.0: RPC probe PASS, A50 UI FAIL, A→B never published.

2. **`hooks/useMeetChat.ts` recreated `subscribeMeetTyping` whenever `session.expiresAt` changed.** Heartbeat lease extensions therefore tore down the private channel mid-chat, reset `connected` to false, and widened the window where (1) blanked indicators.

Not root cause: participant identity mapping in broadcast payloads (payloads are ignored by design); three-second idle clear logic (works once writes are allowed); status-line rendering (`peerTyping` → `Typing...` is correct when state flips).

## Code changes

| File | Change |
|---|---|
| `utils/meetTyping.ts` | `broadcast`/`clear` no longer require `connected`. `refresh`/poll run without `SUBSCRIBED`. Immediate first authoritative read on start. `setConnected` is a no-op when status unchanged (avoids redundant generation bumps). Channel drop still hides, clears **our** typing, and bumps generation so late reads cannot revive stale TTLs; subsequent polls can restore **peer** typing. |
| `hooks/useMeetChat.ts` | Subscribe on `typingLeaseAlive` (boolean), not raw `expiresAt`. Separate deadline timer updates when the lease extends **without** recreating the Realtime subscription. |
| `scripts/meet-typing.test.cjs` | Regression coverage for A publish before subscribe, B→A via poll without subscribe, idle clear without channel, channel-error poll recovery, lease-extension subscription stability, notifyTyping then Leave teardown. |

No backend, migration, RLS, schema, native project, or unrelated UI edits. Existing uncommitted Meet UI fixes preserved.

## Offline verification

| Check | Result |
|---|---|
| `node --test scripts/meet-typing.test.cjs` | **PASS 41/41** (was 35; +6 focused regressions) |
| `npx tsc --noEmit` | **PASS**, exit 0 |
| `git diff --check` on touched sources | **PASS**, exit 0 (LF/CRLF warnings only) |

## Back versus Leave (report only — no lifecycle change)

| Control | Code path | Spec intent |
|---|---|---|
| Header **Back** | `router.back()` only in the screen | E3.1 (`explore-e31`) intentionally ends the session via **unmount** → `leaveMeetSession` once (`leftRef`-guarded). Same as swipe-back / stack pop. |
| Menu **Leave chat** | `chat.leave()` then `router.replace('/(tabs)/explore')` | Explicit leave + navigate to Explore. |
| `CLASH_SPEC.md` | No Meet-specific Back/Leave clause | Product lifecycle rules live in the E3.0/E3.1 Explore evidence, not a named CLASH_SPEC Meet section. |

**Verdict: intentional, not a product defect.** Back is navigation; Leave is the labeled end action; both are supposed to terminate the server session (Back via unmount leave). E3.7.0’s “Back ≠ Leave” observation means the session stayed active after a Back in that harness — treat as a **possible navigation/unmount or silent leave-RPC failure to retest**, not as approval to change lifecycle here. No Back/Leave behavior was modified in E3.7.1.

## Remaining native acceptance

Out of scope for this task (no new sessions / device writes):

1. Reload Metro bundle with this fix onto SM-A505F.
2. Authorized A/B TEXT fixture: confirm A50 shows `Typing...` for B→A and that A composer keystrokes publish `set_meet_typing` for B.
3. Idle clear, background/foreground, reconnect, and Leave teardown on device.
4. Confirm Back still ends the session via unmount leave (or file a separate lifecycle defect if it does not).

## Safety

- No new Meet sessions, database writes, migrations, RLS changes, account operations, or backend modifications.
- No native rebuild, reinstall, push, merge, or deployment as part of the investigation commands below commit policy.
- Tokens/passwords not logged.

**STOP.**
