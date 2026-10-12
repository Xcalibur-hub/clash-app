# Phase 11 Step 3 — Crews Integration

**Date:** 2026-10-11  
**Branch:** `feat/phase-11-crews-integration`  
**Worktree:** `C:\p11c` (short path from latest `main`)  
**Safety:** Primary checkout Crew dirt preserved untouched. PRs #7–#17 not modified. No World/MapLibre/Vault payments/native changes. No Supabase reset or production deploys.

**Phase 11 Step 2F — Full Android multi-account Arena verification: DEFERRED by product decision.**  
This remains an outstanding release-validation requirement and is **not** completed by this step.

---

## 1. Backend capability inventory (main + local DB)

### Committed on `main` (migrations)

| Area | RPCs / objects | Notes |
|------|----------------|-------|
| Enums | `arena_crew_join_mode`, member roles, invite/request statuses | `20261006120000` |
| Core | `create_arena_crew`, `join_arena_crew`, `leave_arena_crew`, `follow_arena_crew`, `unfollow_arena_crew`, `invite_to_arena_crew`, `respond_arena_crew_invite`, `request_arena_crew_join`, `decide_arena_crew_join_request`, `get_arena_crew`, `list_arena_crews`, `list_my_arena_crews` | `20261006120100` + hardening `20261006130000` |
| Security | Crew payload helper private; relationship helpers | `20261008110100` / tests `061` |
| Rules | One active membership / profile; 72h rejoin cooldown; OPEN join only via `join_arena_crew`; REQUEST / INVITE_ONLY via request/invite RPCs; sole owner cannot leave | Documented in foundation migration |

### Present locally in Docker but **not** on `main` git

| Object | Local evidence | Action in this PR |
|--------|----------------|-------------------|
| `20261006140000_arena_crews_discovery` | In `schema_migrations`; functions `discover_arena_crews`, `list_rising_arena_crews`, `list_arena_crew_members` | **Not** copied into this PR (avoid inventing migrations from dirty trees). Client uses `list_arena_crews` / payload `memberCount` only. |

### Not supported (no Crew content APIs)

- Crew-scoped posts / feeds / challenges  
- Ownership transfer RPC  
- Ban / kick member RPCs  
- Client-writable reputation / wins

---

## 2. Frontend integration map

| Surface | Integration |
|---------|-------------|
| Arena Communities tab | `ArenaCommunity` lists mine + explore via RPCs; cards navigate to detail; Create / See all links |
| `/arena/crews` | Discovery list + pagination |
| `/arena/crews/create` | Create form → `create_arena_crew` → replace to detail |
| `/arena/crews/[slug]` | Detail + join / request / leave / follow |
| Service | Existing `services/arenaCrewService.ts` |
| Errors | `arenaCrewErrorKey` / `arenaCrewUserMessage` |

---

## 3. Implemented functionality

- Discover Crews (authenticated `list_arena_crews`) with real `memberCount`, bio, specialties, join mode, viewer membership  
- Create Crew (name, slug, bio, join mode, ≤4 specialties)  
- Open Crew detail by slug  
- Join OPEN Crews; request REQUEST Crews; follow/unfollow  
- Leave when permitted (sole-owner leave rejected by server with clear copy)  
- Guest gate → auth; account switch clears list/detail state  
- Duplicate submit guards (`inFlight`)  
- Loading / empty / error states  
- No mock feeds or invented activity metrics  

---

## 4. Deferred functionality

| Item | Reason |
|------|--------|
| Step 2F Android multi-account Arena E2E | Product deferred |
| `discover_arena_crews` / rising strip / member strip UI | Migration not on `main` |
| Invite picker + decide join-request inbox UI | Backend exists; needs recipient/moderation UX (Step 3B) |
| Ownership transfer | No RPC |
| Crew posts / challenges | No backend |
| Figma redesign | Explicitly out of scope |

---

## 5. Privacy & permissions

- Mutations require auth (`useRequireAuth` + server `my_profile_id`)  
- Lists/detail use SECURITY DEFINER RPCs; no client table writes  
- One-crew rule + cooldown enforced server-side  
- Invite/request moderation RPCs not exposed in this MVP UI (no privilege escalation path added)  
- Failed mutations refresh from server; no sticky optimistic membership  
- Error UI maps known messages; unknown SQL is not shown  

---

## 6. Validation results

| Check | Result |
|-------|--------|
| Crew unit tests (`utils/arenaCrews.test.ts`) | **PASS** — 7 tests, 0 fail (mocked parsers / access helpers) |
| `npm run typecheck` | **PASS** (`tsc --noEmit`) |
| `npm run test:unit` | **PASS** — 466 tests, 0 fail |
| pgTAP `050` / `051` / `061` (local Docker) | **PASS** — 146 tests, 0 fail |
| `npx expo-doctor` | **PASS** — 18/18 checks |
| `npm run test:arena-navigation` | **PASS** — 11/11 checks |
| Live Supabase destructive multi-account | **Not run** (deferred / safety) |
| Mocked vs live | Frontend state/error mapping = unit/mocked; RPC contract = existing pgTAP |

**Phase 11 Step 2F — Full Android multi-account Arena verification: DEFERRED by product decision.**

---

## 7. Known limitations

- Explore list requires sign-in (matches prior Communities tab + authenticated grant on crew table policies).  
- Pending join request is session-local until membership appears (payload has no pending flag on `main`).  
- Wins/losses/streak chips only render when server values are non-zero (placeholders may be zero).  

---

## 8. Recommended next step (Step 3B)

1. Land `arena_crews_discovery` migration on `main` if intended.  
2. Moderation inbox: pending invites + join requests.  
3. Ownership transfer RPC + leave path.  
4. Optional Crew activity once product defines content RPCs.  
5. Complete Step 2F Android multi-account Arena validation when unblocked.
