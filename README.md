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
| Backend      | Supabase Postgres — RLS + column grants, typed client (`supabase/`, `services/apiService.ts`) |

---

## 3. Architecture

```
app/
  _layout.tsx          root Stack: splash → onboarding → tabs → vault → clash
  index.tsx            animated splash (§5)
  onboard.tsx          3-screen first-launch sequence (§5)
  (tabs)/              Arena realm — the native dock owns these five routes
    _layout.tsx        tabs + RealmTabBar (native-standard dock)
    index.tsx          THE ARENA feed (§6)
    explore.tsx        Explore: search, Daily Drop, Hoods, Hall of Fame (§15–§17)
    create.tsx         Take creation (§7)
    notifications.tsx  Activity notifications
    profile.tsx        Social profile: identity + content grid (§18–§19)
  (vault)/             Vault realm — the same viewer, premium surfaces (§17–§23)
  clash/[takeId].tsx   THE CLASH: battle → vote locked → final verdict (§8–§10)
  creator/, campaign/, sponsor/   Vault detail + sponsor dashboards

components/
  arena/      ArenaHeader, ArenaFeedHeader, HoodSelector, TakeCard,
              TakeCardHeader, TakeMedia, TakeActions, MediaAttachRow,
              DebateBanner, ReigningBanner, TakeComposerFields
  clash/      ClashBody, TakePanel, VersusHeader, JuryPanel, LockedBanner,
              RecordedBanner, ClashResult, ScoreCircles, ResultRewards,
              RewardStrip, RewardLedger, RankXpBar, Particles, duelPalette
  explore/    SearchResults, TrendingSection, HoodsSection, DailyDropSection,
              FameSection, exploreStyles
  hof/        MuseumCard, CreatorRow, HoodRow, SearchBar
  profile/    ProfileIdentity, ProfileArchive, TakeGrid, WinGrid, ProfileHero,
              ReputationBar, StatGrid, BadgeRow, TakeMiniCard, WinCard
  vault/      VaultHeader, CreatorCard, DropRow, RadarCard, CityDonut,
              OverviewGrid, CheckoutSheet, AnalyticsPaywall, VaultHero,
              AudienceBars, AttributionPanel, CreatorRow, vaultStyles,
              vaultHomeStyles, analyticsStyles
  navigation/ RealmTabBar (native standard tab bar), dockConfig,
              RealmPortal (first-bloom → repeat-crossfade), useRealmSwitch
  onboarding/ OnboardSlide
  shared/     GlassCard, GlowButton, IconButton, SegmentedTabs, Chip, Avatar,
              Notice, EmptyState, SectionHeading, AuroraBackground,
              ClashSnapshotCard, ClashSideRow, ClashCardFooter, CountUp,
              Doodles, icons, buttonTones

data/         mockUsers, mockTakes, mockClashes, mockJury, hoods, hofTakes,
              dailyDrop, mockCreators, mockDrops, mockCampaigns, onboarding,
              mockNotifications
hooks/        useClock (shared 24h countdown tick)
services/     juryService, clashService, reputationService, vaultService,
              apiService + supabaseClient (typed data layer)
store/        types, reducer, actions, selectors, ClashStore (context)
supabase/     schema.sql, seed.sql (Postgres + RLS), database.types.ts
theme/        colors, typography, layout, glass, motion, index
utils/        format, color, reputation, haptics
```

**Design tokens** live in `theme/` only: primary background `#08080B`, the glass
fill/border ramp, the A/B duel accents, the §4 type ramp (display 34 → caption 11),
the 4pt spacing scale, radii, motion durations and easings. Screens never hardcode colours.

**State** is a typed reducer in `store/`. Screens dispatch small typed actions
(`recordBallot`, `toggleSave`, `reactToTake`, …) and read through pure selectors,
so a backend can replace the seed data without touching UI code.

---

## 4. Mock-data implementation (what is real vs simulated)

**Works end-to-end in the prototype**

- Arena feed ranked by heat, filtered by hood, with live 24h countdowns.
- Take cards: react, save, share (native share sheet), more, plus Clash entry.
- Clash flow: live debate → ballot (A / B) → "vote locked in" with a countdown to the
  Final Judgement → verdict reveal with tally, score, reputation count-up, rank progress
  and haptics. A verdict files when the 24-hour window closes, not on the tap.
- Judgement is single-shot per Clash; a settled Clash always shows the stored verdict.
- Reputation, coins, wins, streak and rank update in the store; the Wins tab fills up.

**Simulated on purpose**

- `services/juryService.ts` convenes jurors with a deterministic PRNG seeded from the
  Clash id (same clash ⇒ same jury). No device fingerprinting (spec §9).
