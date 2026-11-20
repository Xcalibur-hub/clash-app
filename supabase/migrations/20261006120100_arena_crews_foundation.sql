-- ============================================================================
-- Arena Crews · Phase A — foundation, membership, invites, requests, follows
-- ----------------------------------------------------------------------------
-- Persistent competitive communities. Rooms/topics stay the battleground;
-- Crews are identity + membership only in this phase.
--
-- Anti-abuse (server-side):
--   · One active membership per profile (ranked identity)
--   · 72h rejoin cooldown after leave
--   · Invite/request rate limits + one pending invite per recipient
--   · One pending join request per (crew, requester)
--   · Actor always my_profile_id(); never trust a client profile id
-- ============================================================================

-- ── 1. Specialty vocabulary (soft tags — not permissions) ───────────────────
create or replace function public.arena_crew_specialty_vocabulary()
returns text[]
language sql
immutable
as $$
  select array[
    'Tech', 'Gaming', 'Politics', 'Sports', 'Finance', 'Science',
    'Movies', 'Music', 'Culture', 'Cars', 'History', 'Design', 'General'
  ]::text[];
$$;

revoke execute on function public.arena_crew_specialty_vocabulary() from public;
grant execute on function public.arena_crew_specialty_vocabulary() to anon, authenticated, service_role;

-- ── 2. Crews ────────────────────────────────────────────────────────────────
create table if not exists public.arena_crews (
  id              text primary key,
  slug            text not null,
  name            text not null,
  bio             text not null default '',
  avatar_url      text,
  banner_url      text,
  specialties     text[] not null default '{}'::text[],
  join_mode       public.arena_crew_join_mode not null default 'OPEN',
  created_by      text not null references public.profiles (id) on delete restrict,
  member_count    integer not null default 1 check (member_count >= 0),
  follower_count  integer not null default 0 check (follower_count >= 0),
  -- Reputation placeholders for later phases (server-written only).
  total_reputation integer not null default 0,
  seasonal_rating  integer not null default 1000,
  wins             integer not null default 0,
  losses           integer not null default 0,
  streak           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  constraint arena_crews_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$'),
  constraint arena_crews_name_len check (char_length(btrim(name)) between 2 and 40),
  constraint arena_crews_bio_len check (char_length(bio) <= 280),
  constraint arena_crews_specialties_len check (cardinality(specialties) <= 4)
);

create unique index if not exists arena_crews_slug_uidx on public.arena_crews (slug);
create index if not exists arena_crews_created_idx on public.arena_crews (created_at desc);
create index if not exists arena_crews_member_count_idx on public.arena_crews (member_count desc);

alter table public.arena_crews enable row level security;

drop policy if exists "active crews are publicly readable" on public.arena_crews;
create policy "active crews are publicly readable"
  on public.arena_crews for select to authenticated
  using (archived_at is null or public.is_staff());

revoke all on table public.arena_crews from public, anon, authenticated;
grant select on table public.arena_crews to authenticated;
grant all on table public.arena_crews to service_role;

-- ── 3. Memberships ──────────────────────────────────────────────────────────
create table if not exists public.arena_crew_memberships (
  crew_id     text not null references public.arena_crews (id) on delete cascade,
  profile_id  text not null references public.profiles (id) on delete cascade,
  role        public.arena_crew_member_role not null default 'MEMBER',
  is_primary  boolean not null default true,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  primary key (crew_id, profile_id),
  constraint arena_crew_memberships_left_order check (left_at is null or left_at >= joined_at)
);

-- One live Crew membership per person (competitive identity).
create unique index if not exists arena_crew_memberships_one_active_per_profile_idx
  on public.arena_crew_memberships (profile_id)
  where left_at is null;

create index if not exists arena_crew_memberships_crew_active_idx
  on public.arena_crew_memberships (crew_id, joined_at desc)
  where left_at is null;

alter table public.arena_crew_memberships enable row level security;

drop policy if exists "crew memberships are readable when crew is" on public.arena_crew_memberships;
create policy "crew memberships are readable when crew is"
  on public.arena_crew_memberships for select to authenticated
  using (
    left_at is null
    and exists (
      select 1 from public.arena_crews c
      where c.id = crew_id and c.archived_at is null
    )
  );

revoke all on table public.arena_crew_memberships from public, anon, authenticated;
grant select on table public.arena_crew_memberships to authenticated;
grant all on table public.arena_crew_memberships to service_role;

