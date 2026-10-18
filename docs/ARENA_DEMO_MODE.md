# Arena Demo Content Mode

Development-only offline presentation sandbox, based on PR #76 (`f8e093d8dc0bf687ff0c0c2737a53583248efee0`). Branch: `feat/arena-demo-mode`. No database, hosted project, schema, authentication, engine, service or production-data changes.

## Entry and exit

Use the existing **development native identity** with a development JavaScript bundle. Tap **Demo Arena** in the Arena header, or open `clash-dev://demo-arena`. Optional `?demoScreen=home|take|live|room|groups|discover` selects an initial scene. Both the route and entry require `__DEV__` and `extra.appVariant === development`. Production/preview identities are refused. Metro replaces the fixture entry with an unavailable screen in non-development bundles, including when its development context is missing.

Every screen retains the DEMO banner, fictional-data explanation, theme toggle and Exit. Bottom tabs and Android Back operate on an in-memory navigation stack. Exit returns through normal navigation; reset/unmount discards local actions. No auth/session, saved content, real membership, location permission or persistent preference is changed by demo controls. The nested theme provider changes only the sandbox palette. Normal app session providers remain intact and may perform their existing startup/background work; this is not a claim that the whole application makes zero network requests.

## Content and local interactions

- **Home:** 24 varied Takes, 12 fictional authors, four feed scopes, reaction/save toggles and discussion navigation. Includes long names/statements, zero replies, a 48-reply conversation, archived Takes, a near-deadline example and simulated media previews.
- **Take:** real editorial header/action/sort components with local nested threads, reply forms, reply votes, stance selection, active/archived states and scripted historical/pending challenges. Challenge eligibility reuses PR #75's predicate, including its 30-minute window and submit-time recheck. A demo acceptance opens only a scripted local Room.
- **Live:** several explicitly simulated phases; exactly two fictional fighters in the real `ImmersiveClash` presentation. Role/phase selectors, local Crowd messages, backing, reactions, official arguments, history, scripted A/B ballots and final/DRAW/cancelled results. This does not simulate server clocks, settlement, rewards, reconnect transport or security guarantees.
- **Assists:** select A/B, compose text/simulated media, switch demo role to review the selected recipient's inbox, accept/reject and explicitly publish once. Acceptance remains unpublished. Role selectors are a visual simulation, not authentication or a replacement for existing RLS.
- **Groups:** six fictional communities rendered through the real GroupCard, Joined/Explore, one local membership, pinned/post/conversation previews. These fixtures do not imply new Crew backend capabilities.
- **Discover:** nine fictional topics and interactive graph connections using the same constellation layout algorithm as real Arena. Node selection and conversation navigation are local; displayed trends/activity are explicitly scripted.

Demo controls expose populated/empty/loading/error states and reset. Profile navigation, real sharing and moderation explain that the operation is unavailable rather than invoking real services. Image/video/GIF choices use local SVG illustrations and a reduced-motion-aware visual animation/play-pause simulation. There is **no media picker, upload, remote URL, actual video/GIF codec playback, signer call, payment or external sharing**. No public users, activity, rankings, notifications or verdicts are created.

## Architecture and compatibility

`TakeFeedCard` is the existing card presentation extracted from `TakeFeedItem`. The normal connected wrapper retains the real author route, ChallengeTakeButton and QuestionVotePanel. Demo callers supply local actions without those service-connected slots. The constellation geometry is extracted unchanged into `utils/topicConstellation.ts`. Existing Groups and Live components are reused without modifications. A nested `PresentationThemeProvider` avoids writes to global theme preferences. Only the demo route suppresses the ordinary interest-onboarding overlay and LOCAL badge; the normal app providers and screens remain in place.

Demo fixture/reducer modules use type-only imports for application data contracts and no runtime services/store/network/persistence imports. Regression tests compile and inspect these boundaries, deny service/store imports across the actual rendered demo dependency path, render all six pages offline, and exercise local reducer operations including deduplication, recipient selection and explicit once-only publication. These checks are client isolation evidence, not database authorization tests.

## Verification

