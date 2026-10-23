-- E3.5.1 DRAFT: not applied. Reuse private invalidation + authorized reads,
-- rather than trusting client Presence keys or cached channel authorization.
begin;
do $$ begin
  if not exists(select 1 from pg_class where oid='realtime.messages'::regclass and relrowsecurity) then
    raise exception 'Realtime authorization RLS prerequisite missing';
  end if;
end $$;
alter table public.meet_participants add column typing_until timestamptz;

create function public.meet_typing_allowed(p_session_id text)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists (
    select 1 from public.meet_sessions s
    join public.meet_participants me on me.session_id=s.id
    join public.meet_participants peer on peer.session_id=s.id and peer.profile_id<>me.profile_id
    where s.id=p_session_id and s.status='active' and s.expires_at>clock_timestamp()
      and me.profile_id=public.my_profile_id() and me.left_at is null and peer.left_at is null
      and not public.meet_is_blocked(me.profile_id,peer.profile_id)
  );
$$;
revoke all on function public.meet_typing_allowed(text) from public,anon,authenticated,service_role;
grant execute on function public.meet_typing_allowed(text) to authenticated;

create function public.set_meet_typing(p_session_id text,p_typing boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := public.my_profile_id();
begin
  -- Share-lock the canonical row against Leave/Block/sweep, never renew its lease.
  perform 1 from public.meet_sessions s join public.meet_participants p on p.session_id=s.id
    where s.id=p_session_id and p.profile_id=me and p.left_at is null for share of s;
  if not found or not public.meet_typing_allowed(p_session_id) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  if p_typing is null then raise exception 'typing state required' using errcode='22023'; end if;
  perform public.assert_rate_limit(me,'meet_typing_write',60,interval '1 minute');
  update public.meet_participants set typing_until=case when p_typing
    then least(clock_timestamp()+interval '6 seconds',
      (select expires_at from public.meet_sessions where id=p_session_id)) else null end
    where session_id=p_session_id and profile_id=me;
  -- No content, identity, Presence metadata or client-supplied timestamp.
  perform realtime.send('{}'::jsonb,'typing','meet-typing:'||p_session_id,true);
end;
$$;
revoke all on function public.set_meet_typing(text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_meet_typing(text,boolean) to authenticated;

create function public.get_meet_typing(p_session_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := public.my_profile_id(); until_at timestamptz;
begin
  if not public.meet_typing_allowed(p_session_id) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  perform public.assert_rate_limit(me,'meet_typing_read',120,interval '1 minute');
  select least(p.typing_until,s.expires_at) into until_at
    from public.meet_participants p join public.meet_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.profile_id<>me and p.left_at is null
      and p.typing_until>clock_timestamp();
  return jsonb_build_object('typing',until_at>clock_timestamp() and until_at is not null,
    'validForMs',greatest(0,least(6000,coalesce(extract(epoch from (until_at-clock_timestamp()))*1000,0))));
end;
$$;
revoke all on function public.get_meet_typing(text) from public,anon,authenticated,service_role;
grant execute on function public.get_meet_typing(text) to authenticated;

-- Restrictive namespace guards prevent unrelated permissive policies from
-- reopening client Presence, Broadcast publication, or unauthorized reads.
-- Existing Arena topics and service/owner operations are unchanged.
create policy "meet typing read boundary" on realtime.messages as restrictive
for select to authenticated using (case when left(topic,12)='meet-typing:' or left(realtime.topic(),12)='meet-typing:'
  then topic=realtime.topic() and extension='broadcast'
    and public.meet_typing_allowed(substr(topic,13)) else true end);
-- Guests must not need EXECUTE on the authenticated-only helper, including
-- while Realtime evaluates unrelated Arena policies.
create policy "meet typing guest boundary" on realtime.messages as restrictive
for select to anon using (coalesce(left(topic,12),'')<>'meet-typing:'
  and coalesce(left(realtime.topic(),12),'')<>'meet-typing:');
create policy "meet typing no client publication" on realtime.messages as restrictive
for insert to anon,authenticated with check (coalesce(left(topic,12),'')<>'meet-typing:'
  and coalesce(left(realtime.topic(),12),'')<>'meet-typing:');
create policy "active participants receive meet typing hints" on realtime.messages
for select to authenticated using (topic=realtime.topic() and extension='broadcast' and left(realtime.topic(),12)='meet-typing:'
  and public.meet_typing_allowed(substr(realtime.topic(),13)));
-- No Presence SELECT/INSERT and no client Broadcast INSERT policy for this namespace.
notify pgrst,'reload schema';
commit;
