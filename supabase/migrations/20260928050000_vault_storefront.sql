-- ============================================================================
-- CLASH 2.0 · 0019 — Vault storefront reads (metadata only)
-- ----------------------------------------------------------------------------
-- The Vault storefront needs to show a Drop's *card* — caption, access level,
-- status, timestamps — to every viewer, including a locked subscriber Drop the
-- viewer is not entitled to open. The media is a different matter: the bytes stay
-- behind `can_access_vault_drop` / the Edge Function, and this migration never
-- returns a private storage path.
--
-- So the storefront is deliberately metadata-only:
--   · `accessible`     = can_access_vault_drop(viewer, drop) — the ONE rule
--   · `publicMedia`    = bucket/path only for a FREE drop the viewer may read
--                       (free media is already in the public bucket), else NULL
--   · `collectionIds`  = which Collections hold this Drop, so the client builds
--                       the Collections UI from this single round-trip
--
-- Both functions are STABLE SECURITY DEFINER reads that resolve the caller from
-- the session; neither accepts a viewer id, and neither exposes a private path.
-- The existing RLS on `vault_drops` is unchanged — it remains the content gate;
-- these functions are the storefront.
-- ============================================================================

-- ── 1. One Drop's storefront card ───────────────────────────────────────────
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
      then jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
      else null
    end
  )
  from public.vault_drops d
  left join public.media_objects m on m.id = d.media_object_id
  where d.id = p_drop_id
    and d.deleted_at is null
    and (d.status <> 'draft' or d.creator_id = public.my_profile_id());
$$;

-- ── 2. The whole storefront for one Vault ───────────────────────────────────
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
        then jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
        else null
      end
    ) as item
    from public.vault_drops d
    left join public.media_objects m on m.id = d.media_object_id
    where d.vault_id = p_vault_id
      and d.deleted_at is null
      and (
        -- live in the 7-day feed
        d.status = 'published'
        -- or permanently held by a Collection
        or (d.status = 'expired' and exists (
          select 1 from public.vault_collection_items ci2 where ci2.drop_id = d.id
        ))
        -- or the caller's own draft (management view only)
        or (d.status = 'draft' and d.creator_id = public.my_profile_id())
      )
  ) t;
$$;

-- ── 3. Privileges: readable by everyone (metadata-only; free media is public) ─
grant execute on function public.vault_drop_card(text) to anon, authenticated;
grant execute on function public.vault_storefront(text) to anon, authenticated;
revoke execute on function public.vault_drop_card(text) from public;
revoke execute on function public.vault_storefront(text) from public;
