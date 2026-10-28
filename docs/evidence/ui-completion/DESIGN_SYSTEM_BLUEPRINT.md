# Phase UI-1 — Design system blueprint

HEAD `4adeed3b1c00908ede73916cf868e3265fc0399d`. Read-only. This is a **unification proposal** over existing tokens — not a second product.

Inspiration (attitude, not UI clones): Apple restraint, Instagram scan speed, TikTok Live heat in Arena only.

## Principle

One monochrome product with **one gold whisper** and **two debate sides**. Energy comes from content, motion, and type — not from extra chrome, neon, or stacked cards.

Preserve `theme/palettes.ts`, `typography.ts`, `layout.ts`, `motion.ts`, `GlowButton`, `EmptyState`, `ReadFeedback`, `TakeFeedCard`, `ArenaSheet`.

---

## 1. Colors and surfaces

**Foundation (already in palettes — make them the only consumers).**

| Token | Dark | Light |
|---|---|---|
| background | `#09090B` | `#F2F0EB` |
| surface | `#111113` | `#FFFEFA` |
| elevated | `#18181B` | `#FFFFFF` |
| textPrimary / muted | `#F5F5F5` / `#71717A` | `#111113` / `#71717A` |
| border | white 8% | ink 6% |
| accent (expressive, rare) | `#C9A96A` | same |
| danger / success | existing | existing |

**Debate sides** stay distinguishable (`theme/arenaSides.ts`, `theme/colors.ts` accent a/b) but **never as page backgrounds**. Use 4px bars, 8% fills, or hairline chips — not the large green/blue pills seen on the A50 result.

**Rules.**
- No new gradients on screens. Retire `AuroraBackground` from Create (keep splash if the wordmark needs it).
- No iOS-style blur on Android. `theme/glass.ts` already documents this — `glassSurface` must use **semantic** `t.surface`, not hardcoded `#111113`.
- Dock, sheets, cards, and inputs all use the same surface ramp.
- Gold is for rare highlights (live pulse, featured Group, Vault price), not buttons. Primary CTA remains near-white on dark / near-black on light (`GlowButton` `light`).

**Stop using in parallel:** raw `ink.*` / `color.bg` in new work; hardcoded `rgba(24,24,27,0.92)` dock (`RealmTabBar` `DOCK_BG`).

---

## 2. Typography

Keep Inter via `FontBootstrap` and `typeScale`. Align to spec without a second ramp:

| Use | Token | Size |
|---|---|---|
| Brand / empty hero | `display` | 32 / 38 |
| Screen title | `title` | 22 / 28 |
| Section | `section` | 17 / 22 |
| Card title / take | `cardTitle` / `take` | 16–18 |
| Body | `body` | 16 / 24 |
| Meta / eyebrow | `meta` / `caption` / `eyebrow` | 11–13 |

**Arena overlay** (`theme/arena.ts`) stays an editorial layer, not a fork: map `arena.type.statement` → Take/room quotes only.

**Accessibility.** Default `allowFontScaling={true}`. Ban new `allowFontScaling={false}` except badge numerals and fixed dock icons. Cap destructive overflow with `maxFontSizeMultiplier={1.35}` on toolbars. Layouts must reflow at 320 dp and large text — Play/challenge screens currently fail this in source.

---

## 3. Spacing and grid

Keep `space` 4–40 and `layout.screenX = 16`, `feedGap = 12`, `cardPadding = 16`, `hit = 44`.

**Grid.**
- Phone: 16px margins, 8px gutter between mosaic tiles.
- Max content measure for reading: ~680 (`arena.measure`) on tablets; phones stay full bleed minus 16.
- Vertical rhythm: 8pt. Section blocks 24–32. Do not add a fifth chip row to “use empty space.”

**A50.** 1080×2340 / 420dpi ≈ 411×891 dp. Design against **360** as default, **320** as squeeze (Explore rail must collapse), **430** as large phone.

---

## 4. Buttons and controls

Keep `GlowButton` tones: `light` primary, `ink`/`glass` secondary, `a`/`b`/`gold` exceptional.

| Control | Spec |
|---|---|
| Primary | `GlowButton` light, minHeight 44, radius `lg` |
| Secondary | glass / ink, hairline |
| Icon | 44 hit, 16–20 glyph, no extra circles unless selected |
| Chip / filter | one row, scroll; selected = inverted pill (`t.pill`) |
| Segment | `SegmentedTabs` for 2–3 options only |
| Text field | `t.inputBackground`, radius `md`, 16px type |

Press: `scale.press` 0.985 + existing haptics. No gradient CTAs.

---

## 5. Cards and media

**Feed / Take:** keep `TakeFeedCard` — surface + hairline, media in its own band, actions in a single row. Avoid nested cards inside cards.

**Explore mosaic:** keep large tiles (entertainment). Title 2 lines max; one kicker (LIVE / CLASH / DROP). Do not stack a second card chrome on the tile.

