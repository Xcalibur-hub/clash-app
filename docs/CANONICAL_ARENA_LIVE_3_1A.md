# Phase 3.1A — Private assist Storage migration resolution

Date: 2026-10-14. Branch: `feat/arena-v2-editorial-ui`. PR #65 remains DRAFT and unmerged. Baseline: `130c46d5dca81daef7c18df7070f2fb2863b45db`.

**PASS for the migration correction and tested backend workflow. Native Android and Deno-hosted function verification remain NOT TESTED. This does not complete every Phase 3.1 media/device requirement or establish production readiness.**

## Cause of incremental success versus fresh failure

Both previous installers used CLI 2.40.7 as `postgres`. Ordinary ownership was not the whole explanation: this managed PostgreSQL image has supautils policy grants that let `postgres` create policies on specific managed tables without making it their owner.

The new disposable environment reproduced the difference, using separate connections and rollback-only transactions:

1. A fresh `postgres` connection successfully created a **restrictive USING(false)** Storage policy, then rolled it back.
2. Another connection caught the duplicate-publication error from adding an already-published `arena_room_messages` table. Creating the same restrictive policy afterward failed with `42501`, then rolled back.
3. Before and after service startup, `storage.objects` remained owned by `supabase_storage_admin`; postgres was not a superuser and had neither membership nor USAGE in that role. Startup did not change those properties.

