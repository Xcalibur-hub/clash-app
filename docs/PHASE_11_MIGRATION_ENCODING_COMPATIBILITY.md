# Phase 11 Step 5D — Migration Encoding Compatibility Audit

**Recommendation: prepare a BOM-only, separately hashed deployment artifact for a future fresh staging database. Keep historical source migrations and the frozen PR #26 manifest unchanged.** The encoding transform is verified offline; the migration chain and security behavior remain unvalidated. No new database attempt is authorized or was made.

## Scope and findings

Audited exact Git blobs from PR #26 commit `a92a550527f810913b01f6e6411dc78996c71a06`, using its recorded 106-file order and SHA256 hashes. PR #27's retained log confirms SQLSTATE `42601` at statement 0 of migration 41 with Supabase CLI 2.40.7 / PostgreSQL 17.6. This is prior evidence, not a newly executed SQL test.

All **106/106 source hashes match**. All decode strictly as UTF-8. **Three** have one leading `EF BB BF`, immediately before a `--` comment. No invalid UTF-8, NUL/UTF-16/UTF-32, repeated/embedded BOM, suspicious non-ASCII leading token or disallowed control-byte hazards were found by the prepared preflight. Two files (the first two below) have valid-UTF-8 mojibake-looking sequences in comments; those are warnings, not evidence of invalid UTF-8, and are preserved without attempting a character repair.

| Order | Migration | Source SHA256 | BOM-only artifact SHA256 |
| --- | --- | --- | --- |
| 41 | `20261003180000_explore_global.sql` | `a5599544c44e28415cc9d5434b0cf66f70d555257b443a5380f871fc559c9c9b` | `4805536986e72761137b355cce7279eefa0c22e39927b95801fbaeda56a4d1f6` |
| 44 | `20261004120000_explore_play_system.sql` | `b047b47ea03dbb90bb4324b40a20196e30dd449d89557b42a49b4e1d8045d844` | `465ae53388c6d3e0399be3cacb23b519416fe9824efb7f64e1a653d30b96d990` |
| 102 | `20261011053717_critical_authorization_hardening.sql` | `0207239f0d23d27aa6e71b0d3236c14a2cf7fe57af7839d61a958c122bb3d5cb` | `f600540c9174e64697aeff19adc98e15213a2545888cac68784e40ce84767c8e` |

Migration 41 begins `ef bb bf 2d 2d 20 50 68 61 73 65 20 31 34 2e 30`. The offending character is the file-start U+FEFF, outside SQL comments/literals. The same hazard is present later in migrations 44 and 102; rejection through the same old loader is predicted, **not newly database-tested**. Migration 102 contains H1/H2 protection, so fixing only migration 41 would leave another security-validation bootstrap blocker.

[Complete 106-file scan](PHASE_11_MIGRATION_ENCODING_SCAN.json) records exact source/artifact hashes, order, first bytes, BOM/UTF-8 findings, control issues, newline counts and mojibake warnings. Its metadata has no timestamps or host paths, making repeated output deterministic. The source manifest Git-blob SHA256 is `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e`.

## CLI compatibility evidence and options

