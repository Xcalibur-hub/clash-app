-- Revision conflicts are domain conflicts, not retryable transaction serialization errors.
create or replace function public.save_my_arena_interests(p_topic_ids text[],p_skip boolean,p_expected_revision bigint)
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
   raise exception 'Interests changed on another device; reload before saving' using errcode='PT409'; end if;
 insert into public.arena_interest_preferences(auth_user_id,topic_ids,skipped,revision)
 values(v_uid,array(select t from unnest(p_topic_ids) t order by t),p_skip,1)
 on conflict(auth_user_id) do update set topic_ids=excluded.topic_ids,skipped=excluded.skipped,
   revision=public.arena_interest_preferences.revision+1,updated_at=now();
 return public.get_my_arena_interests();
end;
$$;
notify pgrst,'reload schema';
