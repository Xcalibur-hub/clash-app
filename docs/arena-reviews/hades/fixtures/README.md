# Fixture substitutions — declared, not hidden

The CLASH migration chain expects a hosted Supabase environment. These fixtures make
it load on a **bare, disposable PostgreSQL 16.2** without editing any migration
file. Everything here is a test fixture and is **not** part of CLASH.

Two things are substituted: three **extensions** and the **platform schema**
(`auth`, `storage`, `realtime`). One migration receives a two-line overlay.

---

## 1. Stub extensions (no migration edits needed)

`postgis` and `pgcrypto` are not available. Instead of commenting out
`create extension` lines, this package installs **stub extension packages** into
the server's extension directory, so the migrations' own
`create extension if not exists …` statements succeed unmodified.

`install-stubs.sh` writes `postgis.control` / `pgcrypto.control` and their SQL
bodies into `$(pg_config --sharedir)/extension`.

| Stub | Provides | Deliberately does NOT provide |
|---|---|---|
| `postgis` | `geography` and `geometry` **domains** over `text`; `ST_MakePoint`, `ST_SetSRID`, `ST_X`, `ST_Y`, `ST_Geohash`, `ST_Distance`, `ST_DWithin` | any real spatial semantics; **no GiST opclass** |
| `pgcrypto` | `gen_random_bytes`, `digest` (both `bytea` and `text`) via `md5` | **cryptographic security** — `gen_random_bytes` is not random |

**Consequence.** Anything that depends on real geography (World missions, drops,
proximity) cannot be verified here. No test in this package touches those paths.

## 2. Platform schema (created by `reconstructed/loader.mjs`)

A bare PostgreSQL has no `auth`, `storage` or `realtime` schema. The loader creates
minimal ones:

| Object | Purpose | Limitation |
|---|---|---|
| `auth.users` | subject table for `auth.uid()` | no email/identity machinery |
| `auth.uid()`, `auth.role()`, `auth.jwt()` | read `request.jwt.claims` | **JWT signatures are not verified here** — that is the gateway's job, and this harness sets the claims itself |
| `storage.buckets`, `storage.objects`, `storage.foldername()` | object metadata only | the **Storage service is absent**; bucket ACLs are not exercised |
| `realtime.messages`, `realtime.topic()`, `realtime.send()` | so RLS policies compile | the **Realtime server is absent**; `send()` is a **no-op**, so delivery and retry semantics are NOT tested |
| publication `supabase_realtime` | migrations add tables to it | publication only; no logical replication consumer |
| roles `anon`, `authenticated`, `service_role` | EXECUTE/RLS targets | nologin; impersonation is via `set role` |

## 3. The single migration overlay (2 lines)

One migration cannot run against the `postgis` stub, because a **domain cannot carry
a typmod** and a text domain has no GiST opclass.

`overlay/world_missions-fixture.patch` is a documented, reversible patch:

```diff
-  approx_location      extensions.geography(Point, 4326) not null,
+  approx_location      extensions.geography not null, -- HADES FIXTURE: typmod dropped (domain stub)
```
```diff
- create index if not exists world_drops_approx_gix
-   on public.world_drops using gist (approx_location);
+ -- HADES FIXTURE: create index world_drops_approx_gix ... using gist omitted
+ -- (a text-backed geography domain has no GiST opclass).
```

This affects **only** the World/geography module. The settlement, challenge, ballot,
reputation and reward paths are untouched, and every test in this package avoids
World code.

**All other 118 migrations are byte-identical to the baseline commit.** No migration
was rewritten in place; the overlay is applied to a *working copy* that is not
published here.

## 4. What was NOT substituted

- `pg_cron` — genuinely absent. `20260927030000_clash_scheduler.sql` already detects
  this and skips scheduling; `run_maintenance()` remains callable directly, which is
  how the concurrency test exercises the cron path.
- Every settlement, challenge, ballot, reward and RLS object is the **real shipped
  code** from `36dccade`, plus the candidate patch where stated.

## 5. What this means for the results

Results in this package are valid for **settlement correctness and reward
accounting**. They say **nothing** about World/geography, Storage, Realtime
delivery, or pg_cron scheduling. Those are listed as NOT TESTED in the README.