- `npm run test:unit`: **500 tests / 126 suites passed**, zero failed/skipped, exit 0.
- `node --test scripts/arena-demo-check.test.cjs scripts/arena-design-check.test.cjs components/arena/ArenaVisualCompletion.test.cjs scripts/take-challenge-check.test.cjs scripts/take-detail-check.test.cjs`: **84 passed**, zero failed/skipped, exit 0. Includes 18 demo tests and retained eligibility/UI assertions.
- `npm run typecheck`: **PASS**, exit 0.
- Expo Doctor 1.20.4: **18/18 PASS**, exit 0.
- Twelve actual demo SSR pages and headless Chrome captures: **PASS**, dark/light Home, Take, Groups, Discover, Live and Room. No horizontal overflow at the measured 360px viewport. Six inherited target-size findings remain: Room backing controls are 40px high and Crowd Send is 38px (both themes). No production Live styling was changed to hide these findings.
- Android development and release JavaScript exports and fixture-exclusion results are recorded in the evidence manifest. Export is not a native build or runtime pass.
- Initial restricted-shell final checks failed before execution due Windows `EPERM lstat` on the reused dependency paths; the same commands were then executed with the required filesystem access and passed. No assertions or app permissions were relaxed. An initial demo source scanner incorrectly flagged `Array.from`; it now distinguishes that standard-library call from a database `.from`. Screenshot review also caught nested Home preview press targets; passive Home media captions fixed the actual markup, with regression coverage.

## Screenshots

All committed PNGs are **browser previews of actual demo components**, not physical Android evidence:

| View | Dark | Light |
|---|---|---|
| Home | [Dark](evidence/arena-demo-mode/dark-home.png) | [Light](evidence/arena-demo-mode/light-home.png) |
| Take | [Dark](evidence/arena-demo-mode/dark-take.png) | [Light](evidence/arena-demo-mode/light-take.png) |
| Groups | [Dark](evidence/arena-demo-mode/dark-groups.png) | [Light](evidence/arena-demo-mode/light-groups.png) |
| Discover | [Dark](evidence/arena-demo-mode/dark-discover.png) | [Light](evidence/arena-demo-mode/light-discover.png) |
| Live | [Dark](evidence/arena-demo-mode/dark-live.png) | [Light](evidence/arena-demo-mode/light-live.png) |
| Room | [Dark](evidence/arena-demo-mode/dark-room.png) | [Light](evidence/arena-demo-mode/light-room.png) |

Physical review and cleanup results are appended below. Browser captures cannot establish Android keyboard, safe-area, animation performance, screen-reader behavior or native Back correctness. No Supabase or database test was run or implied. Keep the new PR DRAFT; no merge or deployment.

Final development export: **exit 0**; final release export: **exit 0**, recorded from the child process status. The release bundle excludes the canary, distinctive fixture text and demo-label markers present in development. See [bundle hashes](evidence/arena-demo-mode/bundles.json). Two earlier PowerShell-redirection wrappers reported exit 1 despite complete export output; direct child-status capture removed that shell ambiguity without changing the app, build assertions or exporter.

## Physical Samsung A50 attempt

ADB detected SM-A505F. It was initially locked, then became unlocked. The task saved exact original development preferences/ADB forwards, temporarily used localhost:8083, and launched the existing development client. A real phone-originated bundle request received HTTP 200; Metro built 4,666 modules in 121,391ms. Existing JavaScript startup logs were observed. This establishes delivery/execution, **not a usable demo-screen pass**. Fresh accessibility dumps contained no CLASH nodes; later inspection showed `NotificationShade` foreground and `mAodShowing=true`. Screenshot capture refused because CLASH was not foreground. The owner was asked to keep the phone unlocked/foreground; no usable foreground state was subsequently available. No coordinates were guessed.

Native Demo Arena navigation, populated screens, keyboard, scrolling, Back, role controls and media animation are **BLOCKED / NOT TESTED**. The private startup screenshot is not a demo-screen screenshot and is not published. Original preferences were restored byte-for-byte to 8081 and reverses restored exactly (8081/55321). Only the task Metro process tree on 8083 and task-created phone temporary files were removed; the app was closed. No normal Metro, backend, authentication data, app data, installation or permissions were changed. See [sanitized native and restoration results](evidence/arena-demo-mode/android.json).
