-- E3.2.8: executable retention contracts for moderator audit trails.
-- DISPOSABLE DATABASE ONLY. See docs/evidence/explore-e328/REPORT.md.
begin;
set local search_path = public, extensions;
set local statement_timeout = '15s';
do $$ begin
  if current_database() !~ '^clash_e325_[a-zA-Z0-9_]+$'
     or current_setting('test.e325_disposable', true) is distinct from 'on' then
    raise exception '098 requires an explicitly authorized disposable clash_e325_* database';
  end if;
end $$;
select no_plan();
reset role;
select set_config('request.jwt.claims', null, true);

-- Catalog: the retention shape is declared, not assumed.
select has_column('public','meet_moderation_reads','moderator_ref','read audit keeps an actor snapshot');
select has_column('public','moderation_actions','moderator_ref','action log keeps an actor snapshot');
select is((select is_nullable from information_schema.columns where table_schema='public'
  and table_name='meet_moderation_reads' and column_name='moderator_id'),'YES','read audit actor link is nullable');
select is((select is_nullable from information_schema.columns where table_schema='public'
  and table_name='moderation_actions' and column_name='moderator_id'),'YES','action log actor link is nullable');
select is((select is_nullable from information_schema.columns where table_schema='public'
  and table_name='meet_moderation_reads' and column_name='moderator_ref'),'NO','read audit snapshot is mandatory');
select is((select is_nullable from information_schema.columns where table_schema='public'
  and table_name='moderation_actions' and column_name='moderator_ref'),'NO','action log snapshot is mandatory');
select is((select confdeltype::text from pg_constraint where conname='meet_moderation_reads_moderator_fk'
  and conrelid='public.meet_moderation_reads'::regclass),'n','profile deletion nulls the read audit link');
select is((select confdeltype::text from pg_constraint where conname='moderation_actions_moderator_fk'
  and conrelid='public.moderation_actions'::regclass),'n','profile deletion nulls the action log link');
select is((select count(*)::int from pg_constraint where conrelid='public.meet_moderation_reads'::regclass
  and contype='f'),1,'read audit keeps exactly one foreign key');
select is((select count(*)::int from pg_constraint where conrelid='public.meet_moderation_reads'::regclass
  and contype='c' and conname like '%actor_ref%'),2,'snapshot shape and binding are both enforced');
select has_trigger('public','meet_moderation_reads','meet_moderation_reads_stamp_actor','read audit stamps its actor');
select has_trigger('public','meet_moderation_reads','meet_moderation_reads_append_only','read audit is append-only');
select has_trigger('public','meet_moderation_reads','meet_moderation_reads_no_truncate','read audit resists truncate');
select has_trigger('public','moderation_actions','moderation_actions_stamp_actor','action log stamps its actor');
select has_trigger('public','moderation_actions','moderation_actions_append_only','action log is append-only');
select has_trigger('public','moderation_actions','moderation_actions_no_truncate','action log resists truncate');
select is((select relrowsecurity from pg_class where oid='public.meet_moderation_reads'::regclass),true,'read audit RLS is still enabled');
select is((select relrowsecurity from pg_class where oid='public.moderation_actions'::regclass),true,'action log RLS is still enabled');

-- Privileges: the API key may read the trail, never rewrite it.
select is(has_table_privilege('service_role','public.meet_moderation_reads','DELETE'),false,'service key cannot delete read audit');
select is(has_table_privilege('service_role','public.meet_moderation_reads','UPDATE'),false,'service key cannot rewrite read audit');
select is(has_table_privilege('service_role','public.meet_moderation_reads','INSERT'),false,'service key cannot fabricate read audit');
select is(has_table_privilege('service_role','public.meet_moderation_reads','TRUNCATE'),false,'service key cannot truncate read audit');
select is(has_table_privilege('service_role','public.moderation_actions','DELETE'),false,'service key cannot delete the action log');
select is(has_table_privilege('service_role','public.moderation_actions','UPDATE'),false,'service key cannot rewrite the action log');
select is(has_table_privilege('service_role','public.moderation_actions','INSERT'),false,'service key cannot fabricate the action log');
select is(has_table_privilege('service_role','public.moderation_actions','TRUNCATE'),false,'service key cannot truncate the action log');
select is(has_table_privilege('authenticated','public.meet_moderation_reads','SELECT'),true,'staff-visible read grant is intact');
select is(has_table_privilege('authenticated','public.meet_moderation_reads','DELETE'),false,'client cannot delete read audit');
select is(has_table_privilege('authenticated','public.meet_moderation_reads','INSERT'),false,'client cannot fabricate read audit');
select is(has_table_privilege('anon','public.meet_moderation_reads','SELECT'),false,'anonymous cannot read the trail');
select is(has_table_privilege('anon','public.moderation_actions','SELECT'),false,'anonymous cannot read the action log');
select is(has_function_privilege('authenticated','public.stamp_moderation_actor()','EXECUTE'),false,'the stamp trigger is not an RPC');
select is(has_function_privilege('authenticated','public.guard_moderation_audit()','EXECUTE'),false,'the guard trigger is not an RPC');


-- Fixtures: one moderator, one viewer, one audited session.
insert into auth.users(id) values
  ('e3280000-0000-0000-0000-000000000001'),
  ('e3280000-0000-0000-0000-000000000002');
update public.profiles set id='e328-moderator', handle='e328_moderator', name='E328 moderator',
  public_country_code='IN' where auth_user_id='e3280000-0000-0000-0000-000000000001';
update public.profiles set id='e328-viewer', handle='e328_viewer', name='E328 viewer',
  public_country_code='IN' where auth_user_id='e3280000-0000-0000-0000-000000000002';
