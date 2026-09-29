-- ============================================================================
-- CLASH 2.0 · 0004 — media & storage foundation
-- ----------------------------------------------------------------------------
-- One reusable media architecture for Arena takes, avatars, Vault content,
-- World drops and future campaign media. media_objects is deliberately NOT
-- coupled to any product table: future tables reference media_objects.id.
--
-- Bucket strategy: two buckets.
--   · public-media  — publicly readable (Arena, public Vault, public drops)
--   · private-media — NOT publicly readable; served later via short-lived
--                     signed URLs after an entitlement check. A check constraint
--                     pins `visibility` to the matching bucket so a private
--                     object can never silently land in the public bucket.
--
-- Ownership: paths are `<profile-id>/<media-id>/<media-id>.<ext>`; the profile
-- id is resolved from the session, never from a client-supplied value. The
-- Storage RLS INSERT policy enforces the namespace server-side, so a client
-- cannot upload into someone else's folder.
-- ============================================================================

-- ── 1. Domain types ─────────────────────────────────────────────────────────
do $$ begin
  create type public.media_status as enum ('uploading', 'ready', 'failed', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_visibility as enum ('public', 'private');
exception when duplicate_object then null; end $$;

-- ── 2. Media metadata ───────────────────────────────────────────────────────
-- One row per asset. `status`/`ready_at`/`deleted_at` are server-owned; the
-- client only ever reads them. `media_kind` reuses the enum from migration 0001.
create table if not exists public.media_objects (
  id           text primary key,
  owner_id     text not null references public.profiles (id) on delete cascade,
  bucket       text not null check (bucket in ('public-media', 'private-media')),
  storage_path text not null check (storage_path ~ '^[a-z0-9._/-]+$'),
  media_kind   public.media_kind not null,
  mime_type    text not null,
  size_bytes   bigint not null default 0 check (size_bytes >= 0),
  width        integer,
  height       integer,
  duration_ms  integer,
  status       public.media_status not null default 'uploading',
  visibility   public.media_visibility not null default 'public',
  created_at   timestamptz not null default now(),
  ready_at     timestamptz,
  deleted_at   timestamptz,
  -- A private object can never live in the public bucket.
  check ((visibility = 'public' and bucket = 'public-media')
      or (visibility = 'private' and bucket = 'private-media'))
);
create index if not exists media_objects_owner_idx on public.media_objects (owner_id);
create index if not exists media_objects_status_idx on public.media_objects (status, created_at);

-- ── 3. Upload lifecycle RPCs ────────────────────────────────────────────────
-- All `security definer` with `search_path = ''`; the owner is resolved from the
-- session, never from a client-supplied id.

/** Start an upload: validates mime/kind, creates the record, returns the path. */
create or replace function public.create_media_upload(
  p_media_kind public.media_kind,
  p_mime_type text,
  p_visibility public.media_visibility default 'public'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text := public.my_profile_id();
  v_id    text;
  v_bucket text;
  v_path  text;
  v_ext   text;
  v_limit bigint;
begin
  if v_owner is null then
    raise exception 'sign in to upload' using errcode = '42501';
  end if;

  if p_media_kind = 'image' then
    v_ext := case p_mime_type
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/webp' then 'webp'
      when 'image/heic' then 'heic'
      when 'image/heif' then 'heif'
      else null end;
    v_limit := 10485760;   -- 10 MB
  elsif p_media_kind = 'video' then
    v_ext := case p_mime_type
      when 'video/mp4' then 'mp4'
      when 'video/quicktime' then 'mov'
      when 'video/webm' then 'webm'
      else null end;
    v_limit := 104857600;  -- 100 MB
  else
    raise exception 'unknown media kind' using errcode = 'P0003';
  end if;

  if v_ext is null then
    raise exception 'unsupported mime type' using errcode = 'P0001';
  end if;

  v_bucket := case p_visibility
    when 'public' then 'public-media'
    else 'private-media' end;

  v_id := 'm_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 24));
  v_path := v_owner || '/' || v_id || '/' || v_id || '.' || v_ext;

  insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility)
  values (v_id, v_owner, v_bucket, v_path, p_media_kind, p_mime_type, p_visibility);

  return jsonb_build_object('id', v_id, 'bucket', v_bucket, 'path', v_path, 'size_limit', v_limit);
end;
$$;

/** Mark an uploaded object ready, only if its file actually exists in storage. */
create or replace function public.complete_media_upload(
  p_media_id   text,
  p_size_bytes bigint,
  p_width      integer default null,
  p_height     integer default null,
  p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text := public.my_profile_id();
  v_path  text;
  v_bucket text;
begin
  if v_owner is null then
    raise exception 'sign in to upload' using errcode = '42501';
  end if;

  select storage_path, bucket into v_path, v_bucket
    from public.media_objects where id = p_media_id;

  if v_path is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.media_objects where id = p_media_id and owner_id = v_owner) then
    raise exception 'not your media' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.media_objects where id = p_media_id and status <> 'uploading') then
    raise exception 'media already finalized' using errcode = 'P0003';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = v_bucket and name = v_path) then
    raise exception 'object not found in storage' using errcode = 'P0004';
  end if;

  update public.media_objects
     set status = 'ready', ready_at = now(), size_bytes = p_size_bytes,
         width = p_width, height = p_height, duration_ms = p_duration_ms
   where id = p_media_id and owner_id = v_owner;
