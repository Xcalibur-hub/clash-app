# Arena Live V3 end-to-end audit -- 2026-10-14

Branch: `feat/arena-v2-editorial-ui`; starting HEAD `949f0da0daa823516a96a8c7a8432937e3d9c331`. PR #65 was confirmed DRAFT. Overall result: **BLOCKED for complete end-to-end acceptance**, with passing local security/runtime checks and focused correctness fixes. No hosted Supabase connection was made, including quarantined project `zrutlrhhvfcsmssjiijl`.

## Environment and safety

Local Supabase `supabase_db_clash`, PostgreSQL 17.6, gateway 127.0.0.1:55321, database container 55322. Migration ledger: 101 applied; repository has one additional index-only migration `20261014100000_arena_discussion_paging_indexes.sql`. It was **not applied**. No reset, replay, deployment or migration-history change occurred.

Samsung A50 `RZ8M30DE9NL`, app `com.clash.v2.dev`, connected and accessible. Existing ADB reverse mappings 8081/55321 present. Metro manifest confirmed the primary repository root and development bundle. `.env.local` selects loopback; the physical app displays LOCAL. Hosted URLs present in another environment file were not used for tests. Existing Docker services publish wildcard addresses; that pre-existing exposure was observed, not reconfigured in this audit.

Primary checkout began with only unrelated untracked `Microsoft/`, `shot.png`, `sybil.html`, `sybil/`; these were preserved and excluded from commits. No account reset, app-data clearing, native rebuild or permission changes occurred.

## Workflow matrix

PASS in a specific layer is not a full native end-to-end pass.

| Workflow | Result | Executed evidence / limitation |
|---|---|---|
| A creates Take through ordinary authenticated app flow | BLOCKED end-to-end | Runtime harness creates a marked fixture through trusted setup; no native composer submission was performed. |
| B challenges / A accepts | PASS rollback SQL; BLOCKED full Auth/UI path | Suite 056 exercised actual RPC authorization, acceptance, retries and graph constraints. An Auth runtime attempt against a marked fixture failed P0003; migration 20261008151000 deliberately prohibits fixture challenges. Guard preserved; failed experiment reverted. Requires a separate isolated database for ordinary test Takes. |
| Exactly one canonical Clash and linked Room | PASS local runtime + SQL | Two concurrent trusted same-key create RPCs returned identical IDs; one row in each table. SQL 054/056 verify graph/fighters. Trusted setup is explicitly not challenge acceptance. |
| Both fighters submit official text | PASS local Auth/REST | Existing runtime check posts both fighter arguments. New concurrent authenticated submit_arena_official calls return the same message ID; altered same-key payload rejected P0006. |
| Images / videos / GIFs | BLOCKED complete end-to-end | SQL/schema/controlled component checks run, but actual upload -> processing -> ready media -> native picker/playback was not exercised. Requires safe owned ready media fixtures and an isolated signed-in fighter device session. No upload or playback pass claimed. |
| C watches / spectators cannot impersonate fighters | PASS local runtime + SQL | Joined spectators, official post denial 42501, member/outsider permissions, private typing spoof denial. |
| Crowd chat | PASS local Auth/REST/Realtime | Two independent authenticated sessions exchanged actual messages, outsider received none, missed gap recovered, reconnect delivered subsequent event. |
| Votes and reactions | PASS relevant SQL; BLOCKED native/API journey | Suites 025/046/054 cover actual server judging/reaction contracts with transaction fixtures. No real device ballot/reaction was cast on existing records. Fighter backing remains separate from official judging; no claim of persistent social-support behavior. |
| Private assists, accept/reject and permissions | BLOCKED | No private-assist implementation/API in this branch's canonical Room flow. Existing call-backup concepts are not proof of this feature. No new mechanics added. |
| Verdict and terminal lifecycle | PASS rollback SQL; BLOCKED full timed native journey | 054/074/075 test terminal results/history/recovery and idempotent side effects with controlled fixture clocks, not live time passage on a device. |
| Arena -> Live discovery | PASS controlled + partial Android | Canonical goes to linked Room; legacy goes to original Clash; Pending goes to Take. Physical legacy navigation verified; no existing canonical Room available after owned runtime cleanup. |
| Empty/loading/error/retry states | PASS controlled; partial Android | 22 Stage/Crowd render scenarios, 11 navigation checks, 18 challenge inbox checks. Native loading/legacy screen observed; full native error/retry matrix not tested. |
| Reconnect and duplicate delivery | PASS controlled + local runtime | Real disconnect/gap/reconnect; official service tests cover lost response, stable keys/account isolation; runtime covers parallel same-key official submission. |
| Concurrent challenge acceptance / settlement races | BLOCKED full race suites | Existing dblink suites commit fixed-ID fixtures and pre-delete records. Not run against the shared data-preserving local database; need disposable isolated DB. Parallel creation and official submissions did run with fresh run-owned fixtures. |

## Confirmed defects and fixes

1. TypeScript TS1117 in `app/clash/[takeId].tsx`: duplicate `letterSpacing` in eyebrow style. Removed the earlier 0.4 entry; preserved effective -0.7 styling. Final typecheck exited 0.
2. Live discovery called legacy competitions LIVE DUEL despite no linked Room. On A50, Take `devfx_take_open_std` -> Clash `devfx_clash_open_std` has null duel_key and no Room. It correctly opened legacy `/clash/...`, not immersive canonical Stage. Label now uses LIVE CLASH for null roomId, LIVE DUEL for a linked Room; routes unchanged. New actual-component controlled regression checks canonical, legacy and Pending labels/routes (6/6 including loading/error/empty states).
3. Existing navigation test double omitted `useTheme`, now required by ArenaSideRail. Added the dark-scheme mock; all original 11 assertions retained and passing.
4. Extended existing local runtime harness to exercise concurrent same-key trusted canonical creation, exact one-Clash/Room counts, parallel authenticated official submission and altered-payload refusal. Cleanup remains restricted to generated run-owned IDs.