This reproduces the relevant session-history dependency. The pinned [supautils v2.9.4 policy/publication hook](https://github.com/supabase/supautils/blob/v2.9.4/src/supautils.c) elevates allowlisted policy operations and lacks exception-safe cleanup around publication DDL. The previous Step 5F investigation identified its static role-switch state and caught-publication-error mechanism. The C flag itself was not instrumented here; its internal state is source-supported, while the contrasting SQL outcomes are newly observed. Full replay encounters caught publication errors on the migration connection; incremental installation starts a fresh connection. No hook configuration or permissions were changed to obtain success.

[Fresh-session evidence](evidence/arena31a/fresh-policy-hook.txt), [caught-error evidence](evidence/arena31a/caught-error-policy-hook.txt), [ownership inventory](evidence/arena31a/ownership-before-runtime.json).

## Least-privilege correction

The two previously uncommitted assist migrations are now committed:

- `20261014121857_canonical_arena_private_assists.sql` adds the moderation enum value in a separate migration.
- `20261014122051_canonical_arena_assist_rpcs.sql` creates the private inbox, recipient RLS and send/respond/incorporate/report APIs. It **does not create or modify a Storage policy**.

The former path-based Storage predicate/policy is replaced by `arena_private_assist_media_target(assist_id)`. It resolves the caller through `my_profile_id()`, verifies selected-fighter membership, canonical Room and source readability, current block/mute relationships, moderation status, non-cancelled history, ready private media and original sender ownership. Unknown/denied targets return NULL. Anonymous and service-role execution is revoked; authenticated execution stays caller-bound. There is no actor, bucket or path argument to forge. A serialized signing budget limits target approvals to 60/minute; the handler checks twice, allowing at most 30 successful sign operations/minute per recipient.

`arena-assist-media-access` follows the existing Vault/course server-signing architecture:

1. Authenticate the bearer through Auth; platform JWT verification is enabled in `config.toml` as well.
2. Ask the target RPC **as the caller**, without substituting service identity.
3. Use the server-only service key to sign that exact private-media path for 60 seconds.
4. Recheck caller entitlement and exact target before returning the URL. Revocation during signing suppresses delivery.

Input and execution time are bounded. Error responses are sanitized and `Cache-Control: no-store`. No service key appears in the mobile client, response, report or committed evidence. The client invokes the function by assist ID, rather than signing private Storage paths directly. The selected fighter also remains denied direct Storage signing of the spectator's object. Existing uploader-owned access is unchanged.

This uses Supabase's supported [server-side Storage access model](https://supabase.com/docs/guides/storage/security/ownership) and [authenticated function model](https://supabase.com/docs/guides/functions/auth). No managed ownership transfer, blanket grant, public-read policy, RLS bypass for interactive clients, or second engine was introduced.

Private assists remain separate from the official transcript. Spectators choose A/B and send text or image/video; only the recipient can read/respond. Acceptance alone publishes nothing. Explicit incorporation uses the existing authorized official submission engine; attachment publication uploads a fighter-owned public copy, leaving the original private. Stable request keys and copied-media receipts survive lost responses and are account-scoped. Existing source/window checks, five sends/minute, reports and staff-only review remain enforced.

## Disposable validation and exact outcomes

New empty project: `clash_p11bind_arena31a_20261014`, private ignored directory `.expo/arena31a-20261014`. Nine containers, three dedicated volumes and one dedicated network. Only PostgreSQL/gateway published, explicitly `127.0.0.1:57722/57721`; actual HostConfig bindings and Windows listeners checked. Fresh JWT/API secrets and reviewed development-only DB passwords. No inherited application backend configuration or hosted credentials used.

CLI 2.40.7; pinned images include PostgreSQL 17.6.1.002, Storage 1.26.5, Auth 2.179.0, Realtime 2.47.0 and PostgREST 13.0.6. [Immutable descriptors and check totals](evidence/arena31a/verification.json). Managed bootstrap, pgcrypto identity and restricted migration-role checks passed.

All **104 migration artifacts applied successfully**, in filename order, with 104 ledger entries. All 104 working-source/artifact hashes were verified. The existing reviewed redundant-pgcrypto artifact assertion was reused; historical application migration sources were not rewritten. Current source files have zero leading BOMs. The new assist migrations need no Storage DDL compatibility transformation. [Migration result](evidence/arena31a/migration-result.json), [hash manifest](evidence/arena31a/migration-manifest.json).

| Check | Actual result |
|---|---|
| Final `090_canonical_private_assists.sql` | **47/47 PASS**, no skips |
| `091_private_assist_media_target.sql` | **15/15 PASS**, no skips |
| Existing relevant SQL suites | **498/498 PASS**, 14 suites; includes five concurrency suites |
| Combined final relevant SQL result | **560/560 PASS**, 16 suites, zero skips |
| Three real authenticated accounts / actual RPC workflow | **15/15 PASS groups**, real Auth, REST, Realtime and Storage |
| Unit suite | **474 PASS**, 120 suites; zero failures/skips |
| App TypeScript | `npx.cmd tsc --noEmit`: **exit 0** |
| Edge entrypoint TypeScript | Separate strict `tsc` command below: **exit 0** |
| Expo Doctor | **18/18 PASS**, exit 0 |
| Signer offline regressions | **14/14 PASS** |
| Assist service regressions | **8/8 PASS** |
| Stage renders | **22/22 PASS**, native modules bridged |
| Official service/store regressions | **14/14 PASS**, controlled transport |
| Crowd service regressions | **7/7 PASS**, controlled transport |
| Samsung A50 | Connected and unlocked; **NOT TESTED** against this isolated backend |
| Deno/managed Edge deployment | **NOT TESTED**; actual portable handler tested through a Node loopback HTTP adapter |

The real-auth workflow verified Take creation, challenge/recipient authorization, concurrent idempotent acceptance, exactly one canonical Clash/Room and two fighters, official submissions, changed-payload rejection, spectator official-write denial, actual Crowd WebSocket delivery/gap recovery, LIVE discovery, private assist accept/reject/publication and concurrent retries, real PNG signing/byte retrieval, wrong-recipient/sender denial, block revocation, private-original preservation, real MP4 upload/official submission/byte retrieval, spectator judging, concurrent identical verdicts and closed Crowd write denial. Test clocks changed only these disposable fixtures. [Results](evidence/arena31a/canonical-results.json).

The handler test used the production handler implementation over loopback HTTP with **real upstream services**, not mocked authorization. It does not certify Supabase Edge Runtime packaging, mobile function routing, native media decoding or playback. No isolated Expo bundle was loaded on the phone; existing sessions/app data and permissions were preserved, and no screenshots exposing existing user data were taken. GIF provider flow remains unverified from Phase 3.1.

### Failed runs and corrections

- First final-assist SQL run: 43 passing assertions, then a fixture SQL error because the newly added legacy GROUP Room omitted required `closes_at`. Fixed that fixture; all final 47 assertions then passed. No authorization assertion removed.
- Original `001_media_storage.sql`: 23/24 passed; it expected a direct DELETE exception from a newer `protect_delete` trigger absent in reviewed Storage 1.26.5. A separate rollback diagnostic confirmed **zero foreign rows deleted and the row retained**, with no such trigger. The test now checks an exception when the trigger exists, otherwise zero affected rows through RLS, and additionally checks the retained row. Final result **25/25**. No role, grant, trigger or policy changed. [Original failing totals](evidence/arena31a/existing-media-sql-results.json), [diagnostic](evidence/arena31a/storage-delete-guard.txt).
- First sandboxed Node invocation was blocked by filesystem EPERM; offline checks were rerun with the required local filesystem permission and passed. No security setting was changed.

### Commands executed

```text
node .expo/arena31a-20261014/prepare.cjs
node .expo/arena31a-20261014/lifecycle.cjs create
node .expo/arena31a-20261014/lifecycle.cjs db
node .expo/arena31a-20261014/lifecycle.cjs bootstrap
node .expo/arena31a-20261014/migrate.cjs
node .expo/arena31a-20261014/lifecycle.cjs runtime
node .expo/arena31a-20261014/sql-tests.cjs <recorded suite filenames>
node scripts/arena-canonical-e2e.cjs .expo/arena31a-20261014
node scripts/assist-signer-check.cjs
node scripts/assist-service-check.cjs
node scripts/duel-render-smoke.cjs
node scripts/official-service-check.cjs
node scripts/crowd-service-check.cjs
npm.cmd run test:unit
npx.cmd tsc --noEmit
npx.cmd tsc --noEmit --strict --skipLibCheck --allowImportingTsExtensions --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM supabase/functions/arena-assist-media-access/index.ts
npx.cmd expo-doctor
node .expo/arena31a-20261014/diagnostics.cjs
node .expo/arena31a-20261014/cleanup.cjs
node .expo/arena31a-20261014/verify-evidence.cjs
```

Actual CLI migration invocation used password-free `postgresql://postgres@127.0.0.1:57722/postgres`, disposable PGPASSWORD through the subprocess environment and local-only PGSSLMODE=disable. This was never a hosted connection or TLS configuration change. pgTAP plans/assertions were parsed; exit 0 alone was not treated as a pass. Exact suite filenames/counts appear in [assist results](evidence/arena31a/assist-sql-results.json), [canonical results](evidence/arena31a/canonical-sql-results.json) and [final media results](evidence/arena31a/sql-results.json). Full repository SQL was not rerun; these are the relevant 16 suites.

All nine task containers and only their volumes/network were removed. Pre-existing container, volume and network inventories matched the baseline. [Cleanup receipt](evidence/arena31a/cleanup.json). No existing development or hosted database was queried, migrated, reset or modified, including quarantined `zrutlrhhvfcsmssjiijl`. No secrets or private configuration committed. Unrelated `Microsoft/`, `shot.png`, `sybil.html` and `sybil/` files remain untouched.

## Commits, deployment prerequisites and limitations

- `b6b80af`: backend assist implementation, server signer, final SQL suites and version-aware media denial regression.
- `64a4423`: preserved client assist implementation, explicit incorporation, account/retry guards and client/render regressions.
- This report/evidence and reproducible authenticated workflow harness are committed separately.

Before any application rollout, separately authorize serving/deploying the new JWT-protected Edge function alongside the two additive migrations, verify platform routing/runtime and server-only credentials, then test isolated Android fighter/spectator sessions. **No deployment or merge occurred here.**

Signed capabilities can remain usable for up to 60 seconds after later revocation; already delivered bytes cannot be revoked. A later official-write failure can leave an explicit public copy orphaned; no new cleanup worker was introduced. Inbox uses bounded polling, not a private Realtime channel. Staff media review still requires an explicit trusted workflow. GIFs, native picker/playback, Android layout/keyboard/scrolling and actual Deno hosting remain unverified. No new judging, reward, settlement or competition timing rules were introduced.
