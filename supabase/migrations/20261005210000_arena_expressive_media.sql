-- ============================================================================
-- Arena expressive media — saved favorites, trending memes, reaction palette,
-- CLASH meme reshare (public media only). Entertainment ≠ judgement.
-- ============================================================================

-- ── 1. Extended reaction palette (quick row + picker) ───────────────────────
create or replace function public.arena_reaction_vocabulary()
returns text[]
language sql
immutable
as $$
  select array[
    '🔥', '🧢', '🧾', '💀', '🤯', '⚔', '🧠',
    '😂', '🤡', '🫡', '😭'
  ]::text[];
$$;

comment on function public.arena_reaction_vocabulary() is
  'Arena reaction palette — entertainment only, never argument votes.';

-- ── 2. Saved expressive media (account-backed) ─────────────────────────────
create table if not exists public.arena_saved_expressive_media (
  id                  text primary key default public.new_arena_id('asm_'),
  profile_id          text not null references public.profiles (id) on delete cascade,
  kind                text not null check (kind in ('gif', 'meme', 'sticker')),
  provider            text not null,
  external_id         text not null,
  preview_url         text not null,
  media_url           text not null,
  media_object_id     text references public.media_objects (id) on delete set null,
  source_message_id   text references public.arena_room_messages (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint arena_saved_expressive_media_external_len
    check (char_length(external_id) between 1 and 128),
  unique (profile_id, kind, provider, external_id)
);

create index if not exists arena_saved_expressive_media_profile_idx
  on public.arena_saved_expressive_media (profile_id, created_at desc);

alter table public.arena_saved_expressive_media enable row level security;

revoke all on table public.arena_saved_expressive_media from public, anon, authenticated;

-- ── 3. Toggle saved ─────────────────────────────────────────────────────────
create or replace function public.toggle_arena_saved_expressive_media(
  p_kind              text,
  p_provider          text,
  p_external_id       text,
  p_preview_url       text,
  p_media_url         text,
  p_media_object_id   text default null,
  p_source_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_id   text;
begin
  if v_user is null then
    raise exception 'sign in to save media' using errcode = '42501';
  end if;
  if p_kind not in ('gif', 'meme', 'sticker') then
    raise exception 'unsupported kind' using errcode = 'P0003';
  end if;
  if btrim(coalesce(p_external_id, '')) = '' then
    raise exception 'external id required' using errcode = 'P0003';
  end if;

  select id into v_id
    from public.arena_saved_expressive_media
   where profile_id = v_user
     and kind = p_kind
     and provider = p_provider
     and external_id = p_external_id;

  if found then
    delete from public.arena_saved_expressive_media where id = v_id;
    return jsonb_build_object('saved', false, 'id', v_id);
  end if;

  if p_media_object_id is not null then
    if not exists (
      select 1 from public.media_objects mo
       where mo.id = p_media_object_id
         and mo.owner_id = v_user
         and mo.status = 'ready'
    ) then
      raise exception 'invalid media reference' using errcode = 'P0003';
    end if;
  end if;

  insert into public.arena_saved_expressive_media (
    profile_id, kind, provider, external_id,
    preview_url, media_url, media_object_id, source_message_id
  ) values (
    v_user, p_kind, p_provider, p_external_id,
    p_preview_url, p_media_url, p_media_object_id, p_source_message_id
  )
  returning id into v_id;

  return jsonb_build_object('saved', true, 'id', v_id);
end;
$$;

revoke execute on function public.toggle_arena_saved_expressive_media(
  text, text, text, text, text, text, text
) from public;
grant execute on function public.toggle_arena_saved_expressive_media(
  text, text, text, text, text, text, text
) to authenticated;

-- ── 4. List saved ───────────────────────────────────────────────────────────
create or replace function public.list_arena_saved_expressive_media(
  p_limit  integer default 48,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user text := public.my_profile_id();
  v_out  jsonb := '[]'::jsonb;
begin
  if v_user is null then
    return v_out;
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_out
    from (
      select
        s.id,
        s.kind,
        s.provider,
        s.external_id as "externalId",
        s.preview_url as "previewUrl",
        s.media_url as "mediaUrl",
        s.media_object_id as "mediaObjectId",
        s.source_message_id as "sourceMessageId",
        s.created_at as "createdAt"
      from public.arena_saved_expressive_media s
      where s.profile_id = v_user
      order by s.created_at desc
      limit greatest(1, least(coalesce(p_limit, 48), 72))
      offset greatest(0, coalesce(p_offset, 0))
    ) t;

  return v_out;
end;
$$;

revoke execute on function public.list_arena_saved_expressive_media(integer, integer) from public;
grant execute on function public.list_arena_saved_expressive_media(integer, integer) to authenticated;

-- ── 5. Trending CLASH memes (engagement-based, anti-self-farm) ──────────────
create or replace function public.list_trending_clash_memes(p_limit integer default 24)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 48));
  v_out   jsonb;
begin
  with candidates as (
    select
      m.id as message_id,
      m.author_id,
      m.media_url,
      m.media_kind,
      m.gif_provider,
      m.gif_external_id,
      m.media_object_id,
      m.kind,
      m.created_at,
      (
        select count(distinct rc.profile_id)
          from public.arena_room_message_reactions rc
         where rc.message_id = m.id
           and rc.profile_id <> m.author_id
      ) as ext_reactors,
      (
        select count(*)
          from public.arena_room_messages r
         where r.parent_message_id = m.id
           and r.hidden_at is null
           and r.author_id <> m.author_id
      ) as ext_replies
    from public.arena_room_messages m
    join public.arena_rooms ar on ar.id = m.room_id
    where m.hidden_at is null
      and m.created_at > now() - interval '14 days'
      and ar.status <> 'CANCELLED'
      and (
        m.kind = 'gif'
        or (m.kind = 'media' and m.media_kind = 'image')
      )
  ),
  scored as (
    select
      c.*,
      (c.ext_reactors * 2 + c.ext_replies)::numeric
        + extract(epoch from (c.created_at - (now() - interval '14 days'))) / 86400.0
        as score
    from candidates c
    where c.ext_reactors + c.ext_replies > 0
  ),
  ranked as (
    select
      s.*,
      row_number() over (partition by s.author_id order by s.score desc) as author_rank
    from scored s
  ),
  picked as (
    select *
    from ranked
    where author_rank = 1
    order by score desc
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'messageId', p.message_id,
        'previewUrl', p.media_url,
        'mediaUrl', p.media_url,
        'kind', case when p.kind = 'gif' then 'gif' else 'image' end,
        'gifProvider', p.gif_provider,
        'gifExternalId', p.gif_external_id,
        'mediaObjectId', p.media_object_id,
        'score', round(p.score::numeric, 2)
      )
      order by p.score desc
    ),
    '[]'::jsonb
  )
  into v_out
  from picked p;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

