-- ============================================================================
-- CLASH cloud wrapper — step 48 of 119
-- version           : 20261004160000
-- ledger name       : vault_storefront_preview
-- mode              : direct
-- executed source   : supabase/migrations/20261004160000_vault_storefront_preview.sql
-- executed sha256   : 72dba3e6ea3b7673ced4f2c79074ee11c87dca81c796daf48c2a4e0c31aaccec
-- normalisation     : none
-- normalized sha256 : 72dba3e6ea3b7673ced4f2c79074ee11c87dca81c796daf48c2a4e0c31aaccec
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
--
-- CONCURRENCY (Round 8): the ledger insert has NO conflict clause. If a row for
-- this version already exists, the insert raises unique_violation, the whole
-- transaction aborts and no statement of the migration survives. An
-- 'on conflict do nothing' would have skipped the row while re-executing the
-- migration body - the one case the read-back could not detect.
-- ============================================================================
begin;

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


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261004160000',
  'vault_storefront_preview',
  array['sha256:72dba3e6ea3b7673ced4f2c79074ee11c87dca81c796daf48c2a4e0c31aaccec'],
  'clash-cloud-wrapper-v1'
);

commit;