- Take media is a gradient plate + caption, not a real upload.
- Coins are status points; there is deliberately **no cash-out path**.
- Onboarding completion is in-memory for now (persistence is Phase 4).

---

## 5. Supabase backend (the Arena slice)

The Arena has a real backend. The UI still renders from the typed store, so a device
with no network behaves exactly as before; `services/apiService.ts` is the one seam a
screen swaps a selector for a fetch through.

| Piece | File | What it does |
| --- | --- | --- |
| Client | `services/supabaseClient.ts` | AsyncStorage session, refresh paused while backgrounded, `SupabaseError` for typed failures |
| Schema | `supabase/schema.sql` | profiles · takes · comments · comment_upvotes, RLS, column grants, `toggle_comment_upvote` |
| Seed | `supabase/seed.sql` | the same 11 people, 11 takes and 22 rebuttals the prototype ships |
| Types | `supabase/database.types.ts` | hand-mirrored `Database` type — `supabase.from('takes')` returns `TakeRow[]`, still zero `any` |
| Queries | `services/apiService.ts` | `fetchTakes` · `fetchComments` · `postTake` · `postComment` · `toggleUpvote` |

### Setting it up

1. `.env` holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Both are
   baked into the bundle on purpose: the publishable key is governed by RLS.
2. Paste `supabase/schema.sql`, then `supabase/seed.sql`, into the dashboard SQL Editor.
   The seed ends with a verification row: **11 profiles · 11 takes · 11 live · 22
   rebuttals · 3 votes**.
3. `npm run typecheck` — the data layer is typed end to end.

### How writes are locked down

- **RLS** decides rows: reads are public (the Arena is a public feed); writes need a
  session that owns the row. Hood moderators act only inside `moderated_hoods`.
- **Column grants** decide columns: an API client can write words and media, never
  `reputation`, `coins`, `rank`, `role`, counters or the 24-hour window. Those stay
  server-owned, which is where the Clash economy belongs.
- **Functions** own derived state: `toggle_comment_upvote` flips a vote and returns the
  fresh tally inside one transaction, and a trigger keeps `comments.upvotes_count` in
  step with `comment_upvotes`.

### Letting the app write (one-time)

Reads work immediately with the publishable key. Insert/update policies additionally
need the seeded viewer linked to a real session — one statement, after the app has
signed in once:

```sql
select id from auth.users order by created_at desc limit 1;   -- copy the uid
update public.profiles set auth_user_id = '<uid>' where id = 'u-viewer';
```

`ensureSession()` signs in anonymously on the first write, so anonymous sign-ins must
be enabled in Dashboard → Authentication → Providers. Nothing breaks if they are not:
reads keep working and a refused write surfaces as a typed `SupabaseError`.

### Still simulated

Clashes, jurors and verdicts stay client-side (`services/juryService.ts`), as do the
Vault and the sponsor campaigns. `supabase/schema.sql` lists the §29 tables that come
next.

---

## 6. FUTURE PRODUCTION INFRASTRUCTURE

> None of the following is implemented or implied by the UI copy. Each has a single
> seam so it can be dropped in without rewriting screens.

| Area | Seam today | Production plan |
| --- | --- | --- |
| **Backend / auth** | `services/apiService.ts` over `supabase/schema.sql`; the reducer still seeds from `data/*` | Auth provider above `ClashProvider`, feed screens reading `apiService` instead of seed data, reducer replaced by a server-synced store |
| **Anti-abuse** | `services/juryService.ts` (`selectJurors`, `submitJudgement`, `calculateResult`) | Server-side juror selection, one ballot per account/device, weighted jurors (`Juror.weight` already exists), signed verdicts |
| **Payments** | none — coins are decorative | StoreKit / Play Billing for Exclusive Drops, receipt validation, entitlements |
| **Sponsor attribution** | none (Phase 3) | Campaign + coupon tables, redemption codes, per-Hood and city-level attribution joins |
| **Analytics** | none | Event stream derived from existing actions (judge, save, react, share) |
| **Persistence** | in-memory store; the auth session alone persists in AsyncStorage | Store hydration + optimistic sync on the same client |

---

## 7. Accessibility & performance notes

- Icon-only controls are labelled; ballots expose `accessibilityState`.
- `useReducedMotion` disables the ambient bloom drift and the result particles.
- The feed uses a memoised card, `initialNumToRender` / `windowSize` tuning and
  `React.memo` so a single card action never re-renders the whole list.
- Blur runs on iOS only; Android renders a layered translucent surface instead of
  `dimezisBlurView` to protect frame rate on mid-range devices.

---

## 8. Phase 1 file conventions

- Max **150 lines** per component/screen file (`.clinerules`); screens compose
  components, they never grow into monoliths.
- Every interactive control performs an action or intentionally shows a prototype
  state — no dead buttons, no placeholder screens.
