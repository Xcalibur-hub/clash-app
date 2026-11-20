-- ============================================================================
-- CLASH · Phase 15.0 — Vault storefront intentional public preview
-- ----------------------------------------------------------------------------
-- Subscriber Drops may expose an intentional public preview via
-- public_preview_media_object_id (Explore already uses this). The Creator World
-- storefront now surfaces that preview as `previewMedia` so locked cards can
-- use the creator-chosen teaser without ever returning private storage paths.
--
-- Rules unchanged:
--   · publicMedia  = FREE drop media the viewer may read (public bucket only)
--   · previewMedia = intentional public teaser for subscriber drops (public bucket)
--   · private subscriber media never appears in either field
-- ============================================================================

create or replace function public.vault_drop_card(p_drop_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id,
    'caption', d.caption,
    'accessLevel', d.access_level,
    'status', d.status,
    'createdAt', d.created_at,
    'publishedAt', d.published_at,
    'expiresAt', d.expires_at,
    'creatorId', d.creator_id,
    'vaultId', d.vault_id,
    'accessible', public.can_access_vault_drop(public.my_profile_id(), d.id),
    'publicMedia', case
      when d.access_level = 'free'
       and public.can_access_vault_drop(public.my_profile_id(), d.id)
       and m.id is not null and m.status = 'ready' and m.deleted_at is null
       and m.visibility = 'public' and m.bucket = 'public-media'
      then jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
      else null
    end,
    'previewMedia', case
      when d.access_level = 'subscriber'
       and pm.id is not null and pm.status = 'ready' and pm.deleted_at is null
       and pm.visibility = 'public' and pm.bucket = 'public-media'
      then jsonb_build_object('bucket', pm.bucket, 'path', pm.storage_path, 'kind', pm.media_kind)
      else null
    end
  )
  from public.vault_drops d
  left join public.media_objects m on m.id = d.media_object_id
  left join public.media_objects pm on pm.id = d.public_preview_media_object_id
  where d.id = p_drop_id
    and d.deleted_at is null
    and (d.status <> 'draft' or d.creator_id = public.my_profile_id());
$$;

create or replace function public.vault_storefront(p_vault_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by (item->>'publishedAt') desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', d.id,
      'caption', d.caption,
      'accessLevel', d.access_level,
      'status', d.status,
      'createdAt', d.created_at,
      'publishedAt', d.published_at,
      'expiresAt', d.expires_at,
      'creatorId', d.creator_id,
      'vaultId', d.vault_id,
      'accessible', public.can_access_vault_drop(public.my_profile_id(), d.id),
      'collectionIds', coalesce(
        (select jsonb_agg(ci.collection_id order by ci.collection_id)
           from public.vault_collection_items ci
          where ci.drop_id = d.id),
        '[]'::jsonb
      ),
      'publicMedia', case
        when d.access_level = 'free'
         and public.can_access_vault_drop(public.my_profile_id(), d.id)
         and m.id is not null and m.status = 'ready' and m.deleted_at is null
         and m.visibility = 'public' and m.bucket = 'public-media'
        then jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
        else null
      end,
      'previewMedia', case
        when d.access_level = 'subscriber'
         and pm.id is not null and pm.status = 'ready' and pm.deleted_at is null
         and pm.visibility = 'public' and pm.bucket = 'public-media'
        then jsonb_build_object('bucket', pm.bucket, 'path', pm.storage_path, 'kind', pm.media_kind)
        else null
      end
    ) as item
    from public.vault_drops d
    left join public.media_objects m on m.id = d.media_object_id
    left join public.media_objects pm on pm.id = d.public_preview_media_object_id
    where d.vault_id = p_vault_id
      and d.deleted_at is null
      and (
        d.status = 'published'
        or (d.status = 'expired' and exists (
          select 1 from public.vault_collection_items ci2 where ci2.drop_id = d.id
        ))
        or (d.status = 'draft' and d.creator_id = public.my_profile_id())
      )
  ) t;
$$;

comment on function public.vault_drop_card(text) is
  'Storefront card: metadata + accessible + publicMedia (free) + previewMedia (intentional public teaser). Never private paths.';

comment on function public.vault_storefront(text) is
  'Vault storefront list with publicMedia/previewMedia only from the public bucket. Entitlement via can_access_vault_drop.';
