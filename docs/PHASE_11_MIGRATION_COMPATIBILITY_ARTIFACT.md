# Phase 11 Step 5G: Migration compatibility artifact

## Outcome

Implemented and verified offline only. No SQL, database connections, Docker operations or Attempt 3. Historical migration files and the original frozen manifest remain unchanged. Primary checkout Crew changes preserved. New branch stacks on Step 5F / PR #30; no existing PR modified or merged.

## Reproduction

```text
node --test scripts/migration-compatibility-artifact.test.cjs scripts/extension-hook-preflight.test.cjs scripts/migration-encoding-check.test.cjs
node scripts/migration-compatibility-artifact.cjs
```

The generator accepts no destination override. It creates a NEW ignored `.expo/migration-compatibility-5g/` with `migrations/` and `compatibility-manifest.json`. Existing output is an error; never overwritten or automatically deleted. The checked-in companion manifest is a copy of the generated evidence, not a replacement for PR #26's manifest.

Input is the 106 exact Git blobs pinned to candidate a92a550527f810913b01f6e6411dc78996c71a06, verified against its original manifest SHA-256 a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e. Local tracked migration/manifest edits also block CLI generation. This intentionally avoids Windows checkout newline conversion. Complete expected extension statement inventory is checked against Step 5F evidence; unreviewed source bytes fail before output creation. No generic SQL rewrite occurs.

## Exact transformations

| File | Changes |
|---|---|
| 20261003180000_explore_global.sql | Remove one leading three-byte UTF-8 BOM |
| 20261004120000_explore_play_system.sql | Remove BOM, then replace one exact reviewed pgcrypto CREATE statement |
| 20261011053717_critical_authorization_hardening.sql | Remove BOM only |

All other 103 files remain byte-identical to frozen source. Migration 44 retains identical prefix/suffix bytes outside the reviewed replacement. Source hash is b047b47ea03dbb90bb4324b40a20196e30dd449d89557b42a49b4e1d8045d844; BOM-only hash 465ae53388c6d3e0399be3cacb23b519416fe9824efb7f64e1a653d30b96d990; final hash de384efd4f41ef992377b53eccc230a59110d91669c873d06431a868f0b5af11.

The replacement checks pg_catalog.pg_extension, pg_namespace and pg_roles for pgcrypto version 1.3, schema extensions and owner supabase_admin. Missing or mismatched state raises an exception. It neither creates an extension nor grants privileges or changes ownership. Exact source SHA, single statement occurrence and the reviewed replacement's final SHA must match. Owner/version are deliberately target-specific prerequisites, not silently adapted defaults.

Each manifest entry records filename/order, source SHA-256, BOM-only SHA-256, final SHA-256 and exact transformations, including offsets and before/after content. No volatile timestamp or absolute worktree path affects output. Two independently prepared outputs compared equal in tests. Output verification reads every generated file back byte-for-byte and checks exact file inventory and manifest content.

## Actual verification

- 27 Node tests passed, 0 failed, 0 skipped: 6 new generator tests, 3 Step 5F tests, 18 BOM tests.
- Generator exit 0: 106 files verified, exactly 3 changed files, 3 BOM removals and 1 statement replacement.
- Negative coverage: altered ordinary bytes, added extension statement, reordered/missing inputs, path traversal/outside/nested paths, bad destination names, existing directories, output corruption, extra SQL file and manifest tampering. Unexpected extension input is rejected at the stronger frozen-byte gate before inventory scanning.
- Source migration/manifest Git diff empty. No database-backed SQL, pgTAP or security result claimed. No application code changed; app tests and Expo Doctor not rerun.

## Compatibility and residual risk

CLI 2.40.7's [migration executor](https://github.com/supabase/cli/blob/v2.40.7/pkg/migration/file.go) splits SQL while preserving dollar-quoted DO bodies and submits each migration as an implicit transactional batch. Original filenames/order and migration count are preserved; BOM removal reuses PR #28's verified byte transformation. The replacement is one dollar-quoted DO block using PostgreSQL catalogue reads and PL/pgSQL syntax. This is static compatibility review, not execution through the CLI or PostgreSQL.

Prior Attempt 2 catalogue evidence showed precisely pgcrypto 1.3 / extensions / supabase_admin, satisfying the proposed precondition at that time. A new target must independently satisfy it; no current database was queried. Conditional equivalence applies only when the extension is already provisioned. The generated artifact does not provision extensions, initialize managed services or validate extension function grants.

The old supautils elevation-state defect remains. Migration 34's caught duplicate publication add is the source-supported likely precursor; later creator-live publication operations can catch missing/duplicate membership errors and leave similar state. No extension DDL follows migration 44, but publication and other elevated DDL may still fail or behave unexpectedly. This artifact avoids one redundant hook invocation; it does not certify all 106 migrations, security tests or runtime behavior. Do not grant pg_read_file, elevate the migration role, disable hooks or alter source ledgers as workarounds.

Before any future attempt: separately authorize one disposable environment; review/pin CLI/image and managed provisioning; verify artifact hashes and exact directory; stop at first failure; run real TAP/security/concurrency tests only after successful migrations. No Attempt 3 is authorized by this preparation. Step 4C remains BLOCKED against existing local data; Android Step 2F remains DEFERRED.
