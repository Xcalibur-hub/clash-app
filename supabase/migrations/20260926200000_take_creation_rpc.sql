-- ============================================================================
-- CLASH 2.0 · 0009 — take creation RPC (server authority + media integration)
-- ----------------------------------------------------------------------------
-- Moves Take creation behind one SECURITY DEFINER RPC so the author is always
-- derived from the session (never a client id), the 24-hour window and status
-- stay server-owned, and a Take can only reference a *completed, public* media
-- object the caller actually owns.
--
-- media_url stays the rendering convenience (the public URL the client derives
-- via getPublicMediaUrl); media_object_id is the authority reference. Seed/demo
-- Takes with a raw media_url and no media_object_id remain valid (backwards
-- compatible), and the `takes_media_complete` check still guards media_kind.
-- ============================================================================

-- ── 1. Reference a completed media object from a Take ────────────────────────
alter table public.takes
  add column if not exists media_object_id text references public.media_objects (id);

-- ── 2. Server-authoritative Take creation ────────────────────────────────────
create or replace function public.create_take(
  p_hood public.hood_id,
  p_text text,
  p_media_object_id text default null,
  p_media_url text default null
)
returns setof public.takes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_text   text := trim(p_text);
  v_media  public.media_objects%rowtype;
  v_id     text;
  v_row    public.takes%rowtype;
begin
  if v_author is null then
    raise exception 'sign in to drop a take' using errcode = '42501';
  end if;

  if v_text = '' or char_length(v_text) > 180 then
    raise exception 'a take must be 1-180 characters' using errcode = 'P0003';
  end if;

  if p_media_object_id is not null then
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
      raise exception 'arena takes must use public media' using errcode = 'P0005';
    end if;
    if p_media_url is null then
      raise exception 'media url is required' using errcode = 'P0003';
    end if;
  end if;

  v_id := 'take_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));

  insert into public.takes (id, author_id, hood, text, media_object_id, media_kind, media_url)
  values (
    v_id,
    v_author,
    p_hood,
    v_text,
    p_media_object_id,
    case when p_media_object_id is not null then v_media.media_kind else null end,
    p_media_url
  )
  returning * into v_row;

  return next v_row;
end;
$$;

-- ── 3. Privileges: authenticated only; never anon/public ────────────────────
grant execute on function public.create_take(public.hood_id, text, text, text) to authenticated;
revoke execute on function public.create_take(public.hood_id, text, text, text) from public, anon;
