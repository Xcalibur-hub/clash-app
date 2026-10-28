# Phase 4C — authenticated Samsung acceptance checkpoint

**BLOCKED: owner-entered fictional login is pending. Phase 4C acceptance is incomplete.** This is a resumable checkpoint, not a native acceptance pass. No source fixes or commits were made.

Original checkout: C:\Users\91962\Desktop\Clash. Branch arena-ui-review; unchanged HEAD 9bad8b0b51ffd1bab5975ceb72f7c75a487d798f. Recorded 2026-10-26T16:25:49.648Z.

## Verified routing, device and bundle

- QA gateway 127.0.0.1:55481 identity matches clash-ui-qa-phase4a. Auth health, authorized REST query and authorized Storage bucket discovery returned HTTP 200 before device routing.
- Same PostgreSQL system identifier 7700622043081482277. Application migration count 111; managed Storage/Auth/Realtime counts 74/82/88; cron off. All 111 source and QA-copy file hashes match the frozen manifest. Exact full ledger-content verification remains the accepted Phase 4B evidence; this phase rechecked counts and identity, not a fresh full security audit.
- Authorized serial RZ8M30DE9NL, Samsung SM-A505F. Installed DEBUGGABLE package com.clash.v2.dev, versionName 2.0.0, versionCode 1. No native installation, rebuild, data clearing or permission change.
- Original Metro PID 10428 served the older 55471 configuration. Its actual command/project and current public bundle were inspected, its public client configuration saved, and only that verified process stopped. One replacement QA Metro PID 10920 runs on 127.0.0.1:8081, original checkout, dotenv disabled, CI unset, development variant, one worker, matching QA anon key. No server-role key, JWT signing secret, DB password or root key was passed to Metro or found in the inspected host bundle.
- The first readiness window was too short: Metro eventually opened its listener and built without another restart. Startup also warned about manifest asset resolution and an event-target-shim export fallback. No cache reset or source change was performed.
- Only USB reverses 8081 and 55481 were added; original reverse list was empty. No shared 55321 route or E3.5.7 connection was used.
- Host bundle HTTP 200: 23,779,003 bytes, SHA-256 a8f9cac71fcd837188bad8c8cb425b9b8fcc60ac554e076163bf2a4f11bfcc28. Actual Android-origin bundle request HTTP 200: 23,780,063 bytes, SHA-256 5579513c90288b0534e32b397e4d9ccca003894ab48eeee22250d29f47a852b3. The device's BridgelessReactNativeDevBundle.js was read and independently verified to contain 127.0.0.1:55481 plus the matching QA anon key. Differences between host/device bundle hashes are recorded rather than treated as byte identity.
- Actual onboarding rendered, its exact Skip control was pressed, guest Arena rendered, and normal Profile -> Sign in navigation was exercised. This proves current bundle delivery/execution and guest navigation, not authenticated application behavior. [Execution evidence](phone-execution.json), [host bundle](host-bundle.json), [USB routes](usb-routes.json), [preflight](preflight.json).

## Secure login blocker

The normal app sign-in screen is open. A foreground Windows Forms dialog shows fictional A's credentials only to the owner, with password masking/hold-to-reveal, capture exclusion and no clipboard/terminal/ADB credential entry. Its password is stored owner-bound with Windows DPAPI in ignored local evidence. The dialog remains open for owner-controlled completion.

No login fields were captured or read after opening that screen. The last read-only Auth observation found only A's signup-created session, no phone-user-agent session. It does not establish authenticated phone requests. Owner confirmation is required before further phone interaction. [Auth status](authentication-status.json).

## Prepared fictional fixtures — retained, not cleaned

All creation targeted this QA gateway through actual authenticated application RPCs. Names/text explicitly identify fictional QA content. No clock/status rewriting, entitlement purchase, manual RLS bypass, service-role content insertion or fake result was used.

| Category | Exact IDs |
|---|---|
| A auth/profile | 5245a931-e195-412f-8223-dabc34c66fc9 / u_5245a931e195412f8223dabc34c66fc9 |
| B auth/profile | d2af864c-ce5b-4e72-a9ff-5ff56586f522 / u_d2af864cce5b4e72a9ff5ff56586f522 |
| C auth/profile | 0779d399-1b26-47d2-be10-a65f924c568d / u_0779d3991b2647d2be10a65f924c568d |
| Takes | take_15ae4959a6b2a21e, take_3258759249aefce6, take_a6a18963cd26886e |
| Reply / nested reply | c_6c3a6976aede1098, c_3d784ddb7a98f4d4 |
| Community | ac_08433d0e2f9693fd, slug qa-repair-1d1e36 |
| Vault | v_a93552e1a94a3538 |
| Empty collection | vc_954bfedaebd5b811 |

