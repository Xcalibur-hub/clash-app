-- Phase 6F.5 — genuine concurrent PostgreSQL sessions for cancel_meet_search vs try_meet_match.
-- Run via scripts/meet-cancel-postgres-concurrency.cjs (two docker exec psql clients).
-- Not pgTAP; prints machine-readable RESULT lines.

\set ON_ERROR_STOP on

-- Shared fixture bootstrap (idempotent cleanup of prior 6f5 concurrent labels)
delete from public.meet_participants where profile_id in ('p6f5_ca','p6f5_cb','p6f5_cc');
delete from public.meet_queue where profile_id in ('p6f5_ca','p6f5_cb','p6f5_cc');
delete from public.meet_sessions where id like 'ms_6f5c_%';
delete from public.profiles where id in ('p6f5_ca','p6f5_cb','p6f5_cc');
delete from auth.users where id in (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
  'cccccccc-cccc-cccc-cccc-cccccccccc03'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'authenticated', 'authenticated', 'ca6f5@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'authenticated', 'authenticated', 'cb6f5@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccc03', 'authenticated', 'authenticated', 'cc6f5@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, auth_user_id, handle, name) values
  ('p6f5_ca', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'p6f5_ca', 'Cancel Conc A'),
  ('p6f5_cb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'p6f5_cb', 'Cancel Conc B'),
  ('p6f5_cc', 'cccccccc-cccc-cccc-cccc-cccccccccc03', 'p6f5_cc', 'Cancel Conc C');

create table if not exists public._6f5_barrier (
  name text primary key,
  flag boolean not null default false,
  note text
);
delete from public._6f5_barrier;
insert into public._6f5_barrier(name, flag) values
  ('hold_ready', false),
  ('cancel_done', false),
  ('match_done', false);

\echo RESULT bootstrap_ok
