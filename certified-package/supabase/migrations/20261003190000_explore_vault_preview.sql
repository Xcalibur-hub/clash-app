-- ============================================================================
-- Explore 14.0B — Vault PREVIEW discovery (safe public teaser media)
-- ============================================================================
-- Subscriber drops may expose an intentional public preview asset via
-- public_preview_media_object_id. Explore never receives private/subscriber
-- source paths. Preview media must be visibility = public.

alter table public.vault_drops
  add column if not exists public_preview_media_object_id text
    references public.media_objects (id) on delete set null;

comment on column public.vault_drops.public_preview_media_object_id is
  'Optional intentional public teaser media for Explore. Must reference a public media_object. Never used as a signed private path.';

create index if not exists vault_drops_preview_media_idx
  on public.vault_drops (public_preview_media_object_id)
  where public_preview_media_object_id is not null;

alter table public.explore_treasure_hunts
  add column if not exists cover_url text;

-- Shared Explore vault shelf row builder — FREE full public drops + PREVIEW teasers only.
create or replace function public.explore_vault_preview_rows(
  p_viewer text,
  p_country_code text default null,
  p_limit integer default 12
)
returns table (
  drop_id text,
  vault_id text,
  creator_id text,
  title text,
  discovery_access text,
  public_media_path text,
  media_kind text,
  author_handle text,
  author_name text,
  author_tint text,
  country_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    -- FREE drops: main media must be public.
    select
      d.id as drop_id,
      d.vault_id,
      v.creator_id,
      d.caption as title,
      'free'::text as discovery_access,
      m.storage_path as public_media_path,
      m.media_kind::text as media_kind,
      p.handle as author_handle,
      p.name as author_name,
      p.avatar_tint as author_tint,
      p.public_country_code as country_code,
      d.published_at
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
     and m.bucket = 'public-media'
     and (p_country_code is null or p.public_country_code = p_country_code)
     and not public.explore_actor_hidden(p_viewer, v.creator_id)

    union all

    -- PREVIEW: subscriber drop with intentional public teaser media only.
    select
      d.id,
      d.vault_id,
      v.creator_id,
      d.caption,
      'preview'::text,
      pm.storage_path,
      pm.media_kind::text,
      p.handle,
      p.name,
      p.avatar_tint,
      p.public_country_code,
      d.published_at
    from public.vault_drops d
    join public.creator_vaults v on v.id = d.vault_id and v.status = 'active'
    join public.profiles p on p.id = v.creator_id
    join public.media_objects pm on pm.id = d.public_preview_media_object_id
   where d.status = 'published'
     and d.access_level = 'subscriber'
     and d.public_preview_media_object_id is not null
     and d.expires_at > now()
     and d.deleted_at is null
     and pm.visibility = 'public'
     and pm.status = 'ready'
     and pm.bucket = 'public-media'
     and (p_country_code is null or p.public_country_code = p_country_code)
     and not public.explore_actor_hidden(p_viewer, v.creator_id)
     -- Hard guard: never join/return the private subscriber media_object here.
  )
  select
    c.drop_id,
    c.vault_id,
    c.creator_id,
    c.title,
    c.discovery_access,
    c.public_media_path,
    c.media_kind,
    c.author_handle,
    c.author_name,
    c.author_tint,
    c.country_code
  from candidates c
  order by c.published_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 24));
$$;

revoke all on function public.explore_vault_preview_rows(text, text, integer) from public;
grant execute on function public.explore_vault_preview_rows(text, text, integer) to anon, authenticated;

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
    select jsonb_agg(jsonb_build_object(
             'dropId', r.drop_id,
             'vaultId', r.vault_id,
             'creatorId', r.creator_id,
             'title', r.title,
             'accessLevel', r.discovery_access,
             'publicMediaPath', r.public_media_path,
             'mediaKind', r.media_kind,
             'creatorHandle', r.author_handle,
             'creatorName', r.author_name,
             'authorTint', r.author_tint,
             'countryCode', r.country_code
           ))
      from public.explore_vault_preview_rows(v_viewer, null, v_limit) r
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_explore_vault_previews(integer) from public;
grant execute on function public.list_explore_vault_previews(integer) to anon, authenticated;