**Arena result:** type and ballot first; atmosphere **behind** a 40% cap or removed on settled. Sides as hairline, not candy fills.

**Vault:** quieter — more crop, less badge. World/Play: one discovery card component (`ExploreDiscoveryCard`) rather than per-feature skins.

Media: 4:5 stills in feed, 16:9 in Explore Live, full-bleed viewer (`MediaViewer`) with existing scrim tokens.

---

## 6. Icons and illustrations

- Prefer `components/shared/icons` (custom Lucide wrappers) over ad-hoc `lucide-react-native` imports (`arena/crews` Back).
- Stroke 1.9–2.2, 20px in dock, 22px in toolbars.
- Doodles (`Doodles.tsx`): onboard, Fresh Takes underline, profile — **never** on Live empty or result.
- No generic 3D blobs. The captured result orbs should be demoted or clipped.

---

## 7. Motion and transitions

Keep `theme/motion.ts`.

| Event | Duration |
|---|---|
| Press | instant–fast (100–160) |
| Tab / chip | 160–200 |
| Screen push | existing Stack `fade` / `slide_from_right` |
| Realm switch | `RealmPortal` cinematic 400 |
| Result reveal | existing `VerdictReveal` |
| Reduced motion | honor `useReducedMotion` everywhere new |

Do not add looping pulses on empty Live. Meet orb pulse stays unused while admission is deferred.

---

## 8. Gesture behavior

- Tabs: tap only; no hidden swipe to Vault (realm is explicit).
- Feed: vertical scroll; pull-to-refresh already on Arena.
- Explore mosaic: vertical; horizontal only inside a labeled rail.
- Sheets: drag to dismiss via `ArenaSheet`.
- Back: Android system Back must pop search/IME first, then screen, **then** leave the app (Explore search currently fights this).
- Arena room: swipe-back allowed; do not bind Back to Leave session (Meet already documented this).

---

## 9. Navigation IA

**Target information architecture for first beta**

1. **Arena dock (5):** Home · Explore · Create · Activity · Profile
2. **Home** has **two** in-page destinations, not four: **For You** (Takes) and **Live** (one gateway card). Groups and Discover move to Explore or a single “More” in the top bar / sidebar.
3. **Explore** modes: For You · World · Play · Meet(unavailable). Live duplicates Home — either merge or make Explore Live a deep-link into Arena Live.
4. **Vault** remains a realm shift (diamond), with a one-line “Creator worlds” hint on first use.
5. **Sidebar** becomes account + Settings + World + Vault, not a second tab bar.

Top bar: wordmark + one utility (search **or** avatar). Remove **Demo Arena** from non-dev variant (gate already exists; A50 still showed it).

---

## 10. Loading / empty / error

Use the existing trio — do not invent a fourth spinner language.

| State | Component | Copy rule |
|---|---|---|
| Loading | `ReadFeedback` / skeleton already in Vault | Named subject (“Loading Arena…”) |
| Empty | `EmptyState` | Human, one CTA |
| Error / denied / missing | `ReadFeedback` | Empty ≠ error; missing ≠ zero |
| Deferred admit | `ReleaseUnavailable` | Keep policy text; add Back + illustration from doodle set; min 44 Back |

Live empty on A50 is honest — keep the copy, **drop the chip cathedral** above it.

---

## 11. Accessibility

- Contrast: palettes already aim WCAG on `#09090B`; side greens on dark must be checked (result pills).
- Hit targets 44.
- `accessibilityRole` / `Label` already common — keep on chips.
- Font scale: see typography. Test 320 dp × large text on A50 (Settings → font).
- Keyboard: Explore and Take composer must pin fields above IME; dock already hides on Arena keyboard.
- Screen reader: floating Explore rail must not sit on tile labels (overlap is an a11y bug, not just visual).

---

## 12. Component inventory to standardize

**Canonical (extend, don’t replace):** `GlowButton`, `IconButton`, `EmptyState`, `Notice`, `ReadFeedback`, `Avatar`, `SegmentedTabs`, `ArenaSheet`, `TakeFeedCard`, `ExploreDiscoveryCard`, `ReleaseUnavailable`, `RealmTabBar`, `dockConfig`.

**Converge:**
- All backs → `BackIcon` + 44 hit.
- All filters → one chip style.
- All bottom sheets → `ArenaSheet`.
- All page backgrounds → `t.background` only.

**Deprecate visually:** Aurora on Create; hardcoded dock colors; extra Live chip rows; result orbs over type; `SPLIT DECISION` class labels (use `communityVerdictCopy` only).

---

## Light vs dark

Ship both; A50 capture was dark. Light is editorial warm paper, not grey Material. Dock must follow `t.surfaceElevated` in **both** realms.

---

## What this is not

- Not a Meet re-enable.
- Not a new color brand.
- Not iOS blur on A50.
- Not cloning Instagram tabs or TikTok’s For You chrome.
