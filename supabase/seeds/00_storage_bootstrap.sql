-- ============================================================================
-- LOCAL ONLY — Storage bucket + RLS bootstrap after `supabase db reset`
-- ----------------------------------------------------------------------------
-- Why: CLI ≥2.x applies user migrations before the Storage service finishes
-- creating `storage.buckets` / `storage.objects`. Migration
-- 20260926150000_media_storage.sql therefore no-ops its Storage section when
-- those tables are missing. This seed restores the same buckets + policies once
-- Storage owns the real schema.
--
-- Never run against hosted production. Hosted already applied the migration
-- when Storage tables existed. This file is listed only in local [db.seed].
-- ============================================================================

do $bootstrap$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not ready yet — skip bootstrap (npm run supabase:reset re-applies after seed buckets)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('public-media', 'public-media', true, 104857600,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']),
    ('private-media', 'private-media', false, 104857600,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

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
