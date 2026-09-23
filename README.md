# CLASH 2.0 — Phase 1

> **MAKE YOUR TAKE.**
> A social arena for 24-hour debates: drop a **Take**, someone starts a **Clash**,
> nine jurors decide, and the winners build **Reputation**.

This repository contains **Phase 1** of the CLASH 2.0 build (see `CLASH_SPEC.md` §38):
navigation, theme, the Arena feed, Take cards, the Clash battle screen, judgement,
the result reveal and Profile.

Vault, Geo-Attribution and Hall of Fame are intentionally **not** implemented yet.

---

## 1. Install & run

```bash
npm install
npx expo start          # then press i / a, or scan the QR with Expo Go
```

Useful scripts:

```bash
npm run typecheck                 # tsc --noEmit — must stay at zero errors
npm run doctor                    # expo-doctor config / dependency health
npx expo export --platform ios    # production bundle smoke test
```

Requires Node 20+ and Expo SDK 54 (React Native 0.81, React 19, Reanimated 4).

---

## 2. Stack

| Concern      | Choice                                                      |
| ------------ | ----------------------------------------------------------- |
| Framework    | Expo SDK 54 + Expo Router 6 (file-based navigation)          |
| Language     | TypeScript, `strict: true`, **zero `any`**                   |
| Motion       | React Native Reanimated 4 (animation stays on the UI thread) |
| Gestures     | React Native Gesture Handler                                 |
| Icons        | Lucide React Native v1 (per-icon imports, see `icons.ts`)    |
| Blur / glass | `expo-blur` (iOS) + layered translucent fallback on Android  |
| Gradients    | `expo-linear-gradient`, `react-native-svg` radial blooms     |
| Haptics      | `expo-haptics` behind a safe wrapper (`utils/haptics.ts`)    |

---

## 3. Architecture

```
app/
  _layout.tsx          root Stack: splash → onboarding → tabs → vault → clash
  index.tsx            animated splash (§5)
  onboard.tsx          3-screen first-launch sequence (§5)
  (tabs)/              Arena realm — the floating dock owns these five routes
    _layout.tsx        tabs + the floating glass dock
    index.tsx          THE ARENA feed (§6)
    create.tsx         Take creation (§7)
    daily-drop.tsx     9:00 PM Daily Drop (§12)
    hall-of-fame.tsx   Hall of Fame archive (§13)
    profile.tsx        Profile: rank, stats, badges, archive (§15)
  (vault)/             Vault realm — the same viewer, premium surfaces (§17–§23)
  clash/[takeId].tsx   THE CLASH: battle → judgement recorded → result (§8–§10)
  creator/, campaign/, sponsor/   Vault detail + sponsor dashboards

components/
  arena/      ArenaHeader, ArenaFeedHeader, HoodSelector, TakeCard,
              TakeCardHeader, TakeMedia, TakeActions, MediaAttachRow,
              TakeComposerFields
  clash/      ClashBody, TakePanel, VersusHeader, JudgementPicker, JuryPanel,
              RecordedBanner, ClashResult, ScoreCircles, ResultRewards,
              RewardStrip, RewardLedger, RankXpBar, Particles, duelPalette
  hof/        MuseumCard, CreatorRow, HoodRow
  profile/    ProfileHero, ProfileArchive, ReputationBar, StatGrid, BadgeRow,
              TakeMiniCard, WinCard
  vault/      VaultHeader, CreatorCard, DropRow, RadarCard, CityDonut,
              OverviewGrid, CheckoutSheet, AnalyticsPaywall
  navigation/ RealmTabBar (floating dock), DockTab, DockElevated, dockConfig,
              RealmPortal, useRealmSwitch
  onboarding/ OnboardSlide
  shared/     GlassCard, GlowButton, IconButton, SegmentedTabs, Chip, Avatar,
              Notice, EmptyState, SectionHeading, AuroraBackground,
              ClashSnapshotCard, ClashSideRow, ClashCardFooter, CountUp,
              Doodles, icons, buttonTones

data/         mockUsers, mockTakes, mockClashes, mockJury, hoods, hofTakes,
              dailyDrop, mockCreators, mockDrops, mockCampaigns, onboarding
hooks/        useClock (shared 24h countdown tick)
services/     juryService, clashService, reputationService
store/        types, reducer, actions, selectors, ClashStore (context)
theme/        colors, typography, layout, glass, motion, index
utils/        format, color, reputation, haptics
```

