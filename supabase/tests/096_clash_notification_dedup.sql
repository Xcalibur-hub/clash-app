-- Step 4E: structural dedup + duplicate diagnostic (pgTAP, transaction-scoped)
begin;
select no_plan();
set local search_path = public, extensions;
reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000dd001');
update public.profiles set id='dd-fan', handle='dd_fan', name='DD Fan'
 where auth_user_id='00000000-0000-0000-0000-0000000dd001';
insert into public.takes (id, author_id, hood, text)
values ('dd-take','dd-fan','techtakes','Dedup proposition');
insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at)
values ('dd-clash','dd-take','dd-fan','open', now() - interval '5 min', now() + interval '1 hour');

-- 1. The unique index is partial and unique -------------------------------
select is((select indisunique from pg_index where indexrelid = 'public.notifications_clash_result_unique'::regclass), true,
  'clash_result index is unique');
select matches((select pg_get_expr(indpred, indrelid) from pg_index where indexrelid = 'public.notifications_clash_result_unique'::regclass),
  'clash_result', 'index is partial to clash_result notifications');

-- 2. The dedupe trigger makes a second delivery a no-op -------------------
insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
values ('dd-n1','dd-fan',null,'clash_result','clash','dd-clash');
insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
values ('dd-n2','dd-fan',null,'clash_result','clash','dd-clash');
select is((select count(*)::int from public.notifications
            where recipient_id='dd-fan' and kind='clash_result' and entity_id='dd-clash'), 1,
  'every writer is limited to one result notification per recipient and verdict');

-- 3. A historical duplicate is detectable exactly as the deployment guard
--    would see it: simulate an upgraded-from-4A database (no unique index, no
--    dedupe trigger) inside this rolled-back transaction.
alter table public.notifications disable trigger notifications_dedupe_clash_result;
drop index if exists public.notifications_clash_result_unique;
insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
values ('dd-n3','dd-fan',null,'clash_result','clash','dd-clash');
select is((select count(*)::int from (
            select recipient_id, entity_id
              from public.notifications
             where kind='clash_result' and entity_type='clash'
             group by 1,2 having count(*) > 1) d), 1,
  'deployment diagnostic detects incompatible historical duplicates');

select finish();
rollback;
