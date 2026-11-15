# DIVERGENCES — cloud deployment, project `kgaqejgubjemdecifzew`

Source commit: `9569391e0950956682c522d2d118bc8a711169d2`
Package generated from checkout: `0cd6c36aa4831cda115c293b74ba2bf98c6d22df`

**Rule for this package:** every file under `supabase/migrations/` is applied
byte-for-byte, with exactly one exception — file 13. This document is the
authoritative record of that exception. No original file is edited, renamed,
moved or deleted, and no migration is recorded as applied unless its SQL (or
its documented variant) actually executed.

---

## D-1 — `20260927030000_clash_scheduler.sql` (index 13 of 111)

| Field | Value |
|---|---|
| Original path | `supabase/migrations/20260927030000_clash_scheduler.sql` |
| Original size | 3 415 bytes / 67 lines |
| Original sha256 | see `manifest.json` → `entries[12].sha256` |
| Original ledger status | **DIVERGED — NOT APPLIED** |
| Variant path | `supabase/cloud/migrations/20260927030000_clash_scheduler__cloud_nocron.sql` |
| Variant sha256 | see `manifest.json` → `entries[12].variantSha256` |
| Executed on cloud | **the variant only** |

### Why

The original §1 runs:

```sql
do $$
begin
  execute 'create extension if not exists pg_cron';
exception when others then
  raise notice 'pg_cron could not be enabled here: %', sqlerrm;
end $$;
```

It assumes the platform refuses the extension and the handler quietly absorbs
the refusal. **On this project the platform does not refuse.** Verified from
`pg_settings` (read-only):

```
supautils.privileged_extensions            → … pg_cron, postgis, pgcrypto …
supautils.privileged_extensions_superuser  → supabase_admin
supautils.extensions_parameter_overrides   → {"pg_cron":{"schema":"pg_catalog"}}
```

`pg_cron` is a **privileged extension**, so `postgres` may install it. The
exception handler never fires, `cron.schedule(text,text,text)` comes into
existence, the §3 guard passes, and the job is created:

```
clash-maintenance | '* * * * *' | select public.run_maintenance(500)
```

That executes `run_maintenance(500)` **every 60 seconds**. Worse,
`run_maintenance` is redefined by eight later migrations
(`20260926170000`, `20260928040000`, `20260928120000`, `20260928130000`,
`20261002150100`, `20261004150000`, `20261005130300`, `20261005140000`), so the
job would keep executing the newest definition and would sweep Clashes, expire
Takes and prune rate-limit history *during* fixture seeding and acceptance
testing — silently invalidating the evidence those tests exist to produce.

A post-deployment cron check is insufficient: the first sweep can run before an
operator looks. The hazard is therefore removed **by construction**, not
detected afterwards.

### Exact comparison — nothing else changed

| Original lines | Content | In variant |
|---|---|---|
| 1–28 | Header comment block | **Replaced** by a cloud-specific header that names the base file and the reason |
| 30–36 | §1 `do $$ … create extension if not exists pg_cron … $$;` | **Removed** |
| 38–43 | §2 comment + two `REVOKE` statements | **Preserved verbatim** (the two statements; the comment is paraphrased into the variant header) |
| 45–67 | §3 `do $$ … cron.schedule(…) … $$;` | **Removed** |

Added (not present in the original):

- a **fail-closed guard** that raises if `cron.schedule` or schema `cron` already
  exists — so if pg_cron ever appears, this step aborts loudly instead of
  silently skipping;
- a **post-condition** re-asserting that pg_cron is still absent.

### What is preserved, and why omitting §1/§3 loses nothing else

- §2's two REVOKEs target functions created in
  `20260926170000_production_hardening.sql` (file 6, earlier in the chain), so
  they are valid at index 13. Confirmed by grep, not assumed.
- The same two revokes are **re-asserted by eight later migrations**, so the
  maintenance surface is server-only regardless of file 13.
- The scheduler is the *only* thing lost. On this environment that is the
  intent: acceptance must run against a database where nothing sweeps in the
  background.
- No pgTAP test asserts the cron job's existence (`grep -rln "cron.job|
  clash-maintenance" supabase/tests/` → no matches), so no test suite breaks.

### Ledger honesty (see §4 of the package README)

`supabase_migrations.schema_migrations` is keyed by **version timestamp only**.
The CLI compares *only* timestamps, so suppressing a future replay of the
original requires the version `20260927030000` to be present in the ledger.
Recording that version while executing variant text is a divergence, not a
false claim — **provided** the ledger row's `name` records what ran, the
variant's sha256 is archived in evidence, and this file exists. All three hold:

- ledger `name` for that version: `clash_scheduler__cloud_nocron`
- ledger `statements` for that version: `null` (backfill shape), deliberately
  overwriting what `repair` copies out of the local file
- variant SQL archived under `evidence/<run>/03-divergence/`
- this document, referenced by `manifest.json` → `entries[12].mode = "diverged"`

**Why the overwrite is mandatory.** `supabase migration repair --status applied`
populates `name` and `statements` from the local file at
`supabase/migrations/<version>_<name>.sql`. For this version that file is the
original scheduler — so an unmodified repair would write the *original's*
statements into the ledger as though they had executed. `backfill-ledger.ps1`
runs the annotation unconditionally after every repair, and exits non-zero if it
cannot, because a ledger row misattributing D-1 is exactly the false record this
package exists to prevent.

### Residual hazard

Because the original's version IS in the ledger after backfill, `db push` will
not replay it. But if anyone ever runs `supabase migration repair --status
reverted 20260927030000` — or drops the ledger — the next `db push` applies the
**original** and installs pg_cron. `README.md` lists this as STOP condition S7.

---

## No other divergences

Verified by exhaustive grep across all 111 files:

| Pattern | Files matched | Executable? |
|---|---|---|
| `create extension` | `20260928130000` (postgis), `20260930110000` (pgcrypto), `20261004120000` (pgcrypto), `20260927030000` (pg_cron) | postgis **already installed** → no-op; pgcrypto trusted → allowed; pg_cron → **excluded (D-1)** |
| `cron.schedule` / `cron.unschedule` / `cron.job` | `20260927030000` only | excluded (D-1) |
| `pg_cron` (any form) | `20260926170000:366-367`, `20260928020000:13`, `20260928040000:11`, `20261002150100:2261`, `20261022120000:22,208` | **all inside `--` comments** — no execution |
| `alter table realtime.*` / `alter table storage.*` | none | — |
| `alter system` / `create role` / `create database` | none | — |

The one non-migration divergence — Storage buckets and policies, which
migration 4 deliberately skips on hosted projects — is handled by
`storage/10_storage_bootstrap.sql` and documented there.
