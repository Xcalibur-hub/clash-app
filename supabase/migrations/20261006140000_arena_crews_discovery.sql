-- ============================================================================
-- Arena Crews · Phase B — discovery keyset + members + richer viewer state
-- ----------------------------------------------------------------------------
-- Compact read APIs for Crew discovery / profile. No client writes.
-- Discovery uses keyset cursors (not OFFSET) so catalogs can grow.
-- ============================================================================

-- Richer viewer block used by profile + discovery payloads.
create or replace function public.arena_crew_payload(p_crew public.arena_crews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_crew.id,
    'slug', p_crew.slug,
    'name', p_crew.name,
    'bio', p_crew.bio,
    'avatarUrl', p_crew.avatar_url,
    'bannerUrl', p_crew.banner_url,
    'specialties', to_jsonb(p_crew.specialties),
    'joinMode', p_crew.join_mode,
    'memberCount', p_crew.member_count,
    'followerCount', p_crew.follower_count,
    'totalReputation', p_crew.total_reputation,
    'seasonalRating', p_crew.seasonal_rating,
    'wins', p_crew.wins,
    'losses', p_crew.losses,
    'streak', p_crew.streak,
    'createdAt', p_crew.created_at,
    'viewer', jsonb_build_object(
      'isMember', public.arena_is_crew_member(p_crew.id),
      'role', public.arena_crew_role(p_crew.id),
      'isFollowing', exists (
        select 1 from public.arena_crew_follows f
        where f.crew_id = p_crew.id and f.profile_id = public.my_profile_id()
      ),
      'hasPendingRequest', exists (
        select 1 from public.arena_crew_join_requests r
        where r.crew_id = p_crew.id
          and r.requester_id = public.my_profile_id()
          and r.status = 'PENDING'
      ),
      'activeCrewId', (
        select m.crew_id from public.arena_crew_memberships m
         where m.profile_id = public.my_profile_id() and m.left_at is null
         limit 1
      )
    )
  );
$$;

revoke execute on function public.arena_crew_payload(public.arena_crews) from public;
grant execute on function public.arena_crew_payload(public.arena_crews) to authenticated, service_role;

-- Lightweight discovery card (same fields, intentional alias for clients).
create or replace function public.arena_crew_discovery_card(p_crew public.arena_crews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.arena_crew_payload(p_crew);
$$;

revoke execute on function public.arena_crew_discovery_card(public.arena_crews) from public;
grant execute on function public.arena_crew_discovery_card(public.arena_crews) to authenticated, service_role;

-- ── discover_arena_crews (keyset) ───────────────────────────────────────────
-- p_sort: popular | rising | recent
-- p_cursor: opaque "sort:value:id" — null for first page
create or replace function public.discover_arena_crews(
  p_sort text default 'popular',
  p_specialty text default null,
  p_limit integer default 20,
  p_cursor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 40));
  v_sort  text := lower(coalesce(nullif(btrim(p_sort), ''), 'popular'));
  v_spec  text := nullif(btrim(p_specialty), '');
  v_cur_n bigint;
  v_cur_ts timestamptz;
  v_cur_id text;
  v_items jsonb := '[]'::jsonb;
  v_next  text := null;
