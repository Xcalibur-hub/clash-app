-- ============================================================================
-- Phase 15.1B — Vault Discover Creator Worlds (cold-start, no follows required)
-- Surfaces active Vaults with any eligible public surface:
--   FREE/PREVIEW drops, published services/courses/products, or collections.
-- Never returns private/subscriber source media paths.
-- ============================================================================

create or replace function public.vault_world_has_public_surface(p_vault_id text, p_creator_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
        from public.vault_drops d
        join public.media_objects m on m.id = d.media_object_id
       where d.vault_id = p_vault_id
         and d.status = 'published'
         and d.access_level = 'free'
         and d.expires_at > now()
         and d.deleted_at is null
         and m.visibility = 'public'
         and m.status = 'ready'
         and m.bucket = 'public-media'
    )
    or exists (
      select 1
        from public.vault_drops d
        join public.media_objects pm on pm.id = d.public_preview_media_object_id
       where d.vault_id = p_vault_id
         and d.status = 'published'
         and d.access_level = 'subscriber'
         and d.public_preview_media_object_id is not null
         and d.expires_at > now()
         and d.deleted_at is null
         and pm.visibility = 'public'
         and pm.status = 'ready'
         and pm.bucket = 'public-media'
    )
    or exists (
      select 1 from public.creator_services s
       where s.creator_id = p_creator_id and s.status = 'published'
    )
    or exists (
      select 1 from public.creator_courses c
       where c.creator_id = p_creator_id and c.status = 'published'
    )
    or exists (
      select 1 from public.creator_products p
       where p.creator_id = p_creator_id and p.status = 'published'
    )
    or exists (
      select 1
        from public.vault_collections col
        join public.vault_collection_items i on i.collection_id = col.id
       where col.vault_id = p_vault_id
    );
$$;

revoke all on function public.vault_world_has_public_surface(text, text) from public;
grant execute on function public.vault_world_has_public_surface(text, text) to anon, authenticated;

create or replace function public.list_vault_discover_worlds(p_limit integer default 12)
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
             'vaultId', q.vault_id,
             'creatorId', q.creator_id,
             'handle', q.handle,
             'name', q.name,
             'tint', q.tint,
             'bio', q.bio,
             'latestCaption', q.latest_caption,
             'latestAccess', q.latest_access,
             'publicMediaPath', q.public_media_path,
             'mediaKind', q.media_kind,
             'hasServices', q.has_services,
             'hasCourses', q.has_courses,
             'hasProducts', q.has_products,
             'hasCollections', q.has_collections,
             'dropCount', q.drop_count
           ) order by q.sort_at desc nulls last, q.creator_id)
      from (
        select
          v.id as vault_id,
          v.creator_id,
          p.handle,
          p.name,
          p.avatar_tint as tint,
          nullif(btrim(coalesce(p.bio, '')), '') as bio,
          cover.latest_caption,
          cover.latest_access,
          cover.public_media_path,
          cover.media_kind,
          cover.sort_at,
          exists (
            select 1 from public.creator_services s
             where s.creator_id = v.creator_id and s.status = 'published'
          ) as has_services,
          exists (
            select 1 from public.creator_courses c
             where c.creator_id = v.creator_id and c.status = 'published'
          ) as has_courses,
          exists (
            select 1 from public.creator_products pr
             where pr.creator_id = v.creator_id and pr.status = 'published'
          ) as has_products,
          exists (
            select 1
              from public.vault_collections col
              join public.vault_collection_items i on i.collection_id = col.id
             where col.vault_id = v.id
          ) as has_collections,
          (
            select count(*)::integer
              from public.vault_drops d
             where d.vault_id = v.id
               and d.status = 'published'
               and d.expires_at > now()
               and d.deleted_at is null
               and (
                 d.access_level = 'free'
                 or (d.access_level = 'subscriber' and d.public_preview_media_object_id is not null)
               )
          ) as drop_count
        from public.creator_vaults v
        join public.profiles p on p.id = v.creator_id
        left join lateral (
          select *
            from (
              select
                d.caption as latest_caption,
                'free'::text as latest_access,
                m.storage_path as public_media_path,
                m.media_kind::text as media_kind,
                d.published_at as sort_at
              from public.vault_drops d
              join public.media_objects m on m.id = d.media_object_id
             where d.vault_id = v.id
               and d.status = 'published'
               and d.access_level = 'free'
               and d.expires_at > now()
               and d.deleted_at is null
               and m.visibility = 'public'
               and m.status = 'ready'
               and m.bucket = 'public-media'
              union all
              select
                d.caption,
                'preview'::text,
                pm.storage_path,
                pm.media_kind::text,
                d.published_at
              from public.vault_drops d
              join public.media_objects pm on pm.id = d.public_preview_media_object_id
             where d.vault_id = v.id
               and d.status = 'published'
               and d.access_level = 'subscriber'
               and d.public_preview_media_object_id is not null
               and d.expires_at > now()
               and d.deleted_at is null
               and pm.visibility = 'public'
               and pm.status = 'ready'
               and pm.bucket = 'public-media'
            ) media
           order by media.sort_at desc
           limit 1
        ) cover on true
       where v.status = 'active'
         and not public.explore_actor_hidden(v_viewer, v.creator_id)
         and public.vault_world_has_public_surface(v.id, v.creator_id)
       order by cover.sort_at desc nulls last, v.created_at desc
       limit v_limit
      ) q
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_vault_discover_worlds(integer) from public;
grant execute on function public.list_vault_discover_worlds(integer) to anon, authenticated;

