# Take detail and archived navigation — 18 October 2026

Base: PR #73, `integration/arena-final-ui-20261018`, commit `986365b71b8e53e0d183a5237e1ca55f4ff898f0`. Separate branch: `feat/take-detail-archive-navigation-20261018`. No merge or deployment.

## Changes and root cause

The physical A50's existing expired development Take (`devfx_take_settled`, documented in `supabase/seeds/clash_dev_fixtures.sql`) displayed a Challenge action, an editable reply composer and a settled Clash's **Make an argument** action. The latter pushed another `/take/[takeId]` route. Back then returned to Clash rather than the original discussion. A separate loading bug classified every not-yet-fetched, unavailable or failed Take as “no longer live.”

The legacy presentation action now reads the **local Stack navigator at press time**. It dismisses to a matching earlier Take, preserving its component state, or pushes when entering from a direct Clash link without an earlier Take. Take Back still uses real history, with a tabs fallback only when there is no history. Canonical Room redirects and the Clash engine are unchanged.

An initial implementation using `useRootNavigationState` failed native verification: sort reset and Back still reached Clash. Temporary, sanitized development diagnostics established that Expo Router returns an outer `__root` route with index 0; the actual local Stack held `(tabs) → take/[takeId] → clash/[takeId]`. The final implementation uses `useNavigation().getState()` and the native retest passed. Temporary console diagnostics were removed. No error or navigation gate was suppressed.

Take detail now has compact inline text/media, a smaller discussion/sort heading, thin thread separators, bounded nested indentation and 44-point reply/attachment targets. The idle composer places input and actions on one row and expands for editing; the existing upload, retry, authentication and moderation handlers remain. Android uses explicit keyboard avoidance for the existing edge-to-edge configuration, dropping extra home-indicator padding while the keyboard is shown.

Archive status refreshes while the screen is open. Expired reply composition, new challenges and Take reactions are closed in the UI; existing discussion, source stance/question modules, history, sharing, saving and moderation remain available. Comment upvotes retain their existing server contract. Challenge history and accepted Room destinations remain, including cancel controls where previously available. Empty archived challenge sections disappear only after a successful empty response. No client hint grants eligibility: existing RPC/RLS checks still decide every write. No server clock, deadline, reward or schema changed.

Remote Take loading, missing/inaccessible results and errors now have separate states with retry and account-scoped stale-response rejection. The LOCAL badge itself remains unchanged; only the Take header reserves space when that badge is actually enabled.

## Files changed

- `app/take/[takeId].tsx`
- `app/clash/[takeId].tsx` — legacy discussion entry and action wording only.
- `components/arena/CommentThread.tsx`
- `components/arena/RebuttalInput.tsx`
- `components/arena/TakeActionRow.tsx` — optional archive props; feed defaults preserved.
- `components/arena/TakeChallenges.tsx`
- `components/arena/TakeDetailHero.tsx` — optional compact rendering; full media viewer retained.
- `components/clash/interactive/ClashArguments.tsx` — presentation label only.
- `utils/takeDetail.ts`, `utils/takeDetail.test.ts`
- `scripts/take-detail-check.test.cjs`
- This report and sanitized evidence under `docs/evidence/take-detail-20261018/`.

No changes to Supabase, services, authentication/store, engine, Groups, Discover, Live Room, global navigation/theme, native configuration or dependency manifests. The primary checkout and unrelated Crew/untracked work remain untouched. Installed dependencies were reused in ignored worktree directories; no packages were installed.

## Automated validation

