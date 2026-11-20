-- ============================================================================
-- CLASH 2.0 · comment media replies (Arena)
-- ----------------------------------------------------------------------------
-- Smallest extension so a rebuttal can carry an owned, ready, public
-- media_objects row — the same authority model create_take already uses.
--
-- Supports: text | image | video | text+image | text+video.
-- Rejects empty (no text and no media). Preserves threading + challenger_comment_id.
--
-- App path: create_comment SECURITY DEFINER RPC.
-- Direct inserts that set media_object_id are still validated by trigger.
-- clash_view gains optional Side B media fields (no Clash authority change).
-- ============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.comments
  add column if not exists media_object_id text references public.media_objects (id);

alter table public.comments
  add column if not exists media_kind public.media_kind;

alter table public.comments
  add column if not exists media_url text;

create index if not exists comments_media_object_idx
  on public.comments (media_object_id)
  where media_object_id is not null;

-- ── 2. Content + media integrity checks ─────────────────────────────────────
-- Drop the original 1–180 text-only check (unnamed column check → comments_text_check).
do $$ begin
  alter table public.comments drop constraint if exists comments_text_check;
exception when undefined_object then null;
end $$;

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
    )
  );

do $$ begin
  alter table public.comments drop constraint if exists comments_media_complete;
exception when undefined_object then null;
end $$;

alter table public.comments
  add constraint comments_media_complete check (
    (media_object_id is null and media_kind is null and media_url is null)
    or (media_object_id is not null and media_kind is not null and media_url is not null)
  );

-- ── 3. Media ownership trigger (direct insert / update safety net) ──────────
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
  -- Seed / service-role writes (no auth) skip ownership checks.
  if auth.uid() is null then
    if new.media_object_id is not null and (new.media_kind is null or new.media_url is null) then
      raise exception 'comment media is incomplete' using errcode = 'P0003';
    end if;
    return new;
  end if;

  if new.media_object_id is null then
    new.media_kind := null;
    new.media_url := null;
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

  -- Kind is always stamped from the owned object — never trust the client.
  new.media_kind := v_media.media_kind;
  return new;
end;
$$;

drop trigger if exists trg_comment_media on public.comments;
create trigger trg_comment_media
  before insert or update of media_object_id, media_kind, media_url on public.comments
  for each row execute function public.enforce_comment_media();

