# UI Phase 3B — fresh execution gate

25 October 2026. **BLOCKED before visual acceptance. No current-revision native pass.**

Original checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`, HEAD **6d677144df7349bc798cba7cc13a738ac9767500**. Read `.clinerules`, product guidance, and Phase 3/3A reports. Tracked/staged tree clean. No app source changes.

## Execution evidence

| Gate | Result | Actual evidence |
|---|---|---|
| Existing device | PASS | Same authorized, unlocked Samsung **SM-A505F**, existing `com.clash.v2.dev`. Serial hash matched Phase 3A. |
| Existing infrastructure | PASS | Reused PID **10428**, loopback Metro **127.0.0.1:8081**; no restart, second server or cache reset. Existing USB reverses 8081/55471 retained. |
| Phone attribution | PASS for connected client identity | Installed Expo `/message` protocol `getpeers` returned exactly one peer: `com.clash.v2.dev`, `SM-A505F - 11 - API 30`. Inspector targets also identified that package/device. No credentials or private headers recorded. |
| Controlled reload | FAIL: diagnostic-origin mismatch | Exactly one `reload` broadcast request sent, protocol version 2. It used Origin `http://localhost:8081`. This installed Expo server constructs its canonical localhost URL as `http://127.0.0.1:8081`; origin validation requires identical host strings. The supplied Origin is rejected. Peer queries do not require the same broadcast trust, so successful peer enumeration did not establish reload authorization. |
| Fresh bundle response | BLOCKED | No recorded bundle completion started during the bounded 90-second observation. No host bundle request was made during that window. The recorder's user-agent classification was not used as the sole attribution gate. |
| Native cached bundle | NOT CURRENT / insufficient for acceptance | Read only the development bundle file `files/BridgelessReactNativeDevBundle.js`. **23,767,663 bytes**, before/after SHA-256 **f469f76b004de28856f060e89b9e4a9501945276bb659079b076d01478d90466**. Unchanged after the request. It lacks all four Phase 1/2 markers: Settings copy “Your account and your experience.”, “Membership unavailable”, “Course progress”, “View preview”. |
| Current host compilation | Historical PASS only | Phase 3A host bundle: 23,775,386 bytes, SHA-256 `cb447b761856c6015caddac951862753f255925c352595565391c06f56254804`, all four markers present. Host and phone bundle variants can legitimately differ in hash; the hash difference alone is not proof of stale code. Unchanged native cache, missing markers and no fresh-response correlation together leave current execution unproven. |
| Actual painted screen | Observed, not acceptance | Bounded hierarchy and native screenshot show Arena Home, with CLASH/Home/Live/Groups/Discover and Demo entry. No route was tested after the failed gate. This does not establish that the frame executes the current commit. |
| Backend route | PASS for cached configuration; service unavailable | Decoded only the nonsecret URL and anon-role status internally from the phone bundle: **http://127.0.0.1:55471**. Existing isolated route preserved; no shared 55321 fallback. Isolated service identity is not newly verified; no backend was started or accessed. |

Sanitized results: [reload-verification.json](reload-verification.json), [environment.json](environment.json).

## Exact control failure and next correction

Installed source inspected:

- `node_modules/@expo/cli/build/src/start/server/metro/instantiateMetro.js`: constructs `serverBaseUrl` with `hostType: 'localhost'`.
- `node_modules/@expo/cli/build/src/start/server/UrlCreator.js`: resolves that hostname to `127.0.0.1`.
- `node_modules/@expo/cli/build/src/utils/net.js`: `isMatchingOrigin` compares `new URL(origin).host` with the canonical server host.
- `node_modules/@expo/cli/build/src/start/server/metro/dev-server/createMessageSocket.js`: refuses broadcasts from untrusted clients, including a failed origin check; peer queries remain available.

A file-free offline call to the **installed** `isMatchingOrigin` returned **false** for the Origin used, and **true** for the exact canonical `http://127.0.0.1:8081`. No origin-check bypass, source fix or service restart is needed. This was an error in my diagnostic request, **not a confirmed application defect**. No successful JS reload is demonstrated. No second reload request was sent.

Next controlled attempt must use the matching canonical Origin, first verify the sole A50 peer, then correlate its response and native cached bytes, followed by actual rendered current-UI evidence. It must preserve this report's failed attempt and not reinterpret it as successful delivery.

## Requested coverage matrix

All entries are **BLOCKED by the fresh-execution gate**, not failed application screens:

| Experience | Result | Limit |
|---|---|---|
| Arena Home | BLOCKED | Existing painted hierarchy captured only; current revision unproven. |
| Arena Live / Groups / Discover | BLOCKED | No taps after gate failure. |
| Demo Arena / Take / duel previews | BLOCKED | Not opened; fixtures not substituted for current execution evidence. |
| Offline Explore modes | BLOCKED | Not navigated. No backend absence relabeled as successful empty content. |
| Vault guest discovery / previews | BLOCKED | Not navigated. |
| Settings / Appearance / Back | BLOCKED | No theme or preference changes. |
| Scrolling / touch geometry / safe areas | BLOCKED for acceptance | Raw existing-screen node bounds retained, not treated as current-source layout acceptance. |
| Dark/light / keyboard | BLOCKED | No settings changes or field interactions. |

**Prioritized confirmed current-UI defects: none established.** The delivery control failure is the blocker; there is no evidence-supported source/UI fix in this phase.

## Captures and preservation

Private native capture: `.expo/ui-completion-phase3b-20261025/00-after-reload.png`; raw hierarchy alongside it as `00-after-reload.xml`. These are **pre-acceptance diagnostic captures**, not verified current-build screenshots. Raw frames may contain system notification indicators, so they remain private and ignored; no screenshot is embedded or published. Sanitized environment.json records only paths, sizes and hashes. No raw account data, bundle bodies, credentials or headers are included in the report.

Private scratch inherits no broad NTFS access; owner and SYSTEM have access. Only new report/evidence files are untracked additions. All original untracked content is preserved and final fingerprints checked excluding this task's report directory. Device development preferences and ADB mappings remain identical to entry. Metro remains on normal 8081. No device settings, authentication operation, source modification, backend operation, fixture, rebuild, reinstall, data clearing, commit, push, merge or deployment occurred.

**Stopped at the failed fresh-execution gate.** Visual acceptance has not begun.
