create table public.arena_interest_preferences (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  topic_ids text[] not null default '{}',
  completion_version integer not null default 1 check (completion_version=1),
  skipped boolean not null,
  revision bigint not null default 1 check (revision>0),
  updated_at timestamptz not null default now(),
  constraint interest_selection_count check ((skipped and cardinality(topic_ids)=0)
    or (not skipped and cardinality(topic_ids) between 3 and 5))
);
alter table public.arena_interest_preferences enable row level security;
create policy interests_owner_read on public.arena_interest_preferences for select to authenticated
 using (auth_user_id=(select auth.uid()));
revoke all on public.arena_interest_preferences from public,anon,authenticated;
grant select on public.arena_interest_preferences to authenticated;
-- Deployment boundary: preserve all returning accounts without forcing a new flow.
insert into public.arena_interest_preferences(auth_user_id,skipped)
 select id,true from auth.users;

create function public.get_my_arena_interests() returns jsonb
 language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('topicIds',p.topic_ids,'version',p.completion_version,
   'skipped',p.skipped,'revision',p.revision) from public.arena_interest_preferences p
   where p.auth_user_id=auth.uid()),
   jsonb_build_object('topicIds','[]'::jsonb,'version',0,'skipped',false,'revision',0));
$$;

create function public.save_my_arena_interests(p_topic_ids text[],p_skip boolean,p_expected_revision bigint)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_revision bigint; v_count integer;
begin
 if v_uid is null then raise exception 'Sign in to save interests' using errcode='42501'; end if;
 if p_topic_ids is null or p_skip is null or p_expected_revision is null then
   raise exception 'Invalid interest selection' using errcode='22023'; end if;
 v_count:=cardinality(p_topic_ids);
 if array_ndims(p_topic_ids)>1 or (p_skip and v_count<>0)
   or (not p_skip and v_count not between 3 and 5)
   or exists(select 1 from unnest(p_topic_ids) t where t is null)
   or (select count(distinct t) from unnest(p_topic_ids) t)<>v_count then
   raise exception 'Choose 3 to 5 different interests, or explicitly skip' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_topic_ids) t where not exists(
   select 1 from public.arena_interests i where i.id=t and i.active)) then
   raise exception 'Unknown or inactive interest' using errcode='22023'; end if;
 -- Serialize both first inserts and replacements, without accepting an owner ID.
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,34001));
 select revision into v_revision from public.arena_interest_preferences where auth_user_id=v_uid for update;
 if coalesce(v_revision,0)<>p_expected_revision then
   raise exception 'Interests changed on another device; reload before saving' using errcode='40001'; end if;
 insert into public.arena_interest_preferences(auth_user_id,topic_ids,skipped,revision)
 values(v_uid,array(select t from unnest(p_topic_ids) t order by t),p_skip,1)
 on conflict(auth_user_id) do update set topic_ids=excluded.topic_ids,skipped=excluded.skipped,
   revision=public.arena_interest_preferences.revision+1,updated_at=now();
 return public.get_my_arena_interests();
end;
$$;
revoke all on function public.get_my_arena_interests() from public,anon,service_role;
revoke all on function public.save_my_arena_interests(text[],boolean,bigint) from public,anon,service_role;
grant execute on function public.get_my_arena_interests(),public.save_my_arena_interests(text[],boolean,bigint) to authenticated;
notify pgrst,'reload schema';
