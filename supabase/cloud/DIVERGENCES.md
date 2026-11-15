# DIVERGENCES — cloud package for `kgaqejgubjemdecifzew`

Source commit: `9569391e0950956682c522d2d118bc8a711169d2`

Three recorded divergences: one substitution (D-1), one mechanical
normalisation (D-2) and one retraction of an earlier claim of mine (D-3).
No file under `supabase/migrations/` is edited, renamed or moved.

---

## D-1 — file 13 `20260927030000_clash_scheduler.sql` is substituted

| Field | Value |
|---|---|
| Original | `supabase/migrations/20260927030000_clash_scheduler.sql` (3 415 bytes) |
| Original sha256 | `manifest.json` → `entries[12].sha256` |
| Original status | **NOT APPLIED** — executed identity recorded as the variant |
| Executed source | `supabase/cloud/migrations/20260927030000_clash_scheduler__cloud_nocron.sql` |
| Executed sha256 | `manifest.json` → `entries[12].normalizedSha256` |
| Ledger `name` | `clash_scheduler__cloud_nocron` |
| Ledger `statements[1]` | `sha256:<hash of the variant text>` — verifies what ran, not what was skipped |

### Why

The original §1 runs `execute 'create extension if not exists pg_cron'` inside an
`exception when others` block, assuming the platform refuses. It does not:

```
supautils.privileged_extensions            → … pg_cron …
supautils.privileged_extensions_superuser  → supabase_admin
```

pg_cron is privileged, so the extension installs, §3's guard passes and
`clash-maintenance` is scheduled `* * * * *` → `public.run_maintenance(500)`
every 60 seconds. Because `run_maintenance` is redefined by eight later
migrations, that job keeps running the newest definition while fixtures and
acceptance tests are in progress.

### Exact comparison

| Original lines | Content | In variant |
|---|---|---|
| 1–28 | header comment | replaced by a cloud-specific header naming the base file |
| 30–36 | §1 pg_cron install | **removed** |
| 38–43 | §2 two REVOKEs | **preserved byte-identically** (verified by test) |
| 45–67 | §3 schedule block | **removed** |

Added: a fail-closed guard that raises if `cron.schedule` or schema `cron`
already exists, and a post-condition re-asserting pg_cron is still absent.
Nothing else is lost: both REVOKE targets are created in file 6, and the same
revokes are re-asserted by eight later migrations. No pgTAP test asserts the job.

### Ledger honesty

Recording the version is what prevents `db push` from replaying the original.
That is not a false claim *because* the ledger simultaneously records the
variant as the executed identity (`name` + sha256 of the executed text), the
variant's bytes are committed, and `90_verify.sql` check 6 fails closed unless
the name is exactly `clash_scheduler__cloud_nocron`. An earlier package version
stored `statements = null` here; the audit correctly rejected that as
indistinguishable from "the original ran", and it has been replaced by the
sha256 token above.

---

## D-2 — two migrations are normalised before wrapping (F2)

| Version | File | Own `begin;` | Own `commit;` |
|---|---|---|---|
| `20261023130000` | `meet_rpc_permission_hardening.sql` | line 4 | line 31 |
| `20261023140000` | `meet_private_typing.sql` | line 3 | line 87 |

Each wrapper must own exactly one transaction so the ledger insert commits with
the migration. A file that opens and closes its own transaction would commit
early and leave the ledger write outside it.

**Transformation:** standalone lines matching `^\s*(begin|commit)\s*;\s*$` are
removed. Nothing else is touched — comments, `notify pgrst,'reload schema'`,
and every DDL statement are preserved in order. The wrapper supplies `begin;`
and `commit;`.

**Recorded, not hidden:** `manifest.json` marks both entries
`normalisation: "strip-begin-commit"`, and their ledger identity token is the
sha256 of the *normalised* text (what actually executed). The originals remain
byte-identical on disk and are verified by `check-manifest.ps1`.

`tests/verify-package.mjs` asserts that exactly these two needed normalisation
and that their wrappers contain no second top-level `begin;`.

---

## D-3 — correction: migration 4 DOES create the Storage buckets and policies

My earlier package claimed migration 4 skips its Storage section on hosted
projects, and shipped a `10_storage_bootstrap.sql` to compensate. **That was
wrong**, and the Codex audit was right.

The actual guard in `20260926150000_media_storage.sql` is:

```sql
if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
  raise notice '… skipping bucket+policy bootstrap (local reset; restored by seed/config)';
  return;
end if;

insert into storage.buckets … on conflict (id) do nothing;
create policy "media objects are publicly readable" …   -- and four more
```

It returns early only when the Storage tables are **missing** (a local-reset
race). On hosted Supabase the tables always exist, so migration 4 creates both
buckets and all five policies.

**Remediation (F4):** `storage/10_storage_bootstrap.sql` is **deleted**. The
package now performs **no Storage writes of its own** — asserted by the test
suite over every hand-written SQL file. Configuration is verified instead, in
`verify/95_storage_config.sql` (bucket count, public flags, 100 MB limit, 8-entry
MIME allowlist, five named `storage.objects` policies).

---

## No other divergences

| Pattern | Files | Executable? |
|---|---|---|
| `create extension` | `20260928130000` (postgis — already installed), `20260930110000` + `20261004120000` (pgcrypto, trusted), `20260927030000` (pg_cron) | pg_cron excluded by D-1; the rest no-op |
| `cron.schedule` / `cron.unschedule` / `cron.job` | `20260927030000` only | excluded by D-1 |
| `pg_cron` mentions elsewhere | `20260926170000:366-367`, `20260928020000:13`, `20260928040000:11`, `20261002150100:2261`, `20261022120000:22,208` | all inside `--` comments |
| `alter table realtime.*` / `storage.*` | none | — |
| `alter system` / `create role` / `create database` | none | — |
| `CONCURRENTLY` | none | every wrapper is safely transactional |
