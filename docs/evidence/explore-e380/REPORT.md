# E3.8.0 — Meet production readiness audit

24 October 2026. Branch `arena-ui-review`; local HEAD **d51467c3958735bb640065da8bc6dad11561f374**.

**TEXT-only public launch: NO-GO. Overall Meet (incl. video): NO-GO.** Isolated QA has proven private typing + one-device Samsung TEXT acceptance through E3.7.2, but retention/legal-hold enforcement, release-target maintenance, old-client rollout controls, committed UI freeze, two-device native coverage and ops/backup gates remain open. This audit is **read-only**: no source, migration, database, fixture, infrastructure, push, merge or deployment actions.

Read `.clinerules`, `CLASH_SPEC.md` (no Meet-specific launch checklist beyond general compliance note §1125), and evidence E3.5 → E3.7.2 ([explore-e35](../explore-e35/REPORT.md) … [explore-e372](../explore-e372/REPORT.md)), with E3.0/E3.1 lifecycle context.

## 1. Repository / test state (verified)

| Item | Finding |
|---|---|
| HEAD | `d51467c` — `docs(meet): E3.7.2 Samsung typing acceptance PASS` |
| Branch vs `origin/arena-ui-review` | **Ahead by 1** (E3.7.2 evidence commit not pushed; intentional from E3.7.2 restriction) |
| Typing fix in ancestry | **Yes** — `bd05d66` (`fix(meet): restore typing indicators without Realtime subscribe gate`) |
| Uncommitted Meet UI | **Dirty** — `app/explore/meet/[sessionId].tsx`, `components/meet/MeetButton.tsx` hold E3.6.x keyboard/safe-area/Back contrast work accepted natively in E3.6.7 but **not committed** |
| Uncommitted layout tests | `scripts/meet-layout.test.cjs` (and related inspection helpers) untracked |
| Evidence hygiene | Large E3.5–E3.7.0 report trees remain **untracked** locally (e.g. e35, e354–e370, e366/e367); only selected later reports (e.g. e351, e371, e372) are tracked |
| Offline typing suite (prior) | E3.7.1: `meet-typing.test.cjs` **41/41 PASS**; tsc PASS — not re-executed in this read-only audit |
| Production target | **Not inspected** this phase (no DB/infra contact) |

## 2. Verified completed requirements

### Security / private typing (server + client)

- Additive private typing API (`set_meet_typing` / `get_meet_typing` / `meet_typing_allowed`), `typing_until`, restrictive Realtime policies — migration `20261023140000`; SQL + runtime PASS on disposable backends (E3.5.3/E3.5.4/E3.5.7).
- Anonymous Meet RPC grant revocation (E3.4.3 / `20261023130000`).
- Client fails closed when typing RPCs absent: no public Presence fallback (E3.5.1).
- E3.7.1: typing writes/authoritative reads no longer gated on Realtime `SUBSCRIBED`; lease extensions no longer recreate the channel.
- E3.7.2 Samsung A50: B→A `Typing...`, A→B SDK observe, idle clear, RT-disconnected poll path, lease stability, Leave reject — **PASS** on e357.

### Lifecycle / moderation building blocks

- Client Leave-on-unmount + heartbeat lease model (E3.1); server `expires_at` + `expire_stale_meet_sessions` via `cleanup_meet_signals` → `run_maintenance` (lifecycle migration).
- Report / staff evidence / moderation audit retention guards (E3.2.x / `20261023120000`) — append-only style protections for audit rows.
- Isolated e357 stack: 111 migrations, Realtime partitions, A/B/C fictional accounts (E3.5.7).

### Native TEXT UX (single A50, isolated backend)

- Keyboard dismissal / KAV remount (E3.6.6/E3.6.7) **PASS** on SM-A505F (via Metro-delivered uncommitted UI).
- E3.7.0: two-way fictional messaging, ordering, reconnect, history+keyboard, C denial **PASS** (typing UI then failed; fixed in E3.7.1/2).
- Dark Back contrast + Android top inset present in the uncommitted Meet screen diff (addressing E3.5.9 findings).

### Explicitly out of TEXT launch scope (still incomplete for “overall Meet”)

- WebRTC media path, TURN relay, age/video safety GA — **NO-GO** since E3.0/E3.5; unchanged.

## 3. Remaining blockers (ranked)

### P0 — must clear before any public/shared TEXT launch