begin
  if v_sort not in ('popular', 'rising', 'recent') then
    v_sort := 'popular';
  end if;

  if p_cursor is not null and btrim(p_cursor) <> '' then
    if v_sort = 'recent' then
      v_cur_ts := split_part(p_cursor, '|', 1)::timestamptz;
      v_cur_id := split_part(p_cursor, '|', 2);
    else
      v_cur_n := split_part(p_cursor, '|', 1)::bigint;
      v_cur_id := split_part(p_cursor, '|', 2);
    end if;
  end if;

  if v_sort = 'recent' then
    select coalesce(
             jsonb_agg(
               public.arena_crew_discovery_card(q)
               order by q.created_at desc, q.id desc
             ),
             '[]'::jsonb
           )
      into v_items
      from (
        select c.*
          from public.arena_crews c
         where c.archived_at is null
           and (v_spec is null or v_spec = any (c.specialties))
           and (
             v_cur_ts is null
             or (c.created_at, c.id) < (v_cur_ts, v_cur_id)
           )
         order by c.created_at desc, c.id desc
         limit v_limit
      ) q;
  elsif v_sort = 'rising' then
    -- Crews formed in the last 30 days, ranked by membership (climbing catalogs).
    select coalesce(
             jsonb_agg(
               public.arena_crew_discovery_card(q)
               order by q.member_count desc, q.follower_count desc, q.id desc
             ),
             '[]'::jsonb
           )
      into v_items
      from (
        select c.*
          from public.arena_crews c
         where c.archived_at is null
           and c.created_at > now() - interval '30 days'
           and (v_spec is null or v_spec = any (c.specialties))
           and (
             v_cur_n is null
             or (c.member_count::bigint, c.id) < (v_cur_n, v_cur_id)
           )
         order by c.member_count desc, c.follower_count desc, c.id desc
         limit v_limit
      ) q;
  else
    -- popular
    select coalesce(
             jsonb_agg(
               public.arena_crew_discovery_card(q)
               order by q.member_count desc, q.id desc
             ),
             '[]'::jsonb
           )
      into v_items
      from (
        select c.*
          from public.arena_crews c
         where c.archived_at is null
           and (v_spec is null or v_spec = any (c.specialties))
           and (
             v_cur_n is null
             or (c.member_count::bigint, c.id) < (v_cur_n, v_cur_id)
           )
         order by c.member_count desc, c.id desc
         limit v_limit
      ) q;
  end if;

  if jsonb_array_length(v_items) = v_limit then
    if v_sort = 'recent' then
      select c.created_at, c.id into v_cur_ts, v_cur_id
        from public.arena_crews c
       where c.id = v_items -> (v_limit - 1) ->> 'id';
      if found then
        v_next := v_cur_ts::text || '|' || v_cur_id;
      end if;
    else
      select c.member_count::bigint, c.id into v_cur_n, v_cur_id
        from public.arena_crews c
       where c.id = v_items -> (v_limit - 1) ->> 'id';
      if found then
        v_next := v_cur_n::text || '|' || v_cur_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'nextCursor', to_jsonb(v_next),
    'sort', v_sort
  );
end;
$$;

revoke execute on function public.discover_arena_crews(text, text, integer, text) from public;
grant execute on function public.discover_arena_crews(text, text, integer, text) to authenticated;

-- Featured + rising strip helpers (small bounded reads for Arena Home / discovery hero)
create or replace function public.list_rising_arena_crews(p_limit integer default 8)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (public.discover_arena_crews('rising', null, greatest(1, least(coalesce(p_limit, 8), 16)), null) -> 'items'),
    '[]'::jsonb
  );
$$;

revoke execute on function public.list_rising_arena_crews(integer) from public;
grant execute on function public.list_rising_arena_crews(integer) to authenticated;

-- ── Members (profile strip) ─────────────────────────────────────────────────
create or replace function public.list_arena_crew_members(
  p_crew_id text,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 48));
  v_off   integer := greatest(0, coalesce(p_offset, 0));
  v_out   jsonb;
begin
  if not exists (
    select 1 from public.arena_crews c where c.id = p_crew_id and c.archived_at is null
  ) then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb)
    into v_out
    from (
      select
        m.profile_id as "profileId",
        p.name,
        p.handle,
        p.avatar_tint as "tint",
        m.role::text as role,
        m.joined_at as "joinedAt"
      from public.arena_crew_memberships m
      join public.profiles p on p.id = m.profile_id
      where m.crew_id = p_crew_id
        and m.left_at is null
      order by
        case m.role
          when 'OWNER' then 0
          when 'MODERATOR' then 1
          else 2
        end,
        m.joined_at asc
      limit v_limit offset v_off
    ) q;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

revoke execute on function public.list_arena_crew_members(text, integer, integer) from public;
grant execute on function public.list_arena_crew_members(text, integer, integer) to authenticated;

comment on function public.discover_arena_crews(text, text, integer, text) is
  'Phase B Crew discovery with keyset pagination. sort=popular|rising|recent.';
comment on function public.list_arena_crew_members(text, integer, integer) is
  'Compact Crew member strip for profile screens. No unrestricted profile fan-out.';