| Command | Actual result |
|---|---|
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run test:unit` | PASS: 500 tests, 126 suites, 0 failed/skipped, exit 0 |
| `node --experimental-strip-types --test utils/takeDetail.test.ts` | PASS: 5 tests, exit 0 |
| `node --test scripts/take-detail-check.test.cjs` | PASS: 6 tests, exit 0 |
| `node scripts/arena-engagement-check.cjs` | PASS: 8 controlled checks, exit 0 |
| Android development JavaScript export | PASS, exit 0; actual application markers verified in evidence |

The 11 new tests cover expiry boundaries, existing/direct-entry navigation, fresh local-stack reads, active/archived action contracts, reply focus, loading versus inaccessible content, errors/retry and late responses across account switches. The existing eight hook checks also exercise failed media reply draft retention, upload reuse, duplicate taps and account isolation. The first new-screen test run failed because the controlled React bridge lacked dependency-less effect support; the bridge was corrected, preserving all assertions, and all six tests then passed. These are controlled tests, not database security or native media results.

Export command: `node node_modules/expo/bin/cli export --platform android --dev --no-bytecode --max-workers 2 --output-dir .expo/take-validation/android-export`, launched with the existing loopback public backend configuration and a private Metro cache. No backend was created or reconfigured. The initial competing export was stopped to reduce compile contention and is not counted as a pass. Final export runs completed with exit 0. Existing Sentry configuration, debug-bytecode and third-party `event-target-shim` warnings were observed, not suppressed. No database tests or Expo Doctor run is claimed in this checkpoint.

## Samsung A50 results

Actual installed development app `com.clash.v2.dev`, connected/unlocked `SM-A505F`; candidate Metro 8083, unchanged existing local backend. The before screenshot is the owner's initially installed UI, not a claimed PR #73 binary revision. No new Take, vote, reply, challenge or fake activity was created. No explicit sign-in/out, credential submission, app-data clearing, native install or permission change occurred.

| Physical check | Result |
|---|---|
| Original expired Take → Make an argument → Back | Reproduced the duplicate-route loop |
| Candidate bundle delivery/execution | HTTP 200 and React Native `Running main`, then real native Take content |
| Archived heading and closed footer | PASS, visible screenshot and accessibility evidence |
| Expired Take reaction/reply controls disabled; composer and new Challenge absent | PASS, asserted native XML |
| LOCAL badge versus Take Back target | PASS, nonintersecting native bounds |
| Existing discussion and sort controls | PASS, actual server-backed replies rendered |
| Take → History → View discussion | PASS after local-Stack correction; selected New sort preserved and asserted |
| Back after restored discussion | PASS: actual Arena Home hierarchy/screenshot, not Clash |
| Active-Take keyboard, attachment picker/playback and posting | NOT TESTED natively; no current active Take was created for this UI task |
| Light theme, very large text and screen-reader gestures | NOT TESTED natively |
| Direct-Clash fallback | Controlled navigation test only; not a separate native result |

The unchanged general Arena cold-launch gate initially failed at Metro status during compile contention. After stopping only the task-owned competing export, Metro status passed; the next gate failed its 150-second bundle deadline. The actual cold compilation took 185,473 ms and subsequently served/executed successfully. Later direct native Take interactions above passed. Neither gate failure is relabelled as a full cold-launch pass.

Actual native PNGs and raw XML are retained privately under `.expo/take-detail-20261018/.expo/take-validation/screens/` in the primary repository. Key files: `take-before.png`, `take-after-final.png`, `returned-fixed.png`, `fixed-back.png`. They are not uploaded because the status bar contains personal notification indicators. The committed evidence records filenames, byte lengths and SHA-256 only. No synthetic screenshot is presented as native.

## Restoration and limits

Restoration PASS: original development preferences are byte-identical, ADB reverses match exactly, diagnostic Metro 8083 is stopped, and the original Metro 8081 (PID 8036) remains running. See committed restoration evidence. Only the task's diagnostic Metro is stopped; the original 8081 process is preserved. Development preferences and ADB reverses are restored from captured originals. No existing backend, database or user record is modified; no hosted project is contacted.

Review the active composer on a genuinely active Take, including physical IME resize/dismissal, tall text, image/video and upload errors, before declaring those native paths verified. Client expiry is a conservative UI hint using the existing timestamp and local clock; it does not replace authoritative server validation or reveal hidden content. Global LOCAL overlap on Arena Home and the general cold-start gate are outside this Take-only correction. Keep this PR DRAFT; this is not a production-readiness claim.
