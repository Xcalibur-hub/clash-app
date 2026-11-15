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
