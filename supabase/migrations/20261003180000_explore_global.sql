-- Phase 14.0 â€” Explore global discovery.
-- Explicit public country on profiles (never GPS).
-- Challenges + treasure hunts foundations.
-- Bounded Explore RPCs with moderation / Vault free-only safety.

-- â”€â”€ 1. Explicit public country (ISO-3166-1 alpha-2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
alter table public.profiles
  add column if not exists public_country_code text;

alter table public.profiles
  drop constraint if exists profiles_public_country_code_check;

alter table public.profiles
  add constraint profiles_public_country_code_check
  check (
    public_country_code is null
    or public_country_code ~ '^[A-Z]{2}$'
  );

comment on column public.profiles.public_country_code is
  'Creator-declared public country (ISO alpha-2). Never inferred from GPS.';

grant update (public_country_code) on table public.profiles to authenticated;

create index if not exists profiles_public_country_idx
  on public.profiles (public_country_code)
  where public_country_code is not null;

-- â”€â”€ 2. Challenges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
do $$ begin
  create type public.explore_challenge_type as enum ('GLOBAL', 'COUNTRY', 'CREATOR');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.explore_challenge_status as enum ('scheduled', 'active', 'ended', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.explore_challenges (
  id            text primary key default public.new_arena_id('ec_'),
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  description   text check (description is null or char_length(description) <= 2000),
  challenge_type public.explore_challenge_type not null,
  country_code  text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  creator_id    text references public.profiles (id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        public.explore_challenge_status not null default 'scheduled',
  cover_url     text,
  entry_count   integer not null default 0 check (entry_count >= 0),
  visibility    text not null default 'public' check (visibility in ('public', 'unlisted')),
  created_at    timestamptz not null default now(),
  constraint explore_challenges_window check (ends_at > starts_at),
  constraint explore_challenges_country check (
    (challenge_type = 'COUNTRY' and country_code is not null)
    or (challenge_type <> 'COUNTRY')
  )
);

create index if not exists explore_challenges_active_idx
  on public.explore_challenges (status, ends_at desc)
  where visibility = 'public';

create index if not exists explore_challenges_country_idx
  on public.explore_challenges (country_code, status)
  where country_code is not null;

alter table public.explore_challenges enable row level security;

drop policy if exists "explore challenges are publicly readable" on public.explore_challenges;
create policy "explore challenges are publicly readable"
  on public.explore_challenges for select to anon, authenticated
  using (visibility = 'public' and status in ('scheduled', 'active', 'ended'));

revoke all on table public.explore_challenges from public, anon, authenticated;
grant select on table public.explore_challenges to anon, authenticated;

-- â”€â”€ 3. Treasure hunts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
do $$ begin
  create type public.explore_treasure_status as enum ('scheduled', 'active', 'ended', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.explore_reward_type as enum (
    'badge', 'cosmetic', 'free_drop', 'creator_access', 'collectible', 'sponsor'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.explore_treasure_hunts (
  id               text primary key default public.new_arena_id('th_'),
  title            text not null check (char_length(btrim(title)) between 1 and 120),
  description      text check (description is null or char_length(description) <= 2000),
  country_code     text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  creator_id       text references public.profiles (id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           public.explore_treasure_status not null default 'scheduled',
  clue             text not null check (char_length(btrim(clue)) between 1 and 500),
  reward_type      public.explore_reward_type not null default 'badge',
  reward_metadata  jsonb not null default '{}'::jsonb,
  gifts_remaining  integer not null default 0 check (gifts_remaining >= 0),
  visibility       text not null default 'public' check (visibility in ('public', 'unlisted')),
  created_at       timestamptz not null default now(),
  constraint explore_treasure_window check (ends_at > starts_at)
);

create table if not exists public.explore_treasure_progress (
  hunt_id      text not null references public.explore_treasure_hunts (id) on delete cascade,
  profile_id   text not null references public.profiles (id) on delete cascade,
  progress     integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (hunt_id, profile_id),
  constraint explore_treasure_progress_complete check (
    (completed_at is null) or (completed_at is not null and progress > 0)
  )
);

create index if not exists explore_treasure_active_idx
  on public.explore_treasure_hunts (status, ends_at desc)
  where visibility = 'public';

alter table public.explore_treasure_hunts enable row level security;
alter table public.explore_treasure_progress enable row level security;

drop policy if exists "explore treasures are publicly readable" on public.explore_treasure_hunts;
create policy "explore treasures are publicly readable"
  on public.explore_treasure_hunts for select to anon, authenticated
  using (visibility = 'public' and status in ('scheduled', 'active', 'ended'));

drop policy if exists "explore treasure progress is own" on public.explore_treasure_progress;
create policy "explore treasure progress is own"
  on public.explore_treasure_progress for select to authenticated
  using (public.owns_profile(profile_id) or public.is_staff());

revoke all on table public.explore_treasure_hunts from public, anon, authenticated;
revoke all on table public.explore_treasure_progress from public, anon, authenticated;
grant select on table public.explore_treasure_hunts to anon, authenticated;
grant select on table public.explore_treasure_progress to authenticated;

-- Completion is server-authoritative â€” no client INSERT/UPDATE grants on progress.
-- Staff/service_role claim path comes in a later phase.

-- â”€â”€ 4. Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.explore_actor_hidden(p_viewer text, p_author text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null or p_author is null then false
    when p_viewer = p_author then false
    else exists (
      select 1 from public.blocks b
       where (b.blocker_id = p_viewer and b.blocked_id = p_author)
          or (b.blocker_id = p_author and b.blocked_id = p_viewer)
    ) or exists (
      select 1 from public.mutes m
       where m.muter_id = p_viewer and m.muted_id = p_author
    )
  end;
$$;

revoke execute on function public.explore_actor_hidden(text, text) from public;
grant execute on function public.explore_actor_hidden(text, text) to anon, authenticated;

-- Privacy floor for country activity aggregates.
create or replace function public.explore_country_activity_count(p_code text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.profiles p
   where p.public_country_code = p_code;
$$;

revoke execute on function public.explore_country_activity_count(text) from public;

-- â”€â”€ 5. World summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.get_explore_world_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_countries jsonb;
  v_viral jsonb;
  v_challenges jsonb;
  v_treasures jsonb;
  v_live integer;
begin
  -- Coarse country pulses â€” only when â‰¥ 3 public profiles declare that country.
  select coalesce(jsonb_agg(s.x order by s.activity_count desc), '[]'::jsonb)
    into v_countries
    from (
      select jsonb_build_object(
               'countryCode', p.public_country_code,
               'activityCount', count(*)::integer,
               'hasChallenge', exists (
                 select 1 from public.explore_challenges c
                  where c.country_code = p.public_country_code
                    and c.visibility = 'public'
                    and c.status = 'active'
                    and c.ends_at > now()
               ),
               'hasTreasure', exists (
                 select 1 from public.explore_treasure_hunts t
                  where t.country_code = p.public_country_code
                    and t.visibility = 'public'
                    and t.status = 'active'
                    and t.ends_at > now()
               )
             ) as x,
             count(*)::integer as activity_count
        from public.profiles p
       where p.public_country_code is not null
       group by p.public_country_code
      having count(*) >= 3
       order by count(*) desc
       limit 40
    ) s;

  select count(*)::integer into v_live
    from public.arena_daily_topics t
   where t.status = 'live';

  select coalesce(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb)
    into v_challenges
    from (
      select id, title, description, challenge_type as "challengeType",
             country_code as "countryCode", status, entry_count as "entryCount",
             ends_at as "endsAt"
        from public.explore_challenges
       where visibility = 'public' and status = 'active' and ends_at > now()
       order by ends_at asc
       limit 8
    ) c;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    into v_treasures
    from (
      select id, title, description, country_code as "countryCode", status,
             clue, gifts_remaining as "giftsRemaining", ends_at as "endsAt",
             reward_type as "rewardType"
        from public.explore_treasure_hunts
       where visibility = 'public' and status = 'active' and ends_at > now()
       order by ends_at asc
       limit 8
    ) t;

  return jsonb_build_object(
    'countries', coalesce(v_countries, '[]'::jsonb),
    'liveTopicCount', coalesce(v_live, 0),
    'challenges', coalesce(v_challenges, '[]'::jsonb),
    'treasures', coalesce(v_treasures, '[]'::jsonb),
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.get_explore_world_summary() from public;
grant execute on function public.get_explore_world_summary() to anon, authenticated;

-- â”€â”€ 6. Country page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.get_explore_country(p_country_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_code   text := upper(btrim(coalesce(p_country_code, '')));
  v_activity integer;
  v_creators jsonb;
  v_takes jsonb;
  v_vault jsonb;
  v_challenges jsonb;
  v_treasures jsonb;
  v_topics jsonb;
begin
  if v_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid country code' using errcode = 'P0003';
  end if;

  v_activity := public.explore_country_activity_count(v_code);

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_creators
    from (
      select jsonb_build_object(
               'id', p.id,
               'handle', p.handle,
               'name', p.name,
               'avatarTint', p.avatar_tint,
               'homeHood', p.home_hood,
               'rank', p.rank
             ) as x
        from public.profiles p
       where p.public_country_code = v_code
         and not public.explore_actor_hidden(v_viewer, p.id)
       order by p.reputation desc, p.id asc
       limit 12
    ) s;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_takes
    from (
      select jsonb_build_object(
               'id', t.id,
               'text', left(t.text, 180),
               'heat', t.heat,
               'authorId', t.author_id,
               'authorHandle', p.handle,
               'authorName', p.name,
               'mediaUrl', t.media_url,
               'mediaKind', t.media_kind,
               'createdAt', t.created_at
             ) as x
        from public.takes t
        join public.profiles p on p.id = t.author_id
       where p.public_country_code = v_code
         and t.status = 'active'
         and t.expires_at > now()
         and not public.explore_actor_hidden(v_viewer, t.author_id)
       order by t.heat desc, t.created_at desc
       limit 12
    ) s;

  -- FREE Vault previews only â€” never subscriber media paths.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_vault
    from (
      select jsonb_build_object(
               'dropId', d.id,
               'vaultId', d.vault_id,
               'creatorId', v.creator_id,
               'title', d.caption,
               'accessLevel', d.access_level,
               'publicMediaPath', m.storage_path,
               'mediaKind', m.media_kind,
               'authorHandle', p.handle,
               'authorName', p.name,
               'authorTint', p.avatar_tint
             ) as x
        from public.vault_drops d
        join public.creator_vaults v on v.id = d.vault_id and v.status = 'active'
        join public.profiles p on p.id = v.creator_id
        join public.media_objects m on m.id = d.media_object_id
       where p.public_country_code = v_code
         and d.status = 'published'
         and d.access_level = 'free'
         and d.expires_at > now()
         and d.deleted_at is null
         and m.visibility = 'public'
         and m.status = 'ready'
         and not public.explore_actor_hidden(v_viewer, v.creator_id)
       order by d.published_at desc
       limit 8
    ) s;

  select coalesce(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb) into v_challenges
    from (
      select id, title, description, challenge_type as "challengeType",
             country_code as "countryCode", status, entry_count as "entryCount",
             ends_at as "endsAt"
        from public.explore_challenges
       where visibility = 'public'
         and status = 'active'
         and ends_at > now()
         and (country_code = v_code or challenge_type = 'GLOBAL')
       order by ends_at asc
       limit 8
    ) c;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_treasures
    from (
      select id, title, description, country_code as "countryCode", status,
             clue, gifts_remaining as "giftsRemaining", ends_at as "endsAt",
             reward_type as "rewardType"
        from public.explore_treasure_hunts
       where visibility = 'public'
         and status = 'active'
         and ends_at > now()
         and (country_code = v_code or country_code is null)
       order by ends_at asc
       limit 8
    ) t;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_topics
    from (
      select jsonb_build_object(
               'id', t.id,
               'title', t.title,
               'hood', t.hood,
               'status', t.status,
               'closesAt', t.closes_at
             ) as x
        from public.arena_daily_topics t
       where t.status = 'live'
       order by t.closes_at asc
       limit 6
    ) s;

  return jsonb_build_object(
    'countryCode', v_code,
    -- Suppress count below privacy floor.
    'activityCount', case when v_activity >= 3 then v_activity else null end,
    'creators', coalesce(v_creators, '[]'::jsonb),
    'takes', coalesce(v_takes, '[]'::jsonb),
    'vaultPreviews', coalesce(v_vault, '[]'::jsonb),
    'challenges', coalesce(v_challenges, '[]'::jsonb),
    'treasures', coalesce(v_treasures, '[]'::jsonb),
    'liveTopics', coalesce(v_topics, '[]'::jsonb),
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.get_explore_country(text) from public;
grant execute on function public.get_explore_country(text) to anon, authenticated;

-- â”€â”€ 7. Global viral â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.get_global_viral(p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 12), 24));
  v_items  jsonb := '[]'::jsonb;
begin
  -- Live Arena topics first (real live signal).
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_items
    from (
      select jsonb_build_object(
               'kind', 'LIVE_ARENA',
               'id', t.id,
               'title', t.title,
               'subtitle', coalesce(t.hood::text, 'Live Arena'),
               'score', 1000,
               'countryCode', null,
               'href', '/arena/topic/' || t.id
             ) as x
        from public.arena_daily_topics t
       where t.status = 'live'
       order by t.closes_at asc
       limit greatest(1, v_limit / 3)
    ) s;

  v_items := v_items || coalesce((
    select jsonb_agg(x)
      from (
        select jsonb_build_object(
                 'kind', 'TAKE',
                 'id', t.id,
                 'title', left(t.text, 120),
                 'subtitle', '@' || p.handle,
                 'score', t.heat,
                 'countryCode', p.public_country_code,
                 'mediaUrl', t.media_url,
                 'href', '/take/' || t.id
               ) as x
          from public.takes t
          join public.profiles p on p.id = t.author_id
         where t.status = 'active'
           and t.expires_at > now()
           and t.heat >= 3
           and not public.explore_actor_hidden(v_viewer, t.author_id)
         order by t.heat desc, t.created_at desc
         limit v_limit
      ) s
  ), '[]'::jsonb);

  v_items := v_items || coalesce((
    select jsonb_agg(x)
      from (
        select jsonb_build_object(
                 'kind', 'VAULT_PREVIEW',
                 'id', d.id,
                 'title', d.caption,
                 'subtitle', '@' || p.handle,
                 'score', 50,
                 'countryCode', p.public_country_code,
                 'href', '/vault/drop/' || d.id
               ) as x
          from public.vault_drops d
          join public.creator_vaults v on v.id = d.vault_id and v.status = 'active'
          join public.profiles p on p.id = v.creator_id
          join public.media_objects m on m.id = d.media_object_id
         where d.status = 'published'
           and d.access_level = 'free'
           and d.expires_at > now()
           and d.deleted_at is null
           and m.visibility = 'public'
           and m.status = 'ready'
           and not public.explore_actor_hidden(v_viewer, v.creator_id)
         order by d.published_at desc
         limit greatest(1, v_limit / 4)
      ) s
  ), '[]'::jsonb);

  v_items := v_items || coalesce((
    select jsonb_agg(x)
      from (
        select jsonb_build_object(
                 'kind', 'CHALLENGE',
                 'id', c.id,
                 'title', c.title,
                 'subtitle', c.challenge_type::text,
                 'score', c.entry_count + 10,
                 'countryCode', c.country_code,
                 'href', null
               ) as x
          from public.explore_challenges c
         where c.visibility = 'public' and c.status = 'active' and c.ends_at > now()
         order by c.entry_count desc, c.ends_at asc
         limit 4
      ) s
  ), '[]'::jsonb);

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(elem order by (elem->>'score')::numeric desc)
        from (
          select elem
            from jsonb_array_elements(v_items) elem
           order by (elem->>'score')::numeric desc
           limit v_limit
        ) ranked
    ), '[]'::jsonb),
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.get_global_viral(integer) from public;
grant execute on function public.get_global_viral(integer) to anon, authenticated;

-- â”€â”€ 8. Teleport (server-side eligible candidate) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.get_teleport_candidate(
  p_exclude_ids text[] default '{}'::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_pick   jsonb;
begin
  -- Weighted pool: live topics, hot takes, free vault, challenges.
  -- Exclude recent ids; never private/subscriber vault; never blocked authors.
  select x into v_pick
    from (
      select jsonb_build_object(
               'kind', 'LIVE_ARENA',
               'id', t.id,
               'title', t.title,
               'countryCode', null,
               'href', '/arena/topic/' || t.id
             ) as x,
             3::numeric as weight
        from public.arena_daily_topics t
       where t.status = 'live'
         and not (t.id = any (coalesce(p_exclude_ids, '{}'::text[])))

      union all

      select jsonb_build_object(
               'kind', 'TAKE',
               'id', t.id,
               'title', left(t.text, 120),
               'countryCode', p.public_country_code,
               'href', '/take/' || t.id
             ),
             greatest(1, least(t.heat, 20))::numeric
        from public.takes t
        join public.profiles p on p.id = t.author_id
       where t.status = 'active'
         and t.expires_at > now()
         and t.heat >= 1
         and not (t.id = any (coalesce(p_exclude_ids, '{}'::text[])))
         and not public.explore_actor_hidden(v_viewer, t.author_id)

      union all

      select jsonb_build_object(
               'kind', 'VAULT_PREVIEW',
               'id', d.id,
               'title', d.caption,
               'countryCode', p.public_country_code,
               'href', '/vault/drop/' || d.id
             ),
             2::numeric
        from public.vault_drops d
        join public.creator_vaults v on v.id = d.vault_id and v.status = 'active'
        join public.profiles p on p.id = v.creator_id
        join public.media_objects m on m.id = d.media_object_id
       where d.status = 'published'
         and d.access_level = 'free'
         and d.expires_at > now()
         and d.deleted_at is null
         and m.visibility = 'public'
         and m.status = 'ready'
         and not (d.id = any (coalesce(p_exclude_ids, '{}'::text[])))
         and not public.explore_actor_hidden(v_viewer, v.creator_id)

      union all

      select jsonb_build_object(
               'kind', 'CHALLENGE',
               'id', c.id,
               'title', c.title,
               'countryCode', c.country_code,
               'href', null
             ),
             2::numeric
        from public.explore_challenges c
       where c.visibility = 'public' and c.status = 'active' and c.ends_at > now()
         and not (c.id = any (coalesce(p_exclude_ids, '{}'::text[])))
    ) pool
   order by random() * pool.weight desc
   limit 1;

  if v_pick is null then
    return jsonb_build_object('candidate', null);
  end if;

  return jsonb_build_object('candidate', v_pick);
end;
$$;

revoke execute on function public.get_teleport_candidate(text[]) from public;
grant execute on function public.get_teleport_candidate(text[]) to anon, authenticated;

-- â”€â”€ 9. Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.search_explore(p_query text, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_q      text := lower(btrim(coalesce(p_query, '')));
  v_limit  integer := greatest(1, least(coalesce(p_limit, 20), 40));
begin
  if char_length(v_q) < 2 then
    return jsonb_build_object(
      'countries', '[]'::jsonb,
      'people', '[]'::jsonb,
      'takes', '[]'::jsonb,
      'topics', '[]'::jsonb,
      'vault', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'countries', (
      select coalesce(jsonb_agg(jsonb_build_object('countryCode', c.code, 'name', c.name)), '[]'::jsonb)
        from (
          values
            ('IN','India'),('JP','Japan'),('BR','Brazil'),('DE','Germany'),
            ('KR','South Korea'),('US','United States'),('GB','United Kingdom'),
            ('FR','France'),('NG','Nigeria'),('MX','Mexico'),('AU','Australia'),
            ('CA','Canada'),('ID','Indonesia'),('PH','Philippines'),('ZA','South Africa')
        ) as c(code, name)
       where lower(c.name) like '%' || v_q || '%' or lower(c.code) = v_q
       limit 8
    ),
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'handle', p.handle, 'name', p.name,
               'avatarTint', p.avatar_tint, 'countryCode', p.public_country_code
             )), '[]'::jsonb)
        from (
          select p.*
            from public.profiles p
           where (lower(p.handle) like '%' || v_q || '%' or lower(p.name) like '%' || v_q || '%')
             and not public.explore_actor_hidden(v_viewer, p.id)
           order by p.reputation desc
           limit v_limit
        ) p
    ),
    'takes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'text', left(t.text, 140), 'heat', t.heat,
               'authorHandle', t.handle
             )), '[]'::jsonb)
        from (
          select t.id, t.text, t.heat, p.handle
            from public.takes t
            join public.profiles p on p.id = t.author_id
           where t.status = 'active'
             and t.expires_at > now()
             and lower(t.text) like '%' || v_q || '%'
             and not public.explore_actor_hidden(v_viewer, t.author_id)
           order by t.heat desc
           limit v_limit
        ) t
    ),
    'topics', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'title', t.title, 'status', t.status
             )), '[]'::jsonb)
        from (
          select t.id, t.title, t.status
            from public.arena_daily_topics t
           where t.status in ('live', 'scheduled')
             and lower(t.title) like '%' || v_q || '%'
           order by t.opens_at desc
           limit 8
        ) t
    ),
    'vault', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dropId', d.id, 'title', d.caption, 'creatorHandle', d.handle,
               'accessLevel', d.access_level
             )), '[]'::jsonb)
        from (
          select d.id, d.caption, p.handle, d.access_level
            from public.vault_drops d
            join public.creator_vaults v on v.id = d.vault_id and v.status = 'active'
            join public.profiles p on p.id = v.creator_id
            join public.media_objects m on m.id = d.media_object_id
           where d.status = 'published'
             and d.access_level = 'free'
             and d.expires_at > now()
             and d.deleted_at is null
             and m.visibility = 'public'
             and lower(d.caption) like '%' || v_q || '%'
             and not public.explore_actor_hidden(v_viewer, v.creator_id)
           order by d.published_at desc
           limit 8
        ) d
    )
  );
