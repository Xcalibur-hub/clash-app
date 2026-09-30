# CLASH 2.0 — Arena beta

> **MAKE YOUR TAKE.**
> A social arena for 24-hour debates: drop a **Take**, someone starts a **Clash**,
> nine jurors decide, and the winners build **Reputation**.

This repository contains the **Arena beta** of the CLASH 2.0 build (see `CLASH_SPEC.md`
§38): navigation, theme, the Arena feed, Take creation, the server-authoritative Clash
screen (ballot → verdict), Explore, notifications, profiles, the creator Vault surfaces
and the sponsor dashboards.

Hall of Fame is intentionally **not** implemented yet.

---

## 1. Install & run

```bash
npm install
npx expo start          # then press i / a, or scan the QR with Expo Go
```

Useful scripts:

```bash
npm run typecheck                 # tsc --noEmit — must stay at zero errors
npx expo-doctor                   # config / dependency health (18 checks)
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
| Blur / glass | layered translucent surfaces — `GlassCard` (gradient + tint), no native blur |
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
  auth.tsx             sign in / sign up / anonymous session (§28)
  (tabs)/              Arena realm — the native dock owns these five routes
    _layout.tsx        tabs + RealmTabBar (native-standard dock)
    index.tsx          THE ARENA feed (§6)
    explore.tsx        Explore: search + People, Hoods, Popular Takes (§15–§17)
    create.tsx         Take creation (§7)
    notifications.tsx  Activity notifications
    profile.tsx        Social profile: identity + content grid (§18–§19)
  (vault)/             your own Vault — Drops · Collections · premium Profile
    index.tsx          your Drops: open the Vault, compose, publish, remove
    collections.tsx    permanent Collections: create, add, remove
    profile.tsx        the same viewer, seen from the premium realm (§23)
  vault/[creatorId].tsx     A creator's public Vault (viewer perspective)
  vault/drop/[dropId].tsx   the Drop reader (public or signed private media)
  vault/compose.tsx    Drop composer: access level · media · caption · publish
  clash/[takeId].tsx   THE CLASH: ballot → vote locked → server verdict (§8–§10)
  take/[takeId].tsx    Rebuttal thread for one Take
  profile/[profileId].tsx  Another person's profile
  hood/[hoodId].tsx    A single Hood's feed
  campaign/, sponsor/   prototype sponsor dashboards (later phase)

components/
  arena/      ArenaTopBar, FeedScopeTabs, HoodHeader, HoodSelector, HoodStrip,
              TakeFeedItem, TakeHeader, TakeBody, TakeActionRow, TopRebuttalPreview,
              CommentThread, RebuttalInput, PostActionsSheet, TakeMedia,
              TakeMediaPreview, MediaAttachRow, TakeComposerFields, createTakeStyles
  clash/      ClashSide, ClashStatus, JudgementPanel, ClashResultView, duelPalette
  explore/    SearchResults, SearchRow, PeopleSection, HoodsSection,
              PopularTakesSection, exploreStyles
  hof/        SearchBar
  notifications/ NotificationRow
  profile/    ProfileScreen, ProfileHeader, ProfileLists, EditProfileSheet,
              SignOutSheet, ProfileHero, ProfileIdentity, ReputationBar, StatGrid,
              BadgeRow, TakeMiniCard, TakeGrid, WinCard, WinGrid, AppearanceRow,
              profileStyles
  vault/      VaultScreen (viewer), VaultIdentityHeader, VaultDropCard,
              VaultCollectionCard, DropReader, CreatorVaultHome, CreatorDropRow,
              CreatorCollections, DropComposer, VaultFormSheet,
              SubscriptionInfoSheet, VaultHeader, CreatorRow, OverviewGrid,
              CityDonut, vaultStyles
  navigation/ AppSidebar, SidebarBody, SidebarLinks, SidebarIdentity,
              RealmTabBar (native standard tab bar), RealmPortal,
              dockConfig, realmRoutes, useRealmSwitch
  onboarding/ OnboardSlide
  shared/     GlassCard, GlowButton, IconButton, SegmentedTabs, Chip, Avatar,
              Notice, EmptyState, SectionHeading, AuroraBackground,
              Doodles, icons, buttonTones

data/         mockUsers, mockTakes, mockComments, hoods, mockCreators, mockDrops,
              mockCampaigns, onboarding
hooks/        useClock, useMediaPicker, useDebouncedValue, useRequireAuth,
              useTakeReaction
services/     supabaseClient, apiService, arenaMappers, hydrationService,
              authService, profileService, socialService, safetyService,
              hoodService, mediaService, searchService, notificationService,
              clashEngineService, vaultService, vaultMappers,
              vaultPrototypeService, logger
store/        types, reducer, actions, selectors, ClashStore (context),
              AuthProvider, AuthHydrator, NotificationUnreadProvider
supabase/     migrations/ (source of truth), tests/, functions/, seed.sql,
              database.types.ts, config.toml, SCHEDULER.md, VAULT_MEDIA.md
theme/        colors, typography, layout, glass, motion, index
utils/        format, color, reputation, haptics
```