revoke execute on function public.list_trending_clash_memes(integer) from public;
grant execute on function public.list_trending_clash_memes(integer) to authenticated;

comment on function public.list_trending_clash_memes(integer) is
  'Server-authoritative trending meme discovery from real reactions/replies; one slot per author.';

-- ── 6. Reshare a public meme/GIF into a room (reuse media refs safely) ──────
create or replace function public.post_arena_clash_media_reshare(
  p_room_id           text,
  p_source_message_id text,
  p_parent_message_id text default null,
  p_body              text default ''
)
returns setof public.arena_room_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_body   text := coalesce(btrim(p_body), '');
  v_room   public.arena_rooms%rowtype;
  v_src    public.arena_room_messages%rowtype;
  v_media  public.media_objects%rowtype;
  v_parent public.arena_room_messages%rowtype;
  v_row    public.arena_room_messages%rowtype;
begin
  if v_author is null then
    raise exception 'sign in to argue' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_debater(p_room_id) then
    raise exception 'spectators cannot post' using errcode = '42501';
  end if;
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    raise exception 'the room is not accepting arguments' using errcode = 'P0003';
  end if;

  select * into v_src from public.arena_room_messages where id = p_source_message_id;
  if not found or v_src.hidden_at is not null then
    raise exception 'source is not available' using errcode = 'P0002';
  end if;
  if v_src.kind not in ('gif', 'media') then
    raise exception 'source is not shareable media' using errcode = 'P0003';
  end if;
  if v_src.kind = 'media' and v_src.media_kind <> 'image' then
    raise exception 'only image memes can be reshared' using errcode = 'P0003';
  end if;
  if not public.arena_is_room_member(v_src.room_id) then
    raise exception 'source is not visible' using errcode = '42501';
  end if;

  if char_length(v_body) > 500 then
    raise exception 'an argument must be at most 500 characters' using errcode = 'P0003';
  end if;

  if p_parent_message_id is not null then
    select * into v_parent from public.arena_room_messages where id = p_parent_message_id;
    if not found or v_parent.room_id <> p_room_id then
      raise exception 'parent argument is not in this room' using errcode = 'P0002';
    end if;
    if v_parent.hidden_at is not null then
      raise exception 'parent argument is not available' using errcode = 'P0003';
    end if;
  end if;

  perform public.assert_rate_limit(v_author, 'arena_room_message', 30, interval '10 minutes');

  if v_src.kind = 'gif' then
    if v_src.gif_provider is distinct from 'tenor' then
      raise exception 'unsupported gif provider' using errcode = 'P0003';
    end if;
    if not public.is_allowed_tenor_media_url(v_src.media_url) then
      raise exception 'gif url is not allowed' using errcode = 'P0005';
    end if;

    insert into public.arena_room_messages (
      id, room_id, author_id, kind, body, parent_message_id,
      media_object_id, media_url, media_kind, gif_provider, gif_external_id
    ) values (
      public.new_arena_id('am_'),
      p_room_id,
      v_author,
      'gif',
      v_body,
      p_parent_message_id,
      null,
      v_src.media_url,
      'gif'::public.media_kind,
      'tenor',
      v_src.gif_external_id
    )
    returning * into v_row;
  else
    select * into v_media from public.media_objects where id = v_src.media_object_id;
    if not found or v_media.status <> 'ready' or v_media.visibility <> 'public' then
      raise exception 'meme media is not public' using errcode = 'P0005';
    end if;

    insert into public.arena_room_messages (
      id, room_id, author_id, kind, body, parent_message_id,
      media_object_id, media_url, media_kind, gif_provider, gif_external_id
    ) values (
      public.new_arena_id('am_'),
      p_room_id,
      v_author,
      'media',
      v_body,
      p_parent_message_id,
      v_src.media_object_id,
      v_src.media_url,
      v_src.media_kind,
      null,
      null
    )
    returning * into v_row;
  end if;

  return next v_row;
end;
$$;

revoke execute on function public.post_arena_clash_media_reshare(text, text, text, text) from public;
grant execute on function public.post_arena_clash_media_reshare(text, text, text, text) to authenticated;
