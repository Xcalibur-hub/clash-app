# Phase 11 Step 5F: Extension hook compatibility

## Result and boundaries

Offline investigation only. No database connections, SQL execution, Docker operations, migration application, role changes or Attempt 3. Step 4C remains BLOCKED against the existing database; Android Step 2F remains DEFERRED. This branch is stacked on PR #28, preserving its tooling and PR #26 unchanged.

Frozen candidate: a92a550527f810913b01f6e6411dc78996c71a06. Prior evidence: PR #29 commit 1c6c4f44d74db46aee7afc1429b610e4850166ca, docs/evidence/phase-11-5e/{migration-failure.log,postgres-error.log,post-failure-catalog.log,validation-results.json}. Prior attempt: 43 migrations committed, 44 failed, 62 not attempted. Those are prior results, not new validation.

## Confirmed evidence

The retained server error is SQLSTATE 42501, permission denied for function pg_read_file, inside a generated DO block reading /etc/postgresql-custom/extension-custom-scripts/before-create.sql. The failing top-level statement is CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions. The retained catalogue shows pgcrypto 1.3 already installed in extensions, owned by supabase_admin. postgres is non-superuser and cannot execute pg_read_file(text); the file-reading ACL grants supabase_admin only. This is an appropriate boundary, not a missing application grant.

