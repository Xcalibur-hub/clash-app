# Arena Engagement Step 3 - audit before changes

Baseline: 3ad7ee5. Existing unrelated Crew files/development scripts remain excluded.

| Capability | Existing path and confirmed gaps |
| --- | --- |
| Takes/questions | Existing create_take/create_arena_question and shared media upload flow; question composer lacks distinct-label guidance/counters. Human question voting is server authoritative. |
| Comments/threading | RebuttalInput -> postComment -> create_comment, CommentThread nested replies and CommentMedia image/video/GIF rendering. Composer has no synchronous in-flight guard, no account-scope invalidation across asynchronous picker/upload/post results, and only a global failure notice. |
| Media/memes | Owned createUpload/uploadFile/completeUpload storage flow supports images/videos with text. A meme is an ordinary uploaded image; no new catalogue is needed. Failed comment retries currently upload the same asset again. |
| GIFs/stickers | Existing Tenor provider directly embeds EXPO_PUBLIC_TENOR_API_KEY and lacks request timeout. Picker has stale-search/closed-sheet races, duplicate pagination and no synchronous paging guard. No secret key should be used in this path. A server-secret proxy and honest unconfigured state are needed. Sticker search is only a generic GIF keyword; a true sticker catalogue is deferred. |
| Reactions | Existing toggle_take_reaction and toggle_comment_upvote reconcile server counters, but late completion can dispatch into a switched account. |
| Notifications | Existing notification reads/mark-read and server producers; no push service is being introduced. |
| Feeds/navigation | Existing Home/Live/Communities/Topics, personalized discovery, fixture filtering, loading/error/empty states and canonical routing already exist. Preserve these and focus on confirmed request/account races rather than redesign. |
| Voting | Existing privacy, zero/tied/closed states, conflict refresh and retained retry revision. Polish options/accessibility and subtle reduced-motion-aware feedback without optimistic fabricated totals. |
| Android | Installed com.clash.v2 debug APK dated October 3; current SDK54 dependency expo-camera17.0.10 is compatible and generated ExpoModulesPackageList includes CameraViewModule. Previous native rebuild failed in C++ with LLVM out-of-memory; the phone still has the old binary. Correct fix is complete native rebuild/install, not hiding the import. |
| Editorial | Local migration/worker present, paused REVIEW_ONLY, no sources/publisher. Keep disabled; no live feed/provider requests or hosted cron/migration. |

Native audit: A50 ADB-connected, reverse8081/55321 active, disk about16GiB free, physical memory about1.7GiB and commit headroom about4GiB at inspection. Generated Android project/autolinking will be reused. Run existing C++ target serially before resource-bounded Gradle assembly; preserve data with adb install -r only after success. Do not change Windows paging configuration or delete unrelated files. Runtime/device results and actual test outcomes follow below.

## Completed improvements

- QuestionVotePanel now has clear OPTION A/B hierarchy, selected checkmark, accessible choice hints, 44+ pixel controls, and a restrained 120ms selected-marker fade that honors reduced motion. Existing PressableScale supplies reduced-motion-aware press feedback. Animation feel has not been measured in a release build. Server totals remain authoritative; complementary rounded percentages sum to 100 (1/8 versus 7/8 is 13%/87%), while exact counts remain visible. Zero/tie/closed, conflict refresh, retained retry revision and privacy rules are preserved.
- The existing question composer shows separate option counters, fair/distinct-choice guidance and an inline invalid-label state. No new composer route or question table.
- RebuttalInput has a synchronous send guard, scope checks before/after picker/upload/post work, a retained failure message/draft, disabled editing/removal while sending and reuse of a successfully completed upload when a comment request fails. Changing account, Take or reply target clears the previous scoped draft. Late results cannot dispatch comments or clear the next account's draft.
- useOperationScope rejects stale results across A -> B -> A, target changes and unmount, and supports Strict Mode effect setup/cleanup. Take reactions and comment upvotes now discard late account results; comment upvotes also guard duplicate taps. Remote Take-detail fallback data is keyed to account/Take scope.
- GifPickerSheet invalidates stale searches, closure/account changes, deduplicates records, guards synchronous pagination, stops repeated cursors and offers a failed-page retry. No new GIF catalogue, sticker assets or media storage engine.
- Existing image/video replies, uploaded meme images, text+media, nested threads, ownership/moderation and reactions remain in their existing paths. Their physical creation/upload journeys were not exercised here. Existing comment fetches still have the backend REST row cap and no dedicated paginated thread API; very large discussion recovery remains an operational/UI limitation. Comment creation itself has no new idempotency contract: after an ambiguous lost response, a manual retry could duplicate an ordinary comment. Official contribution idempotency is unchanged.
- Existing feeds, genuine ranking, four destinations, fixture filters, error/empty/loading states and legacy/canonical routing were preserved. No broad theme or navigation redesign and no Crew changes.