The old [v2.40.7 migration loader](https://github.com/supabase/cli/blob/v2.40.7/pkg/migration/file.go) passes files to [the Go splitter](https://github.com/supabase/cli/blob/v2.40.7/pkg/parser/token.go), which applies `strings.TrimSpace`; that does not remove U+FEFF. Statements are passed unchanged to the PostgreSQL batch, consistent with PR #27's actual failure.

The official latest stable release inspected was [v2.120.0](https://github.com/supabase/cli/releases/tag/v2.120.0), release commit `753520fa7202ed5f8b25883a4c0aa7e5e9ad1fc4`. Its [TypeScript migration loader](https://github.com/supabase/cli/blob/753520fa7202ed5f8b25883a4c0aa7e5e9ad1fc4/apps/cli/src/command-internal/migration-file.ts) uses [the TypeScript splitter](https://github.com/supabase/cli/blob/753520fa7202ed5f8b25883a4c0aa7e5e9ad1fc4/apps/cli/src/command-internal/sql-split.ts), whose statement `trim()` removes a leading U+FEFF. Source inspection traced `migration up` through `applyMigrationFile` to parsed statements. An **offline execution of only these two pure modules** produced identical parsed statement arrays/transaction modes for original and normalized bytes across **106/106 files**, including all three BOM files, with no leading BOM in emitted statements. No CLI binary was installed, upgraded or run for this audit.

The retained modern Go sidecar still has the old splitter; its BOM-aware comment helper is for operation classification and does not rewrite the executed statement. Do not extrapolate the tested TypeScript parser behavior to every command/backend. Full v2.120.0 CLI/runtime compatibility remains unverified.

| Option | Benefit | Risk / decision |
| --- | --- | --- |
| Pin a compatible CLI | Preserves all raw source bytes and avoids a separate transformed migration set. The v2.120.0 TypeScript parser handles these BOMs offline. | Large upgrade from 2.40.7, including stack bootstrap/execution changes, managed images, isolation and configuration. Pin binary/version/checksum and validate the exact command/backend separately. Not recommended as the sole untested repair. |
| BOM-only isolated artifact | Preserves Git history and frozen hashes. Only three known transport markers change; 103 files remain byte-identical. Separate source/artifact hashes make the difference explicit. | Requires a reviewed dual-hash manifest and strict artifact-only execution. Existing tools comparing stored statement text may observe BOM differences. Must never mix raw and normalized directories during a deployment. **Recommended smallest compatibility change.** |
| Reviewed source correction | Makes future raw-file consumers BOM-free. | Explicitly prohibited in this step; would invalidate frozen hashes and complicate historical provenance/statement comparisons. A migration ledger may store versions/statements rather than raw SHA256, so an unchanged version is not proof of unchanged history. Requires separate review/re-freeze; no version renaming, ledger repair or replay on existing databases. |

For a fresh staging target, retain the existing approved migration tooling initially and make BOM handling explicit in its input artifact, then authorize a full fresh-target validation separately. This removes the demonstrated encoding obstacle; it does **not** establish that all later migrations will succeed. Any independent CLI/managed-PostgreSQL upgrade should have its own compatibility/isolation review rather than being bundled into an encoding fix. The official changelog also flags newer PostgreSQL minor-version changes; hosted parity is outside this offline audit.

## Prepared implementation and actual checks

New files only; no package script, production configuration or CI/deployment pipeline was changed:

- `scripts/migration-encoding-check.cjs`: reads only the fixed frozen Git commit/manifest; checks all hashes, file coverage and order; uses fatal UTF-8 decoding without silently dropping BOMs. Default mode prints deterministic JSON and exits **1** on raw BOMs or other hazards. `--artifact` permits only a new ignored `.expo/phase-11-migration-artifact` directory in this isolated worktree, refuses an existing destination/redirected scratch root, and never invokes SQL, Supabase, Docker or network APIs.
- The artifact writer removes **only the initial three bytes** when there is exactly one BOM before a leading SQL comment. It refuses invalid encoding, NULs, embedded/repeated/misplaced BOMs and control/leading-token hazards. It does not trim, normalize line endings, rewrite comments, alter SQL literals, rename files or transcode the body. A write failure stops and leaves an unusable partial artifact for review; no automatic overwrite/retry/cleanup occurs.
- `scripts/migration-encoding-check.test.cjs`: **18/18 tests passed**, exit **0**, covering unchanged UTF-8/literal/CRLF bytes, exact BOM removal, malformed UTF-8, UTF-16/32, NULs, repeated/embedded/misplaced BOMs, unexpected leading characters, control bytes, preserved mojibake, safe artifact writes, existing-target refusal and unsafe-input refusal.
- `scripts/migration-encoding-upstream-check.mjs`: hash-pins the two downloaded upstream modules before their offline import and compares all 106 parsed statement arrays. **106/106 comparisons passed**, including **3/3 BOM files**, exit **0**. Node 22.11.0 emitted experimental type-transformation and module-type warnings; package configuration was not changed to suppress them.
- Raw preflight: actual exit **1**, expected because it found three BOMs; **zero other blocking issues**. This is a successful hazard detection, not a clean raw-artifact pass.
- File-only `--artifact` check: actual exit **0**; **106/106 output hashes verified**; exactly **3 files / 9 bytes** removed. Reconstructing each affected source as `EF BB BF + artifact` exactly reproduced its frozen blob; every other output was byte-identical. Source working-file byte hashes before/after also matched.
- Node syntax checks for the CJS scripts passed. Git comparison confirmed unchanged migration/configuration/package files. No full app suite was rerun for these standalone file-only tools; no database tests ran.

The 106-file artifact was created only as an ignored, file-only rehearsal in the isolated worktree. It has no Supabase configuration, credentials, database or migration ledger and was never executed/deployed. It is not committed. Its `encoding-manifest.json` matches the committed scan.

## Reproducible procedure and future authorization boundary

Safe offline commands in this new audit worktree:

```powershell
node --test scripts/migration-encoding-check.test.cjs
node scripts/migration-encoding-check.cjs
# Expected exit 1 for the frozen raw files: 3 BOMs, no other blocking hazards.
node scripts/migration-encoding-check.cjs --artifact
# Expected exit 0 ONLY when the fixed artifact destination does not already exist.
```

No automatic artifact deletion is provided. To reproduce twice, use two fresh isolated worktrees from this report branch and compare their JSON and all 106 output hashes. Do not overwrite an artifact to obtain a pass. After any I/O failure, treat the partial directory as invalid.

To reproduce the upstream parser comparison without a CLI installation, download exactly these two source files into a new ignored directory, preserving bytes:

- `https://raw.githubusercontent.com/supabase/cli/753520fa7202ed5f8b25883a4c0aa7e5e9ad1fc4/apps/cli/src/command-internal/migration-file.ts` — SHA256 `ec8018d9c9ec4a3a60637ff2f386d7edb7b683d85dcbf56551b67e138c1a4cfe`.
- `https://raw.githubusercontent.com/supabase/cli/753520fa7202ed5f8b25883a4c0aa7e5e9ad1fc4/apps/cli/src/command-internal/sql-split.ts` — SHA256 `005c59d49c164c72e60bbc9ab96b18bc7b811173b1702ded2e6bedabd2c688c0`.

```powershell
node --experimental-transform-types scripts/migration-encoding-upstream-check.mjs <download-directory>
```

Before any future database validation: review/pin the tool and deployment-artifact hashes, retain PR #26's original manifest separately, authorize a **new fresh disposable target and controlled attempt**, re-prove all resource/port isolation, and approve executing the artifact's 106 migrations in unchanged filename order. Stop on the first failure. Only after successful bootstrap should H1/H2/H3/M1, effective grants/owners, Storage/Realtime/cron, all 89 SQL suites with actual TAP accounting and concurrency be tested. No automatic repair or rerun is proposed.

This step used code/file inspection, HTTP source downloads and file-only tests. **No database creation, connection/query, migration execution, security-validation transaction, Docker command, environment/secret change, Android operation, merge or deployment occurred.** Existing branches, dirty primary Crew work and frozen PR #26 are preserved. PR #27 remains failed evidence. Step 4C is **BLOCKED**, Step 2F is **DEFERRED**, and Step 5C's consumed authorization was not reused.

The new draft PR is stacked on PR #26 solely to keep the audit/tooling diff focused. Stop after this PR; database readiness remains **BLOCKED** pending separately approved validation.
