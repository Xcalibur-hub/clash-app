# Explore Phase 0 — Existing Implementation Audit

**Repository:** Clash 2.0  
**Branch context:** `arena-ui-review` (read-only audit)  
**Scope:** No code, commits, migrations, or device work during the audit itself.  
**Principle confirmed in code:** Explore already **composes** Arena / Vault / Live / Play / Meet via SECURITY DEFINER RPCs — do not fork ranking or entitlement engines.

---

## Architecture snapshot

| Surface | What it is |
|---------|------------|
| Arena tab **Explore** | `app/(tabs)/explore.tsx` — in-screen modes: **For You \| World \| Live \| Play \| Meet** via `ExploreModeRail` |
| Explore stack | `app/explore/*` — country, challenge, treasure, Meet text/video, My Play |
| **World realm** (separate) | `app/world/*` — `react-native-maps` geo missions/drops; sidebar route `/world`, not the Explore mode |

**Important vs requirement #5:** World is the Explore **mode rail** item (with Map/Globe canvas), not a bottom-dock “right tab.” There is also a distinct World **realm**. That duality is a product decision (see Blockers).

---

## 1. Capability matrix (requested features)

### 1) Arena topic recommendations, trending, search

| Status | Detail |
|--------|--------|
| **Exists** | Interest catalogue + save (`arenaInterestService`); live topics (`list_live_arena_topics`); trending battles (`list_arena_trending_battles` / `arenaTrendService`); Explore search includes `topics[]` via `search_explore` |
| **Partial** | “Recommendations” = interests + live list + trend race — not a dedicated topic recommender |
| **Missing** | Dedicated Arena topic search RPC; trend not mixed into Explore For You rank; interest signals not shared into `get_explore_for_you` SQL |

**Reuse:** `arenaInterestService`, `liveArenaService`, `arenaTrendService`, `searchExplore` — do not add a second trend engine.

---

### 2) Unified discovery of Arena, Vault, Live

| Status | Detail |
|--------|--------|
| **Exists** | `get_explore_for_you`, `get_explore_live`, `get_global_viral`, `search_explore` already mix takes, live topics, vault **previews**, challenges; `ExploreViralKind` includes `LIVE_ARENA \| TAKE \| VAULT_PREVIEW \| CHALLENGE \| CLASH` |
| **Partial** | Vault Discover **worlds/offers** not in For You; Arena duel discovery (`list_arena_clash_discovery`) stays on Arena Home |
| **Missing** | **Creator Live** sessions not in Explore For You / Live / search; dual Live mental models (Explore daily topics vs Arena rooms) |

**Anti-pattern:** client re-query of takes/topics/drops outside existing RPCs / visibility helpers.

---

### 3) Free/paid content + subscription authorization

| Status | Detail |
|--------|--------|
| **Exists** | Vault entitlement: `can_access_vault_drop` / `viewer_can_access_drop`; Explore shelves = **FREE + PREVIEW teasers only**; Edge `vault-media-access`, `course-lesson-media-access`; `expire_vault_subscriptions` in maintenance |
| **Missing** | **No payment provider** — `requestDropCheckout` → `payments_unavailable`; no Stripe/Razorpay/StoreKit; Play treasures/challenges have **no price/entitlement columns** |

Preserve Vault contracts; Explore must never unlock subscriber media locally.

---

### 4) Live video discovery + creator-approved real-time interactions

| Status | Detail |
|--------|--------|
| **Exists** | Creator Live schema + RPCs (`creator_live_*`), FREE/SUBSCRIBER gate, interactions/votes/report; Meet **video** WebRTC (`meetService` + `useMeetVideoSession`) |
| **Partial** | Creator Live = creator-supplied **HLS/file/embed/standby URL** — no Agora/SFU; listed **per creator**, not globally |
| **Missing** | Global/creator-live discovery in Explore; hardware interaction adapters mostly enum-only |

---

### 5) World as right-side tab inside Explore

| Status | Detail |
|--------|--------|
| **Exists** | World **mode** in Explore rail + `ExploreWorldCanvas` (SVG map/globe) + country teleport → `/explore/country/[code]` |
| **Also exists** | Separate **World realm** map (`app/world`) for missions/drops |
| **Gap vs wording** | Not a dock tab; two “World” products can confuse users |

---

### 6) Animated Earth, country search, country ranking

| Status | Detail |
|--------|--------|
| **Exists** | `ExploreWorldCanvas` (globe/map), geometry + `exploreGeo` / `exploreGlobeMath`; `CountryPickerSheet`; `get_explore_world_summary`, `get_explore_country`, `get_teleport_candidate`; activity count with privacy floor (&lt;3 → null) |
| **Partial** | Ranking = activity + curated RPC projections — no separate ranking table/job |
| **Orphan** | `ExploreGlobe.tsx` unused |