-- ── 4. Duplicate guard: same text + same media within the window ────────────
create or replace function public.enforce_comment_create_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_actor := public.my_profile_id();
  if v_actor is null then
    raise exception 'sign in to post a rebuttal' using errcode = '42501';
  end if;

  perform public.assert_rate_limit(v_actor, 'comment_create', 10, interval '1 hour');

  if exists (
    select 1 from public.comments c
     where c.take_id = new.take_id
       and c.author_id = v_actor
       and c.text = new.text
       and c.media_object_id is not distinct from new.media_object_id
       and c.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'you already posted this rebuttal' using errcode = 'P0006';
  end if;

  return new;
end;
$$;

-- ── 5. create_comment RPC (server-authoritative author + media) ─────────────
create or replace function public.create_comment(
  p_take_id text,
  p_text text,
  p_parent_comment_id text default null,
  p_media_object_id text default null,
  p_media_url text default null
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
begin
  if v_author is null then
    raise exception 'sign in to post a rebuttal' using errcode = '42501';
  end if;

  if char_length(v_text) > 180 then
    raise exception 'a rebuttal must be at most 180 characters' using errcode = 'P0003';
  end if;

  if v_text = '' and p_media_object_id is null then
    raise exception 'a rebuttal needs text or media' using errcode = 'P0003';
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
      raise exception 'arena replies must use public media' using errcode = 'P0005';
    end if;
    if p_media_url is null or btrim(p_media_url) = '' then
      raise exception 'media url is required' using errcode = 'P0003';
    end if;
  end if;

  -- SECURITY DEFINER bypasses RLS — mirror the insert policy's live-take gate.
  if not exists (
    select 1 from public.takes t
     where t.id = p_take_id
       and t.status = 'active'
       and t.expires_at > now()
  ) then
    raise exception 'take is not open for replies' using errcode = '42501';
  end if;

  -- Parent/block rules still enforced by trg_comment_relationships; rate limits by
  -- trg_comment_create_limits (both see the caller's auth.uid()).
  v_id := 'c_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));

  insert into public.comments (
    id, take_id, author_id, text, parent_comment_id,
    media_object_id, media_kind, media_url
  )
  values (
    v_id,
    p_take_id,
    v_author,
    v_text,
    p_parent_comment_id,
    p_media_object_id,
    case when p_media_object_id is not null then v_media.media_kind else null end,
    case when p_media_object_id is not null then p_media_url else null end
  )
  returning * into v_row;

  return next v_row;
end;
$$;

grant execute on function public.create_comment(text, text, text, text, text) to authenticated;
revoke execute on function public.create_comment(text, text, text, text, text) from public, anon;

-- ── 6. Privileges: media columns are writable only through validated paths ──
-- Direct insert may set media_object_id + media_url; trigger stamps media_kind
-- and rejects foreign / unready / private media. Counters stay non-writable.
grant insert (media_object_id, media_url) on public.comments to authenticated;
-- media_kind is stamped by trigger/RPC — do not grant client write.

revoke execute on function public.enforce_comment_media() from public, anon, authenticated;

-- ── 7. clash_view: optional Side B media (no authority change) ──────────────
create or replace function public.clash_view(p_clash_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_clash  record;
  v_revealed boolean;
  v_has_judged boolean;
  v_ballot public.clash_side;
  v_participant boolean;
  v_may_judge boolean;
  v_side_b text;
  v_side_b_kind public.media_kind;
  v_side_b_url text;
  v_verdict jsonb;
begin
  select
    c.id, c.take_id, c.challenger_id, c.challenger_comment_id, c.status, c.mode,
    c.opens_at, c.closes_at, c.created_at, c.settled_at, t.author_id, t.text as take_text
    into v_clash
    from public.clashes c
    join public.takes t on t.id = c.take_id
   where c.id = p_clash_id;

  if v_clash.id is null then
    return null;
  end if;

  v_revealed := public.clash_identities_revealed_for(
    v_clash.mode, v_clash.status, v_clash.id, v_clash.author_id, v_clash.challenger_id, v_viewer
  );

  v_participant := (v_viewer is not null and v_viewer in (v_clash.author_id, v_clash.challenger_id));

  select j.side into v_ballot
    from public.judgements j
   where j.clash_id = v_clash.id and v_viewer is not null and j.juror_id = v_viewer;
  v_has_judged := found;

  v_may_judge :=
    v_viewer is not null
    and not v_participant
    and not v_has_judged
    and v_clash.status = 'open'
    and v_clash.closes_at > now();

  if v_clash.challenger_comment_id is not null then
    select cm.text, cm.media_kind, cm.media_url
      into v_side_b, v_side_b_kind, v_side_b_url
      from public.comments cm
     where cm.id = v_clash.challenger_comment_id and not cm.is_removed;
  end if;

  if v_clash.status = 'settled' then
    select jsonb_build_object(
      'clashId', v.clash_id,
      'winnerSide', v.winner_side,
      'sideAScore', v.side_a_score,
      'sideBScore', v.side_b_score,
      'jurySize', v.jury_size,
      'agreement', v.agreement,
      'margin', v.margin,
      'verdictLabel', v.verdict_label
    ) into v_verdict
      from public.verdicts v
     where v.clash_id = v_clash.id;
  end if;

  return jsonb_build_object(
    'clashId', v_clash.id,
    'takeId', v_clash.take_id,
    'mode', v_clash.mode,
    'status', v_clash.status,
    'opensAt', v_clash.opens_at,
    'closesAt', v_clash.closes_at,
    'settledAt', v_clash.settled_at,
    'revealed', v_revealed,
    'isParticipant', v_participant,
    'mayJudge', v_may_judge,
    'hasJudged', v_has_judged,
    'myBallot', v_ballot,
    'sideAText', v_clash.take_text,
    'sideBText', coalesce(v_side_b, ''),
    'sideBMediaKind', v_side_b_kind,
    'sideBMediaUrl', v_side_b_url,
    'sideA', case when v_revealed then public.clash_participant_json(v_clash.author_id) else null end,
    'sideB', case when v_revealed then public.clash_participant_json(v_clash.challenger_id) else null end,
    'verdict', v_verdict
  );
end;
$$;
