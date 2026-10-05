# Arena maintenance scheduler

**Mechanism:** Postgres `pg_cron` (database-native). One job calls the existing
server-authoritative entry point `public.run_maintenance(500)` — no Edge Function,
no HTTP hop, and no service-role key anywhere near the client.

| | |
|---|---|
| Job name | `clash-maintenance` |
| Schedule | `* * * * *` (every minute) |
| Command | `select public.run_maintenance(500)` |
| Runs as | `postgres` (job owner) |
| Database | `postgres` |
| Created by | `supabase/migrations/20260927030000_clash_scheduler.sql` |

`run_maintenance` settles due Clashes, expires stale Takes, prunes rate-limit
history and drives the (still-deferred) media cleanup seam. It is bounded (the
`limit` argument) and idempotent: a repeated run never writes a second verdict,
reputation event or notification, and one failing Clash never blocks the batch.

It also drives **Arena trend snapshots** and the Arena game-layer sweeps:

| Key | What it does |
|--|--|
| `arena_rooms_transitioned` | phase transitions (`transition_due_arena_rooms`) |
| `arena_trends` | `refresh_arena_trend_snapshots(10, 36)` — skipped unless the newest bucket is 9+ minutes old |
| `arena_backup_invites_expired` | retires un-answered Call Backup invitations |
| `arena_fun_moments_awarded` | settled-room crowd moments (entertainment facet) |

Verified on the local stack: `cron.job` holds exactly one active
`clash-maintenance` job (`* * * * *`), `pg_get_functiondef` shows
`run_maintenance` calling `refresh_arena_trend_snapshots`, `cron.job_run_details`
shows a successful run every minute, and calling
`refresh_arena_trend_snapshots(10, 36)` writes one bucket per live topic.

## Apply it

Local:

```bash
npm run supabase:reset     # replays migrations, then seeds
npm run supabase:test      # pgTAP suite (includes the scheduler tests)
```

Hosted (review the diff first — never migrate production blindly):

```bash
supabase link --project-ref <project-ref>
supabase db push           # applies migrations through 0013
```

The migration enables `pg_cron` where the platform allows it, unschedules any
existing `clash-maintenance` job, then schedules exactly one — so it is safe to
re-run or redeploy repeatedly.

## Inspect

```sql
select jobid, jobname, schedule, command, username, active
  from cron.job where jobname = 'clash-maintenance';

select status, return_message, start_time, end_time
  from cron.job_run_details order by start_time desc limit 10;

select public.run_maintenance(0);   -- shape check; limit 0 does no work
```

## Unschedule / recreate safely

```sql
-- stop it
select cron.unschedule(jobid) from cron.job where jobname = 'clash-maintenance';

-- recreate (idempotent)
select cron.schedule('clash-maintenance', '* * * * *', 'select public.run_maintenance(500)');
```

Re-applying the migration does both automatically.

## Security

`run_maintenance` and the batch `settle_due_clashes` are executable only by the
function owner and `service_role` — **not** `anon`, `PUBLIC` or `authenticated`.
The job runs as `postgres`, so no client needs those privileges and no
service-role key is shipped to Expo. The Clash screen keeps its single-Clash
`settle_clash` fallback for a due Clash opened before the next minute tick.

## Verified locally vs still to verify on hosted

Verified on the local stack (pg_cron 1.6, preloaded):

- the extension enables; exactly one `clash-maintenance` job exists; schedule,
  command and `active = true` are correct;
- the job **executes** every minute — `cron.job_run_details` shows successful runs;
- re-running migrations/resets never duplicates the job;
- the pgTAP suite covers the maintenance behaviours and is green.

Still to verify after a hosted deploy:

- `pg_cron` is available/enabled on the project (Dashboard → Database →
  Extensions, or the migration's `create extension if not exists`);
- exactly one job exists and `cron.job_run_details` shows a successful run within
  ~2 minutes;
- the project timezone (UTC) is acceptable for the schedule;
- the Storage cleanup Edge Function seam is still unimplemented, so
  `cleanup_stale_media` only tombstones rows and returns the `{bucket, path}`
  pairs for that future seam.
