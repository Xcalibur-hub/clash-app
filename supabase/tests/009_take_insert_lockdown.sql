-- ============================================================================
-- Take INSERT lockdown tests (pgTAP). Self-contained; run: supabase test db
-- Proves `create_take` is the only authenticated path for creating a Take:
-- a raw client INSERT is denied, while the RPC still derives the author and
-- stamps the server-owned fields.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: two users.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');

update public.profiles set id = 'tl-alice', handle = 'tl_alice', name = 'TL Alice', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set id = 'tl-bob', handle = 'tl_bob', name = 'TL Bob', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000a2';

-- ── privileges: no direct INSERT for any API role ───────────────────────────
select is(has_table_privilege('authenticated', 'public.takes', 'INSERT'), false, 'authenticated has no table INSERT on takes');
select is(has_column_privilege('authenticated', 'public.takes', 'text', 'INSERT'), false, 'authenticated has no column INSERT on takes.text');
select is(has_column_privilege('authenticated', 'public.takes', 'media_url', 'INSERT'), false, 'authenticated has no column INSERT on takes.media_url');
select is(has_column_privilege('authenticated', 'public.takes', 'author_id', 'INSERT'), false, 'authenticated has no column INSERT on takes.author_id');
select is(has_column_privilege('authenticated', 'public.takes', 'media_kind', 'INSERT'), false, 'authenticated has no column INSERT on takes.media_kind');
select is(has_table_privilege('anon', 'public.takes', 'INSERT'), false, 'anon has no INSERT on takes');

-- ── create_take stays executable by authenticated, not anon ─────────────────
select is(has_function_privilege('authenticated', 'public.create_take(public.hood_id, text, text, text, text)', 'EXECUTE'), true, 'authenticated can call create_take');
select is(has_function_privilege('anon', 'public.create_take(public.hood_id, text, text, text, text)', 'EXECUTE'), false, 'anon cannot call create_take');

-- ── server-owned fields remain client non-writable ──────────────────────────
select is(has_column_privilege('authenticated', 'public.takes', 'expires_at', 'INSERT'), false, 'expires_at is not client INSERT-able');
select is(has_column_privilege('authenticated', 'public.takes', 'status', 'INSERT'), false, 'status is not client INSERT-able');
select is(has_column_privilege('authenticated', 'public.takes', 'reactions_count', 'INSERT'), false, 'reactions_count is not client INSERT-able');
select is(has_column_privilege('authenticated', 'public.takes', 'clashes_count', 'INSERT'), false, 'clashes_count is not client INSERT-able');
select is(has_column_privilege('authenticated', 'public.takes', 'status', 'UPDATE'), false, 'status is not client UPDATE-able');

-- ── existing read/update/delete surface is unchanged ────────────────────────
select is(has_table_privilege('authenticated', 'public.takes', 'SELECT'), true, 'authenticated keeps SELECT on takes');
select is(has_column_privilege('authenticated', 'public.takes', 'text', 'UPDATE'), true, 'authenticated keeps UPDATE on takes.text');
select is(has_column_privilege('authenticated', 'public.takes', 'media_url', 'UPDATE'), true, 'authenticated keeps UPDATE on takes.media_url');
select is(has_table_privilege('authenticated', 'public.takes', 'DELETE'), true, 'authenticated keeps DELETE on takes (moderation)');

-- ── the raw-insert bypass is now denied ─────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$ insert into public.takes (id, author_id, hood, text, media_url, media_kind) values ('tl-bypass', 'tl-alice', 'techtakes', 'bypass attempt', 'https://evil.example/x.jpg', 'image') $$, '42501', null, 'raw INSERT with an arbitrary media_url is denied');
select throws_ok($$ insert into public.takes (id, author_id, hood, text) values ('tl-forge', 'tl-bob', 'techtakes', 'forged author attempt') $$, '42501', null, 'raw INSERT forging author_id is denied');
select throws_ok($$ insert into public.takes (id, author_id, hood, text, expires_at, status, reactions_count) values ('tl-owned', 'tl-alice', 'techtakes', 'server-owned attempt', now() + interval '99 hours', 'active', 9999) $$, '42501', null, 'raw INSERT with server-owned fields is denied');
reset role;

select is((select count(*)::int from public.takes where id in ('tl-bypass', 'tl-forge', 'tl-owned')), 0, 'no raw INSERT reached the table');

-- ── create_take still works, and the author is derived server-side ──────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$ select public.create_take('techtakes', 'legit take via rpc') $$, 'create_take still inserts after the revoke');
reset role;

select is((select count(*)::int from public.takes where text = 'legit take via rpc'), 1, 'the RPC-created Take exists');
select is((select author_id from public.takes where text = 'legit take via rpc'), 'tl-alice', 'author is derived from the session, not the client');
select is((select status::text from public.takes where text = 'legit take via rpc'), 'active', 'status is server-stamped');
select ok((select expires_at > now() and expires_at <= now() + interval '24 hours' from public.takes where text = 'legit take via rpc'), 'expires_at is server-stamped within 24h');
select is((select reactions_count from public.takes where text = 'legit take via rpc'), 0, 'reactions_count is server-owned');
select is((select clashes_count from public.takes where text = 'legit take via rpc'), 0, 'clashes_count is server-owned');

-- ── media validation is still enforced through the RPC ──────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$ select public.create_take('techtakes', 'with unknown media', 'm-does-not-exist', 'https://x/y.jpg') $$, 'P0002', null, 'create_take still rejects unknown media');
reset role;

select * from finish();
rollback;
