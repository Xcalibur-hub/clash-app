# DEEPSEEK HANDOFF AFTER CODEX PHASE 9 — Minimal Path to One A50 Run

**READ-ONLY.** No controller launch, Auth/OTP, gateway, database, fixture, ADB, key or
signing operation was performed. No commit, push or cleanup.

Codex handed back with Phase 8 and Phase 9 local and uncommitted. This report
verifies what is actually on disk and identifies the shortest safe path to one run.

---

## 1. Phase 8 / 9 source verification — **PARTIAL**

| Check | Result |
|---|---|
| Branch `arena-ui-review`, HEAD `2b89874`, index empty | **PASS** — unchanged |
| Phase 8 product files present | **PASS** — `app/auth.tsx`, `app/arena/room/[roomId].tsx`, `DuelRoomOutcome.tsx`, `useLiveArenaRoom.ts`, `clashEngineService.ts`, `liveArenaService.ts` all modified in tree |
| Phase 9 mid-window arming | **PASS** — `window_closed` / `insufficient_window:<step>` / `authorization_expires_before_plan_end`, `lateStart` recorded |
| Phase 9 digest binding | **PASS** — gate receives the computed `planDigest`; `artifact_budget_exceeds_signed` / `artifact_attempts_exceed_signed` enforced |
| Transport fencing | **PASS** — unparsable/mismatched/transport outcomes fence the session |
| `load-recover` = Auth recovery | **PASS** — classified `auth`; source confirms credential load + 2× `generateLink` + `verifyOtp` |
| Screenshot preservation | **PASS** — capture fails unless bytes are non-empty and persisted |
| Arena tests | **PASS** — 170/170 |
| TypeScript | **PASS** — exit 0 |

**Score:** source matches the Phase 9 report. Marked PARTIAL only because of §2.

---

## 2. Remaining hard blockers

### B1 — The runner is not connected to any controller (hard)

`arena-acceptance-runner.cjs` imports the scheduler, authorization and journal — but
**not** `arena-acceptance-process.cjs` or `arena-acceptance-adapters.cjs`. A repository
search shows both modules are imported **only by tests**:

```text
arena-acceptance-adapters.test.cjs
arena-acceptance-integration.test.cjs
```

There is no production composition that turns scheduler steps into controller commands.
The scheduler, the session and the adapters are all correct in isolation and have never
been joined. **This is the single thing standing between CLASH and a run.**

### B2 — No UI outcome verification (hard for acceptance meaning)

A device tap returns bare `{ ok: true }`. No `assertVisible` / `expectText` / UIAutomator
assertion helper exists anywhere in `scripts/lib`. The Phase 9 rule "a successful tap must
never count as voting or navigation" is honoured in the adapter, but nothing yet *proves*
the screen changed. Evidence would be screenshots only, interpreted manually.

### B3 — Fresh-run template omits `broadcast`

Template lists 18 commands; the controller has 19. `broadcast` is a **mutation** and is
absent from the template. Its budgets are otherwise consistent (ballot spend 2 / attempts 4
correctly models the two duplicate rejections). Not fixed here — per instruction, no silent
permission changes.

### B4 — Unverified against reality

No controller process has ever been launched; HMAC key is process-local; no reconciler
exists for uncertain writes; tap coordinates are placeholders.

---

## 3. Exact next minimal action

**Write one composition module** (`scripts/lib/arena-acceptance-compose.cjs`, ~60 lines)
that binds:

```
createControllerSession({ scriptPath, cwd })
  → createControllerAdapter({ spawn: session.spawn })
  → step handlers keyed by command name
  → createRunner({ handlers, journalFile, authorization, artifactLoader, approvalKey })
```

plus a dry-run validation of the resulting handler map against the template's operation
list. That closes B1 with no new infrastructure and no new tests beyond one offline check.

Add `broadcast` to the template's operations (a template change, not a permission change).

---

## 4. Can controller startup be separated from fixture creation? — **YES**

Verified in source: `preflight` contains **zero** `create_take` / `create_arena_challenge`
references. The controller's command surface is ordered so startup can be exercised alone:

| Phase | Commands | Effect |
|---|---|---|
| Startup only | `preflight`, `status`, `snapshot` | no fixture, no credentials |
| Credential/Auth | `load-recover` | **not** read-only — see §5 |
| Fixture | `create` → `accept` → `gateway` | creates the duel |

A controlled startup preflight (`preflight` + `status` + `snapshot`, then `close-actors`)
is therefore **safely separable** from fixture creation. It requires the controller to
reach `ready` — which is exactly the handshake that has never been exercised.

---

## 5. Explicit owner approvals required

1. **Startup preflight launch** — one controller session, commands limited to
   `preflight`, `status`, `snapshot`, then `close-actors`. No fixture, no Auth. This
   confirms B4's handshake.
2. **`load-recover` approval** — separate and explicit. It loads credentials and issues
   magic links + OTP for A, B and D. It is Auth recovery, not a read.
3. **Key provisioning** — `CLASH_ARENA_APPROVAL_KEY` supplied out-of-band; never
   committed or logged.
4. **Signed artifact** — produced **after** the plan is fixed, pinning the computed plan
   digest plus budgets and attempt caps.
5. **Fresh bounded run authorization** — actors, link/OTP allowances, one gateway
   replacement, ~40 minutes ADB control, hard expiry.
   **The 5 November authorization is spent and must not be reused.**
6. **Device consent** — scripted taps, text entry and screenshots.

If UI outcome verification (B2) is required for the run to *mean* anything, it should be
authorized as part of item 5 rather than treated as optional evidence review.

---

## 6. Preservation — confirmed

- Branch `arena-ui-review`, HEAD `2b898748a48e317ac5737da62c7a964f50aca2a8`, index empty.
- Working tree 318 entries; Phase 8/9 changes present and untouched by this task.
- Both execution directories under `.expo/active-arena-a50-execution` intact; the settled
  DRAW and the unsettled partial duel were neither read destructively nor modified.
- The published C1/C2 checkpoint (`36d5611…` on `dev/checkpoint-c1c2-20261106`) was not
  touched, merged or reconstructed.

---

## Verdict

# **PARTIAL**

Everything Codex built is present and correct. The runner, however, is **not yet wired to
the controller** — that is the one remaining hard blocker, and it takes roughly one small
module plus a template line to close.
