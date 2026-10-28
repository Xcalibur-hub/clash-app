# E3.7.2 — Samsung Meet typing acceptance

24 October 2026. Branch `arena-ui-review`; HEAD during run **0cd6c36** (E3.7.1 fix **bd05d66** + docs **1c831fc** included).

**Overall: PASS.** E3.7.1 typing-indicator fix accepted on Samsung SM-A505F against isolated e357. B→A `Typing...` visible on device, A→B observable by B SDK, idle clear, Realtime-disconnected poll path, lease-extension stability, and Leave cleanup all **PASS**. Owner E3.7.2 authorization consumed (not E3.7.0). No matchmaking, Block, reports, media, migrations, rebuild, push, merge or deployment.

Read `.clinerules` and [E3.7.1](../explore-e371/REPORT.md). Authorization: [authorization-consumed.json](authorization-consumed.json).

## Preconditions

| Gate | Result |
|---|---|
| HEAD + E3.7.1 commits | PASS |
| Unrelated uncommitted Meet UI preserved | PASS |
| Device SM-A505F unlocked | PASS |
| Metro 8081 + USB 8081/55471 | PASS |
| Backend `e357-ce48b72fd636` / `clash_e325_e357_ce48b72fd636_fresh` | PASS |
| Migration 111, Realtime partition, services | PASS |
| Fictional A on device | PASS |
| Phone JS with E3.7.1 markers | PASS — 23,768,327 bytes, SHA-256 `7a84d52d…aea8f` ([phone-patch-bundle.json](phone-patch-bundle.json)) |
| Fictional B SDK Auth | PASS after container password reauth (stale `refresh_token_already_used`); tokens not logged |
| Owner E3.7.2 approval | PASS — consumed |

## Fixture

| Session | Role | Outcome |
|---|---|---|
| `ms_06628e8d11171f14` | Bootstrap abort | Created then immediately left when B `setSession` failed on reused refresh token — **no typing/native scenarios** |
| **`ms_8e8b9b7dd70166c6`** | Acceptance A/B TEXT | Sole session used for all typing scenarios; ended `leave` |

No messages sent during acceptance (`messageCount` remained **5**). Final inventory: [inventory-final.json](inventory-final.json) — **0** active, ledger **111**, session count **15**.

## Native scenarios

| Scenario | Result | Surface / evidence |
|---|---|---|
| Create controlled A/B TEXT session | **PASS** | `ms_8e8b9b7dd70166c6` ([fixture.json](fixture.json)) |
| Open on A50 as A; B heartbeat | **PASS** | Connected ([ready.json](ready.json), [screens/ready.png](screens/ready.png)) |
| B typing → `Typing...` on Samsung A | **PASS** | `typingVisible:true`; A SDK `validForMs≈4745` ([typing-b-to-a.json](typing-b-to-a.json), [screens/typing-b-to-a.png](screens/typing-b-to-a.png)) |
| A typing observable by B | **PASS** | B `get_meet_typing.typing===true`, `validForMs≈3293` (A50 composer → SDK) |
| Idle clear | **PASS** | A50 no `Typing...`; SDK `typing:false` ([typing-idle-clear.json](typing-idle-clear.json), [screens/typing-idle-clear.png](screens/typing-idle-clear.png)) |
| Realtime reconnect / delayed subscribe | **PASS** | B Realtime disconnected; A50 still showed `Typing...` via authoritative poll path ([typing-reconnect.json](typing-reconnect.json), [screens/typing-reconnect.png](screens/typing-reconnect.png)) |
| Lease extensions do not reset typing | **PASS** | `Typing...` before and after >15s heartbeat window ([typing-lease-before](typing-lease-before.json) / [after](typing-lease-after.json)) |
| Leave clears + rejects typing | **PASS** | Ended UI; B `set_meet_typing` rejected; inactive. Path: authenticated A `leave_meet_session` (menu Leave not required for cleanup proof) ([after-leave.json](after-leave.json), [screens/after-leave.png](screens/after-leave.png)) |
| Final cleanup | **PASS** | **0** active sessions |

Machine results: [scenario-results.json](scenario-results.json).

### A50 vs SDK

- **A50-observed:** open/Connected, B→A `Typing...`, idle clear, reconnect poll path, lease stability, ended after Leave.
- **SDK-observed:** dual heartbeats, B `set_meet_typing`, A/B `get_meet_typing`, A→B typing publication from device composer, Leave reject-after.

## Safety

- Fictional A/B only; isolated e357 only.
- No unnecessary messages, matchmaking, Block, reports, media.
- No migrations, RLS changes, native rebuild/reinstall, push, merge or deployment.
- Application sources untouched this phase; unrelated uncommitted UI preserved.
- Tokens/passwords not written to evidence.

**STOP.**
