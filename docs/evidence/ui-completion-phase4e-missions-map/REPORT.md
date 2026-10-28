# Phase 4E.2 — Resolve World missions map native crash

27 October 2026. **SAFE FALLBACK PASS on the installed Samsung A50 build. This is not a working Google Maps street map.** Sidebar `/world` no longer kills the process. Explore World SVG map remains unchanged and working.

Original checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`, HEAD unchanged at `9bad8b0b51ffd1bab5975ceb72f7c75a487d798f`. Work remains uncommitted until the close of this report’s commit step. No push, merge or deployment.

## Confirmed provider and root cause

| Fact | Evidence |
|---|---|
| Library | `react-native-maps@1.20.1` |
| Android provider | `PROVIDER_GOOGLE` in `app/world/index.tsx` |
| iOS provider | `PROVIDER_DEFAULT` (Apple Maps) |
| Config path | `app.config.ts` optionally injects `android.config.googleMaps.apiKey` from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` at **native build** time |
| Installed APK | Pulled `com.clash.v2.dev` base.apk; `aapt dump xmltree` shows **no** `com.google.android.geo.API_KEY` application meta-data |
| Crash (Phase 4E.1) | `IllegalStateException: API key not found` when MapView inflated ([native-map-failure.json](../ui-completion-phase4e-world/native-map-failure.json)) |

Google Maps on Android is the **current intentional** World street-map stack (`docs/EXPLORE_PHASE_1E_EMPTY_DISCOVERY.md`). OpenStreetMap / MapLibre is deferred research, not the installed architecture. A Metro-only `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` does **not** rewrite the installed binary; JS cannot claim a real map until a Maps-configured APK ships.

Explore World (`components/explore/*` SVG / globe) is a separate surface and was not part of this crash.

## Chosen approach

**Smallest safe correction: gate Android MapView behind an explicit rebuild opt-in; show an honest non-map World shell otherwise.**

1. `utils/worldNativeMapAvailability.ts` — iOS always available; Android only when `EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID` is `1`/`true`/`yes` (operator sets this **after** a Maps-keyed native rebuild).
2. `app/world/index.tsx` — mount `MapView` only when available; otherwise `WorldMapUnavailable`.
3. `components/world/WorldMapUnavailable.tsx` — banner that states the street map needs a rebuild; keeps mission card, recent drops, Participate / Create Drop / Back / privacy.

Not done (by design):

- No fabricated or committed Google API key.
- No invasive MapLibre / OSM migration (trade-offs below; stopped before dependency change).
- No native rebuild in this phase (would change the installed binary; requires a scoped rebuild procedure first).

### Trade-offs

| Option | Pros | Cons | Decision |
|---|---|---|---|
| JS gate + list fallback | Stops process death on current APK; honest UX; preserves missions RPC/navigation | No pan/zoom/recenter street map until rebuild | **Chosen** |
| Rebuild APK with Google key + set opt-in flag | Restores intended Google MapView | Needs valid key in build env; new install; not JS-only | Documented next step |
| Switch to MapLibre/OSM now | Avoid Google billing/key | New native deps, tiles/attribution/budget, Expo SDK cost; Phase 1E deferred this | **Stopped**; out of scope |

### Scoped rebuild procedure (when operators choose real maps)

Do **not** treat the following as completed by this phase:

1. Provide a real Maps SDK key only in the private build environment (never commit secrets).
2. Ensure `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is present when generating/building the Android app so Expo writes `com.google.android.geo.API_KEY` into the installed manifest.
3. Produce and install a new `com.clash.v2.dev` (or release) binary; verify the meta-data exists in the **installed** APK (`aapt` / manifest dump).
4. Set `EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID=1` for Metro / the JS env so the gate mounts MapView.
5. Retest `/world` MapView, recenter, filters, and markers on device.
6. Only then claim a working street map. Until step 5, keep the fallback.

## Native execution (Samsung A50)

Device `SM-A505F` / `RZ8M30DE9NL`, package `com.clash.v2.dev`, Metro `127.0.0.1:8081`, QA reverse `55481`. Process id **2546** stayed alive across World open / Back / Explore World.

| Check | Result |
|---|---|
| Home → menu → World | PASS — no crash; same PID; zero `API key not found` lines |
| Fallback copy | PASS — “Street map unavailable in this build” |
| Mission access | PASS — `Best ₹200 Meal` + Participate |
| Map area / locate | Hidden on fallback (not a disabled fake Map control) |
| Back | PASS — returns Home |
| Session | PASS — `Local Supabase session` + `@qa4c_a_*` after Back |
| Explore World SVG | PASS — Map/Globe/Teleport, “Tap a country”, no street-map banner |

Evidence under `.expo/ui-completion-phase4e-missions-map/` (private, not staged): `13-world-fallback.png`, `13-world-fallback-ui.xml`, `14-after-back-home.png`, `12-explore-world-svg.png`. Summary: [native-execution.json](native-execution.json).

**Distinction:** this validates a **safe fallback**, not a working `react-native-maps` street map.

## Tests

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS, exit 0 |
| `npm run test:unit` | PASS **810** (includes 4 new `worldNativeMapAvailability` cases) |
| `npm test` | PASS **810 + 232 = 1,042**, no failed/skipped |
| `node scripts/world-discovery-runtime-check.cjs` | PASS **36/36** (includes Android-without-map gate) |
| World contract scripts (consent / empty / pan / request-order) + `world-accessibility.test.cjs` | PASS |
| `git diff --check` | PASS exit 0 (LF/CRLF warnings only) |

## Remaining map feature gaps

- Android street MapView, clustering chrome, Search this area, locate/recenter, map-area filter — gated until Maps rebuild + opt-in.
- Mission Drop markers on a live map, pan/zoom acceptance — not claimed.
- OSM/MapLibre provider decision — still open research (Phase 1E).
- iOS MapView path unchanged and untested on this A50 Android pass.

## Files touched

- `utils/worldNativeMapAvailability.ts` (+ unit test)
- `components/world/WorldMapUnavailable.tsx`
- `app/world/index.tsx`
- `scripts/world-discovery-runtime-check.cjs`
- `scripts/world-empty-discovery-check.cjs`
- `package.json` (`test:unit` entry only)

No dependency upgrades, migrations, RLS, accounts, fixtures, shared/hosted DB, or Explore SVG regressions.

**Stop after reporting.** Real street-map acceptance requires the scoped rebuild above.
