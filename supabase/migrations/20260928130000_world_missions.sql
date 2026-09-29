-- ============================================================================
-- CLASH 2.0 · Phase 5 Step 1 — World Missions + location-safe foundation
-- ----------------------------------------------------------------------------
-- World is an intentional discovery layer, NOT live location sharing.
--
-- Privacy (non-negotiable):
--   · Client may send precise lat/lng ONLY into create_world_drop / world_nearby.
--   · create_world_drop fuzzes immediately and NEVER persists the raw point.
--   · world_nearby uses viewer coordinates transiently for distance; never stores them.
--   · Returned locations are cell centres only; distances are coarse bands.
--
-- Location precision retained (document honestly — not security theatre):
--   WORLD_GRID_DEG = 0.005° ≈ 555 m north–south.
--   Server floors each axis onto that grid and stores the CELL CENTRE
--   (origin + half-cell). Half-cell ≈ ±280 m N–S; E–W half-cell shrinks with
--   latitude (~±280 m near equator, ~±200 m at 45°). Individual buildings /
--   homes cannot be reconstructed from the stored value. location_cell is
--   ST_GeoHash of that fuzzed point at precision 6 (~1.2 km × 0.6 km) for
--   coarse indexing only — never treated as a precise address.
--
-- Mission submissions: ONE World Drop per (mission, author) while the row is
-- not REMOVED. Multiple free (mission-less) drops are allowed; v1 UI always
-- participates through an active Mission.
-- ============================================================================

-- ── 0. PostGIS ──────────────────────────────────────────────────────────────
create extension if not exists postgis with schema extensions;

-- Prefer extensions schema for PostGIS; qualify as extensions.* below.
-- Some local stacks install into public — support both via search helpers.