A owns the community, B joined through join_arena_crew, and A followed B through follow_profile. Three profiles were named through their authorized own-profile updates. Creation RPCs: create_take, create_comment including a parent reply, create_arena_crew, join_arena_crew, follow_profile, create_vault, create_collection. [Complete fixture manifest](fixtures.json).

No timed duel/challenge has been created while awaiting owner login. No completed Clash/verdict or archived Take was fabricated. Crew channels/discussion creation is unsupported by the existing Crew API. Vault and collection are honest empty containers, not populated-content acceptance; free published media/content, Play creation and paid entitlements have not been prepared or verified. B/C passwords were not retained; native role-switch tests need a separately reviewed secure account-entry arrangement without changing these accounts.

## Native coverage matrix

| Journey | Result and actual limits |
|---|---|
| Current QA-only bundle execution | PASS, actual request, cache and native rendering |
| Onboarding -> guest Arena | PASS for Skip and guest navigation only; full signup/onboarding NOT TESTED |
| Profile -> normal sign-in | PASS navigation; credentials entered by owner only |
| Phone login and session restoration | BLOCKED pending owner login; no native Auth request proven yet |
| Authenticated Arena For You / Following / Popular / Fresh | BLOCKED pending login; guest successful-empty screenshot predates fixture creation |
| Take details, nested replies, reactions and author/profile navigation | NOT TESTED; API-created fixtures are not native evidence |
| Live fighter/spectator Stage, assists, result | BLOCKED: no canonical duel created yet; completed lifecycle not fabricated |
| Groups membership/discovery | NOT TESTED on-device with accounts; RPC setup succeeded |
| Group channels/discussions | BLOCKED: unsupported existing API |
| Explore populated/empty/error/retry | NOT TESTED in this phase |
| Play detail/access | BLOCKED populated fixtures; native route NOT TESTED |
| Vault creator/collection/content/wins/entitlement states | NOT TESTED; empty Vault/collection fixtures only |
| Settings/themes/keyboard/reduced motion/touch geometry | NOT TESTED in this phase |
| Public Realtime on Samsung | NOT TESTED; Windows Phase 4B evidence is not device evidence |
| Authorized private Room/Meet subscriptions | BLOCKED without canonical fixtures and authenticated native session |

No new UI defect has been confirmed sufficiently to justify source edits. No TypeScript/unit/native regression pass is claimed: no source change was made. Historical Phase 4B private-channel timeout/disposal limitation remains open; this phase has not joined private channels or allowed retry loops.

## Screenshots, preservation and rollback

Two actual A50 screenshots, both 1080 x 2340, remain private under .expo/ui-completion-phase4c/: 01-qa-launch.png and 02-guest-home.png. Matching hierarchy XML is private there. [Dimensions/hash manifest](screenshots.json). They were not edited, uploaded or copied to Gallery. Status-bar indicators are not redacted, so publication is not approved. No authenticated screen screenshot is claimed.

All 1920 original untracked file hashes and both original environment-file hashes still match. Tracked/staged tree is clean. Frozen migrations are unchanged. Existing application auth storage is isolated by origin/port: this QA target uses its own 55481 auth key, not shared/E3.5.7/hosted keys. No old account was signed out or reset.

**Rollback is prepared but deliberately pending while the owner signs in.** QA Metro/routing, protected credential dialog and fixtures remain available; original Metro target has not yet been restored. Saved local baseline: .expo/ui-completion-phase4c/baseline.json, prefs-before.xml, reverse-before.txt, original-public-client.json. The reviewed helper's restore action stops only the identity-verified QA Metro and restores the original public-client target on 8081; it does not access E3.5.7 services. Restore only task-added reverses and the exact dev-client preference bytes after closing the test app. Do not run the normal dev-local script: it would target shared 55321.

Fixture cleanup is also pending by design. After acceptance, revoke/sign out only these QA sessions; remove owned replies/Takes, follows, Crew memberships/community and collection/Vault in dependency order through supported operations where available. For missing deletion contracts, review an exact-ID QA-only cleanup first; do not guess FK order or delete by broad prefixes. Auth deletion alone leaves orphan profiles, so remove only verified fixture profiles after references are resolved. Preserve fixture IDs and audit evidence. No automatic cleanup, restore or additional fixture run is scheduled.

**Next action: owner completes fictional A login using the protected desktop dialog and confirms success.** Then verify the corresponding phone Auth event and resume actual authenticated UI testing before creating any timed canonical duel.