| ID | Blocker | Why |
|---|---|---|
| P0-1 | **Retention / legal-hold / message purge not implemented** | E3.5 proposed 7-day unreported message TTL, holds, appeal windows; source still has no hold registry or scheduled message/session purge. `meet_session_under_review` is open/reviewing reports only. Account-deletion cascade can remove participant evidence before case closure (E3.5 §3). Launch without this is a privacy/compliance defect, not a polish gap. |
| P0-2 | **Release-target maintenance not proven** | `clash-maintenance` → `run_maintenance` exists in migrations; e357 QA had `cron.launch_active_jobs=off`. No verified production/staging tick lag, alerting, or partition automation on the **intended** launch database. |
| P0-3 | **Old-client / minimum-version policy undecided and unenforced** | Heartbeat-less clients die ~90s; mixed peers can keep a shared lease alive (E3.5 §2). New typing RPCs: old Presence clients get **no** indicator (fail closed) but can still chat until lease rules bite. No Meet min-version gate in inspected paths. |
| P0-4 | **Launch client not frozen in git** | Keyboard/safe-area/Back fixes that A50 accepted remain **uncommitted**. Cannot ship a reproducible release binary from HEAD alone. |
| P0-5 | **Owner product/legal decisions still open** | Retention windows, hold authority, shared vs per-peer attendance, child-safety escalation (E3.5 §7 step 1). `CLASH_SPEC.md` defers platform legal review; it does not replace these decisions. |

### P1 — required before claiming production TEXT readiness (even limited cohort)

| ID | Blocker | Why |
|---|---|---|
| P1-1 | **No true two-device native TEXT acceptance** | E3.7.0/2 used A50 + host B SDK. Physical A↔B phones, carrier NAT, and dual-OS matrix unproven. |
| P1-2 | **Matchmaking / queue native path not re-certified on private-typing stack** | Fixtures used trusted `meet_create_session`; A02–A03 from E3.5 checklist still open for current client+111. |
| P1-3 | **Block / report / staff evidence native path incomplete on current stack** | SDK Block/Leave/expiry PASS in E3.5.4; A50 menu Leave and full report UX not acceptance-closed in E3.7.2. |
| P1-4 | **Ops: monitoring, backups, restore-with-holds, rollback sequencing** | No redacted SLOs, backup rotation proof, or restore drill that reapplies deletion/holds (E3.5 §4/§7). |
| P1-5 | **Evidence / branch publish hygiene** | Critical E3.5–E3.7.0 reports largely untracked; `d51467c` not on origin. Audit trail incomplete for external review. |
| P1-6 | **Back vs Leave edge** | Spec intent (E3.1): Back → unmount → leave. E3.7.0 observed Back without end once; E3.6.5/7 observed leave. Needs one deliberate native retest on frozen build before support docs claim equivalence. |

### P2 — important but not TEXT-launch-blocking if P0/P1 owned

| ID | Blocker | Why |
|---|---|---|
| P2-1 | TalkBack / full-region hit certification | Bounds improved; full a11y traversal not claimed. |
| P2-2 | Realtime message transport scale (E3.0 E3.6) | TEXT still RPC-poll based; acceptable for limited launch if load-tested; not a privacy P0. |
| P2-3 | `typing_until` physical cleanup | Reads respect TTL; column not swept by maintenance — low risk. |
| P2-4 | Video / TURN / age gate | Required for **overall Meet GO**, not TEXT-only. |

## 4. Old-client compatibility with new typing RPCs

| Client | Messaging | Typing indicator | Lease |
|---|---|---|---|
| Current (E3.7.1+) | Poll RPCs | Private hint + `get_meet_typing` (works without SUBSCRIBED) | 15s heartbeat |
| Old (pre-private-typing) | Poll RPCs if grants match | **No indicator** (Presence removed; RPCs missing → fail closed) | If no heartbeat: ~90s death |
| Mixed current + old | Works while shared lease renewed by current peer | One-sided or absent indicators | Old peer may appear “present” via shared lease |

**Conclusion:** Safe fail-closed for typing privacy; **unsafe to enable Meet for unknown store cohorts** without min-version enforcement or an explicit, disclosed short-session policy and staged drain (E3.5).

## 5. Maintenance / Realtime partitions / typing state

| Mechanism | Code | Production readiness |
|---|---|---|
| Expire stale sessions + cancel old queue + signal cleanup | `cleanup_meet_signals` / `expire_stale_meet_sessions` | Logic present; **scheduled execution on launch DB unverified** |
| Typing | Server TTL ≤6s; client poll/clear | No dedicated sweeper needed for correctness; optional null scrub P2 |
| Realtime partitions | Managed + QA init (E3.5.7) | Launch target must show **current + forward** partitions and ownership |
| Message retention job | **Absent** | P0-1 |

## 6. Auth, RLS, rate limits, unauthorized access

