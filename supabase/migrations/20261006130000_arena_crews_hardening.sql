-- ============================================================================
-- Arena Crews · Phase A.1 — membership race + invite/request conflict hardening
-- ----------------------------------------------------------------------------
-- Partial unique indexes remain the source of truth for one-active-membership
-- and one-pending-invite/request. These wrappers only map concurrent collisions
-- to the same product error codes the assert helpers already raise.
--
-- Phase B discovery notes (do not implement here):
--   · list_arena_crews uses OFFSET pagination — fine for small Phase A catalogs;
--     switch to keyset (member_count, created_at, id) before large feeds.
--   · arena_crew_payload runs per row (viewer membership/follow) — acceptable
--     at ≤48 rows; for Phase B prefer a bulk viewer join or deferred viewer map.
--   · Ordering by member_count alone will need seasonal rating / recency once
--     rivalries and seasons land — keep a simple catalog sort until then.
-- ============================================================================

create or replace function public.join_arena_crew(p_crew_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_crew public.arena_crews%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to join a crew' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'arena_crew_join', 10, interval '1 hour');
  perform public.arena_assert_crew_join_allowed(v_user);

  select * into v_crew from public.arena_crews where id = p_crew_id for update;
  if not found or v_crew.archived_at is not null then
    raise exception 'crew does not exist' using errcode = 'P0002';
  end if;
  if v_crew.join_mode is distinct from 'OPEN' then
    raise exception 'this crew is not open join' using errcode = 'P0003';
  end if;

  begin
    insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
    values (v_crew.id, v_user, 'MEMBER', true)
    on conflict (crew_id, profile_id) do update
      set left_at = null,
          role = 'MEMBER',
          is_primary = true,
          joined_at = now()
    where public.arena_crew_memberships.left_at is not null;
  exception
    when unique_violation then
      raise exception 'already in a crew' using errcode = 'P0003';
  end;

  update public.arena_crews
     set member_count = (
           select count(*)::integer from public.arena_crew_memberships m
           where m.crew_id = v_crew.id and m.left_at is null
         ),
         updated_at = now()
   where id = v_crew.id
  returning * into v_crew;

  return public.arena_crew_payload(v_crew);
end;
$$;

create or replace function public.invite_to_arena_crew(p_crew_id text, p_recipient_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_role public.arena_crew_member_role;
  v_id   text;
begin
  if v_user is null then
    raise exception 'sign in to invite' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'arena_crew_invite', 20, interval '1 hour');

  v_role := public.arena_crew_role(p_crew_id);
  if v_role is null or v_role not in ('OWNER', 'MODERATOR') then
    raise exception 'only owners and moderators can invite' using errcode = '42501';
  end if;
  if p_recipient_id is null or p_recipient_id = v_user then
    raise exception 'invalid recipient' using errcode = 'P0003';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_recipient_id) then
    raise exception 'recipient does not exist' using errcode = 'P0002';
  end if;
  if public.arena_actor_hidden(v_user, p_recipient_id) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;
  if exists (
    select 1 from public.arena_crew_memberships m
    where m.crew_id = p_crew_id and m.profile_id = p_recipient_id and m.left_at is null
  ) then
    raise exception 'already a member' using errcode = 'P0003';
  end if;

  -- Stale PENDING rows otherwise block the unique pending indexes forever
  -- (raising after an expire UPDATE rolls the mark back in the same statement).
  update public.arena_crew_invites
     set status = 'EXPIRED', responded_at = now()
   where status = 'PENDING'
     and expires_at <= now()
     and (recipient_id = p_recipient_id or (crew_id = p_crew_id and recipient_id = p_recipient_id));

  v_id := public.new_arena_id('aci_');
  begin
    insert into public.arena_crew_invites (id, crew_id, inviter_id, recipient_id)
    values (v_id, p_crew_id, v_user, p_recipient_id);
  exception
    when unique_violation then
      raise exception 'invite already pending' using errcode = 'P0003';
  end;

  perform public.arena_crew_notify(
    p_recipient_id, v_user, 'arena_crew_invite', 'arena_crew_invite', v_id
  );

  return jsonb_build_object('id', v_id, 'status', 'PENDING');
end;
$$;