## GIF authorization and backend changes

Migration: `20261009170000_arena_gif_proxy_budget.sql`, local only. New `claim_arena_gif_request(p_auth_uid uuid)` is SECURITY DEFINER with empty search_path, explicit service_role check and EXECUTE granted only to service_role. Anonymous/authenticated callers cannot select another quota identity. It validates a linked profile, then uses the already-serialized rate limiter in global-first order: 120 provider requests/minute total and 20/minute/profile. Failed quota checks roll back both reservations. No tables, RLS policies or existing grants were loosened.

Optional `arena-gifs` Edge Function requires POST and a bearer token, independently verifies that token through local/Supabase Auth, then charges the verified user through its private server credential. It only calls fixed Tenor featured/search endpoints; callers cannot choose upstream URLs or provider keys. Request body <=2 KiB, query <=64 chars, cursor <=200, upstream result <=256 KiB and 24 rows; request timeout 10s. Redirects fail. Formats project only allowlisted credential-free HTTPS Tenor URLs and bounded metadata. Raw provider/database failures, queries and credentials are not returned or logged by the implementation. Existing create_comment independently validates attachments and ownership; proxy output cannot bypass that write boundary.

The mobile client no longer reads EXPO_PUBLIC_TENOR_API_KEY. A non-secret `EXPO_PUBLIC_ARENA_GIFS_ENABLED=true` opt-in controls availability; server-only `TENOR_API_KEY` is required in Edge secrets. Native client requests are bounded to 12s and discard responses after session changes. Default remains unavailable. No API key was configured, no upstream GIF request occurred, and the function was not deployed. No service-role value enters the client.

