# Phase 3.1 -- Canonical Arena Live completion checkpoint

## BLOCKED -- stopped on a fresh migration prerequisite

Date: 2026-10-14. Branch `feat/arena-v2-editorial-ui`; baseline `e17071f6b240c1d89fe3f33437d7d8b74fada334`. PR #65 must remain DRAFT. **This phase is not complete and must not deploy.** The original Arena Live audit was read before edits.

The final fresh replay failed at `20261014122051_canonical_arena_assist_rpcs.sql`, statement 12:

```text
ERROR: must be owner of table objects (SQLSTATE 42501)
create policy "selected fighter may read private assist media" on storage.objects ...
```

Read-only evidence from that disposable database confirms `storage.objects` owner **supabase_storage_admin**, while migration role postgres does **not** have owner-role USAGE. Ledger count was **103**; private-assist table absent after the failing migration rolled back. The CLI printed 104 attempted filenames, which is **not** 104 successful migrations. No role grant, ownership transfer, broad Storage policy, RLS weakening or ledger repair was attempted. Implementation stopped at this prerequisite as requested.

## Isolated environment and preservation

Created task-owned Compose project `clash_p11bind_arena31_20261014`, nine containers, dedicated network and three volumes; only database/gateway published at **127.0.0.1:57722/57721**. Actual HostConfig labels/bindings and Windows listeners verified before SQL. Reused the reviewed Compose generator/vendor templates from the existing Step 5R worktree at C:/p11boot. Immutable images come from the existing reviewed images.json: PostgreSQL 17.6.1.002, Auth v2.179.0, Storage v1.26.5, Realtime v2.47.0, PostgREST v13.0.6 and the pinned gateway descriptor. Fresh disposable JWT/API secrets; reviewed development-only managed DB passwords; owner/SYSTEM/Administrators private scratch ACLs. No inherited backend URL or project link was used.

Initial setup applied the branch's **102** migrations successfully with CLI **2.40.7**; managed Auth/Storage/Realtime bootstrap and required extension/restricted-role checks passed. Application source files were untouched by preparation. The older reviewed redundant-pgcrypto transformer initially rejected the current working bytes. Offline comparison proved the current migration differs from its frozen blob only by BOM removal/checkout line endings; the original exact-hash transformer was used against the reviewed blob, producing only a disposable artifact with an extension identity assertion. Current sources contain no leading BOMs. No historical source migration was rewritten.

Assist migrations were then developed incrementally in that disposable environment. A draft supported-media enum expression and deadline recheck were updated there without a ledger repair; consequently those results alone were not accepted as fresh-install verification. The initial test stack was cleaned up and the **final 104-file source/artifact set replayed on empty task-owned resources**, exposing the Storage ownership failure above.

Both task-owned environments have now been cleaned up. Container/volume/network inventories matched their pre-existing baselines after each cleanup. Existing development Supabase data/ledger, hosted projects, Windows Credential Manager credentials, primary `.env` files and unrelated files were not modified. **No connection was made to quarantined hosted project zrutlrhhvfcsmssjiijl or any other hosted database.**

## Actual workflow evidence

The initial environment used three real Auth accounts and SDK sessions, ordinary non-fixture Take creation and actual RPCs/REST/WebSockets. Account passwords/keys were never printed or committed. [Initial authenticated results](evidence/arena31/initial-auth-workflow.json) contains **15 PASS groups** from the successful integrated run. Earlier failed harness iterations are listed below; no component test is substituted for this evidence.