update public.profiles set role='moderator' where id='e328-moderator';
insert into public.meet_sessions(id,mode,expires_at)
  values ('e328-audited','ANYWHERE',now()+interval '5 minutes');

-- The production write path writes the row: the staff evidence RPC.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3280000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.moderate_meet_session('e328-audited')$$,'staff evidence read succeeds');
reset role;
select is((select count(*)::int from public.meet_moderation_reads where session_id='e328-audited'),1,
  'the staff read is audited exactly once');
select set_config('test.e328_ref',
  (select moderator_ref from public.meet_moderation_reads where session_id='e328-audited'), true);
select matches(current_setting('test.e328_ref'),'^mod_[0-9a-f]{64}$','the snapshot has the documented shape');
select is(current_setting('test.e328_ref'),
  'mod_'||encode(sha256(convert_to('e328-moderator','UTF8')),'hex'),
  'the snapshot is the deterministic hash of the actor id');

-- A caller cannot choose the snapshot: the stamp trigger overwrites input.
select lives_ok($$insert into public.meet_moderation_reads(moderator_id,moderator_ref,session_id)
  values('e328-moderator',
    'mod_0000000000000000000000000000000000000000000000000000000000000000','e328-forged')$$,
  'a supplied snapshot is accepted as input');
select is((select moderator_ref from public.meet_moderation_reads where session_id='e328-forged'),
  current_setting('test.e328_ref'),'the trigger replaced the supplied snapshot');
select throws_ok($$insert into public.meet_moderation_reads(moderator_id,session_id)
  values(null,'e328-noactor')$$,'23502',null,'an audit row cannot exist without an actor');

-- The shared action log obeys the same contract.
insert into public.moderation_actions(id,moderator_id,target_kind,target_id,action,reason)
  values('e328-action','e328-moderator','meet_session','e328-audited','remove_content','E328 evidence');
select is((select moderator_ref from public.moderation_actions where id='e328-action'),
  current_setting('test.e328_ref'),'the action log stamps the same snapshot');

-- Immutability.
select throws_ok($$update public.meet_moderation_reads set session_id='e328-rewritten'
  where session_id='e328-audited'$$,'42501',null,'read evidence cannot be rewritten');
select throws_ok($$update public.meet_moderation_reads
  set moderator_ref=(select moderator_ref from public.meet_moderation_reads where session_id='e328-forged')
  where session_id='e328-audited'$$,'42501',null,'the actor snapshot cannot be re-pointed');
select throws_ok($$update public.meet_moderation_reads set moderator_id=null
  where session_id='e328-audited'$$,'42501',null,'a caller cannot anonymise by hand either');
select throws_ok($$update public.moderation_actions set reason='rewritten'
  where id='e328-action'$$,'42501',null,'the action log cannot be rewritten');

-- A future mistaken GRANT must not turn the trail into client-deletable data.
create role e328_probe nosuperuser bypassrls;
grant usage on schema public to e328_probe;
grant delete, truncate on public.meet_moderation_reads to e328_probe;
set local role e328_probe;
select throws_ok($$delete from public.meet_moderation_reads where session_id='e328-audited'$$,
  '42501',null,'delete privilege alone cannot erase audit rows');
select throws_ok($$truncate public.meet_moderation_reads$$,
  '42501',null,'truncate privilege alone cannot erase audit rows');
reset role;

-- Moderator deletion is not deletion of their evidence.
select set_config('test.e328_rows',(select count(*)::text from public.meet_moderation_reads),true);
delete from public.profiles where id='e328-moderator';
select is((select count(*)::text from public.meet_moderation_reads),current_setting('test.e328_rows'),
  'deleting the moderator keeps every read audit row');
select is((select count(*)::int from public.meet_moderation_reads where moderator_id is null),2,
  'the delete rule nulls the actor link instead of removing the row');
select is((select count(*)::int from public.meet_moderation_reads
  where moderator_ref=current_setting('test.e328_ref')),2,'the pseudonymous actor history survives');
select is((select moderator_ref from public.meet_moderation_reads where session_id='e328-audited'),
  current_setting('test.e328_ref'),'the snapshot is unchanged by the deletion');
select is((select count(*)::int from public.meet_moderation_reads where session_id='e328-audited'),1,
  'the evidence still names its session');
select is((select count(*)::int from public.moderation_actions where id='e328-action'),1,
  'the moderation action survives moderator deletion');
select ok((select moderator_id from public.moderation_actions where id='e328-action') is null,
  'the action actor link is nulled');
select ok((select moderator_id from public.meet_moderation_reads
  where session_id='e328-audited') is null,'the read actor link is nulled');

-- Outliving the session it describes.
delete from public.meet_sessions where id='e328-audited';
select is((select count(*)::int from public.meet_moderation_reads where session_id='e328-audited'),1,
  'the read audit outlives the session it describes');

-- RLS still keeps the trail staff-only.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3280000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.meet_moderation_reads),0,'an ordinary user still cannot read the trail');
select is((select count(*)::int from public.moderation_actions),0,'an ordinary user still cannot read the action log');
reset role;

-- Retention purges stay a deliberate owner action (policy belongs to E3.7).
select lives_ok($$delete from public.meet_moderation_reads where session_id='e328-forged'$$,
  'an owner-level retention purge is still possible');
select is((select count(*)::int from public.meet_moderation_reads where session_id='e328-forged'),0,
  'the purge removed only the chosen row');
select is((select count(*)::int from public.meet_moderation_reads where session_id='e328-audited'),1,
  'the purge left the retained evidence intact');

select finish();
rollback;
