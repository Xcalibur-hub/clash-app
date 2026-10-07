create type public.arena_challenge_status as enum ('PENDING','ACCEPTED','PASSED','CANCELLED','EXPIRED');
create table public.arena_challenges (
  id uuid primary key default gen_random_uuid(),
  take_id text not null references public.takes(id) on delete cascade,
  challenger_id text not null references public.profiles(id) on delete cascade,
  challenged_id text not null references public.profiles(id) on delete cascade,
  counter_position text not null check (char_length(btrim(counter_position)) between 20 and 500
    and counter_position ~ '[[:alnum:]]'),
  status public.arena_challenge_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  clash_id text unique references public.clashes(id) on delete cascade,
  check (challenger_id <> challenged_id),
  check (expires_at > created_at),
  check ((status = 'PENDING') = (resolved_at is null)),
  check ((status = 'ACCEPTED') = (clash_id is not null))
);
create unique index arena_challenge_pending_pair on public.arena_challenges(take_id, challenger_id)
  where status = 'PENDING';
create index arena_challenge_take_page on public.arena_challenges(take_id,created_at desc,id desc);
alter table public.arena_challenges enable row level security;
revoke all on public.arena_challenges from anon, authenticated, service_role;
grant select on public.arena_challenges to authenticated;
create policy arena_challenge_parties_read on public.arena_challenges for select to authenticated
  using (public.my_profile_id() in (challenger_id, challenged_id)
    and not public.arena_actor_hidden(public.my_profile_id(), challenger_id)
    and not public.arena_actor_hidden(public.my_profile_id(), challenged_id)
    and exists(select 1 from public.takes t where t.id = take_id and t.status = 'active'));

create function public.arena_challenge_duration() returns interval
language sql immutable set search_path = '' as $$ select interval '2 hours' $$;

create function public.guard_arena_challenge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.clashes%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.id,new.take_id,new.challenger_id,new.challenged_id,new.counter_position,new.created_at,new.expires_at)
       is distinct from (old.id,old.take_id,old.challenger_id,old.challenged_id,old.counter_position,old.created_at,old.expires_at)
       or (old.status <> 'PENDING' and new is distinct from old) then
      raise exception 'challenge identity and terminal states are immutable' using errcode='23514';
    end if;
  end if;
  if new.challenged_id is distinct from (select author_id from public.takes where id=new.take_id) then
    raise exception 'challenged user must be Take author' using errcode='23514';
  end if;
  if new.status = 'ACCEPTED' then
    select * into c from public.clashes where id=new.clash_id;
    if c.id is null or c.duel_key is distinct from new.id or c.take_id <> new.take_id
      or c.challenger_id <> new.challenger_id
      or not exists(select 1 from public.arena_rooms where clash_id=c.id) then
      raise exception 'accepted challenge must reference its canonical duel' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger arena_challenge_guard before insert or update on public.arena_challenges
for each row execute function public.guard_arena_challenge();
-- Freeze the source identity even before a Challenge becomes a duel.
create function public.guard_challenged_take_author() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.author_id <> old.author_id and exists(select 1 from public.arena_challenges where take_id=old.id) then
    raise exception 'challenged Take author is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger challenged_take_author before update of author_id on public.takes
for each row execute function public.guard_challenged_take_author();

create function public.arena_challenge_payload(p public.arena_challenges, p_created boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p.id,'takeId',p.take_id,'challengerId',p.challenger_id,
    'challengedId',p.challenged_id,'counterPosition',p.counter_position,
    'status',case when p.status='PENDING' and p.expires_at<=clock_timestamp() then 'EXPIRED' else p.status::text end,
    'createdAt',p.created_at,'expiresAt',p.expires_at,'resolvedAt',p.resolved_at,
    'clashId',p.clash_id,'roomId',(select id from public.arena_rooms where clash_id=p.clash_id),
    'challenger',(select jsonb_build_object('id',id,'name',name,'handle',handle) from public.profiles where id=p.challenger_id),
    'created',p_created)
$$;

create function public.expire_arena_take_challenges(p_take_id text) returns void
language sql security definer set search_path='' as $$
  update public.arena_challenges set status='EXPIRED',resolved_at=clock_timestamp()
  where take_id=p_take_id and status='PENDING' and expires_at<=clock_timestamp()
$$;