| Workflow | Result and exact scope |
|---|---|
| Take -> Challenge -> Acceptance | **PASS initial disposable environment**: A create_take, B create_arena_challenge, concurrent A resolve_arena_challenge calls. Wrong recipient denied. |
| Canonical graph | **PASS**: duplicate acceptance returned identical IDs, exactly one Clash/linked Room for that Take, exactly A/B as debaters. No new engine. |
| Fighter arguments / duplicate request | **PASS**: both fighters submitted actual arguments; concurrent same-key submit_arena_official returned one ID; altered payload denied P0006. |
| Spectator access | **PASS**: C watched; official submissions denied before and after membership, 42501. |
| Crowd / recovery / discovery | **PASS**: actual spectator Realtime message delivery, disconnect gap recovery and canonical LIVE Room discovery. Full foreground/device reconnect not claimed. |
| Judging / verdict | **PASS** with explicitly controlled test clocks in the disposable DB: fighter ballot denied P0005 by submit_judgement, C cast A, concurrent settlement returned identical verdict and exactly one verdict row; closed Crowd denied. No legitimate record's clock was changed. |
| Private text assists | **PASS incremental initial DB only**: concurrent same-key send, altered payload denial, selected fighter access, sender/raw REST and other fighter denial, accept/reject, explicit idempotent official publication. **BLOCKED final fresh migration verification.** |
| Private image assist | **PASS incremental API/Storage only**: actual PNG upload/completion, selected fighter signed/read exact bytes, other fighter signing denied; explicit accepted publication used a fighter-owned public copy, original owner/visibility remained private. **No native playback claim.** |
| Video arguments | **PASS upload/completion/submission/HTTP bytes** using MDN CC0 flower.mp4 (1,128,375 bytes, SHA-256 0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451). **Native playback/decoder not tested.** |
| GIF submission/picker | **BLOCKED / not executed** in new environment. Existing GIF path is Tenor/arena-gifs, not generic GIF uploads. The disposable harness does not run the GIF Edge function/provider configuration. No fake GIF or production provider credential was used. |
| Publication after response loss | **PASS controlled service**: stable official key and cached copied media ID retained; one upload across retry; account switch/late response denied. Not a native test. |
| Media processing | Actual complete_media_upload verified Storage existence and marks ready. No transcode/scan job or background processing stage exists in this flow; none was fabricated or claimed. |
| Android canonical Stage/Crowd/picker/keyboard/themes | **NOT TESTED**: A50 was connected, but no isolated bundle/account was loaded before the final migration prerequisite failed. No existing device session or app data was cleared. |
| Phase completion / deployment | **BLOCKED** by Storage ownership. No merge, deployment or ready-for-review action. |

## Draft implementation (not release-verified)

- `20261014121857_canonical_arena_private_assists.sql`: separate moderation enum label, so it commits before RPC definitions use it.
- `20261014122051_canonical_arena_assist_rpcs.sql`: one private assist inbox table; recipient-only caller-bound SELECT RLS; no direct client writes; canonical source/Room/safety/window assertions under existing parent locks; five sends/minute serialized per actor; stable-key same-payload retries; accept/reject; explicit publication via existing submit_arena_official; report/hide and explicitly staff-only reported-content review. GROUP rooms are not repurposed.
- The selected recipient can sign a private media object for 60 seconds through a narrowly scoped Storage SELECT policy. **Installing this policy is the blocker, not a reason to grant postgres broad ownership.** Existing uploader access to their original asset remains. No public transcript row is created on assist send or acceptance.
- Accepted media is explicitly copied to a new fighter-owned public upload before official publication; private original ownership/visibility never changes. Pending copy/request metadata is account-scoped and retained across response loss.
- `arenaAssistService.ts` and `PrivateAssistPanel.tsx`: spectator A/B selection, text/photo/video picker, private inbox, accept/reject/report, explicit publish, bounded listing, existing MediaViewer, account-keyed remount and guarded async calls. Inbox refresh uses bounded polling, not a new public Realtime publication.
- Non-default local origins now have disjoint Auth storage keys; the existing 55321 development key and hosted key remain unchanged. This was necessary to prevent a disposable phone session overwriting the existing development session. Unit-tested; not exercised on device.
- `090_canonical_private_assists.sql` avoids pending 084-089 collisions. Final source includes cross-identity, blocks/mutes, quota, moderation, GROUP and cancelled/removed-source cases; see executed/blocked status below.