end;
$$;

revoke execute on function public.search_explore(text, integer) from public;
grant execute on function public.search_explore(text, integer) to anon, authenticated;

-- â”€â”€ 10. Vault security guard: explore never returns subscriber media â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.list_explore_vault_previews(p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 12), 24));
begin
  return coalesce((
    select jsonb_agg(x)
      from (
        select jsonb_build_object(
                 'dropId', d.id,
                 'title', d.caption,
                 'creatorId', v.creator_id,
                 'creatorHandle', p.handle,
                 'creatorName', p.name,
                 'accessLevel', d.access_level,
                 'publicMediaPath', m.storage_path,
                 'mediaKind', m.media_kind,
                 'countryCode', p.public_country_code
               ) as x
          from public.vault_drops d
          join public.creator_vaults v on v.id = d.vault_id and v.status = 'active'
          join public.profiles p on p.id = v.creator_id
          join public.media_objects m on m.id = d.media_object_id
         where d.status = 'published'
           and d.access_level = 'free'
           and d.expires_at > now()
           and d.deleted_at is null
           and m.visibility = 'public'
           and m.status = 'ready'
           and not public.explore_actor_hidden(v_viewer, v.creator_id)
         order by d.published_at desc
         limit v_limit
      ) s
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_explore_vault_previews(integer) from public;
grant execute on function public.list_explore_vault_previews(integer) to anon, authenticated;

comment on function public.list_explore_vault_previews(integer) is
  'Explore Vault shelf: FREE + public media only. Never subscriber-only paths.';
