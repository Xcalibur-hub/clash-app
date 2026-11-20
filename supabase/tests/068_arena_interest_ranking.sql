begin;
select no_plan();
select ok(to_regclass('public.arena_interest_feed_candidates_idx') is not null,'bounded candidate query has partial recency index');
insert into auth.users(id) values('00000000-0000-0000-0000-000000006801'),('00000000-0000-0000-0000-000000006802'),('00000000-0000-0000-0000-000000006803');
update public.profiles set id='interest-feed-viewer' where auth_user_id='00000000-0000-0000-0000-000000006801';
update public.profiles set id='interest-feed-author' where auth_user_id='00000000-0000-0000-0000-000000006802';
update public.profiles set id='interest-feed-hidden' where auth_user_id='00000000-0000-0000-0000-000000006803';
insert into public.takes(id,author_id,hood,text,reactions_count) values
 ('interest-feed-tech','interest-feed-author','techtakes','Transactional ranking test',20),
 ('interest-feed-film','interest-feed-author','movies','Transactional ranking test',5),
 ('interest-feed-sport','interest-feed-author','football','Transactional diversity test',100),
 ('interest-feed-fixture','interest-feed-author','techtakes','Excluded runtime fixture',500),
 ('interest-feed-removed','interest-feed-author','techtakes','Excluded removed Take',500),
 ('interest-feed-future','interest-feed-author','techtakes','Excluded unpublished future Take',500),
 ('interest-feed-expired','interest-feed-author','techtakes','Excluded expired Take',500),
 ('interest-feed-hidden','interest-feed-hidden','techtakes','Excluded hidden author',500);
update public.takes set is_runtime_fixture=true where id='interest-feed-fixture';
update public.takes set status='removed' where id='interest-feed-removed';
update public.takes set created_at=now()+interval '1 hour' where id='interest-feed-future';
update public.takes set created_at=now()-interval '2 hours',expires_at=now()-interval '1 minute' where id='interest-feed-expired';
insert into public.mutes(muter_id,muted_id) values('interest-feed-viewer','interest-feed-hidden');
select ok(not has_function_privilege('anon','public.rank_arena_for_you(text[])','execute'),'anonymous personalized feed denied');
select ok(not (select prosecdef from pg_proc where oid='public.rank_arena_for_you(text[])'::regprocedure),'ranking applies caller RLS');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000006801","role":"authenticated"}',true);
set local role authenticated;
select public.save_my_arena_interests(array['technology','film','education'],false,0);
select is(public.rank_arena_for_you()->0->>'id','interest-feed-tech','relevance prioritizes tech');
select is(public.rank_arena_for_you()->1->>'id','interest-feed-film','second relevant item retained');
select is(public.rank_arena_for_you()->2->>'id','interest-feed-sport','general content interleaved for diversity');
select is((select count(*)::integer from jsonb_array_elements(public.rank_arena_for_you()) e where e->>'id' in
 ('interest-feed-fixture','interest-feed-removed','interest-feed-future','interest-feed-expired','interest-feed-hidden')),0,'fixtures removed future expired muted excluded');
select is(public.rank_arena_for_you(array['interest-feed-film','interest-feed-tech'])->0->>'id','interest-feed-film','snapshot page retains supplied server order');
select is(jsonb_array_length(public.rank_arena_for_you(array['interest-feed-tech','interest-feed-tech'])),1,'page deduplicates');
select throws_ok($$select public.rank_arena_for_you(array_fill('interest-feed-tech'::text,array[61]))$$,'22023',null,'page bounded at 60');
select public.save_my_arena_interests('{}',true,1);
select is(public.rank_arena_for_you()->0->>'id','interest-feed-sport','skip receives honest engagement-based general feed');
reset role;
update public.takes set reactions_count=999 where id='interest-feed-tech';
set local role authenticated;
select is(public.rank_arena_for_you(array['interest-feed-film','interest-feed-tech'])->0->>'id','interest-feed-film','engagement updates cannot reshuffle snapshot page');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('interest-feed-viewer','interest-feed-author');
set local role authenticated;
select is(jsonb_array_length(public.rank_arena_for_you(array['interest-feed-film','interest-feed-tech'])),0,'pagination rechecks current block visibility');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000006802","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_my_arena_interests()->>'version','0','ranking account switch cannot read preferences');
select is(jsonb_array_length(public.rank_arena_for_you(array['interest-feed-hidden'])),1,'account switch applies own visibility');
reset role;
select set_config('request.jwt.claims','{}',true);
insert into public.takes(id,author_id,hood,text) select 'interest-feed-bound-'||n,'interest-feed-author','movies','Transactional bounded batch '||n from generate_series(1,70) n;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000006802","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.rank_arena_for_you()),60,'initial ranked snapshot bounded');
reset role;
select * from finish();
rollback;
