-- Minimal hosted-like stubs for disposable migration simulation (NOT production).
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists realtime;
create extension if not exists pgcrypto with schema extensions;
-- Align ownership probe with hosted postgres owner allowlist.
do $$ begin
  execute format('alter extension pgcrypto owner to %I', current_user);
exception when others then null;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

-- Storage RLS stubs (policies in migrations may require RLS enabled)
alter table storage.objects enable row level security;

create table if not exists public.schema_migrations (
  version text primary key,
  name text not null,
  statements_json jsonb not null
);

-- Roles commonly referenced
do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticator nologin;
exception when duplicate_object then null;
end $$;

-- Publication + realtime.messages shape used by Arena Crowd/typing policies.
do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null;
end $$;

drop table if exists realtime.messages cascade;
create table realtime.messages (
  id uuid primary key default gen_random_uuid(),
  topic text,
  extension text,
  payload jsonb,
  event text,
  private boolean default true,
  updated_at timestamptz not null default now(),
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $f$
  select nullif(current_setting('realtime.topic', true), '')
$f$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $f$ begin null; end $f$;

create extension if not exists postgis with schema extensions;
