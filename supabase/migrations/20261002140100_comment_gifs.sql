-- ============================================================================
-- CLASH 2.0 · comment GIF replies (Arena)
-- Depends on 20261002140000_comment_gifs_enum.sql (media_kind 'gif').
-- ----------------------------------------------------------------------------
-- Extends media replies so a comment can attach a Tenor GIF without uploading
-- into media_objects. Provider CDN URLs are validated server-side (https +
-- tenor.com hosts only). Clash challenger_comment_id / clash_view Side B media
-- continue to work via media_kind + media_url.
-- ============================================================================

-- ── 1. GIF metadata columns ─────────────────────────────────────────────────
alter table public.comments
  add column if not exists gif_provider text;

alter table public.comments
  add column if not exists gif_external_id text;

do $$ begin
  alter table public.comments drop constraint if exists comments_gif_provider_check;
exception when undefined_object then null;
end $$;

alter table public.comments
  add constraint comments_gif_provider_check
  check (gif_provider is null or gif_provider = 'tenor');

-- ── 3. Content / completeness constraints ───────────────────────────────────
do $$ begin
  alter table public.comments drop constraint if exists comments_has_content;
exception when undefined_object then null;
end $$;

alter table public.comments
  add constraint comments_has_content check (
    char_length(text) <= 180
    and (
      char_length(btrim(text)) >= 1
      or media_object_id is not null
      or (media_kind = 'gif' and gif_provider is not null and gif_external_id is not null and media_url is not null)
    )
  );

do $$ begin
  alter table public.comments drop constraint if exists comments_media_complete;
exception when undefined_object then null;
end $$;

alter table public.comments
  add constraint comments_media_complete check (
    -- no media
    (media_object_id is null and media_kind is null and media_url is null
      and gif_provider is null and gif_external_id is null)
    -- owned upload (image/video)
    or (media_object_id is not null and media_kind in ('image', 'video')
      and media_url is not null and gif_provider is null and gif_external_id is null)
    -- external GIF (no media_object)
    or (media_object_id is null and media_kind = 'gif' and media_url is not null
      and gif_provider is not null and gif_external_id is not null)
  );

-- ── 4. Allowed Tenor CDN hosts ──────────────────────────────────────────────
create or replace function public.is_allowed_tenor_media_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_url is not null
    and char_length(p_url) between 12 and 2048
    and p_url ~* '^https://([a-z0-9-]+\.)*tenor\.com/'
$$;

revoke execute on function public.is_allowed_tenor_media_url(text) from public, anon;
grant execute on function public.is_allowed_tenor_media_url(text) to authenticated;

-- ── 5. Media trigger: preserve GIF path when no media_object ────────────────
create or replace function public.enforce_comment_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.my_profile_id();
  v_media public.media_objects%rowtype;
begin
  if auth.uid() is null then
    if new.media_kind = 'gif' then
      if new.media_object_id is not null
         or new.gif_provider is null
         or new.gif_external_id is null
         or new.media_url is null
         or not public.is_allowed_tenor_media_url(new.media_url) then
        raise exception 'comment gif is incomplete or invalid' using errcode = 'P0003';
      end if;
      return new;
    end if;
    if new.media_object_id is not null and (new.media_kind is null or new.media_url is null) then
      raise exception 'comment media is incomplete' using errcode = 'P0003';
    end if;
    return new;
  end if;

  -- GIF attachment (no owned upload)
  if new.media_kind = 'gif' or new.gif_provider is not null or new.gif_external_id is not null then
    if new.media_object_id is not null then
      raise exception 'gif replies cannot attach an uploaded media object' using errcode = 'P0003';
    end if;
    if new.gif_provider is distinct from 'tenor' then
      raise exception 'unsupported gif provider' using errcode = 'P0003';
    end if;
    if new.gif_external_id is null or btrim(new.gif_external_id) = '' or char_length(new.gif_external_id) > 64 then
      raise exception 'gif id is required' using errcode = 'P0003';
    end if;
    if new.gif_external_id !~ '^[A-Za-z0-9_-]+$' then
      raise exception 'gif id is invalid' using errcode = 'P0003';
    end if;
    if not public.is_allowed_tenor_media_url(new.media_url) then
      raise exception 'gif url is not an allowed tenor host' using errcode = 'P0005';
    end if;
    new.media_kind := 'gif';
    new.media_object_id := null;
    return new;
  end if;

  if new.media_object_id is null then
    new.media_kind := null;
    new.media_url := null;
    new.gif_provider := null;
    new.gif_external_id := null;
    return new;
  end if;

  if v_actor is null then
    raise exception 'sign in to attach media' using errcode = '42501';
  end if;

  select * into v_media from public.media_objects where id = new.media_object_id;
  if not found then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  if v_media.owner_id <> v_actor then
    raise exception 'not your media' using errcode = 'P0001';
  end if;
  if v_media.status <> 'ready' then
    raise exception 'media is not ready' using errcode = 'P0004';
  end if;
  if v_media.visibility <> 'public' then
    raise exception 'arena replies must use public media' using errcode = 'P0005';
  end if;
  if new.media_url is null or btrim(new.media_url) = '' then
    raise exception 'media url is required' using errcode = 'P0003';
  end if;

  new.media_kind := v_media.media_kind;
  new.gif_provider := null;
  new.gif_external_id := null;
  return new;
