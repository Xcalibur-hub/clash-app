# Phase 4H.1 — Groups UI completion and capability boundaries

27 October 2026. **PASS for supported Arena Groups discovery → detail → Back/re-entry on Samsung A50**, with membership shown as Joined and no unauthorized mutations. Vault media header safety hardened. No commit, push, merge or deployment.

HEAD: `cbe216a3c212a83c432f71b37b59a1debe5caa63`. Uncommitted prior UI/Vault work and QA fixtures preserved (Play `ec_9d69882d0dc1eb53`, Vault Drop `vd_1a4dd9af3f6980b2`, media `m_b46a151103fead7ac59aa114`, crew below).

## Baseline

| Check | Result |
|---|---|
| Branch | `arena-ui-review` |
| QA identity | `http://127.0.0.1:55481/__qa/identity` → `clash-ui-qa-phase4a`, system id `7700622043081482277` |
| Device | `SM-A505F` / `RZ8M30DE9NL` / `com.clash.v2.dev` |
| USB reverse | `8081`, `55481` |
| Actor | Fictional **A** (owner of QA crew) |
| Fixture writes | **None** |

## Product boundary

Arena tab **Groups** = **Arena Crews** (`/arena/crews`, embedded `GroupDiscovery`). This is distinct from Vault Creator Communities (`/vault/community/...`) and Explore Hoods. This phase accepts **Arena Groups** only.

Existing QA crew (unchanged):

| Field | Value |
|---|---|
| ID | `ac_08433d0e2f9693fd` |
| Slug | `qa-repair-1d1e36` |
| Name | QA Repair Circle |
| Route | `/arena/crews/qa-repair-1d1e36` |
| A role | Owner / **Joined** |

## Supported Groups capability matrix

| Capability | Status | Notes |
|---|---|---|
| Discovery (Explore / Joined) | **Working** | Embedded Arena Groups + advanced `/arena/crews` |
| Specialty filters | **Working** | Tech / Gaming / Politics / Sports |
| Free-text Groups search | **Missing** | No search UI/RPC wiring |
| Group card → detail | **Working** | `/arena/crews/[slug]` |
| Membership status display | **Working** | Joined / Follow / invite-only / one-Crew disabled states |
| Join / leave / follow RPCs | **Implemented** | UI present; **not executed** this phase (no mutation approval) |
| Invite / approve join-request UI | **Missing** | RPCs exist in `arenaCrewService`; no picker/moderator console |
| Group activity / channels / feed | **Missing** | Honest omission (README + prior blockedFixtures) |
| Invite members into Arena duel | **Missing** | No crew→room association |
| Groups settings / moderation console | **Missing** | Crew-scoped |
| Create group | **Working** | `/arena/crews/create` (not exercised) |
| Vault community feed/settings | Separate product | Out of Groups-tab scope |

## Native acceptance (A50)

Evidence uses **pulled screencaps** (uiautomator dumps often returned `could not get idle state` with **stale** Home hierarchy while Groups was visually selected).

| Check | Result | Evidence |
|---|---|---|
| Open Groups discovery | PASS | `24-groups-from-home` — Groups selected; Better together; Explore; QA Repair Circle JOINED |
| Open existing crew detail | PASS | `18-crew-detail` — QA Repair Circle, Open Crew, Joined, About |
| Membership state | PASS | Joined control shown; no purchase CTA |
| Header Back → discovery | PASS | `20-after-back` |
| Re-entry to detail | PASS | `21-reentry` |
| Android Back | PASS | `22-android-back` |
| Members tab content | LIMITED | Tap did not switch off About in captured shots (`26-members-attempt`) |
| Dark theme | PASS | Primary captures |
| Light / 1.3× | LIMITED | `cmd uimode night no` did not flip in-app preference; 1.3× not re-run |
| Join / leave / invite / post | NOT EXECUTED | Restricted |
| Touch / safe areas | PASS | Back and cards usable; no clipped primary controls observed |

Private captures: `.expo/ui-completion-phase4h-groups/`. Hashes: [screenshots.json](screenshots.json).

## UI fixes applied

1. **Arena Groups/Discover surface** (`app/(tabs)/index.tsx`): render `community` and `topics` in a dedicated `ScrollView` (same pattern as Live/clashes) instead of nesting under the For You `FlatList` header — avoids VirtualizedList nesting and list-layer touch contention for Groups.
2. **Side rail hit target** (`ArenaSideRail.tsx`): `zIndex`/`elevation` **2** so destination taps stay above list layers.
3. **Vault media safety** (`utils/publicMediaImageSource.ts`): attach anon `apikey` headers **only** when the URL is a public Storage object on the configured `EXPO_PUBLIC_SUPABASE_URL` origin (`/storage/v1/object/public/(public-media|private-media)/…`). Foreign hosts, signed paths, credentialed URLs, and missing keys get `{ uri }` only. Never attaches session JWT or service-role keys. Callers unchanged (`VaultReaderMedia`, `EditorialMedia`, `VaultMediaTile`, `MediaViewer`). Expanded unit tests.

No interactive controls added for unsupported channel/chat features.

## Vault media safety check

| Check | Result |
|---|---|
| Trusted QA/public-media URL → anon headers | PASS |
| Tenor / foreign host → no headers | PASS |
| Cross-origin supabase host vs configured origin → no headers | PASS |
| Service-role / session bearer not introduced | PASS |
| Call sites only use helper for Storage-derived URIs | PASS (inspect) |

## Regression

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS |
| `npm test` | PASS, **816 + 234 = 1,050** |
| `GroupDiscovery.test.cjs` | PASS, **8** |
| Focused media + arena home/crew utils | PASS, **32** |

## Features requiring new backend/product contracts

- Free-text Groups search.
- Crew discussion / activity / pins / channels.
- Crew → Arena duel invite association.
- Invite recipient picker + join-request moderator UI (RPCs already exist).
- Crew settings / ownership transfer / owner leave.

## Remaining launch-scope decisions

1. Ship Arena Groups as **discovery + identity + membership status** only, or block launch until feed/invite UX exists.
2. Whether Vault Communities are marketed as “Groups” (they are not the Arena Groups tab).
3. Authorize a later phase for join/leave/follow mutation acceptance and Members-tab native matrix.
4. Prefer screenshot/CDP evidence over uiautomator when idle-state dumps go stale on A50.

**STOP.** No commit/push/deploy. Fixtures retained.
