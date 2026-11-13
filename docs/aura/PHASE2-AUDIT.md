# AURA Phase 2 — Phase A blocker audit

Verified against real code at `820f5df7`, not taken on trust. Each row states the
evidence found in the tree at Phase 2 start.

| # | Blocker as reported | Verdict | Evidence at `820f5df7` |
|---|---|---|---|
| 1 | EAS release packaging excludes `AppText`, `textScaling`, `Editorial`, `typeRamp` | **Not reproducible as stated** | All four files are tracked in git (`git cat-file -e HEAD:<path>` succeeds), there is no `.easignore`, so EAS uploads the git tree. A real `npx expo export --platform android` produces a 12.2 MB `.hbc`; `strings` finds `FIXED_FONT_BUDGET` (textScaling) and `Inter_700Bold` (typeRamp) inside it, while a fabricated control string is absent. Guard added anyway — see `utils/auraPackaging.test.ts`. |
| 2 | Profile statistics lose responsive wrapping | **Confirmed** | `ProfileHeader` `social` row is a bare `flexDirection:'row'` with three `EditorialStat` children and hairline seams; no `flexWrap`, no `minWidth: 0`, and `EditorialStat` has `stat: { gap: 2 }` with no shrink. At large OS text size the reputation numeral pushes the row past the viewport. |
| 3 | Scalable initials clipped by fixed-size avatars | **Confirmed — Phase-1 regression** | `components/shared/Avatar.tsx` renders a raw `<Text>` (not `AppText`) with `fontSize: Math.round(size*0.36)` inside a fixed `width/height: size` circle with `overflow:'hidden'`. Phase 1 turned scaling **on** by default, so the initials now grow while the circle cannot, and `overflow:'hidden'` clips them. |
| 4 | Fixed-height room headers may overflow | **Confirmed** | `LiveRoomHeader` animates `maxHeight` 140 → 0 on scroll. The block holds title (2 lines), meta line, and a role chip; with scaling on, real content exceeds 140dp and is silently cut. A hard `maxHeight` is the same defect as a fixed `height`. |
| 5 | `EmptyState` mislabels network errors and blocked profiles | **Confirmed** | Only `quiet \| alert`; both collapse to one hardcoded eyebrow — `alert` always reads `SOMETHING WENT WRONG`. A rate-limit, an offline retry and a "you are blocked from this crew" all present identically. |
| 6 | Dock touch targets too small; active labels missing | **Confirmed** | `PLATE_HEIGHT = 56`, `DOCK_HEIGHT = 56`; realm `shift` affordance is `width: 40`, `create` is `34×34` — under the 44/48dp minimum. The component docstring claims "the active destination is a filled *plate* with its label revealed", but `renderTab` draws no label at all; the label exists only in `accessibilityLabel`. |
| 7 | Platform font mapping does not reach `typeScale` | **Confirmed — worst of the nine** | `typeRamp.ts` builds `typeScale` from its own generic `family` (`serif:'serif'`, `mono:'monospace'`). `typography.ts` re-exports that already-frozen object and only *then* overrides `family.serif = Platform.select({ios:'New York',…})`. All **291** `typeScale` consumers therefore never receive `New York` / `Menlo` / `sans-serif`; on iOS `'serif'` is not a valid family name, so the editorial display voice silently falls back to San Francisco. |
| 8 | Low-contrast secondary text | **Confirmed, measured** | `textMuted` fails WCAG AA for body text in both schemes: light `#8A8377` on `#F7F5F1` = **3.45:1**, on `#FFFFFF` = 3.75:1; dark `#7C766D` on `#0B0A09` = **4.40:1**, on `#131211` = 4.16:1. Required 4.5:1. `textMuted` is used for kickers and labels, i.e. small text. |
| 9 | Trailing whitespace and patch hygiene | **Confirmed — Phase-1 regression** | The mechanical `allowFontScaling={false}` removal left **108** added whitespace-only lines across the diff; the base commit has none of them. |

## What this means for Phase B

Blockers 3, 7 and 9 are defects Phase 1 *introduced*, and 7 silently disabled the
single most visible part of the redesign. Phase B is therefore not cosmetic work
on top of a sound base: the typographic system has to actually take effect
first, or every Arena screen inherits a fallback face.

---

## Phase A — what was changed, and how it is now guarded

| # | Fix | Guard |
|---|---|---|
| 1 | No code change needed to packaging; the four modules were already in the upload set and verified present in a real Android `.hbc`. | `expo export --platform android` re-run as a release gate; string probe against the shipped bundle. |
| 2 | `ProfileHeader.social` gained `flexWrap: 'wrap'` + `rowGap`; `EditorialStat` gained `flexShrink: 1`, `minWidth: 0`, a 2-line label and a 1.4x numeral cap. | Layout contract documented in `EditorialStat`; verified in the preview render at 2x text. |
| 3 | `Avatar` glyph capped at 1.6x with an explicit `lineHeight`, container keeps its layout diameter. Geometry extracted to `avatarGeometry.ts`. | `utils/auraAvatar.test.ts` — sweeps 8 sizes × scale 1.0–1.6 and asserts the glyph's line box stays inside 90% of the circle. |
| 4 | `LiveRoomHeader` no longer interpolates `maxHeight` 140→0; the detail block slides/fades instead, `overflow:'hidden'` dropped, title no longer `numberOfLines={2}`. | Preview render with a long title at 2x text. |
| 5 | `EmptyState` gained `error` / `offline` / `denied` / `blocked` variants with their own eyebrows, and restrictions no longer painted in the danger colour. Call sites tagged. | `utils/auraEmptyState.test.ts` — asserts all four failure labels are distinct and that blocked/denied are non-retryable and non-alarming. |
| 6 | Plate 56→60; realm switch 40→48; Create disc 34→48; the active tab now draws the label its docstring always promised; `DOCK_HEIGHT` derived from `PLATE_HEIGHT`. | `utils/auraDock.test.ts` — asserts every affordance meets 48dp and that the label policy is explicit. |
| 7 | `typeRamp.ts` now exports `buildTypeScale()` and `resolveFontStacks()`; `typography.ts` builds the ramp *from* the resolved stacks, so a late override is no longer expressible. | `utils/auraDesignSystem.test.ts` gained 3 assertions on the real resolution path (the old assertion was vacuous — it compared the ramp against the same frozen object). |
| 8 | `textMuted` light `#71717A`→`#64646B`, dark `#71717A`→`#8A8A93`. | `utils/auraContrast.test.ts` — every text token against every surface, both schemes, with alpha compositing for translucent surfaces. Verified to fail on the old values. |
| 9 | 107 whitespace-only / trailing-whitespace lines cleaned across 75 files. | `utils/auraHygiene.test.ts` — repo-wide scan of application source. |

`test:unit` went **820 → 846**, all passing, no existing assertion weakened.