end;
$$;

-- ── 6. create_comment: optional GIF attachment ──────────────────────────────
drop function if exists public.create_comment(text, text, text, text, text);

create or replace function public.create_comment(
  p_take_id text,
  p_text text,
  p_parent_comment_id text default null,
  p_media_object_id text default null,
  p_media_url text default null,
  p_gif_provider text default null,
  p_gif_external_id text default null
)
returns setof public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_text   text := coalesce(btrim(p_text), '');
  v_media  public.media_objects%rowtype;
  v_id     text;
  v_row    public.comments%rowtype;
  v_is_gif boolean := p_gif_provider is not null or p_gif_external_id is not null;
begin
  if v_author is null then
    raise exception 'sign in to post a rebuttal' using errcode = '42501';
  end if;

  if char_length(v_text) > 180 then
    raise exception 'a rebuttal must be at most 180 characters' using errcode = 'P0003';
  end if;

  if v_is_gif and p_media_object_id is not null then
    raise exception 'choose either an upload or a gif, not both' using errcode = 'P0003';
  end if;

  if v_text = '' and p_media_object_id is null and not v_is_gif then
    raise exception 'a rebuttal needs text or media' using errcode = 'P0003';
  end if;

  if v_is_gif then
    if p_gif_provider is distinct from 'tenor' then
      raise exception 'unsupported gif provider' using errcode = 'P0003';
    end if;
    if p_gif_external_id is null or btrim(p_gif_external_id) = '' or char_length(p_gif_external_id) > 64 then
      raise exception 'gif id is required' using errcode = 'P0003';
    end if;
    if p_gif_external_id !~ '^[A-Za-z0-9_-]+$' then
      raise exception 'gif id is invalid' using errcode = 'P0003';
    end if;
    if not public.is_allowed_tenor_media_url(p_media_url) then
      raise exception 'gif url is not an allowed tenor host' using errcode = 'P0005';
    end if;
  elsif p_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_media_object_id;
    if not found then
      raise exception 'media not found' using errcode = 'P0002';
    end if;
    if v_media.owner_id <> v_author then
      raise exception 'not your media' using errcode = 'P0001';
    end if;
    if v_media.status <> 'ready' then
      raise exception 'media is not ready' using errcode = 'P0004';
    end if;
    if v_media.visibility <> 'public' then
      raise exception 'arena replies must use public media' using errcode = 'P0005';
    end if;
    if p_media_url is null or btrim(p_media_url) = '' then
      raise exception 'media url is required' using errcode = 'P0003';
    end if;
  end if;

  if not exists (
    select 1 from public.takes t
     where t.id = p_take_id
       and t.status = 'active'
       and t.expires_at > now()
  ) then
    raise exception 'take is not open for replies' using errcode = '42501';
  end if;

  v_id := 'c_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));

  insert into public.comments (
    id, take_id, author_id, text, parent_comment_id,
    media_object_id, media_kind, media_url, gif_provider, gif_external_id
  )
  values (
    v_id,
    p_take_id,
    v_author,
    v_text,
    p_parent_comment_id,
    case when v_is_gif then null else p_media_object_id end,
    case
      when v_is_gif then 'gif'::public.media_kind
      when p_media_object_id is not null then v_media.media_kind
      else null
    end,
    case
      when v_is_gif then p_media_url
      when p_media_object_id is not null then p_media_url
      else null
    end,
    case when v_is_gif then 'tenor' else null end,
    case when v_is_gif then p_gif_external_id else null end
  )
  returning * into v_row;

  return next v_row;
end;
$$;

grant execute on function public.create_comment(text, text, text, text, text, text, text) to authenticated;
revoke execute on function public.create_comment(text, text, text, text, text, text, text) from public, anon;

grant insert (gif_provider, gif_external_id) on public.comments to authenticated;
