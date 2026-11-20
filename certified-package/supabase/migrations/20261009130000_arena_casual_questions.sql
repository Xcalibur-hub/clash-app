-- Questions remain Takes: existing discussion, safety, media and discovery apply.
alter table public.takes
 add column question_a text,
 add column question_b text,
 add column question_topic_id text references public.arena_interests(id),
 add column question_origin text,
 add column question_source_url text,
 add column question_source_published_at timestamptz,
 add column question_review_status text;
alter table public.takes add constraint arena_question_shape check (
 (question_a is null and question_b is null and question_topic_id is null and question_origin is null
   and question_source_url is null and question_source_published_at is null and question_review_status is null)
 or (question_a is not null and question_b is not null
   and char_length(btrim(question_a)) between 1 and 60 and char_length(btrim(question_b)) between 1 and 60
   and lower(btrim(question_a))<>lower(btrim(question_b))
   and question_a ~ '[[:alnum:]]' and question_b ~ '[[:alnum:]]'
   and question_origin in ('human','editorial') and question_origin is not null
   and question_review_status in ('not_required','approved') and question_review_status is not null
   and (question_origin<>'editorial' or (question_review_status='approved' and question_source_url is not null))
   and (question_source_url is null or (char_length(question_source_url)<=2048 and question_source_url ~ '^https://[^[:space:]]+$'))));
-- Existing UPDATE column grants do not include any question/provenance fields.
revoke insert(question_a,question_b,question_topic_id,question_origin,question_source_url,question_source_published_at,question_review_status),
 update(question_a,question_b,question_topic_id,question_origin,question_source_url,question_source_published_at,question_review_status)
 on public.takes from anon,authenticated;

create table public.arena_question_votes (
 take_id text not null references public.takes(id) on delete cascade,
 voter_id text not null references public.profiles(id) on delete cascade,
 side text not null check(side in ('A','B')),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(take_id,voter_id)
);
create index arena_question_vote_totals on public.arena_question_votes(take_id,side);
alter table public.arena_question_votes enable row level security;
revoke all on public.arena_question_votes from public,anon,authenticated,service_role;
create index arena_question_discovery on public.takes(created_at desc,id desc)
 where question_a is not null and status='active' and not is_runtime_fixture;

