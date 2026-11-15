-- ============================================================================
-- CLASH CLOUD — Storage bootstrap for hosted project kgaqejgubjemdecifzew
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS
--   Migration 4 (20260926150000_media_storage.sql, §Storage) only creates the
--   buckets and storage.objects policies when the Storage tables are ABSENT:
--       if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
--   On a hosted project those tables already exist, so the whole branch is
--   skipped: zero buckets, zero policies, media uploads broken — silently.
--
--   supabase/seeds/00_storage_bootstrap.sql already solves this for local
--   development, but its own header says "Never run against hosted production".
--   This file reproduces the same intent as a cloud-scoped artifact. The seed
--   is NOT modified and NOT executed.
--
-- EXECUTION ORDER  (mandatory)
--   AFTER all 111 cloud migration steps.
--   Reason: the "media upload into own namespace" policy calls
--   public.my_profile_id(), which is created in
--   20260926140000_social_foundation.sql (file 3) and granted in file 4.
--   CREATE POLICY resolves function references at parse time, so running this
--   earlier than file 3 fails.
--
-- VERIFIED AGAINST THIS PROJECT (read-only, before writing this file)
--   storage.buckets.id               text     NOT NULL
--   storage.buckets.name             text     NOT NULL
--   storage.buckets.public           boolean
--   storage.buckets.file_size_limit  bigint             -> 104857600 fits
--   storage.buckets.allowed_mime_types ARRAY (text[])   -> literal fits
--   storage.objects.owner            uuid               -> owner = auth.uid() is uuid=uuid
--   supautils.policy_grants delegates storage.objects AND storage.buckets
--   policy DDL to `postgres`, so no privilege bypass is required.
--
-- AUTHORIZATION NOTE
--   CREATE POLICY requires the table owner in plain PostgreSQL. On Supabase it
--   is delegated to the `postgres` role via supautils.policy_grants, which is
--   the platform's own supported mechanism — not an escalation.
-- ============================================================================

do $bootstrap$
begin
  -- Fail closed: never fabricate a Storage schema.
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'storage schema missing — STOP (this bootstrap must not fabricate it)';
  end if;

  -- ── Buckets (idempotent) ──────────────────────────────────────────────────
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('public-media', 'public-media', true, 104857600,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif',
           'video/mp4','video/quicktime','video/webm']),
    ('private-media', 'private-media', false, 104857600,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif',
           'video/mp4','video/quicktime','video/webm'])
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- ── Policies (idempotent: drop then create) ───────────────────────────────
  execute 'drop policy if exists "media objects are publicly readable" on storage.objects';
  execute $p$
    create policy "media objects are publicly readable"
      on storage.objects for select using (bucket_id = 'public-media')
  $p$;

  execute 'drop policy if exists "own media objects are readable" on storage.objects';
  execute $p$
    create policy "own media objects are readable"
      on storage.objects for select to authenticated using (owner = auth.uid())
  $p$;

  execute 'drop policy if exists "media upload into own namespace" on storage.objects';
  execute $p$
    create policy "media upload into own namespace"
      on storage.objects for insert to authenticated
      with check (
        bucket_id in ('public-media', 'private-media')
        and name like public.my_profile_id() || '/%'
      )
  $p$;

  execute 'drop policy if exists "own media objects are updatable" on storage.objects';
  execute $p$
    create policy "own media objects are updatable"
      on storage.objects for update to authenticated
      using (owner = auth.uid())
      with check (owner = auth.uid())
  $p$;

  execute 'drop policy if exists "own media objects are deletable" on storage.objects';
  execute $p$
    create policy "own media objects are deletable"
      on storage.objects for delete to authenticated
      using (owner = auth.uid())
  $p$;
end;
$bootstrap$;
