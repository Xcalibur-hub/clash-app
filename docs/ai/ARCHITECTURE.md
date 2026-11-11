# ARCHITECTURE — CLASH

Statements below are grounded in repository files. The code wins over this
document; update it when they diverge.

---

## 1. Stack

| Concern | Choice | Evidence |
|---|---|---|
| Framework | Expo SDK 54 + Expo Router 6 (file-based nav) | [`../../package.json`](../../package.json), [`../../app.json`](../../app.json) |
| Runtime | React Native 0.81 / React 19, New Architecture on | `app.json` (`newArchEnabled: true`) |
| Language | TypeScript `strict: true`, zero `any` | [`../../tsconfig.json`](../../tsconfig.json), [`../../.clinerules`](../../.clinerules) |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) | [`../../services/supabaseClient.ts`](../../services/supabaseClient.ts), [`../../supabase/`](../../supabase/) |
| Motion | React Native Reanimated 4 | `package.json` |
| Maps | `react-native-maps` | `package.json` |
| Media | `expo-video`, `expo-image-picker`, `expo-camera` | `package.json` |
| Observability | Sentry, PostHog (release builds) | [`../../services/sentry.ts`](../../services/sentry.ts), [`../../services/posthogClient.ts`](../../services/posthogClient.ts) |
| Package IDs | `com.clash.v2` (prod), `com.clash.v2.dev` (dev client) | `app.json` |

## 2. Directory map

```
app/            Expo Router routes (realm-based)
  (tabs)/       Arena realm: Arena feed, Explore, Create, Notifications, Profile
  (vault)/      Creator Vault realm
  arena/        Arena rooms, challenges, crews
  take/, clash/ Take detail + canonical Clash
  world/, vault/, hood/, profile/, explore/, campaign/, sponsor/, earnings/
  auth.tsx, onboard.tsx, _layout.tsx
components/     UI by domain (arena/, clash/, explore/, vault/, navigation/, shared/, …)
services/       65 flat TypeScript service modules — the app's data layer
  supabaseClient.ts    single Supabase client
  apiService.ts        general reads/writes
  liveArenaService.ts  Arena room realtime + RPCs
  arenaCrowdService.ts, clashEngineService.ts, meetService.ts, …
  gif/                 GIF provider abstraction
supabase/
  migrations/   114 SQL migrations — the real DB contract (RLS, grants, RPCs, triggers)
  tests/        102 pgTAP test files
  functions/    7 Deno Edge Functions
  seeds/, snippets/, config.toml
utils/          Pure logic + *.test.ts unit tests (node:test)
scripts/        106 Node verification/ops scripts (.cjs/.mjs)
hooks/, store/, theme/, types/, config/, data/
docs/           Feature/phase notes; docs/evidence/ holds acceptance reports
```

## 3. Route → service → backend flow

The app is a **server-authoritative client**. The general shape:

```
app/** screen
   │  hook / user action
   ▼
services/lib/*Service.ts
   │  supabase.rpc(...) | supabase.from(...).select/insert  |  channel(...).on(...)
   ▼
Supabase: RLS + column grants + SECURITY DEFINER RPCs + triggers
   │  Realtime publications
   ▼
services/*Service.ts subscription  →  utils/* reducer  →  UI state
```

Key properties, each backed by source:

- **Authorization is server-side.** RLS and column grants in
  `supabase/migrations/` decide access; the client publishable key is public by
  design ([`../../.env.example`](../../.env.example)).
- **Client release policy is not security.** [`../../utils/releaseScope.ts`](../../utils/releaseScope.ts)
  marks capabilities `allowed | conditional | deferred`; it is explicitly
  labelled *"Client policy, never an authorization boundary"*.
- **Arena writes go through RPCs, not table writes** — e.g. `create_take`,
  `create_arena_challenge`, `resolve_arena_challenge`, `watch_arena_room`,
  `submit_arena_official`, `post_arena_crowd_message`, `submit_judgement`,
  `settle_clash` (names per
  [`../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md`](../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md) §"Installed application contract").
- **Crowd messages hydrate by ID, not by event payload.** The client ignores raw
  realtime content and calls `get_arena_crowd_messages(room, ids[])`.
- **Realtime channels are explicit and disposed.** Room and Crowd subscribe as
  separate channels; Back unsubscribes both (evidence: leave refs `ok`, then
  zero channels — A50 report §5).

## 4. Pure logic layer

`utils/*.ts` holds deterministic, testable logic (duel payloads, verdict
presentation, crowd presentation, reaction optimism/repair ordering, nav
helpers). These are unit-tested with `node --experimental-strip-types --test`
and are the cheapest place to verify behavior without a device.

## 5. Edge Functions

Seven Deno functions under `supabase/functions/`:
`arena-assist-media-access`, `arena-editorial`, `arena-gifs`,
`course-lesson-media-access`, `creator-ai`, `digital-creator`,
`vault-media-access`. They handle privileged media access and AI/editorial
proxying. They are excluded from the app's `tsconfig` and typed separately via
`npm run typecheck:editorial`.

## 6. Testing infrastructure

Four distinct layers — see [`TEST_MATRIX.md`](TEST_MATRIX.md) for commands and
what evidence each produces:

1. **Unit** — `utils/*.test.ts`, 124 files, `node:test`.
2. **Lifecycle / UI harness** — 24 `scripts/*.test.cjs` files wired into
   `npm test`, controlled hooks/services (no device). 46 `.test.cjs` exist in
   `scripts/` overall.
3. **Database** — `supabase/tests/*.pgtap.sql`, 102 files via `supabase test db`.
4. **Native / device** — ADB-driven Samsung A50 runs; evidence in
   `docs/evidence/`. This is the only layer that proves real device behavior.

## 7. Delivery and release scoping

- `eas.json` + `scripts/eas-archive-check.cjs` verify the EAS archive is closed
  and dependency-complete; `config/release-targets.json` (currently `{}`)
  constrains approved build targets.
- Beta scope is the text-debate product. In
  `utils/releaseScope.ts`: accounts, browsing, public Vault reading, and text
  Takes are **allowed**; text Arena is **conditional**; groups, Meet,
  commerce, creator publishing, AI, live, sponsorship, world publishing, play,
  and media creation are **deferred**.

## 8. Local development shape

- Local Supabase stack uses a shifted port range (`55321` router — *not*
  `54321`); see [`../../supabase/config.toml`](../../supabase/config.toml).
- Device ↔ local stack: `npm run supabase:start` → `npm run supabase:seed:clash-dev`
  → `npm run adb:reverse-supabase` → `npm run dev:local`
  ([`../../.env.example`](../../.env.example)).
- Never point a development build at production.
