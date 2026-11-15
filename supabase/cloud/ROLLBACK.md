# ROLLBACK / RECOVERY

The project started **verifiably empty** (0 public relations, 0 public
functions, 0 auth users, 0 buckets, no `supabase_migrations` schema). That is
what makes recovery simple: there is no application data to preserve, so the
answer is always "discard or stop", never "surgically repair".

---

## T0 — Stop (the default outcome of any failure)

`deploy.ps1` already does this: on a failed gate, failed wrapper, mismatched
read-back or exception it writes `STOP.json` / `STOP.txt`, prints the sanitised
reason, seals the evidence directory and exits 1. It never retries, never
repairs, and never overwrites an earlier attempt.

Because every wrapper is **one transaction containing both the migration and its
ledger row**, a *proven* rollback leaves a self-consistent state: that version is
absent from both the schema and the ledger, and every earlier version is present
in both. There is nothing to clean up and nothing to hand-repair.

### T0.1 — Read the outcome before deciding anything

The runner records one of `COMMITTED`, `ROLLED_BACK_PROVEN`,
`COMMITTED_WITH_ERROR`, `LEDGER_MISMATCH` or `UNKNOWN`. Only the middle two need
operator judgement:

* `ROLLED_BACK_PROVEN` — the read-only probe proved the ledger row absent. Fix
  the cause, then re-run; the ledger is still a proven prefix, so T1 applies.
* `COMMITTED_WITH_ERROR` — the row **is** present with the expected token, so the
  transaction committed and the error arrived afterwards. **Do not re-run it.**
  Confirm with `check-ledger.ps1`, then continue from the next index.
* `UNKNOWN` — the commit outcome could not be established. Do not assume success
  and do not assume rollback. Run `check-ledger.ps1` (SELECT only, safe), and
  escalate; if the state cannot be proven, T2 is the only remaining option.

## T1 — Resume (only with proof)

Re-running `deploy.ps1` is safe *only* because it proves the ledger is an exact
prefix of the manifest before skipping anything: same versions, same stored
sha256 tokens, no gaps, no extra rows. If any of that is untrue it refuses.

That is the whole recovery procedure for an interruption. There is deliberately
no backfill script, no "mark as applied" helper and no automatic retry — the
earlier design had all three and the audit rejected them (F1, F8).

## T2 — Discard and recreate (after any doubt)

If the ledger and schema ever disagree in a way T1 cannot prove, do not
reconcile by hand. Delete the project and recreate it, then re-run
`check-manifest.ps1` → `deploy.ps1`.

> Destructive and irreversible. Requires explicit authorization. Nothing in this
> package automates it.

An in-place reset is **not** equivalent: dropping `public` alone leaves
`auth.users` triggers, `supabase_realtime` publication membership, the extension
installs and the ledger rows behind. Those must all be removed, in a specific
order, which is why recreation is preferred.

## T3 — Journal rollback (last resort, high risk)

```powershell
supabase migration repair --status reverted <version> --db-url "..."
```

`--status reverted` **deletes** the row, so the next `db push` **re-runs** that
SQL. Consequences:

- Reverting `20260927030000` re-arms the original scheduler: the next push
  installs pg_cron and schedules `clash-maintenance` every minute. This is STOP
  condition S10 and must never be done while the original file 13 exists.
- Reverting a version whose policies already exist produces "already exists" on
  replay.

Use T2 instead unless a reviewer explicitly asks for journal surgery.

## T4 — Evidence is never deleted

Failed attempts keep their `STOP.txt`, per-file receipts, stdout/stderr and
read-back logs. A successful retry creates `attempt-<n+1>`; earlier attempts are
left untouched forever.

---

## Forbidden

| Never | Why |
|---|---|
| Editing a file under `supabase/migrations/` to make it apply | Destroys the single source of truth `checksums.sha256` protects |
| Writing a ledger row for SQL that did not execute | The exact failure D-1 and `90_verify.sql` check 6 exist to catch |
| Re-running a wrapper to "see if it passes now" | Non-idempotent DDL; `on conflict do nothing` on the ledger row does not make the schema statements idempotent |
| Enabling pg_cron to "complete" file 13 | Schedules maintenance during testing |
| Dropping RLS, disabling triggers, changing table/extension ownership | S11 — manufacturing a pass |
| Hand-editing `checksums.sha256` | Rebuild with `node tools/build-package.mjs` instead |