create function public.create_arena_challenge(p_take_id text,p_counter_position text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id(); t public.takes%rowtype; ch public.arena_challenges%rowtype;
begin
  if me is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into t from public.takes where id=p_take_id for update;
  if not found then raise exception 'Take not found' using errcode='P0002'; end if;
  if me=t.author_id then raise exception 'cannot challenge your own Take' using errcode='P0001'; end if;
  if public.arena_actor_hidden(me,t.author_id) or public.arena_actor_hidden(t.author_id,me) then
    raise exception 'Take unavailable' using errcode='42501'; end if;
  if t.status<>'active' or t.expires_at<=clock_timestamp()+interval '30 minutes' then
    raise exception 'Take cannot support a duel window' using errcode='P0003'; end if;
  if p_counter_position is null or char_length(btrim(p_counter_position)) not between 20 and 500
    or p_counter_position !~ '[[:alnum:]]' then
    raise exception 'counter-position must contain 20 to 500 characters' using errcode='22023'; end if;
  perform public.expire_arena_take_challenges(t.id);
  select * into ch from public.arena_challenges where take_id=t.id and challenger_id=me and status='PENDING';
  if found then return public.arena_challenge_payload(ch); end if;
  if exists(select 1 from public.clashes where take_id=t.id and duel_key is not null and status='open') then
    raise exception 'Take already has an active duel' using errcode='P0006'; end if;
  perform public.assert_rate_limit(me,'arena_challenge_create',10,interval '1 hour');
  insert into public.arena_challenges(take_id,challenger_id,challenged_id,counter_position,expires_at)
  values(t.id,me,t.author_id,btrim(p_counter_position),least(clock_timestamp()+public.arena_challenge_duration(),t.expires_at-interval '30 minutes'))
  returning * into ch;
  insert into public.notifications(id,recipient_id,actor_id,kind,entity_type,entity_id)
    values('challenge_received_'||ch.id,t.author_id,me,'challenge_received','take',t.id) on conflict(id) do nothing;
  return public.arena_challenge_payload(ch,true);
end $$;

create function public.resolve_arena_challenge(p_challenge_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id(); ch public.arena_challenges%rowtype; t public.takes%rowtype; result jsonb;
begin
  if me is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('ACCEPT','PASS','CANCEL') then
    raise exception 'invalid challenge action' using errcode='22023'; end if;
  select * into ch from public.arena_challenges where id=p_challenge_id;
  if not found then raise exception 'Challenge not found' using errcode='P0002'; end if;
  if (p_action='CANCEL' and me<>ch.challenger_id) or (p_action<>'CANCEL' and me<>ch.challenged_id) then
    raise exception 'only the appropriate Challenge party may act' using errcode='42501'; end if;
  -- Match Phase 1's key-before-Take order, including a concurrent trusted retry.
  if p_action='ACCEPT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('arena-duel:'||ch.id::text,0));
  end if;
  -- Same Take -> Challenge -> Clash -> Room order for all actions and readers.
  select * into t from public.takes where id=ch.take_id for update;
  select * into ch from public.arena_challenges where id=p_challenge_id for update;
  if ch.status<>'PENDING' then
    if (p_action='ACCEPT' and ch.status='ACCEPTED') or (p_action='PASS' and ch.status='PASSED')
      or (p_action='CANCEL' and ch.status='CANCELLED') or ch.status in ('EXPIRED','CANCELLED') then
      return public.arena_challenge_payload(ch);
    end if;
    raise exception 'Challenge is terminal' using errcode='P0003';
  end if;
  if ch.expires_at<=clock_timestamp() or t.status<>'active' or t.expires_at<=clock_timestamp()+interval '30 minutes' then
    update public.arena_challenges set status='EXPIRED',resolved_at=clock_timestamp() where id=ch.id returning * into ch;
    return public.arena_challenge_payload(ch);
  end if;
  if p_action='CANCEL' then
    update public.arena_challenges set status='CANCELLED',resolved_at=clock_timestamp() where id=ch.id returning * into ch;
    return public.arena_challenge_payload(ch);
  end if;
  if public.arena_actor_hidden(me,ch.challenger_id) or public.arena_actor_hidden(ch.challenger_id,me) then
    raise exception 'Challenge unavailable' using errcode='42501'; end if;
  if p_action='PASS' then
    update public.arena_challenges set status='PASSED',resolved_at=clock_timestamp() where id=ch.id returning * into ch;
    return public.arena_challenge_payload(ch);
  end if;
  if exists(select 1 from public.clashes where take_id=t.id and duel_key is not null and status='open' and duel_key<>ch.id) then
    update public.arena_challenges set status='CANCELLED',resolved_at=clock_timestamp() where take_id=t.id and status='PENDING';
    select * into ch from public.arena_challenges where id=ch.id;
    return public.arena_challenge_payload(ch);
  end if;
  result:=public.create_arena_duel(t.id,ch.challenger_id,ch.id);
  update public.arena_challenges set status='ACCEPTED',resolved_at=clock_timestamp(),clash_id=result->>'clashId'
    where id=ch.id returning * into ch;
  update public.arena_challenges set status='CANCELLED',resolved_at=clock_timestamp()
    where take_id=t.id and status='PENDING' and id<>ch.id;
  insert into public.notifications(id,recipient_id,actor_id,kind,entity_type,entity_id)
    values('challenge_accepted_'||ch.id,ch.challenger_id,me,'challenge_accepted',null,result->>'roomId') on conflict(id) do nothing;
  return public.arena_challenge_payload(ch,(result->>'created')::boolean);
end $$;

-- A server-created Phase 1 duel also makes other offers non-actionable. Existing
-- legacy/group paths stay independent. Future direct creations cannot bypass a
-- live accepted Challenge's single-active-Take rule.
create function public.guard_challenge_active_duel() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.status='open' then return new; end if;
  if new.duel_key is not null and new.status='open' then
    perform 1 from public.takes where id=new.take_id for update;
    if exists(select 1 from public.arena_challenges ch join public.clashes c on c.id=ch.clash_id
      where ch.take_id=new.take_id and ch.status='ACCEPTED' and c.status='open' and c.id<>new.id) then
      raise exception 'Take already has an accepted active duel' using errcode='P0006'; end if;
    update public.arena_challenges set status='CANCELLED',resolved_at=clock_timestamp()
      where take_id=new.take_id and status='PENDING' and id<>new.duel_key;
  end if;
  return new;
end $$;
create trigger challenge_active_duel before insert or update of status on public.clashes
for each row execute function public.guard_challenge_active_duel();

create function public.list_arena_challenges(p_take_id text,p_before_created_at timestamptz default null,
  p_before_id uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id(); t public.takes%rowtype; result jsonb;
begin
  if me is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into t from public.takes where id=p_take_id for update;
  if not found or t.status<>'active' or public.arena_actor_hidden(me,t.author_id) then return '[]'::jsonb; end if;
  perform public.expire_arena_take_challenges(t.id);
  select coalesce(jsonb_agg(public.arena_challenge_payload(page) order by page.created_at desc,page.id desc),'[]'::jsonb)
  into result from (select ch.* from public.arena_challenges ch where ch.take_id=t.id
    and me in (ch.challenged_id,ch.challenger_id)
    and not public.arena_actor_hidden(me,ch.challenger_id) and not public.arena_actor_hidden(ch.challenger_id,me)
    and (p_before_created_at is null or (ch.created_at,ch.id)<(p_before_created_at,p_before_id))
    order by ch.created_at desc,ch.id desc limit least(greatest(coalesce(p_limit,20),1),50)) page;
  return result;
end $$;

-- Expose the accepted proposition in the existing compact canonical Clash view;
-- no fake comment and no second competitive outcome is introduced.
alter function public.clash_view(text) rename to clash_view_phase1;
revoke execute on function public.clash_view_phase1(text) from public,anon,authenticated,service_role;
create function public.clash_view(p_clash_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; counter text;
begin
  result:=public.clash_view_phase1(p_clash_id);
  select counter_position into counter from public.arena_challenges where clash_id=p_clash_id and status='ACCEPTED';
  if found then result:=result||jsonb_build_object('sideBText',counter); end if;
  return result;
end $$;
revoke execute on function public.clash_view(text) from public;
grant execute on function public.clash_view(text) to anon,authenticated,service_role;

revoke execute on function public.arena_challenge_duration(),public.guard_arena_challenge(),public.guard_challenged_take_author(),
  public.arena_challenge_payload(public.arena_challenges,boolean),public.expire_arena_take_challenges(text),
  public.guard_challenge_active_duel() from public,anon,authenticated,service_role;
revoke execute on function public.create_arena_challenge(text,text),public.resolve_arena_challenge(uuid,text),
  public.list_arena_challenges(text,timestamptz,uuid,integer) from public,anon,service_role;
grant execute on function public.create_arena_challenge(text,text),public.resolve_arena_challenge(uuid,text),
  public.list_arena_challenges(text,timestamptz,uuid,integer) to authenticated;
