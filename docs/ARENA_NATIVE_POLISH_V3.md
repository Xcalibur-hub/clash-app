# Arena native polish V3 — 19 October 2026

UI-only implementation in the original checkout on `arena-ui-review`, starting at `62ce68e43fcdaa63d4744428723ed03faa90c5b2`.

The six physical Samsung A50 BEFORE captures and `capture-manifest.json` in `docs/evidence/arena-live-v2/phone-review/` were used as the reference. All six original SHA-256 values were reverified unchanged. Screenshots remain local and untracked; no personal status-bar content is committed.

## Corrections

- Confirmation: one short, reduced-motion-aware fade around a stable two-column layout. Equal 56dp avatars; independently bounded name/handle columns and a stationary VS. Removed the competing slide/zoom entry transforms that visibly crossed the fighters. The existing acceptance and confirmation durations remain unchanged.
- Stage: 72% primary share, smaller proposition and argument typography, compact fighter rail, nonshrinking argument content inside its scroll container. On the A50 the default Stage shows both fighter identities, roles, the complete current demo argument, attribution and history action. Expanded Crowd/keyboard uses a fixed 110dp two-fighter summary with a working full-argument action, rather than displaying clipped fragments. Crowd receives all remaining flex space; a regression catches unused space after keyboard dismissal.
- Demo controls: role/phase/private-assist selectors moved to a wrapping Developer controls sheet behind the existing More button. The header keeps an explicit, compact DEMO label. No controls or RPCs were added to production gameplay.
- Discovery: smaller titles, spacing and avatars, one featured card, compact subsequent cards, unchanged virtualization and filters. Demo cards use varied fictional pairs; each pair matches its opened Room and argument author. No production identities/counts were invented.
- Invitation: smaller header/counterposition, tighter source/identity spacing, complete text preserved in the existing scroll view. Accept/Pass remain outside it above the existing safe-area container. Server eligibility, expiry, busy/double-submit and confirmed-Room routing remain unchanged.
- Crowd: compact initial avatars, separate author/body hierarchy and cleaner spacing. Existing sending, retry keys, reconnect state, moderation actions and permissions remain unchanged.

## Actual verification

- `node node_modules/typescript/bin/tsc --noEmit`: PASS, exit 0.
- `node --test components/arena/ArenaVisualCompletion.test.cjs scripts/arena-live-v2-check.test.cjs scripts/arena-demo-check.test.cjs scripts/take-challenge-check.test.cjs`: PASS, 68 tests, zero failed/skipped, exit 0.
- `node scripts/duel-render-smoke.cjs`: PASS, 22/22 controlled component scenarios. Native modules are bridged in this check.
- Actual-component browser layouts: 24 cases across 320/360/430dp, dark/light, discovery/invitation/Stage/confirmation. Zero measured horizontal overflow or sub-44dp targets; all six confirmation pairs have separated bounds. This is browser geometry, not Android verification at three physical widths.
- Physical SM-A505F: current JS bundle served from existing Metro 8081; actual accessible controls used. Dark/light discovery, invitation, acceptance into the Room, default Stage, expanded Crowd, composer/keyboard, keyboard dismissal and Back were exercised. Full argument/history action and Developer controls sheet were opened.
- Three real dark confirmation frames sampled at scheduled 650/850/1050ms after the actual simulated Accept press, plus a real light confirmation frame. All inspected frames show separated avatars, VS, names and handles. These are sampled frames, not an exhaustive frame-by-frame recording.
- Demo Crowd text was sent locally. No authenticated backend, real media, private-assist recipient isolation or database-security pass is implied.
- `git diff --check`: PASS.

An initial focused run failed the old assumption that every demo card advertised the same pair; it was replaced with per-card-to-Room checks and a requirement for varied pairs. The Stage smoke check asserted the previous 68/32 split; its exact assertions now verify the stronger 72/28 split. An intermediate native review exposed unused compact flex space; the fix and behavioral regression are included. An initial browser assertion could not find the second fighter's test ID; it was corrected and the geometry check rerun. PowerShell treated renderer stderr deprecation warnings as a failing command despite completed output; bounded Node subprocess execution subsequently verified the actual exit codes. No permission or eligibility assertion was removed.

## Local screenshot evidence

`docs/evidence/arena-live-v2/phone-review/v3-after-manifest.json` records 14 unedited native-resolution 1080x2340 AFTER PNGs and their hashes:

- `after-01-live-dark.png`, `after-01-live-light.png`
- `after-02-challenge-dark.png`, `after-02-challenge-light.png`
- `after-03-confirmation-dark-650.png`, `after-03-confirmation-dark-850.png`, `after-03-confirmation-dark-1050.png`, `after-03-confirmation-light.png`
- `after-04-stage-dark.png`, `after-04-stage-light.png`
- `after-05-crowd-dark.png`, `after-05-crowd-light.png`
- `after-06-keyboard-dark.png`, `after-06-keyboard-light.png`

The original six BEFORE PNGs retain their original filenames. A transient personal notification interrupted an intermediate capture; that image was excluded from the selected evidence and no screenshots were published. Raw intermediate captures, XML and logs remain ignored in the existing `.expo/live-v2/` scratch area.

## Restoration and limits

The scoped restoration helper passed after the review: saved development preferences match byte-for-byte and ADB reverses exactly match 8081/55321. Normal Metro remains on 8081. No app data clearing, authentication changes, native rebuild, permission changes, backend configuration changes, database operations, additional worktrees or project folders were used. Unrelated untracked files remain untouched.

No overlap or current-argument clipping was observed in the final sampled default A50 Stage and confirmation views. Compact modes deliberately show fighter identity plus explicit full-argument access; they do not pretend a full transcript fits above the keyboard. Long history/support content remains scrollable. Wider real-device coverage, extreme system font scaling, real backend flows, uploads and production readiness remain unverified. The existing global LOCAL badge overlap outside this task remains.