5. Physical reload showed false zero/empty Live claims during "Loading Clashes". Pending/error discovery now shows Checking live / count unavailable and loading/error copy; it does not assert zero or no activity. Added pending/error/loaded-empty controlled render regressions.

No engine, RLS, moderation, deadline, reward, migration, media permission or gameplay change was made. Private assists were not implemented as an audit fix.

## Commands and actual results

- Initial `npx tsc --noEmit` / `npm run test:unit` PowerShell wrappers were blocked by execution policy; `.cmd` attempts in sandbox hit EPERM. Owner-context `.cmd` execution worked without changing policy.
- `npx.cmd tsc --noEmit`: initial TS1117 failure; after fix, **exit 0** (including final run).
- `npm.cmd run test:unit`: **473 passed, 0 failed/skipped**, 120 suites.
- `npx.cmd expo-doctor`: **18/18 passed**, exit 0.
- `node scripts/official-service-check.cjs`: **14/14**, exit 0.
- `node scripts/crowd-service-check.cjs`: **7 PASS checks**, exit 0.
- `node scripts/duel-render-smoke.cjs`: **22/22**, exit 0; native media/animation dependencies bridged.
- `node scripts/settlement-history-check.cjs`: **11/11**, exit 0.
- `node scripts/arena-navigation-check.cjs`: initial missing-useTheme failure; **11/11** after mock correction, exit 0.
- `node scripts/challenge-inbox-check.cjs`: **18/18**, exit 0.
- `node scripts/arena-engagement-check.cjs`: **8/8**, exit 0.
- `node scripts/arena-live-discovery-check.cjs`: **6/6**, exit 0. Initial new-harness syntax and missing useFocusEffect mock errors corrected before final successful run; assertions preserved.
- `node scripts/crowd-runtime-check.cjs`: original real runtime run passed **11 PASS groups**, exit 0. Expanded final run passed **13 PASS groups**, exit 0 (individual groups contain multiple assertions).
- Local pgTAP selected suites: **18 suites / 867 TAP assertions / 0 failed**, all plans matched totals, exit 0. Not the full 83-file directory.

SQL suites executed: 025,026,027,028,029,030,046,049,054,056,058,062,064,069,070,072,074,075. Sanitized per-suite totals: [arena-live-v3-sql-results.json](evidence/arena-live-v3-sql-results.json).

Exact local runner invocation: `node .expo/arena-v3-sql-runner.cjs`. For each selected source file it verified BEGIN/ROLLBACK boundaries and rejected dblink/COMMIT/TRUNCATE/ALTER SYSTEM execution, then sent `BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path=public,extensions;` plus the suite (first BEGIN removed) to `docker exec -i supabase_db_clash psql -X -U supabase_admin -d postgres -w -v ON_ERROR_STOP=1 -At`. The suite's final ROLLBACK also removes test-extension creation. The initial runner stopped before a DB call because leading SQL comments hid BEGIN; comment handling was corrected. No source SQL suite was edited.

Post-run read-only checks confirmed: pgTAP not installed persistently, 101 migration entries unchanged, zero crowd-run fixture users and Takes remaining, and no `.crowd-runtime.json` credential file. Existing data was not reset. Separate dblink concurrency suites were not executed.

## Physical A50 observations

ADB screenshot/navigation commands actually ran. Captures retained locally under `.expo/arena-v3-*.png` rather than publishing screenshots containing unrelated existing users/content.

- Home -> Live chips, real existing discovery cards, legacy Watch Clash route and two legacy fighter cards: physically observed, dark theme.
- Native loading skeleton and subsequent legacy view: physically observed. No votes/messages sent on existing competitions.
- UIAutomator hierarchy capture failed `could not get idle state`; visual screenshots were available. This limits accessibility-coordinate automation claims.
- Metro root verified; existing app showed an older label before reload. An assumed Expo launcher URI was not registered; package inspection showed `clash-dev`. Ordinary React Native dev menu Reload was used instead, without app-data clearing. Final post-reload label confirmation is recorded separately below; do not infer it from the earlier screenshot named live-fixed.
- Canonical Stage, canonical Crowd composer/keyboard, picker, media playback, animation performance, light theme, spectator/fighter account switching on device: **NOT TESTED**. No canonical fixture was retained or signed into the device to fabricate such verification.

## Remaining release risks

Complete native/Auth challenge journey, media processing/playback, assists, concurrent acceptance/settlement, native theme/accessibility/keyboard and production-load behavior remain unverified. Local index migration is pending; no performance claim follows SQL correctness tests. Shared local Docker publication is broader than loopback. Test passes here do not prove hosted effective security or production readiness. Keep PR #65 DRAFT, do not deploy or merge. A disposable test DB and isolated device accounts are the recommended next validation prerequisites.

### Final physical confirmation

The post-reload screenshot .expo/arena-v3-phone-complete.png was visually inspected: both existing legacy cards now display **LIVE CLASH**, with the real two-entry Live listing. The loading-state fix passed controlled tests; a full native error/retry exercise was not performed. The device remains on Arena Live. No existing competition was voted on, reopened, settled or edited.

Fix/regression commit: 059e7d72b6993723e75542f7fa67070598586109. Report/evidence follow in a separate documentation commit on the same branch.
