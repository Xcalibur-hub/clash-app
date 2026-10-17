# Arena Groups + Live integration — 17 October 2026

Follow-up: [physical A50 review](ARENA_PR70_ANDROID_REVIEW_20261017.md) detected the phone and verified guest navigation, but the native cold-launch gate failed on onboarding and the existing backend was unreachable. The results below remain the original automated-validation snapshot.

**Automated checks: PASS. Native Android preflight: BLOCKED (no connected device).** This is an integration candidate, not a production-readiness determination.

Branch: `integration/arena-groups-live-20261017`. Exact starting commit and target branch head: `76bf0bf0d3c54e8ec92311dcd878dd2ef8711bae` / `integration/arena-approved-baseline-20261016`. Isolated worktree: `.expo/arena-integration-20261017`. The primary checkout remains on its existing branch with its unrelated untracked files intact.

## Cherry-pick provenance

All five relevant implementation commits were cherry-picked in order, without conflicts or merge commits. Source PRs #67, #68 and #69 were checked through authenticated GitHub metadata and remained OPEN/DRAFT/unmerged.

| PR | Original commit | Integration commit |
|---|---|---|
| #67 | `f1d6a3666fe73a0908661e76c0171054f06d85f5` | `efb25f74fa5febf9b2b7e232dd7c516b7da6069f` |
| #68 | `e211201f4c53bc6881ac94c712b7d400e4409a54` | `0965baf9e9d2d6da3ac5d0a91f794678cc960806` |
| #68 | `9c971772e58291c9b08b98d24bcf6de042f479bf` | `4afc6d66fbc3a3d5a21d18a275a8aebd995f134f` |
| #68 | `2cb012535dc13050e5ba32334591f1c04cffd992` | `9cedff68a7d3d4bded6435ef27a4a465ee5eee52` |
| #69 | `1224bca33de07e21d0d9dbd021686ceded04bf68` | `e686dc59a491c0780f3995f3a3857d5ba2b2cce8` |

Implementation snapshot tested: `e686dc59a491c0780f3995f3a3857d5ba2b2cce8`; the final documentation commit adds only this report and sanitized evidence. No integration-specific application changes were necessary. PR #69 resolves the earlier unsupported `fontWeight: '750'` baseline error using the approved `'700'` correction.

## Scope and preservation

All **19 source files** have the identical Git blob IDs as their corresponding source PR heads. See [scope and file list](evidence/arena-integration-20261017/scope.json).

- Groups: `ArenaCommunity.tsx`, the three existing Crew screens, and five files under `components/arena/groups/`.
- Live: canonical Room route plus eight files under `components/liveArena/`, including the new style tests.
- TypeScript correction: `components/arena/TakeFeedItem.tsx`, exactly the source PR's one-line change.
- Integration reporting: this document and four small evidence JSON files.

No changes to World/Explore, Vault, Supabase, services, engine, auth, global theme, native configuration, dependency manifests or unrelated files. No shared or hosted database operations, fixture creation, Android installation, permissions changes, app-data clearing, merge or deployment. Existing dependencies were reused through an ignored node_modules junction; nothing was installed.

## Exact validation results

| Command/check | Result |
|---|---|
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run test:unit` | PASS, 500 tests / 126 suites, 0 failed/skipped, exit 0 |
| `node --test components/arena/groups/GroupDiscovery.test.cjs` | PASS, 8 tests, 0 failed/skipped, exit 0 |
| `node --experimental-strip-types --test components/liveArena/liveArenaStyles.test.ts` | PASS, 8 tests / 4 suites, 0 failed/skipped, exit 0 |
| `node node_modules/expo-doctor/build/index.js` (1.20.4) | PASS, 18/18 checks, exit 0 |
| `node scripts/duel-render-smoke.cjs` | PASS, 22/22 controlled render scenarios, exit 0 |
| `node scripts/assist-service-check.cjs` | PASS, 10/10 controlled service checks, exit 0 |
| `node scripts/assist-signer-check.cjs` | PASS, 14/14 mocked signer checks, exit 0 |
| `node scripts/crowd-service-check.cjs` | PASS, 7 reported controlled service checks, exit 0 |
| `node --test scripts/android-bundle-preflight.test.cjs` in the primary checkout | PASS, 14 launch-harness tests, exit 0; existing untracked helper left unchanged |
| Native Android bundle-preflight CLI | BLOCKED, exit 1, `launch_gate_prerequisite_failed`, stage `device_connection` |
| Expo development Android JavaScript export | PASS, exit 0; one bundle, 10,583,813 bytes |
| Source-PR blob/scope verification | PASS, 19/19 files identical |
| `git diff --check` | PASS, exit 0 |

The full configured unit command plus the two new component suites ran **516 tests**; additional controlled render/service/harness checks are listed separately, not counted as device or database evidence. No pgTAP or live backend tests were run or implied. The first scope-inspection helper had an incorrect directory regex; it was corrected to validate the intended exact files/prefixes, and the full blob comparison then passed. No application code or assertions were weakened.

See [result summary](evidence/arena-integration-20261017/results.json).

## Android bundle distinction

`adb -d get-state` failed with `no devices found`; repeated `adb devices -l` showed an empty list. The owner was asked to connect/unlock the A50; none was available during validation. The reviewed gate was actually invoked in `arena` mode and stopped before reading/changing device preferences or making a bundle request. [Native gate evidence](evidence/arena-integration-20261017/android-preflight.json).

As a separate compile check, the candidate ran:

```text
node node_modules/expo/bin/cli export --platform android --dev --no-bytecode --max-workers 2 --output-dir .expo/integration-validation/android-export
```

The launcher used a clean child environment, disabled dotenv autoload, checked that public backend configuration referred only to the existing loopback 55321 backend, and enabled the two reviewed development diagnostic flags. This was a local JavaScript export, not a backend request or deployed/native build. The resulting bundle contains both integrated Groups and Live markers. SHA-256: `f5e78b72ec4a73b16dcf75d5752c0cdb603110da56c9d093e8ea01297987b6c3`. [Bundle evidence](evidence/arena-integration-20261017/bundle-evidence.json). Bundle/assets and public configuration remain ignored, not committed.

The exporter warned about debugging without Hermes bytecode and missing Sentry build configuration; neither was treated as a native pass or suppressed. No phone or normal Metro configuration was changed, and no persistent diagnostic Metro server was started.

## Remaining device and integration gates

1. Connect/unlock the A50 and run the real 8083 launch gate: actual phone-originated request, bundle served/executed, and usable CLASH hierarchy. Prior 3.2M results are not results for this candidate.
2. Review Home/Groups/Live navigation and light/dark appearance, narrow-width and enlarged-font layout, safe areas, dock overlap and keyboard behavior.
3. Verify canonical Fighter A/B and spectator states, public Crowd, private assist inbox/recipient isolation, image/video picker and playback, retries and exactly-once publication against separately authorized isolated accounts/backend.
4. Review reduced motion, phase/role announcements, focus order and touch targets. Arena Home's earlier accessibility-idling limitation is not resolved by a successful static export.
5. Crew-scoped discussions, pins and live-duel relationships remain unavailable in the current Crew API; the Groups PR's honest omission remains preserved.

Keep the integration PR DRAFT. No PR was merged or application deployed. Native/runtime security, media, and complete real-account end-to-end behavior remain unverified.
