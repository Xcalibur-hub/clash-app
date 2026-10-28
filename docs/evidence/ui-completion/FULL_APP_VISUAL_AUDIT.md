# Phase UI-1 — Full app visual audit

28 October 2026. Checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`, HEAD **`4adeed3b1c00908ede73916cf868e3265fc0399d`**.

**Read-only.** No application source, migrations, `releaseScope`, Docker, or protected databases were changed. No commit, push, merge, native build, or EAS upload.

Design target: a distinctive social product — Apple-level restraint, Instagram-level scanability, TikTok Live energy in Arena — without copying those interfaces. Monochrome foundation, gold accent (`#C9A96A`), organic doodles used sparingly, Android-first (Samsung A50).

## Method

| Layer | What was used |
|---|---|
| Source | Expo Router `app/**`, `theme/**`, `components/navigation/**`, product screens listed below, `utils/releaseScope.ts` |
| Device | Existing `com.clash.v2.dev` on **SM-A505F** (`RZ8M30DE9NL`), 1080×2340, already installed. Foregrounded only. No rebuild, no env change, no Docker. |
| Distinctions | **Source exists** ≠ **on-device appearance verified**. This report never treats inspection as visual acceptance. |

Authenticated session was already present (green `QR` avatar, Activity badge). Guest onboarding was not recaptured.

---

## Screen coverage table

Status: **I** implemented · **P** partial · **U** placeholder/thin · **D** deferred admission (client `releaseScope`) · **A** inaccessible without auth or server data.

Device: **Y** captured this phase · **—** not captured (see unverified list).

| Area | Route / surface | Primary source | Status | Device | Notes |
|---|---|---|---|---|---|
| Splash | `/` | `app/index.tsx` | I | — | Wordmark + Aurora; routes to tabs or onboard |
| Onboarding | `/onboard` | `app/onboard.tsx` + `OnboardDemos` | I | — | 3 stages + Squiggle doodle |
| Auth | `/auth` | `app/auth.tsx` | I | — | Email OTP, KAV |
| Interests | `/interests` | `app/interests.tsx` | I | — | Gated overlay also via `InterestOnboardingGate` |
| Home / For You | `/(tabs)` `index` mode `for_you` | `app/(tabs)/index.tsx`, `TakeFeedItem`, `FreshTakesSection` | I | — | Default mode; not captured (session resumed on Live) |
| Arena Live gateway | `index` mode `clashes` | `ArenaLiveGateway`, `ArenaClashes` | I | **Y** | Chip stack + empty snapshot |
| Groups (tab) | `index` mode `community` | `ArenaCommunity` → `GroupDiscovery` | I / D join | — | Discover readable; create deferred |
| Discover topics | `index` mode `topics` | `ArenaTopics` | I | — | |
| Explore For You | `/(tabs)/explore` | `app/(tabs)/explore.tsx` | I | **Y** | Mosaic + filter + floating rail |
| Explore World | explore mode `world` | `ExploreWorldCanvas`, `WorldExperience` | I | — | Also `/world` stack |
| Explore Live | explore mode `live` | `ExploreLivePanel` | I | Y (cards on For You) | Duplicate of Arena live discovery |
| Explore Play | explore mode `play` | `PlayHomePanel` | I / D join | — | Browse allowed; join deferred |
| Explore Meet | explore mode `meet` | `MeetHomePanel` | I / D | — | Wrapped with `withReleaseAdmission` |
| Create Take | `/(tabs)/create` | `app/(tabs)/create.tsx` | I / D media | — | Text allowed; media assertReleaseAdmission |
| Activity | `/(tabs)/notifications` | `app/(tabs)/notifications.tsx` | I | — | Badge visible on dock (device) |
| Profile (self) | `/(tabs)/profile` | `ProfileScreen` | I | — | Guest empty + AppearanceRow in source |
| Profile (other) | `/profile/[profileId]` | `app/profile/[profileId].tsx` | I | — | |
| Settings | `/settings` | `app/settings.tsx` | I | — | Sparse list UI |
| Take detail | `/take/[takeId]` | `app/take/[takeId].tsx` | I | — | Replies, challenge, question vote |
| Clash / Room | `/arena/room/[roomId]`, `/clash/[takeId]` | `app/arena/room/[roomId].tsx`, `DuelRoomExperience` | I | **Y** (settled result) | Atmosphere orbs overlap type |
| Challenges list | `/arena/challenges` | `app/arena/challenges.tsx` | I / conditional | — | |
| Group list | `/arena/crews` | `app/arena/crews/index.tsx` | I | — | |
| Group create | `/arena/crews/create` | `create.tsx` | D | — | `withReleaseAdmission('groups')` |
| Group profile | `/arena/crews/[slug]` | `[slug].tsx` | I / D join | — | Read + leave preserved |
| Vault home | `/(vault)` | `VaultHome` | I | — | Realm switch on dock |
| Vault collections | `/(vault)/collections` | `app/(vault)/collections.tsx` | I | — | |
| Creator storefront | `/vault/[creatorId]` | | I (public read) | — | |
| Drop / collection / course | `/vault/drop`, `collection`, `course` | | I public read | — | Prior A50 evidence exists historically |
| Vault compose / studio | `/vault/compose`, `/vault/studio` | | D | — | |
| Product / service / community | `/vault/product`, `service`, `community` | | I read / D acquire | — | |
| Creator AI / live | `/vault/ai`, `/vault/live` | | D new | — | |
| World map | `/world` | `app/world/index.tsx` | I read / D compose | — | MapView + permission |
| World compose | `/world/compose` | | D | — | |
| Play challenge / treasure | `/explore/challenge/[id]`, `treasure/[id]` | | I read / D join | — | Heavy `allowFontScaling={false}` |
| Meet session / video | `/explore/meet/*` | | D new; continue existing | — | Audit UI only |
| Sponsor / earnings | `/sponsor*`, `/campaign*`, `/earnings*` | | D new | — | |
| Demo Arena | `/demo-arena` | `app/demo-arena.tsx` | Dev-gated | Visible chrome | “Demo Arena” in top bar on A50 |
| Shared sheets | many `*Sheet.tsx` | | I | — | 27 sheet files |
| Media viewer | `components/shared/MediaViewer.tsx` | | I | — | |
| Release unavailable | `ReleaseUnavailable` | | I | — | Meet/create/compose/sponsor |