comment on function public.list_vault_discover_worlds(integer) is
  'Vault Discover: active Creator Worlds with public surface. No follows required. Never private media paths.';

-- Shared offer discovery (published only, public cover paths only).
create or replace function public.list_vault_discover_offers(
  p_kind text,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 8), 16));
  v_kind   text := lower(btrim(coalesce(p_kind, '')));
begin
  if v_kind not in ('service', 'course', 'product') then
    raise exception 'unknown offer kind' using errcode = 'P0003';
  end if;

  if v_kind = 'service' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'kind', 'service',
               'creatorId', s.creator_id,
               'title', s.title,
               'subtitle', nullif(btrim(s.description), ''),
               'accessType', s.access_type,
               'priceAmountMinor', s.price_amount_minor,
               'currency', s.currency,
               'externalUrl', s.external_url,
               'publicMediaPath', (public.vault_public_cover(s.cover_media_object_id) ->> 'path'),
               'authorHandle', p.handle,
               'authorName', p.name,
               'authorTint', p.avatar_tint
             ) order by s.updated_at desc)
        from (
          select *
            from public.creator_services s
           where s.status = 'published'
             and not public.explore_actor_hidden(v_viewer, s.creator_id)
           order by s.updated_at desc
           limit v_limit
        ) s
        join public.profiles p on p.id = s.creator_id
    ), '[]'::jsonb);
  end if;

  if v_kind = 'course' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'kind', 'course',
               'creatorId', c.creator_id,
               'title', c.title,
               'subtitle', nullif(btrim(c.description), ''),
               'accessType', c.access_type,
               'priceAmountMinor', c.price_amount_minor,
               'currency', c.currency,
               'externalUrl', null,
               'publicMediaPath', (public.vault_public_cover(c.cover_media_object_id) ->> 'path'),
               'authorHandle', p.handle,
               'authorName', p.name,
               'authorTint', p.avatar_tint
             ) order by c.updated_at desc)
        from (
          select *
            from public.creator_courses c
           where c.status = 'published'
             and not public.explore_actor_hidden(v_viewer, c.creator_id)
           order by c.updated_at desc
           limit v_limit
        ) c
        join public.profiles p on p.id = c.creator_id
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pr.id,
             'kind', 'product',
             'creatorId', pr.creator_id,
             'title', pr.title,
             'subtitle', nullif(btrim(pr.description), ''),
             'accessType', pr.access_type,
             'priceAmountMinor', pr.price_amount_minor,
             'currency', pr.currency,
             'externalUrl', pr.external_url,
             'publicMediaPath', (public.vault_public_cover(pr.cover_media_object_id) ->> 'path'),
             'authorHandle', p.handle,
             'authorName', p.name,
             'authorTint', p.avatar_tint
           ) order by pr.updated_at desc)
      from (
        select *
          from public.creator_products pr
         where pr.status = 'published'
           and not public.explore_actor_hidden(v_viewer, pr.creator_id)
         order by pr.updated_at desc
         limit v_limit
      ) pr
      join public.profiles p on p.id = pr.creator_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_vault_discover_offers(text, integer) from public;
grant execute on function public.list_vault_discover_offers(text, integer) to anon, authenticated;

comment on function public.list_vault_discover_offers(text, integer) is
  'Vault Discover commerce rails: published services/courses/products only. Public cover paths only.';
