# Phase UI-1 — Implementation roadmap

HEAD `4adeed3b1c00908ede73916cf868e3265fc0399d`. **Do not implement in this phase.** Batches are ordered for the text-debate beta. Meet admission stays deferred. `releaseScope` unchanged.

Screenshot checkpoints assume the existing SM-A505F (`RZ8M30DE9NL`) plus 320 / 360 / 430 logical widths (preview or A50 font/display settings). Do not claim visual acceptance from code review.

---

## Priority

**P0 — first beta:** Home, Arena Live/result, Takes, Groups browse, Explore, Profile/Activity.
**P1 — coherent deferred worlds:** Vault browse, World map, Play browse.
**P2:** Settings polish, doodle pass, light-theme dock, leftover Meet chrome.
**Out of scope:** Meet re-enable, native signing, EAS, scheduler, DB mutations.

---

## Batch 0 — Design-system hygiene (1–2 days)

| Item | Routes / files | Issue | Change | Deps | Acceptance | Device checkpoint | Risk |
|---|---|---|---|---|---|---|---|
| Semantic glass | `theme/glass.ts` | Hardcoded `#111113` | Use `t.surface` / pass theme | palettes | Light+dark cards readable | Light theme Home | Low |
| Dock tokens | `RealmTabBar.tsx` | `DOCK_BG` / `DOCK_ICON` hardcoded | Arena+Vault use `t.surfaceElevated`, `t.text*` | Batch 0 | Vault dock not stuck dark-on-light | Vault + light | Medium (all tabs) |
| Font scaling policy | Play/challenge/treasure/create | `allowFontScaling={false}` | Remove except badges; add `maxFontSizeMultiplier` on toolbars | none | 1.3× font still 44pt hits, no clipped titles | A50 largest font on Play **read** | Medium |
| Strip Demo Arena | `ArenaTopBar.tsx` | Visible on A50 | Already gated; verify `appVariant` on this APK | none | Chip gone on non-dev **or** documented as internal | Home | Low |

---

## Batch 1 — Home IA and For You (P0)

**Files:** `app/(tabs)/index.tsx`, `ArenaTopBar`, `ArenaLiveGateway`, `FreshTakesSection`, `TakeFeedItem`, `utils/arenaNav.ts`.

| Issue (device/source) | Change |
|---|---|
| Four mode chips + Live’s three extra chip rows | Home = **For You \| Live** only. Groups → Explore or `/arena/crews` from a single entry. Discover topics fold into Live/Explore |
| Resumed users land on empty Live | Default `for_you`; remember last mode in memory only |
| Top bar density | Wordmark + search **or** avatar; drop duplicate ARENA label |
| Empty Live | Keep copy; one row: Challenges \| Results **or** a single Live card |

**Acceptance.** First paint is Takes (or a single Live gateway). No more than **one** chip row under the top bar. Dock still clears content (`dockBottomPadding`).

**Checkpoint.** A50: For You populated, For You empty, Live empty, Live with one card, font 1.3×, 320-width preview.

**Risk.** Mode deep-links and tests (`arenaNav`, feed tests). Update tests, not policy.

---

## Batch 2 — Arena room and verdict (P0)

**Files:** `app/arena/room/[roomId].tsx`, `LiveRoomAtmosphere`, `DuelRoomOutcome`, `VerdictReveal`, `ClashResultView`, `LiveRoomResultReveal`.

| Issue | Change |
|---|---|
| Orbs overlap result type (A50) | Atmosphere behind content or disabled when `SETTLED` |
| “SPLIT DECISION” plus human headline | Single `communityVerdictCopy` line; no legacy class labels |
| Side pills too loud | Hairline + 8% fill from `arenaSides` |
| Spectator / Crowd block | One “Crowd” disclosure, not a second page |

**Acceptance.** Settled result: headline, two sides, ballot, Review/Return — all readable with no blob over glyphs. Light+dark.

**Checkpoint.** A50: settled duel (reuse QA Rowan/Mira if still live), judging (if a room exists), Back to Home.

**Risk.** Presentation tests (`verdictView`, duel render). High visual, medium logic.

---

## Batch 3 — Takes and composer (P0)

**Files:** `app/take/[takeId].tsx`, `app/(tabs)/create.tsx`, `TakeComposerFields`, `RebuttalInput`, `PostActionsSheet`.

| Issue | Change |
|---|---|
| Aurora on Create | Remove; use `t.background` |
| Media deferred | Keep assert; show the same beta unavailable pattern, not a dead attach control |
| Keyboard | Confirm composer sits above IME on A50 (Meet E3.6.6 lesson) |
| Detail hierarchy | One primary (Reply or Challenge) visually heavier than share/more |

**Acceptance.** Create a text Take; reply; challenge sheet; no gradient wash. Font scale on detail.

**Checkpoint.** A50: create, keyboard open/hide, take detail, guest vs signed-in.

**Risk.** Media upload paths — do not re-enable media admission.

---

## Batch 4 — Groups browse (P0)

**Files:** `GroupDiscovery.tsx`, `app/arena/crews/*`, Home Groups entry.