create function public.get_arena_question(p_take_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.takes%rowtype; me text:=public.my_profile_id(); a bigint; b bigint; mine public.arena_question_votes%rowtype;
begin
 if me is null then raise exception 'Sign in to vote' using errcode='42501'; end if;
 select * into t from public.takes where id=p_take_id;
 if not found or t.question_a is null or not public.arena_take_readable(t.id) then
   raise exception 'Question unavailable' using errcode='42501'; end if;
 select count(*) filter(where side='A'),count(*) filter(where side='B') into a,b
   from public.arena_question_votes where take_id=t.id;
 select * into mine from public.arena_question_votes where take_id=t.id and voter_id=me;
 return jsonb_build_object('takeId',t.id,'sideA',t.question_a,'sideB',t.question_b,
   'status',case when t.status='active' and clock_timestamp()<t.expires_at then 'open' else 'closed' end,
   'expiresAt',t.expires_at,'countA',a,'countB',b,'total',a+b,'mySide',mine.side,'revision',coalesce(mine.revision,0));
end $$;

create function public.vote_arena_question(p_take_id text,p_side text,p_expected_revision bigint default null,p_expected_auth_uid uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.takes%rowtype; me text:=public.my_profile_id(); mine public.arena_question_votes%rowtype;
begin
 if me is null then raise exception 'Sign in to vote' using errcode='42501'; end if;
 if p_expected_auth_uid is not null and p_expected_auth_uid is distinct from auth.uid() then
   raise exception 'Account changed' using errcode='42501'; end if;
 if p_side is null or p_side not in('A','B') or p_expected_revision<0 then raise exception 'Invalid vote' using errcode='22023'; end if;
 -- Source moderation/expiry and every vote change serialize on the existing Take.
 select * into t from public.takes where id=p_take_id for update;
 if not found or t.question_a is null or not public.arena_take_readable(t.id) then
   raise exception 'Question unavailable' using errcode='42501'; end if;
 if t.status<>'active' or clock_timestamp()>=t.expires_at then raise exception 'Voting is closed' using errcode='P0003'; end if;
 select * into mine from public.arena_question_votes where take_id=t.id and voter_id=me;
 if mine.side=p_side then return public.get_arena_question(t.id); end if;
 if p_expected_revision is not null and p_expected_revision<>coalesce(mine.revision,0) then
   raise exception 'Vote changed. Refresh before choosing again.' using errcode='P0006'; end if;
 perform public.assert_rate_limit(me,'arena_question_vote',30,interval '1 minute');
 perform public.assert_rate_limit(me,'arena_question_vote_hour',120,interval '1 hour');
 insert into public.arena_question_votes(take_id,voter_id,side) values(t.id,me,p_side)
 on conflict(take_id,voter_id) do update set side=excluded.side,
   revision=public.arena_question_votes.revision+1,updated_at=clock_timestamp();
 return public.get_arena_question(t.id);
end $$;

create function public.create_arena_question(p_hood public.hood_id,p_text text,p_side_a text,p_side_b text,
 p_topic_id text default null,p_media_object_id text default null,p_media_url text default null,p_media_poster_url text default null,p_expected_auth_uid uuid default null)
returns setof public.takes language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id(); t public.takes%rowtype;
begin
 if me is null then raise exception 'Sign in to publish' using errcode='42501'; end if;
 if p_expected_auth_uid is not null and p_expected_auth_uid is distinct from auth.uid() then
   raise exception 'Account changed' using errcode='42501'; end if;
 if p_text is null or char_length(btrim(p_text)) not between 1 and 180 or p_text !~ '[[:alnum:]]'
   or p_side_a is null or p_side_b is null or char_length(btrim(p_side_a)) not between 1 and 60
   or char_length(btrim(p_side_b)) not between 1 and 60 or lower(btrim(p_side_a))=lower(btrim(p_side_b))
   or p_side_a !~ '[[:alnum:]]' or p_side_b !~ '[[:alnum:]]' then
   raise exception 'Use a question and two distinct choices (maximum 60 characters each)' using errcode='22023'; end if;
 if p_topic_id is not null and not exists(select 1 from public.arena_interests i join public.arena_interest_hoods h on h.interest_id=i.id
   where i.id=p_topic_id and i.active and h.hood=p_hood) then raise exception 'Topic unavailable in this Hood' using errcode='22023'; end if;
 perform public.assert_rate_limit(me,'arena_question_create',10,interval '1 hour');
 select * into t from public.create_take(p_hood,p_text,p_media_object_id,p_media_url,p_media_poster_url);
 update public.takes set question_a=btrim(p_side_a),question_b=btrim(p_side_b),question_topic_id=p_topic_id,
   question_origin='human',question_review_status='not_required' where id=t.id returning * into t;
 return next t;
end $$;

create function public.list_arena_questions(p_topic_id text default null,p_cursor_at timestamptz default null,
 p_cursor_id text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare items jsonb; last_row jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to explore questions' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 40 or (p_cursor_at is null)<>(p_cursor_id is null) then
   raise exception 'Invalid question page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc),'[]'::jsonb) into items
 from (select t.* from public.takes t where t.question_a is not null and t.status='active' and not t.is_runtime_fixture
   and t.expires_at>now() and t.created_at<=now() and public.arena_take_readable(t.id)
   and (p_topic_id is null or t.question_topic_id=p_topic_id or (t.question_topic_id is null and exists(
     select 1 from public.arena_interest_hoods h where h.interest_id=p_topic_id and h.hood=t.hood)))
   and (p_cursor_at is null or (t.created_at,t.id)<(p_cursor_at,p_cursor_id))
   order by t.created_at desc,t.id desc limit p_limit) t;
 last_row:=items->(jsonb_array_length(items)-1);
 return jsonb_build_object('items',items,'nextCursor',case when jsonb_array_length(items)=p_limit then
   jsonb_build_object('createdAt',last_row->>'created_at','id',last_row->>'id') else null end);
end $$;
revoke all on function public.get_arena_question(text),public.vote_arena_question(text,text,bigint,uuid),
 public.create_arena_question(public.hood_id,text,text,text,text,text,text,text,uuid),
 public.list_arena_questions(text,timestamptz,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_arena_question(text),public.vote_arena_question(text,text,bigint,uuid),
 public.create_arena_question(public.hood_id,text,text,text,text,text,text,text,uuid),
 public.list_arena_questions(text,timestamptz,text,integer) to authenticated;
notify pgrst,'reload schema';