**Design tokens** live in `theme/` only: primary background `#08080B`, the glass
fill/border/edge ramp, the A/B duel accents, the §4 type ramp (display 34 → caption 11),
the 4pt spacing scale, radii, motion durations and easings. Screens never hardcode colours.

**State** is a typed reducer in `store/`. Screens dispatch small typed actions
(`resolveClashAction`, `toggleSave`, `reactToTake`, …) and read through pure selectors,
so a backend can replace the seed data without touching UI code.

---

## 4. Mock-data implementation (what is real vs simulated)

**Works end-to-end in the prototype**

- Arena feed ranked by heat, filtered by hood, with live 24h countdowns.
- Take cards: react, save, share (native share sheet), more, plus Clash entry.
- Clash flow: sealed 9-person jury → ballot (A / B / Undecided) → “your judgement has
  been recorded” suspense beat → verdict reveal with tally, score, reputation count-up,
  rank progress and haptics.
- Judgement is single-shot; returning to a resolved Clash shows the stored verdict.
- Reputation, coins, wins, streak and rank update in the store; the Wins tab fills up.

**Simulated on purpose**

- `services/juryService.ts` convenes jurors with a deterministic PRNG seeded from the
  Clash id (same clash ⇒ same jury). No device fingerprinting (spec §9).
- Take media is a gradient plate + caption, not a real upload.
- Coins are status points; there is deliberately **no cash-out path**.
- Onboarding completion is in-memory for now (persistence is Phase 4).

---

## 5. FUTURE PRODUCTION INFRASTRUCTURE

> None of the following is implemented or implied by the UI copy. Each has a single
> seam so it can be dropped in without rewriting screens.

| Area | Seam today | Production plan |
| --- | --- | --- |
| **Backend / auth** | `store/reducer.ts` seeds from `data/*` | Supabase tables mirroring `store/types.ts`, auth provider above `ClashProvider`, reducer replaced by a server-synced store |
| **Anti-abuse** | `services/juryService.ts` (`selectJurors`, `submitJudgement`, `calculateResult`) | Server-side juror selection, one ballot per account/device, weighted jurors (`Juror.weight` already exists), signed verdicts |
| **Payments** | none — coins are decorative | StoreKit / Play Billing for Exclusive Drops, receipt validation, entitlements |
| **Sponsor attribution** | none (Phase 3) | Campaign + coupon tables, redemption codes, per-Hood and city-level attribution joins |
| **Analytics** | none | Event stream derived from existing actions (judge, save, react, share) |
| **Persistence** | in-memory store | `@react-native-async-storage/async-storage` hydration + optimistic sync |

---

## 6. Accessibility & performance notes

- Icon-only controls are labelled; ballots expose `accessibilityState`.
- `useReducedMotion` disables the ambient bloom drift and the result particles.
- The feed uses a memoised card, `initialNumToRender` / `windowSize` tuning and
  `React.memo` so a single card action never re-renders the whole list.
- Blur runs on iOS only; Android renders a layered translucent surface instead of
  `dimezisBlurView` to protect frame rate on mid-range devices.

---

## 7. Phase 1 file conventions

- Max **150 lines** per component/screen file (`.clinerules`); screens compose
  components, they never grow into monoliths.
- Every interactive control performs an action or intentionally shows a prototype
  state — no dead buttons, no placeholder screens.