create or replace function public.respond_arena_crew_invite(p_invite_id text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_inv  public.arena_crew_invites%rowtype;
  v_crew public.arena_crews%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to respond' using errcode = '42501';
  end if;

  select * into v_inv from public.arena_crew_invites where id = p_invite_id for update;
  if not found then
    raise exception 'invite does not exist' using errcode = 'P0002';
  end if;
  if v_inv.recipient_id is distinct from v_user then
    raise exception 'not your invite' using errcode = '42501';
  end if;
  if v_inv.status is distinct from 'PENDING' then
    raise exception 'invite is not pending' using errcode = 'P0003';
  end if;
  if v_inv.expires_at <= now() then
    -- Return (do not raise): a raised exception would roll back this mark and
    -- leave a zombie PENDING row that blocks future invites.
    update public.arena_crew_invites
       set status = 'EXPIRED', responded_at = now()
     where id = p_invite_id;
    return jsonb_build_object('id', p_invite_id, 'status', 'EXPIRED');
  end if;

  if not p_accept then
    update public.arena_crew_invites
       set status = 'DECLINED', responded_at = now()
     where id = p_invite_id;
    return jsonb_build_object('id', p_invite_id, 'status', 'DECLINED');
  end if;

  perform public.arena_assert_crew_join_allowed(v_user);
  select * into v_crew from public.arena_crews where id = v_inv.crew_id for update;
  if not found or v_crew.archived_at is not null then
    raise exception 'crew does not exist' using errcode = 'P0002';
  end if;

  update public.arena_crew_invites
     set status = 'ACCEPTED', responded_at = now()
   where id = p_invite_id;

  begin
    insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
    values (v_crew.id, v_user, 'MEMBER', true)
    on conflict (crew_id, profile_id) do update
      set left_at = null, role = 'MEMBER', is_primary = true, joined_at = now()
    where public.arena_crew_memberships.left_at is not null;
  exception
    when unique_violation then
      raise exception 'already in a crew' using errcode = 'P0003';
  end;

  update public.arena_crews
     set member_count = (
           select count(*)::integer from public.arena_crew_memberships m
           where m.crew_id = v_crew.id and m.left_at is null
         ),
         updated_at = now()
   where id = v_crew.id
  returning * into v_crew;

  return public.arena_crew_payload(v_crew);
end;
$$;

create or replace function public.request_arena_crew_join(p_crew_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_crew public.arena_crews%rowtype;
  v_id   text;
  v_mod  text;
begin
  if v_user is null then
    raise exception 'sign in to request' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'arena_crew_request', 10, interval '1 hour');
  perform public.arena_assert_crew_join_allowed(v_user);

  select * into v_crew from public.arena_crews where id = p_crew_id and archived_at is null;
  if not found then
    raise exception 'crew does not exist' using errcode = 'P0002';
  end if;
  if v_crew.join_mode is distinct from 'REQUEST' then
    raise exception 'this crew does not take requests' using errcode = 'P0003';
  end if;

  v_id := public.new_arena_id('acr_');
  begin
    insert into public.arena_crew_join_requests (id, crew_id, requester_id)
    values (v_id, p_crew_id, v_user);
  exception
    when unique_violation then
      raise exception 'request already pending' using errcode = 'P0003';
  end;

  for v_mod in
    select m.profile_id from public.arena_crew_memberships m
     where m.crew_id = p_crew_id and m.left_at is null and m.role in ('OWNER', 'MODERATOR')
     limit 5
  loop
    perform public.arena_crew_notify(
      v_mod, v_user, 'arena_crew_join_request', 'arena_crew_join_request', v_id
    );
  end loop;

  return jsonb_build_object('id', v_id, 'status', 'PENDING');
end;
$$;

create or replace function public.decide_arena_crew_join_request(
  p_request_id text,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_req  public.arena_crew_join_requests%rowtype;
  v_crew public.arena_crews%rowtype;
  v_role public.arena_crew_member_role;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;

  select * into v_req from public.arena_crew_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'request does not exist' using errcode = 'P0002';
  end if;
  if v_req.status is distinct from 'PENDING' then
    raise exception 'request is not pending' using errcode = 'P0003';
  end if;

  v_role := public.arena_crew_role(v_req.crew_id);
  if v_role is null or v_role not in ('OWNER', 'MODERATOR') then
    raise exception 'only owners and moderators can decide' using errcode = '42501';
  end if;

  if not p_approve then
    update public.arena_crew_join_requests
       set status = 'DECLINED', decided_at = now(), decided_by = v_user
     where id = p_request_id;
    perform public.arena_crew_notify(
      v_req.requester_id, v_user, 'arena_crew_join_declined', 'arena_crew_join_request', p_request_id
    );
    return jsonb_build_object('id', p_request_id, 'status', 'DECLINED');
  end if;

  perform public.arena_assert_crew_join_allowed(v_req.requester_id);
  select * into v_crew from public.arena_crews where id = v_req.crew_id for update;

  update public.arena_crew_join_requests
     set status = 'APPROVED', decided_at = now(), decided_by = v_user
   where id = p_request_id;

  begin
    insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
    values (v_crew.id, v_req.requester_id, 'MEMBER', true)
    on conflict (crew_id, profile_id) do update
      set left_at = null, role = 'MEMBER', is_primary = true, joined_at = now()
    where public.arena_crew_memberships.left_at is not null;
  exception
    when unique_violation then
      raise exception 'already in a crew' using errcode = 'P0003';
  end;

  update public.arena_crews
     set member_count = (
           select count(*)::integer from public.arena_crew_memberships m
           where m.crew_id = v_crew.id and m.left_at is null
         ),
         updated_at = now()
   where id = v_crew.id
  returning * into v_crew;

  perform public.arena_crew_notify(
    v_req.requester_id, v_user, 'arena_crew_join_accepted', 'arena_crew_join_request', p_request_id
  );

  return public.arena_crew_payload(v_crew);
end;
$$;

comment on function public.list_arena_crews(integer, integer, text) is
  'Phase A catalog. OFFSET + per-row viewer payload is OK for small sets; Phase B should keyset-paginate and defer viewer state.';
