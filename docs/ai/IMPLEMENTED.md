# IMPLEMENTED — What Exists, and How Well It Is Proven

Verification classes used throughout:

- **IMPLEMENTED** — code exists and is wired. Not necessarily proven on device.
- **VERIFIED (automated)** — green tests exist for it.
- **VERIFIED (native)** — observed on a physical device, with evidence.
- **PARTIAL** — built and partly proven; gaps named.
- **BLOCKED** — built but cannot be accepted until something external changes.
- **NOT TESTED** — no credible run recorded.

Evidence lives under [`../evidence/`](../evidence/). Do not trust this table
over the code — re-check the cited path.

---

## 1. Core product surfaces

| Surface | State | Evidence |
|---|---|---|
| Auth (sign in / sign up / anonymous) | IMPLEMENTED | [`../../app/auth.tsx`](../../app/auth.tsx) |
| Onboarding + interest gate | IMPLEMENTED | `app/onboard.tsx`, `components/onboarding/InterestOnboardingGate.tsx` |
| Arena feed (tabs) | IMPLEMENTED, automated-verified | `app/(tabs)/index.tsx`, `utils/arenaFeedSurface.test.ts` |
| Take creation + detail | IMPLEMENTED | `app/(tabs)/create.tsx`, `app/take/[takeId].tsx` |
| Explore (search, people, hoods, countries) | IMPLEMENTED, automated-verified | `app/(tabs)/explore.tsx`, `utils/explore*.test.ts` |
| Profiles / identity | IMPLEMENTED | `app/(tabs)/profile.tsx`, `app/profile/[profileId].tsx` |
| Notifications | IMPLEMENTED | `app/(tabs)/notifications.tsx` |
| Creator Vault (drops, collections, reader) | IMPLEMENTED, release-deferred | `app/(vault)/`, `app/vault/` |

## 2. Arena / canonical duels (the active workstream)

| Capability | State | Evidence |
|---|---|---|
| Canonical duel model: Take → challenge → Clash → Room → topic | IMPLEMENTED | migrations; [`../CANONICAL_ARENA_LIVE_3_1.md`](../CANONICAL_ARENA_LIVE_3_1.md) |
| Duel payload + presentation logic | VERIFIED (automated) | `utils/arenaDuelPayload.test.ts`, `utils/duelPresentation.test.ts`, `npm run test:duel` |
| Duel rendering (component + community-result scenarios) | VERIFIED (automated, controlled render) | `npm run test:duel:render` |
| Realtime room: join, Crowd, official messages, presence | IMPLEMENTED | `services/liveArenaService.ts`, `utils/liveRoomThread.ts` |
| Crowd hydration by ID (`get_arena_crowd_messages`) | IMPLEMENTED, automated-verified | `services/arenaCrowdService.ts`, `scripts/crowd-rpc.test.cjs` |
| Session recovery / replay-safe transitions / pagination | IMPLEMENTED, automated-verified | [`../ARENA_STEP_6G_5C_1_REPLAY_SAFE_TRANSITIONS.md`](../ARENA_STEP_6G_5C_1_REPLAY_SAFE_TRANSITIONS.md), `scripts/arena-*-lifecycle.test.cjs` |
| Creator challenge inbox → canonical duel | IMPLEMENTED (HEAD) | `app/arena/`, commit `8aac697` |
| Take → canonical duel journey | IMPLEMENTED (HEAD) | commit `405e5c0` |
| Audience reads + session recovery hardening | IMPLEMENTED (HEAD) | commit `2b89874` |
| **Full native active-Arena acceptance** | **BLOCKED** | A50 report §5–§6 |
| Native finals / judging UI | **NOT TESTED** | A50 report §5 |
| Native ballot → verdict → reward | **BLOCKED** | A50 report §5 |
| Remote-author Crowd delivery on device | **BLOCKED** | A50 report §5 |

Full native status: [`../evidence/ui-completion/ACTIVE_ARENA_A50_ACCEPTANCE.md`](../evidence/ui-completion/ACTIVE_ARENA_A50_ACCEPTANCE.md).

## 3. Other realms (built, mostly gated by release scope)

| Realm | State | Notes |
|---|---|---|
| Meet (video matchmaking) | IMPLEMENTED, **deferred** in release | Postgres admission gate tests exist: `supabase/tests/meet_new_admission_gate.pgtap.sql` |
| Groups / crews | IMPLEMENTED, **deferred** | `scripts/group-activity-hub.test.cjs` |
| Play (Signal game, challenges) | IMPLEMENTED, **deferred** | `scripts/play-signal.test.cjs` |
| Vault interactive story / community | IMPLEMENTED, **deferred** | `scripts/vault-story.test.cjs` |
| World / Lost Beacon mission | IMPLEMENTED, **deferred** | `scripts/world-beacon.test.cjs` |
| Creator Live events | IMPLEMENTED, **deferred** | `scripts/creator-live-connect.test.cjs` |
| Creator AI | IMPLEMENTED, **deferred** | `supabase/functions/creator-ai`, `digital-creator` |
| Sponsor / campaign dashboards | PROTOTYPE | `app/sponsor/`, `app/campaign/` |
| Hall of Fame | **NOT IMPLEMENTED** | [`../../README.md`](../../README.md) says so explicitly |

## 4. Engineering infrastructure

| Item | State |
|---|---|
| TypeScript strict / zero `any` | ENFORCED by `npm run typecheck` |
| Unit suite (124 files) | VERIFIED (automated) |
| Lifecycle/UI harness (24 wired test files) | VERIFIED (automated) |
| pgTAP DB suite (102 files) | AVAILABLE — runs against a DB; not free to run |
| EAS archive closure | VERIFIED (automated) — `scripts/eas-archive-check.cjs` |
| Release scope gating | IMPLEMENTED — `utils/releaseScope.ts` |
| Cross-agent knowledge base (`docs/ai/`) | IMPLEMENTED — this folder |
| Shared handoff skill | IMPLEMENTED — `.agents/skills/clash-handoff/` |

Last recorded full automated run: 2026-11-05, `npm test` PASS **1,216/1,216**
(A50 report §7). That run predates any change after it — re-run before citing.