## Commands / tests actually run

- `supabase.exe --version`: **2.40.7**; `supabase.exe migration up --help` inspected.
- Private ignored `prepare.cjs`, `lifecycle.cjs create/db/bootstrap/runtime`, `migrate.cjs`: current branch artifacts, pinned managed bootstrap and exact loopback target. CLI migration invocation: `supabase.exe migration up --db-url postgresql://postgres@127.0.0.1:57722/postgres --workdir <private disposable root>`. Development-only PGPASSWORD and PGSSLMODE=disable supplied only in the isolated subprocess environment; passwords never URL/arguments. This local-only setting was never applied to hosted TLS configuration.
- `node scripts/arena-canonical-e2e.cjs .expo/arena31-20261014-prepared`: final integrated initial-stack run **15 PASS groups**, exit 0. Real authentication, REST, Realtime, Storage and SQL fixture-clock setup.
- Earlier workflow attempts failed because the test clock subprocess lacked password forwarding, a repeated identical Take correctly hit the duplicate guard, and the fighter-vote assertion expected P0001 while the actual submit_judgement contract returned P0005. Corrected harness, reused three accounts, resumed verdict then ran a complete unique-Take flow. Failed iterations were not counted as passes.
- Initial new pgTAP suite: **37/37 assertions passed**, rollback fixtures, initial stack only.
- Expanded pgTAP run: **44 assertions, 43 passed / 1 failed**. The failed assertion counted all private rows rather than its own Room (have 4, want 1). Corrected source to Room scope; added three GROUP/terminal assertions afterward. **Final 47-assertion suite was NOT RUN**, because fresh migration stopped first. No SQL security pass claimed for final source.
- `node scripts/assist-service-check.cjs`: **8/8**, controlled transport. Tests persisted retry keys, pre/post account switch checks, strict cursor payload, one copied media upload across lost responses, cache cleanup, signed TTL, response/report RPCs.
- `node scripts/duel-render-smoke.cjs`: **22/22**, native modules/auth/media bridged; no physical behavior asserted.
- `npm.cmd run test:unit`: **474 passed, 0 failed/skipped**, 120 suites (includes the added local-origin isolation regression).
- `npx.cmd tsc --noEmit`: **exit 0** on final working code.
- `npx.cmd expo-doctor`: **18/18 passed**, exit 0.
- Final fresh migration replay: **FAIL**, 103 ledger entries; migration 104 rolled back. Runtime startup, final full SQL/concurrency and native checks were then blocked. No automatic retry/repair after this failure.
- Scoped `cleanup.cjs`: **PASS** both stacks, nine owned containers removed, existing container/volume/network inventory unchanged.

## Security and remaining prerequisites

Resolve private-media access installation through a separately reviewed supported managed-owner migration path or an entitlement-aware signing endpoint. Do not transfer storage.objects ownership, add blanket grants or weaken policies simply to make the migration pass. The managed initialization/runtime difference between the successful incremental policy install and failed fresh replay remains to be explained; no unsupported explanation is asserted as fact.

Already-issued signed URLs may remain usable for up to 60 seconds; block/removal stops new signing, not bytes already delivered. Public copies created by an explicit publish action can remain orphaned if a later official write fails; no job currently reconciles these uploads. Staff review is limited to reported assist metadata/body; media review needs an explicit trusted operator workflow. Native retry/picker/playback, private video signing, GIF/provider flow, full concurrent visibility-change testing and final clean SQL replay remain unverified.

Do not interpret the initial test passes as final release validation. **Stop here for the ownership prerequisite review. PR #65 stays DRAFT.**

## Commit scope at stop

Only the independently tested local Auth storage-key correction and this sanitized audit/evidence are committed. The private-assist migrations, service, UI, SQL suite and workflow/service harnesses remain uncommitted local drafts. They are not part of the pushed candidate and must not be deployed. Existing unrelated untracked files remain untouched. PR #65 was confirmed open, DRAFT and unmerged at final verification.