-- ── 4. Follows (many; not competitive) ──────────────────────────────────────
create table if not exists public.arena_crew_follows (
  crew_id     text not null references public.arena_crews (id) on delete cascade,
  profile_id  text not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (crew_id, profile_id)
);

create index if not exists arena_crew_follows_profile_idx
  on public.arena_crew_follows (profile_id, created_at desc);

alter table public.arena_crew_follows enable row level security;

drop policy if exists "your crew follows are yours" on public.arena_crew_follows;
create policy "your crew follows are yours"
  on public.arena_crew_follows for select to authenticated
  using (public.owns_profile(profile_id));

revoke all on table public.arena_crew_follows from public, anon, authenticated;
grant select on table public.arena_crew_follows to authenticated;
grant all on table public.arena_crew_follows to service_role;

-- ── 5. Invites ──────────────────────────────────────────────────────────────
create table if not exists public.arena_crew_invites (
  id           text primary key,
  crew_id      text not null references public.arena_crews (id) on delete cascade,
  inviter_id   text not null references public.profiles (id) on delete cascade,
  recipient_id text not null references public.profiles (id) on delete cascade,
  status       public.arena_crew_invite_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  constraint arena_crew_invites_no_self check (inviter_id <> recipient_id),
  constraint arena_crew_invites_window check (expires_at > created_at)
);

create unique index if not exists arena_crew_invites_one_pending_per_recipient_idx
  on public.arena_crew_invites (recipient_id)
  where status = 'PENDING';

create unique index if not exists arena_crew_invites_one_pending_per_crew_recipient_idx
  on public.arena_crew_invites (crew_id, recipient_id)
  where status = 'PENDING';

create index if not exists arena_crew_invites_recipient_idx
  on public.arena_crew_invites (recipient_id, created_at desc);

alter table public.arena_crew_invites enable row level security;

drop policy if exists "crew invite is between inviter and recipient" on public.arena_crew_invites;
create policy "crew invite is between inviter and recipient"
  on public.arena_crew_invites for select to authenticated
  using (public.owns_profile(inviter_id) or public.owns_profile(recipient_id));

revoke all on table public.arena_crew_invites from public, anon, authenticated;
grant select on table public.arena_crew_invites to authenticated;
grant all on table public.arena_crew_invites to service_role;

-- ── 6. Join requests ────────────────────────────────────────────────────────
create table if not exists public.arena_crew_join_requests (
  id           text primary key,
  crew_id      text not null references public.arena_crews (id) on delete cascade,
  requester_id text not null references public.profiles (id) on delete cascade,
  status       public.arena_crew_request_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   text references public.profiles (id) on delete set null,
  constraint arena_crew_join_requests_decided check (
    (status = 'PENDING' and decided_at is null)
    or (status <> 'PENDING' and decided_at is not null)
  )
);

create unique index if not exists arena_crew_join_requests_one_pending_idx
  on public.arena_crew_join_requests (crew_id, requester_id)
  where status = 'PENDING';

create index if not exists arena_crew_join_requests_crew_pending_idx
  on public.arena_crew_join_requests (crew_id, created_at desc)
  where status = 'PENDING';

alter table public.arena_crew_join_requests enable row level security;

drop policy if exists "crew join requests visible to parties and mods" on public.arena_crew_join_requests;
create policy "crew join requests visible to parties and mods"
  on public.arena_crew_join_requests for select to authenticated
  using (
    public.owns_profile(requester_id)
    or exists (
      select 1 from public.arena_crew_memberships m
      where m.crew_id = arena_crew_join_requests.crew_id
        and m.profile_id = public.my_profile_id()
        and m.left_at is null
        and m.role in ('OWNER', 'MODERATOR')
    )
  );

revoke all on table public.arena_crew_join_requests from public, anon, authenticated;
grant select on table public.arena_crew_join_requests to authenticated;
grant all on table public.arena_crew_join_requests to service_role;

-- ── 7. Leave cooldown ledger ────────────────────────────────────────────────
create table if not exists public.arena_crew_leave_cooldowns (
  profile_id   text primary key references public.profiles (id) on delete cascade,
  left_crew_id text references public.arena_crews (id) on delete set null,
  left_at      timestamptz not null default now(),
  join_after   timestamptz not null
);

alter table public.arena_crew_leave_cooldowns enable row level security;

drop policy if exists "your crew leave cooldown is yours" on public.arena_crew_leave_cooldowns;
create policy "your crew leave cooldown is yours"
  on public.arena_crew_leave_cooldowns for select to authenticated
  using (public.owns_profile(profile_id));

