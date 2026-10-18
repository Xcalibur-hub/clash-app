# Arena Live Experience V2

Implemented in the existing primary checkout on `arena-ui-review`, from `31abc4ab7003c1acc6244f6c90ba1ed0fe2a6fce` (PR #77 lineage). Recoverable pre-change checkpoint: local Git tag `arena-live-v2-before-20261018-31abc4a`. No additional worktree or application project was created. Unrelated modified/untracked work is excluded.

## What changed

**Live discovery** is a single virtualized vertical list rather than a long header inside another list. “On now” contains only server-classified LIVE Clash entries; the first eligible returned entry is featured, without a fabricated popularity claim. “Coming up” contains server-classified UPCOMING Clashes. Pending challenges use the existing Inbox destination. Results is a separate historical presentation of all completed records, including cancellations, with the existing Hall of Fame verdict destination retained inside it. Group topic discussions have a separate filter and retain their existing entry/watch routes. Guests, loading, actual empty responses and failures remain distinct. Pull-to-refresh and account/focus request isolation remain intact. Public fighter identity is fetched only by mounted cards; BLIND and denied/mismatched previews remain protected. This removes the old eight-card identity ceiling while keeping initial rendering at four rows, batches of six and a five-window list.

The current discovery response has no followed-fighter, topical personalization, followed-verdict or audience-total fields. Production does not offer invented For You/Following filters or pretend to know audience counts. Its Home gateway continues labeling its actual topic counts as discussions, not duel/viewer totals. Groups and topic discussions remain the existing community participation routes.

**Challenge acceptance** uses an editorial invitation with source Take, challenger identity, counterposition, actual status and one decision at a time. Accept and Pass remain visible while the text scrolls. The card no longer flies away before the RPC resolves. An immediate ref guard prevents simultaneous presses; successfully completed decisions stay locked until the record changes, while rejected requests display an error and can retry. Local expiry removes stale actions and is checked again at press time. The connected TakeChallenges source checks, 30-minute predicate, real resolve RPC, linked-Room parsing and confirmed replace-navigation are unchanged. No success overlay is shown by the deck itself. The existing connected parent owns the short confirmed transition only after a real linked Room is returned. Swipe-to-decide was replaced by explicit buttons to avoid accidental or pre-confirmation decisions.

**Immersive Room** gives the official Stage a 68% default split with compact, exactly-two-fighter identity and a stronger official argument hierarchy. Crowd can be expanded explicitly or returned to Stage focus. Keyboard/judging states retain their own split. Public Crowd controls and backing buttons meet 44dp minimums; backing is visibly labeled social support, not judgement. Reaction bursts are reduced to two decorative elements and retain reduced-motion behavior. No scores, turns, typing status or audience activity are invented.

Private assists move out of the permanent Stage into a safe-area/keyboard-aware sheet. The existing assist panel, account key, selected-recipient rules, media, rate limits, moderation and service calls remain unchanged. Transcript/history and the existing overflow remain secondary. No service, authentication, schema, permission or battle-engine code changed.

**Demo Arena** reuses the real duel cards, challenge invitation and immersive Room. It adds an explicitly local invitation preview with pending/expired/error states, simulated delay/confirmation and Room navigation. Demo discovery filters, identities, counts, results, Crowd, assists and media remain fictional/local. No demo control invokes the real challenge, vote, post, moderation, payment or media RPCs. Real backend capability is not inferred from the demo. Existing production fixture exclusion remains in place.

## Validation and failures

See the adjacent evidence JSON files for exact final commands, exit codes, bundle hashes and screenshot measurements. Full configured unit suite: 500 tests / 126 suites, zero failures/skips. Focused UI/eligibility/demo suites and the additional acceptance/keyboard tests are reported separately to avoid inflating totals. Stage checks are controlled React rendering; assist/Crowd checks use controlled transports and the signer uses mocked upstreams. No SQL suite or backend security pass is claimed for this UI-only checkpoint.

Initial checks found incomplete `initiallyOpen` prop forwarding and duplicate header style keys; these compilation errors were fixed. Strict existing render harnesses were updated to render the actual extracted card, virtualized rows and primitive controls. Assertions still check BLIND identity, denied/mismatched previews, account isolation and canonical/legacy routes. Route checks now reflect the intentional separation of pending/results destinations, explicitly exercising cancelled legacy history and upcoming canonical Room navigation. Split/copy expectations were updated for the approved presentation, not to suppress authorization failures.

The live preview renderer uses actual source from the exact checkpoint for BEFORE, current source for AFTER, and allowlisted offline auth/discovery fixtures. Its initial attempt correctly failed because the demo renderer blocked a connected AuthProvider import. The connected discovery preview now supplies an explicit fixture auth adapter; the demo renderer's service/store firewall itself is unchanged.

Browser previews do not prove native layout, keyboard, accessibility or animation performance. Existing theme require-cycle warnings, RN Web deprecation warnings and missing Sentry build configuration were observed. The A50 also logged a slow VirtualizedList update during long automated pauses; no frame-rate or large-data performance pass is claimed.

## Before/after screenshots

All committed PNGs are explicitly labeled **offline browser previews of actual components**, with fictional data. Discovery uses the actual ArenaClashes component with controlled loaded state, not an unrelated mockup. Challenge uses the actual full-screen deck. Room uses the actual immersive presentation through the local demo adapter.

| Experience | Dark before / after | Light before / after |
|---|---|---|
| Live discovery | [Before](evidence/arena-live-v2/dark-live-before-360.png) / [After](evidence/arena-live-v2/dark-live-after-360.png) | [Before](evidence/arena-live-v2/light-live-before-360.png) / [After](evidence/arena-live-v2/light-live-after-360.png) |
| Challenge acceptance | [Before](evidence/arena-live-v2/dark-challenge-before-360.png) / [After](evidence/arena-live-v2/dark-challenge-after-360.png) | [Before](evidence/arena-live-v2/light-challenge-before-360.png) / [After](evidence/arena-live-v2/light-challenge-after-360.png) |
| Duel Room | [Before](evidence/arena-live-v2/dark-room-before-360.png) / [After](evidence/arena-live-v2/dark-room-after-360.png) | [Before](evidence/arena-live-v2/light-room-before-360.png) / [After](evidence/arena-live-v2/light-room-after-360.png) |

Additional AFTER captures at 320dp and 430dp cover all three experiences in both themes. Original PNG sizes/hashes and layout findings are in the screenshot manifest.

## Samsung A50: actual observations

The connected, unlocked SM-A505F used the existing development installation. Task Metro 8083 served a real phone-originated bundle with HTTP 200; JavaScript executed and a usable normal Arena hierarchy was observed. The app was opened directly into the explicitly labeled Demo Arena. No authentication change, native rebuild, data clearing, permission change or backend reconfiguration was performed. Existing app session providers continued normal background work against the configured local loopback backend.

| Native case | Result and evidence |
|---|---|
| Populated Live discovery | PASS for demo presentation and accessible navigation. Dark/light native captures retained privately. |
| Focused challenge entry | PASS through the actual Review demo invitation control. Source, challenger, counterposition and actions rendered. |
| Expired invitation | PASS for disabled UI: raw hierarchy shows `enabled=false` for both Accept and Pass. No real decision attempted. |
| Demo acceptance to Room | PASS through actual Accept; local delay/confirmation led to the expected simulated Room and exactly two fighter identities. Not a server acceptance test. |
| Official Stage / Crowd distinction | PASS for visible structure, official argument attribution and separate Crowd. No real message/permission/judgement test. |
| Crowd expansion / Stage focus | PASS through the actual accessible expand/focus controls. |
| Dark/light Room | PASS for rendered demo screens; screenshots retained privately. |
| Crowd keyboard | FAIL reproduced initially: full Stage split crowded the input behind the IME. Demo now uses the existing keyboard visibility hook, conditional avoidance, condensed Stage, hidden demo scenario controls while typing and reserved composer height. Typecheck/regressions cover the fix. Physical post-fix keyboard recheck remains UNVERIFIED. |
| Local Crowd send / Back / assist-sheet interaction after keyboard | BLOCKED when fresh accessibility trees stopped being available after three bounded attempts. No guessed coordinates or claimed send success. |
| Real account acceptance, real Crowd/assist/media, backend authorization | NOT TESTED in this UI-only review. |
| Reduced-motion system setting, screen-reader flow, font extremes and performance profiling | NOT TESTED physically. Existing settings were not changed. |

After accessibility automation stopped, native screenshots remained possible and showed the app rendering. The owner was asked for manual composer/dismissal verification. Unless a response is explicitly recorded in the evidence, it is unverified. Raw phone captures/XML/logs stay ignored under `.expo/live-v2/native`; their status bars and the normal Arena snapshot may contain personal indicators or existing account data, so they are not published to GitHub. Only sanitized filenames/hashes/results are committed.

## Boundaries and remaining review

No Supabase migrations, SQL, Docker, hosted/project operations, schema, grants, RLS, service, auth/store, engine, World or Vault changes. No bots or notifications. No PR/main merge. No new dependencies. The prior unrelated untracked files remain in place.

Remaining gates: owner-assisted keyboard/dismissal recheck; real recipient/fighter/spectator service flows against separately authorized test data; screen-reader/reduced-motion review; larger-list and frame profiling. The UI candidate is not a production-readiness claim. Cleanup and exact final command results follow in evidence.

## Final layout corrections and cleanup blocker

Responsive Chrome measurement found a long unbroken Crowd handle producing 14px of horizontal overflow at 320dp. The nested web text now wraps within a zero-minimum-width flex item; native text behavior is unchanged. All 18 AFTER cases (three experiences, two themes, three widths) now have zero measured horizontal overflow and zero measured targets below 44dp. Six undersized targets are confined to the BEFORE Room captures. Intentional horizontal scenario/filter scrolling is not a vertical-list overflow.

Phone cleanup is **BLOCKED, not complete**. The first restoration operation (`am force-stop`) timed out before the saved preferences could be copied back. Subsequent `adb devices -l` and a bounded direct read-only query to the existing ADB daemon on 5037 also timed out. Its process remained present. No ADB server restart was performed without approval; the owner was explicitly asked. The original preferences and exact forward list are saved privately; the last verified temporary bundle host was localhost:8083. The task Metro wrapper later exited 1 and no 8083 listener was observed. This is not reported as a verified clean shutdown/restoration. No database, app data, native installation, permissions or auth reset is involved.

After ADB becomes responsive, verify this is the same A50, then run `node .expo/live-v2/native/restore-device.cjs` from the repository. It restores saved preferences byte-for-byte, removes only the task-added 8083 reverse and verifies the exact original 8081/55321 list. Do not clear app data or delete the saved files before restoration is confirmed.

## Exact changed source and tooling files

- `app/(tabs)/index.tsx`
- `components/arena/ArenaClashes.tsx`
- `components/arena/ArenaLiveGateway.tsx`
- `components/arena/ArenaVisualCompletion.test.cjs`
- `components/arena/ClashConfirmedOverlay.tsx`
- `components/arena/FullScreenChallengeDeck.tsx`
- `components/arena/ui/ArenaPrimitives.tsx`
- `components/dev/arenaDemo/DemoArena.tsx`
- `components/dev/arenaDemo/entry.tsx`
- `components/dev/arenaDemo/model.ts`
- `components/liveArena/ClashBackingActions.tsx`
- `components/liveArena/ClashEventHeader.tsx`
- `components/liveArena/ClashFighterRail.tsx`
- `components/liveArena/ClashProposition.tsx`
- `components/liveArena/CurrentArgumentStage.tsx`
- `components/liveArena/DuelRoomExperience.tsx`
- `components/liveArena/ImmersiveClash.tsx`
- `components/liveArena/LiveCrowdLayer.tsx`
- `components/liveArena/PrivateAssistPanel.tsx`
- `scripts/arena-demo-check.test.cjs`
- `scripts/arena-design-screenshots.cjs`
- `scripts/duel-render-smoke.cjs`
- `components/arena/ChallengeInvitation.tsx`
- `components/arena/LiveDuelCard.tsx`
- `components/arena/ui/ArenaSheet.tsx`
- `components/dev/arenaDemo/DemoChallenge.tsx`
- `components/dev/arenaDemo/DemoLiveDiscovery.tsx`
- `scripts/arena-live-v2-check.test.cjs`
- `scripts/arena-live-v2-preview.cjs`

Reporting adds this document and the sanitized `docs/evidence/arena-live-v2/` files. The primary checkout remains on its requested branch, with unrelated untracked files excluded from the commit.

Final compatibility inspection confirmed Hall of Fame is intentionally verdict-only. Results therefore retains a separate completed-Clash view of the same discovery response, including cancelled records, rather than silently removing their previous entry points. Hall of Fame remains unchanged and available from that view. This is presentation state only; no new endpoint or table.

## Exact final results

| Check | Actual result |
|---|---|
| TypeScript (`node node_modules/typescript/bin/tsc --noEmit`) | PASS, exit 0 |
| Full configured unit file list | 500 tests / 126 suites, zero failures/skips, exit 0 |
| Focused UI / demo / Take eligibility / acceptance | 92 tests, zero failures/skips, exit 0 |
| Final history/ended-feature recheck | 23 tests, zero failures/skips, exit 0; overlaps the focused suite |
| Official Stage rendering | 22/22 controlled scenarios, exit 0 |
| Assist / mocked signer / Crowd | 10 / 14 / 7 reported controlled checks, all exit 0 |
| Expo Doctor | 18/18, exit 0 |
| Final Android development / release JS exports | Both exit 0; hashes in bundles.json |
| Release fixture exclusion | Canary, distinctive demo-filter text and demo-banner text absent; present in development |
| Release source-map integrity | 18 changed production source modules exactly match current source; maps remain ignored |
| Browser layout | 24 captures; all 18 AFTER cases have zero measured horizontal overflow and zero targets below 44dp |
| Physical A50 | Partial demo review; post-fix keyboard and final source rerun unverified |
| Phone configuration restoration | BLOCKED by unresponsive pre-existing ADB daemon; no success claimed |

The unchanged 500-test unit file list is not added repeatedly to totals. Final history checks overlap existing tests. Browser/service/render checks are not represented as native, real media or database authorization passes.

The invitation badge always displays the authoritative supplied status. A local expiry veto disables decisions and explains that they are unavailable; it does not rewrite a server PENDING record into EXPIRED. The explicit EXPIRED native demo scenario is a labeled local fixture. Release source-map matching ignores only a leading BOM and CRLF/LF representation; recorded SHA-256 values describe the actual files.
