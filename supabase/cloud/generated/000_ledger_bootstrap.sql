-- CLASH cloud — step 0: CLI-shaped migration ledger.
-- Safe to re-run: creates only. If the Supabase CLI already made this table,
-- every statement here is a no-op. Column set is a superset of the columns the
-- CLI has used across versions (version/statements/name/created_by/idempotency_key);
-- extra nullable columns are ignored by older CLIs.
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version         text not null primary key,
  statements      text[],
  name            text,
  created_by      text,
  idempotency_key text
);

alter table supabase_migrations.schema_migrations
  add column if not exists statements text[],
  add column if not exists name text,
  add column if not exists created_by text,
  add column if not exists idempotency_key text;

-- Round 8: exclusive-writer claim. One row, one key. deploy.ps1 inserts its run
-- id here before the first migration; a second runner started at the same time
-- collides on the primary key and stops instead of executing anything. The row
-- is released only after postflight passes, so a crashed run leaves a claim that
-- blocks the next run until a human inspects it (ROLLBACK.md T1).
create table if not exists supabase_migrations.clash_deploy_claim (
  claim_key   text not null primary key,
  run_id      text not null,
  started_utc timestamptz not null
);