| Issue | Change |
|---|---|
| Create + always visible | Keep button; destination already `ReleaseUnavailable` — match visual to blueprint interstitial |
| Join deferred | Browse/detail/leave/unfollow only; no success toast that implies membership |
| Icon mismatch | `BackIcon` not Lucide `ArrowLeft` |
| Duplicate IA | Home Groups chip removed in Batch 1; keep `/arena/crews` |

**Acceptance.** Guest sign-in empty; signed-in explore list; open slug; create shows beta unavailable; join CTA does not admit.

**Checkpoint.** A50: Groups list, group profile, create unavailable.

**Risk.** Crew RPCs unchanged. Tests in `GroupDiscovery.test.cjs`.

---

## Batch 5 — Explore chrome (P0)

**Files:** `app/(tabs)/explore.tsx`, `ExploreModeRail`, `ExploreFilterWheel`, `ExploreMosaicRow`.

| Issue (A50) | Change |
|---|---|
| Rail overlaps tiles + dock | Rail becomes edge peek **or** top mode tabs; never over mosaic |
| VIDI truncated | Filters: 4 visible + overflow, or shorter labels |
| IME covers feed | Search in header that shrinks; `KeyboardAvoiding` / hide rail+dock like Arena |
| Duplicate Live | Explore Live = same data as Arena Live, visually a jump into Live — not a second product |
| Duplicate QA cards | Ranking/diversity already in `diversifyByCreator` — verify on device; not a fake redesign |

**Acceptance.** No control overlaps a tile at 360/411 dp. Search Back dismisses IME without exiting the app. Meet mode shows `ReleaseUnavailable` (already wrapped).

**Checkpoint.** A50: For You, search open, search dismiss, Play browse, Meet unavailable, World if location prompt is acceptable (do not force GPS policy changes).

**Risk.** Complex virtualized list. High regression — run Explore/read-state tests.

---

## Batch 6 — Profile and Activity (P0)

**Files:** `app/(tabs)/profile.tsx`, `notifications.tsx`, `ProfileHero`, `settings.tsx`, `AppSidebar.tsx`.

| Issue | Change |
|---|---|
| Unverified layout | Apply type/space tokens; hero already has Underline doodle — keep |
| Activity | Keep inbox; align row density with feed cards |
| Settings | Grouped surface lists, 44pt rows |
| Sidebar | Account + Settings + World + Vault only |

**Acceptance.** Guest profile CTA; signed-in lists; open a notification to Take/Arena; Settings Back.

**Checkpoint.** A50: profile, activity populated/empty/error, settings, sidebar.

**Risk.** Notification routing (Arena return visits).

---

## Batch 7 — Vault / World / Play presentation (P1)

Do **not** enable compose, commerce acquire, or Play join.

| Surface | Issue | Change | Checkpoint |
|---|---|---|---|
| Vault home | Unverified; realm unexplained | One-line realm hint; `VaultHome` skeletons already exist — keep | A50 Vault home + one public drop (if QA content remains) |
| World | Map + compose plus | Compose stays unavailable; map empty/permission using `WorldMapUnavailable` | Map + deny location |
| Play | Font lock; join deferred | Scaling from Batch 0; join CTA → unavailable copy, browse rails stay | Play home + challenge **read** |

**Acceptance.** User can **see** creators, map, challenges. Admit actions never succeed. Visual language matches Home cards (hairline, 16 pad).

**Risk.** Low if no RPC changes. Do not touch disposable/QA databases.

---

## Batch 8 — Shared sheets, media, motion (P1)

Normalize sheets to `ArenaSheet`. `MediaViewer` scrim tokens only. Reduced-motion audit on RealmPortal and result reveal.

**Checkpoint.** One sheet (PostActions) + one media open on A50.

---

## Suggested calendar

| Week | Batch | Owner focus |
|---|---|---|
| 1 | 0 + 1 | Tokens, Home IA |
| 1–2 | 2 | Result/room |
| 2 | 3 + 4 | Takes, Groups |
| 3 | 5 + 6 | Explore, Profile |
| 4 | 7 + 8 | Deferred worlds, sheets |

Each batch: implement → unit/UI tests already in repo → **A50 screenshots in `docs/evidence/ui-completion/`** → then next batch. No freeze commit until a batch’s checkpoint is device-backed.

---

## Global acceptance (beta visual)

- Monochrome + gold; sides only as accents.
- ≤ one in-page nav row on Home.
- No overlapping chrome on Explore at A50 resolution.
- Font scale 1.3× does not clip primary actions.
- Empty/error/deferred copy distinct.
- Meet still cannot start from UI.
- EAS archive / releaseScope **untouched** unless a later reviewed runtime file is required (not this phase).

---

## Regression watchlist

- `scripts/release-scope.test.cjs` (admission)
- `scripts/meet-cancellation.test.cjs` (exit)
- `components/arena/groups/GroupDiscovery.test.cjs`
- Explore / Play accessibility tests
- Duel render + settlement-history
- `dockBottomPadding` consumers

---

## Stop

Roadmap is documentary. Next implementation phase must re-check HEAD, keep Meet deferred, and capture the unverified list from `FULL_APP_VISUAL_AUDIT.md` before claiming those surfaces.