| Control | Status |
|---|---|
| Auth getUser / fictional A native + B SDK | Proven on e357 (E3.5.9 / E3.7.2) |
| Anon Meet RPC execute | Denied (E3.4.3 evidence) |
| Private `meet-typing:` join for C/anon | CHANNEL_ERROR / 42501 (E3.5.4/E3.5.7) |
| Typing write/read rate limits | 60/min write, 120/min read in migration |
| Unrelated C message/session access | Denied in E3.7.0 |

Residual: production JWT revocation contract, refresh during long TEXT sessions, and hosted RLS parity — verify on **release target**, not only e357.

## 7. Reconnect, expiry, Leave, account isolation

| Scenario | Best evidence | Gap |
|---|---|---|
| Typing reconnect / delayed subscribe | E3.7.2 A50 PASS (B RT down) | Dual-phone OS reconnect |
| Session expiry | E3.5.4 SDK PASS | Native A50 wall-clock expiry matrix (E3.5 A06/A07) |
| Leave + reject | E3.7.2 SDK A leave PASS | Explicit A50 Leave-menu press optional |
| Account switch isolation | E3.5.4 PASS | Native account switch on device |
| Block | E3.5.4 SDK PASS | Native Block on A50 |

## 8. Ops / backup / rollback / deployment sequencing

Not established for a shared production project in this audit. Required before GO (from E3.5 §7): exact target identity, 111-ledger lineage, effective grants, cron ticks, secrets handling, backup rotation, restore that reapplies holds/deletes, drain plan for active sessions when enabling lifecycle, kill-switch for new Meet entry. Quarantined/hosted legacy projects remain excluded.

## 9. TEXT vs WebRTC/video/TURN

| Surface | Launch posture |
|---|---|
| Meet **TEXT** | Functionally close on isolated QA; **blocked for public GO by P0** (retention, cron target, client freeze, old-client policy) and P1 (two-device, matchmaking, ops). |
| Meet **VIDEO** | **Separate NO-GO**: empty TURN config, no relay acceptance, age/video safety, two-way media teardown (E3.0 E3.3, E3.5 A08–A10). Do not couple TEXT launch to video GA. |

## 10. Incomplete Samsung / multi-device acceptance

| Gap | Notes |
|---|---|
| Single device only | SM-A505F + SDK B; no second physical phone |
| Matchmaking UI | Not re-run for E3.7.x stack |
| Full E3.5 A01–A13 | Many still NOT TESTED / blocked on retention |
| Store build | Dev client + Metro only; no release-signed binary acceptance |
| Light theme active keyboard | Previously blocked when theme switch ended session (E3.6.x) |

## 11. Smallest safe implementation sequence

1. **Owner decisions (no code):** approve retention/hold/appeal table; min-client or disclosed old-client policy; shared-lease attendance; TEXT-only cohort scope.  
2. **Commit & freeze TEXT UI** (keyboard/safe-area/Back + layout tests) on `arena-ui-review`; tag a release candidate hash.  
3. **Authorized retention + legal-hold migration + jobs** (narrow, hold-aware purge; account-deletion evidence rules); pgTAP + dry-run counts.  
4. **Release-target preflight:** ledger 111, RLS/grants, cron on, partitions, backup/restore drill.  
5. **Closed cohort acceptance:** two physical devices; matchmaking; messaging; typing; Leave/Block/report; lease matrix on the frozen build against the real target (or exact staging clone).  
6. **Limited opt-in TEXT** with monitoring (cron lag, lease ends, report integrity, purge backlog) and a verified Meet entry kill-switch.  
7. **Defer video** until TURN + age policy + two-way media acceptance (separate program).

Do **not** lengthen leases, restore anon grants, weaken typing RLS, or skip holds to force a GO.

## 12. Verdicts

| Question | Verdict |
|---|---|
| Verified TEXT engineering on isolated QA? | **Yes** — private typing + E3.7.2 A50 acceptance are real. |
| **TEXT-only public/shared production launch?** | **NO-GO** until P0-1…P0-5 are closed and P1 cohort acceptance exists. |
| Closed internal pilot on disposable infra with explicit owner risk acceptance? | **Conditional only** — not a production GO; still requires committed UI freeze and written acceptance of retention/cron gaps. |
| **Overall Meet (TEXT + video)?** | **NO-GO** — video/TURN/age remain blocking independent of TEXT. |

**Bottom line:** Meet TEXT is no longer blocked on typing-indicator engineering, but it is still blocked on **privacy retention, release operations, client freeze, and multi-party native proof**. Treat E3.7.2 as a completed acceptance milestone, not a launch authorization.

**STOP.**