---

### 7) Free/paid treasure hunts + geographical challenges

| Status | Detail |
|--------|--------|
| **Exists** | Challenges + treasure hunts (tables/RPCs/UI); join, clues, claim; Play home rails; country shelves; World geo drops/missions (PostGIS, fuzzed location) |
| **Missing** | **Paid hunt/challenge commerce**; report targets for hunt/challenge entities (only `challenge_entry`); challenge settle **not** in `run_maintenance` (lazy/manual) |

---

### 8) Anonymous random text chat

| Status | Detail |
|--------|--------|
| **Exists** | **Meet text**: queue, pseudonymous **alias**, chat, typing, block/report/next — Explore Meet mode + `/explore/meet/[sessionId]` |
| **Partial** | Pseudonymous (session alias), not fully unlinkable anonymity |
| **Also** | Meet video path (native WebRTC required; Expo Go limited) |

---

### 9) Random, non-searchable, one-time anonymous questions/confessions

| Status | Detail |
|--------|--------|
| **Missing** | **No confession / ephemeral-question product** (tables, RPCs, UI) |
| **Nearby (do not conflate)** | Arena casual questions (identity-visible); Meet aliases; Vault community pseudonyms; Blind Clash |

Needs greenfield design: distribution, non-searchability, one-time consume, report, TTL, moderation.

---

## 2. Existing implementation & reusable pieces

### Routes

- `app/(tabs)/explore.tsx` — hub
- `app/explore/{country,challenge,treasure,play/my,meet/**}`
- `app/world/{index,compose,drop/[dropId]}`

### Components (prefer these)

`ExploreModeRail`, `ExploreSearch`, `ExploreFilterWheel`, `ExploreWorldCanvas`, `CountryPickerSheet`, `ExploreMediaTile` / mosaic, `ExploreDiscoveryCard`, `PlayHomePanel`, `WorldDropsShelf`, `GiftReveal`, `MeetHomePanel`, World map markers/preview/`CreatorDropView`

### Services / RPCs (compose, don’t fork)

`exploreService`, `playService`, `meetService`, `worldService`, `creatorWorldDropService`, `vaultService` (entitlement only), `creatorLiveService`, `arenaTrendService`, `liveArenaService`, `arenaInterestService`, `safetyService`

### Orphans (avoid resurrecting as new engines)

`ExploreGlobe`, `SearchResults`/`SearchRow` + `searchService.searchAll`, unused People/Hoods/Popular/`WorldSection` shelves, unused `WorldDropCard` / `WorldMissionCard`

---

## 3. Missing UI / backend / database (by theme)

| Theme | Missing |
|-------|---------|
| Unified discovery | Creator Live in Explore feeds/search; optional Vault Discover worlds rail; optional Arena trending/interest signals in For You |
| Payments | Provider + webhooks writing `vault_subscriptions`; paid Play/treasure SKUs if product wants them |
| Creator Live scale | SFU/token provider **or** explicit “bring your own HLS” product stance; global discovery RPC with same access gate |
| Moderation taxonomy | `report_target` for `world_drop`, explore challenge/treasure (not only entry); staff triage UX |
| Play ops | Cron settle/end for challenges & hunts |
| Confessions | Full stack: schema, RLS, non-search indexes, one-shot claim, expire job, report, abuse rate limits |
| Search hygiene | Deprecate or redirect legacy `searchService` UI path to `search_explore` only |

---

## 4. Security / privacy / access control

**Already strong (keep):**

- Explore vault = FREE/PREVIEW only; subscriber paths via Edge after server yes
- World drop fuzzing + restrictive read policies (`world_read_security`)
- Explore security contract views / readable helpers
- Meet report targets; blocks/mutes; rate-limited `submit_report`
- Country activity privacy floor

**Risks / requirements for new work:**

1. **Payments** — never trust client entitlement; webhook + service_role only.
2. **Creator Live** — Explore cards must call `creator_live_viewer_can_access`; never ship raw subscriber stream URLs in discovery.
3. **Confessions** — no FTS/search RPCs; one-time consume; author unlinkability vs abuse accountability (hash/sealed identity for mods only); TTL in `run_maintenance`; report + auto-hide thresholds.
4. **Meet** — clarify retention, recording bans, age gating, ICE TURN costs/abuse.
5. **Geo** — keep one-shot foreground GPS; never store precise coords on public profiles (`public_country_code` is explicit ISO, not GPS).
6. **Dual World** — geo drops must stay on secured RPCs if surfaced inside Explore World mode.

---

## 5. Dependencies & external services