**Design tokens** live in `theme/` only: primary background `#08080B`, the glass
fill/border ramp, the A/B duel accents, the §4 type ramp (display 34 → caption 11),
the 4pt spacing scale, radii, motion durations and easings. Screens never hardcode colours.

**State** is a typed reducer in `store/`. Screens dispatch small typed actions
(`toggleSave`, `reactToTake`, `hydrateArena`, …) and read through pure selectors. Clash
verdicts, reputation and coins are server-authoritative; the reducer only mirrors them.

---

## 4. What is real vs simulated

**Works end-to-end**

- Arena feed ranked by heat, filtered by hood and scope, with live 24h countdowns.
- Take creation: text, hood and a real media upload to Supabase Storage, on a 24h clock.
- Reactions, rebuttals, upvotes, saves, follows, and block / mute / report — all through
  SECURITY DEFINER RPCs, with RLS deciding what the feed is allowed to show.
- Clash flow: ballot (A / B) → "vote locked in" → the server's verdict, with tally, score
  and the reputation/coin delta. `settle_due_clashes` files verdicts on a minute-level
  schedule, a settled Clash always shows its stored verdict, and a tie settles as a draw.
- Reputation, coins, rank and streak are server-derived from `reputation_events`.
- Explore search across people, hoods and takes; notifications with an unread badge.

**Simulated on purpose**

- Coins are status points; there is deliberately **no cash-out path**.
- Exclusive-drop checkout and the pro-analytics unlock are local stubs — no payment
  provider is wired.
- Onboarding completion is in-memory; the auth session is the one thing that persists
  (AsyncStorage).
- Hall of Fame is not implemented.

---

## 5. Supabase backend

The Arena has a real backend. The UI still renders from the typed store, so a device
with no network behaves exactly as before; screens read through `services/*Service.ts`,
one module per domain wrapping the typed client.

| Piece | File | What it does |
| --- | --- | --- |
| Client | `services/supabaseClient.ts` | AsyncStorage session, refresh paused while backgrounded, `SupabaseError` for typed failures |
| Migrations | `supabase/migrations/` | the source of truth: tables, RLS policies, column grants and every RPC |
| Seed | `supabase/seed.sql` | local demo rows, loaded by `supabase db reset` |
| Types | `supabase/database.types.ts` | generated `Database` type — `supabase.from('takes')` returns `TakeRow[]`, still zero `any` |
| Tests | `supabase/tests/` | pgTAP suites covering RLS, rate limits, media, the Clash engine, draws, insert lockdown and the scheduler |
| Queries | `services/*Service.ts` | one typed module per domain — `apiService`, `clashEngineService`, `hoodService`, `socialService`, `vaultService`, … |

### Setting it up

1. `.env` holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Both are
   baked into the bundle on purpose: the publishable key is governed by RLS.
2. Apply the migrations: `supabase db push` for a hosted project, or
   `npm run supabase:reset` for the local stack (which also loads `supabase/seed.sql` and
   ends with a verification query — **11 profiles · 11 takes · 11 live · 22 rebuttals · 3
   votes**). `supabase/migrations/` is the only source of truth; the old
   `supabase/schema.sql` snapshot has been removed. `supabase/SCHEDULER.md` documents the
   verdict scheduler.
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

### Server-authoritative today

Clashes, ballots and verdicts are settled by Postgres — `submit_judgement`, `settle_clash`
and the minute-level `clash-maintenance` cron job — and reputation, coins and rank are
derived from `reputation_events`. Nothing about a Clash is computed on the client.

The Vault now runs on a production backend *and* renders from it (see the Vault
sections below): Vaults, Drops, Collections and entitlements are real tables behind
RPCs, and the Vault UI reads them through `services/vaultService.ts`. Nothing in the
Vault flow renders mock data any more.

What is still mock is the **sponsor prototype** only: `data/mockCampaigns.ts` and
`data/mockCreators.ts` feed the `campaign/` and `sponsor/` dashboards, which are
isolated to that later phase and have no entry point in the Vault.

### Vault — creator spaces

**Backend (Phase 3 Step 1)**

Built on the same three layers as the Arena: RLS decides rows, GRANTs decide columns,
and every write is a SECURITY DEFINER RPC that resolves the creator from `auth.uid()`.
No function accepts a creator id as authority.

| Piece | Table | Notes |
| --- | --- | --- |
| Vault | `creator_vaults` | `creator_id` is UNIQUE — one Vault per creator, enforced by the database, not by remembering to check |
| Drops | `vault_drops` | `free` / `subscriber`; draft → published → expired/removed. The 7-day window is a CHECK plus a server stamp, so no client can set or extend it |
| Collections | `vault_collections`, `vault_collection_items` | permanent: expiry is a status change, never a delete, so a collected Drop outlives its feed window |
| Entitlements | `vault_subscriptions` | one row per (subscriber, vault). The client has **no** write grant of any kind |

