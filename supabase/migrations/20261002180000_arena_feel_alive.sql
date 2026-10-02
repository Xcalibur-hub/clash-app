-- ============================================================================
-- CLASH 2.0 · Phase 13.5 — Arena feel alive
-- ----------------------------------------------------------------------------
-- 1. Optional video poster URL on Takes (never an mp4 in <Image>).
-- 2. Bounded public Live Arena argument previews for home cards.
--    SECURITY DEFINER + block/mute/moderation filters. No stance exposure.
-- ============================================================================

-- ── 1. Video poster on Takes ────────────────────────────────────────────────
alter table public.takes
  add column if not exists media_poster_url text;

comment on column public.takes.media_poster_url is
  'Optional still image URL for video Takes. Never an mp4/mov URL.';

-- Recreate create_take with optional poster. Drop the 4-arg overload first so
-- PostgREST sees a single signature.
drop function if exists public.create_take(public.hood_id, text, text, text);

create or replace function public.create_take(
  p_hood public.hood_id,
  p_text text,
  p_media_object_id text default null,
  p_media_url text default null,
  p_media_poster_url text default null
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
  v_poster text := nullif(btrim(coalesce(p_media_poster_url, '')), '');
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
    -- Poster only makes sense for video; ignore silently for images.
    if v_media.media_kind <> 'video' then
      v_poster := null;
    end if;
  else
    v_poster := null;
  end if;

  v_id := 'take_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));

  insert into public.takes (
    id, author_id, hood, text, media_object_id, media_kind, media_url, media_poster_url
  )
  values (
    v_id,
    v_author,
    p_hood,
    v_text,
    p_media_object_id,
    case when p_media_object_id is not null then v_media.media_kind else null end,
    p_media_url,
    v_poster
  )
  returning * into v_row;

  return next v_row;
end;
$$;

revoke execute on function public.create_take(public.hood_id, text, text, text, text) from public, anon;
grant execute on function public.create_take(public.hood_id, text, text, text, text) to authenticated;

-- ── 2. Topic live preview (bounded, public snippets) ────────────────────────
/**
 * Home-card preview for one LIVE topic.
 * Returns at most `p_limit` recent high-signal public arguments across eligible
 * rooms, plus a compact presence sample. Never returns stance, room ids, or
 * hidden/blocked/muted authors. Does not require room membership.
 */
create or replace function public.list_live_arena_topic_previews(
  p_topic_id text,
  p_limit    integer default 4
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer  text := public.my_profile_id();
  v_topic   public.arena_daily_topics%rowtype;
  v_limit   integer := greatest(1, least(coalesce(p_limit, 4), 4));
  v_excerpts jsonb := '[]'::jsonb;
  v_presence jsonb := '[]'::jsonb;
  v_signals  jsonb := '[]'::jsonb;
begin
  if p_topic_id is null or btrim(p_topic_id) = '' then
    raise exception 'topic required' using errcode = 'P0003';
  end if;

  select * into v_topic from public.arena_daily_topics where id = p_topic_id;
  if not found then
    raise exception 'topic does not exist' using errcode = 'P0002';
  end if;

  -- Only live / final-arguments topics surface on Arena home as living cards.
  if v_topic.status not in ('live') then
    return jsonb_build_object(
      'topicId', v_topic.id,
      'excerpts', '[]'::jsonb,
      'presence', '[]'::jsonb,
      'reactionSignals', '[]'::jsonb
    );
  end if;

  -- Newest eligible arguments across open rooms. Cap at v_limit.
  -- Prefer longer signals; never invent text. Distinct authors when possible
  -- is applied client-side by rotation — server keeps the query cheap.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', x.id,
               'text', x.text,
               'kind', x.kind,
               'gifUrl', x.gif_url,
               'createdAt', x.created_at,
               'handle', x.handle,
               'name', x.name,
               'avatarTint', x.avatar_tint
             )
             order by x.created_at desc
           ),
           '[]'::jsonb
         )
    into v_excerpts
    from (
      select m.id,
             left(btrim(m.body), 140) as text,
             m.kind::text as kind,
             case when m.kind = 'gif' then m.media_url else null end as gif_url,
             m.created_at,
             p.handle,
             p.name,
             p.avatar_tint
        from public.arena_room_messages m
        join public.arena_rooms r on r.id = m.room_id
        join public.profiles p on p.id = m.author_id
       where r.topic_id = v_topic.id
         and r.status in ('OPEN', 'FINAL_ARGUMENTS')
         and m.hidden_at is null
         and m.kind in ('text', 'media', 'gif')
         and (
           char_length(btrim(m.body)) >= 8
           or m.kind = 'gif'
         )
         and not public.arena_actor_hidden(v_viewer, m.author_id)
       order by m.created_at desc, m.id desc
       limit v_limit
    ) x;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'handle', z.handle,
             'name', z.name,
             'avatarTint', z.avatar_tint
           )
         ), '[]'::jsonb)
    into v_presence
    from (
      select p.handle, p.name, p.avatar_tint
        from public.arena_room_participants part
        join public.profiles p on p.id = part.profile_id
       where part.topic_id = v_topic.id
         and part.role = 'debater'
         and not public.arena_actor_hidden(v_viewer, part.profile_id)
       order by part.joined_at desc
       limit 3
    ) z;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('emoji', s.emoji, 'count', s.n)
             order by s.n desc
           ),
           '[]'::jsonb
         )
    into v_signals
    from (
      select rc.emoji, count(*)::integer as n
        from public.arena_room_message_reactions rc
       where rc.message_id in (
         select e->>'id' from jsonb_array_elements(v_excerpts) e
       )
       group by rc.emoji
       order by count(*) desc
       limit 3
    ) s;

  return jsonb_build_object(
    'topicId', v_topic.id,
    'excerpts', coalesce(v_excerpts, '[]'::jsonb),
    'presence', coalesce(v_presence, '[]'::jsonb),
    'reactionSignals', coalesce(v_signals, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.list_live_arena_topic_previews(text, integer) from public;
grant execute on function public.list_live_arena_topic_previews(text, integer) to anon, authenticated;
