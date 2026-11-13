# Project AURA — Audit (pre-change)

**Branch:** `arena/ui-aura-redesign-20261113`
**Base commit:** `0cd6c36aa4831cda115c293b74ba2bf98c6d22df` (verified: contains the app — 59 routes, 352 components, 111 migrations)
**Worktree:** `/home/user/aura` (isolated; existing branches untouched)

## 1. What is already good (and must not be broken)

This is not a greenfield UI. The app already has real foundations:

| Area | State |
|---|---|
| Design tokens | `theme/` — semantic light/dark palettes (`palettes.ts`), spacing/radius (`layout.tsx`), motion (`motion.ts`), 17-step type ramp (`typography.ts`), glass levels, arena accents, A/B side tones |
| Theming | `ThemeProvider` resolves system/light/dark; `PresentationThemeProvider` sandboxes previews without writing user prefs |
| Accessibility | 612 `accessibilityLabel`, 513 `accessibilityRole`, reduced-motion gating across motion components, 44dp hit-target contract enforced by tests |
| Navigation | Expo Router, Arena/Vault realm switch with portal animation, floating dock with keyboard/inset handling |
| Quality gates | typecheck 0 errors, **806/806 unit tests**, full suite exit 0 |

Baseline measured before any edit:

```
npm run typecheck   -> 0 errors
npm run test:unit   -> # tests 806  # pass 806  # fail 0
npm test            -> exit 0
```

## 2. The hard constraint: 47 files are pinned by design-contract tests

15 test files `readFileSync` source files and `assert.match` them. **47 files** are
frozen by string contracts. They are concentrated in Arena and Explore:

```
app/(tabs)/index.tsx              components/arena/*            (13 files)
app/(tabs)/explore.tsx            components/liveArena/*       (14 files)
app/explore/country/[code].tsx    components/explore/*         (10 files)
utils/duelStageLayout.ts          components/arena/ui/ArenaSheet.tsx
utils/challengePresentation.ts    hooks/useGlobeRotation.ts
...
```

Critically, I read the assertions: they pin **behavioural guarantees**, not visual
values — `minHeight: 48`, `collapsable={false}`, `useReducedMotion`,
`shouldPlayOnce(...)`, accessibility labels, `FadeIn.duration(140)`. They do **not**
pin colours, font sizes or token values. That means the token layer is free to be
redesigned; the component internals of those 47 files must keep their contracts.

This directly shapes the strategy: **transform the system, not the pinned markup.**

Free (verified not pinned by any source-grep test):
`theme/*` tokens · `components/navigation/*` · `components/shared/*` ·
`app/(vault)/*` · `app/(tabs)/profile.tsx` · `components/profile/*` ·
`app/world/*` · `components/world/*` · `app/arena/crews/*` · `components/crews/*` ·
`app/arena/challenges.tsx` · `components/play/*`

## 3. Real defects found (these justify the work)

### D1 — Enlarged-text support is defeated app-wide (accessibility)

`allowFontScaling={false}` appears **1,218 times across 261 files**. This is the
single largest accessibility defect in the app: it pins text to its designed size
and ignores the OS font-scale setting, which the brief explicitly requires support
for.

Concrete example, `components/shared/EmptyState.tsx` — the shared empty/error
surface used everywhere:

```tsx
<Text allowFontScaling={false} style={[styles.title, ...]}>{title}</Text>
<Text allowFontScaling={false} style={[styles.body, ...]}>{body}</Text>
```

Its title and body are body copy, not icon glyphs or tabular numerals, so this is
unjustified. Fix priority: shared primitives first (they cascade), then surfaces.

### D2 — 200 distinct hardcoded hex colours outside `theme/` (412 occurrences)

Top offenders: `#FAFAF8` ×52, `#111113` ×23, `#FFFFFF` ×18, `#F5F5F7` ×16,
`#E5484D` ×9. These are semantic values (`textPrimary`, `surface`, `danger`)
duplicated as literals, so they cannot respond to theme changes. This is exactly
the "hardcoded one-off styling across hundreds of screens" the brief warns about.

### D3 — No editorial/serif voice

The entire app is Inter. There is no display or editorial face, so hero content,
Vault creator identity and Arena verdicts have no typographic distinction — every
surface speaks at the same volume. Only Inter, JetBrains Mono, Comic Neue,
Kalam and Patrick Hand are vendored (no serif package), so an editorial face must
come from the platform (New York / Georgia / `serif`), which needs no new
dependency and costs nothing at runtime.

### D4 — Neon-leaning duel palette

`accent.a: #A580FF`, `accent.b: #3D8BFF` (and the matching `duel.*` / `gradient.*`
entries) are saturated violet-blue. The brief explicitly rules out neon blue and
generic purple/blue gradients. These are today's "which side am I backing?"
signal, so they need replacing with a restrained, warm/cool pair that still
separates instantly — and `arenaSides.test.ts` only requires `ink` to differ,
not specific values.

## 4. Deliverable constraints I have to respect

- **No browser and no emulator in this sandbox.** `cdn.playwright.dev`,
  `playwright.azureedge.net` and `storage.googleapis.com` are all unreachable
  (`000`); only `registry.npmjs.org` and PyPI resolve. Therefore **runtime
  screenshots are impossible**, and I must not present mockups as screenshots.
  I will render clearly-labelled *design previews* from the real token values
  using the real Inter TTFs and label every one of them as a preview.
- GitHub renders Markdown + PNG but **not** HTML, so the gallery must be PNG
  images committed to the repo, linked from a `README.md`.
- No migrations, RPCs, auth, settlement or backend changes. No merge/deploy.

## 5. Plan, in priority order

1. **Foundations (free, cascades everywhere):** typography voice (editorial serif),
   colour re-baseline (remove neon, warm the neutral ramp), elevation/surface
   hierarchy, motion tokens.
2. **Navigation (free):** a dock with real hierarchy instead of five equal icons.
3. **Shared primitives (free):** EmptyState / loading / error / success states,
   fix `allowFontScaling`, section headings, cards.
4. **Surfaces:** Profile, Vault home, Groups (crews), Challenges, World, Play —
   using the new primitives.
5. **Gallery + docs:** PNG contact sheets, design-system overview, screen-by-screen
   summary, device-verification list, known gaps.

**Out of scope by constraint:** re-marking up the 47 pinned Arena/Explore files
beyond what their contracts allow. Arena's *token* treatment will change (colour,
type, elevation) because it consumes the theme, but its composition stays intact to
respect the contracts. I will state this plainly rather than claim a full Arena
re-skin that the tests would reject.
