# Arena UI Phase 6.6 — hit-target hotfix (Samsung A50)

Device: SM-A505F, Android 11, density 420 (px÷2.625=dp).

## Before (Phase 6.5)

| Control | Height |
|---------|--------|
| Expand Crowd | ~24.4 dp (P2) |
| Home / Live / Groups / Discover | ~40 dp (P2) |
| For You / Following / Popular / New | ~36.2 dp (P2) |

## After (Phase 6.6)

| Control | Height | Result |
|---------|--------|--------|
| Expand Crowd | **48.4 dp** (127px) | PASS ≥44 |
| Home / Live / Groups / Discover | **48 dp** | PASS |
| For You / Following / Popular / New | **48 dp** | PASS |
| SUPPORT vs Expand overlap | gap 341px | PASS |
| SUPPORT first viewport | y=1547–1663 | PASS |
| Expand ↔ Focus Stage toggle | works | PASS |

## Fix notes

- Home rails/chips: `minHeight: 48` (avoids 420dpi rounding of 44→43.8dp).
- Expand: absolute to Stage bottom on a plain `View` host (not Reanimated); style `height: 80` measures ~48dp on A50 after Stage flex clipping (style 48 collapsed to ~16dp content height). `paddingBottom: 96` on stageActions clears SUPPORT/assist.