[Image 17.6.1.002 build recipe](https://github.com/supabase/postgres/blob/17.6.1.002/nix/ext/supautils.nix) pins supautils 2.9.4. [Image hook configuration](https://github.com/supabase/postgres/blob/17.6.1.002/ansible/files/postgresql_config/supautils.conf.j2) agrees with retained GUCs: privileged role postgres, elevation identity supabase_admin, pgcrypto in the allowlist and custom script path above. Recipe inspection does not independently attest the removed container's binary/digest.

[Version 2.9.4 ProcessUtility hook](https://github.com/supabase/supautils/blob/v2.9.4/src/supautils.c) calls switch_to_superuser, then global and extension-specific before-create scripts, BEFORE invoking PostgreSQL's normal CREATE EXTENSION handler. Therefore IF NOT EXISTS does not prevent hook execution. [Custom-script implementation](https://github.com/supabase/supautils/blob/v2.9.4/src/extension_custom_scripts.c) uses SQL pg_read_file and catches undefined_file only; permission errors propagate.

[Role-switch implementation](https://github.com/supabase/supautils/blob/v2.9.4/src/utils.c) keeps a backend-static is_switched_to_superuser flag. When true, subsequent switch requests return without examining the actual effective identity. The hook has no exception-safe cleanup around elevated publication DDL. PostgreSQL exception recovery can restore the SQL identity without restoring this C static flag.

[CLI 2.40.7 migration executor](https://github.com/supabase/cli/blob/v2.40.7/pkg/migration/file.go) submits each file as an implicitly transactional extended-protocol batch on the supplied connection; it does not supply an extension-hook bypass or reset C hook state between files. Changing SQL search_path cannot grant pg_read_file or repair the flag.

## Most likely causal chain, not runtime-proven

Migration 33 (20261002150100_live_arena_schema.sql:2234) adds arena_room_messages to supabase_realtime. Migration 34 (20261002160000_live_arena_spectator.sql:714) adds it AGAIN and catches duplicate_object/others. On this hook version, that error can leave is_switched_to_superuser=true while PL/pgSQL recovery restores postgres. A later extension hook then skips elevation and its pg_read_file fails under postgres.

This explains why earlier extension statements and separate bootstrap provisioning succeeded: they preceded the duplicate publication operation, with functioning elevation. Prior notices explicitly show already-existing pg_cron, postgis and pgcrypto; success must not be attributed to IF NOT EXISTS bypassing hooks. The scheduler's broad exception handler alone would not prove success, but its retained notice confirms the already-existing check was reached.

The precise internal flag was not captured during Attempt 2. This sequence is a source-supported hypothesis, not a newly reproduced root cause. Other caught elevated DDL errors could produce the same symptom. Upstream [exception-safe elevation fix efc6bf99 / #229](https://github.com/supabase/supautils/commit/efc6bf990a9858eb1f5f133fd833cc35d9c0d530) replaces static switching with scoped PG_TRY/PG_CATCH restoration and adds error/recovery tests. Its existence supports the failure mechanism, but does not certify any released CLI/image pair.

## Full extension inventory

The offline preflight verifies all 106 exact frozen Git-blob hashes before scanning. Four extension DDL occurrences, no ALTER/DROP EXTENSION:

| Order | Migration | Operation |
|---|---|---|
| 13 | 20260927030000_clash_scheduler.sql:33 | dynamic CREATE pg_cron, caught errors |
| 23 | 20260928130000_world_missions.sql:27 | CREATE postgis in extensions |
| 26 | 20260930110000_sponsor_attribution_hardening.sql:12 | CREATE pgcrypto in extensions |
| 44 | 20261004120000_explore_play_system.sql:6 | duplicate CREATE pgcrypto in extensions |

The machine-readable companion records exact source hashes, statements and proposed output hash. All four use IF NOT EXISTS. Related uses include extensions.digest in migration 44, PostGIS geography/functions in World migrations, cron scheduling in migration 13, and later Realtime publication DDL. No hook configuration, pg_read_file grant or extension update statement exists in the frozen migrations. Scan is a review aid using a lexical expression, not a general SQL parser; dynamic extension creation in the scheduler was separately inspected.

No remaining migration after 44 contains extension DDL. However 20261005100000_creator_live.sql:283 drops creator_live_viewers from the publication with errors caught; a missing publication membership can poison the same old hook flag. Other adds there also catch errors. 20261008100100_arena_crowd_chat.sql:179 adds Crowd to the publication. Thus bypassing one redundant CREATE does NOT certify the remaining migrations or privileged DDL. Unrelated SQL/security failures remain possible.

## Options and recommendation

| Option | Benefit | Limitation / decision |
|---|---|---|
| Exact scoped deployment artifact | Preserve historical files; avoid redundant hook invocation with managed pgcrypto already installed | Recommended minimal proposal below; not a general hook repair |
| Supported execution configuration | A fresh connection per file could clear backend-static state between migrations 34 and 44 | CLI 2.40.7 has no verified migration option implementing this. Does not cure within-file caught errors. Do not alter ledgers or invent a replay runner |
| Compatible CLI/image pair | An image containing reviewed exception-safe elevation and custom-script fixes addresses mechanism | Prefer for eventual durable platform fix, but no pair is certified here. Pin digest, verify bundled supautils source/version, Auth/Storage/Realtime and PG17 compatibility, then obtain separate validation authorization |
| Grant file access / superuser / disable hooks | May conceal symptom | Rejected: expands privilege or bypasses managed security behavior |
| Historical migration rewrite | Avoid redundant statement | Rejected for this checkpoint: invalidates frozen hashes and artifact provenance |

Proposed minimal artifact correction: replace ONLY migration 44's one exact CREATE statement with a fail-closed DO assertion that managed pgcrypto 1.3 exists in extensions with owner supabase_admin. This is an explicit fresh-target precondition, not unconditional removal. Missing/mismatched extension must stop; provision it separately through an approved managed bootstrap in a future authorized disposable environment. No CREATE, role change or grant occurs in the replacement. Owner/version pinning intentionally requires review for another target.

scripts/extension-hook-preflight.cjs emits the proposed SQL and source/BOM-only/proposed SHA-256 values without writing an artifact or executing SQL. It rejects changed source hashes or extension inventory. The unchanged prefix and suffix are byte-verified; all historical migrations and the BOM-only tool remain unchanged. This transformation is conditionally equivalent only when the asserted precondition holds; unlike BOM removal it is NOT a claim of unconditional semantic equivalence. Any future artifact must record this separate transformation for all 106 files and preserve filenames/order/source hashes. Do not use it on existing ledgers.

## Reproduction and validation prerequisites

Safe commands executed now:

```text
node scripts/extension-hook-preflight.cjs
node --test scripts/extension-hook-preflight.test.cjs scripts/migration-encoding-check.test.cjs
```

Results: preflight exit 0; 106 source hashes verified, four extension statements, zero after 44. Node tests 21 passed, zero failed/skipped (3 new tests plus 18 encoding tests). No database tests or security passes claimed. No app code changed, so application/native suites were not rerun.

Future attempt requires separate explicit authorization for ONE new isolated disposable environment, reviewed image/CLI pins and artifact transformation approval. Before migration execution, verify managed extension schema/version/owner, migration identity and unchanged restricted file ACLs; capture hook version/config. Test the duplicate-publication/caught-error/extension sequence in that disposable target, plus later within-file publication errors. Verify the proposed assertion succeeds only with the required extension and fails closed for missing/wrong-schema/version/owner fixtures. Apply all 106 reviewed artifact migrations once in order, stop on first failure, then run actual security/TAP/concurrency tests and clean up only disposable resources. No commands performing those steps were run here. No Attempt 3 is authorized.