comment on function public.list_explore_vault_previews(integer) is
  'Explore Vault shelf: FREE public drops + PREVIEW teasers only. Never subscriber source paths.';

-- Patch country vault shelf to include PREVIEW teasers.
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'dropId', r.drop_id,
           'vaultId', r.vault_id,
           'creatorId', r.creator_id,
           'title', r.title,
           'accessLevel', r.discovery_access,
           'publicMediaPath', r.public_media_path,
           'mediaKind', r.media_kind,
           'authorHandle', r.author_handle,
           'authorName', r.author_name,
           'authorTint', r.author_tint
         )), '[]'::jsonb)
    into v_vault
    from public.explore_vault_preview_rows(v_viewer, v_code, 8) r;

  select coalesce(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb) into v_challenges
    from (
      select id, title, description, challenge_type as "challengeType",
             country_code as "countryCode", status, entry_count as "entryCount",
             ends_at as "endsAt", cover_url as "coverUrl"
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
             reward_type as "rewardType", cover_url as "coverUrl"
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

-- Viral + teleport: include PREVIEW vault rows with public teaser paths only.
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
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_items
    from (
      select jsonb_build_object(
               'kind', 'LIVE_ARENA',
               'id', t.id,
               'title', t.title,
               'subtitle', coalesce(t.hood::text, 'Live Arena'),
               'score', 1000,
               'countryCode', null,
               'mediaUrl', null,
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
                 'id', r.drop_id,
                 'title', r.title,
                 'subtitle', '@' || r.author_handle,
                 'score', case when r.discovery_access = 'free' then 55 else 45 end,
                 'countryCode', r.country_code,
                 'mediaUrl', null,
                 'publicMediaPath', r.public_media_path,
                 'accessLevel', r.discovery_access,
                 'href', '/vault/drop/' || r.drop_id
               ) as x
          from public.explore_vault_preview_rows(v_viewer, null, greatest(1, v_limit / 3)) r
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
                 'mediaUrl', c.cover_url,
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
  select x into v_pick
    from (
      select jsonb_build_object(
               'kind', 'LIVE_ARENA',
               'id', t.id,
               'title', t.title,
               'countryCode', null,
               'mediaUrl', null,
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
               'mediaUrl', t.media_url,
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
               'id', r.drop_id,
               'title', r.title,
               'countryCode', r.country_code,
               'mediaUrl', null,
               'publicMediaPath', r.public_media_path,
               'accessLevel', r.discovery_access,
               'href', '/vault/drop/' || r.drop_id
             ),
             2::numeric
        from public.explore_vault_preview_rows(v_viewer, null, 24) r
       where not (r.drop_id = any (coalesce(p_exclude_ids, '{}'::text[])))

      union all

      select jsonb_build_object(
               'kind', 'CHALLENGE',
               'id', c.id,
               'title', c.title,
               'countryCode', c.country_code,
               'mediaUrl', c.cover_url,
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

-- World summary: include cover urls for visual shelves.
create or replace function public.get_explore_world_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_countries jsonb;
  v_challenges jsonb;
  v_treasures jsonb;
  v_live integer;
begin
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
             ends_at as "endsAt", cover_url as "coverUrl"
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
             reward_type as "rewardType", cover_url as "coverUrl"
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

-- Search vault group: FREE + PREVIEW only
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
               'authorHandle', t.handle, 'mediaUrl', t.media_url
             )), '[]'::jsonb)
        from (
          select t.id, t.text, t.heat, p.handle, t.media_url
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
               'dropId', r.drop_id,
               'title', r.title,
               'creatorHandle', r.author_handle,
               'accessLevel', r.discovery_access,
               'publicMediaPath', r.public_media_path
             )), '[]'::jsonb)
        from (
          select *
            from public.explore_vault_preview_rows(v_viewer, null, 24) r
           where lower(r.title) like '%' || v_q || '%'
              or lower(r.author_handle) like '%' || v_q || '%'
           limit 8
        ) r
    )
  );
end;
$$;

revoke execute on function public.search_explore(text, integer) from public;
grant execute on function public.search_explore(text, integer) to anon, authenticated;