---

## Device captures (this phase)

Files under `docs/evidence/ui-completion/screenshots/` (full PNG + 360px JPEG preview).

| File | What it actually shows | Visual notes |
|---|---|---|
| `01-resume` | Settled Clash **result** (QA Rowan vs QA Mira) | Atmosphere blobs overlap copy; dual verdict language (“stronger case” **and** “1 judgment · SPLIT DECISION”); spectator chrome + Crowd expand; green/blue side pills |
| `02-after-back` / `03-home-tab` / `15-resume2` | Arena **Live** (not For You feed) | Four rows of navigation chips; large marketing headline; empty “No live Clashes in this snapshot”; Demo Arena + search + green QR; floating dock |
| `04-explore-tab` / `10-vault` | Explore For You | Search + ALL/TRENDING/ARENA/VAULT/**VIDI truncated**; Live now + Trending cards; **floating mode rail overlaps mosaic**; dock overlaps cards |
| `05`–`09` | Explore **search + Samsung IME** | Keyboard covers feed; paste/clipboard overlay; WhatsApp logout banner (system, not app) |

A50 was connected and Clash resumed authenticated. **System Back twice from Explore search left the app** (subsequent taps hit launcher/Google). Those non-Clash frames were discarded.

---

## Unverified device states (do not treat as visually accepted)

- Splash, onboard, auth, interests
- Arena **Home / For You** feed and Fresh Takes magazine
- Arena Groups / Discover topics on device
- Take detail, composer, keyboard on Take/Arena room
- Live room **open** (not settled): judging, typing, evidence, spectator join
- Activity inbox, Profile, Settings, sidebar drawer
- Vault realm home / collections / drop reader
- World map
- Play home / challenge / treasure detail
- Meet unavailable screen and leftover session UI
- Light theme
- Font scale 1.3+ and 320 / 360 / 430 dp width (A50 ~411 dp at 420dpi)
- Guest session
- Error/offline banners except the Live empty card

Historical A50 reports (Play, Vault drop, Meet keyboard) exist under `docs/evidence/` but are **not** re-verified here.

---

## Product-area findings

### 1. Home / For You / Fresh Takes

**Source.** `app/(tabs)/index.tsx` stacks `ArenaTopBar`, mode rail (Home / Live / Groups / Discover), then Live gateway **or** Fresh Takes + `TakeFeedItem`. `TakeFeedCard` is a solid `t.surface` hairline card with avatar, pulse, media still, actions.

**Device.** For You not captured. Live (the resumed mode) already shows the IA problem: too many destinations before content.

**Issues.**
- Dual “home”: tab Home vs in-screen Home vs Live vs Explore.
- Top bar is dense (CLASH, ARENA, Demo Arena, search, QR).
- Feed cards are competent but risk looking like generic social cards if Fresh Takes / story beats are not the first paint.
- `glassSurface()` still hardcodes dark `#111113` (`theme/glass.ts`) — light theme leak if reused.

**Preserve.** `TakeFeedCard` spacing, `EmptyState`, `dockBottomPadding`, Fresh Takes editorial intent.

### 2. Arena / Live / Spectators / Verdict

**Device (Live).** Marketing block “Find your next debate.” then **Challenges / Results**, **On now / Coming up / Topic rooms**, **For You / Following / Discover**, then empty snapshot. Usable but not premium: the user works through chrome, not a fight.

**Device (settled).** Stronger case headline is good. Failures: decorative orbs sit on type; **SPLIT DECISION** still appears beside the human verdict line; Crowd “History · tap Expand” is weakly hierarchical; green/blue fills fight the monochrome + gold system.

**Source.** Room is feature-complete (`LiveRoom*`, duel presentation, sheets). `communityVerdictCopy` is used on some surfaces; the captured result still showed legacy split-decision wording — treat as a visual consistency defect until that line is gone on device.

**Issues.** Atmosphere over content; chip explosion; spectator chrome competing with verdict; `allowFontScaling={false}` on judging eyebrow (`DuelRoomOutcome`).

**Preserve.** Duel presentation rules, `VerdictReveal` motion, `EmptyState` room empty floor, haptic judge.

### 3. Takes / discussions / replies

**Source.** Detail is a real discussion product: editorial header, action row, `CommentBranch`, `RebuttalInput`, challenge sheet, question votes. Composer hides dock (`create` tabBar null).

**Issues.** Create still wraps `AuroraBackground` (gradient energy vs “no excessive gradients”). Media attach is deferred via `assertReleaseAdmission('media')` — UI must not look broken. `allowFontScaling={false}` on create. Keyboard path exists (`useKeyboardVisible`) but A50 composer not captured.

### 4. Groups / communities

**Source.** `GroupDiscovery` is a full discover UI (joined/explore, sort, specialties, pagination, guest sign-in). Create CTA always visible; **create route is deferred**. Join on `[slug]` uses `releaseAllows('groups','admit')`.

**Issues.** Nested IA: Arena Groups tab **and** `/arena/crews` **and** sidebar. Plus/create that lands on “Not available in this beta” is a dead-end if copy is not local. Lucide `ArrowLeft` vs custom `BackIcon` inconsistency.

**Preserve.** `GroupCard` / `GroupMark` identity, guest vs member distinction tests.

### 5. Explore / Discover

**Device.** Best entertainment energy in the app: large Live/Clash tiles, dark mosaic. Also the worst chrome collision: **filter chips + floating vertical rail + capsule dock + Samsung nav**. “VIDI” truncated. Search IME covers the mosaic. Cards repeat the same QA repairability prompt — content diversity is a data issue, but visually it reads as duplicate AI cards (explicitly against direction).

**Issues.** Explore Live vs Arena Live duplicate. Mode rail should not overlay tiles. Search field is too eager (taps meant for Arena chips focused it).

**Preserve.** Mosaic packing, `ReadFeedback`, mode model (For You / World / Live / Play / Meet).

### 6. Profiles / Activity / Notifications

**Source.** Profile is a real social identity (`ProfileHero`, lists, appearance). Activity is a real inbox with kinds → Take / Arena / profile. Dock badge works (seen on device).

**Unverified on device.** Layout, font scale, empty/error.

**Issues.** Settings is sparse text rows, not a premium list. Guest profile is EmptyState only. Sidebar duplicates tab destinations.

### 7. Vault / creator

**Source.** Dedicated realm + `VaultHome` “universes not shelves” intent, collections, storefronts. New publishing deferred. Public read allowed.

**Device.** Vault realm not opened (diamond tap missed after IME). Dock Vault icon is visible.

**Issues.** Realm switch is powerful but unexplained. Android glass is solid fill (documented: blur iOS-only). Commerce CTAs must stay non-admitting without looking disabled-broken.

### 8. World / maps

**Source.** Full MapView experience, clusters, missions, compose deferred. Settings even links “Open World”.

**Unverified on device.** Map tiles, permission empty, light map style.

### 9. Play / challenges

**Source.** `PlayHomePanel` rails + detail screens. Join deferred; existing participant continue allowed. Widespread `allowFontScaling={false}` on challenge/treasure — **fails the 320/font-scale requirement** in source.

### 10. Meet (deferred — UI audit only)

`MeetHomePanel` is a complete TEXT/VIDEO matcher UI, then **exported through `withReleaseAdmission(..., 'meet')`**. Video prep route same. Existing session routes remain for continuation/exit. **Do not re-enable.** Visual work, if any, is the unavailable screen and leftover-session chrome — not a new join funnel.

### 11. Onboarding / auth / settings

Splash matches spec wordmark. Onboard uses doodles correctly (sparse). Auth is functional OTP, not branded as a campaign. Settings under-designed vs the rest of the system.

### 12. Shared navigation, modals, media

- **Dock:** capsule, 52px, arena uses theme surface; Vault dock still uses hardcoded `DOCK_BG` dark fill — light-theme risk.
- **Sidebar:** ChatGPT-like density (`typeScale.nav`) on top of tabs — extra IA.
- **Sheets:** 27 files; `ArenaSheet` is the pattern to converge on.
- **MediaViewer:** present; not captured.
- **Haptics + Reanimated** press scale `0.985` — keep.
- **ReleaseUnavailable:** functional, visually a bare ScrollView — too sterile for a social beta interstitial.

---

## Cross-cutting UX

| Theme | Evidence |
|---|---|
| Navigation clutter | Mode rail + Live chip rows + Explore rail + dock + sidebar + search |
| Weak hierarchy | Live empty: headline bigger than any content; result orbs > type |
| Repetitive cards | Explore tiles share the same QA prompt |
| Keyboard / safe area | Explore IME covers mosaic; dock hides on Arena keyboard but Explore search does not |
| Accessibility | Many `allowFontScaling={false}`; little `maxFontSizeMultiplier` (only `ArenaDailyDropBanner` 1.3) |
| Token drift | `palettes` vs `colors.ts`/`ink` vs `arena.ts` vs hardcoded side greens/purples |
| Android glass | No blur; solid plates — lean into matte, do not fake iOS blur |
| Dev chrome | Demo Arena on production-looking A50 build |
| Dual verdict language | Human line + SPLIT DECISION on captured result |

---

## What already feels like CLASH (keep)

1. Semantic light/dark palettes and Inter type ramp (`theme/palettes.ts`, `typography.ts`).
2. 4/8 spacing and restrained radii (`layout.ts`).
3. Motion tokens 100–400ms (`motion.ts`).
4. `GlowButton` (misnamed: solid fill, no bloom).
5. `EmptyState` / `ReadFeedback` honesty (empty ≠ error).
6. Take feed card anatomy and pulse metadata.
7. Duel/result **intent** (stronger case, transcript, return).
8. Realm split Arena vs Vault.
9. Meet/create/compose **admission wrappers** (policy, not visuals).
10. Sparse doodles on onboard / Fresh Takes / profile underline.

---

## App-wide journeys (current vs intended)

| Journey | Current | Intended beta |
|---|---|---|
| New user → first content | Splash → onboard → Arena (guest OK) → sign-in for write | Same; land on **For You Takes**, not Live empty |
| Browse Take → reply / challenge | Feed card → `/take/:id` → rebuttal / challenge sheet | Same; one obvious primary action |
| Enter Arena → watch / vote / assist | Live chips → room; settled result captured | Open **one** live card from Home; verdict without overlay noise |
| Join / discover Group | Groups tab + `/arena/crews`; join deferred | Browse + follow/leave; no fake create success |
| Discover creators | Explore mosaic + Vault realm | Explore as magazine; Vault as quieter universe |
| Vault / World / Play | Readable; compose/join deferred | Coherent browse; unavailable copy only on admit |
| Meet | Admission blocked | Stay blocked; drain existing sessions only |

---

## Decision

Inventory complete for source. **Partial device evidence** on A50 (Live, Explore, settled result, IME). Remaining surfaces listed as unverified. Blueprint and roadmap are the next deliverables in this folder. Stop application changes.
