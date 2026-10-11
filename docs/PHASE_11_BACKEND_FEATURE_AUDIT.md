# Phase 11 Step 1 — Backend & feature readiness audit

**Status:** audit / documentation only  
**Date:** 11 October 2026  
**Baseline:** `main` @ `eccd521`  
**Worktree:** `C:\p11` (`docs/phase-11-backend-feature-audit`)  
**Non-goals:** no Figma UI redesign; no MapLibre merges (#7–#11); no World map changes; no Supabase reset/deploy; no feature implementation in this step

---

## 1. Executive summary

CLASH 2.0 already has a **broad, RPC-centric backend** (100 migrations, 80+ pgTAP tests, 6 Edge Functions) and a **largely wired Arena / Vault / World / Explore client**. The highest-impact gaps are not “missing tables” but **disconnected money rails**, **incomplete engagement surfaces**, and a few **backend→notification** holes.

| Priority theme | Finding |
| --- | --- |
| **Launch-critical Arena** | Takes, casual questions (“Flash Cards”), challenges→duels, clash settle, live rooms are **Working E2E** with strong SQL tests |
| **Arena polish** | Comment/reply notifications not written; wins/facet reputation not hydrated; Crews BE without full FE on `main` |
| **Money** | Vault entitlements + sponsor commissions exist in SQL; **no payment webhook / click-conversion Edge Functions** → checkout & earnings accrual **Blocked** |
| **Safety ops** | User report/block/mute work; **no staff triage UI**; no automated media scan |
| **Realtime** | Live Arena / creator live / Meet use channels; **notification inbox is focus-poll only** |

**Recommendation:** Phase 11 Steps 2–N finish Arena engagement completeness first, then money ingest, then safety/ops — **before** a final UI redesign.

---

## 2. Inventory snapshot

| Layer | Count / notes |
| --- | --- |
| Migrations | **100** under `supabase/migrations/` |
| SQL tests | **83** files under `supabase/tests/` |
| App services | **59** `services/*.ts` |
| Edge Functions | `vault-media-access`, `course-lesson-media-access`, `creator-ai`, `digital-creator`, `arena-gifs`, `arena-editorial` |
| Missing Edge (gaps) | Payment webhook, sponsor click/conversion ingest, push notifier, media scanner |
| Root map stack | `react-native-maps` (Google on Android); MapLibre **not** in root (probe-only experiments) |

---

## 3. End-to-end readiness matrix

Classification:

- **Working E2E** — UI → service → RPC/RLS → UI state complete for the happy path  
- **BE complete / FE incomplete** — RPCs + tests exist; thin or missing UI  
- **FE complete / BE incomplete** — UI expects behavior not fully written server-side  
- **Partial** — core path works; important branches missing  
- **Missing** — no meaningful implementation  
- **Blocked** — depends on external integration or explicit product gate  

### 3.1 Auth, profiles, social, safety

| Feature | Status | Evidence (UI → service → backend) |
| --- | --- | --- |
| Email OTP auth | Working E2E | `app/auth.tsx` → `authService` → Supabase Auth |
| Profile mint on signup | Working E2E | trigger `handle_new_user` (`20260926130000_auth_profile_trigger.sql`); `get_my_profile` / `my_profile_id` |
| Profile edit / public profile | Working E2E | `profileService`, `ProfileScreen`, RLS hardened (`060_profile_read_security.sql`) |
| Product tour onboard | Partial | `app/onboard.tsx` local `markOnboarded` only |
| Arena interest onboarding | Working E2E | `InterestOnboardingGate` → `arenaInterestService` → `save_my_arena_interests` |
| Follow / unfollow | Working E2E | `socialService` → `follow_profile` / `unfollow_profile` |
| Block / mute / report | Partial | Working from Arena/community; **no unblock / mute-list settings UI**; staff report queue Missing |
| Rate limits (social/media) | Working E2E | `assert_rate_limit` + triggers (`20260926170000_production_hardening.sql`) |

### 3.2 Arena — Takes, questions, challenges, clashes

| Feature | Status | Evidence |
| --- | --- | --- |
| Take create / feed / detail | Working E2E | `create.tsx` → `postTake` → `create_take`; `hydrationService` / `fetchTakes`; insert lockdown (`009_take_insert_lockdown.sql`) |
| Take reactions | Working E2E | `useTakeReaction` → `toggle_take_reaction` |
| Comments / rebuttals / GIF | Working E2E | `postComment` → `create_comment`; media/GIF migrations + tests `023`/`024` |
| Comment/reply **notifications** | FE complete / BE incomplete | FE routes `comment`/`reply` in notifications tab; `create_comment` does **not** insert `notifications` |
| Casual questions (Flash Cards) | Working E2E | Product UI: `ArenaQuestions` / `QuestionVotePanel` → `arenaQuestionService` → `create_arena_question` / `list_arena_questions` / `vote_arena_question` (`077`/`078`). **No separate “Flash Cards” schema name** — this is the card surface |
| Challenge create / list on Take | Working E2E | `TakeChallenges` → `arenaChallengeService` |
| Challenge inbox / swipe / accept | Working E2E | `app/arena/challenges.tsx` → `list_my_arena_challenges` / `resolve_arena_challenge` → duel room; client checks `challenge-inbox-check` 18/18 |
| Challenge-specific scoring/rewards UI | Missing | Rewards flow through **clash settlement**, not a separate challenge points product |
| Clash start / judge / settle / verdict | Working E2E | `app/clash/[takeId].tsx` → `clashEngineService` → `start_clash` / `submit_judgement` / `settle_clash`; cron `010_clash_scheduler.sql` |
| Live Arena topics / rooms / crowd | Working E2E | `liveArenaService` + hooks; RPCs + tests `025`–`031`, `058`/`059` |
| Arena duel from challenge | Working E2E | `create_arena_duel`; tests `054`/`055` |
| Crews | BE complete / FE incomplete | `arenaCrewService` + SQL `050`/`051`/`061`; `ArenaCommunity` list-only on `main` — **no** `app/arena/crews/*` in this baseline (unmerged Crew UI may exist only in dirty checkouts) |
| Facet reputation | BE complete / FE incomplete | `fetchMyArenaReputation` / `get_my_arena_reputation` — **no FE callers** |
| Profile wins / clash counters | Partial | Clash history via `profile_clash_list` works; `toUser` hardcodes `wins: 0`, `clashes: 0`; vault Wins tab stub empty |
| Arena notifications (challenge/clash) | Working E2E | Server writers for challenge/clash/reputation kinds; recipient RLS |

### 3.3 Explore, Meet, Play, Hoods

| Feature | Status | Evidence |
| --- | --- | --- |
| Explore For You / World / Live / Search / Country | Working E2E | `exploreService` → explore RPCs; tests `032`–`034`, `082` |
| Meet text | Working E2E | `meetService` → queue/session/messages; test `036` |
| Meet video | Partial | Signaling RPCs + `useMeetVideoSession` (`react-native-webrtc`); needs custom native client (not Expo Go) |
| Play challenges / treasure (player) | Working E2E | `playService` join/submit/claim; test `035` |
| Play host / settle | BE complete / FE incomplete | SQL `host_explore_*` / `settle_challenge` — **not** in `playService` UI |
| Hoods (Arena path) | Working E2E | `hoodService` / `hoodGameService` → `/hood/[hoodId]` |
| Hoods (Explore section) | FE incomplete | `HoodsSection.tsx` **unmounted** on Explore tab |

### 3.4 Vault, World, commerce, sponsor

| Feature | Status | Evidence |
| --- | --- | --- |
| Vault drops / collections / storefront | Working E2E | `vaultService` + RPCs; Edge `vault-media-access`; tests `011`–`013` |
| Vault subscriptions (pay) | Blocked | Entitlement RPCs service_role-only; UI: “not available”; `requestDropCheckout` → `payments_unavailable` |
| Vault communities | Working E2E | `vaultCommunityService`; tests `041` |
| Courses / products / services CRUD | Partial | Studio + detail routes; **checkout Missing/Blocked** |
| Creator live | Working E2E | `creatorLiveService` + realtime |
| Creator AI / digital creator | Working E2E* | Edge Functions present; *runtime Blocked if provider secrets unset |
| World mission drops / discovery / compose | Working E2E | `worldService` + privacy fuzz; consent scripts; tests `017`/`018`/`083` |
| World mission authoring | BE complete / FE incomplete | Staff RPC; no creator staff console |
| Creator geo drops + claim | Working E2E | `creatorWorldDropService` |
| Sponsor studio (CRUD/assign) | Working E2E | `app/sponsor/*` → `sponsorService` → studio RPCs; tests `019`–`021` |
| Sponsor click/conversion ingest | Missing / Blocked | `record_referral_click` / `record_sponsor_conversion` **service_role only**; **no Edge Function**; no FE callers |
| Creator earnings read | Working E2E | `creatorEarningsService` + `app/earnings/*` |
| Creator payouts | Missing | No payout provider / mutations |

### 3.5 Media, notifications, MapLibre

| Feature | Status | Evidence |
| --- | --- | --- |
| Media upload pipeline | Working E2E | `mediaService` → `create_media_upload` / complete; buckets + RLS (`001_media_storage.sql`) |
| Private Vault/lesson media | Working E2E | Edge signed URL functions |
| Automated moderation | Missing | Report-only; no AV/NSFW pipeline |
| Notification inbox | Partial | Poll on focus; **no** `postgres_changes` / push |
| MapLibre World | Out of scope / Blocked for prod | Probe PRs #7–#10; architecture PR #11; **do not merge into production path here** |

---

## 4. Missing integrations (concrete)

1. **Payments Edge Function** → grant/revoke `vault_subscriptions` / product entitlements after verified webhook (Razorpay/Stripe/IAP).  
2. **Sponsor attribution Edge Function** → call `record_referral_click` / `record_sponsor_conversion` with service role; document deep-link params.  
3. **`create_comment` → `notifications`** for `comment` / `reply` kinds (or drop FE cases).  
4. **Crews FE** on `main`: create/detail/join/invite routes wired to `arenaCrewService`.  
5. **Hydrate** `User.wins` / `User.clashes` (or remove UI counters); wire `get_my_arena_reputation`.  
6. **Notification realtime or push** (optional for launch; inbox works without it).  
7. **Play host UI** or hide host RPCs from product scope.  
8. **Safety settings**: unblock, mute list, (later) staff report queue.  
9. **Mission `create_world_drop` rate limit** parity with other write RPCs.  
10. **Meet video** release build + ICE secrets checklist.

---

## 5. Security and correctness findings

| Topic | Assessment | Notes |
| --- | --- | --- |
| RLS + RPC writes | Strong | Takes/comments/challenges/clashes/vault writes generally SECURITY DEFINER; client INSERT revoked where tested |
| Service-role-only money paths | Correct but incomplete | Subscriptions grants + sponsor conversion ingest intentionally not client-callable — need trusted Edge |
| Ownership / account switch | Good | `p_expected_auth_uid` on questions/challenges; AuthHydrator reloads Arena |
| Payment verification | **Gap** | No webhook → no cryptographic payment proof in-app |
| Rate limits | Strong | Central `assert_rate_limit`; client EXECUTE revoked |
| Idempotency | Mixed | Challenge/question concurrency SQL tests exist; some client paths rely on disabled buttons |
| Moderation | Partial | User reports + hide; no automated media quarantine |
| Realtime auth | Context-dependent | Arena rooms / live sessions use RPCs; notifications not realtime |
| Location privacy | Strong (World) | Opt-in Locate; fuzzed storage; consent contract scripts |
| Media access | Strong for Vault/courses | Path-scoped Edge; generic `getPrivateMediaAccess` intentionally unimplemented |
| Reputation privacy | Medium | `reputation_events` historically `using (true)` readable — review before public launch |
| `toggle_comment_upvote(..., p_user_id)` | Low | Still accepts client user id but gated by `owns_profile` — prefer session-derived id |

**Destructive tests against production were not performed.**

---

## 6. Validation results (this worktree)

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run typecheck` | **0** | Pass |
| `npm run test:unit` | **0** | **464** tests / **118** suites pass |
| `node scripts/world-consent-check.cjs` | **0** | 8 checks |
| `node scripts/question-client-check.cjs` | **0** | 25/25 |
| `node scripts/challenge-inbox-check.cjs` | **0** | 18/18 |
| `node scripts/arena-engagement-check.cjs` | **1** | Fail — module load / `.tsx` require error in script harness |
| `npx expo-doctor` | **0** | 18/18 checks passed |
| `npx supabase test db` (**no reset**) | **1** | **2897** tests ran; **FAIL** overall — concurrency suite files exit 3 with `password or GSSAPI delegated credentials required` (local role auth), not assertion failures on those files. Non-concurrency files largely `ok` (e.g. editorial, gif budget, explore security, world read). |

**Do not treat concurrency FAIL as product-logic failure without re-running after fixing local `supabase test` role credentials.** Prefer CI/`supabase test db` on a known-good local stack when available.

---

## 7. Prioritized backlog

Scoring axes: engagement · missing BE · security/reliability · dependencies · complexity.

### Launch-critical (Phase 11 Steps 2–4)

| # | Item | Why | Size | Acceptance |
| --- | --- | --- | --- | --- |
| L1 | Comment/reply notification writers | FE already routes kinds; social loop incomplete | S | Creating a comment inserts notif; recipient opens Take; SQL test |
| L2 | Wins / clash count hydration | Profile trust; counters lie today | S | `toUser` reflects settled outcomes; vault Wins or remove stub |
| L3 | Wire facet reputation or hide API | Dead BE surface | S | Profile/Arena shows facets **or** service unmarked private |
| L4 | Challenge accept → duel smoke device path | Core Arena promise | M | Two accounts: challenge → accept → room → judge → settle |
| L5 | Questions (Flash Cards) guest/signed UX review | Auth-gated list may confuse guests | S | Product decision + empty/sign-in copy |
| L6 | Crews minimal FE on `main` | BE ready; engagement | M | Create + open + join/leave against `arenaCrewService` |
| L7 | Fix `arena-engagement-check` harness | CI signal | S | Script exits 0 on `main` |

### Money / growth (after Arena polish)

| # | Item | Why | Size | Acceptance |
| --- | --- | --- | --- | --- |
| M1 | Payment webhook Edge → vault grant | Unblocks subscriptions | L | Signed webhook grants entitlement; client checkout status |
| M2 | Sponsor click/conversion Edge | Unblocks commissions | M | Click deep-link recorded; conversion creates ledger row |
| M3 | Product checkout or explicitly “coming soon” | Commerce honesty | M | No dead Checkout CTA without path |
| M4 | Payouts design spike | Earnings incomplete without it | L | ADR + provider choice (no silent ledger drain) |

### Reliability / safety

| # | Item | Why | Size | Acceptance |
| --- | --- | --- | --- | --- |
| R1 | Unblock + mute list settings | Safety completeness | S | Settings screen calls existing services |
| R2 | Rate-limit `create_world_drop` (mission) | Abuse parity | S | SQL test asserts limit |
| R3 | Notification realtime (optional) | Freshness | M | New notif appears without leaving tab |
| R4 | Reputation events read policy review | Privacy | S | Document or tighten RLS |
| R5 | Meet video release checklist | Partial feature | M | Custom build + ICE + 1:1 call smoke |

### Later / experimental (do not block launch)

- MapLibre World integration (follow Phase 1G architecture; PRs #7–#11 disposition unchanged)  
- Play host tools  
- Staff World mission console  
- Automated media moderation  
- Explore HoodsSection mount  
- AI/digital creator provider hardening  

---

## 8. Small Codex-sized implementation steps

Each step should be one PR, with tests, no UI redesign.

1. **Notif writer for comments** — migration amending `create_comment` (+ pgTAP); no UI change.  
2. **Hydrate wins/clashes** — mapper + unit test from `profile_clash_list` / settlement aggregates.  
3. **Crews create + detail routes** — thin screens calling existing RPCs; reuse store patterns.  
4. **Safety settings sheet** — unblock/unmute using `safetyService` / `socialService`.  
5. **World drop rate limit** — SQL + test only.  
6. **Sponsor ingest Edge stub** — service-role function + signed secret; local curl test; no UI redesign.  
7. **Payments Edge stub** — grant test subscription on signed test event; keep production keys out of git.  
8. **Repair `arena-engagement-check.cjs`** — align loader with current TSX toolchain.

---

## 9. Proposed Phase 11 Step 2

**Title:** Arena engagement completeness (notifications, reputation hydration, Crews MVP)

**In scope:**

- L1 comment/reply notifications  
- L2 wins/clash hydration  
- L6 minimal Crews FE **or** L3 reputation wiring (pick one primary; other Step 2b)  
- L7 engagement harness fix  
- Device smoke: Take → comment → notif; Challenge → duel → settle  

**Out of scope:** payments, MapLibre, Figma redesign, Supabase reset, sponsor Edge (Step 3).

**Exit criteria:** listed acceptance tests green; `typecheck` + `test:unit` + relevant SQL tests pass; draft PR to `main`.

---

## 10. Milestone acceptance criteria (summary)

| Milestone | Must pass |
| --- | --- |
| **M0 — Audit (this doc)** | Matrix + backlog agreed; no prod code change |
| **M1 — Arena loops** | Takes, questions, challenges→duels, clash settle verified on device; comment notifs; counters honest |
| **M2 — Social graph polish** | Crews MVP or explicit deferral; safety unblock/mute UI |
| **M3 — Money rails** | Payment + sponsor ingest Edges in staging; one paid Vault path; one attributed conversion |
| **M4 — Ops / realtime** | Report triage plan; optional notif realtime; rate-limit gaps closed |
| **M5 — UI redesign** | Only after M1–M3; redesign must not invent new unpaid backend surfaces |

---

## 11. Experimental / MapLibre disposition (unchanged)

Do **not** merge PRs #7–#11 for Phase 11 backend work. World continues on `react-native-maps`. Integration plan remains `docs/EXPLORE_PHASE_1G_WORLD_INTEGRATION_ARCHITECTURE.md` when map work resumes.

---

## 12. Open questions

1. Confirm product name mapping: **Flash Cards = Arena casual questions**?  
2. Are challenge-specific rewards desired beyond clash reputation?  
3. Payment provider (India-first Razorpay vs Stripe vs IAP)?  
4. Ship Crews in M2 or defer to post-money?  
5. Guest browsing of questions — allow or keep auth-gated?

---

## 13. Appendix — primary file index

| Domain | Key paths |
| --- | --- |
| Auth | `store/AuthProvider.tsx`, `services/authService.ts`, `services/apiService.ts` |
| Arena feed | `services/hydrationService.ts`, `app/(tabs)/index.tsx`, `app/(tabs)/create.tsx` |
| Questions | `services/arenaQuestionService.ts`, `components/arena/ArenaQuestions.tsx` |
| Challenges | `services/arenaChallengeService.ts`, `app/arena/challenges.tsx` |
| Clashes / live | `services/clashEngineService.ts`, `services/liveArenaService.ts`, `app/clash/[takeId].tsx`, `app/arena/room/[roomId].tsx` |
| Crews | `services/arenaCrewService.ts` |
| Vault | `services/vaultService.ts`, `services/vaultCommerceService.ts`, `services/vaultCommunityService.ts` |
| World | `services/worldService.ts`, `services/locationService.ts`, `app/world/*` |
| Sponsor / earnings | `services/sponsorService.ts`, `services/creatorEarningsService.ts`, `app/sponsor/*`, `app/earnings/*` |
| Explore / Meet / Play | `services/exploreService.ts`, `meetService.ts`, `playService.ts` |
| Notifications | `services/notificationService.ts`, `app/(tabs)/notifications.tsx` |
| Hardening | `supabase/migrations/20260926170000_production_hardening.sql` |