- **One entitlement helper.** `can_access_vault_drop(viewer, drop)` is called by the
  RLS policies, the media Edge Function and the app (`vaultService.canAccessDrop`), so
  the rules cannot drift between them. Free content is public, subscriber content
  needs an active entitlement inside its period, a block in either direction closes
  that creator's Vault, and the creator always reaches their own content.
- **Media is matched to access level** by a `BEFORE INSERT OR UPDATE` trigger:
  `subscriber` ⇒ private media, `free` ⇒ public media. Subscriber files live in
  `private-media` and are served only through short-lived signed URLs minted by the
  `vault-media-access` Edge Function — see `supabase/VAULT_MEDIA.md`.
- **Expiry rides the existing scheduler.** `run_maintenance()` keeps every Arena key
  and now also reports `vault_drops_expired` and `vault_subscriptions_expired`; each
  step is bounded, idempotent and non-destructive.
- **Payments are not wired, and the client cannot fake them.** The only way an
  entitlement appears is the service-role-only `vault_grant_test_subscription`
  (migrations 0016). There is no "Pay" button that grants access: `requestDropCheckout`
  reports that no provider is connected, and the old client-side unlock state is gone.

**UI (Phase 3 Step 2)**

- **Two perspectives, one set of rules.** A profile exposes *View Vault* →
  `/vault/[creatorId]`: creator identity, free Drops, locked subscriber Drops,
  Collections and subscription state. The Vault realm (`(vault)`) is the creator's
  **own** Vault — Drops (compose, publish, remove) and Collections, with an *Open your
  Vault* CTA when none exists; *Manage Vault* on your own profile lands there.
- **One storefront read.** The screen calls `vault_storefront(vault_id)` once: every
  Drop the viewer may see — live, archived-in-a-Collection, and the owner's drafts —
  each with the server's `accessible` decision, its collection membership, and a
  **public** media path only for free Drops. A subscriber Drop returns no media path,
  so the storefront never touches private bytes and never mints a signed URL per card.
- **The Drop reader** (`/vault/drop/[dropId]`) renders public media for a free Drop and
  requests a 120-second signed URL for a subscriber Drop *after* the server confirms
  access. Signed URLs are never cached or persisted, and a failed load re-requests
  rather than falling back to a public URL.
- **Access level is enforced, not styled.** The composer picks Free → public bucket or
  Subscriber → private bucket, and the backend trigger re-checks it: a mismatch is a
  typed error (`P0005` / `P0006`), never a hidden button.
- **Collections are permanent in the UI too.** An expired Drop still renders inside its
  Collection, wearing an `ARCHIVED` badge, because expiry is a status change rather
  than a delete.
- **The subscription CTA is honest.** `SubscriptionInfoSheet` says subscriptions are
  coming soon and grants nothing — there is no payment authority in the client.

---

## 6. FUTURE PRODUCTION INFRASTRUCTURE

> Each row has a single seam so it can be extended without rewriting screens.

| Area | Seam today | Production plan |
| --- | --- | --- |
| **Backend / auth** | live — `services/*Service.ts` over `supabase/migrations/`, `AuthProvider` + `AuthHydrator`, RPCs + RLS | Moderation review surfaces, richer server-side ranking, a search index once the feed outgrows Postgres |
| **Anti-abuse** | live — one ballot per account per Clash (`submit_judgement`), `rate_limit_events`, block / mute / report RPCs | Device-level fingerprinting (spec §9), weighted jurors, signed verdicts |
| **Payments** | none — coins are decorative, and the Vault's `requestDropCheckout` reports that no provider is connected | Razorpay/UPI or StoreKit/Play Billing; the verified webhook activates the entitlement server-side through a `service_role` path shaped exactly like `vault_grant_test_subscription` |
| **Sponsor attribution** | live surface (`app/sponsor/[campaignId].tsx`, `AttributionPanel`) over `data/mockCampaigns.ts` | Campaign + coupon tables, redemption codes, per-Hood and city-level attribution joins |
| **Analytics** | PostHog via `services/analytics.ts` (see `docs/ANALYTICS.md`); Vault Pro unlock stub remains local | Retention dashboards; consent UI before public release |
| **Persistence** | in-memory store; the auth session alone persists in AsyncStorage | Store hydration + optimistic sync on the same client |

---

## 7. Accessibility & performance notes

- Icon-only controls are labelled; ballots expose `accessibilityState`.
- `useReducedMotion` is honoured by the splash's ambient animation.
- The feed uses a memoised card, `initialNumToRender` / `windowSize` tuning and
  `React.memo` so a single card action never re-renders the whole list.
- Glass surfaces are layered gradients and tints rather than native blur, which keeps
  scrolling cheap on mid-range Android devices.

---

## 8. File conventions

- Max **150 lines** per component/screen file (`.clinerules`); screens compose
  components, they never grow into monoliths.
- Every interactive control performs an action or reports what is not built yet — no
  dead buttons, no placeholder screens.
