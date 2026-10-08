create function public.get_arena_interest_catalogue() returns jsonb
 language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.display_name,
   'description',i.description,'icon',i.icon,'hoods',
   (select jsonb_agg(m.hood order by m.hood) from public.arena_interest_hoods m where m.interest_id=i.id))
   order by i.position),'[]'::jsonb) from public.arena_interests i where i.active;
$$;
-- Initial result is one bounded ranking snapshot. Subsequent pages accept slices
-- of its IDs, preserving order even when engagement changes. IDs never bypass RLS.
create function public.rank_arena_for_you(p_ids text[] default null) returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in for personalized discovery' using errcode='42501';end if;
 if p_ids is not null then
   if cardinality(p_ids)>60 or array_ndims(p_ids)>1 then
     raise exception 'Feed page exceeds 60 items' using errcode='22023';end if;
   select coalesce(jsonb_agg(to_jsonb(t) order by a.n),'[]'::jsonb) into v_result
   from (select id,min(n) n from unnest(p_ids) with ordinality x(id,n) group by id) a
   join public.takes t on t.id=a.id
   where t.status='active' and t.expires_at>now() and t.created_at<=now() and not t.is_runtime_fixture;
   return v_result;
 end if;
 with candidates as materialized (
   select t.* from public.takes t
   where t.status='active' and t.expires_at>now() and t.created_at<=now() and not t.is_runtime_fixture
   order by t.created_at desc,t.id desc limit 240
 ), scores as (
   select t,exists(select 1 from public.arena_interest_hoods m
     join public.arena_interest_preferences p on p.auth_user_id=auth.uid()
     where m.hood=t.hood and m.interest_id=any(p.topic_ids)) relevant,
     12.0/(1+greatest(0,extract(epoch from now()-t.created_at)/3600))
     +2*ln(1+greatest(0,t.reactions_count)+3*greatest(0,t.clashes_count))
     +case when exists(select 1 from public.clashes c where c.take_id=t.id and c.status='open'
       and c.opens_at<=now() and c.closes_at>now()) then 4 else 0 end score
   from candidates t
 ), lanes as (
   select *,row_number() over(partition by relevant order by score desc,(t).created_at desc,(t).id) n
   from scores
 ), ranked as (
   select t,case when relevant then (n-1)/2 else n-1 end bucket,relevant,n from lanes order by
     case when relevant then (n-1)/2 else n-1 end,
     case when relevant then 0 else 1 end,n,(t).id limit 60
 ) select coalesce(jsonb_agg(to_jsonb(t) order by bucket,relevant desc,n,(t).id),'[]'::jsonb) into v_result from ranked;
 return v_result;
end;
$$;
revoke all on function public.get_arena_interest_catalogue(),public.rank_arena_for_you(text[]) from public,anon,service_role;
grant execute on function public.get_arena_interest_catalogue(),public.rank_arena_for_you(text[]) to authenticated;
notify pgrst,'reload schema';
