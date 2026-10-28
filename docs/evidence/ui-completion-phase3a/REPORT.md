# UI Phase 3A — device and Metro recovery

25 October 2026. **Device/Metro recovery: PASS. Current committed UI execution on the phone: BLOCKED / not established.** No native acceptance pass is claimed.

Original checkout: `C:\Users\91962\Desktop\Clash`. Branch `arena-ui-review`; HEAD **6d677144df7349bc798cba7cc13a738ac9767500** (Phase 2). Phase 1: `d5268ccca2307a452302396f445d33a0b174e425`. Read `.clinerules` and the Phase 3 report. No application source was changed.

## Actual checks and actions

| Check | Result | Evidence |
|---|---|---|
| ADB installation/server | PASS | SDK platform-tools ADB 1.0.41, build 36.0.0-13206524. No server initially existed. Bounded `adb start-server` succeeded; no kill-server/restart. |
| Exact phone / authorization | PASS | One authorized Samsung **SM-A505F**, Android 11 / SDK 30; unlocked before launch. Serial is withheld; its SHA-256 is in recovery.json. |
| Existing installation | PASS | `com.clash.v2.dev`, version 2.0.0 / code 1, debuggable. Existing `com.clash.v2` was not launched or changed. No APK build/install. |
| Development preferences | PASS | Existing `debug_http_host=localhost:8081`. Before/after preferences SHA-256 identical: `2a97bb04c0ed8043fb8122aee899cf566400558a8e4e9f6bb1db4a3d778f6fc6`. |
| Single Metro / project identity | PASS | No Metro 8081/8083 initially. One hidden process started from this original checkout, PID **10428**, using installed Expo CLI. Actual listener **127.0.0.1:8081**. No second Metro. |
| Runtime isolation / watching | PASS for configuration | Clean allowlisted Windows environment, **CI omitted**, `EXPO_NO_DOTENV=1`, offline/telemetry flags, development variant, one worker. Inherited backend overrides excluded. No .env rewrites or cache reset. Watcher configuration is verified; source-change invalidation was not tested by modifying files. |
| Fresh host Android bundle | PASS | HTTP 200; **23,775,386 bytes**, SHA-256 **cb447b761856c6015caddac951862753f255925c352595565391c06f56254804**. Contains current Settings copy, Membership unavailable, Course progress and View preview. See host-bundle.json. |
| Compiled backend route | PASS | Inlined configuration decoded internally: **http://127.0.0.1:55471**, existing anon-role key. Quarantined project reference absent. Production client takes this environment URL; no shared fallback was introduced. Key never printed. |
| Live isolated backend identity | BLOCKED | No listener on 55471. **e357-ce48b72fd636 is historical configuration provenance, not a newly verified running backend.** No backend was started, queried, changed or replaced with shared 55321. |
| USB routing | PASS | Initial reverse list empty. Added only `tcp:8081 → tcp:8081` and `tcp:55471 → tcp:55471`. These remain for the requested recovered development setup; no shared 55321 mapping added. |
| One safe app launch / actual UI | PASS for rendering only | One VIEW intent to the existing development client for localhost Metro 8081. Private native screenshot and successful bounded hierarchy dump. Hierarchy belongs to `com.clash.v2.dev` and contains CLASH, Arena, Home selected, Live, Groups, Discover and Enter Demo Arena. No controls tapped or credentials submitted. |
| Fresh phone delivery / executed revision | BLOCKED | The 60-second launch observation did **not** record an Android-classified HTTP 200 bundle event. Rendered UI alone cannot distinguish cached JS from the newly verified host bundle. No second launch/retry was performed. |

## Delivery investigation and limits

The first verification attempt ran before startup completed. Metro subsequently returned `packager-status:running`. A short direct-entry request timed out after 45 seconds during compilation, and the longer manifest/bundle operation exceeded its 240-second bound. Compiler progress later reached completion; a final bounded direct Expo Router Android request returned HTTP 200 and passed the markers/configuration checks above. No compiler error or confirmed cache corruption was established. The Sentry plugin warned about missing build-upload organization/project configuration; no credentials were added.

The trace recorded one completed bundle response classified as non-Android. It did not provide a fresh phone response during the launch window. Its narrow okhttp/Dalvik user-agent classifier can also miss other clients; **absence of a classified event is an evidence gap, not proof that the phone made no request**. No raw request headers or connection secrets were logged. A later controlled reload with complete request attribution is needed to prove current phone bytes and execution. This report does not substitute host compilation or an existing painted Arena frame for that proof.

No authenticated route, real-data UI, new session, fixture, discussion, message or purchase was exercised. The offline-looking empty Home text is not a verified server-derived empty result. Backend-backed acceptance remains blocked by the unavailable isolated service, separately from the phone-delivery evidence gap.

## Evidence, preservation and stop state

Sanitized evidence: [recovery.json](recovery.json), [host-bundle.json](host-bundle.json). Raw screenshot, hierarchy, compiler output and bundle remain **ignored and private** under `.expo/ui-completion-phase3a-20261025/`, with inherited NTFS permissions removed and access granted to the Windows owner and SYSTEM. No screenshot or device log is published.

Metro remains available on normal 8081 with the verified isolated route. Saved device development preferences were not edited. No reinstall, clear-data, permission changes, native rebuild, backend operation, fixture, explicit authentication operation, source edit, commit, push, merge or deployment occurred. SDK startup may perform ordinary local session hydration; authentication-storage byte identity was not claimed or inspected.

The tracked/staged tree remains clean. All **1,684 pre-existing untracked files** were preserved byte-for-byte; the final preservation check excludes only the new Phase 3A report/evidence paths. Original ordered-status SHA-256: `39f8a281e87d2a9fb586828b2331bae532755292fb003f2a3ad9ac2ac69a82e3`; original content-manifest SHA-256: `a0d0208dbacf5cc1c57eeecbcae3efe8ba86a4096617add293922fd5ea4f3ab7`.

**STOP:** A50 and single Metro recovered; host bundle verified. Fresh device-delivered revision and live isolated backend identity remain prerequisites for resumed native acceptance. No broader UI testing or backend recovery was initiated.
