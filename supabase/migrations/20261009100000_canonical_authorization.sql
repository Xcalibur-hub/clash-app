-- Phase 3 Step 2A: caller visibility on canonical mutations only.
-- Internal helper: never an arbitrary-identity relationship oracle.
create function public.assert_canonical_clash_access(p_clash_id text, p_fighter_write boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.clashes%rowtype; a text; r text;
begin
  -- Same parent lock as publishing, ballots and settlement. Source SHARE blocks
  -- removal until an admitted operation commits; a queued operation sees removal.
  select * into c from public.clashes where id=p_clash_id for update;
  if c.duel_key is null then return; end if;
  select author_id into a from public.takes where id=c.take_id for share;
  select id into r from public.arena_rooms where clash_id=c.id;
  if not public.arena_take_readable(c.take_id) or not public.arena_room_readable(r)
    or (p_fighter_write and (
      public.arena_actor_hidden_internal(a,c.challenger_id)
      or public.arena_actor_hidden_internal(c.challenger_id,a))) then
    raise exception 'Clash unavailable' using errcode='42501';
  end if;
end $$;
revoke all on function public.assert_canonical_clash_access(text,boolean)
  from public,anon,authenticated,service_role;

-- Patch installed guards, retaining Phase 0.5's private relationship helpers,
-- trusted system/moderation exceptions, fighter identities and time boundaries.
do $patch$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.guard_arena_duel_content()'::regprocedure);
  patched:=replace(definition,
    '  select * into c from public.clashes where id = v_clash for update;',
    '  perform public.assert_canonical_clash_access(v_clash,true);
  select * into c from public.clashes where id = v_clash for update;');
  if patched=definition then raise exception 'canonical content guard anchor changed'; end if;
  execute patched;

  definition:=pg_get_functiondef('public.guard_arena_duel_judgement()'::regprocedure);
  patched:=replace(definition,
    '  if c.duel_key is null then return new; end if;',
    '  if c.duel_key is null then return new; end if;
  perform public.assert_canonical_clash_access(c.id);');
  if patched=definition then raise exception 'canonical judgement guard anchor changed'; end if;
  execute patched;

  definition:=pg_get_functiondef('public.watch_arena_room(text)'::regprocedure);
  -- Canonical watch locks Clash before Room. GROUP retains its original path.
  patched:=regexp_replace(definition,'  select \* into v_room',
    '  perform public.assert_canonical_clash_access(clash_id)
    from public.arena_rooms where id=p_room_id and clash_id is not null;
  select * into v_room');
  -- The dedicated canonical topic is read without a row lock: maintenance
  -- updates topics before taking Clash locks. Do not invert that lock order.
  patched:=replace(patched,'where id = v_room.topic_id
     for update;', 'where id = v_room.topic_id;
  if v_room.clash_id is null then
    select * into v_topic from public.arena_daily_topics where id=v_room.topic_id for update;
  else
    perform public.assert_canonical_clash_access(v_room.clash_id);
  end if;');
  if patched=definition or position('if v_room.clash_id is null then' in patched)=0 then
    raise exception 'canonical watch lock anchor changed';
  end if;
  -- Rate limiting may wait on an actor lock: revalidate before either write.
  patched:=replace(patched,'    update public.arena_room_participants',
    '    perform public.assert_canonical_clash_access(v_room.clash_id);
    update public.arena_room_participants');
  patched:=replace(patched,'  insert into public.arena_room_participants',
    '  perform public.assert_canonical_clash_access(v_room.clash_id);
  insert into public.arena_room_participants');
  execute patched;
end $patch$;
notify pgrst,'reload schema';