end;
$$;

/** Mark an upload failed so a stale record never reads as ready. */
create or replace function public.fail_media_upload(p_media_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text := public.my_profile_id();
begin
  if v_owner is null then
    raise exception 'sign in to upload' using errcode = '42501';
  end if;
  if not exists (select 1 from public.media_objects where id = p_media_id and owner_id = v_owner) then
    raise exception 'not your media' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.media_objects where id = p_media_id and status <> 'uploading') then
    raise exception 'media already finalized' using errcode = 'P0003';
  end if;

  update public.media_objects set status = 'failed' where id = p_media_id and owner_id = v_owner;
end;
$$;

/** Soft-delete: the record is tombstoned; the client removes the storage object. */
create or replace function public.delete_media(p_media_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text := public.my_profile_id();
begin
  if v_owner is null then
    raise exception 'sign in to delete' using errcode = '42501';
  end if;
  if not exists (select 1 from public.media_objects where id = p_media_id and owner_id = v_owner) then
    raise exception 'not your media' using errcode = 'P0001';
  end if;

  update public.media_objects set status = 'deleted', deleted_at = now()
   where id = p_media_id and owner_id = v_owner;
end;
$$;

-- ── 4. Row Level Security (media_objects) ───────────────────────────────────
alter table public.media_objects enable row level security;

-- public media metadata is public; private media metadata is owner/staff only.
drop policy if exists "public media objects are readable" on public.media_objects;
create policy "public media objects are readable"
  on public.media_objects for select using (visibility = 'public');

drop policy if exists "own media objects are readable" on public.media_objects;
create policy "own media objects are readable"
  on public.media_objects for select to authenticated
  using (public.owns_profile(owner_id) or public.is_staff());

-- ── 5. Data API privileges (media_objects) ──────────────────────────────────
-- New tables inherit 0001's defaults (anon/authenticated SELECT only). Writes go
-- through the RPCs above; the client has no INSERT/UPDATE/DELETE here.
grant execute on function public.create_media_upload(public.media_kind, text, public.media_visibility) to authenticated;
grant execute on function public.complete_media_upload(text, bigint, integer, integer, integer) to authenticated;
grant execute on function public.fail_media_upload(text) to authenticated;
grant execute on function public.delete_media(text) to authenticated;

revoke execute on function public.create_media_upload(public.media_kind, text, public.media_visibility) from public, anon;
revoke execute on function public.complete_media_upload(text, bigint, integer, integer, integer) from public, anon;
revoke execute on function public.fail_media_upload(text) from public, anon;
revoke execute on function public.delete_media(text) from public, anon;

-- The Storage INSERT policy calls this to resolve the caller's namespace.
grant execute on function public.my_profile_id() to authenticated;

-- ── 6. Storage buckets ──────────────────────────────────────────────────────
-- One public bucket, one private bucket. Bucket config enforces a ceiling and a
-- MIME allow-list server-side (the RPC enforces finer per-kind limits).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 104857600,
   array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']),
  ('private-media', 'private-media', false, 104857600,
   array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

-- ── 7. Storage RLS (storage.objects) ────────────────────────────────────────
-- Public media is readable by everyone; private media is only the owner's. Upload
-- is allowed only into the caller's own namespace; only the owner may overwrite
-- or delete.
drop policy if exists "media objects are publicly readable" on storage.objects;
create policy "media objects are publicly readable"
  on storage.objects for select using (bucket_id = 'public-media');

drop policy if exists "own media objects are readable" on storage.objects;
create policy "own media objects are readable"
  on storage.objects for select to authenticated using (owner = auth.uid());

drop policy if exists "media upload into own namespace" on storage.objects;
create policy "media upload into own namespace"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('public-media', 'private-media')
    and name like public.my_profile_id() || '/%'
  );

drop policy if exists "own media objects are updatable" on storage.objects;
create policy "own media objects are updatable"
  on storage.objects for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "own media objects are deletable" on storage.objects;
create policy "own media objects are deletable"
  on storage.objects for delete to authenticated
  using (owner = auth.uid());