-- ── 1. Enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type public.world_mission_status as enum ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.world_drop_status as enum ('DRAFT', 'PUBLISHED', 'EXPIRED', 'REMOVED');
exception when duplicate_object then null;
end $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.world_missions (
  id          text primary key,
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  prompt      text not null check (char_length(prompt) between 1 and 200),
  status      public.world_mission_status not null default 'DRAFT',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists world_missions_status_ends_idx
  on public.world_missions (status, ends_at desc);

create table if not exists public.world_drops (
  id                   text primary key,
  mission_id           text references public.world_missions (id),
  author_id            text not null references public.profiles (id) on delete cascade,
  media_object_id      text not null references public.media_objects (id),
  caption              text not null default '' check (char_length(caption) <= 180),
  -- Approximate only: never write a precise GPS reading into this column.
  approx_location      extensions.geography(Point, 4326) not null,
  location_cell        text not null check (char_length(location_cell) between 1 and 12),
  location_label       text check (location_label is null or char_length(location_label) between 1 and 60),
  status               public.world_drop_status not null default 'DRAFT',
  created_at           timestamptz not null default now(),
  published_at         timestamptz,
  expires_at           timestamptz,
  deleted_at           timestamptz
);

create index if not exists world_drops_author_idx on public.world_drops (author_id, created_at desc);
create index if not exists world_drops_mission_idx on public.world_drops (mission_id, published_at desc);
create index if not exists world_drops_status_expires_idx
  on public.world_drops (status, expires_at)
  where status = 'PUBLISHED';
create index if not exists world_drops_approx_gix
  on public.world_drops using gist (approx_location);
create index if not exists world_drops_cell_idx on public.world_drops (location_cell);

-- One live submission per mission per author (REMOVED frees the slot).
create unique index if not exists world_drops_one_per_mission_idx
  on public.world_drops (mission_id, author_id)
  where mission_id is not null
    and deleted_at is null
    and status <> 'REMOVED';

-- ── 3. Location helpers ─────────────────────────────────────────────────────
/**
 * Snap precise WGS84 coordinates to a ~500–600 m cell centre.
 * Returns geography Point. NEVER persist the input coordinates elsewhere.
 */
create or replace function public.world_fuzz_location(
  p_lat double precision,
  p_lng double precision
)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_grid constant double precision := 0.005; -- ≈ 555 m N–S
  v_lat double precision;
  v_lng double precision;
begin
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates' using errcode = 'P0001';
  end if;

  v_lat := (floor(p_lat / c_grid) * c_grid) + (c_grid / 2.0);
  v_lng := (floor(p_lng / c_grid) * c_grid) + (c_grid / 2.0);

  -- Clamp after snap (poles / antimeridian edge cases).
  if v_lat > 90 then v_lat := 90; end if;
  if v_lat < -90 then v_lat := -90; end if;
  if v_lng > 180 then v_lng := 180; end if;
  if v_lng < -180 then v_lng := -180; end if;

  return extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography;
end;
$$;

/** Coarse distance band — never expose metre-level closeness. */
create or replace function public.world_distance_band(p_meters double precision)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_meters is null then null
    when p_meters < 1000 then '< 1 km'
    when p_meters < 3000 then '1–3 km'
    when p_meters < 10000 then '3–10 km'
    when p_meters < 25000 then '10–25 km'
    else '25+ km'
  end;
$$;

/** True when viewer should not discover this author (block either way, or mute). */
create or replace function public.world_author_hidden(
  p_viewer text,
  p_author text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null or p_author is null or p_viewer = p_author then false
    else exists (
           select 1 from public.blocks b
            where (b.blocker_id = p_viewer and b.blocked_id = p_author)
               or (b.blocker_id = p_author and b.blocked_id = p_viewer)
         )
      or exists (
           select 1 from public.mutes m
            where m.muter_id = p_viewer and m.muted_id = p_author
         )
  end;
$$;

/** JSON card for one Drop — approx coords only, optional distance band. */
create or replace function public.world_drop_card(
  p_drop public.world_drops,
  p_meters double precision default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_media public.media_objects%rowtype;
  v_author public.profiles%rowtype;
  v_mission public.world_missions%rowtype;
  v_lat double precision;
  v_lng double precision;
begin
  select * into v_media from public.media_objects where id = p_drop.media_object_id;
  select * into v_author from public.profiles where id = p_drop.author_id;
  if p_drop.mission_id is not null then
    select * into v_mission from public.world_missions where id = p_drop.mission_id;
  end if;

  v_lng := extensions.ST_X(p_drop.approx_location::extensions.geometry);
  v_lat := extensions.ST_Y(p_drop.approx_location::extensions.geometry);

  return jsonb_build_object(
    'id', p_drop.id,
    'missionId', p_drop.mission_id,
    'caption', p_drop.caption,
    'status', p_drop.status,
    'publishedAt', p_drop.published_at,
    'expiresAt', p_drop.expires_at,
    'locationLabel', p_drop.location_label,
    'approxLat', round(v_lat::numeric, 4),
    'approxLng', round(v_lng::numeric, 4),
    'distanceBand', public.world_distance_band(p_meters),
    'author', case when v_author.id is null then null else jsonb_build_object(
      'id', v_author.id,
      'handle', v_author.handle,
      'name', v_author.name,
      'avatarTint', v_author.avatar_tint
    ) end,
    'media', case
      when v_media.id is null or v_media.status <> 'ready' or v_media.deleted_at is not null then null
      else jsonb_build_object(
        'id', v_media.id,
        'bucket', v_media.bucket,
        'path', v_media.storage_path,
        'kind', v_media.media_kind
      )
    end,
    'mission', case when v_mission.id is null then null else jsonb_build_object(
      'id', v_mission.id,
      'title', v_mission.title,
      'prompt', v_mission.prompt
    ) end
  );
end;
$$;

-- ── 4. Mission staff create ─────────────────────────────────────────────────
create or replace function public.create_world_mission(
  p_title       text,
  p_description text,
  p_prompt      text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_status      public.world_mission_status default 'ACTIVE'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
  v_title text := trim(p_title);
  v_desc text := coalesce(trim(p_description), '');
  v_prompt text := trim(p_prompt);
begin
  -- Staff session OR service_role (auth.uid() null under service_role bypasses is_staff).
  if auth.role() is distinct from 'service_role' and not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'title must be 1–80 characters' using errcode = 'P0001';
  end if;
  if char_length(v_desc) > 400 then
    raise exception 'description too long' using errcode = 'P0001';
  end if;
  if v_prompt is null or char_length(v_prompt) < 1 or char_length(v_prompt) > 200 then
    raise exception 'prompt must be 1–200 characters' using errcode = 'P0001';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid mission window' using errcode = 'P0002';
  end if;

  v_id := 'wm_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20));
  insert into public.world_missions (id, title, description, prompt, status, starts_at, ends_at)
  values (v_id, v_title, v_desc, v_prompt, coalesce(p_status, 'ACTIVE'), p_starts_at, p_ends_at);
  return v_id;
end;
$$;

-- ── 5. create_world_drop ────────────────────────────────────────────────────
create or replace function public.create_world_drop(
  p_mission_id      text,
  p_media_object_id text,
  p_caption         text,
  p_latitude        double precision,
  p_longitude       double precision
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_media public.media_objects%rowtype;
  v_mission public.world_missions%rowtype;
  v_caption text := coalesce(trim(p_caption), '');
  v_approx extensions.geography;
  v_cell text;
  v_id text;
begin
  if v_author is null then
    raise exception 'sign in to publish a World Drop' using errcode = '42501';
  end if;

  if char_length(v_caption) > 180 then
    raise exception 'caption must be at most 180 characters' using errcode = 'P0001';
  end if;

  select * into v_media from public.media_objects where id = p_media_object_id;
  if v_media.id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  if v_media.owner_id is distinct from v_author then
    raise exception 'media ownership required' using errcode = '42501';
  end if;
  if v_media.status is distinct from 'ready' or v_media.deleted_at is not null then
    raise exception 'media must be ready' using errcode = 'P0003';
  end if;
  if v_media.visibility is distinct from 'public' or v_media.bucket is distinct from 'public-media' then
    raise exception 'World Drops require public media' using errcode = 'P0004';
  end if;

  if p_mission_id is not null then
    select * into v_mission from public.world_missions where id = p_mission_id;
    if v_mission.id is null then
      raise exception 'mission not found' using errcode = 'P0005';
    end if;
    if v_mission.status is distinct from 'ACTIVE'
       or v_mission.starts_at > now()
       or v_mission.ends_at <= now() then
      raise exception 'mission is not accepting submissions' using errcode = 'P0006';
    end if;
    if exists (
      select 1 from public.world_drops d
       where d.mission_id = p_mission_id
         and d.author_id = v_author
         and d.deleted_at is null
         and d.status <> 'REMOVED'
    ) then
      raise exception 'one submission per mission' using errcode = 'P0007';
    end if;
  end if;

  -- Fuzz immediately. Raw lat/lng are local variables only — never inserted.
  v_approx := public.world_fuzz_location(p_latitude, p_longitude);
  v_cell := extensions.ST_GeoHash(v_approx::extensions.geometry, 6);

  v_id := 'wd_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20));

  insert into public.world_drops (
    id, mission_id, author_id, media_object_id, caption,
    approx_location, location_cell, location_label,
    status, published_at, expires_at
  ) values (
    v_id, p_mission_id, v_author, p_media_object_id, v_caption,
    v_approx, v_cell, null,
    'PUBLISHED', now(), now() + interval '7 days'
  );

  return v_id;
end;
$$;

-- ── 6. remove_world_drop ────────────────────────────────────────────────────
create or replace function public.remove_world_drop(p_drop_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_drop public.world_drops%rowtype;
begin
  if v_author is null then
    raise exception 'sign in to remove a World Drop' using errcode = '42501';
  end if;
  select * into v_drop from public.world_drops where id = p_drop_id;
  if v_drop.id is null then
    raise exception 'drop not found' using errcode = 'P0001';
  end if;
  if v_drop.author_id is distinct from v_author and not public.is_staff() then
    raise exception 'not your World Drop' using errcode = '42501';
  end if;
  if v_drop.status = 'REMOVED' then
    return; -- idempotent
  end if;
  update public.world_drops
     set status = 'REMOVED', deleted_at = now()
   where id = p_drop_id;
end;
$$;

-- ── 7. Discovery reads ──────────────────────────────────────────────────────
create or replace function public.world_active_missions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'title', m.title,
    'description', m.description,
    'prompt', m.prompt,
    'status', m.status,
    'startsAt', m.starts_at,
    'endsAt', m.ends_at
  ) order by m.ends_at asc), '[]'::jsonb)
  from public.world_missions m
  where m.status = 'ACTIVE'
    and m.starts_at <= now()
    and m.ends_at > now();
$$;

create or replace function public.world_mission(p_mission_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'title', m.title,
    'description', m.description,
    'prompt', m.prompt,
    'status', m.status,
    'startsAt', m.starts_at,
    'endsAt', m.ends_at
  )
  from public.world_missions m
  where m.id = p_mission_id
    and m.status <> 'DRAFT';
$$;

create or replace function public.world_nearby(
  p_latitude  double precision,
  p_longitude double precision,
  p_radius_km double precision default 25,
  p_limit     integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_origin extensions.geography;
  v_radius_m double precision;
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_result jsonb := '[]'::jsonb;
  r record;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid coordinates' using errcode = 'P0001';
  end if;

  -- Viewer coordinates are local only — never inserted into any table.
  v_origin := extensions.ST_SetSRID(
    extensions.ST_MakePoint(p_longitude, p_latitude), 4326
  )::extensions.geography;
  v_radius_m := greatest(1000, least(coalesce(p_radius_km, 25), 50) * 1000.0);

  for r in
    select d as drop_row,
           extensions.ST_Distance(d.approx_location, v_origin) as meters
      from public.world_drops d
     where d.status = 'PUBLISHED'
       and d.deleted_at is null
       and d.expires_at > now()
       and extensions.ST_DWithin(d.approx_location, v_origin, v_radius_m)
       and not public.world_author_hidden(v_viewer, d.author_id)
     order by meters asc, d.published_at desc
     limit v_limit
  loop
    v_result := v_result || jsonb_build_array(
      public.world_drop_card(r.drop_row, r.meters)
    );
  end loop;

  return v_result;
end;
$$;

create or replace function public.world_recent(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_result jsonb := '[]'::jsonb;
  r public.world_drops%rowtype;
begin
  for r in
    select d.*
      from public.world_drops d
     where d.status = 'PUBLISHED'
       and d.deleted_at is null
       and d.expires_at > now()
       and not public.world_author_hidden(v_viewer, d.author_id)
     order by d.published_at desc
     limit v_limit
  loop
    v_result := v_result || jsonb_build_array(public.world_drop_card(r, null));
  end loop;
  return v_result;
end;
$$;

create or replace function public.world_mission_drops(
  p_mission_id text,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_result jsonb := '[]'::jsonb;
  r public.world_drops%rowtype;
begin
  for r in
    select d.*
      from public.world_drops d
     where d.mission_id = p_mission_id
       and d.status = 'PUBLISHED'
       and d.deleted_at is null
       and d.expires_at > now()
       and not public.world_author_hidden(v_viewer, d.author_id)
     order by d.published_at desc
     limit v_limit
  loop
    v_result := v_result || jsonb_build_array(public.world_drop_card(r, null));
  end loop;
  return v_result;
end;
$$;

create or replace function public.world_my_drops(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_result jsonb := '[]'::jsonb;
  r public.world_drops%rowtype;
begin
  if v_author is null then
    return '[]'::jsonb;
  end if;
  for r in
    select d.*
      from public.world_drops d
     where d.author_id = v_author
       and d.deleted_at is null
       and d.status <> 'REMOVED'
     order by d.created_at desc
     limit v_limit
  loop
    v_result := v_result || jsonb_build_array(public.world_drop_card(r, null));
  end loop;
  return v_result;
end;
$$;

-- ── 8. Expiry + maintenance ─────────────────────────────────────────────────
create or replace function public.expire_world_drops(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  with due as (
    select id from public.world_drops
     where status = 'PUBLISHED'
       and expires_at is not null
       and expires_at <= now()
     order by expires_at asc
     limit greatest(1, least(coalesce(p_limit, 500), 2000))
     for update skip locked
  )
  update public.world_drops d
     set status = 'EXPIRED'
    from due
   where d.id = due.id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.run_maintenance(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clashes integer;
  v_takes   integer;
  v_media   jsonb;
  v_rates   integer;
  v_drops   integer;
  v_subs    integer;
  v_preds   integer;
  v_world   integer;
begin
  select public.settle_due_clashes(p_limit) into v_clashes;
  select public.expire_stale_takes(p_limit) into v_takes;
  select public.cleanup_stale_media(least(p_limit, 100)) into v_media;
  select public.cleanup_rate_limits(interval '7 days') into v_rates;
  select public.expire_vault_drops(p_limit) into v_drops;
  select public.expire_vault_subscriptions(p_limit) into v_subs;
  select public.close_prediction_games(p_limit) into v_preds;
  select public.expire_world_drops(p_limit) into v_world;

  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates,
    'vault_drops_expired', v_drops,
    'vault_subscriptions_expired', v_subs,
    'prediction_games_closed', v_preds,
    'world_drops_expired', v_world
  );
end;
$$;

-- ── 9. RLS ──────────────────────────────────────────────────────────────────
alter table public.world_missions enable row level security;
alter table public.world_drops enable row level security;

drop policy if exists "world missions readable when not draft" on public.world_missions;
create policy "world missions readable when not draft"
  on public.world_missions for select
  using (status <> 'DRAFT' or public.is_staff());

drop policy if exists "published world drops are readable" on public.world_drops;
create policy "published world drops are readable"
  on public.world_drops for select
  using (
    (status = 'PUBLISHED' and deleted_at is null and expires_at > now())
    or public.owns_profile(author_id)
    or public.is_staff()
  );

-- ── 10. Privileges ──────────────────────────────────────────────────────────
revoke all on table public.world_missions from public, anon, authenticated;
revoke all on table public.world_drops from public, anon, authenticated;

grant select on table public.world_missions to anon, authenticated;
grant select on table public.world_drops to anon, authenticated;

-- No raw writes for clients.
revoke insert, update, delete on table public.world_missions from anon, authenticated;
revoke insert, update, delete on table public.world_drops from anon, authenticated;

grant execute on function public.world_fuzz_location(double precision, double precision) to authenticated;
revoke execute on function public.world_fuzz_location(double precision, double precision) from public, anon;

grant execute on function public.world_distance_band(double precision) to anon, authenticated;
revoke execute on function public.world_distance_band(double precision) from public;

grant execute on function public.create_world_drop(text, text, text, double precision, double precision) to authenticated;
revoke execute on function public.create_world_drop(text, text, text, double precision, double precision) from public, anon;

grant execute on function public.remove_world_drop(text) to authenticated;
revoke execute on function public.remove_world_drop(text) from public, anon;

grant execute on function public.world_active_missions() to anon, authenticated;
revoke execute on function public.world_active_missions() from public;

grant execute on function public.world_mission(text) to anon, authenticated;
revoke execute on function public.world_mission(text) from public;

grant execute on function public.world_nearby(double precision, double precision, double precision, integer) to anon, authenticated;
revoke execute on function public.world_nearby(double precision, double precision, double precision, integer) from public;

grant execute on function public.world_recent(integer) to anon, authenticated;
revoke execute on function public.world_recent(integer) from public;

grant execute on function public.world_mission_drops(text, integer) to anon, authenticated;
revoke execute on function public.world_mission_drops(text, integer) from public;

grant execute on function public.world_my_drops(integer) to authenticated;
revoke execute on function public.world_my_drops(integer) from public, anon;

grant execute on function public.create_world_mission(text, text, text, timestamptz, timestamptz, public.world_mission_status) to authenticated, service_role;
revoke execute on function public.create_world_mission(text, text, text, timestamptz, timestamptz, public.world_mission_status) from public, anon;

revoke execute on function public.expire_world_drops(integer) from public, anon, authenticated;
grant execute on function public.expire_world_drops(integer) to service_role;

revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
grant execute on function public.run_maintenance(integer) to service_role;

-- world_drop_card / world_author_hidden are internal helpers — not for clients.
revoke execute on function public.world_drop_card(public.world_drops, double precision) from public, anon, authenticated;
revoke execute on function public.world_author_hidden(text, text) from public, anon, authenticated;

-- ── 11. Seed missions (staff path / local validation) ───────────────────────
insert into public.world_missions (id, title, description, prompt, status, starts_at, ends_at)
values
  (
    'wm_goa_after_dark',
    'Goa After Dark',
    'A weekly World Mission for intentional dusk captures.',
    'Show us something beautiful after sunset.',
    'ACTIVE',
    now() - interval '1 day',
    now() + interval '6 days'
  ),
  (
    'wm_best_200_meal',
    'Best ₹200 Meal',
    'Find a meal worth recommending without spending more than ₹200.',
    'Show a meal worth recommending for ₹200 or less.',
    'ACTIVE',
    now() - interval '1 day',
    now() + interval '6 days'
  )
on conflict (id) do nothing;