| Present | Role |
|---------|------|
| Supabase + PostGIS | Geo / Explore / Play |
| `expo-location`, `react-native-maps` | World realm |
| `react-native-webrtc` (+ config plugin) | Meet video |
| Tenor / `arena-gifs` Edge | GIFs (Arena) |
| Edge: vault/course media, creator-ai, etc. | Media gates |

| Absent (decision-driven) | Role |
|--------------------------|------|
| Stripe / StoreKit / Play Billing | Paid Vault / paid hunts |
| Agora / LiveKit / Mux | Broadcast SFU or managed HLS |
| TURN provider | Meet reliability at scale |
| Moderation vendor (optional) | Confession/Meet abuse |

---

## 6. Recommended phases (estimates)

Assumes 1–2 engineers familiar with this repo; calendar weeks, not ideal person-weeks.

| Phase | Focus | Estimate | Notes |
|-------|-------|----------|-------|
| **E0** | This audit + product decisions (below) | — | Done when blockers resolved |
| **E1** | Discovery polish without new engines: wire trending/interest into Explore compose; kill dual-search footguns; optional Creator Live teaser shelf behind entitlement | **1.5–2.5 wk** | SQL extend existing RPCs only |
| **E2** | World IA clarity (mode vs realm) + country UX polish + report targets for world/play | **1–2 wk** | Mostly product + light schema |
| **E3** | Payments spine for Vault (provider + webhook + checkout UI) | **3–5 wk** | Unlocks paid Vault; Play paid later |
| **E4** | Creator Live discovery + interaction hardening (keep URL model **or** add SFU) | **2–4 wk** (URL) / **6–10 wk** (SFU) | SFU is the big fork |
| **E5** | Paid Play/treasure (if approved) + settle cron | **2–3 wk** after E3 |
| **E6** | Confessions / one-time anonymous Qs (greenfield) | **4–7 wk** | Highest privacy design load |
| **E7** | Meet scale (TURN, abuse, age) | **2–3 wk** | Can parallel E6 partially |

**Realistic MVP path for “Explore next”:** E1 → E2 → (E3 if monetization) → E6 only after privacy decisions. Do **not** start E6 or SFU without blockers cleared.

---

## 7. Files likely to change (when implementing later)

| Area | Paths |
|------|-------|
| Explore UI | `app/(tabs)/explore.tsx`, `components/explore/*`, `utils/exploreForYouRank.ts`, `utils/exploreNav.ts` |
| Explore client | `services/exploreService.ts` |
| SQL | Extend `get_explore_for_you` / `get_explore_live` / `search_explore` / viral; `run_maintenance`; new confession migrations; `report_target` alters |
| Arena adapters (read) | `arenaTrendService.ts`, `arenaInterestService.ts`, `liveArenaService.ts` |
| Vault | `vaultService.ts`, Edge media access, new billing webhook function |
| Creator Live | `creatorLiveService.ts` + list/discovery RPC |
| Play | `playService.ts`, settle/expire in maintenance |
| Meet | `meetService.ts`, ICE config |
| World | `worldService.ts`, optional Explore surfacing |
| Tests | `supabase/tests/03x`, `082`, `083`, new confession suite; unit explore/play/meet |

**Do not invent:** parallel `searchAll` ranking, client-side vault unlock, second trend snapshot writer.

---

## 8. Blockers requiring product decisions

1. **One World or two?** Explore World mode (globe/country) vs `/world` geo realm — merge, deep-link, or keep separate with distinct names?
2. **Creator Live media model?** BYO HLS/embed vs managed SFU (Agora/LiveKit) — cost, latency, moderation.
3. **Payments?** Which provider (Stripe / native IAP), which SKUs (Vault only vs paid hunts), tax/geo.
4. **“Anonymous” bar for Meet & confessions?** Session alias vs cryptographic unlinkability; law-enforcement / CSAM / retention policy.
5. **Confessions distribution:** who sees a one-time item (random peer, country pool, followers-of-none)? Max lifetime? Search explicitly forbidden forever?
6. **Unified Live:** Should Explore Live show Arena rooms, Creator Live, or both — and under what labels?
7. **Paid Play:** Free-only hunts forever, or entitlement-gated hunts after Vault payments exist?
8. **Staff moderation:** Intake-only reports vs in-app mod queue before confessions ship.

---

## Bottom line

Explore is **not a greenfield shell**: For You, World canvas, country, Play, Meet, search, and Vault teasers are largely wired to production-style RPCs. Biggest holes vs the nine asks are **payments**, **global Creator Live discovery / real broadcast infra**, **World IA duality**, and especially **confessions (absent)**. Arena topic/trend engines and Vault entitlement already exist — Phase 1+ should **compose** them, not duplicate.
