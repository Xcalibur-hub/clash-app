-- ============================================================================
-- Explore 14.0C — For You ranking + Live feed + search groups
-- ============================================================================

create or replace function public.get_explore_for_you(
  p_limit integer default 24,
  p_cursor integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 24), 40));
  v_offset integer := greatest(0, coalesce(p_cursor, 0));
begin
  return (
    with followed as (
      select following_id as profile_id
        from public.follows
       where v_viewer is not null and follower_id = v_viewer
    ),
    joined_hoods as (
      select hood
        from public.hood_memberships
       where v_viewer is not null and profile_id = v_viewer
    ),
    take_pool as (
      select
        'TAKE'::text as kind,
        t.id,
        left(t.text, 140) as title,
        '@' || p.handle as subtitle,
        t.author_id as creator_id,
        p.public_country_code as country_code,
        t.media_url,
        t.media_kind::text as media_kind,
        null::text as public_media_path,
        null::text as access_level,
        '/take/' || t.id as href,
        (
          t.heat * 3
          + case when t.author_id in (select profile_id from followed) then 40 else 0 end
          + case when t.hood in (select hood from joined_hoods) then 25 else 0 end
          + case when t.created_at > now() - interval '24 hours' then 20 else 0 end
          + case when t.media_url is not null then 15 else 0 end
        )::numeric as score
      from public.takes t
      join public.profiles p on p.id = t.author_id
     where t.status = 'active'
       and t.expires_at > now()
       and not public.explore_actor_hidden(v_viewer, t.author_id)
    ),
    live_pool as (
      select
        'LIVE_ARENA'::text,
        t.id,
        t.title,
        coalesce(t.hood::text, 'Live Arena'),
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        '/arena/topic/' || t.id,
        (900 + case when t.hood in (select hood from joined_hoods) then 40 else 0 end)::numeric
      from public.arena_daily_topics t
     where t.status = 'live'
    ),
    vault_pool as (
      select
        'VAULT_PREVIEW'::text,
        r.drop_id,
        r.title,
        '@' || r.author_handle,
        r.creator_id,
        r.country_code,
        null::text,
        r.media_kind,
        r.public_media_path,
        r.discovery_access,
        '/vault/drop/' || r.drop_id,
        (
          50
          + case when r.creator_id in (select profile_id from followed) then 35 else 0 end
          + case when r.discovery_access = 'free' then 10 else 5 end
        )::numeric
      from public.explore_vault_preview_rows(v_viewer, null, 40) r
    ),
    challenge_pool as (
      select
        'CHALLENGE'::text,
        c.id,
        c.title,
        c.challenge_type::text,
        c.creator_id,
        c.country_code,
        c.cover_url,
        null::text,
        null::text,
        null::text,
        null::text,
        (30 + c.entry_count)::numeric
      from public.explore_challenges c
     where c.visibility = 'public' and c.status = 'active' and c.ends_at > now()
    ),
    pooled as (
      select * from take_pool
      union all select * from live_pool
      union all select * from vault_pool
      union all select * from challenge_pool
    ),
    ranked as (
      select
        jsonb_build_object(
          'kind', kind,
          'id', id,
          'title', title,
          'subtitle', subtitle,
          'creatorId', creator_id,
          'countryCode', country_code,
          'mediaUrl', media_url,
          'mediaKind', media_kind,
          'publicMediaPath', public_media_path,
          'accessLevel', access_level,
          'href', href,
          'score', score
        ) as item,
        row_number() over (order by score desc, id asc) as rn
      from pooled
    ),
    page as (
      select item, rn from ranked
       where rn > v_offset and rn <= v_offset + v_limit
    ),
    total as (
      select count(*)::integer as n from ranked
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(item order by rn) from page), '[]'::jsonb),
      'nextCursor', case
        when (select n from total) > v_offset + v_limit then v_offset + v_limit
        else null
      end,
      'generatedAt', now()
    )
  );
end;
$$;

revoke execute on function public.get_explore_for_you(integer, integer) from public;
grant execute on function public.get_explore_for_you(integer, integer) to anon, authenticated;

comment on function public.get_explore_for_you(integer, integer) is
  'Explore For You: deterministic mix using follows, hoods, heat, freshness. FREE/PREVIEW vault only.';

create or replace function public.get_explore_live(p_limit integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 24), 40));
begin
  return jsonb_build_object(
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'title', t.title,
               'hood', t.hood,
               'status', t.status,
               'closesAt', t.closes_at,
               'href', '/arena/topic/' || t.id
             ) order by t.closes_at asc)
        from (
          select t.*
            from public.arena_daily_topics t
           where t.status = 'live'
           order by t.closes_at asc
           limit v_limit
        ) t
    ), '[]'::jsonb),
    'takes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'title', left(t.text, 140),
               'subtitle', '@' || t.handle,
               'heat', t.heat,
               'mediaUrl', t.media_url,
               'creatorId', t.author_id,
               'countryCode', t.public_country_code,
               'href', '/take/' || t.id
             ) order by t.heat desc)
        from (
          select t.id, t.text, t.heat, t.media_url, t.author_id, p.handle, p.public_country_code
            from public.takes t
            join public.profiles p on p.id = t.author_id
           where t.status = 'active'
             and t.expires_at > now()
             and t.heat >= 2
             and not public.explore_actor_hidden(v_viewer, t.author_id)
           order by t.heat desc, t.created_at desc
           limit v_limit
        ) t
    ), '[]'::jsonb),
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.get_explore_live(integer) from public;
grant execute on function public.get_explore_live(integer) to anon, authenticated;

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
      'vault', '[]'::jsonb,
      'hoods', '[]'::jsonb
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
            ('CA','Canada'),('ID','Indonesia'),('PH','Philippines'),('ZA','South Africa'),
            ('EG','Egypt'),('TR','Turkey'),('IT','Italy'),('ES','Spain'),('AR','Argentina')
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
    ),
    'hoods', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'hood', h.hood,
               'label', initcap(replace(h.hood::text, '_', ' '))
             )), '[]'::jsonb)
        from (
          select distinct t.hood
            from public.takes t
           where t.hood is not null
             and lower(t.hood::text) like '%' || v_q || '%'
           limit 8
        ) h
    )
  );
end;
$$;

revoke execute on function public.search_explore(text, integer) from public;
grant execute on function public.search_explore(text, integer) to anon, authenticated;
