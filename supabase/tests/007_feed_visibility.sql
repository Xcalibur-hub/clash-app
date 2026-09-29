-- ============================================================================
-- Feed visibility tests (pgTAP). Self-contained; run: supabase test db
-- Verifies block (both directions) and mute hide an author's Takes from an
-- authenticated viewer, that guests still see everything, and that an unblock
-- restores visibility. All assertions target the fixture Takes by id, so the
-- committed seed data never interferes.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: four auth users → four profiles.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');

update public.profiles set id = 't-alice', handle = 'alice_t', name = 'Alice', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000001';
update public.profiles set id = 't-bob', handle = 'bob_t', name = 'Bob', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000002';
update public.profiles set id = 't-carol', handle = 'carol_t', name = 'Carol', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000003';
update public.profiles set id = 't-dave', handle = 'dave_t', name = 'Dave', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000004';

-- Three live fixture Takes from three different authors.
insert into public.takes (id, author_id, hood, text, status, expires_at) values
  ('tk-bob',   't-bob',   'techtakes', 'bob fixture take',   'active', now() + interval '1 hour'),
  ('tk-carol', 't-carol', 'techtakes', 'carol fixture take', 'active', now() + interval '1 hour'),
  ('tk-dave',  't-dave',  'techtakes', 'dave fixture take',  'active', now() + interval '1 hour');

-- ── guests see the whole public Arena ────────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"anon"}', true);
select is((select count(*)::int from public.takes where id in ('tk-bob', 'tk-carol', 'tk-dave')), 3, 'guest sees every fixture Take');
reset role;

-- ── a block in either direction hides the author's Takes ────────────────────
insert into public.blocks (blocker_id, blocked_id) values ('t-alice', 't-bob');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.takes where id = 'tk-bob'), 0, 'blocked author Take hidden');
select is((select count(*)::int from public.takes where id in ('tk-carol', 'tk-dave')), 2, 'unrelated fixture Takes still visible');
reset role;

-- ── a mute hides the author's Takes too ─────────────────────────────────────
insert into public.mutes (muter_id, muted_id) values ('t-alice', 't-carol');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.takes where id = 'tk-carol'), 0, 'muted author Take hidden');
select is((select count(*)::int from public.takes where id = 'tk-dave'), 1, 'unrelated fixture Take still visible');
reset role;

-- ── reverse block direction is honoured ─────────────────────────────────────
insert into public.blocks (blocker_id, blocked_id) values ('t-dave', 't-alice');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.takes where id = 'tk-dave'), 0, 'someone who blocks the viewer is hidden too');
reset role;

-- ── unblocking restores visibility ──────────────────────────────────────────
delete from public.blocks where blocker_id = 't-alice' and blocked_id = 't-bob';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.takes where id = 'tk-bob'), 1, 'unblocked author Take visible again');
reset role;

-- ── block/mute relationship rows stay private ───────────────────────────────
select is(has_table_privilege('anon', 'public.blocks', 'SELECT'), false, 'block relationships are not public');
select is(has_table_privilege('anon', 'public.mutes', 'SELECT'), false, 'mute relationships are not public');

select * from finish();
rollback;