Before enabling: obtain/verify an **existing authorized** provider integration, review attribution/usage rights and upstream quotas, approve the target migration/deployment, configure the Edge secret, then enable the client flag and test actual HTTP behavior. [Tenor's official quickstart](https://developers.google.com/tenor/guides/quickstart) states that new API clients are no longer accepted as of January 2026. Do not assume a new key can be obtained, that access is free, or that this checkpoint grants usage rights. Provider swaps can reuse GifProvider but require a supported backend adapter and matching attachment URL validation; that is not implemented here. True sticker catalogues are deferred. Edge invocations/provider traffic may incur deployment-dependent charges; no paid calls were made.

## Native root cause and resolution

The Samsung SM-A505F had an October 3 `com.clash.v2` debug APK. SDK54 JavaScript imported expo-camera17.0.10 through an existing route, but that native module was absent from the installed binary. Package versions were compatible and current generated ExpoModulesPackageList already contained CameraViewModule. The previous rebuild failed with parallel clang/LLVM out-of-memory, so new JavaScript was running against the old native binary. No JS import mask or camera feature removal was used. SDK54 recommends [expo-camera17.0.10](https://docs.expo.dev/versions/v54.0.0/sdk/camera/); [Expo autolinking](https://docs.expo.dev/modules/autolinking/) supplies the native registration.

Completed the existing C++ targets serially:

```powershell
& "$env:LOCALAPPDATA/Android/Sdk/cmake/3.22.1/bin/ninja.exe" -C android/app/.cxx/Debug/6f5p73zn/arm64-v8a -j1 appmodules react_codegen_rnscreens react_codegen_rnsvg react_codegen_safeareacontext
```

That exact target completed all 79 steps, including libappmodules.so. Then ran from android/:

```powershell
.\gradlew.bat :app:assembleDebug --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m -XX:ActiveProcessorCount=2' '-Dorg.gradle.parallel=false' '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=arm64-v8a' -x ':app:buildCMakeDebug[arm64-v8a]'
```

The exclusion was used only after that exact C++ target succeeded; never skip an uncompiled native target. The CMake hash is checkout-specific: inspect the generated build directory before reusing the command. JDK17, Gradle8.14.3, compile/targetSDK36 and NDK27.1.12297006 were used. **BUILD SUCCESSFUL in 4m9s**, 367 tasks, 28 executed. No project reset, cache deletion, paging-file modification, new native dependency or Android source rewrite.

Installed with `adb install -r`: **Success**, preserving existing app/session data. Package lastUpdateTime became October 9 16:43:24. Local APK SHA-256 and installed base.apk SHA-256 match:

`8e3610be926f11914b2cd76fb3d804c34cb741526a814bf100893dafe93c9874`

This is the existing Metro-connected debug application; expo-dev-client is not installed and there is no development-client launcher. No EAS build/update, release bundle or store delivery occurred. The APK is a local generated artifact and is not committed. Current Metro reports running, USB reverse8081/55321 is active, and the app loads current JS changes (the new question-option labels/counters were visible physically).

Native camera verification opened only the already-existing preparation route. Temporarily granted CAMERA, saw Camera ON, and Android logged front camera1 ACTIVE for com.clash.v2 at16:45:18, then CLOSED on leaving. No recording or matchmaking was started. Restored original CAMERA permission (granted=false); microphone permission unchanged. Post-install logs checked contained no missing ExpoCamera error or fatal exception in that observed interval. This is bounded evidence, not a claim of zero native faults.

## Actual runtime/Android results

| Journey | Actual result |
| --- | --- |
| Cold launch/current bundle | Passed; rebuilt APK installed, original session retained; latest option UI visible |
| Camera native module/preview | Passed; actual front-camera session and clean close; permission restored |
| Arena Home | Passed; genuine empty For You, retained runtime test Take absent |
| Live Clashes | Passed; Pending/Live/Upcoming empty, existing Completed card present; no cancelled/pending record labeled Live |
| Communities | Passed; existing Crew destination honestly reports no memberships/communities; no Crew edits |
| Topics & Trends | Passed; canonical catalogue visible; no fabricated trending counts |
| Ordinary Take composer | Passed opening/disabled empty publish and existing image/video controls; no record submitted |
| A/B composer | Passed toggle/scroll, OPTION A/B0/60 and distinct-choice guidance; no record submitted |
| Cancelled canonical entry | Passed existing ar_3511812688853a0c members-only denial, no Watch/join/Crowd interface shown; no state reopened |
| Completed legacy Clash | Passed devfx_take_settled: settled Judgement, Side A/SPLIT DECISION,67%, three judgements; record untouched |
| Background/foreground | Passed; app returned to existing Topics destination and retained session, then returned to Home |
| Real local authenticated API requests | Two pre-existing isolated test identities authenticated in separate clients; direct known-identity GIF quota RPC denied with42501 to both |
| Physical account switching | Not tested; original phone session preserved. Async switching/A->B->A tested in controlled component/hooks; separate REST identities are not physical switching |
| Create Take/question, vote A->B, comments/reactions/media upload | Physical writes not tested. No active ordinary questions in feed and no public demonstration activity was manufactured. Unit/client/SQL fixtures cover the contracts |
| Challenge -> acceptance -> live Stage/Crowd -> judging/settlement | Not tested physically. Local inventory has one canonical Room, CANCELLED; four SETTLED Rooms have no canonical Clash link. Fixture sources are deliberately rejected by challenge APIs. Creating a public competition or changing states to force this journey would violate this checkpoint's boundaries |
| Settled canonical entry/official historical transcript | Physical verification unavailable: no existing settled canonical Room. Full local SQL/history checks passed |
| GIF search/reply with actual provider | Not tested; no authorized provider credential or deployed local Edge runtime; client remains disabled |
| Two-device Realtime, offline/reconnect, populated topic pagination | Not physically tested; no second authenticated device/live canonical event, offline phone experiment not performed, current question list empty. Service/interaction/SQL recovery tests passed |

UIAutomator could not reliably obtain idle state (one early dump was stale), and incoming third-party notifications interrupted an initial coordinate sequence. Those attempts were rejected as evidence. Four navigation destinations were repeated individually and inspected using fresh screenshots with CLASH in foreground. Screenshots/logs are ignored local artifacts and not committed. No message was sent in a third-party application. No legitimate Take, account profile, competition, Crowd row or judgement was edited/deleted to obtain results.

## Automated validation actually executed

| Check | Result |
| --- | --- |
| Full local pgTAP | **82 files,2,987 assertions; zero failures** |
| Full unit suite, final run | **466 tests,119 suites; zero failures/skips** |
| TypeScript application | Exit0, final operation-scope changes included |
| TypeScript Edge entrypoints | Exit0; editorial + GIF handler entries |
| Arena engagement async hooks/composers | **8/8**, controlled dependencies |
| A/B questions service/render | **25/25**, including rounding, conflict, closed, retry and account isolation |
| Interests | **12/12** |
| Arena navigation | **11/11** |
| Challenge Inbox | **18/18** |
| Stage render | **22/22** |
| Official service/recovery | **14/14** |
| Crowd service | **7/7** |
| Settlement/history | **11/11** |
| Editorial worker/endpoint tests | **24/24**, deterministic/mocked upstreams |
| Expo Doctor | **18/18** |
| Native C++/APK/install | Successful serial target, successful assembly and successful replacement installation |

Full SQL runner used installed local pgTAP with rollback semantics and existing psql gset translation, rather than claiming Supabase CLI test execution. Its existing committed fixture/concurrency tests restore their owned graph/config. Existing media ownership/removal/block/mute, canonical authorization, official request idempotency, concurrency, expiry, legacy GROUP and maintenance recovery suites all reran. New081 tests cover server-only quota identity/grants, missing accounts, per-user/global caps and transactional rollback. New GIF unit tests cover authentication, missing config, malformed input, rate-limit denial, fixed upstream/identity, URL projection, abort-signal wiring and sanitized outages. Interaction bridges execute actual hooks/composers but do not prove physical network/media behavior. No real source/provider request was made.

The initial Arena navigation check failed because its Node harness attempted to load Reanimated natively after the new selection fade import. Added an explicit reduced-motion/Text bridge; final navigation rerun passed. The interaction harness initially lacked useCallback memoization; corrected the harness and then tested duplicate paging/cursor behavior. Read-only inventory queries initially used incorrect column names; corrected to status/clash_id. No failed attempt is reported as passed.

Local migration ledger is aligned at99 repository versions, including pre-existing locally installed uncommitted Crew work. New quota function body/search_path/grants were verified against its migration before recording the local entry. No hosted migration or cron was applied. Editorial remains paused REVIEW_ONLY, null publisher, zero sources, zero AI publications; local cron has zero active editorial jobs. No credentials/feed permissions were present for a bounded real review-only check, so none was attempted. LIMITED_AUTO was not enabled. Hosted state was not queried; the claim is that this session issued no hosted deployment/scheduling action, not an independent audit of every external operator.

## Beta-readiness assessment and remaining limitations

**Not yet fully validated for unrestricted beta.** Native startup/camera compatibility is fixed and required automated security/regression checks pass. Safe navigation and existing history are verified on the A50. Live multi-account creation/voting/media/competition journeys, settled canonical spectator entry, two-device delivery and physical offline recovery still need an isolated permitted runtime scenario/device session before claiming full end-to-end beta readiness. Source/provider permissions and Edge deployment are also prerequisites for GIF and editorial integrations. True stickers, large-thread pagination and ordinary comment ambiguous-response idempotency remain deferred limitations; no new competition or judging rules were introduced.

Inspected existing files: app.config.ts/app.json/package.json; app/(tabs)/create.tsx; app/take/[takeId].tsx; existing camera prep route (native verification only); components/arena/{RebuttalInput,CommentThread,CommentMedia,GifPickerSheet,QuestionVotePanel,TakeComposerFields,TakeFeedItem}.tsx; services/{apiService,mediaService,tenorService,notificationService,expressiveMediaService,arenaQuestionService}.ts; services/gif/*; hooks/useTakeReaction.ts; store/actions.ts/reducer.ts; corresponding media/GIF/security/question/editorial migrations/tests/reports; generated Android settings/Gradle/autolinking and prior build logs. No Explore feature implementation was begun.

Modified files: .env.example; app/(tabs)/create.tsx; app/take/[takeId].tsx; components/arena/{GifPickerSheet,QuestionVotePanel,RebuttalInput}.tsx; hooks/useTakeReaction.ts; new hooks/useOperationScope.ts; services/tenorService.ts; services/gif/{index,tenorGifProvider}.ts; new utils/tenorUrl.ts and updated utils/tenorUrl.test.ts; new utils/arenaGifProxy.test.ts; scripts/{arena-navigation-check,question-client-check}.cjs; new scripts/arena-engagement-check.cjs; package.json; supabase/config.toml; new supabase/functions/arena-gifs/{handler,index}.ts; new supabase/migrations/20261009170000_arena_gif_proxy_budget.sql; new supabase/tests/081_arena_gif_proxy_budget.sql; and this report. Existing unrelated Crew files, scripts/dev-local.mjs, scripts/local-supabase-env.mjs, uncommitted Crew migration/test and ANDROID_LOCAL_DEVELOPMENT.md remain excluded.