revoke all on table public.arena_crew_leave_cooldowns from public, anon, authenticated;
grant select on table public.arena_crew_leave_cooldowns to authenticated;
grant all on table public.arena_crew_leave_cooldowns to service_role;

-- ── 8. Helpers ──────────────────────────────────────────────────────────────
create or replace function public.arena_is_crew_member(p_crew_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.arena_crew_memberships m
    where m.crew_id = p_crew_id
      and m.profile_id = public.my_profile_id()
      and m.left_at is null
  );
$$;

revoke execute on function public.arena_is_crew_member(text) from public;
grant execute on function public.arena_is_crew_member(text) to authenticated, service_role;

create or replace function public.arena_crew_role(p_crew_id text)
returns public.arena_crew_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
    from public.arena_crew_memberships m
   where m.crew_id = p_crew_id
     and m.profile_id = public.my_profile_id()
     and m.left_at is null
   limit 1;
$$;

revoke execute on function public.arena_crew_role(text) from public;
grant execute on function public.arena_crew_role(text) to authenticated, service_role;

create or replace function public.arena_assert_crew_specialties(p_specialties text[])
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_vocab text[] := public.arena_crew_specialty_vocabulary();
  v_clean text[] := '{}'::text[];
  v_item  text;
begin
  if p_specialties is null then
    return '{}'::text[];
  end if;
  if cardinality(p_specialties) > 4 then
    raise exception 'at most 4 specialties' using errcode = 'P0003';
  end if;
  foreach v_item in array p_specialties loop
    if v_item is null or btrim(v_item) = '' then
      continue;
    end if;
    if not (v_item = any (v_vocab)) then
      raise exception 'unknown specialty' using errcode = 'P0003';
    end if;
    if not (v_item = any (v_clean)) then
      v_clean := array_append(v_clean, v_item);
    end if;
  end loop;
  return v_clean;
end;
$$;

revoke execute on function public.arena_assert_crew_specialties(text[]) from public;
grant execute on function public.arena_assert_crew_specialties(text[]) to authenticated, service_role;

create or replace function public.arena_assert_crew_join_allowed(p_profile_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cd public.arena_crew_leave_cooldowns%rowtype;
begin
  if exists (
    select 1 from public.arena_crew_memberships m
    where m.profile_id = p_profile_id and m.left_at is null
  ) then
    raise exception 'already in a crew' using errcode = 'P0003';
  end if;

  select * into v_cd from public.arena_crew_leave_cooldowns where profile_id = p_profile_id;
  if found and v_cd.join_after > now() then
    raise exception 'crew rejoin cooldown active' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.arena_assert_crew_join_allowed(text) from public;

create or replace function public.arena_crew_notify(
  p_recipient text,
  p_actor     text,
  p_kind      public.notification_kind,
  p_entity    public.report_target,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
  values (
    'n_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    p_recipient, p_actor, p_kind, p_entity, p_entity_id
  );
end;
$$;

revoke execute on function public.arena_crew_notify(
  text, text, public.notification_kind, public.report_target, text
) from public, anon, authenticated;
grant execute on function public.arena_crew_notify(
  text, text, public.notification_kind, public.report_target, text
) to service_role;

create or replace function public.arena_crew_payload(p_crew public.arena_crews)
returns jsonb
language sql
stable
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
      )
    )
  );
$$;

revoke execute on function public.arena_crew_payload(public.arena_crews) from public;
grant execute on function public.arena_crew_payload(public.arena_crews) to authenticated, service_role;

-- ── 9. create_arena_crew ────────────────────────────────────────────────────
create or replace function public.create_arena_crew(
  p_name         text,
  p_slug         text,
  p_bio          text default '',
  p_join_mode    public.arena_crew_join_mode default 'OPEN',
  p_specialties  text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_bio  text := coalesce(btrim(p_bio), '');
  v_specs text[];
  v_id   text;
  v_row  public.arena_crews%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to create a crew' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'arena_crew_create', 3, interval '24 hours');
  perform public.arena_assert_crew_join_allowed(v_user);

  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'crew name must be 2–40 characters' using errcode = 'P0003';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$' then
    raise exception 'crew slug is invalid' using errcode = 'P0003';
  end if;
  if char_length(v_bio) > 280 then
    raise exception 'bio is too long' using errcode = 'P0003';
  end if;
  v_specs := public.arena_assert_crew_specialties(p_specialties);

  if exists (select 1 from public.arena_crews c where c.slug = v_slug) then
    raise exception 'crew slug is taken' using errcode = 'P0007';
  end if;

  v_id := public.new_arena_id('ac_');
  insert into public.arena_crews (
    id, slug, name, bio, specialties, join_mode, created_by, member_count
  ) values (
    v_id, v_slug, v_name, v_bio, v_specs, coalesce(p_join_mode, 'OPEN'), v_user, 1
  )
  returning * into v_row;

  insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
  values (v_id, v_user, 'OWNER', true);

  return public.arena_crew_payload(v_row);
end;
$$;

revoke execute on function public.create_arena_crew(text, text, text, public.arena_crew_join_mode, text[])
  from public;
grant execute on function public.create_arena_crew(text, text, text, public.arena_crew_join_mode, text[])
  to authenticated;

-- ── 10. join_arena_crew (OPEN only) ─────────────────────────────────────────
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

  insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
  values (v_crew.id, v_user, 'MEMBER', true)
  on conflict (crew_id, profile_id) do update
    set left_at = null,
        role = 'MEMBER',
        is_primary = true,
        joined_at = now()
  where public.arena_crew_memberships.left_at is not null;

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

revoke execute on function public.join_arena_crew(text) from public;
grant execute on function public.join_arena_crew(text) to authenticated;

-- ── 11. leave_arena_crew ────────────────────────────────────────────────────
create or replace function public.leave_arena_crew(p_crew_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_crew public.arena_crews%rowtype;
  v_role public.arena_crew_member_role;
  v_owners integer;
begin
  if v_user is null then
    raise exception 'sign in to leave a crew' using errcode = '42501';
  end if;

  select * into v_crew from public.arena_crews where id = p_crew_id for update;
  if not found then
    raise exception 'crew does not exist' using errcode = 'P0002';
  end if;

  select m.role into v_role
    from public.arena_crew_memberships m
   where m.crew_id = p_crew_id and m.profile_id = v_user and m.left_at is null;
  if not found then
    raise exception 'not a member' using errcode = 'P0003';
  end if;

  if v_role = 'OWNER' then
    select count(*) into v_owners
      from public.arena_crew_memberships m
     where m.crew_id = p_crew_id and m.left_at is null and m.role = 'OWNER';
    if v_owners <= 1 then
      raise exception 'transfer ownership before leaving' using errcode = 'P0003';
    end if;
  end if;

  update public.arena_crew_memberships
     set left_at = now(), is_primary = false
   where crew_id = p_crew_id and profile_id = v_user and left_at is null;

  insert into public.arena_crew_leave_cooldowns (profile_id, left_crew_id, left_at, join_after)
  values (v_user, p_crew_id, now(), now() + interval '72 hours')
  on conflict (profile_id) do update
    set left_crew_id = excluded.left_crew_id,
        left_at = excluded.left_at,
        join_after = excluded.join_after;

  update public.arena_crews
     set member_count = (
           select count(*)::integer from public.arena_crew_memberships m
           where m.crew_id = p_crew_id and m.left_at is null
         ),
         updated_at = now()
   where id = p_crew_id
  returning * into v_crew;

  return public.arena_crew_payload(v_crew);
end;
$$;

revoke execute on function public.leave_arena_crew(text) from public;
grant execute on function public.leave_arena_crew(text) to authenticated;

-- ── 12. follow / unfollow ───────────────────────────────────────────────────
create or replace function public.follow_arena_crew(p_crew_id text)
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
    raise exception 'sign in to follow a crew' using errcode = '42501';
  end if;
  select * into v_crew from public.arena_crews where id = p_crew_id and archived_at is null;
  if not found then
    raise exception 'crew does not exist' using errcode = 'P0002';
  end if;

  insert into public.arena_crew_follows (crew_id, profile_id)
  values (p_crew_id, v_user)
  on conflict do nothing;

  update public.arena_crews
     set follower_count = (
           select count(*)::integer from public.arena_crew_follows f where f.crew_id = p_crew_id
         ),
         updated_at = now()
   where id = p_crew_id
  returning * into v_crew;

  return public.arena_crew_payload(v_crew);
end;
$$;

create or replace function public.unfollow_arena_crew(p_crew_id text)
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
    raise exception 'sign in to unfollow a crew' using errcode = '42501';
  end if;

  delete from public.arena_crew_follows
   where crew_id = p_crew_id and profile_id = v_user;

  update public.arena_crews
     set follower_count = (
           select count(*)::integer from public.arena_crew_follows f where f.crew_id = p_crew_id
         ),
         updated_at = now()
   where id = p_crew_id
  returning * into v_crew;

  if not found then
    raise exception 'crew does not exist' using errcode = 'P0002';
  end if;
  return public.arena_crew_payload(v_crew);
end;
$$;

revoke execute on function public.follow_arena_crew(text) from public;
revoke execute on function public.unfollow_arena_crew(text) from public;
grant execute on function public.follow_arena_crew(text) to authenticated;
grant execute on function public.unfollow_arena_crew(text) to authenticated;

-- ── 13. Invites ─────────────────────────────────────────────────────────────
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

  v_id := public.new_arena_id('aci_');
  insert into public.arena_crew_invites (id, crew_id, inviter_id, recipient_id)
  values (v_id, p_crew_id, v_user, p_recipient_id);

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
    update public.arena_crew_invites
       set status = 'EXPIRED', responded_at = now()
     where id = p_invite_id;
    raise exception 'invite expired' using errcode = 'P0003';
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

  insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
  values (v_crew.id, v_user, 'MEMBER', true)
  on conflict (crew_id, profile_id) do update
    set left_at = null, role = 'MEMBER', is_primary = true, joined_at = now()
  where public.arena_crew_memberships.left_at is not null;

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

revoke execute on function public.invite_to_arena_crew(text, text) from public;
revoke execute on function public.respond_arena_crew_invite(text, boolean) from public;
grant execute on function public.invite_to_arena_crew(text, text) to authenticated;
grant execute on function public.respond_arena_crew_invite(text, boolean) to authenticated;

-- ── 14. Join requests ───────────────────────────────────────────────────────
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
  insert into public.arena_crew_join_requests (id, crew_id, requester_id)
  values (v_id, p_crew_id, v_user);

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

  insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
  values (v_crew.id, v_req.requester_id, 'MEMBER', true)
  on conflict (crew_id, profile_id) do update
    set left_at = null, role = 'MEMBER', is_primary = true, joined_at = now()
  where public.arena_crew_memberships.left_at is not null;

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

revoke execute on function public.request_arena_crew_join(text) from public;
revoke execute on function public.decide_arena_crew_join_request(text, boolean) from public;
grant execute on function public.request_arena_crew_join(text) to authenticated;
grant execute on function public.decide_arena_crew_join_request(text, boolean) to authenticated;

-- ── 15. Reads ───────────────────────────────────────────────────────────────
create or replace function public.get_arena_crew(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_crew public.arena_crews%rowtype;
begin
  select * into v_crew
    from public.arena_crews
   where slug = lower(btrim(p_slug)) and archived_at is null;
  if not found then
    return null;
  end if;
  return public.arena_crew_payload(v_crew);
end;
$$;

create or replace function public.list_arena_crews(
  p_limit integer default 24,
  p_offset integer default 0,
  p_specialty text default null
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
  select coalesce(jsonb_agg(public.arena_crew_payload(c) order by c.member_count desc, c.created_at desc), '[]'::jsonb)
    into v_out
    from (
      select *
        from public.arena_crews c
       where c.archived_at is null
         and (
           p_specialty is null
           or p_specialty = any (c.specialties)
         )
       order by c.member_count desc, c.created_at desc
       limit v_limit offset v_off
    ) c;
  return coalesce(v_out, '[]'::jsonb);
end;
$$;

create or replace function public.list_my_arena_crews()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user text := public.my_profile_id();
  v_out  jsonb;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(public.arena_crew_payload(c) order by m.joined_at desc), '[]'::jsonb)
    into v_out
    from public.arena_crew_memberships m
    join public.arena_crews c on c.id = m.crew_id
   where m.profile_id = v_user
     and m.left_at is null
     and c.archived_at is null;
  return coalesce(v_out, '[]'::jsonb);
end;
$$;

revoke execute on function public.get_arena_crew(text) from public;
revoke execute on function public.list_arena_crews(integer, integer, text) from public;
revoke execute on function public.list_my_arena_crews() from public;
grant execute on function public.get_arena_crew(text) to authenticated;
grant execute on function public.list_arena_crews(integer, integer, text) to authenticated;
grant execute on function public.list_my_arena_crews() to authenticated;

comment on table public.arena_crews is
  'Persistent Arena competitive communities. Rooms remain the battleground.';
comment on table public.arena_crew_memberships is
  'One active membership per profile. Follows are separate and unlimited.';
